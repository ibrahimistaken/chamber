// @vitest-environment happy-dom
import React, { act } from 'react';
import ReactDOM from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import App from '../entrypoints/popup/App';
import exampleList from '../lists/ornek-liste.json';
import { getActiveRules, setActiveRules, type StorageAreaLike } from '../src/storage/rules';

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

describe('Popup App ("Liste yükle")', () => {
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
    const form = container.querySelector('form') as HTMLFormElement;

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

  it('shows initial active rule count from storage', async () => {
    const storage = createMemoryStorage();
    await setActiveRules(
      [{ accounts: [{ platform: 'x', handle: 'hesap1' }], keywords: ['kelime1', 'kelime2'] }],
      'collapse',
      storage,
    );

    await act(async () => {
      root.render(<App storage={storage} />);
    });

    const summary = container.querySelector('[data-testid="active-rules-count"]');
    expect(summary?.textContent).toBe('Aktif kural: 3 (1 hesap, 2 kelime, 0 istisna)');
  });

  it('validates, compiles and saves a pasted list JSON and updates the rule count', async () => {
    const storage = createMemoryStorage();

    await act(async () => {
      root.render(<App storage={storage} />);
    });

    expect(container.querySelector('[data-testid="active-rules-count"]')?.textContent).toBe(
      'Aktif kural: 0 (0 hesap, 0 kelime, 0 istisna)',
    );

    await setTextareaAndSubmit(JSON.stringify(exampleList));

    expect(container.querySelector('[data-testid="list-error"]')).toBeNull();
    expect(container.querySelector('[data-testid="list-status"]')?.textContent).toBe(
      '"Örnek Liste" listesi yüklendi.',
    );
    expect(container.querySelector('[data-testid="active-rules-count"]')?.textContent).toBe(
      'Aktif kural: 5 (1 hesap, 3 kelime, 1 istisna)',
    );

    const saved = await getActiveRules(storage);
    expect(saved.rules.accounts.has('x:ornekhesap')).toBe(true);
    expect(saved.rules.keywords).toHaveLength(3);
    expect(saved.rules.exclude).toEqual(['spoiler yok']);
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
});

