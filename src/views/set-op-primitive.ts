/**
 * set-op-primitive.ts — Phase 6 (Layer A query primitive #7)
 *
 * Union (∪), intersection (∩), and difference (⊖) of two row-sets keyed
 * on a shared identifier extractor. Per Ch 29: required for queries like
 * "concepts in BOTH NIST and CIS" — inexpressible by composing
 * `filter` + `anti-join` alone (anti-join is one-sided).
 *
 * Engine-neutral. No Obsidian dependency. Same shape as SPARQL `UNION`,
 * SQL `UNION/INTERSECT/EXCEPT`, Codd ∪/∩/⊖, Datalog disjunction.
 *
 * Symmetric difference (XOR / Δ) is derived: `(A ∪ B) − (A ∩ B)`, kept
 * out of the primitive set per Ch 29 to minimize count.
 */

export type SetOpRow = Record<string, unknown>;

/** Identifier extractor: property name on the row, or function returning the key. */
export type KeyOf = string | ((row: SetOpRow) => string | undefined | null);

export type SetOpMode = 'union' | 'intersection' | 'difference';

export interface SetOpConfig {
	/** How to extract the join/identity key from each row. */
	keyOf: KeyOf;
	/** Which set operation. */
	mode: SetOpMode;
	/**
	 * When the same key appears in both inputs and mode is 'union', which
	 * row "wins" in the output. Default 'left' — preserves left row's
	 * fields. 'right' overwrites with right row. 'merge' produces a new
	 * row with right's fields spread over left's (last-write-wins).
	 */
	conflictStrategy?: 'left' | 'right' | 'merge';
}

/**
 * Apply a set operation to two row-sets. Returns a new row-set; order is
 * stable (left order preserved, then right-only rows appended for union).
 */
export function setOp(left: SetOpRow[], right: SetOpRow[], config: SetOpConfig): SetOpRow[] {
	switch (config.mode) {
		case 'union':
			return union(left, right, config);
		case 'intersection':
			return intersection(left, right, config);
		case 'difference':
			return difference(left, right, config);
		default: {
			const _exhaustive: never = config.mode;
			throw new Error(`Unknown set-op mode: ${_exhaustive}`);
		}
	}
}

/**
 * Union — every row that appears in either input. Rows with the same key
 * collapse to one per the `conflictStrategy` (default 'left').
 */
export function union(left: SetOpRow[], right: SetOpRow[], config: SetOpConfig): SetOpRow[] {
	const strategy = config.conflictStrategy ?? 'left';
	const seen = new Set<string>();
	const out: SetOpRow[] = [];

	// Pass 1: left rows (preserve order)
	for (const r of left) {
		const k = extractKey(r, config.keyOf);
		if (k != null) {
			if (seen.has(k)) continue; // dup keys in left collapse to first
			seen.add(k);
		}
		out.push({ ...r });
	}

	// Pass 2: right rows — only add if not already seen; for keyed conflicts apply strategy
	const rightByKey = new Map<string, SetOpRow>();
	for (const r of right) {
		const k = extractKey(r, config.keyOf);
		if (k == null) {
			out.push({ ...r });
			continue;
		}
		if (!seen.has(k)) {
			seen.add(k);
			out.push({ ...r });
		} else {
			// Conflict — handle per strategy
			rightByKey.set(k, r);
		}
	}

	if (strategy === 'left') {
		return out; // already correct — left wins
	}
	// Apply right/merge strategy
	for (let i = 0; i < out.length; i++) {
		const k = extractKey(out[i], config.keyOf);
		if (k == null) continue;
		const rightRow = rightByKey.get(k);
		if (!rightRow) continue;
		if (strategy === 'right') {
			out[i] = { ...rightRow };
		} else {
			// merge — left fields, then right fields override
			out[i] = { ...out[i], ...rightRow };
		}
	}
	return out;
}

/**
 * Intersection — rows that appear in BOTH inputs (by key). Returns the
 * LEFT row instance (preserves left fields); use conflictStrategy='right'
 * or 'merge' to change.
 */
export function intersection(left: SetOpRow[], right: SetOpRow[], config: SetOpConfig): SetOpRow[] {
	const strategy = config.conflictStrategy ?? 'left';
	const rightIndex = new Map<string, SetOpRow>();
	for (const r of right) {
		const k = extractKey(r, config.keyOf);
		if (k != null) rightIndex.set(k, r);
	}
	const out: SetOpRow[] = [];
	const emitted = new Set<string>();
	for (const l of left) {
		const k = extractKey(l, config.keyOf);
		if (k == null) continue;
		if (emitted.has(k)) continue; // dup keys collapse
		const rRow = rightIndex.get(k);
		if (!rRow) continue;
		emitted.add(k);
		if (strategy === 'left') out.push({ ...l });
		else if (strategy === 'right') out.push({ ...rRow });
		else out.push({ ...l, ...rRow }); // merge
	}
	return out;
}

/**
 * Difference — LEFT rows whose key does NOT appear in RIGHT.
 * Distinct from anti-join in that operands are equal-shape sets (not
 * relation L joined to relation R); anti-join works on relations with a
 * join predicate, difference works on row-sets with a shared identity key.
 */
export function difference(left: SetOpRow[], right: SetOpRow[], config: SetOpConfig): SetOpRow[] {
	const rightKeys = new Set<string>();
	for (const r of right) {
		const k = extractKey(r, config.keyOf);
		if (k != null) rightKeys.add(k);
	}
	const out: SetOpRow[] = [];
	for (const l of left) {
		const k = extractKey(l, config.keyOf);
		if (k == null || !rightKeys.has(k)) {
			out.push({ ...l });
		}
	}
	return out;
}

function extractKey(row: SetOpRow, on: KeyOf): string | null {
	if (typeof on === 'function') {
		const v = on(row);
		return v == null || v === '' ? null : String(v);
	}
	const v = row[on];
	return v == null || v === '' ? null : String(v);
}
