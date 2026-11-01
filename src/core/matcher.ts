/**
 * DOM-independent matching engine. Everything here is a pure function so it
 * can be unit tested and reused by every adapter.
 *
 * Deliberately avoids building RegExps from list content: lists are untrusted
 * input, and v1 has no regex support (see CLAUDE.md).
 */
import { normalize } from './normalize';

export type Platform = 'x' | 'youtube' | 'reddit' | 'instagram' | 'tiktok';

export interface AccountRule {
  readonly platform: Platform;
  readonly handle: string;
}

/** Mirrors `rules` in schema/list.schema.json. */
export interface ListRules {
  readonly accounts?: readonly AccountRule[];
  readonly keywords?: readonly string[];
  readonly exclude?: readonly string[];
}

export interface CompiledRules {
  /** Keys in the form `${platform}:${handle}`. */
  readonly accounts: ReadonlySet<string>;
  /** Normalized, deduplicated keywords. */
  readonly keywords: readonly string[];
  /** Normalized, deduplicated exclude phrases. */
  readonly exclude: readonly string[];
}

export type TextMatchResult =
  | { readonly matched: true; readonly keyword: string }
  | { readonly matched: false; readonly excludedBy?: string };

const WORD_CHAR = /[\p{L}\p{N}]/u;

function isWordChar(char: string | undefined): boolean {
  return char !== undefined && WORD_CHAR.test(char);
}

function accountKey(platform: Platform, handle: string): string {
  // Handles are case-insensitive on supported platforms and users often
  // paste them with a leading "@".
  return `${platform}:${handle.trim().replace(/^@/, '').toLowerCase()}`;
}

function uniqueNormalized(values: readonly string[] | undefined): string[] {
  const out = new Set<string>();
  for (const value of values ?? []) {
    const n = normalize(value);
    // A rule that normalizes to "" would match everything.
    if (n !== '') out.add(n);
  }
  return [...out];
}

/**
 * Compiles one or more rule sets into a single structure. Rules repeated
 * across lists are deduplicated so they are evaluated only once.
 */
export function compileRules(ruleSets: readonly ListRules[]): CompiledRules {
  const accounts = new Set<string>();
  const keywords: string[] = [];
  const exclude: string[] = [];

  for (const rules of ruleSets) {
    for (const a of rules.accounts ?? []) {
      accounts.add(accountKey(a.platform, a.handle));
    }
    keywords.push(...(rules.keywords ?? []));
    exclude.push(...(rules.exclude ?? []));
  }

  return {
    accounts,
    keywords: uniqueNormalized(keywords),
    exclude: uniqueNormalized(exclude),
  };
}

/**
 * True if `needle` occurs in `haystack` on word boundaries. Both arguments
 * must already be normalized. A boundary is only required on a side where
 * the needle itself starts/ends with a letter or digit, so phrases like
 * "c++" still work.
 */
export function containsWord(haystack: string, needle: string): boolean {
  if (needle === '') return false;
  const checkStart = isWordChar(needle[0]);
  const checkEnd = isWordChar(needle[needle.length - 1]);

  let from = 0;
  while (from <= haystack.length - needle.length) {
    const idx = haystack.indexOf(needle, from);
    if (idx === -1) return false;
    const startOk = !checkStart || !isWordChar(haystack[idx - 1]);
    const endOk = !checkEnd || !isWordChar(haystack[idx + needle.length]);
    if (startOk && endOk) return true;
    from = idx + 1;
  }
  return false;
}

/**
 * "Text contains" mode. Exclude phrases are checked first: if any of them
 * occurs, the text is never matched, regardless of keywords.
 */
export function matchText(text: string, rules: CompiledRules): TextMatchResult {
  const normalized = normalize(text);
  if (normalized === '') return { matched: false };

  for (const phrase of rules.exclude) {
    if (containsWord(normalized, phrase)) {
      return { matched: false, excludedBy: phrase };
    }
  }
  for (const keyword of rules.keywords) {
    if (containsWord(normalized, keyword)) {
      return { matched: true, keyword };
    }
  }
  return { matched: false };
}

/** "Author handle" mode. Independent from keyword/exclude rules. */
export function matchAuthor(
  platform: Platform,
  handle: string,
  rules: CompiledRules,
): boolean {
  return rules.accounts.has(accountKey(platform, handle));
}

