/**
 * diff-primitive.test.ts — Phase 6 Layer A primitive #8.
 */

import { diff } from '../src/views/diff-primitive';

const v1 = [
	{ curie: 'csf:GV.OC-01', label: 'Mission stated', risk: 'high' },
	{ curie: 'csf:GV.OC-02', label: 'Org context understood', risk: 'medium' },
	{ curie: 'csf:GV.RM-01', label: 'Risk strategy', risk: 'high' },
];

const v2 = [
	{ curie: 'csf:GV.OC-01', label: 'Mission stated', risk: 'high' }, // unchanged
	{ curie: 'csf:GV.OC-02', label: 'Org context understood', risk: 'low' }, // changed (risk)
	// csf:GV.RM-01 removed
	{ curie: 'csf:GV.SC-01', label: 'Supply chain', risk: 'high' }, // added
];

describe('diff — basic delta detection', () => {
	it('detects added rows (in AFTER, not in BEFORE)', () => {
		const d = diff(v1, v2, { keyOf: 'curie' });
		expect(d.added.length).toBe(1);
		expect(d.added[0].curie).toBe('csf:GV.SC-01');
	});

	it('detects removed rows (in BEFORE, not in AFTER)', () => {
		const d = diff(v1, v2, { keyOf: 'curie' });
		expect(d.removed.length).toBe(1);
		expect(d.removed[0].curie).toBe('csf:GV.RM-01');
	});

	it('detects changed rows (in both, with different fields)', () => {
		const d = diff(v1, v2, { keyOf: 'curie' });
		expect(d.changed.length).toBe(1);
		expect(d.changed[0].key).toBe('csf:GV.OC-02');
	});

	it('changed records include before, after, and per-field deltas', () => {
		const d = diff(v1, v2, { keyOf: 'curie' });
		const c = d.changed[0];
		expect(c.before.risk).toBe('medium');
		expect(c.after.risk).toBe('low');
		expect(c.changedFields).toHaveLength(1);
		expect(c.changedFields[0]).toEqual({ field: 'risk', before: 'medium', after: 'low' });
	});

	it('does not emit unchanged rows by default', () => {
		const d = diff(v1, v2, { keyOf: 'curie' });
		expect(d.unchanged).toBeUndefined();
	});
});

describe('diff — unchanged + edge cases', () => {
	it('emits unchanged when includeUnchanged: true', () => {
		const d = diff(v1, v2, { keyOf: 'curie' }, { includeUnchanged: true });
		expect(d.unchanged).toBeDefined();
		expect(d.unchanged?.length).toBe(1);
		expect(d.unchanged?.[0].curie).toBe('csf:GV.OC-01');
	});

	it('handles identical snapshots (empty added/removed/changed)', () => {
		const d = diff(v1, v1, { keyOf: 'curie' });
		expect(d.added).toEqual([]);
		expect(d.removed).toEqual([]);
		expect(d.changed).toEqual([]);
	});

	it('handles empty BEFORE (all rows are added)', () => {
		const d = diff([], v2, { keyOf: 'curie' });
		expect(d.added.length).toBe(3);
		expect(d.removed).toEqual([]);
		expect(d.changed).toEqual([]);
	});

	it('handles empty AFTER (all rows are removed)', () => {
		const d = diff(v1, [], { keyOf: 'curie' });
		expect(d.added).toEqual([]);
		expect(d.removed.length).toBe(3);
		expect(d.changed).toEqual([]);
	});
});

describe('diff — ignoreFields', () => {
	it('ignores specified fields when detecting changed rows', () => {
		const before = [{ curie: 'a', value: 1, last_reviewed: '2025-01-01' }];
		const after = [{ curie: 'a', value: 1, last_reviewed: '2026-01-01' }];
		const d = diff(before, after, { keyOf: 'curie', ignoreFields: ['last_reviewed'] });
		expect(d.changed).toEqual([]);
	});

	it('still detects changes in non-ignored fields', () => {
		const before = [{ curie: 'a', value: 1, last_reviewed: '2025-01-01' }];
		const after = [{ curie: 'a', value: 2, last_reviewed: '2026-01-01' }];
		const d = diff(before, after, { keyOf: 'curie', ignoreFields: ['last_reviewed'] });
		expect(d.changed.length).toBe(1);
		expect(d.changed[0].changedFields.length).toBe(1);
		expect(d.changed[0].changedFields[0].field).toBe('value');
	});
});

describe('diff — custom equalsFn', () => {
	it('uses custom equality function when provided', () => {
		const before = [{ curie: 'a', value: 1.001 }];
		const after = [{ curie: 'a', value: 1.002 }];
		// Custom equality: treat values within 0.01 as equal
		const equalsFn = (b: Record<string, unknown>, a: Record<string, unknown>) =>
			Math.abs((b.value as number) - (a.value as number)) < 0.01;
		const d = diff(before, after, { keyOf: 'curie', equalsFn });
		expect(d.changed).toEqual([]);
	});
});

describe('diff — nested + array value comparison', () => {
	it('detects nested object changes', () => {
		const before = [{ curie: 'a', meta: { author: 'alice' } }];
		const after = [{ curie: 'a', meta: { author: 'bob' } }];
		const d = diff(before, after, { keyOf: 'curie' });
		expect(d.changed.length).toBe(1);
	});

	it('detects array changes (different length)', () => {
		const before = [{ curie: 'a', tags: ['x', 'y'] }];
		const after = [{ curie: 'a', tags: ['x'] }];
		const d = diff(before, after, { keyOf: 'curie' });
		expect(d.changed.length).toBe(1);
	});

	it('treats identical arrays as equal', () => {
		const before = [{ curie: 'a', tags: ['x', 'y'] }];
		const after = [{ curie: 'a', tags: ['x', 'y'] }];
		const d = diff(before, after, { keyOf: 'curie' });
		expect(d.changed).toEqual([]);
	});
});

describe('diff — function-based keyOf', () => {
	it('supports function key extractors', () => {
		const d = diff(v1, v2, { keyOf: (r) => `${r.curie}` });
		expect(d.added.length).toBe(1);
		expect(d.removed.length).toBe(1);
		expect(d.changed.length).toBe(1);
	});
});

describe('diff — the "NIST CSF v1.1 → v2.0" worked example', () => {
	it('produces the expected typed change records for ontology version delta', () => {
		const csf_v1 = [
			{ curie: 'csf:ID.AM-1', name: 'Inventory of physical devices', tier: 1 },
			{ curie: 'csf:ID.AM-2', name: 'Inventory of software platforms', tier: 1 },
			{ curie: 'csf:ID.AM-3', name: 'Data flows mapped', tier: 2 },
		];
		const csf_v2 = [
			{ curie: 'csf:ID.AM-1', name: 'Inventory of physical devices', tier: 1 }, // unchanged
			{ curie: 'csf:ID.AM-2', name: 'Software platform inventory', tier: 1 }, // renamed
			// ID.AM-3 removed
			{ curie: 'csf:GV.OC-1', name: 'Mission communicated', tier: 1 }, // added
		];
		const d = diff(csf_v1, csf_v2, { keyOf: 'curie' });
		expect(d.added.map((r) => r.curie)).toEqual(['csf:GV.OC-1']);
		expect(d.removed.map((r) => r.curie)).toEqual(['csf:ID.AM-3']);
		expect(d.changed.length).toBe(1);
		expect(d.changed[0].key).toBe('csf:ID.AM-2');
		expect(d.changed[0].changedFields[0].field).toBe('name');
	});
});
