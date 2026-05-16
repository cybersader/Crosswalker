/**
 * query-frontmatter-schema.test.ts — Phase 4.5 unit tests for the
 * crosswalker_query: frontmatter schema + AJV validation + helpers.
 */

import {
	validateQueryFrontmatter,
	newQueryId,
	viewFileFor,
	QUERY_FRONTMATTER_SCHEMA_VERSION,
} from '../src/views/query-frontmatter-schema';

function validBlock() {
	return {
		query_id: 'q-2026-05-15-a1b2c3d4',
		recipe: 'nist-csf-coverage-matrix',
		shape: 'pivot',
		params: { confidence_threshold: 0.7 },
		view_file: '_crosswalker/views/q-2026-05-15-a1b2c3d4.base',
		generated_at: '2026-05-15T20:55:00.000Z',
		schema_version: 1 as const,
	};
}

describe('validateQueryFrontmatter — accepts valid blocks', () => {
	it('accepts the canonical example', () => {
		const r = validateQueryFrontmatter(validBlock());
		expect(r.valid).toBe(true);
		expect(r.errors).toEqual([]);
	});

	it('accepts custom shape values (commitment #5 runtime-agnostic)', () => {
		const r = validateQueryFrontmatter({ ...validBlock(), shape: 'cards-v2-future' });
		expect(r.valid).toBe(true);
	});

	it('accepts empty params object', () => {
		const r = validateQueryFrontmatter({ ...validBlock(), params: {} });
		expect(r.valid).toBe(true);
	});

	it('accepts params with arbitrary nested values', () => {
		const r = validateQueryFrontmatter({
			...validBlock(),
			params: {
				confidence_threshold: 0.7,
				ontologies: ['nist-csf', 'nist-800-53'],
				heatmap: true,
				meta: { author: 'me' },
			},
		});
		expect(r.valid).toBe(true);
	});
});

describe('validateQueryFrontmatter — rejects malformed blocks', () => {
	it('rejects missing required fields', () => {
		const { recipe: _omit, ...rest } = validBlock();
		const r = validateQueryFrontmatter(rest);
		expect(r.valid).toBe(false);
		expect(r.errors.join(' ')).toContain('recipe');
	});

	it('rejects bad query_id format', () => {
		const r = validateQueryFrontmatter({ ...validBlock(), query_id: 'not-a-query-id' });
		expect(r.valid).toBe(false);
		expect(r.errors.join(' ')).toMatch(/query_id/);
	});

	it('rejects bad view_file path (must be under _crosswalker/views/)', () => {
		const r = validateQueryFrontmatter({ ...validBlock(), view_file: 'somewhere/else.base' });
		expect(r.valid).toBe(false);
		expect(r.errors.join(' ')).toMatch(/view_file/);
	});

	it('rejects view_file without .base extension', () => {
		const r = validateQueryFrontmatter({
			...validBlock(),
			view_file: '_crosswalker/views/q-2026-05-15-abc.txt',
		});
		expect(r.valid).toBe(false);
	});

	it('rejects bad generated_at format', () => {
		const r = validateQueryFrontmatter({ ...validBlock(), generated_at: 'yesterday' });
		expect(r.valid).toBe(false);
	});

	it('rejects unknown schema_version (forward-compat)', () => {
		const r = validateQueryFrontmatter({ ...validBlock(), schema_version: 999 });
		expect(r.valid).toBe(false);
	});

	it('rejects additional top-level properties', () => {
		const r = validateQueryFrontmatter({ ...validBlock(), unexpected_field: 'oops' });
		expect(r.valid).toBe(false);
		expect(r.errors.join(' ')).toMatch(/additional/i);
	});

	it('rejects null + undefined inputs gracefully', () => {
		expect(validateQueryFrontmatter(null).valid).toBe(false);
		expect(validateQueryFrontmatter(undefined).valid).toBe(false);
	});
});

describe('newQueryId', () => {
	it('matches the q-YYYY-MM-DD-<8hex> format', () => {
		const id = newQueryId(new Date('2026-05-15T12:34:56Z'));
		expect(id).toMatch(/^q-2026-05-15-[0-9a-f]{8}$/);
	});

	it('returns unique IDs on consecutive calls', () => {
		const ids = new Set<string>();
		for (let i = 0; i < 10; i++) {
			ids.add(newQueryId());
		}
		// Collision-unlikely with 8 hex chars (32 bits = ~4B values)
		expect(ids.size).toBeGreaterThanOrEqual(9);
	});

	it('uses UTC for the date portion', () => {
		// 2026-05-15T01:00:00 UTC → 2026-05-15 regardless of local TZ
		const id = newQueryId(new Date('2026-05-15T01:00:00Z'));
		expect(id.startsWith('q-2026-05-15-')).toBe(true);
	});
});

describe('viewFileFor', () => {
	it('builds the canonical _crosswalker/views/<id>.base path', () => {
		expect(viewFileFor('q-2026-05-15-abc12345')).toBe(
			'_crosswalker/views/q-2026-05-15-abc12345.base',
		);
	});

	it('result passes schema validation', () => {
		const id = newQueryId();
		const path = viewFileFor(id);
		const block = { ...validBlock(), query_id: id, view_file: path };
		expect(validateQueryFrontmatter(block).valid).toBe(true);
	});
});

describe('QUERY_FRONTMATTER_SCHEMA_VERSION', () => {
	it('is 1 for the v0.1.6 schema', () => {
		expect(QUERY_FRONTMATTER_SCHEMA_VERSION).toBe(1);
	});
});
