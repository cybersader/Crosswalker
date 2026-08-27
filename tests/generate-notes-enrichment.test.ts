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
import { legacyConfigToRecipe } from '../src/generation/legacy-recipe-shim';
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
			// generateNotes resolves existing notes by identity, which reads the
			// vault markdown list. This double has no pre-existing notes.
			getMarkdownFiles: () => [...files.keys()].map((path) => new TFile(path)),
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
		importSet: { id: 'iset-abc123' },
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

		const stamps = [...files.values()].map((content) => {
			const fm = yaml.load(/^---\n([\s\S]*?)\n---/.exec(content)![1]) as any;
			return fm._crosswalker.import_set;
		});
		expect(new Set(stamps.map((stamp) => stamp.id))).toEqual(new Set(['iset-abc123']));
		expect(stamps.every((stamp) => stamp.scheme === 'endpoint-v1')).toBe(true);
	});

	it('reports removed concepts with enrichment on without misreporting produced hubs', async () => {
		const { app } = makeApp();
		await generateNotes(app, parsed(), CONFIG, baseOptions(RECIPE_WITH_ENRICHMENT));
		const reduced: ParsedData = { columns: ['id', 'parent', 'tactic'], rows: ROWS.slice(0, 2), rowCount: 2 };
		const result = await generateNotes(app, reduced, CONFIG, baseOptions(RECIPE_WITH_ENRICHMENT));
		expect(result.errors).toEqual([]);
		expect(result.orphans).toEqual([{ curie: 'attack:T1078.002', path: 'Frameworks/T1078.002.md' }]);
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
		// Prose goes BELOW the managed region's end marker. Since 2026-08-27 a hub
		// note's managed content lives inside `crosswalker:body`, which retires
		// mergeHubBody's "first H1 is managed, everything after it is prose"
		// formatting heuristic (contract §2.2 item 4). The marker is visible while
		// editing, invisible while reading: that asymmetry is what makes the
		// boundary something a user can respect.
		const edited = original
			.replace('<!-- crosswalker:body:end -->', '<!-- crosswalker:body:end -->\n\nMy tradecraft notes on persistence.')
			.replace('kind: facet', 'kind: facet\nreviewer: alice');
		expect(edited).toContain('<!-- crosswalker:body:end -->\n\nMy tradecraft notes');
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

/**
 * Classic (non-workbench) wizard path — generateNotes with NO recipeOverride,
 * so the recipe comes from legacyConfigToRecipe (src/generation/legacy-recipe-shim.ts)
 * instead of the workbench. Regression for the uniformity gap found alongside
 * spec §7o: legacyConfigToRecipe never set target.enrichment, so
 * `enrichmentEnabled` was always false for classic-mode imports — children
 * lists / facet hub notes / edgeCount silently never ran, even though the
 * CHANGELOG claims both generation entry points behave identically (see
 * generate-notes-enrichment.test.ts's own file header). Fixed by giving the
 * shim the same enrichment defaults as the browsable-framework preset
 * (children_lists: true, facet_notes: 'notes', parent_note: 'sibling').
 *
 * facet_notes stays a no-op here on purpose: the classic MappingConfig has no
 * tag role yet (see LEGACY_DEFAULT_ENRICHMENT's comment), so this only proves
 * children_lists — the mechanism classic mode already had wiring for via
 * mapping.links.
 */
describe('Pass 1.5 enrichment — generateNotes (classic/legacy-shim path)', () => {
	const CLASSIC_CONFIG: Partial<ImportRecipe> = {
		name: 'attack-classic',
		mapping: {
			hierarchy: [],
			frontmatter: [],
			links: [{ column: 'parent', type: 'wikilink', location: 'frontmatter', frontmatterKey: 'parent' }],
			body: [],
			filename: { template: '{id}.md', sanitize: true },
		},
	};

	function classicOptions(): GenerationOptions {
		// No recipeOverride, no facetsForRow — exactly what the classic (non-
		// workbench) wizard step 4 passes (import-wizard.ts's doGenerate only
		// sets these inside `workbenchMode && this.workbench`).
		return { basePath: 'Frameworks', importSet: { id: 'iset-abc123' }, overwriteMode: 'replace', createFolders: true };
	}

	it('legacyConfigToRecipe now carries default enrichment (was undefined)', () => {
		const recipe = legacyConfigToRecipe(CLASSIC_CONFIG as ImportRecipe);
		expect(recipe.target.enrichment).toEqual({
			children_lists: true,
			facet_notes: 'notes',
			parent_note: 'sibling',
		});
	});

	it('children lists materialize via the existing mapping.links → parent wiring', async () => {
		const { app, files } = makeApp();
		const result = await generateNotes(app, parsed(), CLASSIC_CONFIG, classicOptions());

		expect(result.errors).toEqual([]);
		// Previously undefined (applyEnrichment never ran for classic mode).
		expect(result.edgeCount).toBeGreaterThan(0);

		const t1078 = files.get('Frameworks/T1078.md')!;
		expect(t1078).toContain('children:');
		expect(t1078).toContain('[[T1078.001]]');
		expect(t1078).toContain('[[T1078.002]]');

		// facet_notes: 'notes' is a documented no-op today — classic mode has no
		// tag role, so no facet memberships are ever collected and no hub notes
		// materialize. Nothing beyond the 3 source rows should be created.
		expect(result.created.length).toBe(3);
	});
});
