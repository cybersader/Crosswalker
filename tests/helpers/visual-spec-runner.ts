/**
 * Visual spec runner helper (Phase 4a — testing helpers).
 *
 * Boilerplate-elimination wrapper for the WebdriverIO visual-screenshot
 * pattern used by:
 *   - tests/e2e/visual-config-browser.spec.ts (Phase 2)
 *   - tests/e2e/visual-wizard-step1-drafts.spec.ts (Phase 3.6)
 *
 * Standardizes screenshot directory, naming, and the timeout / pause
 * conventions. Future visual specs use this instead of repeating ~30 lines
 * of setup each.
 *
 * Usage:
 *   import { setupVisualSpec, captureScreenshot } from '../helpers/visual-spec-runner';
 *
 *   describe('Visual — recipe picker', function () {
 *     setupVisualSpec(this);
 *     it('opens the picker and screenshots empty state', async () => {
 *       await openPickerModal();
 *       await captureScreenshot('recipe-picker-empty');
 *     });
 *   });
 *
 * Screenshots land at test-screenshots/<name>.png (gitignored).
 *
 * Lifespan: every visual test from Phase 4 onward.
 */

import { browser } from '@wdio/globals';
import { mkdirSync } from 'node:fs';
import path from 'node:path';

const OUT_DIR = path.resolve('test-screenshots');
const DEFAULT_TIMEOUT_MS = 120_000;
const DEFAULT_RENDER_PAUSE_MS = 800;

/**
 * Configure a visual-spec suite: set Mocha timeout, ensure output dir
 * exists. Call this once per `describe` block (pass `this`).
 */
export function setupVisualSpec(suite: Mocha.Suite, options: { timeoutMs?: number } = {}): void {
	suite.timeout(options.timeoutMs ?? DEFAULT_TIMEOUT_MS);
	mkdirSync(OUT_DIR, { recursive: true });
}

/**
 * Pause briefly for the UI to render, then capture a screenshot to
 * `test-screenshots/<name>.png`. The default 800ms pause matches the
 * existing visual-spec convention and is enough for most modal / view
 * renders.
 */
export async function captureScreenshot(name: string, options: { pauseMs?: number } = {}): Promise<string> {
	const pauseMs = options.pauseMs ?? DEFAULT_RENDER_PAUSE_MS;
	if (pauseMs > 0) {
		await browser.pause(pauseMs);
	}
	const filePath = path.join(OUT_DIR, `${name}.png`);
	await browser.saveScreenshot(filePath);
	return filePath;
}

/**
 * Run a command palette entry by ID and capture the resulting modal/view.
 * Convenience wrapper for the common pattern: open command + screenshot.
 */
export async function captureCommandResult(
	commandId: string,
	screenshotName: string,
	options: { pauseMs?: number } = {},
): Promise<string> {
	await browser.executeObsidian(({ app }) => {
		// @ts-expect-error — internal commands API
		app.commands.executeCommandById(commandId);
	});
	return captureScreenshot(screenshotName, options);
}

/**
 * Close the active modal (sends Escape).
 */
export async function dismissModal(): Promise<void> {
	await browser.keys(['Escape']);
	await browser.pause(300);
}
