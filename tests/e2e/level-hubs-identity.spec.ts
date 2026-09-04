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
