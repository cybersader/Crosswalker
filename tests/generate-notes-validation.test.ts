/**
 * generate-notes-validation.test.ts — M1 (2026-07-12 pre-merge review):
 * `generateFromRecipe` validates every row's rendered frontmatter against the
 * Tier 1 schema before writing (`validateTier1Frontmatter`, ~line 1692);
 * `generateNotes` — the ONLY entry point the import wizard/workbench call —
 * never did, contradicting architectural commitment #1 ("schema-as-primitive
 * ... the load-bearing contract"). This proves `generateNotes` now runs the
 * same validation with the same `strictValidation` semantics (default true,
 * matching `generateFromRecipe` exactly): a row whose CURIE violates the
 * Tier 1 `curie` pattern (`^[a-z][a-z0-9_-]*:[A-Za-z0-9._\-()/]+$` — a bare
 * space is not a legal local-part character) fails validation; strict mode
 * aborts that row with an error and skips the write, non-strict mode logs a
 * warning and writes anyway — identical to generateFromRecipe's behavior.
 */

import { TFile, TFolder } from 'obsidian';
import { generateNotes } from '../src/generation/generation-engine';
import type { Recipe } from '../src/render';
import type { GenerationOptions } from '../src/generation/generation-engine';
import type { ImportRecipe, ParsedData } from '../src/types/config';

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
			getFileCache: () => null,
		},
	};
	return { app: app as any, files };
}

/** A plain, no-frills recipe — the id column becomes both the CURIE local
 *  part and the leaf filename. No enrichment, no also_emit. */
const RECIPE: Recipe = {
	recipe: 'attack',
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

function baseOptions(strictValidation?: boolean): GenerationOptions {
	return {
		basePath: 'Frameworks',
		overwriteMode: 'replace',
		createFolders: true,
		recipeOverride: RECIPE,
		...(strictValidation !== undefined ? { strictValidation } : {}),
	};
}

// The CURIE local part comes straight from the (unsanitized) id column via
// deriveFilenameStem — a bare space is not a legal curie local-part
// character (`[A-Za-z0-9._\-()/]+`), so this row's rendered frontmatter
// fails Tier 1 schema validation deterministically.
function invalidRow(): ParsedData {
	const rows = [{ id: 'T 1078' }];
	return { columns: ['id'], rows, rowCount: rows.length };
}

function validRow(): ParsedData {
	const rows = [{ id: 'T1078' }];
	return { columns: ['id'], rows, rowCount: rows.length };
}

describe('generateNotes runs Tier 1 validation before writing (M1)', () => {
	it('a well-formed row passes validation and writes cleanly (strict default)', async () => {
		const { app, files } = makeApp();
		const result = await generateNotes(app, validRow(), CONFIG, baseOptions());
		expect(result.errors).toEqual([]);
		expect(files.has('Frameworks/T1078.md')).toBe(true);
	});

	it('strict mode (default): an invalid-CURIE row is rejected with a Tier 1 error, no file written', async () => {
		const { app, files } = makeApp();
		const result = await generateNotes(app, invalidRow(), CONFIG, baseOptions());
		expect(result.errors.length).toBeGreaterThan(0);
		expect(result.errors[0].message).toMatch(/Tier 1 validation failed/);
		// NB: generateNotes does not flip `result.success` on row-level errors
		// (only on thrown exceptions / overwriteMode 'error') — a pre-existing
		// divergence from generateFromRecipe, out of scope for M1. What M1
		// pins is that the row is rejected and no file is written.
		expect(files.has('Frameworks/T 1078.md')).toBe(false);
	});

	it('non-strict mode: an invalid-CURIE row logs a warning but still writes (matches generateFromRecipe)', async () => {
		const { app, files } = makeApp();
		const result = await generateNotes(app, invalidRow(), CONFIG, baseOptions(false));
		expect(result.errors).toEqual([]);
		expect(files.has('Frameworks/T 1078.md')).toBe(true);
	});
});
