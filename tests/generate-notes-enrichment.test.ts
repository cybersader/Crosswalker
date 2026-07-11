/**
 * generate-notes-enrichment.test.ts — Pass 1.5 batch enrichment now runs on
 * BOTH generation entry points, not just `generateFromRecipe`.
 *
 * Closes the connectedness gap found in the fast-path round: the wizard /
 * workbench call `generateNotes` (src/generation/generation-engine.ts), which
 * previously never ran the Pass 1.5 enrichment phase (children lists, facet
 * hub notes, edgeCount) even when `options.recipeOverride` carried
 * `target.enrichment` and `options.facetsForRow` was supplied — only
 * `generateFromRecipe` (used by the golden harness / SSSOM import) ran it.
 * `generateNotes` now shares the exact same `applyEnrichment` phase (see
 * generation-engine.ts), so it must behave identically for the same recipe +
 * rows. This test mirrors tests/enrichment-reimport.test.ts's stateful-vault
 * pattern, driven through `generateNotes` instead of `generateFromRecipe`, plus
 * a negative case (recipe without `target.enrichment`).
 */

import { TFile, TFolder } from 'obsidian';
import { generateNotes } from '../src/generation/generation-engine';
import type { Recipe } from '../src/render';
import type { GenerationOptions } from '../src/generation/generation-engine';
import type { ImportRecipe, ParsedData } from '../src/types/config';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const yaml = require('js-yaml') as { load: (s: string) => unknown };

// ---------------------------------------------------------------------------
// A minimal stateful in-memory vault + app (Map-backed) — same shape as
// tests/enrichment-reimport.test.ts.
// ---------------------------------------------------------------------------

function makeApp() {
	const files = new Map<string, string>();
	const folders = new Set<string>(['']);

	const getAbstractFileByPath = (path: string) => {
		if (files.has(path)) return new TFile(path);
		if (folders.has(path)) return new TFolder(path);
		return null;
	};
	const app = {
		vault: {
			getAbstractFileByPath,
			create: async (path: string, content: string) => {
				files.set(path, content);
				return new TFile(path);
			},
			modify: async (file: { path: string }, content: string) => {
				files.set(file.path, content);
			},
			read: async (file: { path: string }) => files.get(file.path) ?? '',
			createFolder: async (path: string) => {
				folders.add(path);
			},
		},
		metadataCache: {
			getFileCache: (file: { path: string }) => {
				const text = files.get(file.path);
				if (!text) return null;
				const m = /^---\n([\s\S]*?)\n---/.exec(text.replace(/\r\n/g, '\n'));
				if (!m) return { frontmatter: {} };
				return { frontmatter: (yaml.load(m[1]) as Record<string, unknown>) ?? {} };
			},
		},
	};
	return { app: app as any, files };
}

/** The workbench-shaped recipe: source.ontology set (like a recognized-source
 *  recipe), a flat leaf layout, a managed `parent` link, and a `tactic` tag —
 *  same shape as tests/enrichment-reimport.test.ts's RECIPE. */
const RECIPE_WITH_ENRICHMENT: Recipe = {
	recipe: 'attack',
	source: { ontology: 'attack', levels: ['leaf'] },
	target: {
		layout: [{ level: 'leaf', mechanism: 'file', template: '{id}.md' }],
		also_emit: {
			tags: ['tactic/{tactic|tagsafe}'],
			frontmatter: { managed: { parent: '[[{parent}]]' } },
		},
		enrichment: { children_lists: true, facet_notes: 'notes', parent_note: 'sibling' },
	},
};

/** Same recipe, minus target.enrichment — the negative case. */
const RECIPE_WITHOUT_ENRICHMENT: Recipe = {
	recipe: 'attack',
	source: { ontology: 'attack', levels: ['leaf'] },
	target: {
		layout: RECIPE_WITH_ENRICHMENT.target.layout,
		also_emit: RECIPE_WITH_ENRICHMENT.target.also_emit,
	},
};

const ROWS = [
	{ id: 'T1078', parent: '', tactic: 'Persistence' },
	{ id: 'T1078.001', parent: 'T1078', tactic: 'Persistence' },
	{ id: 'T1078.002', parent: 'T1078', tactic: 'Persistence' },
];

function parsed(): ParsedData {
	return { columns: ['id', 'parent', 'tactic'], rows: [...ROWS], rowCount: ROWS.length };
}

