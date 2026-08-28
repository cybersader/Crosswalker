/**
 * evidence-report.ts — render an evidence-coverage report as Markdown.
 *
 * Pure: takes already-queried rows and returns a string. No vault or database
 * access, so the wording and the honesty rules below are unit-testable without
 * a sidecar.
 *
 * WHY A GENERATED NOTE
 *
 * The coverage question cannot be answered by a Bases view (see the withdrawal
 * note in `recipe-templates.ts`), so there is nothing for a user to open and
 * watch update. The report is therefore a point-in-time artifact: it states
 * when it was generated, what index it was generated from, and how much data it
 * had to set aside. A reader who cannot see those three things cannot tell a
 * current posture from a stale one.
 *
 * DISPOSABLE
 *
 * The note is fully regenerated on each run and carries `crosswalker_generated:
 * true`. It is a rendering of the index, never a place to record anything —
 * anything typed into it is lost on the next run, so the header says so.
 */

import type {
	BaselineGap,
	EvidenceCoverageRow,
	EvidenceCoverageSummary,
	ExcludedJunction,
	ExclusionReason,
	ReviewChangeKind,
	SupersededSubject,
	UnbaselinedJunction,
} from '../tier2/evidence-coverage';
import type { ProjectionStatus } from '../tier2/projector';

/** Everything the renderer needs. Assembled by the command; never fetched here. */
export interface EvidenceReportInput {
	ontologyId: string;
	summary: EvidenceCoverageSummary;
	rows: EvidenceCoverageRow[];
	excluded: ExcludedJunction[];
	/**
	 * Valid links with no comparable review baseline, and why (Ch 43 §2.3).
	 * These COUNT toward the numbers above; they are listed so a reader knows
	 * which part of the total Crosswalker cannot verify. Omitted by a caller
	 * that did not query them, which renders no section rather than claiming
	 * zero.
	 */
	unbaselined?: UnbaselinedJunction[];
	/**
	 * Superseded controls that attestations still point at, with the successor
	 * candidates the vault asserts (Ch 43 section 7). Omitted by a caller that did
	 * not query them, which renders no section rather than implying there are none.
	 */
	superseded?: SupersededSubject[];
	status: ProjectionStatus;
	/** ISO timestamp for "generated at". Injected so tests are deterministic. */
	generatedAt: string;
	/** Cap on listed rows per section; the rest are summarized, never dropped silently. */
	limit?: number;
}

const DEFAULT_LIMIT = 500;

/**
 * Plain-language explanation per exclusion reason. Deliberately phrased as the
 * fix rather than the rule: a reader looking at this table wants to know what
 * to change, not to be told their data is invalid.
 */
const REASON_HELP: Record<ExclusionReason, string> = {
	'predicate-not-canonical':
		'The link does not use `has_evidence`, so it is not a claim that this evidence satisfies the control.',
	'no-subject-identity':
		'The link has no stable control identifier, so it cannot be matched to a control reliably.',
	'subject-superseded':
		'The control this link points at is no longer in the index, and a later release says it was replaced. See [[#Links whose control was superseded]] for the replacements, then decide which one this evidence belongs to.',
	'subject-not-a-known-concept':
		'The link points at something that is not an imported control. A link written the wrong way round lands here.',
	'not-approved': 'The link is not approved yet.',
	'coverage-not-asserted':
		'The link does not state how much of the control it covers, or states that it covers none.',
	expired: 'The evidence is past its expiry date.',
	'subject-changed':
		'The control changed after this link was approved. Re-review the evidence against the current control text, then re-approve.',
	stale: 'The evidence has not been reviewed recently enough.',
};

/**
 * What to do about each kind of missing baseline. Phrased as the fix, like
 * REASON_HELP, and never as reassurance: none of these states says the control
 * is unchanged, only that nobody can check.
 */
const BASELINE_HELP: Record<BaselineGap, string> = {
	unrecorded:
		'Re-approve this link to record the baseline. Links approved from now on record it automatically.',
	'subject-absent':
		'The control this link was approved against is not in the index. Re-import it, or re-point the link and re-approve.',
	'subject-unhashed':
		'The control carries no content fingerprint. Re-import it with a current version of Crosswalker, then re-approve this link.',
};

/** Escape the pipe character so a value containing one cannot break the table. */
function cell(value: string): string {
	return value.replace(/\|/g, '\\|');
}

