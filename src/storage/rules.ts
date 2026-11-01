import type { HideMode } from '../adapters/types';
import {
  compileRules,
  type CompiledKeyword,
  type CompiledRules,
  type CompiledScopedRule,
  type ListRules,
} from '../core/matcher';

export const ACTIVE_RULES_KEY = 'chamber:activeRules';

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

/**
 * Reads the compiled active rules from chrome.storage.local.
 * Returns an empty rule set with default "collapse" mode when nothing is stored.
 */
export async function getActiveRules(storage?: StorageAreaLike): Promise<ActiveRulesConfig> {
  const area = getStorageArea(storage);
  const raw = await area.get(ACTIVE_RULES_KEY);
  const stored = raw[ACTIVE_RULES_KEY];

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
  const payload: StoredActiveRules = {
    accounts: [...compiled.accounts],
    keywords: compiled.keywords,
    exclude: compiled.exclude,
    scoped: compiled.scoped,
    mode,
  };

  await area.set({ [ACTIVE_RULES_KEY]: payload });
  return { rules: compiled, mode };
}
