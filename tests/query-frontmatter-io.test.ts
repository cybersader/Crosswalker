/**
 * query-frontmatter-io.test.ts — Phase 4.5 unit tests for the
 * read/write frontmatter helpers. Uses the mocked Obsidian FileManager
 * (tests/__mocks__/obsidian.ts) which captures processFrontMatter calls
 * to an in-memory store keyed by file path.
 */

import {
	readQueryFrontmatter,
	writeQueryFrontmatter,
	hasQueryFrontmatter,
	buildFrontmatter,
	updateFrontmatterParams,
} from '../src/views/query-frontmatter-io';
import { FileManager, TFile } from 'obsidian';
import type { CrosswalkerQueryFrontmatter } from '../src/views/query-frontmatter-schema';

interface MockApp {
	vault: object;
	fileManager: FileManager;
	metadataCache: {
		getFileCache: jest.Mock;
	};
}

function makeApp(metadata: Record<string, Record<string, unknown> | undefined> = {}): MockApp {
	const fileManager = new FileManager();
	return {
		vault: {},
		fileManager,
		metadataCache: {
			getFileCache: jest.fn((file: TFile) => {
				const fm = metadata[file.path];
				return fm ? { frontmatter: fm } : null;
			}),
		},
	};
}

function file(path: string): TFile {
	const f = new TFile(path);
	return f;
}

function validBlock(): CrosswalkerQueryFrontmatter {
	return {
		query_id: 'q-2026-05-15-a1b2c3d4',
		recipe: 'nist-csf-coverage-matrix',
		shape: 'pivot',
		params: { confidence_threshold: 0.7 },
		view_file: '_crosswalker/views/q-2026-05-15-a1b2c3d4.base',
		generated_at: '2026-05-15T20:55:00.000Z',
		schema_version: 1,
	};
}

// ---------------------------------------------------------------------------
// readQueryFrontmatter
// ---------------------------------------------------------------------------

describe('readQueryFrontmatter', () => {
	it('returns present=false when note has no frontmatter', async () => {
		const app = makeApp({});
		const r = await readQueryFrontmatter(app as never, file('test.md'));
		expect(r.present).toBe(false);
		expect(r.data).toBeNull();
	});

	it('returns present=false when frontmatter has no crosswalker block', async () => {
		const app = makeApp({ 'test.md': { title: 'My note' } });
		const r = await readQueryFrontmatter(app as never, file('test.md'));
		expect(r.present).toBe(false);
	});

	it('returns valid data when crosswalker block is well-formed', async () => {
		const block = validBlock();
		const app = makeApp({ 'test.md': { crosswalker_query: block } });
		const r = await readQueryFrontmatter(app as never, file('test.md'));
		expect(r.present).toBe(true);
		expect(r.data).toEqual(block);
		expect(r.errors).toEqual([]);
	});

	it('returns present=true + data=null + errors when crosswalker block is malformed', async () => {
		const app = makeApp({
			'test.md': { crosswalker_query: { recipe: 'oops' } },
		});
		const r = await readQueryFrontmatter(app as never, file('test.md'));
		expect(r.present).toBe(true);
		expect(r.data).toBeNull();
		expect(r.errors.length).toBeGreaterThan(0);
	});
});

// ---------------------------------------------------------------------------
// hasQueryFrontmatter
// ---------------------------------------------------------------------------

describe('hasQueryFrontmatter', () => {
	it('returns true even for malformed blocks (presence test, not validity)', async () => {
		const app = makeApp({ 'test.md': { crosswalker_query: { bad: 'shape' } } });
		expect(await hasQueryFrontmatter(app as never, file('test.md'))).toBe(true);
	});

	it('returns false when no block present', async () => {
		const app = makeApp({ 'test.md': { other_key: 'value' } });
		expect(await hasQueryFrontmatter(app as never, file('test.md'))).toBe(false);
	});
});

// ---------------------------------------------------------------------------
// writeQueryFrontmatter
// ---------------------------------------------------------------------------

