import type { Adapter } from '../src/adapters/types';
import { xAdapter } from '../src/adapters/x';
import { startObserver } from '../src/core/observer';
import { getActiveRules } from '../src/storage/rules';

const ADAPTERS: readonly Adapter[] = [xAdapter];

export default defineContentScript({
  matches: ['*://x.com/*', '*://*.x.com/*', '*://twitter.com/*', '*://*.twitter.com/*'],
  async main() {
    const adapter = ADAPTERS.find((candidate) => candidate.matches(window.location.href));
    if (!adapter) return;

    const { rules, mode } = await getActiveRules();
    startObserver({ adapter, rules, mode });
  },
});
