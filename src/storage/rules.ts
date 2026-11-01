import type { HideMode } from '../adapters/types';
import {
  compileRules,
  type CompiledKeyword,
  type CompiledRules,
  type CompiledScopedRule,
  type ListRules,
} from '../core/matcher';
import {
  resolveAndCompileLists,
  type InstalledListRecord,
  type MergeListsResult,
} from '../core/merge-lists';
import { validateListObject } from '../core/validate-list';

export const ACTIVE_RULES_KEY = 'chamber:activeRules';
export const INSTALLED_LISTS_KEY = 'chamber:installedLists';

export interface StoredActiveRules {
  readonly accounts: readonly string[];
  readonly keywords: readonly CompiledKeyword[];
  readonly exclude: readonly string[];
  readonly scoped?: readonly CompiledScopedRule[];
  readonly mode: HideMode;
}

export interface ActiveRulesConfig {
  readonly rules: CompiledRules;
  readonly mode: HideMode;
}

export interface StorageChange {
  readonly oldValue?: unknown;
  readonly newValue?: unknown;
}

export type StorageChanges = Record<string, StorageChange>;
export type StorageChangeListener = (changes: StorageChanges, areaName: string) => void;

export interface StorageEventsLike {
  addListener(callback: StorageChangeListener): void;
  removeListener(callback: StorageChangeListener): void;
}

export interface StorageAreaLike {
  get(keys: string): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<void>;
}

function getStorageArea(custom?: StorageAreaLike): StorageAreaLike {
  if (custom) return custom;
  if (typeof browser !== 'undefined' && browser.storage?.local) {
    return browser.storage.local;
  }
  throw new Error('browser.storage.local is not available in this environment');
}

function getStorageEvents(custom?: StorageEventsLike): StorageEventsLike {
  if (custom) return custom;
  if (typeof browser !== 'undefined' && browser.storage?.onChanged) {
    return browser.storage.onChanged;
  }
  throw new Error('browser.storage.onChanged is not available in this environment');
}

function isStoredActiveRules(value: unknown): value is StoredActiveRules {
  if (typeof value !== 'object' || value === null) return false;
  const obj = value as Record<string, unknown>;
  return (
    Array.isArray(obj.accounts) &&
    Array.isArray(obj.keywords) &&
    Array.isArray(obj.exclude) &&
    (obj.scoped === undefined || Array.isArray(obj.scoped)) &&
    (obj.mode === 'collapse' || obj.mode === 'remove' || obj.mode === 'blur')
  );
}

function isInstalledListRecord(value: unknown): value is InstalledListRecord {
  if (typeof value !== 'object' || value === null) return false;
  const obj = value as Record<string, unknown>;
  return (
    typeof obj.id === 'string' &&
    'raw' in obj &&
    typeof obj.version === 'number' &&
    typeof obj.enabled === 'boolean' &&
    typeof obj.updatedAt === 'number'
  );
}

function toStoredActiveRules(rules: CompiledRules, mode: HideMode): StoredActiveRules {
  return {
    accounts: [...rules.accounts],
    keywords: rules.keywords,
    exclude: rules.exclude,
    scoped: rules.scoped,
    mode,
  };
}

/**
 * Converts a raw stored value into an `ActiveRulesConfig`, falling back to an
 * empty rule set with "collapse" mode when the value is absent or cleared.
 */
export function parseStoredActiveRules(stored: unknown): ActiveRulesConfig {
  if (!isStoredActiveRules(stored)) {
    return {
      rules: compileRules([]),
      mode: 'collapse',
    };
  }

  return {
    rules: {
      accounts: new Set(stored.accounts),
      keywords: stored.keywords,
      exclude: stored.exclude,
      scoped: stored.scoped ?? [],
    },
    mode: stored.mode,
  };
}

/**
 * Reads all installed list records from storage.
 */
export async function getInstalledLists(
  storage?: StorageAreaLike,
): Promise<InstalledListRecord[]> {
  const area = getStorageArea(storage);
  const raw = await area.get(INSTALLED_LISTS_KEY);
  const list = raw[INSTALLED_LISTS_KEY];
  if (!Array.isArray(list)) return [];
  return list.filter(isInstalledListRecord);
}

/**
 * Resolves `includes`, isolates broken lists, compiles all enabled valid lists,
 * and persists both the updated list records and the compiled active rules cache.
 */
export async function saveInstalledLists(
  records: readonly InstalledListRecord[],
  storage?: StorageAreaLike,
): Promise<MergeListsResult> {
  const area = getStorageArea(storage);
  const merged = resolveAndCompileLists(records);
  await area.set({
    [INSTALLED_LISTS_KEY]: merged.records,
    [ACTIVE_RULES_KEY]: toStoredActiveRules(merged.rules, merged.mode),
  });
  return merged;
}

