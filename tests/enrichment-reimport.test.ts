/**
 * enrichment-reimport.test.ts — Pass 1.5 re-import safety (design §4/§5 case 4),
 * driven END-TO-END through generateFromRecipe against a stateful in-memory vault.
 *
 * Asserts:
 *   - import twice → byte-identical vault (produced_at wall-clock normalized, the
 *     one known non-deterministic field);
 *   - GenerationResult.edgeCount is populated (design §3.5 / case 6 field only);
 *   - user prose added to a facet hub body survives a re-import while `members`
 *     regenerates (managed) and user frontmatter is preserved.
 */

import { TFile, TFolder } from 'obsidian';
import { generateFromRecipe } from '../src/generation/generation-engine';
import type { Recipe } from '../src/render';
import type { ParsedData } from '../src/types/config';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const yaml = require('js-yaml') as { load: (s: string) => unknown };

// ---------------------------------------------------------------------------
// A minimal stateful in-memory vault + app (Map-backed).
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

const RECIPE: Recipe = {
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

const ROWS = [
	{ id: 'T1078', parent: '', tactic: 'Persistence' },
	{ id: 'T1078.001', parent: 'T1078', tactic: 'Persistence' },
	{ id: 'T1078.002', parent: 'T1078', tactic: 'Persistence' },
];

function parsed(): ParsedData {
	return { columns: ['id', 'parent', 'tactic'], rows: [...ROWS], rowCount: ROWS.length };
}

const OPTS = {
	basePath: 'Frameworks',
	overwriteMode: 'replace' as const,
	createFolders: true,
	strictValidation: false, // this test is about enrichment, not Tier 1 conformance
	curieLocalPart: (row: Record<string, unknown>) => String(row.id),
	facetsForRow: (row: Record<string, unknown>) => [{ namespace: 'tactic', value: String(row.tactic) }],
};

/** Strip the wall-clock provenance field so two imports compare byte-for-byte. */
function normalize(files: Map<string, string>): Record<string, string> {
	const out: Record<string, string> = {};
	for (const [k, v] of files) out[k] = v.replace(/produced_at: "[^"]*"/g, 'produced_at: "<ts>"');
	return out;
}

describe('Pass 1.5 re-import — end-to-end via generateFromRecipe', () => {
	it('materializes children + a facet hub and reports edgeCount', async () => {
		const { app, files } = makeApp();
		const result = await generateFromRecipe(app, parsed(), RECIPE, OPTS);

		expect(result.edgeCount).toBeGreaterThan(0);
		// T1078 note gained children; a Persistence hub exists with members.
		const t1078 = files.get('Frameworks/T1078.md')!;
		expect(t1078).toContain('children:');
		expect(t1078).toContain('[[T1078.001]]');
		const hub = files.get('Frameworks/Persistence.md')!;
		expect(hub).toContain('kind: facet');
		expect(hub).toContain('members:');
		expect(hub).toContain('# Persistence');
	});

	it('import twice → byte-identical vault (produced_at normalized)', async () => {
		const { app, files } = makeApp();
		await generateFromRecipe(app, parsed(), RECIPE, OPTS);
		const first = normalize(files);
		await generateFromRecipe(app, parsed(), RECIPE, OPTS);
		const second = normalize(files);
		expect(second).toEqual(first);
	});

	it('user prose in a hub body survives re-import; members regenerate', async () => {
		const { app, files } = makeApp();
		await generateFromRecipe(app, parsed(), RECIPE, OPTS);

		// User edits the hub note: adds prose below the H1 + a hand-added frontmatter key.
		const hubPath = 'Frameworks/Persistence.md';
		const original = files.get(hubPath)!;
		const edited = original
			.replace('# Persistence', '# Persistence\n\nMy tradecraft notes on persistence.')
			.replace('kind: facet', 'kind: facet\nreviewer: alice');
		files.set(hubPath, edited);

		// Re-import.
		await generateFromRecipe(app, parsed(), RECIPE, OPTS);
		const after = files.get(hubPath)!;

		expect(after).toContain('My tradecraft notes on persistence.'); // prose survived
		expect(after).toContain('reviewer: alice'); // user frontmatter survived
		expect(after).toContain('members:'); // members regenerated
		expect(after).toContain('[[T1078]]');
		const fm = yaml.load(/^---\n([\s\S]*?)\n---/.exec(after)![1]) as Record<string, unknown>;
		expect(fm.members).toEqual(['[[T1078]]', '[[T1078.001]]', '[[T1078.002]]']);
	});
});
