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
	EvidenceCoverageRow,
	EvidenceCoverageSummary,
	ExcludedJunction,
	ExclusionReason,
} from '../tier2/evidence-coverage';
import type { ProjectionStatus } from '../tier2/projector';

/** Everything the renderer needs. Assembled by the command; never fetched here. */
export interface EvidenceReportInput {
	ontologyId: string;
	summary: EvidenceCoverageSummary;
	rows: EvidenceCoverageRow[];
	excluded: ExcludedJunction[];
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
	'subject-not-a-known-concept':
		'The link points at something that is not an imported control. A link written the wrong way round lands here.',
	'not-approved': 'The link is not approved yet.',
	'coverage-not-asserted':
		'The link does not state how much of the control it covers, or states that it covers none.',
	expired: 'The evidence is past its expiry date.',
	stale: 'The evidence has not been reviewed recently enough.',
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
		out.push('| Link | Reason | What it means |');
		out.push('|---|---|---|');
		for (const item of excluded.slice(0, limit)) {
			out.push(
				`| [[${cell(item.vault_path)}]] | \`${cell(item.reason)}\` | ${REASON_HELP[item.reason] ?? ''} |`,
			);
		}
		if (excluded.length > limit) {
			out.push('');
			out.push(`_${excluded.length - limit} more not listed (showing the first ${limit})._`);
		}
	}
	out.push('');

	return out.join('\n');
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
