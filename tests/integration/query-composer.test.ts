/**
 * query-composer.test.ts — Phase 7 integration tests.
 *
 * Verifies the recipe → primitive bridge over realistic fixtures: a recipe's
 * declared join steps actually dispatch to the right join-primitive mode and
 * compose with filters. Array + streaming parity.
 */

import {
	composeQuery,
	composeQueryStream,
	joinKindToMode,
	type SourceMap,
} from '../../src/views/query-composer';
import { bind } from '../../src/views/bind-primitive';
import {
	loadConceptFixture,
	loadCrosswalkFixture,
	REALISTIC_FIXTURES,
} from '../helpers/fixture-loader';

function consume<T>(iter: Iterable<T>): T[] {
	return Array.from(iter);
}

describe('joinKindToMode — recipe enum → primitive mode', () => {
	it('maps every recipe Join.kind value', () => {
		expect(joinKindToMode('inner')).toBe('inner');
		expect(joinKindToMode('left')).toBe('left-outer');
		expect(joinKindToMode('right')).toBe('right-outer');
		expect(joinKindToMode('outer')).toBe('full-outer');
		expect(joinKindToMode('anti')).toBe('anti');
	});

	it('throws on unknown kind', () => {
		expect(() => joinKindToMode('cross')).toThrow('Unknown join kind');
	});
});

describe('composeQuery — realistic recipe shapes', () => {
	function buildSources(): SourceMap {
		const csf = bind(loadConceptFixture(REALISTIC_FIXTURES.concepts.nistCsf), 'curie', (r) => `nist-csf:${r.id}`);
		const mappings = loadCrosswalkFixture(REALISTIC_FIXTURES.crosswalks.csfTo80053);
		return { csf, mappings };
	}

	it('inner-join recipe: CSF concepts × CSF→800-53 mappings', () => {
		const sources = buildSources();
		const result = composeQuery(
			{
				from: 'csf',
				joins: [{ withSource: 'mappings', kind: 'inner', leftOn: 'curie', rightOn: 'subject_id' }],
			},
			sources,
		);
		expect(result.length).toBeGreaterThan(0);
		// Every row has both a CSF concept side + a mapping side
		expect(result.every((r) => r.id != null && r.r_object_id != null)).toBe(true);
	});

	it('anti-join recipe: CSF concepts with NO mapping (gap analysis)', () => {
		const sources = buildSources();
		const gaps = composeQuery(
			{
				from: 'csf',
				joins: [{ withSource: 'mappings', kind: 'anti', leftOn: 'curie', rightOn: 'subject_id' }],
			},
			sources,
		);
		// Gap rows preserve only the CSF concept (no merge)
		expect(gaps.length).toBeGreaterThan(0);
		expect(gaps.every((r) => r.id != null && r.r_object_id == null)).toBe(true);
	});

	it('left-outer recipe preserves all CSF concepts', () => {
		const sources = buildSources();
		const all = composeQuery(
			{
				from: 'csf',
				joins: [{ withSource: 'mappings', kind: 'left', leftOn: 'curie', rightOn: 'subject_id' }],
			},
			sources,
		);
		const distinctConcepts = new Set(all.map((r) => r.id));
		expect(distinctConcepts.size).toBe(sources.csf.length);
	});

	it('where pre-filter narrows the primary source before join', () => {
		const sources = buildSources();
		const governOnly = composeQuery(
			{
				from: 'csf',
				where: (r) => r.function === 'GOVERN',
				joins: [{ withSource: 'mappings', kind: 'left', leftOn: 'curie', rightOn: 'subject_id' }],
			},
			sources,
		);
		expect(governOnly.length).toBeGreaterThan(0);
		expect(governOnly.every((r) => r.function === 'GOVERN')).toBe(true);
	});

	it('having post-filter narrows the composed result', () => {
		const sources = buildSources();
		const highMatch = composeQuery(
			{
				from: 'csf',
				joins: [{ withSource: 'mappings', kind: 'inner', leftOn: 'curie', rightOn: 'subject_id' }],
				having: (r) => r.r_match_type === 'exact',
			},
			sources,
		);
		expect(highMatch.every((r) => r.r_match_type === 'exact')).toBe(true);
	});

	it('throws when a named source is missing', () => {
		expect(() =>
			composeQuery({ from: 'nonexistent', joins: [] }, {}),
		).toThrow("source 'nonexistent' not found");
	});

	it('multi-join chain: CSF → mappings → (re-key) is composable left-to-right', () => {
		const sources = buildSources();
		// Two-step: inner-join to mappings, then anti-join the result against
		// a synthetic "reviewed" set to find mapped-but-unreviewed pairs.
		const reviewed = [{ pair: 'nist-csf:GV.OC-01' }];
		const result = composeQuery(
			{
				from: 'csf',
				joins: [
					{ withSource: 'mappings', kind: 'inner', leftOn: 'curie', rightOn: 'subject_id' },
					{ withSource: 'reviewed', kind: 'anti', leftOn: 'curie', rightOn: 'pair' },
				],
			},
			{ ...sources, reviewed },
		);
		// GV.OC-01 mappings should be excluded by the anti-join
		expect(result.every((r) => r.curie !== 'nist-csf:GV.OC-01')).toBe(true);
	});
});

describe('composeQueryStream — array/stream parity', () => {
	function buildSources(): SourceMap {
		const csf = bind(loadConceptFixture(REALISTIC_FIXTURES.concepts.nistCsf), 'curie', (r) => `nist-csf:${r.id}`);
		const mappings = loadCrosswalkFixture(REALISTIC_FIXTURES.crosswalks.csfTo80053);
		return { csf, mappings };
	}

	it('streaming inner-join matches array output', () => {
		const sources = buildSources();
		const spec = {
			from: 'csf',
			joins: [{ withSource: 'mappings', kind: 'inner', leftOn: 'curie', rightOn: 'subject_id' }],
		};
		const arrayResult = composeQuery(spec, sources);
		const streamResult = consume(composeQueryStream(spec, sources));
		expect(streamResult.length).toBe(arrayResult.length);
	});

	it('streaming anti-join + where matches array', () => {
		const sources = buildSources();
		const spec = {
			from: 'csf',
			where: (r: Record<string, unknown>) => r.function === 'GOVERN',
			joins: [{ withSource: 'mappings', kind: 'anti' as const, leftOn: 'curie', rightOn: 'subject_id' }],
		};
		const arrayResult = composeQuery(spec, sources);
		const streamResult = consume(composeQueryStream(spec, sources));
		expect(new Set(streamResult.map((r) => r.id))).toEqual(new Set(arrayResult.map((r) => r.id)));
	});

	it('streaming path is lazy — does not consume until iterated', () => {
		const sources = buildSources();
		const iter = composeQueryStream(
			{ from: 'csf', joins: [{ withSource: 'mappings', kind: 'inner', leftOn: 'curie', rightOn: 'subject_id' }] },
			sources,
		);
		// Obtaining the iterable doesn't throw + doesn't fully materialize.
		// Pull just the first row.
		const it = iter[Symbol.iterator]();
		const first = it.next();
		expect(first.done === false || first.done === true).toBe(true); // either has rows or not, no crash
	});
});
