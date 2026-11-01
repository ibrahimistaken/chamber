import { defineConfig } from 'wxt';

// See https://wxt.dev/api/config.html
export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  // WXT defaults Firefox to MV2; the project targets MV3 on every browser.
  manifestVersion: 3,
  manifest: {
    name: 'Chamber',
    description: 'List-based, local-only content filter.',
    // No permissions yet: they are added only together with the feature that
    // needs them, so the extension never asks for more than it uses.
    permissions: [],
  },
});
