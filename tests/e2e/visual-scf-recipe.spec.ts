/**
 * visual-scf-recipe.spec.ts — show what the Secure Controls Framework recipe produces.
 *
 *   DISPLAY=:0 bun run e2e -- --spec tests/e2e/visual-scf-recipe.spec.ts
 *
 * WHY A SMALL SLICE (see visual-nist-recipe.spec.ts, the reference implementation)
 *
 * Two separate reasons here, and SCF is the source where they compound.
 *
 * 1. RENDERER WEDGE. After a large generated import Obsidian's renderer stops answering CDP
 *    long enough that `saveScreenshot` either times out or SILENTLY RETURNS THE PREVIOUS
 *    FRAME — two captures once came out byte-identical that way and were nearly believed.
 *
 * 2. HARNESS CEILINGS. SCF 2026.1.1 is ~1,468 rows x 369 columns, and a full-corpus E2E
 *    previously FAILED on two of them before it ever reached an assertion:
 *      - passing 1,468 x 369 through `browser.executeObsidian` throws
 *        `RangeError: Too many properties to enumerate` during argument serialization; and
 *      - the readiness barrier exceeds the CDP timeout at roughly 9 MB of generated body.
 *    Neither is a product fault, and neither is fixed by waiting longer. A small slice
 *    sidesteps both: 12 rows of 19 columns serialize trivially, and roughly 80 KB of body
 *    indexes well inside the barrier.
 *
 * COLUMN PRUNING IS DERIVED, NOT HARDCODED. `referencedColumns()` below reads the column
 * names straight out of the recipe's own layout, frontmatter and body templates. A hardcoded
 * list would drift the moment the recipe gained or dropped a projection, and the spec would
 * then quietly prove the wrong thing — feeding a column the recipe no longer reads, or
 * starving one it just started reading. The derivation is asserted against the sheet header
 * before the import runs, so a rename in either the recipe or the workbook fails loudly.
 *
 * The slice is imported through the identical shipped path (`runImport` + `recipeOverride`,
 * exactly as the recognized-source wizard calls it), so what renders is what a full run
 * produces for these rows.
 *
 * RIGHTS — RESTRICTED SOURCE. The Secure Controls Framework workbook is CC BY-ND with
 * separate derivative rules and is held local-only under the gitignored `Frameworks/`
 * directory. This spec is deliberately written to assert STRUCTURAL FACTS ONLY: note counts,
 * body emptiness, recipe-authored section headings, render-error counts, key presence,
 * value TYPES, and lengths. It never asserts on, logs, or embeds any SCF control text.
 *
 * It DOES capture screenshots: `test-screenshots/` is gitignored, the captures never leave
 * this machine, and the owner licenses this corpus and needs to see what the recipe renders.
 * Nothing under `test-screenshots/` may be committed or published. Corpus provenance and
 * rights posture: https://cybersader.github.io/crosswalker/reference/framework-corpus/
 */

