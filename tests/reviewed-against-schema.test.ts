/**
 * reviewed-against-schema.test.ts — the review baseline is BOTH sub-fields or
 * neither (Ch 43 re-attestation, 2026-08-28).
 *
 * A record with only one of `curie` / `review_cid` is a half-fact, and
 * half-facts are how "not recorded" becomes "not true": a fingerprint with no
 * subject cannot say which control it was taken from after a rename, and a
 * subject with no fingerprint cannot be compared to anything. The schema
 * rejects the half-record so a producer must either record the whole fact or
 * record none of it — the honest absence.
 *
 * Also pins ADDITIVITY: every shape that validated before this field existed
 * still validates. The `$id` was deliberately not bumped, and that claim is
 * only true if these pass.
 */

import { initValidator, validateTier1Frontmatter } from '../src/validation/validator';

const CID = `sha256-${'a'.repeat(64)}`;

beforeAll(() => {
	initValidator();
});

function junction(extra: Record<string, unknown> = {}): Record<string, unknown> {
	return {
		curie: 'cwk:jn-bdfd9a',
		kind: 'junction-note',
		subject: 'Frameworks/NIST 800-53 r5/AC/AC-2',
		subject_curie: 'nist:AC-2',
		predicate: 'has_evidence',
		object: 'Evidence/MFA-Policy',
		status: 'approved',
		coverage: 'full',
		_crosswalker: {
			spec_version: 'https://crosswalker.dev/spec/tier1.schema.json',
			source_ref: { file: 'manual-mapping.csv' },
			produced_at: '2026-05-04T18:42:00Z',
		},
		...extra,
	};
}

describe('reviewed_against on a junction note', () => {
	it('accepts a complete baseline', () => {
		const result = validateTier1Frontmatter(
			junction({ reviewed_against: { curie: 'nist:AC-2', review_cid: CID } }),
		);
		expect(result.errors).toEqual([]);
		expect(result.valid).toBe(true);
	});

	it('rejects a baseline with no fingerprint', () => {
		expect(validateTier1Frontmatter(junction({ reviewed_against: { curie: 'nist:AC-2' } })).valid)
			.toBe(false);
	});

	it('rejects a baseline with no subject identity', () => {
		expect(validateTier1Frontmatter(junction({ reviewed_against: { review_cid: CID } })).valid)
			.toBe(false);
	});

	it('rejects an extra sub-field, so a second producer cannot invent one', () => {
		expect(validateTier1Frontmatter(
			junction({ reviewed_against: { curie: 'nist:AC-2', review_cid: CID, confidence: 0.9 } }),
		).valid).toBe(false);
	});

	it('rejects a fingerprint that is not a sha256 cid', () => {
		expect(validateTier1Frontmatter(
			junction({ reviewed_against: { curie: 'nist:AC-2', review_cid: 'abc123' } }),
		).valid).toBe(false);
	});

	it('accepts a junction with NO reviewed_against at all', () => {
		// The absence ruling, at the schema layer: omitting the block is a legal,
		// expected shape. Every link written before this field existed is this.
		expect(validateTier1Frontmatter(junction()).valid).toBe(true);
	});
});

describe('review_cid on the provenance block', () => {
	it('accepts a concept note carrying one', () => {
		const result = validateTier1Frontmatter({
			curie: 'nist:AC-2',
			title: 'Account Management',
			_crosswalker: {
				spec_version: 'https://crosswalker.dev/spec/tier1.schema.json',
				source_ref: { file: 'nist.csv' },
				produced_at: '2026-05-04T18:42:00Z',
				concept_cid: CID,
				review_cid: `sha256-${'b'.repeat(64)}`,
			},
		});
		expect(result.errors).toEqual([]);
		expect(result.valid).toBe(true);
	});

	it('accepts a concept note carrying none', () => {
		// `provenance_block` is additionalProperties:false, so this had to be a
		// declared property. It is optional: a producer that computes no
		// fingerprint emits nothing, and that is not a claim of no change.
		expect(validateTier1Frontmatter({
			curie: 'nist:AC-2',
			_crosswalker: {
				spec_version: 'https://crosswalker.dev/spec/tier1.schema.json',
				source_ref: { file: 'nist.csv' },
				produced_at: '2026-05-04T18:42:00Z',
			},
		}).valid).toBe(true);
	});

	it('rejects a malformed fingerprint rather than storing it', () => {
		expect(validateTier1Frontmatter({
			curie: 'nist:AC-2',
			_crosswalker: {
				spec_version: 'https://crosswalker.dev/spec/tier1.schema.json',
				source_ref: { file: 'nist.csv' },
				produced_at: '2026-05-04T18:42:00Z',
				review_cid: 'sha256-nothex',
			},
		}).valid).toBe(false);
	});
});
