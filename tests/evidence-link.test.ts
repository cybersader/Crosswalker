/**
 * evidence-link.test.ts — the command must make the correct contract the
 * default, not merely a possibility (2026-08-21).
 *
 * The reason this command exists is that hand-authored links kept coming out
 * wrong: the published example had the direction inverted, and a per-row
 * predicate column let imports emit links that never counted. So the tests that
 * matter are the ones asserting a user CANNOT produce those shapes here.
 */

import {
	buildEvidenceLink,
	evidenceLinkPath,
	type EvidenceLinkInput,
} from '../src/views/evidence-link';
import { CANONICAL_EVIDENCE_PREDICATE } from '../src/tier2/evidence-coverage';

function input(over: Partial<EvidenceLinkInput> = {}): EvidenceLinkInput {
	return {
		controlPath: 'Frameworks/NIST/AC-2.md',
		controlCurie: 'nist-800-53:AC-2',
		evidencePath: 'Evidence/MFA policy.md',
		coverage: 'full',
		status: 'approved',
		folder: 'Evidence/Junctions',
		...over,
	};
}

describe('the direction cannot come out backwards', () => {
	it('puts the control in subject and the evidence in object', () => {
		const { markdown } = buildEvidenceLink(input());
		expect(markdown).toMatch(/subject: "\[\[Frameworks\/NIST\/AC-2\.md\|AC-2\]\]"/);
		expect(markdown).toMatch(/object: "\[\[Evidence\/MFA policy\.md\|MFA policy\]\]"/);
	});

	it('always writes the canonical predicate', () => {
		// Never asked about in the UI, so it cannot be set to a near-miss value
		// that produces a link counting toward nothing.
		expect(buildEvidenceLink(input()).markdown)
			.toContain(`predicate: ${CANONICAL_EVIDENCE_PREDICATE}`);
	});

	it('carries the control identifier so a rename does not detach the link', () => {
		expect(buildEvidenceLink(input()).markdown).toContain('subject_curie: "nist-800-53:AC-2"');
	});

	it('omits the identifier rather than inventing one when the control has none', () => {
		// A fabricated identifier would be reported as unresolvable, which reads
		// as data corruption. Omitting it yields the clearer diagnosis that the
		// note was never imported by Crosswalker.
		const { markdown } = buildEvidenceLink(input({ controlCurie: null }));
		expect(markdown).not.toContain('subject_curie');
	});
});

describe('the note explains whether it counts', () => {
	it('says so when the link counts', () => {
		expect(buildEvidenceLink(input()).markdown).toContain('[!note] Counted');
	});

	it('warns that an unapproved link does not count yet', () => {
		// Proposed is the default in the modal, so this is the common case and
		// the one most likely to be misread as done.
		const { markdown } = buildEvidenceLink(input({ status: 'proposed' }));
		expect(markdown).toContain('[!warning] Not yet counted');
		expect(markdown).toContain('approved');
	});

	it('warns that a coverage of none does not count', () => {
		const { markdown } = buildEvidenceLink(input({ coverage: 'none' }));
		expect(markdown).toContain('does NOT cover');
	});
});

describe('identity and safety', () => {
	it('gives one control/evidence pair a stable path so relinking updates in place', () => {
		// Two notes for one pair would be double-counted by any tally of links.
		expect(evidenceLinkPath('E', 'F/AC-2.md', 'Ev/p.md'))
			.toBe(evidenceLinkPath('E', 'F/AC-2.md', 'Ev/p.md'));
	});

	it('gives different pairs different paths', () => {
		expect(evidenceLinkPath('E', 'F/AC-2.md', 'Ev/a.md'))
			.not.toBe(evidenceLinkPath('E', 'F/AC-3.md', 'Ev/a.md'));
	});

	it('strips characters that would be illegal in a filename', () => {
		const path = evidenceLinkPath('E', 'F/AC:2.md', 'Ev/a?b.md');
		expect(path.slice(path.lastIndexOf('/') + 1)).not.toMatch(/[:?*"<>|]/);
	});

	it('escapes a quote in a path so the frontmatter stays parseable', () => {
		const { markdown } = buildEvidenceLink(input({ evidencePath: 'Evidence/a"b.md' }));
		expect(markdown).toContain('\\"');
	});

	it('writes the optional scope only when given', () => {
		expect(buildEvidenceLink(input()).markdown).not.toContain('scope:');
		expect(buildEvidenceLink(input({ scope: 'Account provisioning only' })).markdown)
			.toContain('scope: "Account provisioning only"');
	});

	it('marks the note as a junction so projection picks it up', () => {
		expect(buildEvidenceLink(input()).markdown).toContain('kind: junction-note');
	});

	it('carries a curie, without which projection rejects the note outright', () => {
		// Found by the round-trip test: an omitted curie produced a note that
		// looked correct in the vault and reached no report at all, because
		// projection refuses junction notes that have no identity.
		expect(buildEvidenceLink(input()).markdown).toMatch(/^curie: cwk:\S+$/m);
	});

	it('keeps the curie legal when a name contains spaces', () => {
		// Evidence documents routinely have spaces; the CURIE grammar forbids
		// them, so a pass-through would emit an invalid identifier.
		const { markdown } = buildEvidenceLink(input({ evidencePath: 'Evidence/MFA policy v2.md' }));
		const curie = /^curie: (\S+)$/m.exec(markdown)?.[1] ?? '';
		expect(curie).toMatch(/^[a-z][a-z0-9_-]*:[A-Za-z0-9._\-()/]+$/);
	});
});
