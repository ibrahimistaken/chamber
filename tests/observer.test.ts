// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Adapter, HideMode } from '../src/adapters/types';
import { hideItem, PLACEHOLDER_ATTR, PROCESSED_ATTR } from '../src/core/hider';
import { compileRules, type ListRules } from '../src/core/matcher';
import { startObserver, type ObserverHandle } from '../src/core/observer';
import { getActiveRules, setActiveRules } from '../src/storage/rules';

const SELECTORS = {
  item: 'article.post',
  author: '.author',
  text: '.body',
} as const;

function createFakeAdapter(counters?: { getTextCalls: Map<HTMLElement, number> }): Adapter {
  return {
    platform: 'x',
    matches: (url) => url.startsWith('https://example.test/'),
    getItems(root) {
      return Array.from(root.querySelectorAll<HTMLElement>(SELECTORS.item));
    },
    getAuthor(item) {
      return item.querySelector(SELECTORS.author)?.textContent?.trim() ?? null;
    },
    getText(item) {
      if (counters) {
        counters.getTextCalls.set(item, (counters.getTextCalls.get(item) ?? 0) + 1);
      }
      return item.querySelector(SELECTORS.text)?.textContent ?? '';
    },
    hide(item, mode) {
      hideItem(item, mode);
    },
  };
}

function createPostElement(author: string, text: string): HTMLElement {
  const article = document.createElement('article');
  article.className = 'post';

  const authorEl = document.createElement('span');
  authorEl.className = 'author';
  authorEl.textContent = author;

  const bodyEl = document.createElement('p');
  bodyEl.className = 'body';
  bodyEl.textContent = text;

  article.appendChild(authorEl);
  article.appendChild(bodyEl);
  return article;
}

