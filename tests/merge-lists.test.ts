import { describe, expect, it } from 'vitest';
import {
  resolveAndCompileLists,
  type InstalledListRecord,
} from '../src/core/merge-lists';
import {
  getActiveRules,
  getInstalledLists,
  removeInstalledList,
  saveInstalledLists,
  setListEnabled,
  upsertInstalledList,
  type StorageAreaLike,
} from '../src/storage/rules';

function createMemoryStorage(): StorageAreaLike {
  const store: Record<string, unknown> = {};
  return {
    async get(key: string) {
      return { [key]: store[key] };
    },
    async set(items: Record<string, unknown>) {
      Object.assign(store, items);
    },
  };
}

function makeRawList(
  id: string,
  overrides: {
    name?: string;
    version?: number;
    mode?: 'collapse' | 'remove' | 'blur';
    includes?: string[];
    rules?: Record<string, unknown>;
  } = {},
) {
  return {
    id,
    name: overrides.name ?? `Liste ${id}`,
    author: 'chamber',
    version: overrides.version ?? 1,
    ...(overrides.mode ? { mode: overrides.mode } : {}),
    ...(overrides.includes ? { includes: overrides.includes } : {}),
    rules: overrides.rules ?? {},
  };
}

function makeRecord(
  id: string,
  raw: unknown,
  options: { enabled?: boolean; sourceUrl?: string; version?: number; updatedAt?: number } = {},
): InstalledListRecord {
  return {
    id,
    ...(options.sourceUrl ? { sourceUrl: options.sourceUrl } : {}),
    raw,
    version: options.version ?? 1,
    enabled: options.enabled ?? true,
    updatedAt: options.updatedAt ?? 1700000000000,
  };
}