import { browser } from '@wdio/globals';
import { expect } from 'expect';
import { mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import * as XLSX from 'xlsx';
import scfRecipe from '../../recipes/import/scf-2026-flat.json';
import { readFrontmatterFromDisk, resetTier2Sidecar, waitForFrontmatterIndexed } from './helpers/vault-readiness';

const OUT_DIR = path.resolve(__dirname, '..', '..', 'test-screenshots');
const CORPUS = path.resolve(__dirname, '..', '..', 'Frameworks', 'Secure.Controls.Framework.SCF.-.2026.1.1.xlsx');
const SOURCE_FILE_NAME = 'Secure.Controls.Framework.SCF.-.2026.1.1.xlsx';
const SHEET = 'SCF 2026.1';
const HEADER_ROW = 0;
const DESTINATION = 'Frameworks/SCF-recipe-visual';
const EXPECTED_RECORD_COUNT = 1468;
const EXPECTED_SHEET_COLUMNS = 369;

/**
 * Controls chosen to exercise what a reader should be able to see.
 *
 * - `GOV-01.1` and `IAC-01.1` are DOTTED SCF identifiers: the sub-control shape that must
 *   survive the filename template intact and stay distinct from its `GOV-01` / `IAC-01`
 *   parent, both of which are in the slice for exactly that comparison.
 * - The 12 rows span 9 of the 33 SCF domains, so `domain` — the facet Bases groups by — is
 *   read off nine different rows rather than one, and `pptdf_applicability` and
 *   `csf_function` each appear with more than one value.
 * - `control_weighting` varies across the slice (3, 7, 9, 10), which matters because that
 *   property goes through the `number` filter: a slice where every weighting were 10 could
 *   not distinguish a real number from a coincidence.
 * - All twelve rows have all twelve body columns populated, so this slice is the one that can
 *   assert every recipe-authored section is present. 1,371 of the 1,468 corpus rows are in
 *   that state, so the slice is representative rather than lucky.
 */
const WANTED = [
	'GOV-01',
	'GOV-01.1', // dotted sub-control id
	'GOV-02',
	'IAC-01',
	'IAC-01.1', // dotted sub-control id
	'AST-01',
	'CRY-01',
	'DCH-01',
	'IRO-01',
	'RSK-01',
	'TPM-01',
	'WEB-12',
];

/** Mirror src/import/parsers/xlsx-parser.ts exactly: normKey + raw:false + defval:''. */
const normKey = (key: string): string => key.replace(/\s+/g, ' ').trim();

interface SheetRow { [column: string]: string }

/**
 * The column names this recipe's own templates reference, read out of the recipe.
 *
 * Derived rather than hardcoded so the pruned slice cannot drift away from what the recipe
 * actually reads. Matches `{Name}` and `{Name|filter(...)}`; SCF header names legitimately
 * contain `(`, `)`, `<`, `>`, `&` and `,`, so only `{`, `}` and the filter pipe delimit a
 * name. Body entries that are pure literal text (no interpolation) contribute nothing.
 */
function referencedColumns(recipe: any): string[] {
	const templates: string[] = [];
	for (const entry of recipe.target.layout) templates.push(String(entry.template));
	for (const value of Object.values(recipe.target.also_emit.frontmatter.managed)) templates.push(String(value));
	for (const entry of recipe.target.also_emit.body) templates.push(String(entry.template));

	const names: string[] = [];
	const seen = new Set<string>();
	const pattern = /\{([^{}|]+)(?:\|[^{}]*)?\}/g;
	for (const template of templates) {
		pattern.lastIndex = 0;
		let match = pattern.exec(template);
		while (match !== null) {
			const name = match[1].trim();
			if (name.length > 0 && !seen.has(name)) { seen.add(name); names.push(name); }
			match = pattern.exec(template);
		}
	}
	return names;
}

/** Section headings the recipe authors, in order. Recipe text, not framework text. */
function bodyHeadings(recipe: any): string[] {
	return recipe.target.also_emit.body
		.filter((entry: any) => typeof entry.heading === 'string')
		.map((entry: any) => `${'#'.repeat(entry.heading_depth ?? 2)} ${entry.heading}`);
}

function loadCorpus(): { sheetColumns: string[]; rows: SheetRow[] } {
	const workbook = XLSX.read(readFileSync(CORPUS), { type: 'buffer' });
	const sheet = workbook.Sheets[SHEET];
	if (!sheet) throw new Error(`sheet "${SHEET}" missing; workbook has: ${workbook.SheetNames.join(', ')}`);
	const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
		range: HEADER_ROW, defval: '', blankrows: false, raw: false,
	});
	const rows = raw.map((record) => {
		const row: SheetRow = {};
		for (const [key, value] of Object.entries(record)) {
			row[normKey(key)] = value === null || value === undefined ? '' : String(value).trim();
		}
		return row;
	});
	const sheetColumns: string[] = [];
	const seen = new Set<string>();
	for (const row of rows) for (const key of Object.keys(row)) if (!seen.has(key)) { seen.add(key); sheetColumns.push(key); }
	return { sheetColumns, rows };
}

