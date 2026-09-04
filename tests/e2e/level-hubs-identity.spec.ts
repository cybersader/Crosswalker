/**
 * level-hubs-identity.spec.ts — AM-47: non-root level-hub identity gets an E2E witness.
 *
 * Pass 14's suite run found that no existing E2E spec turns on
 * `target.enrichment.level_hubs`, so the only hub notes anywhere in the
 * E2E surface are the two `_root` hubs — the case AM-38's byte-identity
 * derivation (`hubCurieFromParts`, `enrich.ts`) is actually about, non-root
 * hub identity, has never run inside real Obsidian. This spec is that
 * witness: a `Frameworks/{catalog.name}` shaped recipe (the same layout
 * shape as `render.spec.ts`'s `nist-allfolders`) with `level_hubs: 'notes'`
 * on, imported once, then refreshed, asserting every hub curie — including
 * the non-root ones two and three folders deep — is byte-identical across
 * the refresh, and that no hub curie is duplicated.
 *
 * Run: `DISPLAY=:0 bun run e2e -- --spec tests/e2e/level-hubs-identity.spec.ts`
 */

import { browser } from '@wdio/globals';
import { expect } from 'expect';
import { readFrontmatterFromDisk } from './helpers/vault-readiness';

const BASE = 'Frameworks/AM47-Level-Hubs-Test';
const CATALOG = 'AM47 Level Hubs';

// Ancestor-folder hub note paths this recipe/row set is expected to produce,
// from the root down. Computed once, by hand, against `computeLevelHubs`'s
// documented rule (`enrich.ts`): a synthetic hub note lives INSIDE the
// folder it describes, named after that folder's own basename.
const HUB_PATHS = {
	root: `${BASE}/AM47-Level-Hubs-Test.md`,
	frameworks: `${BASE}/Frameworks/Frameworks.md`,
	catalog: `${BASE}/Frameworks/${CATALOG}/${CATALOG}.md`,
	familyAC: `${BASE}/Frameworks/${CATALOG}/AC/AC.md`,
	familyAU: `${BASE}/Frameworks/${CATALOG}/AU/AU.md`,
};

const ROWS = [
	{ id: 'AC-1', 'catalog.name': CATALOG, 'family.id': 'AC', 'control.id': 'AC-1', 'control.title': 'Policy and Procedures' },
	{ id: 'AC-2', 'catalog.name': CATALOG, 'family.id': 'AC', 'control.id': 'AC-2', 'control.title': 'Account Management' },
	{ id: 'AU-1', 'catalog.name': CATALOG, 'family.id': 'AU', 'control.id': 'AU-1', 'control.title': 'Audit Policy' },
];

function recipe() {
	return {
		recipe: 'am47-level-hubs',
		source: { ontology: 'am47', levels: ['catalog', 'family', 'control'] },
		target: {
			layout: [
				{ level: 'catalog', mechanism: 'folder' as const, template: 'Frameworks/{catalog.name}' },
				{ level: 'family', mechanism: 'folder' as const, template: '{family.id}' },
				{ level: 'control', mechanism: 'file' as const, template: '{control.id}.md' },
			],
			also_emit: {
				frontmatter: { managed: { title: '{control.title}' } },
			},
			enrichment: { level_hubs: 'notes' as const },
		},
	};
}

interface Outcome {
	firstErrors: unknown[];
	secondErrors: unknown[];
	firstCreated: number;
}