describe('writeQueryFrontmatter', () => {
	it('writes a valid block via processFrontMatter', async () => {
		const app = makeApp({});
		const block = validBlock();
		const r = await writeQueryFrontmatter(app as never, file('test.md'), block);
		expect(r.ok).toBe(true);
		expect(app.fileManager.processFrontMatter).toHaveBeenCalledTimes(1);
		expect(app.fileManager.__frontmatter.get('test.md')?.crosswalker_query).toEqual(block);
	});

	it('rejects invalid blocks BEFORE writing (no I/O leak)', async () => {
		const app = makeApp({});
		const bad = { ...validBlock(), query_id: 'invalid-format' };
		const r = await writeQueryFrontmatter(app as never, file('test.md'), bad as never);
		expect(r.ok).toBe(false);
		expect(r.errors?.length).toBeGreaterThan(0);
		// processFrontMatter must NOT have been called (validate-before-write contract)
		expect(app.fileManager.processFrontMatter).not.toHaveBeenCalled();
	});

	it('overwrites existing crosswalker block (UPDATE path)', async () => {
		const oldBlock = validBlock();
		const app = makeApp({});
		app.fileManager.__frontmatter.set('test.md', { crosswalker_query: oldBlock });
		const newBlock: CrosswalkerQueryFrontmatter = {
			...oldBlock,
			params: { confidence_threshold: 0.9 },
			generated_at: '2026-05-16T10:00:00.000Z',
		};
		const r = await writeQueryFrontmatter(app as never, file('test.md'), newBlock);
		expect(r.ok).toBe(true);
		const final = app.fileManager.__frontmatter.get('test.md')?.crosswalker_query as CrosswalkerQueryFrontmatter;
		expect(final.params).toEqual({ confidence_threshold: 0.9 });
	});
});

// ---------------------------------------------------------------------------
// buildFrontmatter + updateFrontmatterParams (pure helpers)
// ---------------------------------------------------------------------------

describe('buildFrontmatter', () => {
	it('assembles a full frontmatter object from args', () => {
		const out = buildFrontmatter({
			query_id: 'q-2026-05-15-deadbeef',
			recipe: 'r',
			shape: 'pivot',
			params: { x: 1 },
			view_file: '_crosswalker/views/q-2026-05-15-deadbeef.base',
			now: new Date('2026-05-15T20:55:00Z'),
		});
		expect(out.query_id).toBe('q-2026-05-15-deadbeef');
		expect(out.recipe).toBe('r');
		expect(out.shape).toBe('pivot');
		expect(out.params).toEqual({ x: 1 });
		expect(out.generated_at).toBe('2026-05-15T20:55:00.000Z');
		expect(out.schema_version).toBe(1);
	});
});

describe('updateFrontmatterParams', () => {
	it('preserves query_id + view_file; updates params + generated_at', () => {
		const existing = validBlock();
		const updated = updateFrontmatterParams(
			existing,
			{ confidence_threshold: 0.9 },
			{ now: new Date('2026-05-16T10:00:00Z') },
		);
		expect(updated.query_id).toBe(existing.query_id);
		expect(updated.view_file).toBe(existing.view_file);
		expect(updated.recipe).toBe(existing.recipe);
		expect(updated.params).toEqual({ confidence_threshold: 0.9 });
		expect(updated.generated_at).toBe('2026-05-16T10:00:00.000Z');
	});

	it('honors recipeChanged + shapeChanged overrides', () => {
		const existing = validBlock();
		const updated = updateFrontmatterParams(
			existing,
			{ confidence_threshold: 0.7 },
			{ recipeChanged: 'other-recipe', shapeChanged: 'table' },
		);
		expect(updated.recipe).toBe('other-recipe');
		expect(updated.shape).toBe('table');
	});

	it('does not mutate the existing object', () => {
		const existing = validBlock();
		const beforeStr = JSON.stringify(existing);
		updateFrontmatterParams(existing, { x: 1 });
		expect(JSON.stringify(existing)).toBe(beforeStr);
	});
});
