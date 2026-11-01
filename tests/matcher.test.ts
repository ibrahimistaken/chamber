import { describe, expect, it } from 'vitest';
import {
  compileRules,
  containsPrefix,
  containsWord,
  matchAuthor,
  matchText,
  type ListRules,
} from '../src/core/matcher';
import exampleList from '../lists/ornek-liste.json';

const compile = (rules: ListRules) => compileRules([rules]);

describe('containsWord', () => {
  it('matches a whole word', () => {
    expect(containsWord('ali geldi', 'ali')).toBe(true);
  });

  it('does not match inside another word', () => {
    expect(containsWord('kalite iyi', 'ali')).toBe(false);
    expect(containsWord('alim', 'ali')).toBe(false);
    expect(containsWord('vali', 'ali')).toBe(false);
  });

  it('matches at start, end and whole string', () => {
    expect(containsWord('ali', 'ali')).toBe(true);
    expect(containsWord('ali ve veli', 'ali')).toBe(true);
    expect(containsWord('veli ve ali', 'ali')).toBe(true);
  });

  it('treats punctuation and apostrophes as boundaries', () => {
    expect(containsWord("ali'nin kitabi", 'ali')).toBe(true);
    expect(containsWord('(ali)', 'ali')).toBe(true);
    expect(containsWord('#ali!', 'ali')).toBe(true);
  });

  it('finds a later valid occurrence after an invalid one', () => {
    expect(containsWord('kalite ali', 'ali')).toBe(true);
  });

  it('treats digits as word characters', () => {
    expect(containsWord('ali2', 'ali')).toBe(false);
    expect(containsWord('2024 finali', '2024')).toBe(true);
  });

  it('respects boundaries for non-Latin letters', () => {
    expect(containsWord('приветмир', 'мир')).toBe(false);
    expect(containsWord('привет мир', 'мир')).toBe(true);
  });

  it('only requires a boundary where the needle has a word character', () => {
    expect(containsWord('i love c++.', 'c++')).toBe(true);
    expect(containsWord('abc++', 'c++')).toBe(false);
  });

  it('matches multi-word phrases', () => {
    expect(containsWord('dun sezon finali vardi', 'sezon finali')).toBe(true);
    expect(containsWord('dun sezon finalistleri', 'sezon finali')).toBe(false);
  });

  it('returns false for empty needle', () => {
    expect(containsWord('anything', '')).toBe(false);
  });
});

describe('containsPrefix', () => {
  it('matches at the start of a longer word', () => {
    expect(containsPrefix('siyasetcilerin', 'siyasetci')).toBe(true);
    expect(containsPrefix('siyasetciler', 'siyasetci')).toBe(true);
  });

  it('still matches the exact word', () => {
    expect(containsPrefix('siyasetci', 'siyasetci')).toBe(true);
  });

  it('does not match in the middle or end of a word', () => {
    expect(containsPrefix('kalite', 'ali')).toBe(false);
    expect(containsPrefix('vali', 'ali')).toBe(false);
  });

  it('finds a later word-start occurrence', () => {
    expect(containsPrefix('kalite alinin', 'ali')).toBe(true);
  });

  it('applies to the last word of a phrase', () => {
    expect(containsPrefix('sezon finalini izledin mi', 'sezon finali')).toBe(true);
    expect(containsPrefix('kisezon finalini', 'sezon finali')).toBe(false);
  });
});

