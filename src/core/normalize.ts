/**
 * Text normalization shared by rule compilation and matching.
 * Both sides must go through the same function, otherwise matching breaks.
 */

// Invisible characters are often used (deliberately or not) to split words,
// e.g. "spo\u200Biler"; removing them keeps such text matchable.
const INVISIBLE_CHARS = /[\u00AD\u200B-\u200D\u2060\uFEFF]/g;

// After NFKD, accents become separate combining marks; removing them makes
// "şöyle" and "soyle" equal. This also removes the dot of "İ" (İ -> I + U+0307).
const COMBINING_MARKS = /\p{M}/gu;

const WHITESPACE_RUN = /\s+/g;

/**
 * Folds text into a canonical, accent-insensitive, lowercase form.
 *
 * Turkish dotted/dotless i: İ, I, ı and i all fold to "i". Locale-aware
 * lowercasing ("I" -> "ı" in tr) would make "IZMIR" differ from "izmir",
 * and people often type Turkish without Turkish characters, so we
 * deliberately collapse all four into one letter.
 */
export function normalize(input: string): string {
  return input
    .normalize('NFKD')
    .replace(INVISIBLE_CHARS, '')
    .replace(COMBINING_MARKS, '')
    // "ı" has no decomposition, so NFKD alone cannot fold it.
    .replace(/ı/g, 'i')
    // Locale-independent on purpose; see the comment above.
    .toLowerCase()
    .replace(WHITESPACE_RUN, ' ')
    .trim();
}

