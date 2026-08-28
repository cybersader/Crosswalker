/**
 * evidence-report.test.ts — the report must never let a reader mistake
 * "we don't know" for "everything is fine" (2026-08-21).
 *
 * The rendering is cosmetic; the honesty rules are not. Each test here pins one
 * way a plausible-looking report would mislead someone making a compliance
 * decision.
 */

import { renderEvidenceReport, type EvidenceReportInput } from '../src/views/evidence-report';
import type { EvidenceCoverageRow, ExcludedJunction } from '../src/tier2/evidence-coverage';
import type { ProjectionStatus } from '../src/tier2/projector';

const FRESH: ProjectionStatus = {
	lastProjectedAt: '2026-08-21T10:00:00.000Z',
	mode: 'full',
	succeeded: true,
};

function row(curie: string, state: 'covered' | 'partial' | 'uncovered'): EvidenceCoverageRow {
	const valid = state === 'uncovered' ? 0 : 1;
	return {
		curie,
		title: curie,
		vault_path: `Frameworks/NIST/${curie}.md`,
		valid_count: valid,
		full_count: state === 'covered' ? 1 : 0,
		partial_count: state === 'partial' ? 1 : 0,
		coverage_state: state,
	};
}

function input(over: Partial<EvidenceReportInput> = {}): EvidenceReportInput {
	const rows = over.rows ?? [row('AC-1', 'covered'), row('AC-2', 'uncovered')];
	return {
		ontologyId: 'nist-800-53',
		rows,
		excluded: [],
		status: FRESH,
		generatedAt: '2026-08-21T12:00:00.000Z',
		summary: {
			ontology_id: 'nist-800-53',
			total_concepts: rows.length,
			covered: rows.filter((r) => r.coverage_state === 'covered').length,
			partial: rows.filter((r) => r.coverage_state === 'partial').length,
			uncovered: rows.filter((r) => r.coverage_state === 'uncovered').length,
			excluded_junctions: 0,
			unbaselined_valid_junctions: 0,
		},
		...over,
	};
}

describe('the report states its own provenance', () => {
	it('says when it was generated', () => {
		expect(renderEvidenceReport(input())).toContain('2026-08-21T12:00:00.000Z');
	});

	it('says when the index behind it was last rebuilt', () => {
		// Without this a months-old index reads as current posture.
		expect(renderEvidenceReport(input())).toContain('2026-08-21T10:00:00.000Z');
	});

	it('admits when index freshness is unknown instead of implying it is fine', () => {
		const out = renderEvidenceReport(input({
			status: { lastProjectedAt: null, mode: 'unknown', succeeded: null },
		}));
		expect(out).toContain('freshness unknown');
		expect(out).toContain('[!warning]');
	});

	it('warns when the index was built from a partial pass', () => {
		// A partial pass may not have seen every note, so its numbers are not a
		// whole-vault statement and must not be presented as one.
		const out = renderEvidenceReport(input({
			status: { lastProjectedAt: '2026-08-21T10:00:00.000Z', mode: 'partial', succeeded: true },
		}));
		expect(out).toContain('partial');
		expect(out).toContain('[!warning]');
	});

	it('warns when the last rebuild reported errors', () => {
		const out = renderEvidenceReport(input({
			status: { lastProjectedAt: '2026-08-21T10:00:00.000Z', mode: 'full', succeeded: false },
		}));
		expect(out).toContain('errors');
		expect(out).toContain('[!warning]');
	});

	it('does not cry wolf on a clean full rebuild', () => {
		expect(renderEvidenceReport(input())).toContain('[!note] Index freshness');
	});
});

describe('the report cannot hide a gap', () => {
	it('lists a control that has no evidence', () => {
		const out = renderEvidenceReport(input());
		expect(out).toContain('Controls with no valid evidence');
		expect(out).toContain('AC-2');
	});

	it('states plainly when there are no gaps rather than showing an empty table', () => {
		const out = renderEvidenceReport(input({ rows: [row('AC-1', 'covered')] }));
		expect(out).toContain('Every control has at least one valid evidence link.');
	});

	it('keeps partial coverage out of the covered count', () => {
		const out = renderEvidenceReport(input({ rows: [row('AC-1', 'partial')] }));
		expect(out).toContain('| Fully covered | 0 |');
		expect(out).toContain('| Partially covered | 1 |');
	});

	it('distinguishes an empty ontology from a fully uncovered one', () => {
		// A table of zeroes is ambiguous: nothing imported, or nothing covered?
		const out = renderEvidenceReport(input({
			rows: [],
			summary: {
				ontology_id: 'nist-800-53', total_concepts: 0, covered: 0,
				partial: 0, uncovered: 0, excluded_junctions: 0,
			},
		}));
		expect(out).toContain('not that nothing is covered');
	});
});

