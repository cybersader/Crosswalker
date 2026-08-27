/**
 * full-mitre-attack-import.spec.ts — opt-in corpus proof for the retargeted
 * MITRE ATT&CK technique recipe.
 *
 * Modelled on full-nist-800-53-import.spec.ts. Imports the tracked public
 * `Frameworks/enterprise-attack-v16.1.xlsx` `techniques` sheet through the
 * same bundled-recipe path the recognized-source wizard uses, and proves every
 * generated note carries a non-empty body containing its own source
 * description.
 *
 * This spec also exists to ratify a SOURCE RETARGET: the previous recipe bound
 * to a STIX bundle shape ({external_references.0.external_id}, {id}). No STIX
 * bundle is tracked, and the rewritten recipe binds to the xlsx sheet instead.
 *
 * No row prefilter is needed here — every row on the sheet is a technique.
 *
 * RIGHTS: ATT&CK content is reproduced under the MITRE terms of use. The
 * recipe appends the required copyright notice to every generated note, and
 * this spec asserts that notice is present on all of them.
 *
 * Run only when explicitly requested:
 *   CW_SCALE=1 DISPLAY=:0 bun run e2e -- --spec tests/e2e/full-mitre-attack-import.spec.ts
 */

import { browser } from '@wdio/globals';
import { expect } from 'expect';
import { mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import * as XLSX from 'xlsx';
import { readFrontmatterFromDisk, requireFrontmatterIndexed } from './helpers/vault-readiness';

const RUN_SCALE = process.env.CW_SCALE === '1';
const describeScale = RUN_SCALE ? describe : describe.skip;

const CORPUS_PATH = path.resolve(__dirname, '..', '..', 'Frameworks', 'enterprise-attack-v16.1.xlsx');
const RECIPE_PATH = path.resolve(__dirname, '..', '..', 'recipes', 'import', 'mitre-attack-technique.json');
const SOURCE_FILE_NAME = 'enterprise-attack-v16.1.xlsx';
const SHEET = 'techniques';
const DESTINATION = 'Frameworks/full-mitre-attack-scale';
const EXPECTED_RECORD_COUNT = 656;
const ONTOLOGY = 'mitre-attack';
const CURIE_PATTERN = /^[a-z][a-z0-9_-]*:[A-Za-z0-9._\-()/]+$/;
const SCREENSHOT_DIR = path.resolve(__dirname, '..', '..', 'test-screenshots');
const MITRE_NOTICE = '© 2026 The MITRE Corporation.';

/** Mirror src/import/parsers/xlsx-parser.ts exactly: normKey + raw:false + defval:''. */
const normKey = (key: string): string => key.replace(/\s+/g, ' ').trim();

function loadCorpus(): { columns: string[]; rows: Record<string, string>[] } {
	const workbook = XLSX.read(readFileSync(CORPUS_PATH), { type: 'buffer' });
	const sheet = workbook.Sheets[SHEET];
	if (!sheet) throw new Error(`sheet "${SHEET}" missing; workbook has: ${workbook.SheetNames.join(', ')}`);
	const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
		range: 0, defval: '', blankrows: false, raw: false,
	});
	const rows = raw.map((record) => {
		const row: Record<string, string> = {};
		for (const [key, value] of Object.entries(record)) {
			row[normKey(key)] = value === null || value === undefined ? '' : String(value).trim();
		}
		return row;
	});
	const columns: string[] = [];
	const seen = new Set<string>();
	for (const row of rows) for (const key of Object.keys(row)) if (!seen.has(key)) { seen.add(key); columns.push(key); }
	return { columns, rows };
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

