/**
 * set-op-primitive.test.ts — Phase 6 Layer A primitive #7.
 */

import { setOp, union, intersection, difference } from '../src/views/set-op-primitive';

const nistConcepts = [
	{ id: 'AC-2', framework: 'nist' },
	{ id: 'PE-3', framework: 'nist' },
	{ id: 'IA-2', framework: 'nist' },
];

const cisConcepts = [
	{ id: 'AC-2', framework: 'cis' },
	{ id: 'CM-7', framework: 'cis' },
];

const config = { keyOf: 'id', mode: 'union' as const };

describe('union', () => {
	it('returns rows from both inputs (keys collapsed)', () => {
		const out = union(nistConcepts, cisConcepts, config);
		// nist: AC-2, PE-3, IA-2 → 3; cis: AC-2 (collision), CM-7 (new) → +1 = 4
		expect(out.length).toBe(4);
		expect(out.map((r) => r.id).sort()).toEqual(['AC-2', 'CM-7', 'IA-2', 'PE-3']);
	});

	it('default conflict strategy is left-wins', () => {
		const out = union(nistConcepts, cisConcepts, config);
		const ac2 = out.find((r) => r.id === 'AC-2');
		expect(ac2?.framework).toBe('nist'); // left's framework wins
	});

	it('right-wins strategy overwrites left fields on collision', () => {
		const out = union(nistConcepts, cisConcepts, { ...config, conflictStrategy: 'right' });
		const ac2 = out.find((r) => r.id === 'AC-2');
		expect(ac2?.framework).toBe('cis');
	});

	it('merge strategy combines fields from both sides', () => {
		const enrichedLeft = [{ id: 'AC-2', framework: 'nist', desc: 'access control' }];
		const enrichedRight = [{ id: 'AC-2', framework: 'cis', cis_priority: 'high' }];
		const out = union(enrichedLeft, enrichedRight, { keyOf: 'id', mode: 'union', conflictStrategy: 'merge' });
		expect(out[0]).toEqual({ id: 'AC-2', framework: 'cis', desc: 'access control', cis_priority: 'high' });
	});

	it('preserves left order then appends right-only rows', () => {
		const out = union(nistConcepts, cisConcepts, config);
		expect(out[0].id).toBe('AC-2');
		expect(out[1].id).toBe('PE-3');
		expect(out[2].id).toBe('IA-2');
		expect(out[3].id).toBe('CM-7'); // right-only, appended
	});

	it('handles duplicate keys in left input (collapses to first)', () => {
		const dupLeft = [{ id: 'AC-2', tag: 'one' }, { id: 'AC-2', tag: 'two' }];
		const out = union(dupLeft, [], config);
		expect(out.length).toBe(1);
		expect(out[0].tag).toBe('one');
	});
});

describe('intersection', () => {
	it('returns rows that appear in BOTH sets by key', () => {
		const out = intersection(nistConcepts, cisConcepts, { keyOf: 'id', mode: 'intersection' });
		expect(out.length).toBe(1);
		expect(out[0].id).toBe('AC-2');
	});

	it('preserves left fields by default', () => {
		const out = intersection(nistConcepts, cisConcepts, { keyOf: 'id', mode: 'intersection' });
		expect(out[0].framework).toBe('nist');
	});

	it('right strategy returns right fields', () => {
		const out = intersection(nistConcepts, cisConcepts, {
			keyOf: 'id',
			mode: 'intersection',
			conflictStrategy: 'right',
		});
		expect(out[0].framework).toBe('cis');
	});

	it('returns empty when no shared keys', () => {
		const out = intersection(nistConcepts, [{ id: 'X-1', framework: 'other' }], {
			keyOf: 'id',
			mode: 'intersection',
		});
		expect(out).toEqual([]);
	});

	it('"controls in both frameworks" use case', () => {
		// The query Ch 29 cited as inexpressible without set-op
		const out = intersection(nistConcepts, cisConcepts, { keyOf: 'id', mode: 'intersection' });
		expect(out.map((r) => r.id)).toEqual(['AC-2']);
	});
});

describe('difference', () => {
	it('returns left rows whose keys are NOT in right', () => {
		const out = difference(nistConcepts, cisConcepts, { keyOf: 'id', mode: 'difference' });
		expect(out.length).toBe(2);
		expect(out.map((r) => r.id).sort()).toEqual(['IA-2', 'PE-3']);
	});

	it('returns all left rows when right is empty', () => {
		const out = difference(nistConcepts, [], { keyOf: 'id', mode: 'difference' });
		expect(out.length).toBe(3);
	});

	it('returns empty when right contains every left key', () => {
		const out = difference(
			nistConcepts,
			[{ id: 'AC-2' }, { id: 'PE-3' }, { id: 'IA-2' }],
			{ keyOf: 'id', mode: 'difference' },
		);
		expect(out).toEqual([]);
	});

	it('is distinct from anti-join semantically (sets, not relations)', () => {
		// difference uses identity-key equality; anti-join uses a join predicate
		// Result is similar but for distinct row-set comparison the right shape
		const out = difference(nistConcepts, cisConcepts, { keyOf: 'id', mode: 'difference' });
		expect(out.every((r) => r.framework === 'nist')).toBe(true);
	});
});

describe('setOp dispatcher', () => {
	it('routes union correctly', () => {
		const r = setOp(nistConcepts, cisConcepts, { keyOf: 'id', mode: 'union' });
		expect(r.length).toBe(4);
	});

	it('routes intersection correctly', () => {
		const r = setOp(nistConcepts, cisConcepts, { keyOf: 'id', mode: 'intersection' });
		expect(r.length).toBe(1);
	});

	it('routes difference correctly', () => {
		const r = setOp(nistConcepts, cisConcepts, { keyOf: 'id', mode: 'difference' });
		expect(r.length).toBe(2);
	});

	it('supports function-based key extractors', () => {
		const r = setOp(nistConcepts, cisConcepts, {
			keyOf: (row) => (row.id as string).toLowerCase(),
			mode: 'intersection',
		});
		expect(r.length).toBe(1);
	});
});
