import type { Options } from '@wdio/types';
import path from 'path';

/**
 * WebdriverIO + wdio-obsidian-service config.
 *
 * Drives real Obsidian against `test-vault/` with the Crosswalker plugin loaded.
 * Spec discovery: `tests/e2e/**\/*.spec.ts`.
 *
 * Workflow:
 *   1. `onPrepare` builds the plugin (esbuild → test-vault/.obsidian/plugins/crosswalker/)
 *   2. wdio-obsidian-service downloads (or reuses) Obsidian into `.obsidian-cache/`
 *   3. Each spec opens Obsidian against test-vault, runs assertions
 *
 * Verify locally: `bun run e2e`
 *
 * Docs: https://github.com/jesse-r-s-hines/wdio-obsidian-service
 */
export const config: Options.Testrunner = {
  runner: 'local',
  framework: 'mocha',

  specs: ['./tests/e2e/**/*.spec.ts'],

  // One Obsidian instance at a time keeps the test vault deterministic
  maxInstances: 1,

  capabilities: [{
    browserName: 'obsidian',
    browserVersion: 'latest',
    'wdio:obsidianOptions': {
      installerVersion: 'earliest', // matches manifest.json minAppVersion
      vault: path.resolve('./test-vault'),
      plugins: ['.'],
    },
  }],

  services: ['obsidian'],
  reporters: ['obsidian'],

  // Where wdio-obsidian-service caches downloaded Obsidian builds
  cacheDir: path.resolve('.obsidian-cache'),

  mochaOpts: {
    ui: 'bdd',
    timeout: 60000,
  },

  logLevel: 'warn',

  onPrepare: async function () {
    const { execSync } = await import('child_process');
    console.log('Building plugin into test-vault…');
    execSync('bun run build', { stdio: 'inherit' });
  },

  afterTest: async function (_test: any, _context: any, { error }: any) {
    if (error) {
      const ts = Date.now();
      await browser.saveScreenshot(`./test-results/failure-${ts}.png`);
    }
  },
};
