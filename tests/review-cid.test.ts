/**
 * review-cid.test.ts — the fingerprint that decides whether an approved
 * evidence link survives an upstream release (Ch 43 re-attestation, 2026-08-28).
 *
 * WHAT IS ACTUALLY AT STAKE
 *
 * A framework release does not ordinarily strand work: identifiers survive
 * essentially 100%. What it silently invalidates is the CLAIM — "this evidence
 * satisfies AC-2" — because AC-2 is no longer the text the reviewer read. So
 * this hash draws exactly one line, and both sides of it are expensive to get
 * wrong:
 *
 *   - Too tolerant, and a rewritten control hashes the same as the old one.
 *     The report stays green over an invalidated claim. That is the worst
 *     failure this codebase has.
 *   - Too strict, and every citation-marker refresh sends a compliance team
 *     back through hundreds of re-reviews for typography.
 *
 * The bias is deliberately toward the second: a false flag costs five seconds
 * of human attention, a false pass costs an audit.
 *
 * The drift examples below are REAL, taken from the Ch 43 release-diff evidence
 * deliverable (ATT&CK 15.1 -> 16.1 and CIS 8.1 -> 8.1.2), not invented shapes.
 */

import {
	computeConceptCid,
	computeReviewCid,
	normalizeForReview,
	normalizeReviewString,
	reviewCidCanonicalInput,
} from '../src/generation/hash';

const CURIE = 'mitre-attack:T1078';

function cid(scope: Record<string, unknown>, curie = CURIE): string {
	return computeReviewCid({ curie, scope });
}

// ---------------------------------------------------------------------------
// The fourteen steps, asserted on the normalized STRING
// ---------------------------------------------------------------------------

/**
 * Asserted on the string, not only on the digest, so a failure names the step
 * that diverged rather than reporting "two hashes differ" — the same discipline
 * `recipeHashCanonicalInput` established for the recipe hash.
 */
describe('normalizeReviewString folds shape and keeps words', () => {
	const cases: Array<[string, string, string]> = [
		['NFC composition', 'Accés Control', 'Accés Control'],
		[
			'citation markers (the ATT&CK cosmetic class)',
			'Adversaries may obtain credentials.(Citation: Mandiant APT29 2024) They then log in.',
			'Adversaries may obtain credentials. They then log in.',
		],
		['numeric footnote markers', 'Account Management[3] applies.', 'Account Management applies.'],
		[
			'markdown link destinations, text kept',
			'See [Valid Accounts](https://attack.mitre.org/techniques/T1078) for detail.',
			'See Valid Accounts for detail.',
		],
		['markdown autolinks', 'Reference <https://csrc.nist.gov/x> here.', 'Reference here.'],
		['HTML tags, inner text kept', 'Use <code>sudo</code> carefully.', 'Use sudo carefully.'],
		['curly quotes', '“the organization’s” policy', '"the organization\'s" policy'],
		['dashes', 'multi–factor — required', 'multi-factor - required'],
		['ellipsis', 'and so on…', 'and so on...'],
		['zero-width and soft hyphen', 'AC​-­2', 'AC-2'],
		['unicode spaces', 'AC 2 management', 'AC 2 management'],
		['line endings and whitespace collapse', 'line one\r\n\r\nline  two', 'line one line two'],
		['trim', '   padded   ', 'padded'],
	];

	for (const [name, input, expected] of cases) {
		it(name, () => {
			expect(normalizeReviewString(input)).toBe(expected);
		});
	}

	it('collapses whitespace LAST, so removed markup leaves no doubled space', () => {
		// If collapse ran before the deletions, this would normalize to a string
		// with a double space in it and hash differently from the clean text.
		expect(normalizeReviewString('Log in.(Citation: X 2024) Then persist.'))
			.toBe('Log in. Then persist.');
	});

	it('may normalize to the empty string, and the key still exists', () => {
		expect(normalizeReviewString('(Citation: Only 2024)')).toBe('');
		expect(normalizeForReview({ note: '(Citation: Only 2024)' })).toEqual({ note: '' });
	});
});

