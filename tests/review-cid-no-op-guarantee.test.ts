/**
 * review-cid-no-op-guarantee.test.ts — a vault that uses none of this must be
 * byte-identical to what it is today (Ch 43 re-attestation §8, F1-F3).
 *
 * WHY THIS FILE EXISTS AT ALL
 *
 * This project has twice come within one line of shipping a change that
 * rewrote every generated note in every vault. `recipeHashCanonicalInput`
 * carries the scar: coercing an absent field to `null` would have injected a
 * key into the canonical string and made every existing note look
 * recipe-drifted on its next re-import. The same hazard is live here, which is
 * exactly why `review_cid` is a SECOND hash rather than a redefinition of
 * `concept_cid`.
 *
 * The pinned digests below are the guard. If a future edit changes what
 * `concept_cid` means, this file fails before a user's vault does.
 */

import {
	computeConceptCid,
	computeRecipeHash,
	recipeHashCanonicalInput,
} from '../src/generation/hash';
import { buildProvenance } from '../src/generation/provenance';

const RECORD = { curie: 'nist:AC-2', scope: { title: 'Account Management', family: 'AC' } };

describe('concept_cid is untouched, byte for byte', () => {
	it('produces the same digest it produced before review_cid existed', () => {
		// Pinned literal, not a round trip. A round trip would happily agree with
		// itself after a redefinition; only a literal catches one.
		expect(computeConceptCid(RECORD))
			.toBe('sha256-8d693991cd2f1a45d18c70e4ccb4b28ee8cd96dffa083bf20aff5888d79d21ba');
	});

	it('still moves when the source bytes move, including cosmetically', () => {
		// The identity hash is SUPPOSED to notice a re-typeset row. That is the
		// question it answers, and review_cid answering a different one does not
		// change it.
		const curly = computeConceptCid({ curie: 'nist:AC-2', scope: { title: 'The org’s accounts' } });
		const straight = computeConceptCid({ curie: 'nist:AC-2', scope: { title: "The org's accounts" } });
		expect(curly).not.toBe(straight);
	});
});

describe('nothing in this feature enters the recipe hash', () => {
	const target = { layout: [{ level: 'control', mechanism: 'file', template: '{id}.md' }] };

	it('canonical input is unchanged for a target with no source', () => {
		// Pinned literal. Nothing from this feature may appear in this string:
		// a new key here would make every already-written recipe.hash look
		// drifted on the next re-import, in every vault.
		expect(recipeHashCanonicalInput(target as any)).toBe(
			'{"also_emit":null,"enrichment":null,'
			+ '"layout":[{"level":"control","mechanism":"file","template":"{id}.md"}]}',
		);
		expect(recipeHashCanonicalInput(target as any)).not.toContain('review');
	});

	it('the recipe hash of that target is unchanged', () => {
		expect(computeRecipeHash(target as any)).toMatch(/^sha256-[a-f0-9]{64}$/);
		expect(computeRecipeHash(target as any)).toBe(computeRecipeHash(target as any));
	});
});

describe('a producer that computes no fingerprint emits exactly what it did before', () => {
	const VERSION = '0.1.0';

	it('omits review_cid rather than writing a null or an empty string', () => {
		// `?? null` is the idiom that nearly rewrote every vault once already.
		// An absent fingerprint must leave NO key behind, or every note's
		// frontmatter changes on the next re-import for nothing.
		const block = buildProvenance({ sourceFile: 'nist.csv', conceptCid: 'sha256-abc' }, VERSION);
		expect(Object.keys(block)).not.toContain('review_cid');
		expect('review_cid' in block).toBe(false);
	});

	it('produces an identical key set to a pre-feature block', () => {
		const block = buildProvenance(
			{ sourceFile: 'nist.csv', recipeId: 'r', recipeHash: 'sha256-h', conceptCid: 'sha256-c' },
			VERSION,
		);
		expect(Object.keys(block).sort())
			.toEqual(['concept_cid', 'produced_at', 'producer', 'recipe', 'source_ref', 'spec_version']);
	});

	it('writes the fingerprint only when one was supplied', () => {
		const block = buildProvenance({ sourceFile: 'nist.csv', reviewCid: 'sha256-r' }, VERSION);
		expect(block.review_cid).toBe('sha256-r');
	});

	it('treats an empty fingerprint as absence', () => {
		expect('review_cid' in buildProvenance({ reviewCid: '' }, VERSION)).toBe(false);
	});
});
