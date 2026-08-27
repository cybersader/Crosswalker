import { renderTemplate, RenderError } from '../src/render';
import {
	extractTier1Curie,
	initValidator,
	isTier1Curie,
	isTier1CuriePrefix,
	validateTier1Frontmatter,
} from '../src/validation/validator';
import {
	assertionBaseKey,
	mappingSetPathKey,
	normalizeMappingSetId,
	normalizePredicateModifierInput,
	readStoredPredicateModifier,
} from '../src/utils/mapping-provenance';

beforeAll(() => initValidator());

const provenance = {
	spec_version: 'https://crosswalker.dev/spec/tier1.schema.json',
	source_ref: { file: 'source.csv' },
	produced_at: '2026-08-21T00:00:00Z',
};

describe('stable identity fields', () => {
	it('uses the Tier 1 CURIE pattern as the shared authority', () => {
		expect(isTier1Curie('nist-800-53:AC-2(1)')).toBe(true);
		expect(extractTier1Curie('  nist:AC-2  ')).toBe('nist:AC-2');
		expect(extractTier1Curie('AC-2')).toBeNull();
		expect(isTier1CuriePrefix('nist-800-53')).toBe(true);
		expect(isTier1CuriePrefix('NIST')).toBe(false);
	});

	it('renders optional missing identities away and prefixes only non-empty local IDs', () => {
		expect(renderTemplate('{subject_curie|optional}', {})).toBe('');
		expect(renderTemplate('{parent_id|optional|curie-prefix(nist)}', {})).toBe('');
		expect(renderTemplate('{parent_id|optional|curie-prefix(nist)}', { parent_id: ' AC-2 ' })).toBe('nist:AC-2');
		expect(() => renderTemplate('{missing}', {})).toThrow(RenderError);
		expect(() => renderTemplate('{missing|lower|optional}', {})).toThrow('optional filter must be first');
		expect(renderTemplate('{parent.id|optional}', { parent: {} })).toBe('');
		// REPIN (2026-08-26 template-engine contract §1.1 + acceptance 1.8/1.9).
		// `optional`'s missing-value shortcut used to fire ONLY on the last
		// segment, so a missing or non-object INTERMEDIATE still threw even
		// though the author had explicitly opted in — the compounding defect
		// that stopped `{CRI Profile v2.2 Diagnostic Statement|optional}` from
		// rescuing the CRI recipe. It now fires at every segment. Strictly more
		// permissive, and only where `optional` was written.
		expect(renderTemplate('{parent.id|optional}', { parent: null })).toBe('');
		expect(renderTemplate('{parent.id|optional}', {})).toBe('');
		expect(renderTemplate('{a.b.c|optional}', { a: 'a string, not an object' })).toBe('');
		// The opt-in stays opt-in: without `optional`, a non-object intermediate
		// still throws with the same message (contract acceptance 1.10).
		expect(() => renderTemplate('{parent.id}', { parent: null })).toThrow('hit non-object value');
		expect(() => renderTemplate('{a.b}', { a: 'str' })).toThrow('hit non-object value');
	});

	it('keeps import-set provenance additive but validates both pinned fields when present', () => {
		const concept = { curie: 'nist:AC-2', _crosswalker: provenance };
		expect(validateTier1Frontmatter(concept).valid).toBe(true);
		expect(validateTier1Frontmatter({
			...concept,
			_crosswalker: { ...provenance, import_set: { id: 'iset-abc123', scheme: 'endpoint-v1' } },
		}).valid).toBe(true);
		expect(validateTier1Frontmatter({
			...concept,
			_crosswalker: { ...provenance, import_set: { id: 'derived-name', scheme: 'endpoint-v1' } },
		}).valid).toBe(false);
		expect(validateTier1Frontmatter({
			...concept,
			_crosswalker: { ...provenance, import_set: { id: 'iset-abc123', scheme: 'future-v1' } },
		}).valid).toBe(false);
		expect(validateTier1Frontmatter({
			...concept,
			_crosswalker: { ...provenance, import_set: { id: 'iset-abc123' } },
		}).valid).toBe(false);
	});

	it('accepts optional identities while rejecting malformed CURIEs', () => {
		const base = { curie: 'cwk:jn-1', kind: 'junction-note', subject: 'Concepts/A', predicate: 'covers', object: 'Evidence/X', _crosswalker: provenance };
		expect(validateTier1Frontmatter(base).valid).toBe(true);
		expect(validateTier1Frontmatter({ ...base, subject_curie: 'nist:AC-2', object_curie: 'org:policy' }).valid).toBe(true);
		expect(validateTier1Frontmatter({ ...base, subject_curie: 'AC-2' }).valid).toBe(false);
	});
});

describe('mapping-set provenance normalization', () => {
	it('trims only outer whitespace and preserves case and internal syntax', () => {
		expect(normalizeMappingSetId('  Set A/Release-1  ')).toBe('Set A/Release-1');
		expect(normalizeMappingSetId(undefined)).toBe('');
		expect(mappingSetPathKey(' Set:A ')).toBe(mappingSetPathKey('Set:A'));
	});

	it('accepts only absent/empty input or exact NOT and validates stored values strictly', () => {
		expect(normalizePredicateModifierInput(undefined)).toBe('');
		expect(normalizePredicateModifierInput('NOT')).toBe('NOT');
		expect(normalizePredicateModifierInput(' NOT ')).toBe('NOT');
		expect(() => normalizePredicateModifierInput('not')).toThrow('exact uppercase NOT');
		expect(() => normalizePredicateModifierInput('   ')).toThrow('only whitespace');
		expect(readStoredPredicateModifier({})).toBe('');
		expect(readStoredPredicateModifier({ predicate_modifier: 'NOT' })).toBe('NOT');
		expect(() => readStoredPredicateModifier({ predicate_modifier: '' })).toThrow('must be absent');
	});

	it('includes explicit negation in deterministic assertion identity', () => {
		const base = { subject_id: 'x:A', predicate_id: 'is_equivalent_to', object_id: 'x:B' };
		expect(assertionBaseKey({ ...base, predicate_modifier: '' })).not.toBe(
			assertionBaseKey({ ...base, predicate_modifier: 'NOT' }),
		);
	});

	it('validates mapping provenance fields while keeping legacy notes valid', () => {
		const edge = { curie: 'xwalk:a', kind: 'crosswalk-edge', subject_id: 'x:A', predicate_id: 'is_equivalent_to', object_id: 'x:B', _crosswalker: provenance };
		expect(validateTier1Frontmatter(edge).valid).toBe(true);
		expect(validateTier1Frontmatter({ ...edge, mapping_set_id: 'Set:A', predicate_modifier: 'NOT' }).valid).toBe(true);
		expect(validateTier1Frontmatter({ ...edge, mapping_set_id: '' }).valid).toBe(false);
		expect(validateTier1Frontmatter({ ...edge, predicate_modifier: '' }).valid).toBe(false);
	});
});
