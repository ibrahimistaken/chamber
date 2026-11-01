import type { HideMode } from '../adapters/types';
import { getMessages, type Locale } from './i18n';

export const PROCESSED_ATTR = 'data-chamber-processed';
export const PLACEHOLDER_ATTR = 'data-chamber-placeholder';

export type ProcessedState = 'checked' | 'hidden' | 'revealed';

export function isProcessed(item: Element): boolean {
  return item.hasAttribute(PROCESSED_ATTR);
}

export function markProcessed(item: Element, state: ProcessedState = 'checked'): void {
  item.setAttribute(PROCESSED_ATTR, state);
}

/**
 * Applies the requested hide mode to a matched DOM item.
 * Never uses innerHTML (CLAUDE.md invariant #3); all labels go through textContent.
 * If an item has already been revealed by the user, it will not be hidden again.
 */
export function hideItem(
  item: HTMLElement,
  mode: HideMode = 'collapse',
  locale: Locale = 'tr',
): void {
  const currentState = item.getAttribute(PROCESSED_ATTR);
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
      markProcessed(item, 'revealed');
      item.removeEventListener('click', onReveal);
    };
    item.addEventListener('click', onReveal);
    return;
  }

  // Default: 'collapse' mode — replace with a compact "Hidden · Show" box.
  const previousDisplay = item.style.display;
  item.style.display = 'none';

  const doc = item.ownerDocument;
  const placeholder = doc.createElement('div');
  placeholder.setAttribute(PLACEHOLDER_ATTR, 'true');

  const label = doc.createElement('span');
  label.textContent = `${messages.hiddenNotice} · `;

  const button = doc.createElement('button');
  button.type = 'button';
  button.textContent = messages.showButton;
  button.addEventListener('click', (event) => {
    event.stopPropagation();
    placeholder.remove();
    item.style.display = previousDisplay;
    markProcessed(item, 'revealed');
  });

  placeholder.appendChild(label);
  placeholder.appendChild(button);
  item.parentNode?.insertBefore(placeholder, item);
}

