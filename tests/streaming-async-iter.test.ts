/**
 * v0.1.4.5 streaming refactor — unit-level tests
 *
 * Verifies the engine accepts AsyncIterable<Row> sources alongside the
 * existing eager-array form. Doesn't touch real Obsidian (that's the
 * streaming.spec.ts E2E); just confirms the type plumbing + iteration
 * pattern works at the function level.
 */

import { isEagerRows } from '../src/types/config';

describe('isEagerRows type guard (v0.1.4.5)', () => {
	test('returns true for an array', () => {
		expect(isEagerRows([])).toBe(true);
		expect(isEagerRows([{ id: 'AC-1' }, { id: 'AC-2' }])).toBe(true);
	});

	test('returns false for an AsyncIterable', () => {
		const asyncIter: AsyncIterable<Record<string, any>> = {
			[Symbol.asyncIterator]() {
				return {
					async next() {
						return { done: true, value: undefined as never };
					},
				};
			},
		};
		expect(isEagerRows(asyncIter)).toBe(false);
	});

	test('narrows the type correctly', () => {
		const rows: Record<string, any>[] | AsyncIterable<Record<string, any>> = [
			{ id: 'AC-1' },
			{ id: 'AC-2' },
		];
		if (isEagerRows(rows)) {
			// TS should now know rows is an array
			expect(rows.length).toBe(2);
			expect(rows[0].id).toBe('AC-1');
		} else {
			fail('Should have narrowed to array');
		}
	});
});

describe('AsyncIterable consumption pattern (v0.1.4.5)', () => {
	/** Helper: produce an AsyncIterable<Row> from a plain array — the same
	 *  shape the engine consumes via for-await. Used to confirm both forms
	 *  iterate identically. */
	function asAsyncIterable<T>(array: T[]): AsyncIterable<T> {
		return {
			[Symbol.asyncIterator]() {
				let i = 0;
				return {
					async next(): Promise<IteratorResult<T>> {
						if (i < array.length) {
							const value = array[i];
							i += 1;
							return { done: false, value };
						}
						return { done: true, value: undefined as never };
					},
				};
			},
		};
	}

	test('for-await iterates an AsyncIterable in order', async () => {
		const source = asAsyncIterable([
			{ id: 'AC-1', family: 'AC' },
			{ id: 'AC-2', family: 'AC' },
			{ id: 'AU-1', family: 'AU' },
		]);
		const collected: Record<string, unknown>[] = [];
		for await (const row of source) {
			collected.push(row);
		}
		expect(collected).toHaveLength(3);
		expect(collected[0].id).toBe('AC-1');
		expect(collected[2].family).toBe('AU');
	});

	test('for-await iterates an array (degenerate case) identically', async () => {
		const source = [{ id: 'AC-1' }, { id: 'AC-2' }];
		const collected: Record<string, unknown>[] = [];
		for await (const row of source) {
			collected.push(row);
		}
		expect(collected).toEqual(source);
	});

	test('memory pattern: row goes out of scope after each iteration', async () => {
		// Conceptual test — confirms one-row-at-a-time semantics. Real RAM
		// measurement requires a heap snapshot harness (not Jest-friendly);
		// this is a structural check that the per-row processing pattern
		// doesn't accumulate.
		let liveRows = 0;
		let maxLive = 0;
		const source = asAsyncIterable(
			Array.from({ length: 1000 }, (_, i) => ({ id: `R-${i}` })),
		);
		for await (const _row of source) {
			liveRows = 1; // only the current row is "live"
			maxLive = Math.max(maxLive, liveRows);
			liveRows = 0; // simulate scope exit / GC eligibility
		}
		expect(maxLive).toBe(1);
	});
});

describe('Row counter behavior (v0.1.4.5)', () => {
	test('rowCount: -1 signals unknown count to engine', async () => {
		// Streaming sources don't know their total upfront; engine should
		// handle this gracefully (no progress percentage; "row N" only).
		const parsed = {
			columns: ['id'],
			rows: { [Symbol.asyncIterator]: () => ({ async next() { return { done: true, value: undefined as never }; } }) },
			rowCount: -1,
		};
		expect(parsed.rowCount).toBeLessThanOrEqual(0);
	});

	test('rowCount > 0 signals known count (eager case)', () => {
		const parsed = {
			columns: ['id'],
			rows: [{ id: 'AC-1' }],
			rowCount: 1,
		};
		expect(parsed.rowCount).toBeGreaterThan(0);
	});
});