describe('Visual — the Secure Controls Framework recipe (restricted source)', function () {
	this.timeout(180_000);

	let prunedColumns: string[] = [];
	let prunedRows: SheetRow[] = [];
	let headings: string[] = [];
	let sourceById = new Map<string, SheetRow>();

	before(() => {
		mkdirSync(OUT_DIR, { recursive: true });
		const corpus = loadCorpus();
		expect(corpus.rows.length).toBe(EXPECTED_RECORD_COUNT);
		expect(corpus.sheetColumns.length).toBe(EXPECTED_SHEET_COLUMNS);

		prunedColumns = referencedColumns(scfRecipe);
		headings = bodyHeadings(scfRecipe);

		// The derivation must resolve against the real header, in both directions of failure:
		// a recipe rename and a workbook rename both land here rather than as a mystery empty
		// body 200 lines later.
		const header = new Set(corpus.sheetColumns);
		expect(prunedColumns.filter((name) => !header.has(name))).toEqual([]);
		// The pruning is the point: a couple of dozen columns, not 369.
		expect(prunedColumns.length).toBeGreaterThan(0);
		expect(prunedColumns.length).toBeLessThan(40);
		expect(prunedColumns.length).toBeLessThan(EXPECTED_SHEET_COLUMNS);

		sourceById = new Map(corpus.rows.map((row) => [row['SCF #'], row]));
		prunedRows = WANTED
			.map((id) => sourceById.get(id))
			.filter((row): row is SheetRow => Boolean(row))
			.map((row) => {
				// Project each row down to the referenced columns only. This is what keeps the
				// executeObsidian argument out of `RangeError: Too many properties to enumerate`.
				const pruned: SheetRow = {};
				for (const name of prunedColumns) pruned[name] = row[name] ?? '';
				return pruned;
			});
	});

	it('imports a small, column-pruned slice through the shipped recipe path', async () => {
		expect(prunedRows.length).toBe(WANTED.length);
		for (const row of prunedRows) expect(Object.keys(row).length).toBe(prunedColumns.length);

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
							filename: { template: '{SCF #|fs-safe}.md', sanitize: true },
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
				columns: prunedColumns, rows: prunedRows, destination: DESTINATION,
				sourceFileName: SOURCE_FILE_NAME, recipe: scfRecipe, headerRow: HEADER_ROW,
			},
		);

		// Only the error COUNT and an empty-array comparison are asserted, so a failure message
		// can print an engine message but never an SCF prose excerpt.
		expect(generation.errors.length).toBe(0);
		expect(generation.success).toBe(true);
		expect(generation.created.length).toBe(WANTED.length);

		await waitForFrontmatterIndexed({
			pathPrefixes: DESTINATION,
			requireKeys: ['scf_id', 'curie'],
			expectedCount: WANTED.length,
		});

		await resetTier2Sidecar();
	});

	it('captures a top-level control note', async () => {
		// No revealLeaf() and no file-explorer:reveal-active-file. Both wedge the renderer
		// after a generated import, and a wedged renderer returns the PREVIOUS frame rather
		// than failing, which is how two captures came out byte-identical.
		await browser.executeObsidian(async ({ app }, target) => {
			const file = app.vault.getAbstractFileByPath(target);
			// @ts-expect-error - internal leaf API
			await app.workspace.getLeaf(true).openFile(file);
		}, `${DESTINATION}/GOV-01.md`);

		await browser.pause(1200);
		await browser.saveScreenshot(path.join(OUT_DIR, 'scf-recipe-control.png'));

		// WHAT THE PICTURE CANNOT PROVE. `control_weighting` goes through the `number` filter so
		// Bases sorts materiality numerically rather than lexically ("10" before "2"). A quoted
		// "10" and an unquoted 10 look identical in the property panel; only the parsed type
		// tells them apart. Type and shape only, no source text asserted.
		const frontmatter = await readFrontmatterFromDisk(`${DESTINATION}/GOV-01.md`) as Record<string, any> | null;
		expect(frontmatter).toBeTruthy();
		expect(frontmatter!.scf_id).toBe('GOV-01');
		expect(typeof frontmatter!.control_weighting).toBe('number');
		expect(Number.isFinite(frontmatter!.control_weighting)).toBe(true);
		expect(typeof frontmatter!.domain).toBe('string');
		expect((frontmatter!.domain as string).length).toBeGreaterThan(0);
		expect(typeof frontmatter!.title).toBe('string');
		expect((frontmatter!.title as string).length).toBeGreaterThan(0);
		// The control description was deliberately moved OUT of frontmatter and into the body.
		expect(frontmatter!.description).toBeUndefined();
	});

	it('captures a dotted sub-control note, and proves it is distinct from its parent', async () => {
		await browser.executeObsidian(async ({ app }, target) => {
			const file = app.vault.getAbstractFileByPath(target);
			// @ts-expect-error - internal leaf API
			await app.workspace.getLeaf(true).openFile(file);
		}, `${DESTINATION}/GOV-01.1.md`);

		await browser.pause(1200);
		await browser.saveScreenshot(path.join(OUT_DIR, 'scf-recipe-control-dotted.png'));

		const dotted = await readFrontmatterFromDisk(`${DESTINATION}/GOV-01.1.md`) as Record<string, any> | null;
		const parent = await readFrontmatterFromDisk(`${DESTINATION}/GOV-01.md`) as Record<string, any> | null;
		expect(dotted).toBeTruthy();
		expect(parent).toBeTruthy();
		expect(dotted!.scf_id).toBe('GOV-01.1');
		expect(parent!.scf_id).toBe('GOV-01');
		expect(dotted!.curie).not.toBe(parent!.curie);
	});

	it('proves every recipe-authored body section is present and non-empty on every note', async () => {
		// Structure and counts only. The control description is passed IN for a verbatim
		// containment check; only booleans and paths come back out.
		const proof = await browser.executeObsidian(async ({ app, obsidian }, args) => {
			const stripFrontmatter = (markdown: string): string => {
				const normalized = markdown.replace(/\r\n/g, '\n');
				if (!normalized.startsWith('---\n')) return normalized.trim();
				const closing = normalized.indexOf('\n---\n', 4);
				return closing < 0 ? normalized.trim() : normalized.slice(closing + 5).trim();
			};
			const normalizeEol = (text: string): string => text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
			const missingFiles: string[] = [];
			const emptyBodies: string[] = [];
			const missingHeadings: Array<{ note: string; heading: string }> = [];
			const emptySections: Array<{ note: string; heading: string }> = [];
			const descriptionNotVerbatim: string[] = [];
			const bodyCharacterCounts: number[] = [];

			for (const row of args.rows) {
				const notePath = `${args.destination}/${row.id}.md`;
				const file = app.vault.getAbstractFileByPath(notePath);
				if (!file || !(file instanceof obsidian.TFile)) { missingFiles.push(notePath); continue; }
				const body = stripFrontmatter(await app.vault.read(file));
				if (body.length === 0) emptyBodies.push(notePath);
				if (!normalizeEol(body).includes(normalizeEol(row.description))) descriptionNotVerbatim.push(notePath);

				// Every heading must be present AND have content between it and the next heading —
				// a heading with nothing under it is how a body regression actually looks.
				for (let index = 0; index < args.headings.length; index++) {
					const heading = args.headings[index];
					const at = body.indexOf(heading);
					if (at < 0) { missingHeadings.push({ note: notePath, heading }); continue; }
					const after = body.slice(at + heading.length);
					const next = args.headings
						.filter((_: string, other: number) => other !== index)
						.map((other: string) => after.indexOf(other))
						.filter((position: number) => position >= 0)
						.sort((left: number, right: number) => left - right)[0];
					const section = next === undefined ? after : after.slice(0, next);
					if (section.trim().length === 0) emptySections.push({ note: notePath, heading });
				}
				bodyCharacterCounts.push(body.length);
			}
			return {
				missingFiles, emptyBodies, missingHeadings, emptySections, descriptionNotVerbatim,
				bodyCharacterMin: bodyCharacterCounts.length ? Math.min(...bodyCharacterCounts) : 0,
			};
		}, {
			rows: WANTED.map((id) => ({
				id,
				description: (sourceById.get(id)?.['Secure Controls Framework (SCF) Control Description'] ?? '').trim(),
			})),
			destination: DESTINATION,
			headings,
		});

		expect(proof.missingFiles).toEqual([]);
		expect(proof.emptyBodies).toEqual([]);
		// A failing entry names a note path and a RECIPE-authored heading — never source text.
		expect(proof.missingHeadings).toEqual([]);
		expect(proof.emptySections).toEqual([]);
		expect(proof.descriptionNotVerbatim).toEqual([]);
		expect(proof.bodyCharacterMin).toBeGreaterThan(0);
		// All twelve recipe body sections, on every note in the slice.
		expect(headings.length).toBe(12);
	});
});
