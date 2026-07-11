/**
 * recipe-registry.test.ts — the recognized-source registry (spec §7m).
 *
 * Verifies the registry loads the bundled import recipes, derives a sane match
 * signature from each recipe's templates, scores sources deterministically, gates
 * confident matches on the structural (identity) column, and reconstructs the
 * workbench mapping via fromRecipe (the round-trip fast path).
 */

import {
	RECIPE_REGISTRY,
	CONFIDENT_MATCH_THRESHOLD,
	matchScore,
	findRecognizedRecipes,
	bestRecognizedRecipe,
	recipeMapping,
	summarizeRecipeShapes,
	normalizeColumn,
	type RecipeRegistryEntry,
} from '../src/import/recipe-registry';

function entry(id: string): RecipeRegistryEntry {
	const e = RECIPE_REGISTRY.find((r) => r.id === id);
	if (!e) throw new Error(`no registry entry for ${id}`);
	return e;
}

describe('recipe-registry — loading + signatures', () => {
	it('loads the bundled import recipes with ids, labels, and signatures', () => {
		expect(RECIPE_REGISTRY.length).toBeGreaterThanOrEqual(8);
		for (const e of RECIPE_REGISTRY) {
			expect(e.id).toBeTruthy();
			expect(e.label).toBeTruthy();
			expect(e.description).toBeTruthy();
			expect(e.signatureColumns.length).toBeGreaterThan(0);
		}
	});

	it('derives the NIST CSF CPRT signature from the recipe templates', () => {
		const e = entry('nist-csf-2-cprt');
		// The flat CPRT recipe references these columns in its templates.
		expect(e.signatureColumns).toEqual(
			expect.arrayContaining(['element_identifier', 'title', 'element_type', 'text']),
		);
		// The file-name (identity) column is required.
		expect(e.requiredColumns).toContain('element_identifier');
	});

	it('marks structural (folder/file) columns as required for the nested CPRT recipe', () => {
		const e = entry('nist-csf-2-cprt-hierarchical');
		expect(e.requiredColumns).toContain('element_identifier');
	});

	it('derives CIS control columns with a space in the name', () => {
		const e = entry('cis-controls-v8-controls');
		expect(e.signatureColumns).toEqual(expect.arrayContaining(['CIS Control', 'Title', 'Description']));
		expect(e.requiredColumns).toContain('CIS Control');
	});

	it('has a curated GRC-first label', () => {
		expect(entry('nist-csf-2-cprt').label).toBe('NIST CSF 2.0 (CPRT export)');
		expect(entry('cis-controls-v8-controls').label).toContain('CIS Controls v8');
	});
});

describe('recipe-registry — matchScore', () => {
	it('scores a perfect column match at 100', () => {
		const e = entry('cis-controls-v8-controls');
		expect(matchScore(e, ['CIS Control', 'Title', 'Description'])).toBe(100);
	});

	it('normalizes column names (case/punctuation insensitive)', () => {
		const e = entry('cis-controls-v8-controls');
		expect(matchScore(e, ['cis control', 'TITLE', 'description'])).toBe(100);
		expect(normalizeColumn('CIS Control')).toBe('cis_control');
		expect(normalizeColumn('SCF #')).toBe('scf__');
	});

	it('caps the score below the candidate floor when the required column is missing', () => {
		const e = entry('nist-csf-2-cprt');
		// Present: title, element_type, text — but NOT element_identifier (required).
		const score = matchScore(e, ['title', 'element_type', 'text', 'unrelated']);
		expect(score).toBeLessThan(CONFIDENT_MATCH_THRESHOLD);
	});

	it('returns a partial score when only some signature columns are present', () => {
		const e = entry('cis-controls-v8-controls');
		// CIS Control (required) + Title present, Description missing → 2/3.
		const score = matchScore(e, ['CIS Control', 'Title', 'extra_col']);
		expect(score).toBe(67);
	});

	it('is deterministic — independent of source column order', () => {
		const e = entry('cis-controls-v8-controls');
		const a = matchScore(e, ['Title', 'Description', 'CIS Control']);
		const b = matchScore(e, ['CIS Control', 'Title', 'Description']);
		expect(a).toBe(b);
	});
});

describe('recipe-registry — ranking + confident match', () => {
	it('finds a confident recognized recipe for a matching source', () => {
		const cols = ['CIS Control', 'Title', 'Description'];
		const best = bestRecognizedRecipe(cols);
		expect(best).not.toBeNull();
		expect(best!.entry.id).toBe('cis-controls-v8-controls');
		expect(best!.score).toBeGreaterThanOrEqual(CONFIDENT_MATCH_THRESHOLD);
	});

	it('ranks the nested CPRT recipe above the flat one on a tie (more specific first)', () => {
		// Both CPRT recipes reference the same columns; declaration order + specificity
		// put the nested (folder-producing) recipe first.
		const cols = ['element_identifier', 'title', 'element_type', 'text'];
		const ranked = findRecognizedRecipes(cols);
		expect(ranked[0].entry.id).toBe('nist-csf-2-cprt-hierarchical');
	});

	it('returns null for an unrelated source', () => {
		const best = bestRecognizedRecipe(['foo', 'bar', 'baz', 'qux']);
		expect(best).toBeNull();
	});

	it('does not confidently match ATT&CK-style CSV columns (they are not a bundled shape)', () => {
		// The visual-workbench ATT&CK CSV (technique_id,name,tactic,description) must
		// NOT trip the fast path — its columns differ from the mitre recipe signature.
		const best = bestRecognizedRecipe(['technique_id', 'name', 'tactic', 'description']);
		expect(best).toBeNull();
	});
});

describe('recipe-registry — recipe → mapping + shapes', () => {
	it('reconstructs a workbench mapping via fromRecipe (round-trip fast path)', () => {
		const mapping = recipeMapping(entry('nist-csf-2-cprt-hierarchical'));
		expect(mapping.mappings.length).toBeGreaterThan(0);
		// The nested recipe carries folder structure — at least one structural level.
		const anyFolder = mapping.mappings.some((m) =>
			m.levels.some((l) => l.destinations.some((d) => d.primitive === 'folder')),
		);
		expect(anyFolder).toBe(true);
	});

	it('summarizes the vault shapes a recipe produces', () => {
		expect(summarizeRecipeShapes(entry('nist-csf-2-cprt-hierarchical'))).toEqual(
			expect.arrayContaining(['folders', 'properties']),
		);
		// A flat recipe produces properties but no folders.
		expect(summarizeRecipeShapes(entry('cis-controls-v8-controls'))).not.toContain('folders');
	});
});
