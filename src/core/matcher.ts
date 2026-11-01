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

/**
 * "word": the keyword must be a whole word/phrase.
 * "prefix": the keyword must start a word but may be followed by more
 * letters; needed for agglutinative languages like Turkish
 * ("siyasetçi" -> "siyasetçilerin").
 */
export type MatchMode = 'word' | 'prefix';

/** A bare string is shorthand for `{ text, match: 'word' }`. */
export type KeywordRule =
  | string
  | { readonly text: string; readonly match?: MatchMode };

/** Mirrors `rules` in schema/list.schema.json. */
export interface ListRules {
  readonly accounts?: readonly AccountRule[];
  readonly keywords?: readonly KeywordRule[];
  readonly exclude?: readonly string[];
}

export interface CompiledKeyword {
  /** Normalized keyword text. */
  readonly text: string;
  readonly match: MatchMode;
}

export interface CompiledRules {
  /** Keys in the form `${platform}:${handle}`. */
  readonly accounts: ReadonlySet<string>;
  /** Normalized, deduplicated keywords. */
  readonly keywords: readonly CompiledKeyword[];
  /** Normalized, deduplicated exclude phrases. */
  readonly exclude: readonly string[];
}

export type TextMatchResult =
  | { readonly matched: true; readonly keyword: string }
  | { readonly matched: false; readonly excludedBy?: string };

/**
 * Minimum length (in code points, after normalization) of a prefix keyword.
 * Shorter prefixes like "ali" would hide "alis", "alinin", "alisveris"...
 */
export const MIN_PREFIX_LENGTH = 4;

/** Thrown when a list contains a rule the engine refuses to compile. */
export class RuleValidationError extends Error {
  override readonly name = 'RuleValidationError';
}

const WORD_CHAR = /[\p{L}\p{N}]/u;

function isWordChar(char: string | undefined): boolean {
  return char !== undefined && WORD_CHAR.test(char);
}

function accountKey(platform: Platform, handle: string): string {
  // Handles are case-insensitive on supported platforms and users often
  // paste them with a leading "@".
  return `${platform}:${handle.trim().replace(/^@/, '').toLowerCase()}`;
}

function uniqueNormalized(values: readonly string[]): string[] {
  const out = new Set<string>();
  for (const value of values) {
    const n = normalize(value);
    // A rule that normalizes to "" would match everything.
    if (n !== '') out.add(n);
  }
  return [...out];
}

function assertPrefixLength(raw: string, normalized: string): void {
  // Code points, not UTF-16 units, so the limit matches JSON Schema's
  // minLength semantics.
  const length = [...normalized].length;
  if (length < MIN_PREFIX_LENGTH) {
    throw new RuleValidationError(
      `Prefix keyword "${raw}" is too short: it must be at least ` +
        `${MIN_PREFIX_LENGTH} characters after normalization ` +
        `("${normalized}" has ${length}). Use match "word" instead.`,
    );
  }
}

function uniqueKeywords(rules: readonly KeywordRule[]): CompiledKeyword[] {
  const byText = new Map<string, MatchMode>();
  for (const rule of rules) {
    const raw = typeof rule === 'string' ? rule : rule.text;
    const match = typeof rule === 'string' ? 'word' : (rule.match ?? 'word');
    const text = normalize(raw);
    // A rule that normalizes to "" would match everything.
    if (text === '') continue;
    if (match === 'prefix') assertPrefixLength(raw, text);
    // A prefix rule already matches everything the word rule would, so
    // keeping only the prefix avoids evaluating the same text twice.
    if (byText.get(text) !== 'prefix') byText.set(text, match);
  }
  return [...byText].map(([text, match]) => ({ text, match }));
}

/**
 * Compiles one or more rule sets into a single structure. Rules repeated
 * across lists are deduplicated so they are evaluated only once.
 *
 * @throws {RuleValidationError} if a prefix keyword is shorter than
 *   MIN_PREFIX_LENGTH after normalization.
 */
export function compileRules(ruleSets: readonly ListRules[]): CompiledRules {
  const accounts = new Set<string>();
  const keywords: KeywordRule[] = [];
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
    keywords: uniqueKeywords(keywords),
    exclude: uniqueNormalized(exclude),
  };
}

/**
 * True if `needle` occurs in `haystack` starting at a word boundary and,
 * when `requireEnd` is set, also ending at one. Both arguments must already
 * be normalized. A boundary is only required on a side where the needle
 * itself starts/ends with a letter or digit, so phrases like "c++" work.
 */
function containsBounded(
  haystack: string,
  needle: string,
  requireEnd: boolean,
): boolean {
  if (needle === '') return false;
  const checkStart = isWordChar(needle[0]);
  const checkEnd = requireEnd && isWordChar(needle[needle.length - 1]);

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

/** Whole-word/phrase match. Arguments must already be normalized. */
export function containsWord(haystack: string, needle: string): boolean {
  return containsBounded(haystack, needle, true);
}

/** Word-start match ("siyasetci" in "siyasetcilerin"). Normalized input. */
export function containsPrefix(haystack: string, needle: string): boolean {
  return containsBounded(haystack, needle, false);
}

function matchesKeyword(text: string, keyword: CompiledKeyword): boolean {
  return keyword.match === 'prefix'
    ? containsPrefix(text, keyword.text)
    : containsWord(text, keyword.text);
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
    if (matchesKeyword(normalized, keyword)) {
      return { matched: true, keyword: keyword.text };
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
