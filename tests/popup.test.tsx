// @vitest-environment happy-dom
import React, { act } from 'react';
import ReactDOM from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from '../entrypoints/popup/App';
import exampleList from '../lists/ornek-liste.json';
import type { FetchLike } from '../src/core/remote-lists';
import {
  getActiveRules,
  getInstalledLists,
  saveInstalledLists,
  setActiveRules,
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

describe('Popup App (List Manager)', () => {
  let container: HTMLDivElement;
  let root: ReactDOM.Root;

  beforeEach(() => {
    (globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;
    document.body.textContent = '';
    container = document.createElement('div');
    document.body.appendChild(container);
    root = ReactDOM.createRoot(container);
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
  });

  async function setTextareaAndSubmit(value: string) {
    const textarea = container.querySelector(
      '[data-testid="list-json-input"]',
    ) as HTMLTextAreaElement;
    const form = container.querySelector('[data-testid="paste-json-form"]') as HTMLFormElement;

    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(
        window.HTMLTextAreaElement.prototype,
        'value',
      )?.set;
      setter?.call(textarea, value);
      textarea.dispatchEvent(new Event('input', { bubbles: true }));
    });

    await act(async () => {
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    });
  }

  async function setUrlAndSubmit(value: string) {
    const input = container.querySelector('[data-testid="list-url-input"]') as HTMLInputElement;
    const form = container.querySelector('[data-testid="add-url-form"]') as HTMLFormElement;

    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        'value',
      )?.set;
      setter?.call(input, value);
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });

    await act(async () => {
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    });
  }

  it('shows initial active rule count from storage and keeps JSON paste inside the Advanced section', async () => {
    const storage = createMemoryStorage();
    await setActiveRules(
      [
        {
          accounts: [{ platform: 'x', handle: 'hesap1' }],
          keywords: ['kelime1', 'kelime2'],
          scoped: [{ platform: 'x', handle: 'hesap2', keywords: ['konu'] }],
        },
      ],
      'collapse',
      storage,
    );

    await act(async () => {
      root.render(<App storage={storage} />);
    });

    const summary = container.querySelector('[data-testid="active-rules-count"]');
    expect(summary?.textContent).toBe(
      'Aktif kural: 4 (1 hesap, 2 kelime, 0 istisna, 1 hesaba bağlı kural)',
    );

    const advancedDetails = container.querySelector('[data-testid="advanced-section"]');
    expect(advancedDetails?.tagName).toBe('DETAILS');
    expect(advancedDetails?.querySelector('[data-testid="list-json-input"]')).not.toBeNull();
  });

  it('renders installed lists with name, rule count, version, last updated, and error state', async () => {
    const storage = createMemoryStorage();
    const fixedTime = new Date(2026, 10, 1, 13, 30).getTime();

    await saveInstalledLists(
      [
        {
          id: 'ornek-liste',
          raw: { ...exampleList, version: 2 },
          version: 2,
          enabled: true,
          updatedAt: fixedTime,
        },
        {
          id: 'bozuk-liste',
          raw: { id: 'bozuk-liste', name: 'Bozuk Liste' },
          version: 1,
          enabled: true,
          updatedAt: fixedTime,
        },
      ],
      storage,
    );

    await act(async () => {
      root.render(<App storage={storage} />);
    });

    expect(container.querySelector('[data-testid="list-name-ornek-liste"]')?.textContent).toBe(
      'Örnek Liste',
    );
    const metaText = container.querySelector('[data-testid="list-meta-ornek-liste"]')?.textContent;
    expect(metaText).toContain('5 kural');
    expect(metaText).toContain('v2');
    expect(metaText).toContain('2026-11-01 13:30');
    expect(container.querySelector('[data-testid="list-item-error-ornek-liste"]')).toBeNull();

    expect(container.querySelector('[data-testid="list-name-bozuk-liste"]')?.textContent).toBe(
      'Bozuk Liste',
    );
    const brokenError = container.querySelector('[data-testid="list-item-error-bozuk-liste"]');
    expect(brokenError).not.toBeNull();
    expect(brokenError?.textContent).toContain('Hata:');
  });

  it('toggles an installed list on/off and deletes a list, updating active rules count', async () => {
    const storage = createMemoryStorage();
    await saveInstalledLists(
      [
        {
          id: 'ornek-liste',
          raw: exampleList,
          version: 1,
          enabled: true,
          updatedAt: Date.now(),
        },
      ],
      storage,
    );

    await act(async () => {
      root.render(<App storage={storage} />);
    });

    expect(container.querySelector('[data-testid="active-rules-count"]')?.textContent).toBe(
      'Aktif kural: 5 (1 hesap, 3 kelime, 1 istisna, 0 hesaba bağlı kural)',
    );

    // Toggle off
    const toggle = container.querySelector(
      '[data-testid="toggle-list-ornek-liste"]',
    ) as HTMLInputElement;
    expect(toggle.checked).toBe(true);

    await act(async () => {
      toggle.click();
    });

    expect(toggle.checked).toBe(false);
    expect(container.querySelector('[data-testid="active-rules-count"]')?.textContent).toBe(
      'Aktif kural: 0 (0 hesap, 0 kelime, 0 istisna, 0 hesaba bağlı kural)',
    );

    // Toggle back on
    await act(async () => {
      toggle.click();
    });
    expect(toggle.checked).toBe(true);
    expect(container.querySelector('[data-testid="active-rules-count"]')?.textContent).toBe(
      'Aktif kural: 5 (1 hesap, 3 kelime, 1 istisna, 0 hesaba bağlı kural)',
    );

    // Delete list
    const deleteBtn = container.querySelector(
      '[data-testid="delete-list-ornek-liste"]',
    ) as HTMLButtonElement;
    await act(async () => {
      deleteBtn.click();
    });

    expect(container.querySelector('[data-testid="installed-list-ornek-liste"]')).toBeNull();
    expect(container.querySelector('[data-testid="no-installed-lists"]')?.textContent).toBe(
      'Henüz yüklü liste yok.',
    );
    expect(container.querySelector('[data-testid="active-rules-count"]')?.textContent).toBe(
      'Aktif kural: 0 (0 hesap, 0 kelime, 0 istisna, 0 hesaba bağlı kural)',
    );
  });

  it('adds a list from URL, showing loading status while downloading and error on failure', async () => {
    const storage = createMemoryStorage();
    let resolveFetch!: (res: Response) => void;
    const slowFetch: FetchLike = vi.fn(
      () =>
        new Promise<Response>((resolve) => {
          resolveFetch = resolve;
        }),
    );

    await act(async () => {
      root.render(<App storage={storage} fetchFn={slowFetch} />);
    });

    const input = container.querySelector('[data-testid="list-url-input"]') as HTMLInputElement;
    const form = container.querySelector('[data-testid="add-url-form"]') as HTMLFormElement;

    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        'value',
      )?.set;
      setter?.call(
        input,
        'https://raw.githubusercontent.com/ornek/repo/main/lists/ornek-liste.json',
      );
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });

    await act(async () => {
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    });

    // While download is in progress, loading status is shown and button is disabled
    expect(container.querySelector('[data-testid="list-status"]')?.textContent).toBe(
      'Liste indiriliyor...',
    );
    expect(
      (container.querySelector('[data-testid="add-url-button"]') as HTMLButtonElement).disabled,
    ).toBe(true);

    // Complete the download
    await act(async () => {
      resolveFetch(
        new Response(JSON.stringify(exampleList), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      );
    });

    expect(container.querySelector('[data-testid="list-status"]')?.textContent).toBe(
      '"Örnek Liste" listesi yüklendi.',
    );
    expect(container.querySelector('[data-testid="installed-list-ornek-liste"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="active-rules-count"]')?.textContent).toBe(
      'Aktif kural: 5 (1 hesap, 3 kelime, 1 istisna, 0 hesaba bağlı kural)',
    );

    // Now test error when adding a non-HTTPS URL
    await setUrlAndSubmit('http://raw.githubusercontent.com/ornek/liste.json');
    expect(container.querySelector('[data-testid="list-error"]')?.textContent).toContain('HTTPS');
  });

  it('validates, compiles and saves a pasted list JSON and updates the rule count', async () => {
    const storage = createMemoryStorage();

    await act(async () => {
      root.render(<App storage={storage} />);
    });

    expect(container.querySelector('[data-testid="active-rules-count"]')?.textContent).toBe(
      'Aktif kural: 0 (0 hesap, 0 kelime, 0 istisna, 0 hesaba bağlı kural)',
    );

    await setTextareaAndSubmit(JSON.stringify(exampleList));

    expect(container.querySelector('[data-testid="list-error"]')).toBeNull();
    expect(container.querySelector('[data-testid="list-status"]')?.textContent).toBe(
      '"Örnek Liste" listesi yüklendi.',
    );
    expect(container.querySelector('[data-testid="active-rules-count"]')?.textContent).toBe(
      'Aktif kural: 5 (1 hesap, 3 kelime, 1 istisna, 0 hesaba bağlı kural)',
    );

    const saved = await getActiveRules(storage);
    expect(saved.rules.accounts.has('x:ornekhesap')).toBe(true);
    expect(saved.rules.keywords).toHaveLength(3);
    expect(saved.rules.exclude).toEqual(['spoiler yok']);

    const installed = await getInstalledLists(storage);
    expect(installed).toHaveLength(1);
    expect(installed[0]?.id).toBe('ornek-liste');
    expect(installed[0]?.enabled).toBe(true);
    expect(installed[0]?.version).toBe(1);
    expect(installed[0]?.sourceUrl).toBeUndefined();
  });

  it('shows a clear error message when invalid JSON is pasted', async () => {
    const storage = createMemoryStorage();

    await act(async () => {
      root.render(<App storage={storage} />);
    });

    await setTextareaAndSubmit('{ bozuk json');

    const error = container.querySelector('[data-testid="list-error"]');
    expect(error?.textContent).toBe('Geçersiz JSON biçimi.');
    expect(container.querySelector('[data-testid="list-status"]')).toBeNull();
  });

  it('shows a clear schema validation error when required fields are missing or invalid', async () => {
    const storage = createMemoryStorage();

    await act(async () => {
      root.render(<App storage={storage} />);
    });

    await setTextareaAndSubmit(JSON.stringify({ id: 'ornek', name: 'Örnek' }));

    const error = container.querySelector('[data-testid="list-error"]');
    expect(error?.textContent).toContain('Şema doğrulama hatası:');
    expect(error?.textContent).toContain('author');
  });

  it('shows a clear error when compileRules rejects a short last-word prefix rule', async () => {
    const storage = createMemoryStorage();

    await act(async () => {
      root.render(<App storage={storage} />);
    });

    await setTextareaAndSubmit(
      JSON.stringify({
        id: 'kisa-prefix',
        name: 'Kısa Prefix',
        author: 'chamber',
        version: 1,
        rules: {
          keywords: [{ text: 'ab c', match: 'prefix' }],
        },
      }),
    );

    const error = container.querySelector('[data-testid="list-error"]');
    expect(error?.textContent).toContain('Şema doğrulama hatası:');
    expect(error?.textContent).toContain('its last word must be at least 4 characters');
  });

  it('loads the Catalog tab from index.json, filters by search/tags, marks installed lists, and installs via URL flow', async () => {
    const storage = createMemoryStorage();

    // Pre-install "ornek-liste" so it appears as "Kurulu" in the catalog
    await saveInstalledLists(
      [
        {
          id: 'ornek-liste',
          raw: exampleList,
          version: 1,
          enabled: true,
          updatedAt: Date.now(),
        },
      ],
      storage,
    );

    const spoilerList = {
      id: 'spoiler-diziler',
      name: 'Dizi ve Film Spoiler Filtresi',
      description: 'Spoiler paylaşımlarını gizler.',
      author: 'chamber',
      version: 1,
      tags: { country: 'TR', lang: 'tr', category: 'eglence' },
      rules: {
        keywords: ['spoiler', 'son sahne'],
      },
    };

    const catalogIndex = {
      version: 1 as const,
      lists: [
        {
          id: 'ornek-liste',
          name: 'Örnek Liste',
          description: 'Örnek açıklama',
          author: 'chamber',
          version: 1,
          tags: { country: 'TR', lang: 'tr', category: 'spoiler' },
          ruleCount: 5,
          path: 'lists/ornek-liste.json',
        },
        {
          id: 'spoiler-diziler',
          name: 'Dizi ve Film Spoiler Filtresi',
          description: 'Spoiler paylaşımlarını gizler.',
          author: 'chamber',
          version: 1,
          tags: { country: 'TR', lang: 'tr', category: 'eglence' },
          ruleCount: 2,
          path: 'lists/spoiler-diziler.json',
        },
        {
          id: 'ai-hype-kelimeler',
          name: 'AI Hype ve Clickbait Filtresi',
          description: 'Yapay zeka abartılarını gizler.',
          author: 'chamber',
          version: 1,
          tags: { country: 'US', lang: 'en', category: 'teknoloji' },
          ruleCount: 8,
          path: 'lists/ai-hype-kelimeler.json',
        },
      ],
    };

    const fetchFn: FetchLike = vi.fn(async (url: string) => {
      if (url === 'https://raw.githubusercontent.com/ibrahimistaken/chamber/main/index.json') {
        return new Response(JSON.stringify(catalogIndex), { status: 200 });
      }
      if (
        url ===
        'https://raw.githubusercontent.com/ibrahimistaken/chamber/main/lists/spoiler-diziler.json'
      ) {
        return new Response(JSON.stringify(spoilerList), { status: 200 });
      }
      return new Response('Not found', { status: 404 });
    });

    await act(async () => {
      root.render(<App storage={storage} fetchFn={fetchFn} />);
    });

    // Switch to the Catalog tab
    const catalogTabBtn = container.querySelector('[data-testid="tab-catalog"]') as HTMLButtonElement;
    await act(async () => {
      catalogTabBtn.click();
    });

    // Verify all 3 catalog items are rendered with name, description, tags, and rule count
    expect(container.querySelector('[data-testid="catalog-name-spoiler-diziler"]')?.textContent).toBe(
      'Dizi ve Film Spoiler Filtresi',
    );
    expect(container.querySelector('[data-testid="catalog-desc-spoiler-diziler"]')?.textContent).toBe(
      'Spoiler paylaşımlarını gizler.',
    );
    expect(container.querySelector('[data-testid="catalog-tags-spoiler-diziler"]')?.textContent).toBe(
      'TR · eglence',
    );
    expect(container.querySelector('[data-testid="catalog-rules-spoiler-diziler"]')?.textContent).toBe(
      '2 kural',
    );

    // "ornek-liste" is already installed -> shows "Kurulu" badge instead of "Kur" button
    expect(container.querySelector('[data-testid="catalog-installed-ornek-liste"]')?.textContent).toBe(
      'Kurulu',
    );
    expect(container.querySelector('[data-testid="catalog-install-ornek-liste"]')).toBeNull();

    // Filter by category "teknoloji"
    const categorySelect = container.querySelector(
      '[data-testid="catalog-category-filter"]',
    ) as HTMLSelectElement;
    await act(async () => {
      categorySelect.value = 'teknoloji';
      categorySelect.dispatchEvent(new Event('change', { bubbles: true }));
    });
    expect(container.querySelector('[data-testid="catalog-item-ai-hype-kelimeler"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="catalog-item-spoiler-diziler"]')).toBeNull();

    // Reset category filter and filter by search query
    await act(async () => {
      categorySelect.value = '';
      categorySelect.dispatchEvent(new Event('change', { bubbles: true }));
    });
    const searchInput = container.querySelector(
      '[data-testid="catalog-search-input"]',
    ) as HTMLInputElement;
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        'value',
      )?.set;
      setter?.call(searchInput, 'Dizi ve Film');
      searchInput.dispatchEvent(new Event('input', { bubbles: true }));
    });
    expect(container.querySelector('[data-testid="catalog-item-spoiler-diziler"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="catalog-item-ai-hype-kelimeler"]')).toBeNull();

    // Install "spoiler-diziler" from catalog using the "Kur" button
    const installBtn = container.querySelector(
      '[data-testid="catalog-install-spoiler-diziler"]',
    ) as HTMLButtonElement;
    await act(async () => {
      installBtn.click();
    });

    // Now "spoiler-diziler" should be marked as "Kurulu" and active rule count should increase
    expect(
      container.querySelector('[data-testid="catalog-installed-spoiler-diziler"]')?.textContent,
    ).toBe('Kurulu');
    expect(container.querySelector('[data-testid="active-rules-count"]')?.textContent).toBe(
      'Aktif kural: 6 (1 hesap, 4 kelime, 1 istisna, 0 hesaba bağlı kural)',
    );
  });
});
