/**
 * Pure runtime validator for v1 filter lists matching `schema/list.schema.json`.
 *
 * Why not Ajv in the extension runtime? Ajv compiles schemas with `new Function`,
 * which violates both MV3 CSP and CLAUDE.md Invariant #3 ("never use eval /
 * new Function"). Ajv stays in devDependencies to cross-check this validator in tests.
 */
import type { HideMode } from '../adapters/types.ts';
import {
  MIN_PREFIX_LENGTH,
  type AccountRule,
  type KeywordRule,
  type ListRules,
  type MatchMode,
  type Platform,
  type ScopedRule,
} from './matcher.ts';

export interface ListTags {
  readonly country?: string;
  readonly lang?: string;
  readonly category?: string;
}

export interface ValidatedList {
  readonly id: string;
  readonly name: string;
  readonly description?: string;
  readonly author: string;
  readonly version: number;
  readonly tags?: ListTags;
  readonly mode?: HideMode;
  readonly includes?: readonly string[];
  readonly rules: ListRules;
}

export type ValidationResult =
  | { readonly ok: true; readonly list: ValidatedList }
  | { readonly ok: false; readonly error: string };

const ID_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const COUNTRY_PATTERN = /^[A-Z]{2}$/;
const LANG_PATTERN = /^[a-z]{2}$/;
const HANDLE_NO_WHITESPACE = /^[^\s]+$/;

const ALLOWED_TOP_KEYS = new Set([
  '$schema',
  'id',
  'name',
  'description',
  'author',
  'version',
  'tags',
  'mode',
  'includes',
  'rules',
]);
const ALLOWED_TAG_KEYS = new Set(['country', 'lang', 'category']);
const ALLOWED_RULE_KEYS = new Set(['accounts', 'keywords', 'exclude', 'scoped']);
const ALLOWED_ACCOUNT_KEYS = new Set(['platform', 'handle']);
const ALLOWED_SCOPED_KEYS = new Set(['platform', 'handle', 'keywords', 'exclude']);
const ALLOWED_KEYWORD_KEYS = new Set(['text', 'match']);
const ALLOWED_MODES = new Set<HideMode>(['collapse', 'remove', 'blur']);
const ALLOWED_PLATFORMS = new Set<Platform>(['x', 'youtube', 'reddit', 'instagram', 'tiktok']);
const ALLOWED_MATCH_MODES = new Set<MatchMode>(['word', 'prefix']);

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function codePointLength(str: string): number {
  return [...str].length;
}

function checkUnknownKeys(
  obj: Record<string, unknown>,
  allowed: ReadonlySet<string>,
  path: string,
): string | null {
  for (const key of Object.keys(obj)) {
    if (!allowed.has(key)) {
      return `${path} contains unknown field "${key}".`;
    }
  }
  return null;
}

function validateStringLength(
  value: unknown,
  min: number,
  max: number,
): value is string {
  if (typeof value !== 'string') return false;
  const len = codePointLength(value);
  return len >= min && len <= max;
}

function validateKeywordsArray(
  value: unknown,
  path: string,
  minItems: number,
): string | null {
  if (!Array.isArray(value) || value.length < minItems || value.length > 5000) {
    return `"${path}" must be an array of ${minItems}-5000 items.`;
  }
  for (let i = 0; i < value.length; i++) {
    const kw = value[i];
    if (typeof kw === 'string') {
      if (!validateStringLength(kw, 1, 200)) {
        return `"${path}[${i}]" must be 1-200 characters.`;
      }
      continue;
    }
    if (!isPlainObject(kw)) {
      return `"${path}[${i}]" must be a string or { text, match? } object.`;
    }
    const unknownKw = checkUnknownKeys(kw, ALLOWED_KEYWORD_KEYS, `${path}[${i}]`);
    if (unknownKw) return unknownKw;

    if (!validateStringLength(kw.text, 1, 200)) {
      return `"${path}[${i}].text" must be a string of 1-200 characters.`;
    }
    if ('match' in kw) {
      if (typeof kw.match !== 'string' || !ALLOWED_MATCH_MODES.has(kw.match as MatchMode)) {
        return `"${path}[${i}].match" must be "word" or "prefix".`;
      }
      if (kw.match === 'prefix' && codePointLength(kw.text) < MIN_PREFIX_LENGTH) {
        return `"${path}[${i}].text" in prefix mode must be at least ${MIN_PREFIX_LENGTH} characters.`;
      }
    }
  }
  return null;
}

