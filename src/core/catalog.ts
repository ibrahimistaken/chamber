import type { ListRules } from './matcher.ts';
import { normalize } from './normalize.ts';
import {
  ensureHostPermission,
  parseHttpsListUrl,
  type FetchLike,
  type PermissionsLike,
  type RemoteListErrorReason,
} from './remote-lists.ts';
import type { ListTags } from './validate-list.ts';

export const CATALOG_REPO_RAW_BASE_URL =
  'https://raw.githubusercontent.com/ibrahimistaken/chamber/main';

export const DEFAULT_CATALOG_URL = `${CATALOG_REPO_RAW_BASE_URL}/index.json`;

const ID_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;

const ALLOWED_CATALOG_TOP_KEYS = new Set(['version', 'lists']);
const ALLOWED_CATALOG_ENTRY_KEYS = new Set([
  'id',
  'name',
  'description',
  'author',
  'version',
  'tags',
  'ruleCount',
  'path',
]);
const ALLOWED_TAG_KEYS = new Set(['country', 'lang', 'category']);

export interface CatalogEntry {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly author: string;
  readonly version: number;
  readonly tags?: ListTags;
  readonly ruleCount: number;
  readonly path: string;
}

export interface CatalogIndex {
  readonly version: 1;
  readonly lists: readonly CatalogEntry[];
}

