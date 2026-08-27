/**
 * where.ts — `source.where`, the row predicate.
 *
 * Ch 46 source contract §3. A row for which the predicate is false never
 * becomes a note. Absent, every row becomes a note, byte-for-byte as before.
 *
 * THE LOUDNESS CONTRACT IS THE WHOLE POINT (verdict rule 5, contract §0/§3.3).
 * Three guards, not one, because the verdict's stated single guard was measured
 * insufficient:
 *
 *   G1  result must be a strict boolean            (here)
 *   G2  every referenced name exists in the collection  (expression.ts,
 *       assertReferencesExist; run at preflight by index.ts)
 *   G3  admitting zero rows from a non-empty collection is an error  (here)
 *
 * A per-row failure ABORTS THE RUN. It never skips the row. A "skip" that
 * reports a warning is still a vault that quietly lost rows, which is the
 * banned behaviour.
 */

import { SourceStageError } from './errors';
import { describeResultValue, type CompiledSourceExpression } from './expression';

export const WHERE_DECLARATION = 'source.where';

/** Running counts for one `where` application. */
export interface WhereTally {
	/** Source rows the predicate examined. */
	examined: number;
	/** Rows the predicate admitted. */
	admitted: number;
	/** Rows the predicate excluded. Informational, never a warning. */
	excluded: number;
}

/**
 * G1 — evaluate the predicate for one row and demand a strict boolean.
 *
 * `where: "Subcategory"` returns `''`; `where: "Typo"` returns `undefined`.
 * Both are non-predicates, and both fail here naming the row, the expression,
 * and the actual result. Never "false, skip the row".
 */
export async function evaluateWherePredicate(
	compiled: CompiledSourceExpression,
	row: unknown,
	sourceRowNumber: number,
): Promise<boolean> {
	const value = await compiled.evaluate(row, sourceRowNumber);
	if (typeof value !== 'boolean') {
		throw new SourceStageError(`expected a boolean, got ${describeResultValue(value)}`, {
			declaration: compiled.declaration,
			expression: compiled.text,
			row: sourceRowNumber,
			detail: 'A row predicate must decide true or false. An expression that returns a value (or nothing) is not a predicate. '
				+ 'For a presence test write $exists(field) or field != \'\'.',
		});
	}
	return value;
}

/**
 * G3 — a `where` that admits no rows from a non-empty collection is an error.
 *
 * Safe under streaming: if zero rows were admitted, zero writes have occurred,
 * so failing at end-of-stream needs no rollback. This is the residual guard for
 * the case G2 cannot see, e.g. a correct field name compared against a literal
 * that never occurs.
 */
export function assertAdmittedSomething(
	compiled: CompiledSourceExpression,
	tally: WhereTally,
): void {
	if (tally.examined > 0 && tally.admitted === 0) {
		throw new SourceStageError('excluded every row, so the import would produce nothing', {
			declaration: compiled.declaration,
			expression: compiled.text,
			detail: `Examined ${tally.examined} source rows and admitted 0. `
				+ 'Check the compared literal: field names were verified against the source, values were not.',
		});
	}
}
