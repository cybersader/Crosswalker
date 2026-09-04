/**
 * skip-refresh-am52-orphans.test.ts -- AM-52 (2026-09-04, pass 17, Task C item
 * 2), end to end through the real engine: a skip refresh with a row
 * recategorised between levels reports ZERO new orphans, and the old folder's
 * hub is neither rewritten nor dropped -- it is simply left exactly as it was,
 * still listing the kept row.
 *
 * THE SCENARIO. A framework release recategorises one control from one
 * section (tactic) to another. The vault is refreshed with "Skip existing"
 * chosen, which leaves every note exactly where it is. Before AM-52, the OLD
 * folder -- still holding the kept note, described by no chain of this run --
 * was refused with AM-50's "may have been moved" cause, its hub's curie
 * dropped out of `producedCuries`, and A-8's own acceptance clause ("zero new
 * orphans, skip included") failed on an ordinary refresh no user action caused.
 *
 * WHY `applyEnrichment` (the WRITE pass) NEVER TOUCHES THE OLD FOLDER HERE.
 * Both write loops only call `applyEnrichment` with `enrichRecords` -- the rows
 * actually CREATED this run -- never `keptRecords`. When every row in a batch
 * is kept (this scenario: nothing in the source changed shape enough to force
 * a write), `enrichRecords` is empty and the write pass does not run at all;
 * only `markKeptHubsProduced` (bookkeeping, no vault I/O) runs, and it is the
 * one this test exercises. The old hub note is therefore asserted UNCHANGED,
 * not rewritten -- that is the correct outcome, not a gap: nothing this run
 * did needed it touched.
 */

import { TFile, TFolder } from 'obsidian';
import { generateFromRecipe } from '../src/generation/generation-engine';
import type { Recipe } from '../src/render';
import type { ParsedData } from '../src/types/config';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const yaml = require('js-yaml') as { load: (s: string) => unknown };

function makeApp() {
	const files = new Map<string, string>();
	const folders = new Set<string>(['']);
	const rename = async (file: { path: string }, to: string) => {
		const text = files.get(file.path);
		files.delete(file.path);
		if (text !== undefined) files.set(to, text);
		file.path = to;
	};
	const app = {
		vault: {
			getMarkdownFiles: () => [...files.keys()].map((p) => new TFile(p)),
			getFiles: () => [...files.keys()].map((p) => new TFile(p)),
			getAbstractFileByPath: (path: string) => {
				if (files.has(path)) return new TFile(path);
				if (folders.has(path)) return new TFolder(path);
				return null;
			},
			create: async (path: string, content: string) => { files.set(path, content); return new TFile(path); },
			modify: async (file: { path: string }, content: string) => { files.set(file.path, content); },
			read: async (file: { path: string }) => files.get(file.path) ?? '',
			cachedRead: async (file: { path: string }) => files.get(file.path) ?? '',
			createFolder: async (path: string) => { folders.add(path); },
			rename,
		},
		metadataCache: {
			getFileCache: (file: { path: string }) => {
				const text = files.get(file.path);
				if (text === undefined) return null;
				const match = /^---\n([\s\S]*?)\n---/.exec(text.replace(/\r\n/g, '\n'));
				if (!match) return { frontmatter: undefined };
				try { return { frontmatter: (yaml.load(match[1]) ?? {}) as Record<string, unknown> }; }
				catch { return { frontmatter: undefined }; }
			},
		},
		fileManager: { renameFile: rename },
	};
	return { app: app as any, files };
}

const BASE = 'Ontologies';
const ONT = 'skiprecat';

function recipe(): Recipe {
	return {
		recipe: 'skip-recat-am52',
		source: { ontology: ONT, levels: ['tactic', 'leaf'] },
		target: {
			layout: [
				{ level: 'tactic', mechanism: 'folder', template: '{tactic}' },
				{ level: 'leaf', mechanism: 'file', template: '{id}.md' },
			],
			enrichment: { children_lists: true, facet_notes: 'none', parent_note: 'sibling', level_hubs: 'notes' },
		},
	};
}

/** T1 in Persistence, T2 in Discovery. */
function parsedV1(): ParsedData {
	const rows = [
		{ id: 'T1', name: 'One', tactic: 'Persistence' },
		{ id: 'T2', name: 'Two', tactic: 'Discovery' },
	];
	return { columns: ['id', 'name', 'tactic'], rows, rowCount: rows.length };
}

/** Same two rows -- but the source release moved T1 from Persistence to IA. */
function parsedV2Recategorized(): ParsedData {
	const rows = [
		{ id: 'T1', name: 'One', tactic: 'IA' },
		{ id: 'T2', name: 'Two', tactic: 'Discovery' },
	];
	return { columns: ['id', 'name', 'tactic'], rows, rowCount: rows.length };
}

