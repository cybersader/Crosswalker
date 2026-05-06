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

  /**
   * v0.1.5 Tier 2: copy sqlite-vec-wasm-demo runtime artifacts into the
   * isolated test vault's plugin folder. obsidian-launcher only copies
   * main.js + manifest.json + styles.css (hardcoded list at
   * obsidian-launcher/dist/chunk-DSNG7BMO.js:1535-1538), so we have to
   * augment it for our extra runtime assets. Runs once after the
   * Obsidian instance has set up the temp vault but before any test.
   */
  before: async function () {
    const fs = await import('node:fs/promises');
    const pathMod = await import('node:path');
    const { existsSync } = await import('node:fs');

    // Get the test vault's plugin directory via the browser
    const pluginDir = await browser.executeObsidian(({ app }) => {
      const cfg = app.vault.configDir; // '.obsidian'
      // @ts-expect-error - adapter.basePath is internal but stable
      const basePath = app.vault.adapter.basePath as string;
      return `${basePath}/${cfg}/plugins/crosswalker`;
    });

    if (!existsSync(pluginDir)) {
      console.warn(`[wdio.before] plugin dir not found in test vault: ${pluginDir}`);
      return;
    }

    // Copy sqlite3.wasm + sqlite3.mjs from project root (where prod
    // build outputs them per esbuild.config.mjs) into the temp vault's
    // plugin dir. WASM-A path uses @sqlite.org/sqlite-wasm; both
    // artifacts loaded at runtime via the plugin folder.
    const sourceDir = path.resolve('.');
    const filesToCopy = ['sqlite3.wasm', 'sqlite3.mjs'];
    for (const f of filesToCopy) {
      const src = pathMod.join(sourceDir, f);
      const dst = pathMod.join(pluginDir, f);
      if (existsSync(src)) {
        await fs.copyFile(src, dst);
      } else {
        console.warn(`[wdio.before] source artifact missing: ${src}`);
      }
    }
    console.log(`[wdio.before] copied tier-2 artifacts into ${pluginDir}`);
  },

  afterTest: async function (_test: any, _context: any, { error }: any) {
    if (error) {
      const ts = Date.now();
      await browser.saveScreenshot(`./test-results/failure-${ts}.png`);
    }
  },
};
