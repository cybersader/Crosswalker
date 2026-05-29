/**
 * benchmark-primitives.test.ts — Phase 6.3 sanity tests for the benchmark
 * harness. We don't assert specific timings (varies per machine) — just
 * shape + that every primitive emits a result and totals add up.
 */

import { runBenchmark, generateConcepts, generateMappings, formatBenchmarkSummary } from '../src/views/benchmark-primitives';

describe('generateConcepts', () => {
	it('produces n rows with stable shape', () => {
		const rows = generateConcepts(100);
		expect(rows.length).toBe(100);
		expect(rows[0]).toHaveProperty('id');
		expect(rows[0]).toHaveProperty('ontology');
		expect(rows[0]).toHaveProperty('value');
		expect(rows[0]).toHaveProperty('is_active');
		// Deterministic: same n → same result
		const rows2 = generateConcepts(100);
		expect(rows2[0]).toEqual(rows[0]);
	});
});

describe('generateMappings', () => {
	it('produces ~70% coverage of concepts (anti-join non-trivial)', () => {
		const conceptCount = 100;
		const mappings = generateMappings(60, conceptCount);
		const distinctSubjects = new Set(mappings.map((m) => m.subject));
		// ~70% × 100 = ~70 unique subjects; some overlap expected from int floor
		expect(distinctSubjects.size).toBeGreaterThan(0);
		expect(distinctSubjects.size).toBeLessThan(conceptCount);
	});
});

describe('runBenchmark', () => {
	it('runs every primitive at every scale and produces results', () => {
		const summary = runBenchmark({ scales: [10, 100] });
		expect(summary.scales).toEqual([10, 100]);
		expect(summary.results.length).toBeGreaterThan(0);
		expect(summary.totalDurationMs).toBeGreaterThan(0);

		// Each result has the expected shape
		for (const r of summary.results) {
			expect(r.primitive).toBeTruthy();
			expect(r.mode).toMatch(/^(array|stream)$/);
			expect(r.inputSize).toBeGreaterThan(0);
			expect(r.durationMs).toBeGreaterThanOrEqual(0);
			expect(typeof r.rowsPerSec).toBe('number');
			// Phase 6.3.1: heap delta is a number (Chromium/Electron) or null (jsdom)
			expect(r.heapDeltaBytes === null || typeof r.heapDeltaBytes === 'number').toBe(true);
		}
		// Summary carries heap-measurability flag + peak
		expect(typeof summary.heapMeasurable).toBe('boolean');
		expect(summary.peakHeapBytes === null || typeof summary.peakHeapBytes === 'number').toBe(true);
	});

	it('runs both array and stream variants for the streamable primitives', () => {
		const summary = runBenchmark({ scales: [50] });
		const primitives = new Set(summary.results.map((r) => r.primitive));
		// Sanity: every primitive that should be benchmarked appears
		expect(primitives.has('filter')).toBe(true);
		expect(primitives.has('bind')).toBe(true);
		expect(primitives.has('inner-join')).toBe(true);
		expect(primitives.has('anti-join')).toBe(true);
		expect(primitives.has('set-op-intersection')).toBe(true);
		expect(primitives.has('diff')).toBe(true);

		// Streamable ones have BOTH modes
		const filterModes = summary.results.filter((r) => r.primitive === 'filter').map((r) => r.mode);
		expect(filterModes.sort()).toEqual(['array', 'stream']);

		// diff is array-only by design
		const diffModes = summary.results.filter((r) => r.primitive === 'diff').map((r) => r.mode);
		expect(diffModes).toEqual(['array']);
	});

	it('produces meaningful row counts (output ≤ input × something reasonable)', () => {
		const summary = runBenchmark({ scales: [100] });
		// Sanity: filter shouldn't produce more rows than input
		const filterRow = summary.results.find((r) => r.primitive === 'filter' && r.mode === 'array');
		expect(filterRow).toBeDefined();
		expect(filterRow!.outputSize).toBeLessThanOrEqual(filterRow!.inputSize);
	});
});

describe('formatBenchmarkSummary', () => {
	it('produces a multi-line string with the totalDurationMs in the header', () => {
		const summary = runBenchmark({ scales: [10] });
		const formatted = formatBenchmarkSummary(summary);
		expect(formatted).toContain('benchmark');
		expect(formatted).toContain('ms total');
		expect(formatted.split('\n').length).toBeGreaterThan(5);
	});
});
