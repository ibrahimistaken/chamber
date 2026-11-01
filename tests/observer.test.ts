// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Adapter, HideMode } from '../src/adapters/types';
import {
  getProcessedSignature,
  getProcessedState,
  hideItem,
  PLACEHOLDER_ATTR,
  PROCESSED_ATTR,
} from '../src/core/hider';
import { compileRules, type ListRules } from '../src/core/matcher';
import {
  processItem,
  startLiveObserver,
  startObserver,
  type ObserverHandle,
} from '../src/core/observer';
import {
  ACTIVE_RULES_KEY,
  getActiveRules,
  setActiveRules,
  type StorageChangeListener,
  type StorageChanges,
} from '../src/storage/rules';

const SELECTORS = {
  item: 'article.post',
  author: '.author',
  text: '.body',
} as const;

function createFakeAdapter(counters?: {
  getTextCalls: Map<HTMLElement, number>;
  hideCalls: Map<HTMLElement, number>;
}): Adapter {
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
      if (counters) {
        counters.hideCalls.set(item, (counters.hideCalls.get(item) ?? 0) + 1);
      }
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

  it('scans existing items once on start, hides matches, and stores content signatures', () => {
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
    expect(getProcessedState(cleanPost)).toBe('checked');
    expect(getProcessedSignature(cleanPost)).toBeTruthy();

    expect(spoilerPost.style.display).toBe('none');
    expect(getProcessedState(spoilerPost)).toBe('hidden');
    expect(getProcessedSignature(spoilerPost)).toBeTruthy();

    expect(authorPost.style.display).toBe('none');
    expect(getProcessedState(authorPost)).toBe('hidden');
  });

  it('hides dynamically added nodes after the debounce window without re-processing existing items', async () => {
    const counters = {
      getTextCalls: new Map<HTMLElement, number>(),
      hideCalls: new Map<HTMLElement, number>(),
    };
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

    await Promise.resolve();
    expect(dynamicMatch.style.display).toBe('');

    vi.advanceTimersByTime(50);

    expect(dynamicMatch.style.display).toBe('none');
    expect(nestedMatch.style.display).toBe('none');
    expect(nestedClean.style.display).toBe('');
    expect(getProcessedState(nestedClean)).toBe('checked');

    // Existing item was not touched when sibling nodes were added.
    expect(counters.getTextCalls.get(existing)).toBe(1);
    expect(counters.getTextCalls.get(dynamicMatch)).toBe(1);
    expect(counters.getTextCalls.get(nestedMatch)).toBe(1);
  });

  it('does not re-hide or re-evaluate rules when an item is re-scanned with the same signature', async () => {
    const counters = {
      getTextCalls: new Map<HTMLElement, number>(),
      hideCalls: new Map<HTMLElement, number>(),
    };
    const post = createPostElement('@user1', 'Büyük spoiler');
    feed.appendChild(post);

    const adapter = createFakeAdapter(counters);
    const rules = compile({ keywords: ['spoiler'] });

    handle = startObserver({ adapter, rules, root: feed, debounceMs: 20 });
    expect(counters.hideCalls.get(post)).toBe(1);
    const initialAttr = post.getAttribute(PROCESSED_ATTR);

    // Append an unrelated non-text badge inside the post; author + body text are unchanged.
    const extra = document.createElement('span');
    extra.textContent = '12 beğeni';
    post.appendChild(extra);

    await Promise.resolve();
    vi.advanceTimersByTime(30);

    expect(counters.hideCalls.get(post)).toBe(1);
    expect(post.getAttribute(PROCESSED_ATTR)).toBe(initialAttr);
    expect(processItem(post, adapter, rules, 'collapse')).toBe(false);
  });

  it('reveals a collapsed item when "Göster" is clicked and never hides it again while content is unchanged', async () => {
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
    expect(getProcessedState(post)).toBe('revealed');
    expect(feed.querySelector(`[${PLACEHOLDER_ATTR}]`)).toBeNull();

    // Trigger mutations and another observer pass; revealed item must stay visible.
    const another = createPostElement('@user2', 'Başka bir spoiler');
    feed.appendChild(another);
    await Promise.resolve();
    vi.advanceTimersByTime(30);

    expect(post.style.display).toBe('');
    expect(another.style.display).toBe('none');
  });

  describe('DOM node recycling (in-place content replacement)', () => {
    it('unhides and removes placeholder when a hidden node is recycled for a clean post', async () => {
      const post = createPostElement('@user1', 'Çok büyük spoiler');
      feed.appendChild(post);

      const adapter = createFakeAdapter();
      const rules = compile({ keywords: ['spoiler'] });

      handle = startObserver({ adapter, rules, root: feed, debounceMs: 20 });
      expect(post.style.display).toBe('none');
      expect(feed.querySelectorAll(`[${PLACEHOLDER_ATTR}]`)).toHaveLength(1);
      const oldSig = getProcessedSignature(post);

      // Virtualized list reuses the same <article> element for a clean post.
      post.querySelector('.author')!.textContent = '@user2';
      post.querySelector('.body')!.textContent = 'Tamamen temiz bir gönderi';

      await Promise.resolve();
      vi.advanceTimersByTime(30);

      expect(post.style.display).toBe('');
      expect(feed.querySelector(`[${PLACEHOLDER_ATTR}]`)).toBeNull();
      expect(getProcessedState(post)).toBe('checked');
      expect(getProcessedSignature(post)).not.toBe(oldSig);
    });

    it('hides a previously clean node when recycled for a matching post', async () => {
      const post = createPostElement('@user1', 'Temiz başlangıç metni');
      feed.appendChild(post);

      const adapter = createFakeAdapter();
      const rules = compile({
        keywords: ['spoiler'],
        accounts: [{ platform: 'x', handle: 'yasakli' }],
      });

      handle = startObserver({ adapter, rules, root: feed, debounceMs: 20 });
      expect(post.style.display).toBe('');
      expect(getProcessedState(post)).toBe('checked');

      // Recycle the same DOM node with a blocked author.
      post.querySelector('.author')!.textContent = '@yasakli';
      post.querySelector('.body')!.textContent = 'Yeni içerik';

      await Promise.resolve();
      vi.advanceTimersByTime(30);

      expect(post.style.display).toBe('none');
      expect(getProcessedState(post)).toBe('hidden');
      expect(feed.querySelectorAll(`[${PLACEHOLDER_ATTR}]`)).toHaveLength(1);
    });

    it('re-evaluates and hides a user-revealed node if its content is later recycled', async () => {
      const post = createPostElement('@user1', 'İlk spoiler gönderisi');
      feed.appendChild(post);

      const adapter = createFakeAdapter();
      const rules = compile({ keywords: ['spoiler'] });

      handle = startObserver({ adapter, rules, root: feed, debounceMs: 20 });
      const showButton = feed.querySelector(`[${PLACEHOLDER_ATTR}] button`) as HTMLButtonElement;
      showButton.click();
      expect(post.style.display).toBe('');
      expect(getProcessedState(post)).toBe('revealed');

      // Recycle the same <article> for a different post that also matches.
      post.querySelector('.author')!.textContent = '@user99';
      post.querySelector('.body')!.textContent = 'Bambaşka bir spoiler gönderisi';

      await Promise.resolve();
      vi.advanceTimersByTime(30);

      expect(post.style.display).toBe('none');
      expect(getProcessedState(post)).toBe('hidden');
      expect(feed.querySelectorAll(`[${PLACEHOLDER_ATTR}]`)).toHaveLength(1);
    });
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
    const listeners = new Set<StorageChangeListener>();

    return {
      store,
      listeners,
      area: {
        async get(key: string) {
          return { [key]: store[key] };
        },
        async set(items: Record<string, unknown>) {
          const changes: StorageChanges = {};
          for (const [k, newValue] of Object.entries(items)) {
            changes[k] = { oldValue: store[k], newValue };
            store[k] = newValue;
          }
          for (const listener of listeners) {
            listener(changes, 'local');
          }
        },
      },
      events: {
        addListener(cb: StorageChangeListener) {
          listeners.add(cb);
        },
        removeListener(cb: StorageChangeListener) {
          listeners.delete(cb);
        },
      },
      emitRaw(changes: StorageChanges, areaName = 'local') {
        for (const listener of listeners) {
          listener(changes, areaName);
        }
      },
    };
  }

  it('returns empty rules and collapse mode when storage is empty', async () => {
    const { area } = createMemoryStorage();
    const result = await getActiveRules(area);

    expect(result.mode).toBe('collapse');
    expect(result.rules.keywords).toEqual([]);
    expect(result.rules.exclude).toEqual([]);
    expect(result.rules.accounts.size).toBe(0);
  });

  it('persists and restores compiled rules and mode via setActiveRules / getActiveRules', async () => {
    const { area } = createMemoryStorage();
    await setActiveRules(
      [
        {
          accounts: [{ platform: 'x', handle: '@Ornek' }],
          keywords: [{ text: 'siyasetçi', match: 'prefix' }, 'spoiler'],
          exclude: ['spoiler yok'],
        },
      ],
      'blur',
      area,
    );

    const loaded = await getActiveRules(area);
    expect(loaded.mode).toBe('blur');
    expect(loaded.rules.accounts.has('x:ornek')).toBe(true);
    expect(loaded.rules.keywords).toEqual([
      { text: 'siyasetci', match: 'prefix' },
      { text: 'spoiler', match: 'word' },
    ]);
    expect(loaded.rules.exclude).toEqual(['spoiler yok']);
  });

  describe('startLiveObserver (storage.onChanged integration)', () => {
    let feed: HTMLElement;
    let liveHandle: ObserverHandle | null = null;

    beforeEach(() => {
      vi.useFakeTimers();
      document.body.textContent = '';
      feed = document.createElement('main');
      document.body.appendChild(feed);
    });

    afterEach(() => {
      liveHandle?.stop();
      liveHandle = null;
      vi.useRealTimers();
    });

    it('unhides previously hidden items that no longer match and hides newly matching items on rule change', async () => {
      const { area, events } = createMemoryStorage();
      await setActiveRules([{ keywords: ['spoiler'] }], 'collapse', area);

      const postA = createPostElement('@user1', 'Büyük spoiler var');
      const postB = createPostElement('@user2', 'Harika futbol maçı');
      feed.append(postA, postB);

      const adapter = createFakeAdapter();
      liveHandle = await startLiveObserver({
        adapter,
        root: feed,
        storage: area,
        events,
      });

      expect(postA.style.display).toBe('none');
      expect(postB.style.display).toBe('');
      expect(feed.querySelectorAll(`[${PLACEHOLDER_ATTR}]`)).toHaveLength(1);

      // Update rules: 'spoiler' is removed, 'futbol' is added.
      await setActiveRules([{ keywords: ['futbol'] }], 'collapse', area);

      expect(postA.style.display).toBe('');
      expect(getProcessedState(postA)).toBe('checked');
      expect(postB.style.display).toBe('none');
      expect(getProcessedState(postB)).toBe('hidden');
      expect(feed.querySelectorAll(`[${PLACEHOLDER_ATTR}]`)).toHaveLength(1);
    });

    it('re-evaluates a user-revealed ("Göster") item when active rules change', async () => {
      const { area, events } = createMemoryStorage();
      await setActiveRules([{ keywords: ['spoiler'] }], 'collapse', area);

      const post = createPostElement('@user1', 'Spoiler ve futbol aynı gönderide');
      feed.appendChild(post);

      const adapter = createFakeAdapter();
      liveHandle = await startLiveObserver({
        adapter,
        root: feed,
        storage: area,
        events,
      });
      expect(post.style.display).toBe('none');

      // User clicks "Göster" to reveal the post.
      const showBtn = feed.querySelector(`[${PLACEHOLDER_ATTR}] button`) as HTMLButtonElement;
      showBtn.click();
      expect(post.style.display).toBe('');
      expect(getProcessedState(post)).toBe('revealed');

      // Rules change (still matches via 'futbol'); revealed state is reset and re-evaluated.
      await setActiveRules([{ keywords: ['futbol'] }], 'collapse', area);

      expect(post.style.display).toBe('none');
      expect(getProcessedState(post)).toBe('hidden');
      expect(feed.querySelectorAll(`[${PLACEHOLDER_ATTR}]`)).toHaveLength(1);
    });

    it('restores all hidden items and removes placeholders when rules are cleared', async () => {
      const { area, events, emitRaw } = createMemoryStorage();
      await setActiveRules([{ keywords: ['spoiler'] }], 'collapse', area);

      const post = createPostElement('@user1', 'Spoiler içerik');
      feed.appendChild(post);

      const adapter = createFakeAdapter();
      liveHandle = await startLiveObserver({
        adapter,
        root: feed,
        storage: area,
        events,
      });
      expect(post.style.display).toBe('none');
      expect(feed.querySelectorAll(`[${PLACEHOLDER_ATTR}]`)).toHaveLength(1);

      // Clear rules to empty list.
      await setActiveRules([], 'collapse', area);

      expect(post.style.display).toBe('');
      expect(getProcessedState(post)).toBe('checked');
      expect(feed.querySelector(`[${PLACEHOLDER_ATTR}]`)).toBeNull();

      // Also verify key removal (newValue: undefined).
      await setActiveRules([{ keywords: ['spoiler'] }], 'collapse', area);
      expect(post.style.display).toBe('none');
      emitRaw({ [ACTIVE_RULES_KEY]: { oldValue: {}, newValue: undefined } }, 'local');
      expect(post.style.display).toBe('');
      expect(feed.querySelector(`[${PLACEHOLDER_ATTR}]`)).toBeNull();
    });

    it('cancels the previous observer debounce timer and stops old rules from firing', async () => {
      const { area, events } = createMemoryStorage();
      await setActiveRules([{ keywords: ['eski'] }], 'collapse', area);

      const adapter = createFakeAdapter();
      liveHandle = await startLiveObserver({
        adapter,
        root: feed,
        debounceMs: 50,
        storage: area,
        events,
      });

      // Add a dynamic node matching the OLD rule, let MutationObserver queue it,
      // then switch rules BEFORE the 50ms debounce timer fires.
      const post = createPostElement('@user1', 'Bu eski kuralı içerir');
      feed.appendChild(post);
      await Promise.resolve();

      await setActiveRules([{ keywords: ['yeni'] }], 'collapse', area);

      // Advance past the old debounce window; the old observer must not hide `post`.
      vi.advanceTimersByTime(100);
      expect(post.style.display).toBe('');
      expect(getProcessedState(post)).toBe('checked');

      // Dynamic node matching the NEW rule is hidden by the new observer.
      const newPost = createPostElement('@user2', 'Bu yeni kuralı içerir');
      feed.appendChild(newPost);
      await Promise.resolve();
      vi.advanceTimersByTime(60);
      expect(newPost.style.display).toBe('none');
    });

    it('ignores storage changes for unrelated keys or non-local storage areas', async () => {
      const counters = {
        getTextCalls: new Map<HTMLElement, number>(),
        hideCalls: new Map<HTMLElement, number>(),
      };
      const { area, events, emitRaw } = createMemoryStorage();
      await setActiveRules([{ keywords: ['spoiler'] }], 'collapse', area);

      const post = createPostElement('@user1', 'Temiz metin');
      feed.appendChild(post);

      const adapter = createFakeAdapter(counters);
      liveHandle = await startLiveObserver({
        adapter,
        root: feed,
        storage: area,
        events,
      });
      expect(counters.getTextCalls.get(post)).toBe(1);

      // Unrelated key in local storage.
      emitRaw({ 'other:key': { newValue: 123 } }, 'local');
      // Same key but in sync storage area.
      emitRaw({ [ACTIVE_RULES_KEY]: { newValue: undefined } }, 'sync');

      expect(counters.getTextCalls.get(post)).toBe(1);
    });
  });
});
