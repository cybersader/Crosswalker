/**
 * visual-csf-recipe.spec.ts — show what the NIST CSF 2.0 recipe actually produces.
 *
 *   DISPLAY=:0 bun run e2e -- --spec tests/e2e/visual-csf-recipe.spec.ts
 *
 * WHY A SMALL SLICE (see visual-nist-recipe.spec.ts, the reference implementation)
 *
 * `full-nist-csf-2-import.spec.ts` imports all 185 subcategories to measure cost.
 * After a large generated import Obsidian's renderer stops answering CDP long enough
 * that `saveScreenshot` either times out or SILENTLY RETURNS THE PREVIOUS FRAME — two
 * captures once came out byte-identical that way and were nearly believed. So this spec
 * imports a deliberately small slice through the identical shipped path (`runImport` +
 * `recipeOverride`, exactly as the recognized-source wizard calls it) and photographs the
 * result. Same recipe, same engine, same code path, so what renders here is what the full
 * run produces for these rows.
 *
 * THE ROW PREFILTER IS NOT AN ARTEFACT OF SLICING. The `CSF 2.0` sheet is a merged-cell
 * banner layout: 231 rows, of which only 185 carry a `Subcategory` value. The recipe
 * grammar has no row predicate (recipe KNOWN GAP 3), so the 46 banner rows render to the
 * empty filename `.md` and collide. Every consumer of this recipe — this spec, the scale
 * spec, and a real operator — must prefilter to the subcategory rows until the grammar
 * can express it. The prefilter here is asserted, not assumed.
 *
 * RIGHTS: NIST Cybersecurity Framework 2.0 is a public-domain United States Government
 * work, so generated output and screenshots of it may be committed and published.
 */

import { browser } from '@wdio/globals';
import { expect } from 'expect';
import { mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import * as XLSX from 'xlsx';
import csfRecipe from '../../recipes/import/nist-csf-2.json';
import { readFrontmatterFromDisk, resetTier2Sidecar, waitForFrontmatterIndexed } from './helpers/vault-readiness';

const OUT_DIR = path.resolve(__dirname, '..', '..', 'test-screenshots');
const CORPUS = path.resolve(__dirname, '..', '..', 'Frameworks', 'csf2.xlsx');
const SOURCE_FILE_NAME = 'csf2.xlsx';
const SHEET = 'CSF 2.0';
/** The sheet's real header is row 2; row 1 is a banner. Index is 0-based. */
const HEADER_ROW = 1;
const DESTINATION = 'Frameworks/CSF-recipe-visual';
const EXPECTED_SHEET_ROWS = 231;
const EXPECTED_SUBCATEGORY_ROWS = 185;

/**
 * Subcategories chosen to exercise what a reader should be able to see.
 *
 * - Dotted subcategory identifiers (`GV.OC-01`) are the riskiest shape here: the file
 *   template, the `function` facet and the `category` facet are all derived from the same
 *   string by splitting on `.` and `-`, so a dotted id that survives the filename but not
 *   the facets (or vice versa) is exactly the failure this slice must be able to show.
 * - All six functions (GV, ID, PR, DE, RS, RC) appear, so the derived `function` facet is
 *   exercised across its whole enumeration rather than on one value.
 * - `ID.AM-06` is a WITHDRAWN subcategory: it has no implementation examples, so it is the
 *   row that proves the body's `omit_if_empty` default drops the second section instead of
 *   emitting an empty heading. 79 of the 185 rows are withdrawal markers; without one in
 *   the slice, the majority behaviour of this recipe would go unphotographed.
 * - `GV.SC-01` carries the largest example cell in the slice (4 examples), so the `list`
 *   body format is shown expanding a newline-packed cell into real bullets.
 */
const WANTED = [
	'GV.OC-01',
	'GV.OC-02',
	'GV.RM-01',
	'GV.SC-01',
	'ID.AM-01',
	'ID.AM-06', // withdrawn: no implementation examples
	'PR.AA-01',
	'PR.AA-05',
	'DE.AE-02',
	'DE.CM-01',
	'RS.MA-01',
	'RC.RP-01',
];

/** Mirror src/import/parsers/xlsx-parser.ts exactly: normKey + raw:false + defval:''. */
const normKey = (key: string): string => key.replace(/\s+/g, ' ').trim();

interface SheetRow { [column: string]: string }

function loadCorpus(): { columns: string[]; sheetRows: SheetRow[]; subcategoryRows: SheetRow[] } {
	const workbook = XLSX.read(readFileSync(CORPUS), { type: 'buffer' });
	const sheet = workbook.Sheets[SHEET];
	if (!sheet) throw new Error(`sheet "${SHEET}" missing; workbook has: ${workbook.SheetNames.join(', ')}`);
	const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
		range: HEADER_ROW, defval: '', blankrows: false, raw: false,
	});
	const sheetRows = raw.map((record) => {
		const row: SheetRow = {};
		for (const [key, value] of Object.entries(record)) {
			row[normKey(key)] = value === null || value === undefined ? '' : String(value).trim();
		}
		return row;
	});
	const columns: string[] = [];
	const seen = new Set<string>();
	for (const row of sheetRows) for (const key of Object.keys(row)) if (!seen.has(key)) { seen.add(key); columns.push(key); }
	return { columns, sheetRows, subcategoryRows: sheetRows.filter((row) => (row['Subcategory'] ?? '').trim() !== '') };
}