describeScale('Crosswalker plugin — MITRE ATT&CK technique recipe corpus proof', function () {
	this.timeout(10 * 60_000);

	it('imports all 656 techniques and proves every note body carries its source description', async () => {
		const specStarted = Date.now();
		mkdirSync(SCREENSHOT_DIR, { recursive: true });

		const corpus = loadCorpus();
		const recipe = JSON.parse(readFileSync(RECIPE_PATH, 'utf8'));
		expect(corpus.rows.length).toBe(EXPECTED_RECORD_COUNT);
		expect(new Set(corpus.rows.map((row) => row['ID'])).size).toBe(EXPECTED_RECORD_COUNT);
		expect(recipe.recipe).toBe('mitre-attack-technique-flat');
		expect(recipe.source.ontology).toBe(ONTOLOGY);
		// The retarget: no template may still reference the STIX bundle shape.
		const templateBlob = JSON.stringify(recipe.target);
		expect(templateBlob).not.toContain('external_references');
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

		const config = {
			name: 'shape-workbench',
			mapping: {
				hierarchy: [], frontmatter: [], links: [], body: [],
				filename: { template: '{ID|fs-safe}.md', sanitize: true },
			},
		};
		const parsedData = {
			columns: corpus.columns,
			rows: corpus.rows,
			rowCount: corpus.rows.length,
			source: { type: 'xlsx' as const },
			headerRow: 0,
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

		const subTechnique = await readFrontmatterFromDisk(`${DESTINATION}/T1548.002.md`) as Record<string, any> | null;
		expect(subTechnique).toBeTruthy();
		expect(subTechnique!.curie).toMatch(CURIE_PATTERN);
		expect(subTechnique!.technique_id).toBe('T1548.002');
		expect(typeof subTechnique!.stix_id).toBe('string');
		expect(subTechnique!.is_subtechnique).toBe('true');
		// REPINNED 2026-08-26 (was: typeof tactics === 'string'). That assertion
		// encoded the gap, not the goal: tactics/platforms/data_sources were flattened
		// to comma-joined scalars only because the sole splitter in the grammar
		// force-wrapped every piece in [[...]]. They are now real YAML arrays, which
		// is what makes them Bases facets. Pinned as a strictly stronger contract —
		// an array of clean, comma-free items, not merely "a string".
		expect(Array.isArray(subTechnique!.tactics)).toBe(true);
		expect(subTechnique!.tactics.length).toBeGreaterThan(0);
		for (const tactic of subTechnique!.tactics as string[]) {
			expect(typeof tactic).toBe('string');
			expect(tactic).not.toContain(',');
			expect(tactic).toBe(tactic.trim());
		}
		expect(Array.isArray(subTechnique!.platforms)).toBe(true);
		expect(String(subTechnique!.parent)).toContain('[[');
		expect(subTechnique!._crosswalker.recipe.id).toBe('mitre-attack-technique-flat');
		expect(subTechnique!._crosswalker.source_ref.file).toBe(SOURCE_FILE_NAME);
		// description was deliberately moved out of frontmatter into the body.
		expect(subTechnique!.description).toBeUndefined();

		const bodyProof = await browser.executeObsidian(async ({ app, obsidian }, args) => {
			const stripFrontmatter = (markdown: string): string => {
				const normalized = markdown.replace(/\r\n/g, '\n');
				if (!normalized.startsWith('---\n')) return normalized.trim();
				const closing = normalized.indexOf('\n---\n', 4);
				return closing < 0 ? normalized.trim() : normalized.slice(closing + 5).trim();
			};
			const missingFiles: string[] = [];
			const emptyBodies: string[] = [];
			const missingDescriptionProse: string[] = [];
			const missingNotice: string[] = [];
			const firstLineMarkers: Record<string, number> = {};
			const wordCounts: number[] = [];
			let notesWithDetection = 0;
			let sampleBody = '';

			// The note body now opens with the managed-region boundary (2026-08-27
			// managed body regions). Structural claims about "the first line" are
			// claims about the first line INSIDE the region, so read through it.
			// Falls back to the raw body when no region is present, so a note that
			// somehow lost its boundary is still checked rather than skipped.
			const regionOf = (text: string): string => {
				const s = text.indexOf('<!-- crosswalker:body:start');
				const e = text.indexOf('<!-- crosswalker:body:end -->');
				if (s === -1 || e === -1) return text;
				const nl = text.indexOf('\n', s);
				return nl === -1 ? text : text.slice(nl + 1, e);
			};
			for (const row of args.rows) {
				const notePath = `${args.destination}/${row['ID']}.md`;
				const file = app.vault.getAbstractFileByPath(notePath);
				if (!file || !(file instanceof obsidian.TFile)) { missingFiles.push(notePath); continue; }
				const body = stripFrontmatter(await app.vault.read(file));
				if (body.length === 0) emptyBodies.push(notePath);
				// Compare on a prose fragment: markdown assembly must not mangle it.
				const fragment = row['description'].trim().split('\n')[0].slice(0, 80).trim();
				if (fragment.length > 0 && !body.includes(fragment)) missingDescriptionProse.push(notePath);
				if (!body.includes(args.notice)) missingNotice.push(notePath);
				if (body.includes('## Detection')) notesWithDetection++;
				const firstLine = regionOf(body).split('\n')[0];
				const marker = firstLine.startsWith('#') ? firstLine.replace(/\s[\s\S]*$/, '') : '(no leading heading)';
				firstLineMarkers[marker] = (firstLineMarkers[marker] ?? 0) + 1;
				wordCounts.push(body.match(/\S+/g)?.length ?? 0);
				if (row['ID'] === 'T1548.002') sampleBody = body;
			}
			const sum = (values: number[]): number => values.reduce((total, value) => total + value, 0);
			return {
				missingFiles, emptyBodies, missingDescriptionProse, missingNotice,
				firstLineMarkers,
				sampleFirstLine: regionOf(sampleBody).split('\n')[0],
				notesWithDetection,
				wordCountAverage: sum(wordCounts) / wordCounts.length,
				wordCountMin: Math.min(...wordCounts),
				wordCountMax: Math.max(...wordCounts),
			};
		}, { rows: corpus.rows, destination: DESTINATION, notice: MITRE_NOTICE });

		expect(bodyProof.missingFiles).toEqual([]);
		expect(bodyProof.emptyBodies).toEqual([]);
		expect(bodyProof.missingDescriptionProse).toEqual([]);
		// Every note reproduces ATT&CK prose, so every note must carry the notice.
		expect(bodyProof.missingNotice).toEqual([]);
		metric('body_words_per_note_average', bodyProof.wordCountAverage.toFixed(2));
		metric('body_words_per_note_min', bodyProof.wordCountMin);
		metric('body_words_per_note_max', bodyProof.wordCountMax);
		metric('notes_with_detection_section', bodyProof.notesWithDetection);
		// Observational, NOT asserted: records what the engine puts on body line 1.
		metric('body_first_line_markers', JSON.stringify(bodyProof.firstLineMarkers));
		metric('body_first_line_sample', JSON.stringify(bodyProof.sampleFirstLine));

		metric('total_spec_ms', Date.now() - specStarted);
	});

	// Visual capture is a SEPARATE test on purpose: a chromedriver renderer
	// stall while screenshotting must not invalidate the corpus proof above.
	// NOTE: do NOT call app.workspace.revealLeaf() here. Revealing a leaf while
	// the file explorer holds hundreds of freshly generated entries wedges the
	// renderer, and every subsequent screenshot request times out.
	it('captures a representative generated note', async () => {
		await browser.executeObsidian(async ({ app, obsidian }, notePath) => {
			const file = app.vault.getAbstractFileByPath(notePath);
			if (!file || !(file instanceof obsidian.TFile)) throw new Error(`missing note ${notePath}`);
			await app.workspace.getLeaf(false).openFile(file, { state: { mode: 'preview' }, active: true });
		}, `${DESTINATION}/T1548.002.md`);
		await browser.pause(3000);
		await browser.saveScreenshot(path.join(SCREENSHOT_DIR, 'attack-properties-t1548-002.png'));
		// The managed property block is 17 keys tall, so the body prose starts below
		// the fold. Scroll past it so the capture is evidence of the BODY.
		await browser.executeObsidian(() => {
			const scroller = document.querySelector('.markdown-preview-view');
			if (scroller) scroller.scrollTop = 780;
		});
		await browser.pause(1500);
		await browser.saveScreenshot(path.join(SCREENSHOT_DIR, 'attack-body-t1548-002.png'));
	});
});