describe('set-aside links are surfaced, not buried', () => {
	const excluded: ExcludedJunction[] = [{
		vault_path: 'Evidence/j1.md',
		subject: '[[MFA-Policy]]',
		subject_curie: 'evidence:MFA-Policy',
		predicate: 'has_evidence',
		reason: 'subject-not-a-known-concept',
	}];

	it('flags the count next to the summary a reader would otherwise trust', () => {
		const out = renderEvidenceReport(input({
			excluded,
			summary: { ...input().summary, excluded_junctions: 1 },
		}));
		expect(out).toContain('1 evidence link was set aside');
		expect(out).toContain('[!important]');
	});

	it('explains each reason as something to fix', () => {
		const out = renderEvidenceReport(input({ excluded }));
		expect(out).toContain('subject-not-a-known-concept');
		expect(out).toContain('the wrong way round');
	});

	it('says so explicitly when nothing was set aside', () => {
		expect(renderEvidenceReport(input())).toContain('Every evidence link in the vault counted');
	});
});

describe('rendering safety', () => {
	it('truncates loudly rather than silently dropping controls', () => {
		const rows = Array.from({ length: 5 }, (_, i) => row(`AC-${i}`, 'uncovered'));
		const out = renderEvidenceReport(input({
			rows,
			limit: 2,
			summary: { ...input().summary, total_concepts: 5, covered: 0, partial: 0, uncovered: 5 },
		}));
		expect(out).toContain('3 more not listed');
	});

	it('escapes a pipe in a path so one bad name cannot break the table', () => {
		const bad = { ...row('AC-1', 'uncovered'), vault_path: 'Frameworks/a|b.md' };
		expect(renderEvidenceReport(input({ rows: [bad] }))).toContain('a\\|b.md');
	});

	it('marks the note as generated and disposable', () => {
		const out = renderEvidenceReport(input());
		expect(out).toContain('crosswalker_generated: true');
		expect(out).toContain('will be lost');
	});
});

describe('the report never turns "we cannot tell" into "it is fine"', () => {
	const unbaselined = [
		{
			vault_path: 'Evidence/Junctions/AC-1--has_evidence--MFA policy.md',
			subject: '[[AC-1]]',
			subject_curie: 'nist-800-53:AC-1',
			baseline: 'unrecorded' as const,
		},
	];

	function withGap(): EvidenceReportInput {
		const base = input({ unbaselined });
		return { ...base, summary: { ...base.summary, unbaselined_valid_junctions: 1 } };
	}

	it('A4: names the section and says CANNOT TELL', () => {
		const md = renderEvidenceReport(withGap());
		expect(md).toContain('Links with no review baseline');
		expect(md).toContain('cannot tell');
	});

	it('A4: never claims the subjects are unchanged, verified, current, or up to date', () => {
		// The whole hazard of reporting an unmeasured fact is that the reassuring
		// word is the natural one to reach for. This pins that none is reachable.
		const md = renderEvidenceReport(withGap()).toLowerCase();
		for (const forbidden of ['unchanged', 'verified', 'up to date']) {
			expect(md).not.toContain(forbidden);
		}
	});

	it('places the count beside the percentages, not three sections below them', () => {
		const md = renderEvidenceReport(withGap());
		expect(md.indexOf('no recorded review baseline')).toBeLessThan(md.indexOf('## Controls with no valid evidence'));
	});

	it('says so plainly when every counted link does have a baseline', () => {
		const md = renderEvidenceReport(input({ unbaselined: [] }));
		expect(md).toContain('Every counted link records the control state it was approved against.');
	});

	it('renders no baseline section at all when the caller did not query one', () => {
		// Silence rather than a fabricated zero: a caller that asked no question
		// must not have an answer invented for it.
		expect(renderEvidenceReport(input())).not.toContain('Links with no review baseline');
	});

	it('tells the reader what to do about each kind of gap', () => {
		const md = renderEvidenceReport(withGap());
		expect(md).toContain('Re-approve this link to record the baseline.');
	});

	it('explains a content-invalidated link as a re-review, not as a broken link', () => {
		const excluded: ExcludedJunction[] = [{
			vault_path: 'Evidence/Junctions/AC-1--has_evidence--MFA policy.md',
			subject: '[[AC-1]]',
			subject_curie: 'nist-800-53:AC-1',
			predicate: 'has_evidence',
			reason: 'subject-changed',
		}];
		const md = renderEvidenceReport(input({ excluded }));
		expect(md).toContain('`subject-changed`');
		expect(md).toContain('The control changed after this link was approved.');
	});
});
