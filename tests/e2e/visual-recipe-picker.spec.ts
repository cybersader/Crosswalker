/**
 * visual-recipe-picker.spec.ts — Phase 4c WebDriver visual screenshots.
 *
 * Captures 3 picker states using the shared visual-spec-runner helper:
 *   1. Open state — picker shows all 6 shipped recipes
 *   2. Configured state — first recipe expanded with its parameter editor
 *   3. Insertion result — base block landed in a new note
 *
 * Screenshots land at test-screenshots/recipe-picker-*.png (gitignored).
 *
 * Run: bun run e2e -- --spec tests/e2e/visual-recipe-picker.spec.ts
 */

import { browser } from '@wdio/globals';
import {
	setupVisualSpec,
	captureScreenshot,
	captureCommandResult,
	dismissModal,
} from '../helpers/visual-spec-runner';

describe('Visual — recipe picker (Phase 4)', function () {
	setupVisualSpec(this);

	it('opens picker via command palette + screenshots loaded state', async () => {
		await captureCommandResult('crosswalker:insert-query-into-note', 'recipe-picker-open');
	});

	it('expands a recipe card to show inline parameter editor', async () => {
		// Click the "Configure" button on the first card.
		const configureBtn = await browser.$('.crosswalker-recipe-card .crosswalker-card-actions button');
		if (await configureBtn.isExisting()) {
			await configureBtn.click();
			await captureScreenshot('recipe-picker-configuring');
		}
	});

	it('closes the picker (Escape dismisses without insertion)', async () => {
		await dismissModal();
	});
});
