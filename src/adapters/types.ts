import type { Platform } from '../core/matcher';

export type HideMode = 'collapse' | 'remove' | 'blur';

/**
 * Platform adapter contract (see CLAUDE.md).
 * Each platform lives in its own file with a single top-level SELECTORS object.
 */
export interface Adapter {
  readonly platform: Platform;
  matches(url: string): boolean;
  getItems(root: ParentNode): HTMLElement[];
  getAuthor(item: HTMLElement): string | null;
  getText(item: HTMLElement): string;
  hide(item: HTMLElement, mode: HideMode): void;
}

