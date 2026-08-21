/**
 * Orphan detection is the missing-identity half of re-import reconciliation.
 * It reports notes a recipe produced before but the current successful source
 * no longer produces. It never deletes, crosses recipe ownership, or reaches
 * hand-written notes without Crosswalker provenance.
 */

import { TFile, TFolder } from 'obsidian';
import { generateFromRecipe, generateNotes } from '../src/generation/generation-engine';
import type { GenerationOptions } from '../src/generation/generation-engine';
import type { Recipe } from '../src/render';
import type { ImportRecipe, ParsedData } from '../src/types/config';

interface SeedNote {
	curie: string;
	recipeId?: string;
	importSetId?: string;
	generated?: boolean;
}

function makeApp(seed: Record<string, SeedNote>) {
	const files = new Map<string, string>();
	const frontmatter = new Map<string, Record<string, unknown>>();
	const folders = new Set<string>(['', 'Frameworks']);

	for (const [path, note] of Object.entries(seed)) {
		files.set(path, '---\n---\n');
		frontmatter.set(path, {
			curie: note.curie,
			...(note.generated === false
				? {}
				: { _crosswalker: {
					...(note.recipeId ? { recipe: { id: note.recipeId } } : {}),
					...(note.importSetId ? { import_set: { id: note.importSetId, scheme: 'endpoint-v1' } } : {}),
				} }),
		});
	}

	const getAbstractFileByPath = (path: string) => {
		if (files.has(path)) return new TFile(path);
		if (folders.has(path)) return new TFolder(path);
		return null;
	};

	const app = {
		vault: {
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
		fileManager: {
			renameFile: async (file: TFile, newPath: string) => {
				const content = files.get(file.path) ?? '';
				const fm = frontmatter.get(file.path);
				files.delete(file.path);
				frontmatter.delete(file.path);
				files.set(newPath, content);
				if (fm) frontmatter.set(newPath, fm);
				file.path = newPath;
			},
		},
		metadataCache: {
			getFileCache: (file: { path: string }) => ({
				frontmatter: frontmatter.get(file.path) ?? {},
			}),
		},
	};

	return app as any;
}

const RECIPE_ID = 'attack-import';
const IMPORT_SET_ID = 'iset-abc123';

const RECIPE: Recipe = {
	recipe: RECIPE_ID,
	source: { ontology: 'attack', levels: ['leaf'] },
	target: {
		layout: [{ level: 'leaf', mechanism: 'file', template: '{id}.md' }],
	},
};

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

const OPTIONS: GenerationOptions = {
	basePath: 'Frameworks',
	importSet: { id: IMPORT_SET_ID },
	overwriteMode: 'replace',
	createFolders: true,
	recipeOverride: RECIPE,
};

function parsed(ids: string[]): ParsedData {
	const rows = ids.map((id) => ({ id }));
	return { columns: ['id'], rows, rowCount: rows.length };
}

describe('generateNotes orphan detection', () => {
	it('reports an identity this recipe produced before but the current source stopped producing', async () => {
		const app = makeApp({
			'Frameworks/A.md': { curie: 'attack:A', recipeId: RECIPE_ID, importSetId: IMPORT_SET_ID },
			'Frameworks/B.md': { curie: 'attack:B', recipeId: RECIPE_ID, importSetId: IMPORT_SET_ID },
		});

		const result = await generateNotes(app, parsed(['A']), CONFIG, OPTIONS);

		expect(result.errors).toEqual([]);
		expect(result.orphans).toEqual([{ curie: 'attack:B', path: 'Frameworks/B.md' }]);
	});

	it('reports nothing when any source row errors', async () => {
		const app = makeApp({
			'Frameworks/A.md': { curie: 'attack:A', recipeId: RECIPE_ID, importSetId: IMPORT_SET_ID },
			'Frameworks/B.md': { curie: 'attack:B', recipeId: RECIPE_ID, importSetId: IMPORT_SET_ID },
		});

		const result = await generateNotes(app, parsed(['A', 'BAD ID']), CONFIG, OPTIONS);

		expect(result.errors.length).toBeGreaterThan(0);
		expect(result.orphans).toBeUndefined();
	});

	it('reports nothing when the source ends before its declared row count', async () => {
		const app = makeApp({
			'Frameworks/A.md': { curie: 'attack:A', recipeId: RECIPE_ID, importSetId: IMPORT_SET_ID },
			'Frameworks/B.md': { curie: 'attack:B', recipeId: RECIPE_ID, importSetId: IMPORT_SET_ID },
		});
		const partial = parsed(['A']);
		partial.rowCount = 2;

		const result = await generateNotes(app, partial, CONFIG, OPTIONS);

		expect(result.errors).toEqual([]);
		expect(result.orphans).toBeUndefined();
	});

	it('never reports identities owned by a different recipe', async () => {
		const app = makeApp({
			'Frameworks/A.md': { curie: 'attack:A', recipeId: RECIPE_ID, importSetId: IMPORT_SET_ID },
			'Other/X.md': { curie: 'other:X', recipeId: 'other-import', importSetId: 'iset-def456' },
		});

		const result = await generateNotes(app, parsed(['A']), CONFIG, OPTIONS);

		expect(result.errors).toEqual([]);
		expect(result.orphans ?? []).toEqual([]);
	});

	it('legacy generated notes without a stamp stay outside every set', async () => {
		const app = makeApp({
			'Frameworks/A.md': { curie: 'attack:A', recipeId: RECIPE_ID, importSetId: IMPORT_SET_ID },
			'Frameworks/legacy.md': { curie: 'attack:LEGACY', recipeId: RECIPE_ID },
		});

		const result = await generateNotes(app, parsed(['A']), CONFIG, OPTIONS);

		expect(result.errors).toEqual([]);
		expect(result.orphans ?? []).toEqual([]);
	});

	it('legacy-only destinations mint without errors and never infer legacy orphans', async () => {
		const app = makeApp({
			'Frameworks/legacy.md': { curie: 'attack:LEGACY', recipeId: RECIPE_ID },
		});
		const autoOptions = { ...OPTIONS, importSet: undefined };
		const result = await generateNotes(app, parsed(['A']), CONFIG, autoOptions);
		expect(result.errors).toEqual([]);
		expect(result.orphans).toBeUndefined();
	});

	it('blocks an ambiguous destination and reports the available set ids and counts', async () => {
		const app = makeApp({
			'Frameworks/A.md': { curie: 'attack:A', recipeId: RECIPE_ID, importSetId: 'iset-abc123' },
			'Frameworks/B.md': { curie: 'attack:B', recipeId: RECIPE_ID, importSetId: 'iset-def456' },
		});
		const autoOptions = { ...OPTIONS, importSet: undefined };
		const result = await generateNotes(app, parsed(['A']), CONFIG, autoOptions);
		expect(result.success).toBe(false);
		expect(result.errors[0].message).toContain('iset-abc123 (1 notes)');
		expect(result.errors[0].message).toContain('iset-def456 (1 notes)');
	});

	it('never reports a hand-written note with no provenance', async () => {
		const app = makeApp({
			'Frameworks/A.md': { curie: 'attack:A', recipeId: RECIPE_ID, importSetId: IMPORT_SET_ID },
			'My notes/Hand.md': { curie: 'attack:HAND', generated: false },
		});

		const result = await generateNotes(app, parsed(['A']), CONFIG, OPTIONS);

		expect(result.errors).toEqual([]);
		expect(result.orphans ?? []).toEqual([]);
	});

	it('reports removed identities on the native recipe path', async () => {
		const app = makeApp({
			'Frameworks/A.md': { curie: 'attack:A', recipeId: RECIPE_ID, importSetId: IMPORT_SET_ID },
			'Frameworks/B.md': { curie: 'attack:B', recipeId: RECIPE_ID, importSetId: IMPORT_SET_ID },
		});
		const result = await generateFromRecipe(app, parsed(['A']), RECIPE, {
			basePath: 'Frameworks',
			importSet: { id: IMPORT_SET_ID },
			overwriteMode: 'replace',
		});
		expect(result.errors).toEqual([]);
		expect(result.orphans).toEqual([{ curie: 'attack:B', path: 'Frameworks/B.md' }]);
	});

	it('native recipe path stands down on row error and incomplete row count', async () => {
		const seed = {
			'Frameworks/A.md': { curie: 'attack:A', recipeId: RECIPE_ID, importSetId: IMPORT_SET_ID },
			'Frameworks/B.md': { curie: 'attack:B', recipeId: RECIPE_ID, importSetId: IMPORT_SET_ID },
		};
		const errored = await generateFromRecipe(makeApp(seed), parsed(['A', 'BAD ID']), RECIPE, {
			basePath: 'Frameworks', importSet: { id: IMPORT_SET_ID }, overwriteMode: 'replace',
		});
		expect(errored.errors.length).toBeGreaterThan(0);
		expect(errored.orphans).toBeUndefined();

		const partial = parsed(['A']);
		partial.rowCount = 2;
		const incomplete = await generateFromRecipe(makeApp(seed), partial, RECIPE, {
			basePath: 'Frameworks', importSet: { id: IMPORT_SET_ID }, overwriteMode: 'replace',
		});
		expect(incomplete.errors).toEqual([]);
		expect(incomplete.orphans).toBeUndefined();
	});

});
