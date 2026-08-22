/**
 * evidence-coverage.ts — the authoritative answer to "which controls have
 * evidence, and which do not" (2026-08-21, Challenge 45 §4.3).
 *
 * WHY THIS EXISTS
 *
 * The question a compliance reader actually asks is a NEGATIVE one: which
 * controls have *no* valid evidence. That question cannot be answered from
 * Markdown alone. Obsidian Bases filters a set of notes; it cannot report on
 * the notes that are missing a relationship, because the row it would need to
 * emit does not exist. Two earlier attempts got this wrong in ways that both
 * produced confident, well-formatted, wrong answers:
 *
 *   - A Base filtering `length(evidence) == 0` over control notes. No recipe
 *     ever emitted an `evidence` property, so the filter matched every control
 *     and the report read "nothing has evidence" regardless of the truth.
 *   - Counting backlinks. Hierarchy links, index links, and crosswalk links are
 *     all backlinks, so nearly every control looked covered.
 *
 * The anti-join belongs here, in SQL, where "no matching row" is expressible.
 *
 * WHAT COUNTS AS EVIDENCE
 *
 * Deliberately strict, because the failure mode of a coverage report is someone
 * concluding a control is satisfied when it is not. A junction counts only when
 * all of the following hold:
 *
 *   1. Its predicate is exactly `has_evidence`. Other predicates are real data
 *      and may be perfectly valid relationships, but they are not a claim that
 *      evidence satisfies a control, so they never count toward coverage.
 *   2. It resolves to a concept BY IDENTITY (`subject_curie` matching a
 *      concept's `curie`), never by wikilink text. Text matching is how a
 *      renamed note silently detaches its evidence.
 *   3. `status` is `approved`. Proposed and in-review evidence is not evidence.
 *   4. `coverage` is `full` or `partial`. `none` and `n/a` are explicit
 *      statements that this artifact does NOT cover the control.
 *   5. It is not expired or stale under the review policy.
 *
 * Anything failing these is EXCLUDED and DIAGNOSABLE (see
 * `diagnoseExcludedJunctions`), never silently reinterpreted. A junction
 * pointing the wrong way, or carrying a near-miss predicate, is a data problem
 * for a human to fix — guessing at intent is how a coverage number stops
 * meaning anything.
 *
 * DIRECTION
 *
 * `subject` is the CONTROL; `object` is the evidence artifact. The junction
 * reads "control has_evidence document". This matters: the inverse reading
 * ("document implements control") was published in the GRC guide and produces
 * zero coverage rows against this query, because `subject_curie` then holds an
 * evidence document that matches no concept.
 */

/** The one predicate that constitutes a claim of evidence coverage. */
export const CANONICAL_EVIDENCE_PREDICATE = 'has_evidence';

/** Coverage states a concept can be in. `partial` is deliberately NOT `covered`. */
export type CoverageState = 'covered' | 'partial' | 'uncovered';

/** One concept plus its valid-evidence tallies. */
export interface EvidenceCoverageRow {
	curie: string;
	title: string;
	vault_path: string;
	/** Junctions meeting every validity rule above. */
	valid_count: number;
	/** Of those, the ones asserting `coverage: full`. */
	full_count: number;
	/** Of those, the ones asserting `coverage: partial`. */
	partial_count: number;
	coverage_state: CoverageState;
}

/** Aggregate posture for one ontology. Every field is a count of concepts. */
export interface EvidenceCoverageSummary {
	ontology_id: string;
	total_concepts: number;
	covered: number;
	partial: number;
	uncovered: number;
	/** Junctions excluded for any reason — the number a reader should ask about. */
	excluded_junctions: number;
}

/** Why one junction did not count toward coverage. */
export type ExclusionReason =
	| 'predicate-not-canonical'
	| 'no-subject-identity'
	| 'subject-not-a-known-concept'
	| 'not-approved'
	| 'coverage-not-asserted'
	| 'expired'
	| 'stale';

/** One junction that exists but does not count, and the reason. */
export interface ExcludedJunction {
	vault_path: string;
	subject: string;
	subject_curie: string | null;
	predicate: string;
	reason: ExclusionReason;
}

/**
 * The validity predicate, as a SQL fragment applied to the aliased
 * `junction_notes_with_freshness` row `j`. Kept in one place so the coverage
 * query, the summary, and the exclusion diagnostics can never drift apart —
 * a report and its own explanation disagreeing is worse than either alone.
 *
 * `not-set` freshness (no review_date and no expires_at) is admitted. Refusing
 * it would zero out coverage for every team that has not yet adopted review
 * dates, which reports a data-entry gap as a compliance gap.
 */
const VALID_JUNCTION_CONDITIONS = `
	j.predicate = $predicate
	AND j.status = 'approved'
	AND j.coverage IN ('full', 'partial')
	AND j.freshness NOT IN ('expired', 'stale')
`;

/** Row shape returned by the grouped coverage query, before state derivation. */
type RawCoverageRow = [string, string, string, number, number, number];

/** Derive the reported state. `full` evidence outranks `partial`; absence is absence. */
function deriveState(fullCount: number, validCount: number): CoverageState {
	if (fullCount > 0) return 'covered';
	if (validCount > 0) return 'partial';
	return 'uncovered';
}

