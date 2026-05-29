/**
 * benchmark-primitives.ts — Phase 6.3
 *
 * Runs every Layer A primitive (array + streaming variants) against
 * synthetic data of escalating sizes, measures duration via
 * `performance.now()`, and emits NDJSON `perf` events for each timing.
 * Returns an aggregated `BenchmarkSummary` for the caller to surface in a
 * Notice or pretty-print.
 *
 * No vault dependency. No fixture-file dependency. Synthetic data
 * generation gives reproducible numbers across runs + lets the user vary
 * scale on demand.
 *
 * Engine-neutral: a future Tier 2 SQL benchmark module reuses the same
 * timing helper.
 */

import { filter, filterStream } from './filter-primitive';
import { bind, bindStream } from './bind-primitive';
import {
	innerJoin, innerJoinStream,
	leftOuterJoin, leftOuterJoinStream,
	antiJoin, antiJoinStream,
} from './join-primitives';
import { intersection, intersectionStream, difference, differenceStream } from './set-op-primitive';
import { diff } from './diff-primitive';
import type { DebugLog } from '../utils/debug';

export interface BenchmarkRow extends Record<string, unknown> {
	id: string;
}

export interface PrimitiveResult {
	primitive: string;
	mode: 'array' | 'stream';
	inputSize: number;
	outputSize: number;
	durationMs: number;
	rowsPerSec: number;
	/** Heap delta in bytes (used JS heap after − before), if measurable. null otherwise. */
	heapDeltaBytes: number | null;
}

export interface BenchmarkSummary {
	scales: number[];
	results: PrimitiveResult[];
	totalDurationMs: number;
	startedAt: string;
	finishedAt: string;
	/** Peak used JS heap (bytes) observed during the run, if measurable. */
	peakHeapBytes: number | null;
	/** Whether performance.memory was available (Chromium/Electron only). */
	heapMeasurable: boolean;
}

// Bigger scales (Phase 6.3.1) — 10k was too small to reveal RAM/streaming
// characteristics. 1M stresses joins enough to expose hash-build memory cost.
const DEFAULT_SCALES = [1_000, 100_000, 1_000_000];

/**
 * Read the current used JS heap size in bytes. Available in Chromium/Electron
 * via the non-standard `performance.memory` API. Returns null where absent.
 */
function readHeapBytes(): number | null {
	const mem = (performance as unknown as { memory?: { usedJSHeapSize?: number } }).memory;
	return typeof mem?.usedJSHeapSize === 'number' ? mem.usedJSHeapSize : null;
}

/**
 * Generate `n` synthetic concept rows with realistic field shapes.
 * Deterministic given the same `n`.
 */
export function generateConcepts(n: number): BenchmarkRow[] {
	const out: BenchmarkRow[] = new Array(n);
	const ontologies = ['csf', 'iso27001', 'soc2', '800-53', 'cis', 'mitre'];
	for (let i = 0; i < n; i++) {
		out[i] = {
			id: `C-${i}`,
			ontology: ontologies[i % ontologies.length],
			value: (i * 17) % 100, // pseudorandom-ish but deterministic
			is_active: i % 3 !== 0,
		};
	}
	return out;
}

/**
 * Generate `n` synthetic crosswalk-mapping rows. Subjects reference
 * concept IDs from `generateConcepts(conceptCount)`; ~70% match coverage
 * so anti-join / outer-join produce non-trivial results.
 */
export function generateMappings(n: number, conceptCount: number): BenchmarkRow[] {
	const out: BenchmarkRow[] = new Array(n);
	for (let i = 0; i < n; i++) {
		const subjectIdx = Math.floor((i / n) * conceptCount * 0.7); // 70% coverage
		out[i] = {
			id: `M-${i}`,
			subject: `C-${subjectIdx}`,
			object: `T-${i % 50}`,
			confidence: ((i * 13) % 100) / 100,
			predicate: i % 2 === 0 ? 'skos:closeMatch' : 'skos:relatedMatch',
		};
	}
	return out;
}

/**
 * Time a synchronous operation. Returns `{result, durationMs}`.
 */
function timeIt<T>(fn: () => T): { result: T; durationMs: number } {
	const start = performance.now();
	const result = fn();
	const durationMs = performance.now() - start;
	return { result, durationMs };
}

