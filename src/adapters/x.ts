/**
 * X (formerly Twitter) platform adapter.
 *
 * Known limitation: Long posts truncated behind a "Show more" button
 * (`[data-testid="tweet-text-show-more-link"]`) only expose their visible
 * prefix in the DOM until expanded by the user. We intentionally do not
 * auto-click or expand posts.
 */
import { hideItem } from '../core/hider';
import type { Adapter, HideMode } from './types';

export const SELECTORS = {
  item: 'article[data-testid="tweet"]',
  userName: '[data-testid="User-Name"]',
  socialContext: '[data-testid="socialContext"]',
  userAvatarPrefix: '[data-testid^="UserAvatar-Container-"]',
  profileLink: 'a[href^="/"]',
  tweetText: '[data-testid="tweetText"]',
} as const;

const X_HOSTS = new Set(['x.com', 'www.x.com', 'twitter.com', 'www.twitter.com', 'mobile.twitter.com']);

const HANDLE_PATTERN = /^[A-Za-z0-9_]{1,15}$/;

function extractHandleFromHref(href: string | null): string | null {
  if (!href || !href.startsWith('/')) return null;
  // Strip leading "/" and ignore paths with extra segments like "/user/status/123".
  const segment = href.slice(1).split(/[/?#]/)[0] ?? '';
  return HANDLE_PATTERN.test(segment) ? segment : null;
}

function extractHandleFromUserNameBlock(block: Element): string | null {
  // Primary: profile link inside [data-testid="User-Name"] (present on main tweets).
  for (const link of block.querySelectorAll<HTMLAnchorElement>(SELECTORS.profileLink)) {
    const handle = extractHandleFromHref(link.getAttribute('href'));
    if (handle) return handle;
  }

  // Fallback for quoted tweets where the entire card is a role="link" container
  // and the inner User-Name block has no <a> tag, only a "@handle" text span.
  for (const span of block.querySelectorAll('span')) {
    const text = span.textContent?.trim() ?? '';
    if (text.startsWith('@')) {
      const candidate = text.slice(1);
      if (HANDLE_PATTERN.test(candidate)) return candidate;
    }
  }

  return null;
}

function extractRepostAuthor(item: HTMLElement): string | null {
  const context = item.querySelector(SELECTORS.socialContext);
  const link = context?.closest(SELECTORS.profileLink);
  return link ? extractHandleFromHref(link.getAttribute('href')) : null;
}

/**
 * Collects all distinct handles involved in a tweet:
 * 1. Main tweet author (first `[data-testid="User-Name"]`)
 * 2. Quoted tweet author (second `[data-testid="User-Name"]`, if present)
 * 3. Reposting account (`[data-testid="socialContext"]` ancestor link, if present)
 */
export function getXAuthors(item: HTMLElement): string[] {
  const handles: string[] = [];
  const seen = new Set<string>();

  const add = (handle: string | null) => {
    if (!handle) return;
    const key = handle.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    handles.push(handle);
  };

  for (const block of item.querySelectorAll(SELECTORS.userName)) {
    add(extractHandleFromUserNameBlock(block));
  }

  add(extractRepostAuthor(item));

  return handles;
}

export const xAdapter: Adapter = {
  platform: 'x',

  matches(url: string): boolean {
    try {
      const parsed = new URL(url);
      return (parsed.protocol === 'https:' || parsed.protocol === 'http:') && X_HOSTS.has(parsed.hostname);
    } catch {
      return false;
    }
  },

  getItems(root: ParentNode): HTMLElement[] {
    return Array.from(root.querySelectorAll<HTMLElement>(SELECTORS.item));
  },

  getAuthor(item: HTMLElement): string | null {
    const firstBlock = item.querySelector(SELECTORS.userName);
    if (firstBlock) {
      const primary = extractHandleFromUserNameBlock(firstBlock);
      if (primary) return primary;
    }
    return extractRepostAuthor(item);
  },

  getAuthors(item: HTMLElement): string[] {
    return getXAuthors(item);
  },

  getText(item: HTMLElement): string {
    const nodes = item.querySelectorAll<HTMLElement>(SELECTORS.tweetText);
    if (nodes.length === 0) return '';
    return Array.from(nodes, (node) => node.textContent ?? '').join('\n');
  },

  hide(item: HTMLElement, mode: HideMode): void {
    hideItem(item, mode);
  },
};