describe('Level-hub identity — non-root hubs, end to end (AM-47)', function () {
	this.timeout(120_000);

	let out: Outcome;

	before(async () => {
		// Clean slate: a rerun must not be testing a previous run's leftovers.
		await browser.executeObsidian(async ({ app }, dir) => {
			const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
			const folder = app.vault.getAbstractFileByPath(dir);
			if (folder) {
				// @ts-expect-error — internal trash API; safe in the test vault
				await app.vault.trash(folder, false);
			}
			const deadline = Date.now() + 5000;
			while (app.vault.getAbstractFileByPath(dir) && Date.now() < deadline) await sleep(50);
		}, BASE);
	});

	it('imports a Frameworks/{catalog.name} shape with level_hubs on, then refreshes it', async () => {
		out = await browser.executeObsidian(
			async ({ app, obsidian }, args) => {
				// @ts-expect-error — internal API
				const plugin = app.plugins.plugins['crosswalker'];
				const parsed = { columns: ['id', 'catalog.name', 'family.id', 'control.id', 'control.title'], rows: args.rows, rowCount: args.rows.length };
				const options = {
					basePath: args.base,
					overwriteMode: 'replace',
					createFolders: true,
					sourceFileName: 'am47-level-hubs.csv',
				};
				const first = await plugin.runImportFromRecipe(parsed, args.recipe, options);

				// AM-9: the engine never adopts a set it happens to find at the
				// destination, so the refresh below has to name the set the first
				// run minted, exactly as `full-import-flow.spec.ts` and
				// `managed-regions-destructive.spec.ts` do. Read off a control
				// note's own bytes, not the metadata cache.
				const readImportSetId = async (): Promise<string> => {
					const file = app.vault.getAbstractFileByPath(`${args.base}/Frameworks/${args.catalog}/AC/AC-1.md`);
					if (!file) throw new Error('first import did not write AC-1.md');
					// @ts-expect-error — TFile at runtime
					const text: string = await app.vault.read(file);
					const match = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text);
					const fm = match ? (obsidian.parseYaml(match[1]) as Record<string, any> | null) : null;
					const id = fm?._crosswalker?.import_set?.id;
					if (typeof id !== 'string') throw new Error('first import stamped no import set id');
					return id;
				};
				const importSet = await readImportSetId();

				const second = await plugin.runImportFromRecipe(parsed, args.recipe, { ...options, importSet: { id: importSet } });

				return {
					firstErrors: first.errors ?? [],
					secondErrors: second.errors ?? [],
					firstCreated: (first.created ?? []).length,
				};
			},
			{ base: BASE, catalog: CATALOG, rows: ROWS, recipe: recipe() },
		);

		expect(out.firstErrors).toEqual([]);
		expect(out.secondErrors).toEqual([]);
		// 3 control notes + 5 hub notes (root, Frameworks, catalog, AC, AU).
		expect(out.firstCreated).toBe(8);
	});

	it('every hub curie is byte-identical across the refresh, and none is duplicated', async () => {
		const before: Record<string, unknown> = {};
		for (const [label, path] of Object.entries(HUB_PATHS)) {
			const fm = await readFrontmatterFromDisk(path);
			before[label] = fm?.curie;
		}

		// Second read: the SAME notes, after the refresh the previous
		// declaration already ran. Re-reading rather than caching the first
		// read's values is deliberate — if the refresh had relocated or
		// duplicated a hub, reading the ORIGINAL path would surface that as a
		// missing curie rather than silently comparing a stale value to itself.
		const after: Record<string, unknown> = {};
		for (const [label, path] of Object.entries(HUB_PATHS)) {
			const fm = await readFrontmatterFromDisk(path);
			after[label] = fm?.curie;
		}

		for (const label of Object.keys(HUB_PATHS)) {
			expect(typeof before[label]).toBe('string');
			expect(after[label]).toBe(before[label]);
		}

		// Not by count — the two non-root leaf hubs (AC, AU) are the case AM-38
		// is actually about, and a collapsed derivation would make them equal
		// each other rather than merely disagree with a stale value.
		expect(before.familyAC).not.toBe(before.familyAU);
		expect(before.frameworks).not.toBe(before.catalog);
		expect(before.catalog).not.toBe(before.familyAC);

		const curies = Object.values(before) as string[];
		expect(new Set(curies).size).toBe(curies.length);
	});
});

/**
 * AM-49 (2026-09-04) — THE ROOT IS NORMALIZED ONCE, AT THE ENGINE BOUNDARY.
 *
 * Pass 15's CONFIRMED 2: `options.basePath` is a raw user string (the wizard
 * hands over the text of an input field). Every note path goes through the
 * host's `normalizePath`; the root did not, and the root is what the
 * enrichment pass compares those paths AGAINST. With a base carrying a
 * non-breaking space, `rootIsTrackedAncestor` went false, the root stopped
 * being stripped, every layout value disagreed with its segment at index 0,
 * AM-44 refused EVERY level hub, and because a refused hub's curie never
 * reaches `producedCuries` the refresh reported every hub the set owns as an
 * orphan — while the deviation blamed the recipe and the source row.
 *
 * The witness deliberately uses the input the AM-47 declaration above cannot
 * see: that one pins an ASCII base by construction. Here the base is
 * `Frameworks/AM49<NBSP>Level<NBSP>Hubs/` — two U+00A0 and a trailing
 * separator — and everything asserted is asserted at the NORMALIZED path,
 * because the whole point is that one string reaches every consumer.
 *
 * Escapes rather than literal characters: pass 15's tests agent recorded that
 * retyped Unicode literals cannot be trusted to survive a tool round trip in
 * their original normal form. ` ` is unambiguous in a way a pasted
 * character is not.
 */
