/**
 * diff-primitive.ts — Phase 6 (Layer A query primitive #8)
 *
 * Versioned-snapshot delta — what changed between two row-sets representing
 * the same logical entity at two points in time. Per Ch 29: required for
 * the v0.1.8 audit-trail and any ontology-version delta query
 * ("what changed from NIST CSF v1.1 to v2.0?").
 *
 * Engine-neutral. No Obsidian dependency. Same shape as OWL-ecco,
 * CODEX, DynDiff, `git diff` (with structured field tracking),
 * Unix `diff` (with row-level granularity).
 *
 * Returns a `DiffResult` with three buckets: `added`, `removed`, `changed`.
 * `changed` records include both `before` and `after` plus a list of
 * `changedFields` (with old and new values). Callers can further filter
 * or aggregate the change records — typical recipes will surface them as
 * a Layer B table or hierarchy view.
 */

export type DiffRow = Record<string, unknown>;

export type DiffKeyOf = string | ((row: DiffRow) => string | undefined | null);

/**
 * Optional custom row-equality. Default: shallow same-key + same-value
 * comparison across every key present in either row. Custom equality is
 * useful when only a subset of fields constitutes "identity" (e.g. ignore
 * `generated_at`, `last_reviewed`, or other audit-timestamp drift).
 */
export type DiffEqualsFn = (before: DiffRow, after: DiffRow) => boolean;

export interface DiffConfig {
	/** How to extract the identity key (e.g. CURIE, control_id, concept URI). */
	keyOf: DiffKeyOf;
	/**
	 * Optional row-equality function. When omitted, shallow per-key
	 * comparison is used over all keys present in either row.
	 */
	equalsFn?: DiffEqualsFn;
	/**
	 * Optional list of fields to ignore when detecting `changed` records.
	 * Useful for audit-noise fields like `generated_at`, `last_reviewed`.
	 * Ignored if `equalsFn` is provided.
	 */
	ignoreFields?: string[];
}

export interface FieldChange {
	/** Field name. */
	field: string;
	/** Value in the BEFORE snapshot (undefined if added). */
	before: unknown;
	/** Value in the AFTER snapshot (undefined if removed). */
	after: unknown;
}

export interface ChangedRecord {
	/** Identity key of the changed entity. */
	key: string;
	/** The BEFORE row. */
	before: DiffRow;
	/** The AFTER row. */
	after: DiffRow;
	/** List of per-field changes. */
	changedFields: FieldChange[];
}

export interface DiffResult {
	/** Rows present in AFTER but not in BEFORE. */
	added: DiffRow[];
	/** Rows present in BEFORE but not in AFTER. */
	removed: DiffRow[];
	/** Rows present in both, but with at least one field changed. */
	changed: ChangedRecord[];
	/** Rows present in both AND identical (per the equality function). Empty by default — set `includeUnchanged: true` to populate. */
	unchanged?: DiffRow[];
}

export interface DiffOptions {
	/** Include the `unchanged` bucket in output. Default false. */
	includeUnchanged?: boolean;
}

/**
 * Compute the delta between two row-set snapshots.
 *
 * @param before  The "older" / baseline row-set.
 * @param after   The "newer" / current row-set.
 * @param config  Identity key extractor + optional custom equality.
 */
export function diff(
	before: DiffRow[],
	after: DiffRow[],
	config: DiffConfig,
	options: DiffOptions = {},
): DiffResult {
	const beforeByKey = indexByKey(before, config.keyOf);
	const afterByKey = indexByKey(after, config.keyOf);

	const equalsFn = config.equalsFn ?? makeShallowEquals(config.ignoreFields);

	const added: DiffRow[] = [];
	const removed: DiffRow[] = [];
	const changed: ChangedRecord[] = [];
	const unchanged: DiffRow[] = [];

	// Pass 1: walk AFTER — detect added + changed
	for (const [key, afterRow] of afterByKey) {
		const beforeRow = beforeByKey.get(key);
		if (!beforeRow) {
			added.push({ ...afterRow });
			continue;
		}
		if (equalsFn(beforeRow, afterRow)) {
			if (options.includeUnchanged) unchanged.push({ ...afterRow });
			continue;
		}
		// Both exist + not equal → changed
		const fieldChanges = detectFieldChanges(beforeRow, afterRow, config.ignoreFields);
		changed.push({
			key,
			before: { ...beforeRow },
			after: { ...afterRow },
			changedFields: fieldChanges,
		});
	}

	// Pass 2: walk BEFORE — detect removed (keys in BEFORE but not AFTER)
	for (const [key, beforeRow] of beforeByKey) {
		if (!afterByKey.has(key)) {
			removed.push({ ...beforeRow });
		}
	}

	const result: DiffResult = { added, removed, changed };
	if (options.includeUnchanged) result.unchanged = unchanged;
	return result;
}

/**
 * Build a Map keyed by the identity key. When duplicate keys appear in
 * the input, the LAST row wins (caller controls input order).
 */
function indexByKey(rows: DiffRow[], on: DiffKeyOf): Map<string, DiffRow> {
	const index = new Map<string, DiffRow>();
	for (const r of rows) {
		const k = extractKey(r, on);
		if (k == null) continue;
		index.set(k, r);
	}
	return index;
}

function extractKey(row: DiffRow, on: DiffKeyOf): string | null {
	if (typeof on === 'function') {
		const v = on(row);
		return v == null || v === '' ? null : String(v);
	}
	const v = row[on];
	return v == null || v === '' ? null : String(v);
}

function makeShallowEquals(ignoreFields?: string[]): DiffEqualsFn {
	const ignore = new Set(ignoreFields ?? []);
	return (before, after) => {
		const allKeys = new Set([...Object.keys(before), ...Object.keys(after)]);
		for (const k of allKeys) {
			if (ignore.has(k)) continue;
			if (!shallowValueEquals(before[k], after[k])) return false;
		}
		return true;
	};
}

function shallowValueEquals(a: unknown, b: unknown): boolean {
	if (a === b) return true;
	if (a == null || b == null) return a === b;
	if (typeof a !== typeof b) return false;
	if (Array.isArray(a) && Array.isArray(b)) {
		if (a.length !== b.length) return false;
		for (let i = 0; i < a.length; i++) {
			if (!shallowValueEquals(a[i], b[i])) return false;
		}
		return true;
	}
	if (typeof a === 'object' && typeof b === 'object') {
		// Shallow object comparison
		const aKeys = Object.keys(a as object);
		const bKeys = Object.keys(b as object);
		if (aKeys.length !== bKeys.length) return false;
		for (const k of aKeys) {
			if (!shallowValueEquals((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k])) return false;
		}
		return true;
	}
	return false;
}

function detectFieldChanges(
	before: DiffRow,
	after: DiffRow,
	ignoreFields?: string[],
): FieldChange[] {
	const ignore = new Set(ignoreFields ?? []);
	const changes: FieldChange[] = [];
	const allKeys = new Set([...Object.keys(before), ...Object.keys(after)]);
	for (const field of allKeys) {
		if (ignore.has(field)) continue;
		const b = before[field];
		const a = after[field];
		if (!shallowValueEquals(b, a)) {
			changes.push({ field, before: b, after: a });
		}
	}
	return changes;
}
