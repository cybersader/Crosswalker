/**
 * golden-regen.test.ts — driver for `bun run golden:regen` (testing doctrine L3).
 *
 * Regenerating the committed goldens needs the real buildNoteContent, which
 * lives in the obsidian-coupled generation-engine. Under jest, `obsidian` maps
 * to tests/__mocks__, so this is the only runtime that can drive regen (see
 * tools/golden/regen.ts header for why bare `bun` cannot).
 *
 * Env-gated so a normal `jest` run never rewrites goldens: it only runs under
 * CW_GOLDEN_REGEN=1 (set by the `golden:regen` script). Otherwise it is skipped.
 */

import { writeAllGoldens, goldenDir } from '../tools/golden/regen';

const REGEN = process.env.CW_GOLDEN_REGEN === '1';

(REGEN ? describe : describe.skip)('golden regeneration', () => {
	it('writes every corpus vault to tools/golden/<corpus>/', async () => {
		const summary = await writeAllGoldens();
		expect(summary.length).toBeGreaterThan(0);
		for (const { corpus, notes } of summary) {
			// eslint-disable-next-line no-console
			console.log(`regenerated ${goldenDir(corpus + '.csv')}: ${notes} notes`);
			expect(notes).toBeGreaterThan(0);
		}
	});
});

// A visible marker when skipped, so `jest` output shows regen was intentionally
// not run (rather than silently absent).
(REGEN ? describe.skip : describe)('golden regeneration (skipped)', () => {
	it.skip('set CW_GOLDEN_REGEN=1 (via `bun run golden:regen`) to rewrite goldens', () => {
		/* intentionally skipped */
	});
});
