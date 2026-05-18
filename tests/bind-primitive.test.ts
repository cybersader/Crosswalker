/**
 * bind-primitive.test.ts — Phase 6 Layer A primitive #3.
 */

import { bind, bindMany } from '../src/views/bind-primitive';

describe('bind — single derived column', () => {
	it('adds a derived column from a numeric formula', () => {
		const rows = [
			{ id: 'a', value: 10 },
			{ id: 'b', value: 20 },
		];
		const out = bind(rows, 'doubled', (row) => (row.value as number) * 2);
		expect(out).toEqual([
			{ id: 'a', value: 10, doubled: 20 },
			{ id: 'b', value: 20, doubled: 40 },
		]);
	});

	it('adds a derived string column', () => {
		const rows = [
			{ ontology: 'nist', id: 'AC-2' },
			{ ontology: 'iso', id: '5.15' },
		];
		const out = bind(rows, 'curie', (row) => `${row.ontology}:${row.id}`);
		expect((out[0].curie as string)).toBe('nist:AC-2');
		expect((out[1].curie as string)).toBe('iso:5.15');
	});

	it('does not mutate the input rows', () => {
		const rows = [{ a: 1 }];
		const beforeStr = JSON.stringify(rows);
		bind(rows, 'b', (r) => (r.a as number) + 1);
		expect(JSON.stringify(rows)).toBe(beforeStr);
		expect((rows[0] as Record<string, unknown>).b).toBeUndefined();
	});

	it('preserves row order', () => {
		const rows = [{ id: 1 }, { id: 2 }, { id: 3 }];
		const out = bind(rows, 'x', (r) => (r.id as number) * 10);
		expect(out.map((r) => r.id)).toEqual([1, 2, 3]);
	});

	it('overwrites an existing column when name collides', () => {
		const rows = [{ id: 'a', score: 1 }];
		const out = bind(rows, 'score', () => 99);
		expect(out[0].score).toBe(99);
	});

	it('formulas can return any type (boolean, null, object, array)', () => {
		const rows = [{ x: 5 }];
		expect(bind(rows, 'b', () => true)[0].b).toBe(true);
		expect(bind(rows, 'b', () => null)[0].b).toBeNull();
		expect(bind(rows, 'b', () => ({ nested: 'value' }))[0].b).toEqual({ nested: 'value' });
		expect(bind(rows, 'b', () => [1, 2, 3])[0].b).toEqual([1, 2, 3]);
	});

	it('throws when name is empty', () => {
		expect(() => bind([{ a: 1 }], '', () => 1)).toThrow('non-empty');
	});

	it('returns empty array for empty input', () => {
		expect(bind([], 'x', () => 1)).toEqual([]);
	});
});

describe('bindMany — chained derivations', () => {
	it('applies multiple binds sequentially', () => {
		const rows = [{ value: 10 }];
		const out = bindMany(rows, [
			['doubled', (r) => (r.value as number) * 2],
			['plus_one', (r) => (r.doubled as number) + 1],
		]);
		expect(out[0]).toEqual({ value: 10, doubled: 20, plus_one: 21 });
	});

	it('later binds can reference earlier-computed columns', () => {
		const controls = [{ last_reviewed: new Date('2025-01-01').getTime() }];
		const out = bindMany(controls, [
			['age_days', (r) => Math.floor((new Date('2026-01-01').getTime() - (r.last_reviewed as number)) / 86400000)],
			['is_stale', (r) => (r.age_days as number) > 365],
		]);
		expect(out[0].age_days).toBe(365);
		expect(out[0].is_stale).toBe(false);
	});

	it('empty binding list is a no-op (returns input unchanged)', () => {
		const rows = [{ a: 1 }];
		const out = bindMany(rows, []);
		expect(out).toEqual(rows);
	});
});