describe('compileRules', () => {
  it('normalizes and deduplicates keywords across lists', () => {
    const compiled = compileRules([
      { keywords: ['Sezon Finali', 'spoiler'] },
      { keywords: ['sezon  finali', 'SPOİLER'] },
    ]);
    expect(compiled.keywords).toEqual([
      { text: 'sezon finali', match: 'word' },
      { text: 'spoiler', match: 'word' },
    ]);
  });

  it('treats a bare string and an object without match as word mode', () => {
    const compiled = compile({ keywords: ['ali', { text: 'veli' }] });
    expect(compiled.keywords).toEqual([
      { text: 'ali', match: 'word' },
      { text: 'veli', match: 'word' },
    ]);
  });

  it('keeps only the prefix rule when the same text has both modes', () => {
    const expected = [{ text: 'siyasetci', match: 'prefix' }];
    expect(
      compileRules([
        { keywords: ['siyasetçi'] },
        { keywords: [{ text: 'SİYASETÇİ', match: 'prefix' }] },
      ]).keywords,
    ).toEqual(expected);
    expect(
      compileRules([
        { keywords: [{ text: 'siyasetçi', match: 'prefix' }] },
        { keywords: ['siyasetçi'] },
      ]).keywords,
    ).toEqual(expected);
  });

  it('drops object keywords that normalize to empty', () => {
    expect(compile({ keywords: [{ text: '\u200B', match: 'prefix' }] }).keywords).toEqual([]);
  });

  it('deduplicates exclude phrases and accounts', () => {
    const compiled = compileRules([
      { exclude: ['Spoiler yok'], accounts: [{ platform: 'x', handle: 'Ornek' }] },
      { exclude: ['spoiler YOK'], accounts: [{ platform: 'x', handle: '@ornek' }] },
    ]);
    expect(compiled.exclude).toEqual(['spoiler yok']);
    expect(compiled.accounts.size).toBe(1);
  });

  it('drops rules that normalize to empty strings', () => {
    const compiled = compile({ keywords: ['   ', '\u200B'], exclude: [' '] });
    expect(compiled.keywords).toEqual([]);
    expect(compiled.exclude).toEqual([]);
  });

  it('handles missing rule arrays and empty input', () => {
    expect(compileRules([{}]).keywords).toEqual([]);
    expect(compileRules([]).accounts.size).toBe(0);
  });
});

