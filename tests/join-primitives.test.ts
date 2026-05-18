/**
 * join-primitives.test.ts — Phase 5 Layer A primitives.
 * Pure-function tests for inner / left-outer / right-outer / full-outer / anti.
 */

import {
	innerJoin,
	leftOuterJoin,
	rightOuterJoin,
	fullOuterJoin,
	antiJoin,
	executeJoin,
} from '../src/views/join-primitives';

const csfControls = [
	{ id: 'PR.AC-1', framework: 'csf', title: 'Identity management' },
	{ id: 'PR.AC-2', framework: 'csf', title: 'Physical access' },
	{ id: 'PR.AC-3', framework: 'csf', title: 'Remote access' },
];

const mappings = [
	{ subject: 'PR.AC-1', object: 'AC-2', confidence: 0.9 },
	{ subject: 'PR.AC-1', object: 'IA-2', confidence: 0.7 },
	{ subject: 'PR.AC-2', object: 'PE-3', confidence: 0.95 },
	{ subject: 'PR.AC-99', object: 'AC-99', confidence: 0.5 }, // no matching control
];

const config = { leftOn: 'id', rightOn: 'subject' };

describe('innerJoin', () => {
	it('returns rows where both sides match (cartesian per key bucket)', () => {
		const r = innerJoin(csfControls, mappings, config);
		// PR.AC-1 has 2 mappings → 2 rows; PR.AC-2 has 1 → 1 row; PR.AC-3 has 0 → 0 rows
		expect(r.length).toBe(3);
		expect(r.map((row) => row.id).sort()).toEqual(['PR.AC-1', 'PR.AC-1', 'PR.AC-2']);
	});

	it('merges left + right fields with rightPrefix (default r_)', () => {
		const r = innerJoin(csfControls, mappings, config);
		const row = r[0];
		expect(row.id).toBe('PR.AC-1');
		expect(row.framework).toBe('csf');
		expect(row.r_subject).toBe('PR.AC-1'); // right-side keys prefixed
		expect(row.r_object).toBe('AC-2');
	});

	it('returns empty for no matches', () => {
		const r = innerJoin([{ id: 'X-1' }], mappings, config);
		expect(r).toEqual([]);
	});

	it('skips left rows with null/empty keys', () => {
		const left = [{ id: 'PR.AC-1' }, { id: null }, { id: '' }];
		const r = innerJoin(left, mappings, config);
		// Only PR.AC-1 has matches; null/empty skipped
		expect(r.length).toBe(2);
	});
});

describe('leftOuterJoin', () => {
	it('preserves all left rows; null-pads when no match', () => {
		const r = leftOuterJoin(csfControls, mappings, config);
		// PR.AC-1 → 2 rows, PR.AC-2 → 1, PR.AC-3 → 1 null-padded = 4
		expect(r.length).toBe(4);
		const unmatched = r.find((row) => row.id === 'PR.AC-3');
		expect(unmatched).toBeDefined();
		expect(unmatched?.r_subject).toBeUndefined();
		expect(unmatched?.r_object).toBeUndefined();
	});

	it('every left row appears at least once', () => {
		const r = leftOuterJoin(csfControls, mappings, config);
		const leftIds = new Set(r.map((row) => row.id));
		expect(leftIds).toEqual(new Set(['PR.AC-1', 'PR.AC-2', 'PR.AC-3']));
	});

	it('the gap-analysis use case — "controls without evidence"', () => {
		const gapsOnly = leftOuterJoin(csfControls, mappings, config).filter(
			(row) => row.r_subject == null,
		);
		expect(gapsOnly.length).toBe(1);
		expect(gapsOnly[0].id).toBe('PR.AC-3');
	});
});

describe('rightOuterJoin', () => {
	it('preserves all right rows; null-pads left when no match', () => {
		const r = rightOuterJoin(csfControls, mappings, config);
		// PR.AC-1 → 2, PR.AC-2 → 1, PR.AC-99 mapping → 1 null-padded = 4
		expect(r.length).toBe(4);
		const unmatched = r.find((row) => row.r_subject === 'PR.AC-99');
		expect(unmatched).toBeDefined();
		expect(unmatched?.id).toBeUndefined();
		expect(unmatched?.framework).toBeUndefined();
	});
});

describe('fullOuterJoin', () => {
	it('preserves all left + all right rows', () => {
		const r = fullOuterJoin(csfControls, mappings, config);
		// 2 (PR.AC-1) + 1 (PR.AC-2) + 1 (PR.AC-3 null-padded) + 1 (PR.AC-99 null-padded) = 5
		expect(r.length).toBe(5);
	});

	it('surfaces both "controls without evidence" and "mappings without control"', () => {
		const r = fullOuterJoin(csfControls, mappings, config);
		const leftOnly = r.filter((row) => row.id != null && row.r_subject == null);
		const rightOnly = r.filter((row) => row.id == null && row.r_subject != null);
		expect(leftOnly.length).toBe(1);
		expect(leftOnly[0].id).toBe('PR.AC-3');
		expect(rightOnly.length).toBe(1);
		expect(rightOnly[0].r_subject).toBe('PR.AC-99');
	});
});

describe('antiJoin — Layer A primitive #5', () => {
	it('returns left rows with NO match in right', () => {
		const r = antiJoin(csfControls, mappings, config);
		expect(r.length).toBe(1);
		expect(r[0].id).toBe('PR.AC-3');
	});

	it('preserves left-side fields only (no right-side merge)', () => {
		const r = antiJoin(csfControls, mappings, config);
		expect(r[0]).toEqual({ id: 'PR.AC-3', framework: 'csf', title: 'Remote access' });
		expect(r[0].r_subject).toBeUndefined();
	});

	it('returns all left rows when right is empty', () => {
		const r = antiJoin(csfControls, [], config);
		expect(r.length).toBe(3);
	});

	it('returns empty when every left row has a match', () => {
		const exhaustive = [
			{ subject: 'PR.AC-1', object: 'X' },
			{ subject: 'PR.AC-2', object: 'Y' },
			{ subject: 'PR.AC-3', object: 'Z' },
		];
		const r = antiJoin(csfControls, exhaustive, config);
		expect(r).toEqual([]);
	});
});

describe('executeJoin dispatcher', () => {
	it('routes mode=inner correctly', () => {
		const r = executeJoin(csfControls, mappings, { ...config, mode: 'inner' });
		expect(r.length).toBe(3);
	});

	it('routes mode=left-outer correctly', () => {
		const r = executeJoin(csfControls, mappings, { ...config, mode: 'left-outer' });
		expect(r.length).toBe(4);
	});

	it('routes mode=anti correctly', () => {
		const r = executeJoin(csfControls, mappings, { ...config, mode: 'anti' });
		expect(r.length).toBe(1);
	});

	it('defaults to inner when mode omitted', () => {
		const r = executeJoin(csfControls, mappings, config);
		const innerR = innerJoin(csfControls, mappings, config);
		expect(r).toEqual(innerR);
	});
});

describe('key extractors', () => {
	it('supports function-based extractors', () => {
		const r = innerJoin(csfControls, mappings, {
			leftOn: (e) => (e as { id: string }).id.toLowerCase(),
			rightOn: (e) => (e as { subject: string }).subject.toLowerCase(),
		});
		expect(r.length).toBe(3);
	});

	it('treats null/empty keys as non-matchable', () => {
		const left = [{ id: '' }, { id: null }];
		const r = leftOuterJoin(left, mappings, config);
		// Both left rows preserved but null-padded (no match possible)
		expect(r.length).toBe(2);
		expect(r.every((row) => row.r_subject == null)).toBe(true);
	});
});