/** Percentage of `total`, or a dash when there is nothing to divide by. */
function percent(part: number, total: number): string {
	if (total === 0) return '—';
	return `${Math.round((part / total) * 1000) / 10}%`;
}

/**
 * The freshness line. Never claims a freshness it cannot substantiate: an
 * unstamped index says so plainly rather than defaulting to something reassuring.
 */
function renderStatusLine(status: ProjectionStatus): string {
	if (!status.lastProjectedAt) {
		return '> [!warning] Index freshness unknown\n'
			+ '> This report was built from an index that has no record of when it was last rebuilt. '
			+ 'Run a re-import or clear the fast query index to rebuild it, then regenerate this report.';
	}

	const parts = [`Index last rebuilt **${status.lastProjectedAt}**`];
	if (status.mode === 'partial') {
		parts.push('from a **partial** pass, which may not have seen every note');
	} else if (status.mode === 'unknown') {
		parts.push('with unknown coverage');
	}
	if (status.succeeded === false) {
		parts.push('and that rebuild reported errors');
	}

	const admonition = status.mode === 'full' && status.succeeded !== false ? 'note' : 'warning';
	const title = admonition === 'note' ? 'Index freshness' : 'Index may be incomplete';
	return `> [!${admonition}] ${title}\n> ${parts.join(', ')}.`;
}

