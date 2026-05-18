/**
 * join-primitives.ts — Phase 5 (Layer A query primitives)
 *
 * Pure functions implementing the 5 join modes from synthesis-log
 * `2026-05-18-phase-5-scope-join-primitive-substrate`:
 *
 *   - innerJoin       — rows where both sides match (default; current behavior)
 *   - leftOuterJoin   — preserve all left rows; right side null when no match
 *   - rightOuterJoin  — preserve all right rows; left side null when no match
 *   - fullOuterJoin   — preserve all rows from both sides
 *   - antiJoin        — Layer A primitive #5: "X without Y" (left rows with no match)
 *
 * Operates on entry collections — bag-of-records with `[key: string]: unknown`.
 * The join keys are extracted via `on` config (property names or functions).
 * Output rows are merged via configurable strategy (default: spread-left, then
 * spread-right with non-conflicting keys; conflicts prefixed `r_`).
 *
 * These primitives feed Layer B view shapes (pivot today; table / list /
 * hierarchy / timeline later). The pivot view consumes the joined output;
 * outer-join modes preserve the full axis so the view can render "no data"
 * cells where the inner-join would have hidden them entirely.
 */

export interface JoinEntry {
	[key: string]: unknown;
}

/** All 5 supported join modes. */
export type JoinMode = 'inner' | 'left-outer' | 'right-outer' | 'full-outer' | 'anti';

/** Key extractor: property name on the entry, or function returning the key. */
export type KeyExtractor = string | ((entry: JoinEntry) => string | undefined | null);

export interface JoinConfig {
	/** How to extract the join key from a left entry. */
	leftOn: KeyExtractor;
	/** How to extract the join key from a right entry. */
	rightOn: KeyExtractor;
	/** Join mode — defaults to 'inner'. */
	mode?: JoinMode;
	/**
	 * Optional prefix for right-side keys when merging into output rows.
	 * Default: 'r_' to avoid collisions with left-side keys.
	 * Set to '' to overwrite left-side keys (last-write-wins).
	 */
	rightPrefix?: string;
}

/**
 * Execute a join on two entry collections. Returns rows in stable
 * left-then-right order; outer-mode null-padding preserved.
 */
export function executeJoin(
	left: JoinEntry[],
	right: JoinEntry[],
	config: JoinConfig,
): JoinEntry[] {
	const mode = config.mode ?? 'inner';
	switch (mode) {
		case 'inner': return innerJoin(left, right, config);
		case 'left-outer': return leftOuterJoin(left, right, config);
		case 'right-outer': return rightOuterJoin(left, right, config);
		case 'full-outer': return fullOuterJoin(left, right, config);
		case 'anti': return antiJoin(left, right, config);
		default: {
			const _exhaustive: never = mode;
			throw new Error(`Unknown join mode: ${_exhaustive}`);
		}
	}
}

// ---------------------------------------------------------------------------
// Individual primitives — pure, no IO, no side effects
// ---------------------------------------------------------------------------

/**
 * Inner join — rows where both left and right have a matching key.
 * Cartesian product per key bucket (each left × each right with the same key).
 */
export function innerJoin(left: JoinEntry[], right: JoinEntry[], config: JoinConfig): JoinEntry[] {
	const rightIndex = indexByKey(right, config.rightOn);
	const out: JoinEntry[] = [];
	for (const l of left) {
		const k = extractKey(l, config.leftOn);
		if (k == null) continue;
		const matches = rightIndex.get(k) ?? [];
		for (const r of matches) {
			out.push(mergeRow(l, r, config.rightPrefix));
		}
	}
	return out;
}

/**
 * Left-outer join — preserve every left row. Right side is null-padded when
 * no match. The "controls without evidence" gap-analysis use case.
 */
export function leftOuterJoin(left: JoinEntry[], right: JoinEntry[], config: JoinConfig): JoinEntry[] {
	const rightIndex = indexByKey(right, config.rightOn);
	const out: JoinEntry[] = [];
	for (const l of left) {
		const k = extractKey(l, config.leftOn);
		const matches = k != null ? (rightIndex.get(k) ?? []) : [];
		if (matches.length === 0) {
			out.push(mergeRow(l, null, config.rightPrefix));
		} else {
			for (const r of matches) {
				out.push(mergeRow(l, r, config.rightPrefix));
			}
		}
	}
	return out;
}

