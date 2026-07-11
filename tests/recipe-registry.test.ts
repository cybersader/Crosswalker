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
		// 9 concept recipes + the olir-crosswalk-edge recipe.
		expect(RECIPE_REGISTRY.length).toBeGreaterThanOrEqual(10);
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

describe('recipe-registry — routing kind (crosswalk vs concept)', () => {
	it('registers the crosswalk-edge recipe', () => {
		const e = entry('olir-crosswalk-edge');
		expect(e.label).toContain('Crosswalk');
		expect(e.description).toBeTruthy();
	});

	it('routes ordinary concept recipes as "concept"', () => {
		expect(entry('nist-csf-2-cprt-hierarchical').routingKind).toBe('concept');
		expect(entry('cis-controls-v8-controls').routingKind).toBe('concept');
		expect(entry('mitre-attack-technique-flat').routingKind).toBe('concept');
	});

	it('routes the crosswalk recipe distinctly, read off the leaf layout entry\'s declared kind', () => {
		expect(entry('olir-crosswalk-edge').routingKind).toBe('crosswalk-edge');
	});

	it('confidently recognizes an OLIR-style crosswalk export (the crosswalk-from-olir.ts output shape)', () => {
		// tools/crosswalk-from-olir.ts emits exactly these columns per row.
		const cols = [
			'subject_id',
			'object_id',
			'subject_group',
			'object_group',
			'source_framework',
			'target_framework',
			'strm_predicate',
			'sssom_predicate',
			'mapping_justification',
			'mapping_provider',
			'match_confidence',
		];
		const best = bestRecognizedRecipe(cols);
		expect(best).not.toBeNull();
		expect(best!.entry.id).toBe('olir-crosswalk-edge');
		expect(best!.entry.routingKind).toBe('crosswalk-edge');
		expect(best!.score).toBe(100);
	});

	it('does NOT confidently match a raw SSSOM TSV export (a different, incompatible column shape)', () => {
		// Raw SSSOM (tools/fixtures/realistic/*.sssom.tsv, recipes/import/crosswalks/*.sssom.tsv)
		// uses predicate_id/confidence, not the crosswalk-edge recipe's strm_predicate/
		// match_confidence/subject_group/object_group/source_framework/target_framework —
		// it is pre-crosswalk-from-olir.ts input, not that tool's output. This is a known,
		// deliberate no-match: raw SSSOM has its own dedicated importer (sssom-importer.ts),
		// not the generic recognized-source fast path.
		const cols = ['subject_id', 'predicate_id', 'object_id', 'match_type', 'mapping_justification', 'mapping_provider'];
		const best = bestRecognizedRecipe(cols);
		expect(best).toBeNull();
	});
});

describe('recipe-registry — curated defaults (suggestedFolder + recommendedEnrichment)', () => {
	it('gives every entry a non-empty suggested destination folder', () => {
		for (const e of RECIPE_REGISTRY) {
			expect(e.suggestedFolder).toBeTruthy();
			expect(e.suggestedFolder.length).toBeGreaterThan(0);
		}
	});

	it('gives every entry a well-shaped enrichment hint with a rationale', () => {
		for (const e of RECIPE_REGISTRY) {
			expect(['none', 'tags-only', 'notes']).toContain(e.recommendedEnrichment.facetNotes);
			expect(typeof e.recommendedEnrichment.childrenLists).toBe('boolean');
			expect(e.recommendedEnrichment.rationale).toBeTruthy();
			if (e.recommendedEnrichment.facetNotes !== 'none') {
				expect(e.recommendedEnrichment.facetField).toBeTruthy();
			}
		}
	});

	it('recommends a tactic facet for MITRE ATT&CK (the clearest single facet in the corpus)', () => {
		const e = entry('mitre-attack-technique-flat');
		expect(e.recommendedEnrichment.facetNotes).toBe('notes');
		expect(e.recommendedEnrichment.facetField).toBe('tactic');
	});

	it('recommends no facet for single-column identity-only shapes', () => {
		expect(entry('nist-csf-2-flat').recommendedEnrichment.facetNotes).toBe('none');
		expect(entry('cis-controls-v8-controls').recommendedEnrichment.facetNotes).toBe('none');
	});

	it('does not recommend a facet hub for crosswalk edges (they route through the query layer)', () => {
		expect(entry('olir-crosswalk-edge').recommendedEnrichment.facetNotes).toBe('none');
	});

	it('curated copy avoids em dashes (UI-copy convention)', () => {
		for (const e of RECIPE_REGISTRY) {
			expect(e.label).not.toMatch(/—/);
			expect(e.description).not.toMatch(/—/);
			expect(e.recommendedEnrichment.rationale).not.toMatch(/—/);
		}
	});
});