function frontmatterOf(text: string): any {
	const match = /^---\n([\s\S]*?)\n---/.exec(text.replace(/\r\n/g, '\n'));
	return match ? (yaml.load(match[1]) as any) : {};
}

function run(app: any, rec: Recipe, parsed: ParsedData, overwriteMode: 'skip' | 'replace', importSet: any) {
	return generateFromRecipe(app, parsed, rec, {
		basePath: BASE,
		overwriteMode,
		createFolders: true,
		sourceFileName: 'source.csv',
		importSet,
		curieLocalPart: (row: Record<string, unknown>) => String(row.id),
	});
}

describe('AM-52 end to end: a skip refresh with a row recategorised between levels', () => {
	async function seedThenRefresh() {
		const { app, files } = makeApp();
		const first = await run(app, recipe(), parsedV1(), 'replace', 'new');
		expect(first.errors).toEqual([]);
		expect(files.has(`${BASE}/Persistence/T1.md`)).toBe(true);
		expect(files.has(`${BASE}/Persistence/Persistence.md`)).toBe(true);
		const setId = frontmatterOf(files.get(`${BASE}/Persistence/T1.md`)!)?._crosswalker?.import_set?.id;
		expect(typeof setId).toBe('string');
		const persistenceHubBefore = files.get(`${BASE}/Persistence/Persistence.md`)!;

		const second = await run(app, recipe(), parsedV2Recategorized(), 'skip', { id: setId });
		return { app, files, second, persistenceHubBefore };
	}

	it('reports zero new orphans -- the recategorised row\'s old folder is accounted for, not reported vanished', async () => {
		const { second } = await seedThenRefresh();
		expect(second.errors).toEqual([]);
		expect(second.orphansChecked).toBe(true);
		expect(second.orphans ?? []).toEqual([]);
	});

	it('names no folder as moved: the bookkeeping pass produced no warning at all for this run', async () => {
		const { second } = await seedThenRefresh();
		const warned = (second.warnings ?? []).map((w) => w.message).join('\n');
		expect(warned).not.toContain('have been moved');
		expect(warned).not.toContain('Could not account for the notes');
	});

	it('kept T1 exactly where it was, moved nothing, and created nothing for the new (unwritten) IA folder', async () => {
		const { files, second } = await seedThenRefresh();
		expect(second.skipped).toEqual(expect.arrayContaining([`${BASE}/Persistence/T1.md`, `${BASE}/Discovery/T2.md`]));
		expect(second.created).toEqual([]);
		expect(second.moved ?? []).toEqual([]);
		expect(files.has(`${BASE}/IA/T1.md`)).toBe(false);
		expect(files.has(`${BASE}/IA/IA.md`)).toBe(false);
	});

	it('leaves the old hub exactly as it was -- nothing in this run needed it rewritten, and it still lists T1', async () => {
		const { files, persistenceHubBefore } = await seedThenRefresh();
		// A run where every row is kept never calls the WRITE pass at all (see the
		// file header), so the hub the run KEPT accounting for is not touched --
		// asserted byte-for-byte, which is the strongest form of "still there".
		expect(files.get(`${BASE}/Persistence/Persistence.md`)).toBe(persistenceHubBefore);
		expect(persistenceHubBefore).toContain('[[T1]]');
	});

	it('control: under Replace the row genuinely moves, Persistence is left with nothing describing it, and its hub is CORRECTLY orphaned -- proving the skip run above reports zero for the right reason, not because nothing is ever checked', async () => {
		const { app, files } = makeApp();
		await run(app, recipe(), parsedV1(), 'replace', 'new');
		const setId = frontmatterOf(files.get(`${BASE}/Persistence/T1.md`)!)?._crosswalker?.import_set?.id;

		const second = await run(app, recipe(), parsedV2Recategorized(), 'replace', { id: setId });
		expect(second.errors).toEqual([]);
		// Replace really did move it, unlike skip.
		expect(files.has(`${BASE}/IA/T1.md`)).toBe(true);
		expect(files.has(`${BASE}/Persistence/T1.md`)).toBe(false);
		// Persistence now holds NOTHING this run described (T1 genuinely left, T2
		// was never there), so its hub is correctly reported orphaned -- the
		// falsifying case for "zero orphans" as a blanket answer, and the reason
		// AM-52's `keptFolders` gate is POSITIVE evidence (a real kept row) rather
		// than "the folder is merely undescribed".
		expect((second.orphans ?? []).map((o) => o.curie)).toContain(`${ONT}:hub/persistence`);
	});
});
