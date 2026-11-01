// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from 'vitest';
import {
  hideItem,
  isProcessed,
  markProcessed,
  PLACEHOLDER_ATTR,
  PROCESSED_ATTR,
} from '../src/core/hider';

describe('hider', () => {
  let container: HTMLElement;
  let item: HTMLElement;

  beforeEach(() => {
    document.body.textContent = '';
    container = document.createElement('div');
    item = document.createElement('article');
    item.textContent = 'Gizlenecek içerik';
    container.appendChild(item);
    document.body.appendChild(container);
  });

  it('tracks processed state via data-chamber-processed attribute', () => {
    expect(isProcessed(item)).toBe(false);
    markProcessed(item);
    expect(isProcessed(item)).toBe(true);
    expect(item.getAttribute(PROCESSED_ATTR)).toBe('checked');
  });

  describe('collapse mode (default)', () => {
    it('hides the item and inserts a placeholder box with a show button', () => {
      hideItem(item, 'collapse');

      expect(item.style.display).toBe('none');
      expect(item.getAttribute(PROCESSED_ATTR)).toBe('hidden');

      const placeholder = container.querySelector(`[${PLACEHOLDER_ATTR}]`);
      expect(placeholder).not.toBeNull();
      expect(placeholder?.textContent).toContain('Gizlendi');

      const button = placeholder?.querySelector('button');
      expect(button?.textContent).toBe('Göster');
    });

    it('restores the item when show is clicked and prevents re-hiding', () => {
      hideItem(item, 'collapse');

      const button = container.querySelector(`[${PLACEHOLDER_ATTR}] button`) as HTMLButtonElement;
      button.click();

      expect(container.querySelector(`[${PLACEHOLDER_ATTR}]`)).toBeNull();
      expect(item.style.display).toBe('');
      expect(item.getAttribute(PROCESSED_ATTR)).toBe('revealed');

      // Calling hideItem again must not hide a revealed item.
      hideItem(item, 'collapse');
      expect(item.style.display).toBe('');
      expect(container.querySelector(`[${PLACEHOLDER_ATTR}]`)).toBeNull();
    });

    it('does not insert duplicate placeholders if called twice', () => {
      hideItem(item, 'collapse');
      hideItem(item, 'collapse');

      expect(container.querySelectorAll(`[${PLACEHOLDER_ATTR}]`)).toHaveLength(1);
    });

    it('supports English locale labels', () => {
      hideItem(item, 'collapse', 'en');

      const placeholder = container.querySelector(`[${PLACEHOLDER_ATTR}]`);
      expect(placeholder?.textContent).toContain('Hidden');
      expect(placeholder?.querySelector('button')?.textContent).toBe('Show');
    });
  });

  describe('remove mode', () => {
    it('removes the item from the DOM', () => {
      hideItem(item, 'remove');

      expect(container.contains(item)).toBe(false);
      expect(item.getAttribute(PROCESSED_ATTR)).toBe('hidden');
    });
  });

  describe('blur mode', () => {
    it('blurs the item and unblurs on click without re-blurring later', () => {
      hideItem(item, 'blur');

      expect(item.style.filter).toBe('blur(8px)');
      expect(item.getAttribute(PROCESSED_ATTR)).toBe('hidden');

      item.click();
      expect(item.style.filter).toBe('');
      expect(item.getAttribute(PROCESSED_ATTR)).toBe('revealed');

      hideItem(item, 'blur');
      expect(item.style.filter).toBe('');
    });
  });
});

