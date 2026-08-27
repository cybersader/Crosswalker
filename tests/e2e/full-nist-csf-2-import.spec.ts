/**
 * full-nist-csf-2-import.spec.ts — opt-in corpus proof for the rewritten
 * NIST CSF 2.0 flat recipe.
 *
 * Modelled on full-nist-800-53-import.spec.ts. Imports the tracked public
 * `Frameworks/csf2.xlsx` workbook through the same bundled-recipe path the
 * recognized-source wizard uses, and proves every generated note carries a
 * non-empty body containing its own source prose.
 *
 * ROW PREFILTER — deliberate, and a finding in its own right. The `CSF 2.0`
 * sheet is a merged-cell banner layout: 231 rows, of which only 185 carry a
 * `Subcategory` value. The recipe grammar has no row predicate, so the 46
 * banner rows render to the empty filename `.md` and collide. This spec feeds
 * the recipe the 185 subcategory rows, which is exactly what a real operator
 * must do until the grammar can express a row filter.
 *
 * Run only when explicitly requested:
 *   CW_SCALE=1 DISPLAY=:0 bun run e2e -- --spec tests/e2e/full-nist-csf-2-import.spec.ts
 */

import { browser } from '@wdio/globals';
import { expect } from 'expect';
import { mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import * as XLSX from 'xlsx';
import { readFrontmatterFromDisk, requireFrontmatterIndexed } from './helpers/vault-readiness';

const RUN_SCALE = process.env.CW_SCALE === '1';
const describeScale = RUN_SCALE ? describe : describe.skip;

const CORPUS_PATH = path.resolve(__dirname, '..', '..', 'Frameworks', 'csf2.xlsx');
const RECIPE_PATH = path.resolve(__dirname, '..', '..', 'recipes', 'import', 'nist-csf-2.json');
const SOURCE_FILE_NAME = 'csf2.xlsx';
const SHEET = 'CSF 2.0';
const HEADER_ROW = 1;
const DESTINATION = 'Frameworks/full-nist-csf-2-scale';
const EXPECTED_SHEET_ROWS = 231;
const EXPECTED_RECORD_COUNT = 185;
const ONTOLOGY = 'nist-csf-2';
const CURIE_PATTERN = /^[a-z][a-z0-9_-]*:[A-Za-z0-9._\-()/]+$/;
const SCREENSHOT_DIR = path.resolve(__dirname, '..', '..', 'test-screenshots');

/** Mirror src/import/parsers/xlsx-parser.ts exactly: normKey + raw:false + defval:''. */
const normKey = (key: string): string => key.replace(/\s+/g, ' ').trim();

function loadCorpus(): { columns: string[]; all: Record<string, string>[]; rows: Record<string, string>[] } {
	const workbook = XLSX.read(readFileSync(CORPUS_PATH), { type: 'buffer' });
	const sheet = workbook.Sheets[SHEET];
	if (!sheet) throw new Error(`sheet "${SHEET}" missing; workbook has: ${workbook.SheetNames.join(', ')}`);
	const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
		range: HEADER_ROW, defval: '', blankrows: false, raw: false,
	});
	const all = raw.map((record) => {
		const row: Record<string, string> = {};
		for (const [key, value] of Object.entries(record)) {
			row[normKey(key)] = value === null || value === undefined ? '' : String(value).trim();
		}
		return row;
	});
	const columns: string[] = [];
	const seen = new Set<string>();
	for (const row of all) for (const key of Object.keys(row)) if (!seen.has(key)) { seen.add(key); columns.push(key); }
	return { columns, all, rows: all.filter((row) => (row['Subcategory'] ?? '').trim() !== '') };
}

function metric(name: string, value: number | string): void {
	console.log(`CW_SCALE_METRIC ${name}=${value}`);
}

async function timed<T>(name: string, operation: () => Promise<T>): Promise<T> {
	const started = Date.now();
	const result = await operation();
	metric(name, Date.now() - started);
	return result;
}