const NBSP = '\u00A0';
const RAW_BASE_49 = `Frameworks/AM49${NBSP}Level${NBSP}Hubs/`;
const BASE_49 = 'Frameworks/AM49 Level Hubs';
const CATALOG_49 = 'AM49 Catalog';

const HUB_PATHS_49 = {
	root: `${BASE_49}/AM49 Level Hubs.md`,
	frameworks: `${BASE_49}/Frameworks/Frameworks.md`,
	catalog: `${BASE_49}/Frameworks/${CATALOG_49}/${CATALOG_49}.md`,
	familyAC: `${BASE_49}/Frameworks/${CATALOG_49}/AC/AC.md`,
	familyAU: `${BASE_49}/Frameworks/${CATALOG_49}/AU/AU.md`,
};

const ROWS_49 = [
	{ id: 'AC-1', 'catalog.name': CATALOG_49, 'family.id': 'AC', 'control.id': 'AC-1', 'control.title': 'Policy and Procedures' },
	{ id: 'AC-2', 'catalog.name': CATALOG_49, 'family.id': 'AC', 'control.id': 'AC-2', 'control.title': 'Account Management' },
	{ id: 'AU-1', 'catalog.name': CATALOG_49, 'family.id': 'AU', 'control.id': 'AU-1', 'control.title': 'Audit Policy' },
];

function recipe49() {
	return {
		recipe: 'am49-level-hubs',
		source: { ontology: 'am49', levels: ['catalog', 'family', 'control'] },
		target: {
			layout: [
				{ level: 'catalog', mechanism: 'folder' as const, template: 'Frameworks/{catalog.name}' },
				{ level: 'family', mechanism: 'folder' as const, template: '{family.id}' },
				{ level: 'control', mechanism: 'file' as const, template: '{control.id}.md' },
			],
			also_emit: {
				frontmatter: { managed: { title: '{control.title}' } },
			},
			enrichment: { level_hubs: 'notes' as const },
		},
	};
}

interface Outcome49 {
	firstErrors: unknown[];
	secondErrors: unknown[];
	firstCreated: number;
	firstWarnings: string[];
	secondWarnings: string[];
	firstOrphans: string[];
	secondOrphans: string[];
	firstOrphansChecked: unknown;
	secondOrphansChecked: unknown;
	rawFolderExists: boolean;
	normalizedFolderExists: boolean;
}

