/**
 * query-frontmatter-schema.test.ts — Phase 4.6 unit tests (schema v2).
 * crosswalker_query: frontmatter schema + AJV validation + helpers.
 */

import {
	validateQueryFrontmatter,
	validateQueryFrontmatterV1,
	newQueryId,
	viewFileFor,
	indexFileFor,
	queryFolderFor,
	QUERY_FRONTMATTER_SCHEMA_VERSION,
	QUERY_FRONTMATTER_SCHEMA_VERSION_V1,
} from '../src/views/query-frontmatter-schema';

function validBlock() {
	return {
		query_id: 'q-2026-05-15-a1b2c3d4',
		slug: 'nist-csf-coverage-matrix',
		recipe: 'nist-csf-coverage-matrix',
		shape: 'pivot',
		params: { confidence_threshold: 0.7 },
		view_file: '_crosswalker/queries/nist-csf-coverage-matrix/view.base',
		generated_at: '2026-05-15T20:55:00.000Z',
		schema_version: 2 as const,
	};
}

function validBlockV1() {
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

describe('validateQueryFrontmatter (v2) — accepts valid blocks', () => {
	it('accepts the canonical v2 example', () => {
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

describe('validateQueryFrontmatter (v2) — rejects malformed blocks', () => {
	it('rejects missing required fields', () => {
		const { recipe: _omit, ...rest } = validBlock();
		const r = validateQueryFrontmatter(rest);
		expect(r.valid).toBe(false);
		expect(r.errors.join(' ')).toContain('recipe');
	});

	it('rejects missing slug field (v2 addition)', () => {
		const { slug: _omit, ...rest } = validBlock();
		const r = validateQueryFrontmatter(rest);
		expect(r.valid).toBe(false);
	});

	it('rejects bad query_id format', () => {
		const r = validateQueryFrontmatter({ ...validBlock(), query_id: 'not-a-query-id' });
		expect(r.valid).toBe(false);
		expect(r.errors.join(' ')).toMatch(/query_id/);
	});

	it('rejects bad slug format (must be kebab-case ASCII)', () => {
		const r = validateQueryFrontmatter({ ...validBlock(), slug: 'Has Spaces' });
		expect(r.valid).toBe(false);
	});

	it('rejects bad view_file path (must be under _crosswalker/queries/<slug>/view.base)', () => {
		const r = validateQueryFrontmatter({ ...validBlock(), view_file: 'somewhere/else.base' });
		expect(r.valid).toBe(false);
		expect(r.errors.join(' ')).toMatch(/view_file/);
	});

	it('rejects legacy Phase 4.5 view_file path under v2 schema', () => {
		const r = validateQueryFrontmatter({
			...validBlock(),
			view_file: '_crosswalker/views/q-2026-05-15-abc12345.base',
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

	it('rejects v1 schema_version under v2 validator', () => {
		const r = validateQueryFrontmatter({ ...validBlock(), schema_version: 1 });
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

describe('validateQueryFrontmatterV1 — backward-compat for Phase 4.5 reads', () => {
	it('accepts a valid v1 block', () => {
		const r = validateQueryFrontmatterV1(validBlockV1());
		expect(r.valid).toBe(true);
	});

	it('rejects v2 blocks (slug field is unknown to v1)', () => {
		const r = validateQueryFrontmatterV1(validBlock());
		expect(r.valid).toBe(false);
	});

	it('rejects v1 with v2 view_file path', () => {
		const r = validateQueryFrontmatterV1({
			...validBlockV1(),
			view_file: '_crosswalker/queries/foo/view.base',
		});
		expect(r.valid).toBe(false);
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
		expect(ids.size).toBeGreaterThanOrEqual(9);
	});

	it('uses UTC for the date portion', () => {
		const id = newQueryId(new Date('2026-05-15T01:00:00Z'));
		expect(id.startsWith('q-2026-05-15-')).toBe(true);
	});
});

describe('Path helpers — v2 Layout B+', () => {
	it('viewFileFor builds <folder>/view.base from slug', () => {
		expect(viewFileFor('csf-coverage')).toBe('_crosswalker/queries/csf-coverage/view.base');
	});

	it('indexFileFor builds <folder>/index.md from slug', () => {
		expect(indexFileFor('csf-coverage')).toBe('_crosswalker/queries/csf-coverage/index.md');
	});

	it('queryFolderFor builds the canonical folder path', () => {
		expect(queryFolderFor('csf-coverage')).toBe('_crosswalker/queries/csf-coverage');
	});

	it('viewFileFor output passes schema validation', () => {
		const id = newQueryId();
		const slug = 'csf-coverage';
		const path = viewFileFor(slug);
		const block = { ...validBlock(), query_id: id, slug, view_file: path };
		expect(validateQueryFrontmatter(block).valid).toBe(true);
	});
});

describe('Schema version constants', () => {
	it('current version is 2 for Phase 4.6 (Layout B+)', () => {
		expect(QUERY_FRONTMATTER_SCHEMA_VERSION).toBe(2);
	});

	it('v1 constant preserved for backward-compat reads', () => {
		expect(QUERY_FRONTMATTER_SCHEMA_VERSION_V1).toBe(1);
	});
});