/** Minimal legacy config — recipeOverride drives path + frontmatter; this only
 *  supplies the filename template (mirrors buildWorkbenchConfig's leaf-template
 *  passthrough) so the CURIE stem matches the recipe's leaf file. */
const CONFIG: Partial<ImportRecipe> = {
	name: 'attack',
	mapping: {
		hierarchy: [],
		frontmatter: [],
		links: [],
		body: [],
		filename: { template: '{id}.md', sanitize: true },
	},
};

function baseOptions(recipeOverride: Recipe): GenerationOptions {
	return {
		basePath: 'Frameworks',
		overwriteMode: 'replace',
		createFolders: true,
		recipeOverride,
		facetsForRow: (row: Record<string, unknown>) => [{ namespace: 'tactic', value: String(row.tactic) }],
	};
}

/** Strip the wall-clock provenance field so two imports compare byte-for-byte. */
function normalize(files: Map<string, string>): Record<string, string> {
	const out: Record<string, string> = {};
	for (const [k, v] of files) out[k] = v.replace(/produced_at: "[^"]*"/g, 'produced_at: "<ts>"');
	return out;
}

describe('Pass 1.5 enrichment — generateNotes (wizard/workbench path)', () => {
	it('materializes children + a facet hub and reports edgeCount', async () => {
		const { app, files } = makeApp();
		const result = await generateNotes(app, parsed(), CONFIG, baseOptions(RECIPE_WITH_ENRICHMENT));

		expect(result.errors).toEqual([]);
		expect(result.edgeCount).toBeGreaterThan(0);

		const t1078 = files.get('Frameworks/T1078.md')!;
		expect(t1078).toContain('children:');
		expect(t1078).toContain('[[T1078.001]]');
		expect(t1078).toContain('[[T1078.002]]');

		const hub = files.get('Frameworks/Persistence.md')!;
		expect(hub).toBeDefined();
		expect(hub).toContain('kind: facet');
		expect(hub).toContain('members:');
		expect(hub).toContain('# Persistence');
	});

	it('import twice → byte-identical vault (produced_at normalized)', async () => {
		const { app, files } = makeApp();
		await generateNotes(app, parsed(), CONFIG, baseOptions(RECIPE_WITH_ENRICHMENT));
		const first = normalize(files);
		await generateNotes(app, parsed(), CONFIG, baseOptions(RECIPE_WITH_ENRICHMENT));
		const second = normalize(files);
		expect(second).toEqual(first);
	});

	it('user prose in a hub body survives re-import; members regenerate', async () => {
		const { app, files } = makeApp();
		await generateNotes(app, parsed(), CONFIG, baseOptions(RECIPE_WITH_ENRICHMENT));

		const hubPath = 'Frameworks/Persistence.md';
		const original = files.get(hubPath)!;
		const edited = original
			.replace('# Persistence', '# Persistence\n\nMy tradecraft notes on persistence.')
			.replace('kind: facet', 'kind: facet\nreviewer: alice');
		files.set(hubPath, edited);

		await generateNotes(app, parsed(), CONFIG, baseOptions(RECIPE_WITH_ENRICHMENT));
		const after = files.get(hubPath)!;

		expect(after).toContain('My tradecraft notes on persistence.');
		expect(after).toContain('reviewer: alice');
		expect(after).toContain('members:');
		expect(after).toContain('[[T1078]]');
		const fm = yaml.load(/^---\n([\s\S]*?)\n---/.exec(after)![1]) as Record<string, unknown>;
		expect(fm.members).toEqual(['[[T1078]]', '[[T1078.001]]', '[[T1078.002]]']);
	});

	it('negative: recipe WITHOUT target.enrichment → no hubs, no children, edgeCount undefined', async () => {
		const { app, files } = makeApp();
		const result = await generateNotes(app, parsed(), CONFIG, baseOptions(RECIPE_WITHOUT_ENRICHMENT));

		expect(result.errors).toEqual([]);
		// Matches generateFromRecipe's behavior for a non-enrichment recipe:
		// applyEnrichment never runs, so edgeCount is left unset (not 0).
		expect(result.edgeCount).toBeUndefined();

		const t1078 = files.get('Frameworks/T1078.md')!;
		expect(t1078).toBeDefined();
		expect(t1078).not.toContain('children:');
		expect(files.has('Frameworks/Persistence.md')).toBe(false);
	});
});