describe('recipe-registry — real-world corpus confusion table (pinned regressions)', () => {
	// Column sets below are transcribed headers from real exports found in the
	// (gitignored, local-only) Frameworks/ corpus during the 2026-07-11 threshold
	// tuning pass — no framework content, just column names.

	it('confidently matches a full CIS Controls v8.1.2 export (true positive, 100)', () => {
		const cols = ['CIS Control', 'CIS Safeguard', 'Asset Class', 'Security Function', 'Title', 'Description', 'IG1', 'IG2', 'IG3'];
		const best = bestRecognizedRecipe(cols);
		expect(best?.entry.id).toBe('cis-controls-v8-flat');
		expect(best?.score).toBe(100);
	});

	it('does NOT confidently match a CIS "Change Log" sheet (real near-miss that used to false-positive at threshold 75)', () => {
		// Real shape: the Change Log workbook renames Asset Class/Security Function to
		// "... v8.1", so 6 of 8 signature columns match (75) — a genuine full-catalog
		// column rename, not the actual safeguard catalog.
		const cols = [
			'CIS Control',
			'CIS Safeguard',
			'Asset Class v8.1',
			'Security Function v8.1',
			'Title',
			'Description v8.1',
			'IG1',
			'IG2',
			'IG3',
		];
		const ranked = findRecognizedRecipes(cols);
		expect(ranked[0]?.entry.id).toBe('cis-controls-v8-flat');
		expect(ranked[0]?.score).toBe(75);
		expect(bestRecognizedRecipe(cols)).toBeNull();
	});

	it('confidently matches the real NIST_SP-800-53_rev5_catalog_load.csv column shape (true positive, 100)', () => {
		const cols = ['identifier', 'name', 'control_text', 'discussion', 'related'];
		const best = bestRecognizedRecipe(cols);
		expect(best?.entry.id).toBe('nist-800-53-r5-flat');
		expect(best?.score).toBe(100);
	});

	it('surfaces (but does not confidently match) the real sp800-53ar5-assessment-procedures.csv shape', () => {
		// A genuinely different NIST export (assessment procedures, not the control
		// catalog) that shares only `identifier` with the 800-53 recipe's signature.
		const cols = ['family', 'identifier', 'sort-as', 'control-name', 'assessment-objective', 'EXAMINE', 'INTERVIEW', 'TEST'];
		expect(bestRecognizedRecipe(cols)).toBeNull();
		const ranked = findRecognizedRecipes(cols);
		expect(ranked[0]?.entry.id).toBe('nist-800-53-r5-flat');
		expect(ranked[0]?.score).toBe(50);
	});

	it('confidently matches a full SCF 2026 export (true positive, 100)', () => {
		const cols = [
			'SCF Domain',
			'SCF Control',
			'SCF #',
			'Secure Controls Framework (SCF) Control Description',
			'NIST 800-53 R5',
		];
		const best = bestRecognizedRecipe(cols);
		expect(best?.entry.id).toBe('scf-2026-flat');
		expect(best?.score).toBe(100);
	});

	it('does NOT confidently match a narrower SCF subset sheet missing the Domain column (real near-miss)', () => {
		// Real shape: the "Data Privacy Mgmt Principles" sheet carries Control/#/
		// Description but not Domain — 3 of 4 signature columns (75).
		const cols = ['SCF Control', 'SCF #', 'Secure Controls Framework (SCF) Control Description', 'NIST CSF 2.0'];
		const ranked = findRecognizedRecipes(cols);
		expect(ranked[0]?.entry.id).toBe('scf-2026-flat');
		expect(ranked[0]?.score).toBe(75);
		expect(bestRecognizedRecipe(cols)).toBeNull();
	});
});
