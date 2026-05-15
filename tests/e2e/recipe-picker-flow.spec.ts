/**
 * recipe-picker-flow.spec.ts — Phase 4c WebDriver E2E.
 *
 * Verifies the Phase 4 wire-up's observable side effects:
 *   - SKILL.md first-run write to _crosswalker/SKILL.md
 *   - Frontmatter declares crosswalker-bases skill
 *   - crosswalker:insert-query-into-note command is registered
 *
 * Full DOM-interaction flow (open picker, click Configure, click Insert,
 * assert editor content) is covered by the visual spec where DOM selectors
 * work cleanly.
 */

import { browser } from '@wdio/globals';
import { expect } from 'expect';

describe('Recipe picker — wire-up + first-run side effects (Phase 4)', function () {
	this.timeout(120_000);

	it('SKILL.md exists at vault root _crosswalker/ folder after first load', async () => {
		const present = await browser.executeObsidian(({ app }) => {
			const f = app.vault.getAbstractFileByPath('_crosswalker/SKILL.md');
			return !!f;
		});
		expect(present).toBe(true);
	});

	it('SKILL.md frontmatter declares the crosswalker-bases skill name', async () => {
		const content = await browser.executeObsidian(async ({ app }) => {
			const f = app.vault.getAbstractFileByPath('_crosswalker/SKILL.md');
			if (!f) return null;
			return app.vault.adapter.read('_crosswalker/SKILL.md');
		});
		expect(content).not.toBeNull();
		expect(content).toContain('name: crosswalker-bases');
		expect(content).toContain('crosswalker-pivot');
	});

	it('crosswalker:insert-query-into-note command is registered', async () => {
		const exists = await browser.executeObsidian(({ app }) => {
			// @ts-expect-error — internal commands API
			const cmd = app.commands.findCommand('crosswalker:insert-query-into-note');
			return !!cmd;
		});
		expect(exists).toBe(true);
	});
});