describeScale('Crosswalker plugin — NIST CSF 2.0 flat recipe corpus proof', function () {
	this.timeout(10 * 60_000);

	it('imports all 185 subcategories and proves every note body carries its source outcome statement', async () => {
		const specStarted = Date.now();
		mkdirSync(SCREENSHOT_DIR, { recursive: true });

		const corpus = loadCorpus();
		const recipe = JSON.parse(readFileSync(RECIPE_PATH, 'utf8'));
		expect(corpus.all.length).toBe(EXPECTED_SHEET_ROWS);
		expect(corpus.rows.length).toBe(EXPECTED_RECORD_COUNT);
		expect(recipe.recipe).toBe('nist-csf-2-flat');
		expect(recipe.source.ontology).toBe(ONTOLOGY);
		metric('sheet_row_count', corpus.all.length);
		metric('banner_rows_excluded_by_prefilter', corpus.all.length - corpus.rows.length);
		metric('parsed_record_count', corpus.rows.length);

		const cleanup = await browser.executeObsidian(async ({ app }, destinationRoot) => {
			const root = app.vault.getAbstractFileByPath(destinationRoot);
			if (root) {
				// @ts-expect-error - internal trash API, isolated E2E vault only
				await app.vault.trash(root, false);
			}
			const deadline = Date.now() + 20_000;
			while (app.vault.getAbstractFileByPath(destinationRoot) && Date.now() < deadline) {
				await new Promise((resolve) => setTimeout(resolve, 50));
			}
			return !app.vault.getAbstractFileByPath(destinationRoot);
		}, 'Frameworks');
		expect(cleanup).toBe(true);

		// Mirrors ImportWizard.buildWorkbenchConfig() + recipeOverride, exactly as
		// the NIST 800-53 scale proof does: the bundled recipe controls paths and
		// frontmatter; the leaf template controls the stable CURIE stem.
		const config = {
			name: 'shape-workbench',
			mapping: {
				hierarchy: [], frontmatter: [], links: [], body: [],
				filename: { template: '{Subcategory|split(:,0)|fs-safe}.md', sanitize: true },
			},
		};
		const parsedData = {
			columns: corpus.columns,
			rows: corpus.rows,
			rowCount: corpus.rows.length,
			source: { type: 'xlsx' as const },
			headerRow: HEADER_ROW,
		};

		const generation = await timed('generation_wall_ms', () => browser.executeObsidian(
			async ({ app }, args) => {
				// @ts-expect-error - Crosswalker E2E API
				const plugin = app.plugins.plugins['crosswalker'];
				return plugin.runImport(args.parsedData, args.config, {
					basePath: args.destination,
					overwriteMode: 'replace',
					createFolders: true,
					strictValidation: true,
					sourceFileName: args.sourceFileName,
					recipeOverride: args.recipe,
				});
			},
			{ parsedData, config, destination: DESTINATION, sourceFileName: SOURCE_FILE_NAME, recipe },
		));
		expect(generation.success).toBe(true);
		expect(generation.errors).toEqual([]);
		expect(generation.created.length).toBe(EXPECTED_RECORD_COUNT);
		metric('generated_note_count', generation.created.length);
		metric('generation_engine_duration_ms', generation.duration);

		const indexed = await requireFrontmatterIndexed({
			pathPrefixes: DESTINATION,
			expectedCount: EXPECTED_RECORD_COUNT,
			requireKeys: ['curie', '_crosswalker'],
			timeoutMs: 120_000,
			pollMs: 100,
		});
		metric('metadata_index_settle_ms', indexed.waitedMs);

		const sample = await readFrontmatterFromDisk(`${DESTINATION}/GV.OC-01.md`) as Record<string, any> | null;
		expect(sample).toBeTruthy();
		expect(sample!.curie).toMatch(CURIE_PATTERN);
		expect(sample!.subcategory_id).toBe('GV.OC-01');
		expect(sample!.function).toBe('GV');
		expect(sample!.category).toBe('GV.OC');
		expect(sample!._crosswalker.recipe.id).toBe('nist-csf-2-flat');
		expect(sample!._crosswalker.source_ref.file).toBe(SOURCE_FILE_NAME);
		// description was deliberately NOT carried as a property in this rewrite.
		expect(sample!.description).toBeUndefined();

		const bodyProof = await browser.executeObsidian(async ({ app, obsidian }, args) => {
			const stripFrontmatter = (markdown: string): string => {
				const normalized = markdown.replace(/\r\n/g, '\n');
				if (!normalized.startsWith('---\n')) return normalized.trim();
				const closing = normalized.indexOf('\n---\n', 4);
				return closing < 0 ? normalized.trim() : normalized.slice(closing + 5).trim();
			};
			const missingFiles: string[] = [];
			const emptyBodies: string[] = [];
			const missingOutcomeProse: string[] = [];
			const missingOutcomeHeading: string[] = [];
			const firstLines: Record<string, number> = {};
			const wordCounts: number[] = [];
			let exampleNoteBody = '';
			let notesWithExamples = 0;

			for (const row of args.rows) {
				const id = row['Subcategory'].split(':')[0];
				const notePath = `${args.destination}/${id}.md`;
				const file = app.vault.getAbstractFileByPath(notePath);
				if (!file || !(file instanceof obsidian.TFile)) { missingFiles.push(notePath); continue; }
				const body = stripFrontmatter(await app.vault.read(file));
				if (body.length === 0) emptyBodies.push(notePath);
				if (!body.includes(row['Subcategory'].trim())) missingOutcomeProse.push(notePath);
				if (!body.includes('## Outcome')) missingOutcomeHeading.push(notePath);
				const marker = body.split('\n')[0].replace(/[^#\s].*$/, '').trim() || body.split('\n')[0].slice(0, 12);
				firstLines[marker] = (firstLines[marker] ?? 0) + 1;
				if (body.includes('## Implementation examples')) notesWithExamples++;
				wordCounts.push(body.match(/\S+/g)?.length ?? 0);
				if (id === 'GV.OC-01') exampleNoteBody = body;
			}
			const sum = (values: number[]): number => values.reduce((total, value) => total + value, 0);
			return {
				missingFiles, emptyBodies, missingOutcomeProse, missingOutcomeHeading,
				firstLineMarkers: firstLines,
				exampleFirstLine: exampleNoteBody.split('\n')[0],
				notesWithExamples,
				wordCountAverage: sum(wordCounts) / wordCounts.length,
				wordCountMin: Math.min(...wordCounts),
				wordCountMax: Math.max(...wordCounts),
			};
		}, { rows: corpus.rows, destination: DESTINATION });

		expect(bodyProof.missingFiles).toEqual([]);
		expect(bodyProof.emptyBodies).toEqual([]);
		expect(bodyProof.missingOutcomeProse).toEqual([]);
		expect(bodyProof.missingOutcomeHeading).toEqual([]);
		metric('body_words_per_note_average', bodyProof.wordCountAverage.toFixed(2));
		metric('body_words_per_note_min', bodyProof.wordCountMin);
		metric('body_words_per_note_max', bodyProof.wordCountMax);
		metric('notes_with_implementation_examples', bodyProof.notesWithExamples);
		// Observational, NOT asserted: records what the engine puts on body line 1.
		metric('body_first_line_markers', JSON.stringify(bodyProof.firstLineMarkers));
		metric('body_first_line_sample', JSON.stringify(bodyProof.exampleFirstLine));

		metric('total_spec_ms', Date.now() - specStarted);
	});

	// Visual capture is a SEPARATE test on purpose: a chromedriver renderer
	// stall while screenshotting must not invalidate the corpus proof above.
	// Staged deliberately — a stall on one stage still yields evidence from the
	// earlier ones, and tells us WHICH stage wedges the renderer.
	it('captures a representative generated note', async () => {
		const shot = async (stage: string, name: string): Promise<void> => {
			try {
				await browser.saveScreenshot(path.join(SCREENSHOT_DIR, name));
				metric(`capture_${stage}`, 'ok');
			} catch (error) {
				metric(`capture_${stage}`, `FAILED:${error instanceof Error ? error.message.slice(0, 60) : 'unknown'}`);
			}
		};

		// Stage A — vault state only, no file opened.
		await browser.pause(1500);
		await shot('a_vault_only', 'csf-body-stage-a-vault.png');

		// Stage B — note open in SOURCE mode (no markdown rendering).
		await browser.executeObsidian(async ({ app, obsidian }, notePath) => {
			const file = app.vault.getAbstractFileByPath(notePath);
			if (!file || !(file instanceof obsidian.TFile)) throw new Error(`missing note ${notePath}`);
			await app.workspace.getLeaf(false).openFile(file, { state: { mode: 'source' }, active: true });
		}, `${DESTINATION}/GV.OC-01.md`);
		await browser.pause(2000);
		await shot('b_source_mode', 'csf-body-stage-b-source.png');

		// Stage C — same note in PREVIEW mode (full markdown render).
		await browser.executeObsidian(async ({ app, obsidian }, notePath) => {
			const file = app.vault.getAbstractFileByPath(notePath);
			if (!file || !(file instanceof obsidian.TFile)) throw new Error(`missing note ${notePath}`);
			await app.workspace.getLeaf(false).openFile(file, { state: { mode: 'preview' }, active: true });
		}, `${DESTINATION}/GV.OC-01.md`);
		await browser.pause(3000);
		await shot('c_preview_mode', 'csf-body-gv-oc-01.png');
	});
});