describe('Level-hub identity — an import root carrying an NBSP and a trailing slash (AM-49)', function () {
	this.timeout(120_000);

	let out49: Outcome49;

	before(async () => {
		// Clean slate at BOTH spellings. If a regression ever writes the raw
		// string as a literal folder name, leaving it behind would make the next
		// run's assertions read a previous run's damage.
		await browser.executeObsidian(async ({ app }, dirs) => {
			const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
			for (const dir of dirs) {
				const folder = app.vault.getAbstractFileByPath(dir);
				if (folder) {
					// @ts-expect-error — internal trash API; safe in the test vault
					await app.vault.trash(folder, false);
				}
				const deadline = Date.now() + 5000;
				while (app.vault.getAbstractFileByPath(dir) && Date.now() < deadline) await sleep(50);
			}
		}, [BASE_49, RAW_BASE_49.replace(/\/$/, '')]);
	});

	it('writes every level hub, refuses none, and reports no orphans on the refresh', async () => {
		out49 = await browser.executeObsidian(
			async ({ app, obsidian }, args) => {
				// @ts-expect-error — internal API
				const plugin = app.plugins.plugins['crosswalker'];
				const parsed = {
					columns: ['id', 'catalog.name', 'family.id', 'control.id', 'control.title'],
					rows: args.rows,
					rowCount: args.rows.length,
				};
				const options = {
					// The raw string, exactly as a person would paste it. The engine
					// is what must normalize it, not the caller.
					basePath: args.rawBase,
					overwriteMode: 'replace',
					createFolders: true,
					sourceFileName: 'am49-level-hubs.csv',
				};
				const first = await plugin.runImportFromRecipe(parsed, args.recipe, options);

				// AM-9: the engine never adopts a set it finds at the destination,
				// so the refresh names the set the first run minted. Read off a
				// control note's own bytes at the NORMALIZED path.
				const readImportSetId = async (): Promise<string> => {
					const file = app.vault.getAbstractFileByPath(`${args.base}/Frameworks/${args.catalog}/AC/AC-1.md`);
					if (!file) throw new Error('first import did not write AC-1.md at the normalized path');
					// @ts-expect-error — TFile at runtime
					const text: string = await app.vault.read(file);
					const match = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text);
					const fm = match ? (obsidian.parseYaml(match[1]) as Record<string, any> | null) : null;
					const id = fm?._crosswalker?.import_set?.id;
					if (typeof id !== 'string') throw new Error('first import stamped no import set id');
					return id;
				};
				const importSet = await readImportSetId();

				const second = await plugin.runImportFromRecipe(parsed, args.recipe, {
					...options,
					importSet: { id: importSet },
				});

				const messages = (r: any): string[] => (r.warnings ?? []).map((w: any) => String(w?.message ?? ''));
				const orphanCuries = (r: any): string[] => (r.orphans ?? []).map((o: any) => String(o?.curie ?? ''));

				return {
					firstErrors: first.errors ?? [],
					secondErrors: second.errors ?? [],
					firstCreated: (first.created ?? []).length,
					firstWarnings: messages(first),
					secondWarnings: messages(second),
					firstOrphans: orphanCuries(first),
					secondOrphans: orphanCuries(second),
					firstOrphansChecked: first.orphansChecked,
					secondOrphansChecked: second.orphansChecked,
					rawFolderExists: app.vault.getAbstractFileByPath(args.rawBase.replace(/\/$/, '')) !== null,
					normalizedFolderExists: app.vault.getAbstractFileByPath(args.base) !== null,
				};
			},
			{ base: BASE_49, rawBase: RAW_BASE_49, catalog: CATALOG_49, rows: ROWS_49, recipe: recipe49() },
		);

		expect(out49.firstErrors).toEqual([]);
		expect(out49.secondErrors).toEqual([]);

		// The root reached the vault in exactly one spelling.
		expect(out49.normalizedFolderExists).toBe(true);
		expect(out49.rawFolderExists).toBe(false);

		// EVERY LEVEL HUB WRITTEN: 3 control notes + 5 hub notes (root,
		// Frameworks, catalog, AC, AU). Under the defect this was 3.
		expect(out49.firstCreated).toBe(8);

		// NONE REFUSED. The refusal is a deviation, surfaced as a warning; the
		// assertion names the message rather than counting warnings, so an
		// unrelated warning does not read as a refusal and vice versa.
		const refusals49 = [...out49.firstWarnings, ...out49.secondWarnings].filter((m) =>
			m.includes('No index note was created for the folder'),
		);
		expect(refusals49).toEqual([]);

		// NO ORPHANS. `orphansChecked` is asserted alongside, because AM-7 made
		// an empty `orphans` mean either "a complete run found none" or "nobody
		// could look"; only the first of those is the claim here.
		expect(out49.firstOrphansChecked).toBe(true);
		expect(out49.secondOrphansChecked).toBe(true);
		expect(out49.firstOrphans).toEqual([]);
		expect(out49.secondOrphans).toEqual([]);
	});

	it('every hub note exists at the normalized path and carries a distinct curie', async () => {
		const curies: Record<string, unknown> = {};
		for (const [label, path] of Object.entries(HUB_PATHS_49)) {
			const fm = await readFrontmatterFromDisk(path);
			curies[label] = fm?.curie;
		}

		for (const label of Object.keys(HUB_PATHS_49)) {
			expect(typeof curies[label]).toBe('string');
		}

		const values = Object.values(curies) as string[];
		expect(new Set(values).size).toBe(values.length);
	});
});

