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
}

export interface BenchmarkSummary {
	scales: number[];
	results: PrimitiveResult[];
	totalDurationMs: number;
	startedAt: string;
	finishedAt: string;
}

const DEFAULT_SCALES = [100, 1000, 10000];

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

	debug?.info('perf', 'benchmark-complete', `Benchmark complete in ${totalDurationMs.toFixed(0)}ms`, {
		scales,
		totalResults: results.length,
		totalDurationMs,
	});

	return { scales, results, totalDurationMs, startedAt, finishedAt };
}

function recordTime(
	results: PrimitiveResult[],
	debug: DebugLog | undefined,
	primitive: string,
	mode: 'array' | 'stream',
	inputSize: number,
	fn: () => number,
): void {
	const { result: outputSize, durationMs } = timeIt(fn);
	const rowsPerSec = inputSize / (durationMs / 1000);
	const entry: PrimitiveResult = {
		primitive,
		mode,
		inputSize,
		outputSize,
		durationMs,
		rowsPerSec,
	};
	results.push(entry);

	debug?.info('perf', `${primitive}-${mode}`, `${primitive} (${mode}) over ${inputSize} rows`, {
		primitive,
		mode,
		inputSize,
		outputSize,
		durationMs,
		rowsPerSec: Math.round(rowsPerSec),
	});
}

/**
 * Format a benchmark summary as a multi-line string for Notice display +
 * clipboard export.
 */
export function formatBenchmarkSummary(summary: BenchmarkSummary): string {
	const lines: string[] = [];
	lines.push(`Crosswalker primitives benchmark — ${summary.totalDurationMs.toFixed(0)}ms total`);
	lines.push(`Scales: ${summary.scales.join(', ')} rows`);
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
			lines.push(
				`  ${e.mode.padEnd(6)} n=${String(e.inputSize).padStart(6)}  →  ${String(e.outputSize).padStart(6)} rows  ${e.durationMs.toFixed(2).padStart(8)}ms  ${Math.round(e.rowsPerSec).toLocaleString().padStart(12)} rows/sec`,
			);
		}
		lines.push('');
	}
	return lines.join('\n');
}
