/**
 * filter-primitive.ts — Phase 6.2 (Layer A query primitive #1)
 *
 * Restrict a row-set by a predicate over its attributes. Same shape as
 * SPARQL `FILTER`, SQL `WHERE`, Datalog body literals, Bases filter,
 * MongoDB query.
 *
 * Phase 6.2 makes filter an explicit Layer A module. Previously filter was
 * "implicit Bases-native" — every recipe used Bases' frontmatter filter or
 * the picker's parameter editor. Now we have a pure-function implementation
 * for recipe-runtime use, in both array + streaming forms.
 *
 * Engine-neutral. No Obsidian dependency.
 */

export type FilterRow = Record<string, unknown>;

/** A pure predicate — takes a row, returns boolean. */
export type FilterPredicate = (row: FilterRow) => boolean;

/**
 * Array form: keep only rows where the predicate returns true.
 * Returns a new array; does NOT mutate the input.
 */
export function filter(rows: FilterRow[], pred: FilterPredicate): FilterRow[] {
	const out: FilterRow[] = [];
	for (const r of rows) {
		if (pred(r)) out.push(r);
	}
	return out;
}

/**
 * Streaming form: single-pass, constant memory. Yields one row at a time.
 * Accepts any `Iterable<FilterRow>` (arrays, generators, anything iterable).
 *
 * Example:
 *   for (const row of filterStream(reader, r => r.confidence > 0.8)) { ... }
 */
export function* filterStream(rows: Iterable<FilterRow>, pred: FilterPredicate): Iterable<FilterRow> {
	for (const r of rows) {
		if (pred(r)) yield r;
	}
}

/**
 * Async streaming form: for I/O-bound sources (CSV reader, network stream).
 * Same shape but yields asynchronously.
 */
export async function* filterStreamAsync(
	rows: AsyncIterable<FilterRow>,
	pred: FilterPredicate,
): AsyncIterable<FilterRow> {
	for await (const r of rows) {
		if (pred(r)) yield r;
	}
}