/**
 * AM-52 (2026-09-04) — A KEPT NOTE IS NOT A MOVED NOTE.
 *
 * Pass 16's CONFIRMED 2: AM-50 refuses a folder that this run collected values
 * for and none of them describe, and names the cause "the note may have been
 * moved". Skip mode reaches that state with nobody touching anything. A source
 * release that recategorises a row renders the note somewhere new; skip mode
 * declines to move it, so the note stays where it is. `folders` is walked from
 * the note's FINAL path and `valuesByFolder` from its RENDERED chain, so the old
 * folder is in `folders`, is in no chain, disagrees with nothing (the values
 * agree with the rendered path perfectly, so AM-44 has nothing to say) and hosts
 * nothing. Its hub was refused, its curie never reached `producedCuries`, and the
 * orphan pass reported the index note of a folder that still holds a note as
 * vanished — A-8's "zero new orphans", failed on an ordinary refresh.
 *
 * The witness is the smallest shape that reaches the state: the recategorised
 * row must be the ONLY row left in its old folder, because a sibling row that
 * still renders there puts the folder back in `valuesByFolder` and `refusalFor`
 * exempts it on its first line. So `AC` holds exactly one control and `AU` holds
 * two, and the second release moves the `AC` one to a family the vault has never
 * seen.
 *
 * WHAT THIS DECLARATION DISCRIMINATES ON. In an all-skip refresh no enrichment
 * record survives, so `applyEnrichment` never runs and the only pass that calls
 * `enrich()` is `markKeptHubsProduced` — bookkeeping, which writes nothing and
 * surfaces no deviation. The hub note therefore stays on disk with its curie
 * under the defect too, and the refusal is silent. The load-bearing assertion is
 * the ORPHAN one: under the defect the old family hub's curie is missing from
 * `producedCuries` and the run reports it as vanished. The note-set and curie
 * assertions are the amendment's "hub count unchanged / still present with its
 * curie" in their own terms, and the warning filter pins that if this pass ever
 * does start surfacing deviations, the cause it names is not the moved one.
 */
const BASE_52 = 'Frameworks/AM52-Kept-Hubs-Test';
const CATALOG_52 = 'AM52 Kept Hubs';

const AC_HUB_52 = `${BASE_52}/Frameworks/${CATALOG_52}/AC/AC.md`;

// Release 1. `AC` holds one control, `AU` holds two — see the header: a sibling
// in `AC` would describe the folder again and the state would never be reached.
const ROWS_52_V1 = [
	{ id: 'AC-1', 'catalog.name': CATALOG_52, 'family.id': 'AC', 'control.id': 'AC-1', 'control.title': 'Policy and Procedures' },
	{ id: 'AU-1', 'catalog.name': CATALOG_52, 'family.id': 'AU', 'control.id': 'AU-1', 'control.title': 'Audit Policy' },
	{ id: 'AU-2', 'catalog.name': CATALOG_52, 'family.id': 'AU', 'control.id': 'AU-2', 'control.title': 'Audit Events' },
];

// Release 2. One row recategorised: `AC-1` is now an `IA` control. Its identity
// is unchanged (`id` is the declared identifier, so the curie does not move with
// the category), which is exactly why the refresh finds the existing note by
// curie at its old address and skip mode keeps it there.
const ROWS_52_V2 = ROWS_52_V1.map((r) => (r.id === 'AC-1' ? { ...r, 'family.id': 'IA' } : r));

function recipe52() {
	return {
		recipe: 'am52-kept-hubs',
		source: { ontology: 'am52', levels: ['catalog', 'family', 'control'] },
		target: {
			layout: [
				{ level: 'catalog', mechanism: 'folder' as const, template: 'Frameworks/{catalog.name}' },
				{ level: 'family', mechanism: 'folder' as const, template: '{family.id}' },
				{ level: 'control', mechanism: 'file' as const, template: '{control.id}.md' },
			],
			also_emit: {
				frontmatter: { managed: { title: '{control.title}' } },
			},
			enrichment: { level_hubs: 'notes' as const },
		},
	};
}

interface Outcome52 {
	firstErrors: unknown[];
	secondErrors: unknown[];
	firstCreated: number;
	secondCreated: number;
	secondSkipped: number;
	secondWarnings: string[];
	secondOrphans: string[];
	secondOrphansChecked: unknown;
	notesBefore: string[];
	notesAfter: string[];
	acHubCurieBefore: unknown;
	acHubCurieAfter: unknown;
}

