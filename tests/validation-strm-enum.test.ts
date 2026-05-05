/**
 * Tests for v0.1.4 STRM predicate enforcement.
 *
 * The Tier 1 schema's crosswalk_edge_frontmatter enforces predicate_id against
 * the closed STRM (NIST IR 8477) enum. Frontmatter with an invalid predicate
 * must fail validation.
 *
 * Verifies:
 *  - Valid STRM predicates pass validation
 *  - Invalid predicates fail validation with a clear enum error
 *  - All 6 STRM predicates accepted
 *  - Junction-note predicate (open string) is NOT enum-constrained
 */

import { initValidator, validateTier1Frontmatter } from '../src/validation/validator';

beforeAll(() => {
	initValidator();
});

const baseProvenance = {
	spec_version: 'https://crosswalker.dev/spec/tier1.schema.json',
	source_ref: { file: 'test.csv' },
	produced_at: '2026-05-05T00:00:00Z',
	producer: { kind: 'plugin-engine' as const, name: 'crosswalker-plugin', version: '0.1.0' },
};

const STRM_PREDICATES = [
	'is_equivalent_to',
	'is_broader_than',
	'is_narrower_than',
	'is_approximate_to',
	'intersects_with',
	'no_relationship',
];

describe('Tier 1 validation — STRM predicate enforcement (v0.1.4)', () => {
	test.each(STRM_PREDICATES)('valid STRM predicate %s passes', (predicate) => {
		const fm = {
			curie: 'cwk:cw-test',
			kind: 'crosswalk-edge',
			subject_id: 'nist-csf:PR.AC-01',
			predicate_id: predicate,
			object_id: 'nist:AC-2',
			_crosswalker: baseProvenance,
		};
		const result = validateTier1Frontmatter(fm);
		expect(result.valid).toBe(true);
		expect(result.errors).toEqual([]);
	});

	test('invalid predicate "totally_unrelated" rejected with enum error', () => {
		const fm = {
			curie: 'cwk:cw-test',
			kind: 'crosswalk-edge',
			subject_id: 'nist-csf:PR.AC-01',
			predicate_id: 'totally_unrelated',
			object_id: 'nist:AC-2',
			_crosswalker: baseProvenance,
		};
		const result = validateTier1Frontmatter(fm);
		expect(result.valid).toBe(false);
		expect(result.errors.some((e) => e.includes('predicate_id'))).toBe(true);
	});

	test('invalid predicate "implements" (a junction-style verb) rejected for crosswalk-edge', () => {
		const fm = {
			curie: 'cwk:cw-test',
			kind: 'crosswalk-edge',
			subject_id: 'nist-csf:PR.AC-01',
			predicate_id: 'implements',
			object_id: 'nist:AC-2',
			_crosswalker: baseProvenance,
		};
		const result = validateTier1Frontmatter(fm);
		expect(result.valid).toBe(false);
	});

	test('crosswalk-edge with valid subject_id + object_id CURIE format', () => {
		const fm = {
			curie: 'cwk:cw-test',
			kind: 'crosswalk-edge',
			subject_id: 'iso27001:A.9.2.1',
			predicate_id: 'is_equivalent_to',
			object_id: 'nist:AC-2',
			match_type: 'close',
			match_confidence: 0.9,
			mapping_justification: 'semapv:ManualMappingCuration',
			mapping_provider: 'NIST OLIR',
			_crosswalker: baseProvenance,
		};
		const result = validateTier1Frontmatter(fm);
		expect(result.valid).toBe(true);
	});

	test('crosswalk-edge missing required field (subject_id) rejected', () => {
		const fm = {
			curie: 'cwk:cw-test',
			kind: 'crosswalk-edge',
			predicate_id: 'is_equivalent_to',
			object_id: 'nist:AC-2',
			_crosswalker: baseProvenance,
		};
		const result = validateTier1Frontmatter(fm);
		expect(result.valid).toBe(false);
		expect(result.errors.some((e) => e.includes('subject_id'))).toBe(true);
	});
});

describe('Tier 1 validation — junction-note predicate is open-string (v0.1.4)', () => {
	test('junction-note "covers" predicate accepted (not enum-constrained)', () => {
		const fm = {
			curie: 'cwk:jn-test',
			kind: 'junction-note',
			subject: 'Frameworks/NIST/AC-2',
			predicate: 'covers',
			object: 'Evidence/MFA-Policy',
			_crosswalker: baseProvenance,
		};
		const result = validateTier1Frontmatter(fm);
		expect(result.valid).toBe(true);
	});

	test('junction-note "evidences" predicate accepted', () => {
		const fm = {
			curie: 'cwk:jn-test',
			kind: 'junction-note',
			subject: 'Frameworks/NIST/AC-2',
			predicate: 'evidences',
			object: 'Evidence/Policy',
			_crosswalker: baseProvenance,
		};
		const result = validateTier1Frontmatter(fm);
		expect(result.valid).toBe(true);
	});

	test('junction-note arbitrary domain-specific predicate accepted', () => {
		const fm = {
			curie: 'cwk:jn-test',
			kind: 'junction-note',
			subject: 'Frameworks/CIS/1.1',
			predicate: 'satisfies-via-control-pattern-X',
			object: 'Audits/2026-Q1',
			_crosswalker: baseProvenance,
		};
		const result = validateTier1Frontmatter(fm);
		expect(result.valid).toBe(true);
	});

	test('junction-note missing required subject rejected', () => {
		const fm = {
			curie: 'cwk:jn-test',
			kind: 'junction-note',
			predicate: 'covers',
			object: 'Evidence/Policy',
			_crosswalker: baseProvenance,
		};
		const result = validateTier1Frontmatter(fm);
		expect(result.valid).toBe(false);
		expect(result.errors.some((e) => e.includes('subject'))).toBe(true);
	});
});

describe('Recipe schema — kind field on layout entry (v0.1.4)', () => {
	const { validateRecipe } = require('../src/validation/validator');

	test('layout entry with kind: "junction-note" passes recipe schema', () => {
		const recipe = {
			recipe: 'test',
			source: { ontology: 'test', levels: ['x'] },
			target: {
				layout: [
					{
						level: 'x',
						mechanism: 'file',
						template: '{id}.md',
						kind: 'junction-note',
					},
				],
			},
		};
		const result = validateRecipe(recipe);
		expect(result.valid).toBe(true);
	});

	test('layout entry with kind: "crosswalk-edge" passes recipe schema', () => {
		const recipe = {
			recipe: 'test',
			source: { ontology: 'test', levels: ['x'] },
			target: {
				layout: [
					{
						level: 'x',
						mechanism: 'file',
						template: 'cw-{id}.md',
						kind: 'crosswalk-edge',
					},
				],
			},
		};
		const result = validateRecipe(recipe);
		expect(result.valid).toBe(true);
	});

	test('layout entry with invalid kind rejected', () => {
		const recipe = {
			recipe: 'test',
			source: { ontology: 'test', levels: ['x'] },
			target: {
				layout: [
					{
						level: 'x',
						mechanism: 'file',
						template: '{id}.md',
						kind: 'orphan-note',
					},
				],
			},
		};
		const result = validateRecipe(recipe);
		expect(result.valid).toBe(false);
	});

	test('layout entry without kind passes (defaults to concept)', () => {
		const recipe = {
			recipe: 'test',
			source: { ontology: 'test', levels: ['x'] },
			target: {
				layout: [{ level: 'x', mechanism: 'file', template: '{id}.md' }],
			},
		};
		const result = validateRecipe(recipe);
		expect(result.valid).toBe(true);
	});
});
