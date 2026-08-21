/**
 * Orphan detection is the missing-identity half of re-import reconciliation.
 * It reports notes a recipe produced before but the current successful source
 * no longer produces. It never deletes, crosses recipe ownership, or reaches
 * hand-written notes without Crosswalker provenance.
 */

import { TFile, TFolder } from 'obsidian';
import { generateNotes } from '../src/generation/generation-engine';
import type { GenerationOptions } from '../src/generation/generation-engine';
import type { Recipe } from '../src/render';
import type { ImportRecipe, ParsedData } from '../src/types/config';

interface SeedNote {
	curie: string;
	recipeId?: string;
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
				: { _crosswalker: note.recipeId ? { recipe: { id: note.recipeId } } : {} }),
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
			'Frameworks/A.md': { curie: 'attack:A', recipeId: RECIPE_ID },
			'Frameworks/B.md': { curie: 'attack:B', recipeId: RECIPE_ID },
		});

		const result = await generateNotes(app, parsed(['A']), CONFIG, OPTIONS);

		expect(result.errors).toEqual([]);
		expect(result.orphans).toEqual([{ curie: 'attack:B', path: 'Frameworks/B.md' }]);
	});

	it('reports nothing when any source row errors', async () => {
		const app = makeApp({
			'Frameworks/A.md': { curie: 'attack:A', recipeId: RECIPE_ID },
			'Frameworks/B.md': { curie: 'attack:B', recipeId: RECIPE_ID },
		});

		const result = await generateNotes(app, parsed(['A', 'BAD ID']), CONFIG, OPTIONS);

		expect(result.errors.length).toBeGreaterThan(0);
		expect(result.orphans).toBeUndefined();
	});

	it('reports nothing when the source ends before its declared row count', async () => {
		const app = makeApp({
			'Frameworks/A.md': { curie: 'attack:A', recipeId: RECIPE_ID },
			'Frameworks/B.md': { curie: 'attack:B', recipeId: RECIPE_ID },
		});
		const partial = parsed(['A']);
		partial.rowCount = 2;

		const result = await generateNotes(app, partial, CONFIG, OPTIONS);

		expect(result.errors).toEqual([]);
		expect(result.orphans).toBeUndefined();
	});

	it('never reports identities owned by a different recipe', async () => {
		const app = makeApp({
			'Frameworks/A.md': { curie: 'attack:A', recipeId: RECIPE_ID },
			'Other/X.md': { curie: 'other:X', recipeId: 'other-import' },
		});

		const result = await generateNotes(app, parsed(['A']), CONFIG, OPTIONS);

		expect(result.errors).toEqual([]);
		expect(result.orphans ?? []).toEqual([]);
	});

	it('never reports a hand-written note with no provenance', async () => {
		const app = makeApp({
			'Frameworks/A.md': { curie: 'attack:A', recipeId: RECIPE_ID },
			'My notes/Hand.md': { curie: 'attack:HAND', generated: false },
		});

		const result = await generateNotes(app, parsed(['A']), CONFIG, OPTIONS);

		expect(result.errors).toEqual([]);
		expect(result.orphans ?? []).toEqual([]);
	});
});
