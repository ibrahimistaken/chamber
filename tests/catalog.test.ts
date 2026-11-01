import { describe, expect, it, vi } from 'vitest';
import {
  buildCatalogFromDirectory,
  buildCatalogFromFiles,
  CatalogBuildError,
} from '../scripts/build-catalog';
import {
  CATALOG_REPO_RAW_BASE_URL,
  DEFAULT_CATALOG_URL,
  fetchCatalogIndex,
  filterCatalogEntries,
  resolveCatalogEntryUrl,
  validateCatalogIndex,
} from '../src/core/catalog';

describe('build-catalog & lists/ directory', () => {
  it('defines the single constant catalog URL on raw.githubusercontent.com/ibrahimistaken/chamber', () => {
    expect(CATALOG_REPO_RAW_BASE_URL).toBe(
      'https://raw.githubusercontent.com/ibrahimistaken/chamber/main',
    );
    expect(DEFAULT_CATALOG_URL).toBe(
      'https://raw.githubusercontent.com/ibrahimistaken/chamber/main/index.json',
    );
  });

  it('validates all JSON lists in lists/ and produces a complete catalog index', () => {
    const catalog = buildCatalogFromDirectory();

    expect(catalog.version).toBe(1);
    expect(catalog.lists.length).toBeGreaterThanOrEqual(7);

    const ids = catalog.lists.map((entry) => entry.id);
    expect(ids).toEqual(
      expect.arrayContaining([
        'ai-hype-kelimeler',
        'etkilesim-tuzagi-tr',
        'futbol-taraftar-polemik',
        'kripto-hype-kelimeler',
        'ornek-liste',
        'siyaset-tr-kelimeler',
        'spoiler-diziler',
      ]),
    );

    for (const entry of catalog.lists) {
      expect(entry.id).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
      expect(entry.name.length).toBeGreaterThan(0);
      expect(entry.description.length).toBeGreaterThan(0);
      expect(entry.author.length).toBeGreaterThan(0);
      expect(entry.version).toBeGreaterThanOrEqual(1);
      expect(entry.ruleCount).toBeGreaterThan(0);
      expect(entry.path).toBe(`lists/${entry.id}.json`);
      expect(entry.tags?.country).toMatch(/^[A-Z]{2}$/);
      expect(entry.tags?.lang).toMatch(/^[a-z]{2}$/);
      expect(entry.tags?.category?.length).toBeGreaterThan(0);
    }

    const validated = validateCatalogIndex(catalog);
    expect(validated.ok).toBe(true);
  });

  it('rejects colliding list ids with CatalogBuildError', () => {
    const fileA = {
      filePath: 'lists/ayni-id.json',
      content: JSON.stringify({
        id: 'ayni-id',
        name: 'Birinci Liste',
        author: 'chamber',
        version: 1,
        rules: { keywords: ['kelime'] },
      }),
    };
    const fileB = {
      filePath: 'alt/ayni-id.json',
      content: JSON.stringify({
        id: 'ayni-id',
        name: 'İkinci Liste',
        author: 'chamber',
        version: 1,
        rules: { keywords: ['baska'] },
      }),
    };

    expect(() => buildCatalogFromFiles([fileA, fileB])).toThrowError(CatalogBuildError);
    expect(() => buildCatalogFromFiles([fileA, fileB])).toThrowError(/Duplicate list id "ayni-id"/);
  });

  it('rejects a list when its id does not match its file name', () => {
    const mismatchedFile = {
      filePath: 'lists/dosya-adi.json',
      content: JSON.stringify({
        id: 'farkli-id',
        name: 'Farklı ID Listesi',
        author: 'chamber',
        version: 1,
        rules: { keywords: ['kelime'] },
      }),
    };

    expect(() => buildCatalogFromFiles([mismatchedFile])).toThrowError(CatalogBuildError);
    expect(() => buildCatalogFromFiles([mismatchedFile])).toThrowError(
      /File name "dosya-adi\.json" .* does not match list id "farkli-id"/,
    );
  });

  it('rejects catalog entries with external URLs, free-form url fields, or mismatched paths', () => {
    const baseEntry = {
      id: 'spoiler-diziler',
      name: 'Spoiler Filtresi',
      description: 'Açıklama',
      author: 'chamber',
      version: 1,
      ruleCount: 3,
      path: 'lists/spoiler-diziler.json',
    };

    // 1. External URL in `path`
    const externalUrlInPath = validateCatalogIndex({
      version: 1,
      lists: [{ ...baseEntry, path: 'https://evil.example.com/spoiler-diziler.json' }],
    });
    expect(externalUrlInPath.ok).toBe(false);

    // 2. Extra `url` field on catalog entry
    const extraUrlField = validateCatalogIndex({
      version: 1,
      lists: [
        {
          ...baseEntry,
          url: 'https://evil.example.com/spoiler-diziler.json',
        },
      ],
    });
    expect(extraUrlField.ok).toBe(false);

    // 3. Mismatched `path` (does not match `lists/<id>.json`)
    const mismatchedPath = validateCatalogIndex({
      version: 1,
      lists: [{ ...baseEntry, path: 'lists/baska-dosya.json' }],
    });
    expect(mismatchedPath.ok).toBe(false);

    // 4. resolveCatalogEntryUrl also throws on external URL or mismatched path
    expect(() =>
      resolveCatalogEntryUrl({
        id: 'spoiler-diziler',
        path: 'https://evil.example.com/spoiler-diziler.json',
      }),
    ).toThrowError(/does not match expected path/);

    expect(() =>
      resolveCatalogEntryUrl({
        id: 'spoiler-diziler',
        path: 'lists/baska.json',
      }),
    ).toThrowError(/does not match expected path/);
  });

  it('rejects invalid JSON, schema errors, and short prefix rules during catalog build', () => {
    expect(() =>
      buildCatalogFromFiles([{ filePath: 'lists/bozuk.json', content: '{ bozuk' }]),
    ).toThrowError(CatalogBuildError);

    expect(() =>
      buildCatalogFromFiles([
        {
          filePath: 'lists/eksik.json',
          content: JSON.stringify({ id: 'eksik', name: 'Eksik' }),
        },
      ]),
    ).toThrowError(CatalogBuildError);

    expect(() =>
      buildCatalogFromFiles([
        {
          filePath: 'lists/kisa-prefix.json',
          content: JSON.stringify({
            id: 'kisa-prefix',
            name: 'Kısa Prefix',
            author: 'chamber',
            version: 1,
            rules: { keywords: [{ text: 'ab c', match: 'prefix' }] },
          }),
        },
      ]),
    ).toThrowError(CatalogBuildError);
  });

  it('filters catalog entries by search query, category, and country tags', () => {
    const catalog = buildCatalogFromDirectory();

    const byCategory = filterCatalogEntries(catalog.lists, { category: 'siyaset' });
    expect(byCategory.map((e) => e.id)).toEqual(
      expect.arrayContaining(['culture-war-ragebait-en', 'siyaset-tr-kelimeler']),
    );

    const byCountry = filterCatalogEntries(catalog.lists, { country: 'US' });
    expect(byCountry.map((e) => e.id)).toEqual(
      expect.arrayContaining([
        'ai-hype-kelimeler',
        'brainrot-and-grindset-en',
        'culture-war-ragebait-en',
        'engagement-bait-en',
        'influencer-drama-en',
      ]),
    );

    const byQuery = filterCatalogEntries(catalog.lists, { query: 'kripto' });
    expect(byQuery.map((e) => e.id)).toEqual(['kripto-hype-kelimeler']);
  });

  it('fetches and validates index.json from DEFAULT_CATALOG_URL and resolves entry URLs from constant base', async () => {
    const catalog = buildCatalogFromDirectory();
    const fetchFn = vi.fn(
      async () =>
        new Response(JSON.stringify(catalog), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
    );

    const result = await fetchCatalogIndex({ fetchFn });

    expect(fetchFn).toHaveBeenCalledWith(
      'https://raw.githubusercontent.com/ibrahimistaken/chamber/main/index.json',
      expect.any(Object),
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.catalog.lists.length).toBe(catalog.lists.length);
      const entryUrl = resolveCatalogEntryUrl({
        id: 'spoiler-diziler',
        path: 'lists/spoiler-diziler.json',
      });
      expect(entryUrl).toBe(
        'https://raw.githubusercontent.com/ibrahimistaken/chamber/main/lists/spoiler-diziler.json',
      );
    }
  });
});
