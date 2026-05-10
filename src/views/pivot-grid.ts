/**
 * pivot-grid.ts — Phase 3 v0.1.6 (per Settled #2 + Ch 30)
 *
 * Pure data-shaping helper for the crosswalkerPivot custom Bases view.
 *
 * Layer A primitives (per Ch 29 8-verb vocabulary):
 *   - filter (already applied by Bases before entries reach us — controller.entries is the filtered set)
 *   - bind   (compute the rowKey + colKey + cell value from each entry)
 *   - aggregate (group by (rowKey, colKey); reduce each cell with the chosen op)
 *   - project (output the pivot grid as PivotGridResult)
 *
 * The pivot SHAPE is Layer B per Ch 29 §4 ("pivot is presentation, not value-producing").
 * This module produces the data; the view class renders it as DOM.
 *
 * Pure function — no Obsidian deps; testable in isolation. Tests in
 * tests/pivot-grid.test.ts.
 */

/** Aggregation op — closed enum per recipe schema $defs.AggregationOp v0.1. */
export type PivotAggregationOp =
	| 'count'
	| 'count_distinct'
	| 'sum'
	| 'avg'
	| 'min'
	| 'max'
	| 'first'
	| 'last';

/** Empty-cell semantics per recipe schema $defs.Aggregate.empty. */
export type EmptyCellMode = 'gap' | 'blank' | 'zero';

/**
 * Generic entry shape consumed by the pivot grid. In the view this comes from
 * Bases `controller.entries` (BasesEntry[]); pure-helper tests pass plain objects.
 *
 * The pivot extracts `rowKey`, `colKey`, and (for non-count aggs) a `value` from
 * each entry. Caller is responsible for the extraction functions; defaults treat
 * the entry as a Record with named string-keys.
 */
export interface PivotEntry {
	[key: string]: unknown;
}

/** Configuration for a pivot computation. */
export interface PivotConfig {
	/** Property name (or extractor function) that yields the row key per entry. */
	rowsBy: string | ((entry: PivotEntry) => string | undefined | null);
	/** Property name (or extractor function) that yields the column key per entry. */
	colsBy: string | ((entry: PivotEntry) => string | undefined | null);
	/** Aggregation op for cell values. Default: 'count'. */
	cellOp?: PivotAggregationOp;
	/** Property name (or extractor function) that yields the cell value. Required for non-count ops. */
	cellOf?: string | ((entry: PivotEntry) => unknown);
	/** Empty-cell semantics. Default: 'gap'. */
	empty?: EmptyCellMode;
	/** Optional sort: rows alphabetical asc/desc. Default: asc. */
	rowSort?: 'asc' | 'desc' | 'none';
	/** Optional sort: cols alphabetical asc/desc. Default: asc. */
	colSort?: 'asc' | 'desc' | 'none';
	/**
	 * Sparse-pivot soft cap. If `rowKeys.length * colKeys.length > sparsePivotWarn`,
	 * the result has `sparsePivotWarning: true`. Default: 100_000.
	 */
	sparsePivotWarn?: number;
}

/** Cell value in the pivot grid. `null` = gap (no entries fell in this cell when empty='gap'). */
export type PivotCell = number | string | null;

/** Output of `computePivotGrid`. */
export interface PivotGridResult {
	rowKeys: string[];
	colKeys: string[];
	/** Row-major: cells[rowIdx][colIdx]. */
	cells: PivotCell[][];
	/** Total entry count (input size) — useful for "showing N of M" labels. */
	totalEntries: number;
	/** True if rowKeys.length * colKeys.length > sparsePivotWarn. */
	sparsePivotWarning: boolean;
	/** Cell value range; useful for heatmap normalization. min/max ignore null. */
	range: { min: number; max: number } | null;
}

/**
 * Compute a pivot grid from a flat list of entries.
 *
 * Pseudocode:
 *   1. For each entry, extract (rowKey, colKey). Skip entries where either is null/undefined/empty.
 *   2. Build sets of unique row + col keys.
 *   3. Sort row + col keys (alphabetical asc/desc, or original order with 'none').
 *   4. For each (row, col) pair, collect matching entries' cell values (or count if cellOp='count').
 *   5. Reduce each bucket with the chosen aggregation op. Empty buckets → null/empty/zero per `empty`.
 *
 * Numeric ops (sum/avg/min/max) coerce via Number(); non-numeric values produce NaN
 * which then gets filtered out before aggregation.
 */
