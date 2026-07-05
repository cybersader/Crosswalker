/**
 * pivot-grid.test.ts — Phase 3 v0.1.6 unit tests for the pivot data-shaping helper.
 *
 * Tests cover:
 *   - count aggregation (the launch-market Coverage Matrix shape)
 *   - count_distinct, sum, avg, min, max, first, last aggregations
 *   - Empty-cell semantics (gap → null, blank → '', zero → 0)
 *   - Row + column sort (asc, desc, none)
 *   - Sparse-pivot warning at the configurable threshold
 *   - Property-name extractor + function extractor
 *   - Heatmap intensity (0–1 normalization)
 *   - Edge cases (empty entry list, all-null keys, single cell)
 */

import {
	computePivotGrid,
	heatmapIntensity,
	type PivotEntry,
	type PivotConfig,
	type PivotGridResult,
} from '../src/views/pivot-grid';

const sample: PivotEntry[] = [
	{ control: 'AC-1', framework: 'NIST', confidence: 0.9 },
	{ control: 'AC-1', framework: 'ISO',  confidence: 0.85 },
	{ control: 'AC-2', framework: 'NIST', confidence: 0.95 },
	{ control: 'AC-2', framework: 'NIST', confidence: 0.7 }, // duplicate row+col → count = 2
	{ control: 'AC-2', framework: 'CIS',  confidence: 0.6 },
	{ control: 'AC-3', framework: 'NIST', confidence: 0.8 },
];

describe('computePivotGrid — count (launch-market Coverage Matrix)', () => {
	const result: PivotGridResult = computePivotGrid(sample, {
		rowsBy: 'control',
		colsBy: 'framework',
		cellOp: 'count',
		empty: 'gap',
	});

	it('produces correct row + col keys (sorted asc by default)', () => {
		expect(result.rowKeys).toEqual(['AC-1', 'AC-2', 'AC-3']);
		expect(result.colKeys).toEqual(['CIS', 'ISO', 'NIST']);
	});

	it('produces correct cell counts', () => {
		// Rows: AC-1, AC-2, AC-3
		// Cols: CIS, ISO, NIST
		// AC-1: { ISO=1, NIST=1, CIS=gap }
		// AC-2: { CIS=1, NIST=2, ISO=gap }
		// AC-3: { NIST=1 }
		expect(result.cells[0]).toEqual([null, 1, 1]);     // AC-1
		expect(result.cells[1]).toEqual([1, null, 2]);     // AC-2
		expect(result.cells[2]).toEqual([null, null, 1]);  // AC-3
	});

	it('reports total entries', () => {
		expect(result.totalEntries).toBe(6);
	});

	it('reports range (min/max of numeric cells)', () => {
		expect(result.range).toEqual({ min: 1, max: 2 });
	});

	it('does not flag sparse-pivot warning for small grids', () => {
		expect(result.sparsePivotWarning).toBe(false);
	});
});

describe('computePivotGrid — empty-cell semantics', () => {
	it.each([
		['gap', null],
		['blank', ''],
		['zero', 0],
	] as const)('empty=%s renders missing cells as %p', (mode, expected) => {
		const result = computePivotGrid(sample, {
			rowsBy: 'control',
			colsBy: 'framework',
			cellOp: 'count',
			empty: mode,
		});
		// AC-1 row, CIS col is empty
		expect(result.cells[0][0]).toBe(expected);
	});
});

