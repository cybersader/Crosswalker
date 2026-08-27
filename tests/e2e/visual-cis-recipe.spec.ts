/**
 * visual-cis-recipe.spec.ts — show what the CIS Controls v8 safeguard recipe produces.
 *
 *   DISPLAY=:0 bun run e2e -- --spec tests/e2e/visual-cis-recipe.spec.ts
 *
 * WHY A SMALL SLICE (see visual-nist-recipe.spec.ts, the reference implementation)
 *
 * After a large generated import Obsidian's renderer stops answering CDP long enough that
 * `saveScreenshot` either times out or SILENTLY RETURNS THE PREVIOUS FRAME — two captures
 * once came out byte-identical that way and were nearly believed. So this spec imports a
 * deliberately small slice through the identical shipped path (`runImport` +
 * `recipeOverride`, exactly as the recognized-source wizard calls it) and photographs the
 * result. Same recipe, same engine, same code path.
 *
 * RIGHTS — RESTRICTED SOURCE. CIS Controls v8.1.2 is published under CC BY-NC-ND and the
 * workbook is held local-only under the gitignored `Frameworks/` directory. This spec is
 * deliberately written to assert STRUCTURAL FACTS ONLY: note counts, identifier values
 * (bare identifiers, not framework prose), section headings authored by the recipe, body
 * emptiness, and lengths. It never asserts on, logs, or embeds any CIS Title or Description
 * text; every assertion message is derived from a path, a count, or an identifier.
 *
 * It DOES capture screenshots, unlike `full-cri-profile-import.spec.ts`, and that is a
 * deliberate difference rather than an oversight: `test-screenshots/` is gitignored, the
 * captures never leave this machine, and the owner licenses this corpus and needs to see
 * what the recipe renders. Nothing under `test-screenshots/` may be committed or published.
 * Corpus provenance and rights posture:
 * https://cybersader.github.io/crosswalker/reference/framework-corpus/
 *
 * ROW PREFILTER — deliberate, and a property of the source. The workbook keeps CONTROL rows
 * and SAFEGUARD rows in one sheet, distinguished only by whether `CIS Safeguard` is blank
 * (recipe KNOWN GAP 3), and the grammar has no row predicate. Fed the whole sheet this
 * recipe renders the 18 control rows to the empty filename `.md`. The prefilter here is
 * asserted, not assumed.
 */