export function countListRules(rules: ListRules): number {
  const accounts = rules.accounts?.length ?? 0;
  const keywords = rules.keywords?.length ?? 0;
  const exclude = rules.exclude?.length ?? 0;
  const scoped = rules.scoped?.length ?? 0;
  return accounts + keywords + exclude + scoped;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Validates a parsed `index.json` catalog object at runtime.
 * Rejects unknown fields (such as free-form URL properties), invalid ids,
 * and any `path` that does not strictly equal `lists/<id>.json`.
 */
export function validateCatalogIndex(
  input: unknown,
):
  | { readonly ok: true; readonly catalog: CatalogIndex }
  | { readonly ok: false; readonly error: string } {
  if (!isPlainObject(input)) {
    return { ok: false, error: 'Catalog index must be a JSON object.' };
  }

  for (const key of Object.keys(input)) {
    if (!ALLOWED_CATALOG_TOP_KEYS.has(key)) {
      return { ok: false, error: `Catalog index contains unknown field "${key}".` };
    }
  }

  if (input.version !== 1) {
    return { ok: false, error: 'Catalog index "version" must be 1.' };
  }

  if (!Array.isArray(input.lists)) {
    return { ok: false, error: 'Catalog index "lists" must be an array.' };
  }

  const entries: CatalogEntry[] = [];
  for (let i = 0; i < input.lists.length; i += 1) {
    const item = input.lists[i];
    if (!isPlainObject(item)) {
      return { ok: false, error: `lists[${i}] must be an object.` };
    }

    for (const key of Object.keys(item)) {
      if (!ALLOWED_CATALOG_ENTRY_KEYS.has(key)) {
        return { ok: false, error: `lists[${i}] contains unknown field "${key}".` };
      }
    }

    if (typeof item.id !== 'string' || !ID_PATTERN.test(item.id)) {
      return {
        ok: false,
        error: `lists[${i}].id must match ^[a-z0-9]+(-[a-z0-9]+)*$.`,
      };
    }
    if (typeof item.name !== 'string' || item.name.length === 0) {
      return { ok: false, error: `lists[${i}].name must be a non-empty string.` };
    }
    if (typeof item.description !== 'string') {
      return { ok: false, error: `lists[${i}].description must be a string.` };
    }
    if (typeof item.author !== 'string' || item.author.length === 0) {
      return { ok: false, error: `lists[${i}].author must be a non-empty string.` };
    }
    if (typeof item.version !== 'number' || !Number.isInteger(item.version) || item.version < 1) {
      return { ok: false, error: `lists[${i}].version must be a positive integer.` };
    }
    if (
      typeof item.ruleCount !== 'number' ||
      !Number.isInteger(item.ruleCount) ||
      item.ruleCount < 0
    ) {
      return { ok: false, error: `lists[${i}].ruleCount must be a non-negative integer.` };
    }

    const expectedPath = `lists/${item.id}.json`;
    if (typeof item.path !== 'string' || item.path !== expectedPath) {
      return {
        ok: false,
        error: `lists[${i}].path must be "${expectedPath}" (received "${String(item.path)}").`,
      };
    }

    let tags: ListTags | undefined;
    if (item.tags !== undefined) {
      if (!isPlainObject(item.tags)) {
        return { ok: false, error: `lists[${i}].tags must be an object.` };
      }
      for (const tagKey of Object.keys(item.tags)) {
        if (!ALLOWED_TAG_KEYS.has(tagKey)) {
          return { ok: false, error: `lists[${i}].tags contains unknown field "${tagKey}".` };
        }
      }
      tags = {
        ...(typeof item.tags.country === 'string' ? { country: item.tags.country } : {}),
        ...(typeof item.tags.lang === 'string' ? { lang: item.tags.lang } : {}),
        ...(typeof item.tags.category === 'string' ? { category: item.tags.category } : {}),
      };
    }

    entries.push({
      id: item.id,
      name: item.name,
      description: item.description,
      author: item.author,
      version: item.version,
      ...(tags !== undefined ? { tags } : {}),
      ruleCount: item.ruleCount,
      path: expectedPath,
    });
  }

  return {
    ok: true,
    catalog: {
      version: 1,
      lists: entries,
    },
  };
}

/**
 * Builds the download URL for a catalog entry strictly from the constant
 * repository base URL (`CATALOG_REPO_RAW_BASE_URL`) and `lists/<id>.json`.
 * Rejects any entry whose `id` is invalid or whose `path` does not match `lists/<id>.json`.
 */
export function resolveCatalogEntryUrl(entry: Pick<CatalogEntry, 'id' | 'path'>): string {
  if (!ID_PATTERN.test(entry.id)) {
    throw new Error(`Invalid catalog entry id "${entry.id}".`);
  }
  const expectedPath = `lists/${entry.id}.json`;
  if (entry.path !== expectedPath) {
    throw new Error(
      `Catalog entry path "${entry.path}" does not match expected path "${expectedPath}".`,
    );
  }
  return `${CATALOG_REPO_RAW_BASE_URL}/${expectedPath}`;
}

export interface CatalogFilterOptions {
  readonly query?: string;
  readonly category?: string;
  readonly country?: string;
}

/**
 * Filters catalog entries by search query (matching name, description, id, or category)
 * and by optional category/country tag filters.
 */
export function filterCatalogEntries(
  entries: readonly CatalogEntry[],
  filter: CatalogFilterOptions,
): CatalogEntry[] {
  const normalizedQuery = filter.query ? normalize(filter.query) : '';
  const categoryFilter = filter.category?.trim() ?? '';
  const countryFilter = filter.country?.trim() ?? '';

  return entries.filter((entry) => {
    if (categoryFilter !== '' && entry.tags?.category !== categoryFilter) {
      return false;
    }
    if (countryFilter !== '' && entry.tags?.country !== countryFilter) {
      return false;
    }
    if (normalizedQuery !== '') {
      const haystack = normalize(
        `${entry.name} ${entry.description} ${entry.id} ${entry.tags?.category ?? ''} ${entry.tags?.country ?? ''}`,
      );
      if (!haystack.includes(normalizedQuery)) {
        return false;
      }
    }
    return true;
  });
}

export interface FetchCatalogOptions {
  readonly fetchFn?: FetchLike;
  readonly permissions?: PermissionsLike;
}

export type FetchCatalogResult =
  | {
      readonly ok: true;
      readonly catalog: CatalogIndex;
      readonly catalogUrl: string;
    }
  | {
      readonly ok: false;
      readonly reason: RemoteListErrorReason;
      readonly error: string;
    };

/**
 * Fetches and validates `index.json` from `DEFAULT_CATALOG_URL`.
 */
export async function fetchCatalogIndex(
  options?: FetchCatalogOptions,
): Promise<FetchCatalogResult> {
  const parsedUrl = parseHttpsListUrl(DEFAULT_CATALOG_URL);
  if (!parsedUrl.ok) {
    return parsedUrl;
  }

  const perm = await ensureHostPermission(parsedUrl.url, {
    permissions: options?.permissions,
    requestIfMissing: true,
  });
  if (!perm.ok) {
    return perm;
  }

  const fetchFn: FetchLike = options?.fetchFn ?? fetch;
  let response: Response;
  try {
    response = await fetchFn(parsedUrl.url.toString(), {
      method: 'GET',
      credentials: 'omit',
      cache: 'no-store',
      headers: { Accept: 'application/json, text/plain;q=0.9' },
    });
  } catch (err) {
    return {
      ok: false,
      reason: 'network_error',
      error: err instanceof Error ? err.message : 'Network error while fetching catalog.',
    };
  }

  if (!response.ok) {
    return {
      ok: false,
      reason: 'http_error',
      error: `HTTP error ${response.status} while fetching catalog.`,
    };
  }

  let parsedJson: unknown;
  try {
    const text = await response.text();
    parsedJson = JSON.parse(text);
  } catch {
    return {
      ok: false,
      reason: 'invalid_json',
      error: 'Catalog response is not valid JSON.',
    };
  }

  const validated = validateCatalogIndex(parsedJson);
  if (!validated.ok) {
    return {
      ok: false,
      reason: 'validation_error',
      error: validated.error,
    };
  }

  return {
    ok: true,
    catalog: validated.catalog,
    catalogUrl: parsedUrl.url.toString(),
  };
}