/**
 * Consume an iterable into an array — used to fully materialize streaming
 * variants so we can compare array vs stream timing apples-to-apples.
 */
function consume<T>(iter: Iterable<T>): T[] {
	const out: T[] = [];
	for (const x of iter) out.push(x);
	return out;
}

/**
 * Run the full primitive benchmark suite.
 */
export function runBenchmark(opts: { scales?: number[]; debug?: DebugLog } = {}): BenchmarkSummary {
	const scales = opts.scales ?? DEFAULT_SCALES;
	const debug = opts.debug;
	const results: PrimitiveResult[] = [];
	const startedAt = new Date().toISOString();
	const totalStart = performance.now();

	for (const n of scales) {
		const concepts = generateConcepts(n);
		const mappings = generateMappings(Math.floor(n * 0.6), n);
		const conceptsB = generateConcepts(n).map((r) => ({ ...r, id: `B-${r.id}` }));

		// filter (array)
		recordTime(results, debug, 'filter', 'array', n, () => {
			const r = filter(concepts, (c) => (c.is_active as boolean));
			return r.length;
		});

		// filter (stream)
		recordTime(results, debug, 'filter', 'stream', n, () => {
			const r = consume(filterStream(concepts, (c) => (c.is_active as boolean)));
			return r.length;
		});

		// bind (array)
		recordTime(results, debug, 'bind', 'array', n, () => {
			const r = bind(concepts, 'curie', (c) => `${c.ontology}:${c.id}`);
			return r.length;
		});

		// bind (stream)
		recordTime(results, debug, 'bind', 'stream', n, () => {
			const r = consume(bindStream(concepts, 'curie', (c) => `${c.ontology}:${c.id}`));
			return r.length;
		});

		// inner-join (array) — concepts × mappings on id == subject
		recordTime(results, debug, 'inner-join', 'array', n, () => {
			const r = innerJoin(concepts, mappings, { leftOn: 'id', rightOn: 'subject' });
			return r.length;
		});

		// inner-join (stream)
		recordTime(results, debug, 'inner-join', 'stream', n, () => {
			const r = consume(innerJoinStream(concepts, mappings, { leftOn: 'id', rightOn: 'subject' }));
			return r.length;
		});

		// left-outer-join (array)
		recordTime(results, debug, 'left-outer-join', 'array', n, () => {
			const r = leftOuterJoin(concepts, mappings, { leftOn: 'id', rightOn: 'subject' });
			return r.length;
		});

		// left-outer-join (stream)
		recordTime(results, debug, 'left-outer-join', 'stream', n, () => {
			const r = consume(leftOuterJoinStream(concepts, mappings, { leftOn: 'id', rightOn: 'subject' }));
			return r.length;
		});

		// anti-join (array)
		recordTime(results, debug, 'anti-join', 'array', n, () => {
			const r = antiJoin(concepts, mappings, { leftOn: 'id', rightOn: 'subject' });
			return r.length;
		});

		// anti-join (stream)
		recordTime(results, debug, 'anti-join', 'stream', n, () => {
			const r = consume(antiJoinStream(concepts, mappings, { leftOn: 'id', rightOn: 'subject' }));
			return r.length;
		});

		// set-op intersection (array) — concepts ∩ conceptsB by id
		recordTime(results, debug, 'set-op-intersection', 'array', n, () => {
			const r = intersection(concepts, conceptsB, { keyOf: 'id', mode: 'intersection' });
			return r.length;
		});

		// set-op intersection (stream)
		recordTime(results, debug, 'set-op-intersection', 'stream', n, () => {
			const r = consume(intersectionStream(concepts, conceptsB, { keyOf: 'id', mode: 'intersection' }));
			return r.length;
		});

		// set-op difference (array)
		recordTime(results, debug, 'set-op-difference', 'array', n, () => {
			const r = difference(concepts, conceptsB, { keyOf: 'id', mode: 'difference' });
			return r.length;
		});

		// set-op difference (stream)
		recordTime(results, debug, 'set-op-difference', 'stream', n, () => {
			const r = consume(differenceStream(concepts, conceptsB, { keyOf: 'id', mode: 'difference' }));
			return r.length;
		});

		// diff (array-only by design)
		const conceptsV2 = concepts.map((c, i) =>
			i % 5 === 0 ? { ...c, value: (c.value as number) + 1 } : c,
		);
		recordTime(results, debug, 'diff', 'array', n, () => {
			const r = diff(concepts, conceptsV2, { keyOf: 'id' });
			return r.added.length + r.removed.length + r.changed.length;
		});
	}

	const finishedAt = new Date().toISOString();
	const totalDurationMs = performance.now() - totalStart;
	const heapMeasurable = readHeapBytes() !== null;
	const peakHeapBytes = results.reduce<number | null>((peak, r) => {
		if (r.heapDeltaBytes == null) return peak;
		return peak == null ? r.heapDeltaBytes : Math.max(peak, r.heapDeltaBytes);
	}, null);

	debug?.info('perf', 'benchmark-complete', `Benchmark complete in ${totalDurationMs.toFixed(0)}ms`, {
		scales,
		totalResults: results.length,
		totalDurationMs,
		heapMeasurable,
		peakHeapBytes,
	});

	return { scales, results, totalDurationMs, startedAt, finishedAt, peakHeapBytes, heapMeasurable };
}