describe('computePivotGrid — non-count aggregations', () => {
	const cfg: PivotConfig = {
		rowsBy: 'control',
		colsBy: 'framework',
		cellOf: 'confidence',
	};

	it('sum aggregates numeric cell values', () => {
		const r = computePivotGrid(sample, { ...cfg, cellOp: 'sum' });
		// AC-2 / NIST has 0.95 + 0.7 = 1.65
		const ac2NistIdx = r.colKeys.indexOf('NIST');
		const ac2RowIdx = r.rowKeys.indexOf('AC-2');
		expect(r.cells[ac2RowIdx][ac2NistIdx]).toBeCloseTo(1.65, 5);
	});

	it('avg aggregates numeric cell values', () => {
		const r = computePivotGrid(sample, { ...cfg, cellOp: 'avg' });
		const ac2NistIdx = r.colKeys.indexOf('NIST');
		const ac2RowIdx = r.rowKeys.indexOf('AC-2');
		expect(r.cells[ac2RowIdx][ac2NistIdx]).toBeCloseTo(0.825, 5);
	});

	it('min returns smallest numeric value', () => {
		const r = computePivotGrid(sample, { ...cfg, cellOp: 'min' });
		const ac2NistIdx = r.colKeys.indexOf('NIST');
		expect(r.cells[r.rowKeys.indexOf('AC-2')][ac2NistIdx]).toBe(0.7);
	});

	it('max returns largest numeric value', () => {
		const r = computePivotGrid(sample, { ...cfg, cellOp: 'max' });
		const ac2NistIdx = r.colKeys.indexOf('NIST');
		expect(r.cells[r.rowKeys.indexOf('AC-2')][ac2NistIdx]).toBe(0.95);
	});

	it('count_distinct returns unique value count', () => {
		const r = computePivotGrid(sample, { ...cfg, cellOp: 'count_distinct' });
		const ac2NistIdx = r.colKeys.indexOf('NIST');
		// AC-2/NIST has values [0.95, 0.7] — 2 distinct
		expect(r.cells[r.rowKeys.indexOf('AC-2')][ac2NistIdx]).toBe(2);
	});

	it('first/last return scalar values', () => {
		const rFirst = computePivotGrid(sample, { ...cfg, cellOp: 'first' });
		const rLast = computePivotGrid(sample, { ...cfg, cellOp: 'last' });
		const ac2NistIdx = rFirst.colKeys.indexOf('NIST');
		const ac2Row = rFirst.rowKeys.indexOf('AC-2');
		expect(rFirst.cells[ac2Row][ac2NistIdx]).toBe(0.95);
		expect(rLast.cells[ac2Row][ac2NistIdx]).toBe(0.7);
	});

	it('non-numeric value with sum/avg returns null (filters out NaN)', () => {
		const entries: PivotEntry[] = [
			{ row: 'A', col: 'X', val: 'not-a-number' },
			{ row: 'A', col: 'X', val: 'also-not-a-number' },
		];
		const r = computePivotGrid(entries, {
			rowsBy: 'row', colsBy: 'col', cellOp: 'sum', cellOf: 'val',
		});
		expect(r.cells[0][0]).toBeNull();
	});
});

describe('computePivotGrid — sort + ordering', () => {
	it('default sort is asc on both axes', () => {
		const r = computePivotGrid(sample, { rowsBy: 'control', colsBy: 'framework' });
		expect(r.rowKeys).toEqual(['AC-1', 'AC-2', 'AC-3']);
		expect(r.colKeys).toEqual(['CIS', 'ISO', 'NIST']);
	});

	it('rowSort=desc reverses rows', () => {
		const r = computePivotGrid(sample, {
			rowsBy: 'control', colsBy: 'framework', rowSort: 'desc',
		});
		expect(r.rowKeys).toEqual(['AC-3', 'AC-2', 'AC-1']);
	});

	it('colSort=none preserves discovery order', () => {
		const r = computePivotGrid(sample, {
			rowsBy: 'control', colsBy: 'framework', colSort: 'none',
		});
		// First entry's framework is NIST, then ISO, then CIS
		expect(r.colKeys).toEqual(['NIST', 'ISO', 'CIS']);
	});
});

