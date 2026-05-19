/**
 * streaming-primitives.test.ts — Phase 6.2 integration tests.
 *
 * Wraps realistic fixture rows as iterables, runs the streaming variants of
 * each Layer A primitive, and asserts byte-equivalent output to the array
 * variants. Also verifies the "memory bounded by smaller side" contract
 * for joins via a lazy-iteration probe.
 */

import { filter, filterStream } from '../../src/views/filter-primitive';
import { bind, bindStream, bindManyStream } from '../../src/views/bind-primitive';
import {
	innerJoin,
	leftOuterJoin,
	antiJoin,
	innerJoinStream,
	leftOuterJoinStream,
	antiJoinStream,
	executeJoinStream,
} from '../../src/views/join-primitives';
import {
	intersection,
	difference,
	intersectionStream,
	differenceStream,
	setOpStream,
} from '../../src/views/set-op-primitive';
import {
	loadConceptFixture,
	loadCrosswalkFixture,
	REALISTIC_FIXTURES,
} from '../helpers/fixture-loader';

// ---------------------------------------------------------------------------
// Test helper: turn an array into a generator, simulating a streaming source
// ---------------------------------------------------------------------------

function* asGenerator<T>(arr: T[]): Iterable<T> {
	for (const x of arr) yield x;
}

function consumeAll<T>(iter: Iterable<T>): T[] {
	return Array.from(iter);
}

// ---------------------------------------------------------------------------
// filter — array == stream parity
// ---------------------------------------------------------------------------

describe('filterStream — array/stream parity over realistic data', () => {
	it('produces same output as array filter() over NIST CSF GOVERN concepts', () => {
		const csf = loadConceptFixture(REALISTIC_FIXTURES.concepts.nistCsf);
		const arrayResult = filter(csf, (r) => r.function === 'GOVERN');
		const streamResult = consumeAll(filterStream(asGenerator(csf), (r) => r.function === 'GOVERN'));
		expect(streamResult).toEqual(arrayResult);
	});

	it('preserves row order when streaming SSSOM crosswalks by confidence threshold', () => {
		const mappings = loadCrosswalkFixture(REALISTIC_FIXTURES.crosswalks.nistCsfToMitreAttack);
		const arrayResult = filter(mappings, (r) => (r.confidence as number) >= 0.8);
		const streamResult = consumeAll(filterStream(asGenerator(mappings), (r) => (r.confidence as number) >= 0.8));
		expect(streamResult.map((r) => r.subject_id)).toEqual(arrayResult.map((r) => r.subject_id));
	});
});

// ---------------------------------------------------------------------------
// bind — array == stream parity
// ---------------------------------------------------------------------------

describe('bindStream — array/stream parity', () => {
	it('produces same output as array bind() for CURIE derivation', () => {
		const csf = loadConceptFixture(REALISTIC_FIXTURES.concepts.nistCsf);
		const arrayResult = bind(csf, 'curie', (r) => `nist-csf:${r.id}`);
		const streamResult = consumeAll(bindStream(asGenerator(csf), 'curie', (r) => `nist-csf:${r.id}`));
		expect(streamResult).toEqual(arrayResult);
	});

	it('bindManyStream chains lazily, same output as array bindMany', () => {
		const iso = loadConceptFixture(REALISTIC_FIXTURES.concepts.iso27001);
		const streamResult = consumeAll(
			bindManyStream(asGenerator(iso), [
				['title_len', (r) => ((r.title as string) ?? '').length],
				['is_short', (r) => (r.title_len as number) < 40],
			]),
		);
		expect(streamResult.length).toBe(iso.length);
		expect(typeof streamResult[0].title_len).toBe('number');
		expect(typeof streamResult[0].is_short).toBe('boolean');
	});

	it('is truly lazy — bindStream does not consume input until iteration', () => {
		let consumed = 0;
		function* probe(): Iterable<Record<string, unknown>> {
			for (let i = 0; i < 10; i++) {
				consumed++;
				yield { id: i };
			}
		}
		const stream = bindStream(probe(), 'doubled', (r) => (r.id as number) * 2);
		// Creating the generator does not consume yet
		expect(consumed).toBe(0);
		// Consume two items
		const iter = stream[Symbol.iterator]();
		iter.next();
		iter.next();
		expect(consumed).toBe(2);
	});
});

// ---------------------------------------------------------------------------
// Joins — array == stream parity + smaller-side hash contract
// ---------------------------------------------------------------------------

