/**
 * generate-notes-user-preserve.test.ts — M2 (2026-07-12 pre-merge review):
 * `generateNotes` (the wizard/workbench entry point) previously hardcoded
 * `computeManagedKeys(noteData.frontmatter, [])` on re-import merge, ignoring
 * `recipe.target.also_emit.frontmatter.user_preserve` entirely — a
 * user_preserve-declared key was silently overwritten back to the recipe's
 * fresh-render value on every re-import through the wizard. The equivalent
 * call in `generateFromRecipe` (~line 1724) correctly reads user_preserve;
 * this test proves `generateNotes` now matches it (mirrors the stateful-vault
 * pattern used by tests/enrichment-reimport.test.ts + generate-notes-enrichment.test.ts).
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
// tests/generate-notes-enrichment.test.ts.
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
			getMarkdownFiles: () => [],
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

/** A workbench-shaped recipe with a managed `status` key AND a user_preserve
 *  declaration on that same key — the exact shape that exercises the M2 gap. */
const RECIPE_WITH_USER_PRESERVE: Recipe = {
	recipe: 'attack',
	source: { ontology: 'attack', levels: ['leaf'] },
	target: {
		layout: [{ level: 'leaf', mechanism: 'file', template: '{id}.md' }],
		also_emit: {
			frontmatter: {
				managed: { status: '{status}' },
				user_preserve: ['status'],
			},
		},
	},
};

const ROWS = [{ id: 'T1078', status: 'draft' }];

function parsed(): ParsedData {
	return { columns: ['id', 'status'], rows: [...ROWS], rowCount: ROWS.length };
}

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
	};
}

describe('generateNotes honors user_preserve on re-import merge (M2)', () => {
	it('a user_preserve-declared managed key survives re-import unchanged', async () => {
		const { app, files } = makeApp();

		// First import: recipe writes status: draft from the row.
		await generateNotes(app, parsed(), CONFIG, baseOptions(RECIPE_WITH_USER_PRESERVE));
		const notePath = 'Frameworks/T1078.md';
		const first = files.get(notePath)!;
		expect(first).toContain('status: draft');

		// User hand-edits status after import (the scenario user_preserve exists for).
		files.set(notePath, first.replace('status: draft', 'status: approved'));

		// Second import: the row still says status: draft, but user_preserve
		// declares 'status' as user-owned — the hand-edit must survive.
		const result = await generateNotes(app, parsed(), CONFIG, baseOptions(RECIPE_WITH_USER_PRESERVE));
		expect(result.errors).toEqual([]);

		const after = files.get(notePath)!;
		const fm = yaml.load(/^---\n([\s\S]*?)\n---/.exec(after)![1]) as Record<string, unknown>;
		expect(fm.status).toBe('approved');
	});

	it('without user_preserve, the same managed key IS overwritten on re-import (control case)', async () => {
		const RECIPE_NO_PRESERVE: Recipe = {
			...RECIPE_WITH_USER_PRESERVE,
			target: {
				...RECIPE_WITH_USER_PRESERVE.target,
				also_emit: { frontmatter: { managed: { status: '{status}' } } },
			},
		};
		const { app, files } = makeApp();

		await generateNotes(app, parsed(), CONFIG, baseOptions(RECIPE_NO_PRESERVE));
		const notePath = 'Frameworks/T1078.md';
		const first = files.get(notePath)!;
		files.set(notePath, first.replace('status: draft', 'status: approved'));

		await generateNotes(app, parsed(), CONFIG, baseOptions(RECIPE_NO_PRESERVE));
		const after = files.get(notePath)!;
		const fm = yaml.load(/^---\n([\s\S]*?)\n---/.exec(after)![1]) as Record<string, unknown>;
		// No user_preserve declared -> managed value wins, overwriting the hand-edit.
		expect(fm.status).toBe('draft');
	});
});
