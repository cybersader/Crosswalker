/**
 * ch46-unfiltered-source.spec.ts — the Ch 46 central claim, for the XLSX sources.
 *
 *   CW_CH46=1 DISPLAY=:0 bun run e2e -- --spec tests/e2e/ch46-unfiltered-source.spec.ts
 *
 * THE CLAIM UNDER TEST
 *
 * Before `source.where`, three shipped recipes could not be pointed at their own
 * source file. `full-nist-csf-2-import.spec.ts` says so in its own header: the
 * `CSF 2.0` sheet is 231 rows of which only 185 carry a `Subcategory`, and the
 * spec hand-filters to those 185 because "the recipe grammar has no row
 * predicate". Every consumer had to do that by hand.
 *
 * This spec removes the hand-filter. It feeds the recipe the WHOLE sheet and
 * asserts the recipe selects its own rows: the right count, the right names, and
 * no note derived from a banner row.
 *
 * It also proves the loudness contract on real data, which is the other half of
 * the design. A predicate that silently drops every row is worse than no
 * predicate, so the typo case is tested deliberately rather than assumed.
 *
 * NO SCREENSHOTS. After a large generated import Obsidian's renderer stops
 * answering CDP reliably (see visual-nist-recipe.spec.ts). Captures live in the
 * small-slice visual specs; this spec asserts and takes no pictures.
 *
 * RIGHTS: CIS Controls are CC BY-NC-ND. This spec asserts only structural facts
 * about them — counts and identifiers. It reads no prose into an assertion and
 * writes no CIS prose to disk outside the isolated E2E sandbox vault.
 */

import { browser } from '@wdio/globals';
import { expect } from 'expect';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import * as XLSX from 'xlsx';
import csfRecipe from '../../recipes/import/nist-csf-2.json';
import cisSafeguardRecipe from '../../recipes/import/cis-controls-v8.json';
import cisControlRecipe from '../../recipes/import/cis-controls-v8-controls.json';
import { requireFrontmatterIndexed } from './helpers/vault-readiness';

const RUN = process.env.CW_CH46 === '1';
const describeCh46 = RUN ? describe : describe.skip;

const FRAMEWORKS = path.resolve(__dirname, '..', '..', 'Frameworks');
const CSF_FILE = 'csf2.xlsx';
const CIS_FILE = 'CIS_Controls_Version_8.1.2___March_2025.xlsx';

/** Mirror src/import/parsers/xlsx-parser.ts exactly: normKey + raw:false + defval:'' + trim. */
const normKey = (key: string): string => key.replace(/\s+/g, ' ').trim();

function readSheet(fileName: string, sheetName: string, headerRow: number) {
	const workbook = XLSX.read(readFileSync(path.join(FRAMEWORKS, fileName)), { type: 'buffer' });
	const sheet = workbook.Sheets[sheetName];
	if (!sheet) throw new Error(`sheet "${sheetName}" missing; workbook has: ${workbook.SheetNames.join(', ')}`);
	const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
		range: headerRow, defval: '', blankrows: false, raw: false,
	});
	const rows = raw.map((record) => {
		const row: Record<string, string> = {};
		for (const [key, value] of Object.entries(record)) {
			row[normKey(key)] = value === null || value === undefined ? '' : String(value).trim();
		}
		return row;
	});
	const columns: string[] = [];
	const seen = new Set<string>();
	for (const row of rows) for (const key of Object.keys(row)) if (!seen.has(key)) { seen.add(key); columns.push(key); }
	return { columns, rows };
}

/** Remove a destination folder so each case starts from an empty vault subtree. */
async function clearDestination(destination: string): Promise<boolean> {
	return browser.executeObsidian(async ({ app }, root) => {
		const existing = app.vault.getAbstractFileByPath(root);
		if (existing) {
			// @ts-expect-error - internal trash API, isolated E2E sandbox only
			await app.vault.trash(existing, false);
		}
		const deadline = Date.now() + 30_000;
		while (app.vault.getAbstractFileByPath(root) && Date.now() < deadline) {
			await new Promise((resolve) => setTimeout(resolve, 50));
		}
		return !app.vault.getAbstractFileByPath(root);
	}, destination);
}

