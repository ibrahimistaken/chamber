import type { HideMode } from '../adapters/types.ts';
import {
  compileRules,
  RuleValidationError,
  type CompiledRules,
  type ListRules,
} from './matcher.ts';
import { validateListObject, type ValidatedList } from './validate-list.ts';

export interface InstalledListRecord {
  readonly id: string;
  readonly sourceUrl?: string;
  readonly raw: unknown;
  readonly version: number;
  readonly enabled: boolean;
  readonly updatedAt: number;
  readonly error?: string;
  readonly warnings?: readonly string[];
}

export interface MergeListsResult {
  readonly records: readonly InstalledListRecord[];
  readonly rules: CompiledRules;
  readonly mode: HideMode;
}

/**
 * Validates each installed list in isolation, resolves `includes` references
 * across installed lists, detects circular `includes` chains, records warnings
 * for missing references, and compiles all enabled valid lists into a single
 * `CompiledRules` structure.
 *
 * Fault isolation: a list with a schema error, a `compileRules` error, or a
 * circular `includes` reference is skipped and gets its `error` field set
 * without preventing other valid lists from compiling.
 */
export function resolveAndCompileLists(
  inputRecords: readonly InstalledListRecord[],
): MergeListsResult {
  const validatedById = new Map<string, ValidatedList>();
  const errorsById = new Map<string, string>();
  const warningsById = new Map<string, string[]>();

  // Step 1: Validate each record's schema and rules in isolation.
  for (const record of inputRecords) {
    const validation = validateListObject(record.raw);
    if (!validation.ok) {
      errorsById.set(record.id, validation.error);
      continue;
    }

    const { list } = validation;
    if (list.id !== record.id) {
      errorsById.set(
        record.id,
        `Record id "${record.id}" does not match list id "${list.id}".`,
      );
      continue;
    }

    try {
      // Compile this list's own rules alone to catch RuleValidationError
      // (e.g. short last-word prefix) without poisoning other lists.
      compileRules([list.rules]);
    } catch (err) {
      if (err instanceof RuleValidationError) {
        errorsById.set(record.id, err.message);
        continue;
      }
      throw err;
    }

    validatedById.set(record.id, list);
  }

  // Step 2: Detect circular `includes` chains among valid lists.
  const findCycle = (startId: string): string[] | null => {
    const visiting = new Set<string>();
    const path: string[] = [];

    const dfs = (currentId: string): string[] | null => {
      visiting.add(currentId);
      path.push(currentId);

      const list = validatedById.get(currentId);
      for (const targetId of list?.includes ?? []) {
        if (visiting.has(targetId)) {
          const cycleStart = path.indexOf(targetId);
          return [...path.slice(cycleStart), targetId];
        }
        if (validatedById.has(targetId)) {
          const cycle = dfs(targetId);
          if (cycle) return cycle;
        }
      }

      path.pop();
      visiting.delete(currentId);
      return null;
    };

    return dfs(startId);
  };

  for (const id of [...validatedById.keys()]) {
    const cycle = findCycle(id);
    if (cycle) {
      errorsById.set(id, `Circular includes reference detected: ${cycle.join(' -> ')}.`);
    }
  }

  // Remove any list flagged with a cycle from the valid pool.
  for (const id of errorsById.keys()) {
    validatedById.delete(id);
  }

  // Step 3: Resolve `includes` for each valid list and collect warnings for missing targets.
  const expandedIdsByList = new Map<string, string[]>();

  for (const [id, list] of validatedById) {
    const warnings: string[] = [];
    const collected: string[] = [];
    const visited = new Set<string>();

    const collect = (currentId: string) => {
      if (visited.has(currentId)) return;
      visited.add(currentId);

      const current = validatedById.get(currentId);
      if (!current) return;

      collected.push(currentId);
      for (const includedId of current.includes ?? []) {
        if (!validatedById.has(includedId)) {
          warnings.push(`Missing included list "${includedId}".`);
          continue;
        }
        collect(includedId);
      }
    };

    collect(id);
    expandedIdsByList.set(id, collected);
    if (warnings.length > 0) {
      warningsById.set(id, warnings);
    }
  }

  // Step 4: Gather rule sets from enabled valid lists (and their resolved includes).
  const activeRuleSets: ListRules[] = [];
  const includedOnce = new Set<string>();
  let resolvedMode: HideMode = 'collapse';
  let modePicked = false;

  for (const record of inputRecords) {
    if (!record.enabled) continue;
    const expanded = expandedIdsByList.get(record.id);
    if (!expanded) continue;

    const rootList = validatedById.get(record.id);
    if (!modePicked && rootList?.mode) {
      resolvedMode = rootList.mode;
      modePicked = true;
    }

    for (const targetId of expanded) {
      if (includedOnce.has(targetId)) continue;
      includedOnce.add(targetId);
      const targetList = validatedById.get(targetId);
      if (targetList) {
        activeRuleSets.push(targetList.rules);
      }
    }
  }

  const updatedRecords: InstalledListRecord[] = inputRecords.map((record) => {
    const valid = validatedById.get(record.id);
    const error = errorsById.get(record.id);
    const warnings = warningsById.get(record.id);

    const next: InstalledListRecord = {
      id: record.id,
      ...(record.sourceUrl !== undefined ? { sourceUrl: record.sourceUrl } : {}),
      raw: record.raw,
      version: valid ? valid.version : record.version,
      enabled: record.enabled,
      updatedAt: record.updatedAt,
      ...(error !== undefined ? { error } : {}),
      ...(warnings !== undefined && warnings.length > 0 ? { warnings } : {}),
    };
    return next;
  });

  return {
    records: updatedRecords,
    rules: compileRules(activeRuleSets),
    mode: resolvedMode,
  };
}

