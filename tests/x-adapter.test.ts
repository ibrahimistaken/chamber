// @vitest-environment happy-dom
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { getXAuthors, xAdapter } from '../src/adapters/x';
import { getProcessedState } from '../src/core/hider';
import { compileRules } from '../src/core/matcher';
import { processItem } from '../src/core/observer';

function loadFixture(name: 'normal.html' | 'repost.html' | 'quote.html'): HTMLElement {
  const html = readFileSync(resolve(__dirname, 'fixtures/x', name), 'utf-8');
  const wrapper = document.createElement('div');
  wrapper.innerHTML = html;
  return wrapper;
}

describe('xAdapter', () => {
  beforeEach(() => {
    document.body.textContent = '';
  });

  describe('matches(url)', () => {
    it.each([
      'https://x.com/home',
      'https://www.x.com/ornek_hesap_1/status/1',
      'https://twitter.com/explore',
      'https://mobile.twitter.com/home',
    ])('matches %s', (url) => {
      expect(xAdapter.matches(url)).toBe(true);
    });

    it.each([
      'https://youtube.com/watch?v=1',
      'https://notx.com/home',
      'https://x.com.evil.example/',
      'not-a-url',
    ])('rejects %s', (url) => {
      expect(xAdapter.matches(url)).toBe(false);
    });
  });

  describe('normal.html fixture', () => {
    it('extracts the single tweet item, author handle, and tweetText only', () => {
      const root = loadFixture('normal.html');
      const items = xAdapter.getItems(root);

      expect(items).toHaveLength(1);
      const item = items[0]!;

      expect(xAdapter.getAuthor(item)).toBe('ornek_hesap_1');
      expect(getXAuthors(item)).toEqual(['ornek_hesap_1']);

      const text = xAdapter.getText(item);
      expect(text).toContain('Bugün hava oldukça güzel ve sakin');
      expect(text).toContain('@ornek_etiket');
      expect(text).toContain('akşam saatlerinde hafif yağmur bekleniyor');
      // Must only read [data-testid="tweetText"], not UI chrome like "Show more" or "Translated from Spanish".
      expect(text).not.toContain('Show more');
      expect(text).not.toContain('Translated from');
      expect(text).not.toContain('Watch again');
    });
  });

  describe('repost.html fixture', () => {
    it('extracts both original author and reposting account', () => {
      const root = loadFixture('repost.html');
      const items = xAdapter.getItems(root);

      expect(items).toHaveLength(1);
      const item = items[0]!;

      expect(xAdapter.getAuthor(item)).toBe('ornek_hesap_2');
      expect(getXAuthors(item)).toEqual(['ornek_hesap_2', 'ornek_hesap_4']);

      const text = xAdapter.getText(item);
      expect(text).toContain('Kütüphaneye yeni kitaplar gelmiş');
      expect(text).not.toContain('You reposted');
      expect(text).not.toContain('Show more');
    });

    it('hides the repost when either the original author or the reposter is in the block list', () => {
      const root1 = loadFixture('repost.html');
      const item1 = xAdapter.getItems(root1)[0]!;
      const byOriginal = compileRules([
        { accounts: [{ platform: 'x', handle: 'ornek_hesap_2' }] },
      ]);
      expect(processItem(item1, xAdapter, byOriginal, 'collapse')).toBe(true);
      expect(getProcessedState(item1)).toBe('hidden');

      const root2 = loadFixture('repost.html');
      const item2 = xAdapter.getItems(root2)[0]!;
      const byReposter = compileRules([
        { accounts: [{ platform: 'x', handle: 'ornek_hesap_4' }] },
      ]);
      expect(processItem(item2, xAdapter, byReposter, 'collapse')).toBe(true);
      expect(getProcessedState(item2)).toBe('hidden');
    });
  });

  describe('quote.html fixture', () => {
    it('extracts both the quoting author and the quoted author (even without an <a> link)', () => {
      const root = loadFixture('quote.html');
      const items = xAdapter.getItems(root);

      expect(items).toHaveLength(1);
      const item = items[0]!;

      expect(xAdapter.getAuthor(item)).toBe('ornek_hesap_3');
      expect(getXAuthors(item)).toEqual(['ornek_hesap_3', 'ornek_hesap_5']);

      const text = xAdapter.getText(item);
      expect(text).toContain('Yeni duyuru paylaşıldı.');
      expect(text).toContain('Konferans programı açıklandı');
      expect(text).toContain('#OrnekEtiket');
      expect(text).not.toContain('Translated from');
    });

    it('hides the quote tweet when either the quoting or the quoted author is blocked', () => {
      const root1 = loadFixture('quote.html');
      const item1 = xAdapter.getItems(root1)[0]!;
      const byQuoter = compileRules([
        { accounts: [{ platform: 'x', handle: 'ornek_hesap_3' }] },
      ]);
      expect(processItem(item1, xAdapter, byQuoter, 'collapse')).toBe(true);

      const root2 = loadFixture('quote.html');
      const item2 = xAdapter.getItems(root2)[0]!;
      const byQuoted = compileRules([
        { accounts: [{ platform: 'x', handle: 'ornek_hesap_5' }] },
      ]);
      expect(processItem(item2, xAdapter, byQuoted, 'collapse')).toBe(true);
    });

    it('hides the quote tweet when a keyword matches inside the quoted text', () => {
      const root = loadFixture('quote.html');
      const item = xAdapter.getItems(root)[0]!;
      const byQuotedKeyword = compileRules([{ keywords: ['konferans'] }]);

      expect(processItem(item, xAdapter, byQuotedKeyword, 'collapse')).toBe(true);
      expect(getProcessedState(item)).toBe('hidden');
    });

    it('applies scoped rules only to primary getAuthor, not secondary repost/quote authors', () => {
      // Primary author of quote.html is ornek_hesap_3; quoted author is ornek_hesap_5.
      const rootMatch = loadFixture('quote.html');
      const itemMatch = xAdapter.getItems(rootMatch)[0]!;
      const scopedPrimary = compileRules([
        {
          scoped: [
            { platform: 'x', handle: '@ORNEK_HESAP_3', keywords: ['duyuru'] },
          ],
        },
      ]);
      expect(processItem(itemMatch, xAdapter, scopedPrimary, 'collapse')).toBe(true);
      expect(getProcessedState(itemMatch)).toBe('hidden');

      // When the primary author matches but the keyword is absent -> not hidden.
      const rootNoKeyword = loadFixture('quote.html');
      const itemNoKeyword = xAdapter.getItems(rootNoKeyword)[0]!;
      const scopedNoKeyword = compileRules([
        {
          scoped: [
            { platform: 'x', handle: 'ornek_hesap_3', keywords: ['olmayan_kelime'] },
          ],
        },
      ]);
      expect(processItem(itemNoKeyword, xAdapter, scopedNoKeyword, 'collapse')).toBe(false);
      expect(getProcessedState(itemNoKeyword)).toBe('checked');

      // Scoped rule targeting the quoted author (ornek_hesap_5) or reposter (ornek_hesap_4)
      // must NOT trigger because scoped uses getAuthor, not getAuthors.
      const rootQuoted = loadFixture('quote.html');
      const itemQuoted = xAdapter.getItems(rootQuoted)[0]!;
      const scopedSecondary = compileRules([
        {
          scoped: [
            { platform: 'x', handle: 'ornek_hesap_5', keywords: ['konferans'] },
          ],
        },
      ]);
      expect(processItem(itemQuoted, xAdapter, scopedSecondary, 'collapse')).toBe(false);

      const rootRepost = loadFixture('repost.html');
      const itemRepost = xAdapter.getItems(rootRepost)[0]!;
      const scopedReposter = compileRules([
        {
          scoped: [
            { platform: 'x', handle: 'ornek_hesap_4', keywords: ['kitaplar'] },
          ],
        },
      ]);
      expect(processItem(itemRepost, xAdapter, scopedReposter, 'collapse')).toBe(false);
    });
  });
});
