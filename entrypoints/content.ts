import type { Adapter } from '../src/adapters/types';
import { xAdapter } from '../src/adapters/x';
import { startLiveObserver } from '../src/core/observer';

const ADAPTERS: readonly Adapter[] = [xAdapter];

export default defineContentScript({
  matches: ['*://x.com/*', '*://*.x.com/*', '*://twitter.com/*', '*://*.twitter.com/*'],
  async main() {
    const adapter = ADAPTERS.find((candidate) => candidate.matches(window.location.href));
    if (!adapter) return;

    await startLiveObserver({ adapter });
  },
});
