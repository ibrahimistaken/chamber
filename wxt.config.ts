import { defineConfig } from 'wxt';

// See https://wxt.dev/api/config.html
export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  // WXT defaults Firefox to MV2; the project targets MV3 on every browser.
  manifestVersion: 3,
  manifest: {
    name: 'Chamber',
    description: 'List-based, local-only content filter.',
    // Only local storage and daily update alarms are used.
    // Default host access is limited to GitHub raw/gist URLs for list downloads;
    // any other HTTPS domain requires runtime user permission via optional_host_permissions.
    permissions: ['storage', 'alarms'],
    host_permissions: [
      'https://raw.githubusercontent.com/*',
      'https://gist.githubusercontent.com/*',
    ],
    optional_host_permissions: ['https://*/*'],
  },
});