describe('observer', () => {
  let feed: HTMLElement;
  let handle: ObserverHandle | null = null;

  beforeEach(() => {
    vi.useFakeTimers();
    document.body.textContent = '';
    feed = document.createElement('main');
    document.body.appendChild(feed);
  });

  afterEach(() => {
    handle?.stop();
    handle = null;
    vi.useRealTimers();
  });

  const compile = (rules: ListRules) => compileRules([rules]);

  it('scans existing items once on start and hides matches', () => {
    const cleanPost = createPostElement('@user1', 'Güzel bir gün');
    const spoilerPost = createPostElement('@user2', 'Dünkü bölümde büyük spoiler var');
    const authorPost = createPostElement('@engellihesap', 'Normal bir paylaşım');
    feed.append(cleanPost, spoilerPost, authorPost);

    const adapter = createFakeAdapter();
    const rules = compile({
      keywords: ['spoiler'],
      accounts: [{ platform: 'x', handle: 'engellihesap' }],
    });

    handle = startObserver({ adapter, rules, root: feed });

    expect(cleanPost.style.display).toBe('');
    expect(cleanPost.getAttribute(PROCESSED_ATTR)).toBe('checked');

    expect(spoilerPost.style.display).toBe('none');
    expect(spoilerPost.getAttribute(PROCESSED_ATTR)).toBe('hidden');

    expect(authorPost.style.display).toBe('none');
    expect(authorPost.getAttribute(PROCESSED_ATTR)).toBe('hidden');
  });

  it('hides dynamically added nodes after the debounce window without re-processing existing items', async () => {
    const counters = { getTextCalls: new Map<HTMLElement, number>() };
    const existing = createPostElement('@user1', 'Mevcut temiz gönderi');
    feed.appendChild(existing);

    const adapter = createFakeAdapter(counters);
    const rules = compile({ keywords: ['spoiler'] });

    handle = startObserver({ adapter, rules, root: feed, debounceMs: 40 });
    expect(counters.getTextCalls.get(existing)).toBe(1);

    // Append both a direct post and a wrapper containing multiple posts.
    const dynamicMatch = createPostElement('@user2', 'Yeni gelen spoiler içerik');
    const wrapper = document.createElement('section');
    const nestedClean = createPostElement('@user3', 'Temiz içerik');
    const nestedMatch = createPostElement('@user4', 'İçerideki spoiler');
    wrapper.append(nestedClean, nestedMatch);

    feed.append(dynamicMatch, wrapper);

    // Let MutationObserver microtasks run before advancing the debounce timer.
    await Promise.resolve();
    expect(dynamicMatch.style.display).toBe('');

    vi.advanceTimersByTime(50);

    expect(dynamicMatch.style.display).toBe('none');
    expect(nestedMatch.style.display).toBe('none');
    expect(nestedClean.style.display).toBe('');
    expect(nestedClean.getAttribute(PROCESSED_ATTR)).toBe('checked');

    // Existing item was not evaluated a second time.
    expect(counters.getTextCalls.get(existing)).toBe(1);
    expect(counters.getTextCalls.get(dynamicMatch)).toBe(1);
    expect(counters.getTextCalls.get(nestedMatch)).toBe(1);
  });

  it('does not process the same item twice even if mutated or re-scanned', async () => {
    const counters = { getTextCalls: new Map<HTMLElement, number>() };
    const post = createPostElement('@user1', 'Normal metin');
    feed.appendChild(post);

    const adapter = createFakeAdapter(counters);
    const rules = compile({ keywords: ['spoiler'] });

    handle = startObserver({ adapter, rules, root: feed, debounceMs: 20 });
    expect(counters.getTextCalls.get(post)).toBe(1);

    // Append a child inside the already-processed post.
    const extra = document.createElement('span');
    extra.textContent = 'ek';
    post.appendChild(extra);

    await Promise.resolve();
    vi.advanceTimersByTime(30);

    expect(counters.getTextCalls.get(post)).toBe(1);
  });

  it('reveals a collapsed item when "Göster" is clicked and never hides it again', async () => {
    const post = createPostElement('@user1', 'Büyük spoiler içerir');
    feed.appendChild(post);

    const adapter = createFakeAdapter();
    const rules = compile({ keywords: ['spoiler'] });

    handle = startObserver({ adapter, rules, root: feed, debounceMs: 20 });
    expect(post.style.display).toBe('none');

    const showButton = feed.querySelector(`[${PLACEHOLDER_ATTR}] button`) as HTMLButtonElement;
    expect(showButton).not.toBeNull();
    showButton.click();

    expect(post.style.display).toBe('');
    expect(post.getAttribute(PROCESSED_ATTR)).toBe('revealed');
    expect(feed.querySelector(`[${PLACEHOLDER_ATTR}]`)).toBeNull();

    // Trigger mutations and another observer pass; revealed item must stay visible.
    const another = createPostElement('@user2', 'Başka bir spoiler');
    feed.appendChild(another);
    await Promise.resolve();
    vi.advanceTimersByTime(30);

    expect(post.style.display).toBe('');
    expect(another.style.display).toBe('none');
  });

  it('respects the requested HideMode ("remove")', () => {
    const post = createPostElement('@user1', 'Silinecek spoiler');
    feed.appendChild(post);

    const adapter = createFakeAdapter();
    const rules = compile({ keywords: ['spoiler'] });

    handle = startObserver({ adapter, rules, mode: 'remove' as HideMode, root: feed });
    expect(feed.contains(post)).toBe(false);
  });
});

describe('storage/rules', () => {
  function createMemoryStorage() {
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

  it('returns empty rules and collapse mode when storage is empty', async () => {
    const storage = createMemoryStorage();
    const result = await getActiveRules(storage);

    expect(result.mode).toBe('collapse');
    expect(result.rules.keywords).toEqual([]);
    expect(result.rules.exclude).toEqual([]);
    expect(result.rules.accounts.size).toBe(0);
  });

  it('persists and restores compiled rules and mode via setActiveRules / getActiveRules', async () => {
    const storage = createMemoryStorage();
    await setActiveRules(
      [
        {
          accounts: [{ platform: 'x', handle: '@Ornek' }],
          keywords: [{ text: 'siyasetçi', match: 'prefix' }, 'spoiler'],
          exclude: ['spoiler yok'],
        },
      ],
      'blur',
      storage,
    );

    const loaded = await getActiveRules(storage);
    expect(loaded.mode).toBe('blur');
    expect(loaded.rules.accounts.has('x:ornek')).toBe(true);
    expect(loaded.rules.keywords).toEqual([
      { text: 'siyasetci', match: 'prefix' },
      { text: 'spoiler', match: 'word' },
    ]);
    expect(loaded.rules.exclude).toEqual(['spoiler yok']);
  });
});

