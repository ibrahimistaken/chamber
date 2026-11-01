import { describe, expect, it } from 'vitest';
import {
  compileRules,
  containsPrefix,
  containsWord,
  matchAuthor,
  matchScoped,
  matchText,
  MIN_PREFIX_LENGTH,
  RuleValidationError,
  stripExcludes,
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

  describe('prefix minimum length', () => {
    const prefix = (text: string) => compile({ keywords: [{ text, match: 'prefix' }] });

    it(`exposes the limit as ${MIN_PREFIX_LENGTH}`, () => {
      expect(MIN_PREFIX_LENGTH).toBe(4);
    });

    it('rejects "ali" in prefix mode with a clear error', () => {
      expect(() => prefix('ali')).toThrow(RuleValidationError);
      expect(() => prefix('ali')).toThrow(
        'Prefix keyword "ali" is too short: its last word must be at least 4 ' +
          'characters after normalization ("ali" has 3). Use match "word" instead.',
      );
    });

    it('applies the limit to the last word, not the total length', () => {
      expect(() => prefix('ab c')).toThrow(
        'Prefix keyword "ab c" is too short: its last word must be at least 4 ' +
          'characters after normalization ("c" has 1). Use match "word" instead.',
      );
      expect(prefix('ab siyas').keywords).toEqual([{ text: 'ab siyas', match: 'prefix' }]);
      expect(prefix('siyasetçi').keywords).toEqual([{ text: 'siyasetci', match: 'prefix' }]);
    });

    it('splits words on punctuation like the matcher does', () => {
      expect(() => prefix('ab-c')).toThrow('("c" has 1)');
      expect(() => prefix("siyaset'çi")).toThrow('("ci" has 2)');
    });

    it('ignores trailing punctuation when finding the last word', () => {
      expect(prefix('siyas.').keywords).toEqual([{ text: 'siyas.', match: 'prefix' }]);
      expect(() => prefix('ab c!')).toThrow('("c" has 1)');
    });

    it('rejects a prefix keyword without any letters or digits', () => {
      expect(() => prefix('++++')).toThrow('("" has 0)');
    });

    it('accepts "siyas" and exactly 4 characters', () => {
      expect(prefix('siyas').keywords).toEqual([{ text: 'siyas', match: 'prefix' }]);
      expect(prefix('siya').keywords).toEqual([{ text: 'siya', match: 'prefix' }]);
    });

    it('checks length after normalization, not raw length', () => {
      // Raw lengths are >= 4, so these pass the JSON Schema check.
      expect(() => prefix(' ali ')).toThrow(RuleValidationError);
      expect(() => prefix('ali\u200B')).toThrow(RuleValidationError);
      expect(() => prefix('a\u0301li')).toThrow(RuleValidationError);
    });

    it('counts Turkish letters as single characters', () => {
      expect(prefix('İŞÇİ').keywords).toEqual([{ text: 'isci', match: 'prefix' }]);
      expect(() => prefix('İŞÇ')).toThrow(RuleValidationError);
    });

    it('does not limit word mode', () => {
      expect(compile({ keywords: ['ali', { text: 'ab', match: 'word' }] }).keywords).toHaveLength(2);
    });

    it('rejects even if the same text also exists as a word rule', () => {
      expect(() =>
        compileRules([{ keywords: ['ali'] }, { keywords: [{ text: 'ali', match: 'prefix' }] }]),
      ).toThrow(RuleValidationError);
    });
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

    it('prefix mode matches suffixes but never mid-word', () => {
      const prefix = compile({ keywords: [{ text: 'alış', match: 'prefix' }] });
      expect(matchText('alışveriş', prefix).matched).toBe(true);
      expect(matchText('kalış', prefix).matched).toBe(false);
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

  describe('exclude (removed from text before keyword search)', () => {
    const taylor = compile({ keywords: ['taylor'], exclude: ['taylor series'] });

    it('does not match when the keyword only occurs inside an exclude phrase', () => {
      expect(matchText('taylor series nedir', taylor)).toEqual({ matched: false });
    });

    it('still matches a keyword occurring outside the exclude phrase', () => {
      expect(matchText('taylor series ve taylor swift', taylor)).toEqual({
        matched: true,
        keyword: 'taylor',
      });
      expect(matchText('Taylor Swift ve Taylor Series', taylor).matched).toBe(true);
    });

    it('replaces the old "exclude wins" behavior', () => {
      const rules = compile({ keywords: ['spoiler'], exclude: ['spoiler yok'] });
      expect(matchText('Bu yazıda SPOILER YOK, rahat okuyun', rules)).toEqual({
        matched: false,
      });
      expect(matchText('Dikkat spoiler!', rules).matched).toBe(true);
      // Previously this was protected just because "spoiler yok" appeared.
      expect(matchText('Spoiler yok dedi ama spoiler verdi', rules).matched).toBe(true);
    });

    it('removes every occurrence of the same exclude phrase', () => {
      expect(matchText('taylor series, taylor series', taylor).matched).toBe(false);
      expect(matchText('taylor series, taylor series ve taylor', taylor).matched).toBe(true);
    });

    it('supports multiple exclude phrases', () => {
      const rules = compile({
        keywords: ['taylor'],
        exclude: ['taylor series', 'taylor polinomu'],
      });
      expect(matchText('taylor series ve taylor polinomu', rules).matched).toBe(false);
      expect(matchText('taylor series, taylor polinomu, taylor swift', rules).matched).toBe(true);
    });

    it('removes the longer of nested exclude phrases first', () => {
      // Listed short-first on purpose: removing "series" first would leave
      // "taylor" behind and produce a false match.
      const rules = compile({ keywords: ['taylor'], exclude: ['series', 'taylor series'] });
      expect(rules.exclude).toEqual(['taylor series', 'series']);
      expect(matchText('taylor series', rules).matched).toBe(false);
    });

    it('searches exclude phrases on word boundaries', () => {
      // "tay" must not be cut out of "taylor".
      const rules = compile({ keywords: ['taylor'], exclude: ['tay'] });
      expect(matchText('taylor swift', rules).matched).toBe(true);
      // "ali" must not be cut out of "kalite".
      const kalite = compile({ keywords: ['kalite'], exclude: ['ali'] });
      expect(matchText('kalite', kalite).matched).toBe(true);
      expect(matchText('kalite mac', compile({ keywords: ['mac'], exclude: ['ali'] })).matched).toBe(
        true,
      );
    });

    it('does not fuse the neighbours of a removed phrase into a new word', () => {
      // "+x+" has no word boundary requirement at its edges, so removing it
      // with "" would turn "tay+x+lor" into "taylor".
      const rules = compile({ keywords: ['taylor'], exclude: ['+x+'] });
      expect(matchText('tay+x+lor', rules).matched).toBe(false);
    });

    it('does not join the neighbours into a keyword phrase', () => {
      const rules = compile({ keywords: ['taylor swift'], exclude: ['series'] });
      expect(matchText('taylor series swift', rules).matched).toBe(false);
    });

    it('works on normalized text (Turkish case, accents)', () => {
      const rules = compile({ keywords: ['izmir'], exclude: ['İzmir derbisi'] });
      expect(matchText('IZMIR DERBISI yarın', rules).matched).toBe(false);
      expect(matchText('ızmır derbısı ve İzmir', rules).matched).toBe(true);
    });

    it('works together with prefix keywords', () => {
      const rules = compile({
        keywords: [{ text: 'siyasetçi', match: 'prefix' }],
        exclude: ['siyasetçilik'],
      });
      expect(matchText('Siyasetçilik dersi', rules).matched).toBe(false);
      expect(matchText('Siyasetçilik ve siyasetçiler', rules).matched).toBe(true);
    });
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

describe('stripExcludes', () => {
  it('replaces a removed phrase with a single space', () => {
    expect(stripExcludes('a taylor series b', ['taylor series'])).toBe('a   b');
  });

  it('removes every occurrence, including at the edges', () => {
    expect(stripExcludes('x a x', ['x'])).toBe('  a  ');
  });

  it('keeps a separator where the phrase had non-word edges', () => {
    expect(stripExcludes('tay+x+lor', ['+x+'])).toBe('tay lor');
  });

  it('leaves text untouched when nothing matches on word boundaries', () => {
    expect(stripExcludes('kalite', ['ali'])).toBe('kalite');
    expect(stripExcludes('metin', [])).toBe('metin');
  });
});

describe('matchAuthor', () => {
  it('is not affected by exclude rules', () => {
    const rules = compile({
      accounts: [{ platform: 'x', handle: 'taylor' }],
      exclude: ['taylor'],
    });
    expect(matchAuthor('x', 'taylor', rules)).toBe(true);
  });

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

describe('matchScoped', () => {
  const rules = compile({
    scoped: [
      {
        platform: 'x',
        handle: '@OrnekHesap',
        keywords: ['futbol', { text: 'siyasetçi', match: 'prefix' }, 'taylor'],
        exclude: ['taylor series'],
      },
    ],
  });

  it('matches when both author handle and keyword match', () => {
    expect(matchScoped('x', 'ornekhesap', 'Bugün futbol konuşalım', rules)).toEqual({
      matched: true,
      keyword: 'futbol',
    });
  });

  it('does not match when author matches but keyword is absent', () => {
    expect(matchScoped('x', 'ornekhesap', 'Bugün sinema konuşalım', rules)).toEqual({
      matched: false,
    });
  });

  it('does not match when keyword is present but author is different or on another platform', () => {
    expect(matchScoped('x', 'baskahesap', 'Bugün futbol konuşalım', rules)).toEqual({
      matched: false,
    });
    expect(matchScoped('youtube', 'ornekhesap', 'Bugün futbol konuşalım', rules)).toEqual({
      matched: false,
    });
  });

  it('is case-insensitive and ignores leading @ on the author handle', () => {
    expect(matchScoped('x', '@ORNEKHESAP', 'futbol maçı', rules).matched).toBe(true);
    expect(matchScoped('x', '  OrnekHesap ', 'futbol maçı', rules).matched).toBe(true);
  });

  it('supports prefix keywords inside scoped rules', () => {
    expect(matchScoped('x', 'ornekhesap', 'Siyasetçilerin açıklaması', rules)).toEqual({
      matched: true,
      keyword: 'siyasetci',
    });
  });

  it('strips scoped exclude phrases before checking scoped keywords', () => {
    expect(matchScoped('x', 'ornekhesap', 'taylor series nedir', rules)).toEqual({
      matched: false,
    });
    expect(
      matchScoped('x', 'ornekhesap', 'taylor series ve taylor swift', rules),
    ).toEqual({
      matched: true,
      keyword: 'taylor',
    });
  });

  it('merges and deduplicates scoped rules for the same account across lists', () => {
    const merged = compileRules([
      { scoped: [{ platform: 'x', handle: 'Ornek', keywords: ['kripto'] }] },
      { scoped: [{ platform: 'x', handle: '@ornek', keywords: ['KRİPTO', 'borsa'] }] },
    ]);
    expect(merged.scoped).toHaveLength(1);
    expect(merged.scoped[0]?.keywords).toEqual([
      { text: 'kripto', match: 'word' },
      { text: 'borsa', match: 'word' },
    ]);
  });

  it('enforces the last-word minimum length for prefix keywords in scoped rules', () => {
    expect(() =>
      compile({
        scoped: [
          {
            platform: 'x',
            handle: 'ornek',
            keywords: [{ text: 'ab c', match: 'prefix' }],
          },
        ],
      }),
    ).toThrow(RuleValidationError);
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