/** Every Markdown basename actually written under `destination`, from the vault. */
async function basenamesUnder(destination: string): Promise<string[]> {
	return browser.executeObsidian(async ({ app }, root) => app.vault
		.getMarkdownFiles()
		.filter((file) => file.path === root || file.path.startsWith(`${root}/`))
		.map((file) => file.basename)
		.sort(), destination);
}

/** The shipped recognized-source path: runImport + recipeOverride. */
async function importUnfiltered(args: {
	columns: string[];
	rows: Record<string, string>[];
	recipe: unknown;
	destination: string;
	sourceFileName: string;
	filenameTemplate: string;
	headerRow: number;
}) {
	return browser.executeObsidian(async ({ app }, input) => {
		// @ts-expect-error - Crosswalker E2E API
		const plugin = app.plugins.plugins['crosswalker'];
		return plugin.runImport(
			{
				columns: input.columns,
				rows: input.rows,
				rowCount: input.rows.length,
				source: { type: 'xlsx' },
				headerRow: input.headerRow,
			},
			{
				name: 'shape-workbench',
				mapping: {
					hierarchy: [], frontmatter: [], links: [], body: [],
					filename: { template: input.filenameTemplate, sanitize: true },
				},
			},
			{
				basePath: input.destination,
				overwriteMode: 'replace',
				createFolders: true,
				strictValidation: true,
				sourceFileName: input.sourceFileName,
				recipeOverride: input.recipe,
			},
		);
	}, args);
}

