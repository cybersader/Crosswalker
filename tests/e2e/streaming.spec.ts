/**
 * streaming.spec.ts — milestone v0.1.4.5 gate
 *
 * Verifies the bundled engine consumes an AsyncIterable<Row> source without
 * accumulating the full dataset in RAM. End-to-end streaming pipeline test.
 *
 * Uses a synthetic AsyncIterable that yields N rows on demand. The engine
 * must:
 *   1. Iterate via for-await (already refactored)
 *   2. Process each row through render() + write()
 *   3. Never call .length / .slice / [index] on the rows source
 *   4. Produce one Tier 1 file per row
 *
 * Run: bun run e2e
 */

import { browser } from '@wdio/globals';
import { expect } from 'expect';

const TEST_VAULT_DIR = 'Frameworks/v0-1-4-5-streaming-test';

// Recipe — concept-note kind (default), simple folder + file layout
const streamingRecipe = {
	recipe: 'v0-1-4-5-streaming-test',
	source: { ontology: 'cw-stream', levels: ['concept'] },
	target: {
		layout: [
			{
				level: 'concept',
				mechanism: 'file',
				template: '{id}.md',
			},
		],
		also_emit: {
			frontmatter: {
				managed: {
					title: '{title}',
					sequence: '{sequence}',
				},
			},
		},
	},
};

// We materialize 100 rows (small enough to verify; the streaming pattern is
// what's being tested, not raw scale).
const ROW_COUNT = 100;

describe('Crosswalker plugin — v0.1.4.5 streaming refactor', function () {
	this.timeout(120000);

	before(async () => {
		await browser.executeObsidian(async ({ app }, dir) => {
			const folder = app.vault.getAbstractFileByPath(dir);
			if (folder) {
				// @ts-expect-error - internal trash API
				await app.vault.trash(folder, false);
			}
		}, TEST_VAULT_DIR);
		await browser.pause(200);
	});

	it('imports rows from an AsyncIterable<Row> source via runImportFromRecipe', async () => {
		const result = await browser.executeObsidian(
			async ({ app }, args) => {
				// Build an AsyncIterable<Row> in the renderer-side eval context.
				// This mimics what an external producer (ChunkyCSV pipe, etc.)
				// would hand to plugin.runImportFromRecipe — never an array.
				const rowCount = args.rowCount;
				const asyncRows: AsyncIterable<Record<string, any>> = {
					[Symbol.asyncIterator]() {
						let i = 0;
						return {
							async next() {
								if (i >= rowCount) {
									return { done: true, value: undefined as any };
								}
								const row = {
									id: `STREAM-${String(i + 1).padStart(4, '0')}`,
									title: `Streaming concept ${i + 1}`,
									sequence: i + 1,
								};
								i += 1;
								return { done: false, value: row };
							},
						};
					},
				};

				const parsedData = {
					columns: ['id', 'title', 'sequence'],
					rows: asyncRows,
					rowCount: -1, // unknown — streaming
					source: { type: 'csv' as const },
					headerRow: 0,
				};

				// @ts-expect-error - internal plugin lookup
				const plugin = app.plugins.plugins['crosswalker'];
				if (typeof plugin.runImportFromRecipe !== 'function') {
					return { error: 'plugin.runImportFromRecipe not exposed' };
				}

				return plugin.runImportFromRecipe(parsedData, args.recipe, args.options);
			},
			{
				rowCount: ROW_COUNT,
				recipe: streamingRecipe,
				options: {
					basePath: TEST_VAULT_DIR,
					overwriteMode: 'replace',
					createFolders: true,
					strictValidation: true,
					sourceFileName: 'streaming-test-async-iter',
				},
			},
		);

		if ((result as { error?: string }).error) {
			throw new Error(`v0.1.4.5 streaming path not yet exposed: ${(result as { error: string }).error}`);
		}

		expect(result.success).toBe(true);
		expect(result.created.length).toBe(ROW_COUNT);
		expect(result.errors.length).toBe(0);
	});

	it('produces correct Tier 1 files at expected paths', async () => {
		const filesFound = await browser.executeObsidian(({ app }, dir) => {
			const matches = app.vault
				.getMarkdownFiles()
				.filter((f) => f.path.startsWith(dir + '/'))
				.map((f) => f.path)
				.sort();
			return {
				count: matches.length,
				first: matches[0],
				last: matches[matches.length - 1],
			};
		}, TEST_VAULT_DIR);

		expect(filesFound.count).toBe(ROW_COUNT);
		expect(filesFound.first).toContain('STREAM-0001');
		expect(filesFound.last).toContain(`STREAM-0${ROW_COUNT.toString().padStart(3, '0')}`);
	});

	it('emits correct frontmatter for a streamed row', async () => {
		const fm = await browser.executeObsidian(({ app }, dir) => {
			const file = app.vault
				.getMarkdownFiles()
				.find((f) => f.path.startsWith(dir + '/') && f.path.includes('STREAM-0042'));
			if (!file) return null;
			// @ts-expect-error - getFileCache
			return app.metadataCache.getFileCache(file)?.frontmatter ?? null;
		}, TEST_VAULT_DIR);

		expect(fm).toBeTruthy();
		expect(fm.curie).toBe('cw-stream:STREAM-0042');
		expect(fm.title).toBe('Streaming concept 42');
		expect(String(fm.sequence)).toBe('42');
		expect(fm._crosswalker.spec_version).toBe('https://crosswalker.dev/spec/tier1.schema.json');
	});

	it('eager-array form still works (backwards compatibility)', async () => {
		const dirEager = TEST_VAULT_DIR + '/eager-compat';
		const result = await browser.executeObsidian(
			async ({ app }, args) => {
				const eagerRows = [
					{ id: 'EAGER-1', title: 'Eager 1', sequence: 1 },
					{ id: 'EAGER-2', title: 'Eager 2', sequence: 2 },
					{ id: 'EAGER-3', title: 'Eager 3', sequence: 3 },
				];
				const parsedData = {
					columns: ['id', 'title', 'sequence'],
					rows: eagerRows, // plain array — pre-streaming-refactor shape
					rowCount: eagerRows.length,
					source: { type: 'csv' as const },
					headerRow: 0,
				};
				// @ts-expect-error - internal plugin lookup
				const plugin = app.plugins.plugins['crosswalker'];
				return plugin.runImportFromRecipe(parsedData, args.recipe, args.options);
			},
			{
				recipe: streamingRecipe,
				options: {
					basePath: dirEager,
					overwriteMode: 'replace',
					createFolders: true,
					strictValidation: true,
				},
			},
		);

		expect(result.success).toBe(true);
		expect(result.created.length).toBe(3);
	});
});
