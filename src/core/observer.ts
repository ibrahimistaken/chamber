import type { Adapter, HideMode } from '../adapters/types';
import {
  getProcessedSignature,
  hashContent,
  isProcessed,
  markProcessed,
  PLACEHOLDER_ATTR,
  PROCESSED_ATTR,
  resetAllItems,
  resetItem,
} from './hider';
import { matchAuthor, matchScoped, matchText, type CompiledRules } from './matcher';
import {
  getActiveRules,
  onActiveRulesChanged,
  type StorageAreaLike,
  type StorageEventsLike,
} from '../storage/rules';

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

function getAuthorsForItem(item: HTMLElement, adapter: Adapter): string[] {
  if (adapter.getAuthors) {
    return adapter.getAuthors(item);
  }
  const single = adapter.getAuthor(item);
  return single !== null && single !== '' ? [single] : [];
}

export function computeItemSignature(item: HTMLElement, adapter: Adapter): string {
  const authors = getAuthorsForItem(item, adapter);
  const text = adapter.getText(item);
  return hashContent(`${authors.join(',')}::${text}`);
}

/**
 * Evaluates a single item. Binds `data-chamber-processed` to a content
 * signature (author(s) + text hash) so that:
 * - Unchanged items are never matched or hidden twice, and user-revealed
 *   items stay visible.
 * - Recycled DOM nodes (where X overwrites an existing <article> with a new
 *   post during infinite scroll) have their previous state reset and are
 *   re-evaluated for the new content.
 */
export function processItem(
  item: HTMLElement,
  adapter: Adapter,
  rules: CompiledRules,
  mode: HideMode,
): boolean {
  if (item.hasAttribute(PLACEHOLDER_ATTR)) {
    return false;
  }

  const authors = getAuthorsForItem(item, adapter);
  const text = adapter.getText(item);
  const signature = hashContent(`${authors.join(',')}::${text}`);

  if (item.hasAttribute(PROCESSED_ATTR)) {
    const previousSig = getProcessedSignature(item);
    if (previousSig === null || previousSig === signature) {
      return false;
    }
    // Signature changed: this DOM element was recycled for a different post.
    resetItem(item);
  }

  const authorMatched = authors.some((handle) => matchAuthor(adapter.platform, handle, rules));
  const textMatched = !authorMatched && matchText(text, rules).matched;
  const primaryAuthor = adapter.getAuthor(item);
  const scopedMatched =
    !authorMatched &&
    !textMatched &&
    primaryAuthor !== null &&
    primaryAuthor !== '' &&
    matchScoped(adapter.platform, primaryAuthor, text, rules).matched;

  if (authorMatched || textMatched || scopedMatched) {
    adapter.hide(item, mode);
    const state = isProcessed(item) ? 'hidden' : 'hidden';
    markProcessed(item, state, signature);
    return true;
  }

  markProcessed(item, 'checked', signature);
  return false;
}

/**
 * Collects candidate items affected by a mutation node without rescanning the
 * entire page:
 * - descendant items inside `node`
 * - `node` itself (if it is an item)
 * - an ancestor item containing `node` (when a virtualized list mutates the
 *   contents of an existing item in-place)
 */
function collectCandidateItems(
  node: HTMLElement,
  root: ParentNode & Node,
  adapter: Adapter,
): HTMLElement[] {
  if (node.hasAttribute(PLACEHOLDER_ATTR)) {
    return [];
  }

  const inside = adapter.getItems(node);
  const insideSet = new Set(inside);

  let current: HTMLElement | null = node;
  while (current && current !== root) {
    const parent: ParentNode | null = current.parentNode;
    if (parent && !insideSet.has(current)) {
      const parentItems = adapter.getItems(parent);
      if (parentItems.includes(current)) {
        return [current, ...inside];
      }
    }
    current = current.parentElement;
  }

  return inside;
}

/**
 * Scans existing items once, then observes newly added or in-place recycled
 * DOM nodes with a debounced batch flush (see CLAUDE.md Performance & Adapter rules).
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

  const pendingNodes = new Set<HTMLElement>();
  let timerId: ReturnType<typeof setTimeout> | null = null;

  const flush = () => {
    if (timerId !== null) {
      clearTimeout(timerId);
      timerId = null;
    }
    if (pendingNodes.size === 0) return;

    const batch = [...pendingNodes];
    pendingNodes.clear();

    const itemsToProcess = new Set<HTMLElement>();
    for (const node of batch) {
      if (!node.isConnected) continue;
      for (const item of collectCandidateItems(node, root, adapter)) {
        itemsToProcess.add(item);
      }
    }

    for (const item of itemsToProcess) {
      processItem(item, adapter, rules, mode);
    }
  };

  const scheduleFlush = () => {
    if (timerId !== null) return;
    timerId = setTimeout(flush, debounceMs);
  };

  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      if (mutation.type === 'characterData') {
        const parent = mutation.target.parentElement;
        if (parent && !parent.closest(`[${PLACEHOLDER_ATTR}]`)) {
          pendingNodes.add(parent);
        }
        continue;
      }

      for (const added of mutation.addedNodes) {
        if (added instanceof HTMLElement && !added.hasAttribute(PLACEHOLDER_ATTR)) {
          pendingNodes.add(added);
        } else if (added.nodeType === Node.TEXT_NODE && added.parentElement) {
          if (!added.parentElement.closest(`[${PLACEHOLDER_ATTR}]`)) {
            pendingNodes.add(added.parentElement);
          }
        }
      }
    }
    if (pendingNodes.size > 0) {
      scheduleFlush();
    }
  });

  observer.observe(root, { childList: true, subtree: true, characterData: true });

  return {
    stop() {
      if (timerId !== null) {
        clearTimeout(timerId);
        timerId = null;
      }
      pendingNodes.clear();
      observer.disconnect();
    },
    flush,
  };
}

export interface LiveObserverOptions {
  readonly adapter: Adapter;
  readonly root?: ParentNode & Node;
  readonly debounceMs?: number;
  readonly storage?: StorageAreaLike;
  readonly events?: StorageEventsLike;
}

/**
 * Starts the page observer with the current active rules and restarts it
 * whenever `chamber:activeRules` changes in storage:
 * 1. Stops the previous observer (disconnects MutationObserver and cancels any
 *    pending debounce timer).
 * 2. Resets all `data-chamber-processed` attributes, removes placeholder boxes,
 *    and restores hidden/blurred items.
 * 3. Re-scans the page from scratch with the new rules and starts a fresh observer.
 */
export async function startLiveObserver(
  options: LiveObserverOptions,
): Promise<ObserverHandle> {
  const { adapter, root = document.body, debounceMs, storage, events } = options;

  const initial = await getActiveRules(storage);
  let currentHandle = startObserver({
    adapter,
    rules: initial.rules,
    mode: initial.mode,
    root,
    debounceMs,
  });

  const unsubscribe = onActiveRulesChanged(({ rules, mode }) => {
    currentHandle.stop();
    resetAllItems(root);
    currentHandle = startObserver({
      adapter,
      rules,
      mode,
      root,
      debounceMs,
    });
  }, events);

  return {
    stop() {
      unsubscribe();
      currentHandle.stop();
    },
    flush() {
      currentHandle.flush();
    },
  };
}
