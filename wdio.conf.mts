import type { Options } from '@wdio/types';
import path from 'path';
import { killOrphanedTestProcesses } from './tests/e2e/helpers/process-hygiene';
import { wipeGeneratedOutput } from './tests/e2e/helpers/vault-hygiene';

/**
 * WebdriverIO + wdio-obsidian-service config.
 *
 * Drives real Obsidian against `test-vault/` with the Crosswalker plugin loaded.
 * Spec discovery: `tests/e2e/**\/*.spec.ts`.
 *
 * Workflow:
 *   1. `onPrepare` hardening (added 2026-07-11, see
 *      `tests/e2e/helpers/{process-hygiene,vault-hygiene}.ts`):
 *        a. kill orphaned obsidian/chromedriver/esbuild processes left by a
 *           prior crashed run (safe on a shared tree — only touches
 *           processes whose recorded parent is no longer alive)
 *        b. wipe known e2e generated-output folders (`GraphTest-*`,
 *           `GraphDemo`) from the SOURCE test-vault/ before it gets copied
 *           into the sandbox, so specs never accumulate a backlog the way
 *           `Frameworks/` did (3,553 notes from historical runs — see
 *           `scripts/e2e-clean.mjs` for that one-shot cleanup)
 *        c. build the root plugin distribution; wdio-obsidian-service copies
 *           `main.js`, `manifest.json`, and `styles.css` from `plugins: ['.']`
 *           into its isolated vault, with one retry if the esbuild-service
 *           `goroutine`/deadlock flake signature is detected in the build output
 *   2. wdio-obsidian-service downloads (or reuses) Obsidian into `.obsidian-cache/`
 *   3. Each spec opens Obsidian against test-vault, runs assertions
 *
 * Verify locally: `bun run e2e`
 *
 * Docs: https://github.com/jesse-r-s-hines/wdio-obsidian-service
 */

const REPO_ROOT = path.resolve('.');
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Build the plugin, retrying once if the esbuild-service deadlock flake
 *  signature ("goroutine ... deadlock" — a Go-runtime panic from esbuild's
 *  persistent build service) shows up in the output. On retry, first kills
 *  any esbuild-service process left orphaned by the failed attempt. */
async function buildPluginWithRetry(): Promise<void> {
	const { execSync } = await import('child_process');
	const attempt = (): { ok: boolean; output: string } => {
		try {
			const output = execSync('bun run build', { encoding: 'utf8', stdio: ['inherit', 'pipe', 'pipe'], timeout: 5 * 60_000 });
			process.stdout.write(output);
			return { ok: true, output };
		} catch (err: any) {
			const output = `${err.stdout ?? ''}${err.stderr ?? ''}${err.message ?? ''}`;
			process.stdout.write(output);
			return { ok: false, output };
		}
	};

	console.log('Building root plugin distribution for the isolated E2E vault…');
	let result = attempt();
	if (!result.ok && /goroutine|deadlock/i.test(result.output)) {
		console.warn('[wdio.onPrepare] detected esbuild-service deadlock signature in build output — killing orphaned esbuild processes and retrying build once');
		const killed = killOrphanedTestProcesses(REPO_ROOT);
		console.warn(`[wdio.onPrepare] killed ${killed.length} orphaned process(es) before retry: ${killed.map((p) => `pid=${p.pid}`).join(', ') || '(none found)'}`);
		await sleep(1000);
		result = attempt();
	}
	if (!result.ok) {
		throw new Error('Plugin build failed (after retry, if attempted). See build output above.');
	}
}
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
    // (a) process hygiene — kill orphaned obsidian/chromedriver/esbuild
    // processes from a previous crashed/force-killed run before we start.
    const orphans = killOrphanedTestProcesses(REPO_ROOT);
    if (orphans.length > 0) {
      console.warn(`[wdio.onPrepare] killed ${orphans.length} orphaned process(es) from a prior run:`);
      for (const o of orphans) {
        console.warn(`  pid=${o.pid} ppid=${o.ppid} cmd=${o.cmd.slice(0, 160)}`);
      }
    }

    // (b) vault hygiene — wipe known e2e generated-output folders from the
    // SOURCE vault before wdio-obsidian-service copies it into a sandbox.
    const vaultDir = path.resolve('./test-vault');
    const wipeResult = wipeGeneratedOutput(['GraphTest-*', 'GraphDemo'], vaultDir);
    if (wipeResult.matchedFolders.length > 0) {
      console.log(
        `[wdio.onPrepare] vault hygiene: matched folders [${wipeResult.matchedFolders.join(', ')}], ` +
          `deleted ${wipeResult.deletedFiles.length} generated note(s), skipped ${wipeResult.skippedNonGenerated.length} non-generated file(s)`
      );
    }

    // (c) build the plugin, with one retry on the esbuild deadlock flake.
    await buildPluginWithRetry();
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
