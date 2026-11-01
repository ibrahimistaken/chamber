import type { Adapter } from '../src/adapters/types';
import { startObserver } from '../src/core/observer';
import { getActiveRules } from '../src/storage/rules';

// Registered platform adapters; populated as each platform is implemented.
const ADAPTERS: readonly Adapter[] = [];

export default defineContentScript({
  // Empty until the first platform adapter is wired in.
  matches: [],
  async main() {
    const adapter = ADAPTERS.find((candidate) => candidate.matches(window.location.href));
    if (!adapter) return;

    const { rules, mode } = await getActiveRules();
    startObserver({ adapter, rules, mode });
  },
});
