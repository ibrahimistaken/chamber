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
