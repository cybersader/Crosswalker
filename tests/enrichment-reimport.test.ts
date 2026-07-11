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
 *   - the folder-note relocation seam (design §4, "the risky one"): re-import
 *     finds a previously-relocated parent BY CURIE and never duplicates it at
 *     the sibling path; flipping `parent_note` back to `'sibling'` relocates it
 *     back (design §5 case 5, the flip-back decision).
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
			rename: async (file: { path: string }, newPath: string) => {
				const content = files.get(file.path);
				if (content !== undefined) {
					files.delete(file.path);
					files.set(newPath, content);
				}
			},
			delete: async (file: { path: string }) => {
				files.delete(file.path);
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

/** Same rows, but as an AsyncIterable — the streaming-row shape (design §3 step 2 v1 restriction). */
function parsedStreamed(): ParsedData {
	async function* stream() {
		for (const row of ROWS) yield row;
	}
	return { columns: ['id', 'parent', 'tactic'], rows: stream(), rowCount: -1 };
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

// ===========================================================================
// Folder-note relocation — the risky seam (design §4)
// ===========================================================================

// A variadic-folder layout (unlike RECIPE above, which is flat file-only) so a
// root id (T1078, 0 dots) renders straight to T1078.md while a child id
// (T1078.001, 1 dot) nests under T1078/ — the real collision folder-note
// relocation needs. Mirrors BROWSABLE_FRAMEWORK's ragged-tail shape.
const FOLDER_NOTE_RECIPE: Recipe = {
	recipe: 'attack-fn',
	source: { ontology: 'attack-fn', levels: ['tail', 'leaf'] },
	target: {
		layout: [
			{ level: 'tail', mechanism: 'folder', template: '{id}', variadic: { delimiter: '.' } },
			{ level: 'leaf', mechanism: 'file', template: '{id}.md' },
		],
		also_emit: {
			tags: ['tactic/{tactic|tagsafe}'],
			frontmatter: { managed: { parent: '[[{parent}]]' } },
		},
		enrichment: { children_lists: true, facet_notes: 'none', parent_note: 'folder-note' },
	},
};

/** `FOLDER_NOTE_RECIPE`, but with `parent_note` overridden (for the flip-back import). */
function folderNoteRecipe(parentNote: 'sibling' | 'folder-note'): Recipe {
	return {
		...FOLDER_NOTE_RECIPE,
		target: { ...FOLDER_NOTE_RECIPE.target, enrichment: { ...FOLDER_NOTE_RECIPE.target.enrichment, parent_note: parentNote } },
	};
}

describe('Pass 1.5 folder-note relocation — re-import identity (design §4, the risky seam)', () => {
	it('T1078 relocates to T1078/T1078.md; every inbound link still resolves', async () => {
		const { app, files } = makeApp();
		const result = await generateFromRecipe(app, parsed(), FOLDER_NOTE_RECIPE, OPTS);

		expect(files.has('Frameworks/T1078/T1078.md')).toBe(true);
		expect(files.has('Frameworks/T1078.md')).toBe(false); // no stray sibling
		expect(result.created).toContain('Frameworks/T1078/T1078.md');
		expect(result.created).not.toContain('Frameworks/T1078.md');

		const parent = files.get('Frameworks/T1078/T1078.md')!;
		expect(parent).toContain('[[T1078.001]]'); // children list, at the new path
		const child = files.get('Frameworks/T1078/T1078.001.md')!;
		expect(child).toContain('[[T1078]]'); // basename parent link — resolves regardless of T1078's folder
	});

	it('re-import finds the relocated parent BY CURIE — byte-identical vault, zero duplicates', async () => {
		const { app, files } = makeApp();
		await generateFromRecipe(app, parsed(), FOLDER_NOTE_RECIPE, OPTS);
		const first = normalize(files);

		const result = await generateFromRecipe(app, parsed(), FOLDER_NOTE_RECIPE, OPTS);
		const second = normalize(files);

		expect(second).toEqual(first); // byte-identical (produced_at normalized)
		expect(files.has('Frameworks/T1078.md')).toBe(false); // still no stray duplicate
		expect([...files.keys()].filter((p) => p.endsWith('T1078.md'))).toEqual(['Frameworks/T1078/T1078.md']);
		// Steady state: T1078 is ALREADY folder-note-shaped, so relocation is a
		// no-op (enrich()'s idempotency guard) — no relocation deviation on the
		// re-import, unlike the very first import (which DOES report one).
		expect(result.warnings ?? []).toEqual([]);
	});

	it('a third import with parent_note flipped back to sibling relocates T1078 back (least-surprising, design §5 flip-back)', async () => {
		const { app, files } = makeApp();
		await generateFromRecipe(app, parsed(), FOLDER_NOTE_RECIPE, OPTS); // import 1: folder-note
		await generateFromRecipe(app, parsed(), FOLDER_NOTE_RECIPE, OPTS); // import 2: folder-note (steady state)

		const result = await generateFromRecipe(app, parsed(), folderNoteRecipe('sibling'), OPTS); // import 3: flip to sibling

		expect(files.has('Frameworks/T1078.md')).toBe(true); // relocated back
		expect(files.has('Frameworks/T1078/T1078.md')).toBe(false); // no orphan left behind
		// This IS a real relocation (not idempotent), so it DOES report — the
		// deviation is the visible trail explaining why T1078 moved.
		expect((result.warnings ?? []).map((w) => w.message)).toEqual([
			'parent_note: relocated attack-fn:T1078 back to sibling form (Frameworks/T1078/T1078.md → Frameworks/T1078.md).',
		]);

		const back = files.get('Frameworks/T1078.md')!;
		expect(back).toContain('[[T1078.001]]'); // children list carried across the flip

		// The T1078/ folder still holds the children — only the parent note moved
		// back out of it. (Children live there because of the variadic FOLDER
		// layout, independent of parent_note; relocation only ever moves the
		// concept note that shares the folder's own name.)
		expect(files.has('Frameworks/T1078/T1078.001.md')).toBe(true);
		expect(files.has('Frameworks/T1078/T1078.002.md')).toBe(true);
	});

	it('a streamed source keeps every parent as a sibling, with a deviation (v1 restriction)', async () => {
		const { app, files } = makeApp();
		const result = await generateFromRecipe(app, parsedStreamed(), FOLDER_NOTE_RECIPE, OPTS);

		expect(files.has('Frameworks/T1078.md')).toBe(true); // sibling, not relocated
		expect(files.has('Frameworks/T1078/T1078.md')).toBe(false);
		expect((result.warnings ?? []).map((w) => w.message)).toEqual([
			"parent_note: folder-note requires an eager (non-streamed) source; this streamed import kept parent notes as siblings.",
		]);
	});
});