/** Render the whole report. */
export function renderEvidenceReport(input: EvidenceReportInput): string {
	const limit = input.limit ?? DEFAULT_LIMIT;
	const { summary, rows, excluded } = input;
	const gaps = rows.filter((r) => r.coverage_state === 'uncovered');
	const partial = rows.filter((r) => r.coverage_state === 'partial');

	const out: string[] = [];

	out.push('---');
	out.push('crosswalker_generated: true');
	out.push(`ontology: ${input.ontologyId}`);
	out.push(`generated_at: ${input.generatedAt}`);
	out.push('---');
	out.push('');
	out.push(`# Evidence coverage — ${input.ontologyId}`);
	out.push('');
	out.push(
		'> [!caution] This note is regenerated from scratch every time the report runs. '
		+ 'Anything written here will be lost. Record findings in a note of your own.',
	);
	out.push('');
	out.push(renderStatusLine(input.status));
	out.push('');
	out.push(`Generated **${input.generatedAt}**.`);
	out.push('');

	// ---- Summary ----------------------------------------------------------
	out.push('## Summary');
	out.push('');
	out.push('| | Controls | Share |');
	out.push('|---|---:|---:|');
	out.push(`| Fully covered | ${summary.covered} | ${percent(summary.covered, summary.total_concepts)} |`);
	out.push(`| Partially covered | ${summary.partial} | ${percent(summary.partial, summary.total_concepts)} |`);
	out.push(`| No valid evidence | ${summary.uncovered} | ${percent(summary.uncovered, summary.total_concepts)} |`);
	out.push(`| **Total** | **${summary.total_concepts}** | |`);
	out.push('');

	if (summary.total_concepts === 0) {
		// An empty ontology and a broken query look identical in a table of
		// zeroes, so say which one this is.
		out.push(
			'No controls were found for this ontology in the index. '
			+ 'That means nothing has been imported under this name, not that nothing is covered.',
		);
		out.push('');
	}

	if (summary.unbaselined_valid_junctions > 0) {
		// Deliberate wording: "cannot tell". Never "unchanged", "verified",
		// "current", or "up to date" — none of which was measured.
		const n = summary.unbaselined_valid_junctions;
		out.push(
			`> [!important] ${n} of the links counted above ${n === 1 ? 'has' : 'have'} no recorded review baseline. `
			+ `Their subjects may have changed since approval; Crosswalker cannot tell. `
			+ 'See [[#Links with no review baseline]].',
		);
		out.push('');
	}

	if (summary.excluded_junctions > 0) {
		out.push(
			`> [!important] ${summary.excluded_junctions} evidence link`
			+ `${summary.excluded_junctions === 1 ? ' was' : 's were'} set aside and did not count. `
			+ 'See [[#Links that did not count]] before drawing conclusions from the numbers above.',
		);
		out.push('');
	}

	// ---- Gaps -------------------------------------------------------------
	out.push('## Controls with no valid evidence');
	out.push('');
	if (gaps.length === 0) {
		out.push('Every control has at least one valid evidence link.');
	} else {
		out.push(...renderConceptTable(gaps, limit));
	}
	out.push('');

	// ---- Partial ----------------------------------------------------------
	out.push('## Partially covered');
	out.push('');
	out.push(
		'These controls have valid evidence, but none of it claims to cover the control fully.',
	);
	out.push('');
	if (partial.length === 0) {
		out.push('None.');
	} else {
		out.push(...renderConceptTable(partial, limit));
	}
	out.push('');

	// ---- No review baseline -----------------------------------------------
	// Its own section, not a row in the exclusions table: these links DID count.
	// Filing them under "did not count" would be a second wrong answer.
	if (input.unbaselined !== undefined) {
		out.push('## Links with no review baseline');
		out.push('');
		if (input.unbaselined.length === 0) {
			out.push('Every counted link records the control state it was approved against.');
		} else {
			out.push(
				'These links count toward the numbers above. What Crosswalker cannot tell you is '
				+ 'whether the control changed after they were approved, because no baseline was recorded.',
			);
			out.push('');
			out.push('| Link | Control | Why | What to do |');
			out.push('|---|---|---|---|');
			for (const item of input.unbaselined.slice(0, limit)) {
				out.push(
					`| [[${cell(item.vault_path)}]] | ${cell(item.subject_curie ?? item.subject)} `
					+ `| \`${cell(item.baseline)}\` | ${BASELINE_HELP[item.baseline]} |`,
				);
			}
			if (input.unbaselined.length > limit) {
				out.push('');
				out.push(`_${input.unbaselined.length - limit} more not listed (showing the first ${limit})._`);
			}
		}
		out.push('');
	}

	// ---- Superseded controls ----------------------------------------------
	// These links ALSO appear under "did not count" (as `subject-superseded`).
	// The duplication is deliberate: the exclusions table answers "why did my
	// number move", this section answers "what do I do about it", and a reader
	// looking at one is not looking at the other.
	if (input.superseded !== undefined) {
		out.push('## Links whose control was superseded');
		out.push('');
		if (input.superseded.length === 0) {
			out.push('No links point at a control that a later release says was replaced.');
		} else {
			out.push(
				'The control these links were approved against is no longer in the index, and a '
				+ 'later release says it was replaced. Crosswalker lists the replacements it was '
				+ 'told about; it does not move your evidence. Deciding which replacement this '
				+ 'evidence belongs to, and whether it still holds, is a review.',
			);
			out.push('');
			out.push('| Control (no longer present) | Links | Replaced by |');
			out.push('|---|---:|---|');
			for (const item of input.superseded.slice(0, limit)) {
				out.push(
					`| \`${cell(item.subject_curie)}\` | ${item.attestation_count} `
					+ `| ${renderSuccessors(item.successors)} |`,
				);
			}
			if (input.superseded.length > limit) {
				out.push('');
				out.push(`_${input.superseded.length - limit} more not listed (showing the first ${limit})._`);
			}
		}
		out.push('');
	}

	// ---- Exclusions -------------------------------------------------------
	out.push('## Links that did not count');
	out.push('');
	if (excluded.length === 0) {
		out.push('Every evidence link in the vault counted toward the numbers above.');
	} else {
		out.push(
			'Each of these exists in the vault but was not counted. The reason names what to change.',
		);
		out.push('');

		const changed = excluded.filter((item) => item.subject_baseline === 'changed');
		if (changed.length > 0) {
			out.push(
				'Changed controls are grouped by the highest-priority recipe-declared source area that moved: '
				+ 'wording, then scope, then housekeeping. Each link appears in exactly one group.',
			);
			out.push('');
			for (const kind of ['wording', 'scope', 'housekeeping'] as const) {
				const group = changed.filter((item) => (item.change_kind ?? 'wording') === kind);
				out.push(`### ${changeKindHeading(kind)} (${group.length})`);
				out.push('');
				out.push(CHANGE_KIND_HELP[kind]);
				out.push('');
				if (kind === 'housekeeping' && group.length > 0) {
					out.push(
						'> [!tip] Dismiss selected housekeeping changes\n'
						+ '> Select one or more rows in this table, then run **Crosswalker: Maintenance: record selected housekeeping changes as baseline**. '
						+ 'Crosswalker asks for confirmation and updates only the recorded fingerprints. It does not change status, reviewer, or review date.',
					);
					out.push('');
				}
				if (group.length === 0) {
					out.push('None.');
				} else {
					out.push(...renderChangedJunctionTable(group, limit));
				}
				out.push('');
			}
		}

		const other = excluded.filter((item) => item.subject_baseline !== 'changed');
		if (other.length > 0) {
			if (changed.length > 0) {
				out.push(`### Other reasons (${other.length})`);
				out.push('');
			}
			// Preserve the pre-classification rendering for vaults with no changed
			// baselines: adopting none of this feature changes none of their report.
			out.push('| Link | Reason | What it means |');
			out.push('|---|---|---|');
			for (const item of other.slice(0, limit)) {
				out.push(
					`| [[${cell(item.vault_path)}]] | \`${cell(item.reason)}\` | ${REASON_HELP[item.reason] ?? ''} |`,
				);
			}
			if (other.length > limit) {
				out.push('');
				out.push(`_${other.length - limit} more not listed (showing the first ${limit})._`);
			}
		}
	}
	out.push('');

	return out.join('\n');
}

