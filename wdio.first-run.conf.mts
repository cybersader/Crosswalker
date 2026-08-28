import type { Options } from '@wdio/types';
import { copyFile, mkdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { config as baseConfig } from './wdio.conf.mts';

/**
 * First-run UX harness. Uses a vault fixture with no notes and no Crosswalker
 * data.json while preserving the shared E2E seed/config for every other spec.
 *
 * Run:
 *   DISPLAY=:0 bun x wdio run wdio.first-run.conf.mts
 */
const baseCapabilities = baseConfig.capabilities as WebdriverIO.Capabilities[];
const fixturePluginDir = path.resolve('./tests/e2e/first-run-vault/.obsidian/plugins/crosswalker');

export const config: Options.Testrunner = {
	...baseConfig,
	specs: ['./tests/e2e/first-run.spec.ts'],
	capabilities: baseCapabilities.map((capability) => ({
		...capability,
		'wdio:obsidianOptions': {
			...((capability as Record<string, unknown>)['wdio:obsidianOptions'] as Record<string, unknown>),
			vault: path.resolve('./tests/e2e/first-run-vault'),
		},
	})),
	// The shared harness copies sqlite assets in `before`, after Obsidian has
	// already loaded the plugin. A real release has those assets at startup. Put
	// them temporarily in this fixture after the shared build so the first frame
	// is release-faithful, then remove them when the run ends.
	onPrepare: async function (...args: unknown[]) {
		if (typeof baseConfig.onPrepare === 'function') {
			await (baseConfig.onPrepare as (...hookArgs: unknown[]) => Promise<void>).apply(this, args);
		}
		await mkdir(fixturePluginDir, { recursive: true });
		await copyFile(path.resolve('./sqlite3.wasm'), path.join(fixturePluginDir, 'sqlite3.wasm'));
		await copyFile(path.resolve('./sqlite3.mjs'), path.join(fixturePluginDir, 'sqlite3.mjs'));
	},
	onComplete: async function (...args: unknown[]) {
		await rm(path.resolve('./tests/e2e/first-run-vault/.obsidian/plugins'), { recursive: true, force: true });
		if (typeof baseConfig.onComplete === 'function') {
			await (baseConfig.onComplete as (...hookArgs: unknown[]) => Promise<void>).apply(this, args);
		}
	},
};
