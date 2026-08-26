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
import { expect } from 'expect';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { clearAllDrafts, closeImportWizard, requireImportWizard } from './helpers/wizard-modal';

const OUT_DIR = path.resolve('test-screenshots');

describe('Visual — wizard Step 1 drafts section', function () {
	this.timeout(120_000);

	before(async () => {
		mkdirSync(OUT_DIR, { recursive: true });
		// Per-spec UI reset: no leftover wizard and no drafts another spec seeded.
		// Both states are asserted, not slept on.
		await closeImportWizard();
		const cleared = await clearAllDrafts();
		expect(cleared.cleared).toBe(true);
		// This spec is ABOUT the drafts section, and other visual specs turn
		// `enableDraftSessions` off for their own determinism. Own the setting
		// explicitly instead of inheriting whatever ran last, and restore it after.
		await browser.executeObsidian(async ({ app }) => {
			// @ts-expect-error — internal plugins API
			const plugin = app.plugins.plugins['crosswalker'];
			plugin.settings.enableDraftSessions = true;
			await plugin.saveSettings();
		});
	});

	afterEach(async () => {
		await closeImportWizard();
	});

	after(async () => {
		await closeImportWizard();
		await clearAllDrafts();
	});

	it('opens the wizard and screenshots the empty-state drafts section', async () => {
		// CONDITION: the draft store reports zero entries (the command is
		// fire-and-forget, so the old `pause(400)` could screenshot a stale list).
		const cleared = await clearAllDrafts();
		expect(cleared.cleared).toBe(true);

		// CONDITION: a visible wizard modal with its Step-1 file input rendered.
		await requireImportWizard();
		const state = await browser.executeObsidian(async () => {
			const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
			const modal = document.querySelector('.crosswalker-wizard-modal');
			// CONDITION: the always-visible drafts section has rendered.
			const deadline = Date.now() + 8000;
			while (!modal?.querySelector('.crosswalker-drafts-section') && Date.now() < deadline) await sleep(100);
			return {
				hasSection: !!modal?.querySelector('.crosswalker-drafts-section'),
				draftRows: modal?.querySelectorAll('.crosswalker-draft-row').length ?? -1,
			};
		});
		expect(state.hasSection).toBe(true);
		expect(state.draftRows).toBe(0);
		await browser.saveScreenshot(path.join(OUT_DIR, 'wizard-step1-drafts-empty.png'));
	});

	it('seeds a fake draft and screenshots the populated state', async () => {
		// Close the previous wizard and PROVE it left the DOM before seeding —
		// otherwise the draft list being screenshotted may belong to the modal
		// the previous declaration opened.
		const closed = await closeImportWizard();
		expect(closed.closed).toBe(true);

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

		// Open the wizard and wait for the seeded draft to actually be listed.
		await requireImportWizard();
		const populated = await browser.executeObsidian(async () => {
			const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
			const modal = document.querySelector('.crosswalker-wizard-modal');
			// CONDITION: the drafts list contains the seeded row. `loadAvailableDrafts()`
			// resolves asynchronously, so the old fixed 1200ms could capture an
			// empty list and call it the "populated" screenshot.
			const deadline = Date.now() + 10_000;
			while ((modal?.querySelectorAll('.crosswalker-draft-row').length ?? 0) === 0 && Date.now() < deadline) {
				await sleep(100);
			}
			return {
				draftRows: modal?.querySelectorAll('.crosswalker-draft-row').length ?? -1,
				firstName: modal?.querySelector('.crosswalker-draft-name')?.textContent?.trim() ?? '',
			};
		});
		expect(populated.draftRows).toBeGreaterThan(0);
		expect(populated.firstName).toContain('NIST 800-53 import');
		await browser.saveScreenshot(path.join(OUT_DIR, 'wizard-step1-drafts-populated.png'));
	});

	it('cleans up the seeded draft + closes', async () => {
		const closed = await closeImportWizard();
		expect(closed.closed).toBe(true);
		const cleared = await clearAllDrafts();
		expect(cleared.cleared).toBe(true);
		expect(cleared.remaining).toBe(0);
	});
});
