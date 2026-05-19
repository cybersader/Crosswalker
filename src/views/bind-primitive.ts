/**
 * bind-primitive.ts — Phase 6 (Layer A query primitive #3)
 *
 * Adds a derived column to each row in a row-set, computed via a pure
 * function over the existing row. Per Ch 29: required for any query that
 * needs computed dimensions without ETL (evidence-age, predicate
 * normalization, confidence-threshold derivations).
 *
 * Engine-neutral. No Obsidian dependency. Same shape as SPARQL `BIND`,
 * SQL computed columns / `AS`, Datalog head expressions, pandas `assign`.
 *
 * The primitive is intentionally minimal — the formula is a TS function.
 * Higher-level surfaces (recipe YAML, codeblock processor) can declare
 * formulas as strings and compile them to functions at recipe-load time.
 */

export type BindRow = Record<string, unknown>;

/** A pure formula: takes a row, returns the computed value. */
export type BindFormula<T = unknown> = (row: BindRow) => T;

/**
 * Add a derived column to every row in `rows`. Returns a new row-set;
 * does NOT mutate the input.
 *
 * @param rows  Input row-set.
 * @param name  Name of the new column.
 * @param fn    Formula producing the value from each row.
 *
 * Example:
 *   bind(controls, 'age_days', row => Math.floor((Date.now() - new Date(row.last_reviewed as string).getTime()) / 86400000))
 */
export function bind<T = unknown>(rows: BindRow[], name: string, fn: BindFormula<T>): BindRow[] {
	if (name === '') {
		throw new Error('bind: column name must be non-empty');
	}
	const out: BindRow[] = new Array(rows.length);
	for (let i = 0; i < rows.length; i++) {
		const r = rows[i];
		out[i] = { ...r, [name]: fn(r) };
	}
	return out;
}

/**
 * Apply multiple binds in sequence. Each subsequent formula sees the columns
 * produced by earlier binds — supports building chains where one derived
 * column depends on another.
 *
 * Example:
 *   bindMany(controls, [
 *     ['age_days', row => /* ... ✱/],
 *     ['is_stale', row => (row.age_days as number) > 365],
 *   ])
 */
export function bindMany(rows: BindRow[], bindings: Array<[string, BindFormula]>): BindRow[] {
	let current = rows;
	for (const [name, fn] of bindings) {
		current = bind(current, name, fn);
	}
	return current;
}

// ---------------------------------------------------------------------------
// Streaming variants (Phase 6.2) — single-pass, constant memory.
// Same semantics; lazy evaluation. Consumers iterate via for-of.
// ---------------------------------------------------------------------------

/**
 * Streaming variant of `bind` — yields one row at a time. Constant memory.
 * Accepts any `Iterable<BindRow>` (including arrays, generators, async
 * source materialized).
 *
 * Example:
 *   for (const row of bindStream(reader, 'curie', r => `nist:${r.id}`)) {
 *     // row already has the new column; original wasn't mutated
 *   }
 */
export function* bindStream<T = unknown>(
	rows: Iterable<BindRow>,
	name: string,
	fn: BindFormula<T>,
): Iterable<BindRow> {
	if (name === '') {
		throw new Error('bind: column name must be non-empty');
	}
	for (const r of rows) {
		yield { ...r, [name]: fn(r) };
	}
}

/**
 * Streaming variant of `bindMany` — chains multiple binds lazily.
 * Each generator wraps the previous; data flows through one row at a time.
 */
export function bindManyStream(
	rows: Iterable<BindRow>,
	bindings: Array<[string, BindFormula]>,
): Iterable<BindRow> {
	let current: Iterable<BindRow> = rows;
	for (const [name, fn] of bindings) {
		current = bindStream(current, name, fn);
	}
	return current;
}
