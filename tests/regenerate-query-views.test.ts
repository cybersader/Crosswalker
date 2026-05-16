/**
 * regenerate-query-views.test.ts — Phase 4.5 unit tests for the
 * regenerator that scans the vault for notes with crosswalker frontmatter
 * and refreshes their .base files. Tests idempotency (skip when content
 * matches) + new-file creation + malformed-frontmatter handling.
 */

import { regenerateAll, regenerateOne, yamlBodyMatches } from '../src/views/regenerate-query-views';
import { FileManager, TFile, Vault } from 'obsidian';
import type { CrosswalkerQueryFrontmatter } from '../src/views/query-frontmatter-schema';

function makeApp(opts: {
	markdownFiles?: TFile[];
	frontmatter?: Record<string, Record<string, unknown> | undefined>;
	existingBaseFiles?: Record<string, string>;
} = {}) {
	const vault: any = new Vault();
	const written = new Map<string, string>(Object.entries(opts.existingBaseFiles ?? {}));
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
		return new TFile(path);
	});
	vault.modify = jest.fn(async (f: TFile, content: string) => {
		written.set(f.path, content);
	});
	vault.createFolder = jest.fn(async (path: string) => {
		folders.add(path);
	});
	vault.read = jest.fn(async (f: TFile) => written.get(f.path) ?? '');
	vault.getMarkdownFiles = jest.fn(() => opts.markdownFiles ?? []);

	return {
		vault,
		fileManager: new FileManager(),
		metadataCache: {
			getFileCache: jest.fn((file: TFile) => {
				const fm = opts.frontmatter?.[file.path];
				return fm ? { frontmatter: fm } : null;
			}),
		},
	};
}

function validFm(queryId = 'q-2026-05-15-deadbeef'): CrosswalkerQueryFrontmatter {
	return {
		query_id: queryId,
		recipe: 'nist-csf-coverage-matrix',
		shape: 'pivot',
		params: { confidence_threshold: 0.7 },
		view_file: `_crosswalker/views/${queryId}.base`,
		generated_at: '2026-05-15T20:55:00.000Z',
		schema_version: 1,
	};
}

// ---------------------------------------------------------------------------
// yamlBodyMatches — pure helper
// ---------------------------------------------------------------------------

describe('yamlBodyMatches', () => {
	it('treats identical body as match (ignoring header comments)', () => {
		const a = '# Auto-generated 2026-05-15\n# Recipe: r\n\nfilters: []\nviews: []';
		const b = '# Auto-generated 2026-05-16\n# Recipe: r\n\nfilters: []\nviews: []';
		expect(yamlBodyMatches(a, b)).toBe(true);
	});

	it('treats different body as mismatch', () => {
		const a = '# header\n\nfilters: []\nviews: []';
		const b = '# header\n\nfilters: [bar]\nviews: []';
		expect(yamlBodyMatches(a, b)).toBe(false);
	});

	it('handles content with no header comments', () => {
		expect(yamlBodyMatches('filters: []', 'filters: []')).toBe(true);
		expect(yamlBodyMatches('filters: []', 'filters: [bar]')).toBe(false);
	});
});

// ---------------------------------------------------------------------------
// regenerateOne
// ---------------------------------------------------------------------------

describe('regenerateOne', () => {
	it('returns not-applicable when file has no crosswalker block', async () => {
		const app = makeApp({ frontmatter: { 'plain.md': { title: 'no query here' } } });
		const file = new TFile('plain.md');
		const r = await regenerateOne(app as never, file);
		expect(r).toBe('not-applicable');
	});

	it('returns regenerated when .base file is missing', async () => {
		const fm = validFm();
		const app = makeApp({ frontmatter: { 'q.md': { crosswalker_query: fm } } });
		const file = new TFile('q.md');
		const r = await regenerateOne(app as never, file);
		expect(r).toBe('regenerated');
		expect(app.vault.__written.has(fm.view_file)).toBe(true);
	});

	it('returns skipped when .base content matches (idempotent)', async () => {
		const fm = validFm();
		const app = makeApp({ frontmatter: { 'q.md': { crosswalker_query: fm } } });
		const file = new TFile('q.md');
		// First call: regenerate
		await regenerateOne(app as never, file);
		expect(app.vault.__written.has(fm.view_file)).toBe(true);

		// Second call: should skip (content unchanged)
		const r2 = await regenerateOne(app as never, file);
		expect(r2).toBe('skipped');
	});

	it('returns regenerated when frontmatter params change between runs', async () => {
		const fm = validFm();
		const app = makeApp({ frontmatter: { 'q.md': { crosswalker_query: fm } } });
		const file = new TFile('q.md');
		await regenerateOne(app as never, file);

		// Mutate frontmatter (simulates user hand-edit)
		(app.metadataCache.getFileCache as jest.Mock).mockImplementation(() => ({
			frontmatter: { crosswalker_query: { ...fm, params: { confidence_threshold: 0.9 } } },
		}));
		const r = await regenerateOne(app as never, file);
		expect(r).toBe('regenerated');
	});

	it('returns error string when frontmatter is malformed', async () => {
		const app = makeApp({
			frontmatter: { 'q.md': { crosswalker_query: { recipe: 'incomplete' } } },
		});
		const file = new TFile('q.md');
		const r = await regenerateOne(app as never, file);
		expect(typeof r).toBe('string');
		expect(r).toMatch(/[Mm]alformed|invalid|required/);
	});

	it('returns error string when recipe has no template', async () => {
		const fm: CrosswalkerQueryFrontmatter = {
			...validFm(),
			recipe: 'recipe-with-no-template',
		};
		const app = makeApp({ frontmatter: { 'q.md': { crosswalker_query: fm } } });
		const file = new TFile('q.md');
		const r = await regenerateOne(app as never, file);
		expect(typeof r).toBe('string');
		expect(r).toMatch(/[Nn]o template/);
	});
});

// ---------------------------------------------------------------------------
// regenerateAll
// ---------------------------------------------------------------------------

describe('regenerateAll', () => {
	it('scans every markdown file + aggregates counts', async () => {
		const fmA = validFm('q-2026-05-15-aaaaaaaa');
		const fmB = validFm('q-2026-05-15-bbbbbbbb');
		const app = makeApp({
			markdownFiles: [new TFile('a.md'), new TFile('b.md'), new TFile('c.md')],
			frontmatter: {
				'a.md': { crosswalker_query: fmA },
				'b.md': { crosswalker_query: fmB },
				// c.md: no crosswalker block → not-applicable
			},
		});
		const result = await regenerateAll(app as never);
		expect(result.scanned).toBe(3);
		expect(result.regenerated).toBe(2);
		expect(result.skipped).toBe(0);
		expect(result.errors).toEqual([]);
	});

	it('counts errors when frontmatter is malformed', async () => {
		const app = makeApp({
			markdownFiles: [new TFile('bad.md')],
			frontmatter: { 'bad.md': { crosswalker_query: { recipe: 'incomplete' } } },
		});
		const result = await regenerateAll(app as never);
		expect(result.errors.length).toBe(1);
		expect(result.errors[0].note).toBe('bad.md');
	});

	it('returns zero counts when no notes have crosswalker frontmatter', async () => {
		const app = makeApp({
			markdownFiles: [new TFile('a.md'), new TFile('b.md')],
			frontmatter: {},
		});
		const result = await regenerateAll(app as never);
		expect(result.scanned).toBe(2);
		expect(result.regenerated).toBe(0);
		expect(result.errors).toEqual([]);
	});
});