export function computePivotGrid(entries: PivotEntry[], config: PivotConfig): PivotGridResult {
	const cellOp: PivotAggregationOp = config.cellOp ?? 'count';
	const empty: EmptyCellMode = config.empty ?? 'gap';
	const rowSort = config.rowSort ?? 'asc';
	const colSort = config.colSort ?? 'asc';
	const sparseLimit = config.sparsePivotWarn ?? 100_000;

	const extractRow = makeExtractor(config.rowsBy);
	const extractCol = makeExtractor(config.colsBy);
	const extractValue = config.cellOf !== undefined ? makeExtractor(config.cellOf) : null;

	// Pass 1: bucket entries by (rowKey, colKey)
	const buckets = new Map<string, Map<string, unknown[]>>();
	const rowKeySet = new Set<string>();
	const colKeySet = new Set<string>();

	for (const entry of entries) {
		const rowKeyRaw = extractRow(entry);
		const colKeyRaw = extractCol(entry);
		if (rowKeyRaw === null || rowKeyRaw === undefined || rowKeyRaw === '') continue;
		if (colKeyRaw === null || colKeyRaw === undefined || colKeyRaw === '') continue;
		const rowKey = String(rowKeyRaw);
		const colKey = String(colKeyRaw);

		rowKeySet.add(rowKey);
		colKeySet.add(colKey);

		let row = buckets.get(rowKey);
		if (!row) {
			row = new Map();
			buckets.set(rowKey, row);
		}
		let bucket = row.get(colKey);
		if (!bucket) {
			bucket = [];
			row.set(colKey, bucket);
		}

		// For non-count ops, push the cell value; for count, push a placeholder.
		if (cellOp === 'count') {
			bucket.push(1);
		} else if (extractValue) {
			bucket.push(extractValue(entry));
		} else {
			// cellOp set but no cellOf — push the entry itself; aggregator may not use it.
			bucket.push(entry);
		}
	}

	// Sort row + col keys
	const rowKeys = Array.from(rowKeySet);
	const colKeys = Array.from(colKeySet);
	if (rowSort !== 'none') sortInPlace(rowKeys, rowSort);
	if (colSort !== 'none') sortInPlace(colKeys, colSort);

	// Pass 2: reduce buckets to cells
	const cells: PivotCell[][] = [];
	let cellMin: number | null = null;
	let cellMax: number | null = null;

	for (const rowKey of rowKeys) {
		const rowBuckets = buckets.get(rowKey);
		const rowOut: PivotCell[] = [];
		for (const colKey of colKeys) {
			const bucket = rowBuckets?.get(colKey);
			let cellValue: PivotCell;
			if (!bucket || bucket.length === 0) {
				cellValue = emptyCellValue(empty);
			} else {
				cellValue = aggregate(bucket, cellOp);
			}
			rowOut.push(cellValue);
			if (typeof cellValue === 'number' && Number.isFinite(cellValue)) {
				cellMin = cellMin === null ? cellValue : Math.min(cellMin, cellValue);
				cellMax = cellMax === null ? cellValue : Math.max(cellMax, cellValue);
			}
		}
		cells.push(rowOut);
	}

	const sparsePivotWarning = rowKeys.length * colKeys.length > sparseLimit;
	const range = cellMin !== null && cellMax !== null ? { min: cellMin, max: cellMax } : null;

	return {
		rowKeys,
		colKeys,
		cells,
		totalEntries: entries.length,
		sparsePivotWarning,
		range,
	};
}

/** Create a value-extractor from either a property name or a function. */
function makeExtractor<T>(by: string | ((entry: PivotEntry) => T)): (entry: PivotEntry) => T {
	if (typeof by === 'function') return by;
	return (entry) => entry[by] as T;
}

function sortInPlace(arr: string[], dir: 'asc' | 'desc'): void {
	arr.sort((a, b) => (dir === 'asc' ? a.localeCompare(b) : b.localeCompare(a)));
}

function emptyCellValue(mode: EmptyCellMode): PivotCell {
	switch (mode) {
		case 'gap': return null;
		case 'blank': return '';
		case 'zero': return 0;
	}
}

function aggregate(values: unknown[], op: PivotAggregationOp): PivotCell {
	if (values.length === 0) return null;

	switch (op) {
		case 'count':
			return values.length;
		case 'count_distinct':
			return new Set(values.map((v) => JSON.stringify(v))).size;
		case 'first':
			return scalarOrString(values[0]);
		case 'last':
			return scalarOrString(values[values.length - 1]);
		case 'sum': {
			const nums = values.map(toNum).filter((n) => Number.isFinite(n));
			return nums.length === 0 ? null : nums.reduce((a, b) => a + b, 0);
		}
		case 'avg': {
			const nums = values.map(toNum).filter((n) => Number.isFinite(n));
			if (nums.length === 0) return null;
			return nums.reduce((a, b) => a + b, 0) / nums.length;
		}
		case 'min': {
			const nums = values.map(toNum).filter((n) => Number.isFinite(n));
			return nums.length === 0 ? null : Math.min(...nums);
		}
		case 'max': {
			const nums = values.map(toNum).filter((n) => Number.isFinite(n));
			return nums.length === 0 ? null : Math.max(...nums);
		}
	}
}

function toNum(v: unknown): number {
	if (typeof v === 'number') return v;
	if (typeof v === 'string') return Number.parseFloat(v);
	return NaN;
}

function scalarOrString(v: unknown): PivotCell {
	if (v === null || v === undefined) return null;
	if (typeof v === 'number' || typeof v === 'string') return v;
	return String(v);
}

/**
 * Compute a heatmap intensity (0–1) for a cell value given the result range.
 * Returns 0 if range is null or value is null/non-numeric.
 *
 * Used by the view's heatmap rendering to set CSS custom properties:
 *   --crosswalker-pivot-cell-intensity: 0.0 → 1.0
 */
export function heatmapIntensity(value: PivotCell, range: PivotGridResult['range']): number {
	if (value === null || typeof value !== 'number' || !Number.isFinite(value) || range === null) return 0;
	if (range.max === range.min) return value === range.max ? 1 : 0;
	return Math.max(0, Math.min(1, (value - range.min) / (range.max - range.min)));
}
