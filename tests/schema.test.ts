import { describe, expect, it } from 'vitest';
import Ajv2020 from 'ajv/dist/2020';
import schema from '../schema/list.schema.json';
import exampleList from '../lists/ornek-liste.json';

const ajv = new Ajv2020({ allErrors: true });
const validate = ajv.compile(schema);

const minimal = {
  id: 'ornek',
  name: 'Örnek',
  author: 'kullanici',
  version: 1,
  rules: {},
};

describe('list.schema.json', () => {
  it('accepts a minimal valid list', () => {
    expect(validate(minimal)).toBe(true);
  });

  it.each(['id', 'name', 'author', 'version', 'rules'])(
    'rejects a list missing required field "%s"',
    (field) => {
      const list: Record<string, unknown> = { ...minimal };
      delete list[field];
      expect(validate(list)).toBe(false);
    },
  );

  it.each(['Ornek', 'ornek_liste', 'ornek liste', '-ornek', 'ornek-', 'örnek'])(
    'rejects invalid id "%s"',
    (id) => {
      expect(validate({ ...minimal, id })).toBe(false);
    },
  );

  it('rejects unknown mode', () => {
    expect(validate({ ...minimal, mode: 'delete' })).toBe(false);
  });

  it('rejects unknown top-level fields', () => {
    expect(validate({ ...minimal, script: 'alert(1)' })).toBe(false);
  });

  it('rejects unknown rule types (e.g. regex, not in v1)', () => {
    expect(validate({ ...minimal, rules: { regex: ['a.*'] } })).toBe(false);
  });

  it('rejects non-integer or zero version', () => {
    expect(validate({ ...minimal, version: 0 })).toBe(false);
    expect(validate({ ...minimal, version: 1.5 })).toBe(false);
  });

  it('rejects lists exceeding keyword count limit', () => {
    const keywords = Array.from({ length: 5001 }, (_, i) => `k${i}`);
    expect(validate({ ...minimal, rules: { keywords } })).toBe(false);
  });

  it('accepts lists/ornek-liste.json', () => {
    const ok = validate(exampleList);
    expect(validate.errors ?? []).toEqual([]);
    expect(ok).toBe(true);
  });

  it('rejects account with unknown platform', () => {
    const rules = { accounts: [{ platform: 'myspace', handle: 'a' }] };
    expect(validate({ ...minimal, rules })).toBe(false);
  });

  describe('keyword match types', () => {
    const withKeywords = (keywords: unknown[]) => ({ ...minimal, rules: { keywords } });

    it('accepts plain strings and objects with word/prefix match', () => {
      const list = withKeywords([
        'spoiler',
        { text: 'siyasetçi', match: 'prefix' },
        { text: 'ali', match: 'word' },
        { text: 'derbi' },
      ]);
      expect(validate(list)).toBe(true);
    });

    it('rejects unknown match type', () => {
      expect(validate(withKeywords([{ text: 'a', match: 'regex' }]))).toBe(false);
    });

    it('rejects keyword object without text or with empty text', () => {
      expect(validate(withKeywords([{ match: 'prefix' }]))).toBe(false);
      expect(validate(withKeywords([{ text: '', match: 'prefix' }]))).toBe(false);
    });

    it('rejects unknown fields in keyword object', () => {
      expect(validate(withKeywords([{ text: 'a', flags: 'i' }]))).toBe(false);
    });
  });
});