/**
 * Right-outer join — preserve every right row; left side null-padded.
 * Mirror of leftOuterJoin.
 */
export function rightOuterJoin(left: JoinEntry[], right: JoinEntry[], config: JoinConfig): JoinEntry[] {
	const leftIndex = indexByKey(left, config.leftOn);
	const out: JoinEntry[] = [];
	for (const r of right) {
		const k = extractKey(r, config.rightOn);
		const matches = k != null ? (leftIndex.get(k) ?? []) : [];
		if (matches.length === 0) {
			out.push(mergeRow(null, r, config.rightPrefix));
		} else {
			for (const l of matches) {
				out.push(mergeRow(l, r, config.rightPrefix));
			}
		}
	}
	return out;
}

/**
 * Full-outer join — preserve all left + all right; null-padded on the
 * side without a match. Both "X without Y" and "Y without X" surface.
 */
export function fullOuterJoin(left: JoinEntry[], right: JoinEntry[], config: JoinConfig): JoinEntry[] {
	const leftOut = leftOuterJoin(left, right, config);
	const rightOnlyKeys = new Set<string>();
	const leftKeys = new Set<string>();
	for (const l of left) {
		const k = extractKey(l, config.leftOn);
		if (k != null) leftKeys.add(k);
	}
	for (const r of right) {
		const k = extractKey(r, config.rightOn);
		if (k != null && !leftKeys.has(k)) rightOnlyKeys.add(k);
	}
	const rightUnmatched: JoinEntry[] = [];
	for (const r of right) {
		const k = extractKey(r, config.rightOn);
		if (k != null && rightOnlyKeys.has(k)) {
			rightUnmatched.push(mergeRow(null, r, config.rightPrefix));
		}
	}
	return [...leftOut, ...rightUnmatched];
}

/**
 * Anti-join — Layer A primitive #5. Returns LEFT rows that have NO match
 * in right. "Show me controls without any mapped evidence." The single most
 * useful primitive for gap analysis.
 */
export function antiJoin(left: JoinEntry[], right: JoinEntry[], config: JoinConfig): JoinEntry[] {
	const rightKeys = new Set<string>();
	for (const r of right) {
		const k = extractKey(r, config.rightOn);
		if (k != null) rightKeys.add(k);
	}
	const out: JoinEntry[] = [];
	for (const l of left) {
		const k = extractKey(l, config.leftOn);
		if (k == null || !rightKeys.has(k)) {
			out.push({ ...l });
		}
	}
	return out;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function extractKey(entry: JoinEntry, on: KeyExtractor): string | null {
	if (typeof on === 'function') {
		const v = on(entry);
		return v == null || v === '' ? null : String(v);
	}
	const v = entry[on];
	return v == null || v === '' ? null : String(v);
}

function indexByKey(entries: JoinEntry[], on: KeyExtractor): Map<string, JoinEntry[]> {
	const index = new Map<string, JoinEntry[]>();
	for (const e of entries) {
		const k = extractKey(e, on);
		if (k == null) continue;
		const bucket = index.get(k);
		if (bucket) bucket.push(e);
		else index.set(k, [e]);
	}
	return index;
}

/**
 * Merge a left + right row into one output row. Right-side keys get the
 * `rightPrefix` (default `r_`); set prefix to `''` to overwrite left-side
 * values (last-write-wins).
 */
function mergeRow(left: JoinEntry | null, right: JoinEntry | null, rightPrefix = 'r_'): JoinEntry {
	const out: JoinEntry = {};
	if (left) {
		for (const k of Object.keys(left)) {
			out[k] = left[k];
		}
	}
	if (right) {
		for (const k of Object.keys(right)) {
			const targetKey = rightPrefix && k in out ? `${rightPrefix}${k}` : (rightPrefix && rightPrefix !== '' ? `${rightPrefix}${k}` : k);
			out[targetKey] = right[k];
		}
	}
	return out;
}