import { browser } from '@wdio/globals';
import { expect } from 'expect';
import { mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import * as XLSX from 'xlsx';
import cisRecipe from '../../recipes/import/cis-controls-v8.json';
import { readFrontmatterFromDisk, resetTier2Sidecar, waitForFrontmatterIndexed } from './helpers/vault-readiness';

const OUT_DIR = path.resolve(__dirname, '..', '..', 'test-screenshots');
const CORPUS = path.resolve(__dirname, '..', '..', 'Frameworks', 'CIS_Controls_Version_8.1.2___March_2025.xlsx');
const SOURCE_FILE_NAME = 'CIS_Controls_Version_8.1.2___March_2025.xlsx';
const SHEET = 'Controls v8.1.2';
const HEADER_ROW = 0;
const DESTINATION = 'Frameworks/CIS-recipe-visual';
const EXPECTED_SHEET_ROWS = 171;
const EXPECTED_SAFEGUARD_ROWS = 153;

/**
 * Safeguards chosen to exercise what a reader should be able to see.
 *
 * THE FLOAT-COLLAPSE HAZARD IS THE POINT. The workbook stores `CIS Safeguard` as a NUMBER,
 * so safeguard 4.10 is the float 4.1 and any reader that takes the raw cell value collapses
 * 4.10 onto 4.1 — two safeguards, one filename, one note, and no error. Only the xlsx
 * parser's `raw: false` formatted-text mode keeps them apart. So the slice includes BOTH
 * `4.1` and `4.10`, plus `4.11` and `4.12` (which collapse to 4.11/4.12 harmlessly but sit
 * either side of the hazard) and `4.2` (the neighbour 4.10 would be confused with under a
 * naive sort). If the hazard ever regresses, this slice produces 11 notes instead of 12 and
 * the count assertion fails before anyone looks at a picture.
 *
 * `4.1` and `4.10` also differ in implementation-group membership — 4.1 is IG1/IG2/IG3, 4.10
 * is IG2/IG3 only — so the same pair proves the engine omits an empty managed value rather
 * than writing an empty key. The remaining seven ids spread the slice across seven other
 * controls so the `control`, `asset_class` and `security_function` facets are not all read
 * off one row.
 */
const WANTED = [
	'1.1',
	'4.1',   // float-collapse hazard: must stay distinct from 4.10
	'4.2',
	'4.10',  // float-collapse hazard: the float is 4.1
	'4.11',
	'4.12',
	'5.1',
	'6.1',
	'7.1',
	'8.1',
	'13.1',
	'18.1',
];

/** Mirror src/import/parsers/xlsx-parser.ts exactly: normKey + raw:false + defval:''. */
const normKey = (key: string): string => key.replace(/\s+/g, ' ').trim();

interface SheetRow { [column: string]: string }

function loadCorpus(): { columns: string[]; sheetRows: SheetRow[]; safeguardRows: SheetRow[] } {
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
	return { columns, sheetRows, safeguardRows: sheetRows.filter((row) => (row['CIS Safeguard'] ?? '').trim() !== '') };
}

describe('Visual — the CIS Controls v8 safeguard recipe (restricted source)', function () {
	this.timeout(180_000);

	let rows: SheetRow[] = [];
	let columns: string[] = [];

	before(() => {
		mkdirSync(OUT_DIR, { recursive: true });
		const corpus = loadCorpus();
		columns = corpus.columns;
		expect(corpus.sheetRows.length).toBe(EXPECTED_SHEET_ROWS);
		expect(corpus.safeguardRows.length).toBe(EXPECTED_SAFEGUARD_ROWS);
		// The hazard, pinned at the SOURCE before any import runs: if the reader ever collapses
		// 4.10 onto 4.1 the identifiers stop being unique and this fails here, which localizes
		// the fault to the parser rather than to the engine.
		expect(new Set(corpus.safeguardRows.map((row) => row['CIS Safeguard'])).size).toBe(EXPECTED_SAFEGUARD_ROWS);
		const byId = new Map(corpus.safeguardRows.map((row) => [row['CIS Safeguard'], row]));
		rows = WANTED.map((id) => byId.get(id)).filter((row): row is SheetRow => Boolean(row));
	});

	it('imports a small slice through the shipped recipe path', async () => {
		expect(rows.length).toBe(WANTED.length);
		// Both halves of the hazard survived the read as distinct strings.
		expect(rows.map((row) => row['CIS Safeguard'])).toContain('4.1');
		expect(rows.map((row) => row['CIS Safeguard'])).toContain('4.10');

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
							filename: { template: '{CIS Safeguard|fs-safe}.md', sanitize: true },
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
				recipe: cisRecipe, headerRow: HEADER_ROW,
			},
		);

		// Only the error COUNT and an empty-array comparison are asserted, so a failure message
		// can print an engine message but never a CIS prose excerpt.
		expect(generation.errors.length).toBe(0);
		expect(generation.success).toBe(true);
		// 12 rows in, 12 distinct notes out. This is the float-collapse assertion: a collapse
		// produces 11.
		expect(generation.created.length).toBe(WANTED.length);

		await waitForFrontmatterIndexed({
			pathPrefixes: DESTINATION,
			requireKeys: ['safeguard_id', 'curie'],
			expectedCount: WANTED.length,
		});

		await resetTier2Sidecar();
	});

	it('captures safeguard 4.1', async () => {
		// No revealLeaf() and no file-explorer:reveal-active-file. Both wedge the renderer
		// after a generated import, and a wedged renderer returns the PREVIOUS frame rather
		// than failing, which is how two captures came out byte-identical.
		await browser.executeObsidian(async ({ app }, target) => {
			const file = app.vault.getAbstractFileByPath(target);
			// @ts-expect-error - internal leaf API
			await app.workspace.getLeaf(true).openFile(file);
		}, `${DESTINATION}/4.1.md`);

		await browser.pause(1200);
		await browser.saveScreenshot(path.join(OUT_DIR, 'cis-recipe-safeguard-4-1.png'));
	});

	it('captures safeguard 4.10, and proves it is a different note from 4.1', async () => {
		await browser.executeObsidian(async ({ app }, target) => {
			const file = app.vault.getAbstractFileByPath(target);
			// @ts-expect-error - internal leaf API
			await app.workspace.getLeaf(true).openFile(file);
		}, `${DESTINATION}/4.10.md`);

		await browser.pause(1200);
		await browser.saveScreenshot(path.join(OUT_DIR, 'cis-recipe-safeguard-4-10.png'));

		// WHAT THE PICTURES CANNOT PROVE. Two screenshots of two notes prove nothing about
		// whether they are two notes: a collapse would have left 4.10's content inside 4.1 and
		// the second capture would simply have opened nothing (or, on a wedged renderer,
		// re-shown the first frame). Read both files and compare identity directly.
		const four1 = await readFrontmatterFromDisk(`${DESTINATION}/4.1.md`) as Record<string, any> | null;
		const four10 = await readFrontmatterFromDisk(`${DESTINATION}/4.10.md`) as Record<string, any> | null;
		expect(four1).toBeTruthy();
		expect(four10).toBeTruthy();
		expect(four1!.safeguard_id).toBe('4.1');
		expect(four10!.safeguard_id).toBe('4.10');
		expect(four1!.curie).not.toBe(four10!.curie);
		// Same parent control, different notes — so the pair is genuinely the hazard case and
		// not two unrelated safeguards that happen to sort near each other.
		expect(four1!.control).toBe('4');
		expect(four10!.control).toBe('4');
		// Empty managed values are omitted rather than written as empty keys: 4.1 is in IG1,
		// 4.10 is not. Key PRESENCE only; the mark itself is a source value, not prose.
		expect(Object.prototype.hasOwnProperty.call(four1!, 'ig1')).toBe(true);
		expect(Object.prototype.hasOwnProperty.call(four10!, 'ig1')).toBe(false);
		expect(Object.prototype.hasOwnProperty.call(four10!, 'ig2')).toBe(true);
	});

	it('proves every note in the slice has a non-empty safeguard section', async () => {
		// Structure and counts only. The source prose is passed IN so containment can be
		// checked, and only booleans and paths come back out.
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
			const missingSection: string[] = [];
			const proseNotVerbatim: string[] = [];
			const bodyCharacterCounts: number[] = [];
			const seenPaths = new Set<string>();
			for (const row of args.rows) {
				const notePath = `${args.destination}/${row.id}.md`;
				const file = app.vault.getAbstractFileByPath(notePath);
				if (!file || !(file instanceof obsidian.TFile)) { missingFiles.push(notePath); continue; }
				seenPaths.add(file.path);
				const body = stripFrontmatter(await app.vault.read(file));
				if (body.length === 0) emptyBodies.push(notePath);
				if (!body.includes(args.heading)) missingSection.push(notePath);
				if (!normalizeEol(body).includes(normalizeEol(row.prose))) proseNotVerbatim.push(notePath);
				bodyCharacterCounts.push(body.length);
			}
			return {
				missingFiles, emptyBodies, missingSection, proseNotVerbatim,
				distinctNotes: seenPaths.size,
				bodyCharacterMin: bodyCharacterCounts.length ? Math.min(...bodyCharacterCounts) : 0,
			};
		}, {
			rows: rows.map((row) => ({ id: row['CIS Safeguard'], prose: (row['Description'] ?? '').trim() })),
			destination: DESTINATION,
			heading: '## Safeguard',
		});

		expect(proof.missingFiles).toEqual([]);
		expect(proof.emptyBodies).toEqual([]);
		expect(proof.missingSection).toEqual([]);
		expect(proof.proseNotVerbatim).toEqual([]);
		expect(proof.distinctNotes).toBe(WANTED.length);
		expect(proof.bodyCharacterMin).toBeGreaterThan(0);
	});
});