/**
 * Every concept in `ontologyId` with its valid-evidence tallies, including the
 * concepts with none. The LEFT JOIN is the whole point: an INNER JOIN can only
 * ever describe controls that already have evidence, which is the opposite of
 * the question being asked.
 */
export function evidenceCoverageByConcept(db: any, ontologyId: string): EvidenceCoverageRow[] {
	const rows = db.exec({
		sql: `
			SELECT
				c.curie,
				c.title,
				c.vault_path,
				COUNT(j.vault_path) AS valid_count,
				COALESCE(SUM(CASE WHEN j.coverage = 'full' THEN 1 ELSE 0 END), 0) AS full_count,
				COALESCE(SUM(CASE WHEN j.coverage = 'partial' THEN 1 ELSE 0 END), 0) AS partial_count
			FROM concepts c
			LEFT JOIN junction_notes_with_freshness j
				ON j.subject_curie = c.curie
				AND ${VALID_JUNCTION_CONDITIONS}
			WHERE c.ontology_id = $ontology_id
			GROUP BY c.curie, c.title, c.vault_path
			ORDER BY c.curie
		`,
		bind: { $ontology_id: ontologyId, $predicate: CANONICAL_EVIDENCE_PREDICATE },
		rowMode: 'array',
		returnValue: 'resultRows',
	}) as RawCoverageRow[];

	return rows.map((r) => ({
		curie: String(r[0]),
		title: String(r[1]),
		vault_path: String(r[2]),
		valid_count: Number(r[3]),
		full_count: Number(r[4]),
		partial_count: Number(r[5]),
		coverage_state: deriveState(Number(r[4]), Number(r[3])),
	}));
}

/**
 * Concepts with zero valid evidence — the trustworthy replacement for the
 * withdrawn `length(evidence) == 0` Base and for backlink counting.
 */
export function conceptsWithoutValidEvidence(db: any, ontologyId: string): EvidenceCoverageRow[] {
	return evidenceCoverageByConcept(db, ontologyId).filter((row) => row.valid_count === 0);
}

/**
 * Aggregate posture for one ontology. Counts concepts, not junctions, except
 * `excluded_junctions`, which counts junctions deliberately: it is the number
 * that tells a reader how much data was set aside before the percentages above
 * it were computed.
 */
export function evidenceCoverageSummary(db: any, ontologyId: string): EvidenceCoverageSummary {
	const rows = evidenceCoverageByConcept(db, ontologyId);
	let covered = 0;
	let partial = 0;
	let uncovered = 0;
	for (const row of rows) {
		if (row.coverage_state === 'covered') covered += 1;
		else if (row.coverage_state === 'partial') partial += 1;
		else uncovered += 1;
	}
	return {
		ontology_id: ontologyId,
		total_concepts: rows.length,
		covered,
		partial,
		uncovered,
		excluded_junctions: diagnoseExcludedJunctions(db).length,
	};
}

/**
 * Every junction that exists but does not count, with the reason.
 *
 * This is the counterpart that makes a strict rule usable. Without it, a team
 * whose junctions all point the wrong way sees "0 controls covered" and has no
 * way to discover that their data is one direction-flip away from correct.
 *
 * Reasons are evaluated in a fixed priority order so each junction gets exactly
 * one, and so the most actionable problem wins: a junction with a wrong
 * predicate AND no identity is reported as the predicate problem, because
 * fixing the predicate is what the author actually intended to write.
 */
export function diagnoseExcludedJunctions(db: any): ExcludedJunction[] {
	const rows = db.exec({
		sql: `
			SELECT
				j.vault_path,
				j.subject,
				j.subject_curie,
				j.predicate,
				CASE
					WHEN j.predicate <> $predicate THEN 'predicate-not-canonical'
					WHEN j.subject_curie IS NULL OR j.subject_curie = '' THEN 'no-subject-identity'
					WHEN NOT EXISTS (SELECT 1 FROM concepts c WHERE c.curie = j.subject_curie)
						THEN 'subject-not-a-known-concept'
					WHEN j.status IS NULL OR j.status <> 'approved' THEN 'not-approved'
					WHEN j.coverage IS NULL OR j.coverage NOT IN ('full', 'partial')
						THEN 'coverage-not-asserted'
					WHEN j.freshness = 'expired' THEN 'expired'
					ELSE 'stale'
				END AS reason
			FROM junction_notes_with_freshness j
			WHERE NOT (
				${VALID_JUNCTION_CONDITIONS}
				AND j.subject_curie IS NOT NULL
				AND j.subject_curie <> ''
				AND EXISTS (SELECT 1 FROM concepts c WHERE c.curie = j.subject_curie)
			)
			ORDER BY j.vault_path
		`,
		bind: { $predicate: CANONICAL_EVIDENCE_PREDICATE },
		rowMode: 'array',
		returnValue: 'resultRows',
	}) as unknown[][];

	return rows.map((r) => ({
		vault_path: String(r[0]),
		subject: String(r[1]),
		subject_curie: r[2] === null || r[2] === undefined || r[2] === '' ? null : String(r[2]),
		predicate: String(r[3]),
		reason: String(r[4]) as ExclusionReason,
	}));
}
