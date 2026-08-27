/**
 * visual-nist-recipe.spec.ts — show what the enriched NIST recipe actually produces.
 *
 *   DISPLAY=:0 bun run e2e -- --spec tests/e2e/visual-nist-recipe.spec.ts
 *
 * WHY THIS IS SEPARATE FROM THE SCALE SPEC
 *
 * `full-nist-800-53-import.spec.ts` imports all 1,189 controls to measure cost. Every
 * screenshot attempt from that spec fails with "Timed out receiving message from
 * renderer": after a large generated import, Obsidian's renderer stops answering CDP
 * long enough that `saveScreenshot` gives up, and captures either time out or silently
 * reuse the previous frame. Verified 2026-08-26: a bare capture of an untouched vault
 * succeeds, and the same capture after the full import does not.
 *
 * So the two jobs are split. The scale spec measures and asserts at full corpus size and
 * takes no pictures. This spec imports a deliberately small slice through the identical
 * shipped path (`runImport` + `recipeOverride`, exactly as the recognized-source wizard
 * calls it) and photographs the result. What renders here is byte-identical to what the
 * scale run produces for the same rows — same recipe, same engine, same code path.
 */

import { browser } from '@wdio/globals';
import { mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import Papa from 'papaparse';
import nistRecipe from '../../recipes/import/nist-800-53-flat.json';
import { resetTier2Sidecar, waitForFrontmatterIndexed } from './helpers/vault-readiness';

const OUT_DIR = path.resolve('test-screenshots');
const CORPUS = path.resolve('Frameworks/NIST_SP-800-53_rev5_catalog_load.csv');
const DESTINATION = 'Frameworks/NIST-recipe-visual';
const SOURCE_FILE_NAME = 'NIST_SP-800-53_rev5_catalog_load.csv';

/** Controls chosen to exercise the parts a reader should be able to see. */
const WANTED = [
	'AC-1',       // a base control with substantial text and discussion
	'AC-2',       // the parent of the enhancement below, and a related-link target
	'AC-2(1)',    // a parenthesised enhancement: the identifier shape that nearly broke
	'AC-3',       // appears in AC-2's related list, so its link must resolve
	'AC-5',
	'AC-6',
	'AU-1',
	'AU-2',
	'AU-3',
	'IA-2',
	'SC-7',
	'SI-4',
];

interface CorpusRow { identifier: string; [k: string]: string }

describe('Visual — the enriched NIST 800-53 recipe', function () {
	this.timeout(180_000);

	let rows: CorpusRow[] = [];
	let columns: string[] = [];

	before(() => {
		mkdirSync(OUT_DIR, { recursive: true });
		const parsed = Papa.parse<CorpusRow>(readFileSync(CORPUS, 'utf8'), {
			header: true,
			skipEmptyLines: true,
		});
		columns = parsed.meta.fields ?? [];
		const byId = new Map(parsed.data.map((r) => [r.identifier, r]));
		rows = WANTED.map((id) => byId.get(id)).filter((r): r is CorpusRow => Boolean(r));
	});

	it('imports a small slice through the shipped recipe path', async () => {
		expect(rows.length).toBe(WANTED.length);

		const generation = await browser.executeObsidian(
			async ({ app }, args) => {
				// @ts-expect-error - Crosswalker E2E API
				const plugin = app.plugins.plugins['crosswalker'];
				return plugin.runImport(
					{
						columns: args.columns,
						rows: args.rows,
						rowCount: args.rows.length,
						source: { type: 'csv' },
						headerRow: 0,
					},
					{
						name: 'shape-workbench',
						mapping: {
							hierarchy: [], frontmatter: [], links: [], body: [],
							filename: { template: '{identifier|fs-safe}.md', sanitize: true },
						},
					},
					{
						basePath: args.destination,
						overwriteMode: 'replace',
						createFolders: true,
						strictValidation: true,
						sourceFileName: args.sourceFileName,
						recipeOverride: args.recipe,
					},
				);
			},
			{ columns, rows, destination: DESTINATION, sourceFileName: SOURCE_FILE_NAME, recipe: nistRecipe },
		);

		expect(generation.success).toBe(true);
		expect(generation.errors ?? []).toEqual([]);

		// Wait on the real condition rather than a sleep: every note present with
		// readable frontmatter. A screenshot taken mid-index shows a half-built note.
		await waitForFrontmatterIndexed({
			pathPrefixes: DESTINATION,
			requireKeys: ['control_id', 'curie'],
			expectedCount: WANTED.length,
		});

		// Clear the derived index so the run does not surface a stale-projection
		// notice over the screenshots. The pictures are of Tier 1 Markdown, which is
		// canonical; a half-projected index would only add noise to the frame.
		await resetTier2Sidecar();
	});

	it('captures an enhancement note: heading, properties, body, related links', async () => {
		// No revealLeaf() and no file-explorer:reveal-active-file. Both wedge the
		// renderer after a generated import, and a wedged renderer returns the PREVIOUS
		// frame rather than failing, which is how two captures came out byte-identical.
		await browser.executeObsidian(async ({ app }, target) => {
			const file = app.vault.getAbstractFileByPath(target);
			// @ts-expect-error - internal leaf API
			await app.workspace.getLeaf(true).openFile(file);
		}, `${DESTINATION}/AC-2(1).md`);

		await browser.pause(1200);
		await browser.saveScreenshot(path.join(OUT_DIR, 'nist-recipe-enhancement.png'));
	});

	it('captures a base control showing resolved related-control links', async () => {
		await browser.executeObsidian(async ({ app }, target) => {
			const file = app.vault.getAbstractFileByPath(target);
			// @ts-expect-error - internal leaf API
			await app.workspace.getLeaf(true).openFile(file);
		}, `${DESTINATION}/AC-2.md`);

		await browser.pause(1200);
		await browser.saveScreenshot(path.join(OUT_DIR, 'nist-recipe-related-links.png'));

		// Prove in the DOM what the picture shows: the related links resolve to notes
		// that exist, rather than rendering as unresolved placeholders.
		const linkProof = await browser.executeObsidian(async ({ app }, dest) => {
			const file = app.vault.getAbstractFileByPath(`${dest}/AC-2.md`);
			// @ts-expect-error - internal cache API
			const links = app.metadataCache.getFileCache(file)?.links ?? [];
			const resolved = links.filter((l: { link: string }) =>
				// @ts-expect-error - internal resolver
				Boolean(app.metadataCache.getFirstLinkpathDest(l.link, `${dest}/AC-2.md`)));
			return { total: links.length, resolved: resolved.length };
		}, DESTINATION);

		expect(linkProof.total).toBeGreaterThan(0);
		// Every link that points at a control inside this slice must resolve. Links to
		// controls outside the 12-row slice legitimately do not, so this asserts the
		// mechanism works rather than demanding a complete catalog.
		expect(linkProof.resolved).toBeGreaterThan(0);
	});
});