describe('what normalizeForReview deliberately does NOT do', () => {
	it('never deletes ASCII punctuation', () => {
		// Fork F3. The evidence deliverable normalizer removed punctuation
		// differences too. Over-normalizing hides a material change and produces
		// a green report over an invalidated claim; under-normalizing costs one
		// false flag. Bias to under-normalize.
		expect(normalizeReviewString('Inventory sensitive data, at a minimum.'))
			.not.toBe(normalizeReviewString('Inventory sensitive data at a minimum'));
	});

	it('never folds case', () => {
		// toLowerCase is locale-sensitive (Turkish dotless i), which would break
		// the "an external producer reimplements this and agrees" requirement.
		expect(cid({ title: 'Account Management' })).not.toBe(cid({ title: 'account management' }));
	});

	it('never normalizes object keys', () => {
		// A renamed column changes what the row asserts and what templates
		// address. That is a real change, not typography.
		expect(cid({ 'Asset Class': 'Data' })).not.toBe(cid({ 'asset class': 'Data' }));
	});

	it('distinguishes an emptied column from a removed one', () => {
		const emptied = cid({ title: 'AC-2', description: '' });
		const removed = cid({ title: 'AC-2' });
		const present = cid({ title: 'AC-2', description: 'Manage accounts.' });
		expect(emptied).not.toBe(removed);
		expect(emptied).not.toBe(present);
	});

	it('walks nested objects and arrays', () => {
		expect(normalizeForReview({ platforms: ['Azure AD', { note: 'x–y' }], depth: 2 }))
			.toEqual({ platforms: ['Azure AD', { note: 'x-y' }], depth: 2 });
	});
});

// ---------------------------------------------------------------------------
// Cosmetic vs material, on real release drift
// ---------------------------------------------------------------------------

describe('cosmetic drift does not invalidate an approval', () => {
	it('ATT&CK trivial class: citations, footnotes, markup, typography, spacing', () => {
		// The 0.3% "trivial drift" class measured on ATT&CK 15.1 -> 16.1
		// (5 of 1,584 survivors). Everything a reviewer read is unchanged.
		const before = {
			id: 'T1078',
			name: 'Valid Accounts',
			description:
				'Adversaries may obtain and abuse credentials of existing accounts.'
				+ '(Citation: volexity_0day_sophos_FW) Compromised credentials may be used to'
				+ ' bypass access controls[2] placed on various resources.',
		};
		const after = {
			id: 'T1078',
			name: 'Valid Accounts',
			description:
				'Adversaries may obtain and abuse credentials of existing accounts.'
				+ ' Compromised  credentials may be used to bypass <code>access controls</code>'
				+ ' placed on various resources.',
		};
		expect(cid(after)).toBe(cid(before));
		// And the identity hash still records that the SOURCE BYTES moved, which
		// is what it is for. Two hashes, two questions.
		expect(computeConceptCid({ curie: CURIE, scope: after }))
			.not.toBe(computeConceptCid({ curie: CURIE, scope: before }));
	});

	it('a link destination changes but the link text does not', () => {
		expect(cid({ description: 'See [Valid Accounts](https://old.example/a).' }))
			.toBe(cid({ description: 'See [Valid Accounts](https://new.example/b).' }));
	});
});