describe('matchText', () => {
  it('matches keywords on word boundaries only', () => {
    const rules = compile({ keywords: ['ali'] });
    expect(matchText('Ali geldi', rules)).toEqual({ matched: true, keyword: 'ali' });
    expect(matchText('Kalite önemli', rules)).toEqual({ matched: false });
  });

  describe('prefix mode (Turkish suffixes)', () => {
    const rules = compile({ keywords: [{ text: 'siyasetçi', match: 'prefix' }] });

    it('matches suffixed forms', () => {
      expect(matchText('Siyasetçilerin açıklaması', rules)).toEqual({
        matched: true,
        keyword: 'siyasetci',
      });
      expect(matchText('Bütün SİYASETÇİLER aynı', rules).matched).toBe(true);
      expect(matchText('siyasetçi', rules).matched).toBe(true);
    });

    it('matches suffixed forms written without Turkish characters', () => {
      expect(matchText('siyasetcilerin', rules).matched).toBe(true);
    });

    it('does not match when the keyword is not at a word start', () => {
      expect(matchText('eksiyasetçiler', rules).matched).toBe(false);
    });

    it('word mode does not match suffixed forms', () => {
      const word = compile({ keywords: ['siyasetçi'] });
      expect(matchText('siyasetçilerin', word).matched).toBe(false);
    });

    it('"ali" in word mode does not match "kalite" or "alinin"', () => {
      const word = compile({ keywords: [{ text: 'ali', match: 'word' }] });
      expect(matchText('kalite', word).matched).toBe(false);
      expect(matchText('alinin', word).matched).toBe(false);
    });

    it('"ali" in prefix mode matches "alinin" but still not "kalite"', () => {
      const prefix = compile({ keywords: [{ text: 'ali', match: 'prefix' }] });
      expect(matchText('alinin', prefix).matched).toBe(true);
      expect(matchText('kalite', prefix).matched).toBe(false);
    });
  });

  it('matches regardless of Turkish case and accents', () => {
    const rules = compile({ keywords: ['İzmir derbisi'] });
    expect(matchText('IZMIR DERBISI bu aksam', rules).matched).toBe(true);
    expect(matchText('izmir derbisi', rules).matched).toBe(true);
    expect(matchText('ızmır derbısı', rules).matched).toBe(true);
  });

  it('tolerates whitespace and invisible-character differences', () => {
    const rules = compile({ keywords: ['sezon finali'] });
    expect(matchText('sezon\n\n  finali', rules).matched).toBe(true);
    expect(matchText('sezon fi\u200Bnali', rules).matched).toBe(true);
  });

  it('evaluates exclude before keywords', () => {
    const rules = compile({ keywords: ['spoiler'], exclude: ['spoiler yok'] });
    expect(matchText('Bu yazıda SPOILER YOK, rahat okuyun', rules)).toEqual({
      matched: false,
      excludedBy: 'spoiler yok',
    });
    expect(matchText('Dikkat spoiler!', rules)).toEqual({
      matched: true,
      keyword: 'spoiler',
    });
  });

  it('applies word boundaries to exclude phrases too', () => {
    const rules = compile({ keywords: ['mac'], exclude: ['ali'] });
    expect(matchText('kalite mac', rules)).toEqual({ matched: true, keyword: 'mac' });
  });

  it('excludes when exclude matches even if keyword is absent', () => {
    const rules = compile({ keywords: ['spoiler'], exclude: ['reklam'] });
    expect(matchText('reklam', rules)).toEqual({ matched: false, excludedBy: 'reklam' });
  });

  it('returns no match for empty text or empty rules', () => {
    expect(matchText('', compile({ keywords: ['a'] }))).toEqual({ matched: false });
    expect(matchText('herhangi bir metin', compile({}))).toEqual({ matched: false });
  });

  it('does not treat keyword content as a pattern', () => {
    const rules = compile({ keywords: ['a.b'] });
    expect(matchText('axb', rules).matched).toBe(false);
    expect(matchText('a.b', rules).matched).toBe(true);
  });

  it('is pure: does not mutate compiled rules', () => {
    const rules = compile({ keywords: ['spoiler'], exclude: ['yok'] });
    const snapshot = JSON.stringify({ k: rules.keywords, e: rules.exclude });
    matchText('spoiler', rules);
    matchText('spoiler yok', rules);
    expect(JSON.stringify({ k: rules.keywords, e: rules.exclude })).toBe(snapshot);
  });
});

describe('matchAuthor', () => {
  const rules = compile({ accounts: [{ platform: 'x', handle: 'OrnekHesap' }] });

  it('matches handles case-insensitively and ignores a leading @', () => {
    expect(matchAuthor('x', 'ornekhesap', rules)).toBe(true);
    expect(matchAuthor('x', '@ORNEKHESAP', rules)).toBe(true);
  });

  it('requires the same platform', () => {
    expect(matchAuthor('youtube', 'ornekhesap', rules)).toBe(false);
  });

  it('does not match partial handles', () => {
    expect(matchAuthor('x', 'ornek', rules)).toBe(false);
    expect(matchAuthor('x', 'ornekhesap2', rules)).toBe(false);
  });

  it('is independent from keyword rules', () => {
    const kw = compile({ keywords: ['ornekhesap'] });
    expect(matchAuthor('x', 'ornekhesap', kw)).toBe(false);
  });
});

describe('example list', () => {
  const rules = compileRules([exampleList.rules as ListRules]);

  it('hides spoiler text but respects its exclude rule', () => {
    expect(matchText('Sezon finalini izlemeyen okumasın: SPOİLER', rules).matched).toBe(true);
    expect(matchText('Spoiler yok, gönül rahatlığıyla okuyun', rules).matched).toBe(false);
  });

  it('matches its account in author mode', () => {
    expect(matchAuthor('x', '@ornekhesap', rules)).toBe(true);
  });

  it('matches its prefix keyword with suffixes', () => {
    expect(matchText('Sezon finalini izledin mi?', rules)).toEqual({
      matched: true,
      keyword: 'sezon finali',
    });
  });
});