function recordTime(
	results: PrimitiveResult[],
	debug: DebugLog | undefined,
	primitive: string,
	mode: 'array' | 'stream',
	inputSize: number,
	fn: () => number,
): void {
	const heapBefore = readHeapBytes();
	const { result: outputSize, durationMs } = timeIt(fn);
	const heapAfter = readHeapBytes();
	const heapDeltaBytes =
		heapBefore != null && heapAfter != null ? heapAfter - heapBefore : null;
	const rowsPerSec = inputSize / (durationMs / 1000);
	const entry: PrimitiveResult = {
		primitive,
		mode,
		inputSize,
		outputSize,
		durationMs,
		rowsPerSec,
		heapDeltaBytes,
	};
	results.push(entry);

	debug?.info('perf', `${primitive}-${mode}`, `${primitive} (${mode}) over ${inputSize} rows`, {
		primitive,
		mode,
		inputSize,
		outputSize,
		durationMs,
		rowsPerSec: Math.round(rowsPerSec),
		heapDeltaBytes,
		heapDeltaMB: heapDeltaBytes != null ? +(heapDeltaBytes / 1048576).toFixed(2) : null,
	});
}

/**
 * Format a benchmark summary as a multi-line string for Notice display +
 * clipboard export.
 */
export function formatBenchmarkSummary(summary: BenchmarkSummary): string {
	const lines: string[] = [];
	lines.push(`Crosswalker primitives benchmark — ${summary.totalDurationMs.toFixed(0)}ms total`);
	lines.push(`Scales: ${summary.scales.map((s) => s.toLocaleString()).join(', ')} rows`);
	if (summary.heapMeasurable) {
		const peakMB = summary.peakHeapBytes != null ? (summary.peakHeapBytes / 1048576).toFixed(1) : '?';
		lines.push(`Heap measurable: yes · peak op heap delta: ${peakMB} MB`);
	} else {
		lines.push('Heap measurable: no (performance.memory unavailable in this runtime)');
	}
	lines.push('');

	// Group by primitive, show array vs stream side-by-side per scale
	const byPrimitive = new Map<string, PrimitiveResult[]>();
	for (const r of summary.results) {
		const bucket = byPrimitive.get(r.primitive);
		if (bucket) bucket.push(r);
		else byPrimitive.set(r.primitive, [r]);
	}

	for (const [primitive, entries] of byPrimitive) {
		lines.push(`◆ ${primitive}`);
		for (const e of entries) {
			const heap = e.heapDeltaBytes != null ? `${(e.heapDeltaBytes / 1048576).toFixed(1).padStart(7)} MB` : '     n/a';
			lines.push(
				`  ${e.mode.padEnd(6)} n=${String(e.inputSize).padStart(9)}  →  ${String(e.outputSize).padStart(9)} rows  ${e.durationMs.toFixed(2).padStart(9)}ms  ${Math.round(e.rowsPerSec).toLocaleString().padStart(14)} rows/sec  ${heap}`,
			);
		}
		lines.push('');
	}
	return lines.join('\n');
}