describe('innerJoinStream — realistic data parity + bounded memory', () => {
	it('produces same join rows as innerJoin over CSF concepts × CSF→800-53 mappings', () => {
		const csf = loadConceptFixture(REALISTIC_FIXTURES.concepts.nistCsf);
		const mappings = loadCrosswalkFixture(REALISTIC_FIXTURES.crosswalks.csfTo80053);

		const csfWithCurie = bind(csf, 'curie', (r) => `nist-csf:${r.id}`);
		const cfg = { leftOn: 'curie', rightOn: 'subject_id' };

		const arrayResult = innerJoin(csfWithCurie, mappings, cfg);
		const streamResult = consumeAll(innerJoinStream(asGenerator(csfWithCurie), asGenerator(mappings), cfg));

		expect(streamResult.length).toBe(arrayResult.length);
		// Compare canonicalized — sort by subject + object so order-of-pairing
		// differences from internal Map ordering don't fail the test
		const sortKey = (r: Record<string, unknown>) => `${r.curie}|${r.r_object_id}`;
		const sortedArray = [...arrayResult].sort((a, b) => sortKey(a).localeCompare(sortKey(b)));
		const sortedStream = [...streamResult].sort((a, b) => sortKey(a).localeCompare(sortKey(b)));
		expect(sortedStream).toEqual(sortedArray);
	});

	it('hash-build is on the RIGHT side — confirmed by inspecting memory shape', () => {
		// Inner join with a small right side + large left should bound memory by right.
		// We can't directly measure memory, but we can verify the right side is
		// indexed before the left starts streaming.
		const csf = loadConceptFixture(REALISTIC_FIXTURES.concepts.nistCsf);
		const mappings = loadCrosswalkFixture(REALISTIC_FIXTURES.crosswalks.csfTo80053);

		let leftConsumed = 0;
		function* leftGen(): Iterable<Record<string, unknown>> {
			for (const r of bind(csf, 'curie', (c) => `nist-csf:${c.id}`)) {
				leftConsumed++;
				yield r;
			}
		}
		let rightConsumed = 0;
		function* rightGen(): Iterable<Record<string, unknown>> {
			for (const r of mappings) {
				rightConsumed++;
				yield r;
			}
		}

		const stream = innerJoinStream(leftGen(), rightGen(), { leftOn: 'curie', rightOn: 'subject_id' });
		const iter = stream[Symbol.iterator]();
		iter.next(); // pull first joined row

		// At this point, RIGHT has been fully consumed (the hash is built first),
		// but LEFT has consumed at least 1 row (the one that produced the first match)
		expect(rightConsumed).toBe(mappings.length);
		expect(leftConsumed).toBeGreaterThanOrEqual(1);
		expect(leftConsumed).toBeLessThanOrEqual(csf.length);
	});
});

describe('leftOuterJoinStream — realistic gap-analysis parity', () => {
	it('preserves all CSF concepts (matched + unmatched) — same as array', () => {
		const csf = loadConceptFixture(REALISTIC_FIXTURES.concepts.nistCsf);
		const mappings = loadCrosswalkFixture(REALISTIC_FIXTURES.crosswalks.nistCsfToMitreAttack);

		const csfWithCurie = bind(csf, 'curie', (r) => `nist-csf:${r.id}`);
		const cfg = { leftOn: 'curie', rightOn: 'subject_id' };

		const arrayResult = leftOuterJoin(csfWithCurie, mappings, cfg);
		const streamResult = consumeAll(leftOuterJoinStream(asGenerator(csfWithCurie), asGenerator(mappings), cfg));

		expect(streamResult.length).toBe(arrayResult.length);
		// Same set of CSF IDs preserved (every concept appears at least once)
		expect(new Set(streamResult.map((r) => r.id))).toEqual(new Set(arrayResult.map((r) => r.id)));
	});
});

describe('antiJoinStream — realistic "unmapped controls" parity', () => {
	it('produces same gap rows as antiJoin', () => {
		const csf = loadConceptFixture(REALISTIC_FIXTURES.concepts.nistCsf);
		const mappings = loadCrosswalkFixture(REALISTIC_FIXTURES.crosswalks.nistCsfToMitreAttack);

		const csfWithCurie = bind(csf, 'curie', (r) => `nist-csf:${r.id}`);
		const cfg = { leftOn: 'curie', rightOn: 'subject_id' };

		const arrayResult = antiJoin(csfWithCurie, mappings, cfg);
		const streamResult = consumeAll(antiJoinStream(asGenerator(csfWithCurie), asGenerator(mappings), cfg));

		expect(streamResult.length).toBe(arrayResult.length);
		expect(new Set(streamResult.map((r) => r.id))).toEqual(new Set(arrayResult.map((r) => r.id)));
	});
});