function validateExcludeArray(value: unknown, path: string): string | null {
  if (!Array.isArray(value) || value.length > 1000) {
    return `"${path}" must be an array of at most 1000 items.`;
  }
  for (let i = 0; i < value.length; i++) {
    if (!validateStringLength(value[i], 1, 200)) {
      return `"${path}[${i}]" must be a string of 1-200 characters.`;
    }
  }
  return null;
}

export function validateListObject(input: unknown): ValidationResult {
  if (!isPlainObject(input)) {
    return { ok: false, error: 'root must be a JSON object.' };
  }

  for (const req of ['id', 'name', 'author', 'version', 'rules'] as const) {
    if (!(req in input)) {
      return { ok: false, error: `missing required field "${req}".` };
    }
  }

  const unknownTop = checkUnknownKeys(input, ALLOWED_TOP_KEYS, 'list');
  if (unknownTop) return { ok: false, error: unknownTop };

  if ('$schema' in input && typeof input.$schema !== 'string') {
    return { ok: false, error: '"$schema" must be a string.' };
  }

  if (!validateStringLength(input.id, 1, 64) || !ID_PATTERN.test(input.id)) {
    return {
      ok: false,
      error: '"id" must be 1-64 lowercase alphanumeric characters or hyphens (e.g. "ornek-liste").',
    };
  }

  if (!validateStringLength(input.name, 1, 100)) {
    return { ok: false, error: '"name" must be a non-empty string up to 100 characters.' };
  }

  if ('description' in input && !validateStringLength(input.description, 0, 500)) {
    return { ok: false, error: '"description" must be a string up to 500 characters.' };
  }

  if (!validateStringLength(input.author, 1, 64)) {
    return { ok: false, error: '"author" must be a non-empty string up to 64 characters.' };
  }

  if (typeof input.version !== 'number' || !Number.isInteger(input.version) || input.version < 1) {
    return { ok: false, error: '"version" must be an integer >= 1.' };
  }

  if ('mode' in input) {
    if (typeof input.mode !== 'string' || !ALLOWED_MODES.has(input.mode as HideMode)) {
      return { ok: false, error: '"mode" must be one of "collapse", "remove", or "blur".' };
    }
  }

  if ('tags' in input) {
    if (!isPlainObject(input.tags)) {
      return { ok: false, error: '"tags" must be an object.' };
    }
    const unknownTag = checkUnknownKeys(input.tags, ALLOWED_TAG_KEYS, 'tags');
    if (unknownTag) return { ok: false, error: unknownTag };

    if (
      'country' in input.tags &&
      (typeof input.tags.country !== 'string' || !COUNTRY_PATTERN.test(input.tags.country))
    ) {
      return { ok: false, error: '"tags.country" must be a 2-letter uppercase ISO code (e.g. "TR").' };
    }
    if (
      'lang' in input.tags &&
      (typeof input.tags.lang !== 'string' || !LANG_PATTERN.test(input.tags.lang))
    ) {
      return { ok: false, error: '"tags.lang" must be a 2-letter lowercase language code (e.g. "tr").' };
    }
    if (
      'category' in input.tags &&
      !validateStringLength(input.tags.category, 1, 40)
    ) {
      return { ok: false, error: '"tags.category" must be 1-40 characters.' };
    }
  }

  if ('includes' in input) {
    if (!Array.isArray(input.includes) || input.includes.length > 20) {
      return { ok: false, error: '"includes" must be an array of at most 20 list ids.' };
    }
    const seen = new Set<string>();
    for (const item of input.includes) {
      if (!validateStringLength(item, 1, 64) || !ID_PATTERN.test(item)) {
        return { ok: false, error: '"includes" entries must be valid list ids.' };
      }
      if (seen.has(item)) {
        return { ok: false, error: `"includes" contains duplicate id "${item}".` };
      }
      seen.add(item);
    }
  }

  if (!isPlainObject(input.rules)) {
    return { ok: false, error: '"rules" must be an object.' };
  }
  const unknownRule = checkUnknownKeys(input.rules, ALLOWED_RULE_KEYS, 'rules');
  if (unknownRule) return { ok: false, error: unknownRule };

  const rules = input.rules;

  if ('accounts' in rules) {
    if (!Array.isArray(rules.accounts) || rules.accounts.length > 5000) {
      return { ok: false, error: '"rules.accounts" must be an array of at most 5000 items.' };
    }
    for (let i = 0; i < rules.accounts.length; i++) {
      const acc = rules.accounts[i];
      if (!isPlainObject(acc)) {
        return { ok: false, error: `"rules.accounts[${i}]" must be an object.` };
      }
      const unknownAcc = checkUnknownKeys(acc, ALLOWED_ACCOUNT_KEYS, `rules.accounts[${i}]`);
      if (unknownAcc) return { ok: false, error: unknownAcc };

      if (typeof acc.platform !== 'string' || !ALLOWED_PLATFORMS.has(acc.platform as Platform)) {
        return {
          ok: false,
          error: `"rules.accounts[${i}].platform" must be one of x, youtube, reddit, instagram, tiktok.`,
        };
      }
      if (
        !validateStringLength(acc.handle, 1, 100) ||
        !HANDLE_NO_WHITESPACE.test(acc.handle)
      ) {
        return {
          ok: false,
          error: `"rules.accounts[${i}].handle" must be 1-100 non-whitespace characters.`,
        };
      }
    }
  }

  if ('keywords' in rules) {
    const kwErr = validateKeywordsArray(rules.keywords, 'rules.keywords', 0);
    if (kwErr) return { ok: false, error: kwErr };
  }

  if ('exclude' in rules) {
    const exErr = validateExcludeArray(rules.exclude, 'rules.exclude');
    if (exErr) return { ok: false, error: exErr };
  }

  if ('scoped' in rules) {
    if (!Array.isArray(rules.scoped) || rules.scoped.length > 1000) {
      return { ok: false, error: '"rules.scoped" must be an array of at most 1000 items.' };
    }
    for (let i = 0; i < rules.scoped.length; i++) {
      const item = rules.scoped[i];
      if (!isPlainObject(item)) {
        return { ok: false, error: `"rules.scoped[${i}]" must be an object.` };
      }
      for (const req of ['platform', 'handle', 'keywords'] as const) {
        if (!(req in item)) {
          return { ok: false, error: `"rules.scoped[${i}]" is missing required field "${req}".` };
        }
      }
      const unknownScoped = checkUnknownKeys(item, ALLOWED_SCOPED_KEYS, `rules.scoped[${i}]`);
      if (unknownScoped) return { ok: false, error: unknownScoped };

      if (typeof item.platform !== 'string' || !ALLOWED_PLATFORMS.has(item.platform as Platform)) {
        return {
          ok: false,
          error: `"rules.scoped[${i}].platform" must be one of x, youtube, reddit, instagram, tiktok.`,
        };
      }
      if (
        !validateStringLength(item.handle, 1, 100) ||
        !HANDLE_NO_WHITESPACE.test(item.handle)
      ) {
        return {
          ok: false,
          error: `"rules.scoped[${i}].handle" must be 1-100 non-whitespace characters.`,
        };
      }
      const kwErr = validateKeywordsArray(item.keywords, `rules.scoped[${i}].keywords`, 1);
      if (kwErr) return { ok: false, error: kwErr };

      if ('exclude' in item) {
        const exErr = validateExcludeArray(item.exclude, `rules.scoped[${i}].exclude`);
        if (exErr) return { ok: false, error: exErr };
      }
    }
  }

  const validatedRules: ListRules = {
    accounts: rules.accounts as readonly AccountRule[] | undefined,
    keywords: rules.keywords as readonly KeywordRule[] | undefined,
    exclude: rules.exclude as readonly string[] | undefined,
    scoped: rules.scoped as readonly ScopedRule[] | undefined,
  };

  return {
    ok: true,
    list: {
      id: input.id,
      name: input.name,
      description: input.description as string | undefined,
      author: input.author,
      version: input.version,
      tags: input.tags as ListTags | undefined,
      mode: input.mode as HideMode | undefined,
      includes: input.includes as readonly string[] | undefined,
      rules: validatedRules,
    },
  };
}