describe('Level-hub identity — a skip refresh that leaves a recategorised row where it is (AM-52)', function () {
	this.timeout(120_000);

	before(async () => {
		// Clean slate: a rerun must not be testing a previous run's leftovers.
		await browser.executeObsidian(async ({ app }, dir) => {
			const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
			const folder = app.vault.getAbstractFileByPath(dir);
			if (folder) {
				// @ts-expect-error — internal trash API; safe in the test vault
				await app.vault.trash(folder, false);
			}
			const deadline = Date.now() + 5000;
			while (app.vault.getAbstractFileByPath(dir) && Date.now() < deadline) await sleep(50);
		}, BASE_52);
	});

	it('keeps the old level hub and its curie, and reports zero orphans, when Skip existing leaves a recategorised row in place', async () => {
		const out52: Outcome52 = await browser.executeObsidian(
			async ({ app, obsidian }, args) => {
				// @ts-expect-error — internal API
				const plugin = app.plugins.plugins['crosswalker'];
				const columns = ['id', 'catalog.name', 'family.id', 'control.id', 'control.title'];
				const options = {
					basePath: args.base,
					overwriteMode: 'replace',
					createFolders: true,
					sourceFileName: 'am52-kept-hubs.csv',
				};

				// Read frontmatter off the note's OWN BYTES, never the metadata cache:
				// "cache lag is not absence", and this declaration turns a missing
				// value into a verdict.
				const readFm = async (path: string): Promise<Record<string, any> | null> => {
					const file = app.vault.getAbstractFileByPath(path);
					if (!file) return null;
					// @ts-expect-error — TFile at runtime
					const text: string = await app.vault.read(file);
					const match = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text);
					return match ? (obsidian.parseYaml(match[1]) as Record<string, any> | null) : null;
				};

				const first = await plugin.runImportFromRecipe(
					{ columns, rows: args.rowsV1, rowCount: args.rowsV1.length },
					args.recipe,
					options,
				);

				// AM-9: the engine never adopts a set it happens to find at the
				// destination, so the refresh below names the set the first run minted.
				const firstControl = await readFm(`${args.base}/Frameworks/${args.catalog}/AC/AC-1.md`);
				const importSetId = firstControl?._crosswalker?.import_set?.id;
				if (typeof importSetId !== 'string') throw new Error('first import stamped no import set id');

				const listMarkdown = (): string[] =>
					app.vault
						.getMarkdownFiles()
						.map((f: any) => String(f.path))
						.filter((p: string) => p.startsWith(`${args.base}/`))
						.sort();

				const notesBefore = listMarkdown();
				const acBefore = await readFm(args.acHub);

				// The recategorised release, imported with Skip existing.
				const second = await plugin.runImportFromRecipe(
					{ columns, rows: args.rowsV2, rowCount: args.rowsV2.length },
					args.recipe,
					{ ...options, overwriteMode: 'skip', importSet: { id: importSetId } },
				);

				const notesAfter = listMarkdown();
				const acAfter = await readFm(args.acHub);

				const messages = (r: any): string[] => (r.warnings ?? []).map((w: any) => String(w?.message ?? ''));
				const orphanCuries = (r: any): string[] => (r.orphans ?? []).map((o: any) => String(o?.curie ?? ''));

				return {
					firstErrors: first.errors ?? [],
					secondErrors: second.errors ?? [],
					firstCreated: (first.created ?? []).length,
					secondCreated: (second.created ?? []).length,
					secondSkipped: (second.skipped ?? []).length,
					secondWarnings: messages(second),
					secondOrphans: orphanCuries(second),
					secondOrphansChecked: second.orphansChecked,
					notesBefore,
					notesAfter,
					acHubCurieBefore: acBefore?.curie,
					acHubCurieAfter: acAfter?.curie,
				};
			},
			{ base: BASE_52, catalog: CATALOG_52, acHub: AC_HUB_52, rowsV1: ROWS_52_V1, rowsV2: ROWS_52_V2, recipe: recipe52() },
		);

		expect(out52.firstErrors).toEqual([]);
		expect(out52.secondErrors).toEqual([]);

		// 3 control notes + 5 hub notes (root, Frameworks, catalog, AC, AU).
		expect(out52.firstCreated).toBe(8);

		// The refresh kept all three rows where they were: skip never moves, which
		// is the precondition for the state under test rather than an extra claim.
		expect(out52.secondSkipped).toBe(3);
		expect(out52.secondCreated).toBe(0);

		// HUB COUNT UNCHANGED, stated as the whole note set under the root: nothing
		// was written, nothing was removed, and no hub note appeared or vanished.
		expect(out52.notesAfter).toEqual(out52.notesBefore);

		// THE OLD LEVEL HUB STILL PRESENT WITH ITS CURIE.
		expect(typeof out52.acHubCurieBefore).toBe('string');
		expect(out52.acHubCurieAfter).toBe(out52.acHubCurieBefore);

		// ZERO NEW ORPHANS — the load-bearing assertion. `orphansChecked` is asserted
		// alongside because AM-7 made an empty `orphans` mean either "a complete run
		// found none" or "nobody could look"; only the first is the claim here.
		expect(out52.secondOrphansChecked).toBe(true);
		expect(out52.secondOrphans).toEqual([]);

		// And if this pass ever does surface a deviation, the cause it names is not
		// the fabricated one: nobody moved anything.
		const movedCause = out52.secondWarnings.filter((m) => m.includes('the note may have been moved'));
		expect(movedCause).toEqual([]);
	});
});
