import { isLocale, type Locale } from '../core/i18n.ts';
import type { StorageAreaLike } from './rules.ts';

export const LOCALE_KEY = 'chamber:locale';

function getStorageArea(custom?: StorageAreaLike): StorageAreaLike {
  if (custom) return custom;
  if (typeof browser !== 'undefined' && browser.storage?.local) {
    return browser.storage.local;
  }
  throw new Error('browser.storage.local is not available in this environment');
}

/**
 * Reads the user's saved interface language. Returns undefined when nothing
 * (or an unsupported value) is stored.
 */
export async function getSavedLocale(storage?: StorageAreaLike): Promise<Locale | undefined> {
  const area = getStorageArea(storage);
  const raw = await area.get(LOCALE_KEY);
  const value = raw[LOCALE_KEY];
  return isLocale(value) ? value : undefined;
}

export async function saveLocale(locale: Locale, storage?: StorageAreaLike): Promise<void> {
  const area = getStorageArea(storage);
  await area.set({ [LOCALE_KEY]: locale });
}