describe('Installed lists storage & merge-lists', () => {
  it('merges rules from multiple enabled lists and deduplicates them', async () => {
    const storage = createMemoryStorage();

    await upsertInstalledList(
      {
        raw: makeRawList('liste-a', {
          rules: {
            accounts: [{ platform: 'x', handle: '@Hesap1' }],
            keywords: ['spoiler', 'derbi'],
            exclude: ['spoiler yok'],
          },
        }),
        sourceUrl: 'https://example.com/liste-a.json',
      },
      storage,
    );

    await upsertInstalledList(
      {
        raw: makeRawList('liste-b', {
          rules: {
            accounts: [
              { platform: 'x', handle: 'hesap1' },
              { platform: 'x', handle: 'hesap2' },
            ],
            keywords: ['SPOİLER', 'transfer'],
            scoped: [{ platform: 'x', handle: 'yorumcu', keywords: ['hakem'] }],
          },
        }),
      },
      storage,
    );

    const installed = await getInstalledLists(storage);
    expect(installed).toHaveLength(2);
    expect(installed[0]?.sourceUrl).toBe('https://example.com/liste-a.json');
    expect(installed[1]?.sourceUrl).toBeUndefined();

    const active = await getActiveRules(storage);
    expect([...active.rules.accounts]).toEqual(['x:hesap1', 'x:hesap2']);
    expect(active.rules.keywords.map((k) => k.text)).toEqual(['spoiler', 'derbi', 'transfer']);
    expect(active.rules.exclude).toEqual(['spoiler yok']);
    expect(active.rules.scoped).toHaveLength(1);
  });

  it('excludes disabled lists from compiled active rules and re-includes them when re-enabled', async () => {
    const storage = createMemoryStorage();

    await upsertInstalledList(
      { raw: makeRawList('liste-a', { rules: { keywords: ['kelime1'] } }) },
      storage,
    );
    await upsertInstalledList(
      { raw: makeRawList('liste-b', { rules: { keywords: ['kelime2'] } }) },
      storage,
    );

    await setListEnabled('liste-b', false, storage);
    let active = await getActiveRules(storage);
    expect(active.rules.keywords.map((k) => k.text)).toEqual(['kelime1']);

    await setListEnabled('liste-b', true, storage);
    active = await getActiveRules(storage);
    expect(active.rules.keywords.map((k) => k.text)).toEqual(['kelime1', 'kelime2']);

    await removeInstalledList('liste-a', storage);
    active = await getActiveRules(storage);
    expect(active.rules.keywords.map((k) => k.text)).toEqual(['kelime2']);
  });

  describe('includes resolution', () => {
    it('resolves direct and transitive includes across installed lists', () => {
      const base = makeRecord(
        'temel-liste',
        makeRawList('temel-liste', { rules: { keywords: ['temel'] } }),
        { enabled: false }, // Even if disabled standalone, an enabled parent that includes it pulls its rules in.
      );
      const mid = makeRecord(
        'orta-liste',
        makeRawList('orta-liste', {
          includes: ['temel-liste'],
          rules: { keywords: ['orta'] },
        }),
        { enabled: false },
      );
      const top = makeRecord(
        'ust-liste',
        makeRawList('ust-liste', {
          includes: ['orta-liste'],
          rules: { keywords: ['ust'] },
        }),
        { enabled: true },
      );

      const merged = resolveAndCompileLists([base, mid, top]);
      expect(merged.rules.keywords.map((k) => k.text)).toEqual(['ust', 'orta', 'temel']);
      expect(merged.records.every((r) => r.error === undefined)).toBe(true);
    });

    it('detects and rejects circular includes (2-node and self-cycle) without breaking healthy lists', () => {
      const cycleA = makeRecord(
        'dongu-a',
        makeRawList('dongu-a', {
          includes: ['dongu-b'],
          rules: { keywords: ['kural-a'] },
        }),
      );
      const cycleB = makeRecord(
        'dongu-b',
        makeRawList('dongu-b', {
          includes: ['dongu-a'],
          rules: { keywords: ['kural-b'] },
        }),
      );
      const selfCycle = makeRecord(
        'kendi-dongusu',
        makeRawList('kendi-dongusu', {
          includes: ['kendi-dongusu'],
          rules: { keywords: ['kural-c'] },
        }),
      );
      const healthy = makeRecord(
        'saglam-liste',
        makeRawList('saglam-liste', {
          rules: { keywords: ['saglam'] },
        }),
      );

      const merged = resolveAndCompileLists([cycleA, cycleB, selfCycle, healthy]);

      const recA = merged.records.find((r) => r.id === 'dongu-a')!;
      const recB = merged.records.find((r) => r.id === 'dongu-b')!;
      const recSelf = merged.records.find((r) => r.id === 'kendi-dongusu')!;
      const recHealthy = merged.records.find((r) => r.id === 'saglam-liste')!;

      expect(recA.error).toContain('Circular includes reference detected: dongu-a -> dongu-b -> dongu-a');
      expect(recB.error).toContain('Circular includes reference detected: dongu-b -> dongu-a -> dongu-b');
      expect(recSelf.error).toContain(
        'Circular includes reference detected: kendi-dongusu -> kendi-dongusu',
      );
      expect(recHealthy.error).toBeUndefined();

      // Only the healthy list's rules are compiled.
      expect(merged.rules.keywords.map((k) => k.text)).toEqual(['saglam']);
    });

    it('rejects a newly upserted list that creates a circular reference', async () => {
      const storage = createMemoryStorage();
      await upsertInstalledList(
        {
          raw: makeRawList('liste-1', {
            includes: ['liste-2'],
            rules: { keywords: ['bir'] },
          }),
        },
        storage,
      );

      const badUpsert = await upsertInstalledList(
        {
          raw: makeRawList('liste-2', {
            includes: ['liste-1'],
            rules: { keywords: ['iki'] },
          }),
        },
        storage,
      );

      expect(badUpsert.ok).toBe(false);
      if (!badUpsert.ok) {
        expect(badUpsert.error).toContain('Circular includes reference detected');
      }

      // liste-1 remains intact and active.
      const active = await getActiveRules(storage);
      expect(active.rules.keywords.map((k) => k.text)).toEqual(['bir']);
    });

    it('keeps a list working and records a warning when an included list id is not installed', () => {
      const listWithMissingInclude = makeRecord(
        'ana-liste',
        makeRawList('ana-liste', {
          includes: ['olmayan-liste'],
          rules: { keywords: ['anahtar'] },
        }),
      );

      const merged = resolveAndCompileLists([listWithMissingInclude]);
      const rec = merged.records[0]!;

      expect(rec.error).toBeUndefined();
      expect(rec.warnings).toEqual(['Missing included list "olmayan-liste".']);
      expect(merged.rules.keywords.map((k) => k.text)).toEqual(['anahtar']);
    });
  });

  describe('fault isolation', () => {
    it('skips lists with schema or compileRules errors and records their error messages without breaking other lists', async () => {
      const storage = createMemoryStorage();

      const valid1 = makeRecord(
        'gecerli-1',
        makeRawList('gecerli-1', { rules: { keywords: ['elma'] } }),
      );
      const brokenSchema = makeRecord('bozuk-sema', {
        id: 'bozuk-sema',
        name: 'Eksik Alanlı',
        // missing author & version
        rules: { keywords: ['armut'] },
      });
      const brokenPrefix = makeRecord(
        'bozuk-prefix',
        makeRawList('bozuk-prefix', {
          rules: { keywords: [{ text: 'ab c', match: 'prefix' }] },
        }),
      );
      const valid2 = makeRecord(
        'gecerli-2',
        makeRawList('gecerli-2', { rules: { keywords: ['kiraz'] } }),
      );

      const merged = await saveInstalledLists(
        [valid1, brokenSchema, brokenPrefix, valid2],
        storage,
      );

      expect(merged.records.find((r) => r.id === 'gecerli-1')?.error).toBeUndefined();
      expect(merged.records.find((r) => r.id === 'gecerli-2')?.error).toBeUndefined();

      const schemaErrRec = merged.records.find((r) => r.id === 'bozuk-sema')!;
      expect(schemaErrRec.error).toContain('missing required field "author"');

      const prefixErrRec = merged.records.find((r) => r.id === 'bozuk-prefix')!;
      expect(prefixErrRec.error).toContain('its last word must be at least 4 characters');

      // Healthy lists still compiled and stored into activeRules.
      const active = await getActiveRules(storage);
      expect(active.rules.keywords.map((k) => k.text)).toEqual(['elma', 'kiraz']);
    });
  });
});