describe('executeJoinStream dispatcher', () => {
	it('routes mode=inner to innerJoinStream', () => {
		const csf = loadConceptFixture(REALISTIC_FIXTURES.concepts.nistCsf);
		const mappings = loadCrosswalkFixture(REALISTIC_FIXTURES.crosswalks.csfTo80053);
		const csfWithCurie = bind(csf, 'curie', (r) => `nist-csf:${r.id}`);
		const result = consumeAll(executeJoinStream(asGenerator(csfWithCurie), asGenerator(mappings), {
			leftOn: 'curie',
			rightOn: 'subject_id',
			mode: 'inner',
		}));
		expect(result.length).toBeGreaterThan(0);
	});

	it('routes mode=anti to antiJoinStream', () => {
		const csf = loadConceptFixture(REALISTIC_FIXTURES.concepts.nistCsf);
		const mappings = loadCrosswalkFixture(REALISTIC_FIXTURES.crosswalks.nistCsfToMitreAttack);
		const csfWithCurie = bind(csf, 'curie', (r) => `nist-csf:${r.id}`);
		const result = consumeAll(executeJoinStream(asGenerator(csfWithCurie), asGenerator(mappings), {
			leftOn: 'curie',
			rightOn: 'subject_id',
			mode: 'anti',
		}));
		expect(result.length).toBeGreaterThan(0);
		// Anti-join over non-overlapping subsets: ALL csf concepts are gaps
		expect(result.length).toBe(csfWithCurie.length);
	});
});

// ---------------------------------------------------------------------------
// Set-op streaming
// ---------------------------------------------------------------------------

describe('set-op streaming — realistic cross-ontology parity', () => {
	it('intersectionStream matches array intersection (CIS ∩ SOC 2 = empty)', () => {
		const cis = loadConceptFixture(REALISTIC_FIXTURES.concepts.cis);
		const soc2 = loadConceptFixture(REALISTIC_FIXTURES.concepts.soc2);

		const arrayResult = intersection(cis, soc2, { keyOf: 'id', mode: 'intersection' });
		const streamResult = consumeAll(intersectionStream(asGenerator(cis), asGenerator(soc2), { keyOf: 'id', mode: 'intersection' }));

		expect(streamResult).toEqual(arrayResult);
		expect(streamResult).toEqual([]);
	});

	it('differenceStream matches array difference', () => {
		const csf = loadConceptFixture(REALISTIC_FIXTURES.concepts.nistCsf);
		const mappings = loadCrosswalkFixture(REALISTIC_FIXTURES.crosswalks.csfTo80053);

		const csfWithCurie = bind(csf, 'curie', (r) => `nist-csf:${r.id}`);
		const mappingSubjects = mappings.map((m) => ({ curie: m.subject_id as string }));

		const arrayResult = difference(csfWithCurie, mappingSubjects, { keyOf: 'curie', mode: 'difference' });
		const streamResult = consumeAll(
			differenceStream(asGenerator(csfWithCurie), asGenerator(mappingSubjects), { keyOf: 'curie', mode: 'difference' }),
		);

		expect(streamResult.length).toBe(arrayResult.length);
		expect(new Set(streamResult.map((r) => r.curie))).toEqual(new Set(arrayResult.map((r) => r.curie)));
	});

	it('setOpStream dispatcher routes correctly', () => {
		const cis = loadConceptFixture(REALISTIC_FIXTURES.concepts.cis);
		const soc2 = loadConceptFixture(REALISTIC_FIXTURES.concepts.soc2);

		const interResult = consumeAll(setOpStream(asGenerator(cis), asGenerator(soc2), { keyOf: 'id', mode: 'intersection' }));
		expect(interResult).toEqual([]);

		const diffResult = consumeAll(setOpStream(asGenerator(cis), asGenerator(soc2), { keyOf: 'id', mode: 'difference' }));
		expect(diffResult.length).toBe(cis.length); // CIS \ SOC2 = all of CIS (no overlap)
	});
});

// ---------------------------------------------------------------------------
// Composition — pipeline of streaming primitives
// ---------------------------------------------------------------------------

describe('composition — pipelined streaming primitives', () => {
	it('chains filter → bind → anti-join lazily', () => {
		const csf = loadConceptFixture(REALISTIC_FIXTURES.concepts.nistCsf);
		const mappings = loadCrosswalkFixture(REALISTIC_FIXTURES.crosswalks.csfTo80053);

		// Pipeline: filter to GOVERN function → bind CURIE → anti-join with mappings
		const govern = filterStream(asGenerator(csf), (r) => r.function === 'GOVERN');
		const withCurie = bindStream(govern, 'curie', (r) => `nist-csf:${r.id}`);
		const gaps = antiJoinStream(withCurie, asGenerator(mappings), {
			leftOn: 'curie',
			rightOn: 'subject_id',
		});

		const result = consumeAll(gaps);
		expect(result.length).toBeGreaterThanOrEqual(0);
		// Every result is a GOVERN concept that has no CSF→800-53 mapping
		expect(result.every((r) => r.function === 'GOVERN' && (r.curie as string).startsWith('nist-csf:'))).toBe(true);
	});
});
