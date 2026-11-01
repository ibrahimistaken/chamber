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

/** Account-scoped keyword rule: only applies when the post's primary author matches `handle`. */
export interface ScopedRule {
  readonly platform: Platform;
  readonly handle: string;
  readonly keywords: readonly KeywordRule[];
  readonly exclude?: readonly string[];
}

/** Mirrors `rules` in schema/list.schema.json. */
export interface ListRules {
  readonly accounts?: readonly AccountRule[];
  readonly keywords?: readonly KeywordRule[];
  readonly exclude?: readonly string[];
  readonly scoped?: readonly ScopedRule[];
}

export interface CompiledKeyword {
  /** Normalized keyword text. */
  readonly text: string;
  readonly match: MatchMode;
}

export interface CompiledScopedRule {
  /** Key in the form `${platform}:${handle}`. */
  readonly key: string;
  readonly keywords: readonly CompiledKeyword[];
  readonly exclude: readonly string[];
}

export interface CompiledRules {
  /** Keys in the form `${platform}:${handle}`. */
  readonly accounts: ReadonlySet<string>;
  /** Normalized, deduplicated keywords. */
  readonly keywords: readonly CompiledKeyword[];
  /** Normalized, deduplicated exclude phrases, longest first. */
  readonly exclude: readonly string[];
  /** Normalized, deduplicated account-scoped keyword rules. */
  readonly scoped: readonly CompiledScopedRule[];
}

export type TextMatchResult =
  | { readonly matched: true; readonly keyword: string }
  | { readonly matched: false };

/**
 * Minimum length (in code points, after normalization) of the LAST word of a
 * prefix keyword. Only the last word is open-ended, so "ab c" would hide
 * every "ab c..." text; shorter prefixes like "ali" would hide "alinin",
 * "alisveris"...
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

/**
 * Last run of letters/digits in normalized text. Words are split on the
 * same boundary the matcher uses, so "ab-c" ends in "c": a prefix rule only
 * relaxes the end of the keyword, and that final run is what can expand.
 */
function lastWord(normalized: string): string {
  const chars = [...normalized];
  let end = chars.length;
  while (end > 0 && !isWordChar(chars[end - 1])) end--;
  let start = end;
  while (start > 0 && isWordChar(chars[start - 1])) start--;
  return chars.slice(start, end).join('');
}