describe('material drift DOES invalidate an approval', () => {
	it('T1496 Resource Hijacking: the description was rewritten', () => {
		// Real ATT&CK 15.1 -> 16.1 material change, token-set similarity 0.233.
		const before = { id: 'T1496', description: 'Adversaries may leverage the resources of co-opted systems to complete resource-intensive tasks, which may impact system and/or hosted service availability. One common purpose for Resource Hijacking is to validate transactions of cryptocurrency networks and earn virtual currency.' };
		const after = { id: 'T1496', description: 'Adversaries may leverage the resources of co-opted systems to complete resource-intensive tasks, which may impact system and/or hosted service availability. Resource hijacking may take a number of different forms, including compute hijacking, bandwidth hijacking, SMS pumping, and cloud service hijacking.' };
		expect(cid(after, 'mitre-attack:T1496')).not.toBe(cid(before, 'mitre-attack:T1496'));
	});

	it('T1001.003: the same identifier, a renamed technique', () => {
		// The one stable-ID rename in the pair. The name is content a reviewer
		// read, so it must move the fingerprint.
		expect(cid({ id: 'T1001.003', name: 'Data Obfuscation: Protocol or Service Impersonation' }))
			.not.toBe(cid({ id: 'T1001.003', name: 'Data Obfuscation: Protocol Impersonation' }));
	});

	it('CIS 3.2: a single removed word changes the requirement', () => {
		// Real CIS 8.1 -> 8.1.2 material change. "annually" was dropped.
		const before = { id: '3.2', description: 'Inventory sensitive data annually, at a minimum.' };
		const after = { id: '3.2', description: 'Inventory sensitive data, at a minimum.' };
		expect(cid(after, 'cis:3.2')).not.toBe(cid(before, 'cis:3.2'));
	});
});

describe('the fingerprint covers the WHOLE row, not one description column', () => {
	it('CIS 8.4: asset class Data -> Network with the description untouched', () => {
		// Real CIS 8.1 -> 8.1.2 reclassification. Four safeguards moved class with
		// no prose change at all. On the ATT&CK pair the equivalent class is
		// larger: 98 of 637 techniques (15.4%) changed platform or data-source
		// membership with no description change. A description-only fingerprint
		// would report all of that as unchanged.
		const description = 'Perform traffic filtering between network segments, where appropriate.';
		expect(cid({ id: '8.4', description, asset_class: 'Network' }, 'cis:8.4'))
			.not.toBe(cid({ id: '8.4', description, asset_class: 'Data' }, 'cis:8.4'));
	});

	it('CIS 16.3: security function Protect -> Detect with the description untouched', () => {
		const description = 'Perform root cause analysis on security vulnerabilities.';
		expect(cid({ id: '16.3', description, security_function: 'Detect' }, 'cis:16.3'))
			.not.toBe(cid({ id: '16.3', description, security_function: 'Protect' }, 'cis:16.3'));
	});
});

// ---------------------------------------------------------------------------
// The two hashes stay two hashes
// ---------------------------------------------------------------------------

describe('review_cid is a SECOND hash, never a redefinition of concept_cid', () => {
	it('emits the sha256-<64hex> shape the schema requires', () => {
		expect(cid({ title: 'Account Management' })).toMatch(/^sha256-[a-f0-9]{64}$/);
	});

	it('is stable across repeated computation', () => {
		const scope = { id: 'AC-2', description: 'Manage accounts.’' };
		expect(cid(scope)).toBe(cid(scope));
	});

	it('is insensitive to key insertion order, like concept_cid', () => {
		expect(cid({ a: '1', b: '2' })).toBe(cid({ b: '2', a: '1' }));
	});

	it('changes when the curie changes: identity is part of what was read', () => {
		expect(cid({ title: 'x' }, 'nist:AC-2')).not.toBe(cid({ title: 'x' }, 'nist:AC-3'));
	});

	it('differs from concept_cid for the same record', () => {
		// Not a correctness requirement in itself, but a guard: if these ever
		// collapse to the same value, one of them stopped doing its job.
		const scope = { description: 'A “quoted” control.' };
		expect(cid(scope)).not.toBe(computeConceptCid({ curie: CURIE, scope }));
	});

	it('does not disturb concept_cid for content it folds', () => {
		// The no-op guarantee, from the other direction: nothing in this feature
		// may change what concept_cid says about a row.
		const scope = { description: 'A “quoted” control.' };
		expect(computeConceptCid({ curie: CURIE, scope }))
			.toBe(computeConceptCid({ curie: CURIE, scope: { description: 'A “quoted” control.' } }));
	});

	it('exposes the canonical input so a divergence names its cause', () => {
		expect(reviewCidCanonicalInput({ curie: 'nist:AC-2', scope: { t: 'a b' } }))
			.toBe('{"curie":"nist:AC-2","scope":{"t":"a b"}}');
	});
});
