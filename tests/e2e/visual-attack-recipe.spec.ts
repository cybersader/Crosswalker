/**
 * visual-attack-recipe.spec.ts — show what the MITRE ATT&CK technique recipe produces.
 *
 *   DISPLAY=:0 bun run e2e -- --spec tests/e2e/visual-attack-recipe.spec.ts
 *
 * WHY A SMALL SLICE (see visual-nist-recipe.spec.ts, the reference implementation)
 *
 * `full-mitre-attack-import.spec.ts` imports all 656 techniques to measure cost. After a
 * large generated import Obsidian's renderer stops answering CDP long enough that
 * `saveScreenshot` either times out or SILENTLY RETURNS THE PREVIOUS FRAME — two captures
 * once came out byte-identical that way and were nearly believed. So this spec imports a
 * deliberately small slice through the identical shipped path (`runImport` +
 * `recipeOverride`, exactly as the recognized-source wizard calls it) and photographs the
 * result. Same recipe, same engine, same code path.
 *
 * RIGHTS: ATT&CK content is reproduced under the MITRE terms of use. The recipe appends the
 * required copyright notice to every generated note; this spec asserts it is present on all
 * of them, because a screenshot that cropped it would otherwise be the only evidence.
 */

import { browser } from '@wdio/globals';
import { expect } from 'expect';
import { mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import * as XLSX from 'xlsx';
import attackRecipe from '../../recipes/import/mitre-attack-technique.json';
import { readFrontmatterFromDisk, resetTier2Sidecar, waitForFrontmatterIndexed } from './helpers/vault-readiness';

const OUT_DIR = path.resolve(__dirname, '..', '..', 'test-screenshots');
const CORPUS = path.resolve(__dirname, '..', '..', 'Frameworks', 'enterprise-attack-v16.1.xlsx');
const SOURCE_FILE_NAME = 'enterprise-attack-v16.1.xlsx';
const SHEET = 'techniques';
const HEADER_ROW = 0;
const DESTINATION = 'Frameworks/ATTACK-recipe-visual';
const MITRE_NOTICE = 'The MITRE Corporation';

/**
 * Techniques chosen to exercise what a reader should be able to see.
 *
 * - Sub-technique identifiers (`T1548.002`) are the riskiest shape here — a dot inside the
 *   identifier that must survive the filename template AND be reachable as a wikilink
 *   target. Every sub-technique in the slice is paired with ITS PARENT, so the `parent`
 *   wikilink has something real to resolve to; a link that resolves to nothing renders
 *   identically to one that resolves, which is exactly what the DOM assertion below covers.
 * - `T1027` and `T1071` are top-level techniques with an EMPTY `sub-technique of` cell.
 *   They prove the other half of the contract: render() drops a managed value that would
 *   render as "[[]]", so a top-level technique gets no broken parent property rather than a
 *   dangling link. 203 of the 656 techniques are top-level, so omitting this case would
 *   leave a third of the corpus unphotographed.
 * - `T1059.006` is one of only 36 techniques with a `system requirements` cell, so the slice
 *   contains at least one note carrying all three body sections; the rest carry two, which
 *   shows the body's omit_if_empty default in the same run.
 * - `T1548` (6 platforms, 2 tactics, 4 data sources) and `T1078` (4 tactics) carry
 *   multi-item facet cells, so `tactics`/`platforms`/`data_sources` are exercised as real
 *   lists rather than as single-element lists that would pass an Array check trivially.
 */
const WANTED = [
	'T1548',      // parent of the two below
	'T1548.001',
	'T1548.002',  // the dotted sub-technique id that must resolve to T1548
	'T1078',      // 4 tactics
	'T1078.004',
	'T1059',
	'T1059.001',
	'T1059.006',  // has a system-requirements cell
	'T1003',
	'T1003.001',
	'T1027',      // top-level: no parent property may be emitted
	'T1071',      // top-level
];

/** Sub-techniques in the slice, paired with the parent each `parent` link must resolve to. */
const PARENT_PAIRS: Array<[string, string]> = [
	['T1548.001', 'T1548'],
	['T1548.002', 'T1548'],
	['T1078.004', 'T1078'],
	['T1059.001', 'T1059'],
	['T1059.006', 'T1059'],
	['T1003.001', 'T1003'],
];

/** Techniques with no parent — the recipe must emit no `parent` key at all for these. */
const TOP_LEVEL = ['T1548', 'T1078', 'T1059', 'T1003', 'T1027', 'T1071'];

/** Mirror src/import/parsers/xlsx-parser.ts exactly: normKey + raw:false + defval:''. */
const normKey = (key: string): string => key.replace(/\s+/g, ' ').trim();

interface SheetRow { [column: string]: string }

function loadCorpus(): { columns: string[]; byId: Map<string, SheetRow> } {
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
	const columns: string[] = [];
	const seen = new Set<string>();
	for (const row of rows) for (const key of Object.keys(row)) if (!seen.has(key)) { seen.add(key); columns.push(key); }
	return { columns, byId: new Map(rows.map((row) => [row['ID'], row])) };
}

describe('Visual — the MITRE ATT&CK technique recipe', function () {
	this.timeout(180_000);

	let rows: SheetRow[] = [];
	let columns: string[] = [];

	before(() => {
		mkdirSync(OUT_DIR, { recursive: true });
		const corpus = loadCorpus();
		columns = corpus.columns;
		rows = WANTED.map((id) => corpus.byId.get(id)).filter((row): row is SheetRow => Boolean(row));
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
							filename: { template: '{ID|fs-safe}.md', sanitize: true },
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
				recipe: attackRecipe, headerRow: HEADER_ROW,
			},
		);

		expect(generation.success).toBe(true);
		expect(generation.errors ?? []).toEqual([]);
		expect(generation.created.length).toBe(WANTED.length);

		// Wait on the real condition rather than a sleep: a screenshot taken mid-index shows
		// a half-built note.
		await waitForFrontmatterIndexed({
			pathPrefixes: DESTINATION,
			requireKeys: ['technique_id', 'curie'],
			expectedCount: WANTED.length,
		});

		// Clear the derived index so no stale-projection notice sits over the frames.
		await resetTier2Sidecar();
	});

	it('captures a sub-technique note, and proves the facets are real arrays', async () => {
		// No revealLeaf() and no file-explorer:reveal-active-file. Both wedge the renderer
		// after a generated import, and a wedged renderer returns the PREVIOUS frame rather
		// than failing, which is how two captures came out byte-identical.
		await browser.executeObsidian(async ({ app }, target) => {
			const file = app.vault.getAbstractFileByPath(target);
			// @ts-expect-error - internal leaf API
			await app.workspace.getLeaf(true).openFile(file);
		}, `${DESTINATION}/T1548.002.md`);

		await browser.pause(1200);
		await browser.saveScreenshot(path.join(OUT_DIR, 'attack-recipe-subtechnique.png'));

		// WHAT THE PICTURE CANNOT PROVE. Obsidian's property panel renders a YAML list and a
		// comma-joined string almost identically, and the difference is the whole point of the
		// facet work: Bases facets a list and substring-matches a string. So read the file back
		// through parseYaml and assert the JavaScript type.
		const dotted = await readFrontmatterFromDisk(`${DESTINATION}/T1548.002.md`) as Record<string, any> | null;
		expect(dotted).toBeTruthy();
		expect(dotted!.technique_id).toBe('T1548.002');
		expect(Array.isArray(dotted!.tactics)).toBe(true);
		expect(Array.isArray(dotted!.platforms)).toBe(true);
		expect(Array.isArray(dotted!.data_sources)).toBe(true);
		// No item may carry a leading/trailing space or an embedded comma — that would mean the
		// split produced text that merely looks like a list.
		for (const tactic of dotted!.tactics as string[]) {
			expect(typeof tactic).toBe('string');
			expect(tactic).toBe(tactic.trim());
			expect(tactic).not.toContain(',');
		}
		expect(dotted!.is_subtechnique).toBe('true');

		// A multi-item cell, so the array check is not passing on a single-element list.
		const parent = await readFrontmatterFromDisk(`${DESTINATION}/T1548.md`) as Record<string, any> | null;
		expect(parent).toBeTruthy();
		expect(Array.isArray(parent!.platforms)).toBe(true);
		expect((parent!.platforms as string[]).length).toBeGreaterThan(1);
		expect(Array.isArray(parent!.tactics)).toBe(true);
		expect((parent!.tactics as string[]).length).toBeGreaterThan(1);
		expect(parent!.is_subtechnique).toBe('false');
	});

	it('captures a parent technique, and proves every parent wikilink resolves', async () => {
		await browser.executeObsidian(async ({ app }, target) => {
			const file = app.vault.getAbstractFileByPath(target);
			// @ts-expect-error - internal leaf API
			await app.workspace.getLeaf(true).openFile(file);
		}, `${DESTINATION}/T1548.md`);

		await browser.pause(1200);
		await browser.saveScreenshot(path.join(OUT_DIR, 'attack-recipe-parent.png'));

		// WHAT THE PICTURE CANNOT PROVE. An unresolved wikilink and a resolved one are the same
		// glyphs in the property panel. Ask the resolver where each `parent` link actually
		// points, and require it to be the parent note this slice deliberately included.
		const linkProof = await browser.executeObsidian(async ({ app, obsidian }, args) => {
			const unresolved: string[] = [];
			const wrongTarget: Array<{ child: string; got: string }> = [];
			const noLinkRecorded: string[] = [];
			for (const [child, expectedParent] of args.pairs) {
				const childPath = `${args.destination}/${child}.md`;
				const file = app.vault.getAbstractFileByPath(childPath);
				if (!file || !(file instanceof obsidian.TFile)) { unresolved.push(childPath); continue; }
				const cache = app.metadataCache.getFileCache(file);
				// Frontmatter wikilinks land in frontmatterLinks, not links.
				const links = [...(cache?.frontmatterLinks ?? []), ...(cache?.links ?? [])] as Array<{ link: string }>;
				const match = links.find((entry) => entry.link === expectedParent);
				if (!match) { noLinkRecorded.push(childPath); continue; }
				const dest = app.metadataCache.getFirstLinkpathDest(match.link, childPath);
				if (!dest) { unresolved.push(childPath); continue; }
				if (dest.path !== `${args.destination}/${expectedParent}.md`) {
					wrongTarget.push({ child, got: dest.path });
				}
			}
			// The other half of the contract: a technique with no parent must carry no key.
			const strayParentKey: string[] = [];
			for (const id of args.topLevel) {
				const file = app.vault.getAbstractFileByPath(`${args.destination}/${id}.md`);
				if (!file || !(file instanceof obsidian.TFile)) continue;
				const frontmatter = app.metadataCache.getFileCache(file)?.frontmatter ?? {};
				if (Object.prototype.hasOwnProperty.call(frontmatter, 'parent')) strayParentKey.push(id);
			}
			return { unresolved, wrongTarget, noLinkRecorded, strayParentKey };
		}, { pairs: PARENT_PAIRS, topLevel: TOP_LEVEL, destination: DESTINATION });

		expect(linkProof.noLinkRecorded).toEqual([]);
		expect(linkProof.unresolved).toEqual([]);
		expect(linkProof.wrongTarget).toEqual([]);
		expect(linkProof.strayParentKey).toEqual([]);
	});

	it('proves every generated note carries the required MITRE notice', async () => {
		// The licence conditions distribution on carrying the notice into each copy. A cropped
		// screenshot would not show it, so this is asserted rather than photographed.
		const noticeProof = await browser.executeObsidian(async ({ app, obsidian }, args) => {
			const missingNotice: string[] = [];
			const emptyBodies: string[] = [];
			const missingDescription: string[] = [];
			const withSystemRequirements: string[] = [];
			for (const id of args.ids) {
				const notePath = `${args.destination}/${id}.md`;
				const file = app.vault.getAbstractFileByPath(notePath);
				if (!file || !(file instanceof obsidian.TFile)) { missingNotice.push(notePath); continue; }
				const content = await app.vault.read(file);
				if (!content.includes(args.notice)) missingNotice.push(notePath);
				if (!content.includes('## Description')) missingDescription.push(notePath);
				if (content.includes('## System requirements')) withSystemRequirements.push(id);
				const closing = content.indexOf('\n---\n', 4);
				if (closing >= 0 && content.slice(closing + 5).trim().length === 0) emptyBodies.push(notePath);
			}
			return { missingNotice, emptyBodies, missingDescription, withSystemRequirements };
		}, { ids: WANTED, destination: DESTINATION, notice: MITRE_NOTICE });

		expect(noticeProof.missingNotice).toEqual([]);
		expect(noticeProof.emptyBodies).toEqual([]);
		expect(noticeProof.missingDescription).toEqual([]);
		// Exactly the one technique in the slice with a system-requirements cell gets that
		// section; the other eleven must not carry an empty heading.
		expect(noticeProof.withSystemRequirements).toEqual(['T1059.006']);
	});
});
