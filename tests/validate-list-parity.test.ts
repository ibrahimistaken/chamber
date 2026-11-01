import Ajv2020 from 'ajv/dist/2020';
import { describe, expect, it } from 'vitest';
import exampleList from '../lists/ornek-liste.json';
import schema from '../schema/list.schema.json';
import { validateListObject } from '../src/core/validate-list';

const ajv = new Ajv2020({ allErrors: true });
const validateAjv = ajv.compile(schema);

const minimal = {
  id: 'ornek-liste',
  name: 'Örnek Liste',
  author: 'chamber',
  version: 1,
  rules: {},
};

interface ParityCase {
  readonly label: string;
  readonly expected: boolean;
  readonly input: unknown;
}

const CASES: readonly ParityCase[] = [
  // --- Valid cases ---
  {
    label: 'valid: minimal list with empty rules',
    expected: true,
    input: minimal,
  },
  {
    label: 'valid: lists/ornek-liste.json',
    expected: true,
    input: exampleList,
  },
  {
    label: 'valid: all optional top-level fields populated',
    expected: true,
    input: {
      $schema: '../schema/list.schema.json',
      id: 'tam-liste-1',
      name: 'Tam Liste',
      description: 'Açıklama metni',
      author: 'yazar_1',
      version: 3,
      tags: { country: 'TR', lang: 'tr', category: 'spor' },
      mode: 'blur',
      includes: ['diger-liste', 'ikinci-liste-2'],
      rules: {
        accounts: [
          { platform: 'x', handle: 'hesap1' },
          { platform: 'youtube', handle: '@kanal' },
          { platform: 'reddit', handle: 'u_test' },
          { platform: 'instagram', handle: 'insta_user' },
          { platform: 'tiktok', handle: 'tiktok_user' },
        ],
        keywords: [
          'spoiler',
          { text: 'kelime', match: 'word' },
          { text: 'siyasetçi', match: 'prefix' },
          { text: 'varsayilan' },
        ],
        exclude: ['spoiler yok'],
      },
    },
  },
  {
    label: 'valid: boundary lengths (min lengths: 1-char id/name/author, empty description)',
    expected: true,
    input: {
      id: 'a',
      name: 'A',
      description: '',
      author: 'b',
      version: 1,
      rules: {
        accounts: [{ platform: 'x', handle: 'x' }],
        keywords: ['a', { text: 'b', match: 'word' }, { text: 'siya', match: 'prefix' }],
        exclude: ['z'],
      },
    },
  },
  {
    label: 'valid: boundary lengths (max lengths: 64 id/author, 100 name, 500 description, 200 keyword/exclude, 20 includes)',
    expected: true,
    input: {
      id: 'a'.repeat(64),
      name: 'n'.repeat(100),
      description: 'd'.repeat(500),
      author: 'u'.repeat(64),
      version: 999,
      tags: { country: 'US', lang: 'en', category: 'c'.repeat(40) },
      mode: 'remove',
      includes: Array.from({ length: 20 }, (_, i) => `liste-${i}`),
      rules: {
        accounts: [{ platform: 'x', handle: 'h'.repeat(100) }],
        keywords: ['k'.repeat(200), { text: 'p'.repeat(200), match: 'prefix' }],
        exclude: ['e'.repeat(200)],
        scoped: [
          {
            platform: 'x',
            handle: 'ornek_hesap',
            keywords: ['spoiler', { text: 'siyasetçi', match: 'prefix' }],
            exclude: ['spoiler yok'],
          },
        ],
      },
    },
  },
  {
    label: 'valid: Turkish multibyte 4-char prefix keyword ("İŞÇİ")',
    expected: true,
    input: {
      ...minimal,
      rules: { keywords: [{ text: 'İŞÇİ', match: 'prefix' }] },
    },
  },
  {
    label: 'valid: scoped rule without optional exclude',
    expected: true,
    input: {
      ...minimal,
      rules: {
        scoped: [{ platform: 'youtube', handle: '@kanal', keywords: ['reklam'] }],
      },
    },
  },

  // --- Invalid: non-object roots ---
  {
    label: 'invalid: null root',
    expected: false,
    input: null,
  },
  {
    label: 'invalid: array root',
    expected: false,
    input: [minimal],
  },
  {
    label: 'invalid: primitive root',
    expected: false,
    input: 'ornek-liste',
  },

  // --- Invalid: missing required fields ---
  {
    label: 'invalid: missing id',
    expected: false,
    input: { name: 'A', author: 'b', version: 1, rules: {} },
  },
  {
    label: 'invalid: missing name',
    expected: false,
    input: { id: 'a', author: 'b', version: 1, rules: {} },
  },
  {
    label: 'invalid: missing author',
    expected: false,
    input: { id: 'a', name: 'A', version: 1, rules: {} },
  },
  {
    label: 'invalid: missing version',
    expected: false,
    input: { id: 'a', name: 'A', author: 'b', rules: {} },
  },
  {
    label: 'invalid: missing rules',
    expected: false,
    input: { id: 'a', name: 'A', author: 'b', version: 1 },
  },

  // --- Invalid: extra / unknown fields ---
  {
    label: 'invalid: unknown top-level field',
    expected: false,
    input: { ...minimal, extra: true },
  },
  {
    label: 'invalid: unknown field in tags',
    expected: false,
    input: { ...minimal, tags: { country: 'TR', region: 'EMEA' } },
  },
  {
    label: 'invalid: unknown field in rules (e.g. regex)',
    expected: false,
    input: { ...minimal, rules: { regex: ['.*'] } },
  },
  {
    label: 'invalid: unknown field in account rule',
    expected: false,
    input: {
      ...minimal,
      rules: { accounts: [{ platform: 'x', handle: 'ali', id: '123' }] },
    },
  },
  {
    label: 'invalid: unknown field in keyword object',
    expected: false,
    input: {
      ...minimal,
      rules: { keywords: [{ text: 'spoiler', caseSensitive: true }] },
    },
  },

  // --- Invalid: bad id formats and lengths ---
  {
    label: 'invalid: uppercase in id',
    expected: false,
    input: { ...minimal, id: 'Ornek-Liste' },
  },
  {
    label: 'invalid: underscore in id',
    expected: false,
    input: { ...minimal, id: 'ornek_liste' },
  },
  {
    label: 'invalid: leading or trailing hyphen in id',
    expected: false,
    input: { ...minimal, id: '-ornek' },
  },
  {
    label: 'invalid: consecutive hyphens in id',
    expected: false,
    input: { ...minimal, id: 'ornek--liste' },
  },
  {
    label: 'invalid: non-ASCII characters in id',
    expected: false,
    input: { ...minimal, id: 'örnek' },
  },
  {
    label: 'invalid: id exceeds 64 characters',
    expected: false,
    input: { ...minimal, id: 'a'.repeat(65) },
  },

  // --- Invalid: wrong types and bounds on metadata ---
  {
    label: 'invalid: empty name',
    expected: false,
    input: { ...minimal, name: '' },
  },
  {
    label: 'invalid: name exceeds 100 characters',
    expected: false,
    input: { ...minimal, name: 'n'.repeat(101) },
  },
  {
    label: 'invalid: description exceeds 500 characters',
    expected: false,
    input: { ...minimal, description: 'd'.repeat(501) },
  },
  {
    label: 'invalid: empty author',
    expected: false,
    input: { ...minimal, author: '' },
  },
  {
    label: 'invalid: version 0',
    expected: false,
    input: { ...minimal, version: 0 },
  },
  {
    label: 'invalid: non-integer version (1.5)',
    expected: false,
    input: { ...minimal, version: 1.5 },
  },
  {
    label: 'invalid: string version ("1")',
    expected: false,
    input: { ...minimal, version: '1' },
  },
  {
    label: 'invalid: unknown mode ("hide")',
    expected: false,
    input: { ...minimal, mode: 'hide' },
  },
  {
    label: 'invalid: lowercase tags.country ("tr")',
    expected: false,
    input: { ...minimal, tags: { country: 'tr' } },
  },
  {
    label: 'invalid: uppercase tags.lang ("TR")',
    expected: false,
    input: { ...minimal, tags: { lang: 'TR' } },
  },
  {
    label: 'invalid: duplicate entries in includes',
    expected: false,
    input: { ...minimal, includes: ['ayni-liste', 'ayni-liste'] },
  },
  {
    label: 'invalid: more than 20 includes',
    expected: false,
    input: {
      ...minimal,
      includes: Array.from({ length: 21 }, (_, i) => `liste-${i}`),
    },
  },

  // --- Invalid: accounts, keywords, exclude ---
  {
    label: 'invalid: unknown account platform',
    expected: false,
    input: {
      ...minimal,
      rules: { accounts: [{ platform: 'bluesky', handle: 'user' }] },
    },
  },
  {
    label: 'invalid: account handle with whitespace',
    expected: false,
    input: {
      ...minimal,
      rules: { accounts: [{ platform: 'x', handle: 'user name' }] },
    },
  },
  {
    label: 'invalid: prefix keyword shorter than 4 chars ("ali")',
    expected: false,
    input: {
      ...minimal,
      rules: { keywords: [{ text: 'ali', match: 'prefix' }] },
    },
  },
  {
    label: 'invalid: prefix keyword with 3 Turkish chars ("İŞÇ")',
    expected: false,
    input: {
      ...minimal,
      rules: { keywords: [{ text: 'İŞÇ', match: 'prefix' }] },
    },
  },
  {
    label: 'invalid: empty string keyword',
    expected: false,
    input: {
      ...minimal,
      rules: { keywords: [''] },
    },
  },
  {
    label: 'invalid: keyword object missing text',
    expected: false,
    input: {
      ...minimal,
      rules: { keywords: [{ match: 'word' }] },
    },
  },
  {
    label: 'invalid: keyword exceeds 200 characters',
    expected: false,
    input: {
      ...minimal,
      rules: { keywords: ['k'.repeat(201)] },
    },
  },
  {
    label: 'invalid: more than 5000 keywords',
    expected: false,
    input: {
      ...minimal,
      rules: { keywords: Array.from({ length: 5001 }, (_, i) => `k${i}`) },
    },
  },
  {
    label: 'invalid: more than 1000 excludes',
    expected: false,
    input: {
      ...minimal,
      rules: { exclude: Array.from({ length: 1001 }, (_, i) => `e${i}`) },
    },
  },
  {
    label: 'invalid: scoped rule missing keywords',
    expected: false,
    input: {
      ...minimal,
      rules: { scoped: [{ platform: 'x', handle: 'ali' }] },
    },
  },
  {
    label: 'invalid: scoped rule with empty keywords array',
    expected: false,
    input: {
      ...minimal,
      rules: { scoped: [{ platform: 'x', handle: 'ali', keywords: [] }] },
    },
  },
  {
    label: 'invalid: scoped rule with unknown field',
    expected: false,
    input: {
      ...minimal,
      rules: {
        scoped: [{ platform: 'x', handle: 'ali', keywords: ['test'], mode: 'blur' }],
      },
    },
  },
  {
    label: 'invalid: scoped rule with short prefix keyword ("ali")',
    expected: false,
    input: {
      ...minimal,
      rules: {
        scoped: [
          {
            platform: 'x',
            handle: 'hesap',
            keywords: [{ text: 'ali', match: 'prefix' }],
          },
        ],
      },
    },
  },
  {
    label: 'invalid: scoped rule with whitespace in handle',
    expected: false,
    input: {
      ...minimal,
      rules: {
        scoped: [{ platform: 'x', handle: 'bad handle', keywords: ['test'] }],
      },
    },
  },
  {
    label: 'invalid: more than 1000 scoped rules',
    expected: false,
    input: {
      ...minimal,
      rules: {
        scoped: Array.from({ length: 1001 }, (_, i) => ({
          platform: 'x',
          handle: `u${i}`,
          keywords: ['k'],
        })),
      },
    },
  },
];

describe('validateListObject vs schema/list.schema.json (Ajv) parity', () => {
  it('has at least 30 test cases', () => {
    expect(CASES.length).toBeGreaterThanOrEqual(30);
  });

  it.each(CASES)('$label', ({ input, expected }) => {
    const ajvResult = validateAjv(input);
    const runtimeResult = validateListObject(input).ok;

    expect(ajvResult).toBe(expected);
    expect(runtimeResult).toBe(ajvResult);
  });
});