describe('computePivotGrid — extractor variants', () => {
	it('property-name extractor (string)', () => {
		const r = computePivotGrid(sample, { rowsBy: 'control', colsBy: 'framework' });
		expect(r.rowKeys.length).toBe(3);
	});

	it('function extractor (computed key)', () => {
		const r = computePivotGrid(sample, {
			rowsBy: (e) => `prefix:${e.control as string}`,
			colsBy: 'framework',
		});
		expect(r.rowKeys).toEqual(['prefix:AC-1', 'prefix:AC-2', 'prefix:AC-3']);
	});

	it('skips entries with missing rowKey or colKey', () => {
		const entries: PivotEntry[] = [
			{ control: 'A', framework: 'X' },
			{ control: 'A' }, // no framework — skipped
			{ framework: 'Y' }, // no control — skipped
			{ control: '', framework: 'Z' }, // empty rowKey — skipped
			{ control: 'B', framework: '' }, // empty colKey — skipped
		];
		const r = computePivotGrid(entries, { rowsBy: 'control', colsBy: 'framework' });
		expect(r.rowKeys).toEqual(['A']);
		expect(r.colKeys).toEqual(['X']);
		expect(r.cells[0][0]).toBe(1);
	});
});

describe('computePivotGrid — sparse-pivot warning', () => {
	it('flags sparsePivotWarning when rows*cols > threshold', () => {
		// 100 rows × 100 cols = 10K cells; threshold 5K → warning
		const entries: PivotEntry[] = [];
		for (let i = 0; i < 100; i++) {
			for (let j = 0; j < 100; j++) {
				if ((i + j) % 17 === 0) {
					entries.push({ row: `R${i}`, col: `C${j}` });
				}
			}
		}
		const r = computePivotGrid(entries, {
			rowsBy: 'row', colsBy: 'col', sparsePivotWarn: 5_000,
		});
		expect(r.sparsePivotWarning).toBe(true);
	});

	it('default sparsePivotWarn is 100K cells', () => {
		const entries: PivotEntry[] = [
			{ row: 'A', col: 'X' },
			{ row: 'B', col: 'Y' },
		];
		const r = computePivotGrid(entries, { rowsBy: 'row', colsBy: 'col' });
		expect(r.sparsePivotWarning).toBe(false);
	});
});

describe('computePivotGrid — edge cases', () => {
	it('empty entry list → empty result', () => {
		const r = computePivotGrid([], { rowsBy: 'a', colsBy: 'b' });
		expect(r.rowKeys).toEqual([]);
		expect(r.colKeys).toEqual([]);
		expect(r.cells).toEqual([]);
		expect(r.totalEntries).toBe(0);
		expect(r.range).toBeNull();
	});

	it('single cell grid', () => {
		const r = computePivotGrid([{ row: 'X', col: 'Y' }], { rowsBy: 'row', colsBy: 'col' });
		expect(r.rowKeys).toEqual(['X']);
		expect(r.colKeys).toEqual(['Y']);
		expect(r.cells).toEqual([[1]]);
		expect(r.range).toEqual({ min: 1, max: 1 });
	});
});

describe('heatmapIntensity', () => {
	it('returns 0 for null cell', () => {
		expect(heatmapIntensity(null, { min: 0, max: 10 })).toBe(0);
	});

	it('returns 0 for null range', () => {
		expect(heatmapIntensity(5, null)).toBe(0);
	});

	it('returns 0 for non-numeric cell', () => {
		expect(heatmapIntensity('text', { min: 0, max: 10 })).toBe(0);
	});

	it('maps value to 0-1 within range with a perceptual (sqrt) curve', () => {
		// Endpoints stay exact; the mid-range is lifted (sqrt) so long-tailed
		// coverage counts render as a visible gradient, not near-white cells.
		expect(heatmapIntensity(0, { min: 0, max: 10 })).toBe(0);
		expect(heatmapIntensity(5, { min: 0, max: 10 })).toBeCloseTo(Math.sqrt(0.5));
		expect(heatmapIntensity(10, { min: 0, max: 10 })).toBe(1);
	});

	it('clamps values outside the range', () => {
		expect(heatmapIntensity(-5, { min: 0, max: 10 })).toBe(0);
		expect(heatmapIntensity(15, { min: 0, max: 10 })).toBe(1);
	});

	it('handles range.min === range.max (single value)', () => {
		expect(heatmapIntensity(5, { min: 5, max: 5 })).toBe(1);
		expect(heatmapIntensity(3, { min: 5, max: 5 })).toBe(0);
	});
});