export interface UpsertListOptions {
  readonly raw: unknown;
  readonly sourceUrl?: string;
  readonly enabled?: boolean;
  readonly updatedAt?: number;
}

export type UpsertListResult =
  | {
      readonly ok: true;
      readonly record: InstalledListRecord;
      readonly merged: MergeListsResult;
    }
  | {
      readonly ok: false;
      readonly error: string;
      readonly schemaError: boolean;
    };

/**
 * Validates and installs (or updates) a list record, then recompiles active rules.
 * If the new list fails validation or introduces a circular `includes` reference,
 * existing installed lists remain untouched and the error is returned.
 */
export async function upsertInstalledList(
  options: UpsertListOptions,
  storage?: StorageAreaLike,
): Promise<UpsertListResult> {
  const validation = validateListObject(options.raw);
  if (!validation.ok) {
    return { ok: false, error: validation.error, schemaError: true };
  }

  const { list } = validation;
  const candidate: InstalledListRecord = {
    id: list.id,
    ...(options.sourceUrl !== undefined ? { sourceUrl: options.sourceUrl } : {}),
    raw: options.raw,
    version: list.version,
    enabled: options.enabled ?? true,
    updatedAt: options.updatedAt ?? Date.now(),
  };

  const existing = await getInstalledLists(storage);
  const nextRecords = existing.some((r) => r.id === candidate.id)
    ? existing.map((r) => (r.id === candidate.id ? candidate : r))
    : [...existing, candidate];

  const preview = resolveAndCompileLists(nextRecords);
  const savedRecord = preview.records.find((r) => r.id === candidate.id)!;

  if (savedRecord.error !== undefined) {
    return { ok: false, error: savedRecord.error, schemaError: true };
  }

  const area = getStorageArea(storage);
  await area.set({
    [INSTALLED_LISTS_KEY]: preview.records,
    [ACTIVE_RULES_KEY]: toStoredActiveRules(preview.rules, preview.mode),
  });

  return { ok: true, record: savedRecord, merged: preview };
}

/**
 * Enables or disables an installed list by id and recompiles active rules.
 */
export async function setListEnabled(
  id: string,
  enabled: boolean,
  storage?: StorageAreaLike,
): Promise<MergeListsResult> {
  const existing = await getInstalledLists(storage);
  const updated = existing.map((record) =>
    record.id === id ? { ...record, enabled } : record,
  );
  return saveInstalledLists(updated, storage);
}

/**
 * Removes an installed list by id and recompiles active rules.
 */
export async function removeInstalledList(
  id: string,
  storage?: StorageAreaLike,
): Promise<MergeListsResult> {
  const existing = await getInstalledLists(storage);
  const updated = existing.filter((record) => record.id !== id);
  return saveInstalledLists(updated, storage);
}

/**
 * Reads the compiled active rules from chrome.storage.local.
 * Returns an empty rule set with default "collapse" mode when nothing is stored.
 */
export async function getActiveRules(storage?: StorageAreaLike): Promise<ActiveRulesConfig> {
  const area = getStorageArea(storage);
  const raw = await area.get(ACTIVE_RULES_KEY);
  return parseStoredActiveRules(raw[ACTIVE_RULES_KEY]);
}

/**
 * Compiles and caches the active rule sets into a single structure in
 * chrome.storage.local (see CLAUDE.md Performance rules).
 */
export async function setActiveRules(
  ruleSets: readonly ListRules[],
  mode: HideMode = 'collapse',
  storage?: StorageAreaLike,
): Promise<ActiveRulesConfig> {
  const area = getStorageArea(storage);
  const compiled = compileRules(ruleSets);
  await area.set({ [ACTIVE_RULES_KEY]: toStoredActiveRules(compiled, mode) });
  return { rules: compiled, mode };
}

/**
 * Subscribes to changes on `ACTIVE_RULES_KEY` in `local` storage only.
 * Ignores changes to any other key or storage area. Returns an unsubscribe function.
 */
export function onActiveRulesChanged(
  callback: (config: ActiveRulesConfig) => void,
  events?: StorageEventsLike,
): () => void {
  const target = getStorageEvents(events);

  const listener: StorageChangeListener = (changes, areaName) => {
    if (areaName !== 'local') return;
    if (!Object.prototype.hasOwnProperty.call(changes, ACTIVE_RULES_KEY)) return;
    const change = changes[ACTIVE_RULES_KEY];
    callback(parseStoredActiveRules(change?.newValue));
  };

  target.addListener(listener);
  return () => {
    target.removeListener(listener);
  };
}
