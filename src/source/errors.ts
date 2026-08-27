/**
 * SourceStageError — the failure type for the source stage.
 *
 * The Ch 46 architect verdict names this `RenderError`. That name is wrong:
 * the source stage runs strictly BEFORE render() (it decides which rows become
 * notes at all), and render()'s error type already means "a template failed".
 * The verdict's binding part is the BEHAVIOUR (loud, row-named, never a silent
 * skip); the identifier is not. Renamed here per the Ch 46 source contract §7.
 *
 * Every source-stage failure carries enough to point a user at the exact thing
 * that is wrong: which declaration, which expression text, which source row.
 */

export interface SourceStageErrorInit {
	/** Declaration path, e.g. 'source.where' or 'source.joins.mitigation.on.primary'. */
	declaration: string;
	/** The offending expression text, when the failure has one. */
	expression?: string;
	/** 1-indexed SOURCE row. Absent for preflight failures (surfaced as row 0). */
	row?: number;
	/** Actual value/type, match count, available column names, engine error code. */
	detail?: string;
}

export class SourceStageError extends Error {
	readonly declaration: string;
	readonly expression?: string;
	readonly row?: number;
	readonly detail?: string;

	constructor(summary: string, init: SourceStageErrorInit) {
		super(composeMessage(summary, init));
		this.name = 'SourceStageError';
		this.declaration = init.declaration;
		this.expression = init.expression;
		this.row = init.row;
		this.detail = init.detail;
	}
}

/**
 * Deterministic message shape. Contract §7: every message names which row and
 * which expression. Assembled in one place so the phrasing cannot drift between
 * the guards.
 *
 * No em dashes: these strings reach Notices and the import report, and the
 * project's UI-copy rule bans em dashes there.
 */
function composeMessage(summary: string, init: SourceStageErrorInit): string {
	const parts = [`${init.declaration}: ${summary}`];
	if (init.row !== undefined) parts.push(`row ${init.row}`);
	if (init.expression !== undefined) parts.push(`expression: ${init.expression}`);
	let msg = parts.join(' | ');
	if (init.detail) msg += `\n  ${init.detail}`;
	return msg;
}

/** Renders a bounded name list for "available names" details. Contract §3.3: up to 40. */
export function formatAvailableNames(names: readonly string[], max = 40): string {
	if (names.length === 0) return 'Available: (none)';
	const shown = names.slice(0, max);
	const suffix = names.length > max ? `, ... (${names.length - max} more)` : '';
	return `Available: ${shown.join(', ')}${suffix}`;
}
