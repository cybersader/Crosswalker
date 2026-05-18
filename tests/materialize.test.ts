/**
 * materialize.test.ts — Phase 5 materialization writer tests.
 */

import { materializeQuery, lookupQuery, markStale } from '../src/views/materialize';
import { TFile, Vault, FileManager } from 'obsidian';
import type { CrosswalkerQueryFrontmatter } from '../src/views/query-frontmatter-schema';

function makeApp(metadata: Record<string, Record<string, unknown> | undefined> = {}) {
	const vault: any = new Vault();
	const written = new Map<string, string>();
	const folders = new Set<string>();
	vault.__written = written;
	vault.__folders = folders;

	vault.getAbstractFileByPath = jest.fn((path: string) => {
		if (folders.has(path)) return { path, children: [] };
		if (written.has(path)) {
			const t = new TFile(path);
			(t as any).extension = path.split('.').pop();
			return t;
		}
		return null;
	});
	vault.create = jest.fn(async (path: string, content: string) => {
		written.set(path, content);
		const t = new TFile(path);
		(t as any).extension = path.split('.').pop();
		return t;
	});
	vault.modify = jest.fn(async (f: TFile, content: string) => {
		written.set(f.path, content);
	});
	vault.createFolder = jest.fn(async (path: string) => {
		folders.add(path);
	});
	vault.read = jest.fn(async (f: TFile) => written.get(f.path) ?? '');
	vault.delete = jest.fn(async (f: TFile) => {
		written.delete(f.path);
	});

	return {
		vault,
		fileManager: new FileManager(),
		metadataCache: {
			getFileCache: jest.fn((file: TFile) => {
				const fm = metadata[file.path];
				return fm ? { frontmatter: fm } : null;
			}),
		},
	};
}

function validFm(slug = 'test-slug'): CrosswalkerQueryFrontmatter {
	return {
		query_id: 'q-2026-05-15-aaaaaaaa',
		slug,
		recipe: 'nist-csf-coverage-matrix',
		shape: 'pivot',
		params: { confidence_threshold: 0.7 },
		view_file: `_crosswalker/queries/${slug}/view.base`,
		generated_at: '2026-05-15T20:55:00.000Z',
		schema_version: 2,
	};
}

describe('materializeQuery', () => {
	it('writes result.json at <slug>/materialized/', async () => {
		const app = makeApp();
		const r = await materializeQuery(app as never, {
			slug: 'test',
			queryId: 'q-2026-05-15-aaaaaaaa',
			recipe: 'r',
			shape: 'pivot',
			data: { rows: ['a', 'b'], cells: [[1, 2]] },
		});
		expect(r.ok).toBe(true);
		expect(r.resultPath).toBe('_crosswalker/queries/test/materialized/result.json');
		expect(app.vault.__written.has(r.resultPath)).toBe(true);
		expect(r.bytesWritten).toBeGreaterThan(0);
	});

	it('serializes JSON with stable key order (git-diff friendly)', async () => {
		const app = makeApp();
		const r = await materializeQuery(app as never, {
			slug: 't',
			queryId: 'q-2026-05-15-aaaaaaaa',
			recipe: 'r',
			shape: 'pivot',
			data: { z: 1, a: 2, m: 3 },
		});
		const content = app.vault.__written.get(r.resultPath)!;
		const dataIdx = content.indexOf('"data"');
		const slice = content.slice(dataIdx);
		// Keys inside data should appear alphabetically: a, m, z
		expect(slice.indexOf('"a"')).toBeLessThan(slice.indexOf('"m"'));
		expect(slice.indexOf('"m"')).toBeLessThan(slice.indexOf('"z"'));
	});

	it('overwrites existing result.json idempotently', async () => {
		const app = makeApp();
		await materializeQuery(app as never, {
			slug: 'idemp',
			queryId: 'q-2026-05-15-aaaaaaaa',
			recipe: 'r',
			shape: 'pivot',
			data: { v: 1 },
		});
		await materializeQuery(app as never, {
			slug: 'idemp',
			queryId: 'q-2026-05-15-aaaaaaaa',
			recipe: 'r',
			shape: 'pivot',
			data: { v: 2 },
		});
		const content = app.vault.__written.get('_crosswalker/queries/idemp/materialized/result.json')!;
		expect(content).toContain('"v": 2');
		expect(content).not.toContain('"v": 1');
	});

	it('includes metadata payload', async () => {
		const app = makeApp();
		const r = await materializeQuery(app as never, {
			slug: 'with-meta',
			queryId: 'q-2026-05-15-aaaaaaaa',
			recipe: 'r',
			shape: 'pivot',
			data: {},
			metadata: { source_hash: 'abc123', row_count: 42 },
		});
		const content = app.vault.__written.get(r.resultPath)!;
		expect(content).toContain('"source_hash": "abc123"');
		expect(content).toContain('"row_count": 42');
	});
});

describe('markStale', () => {
	it('writes a stale.flag when materialized folder exists', async () => {
		const app = makeApp();
		// Pre-populate the folder
		app.vault.__folders.add('_crosswalker/queries/s/materialized');
		await markStale(app as never, 's');
		expect(app.vault.__written.has('_crosswalker/queries/s/materialized/stale.flag')).toBe(true);
	});

	it('is a no-op when materialized folder does not exist', async () => {
		const app = makeApp();
		await markStale(app as never, 'never-materialized');
		expect(app.vault.__written.has('_crosswalker/queries/never-materialized/materialized/stale.flag')).toBe(false);
	});
});

describe('lookupQuery', () => {
	it('returns recipe + params from canonical index.md', async () => {
		const fm = validFm('lookup-test');
		const app = makeApp({
			'_crosswalker/queries/lookup-test/index.md': { crosswalker_query: fm },
		});
		app.vault.__written.set('_crosswalker/queries/lookup-test/index.md', 'placeholder');
		const r = await lookupQuery(app as never, 'lookup-test');
		expect(r).toEqual({
			queryId: 'q-2026-05-15-aaaaaaaa',
			recipe: 'nist-csf-coverage-matrix',
			shape: 'pivot',
			params: { confidence_threshold: 0.7 },
		});
	});

	it('returns null when no canonical index.md exists', async () => {
		const app = makeApp();
		const r = await lookupQuery(app as never, 'missing');
		expect(r).toBeNull();
	});
});
