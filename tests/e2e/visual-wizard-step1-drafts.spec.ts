/**
 * visual-wizard-step1-drafts.spec.ts — Phase 3.6 follow-up.
 *
 * Screenshots the wizard's Step 1 with the new always-visible drafts section
 * in two states: (1) empty (no drafts), (2) populated (one draft seeded).
 *
 * On-demand only; not part of routine CI. Run with:
 *   bun run e2e -- --spec tests/e2e/visual-wizard-step1-drafts.spec.ts
 */

import { browser } from '@wdio/globals';
import { mkdirSync } from 'node:fs';
import path from 'node:path';

const OUT_DIR = path.resolve('test-screenshots');

describe('Visual — wizard Step 1 drafts section', function () {
	this.timeout(120_000);

	before(() => {
		mkdirSync(OUT_DIR, { recursive: true });
	});

	it('opens the wizard and screenshots the empty-state drafts section', async () => {
		// Clean any existing drafts first
		await browser.executeObsidian(({ app }) => {
			// @ts-expect-error — internal commands API
			void app.commands.executeCommandById('crosswalker:clear-all-drafts');
		});
		await browser.pause(400);

		// Open the import wizard
		await browser.executeObsidian(({ app }) => {
			// @ts-expect-error — internal commands API
			app.commands.executeCommandById('crosswalker:import-structured-data');
		});

		await browser.pause(800);
		await browser.saveScreenshot(path.join(OUT_DIR, 'wizard-step1-drafts-empty.png'));
	});

	it('seeds a fake draft and screenshots the populated state', async () => {
		// Close the modal first
		await browser.keys(['Escape']);
		await browser.pause(300);

		// Seed a draft directly via the plugin handle
		await browser.executeObsidian(async ({ app }) => {
			// @ts-expect-error — plugin handle
			const plugin = app.plugins.plugins['crosswalker'];
			const fakeDraft = {
				schemaVersion: 1,
				id: 'draft_seeded_for_screenshot',
				name: 'NIST 800-53 import (Step 2)',
				createdAt: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
				updatedAt: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
				currentStep: 2,
				sourceFile: { name: 'sample-nist-controls.csv', vaultPath: null },
				sourceType: 'csv',
				selectedSheet: null,
				columnInfos: [],
				columnConfigsDict: {
					'Control Family': { useAs: 'hierarchy', outputKey: 'control_family' },
					'Control ID': { useAs: 'hierarchy', outputKey: 'control_id' },
					'Control Name': { useAs: 'frontmatter', outputKey: 'control_name' },
				},
				config: {},
				outputPath: 'Frameworks',
				overwriteMode: 'skip',
				frameworkId: 'nist-test',
				appliedConfigId: null,
			};
			await plugin.draftStore.save(fakeDraft);
		});

		// Open the wizard
		await browser.executeObsidian(({ app }) => {
			// @ts-expect-error — internal commands API
			app.commands.executeCommandById('crosswalker:import-structured-data');
		});

		await browser.pause(1200);
		await browser.saveScreenshot(path.join(OUT_DIR, 'wizard-step1-drafts-populated.png'));
	});

	it('cleans up the seeded draft + closes', async () => {
		await browser.keys(['Escape']);
		await browser.pause(300);
		await browser.executeObsidian(({ app }) => {
			// @ts-expect-error — internal commands API
			void app.commands.executeCommandById('crosswalker:clear-all-drafts');
		});
		await browser.pause(300);
	});
});
