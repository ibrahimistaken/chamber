import type { HideMode } from '../adapters/types';
import { getMessages, type Locale } from './i18n';

export const PROCESSED_ATTR = 'data-chamber-processed';
export const PLACEHOLDER_ATTR = 'data-chamber-placeholder';

export type ProcessedState = 'checked' | 'hidden' | 'revealed';

interface CleanupEntry {
  restore(): void;
}

// Tracks active hide cleanups per DOM element so recycled nodes can be reset
// cleanly when X replaces their content in-place during infinite scroll.
const activeCleanups = new WeakMap<HTMLElement, CleanupEntry>();

/**
 * Deterministic 32-bit FNV-1a hash used to fingerprint an item's author(s) + text.
 */
export function hashContent(input: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36);
}

function parseProcessedAttr(raw: string | null): {
  state: ProcessedState | null;
  signature: string | null;
} {
  if (!raw) return { state: null, signature: null };
  const colonIdx = raw.indexOf(':');
  if (colonIdx === -1) {
    return { state: raw as ProcessedState, signature: null };
  }
  return {
    state: raw.slice(0, colonIdx) as ProcessedState,
    signature: raw.slice(colonIdx + 1),
  };
}

export function getProcessedState(item: Element): ProcessedState | null {
  return parseProcessedAttr(item.getAttribute(PROCESSED_ATTR)).state;
}

export function getProcessedSignature(item: Element): string | null {
  return parseProcessedAttr(item.getAttribute(PROCESSED_ATTR)).signature;
}

export function isProcessed(item: Element, signature?: string): boolean {
  const parsed = parseProcessedAttr(item.getAttribute(PROCESSED_ATTR));
  if (parsed.state === null) return false;
  if (signature === undefined || parsed.signature === null) return true;
  return parsed.signature === signature;
}

export function markProcessed(
  item: Element,
  state: ProcessedState = 'checked',
  signature?: string,
): void {
  const existingSig = signature ?? getProcessedSignature(item);
  const value = existingSig ? `${state}:${existingSig}` : state;
  item.setAttribute(PROCESSED_ATTR, value);
}

/**
 * Clears any previous hide state (placeholder box, inline display/blur styles,
 * and processed marker) when a DOM node is recycled for a different post.
 */
export function resetItem(item: HTMLElement): void {
  const cleanup = activeCleanups.get(item);
  if (cleanup) {
    cleanup.restore();
    activeCleanups.delete(item);
  }
  item.removeAttribute(PROCESSED_ATTR);
}

/**
 * Resets every processed item and removes any leftover placeholder boxes under
 * `root` so the page can be freshly re-evaluated when active rules change.
 */
export function resetAllItems(root: ParentNode = document.body): void {
  for (const item of root.querySelectorAll<HTMLElement>(`[${PROCESSED_ATTR}]`)) {
    resetItem(item);
  }
  for (const placeholder of root.querySelectorAll(`[${PLACEHOLDER_ATTR}]`)) {
    placeholder.remove();
  }
}

/**
 * Applies the requested hide mode to a matched DOM item.
 * Never uses innerHTML (CLAUDE.md invariant #3); all labels go through textContent.
 * If an item has already been revealed by the user for the same content
 * signature, it will not be hidden again.
 */
export function hideItem(
  item: HTMLElement,
  mode: HideMode = 'collapse',
  locale: Locale = 'tr',
): void {
  const currentState = getProcessedState(item);
  if (currentState === 'revealed' || currentState === 'hidden') {
    return;
  }

  markProcessed(item, 'hidden');

  if (mode === 'remove') {
    item.remove();
    return;
  }

  const messages = getMessages(locale);

  if (mode === 'blur') {
    const previousFilter = item.style.filter;
    item.style.filter = 'blur(8px)';

    const onReveal = (event: Event) => {
      event.stopPropagation();
      item.style.filter = previousFilter;
      activeCleanups.delete(item);
      markProcessed(item, 'revealed');
      item.removeEventListener('click', onReveal);
    };
    item.addEventListener('click', onReveal);

    activeCleanups.set(item, {
      restore() {
        item.style.filter = previousFilter;
        item.removeEventListener('click', onReveal);
      },
    });
    return;
  }

  // Default: 'collapse' mode — replace with a compact "Hidden · Show" box.
  const previousDisplay = item.style.display;
  item.style.display = 'none';

  const doc = item.ownerDocument;
  const placeholder = doc.createElement('div');
  placeholder.setAttribute(PLACEHOLDER_ATTR, 'true');
  Object.assign(placeholder.style, {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '8px',
    paddingBlock: '8px',
    paddingInline: '12px',
    marginBlock: '4px',
    borderRadius: '10px',
    border: '1px solid rgba(128, 128, 128, 0.22)',
    backgroundColor: 'rgba(128, 128, 128, 0.06)',
    color: 'inherit',
    fontFamily:
      "'Inter', 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif",
    fontSize: '13px',
    lineHeight: '1.4',
  });

  const labelGroup = doc.createElement('span');
  Object.assign(labelGroup.style, {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '6px',
    opacity: '0.78',
    fontWeight: '500',
  });

  const svgNs = 'http://www.w3.org/2000/svg';
  const icon = doc.createElementNS(svgNs, 'svg');
  icon.setAttribute('width', '14');
  icon.setAttribute('height', '14');
  icon.setAttribute('viewBox', '0 0 16 16');
  icon.setAttribute('fill', 'none');
  icon.setAttribute('stroke', 'currentColor');
  icon.setAttribute('stroke-width', '1.75');
  icon.setAttribute('stroke-linecap', 'round');
  icon.setAttribute('stroke-linejoin', 'round');
  icon.setAttribute('aria-hidden', 'true');
  const shieldPath = doc.createElementNS(svgNs, 'path');
  shieldPath.setAttribute(
    'd',
    'M8 1.75L2.75 4v3.75c0 3.45 2.24 5.69 5.25 6.5 3.01-.81 5.25-3.05 5.25-6.5V4L8 1.75Z',
  );
  icon.appendChild(shieldPath);

  const label = doc.createElement('span');
  label.textContent = `${messages.hiddenNotice} · `;

  labelGroup.appendChild(icon);
  labelGroup.appendChild(label);

  const button = doc.createElement('button');
  button.type = 'button';
  button.textContent = messages.showButton;
  Object.assign(button.style, {
    minHeight: '26px',
    paddingBlock: '3px',
    paddingInline: '10px',
    borderRadius: '6px',
    border: '1px solid rgba(128, 128, 128, 0.3)',
    backgroundColor: 'transparent',
    color: 'inherit',
    fontFamily: 'inherit',
    fontSize: '12px',
    fontWeight: '600',
    lineHeight: '1.25',
    cursor: 'pointer',
  });
  button.addEventListener('click', (event) => {
    event.stopPropagation();
    placeholder.remove();
    item.style.display = previousDisplay;
    activeCleanups.delete(item);
    markProcessed(item, 'revealed');
  });

  placeholder.appendChild(labelGroup);
  placeholder.appendChild(button);
  item.parentNode?.insertBefore(placeholder, item);

  activeCleanups.set(item, {
    restore() {
      placeholder.remove();
      item.style.display = previousDisplay;
    },
  });
}
