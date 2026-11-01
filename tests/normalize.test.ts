import { describe, expect, it } from 'vitest';
import { normalize } from '../src/core/normalize';

describe('normalize', () => {
  it('lowercases plain ASCII', () => {
    expect(normalize('Hello World')).toBe('hello world');
  });

  describe('Turkish i/I/İ/ı', () => {
    it('folds İ to i (not "i̇" with a combining dot)', () => {
      expect(normalize('İ')).toBe('i');
      expect(normalize('İSTANBUL')).toBe('istanbul');
      expect(normalize('İzmir')).toHaveLength(5);
    });

    it('folds I to i', () => {
      expect(normalize('IZMIR')).toBe('izmir');
    });

    it('folds ı to i', () => {
      expect(normalize('ılık')).toBe('ilik');
      expect(normalize('ISIK')).toBe(normalize('ışık'));
    });

    it('makes all spellings of a Turkish word equal', () => {
      const variants = ['Işıl', 'IŞIL', 'ışıl', 'isil', 'ISIL', 'İŞİL'];
      const normalized = new Set(variants.map(normalize));
      expect([...normalized]).toEqual(['isil']);
    });
  });

  describe('accents', () => {
    it('strips Turkish diacritics', () => {
      expect(normalize('çğöşü ÇĞÖŞÜ')).toBe('cgosu cgosu');
    });

    it('strips other Latin diacritics', () => {
      expect(normalize('Café Ñandú')).toBe('cafe nandu');
    });

    it('treats precomposed and decomposed forms the same', () => {
      expect(normalize('s\u0327')).toBe(normalize('ş'));
    });
  });

  describe('whitespace and invisible characters', () => {
    it('collapses runs of whitespace and trims', () => {
      expect(normalize('  sezon \t\n  finali  ')).toBe('sezon finali');
    });

    it('treats non-breaking space as a regular space', () => {
      expect(normalize('sezon\u00A0finali')).toBe('sezon finali');
    });

    it('removes zero-width characters and soft hyphens', () => {
      expect(normalize('spo\u200Biler')).toBe('spoiler');
      expect(normalize('spo\u00ADiler')).toBe('spoiler');
      expect(normalize('\uFEFFspoiler')).toBe('spoiler');
    });
  });

  it('folds compatibility characters (fullwidth)', () => {
    expect(normalize('ＳＰＯＩＬＥＲ')).toBe('spoiler');
  });

  it('keeps punctuation (word boundaries are decided by the matcher)', () => {
    expect(normalize("Ali'nin")).toBe("ali'nin");
  });

  it('returns empty string for empty or whitespace-only input', () => {
    expect(normalize('')).toBe('');
    expect(normalize(' \u200B ')).toBe('');
  });

  it('is idempotent', () => {
    const once = normalize('  İĞNE  Işık\u200B ');
    expect(normalize(once)).toBe(once);
  });
});

