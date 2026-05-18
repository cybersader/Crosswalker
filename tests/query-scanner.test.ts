/**
 * query-scanner.test.ts — Phase 4.7 unit tests for the pure read function
 * that powers Embed + Browse pickers.
 */

import { scanQueries, formatParamsSummary } from '../src/views/query-scanner';
import { FileManager, TFile, Vault } from 'obsidian';
import type { CrosswalkerQueryFrontmatter } from '../src/views/query-frontmatter-schema';

function makeApp(opts: {
	markdownFiles: TFile[];
	frontmatter: Record<string, Record<string, unknown> | undefined>;
}) {
	const vault: any = new Vault();
	vault.getMarkdownFiles = jest.fn(() => opts.markdownFiles);
	return {
		vault,
		fileManager: new FileManager(),
		metadataCache: {
			getFileCache: jest.fn((file: TFile) => {
				const fm = opts.frontmatter[file.path];
				return fm ? { frontmatter: fm } : null;
			}),
		},
	};
}

function makeFm(slug: string, queryId: string, generatedAt: string): CrosswalkerQueryFrontmatter {
	return {
		query_id: queryId,
		slug,
		recipe: 'nist-csf-coverage-matrix',
		shape: 'pivot',
		params: { confidence_threshold: 0.7 },
		view_file: `_crosswalker/queries/${slug}/view.base`,
		generated_at: generatedAt,
		schema_version: 2,
	};
}

describe('scanQueries', () => {
	it('returns empty list when no canonical queries exist', async () => {
		const app = makeApp({ markdownFiles: [new TFile('plain.md')], frontmatter: {} });
		const entries = await scanQueries(app as never);
		expect(entries).toEqual([]);
	});

	it('finds canonical queries under _crosswalker/queries/<slug>/index.md', async () => {
		const fmA = makeFm('coverage-a', 'q-2026-05-15-aaaaaaaa', '2026-05-15T10:00:00.000Z');
		const fmB = makeFm('coverage-b', 'q-2026-05-15-bbbbbbbb', '2026-05-15T12:00:00.000Z');
		const app = makeApp({
			markdownFiles: [
				new TFile('_crosswalker/queries/coverage-a/index.md'),
				new TFile('_crosswalker/queries/coverage-b/index.md'),
			],
			frontmatter: {
				'_crosswalker/queries/coverage-a/index.md': { crosswalker_query: fmA },
				'_crosswalker/queries/coverage-b/index.md': { crosswalker_query: fmB },
			},
		});
		const entries = await scanQueries(app as never);
		expect(entries.length).toBe(2);
		expect(entries.map((e) => e.slug).sort()).toEqual(['coverage-a', 'coverage-b']);
	});

	it('sorts entries by generatedAt DESC (most recent first)', async () => {
		const older = makeFm('older', 'q-2026-05-15-11111111', '2026-05-15T10:00:00.000Z');
		const newer = makeFm('newer', 'q-2026-05-15-22222222', '2026-05-15T20:00:00.000Z');
		const app = makeApp({
			markdownFiles: [
				new TFile('_crosswalker/queries/older/index.md'),
				new TFile('_crosswalker/queries/newer/index.md'),
			],
			frontmatter: {
				'_crosswalker/queries/older/index.md': { crosswalker_query: older },
				'_crosswalker/queries/newer/index.md': { crosswalker_query: newer },
			},
		});
		const entries = await scanQueries(app as never);
		expect(entries[0].slug).toBe('newer');
		expect(entries[1].slug).toBe('older');
	});

	it('ignores host notes with crosswalker_query: frontmatter (only canonical paths count)', async () => {
		const fm = makeFm('coverage', 'q-2026-05-15-deadbeef', '2026-05-15T10:00:00.000Z');
		const app = makeApp({
			markdownFiles: [
				new TFile('My Host Note.md'), // NOT canonical
				new TFile('_crosswalker/queries/coverage/index.md'),
			],
			frontmatter: {
				'My Host Note.md': { crosswalker_query: fm }, // legacy/stray frontmatter
				'_crosswalker/queries/coverage/index.md': { crosswalker_query: fm },
			},
		});
		const entries = await scanQueries(app as never);
		expect(entries.length).toBe(1);
		expect(entries[0].indexFile).toBe('_crosswalker/queries/coverage/index.md');
	});

	it('ignores canonical paths with malformed frontmatter', async () => {
		const app = makeApp({
			markdownFiles: [new TFile('_crosswalker/queries/bad/index.md')],
			frontmatter: {
				'_crosswalker/queries/bad/index.md': { crosswalker_query: { recipe: 'incomplete' } },
			},
		});
		const entries = await scanQueries(app as never);
		expect(entries).toEqual([]);
	});

	it('includes full metadata in each entry', async () => {
		const fm = makeFm('test', 'q-2026-05-15-deadbeef', '2026-05-15T10:00:00.000Z');
		const app = makeApp({
			markdownFiles: [new TFile('_crosswalker/queries/test/index.md')],
			frontmatter: { '_crosswalker/queries/test/index.md': { crosswalker_query: fm } },
		});
		const entries = await scanQueries(app as never);
		expect(entries[0]).toEqual({
			slug: 'test',
			queryId: 'q-2026-05-15-deadbeef',
			recipe: 'nist-csf-coverage-matrix',
			shape: 'pivot',
			params: { confidence_threshold: 0.7 },
			viewFile: '_crosswalker/queries/test/view.base',
			indexFile: '_crosswalker/queries/test/index.md',
			generatedAt: '2026-05-15T10:00:00.000Z',
		});
	});
});

describe('formatParamsSummary', () => {
	it('returns "(no params)" for empty object', () => {
		expect(formatParamsSummary({})).toBe('(no params)');
	});

	it('formats string params as key="value"', () => {
		expect(formatParamsSummary({ ontology: 'nist-csf' })).toBe('ontology="nist-csf"');
	});

	it('formats number params as key=value', () => {
		expect(formatParamsSummary({ confidence: 0.7 })).toBe('confidence=0.7');
	});

	it('formats boolean params as key=true/false', () => {
		expect(formatParamsSummary({ heatmap: true, sparse: false })).toBe('heatmap=true, sparse=false');
	});

	it('formats array params as key=[N]', () => {
		expect(formatParamsSummary({ ontologies: ['a', 'b', 'c'] })).toBe('ontologies=[3]');
	});

	it('joins multiple params with comma', () => {
		expect(formatParamsSummary({ a: 1, b: 'x' })).toMatch(/^a=1, b="x"$|^b="x", a=1$/);
	});
});
