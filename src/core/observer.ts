import type { Adapter, HideMode } from '../adapters/types';
import { isProcessed, markProcessed, PLACEHOLDER_ATTR } from './hider';
import { matchAuthor, matchText, type CompiledRules } from './matcher';

export interface ObserverOptions {
  readonly adapter: Adapter;
  readonly rules: CompiledRules;
  readonly mode?: HideMode;
  readonly root?: ParentNode & Node;
  readonly debounceMs?: number;
}

export interface ObserverHandle {
  stop(): void;
  flush(): void;
}

/**
 * Evaluates a single item once. Marked with data-chamber-processed so
 * subsequent scans or mutations never re-evaluate or re-hide it.
 */
export function processItem(
  item: HTMLElement,
  adapter: Adapter,
  rules: CompiledRules,
  mode: HideMode,
): boolean {
  if (isProcessed(item) || item.hasAttribute(PLACEHOLDER_ATTR)) {
    return false;
  }

  const author = adapter.getAuthor(item);
  const authorMatched =
    author !== null && author !== '' && matchAuthor(adapter.platform, author, rules);
  const textMatched = !authorMatched && matchText(adapter.getText(item), rules).matched;

  if (authorMatched || textMatched) {
    adapter.hide(item, mode);
    // Ensure the processed marker is always set even if a custom adapter.hide
    // implementation forgets to call hideItem.
    if (!isProcessed(item)) {
      markProcessed(item, 'hidden');
    }
    return true;
  }

  markProcessed(item, 'checked');
  return false;
}

/**
 * Collects candidate items from an added subtree without rescanning the page:
 * checks whether the added element itself is an item (via parent query or
 * direct traversal) and also queries inside the added element.
 */
function collectItemsFromSubtree(node: HTMLElement, adapter: Adapter): HTMLElement[] {
  if (node.hasAttribute(PLACEHOLDER_ATTR) || isProcessed(node)) {
    return [];
  }

  const inside = adapter.getItems(node);
  const insideSet = new Set(inside);

  // An added node may itself be the item element (e.g. an <article> appended
  // directly to a feed). Ask the parent scope and check if `node` is included.
  const parent = node.parentNode;
  if (parent && !insideSet.has(node)) {
    const siblings = adapter.getItems(parent);
    if (siblings.includes(node)) {
      return [node, ...inside];
    }
  }

  return inside;
}

/**
 * Scans existing items once, then observes only newly added DOM nodes with a
 * debounced batch flush (see CLAUDE.md Performance & Adapter rules).
 */
export function startObserver(options: ObserverOptions): ObserverHandle {
  const {
    adapter,
    rules,
    mode = 'collapse',
    root = document.body,
    debounceMs = 50,
  } = options;

  // Initial pass over existing items on the page.
  for (const item of adapter.getItems(root)) {
    processItem(item, adapter, rules, mode);
  }

  const pendingRoots = new Set<HTMLElement>();
  let timerId: ReturnType<typeof setTimeout> | null = null;

  const flush = () => {
    if (timerId !== null) {
      clearTimeout(timerId);
      timerId = null;
    }
    if (pendingRoots.size === 0) return;

    const batch = [...pendingRoots];
    pendingRoots.clear();

    for (const added of batch) {
      if (!added.isConnected) continue;
      for (const item of collectItemsFromSubtree(added, adapter)) {
        processItem(item, adapter, rules, mode);
      }
    }
  };

  const scheduleFlush = () => {
    if (timerId !== null) return;
    timerId = setTimeout(flush, debounceMs);
  };

  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      for (const added of mutation.addedNodes) {
        if (added instanceof HTMLElement && !added.hasAttribute(PLACEHOLDER_ATTR)) {
          pendingRoots.add(added);
        }
      }
    }
    if (pendingRoots.size > 0) {
      scheduleFlush();
    }
  });

  observer.observe(root, { childList: true, subtree: true });

  return {
    stop() {
      if (timerId !== null) {
        clearTimeout(timerId);
        timerId = null;
      }
      pendingRoots.clear();
      observer.disconnect();
    },
    flush,
  };
}