describeCh46('Ch 46 — a recipe points at its own unfiltered source (XLSX)', function () {
	this.timeout(10 * 60_000);

	it('NIST CSF 2.0: the whole 231-row sheet yields exactly the 185 subcategory notes', async () => {
		const { columns, rows } = readSheet(CSF_FILE, 'CSF 2.0', 1);
		// Precondition: this really is the unfiltered sheet, banners included.
		expect(rows.length).toBe(231);
		const bannerRows = rows.filter((row) => (row['Subcategory'] ?? '').trim() === '');
		expect(bannerRows.length).toBe(46);
		expect((csfRecipe as any).source.where).toBe("Subcategory != ''");

		const destination = 'Frameworks/ch46-csf-unfiltered';
		expect(await clearDestination(destination)).toBe(true);

		const generation = await importUnfiltered({
			columns, rows, recipe: csfRecipe, destination,
			sourceFileName: CSF_FILE,
			filenameTemplate: '{Subcategory|split(:,0)|fs-safe}.md',
			headerRow: 1,
		});

		expect(generation.errors ?? []).toEqual([]);
		expect(generation.success).toBe(true);
		// The whole claim in one number: 231 rows in, 185 notes out, no hand-filter.
		expect(generation.created.length).toBe(185);

		await requireFrontmatterIndexed({
			pathPrefixes: destination, expectedCount: 185,
			requireKeys: ['curie', '_crosswalker'], timeoutMs: 180_000, pollMs: 100,
		});

		const written = await basenamesUnder(destination);
		expect(written.length).toBe(185);
		// No banner row survived. A banner renders to the empty filename, which is
		// the collision the recipe's KNOWN GAP 3 used to describe.
		expect(written.filter((name) => name.trim() === '')).toEqual([]);
		expect(new Set(written).size).toBe(185);

		const expected = rows
			.filter((row) => (row['Subcategory'] ?? '').trim() !== '')
			.map((row) => row['Subcategory'].split(':')[0].trim())
			.sort();
		expect(written).toEqual(expected);
	});

	it('CIS safeguards: the whole 171-row sheet yields exactly the 153 safeguard notes', async () => {
		const { columns, rows } = readSheet(CIS_FILE, 'Controls v8.1.2', 0);
		expect(rows.length).toBe(171);
		expect((cisSafeguardRecipe as any).source.where).toBe('$trim(`CIS Safeguard`) != \'\'');

		const destination = 'Frameworks/ch46-cis-safeguards-unfiltered';
		expect(await clearDestination(destination)).toBe(true);

		const generation = await importUnfiltered({
			columns, rows, recipe: cisSafeguardRecipe, destination,
			sourceFileName: CIS_FILE,
			filenameTemplate: '{CIS Safeguard|fs-safe}.md',
			headerRow: 0,
		});

		expect(generation.errors ?? []).toEqual([]);
		expect(generation.success).toBe(true);
		expect(generation.created.length).toBe(153);

		await requireFrontmatterIndexed({
			pathPrefixes: destination, expectedCount: 153,
			requireKeys: ['curie', '_crosswalker'], timeoutMs: 180_000, pollMs: 100,
		});

		const written = await basenamesUnder(destination);
		expect(written.length).toBe(153);
		expect(new Set(written).size).toBe(153);
		// Structural only (CC BY-NC-ND): identifiers, never prose. `3.10` must be
		// its own note and not collapse onto `3.1` — the numeric-cell trap the
		// xlsx parser's raw:false contract exists to prevent.
		for (const id of ['3.1', '3.10', '4.1', '4.10', '8.1', '8.10', '13.1', '13.10', '16.1', '16.10']) {
			expect(written).toContain(id);
		}
		// A control row (empty safeguard) must not have produced a note here.
		const controlOnlyRows = rows.filter((row) => (row['CIS Safeguard'] ?? '').trim() === '');
		expect(controlOnlyRows.length).toBe(18);
		for (const row of controlOnlyRows) {
			expect(written).not.toContain((row['CIS Control'] ?? '').trim());
		}
	});

	it('CIS controls: the same 171-row sheet yields exactly the 18 control notes', async () => {
		const { columns, rows } = readSheet(CIS_FILE, 'Controls v8.1.2', 0);
		expect((cisControlRecipe as any).source.where).toBe('$trim(`CIS Safeguard`) = \'\'');

		const destination = 'Frameworks/ch46-cis-controls-unfiltered';
		expect(await clearDestination(destination)).toBe(true);

		const generation = await importUnfiltered({
			columns, rows, recipe: cisControlRecipe, destination,
			sourceFileName: CIS_FILE,
			filenameTemplate: '{CIS Control|trim|fs-safe}.md',
			headerRow: 0,
		});

		expect(generation.errors ?? []).toEqual([]);
		expect(generation.success).toBe(true);
		expect(generation.created.length).toBe(18);

		await requireFrontmatterIndexed({
			pathPrefixes: destination, expectedCount: 18,
			requireKeys: ['curie', '_crosswalker'], timeoutMs: 120_000, pollMs: 100,
		});

		const written = await basenamesUnder(destination);
		expect(written.length).toBe(18);
		// The two CIS recipes partition the same sheet: 153 + 18 = 171, no overlap.
		// A safeguard id must not appear in the control set.
		for (const id of ['3.1', '3.10', '16.10']) expect(written).not.toContain(id);
	});

	it('LOUDNESS: a misspelled column fails the run by name and writes nothing', async () => {
		const { columns, rows } = readSheet(CSF_FILE, 'CSF 2.0', 1);
		const destination = 'Frameworks/ch46-loudness-typo';
		expect(await clearDestination(destination)).toBe(true);

		// One character removed from a real column name. Under the banned
		// behaviour this predicate evaluates false on every row, imports zero
		// notes, and reports success.
		const typoRecipe = JSON.parse(JSON.stringify(csfRecipe));
		typoRecipe.source.where = "Subcatgory != ''";

		const generation = await importUnfiltered({
			columns, rows, recipe: typoRecipe, destination,
			sourceFileName: CSF_FILE,
			filenameTemplate: '{Subcategory|split(:,0)|fs-safe}.md',
			headerRow: 1,
		});

		expect(generation.success).toBe(false);
		expect(generation.created.length).toBe(0);
		expect((generation.errors ?? []).length).toBeGreaterThan(0);
		const message = generation.errors.map((e: any) => e.message).join('\n');
		// It must name the offending field, not merely fail.
		expect(message).toContain('Subcatgory');
		expect(message).toContain('source.where');
		expect(generation.errors[0].declaration).toBe('source.where');

		// Not one note was written. This is the property that matters: the
		// banned behaviour is a vault that quietly gains the wrong notes, or
		// none, while reporting success.
		const written = await basenamesUnder(destination);
		expect(written).toEqual([]);

		// FINDING (verification 2026-08-27) — the two entry points differ here.
		// generateFromRecipe runs prepareSourceStage at generation-engine.ts:1931
		// and ensureFolderExists at :1949, so preflight really does precede the
		// first folder, exactly as its comment claims. generateNotes creates the
		// base folder at :325 and only reaches prepareSourceStage at :414, so
		// THIS path leaves an empty destination folder behind on a failed
		// preflight. No note is written either way, so nothing is lost or wrong;
		// it is an inconsistency between two paths and a small contradiction of
		// the stated "zero writes" property. Pinned rather than glossed, so a
		// fix that moves the stage earlier is noticed here.
		const folderExists = await browser.executeObsidian(
			async ({ app }, root) => Boolean(app.vault.getAbstractFileByPath(root)), destination);
		expect(folderExists).toBe(true); // known divergence, generateNotes only
	});

	it('LOUDNESS: the native recipe entry point fails preflight before creating anything', async () => {
		const { columns, rows } = readSheet(CSF_FILE, 'CSF 2.0', 1);
		const destination = 'Frameworks/ch46-loudness-typo-native';
		expect(await clearDestination(destination)).toBe(true);

		const typoRecipe = JSON.parse(JSON.stringify(csfRecipe));
		typoRecipe.source.where = "Subcatgory != ''";

		const generation = await browser.executeObsidian(async ({ app }, args) => {
			// @ts-expect-error - Crosswalker E2E API
			const plugin = app.plugins.plugins['crosswalker'];
			return plugin.runImportFromRecipe(
				{
					columns: args.columns, rows: args.rows, rowCount: args.rows.length,
					source: { type: 'xlsx' }, headerRow: 1,
				},
				args.recipe,
				{
					basePath: args.destination, overwriteMode: 'replace', createFolders: true,
					strictValidation: true, sourceFileName: args.sourceFileName,
				},
			);
		}, { columns, rows, recipe: typoRecipe, destination, sourceFileName: CSF_FILE });

		expect(generation.success).toBe(false);
		expect(generation.created.length).toBe(0);
		const message = generation.errors.map((e: any) => e.message).join('\n');
		expect(message).toContain('Subcatgory');
		expect(generation.errors[0].declaration).toBe('source.where');

		// On this path the contract holds literally: nothing at all was created.
		expect(await basenamesUnder(destination)).toEqual([]);
		const folderExists = await browser.executeObsidian(
			async ({ app }, root) => Boolean(app.vault.getAbstractFileByPath(root)), destination);
		expect(folderExists).toBe(false);
	});

	it('LOUDNESS: a predicate that matches nothing is an error, not an empty import', async () => {
		const { columns, rows } = readSheet(CSF_FILE, 'CSF 2.0', 1);
		const destination = 'Frameworks/ch46-loudness-empty';
		expect(await clearDestination(destination)).toBe(true);

		// Real column, literal that matches no row. G3.
		const emptyRecipe = JSON.parse(JSON.stringify(csfRecipe));
		emptyRecipe.source.where = "Subcategory = 'no-such-value'";

		const generation = await importUnfiltered({
			columns, rows, recipe: emptyRecipe, destination,
			sourceFileName: CSF_FILE,
			filenameTemplate: '{Subcategory|split(:,0)|fs-safe}.md',
			headerRow: 1,
		});

		expect(generation.success).toBe(false);
		expect(generation.created.length).toBe(0);
		const message = generation.errors.map((e: any) => e.message).join('\n');
		expect(message).toContain('source.where');
		expect(await basenamesUnder(destination)).toEqual([]);
	});
});