function assertPrefixLength(raw: string, normalized: string): void {
  const word = lastWord(normalized);
  // Code points, not UTF-16 units, so the limit matches JSON Schema's
  // minLength semantics.
  const length = [...word].length;
  if (length < MIN_PREFIX_LENGTH) {
    throw new RuleValidationError(
      `Prefix keyword "${raw}" is too short: its last word must be at least ` +
        `${MIN_PREFIX_LENGTH} characters after normalization ` +
        `("${word}" has ${length}). Use match "word" instead.`,
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

function sortLongestFirst(phrases: readonly string[]): string[] {
  // Code point length; sort is stable so equal lengths keep list order.
  return [...phrases].sort((a, b) => [...b].length - [...a].length);
}

function compileScopedRules(rules: readonly ScopedRule[]): CompiledScopedRule[] {
  const byKey = new Map<string, { keywords: KeywordRule[]; exclude: string[] }>();

  for (const rule of rules) {
    const key = accountKey(rule.platform, rule.handle);
    let bucket = byKey.get(key);
    if (!bucket) {
      bucket = { keywords: [], exclude: [] };
      byKey.set(key, bucket);
    }
    bucket.keywords.push(...rule.keywords);
    bucket.exclude.push(...(rule.exclude ?? []));
  }

  const out: CompiledScopedRule[] = [];
  for (const [key, bucket] of byKey) {
    const compiledKeywords = uniqueKeywords(bucket.keywords);
    if (compiledKeywords.length === 0) continue;
    out.push({
      key,
      keywords: compiledKeywords,
      exclude: sortLongestFirst(uniqueNormalized(bucket.exclude)),
    });
  }
  return out;
}

/**
 * Compiles one or more rule sets into a single structure. Rules repeated
 * across lists are deduplicated so they are evaluated only once.
 *
 * @throws {RuleValidationError} if the last word of a prefix keyword is
 *   shorter than MIN_PREFIX_LENGTH after normalization.
 */
export function compileRules(ruleSets: readonly ListRules[]): CompiledRules {
  const accounts = new Set<string>();
  const keywords: KeywordRule[] = [];
  const exclude: string[] = [];
  const scoped: ScopedRule[] = [];

  for (const rules of ruleSets) {
    for (const a of rules.accounts ?? []) {
      accounts.add(accountKey(a.platform, a.handle));
    }
    keywords.push(...(rules.keywords ?? []));
    exclude.push(...(rules.exclude ?? []));
    scoped.push(...(rules.scoped ?? []));
  }

  return {
    accounts,
    keywords: uniqueKeywords(keywords),
    exclude: sortLongestFirst(uniqueNormalized(exclude)),
    scoped: compileScopedRules(scoped),
  };
}

/**
 * True if `needle` occurs in `haystack` starting at a word boundary and,
 * when `requireEnd` is set, also ending at one. Both arguments must already
 * be normalized. A boundary is only required on a side where the needle
 * itself starts/ends with a letter or digit, so phrases like "c++" work.
 * Returns the index of the first such occurrence at or after `from`, or -1.
 */
function indexOfBounded(
  haystack: string,
  needle: string,
  requireEnd: boolean,
  from = 0,
): number {
  if (needle === '') return -1;
  const checkStart = isWordChar(needle[0]);
  const checkEnd = requireEnd && isWordChar(needle[needle.length - 1]);

  let pos = from;
  while (pos <= haystack.length - needle.length) {
    const idx = haystack.indexOf(needle, pos);
    if (idx === -1) return -1;
    const startOk = !checkStart || !isWordChar(haystack[idx - 1]);
    const endOk = !checkEnd || !isWordChar(haystack[idx + needle.length]);
    if (startOk && endOk) return idx;
    pos = idx + 1;
  }
  return -1;
}

/** Whole-word/phrase match. Arguments must already be normalized. */
export function containsWord(haystack: string, needle: string): boolean {
  return indexOfBounded(haystack, needle, true) !== -1;
}

/** Word-start match ("siyasetci" in "siyasetcilerin"). Normalized input. */
export function containsPrefix(haystack: string, needle: string): boolean {
  return indexOfBounded(haystack, needle, false) !== -1;
}

/** Replaces every whole-word occurrence of `phrase` with a single space. */
function removePhrase(text: string, phrase: string): string {
  let out = '';
  let pos = 0;
  let idx = indexOfBounded(text, phrase, true, pos);
  while (idx !== -1) {
    out += text.slice(pos, idx) + ' ';
    pos = idx + phrase.length;
    idx = indexOfBounded(text, phrase, true, pos);
  }
  return out + text.slice(pos);
}

/**
 * Removes all exclude phrases from normalized text. `exclude` must be sorted
 * longest first (compileRules does this) so that a phrase containing another
 * one is removed as a whole before the shorter one can split it.
 */
export function stripExcludes(normalized: string, exclude: readonly string[]): string {
  let text = normalized;
  for (const phrase of exclude) text = removePhrase(text, phrase);
  return text;
}

function matchesKeyword(text: string, keyword: CompiledKeyword): boolean {
  return keyword.match === 'prefix'
    ? containsPrefix(text, keyword.text)
    : containsWord(text, keyword.text);
}

function matchAgainstKeywords(
  normalizedText: string,
  keywords: readonly CompiledKeyword[],
  exclude: readonly string[],
): TextMatchResult {
  if (normalizedText === '') return { matched: false };
  const remaining = stripExcludes(normalizedText, exclude);
  for (const keyword of keywords) {
    if (matchesKeyword(remaining, keyword)) {
      return { matched: true, keyword: keyword.text };
    }
  }
  return { matched: false };
}

/**
 * "Text contains" mode. Exclude phrases are removed from the text first and
 * keywords are searched in what remains, so an exclude only protects its own
 * occurrence: with exclude "taylor series" and keyword "taylor",
 * "taylor series nedir" is not matched but "taylor series ve taylor swift" is.
 */
export function matchText(text: string, rules: CompiledRules): TextMatchResult {
  return matchAgainstKeywords(normalize(text), rules.keywords, rules.exclude);
}

/**
 * "Author handle" mode. Independent from keyword/exclude rules: exclude only
 * applies to text mode.
 */
export function matchAuthor(
  platform: Platform,
  handle: string,
  rules: CompiledRules,
): boolean {
  return rules.accounts.has(accountKey(platform, handle));
}

/**
 * "Account-scoped keyword" mode. Matches only when the post's primary author
 * matches `platform` + `handle` (case-insensitive, leading "@" ignored) AND
 * the text matches one of that scoped rule's keywords after stripping its
 * exclude phrases.
 */
export function matchScoped(
  platform: Platform,
  handle: string,
  text: string,
  rules: CompiledRules,
): TextMatchResult {
  if (!rules.scoped || rules.scoped.length === 0) return { matched: false };
  const targetKey = accountKey(platform, handle);
  const scopedRule = rules.scoped.find((entry) => entry.key === targetKey);
  if (!scopedRule) return { matched: false };

  return matchAgainstKeywords(normalize(text), scopedRule.keywords, scopedRule.exclude);
}