const CHANGE_KIND_HELP: Record<ReviewChangeKind, string> = {
	wording: 'Recipe body-projected source content changed. Re-review the evidence against the current control wording.',
	scope: 'Recipe-managed frontmatter or managed link source content changed. Re-check whether the evidence still applies to the current control scope.',
	housekeeping: 'Only source content outside recipe body and managed frontmatter declarations changed.',
};

function changeKindHeading(kind: ReviewChangeKind): string {
	if (kind === 'wording') return 'Wording changes';
	if (kind === 'scope') return 'Scope changes';
	return 'Housekeeping changes';
}

/** One changed-baseline table. The first cell is intentionally selection-safe. */
function renderChangedJunctionTable(rows: ExcludedJunction[], limit: number): string[] {
	const out = [
		'| Link | Subject baseline | Change kind | Primary exclusion | What it means |',
		'|---|---|---|---|---|',
	];
	for (const item of rows.slice(0, limit)) {
		out.push(
			`| [[${cell(item.vault_path)}]] | \`${cell(item.subject_baseline)}\` `
			+ `| \`${cell(item.change_kind ?? 'wording')}\` | \`${cell(item.reason)}\` | ${REASON_HELP[item.reason] ?? ''} |`,
		);
	}
	if (rows.length > limit) {
		out.push('');
		out.push(`_${rows.length - limit} more not listed (showing the first ${limit})._`);
	}
	return out;
}

/** A control table, truncated loudly rather than silently. */
function renderConceptTable(rows: EvidenceCoverageRow[], limit: number): string[] {
	const out: string[] = ['| Control | Valid links |', '|---|---:|'];
	for (const row of rows.slice(0, limit)) {
		const label = row.title && row.title !== row.curie ? `${row.title} (${row.curie})` : row.curie;
		out.push(`| [[${cell(row.vault_path)}\\|${cell(label)}]] | ${row.valid_count} |`);
	}
	if (rows.length > limit) {
		out.push('');
		out.push(`_${rows.length - limit} more not listed (showing the first ${limit})._`);
	}
	return out;
}

/**
 * The replacement cell for one superseded control.
 *
 * Two things this must never do. It must not drop a successor that is asserted
 * but not imported here: that would print "no successor known" over an
 * assertion the vault actually holds. And it must not present a multi-hop chain
 * as a direct replacement, because a control three releases away has been
 * through three rounds of editing and the reviewer needs to know that before
 * they trust the link.
 */
function renderSuccessors(successors: SupersededSubject['successors']): string {
	if (successors.length === 0) {
		// Reachable only if a caller hands in a row with no candidates. Say so
		// plainly rather than leaving an empty cell that reads as a rendering bug.
		return 'No successor known.';
	}
	return successors
		.map((s) => {
			const label = s.title && s.title !== s.curie ? `${s.title} (${s.curie})` : s.curie;
			const notes = [s.depth === 1 ? 'direct' : `via ${s.depth} releases`];
			if (!s.vault_path) notes.push('not imported in this vault');
			const link = s.vault_path
				? `[[${cell(s.vault_path)}\\|${cell(label)}]]`
				: `\`${cell(s.curie)}\``;
			return `${link} (${notes.join(', ')})`;
		})
		.join('; ');
}