describe('Visual — the NIST CSF 2.0 recipe', function () {
	this.timeout(180_000);

	let rows: SheetRow[] = [];
	let columns: string[] = [];

	before(() => {
		mkdirSync(OUT_DIR, { recursive: true });
		const corpus = loadCorpus();
		columns = corpus.columns;
		// Pin the prefilter as a fact about the sheet, not a hope: 231 rows in, 185 with a
		// Subcategory value, 46 banner rows excluded.
		expect(corpus.sheetRows.length).toBe(EXPECTED_SHEET_ROWS);
		expect(corpus.subcategoryRows.length).toBe(EXPECTED_SUBCATEGORY_ROWS);
		const byId = new Map(corpus.subcategoryRows.map((row) => [row['Subcategory'].split(':')[0].trim(), row]));
		rows = WANTED.map((id) => byId.get(id)).filter((row): row is SheetRow => Boolean(row));
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
						source: { type: 'xlsx' },
						headerRow: args.headerRow,
					},
					{
						name: 'shape-workbench',
						mapping: {
							hierarchy: [], frontmatter: [], links: [], body: [],
							filename: { template: '{Subcategory|split(:,0)|fs-safe}.md', sanitize: true },
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
			{
				columns, rows, destination: DESTINATION, sourceFileName: SOURCE_FILE_NAME,
				recipe: csfRecipe, headerRow: HEADER_ROW,
			},
		);

		expect(generation.success).toBe(true);
		expect(generation.errors ?? []).toEqual([]);
		expect(generation.created.length).toBe(WANTED.length);

		// Wait on the real condition rather than a sleep: every note present with readable
		// frontmatter. A screenshot taken mid-index shows a half-built note.
		await waitForFrontmatterIndexed({
			pathPrefixes: DESTINATION,
			requireKeys: ['subcategory_id', 'curie'],
			expectedCount: WANTED.length,
		});

		// Clear the derived index so the run does not surface a stale-projection notice over
		// the screenshots. The pictures are of Tier 1 Markdown, which is canonical.
		await resetTier2Sidecar();
	});

	it('captures a current subcategory: derived facets, outcome, implementation examples', async () => {
		// No revealLeaf() and no file-explorer:reveal-active-file. Both wedge the renderer
		// after a generated import, and a wedged renderer returns the PREVIOUS frame rather
		// than failing, which is how two captures came out byte-identical.
		await browser.executeObsidian(async ({ app }, target) => {
			const file = app.vault.getAbstractFileByPath(target);
			// @ts-expect-error - internal leaf API
			await app.workspace.getLeaf(true).openFile(file);
		}, `${DESTINATION}/GV.SC-01.md`);

		await browser.pause(1200);
		await browser.saveScreenshot(path.join(OUT_DIR, 'csf-recipe-subcategory.png'));

		// The facets are DERIVED from the dotted identifier by two splits. A screenshot of the
		// property panel cannot show whether 'GV.SC' came from the sheet or from a split that
		// silently truncated, so pin both values and the identifier they came from.
		const frontmatter = await readFrontmatterFromDisk(`${DESTINATION}/GV.SC-01.md`) as Record<string, any> | null;
		expect(frontmatter).toBeTruthy();
		expect(frontmatter!.subcategory_id).toBe('GV.SC-01');
		expect(frontmatter!.function).toBe('GV');
		expect(frontmatter!.category).toBe('GV.SC');
		// The outcome statement was deliberately NOT carried as a property in this recipe.
		expect(frontmatter!.title).toBeUndefined();
		expect(frontmatter!.description).toBeUndefined();
	});

	it('captures a withdrawn subcategory, which must have no implementation-examples section', async () => {
		await browser.executeObsidian(async ({ app }, target) => {
			const file = app.vault.getAbstractFileByPath(target);
			// @ts-expect-error - internal leaf API
			await app.workspace.getLeaf(true).openFile(file);
		}, `${DESTINATION}/ID.AM-06.md`);

		await browser.pause(1200);
		await browser.saveScreenshot(path.join(OUT_DIR, 'csf-recipe-withdrawn.png'));

		// What the picture cannot prove: a section that is ABSENT looks the same as a section
		// scrolled off the bottom of the frame. Read the body and check both directions —
		// every note carries '## Outcome', and only the rows with example cells carry
		// '## Implementation examples'. That is the omit_if_empty contract on real data.
		const bodyProof = await browser.executeObsidian(async ({ app, obsidian }, args) => {
			const stripFrontmatter = (markdown: string): string => {
				const normalized = markdown.replace(/\r\n/g, '\n');
				if (!normalized.startsWith('---\n')) return normalized.trim();
				const closing = normalized.indexOf('\n---\n', 4);
				return closing < 0 ? normalized.trim() : normalized.slice(closing + 5).trim();
			};
			const missingFiles: string[] = [];
			const emptyBodies: string[] = [];
			const missingOutcomeHeading: string[] = [];
			const outcomeProseMissing: string[] = [];
			const withExamplesSection: string[] = [];
			for (const row of args.rows) {
				const notePath = `${args.destination}/${row.id}.md`;
				const file = app.vault.getAbstractFileByPath(notePath);
				if (!file || !(file instanceof obsidian.TFile)) { missingFiles.push(notePath); continue; }
				const body = stripFrontmatter(await app.vault.read(file));
				if (body.length === 0) emptyBodies.push(notePath);
				if (!body.includes('## Outcome')) missingOutcomeHeading.push(notePath);
				if (!body.replace(/\r\n/g, '\n').includes(row.outcome.replace(/\r\n/g, '\n'))) outcomeProseMissing.push(notePath);
				if (body.includes('## Implementation examples')) withExamplesSection.push(row.id);
			}
			return { missingFiles, emptyBodies, missingOutcomeHeading, outcomeProseMissing, withExamplesSection };
		}, {
			rows: rows.map((row) => ({ id: row['Subcategory'].split(':')[0].trim(), outcome: row['Subcategory'].trim() })),
			destination: DESTINATION,
		});

		expect(bodyProof.missingFiles).toEqual([]);
		expect(bodyProof.emptyBodies).toEqual([]);
		expect(bodyProof.missingOutcomeHeading).toEqual([]);
		expect(bodyProof.outcomeProseMissing).toEqual([]);
		// The withdrawn row is the one with no examples; every other row in the slice has them.
		expect(bodyProof.withExamplesSection).not.toContain('ID.AM-06');
		expect(bodyProof.withExamplesSection.length).toBe(WANTED.length - 1);
	});
});
