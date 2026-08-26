/**
 * full-nist-800-53-import.spec.ts — opt-in full-corpus import scale proof
 *
 * This spec is intentionally excluded from normal E2E cost by an environment
 * gate. It parses and imports the tracked 1 MB NIST SP 800-53 Rev. 5 catalog,
 * writes 1,189 real notes through the same bundled-recipe path used by the
 * recognized-source wizard, projects them into Tier 2, times representative
 * queries, and captures visual evidence.
 *
 * Run only when explicitly requested:
 *   CW_SCALE=1 DISPLAY=:0 bun run e2e -- --spec tests/e2e/full-nist-800-53-import.spec.ts
 */

import { browser } from '@wdio/globals';
import { expect } from 'expect';
import { mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import Papa from 'papaparse';
import {
	readFrontmatterFromDisk,
	requireFrontmatterIndexed,
	resetTier2Sidecar,
} from './helpers/vault-readiness';

const RUN_SCALE = process.env.CW_SCALE === '1';
const describeScale = RUN_SCALE ? describe : describe.skip;

const CORPUS_PATH = path.resolve(__dirname, '..', '..', 'Frameworks', 'NIST_SP-800-53_rev5_catalog_load.csv');
const RECIPE_PATH = path.resolve(__dirname, '..', '..', 'recipes', 'import', 'nist-800-53-flat.json');
const SOURCE_FILE_NAME = 'NIST_SP-800-53_rev5_catalog_load.csv';
const DESTINATION = 'Frameworks/full-nist-800-53-scale';
const EXPECTED_RECORD_COUNT = 1189;
const ONTOLOGY = 'nist-800-53';
const CURIE_PATTERN = /^[a-z][a-z0-9_-]*:[A-Za-z0-9._\-()/]+$/;
const SCREENSHOT_DIR = path.resolve(__dirname, '..', '..', 'test-screenshots');

interface CorpusRow {
	identifier: string;
	name: string;
	control_text: string;
	discussion: string;
	related: string;
	[key: string]: string;
}

function loadCorpus(): { columns: string[]; rows: CorpusRow[] } {
	const parsed = Papa.parse<CorpusRow>(readFileSync(CORPUS_PATH, 'utf8'), {
		header: true,
		skipEmptyLines: true,
		dynamicTyping: false,
		transformHeader: (header) => header.trim(),
	});
	if (parsed.errors.length > 0) {
		throw new Error(`Full NIST CSV parse errors: ${parsed.errors.map((error) => `${error.code}: ${error.message}`).join('; ')}`);
	}
	return { columns: parsed.meta.fields ?? Object.keys(parsed.data[0] ?? {}), rows: parsed.data };
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

describeScale('Crosswalker plugin — full NIST SP 800-53 Rev. 5 import scale proof', function () {
	this.timeout(10 * 60_000);

	it('imports, indexes, projects, queries, measures, and screenshots all 1,189 records', async () => {
		const specStarted = Date.now();
		mkdirSync(SCREENSHOT_DIR, { recursive: true });

		const corpus = loadCorpus();
		const recipe = JSON.parse(readFileSync(RECIPE_PATH, 'utf8'));
		expect(corpus.rows.length).toBe(EXPECTED_RECORD_COUNT);
		expect(new Set(corpus.rows.map((row) => row.identifier)).size).toBe(EXPECTED_RECORD_COUNT);
		expect(recipe.recipe).toBe('nist-800-53-r5-flat');
		expect(recipe.source.ontology).toBe(ONTOLOGY);
		metric('parsed_record_count', corpus.rows.length);

		// The E2E seed contains nine managed mini-framework notes. Remove the seed's
		// Frameworks root in this isolated sandbox so the full Tier 2 projection can
		// make an exact generated-count assertion rather than a >= assertion.
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

		const reset = await resetTier2Sidecar();
		expect(reset.errors).toEqual([]);
		expect(reset.counts.concepts).toBe(0);
		expect(reset.counts.mappings).toBe(0);

		// This mirrors ImportWizard.buildWorkbenchConfig() + recipeOverride: the
		// recognized-source wizard uses generateNotes(), with the complete bundled
		// recipe controlling paths/frontmatter and its leaf template controlling the
		// stable CURIE stem. Calling runImport exercises that shipped path directly.
		const config = {
			name: 'shape-workbench',
			mapping: {
				hierarchy: [],
				frontmatter: [],
				links: [],
				body: [],
				filename: { template: '{identifier|fs-safe}.md', sanitize: true },
			},
		};
		const parsedData = {
			columns: corpus.columns,
			rows: corpus.rows,
			rowCount: corpus.rows.length,
			source: { type: 'csv' as const },
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
		expect(generation.skipped).toEqual([]);
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
		expect(indexed.total).toBe(EXPECTED_RECORD_COUNT);

		const samplePaths = [
			`${DESTINATION}/AC-1.md`,
			`${DESTINATION}/AC-2(1).md`,
			`${DESTINATION}/SR-11(3).md`,
		];
		for (const notePath of samplePaths) {
			const frontmatter = await readFrontmatterFromDisk(notePath) as Record<string, any> | null;
			expect(frontmatter).toBeTruthy();
			expect(frontmatter!._crosswalker).toBeTruthy();
			expect(typeof frontmatter!.curie).toBe('string');
			expect(frontmatter!.curie).toMatch(CURIE_PATTERN);
			expect(frontmatter!._crosswalker.recipe.id).toBe('nist-800-53-r5-flat');
			expect(frontmatter!._crosswalker.source_ref.file).toBe(SOURCE_FILE_NAME);
		}
		const enhancement = await readFrontmatterFromDisk(`${DESTINATION}/AC-2(1).md`) as Record<string, any> | null;
		expect(enhancement!.curie).toBe('nist-800-53:AC-2(1)');
		expect(enhancement!.control_id).toBe('AC-2(1)');
		expect(enhancement!.title).toBe('Account Management | Automated System Account Management');

		const bodyProof = await browser.executeObsidian(async ({ app, obsidian }, args) => {
			const stripFrontmatter = (markdown: string): string => {
				const normalized = markdown.replace(/\r\n/g, '\n');
				if (!normalized.startsWith('---\n')) return normalized.trim();
				const closing = normalized.indexOf('\n---\n', 4);
				return closing < 0 ? normalized.trim() : normalized.slice(closing + 5).trim();
			};
			const missingFiles: string[] = [];
			const emptyBodies: string[] = [];
			const missingControlText: string[] = [];
			const missingSections: string[] = [];
			const wordCounts: number[] = [];
			const characterCounts: number[] = [];
			let enhancementBody = '';

			for (const row of args.rows) {
				const notePath = `${args.destination}/${row.identifier}.md`;
				const file = app.vault.getAbstractFileByPath(notePath);
				if (!file || !(file instanceof obsidian.TFile)) {
					missingFiles.push(notePath);
					continue;
				}
				const body = stripFrontmatter(await app.vault.read(file));
				if (body.length === 0) emptyBodies.push(notePath);
				if (!body.includes(row.control_text.trim())) missingControlText.push(notePath);
				if (!body.includes('## Control') || (row.discussion.trim() !== '' && !body.includes('## Discussion'))) missingSections.push(notePath);
				wordCounts.push(body.match(/\S+/g)?.length ?? 0);
				characterCounts.push(body.length);
				if (row.identifier === 'AC-2(1)') enhancementBody = body;
			}

			const sum = (values: number[]): number => values.reduce((total, value) => total + value, 0);
			return {
				missingFiles,
				emptyBodies,
				missingControlText,
				missingSections,
				enhancementBody,
				wordCountTotal: sum(wordCounts),
				wordCountAverage: sum(wordCounts) / wordCounts.length,
				wordCountMin: Math.min(...wordCounts),
				wordCountMax: Math.max(...wordCounts),
				characterCountTotal: sum(characterCounts),
				characterCountAverage: sum(characterCounts) / characterCounts.length,
				characterCountMin: Math.min(...characterCounts),
				characterCountMax: Math.max(...characterCounts),
			};
		}, { rows: corpus.rows, destination: DESTINATION });
		expect(bodyProof.missingFiles).toEqual([]);
		expect(bodyProof.emptyBodies).toEqual([]);
		expect(bodyProof.missingControlText).toEqual([]);
		expect(bodyProof.missingSections).toEqual([]);
		const enhancementSource = corpus.rows.find((row) => row.identifier === 'AC-2(1)')!;
		expect(bodyProof.enhancementBody).toContain('# Account Management | Automated System Account Management');
		expect(bodyProof.enhancementBody).toContain(enhancementSource.control_text.trim());
		expect(bodyProof.enhancementBody).toContain(enhancementSource.discussion.trim());
		metric('body_word_count_total', bodyProof.wordCountTotal);
		metric('body_words_per_note_average', bodyProof.wordCountAverage.toFixed(2));
		metric('body_words_per_note_min', bodyProof.wordCountMin);
		metric('body_words_per_note_max', bodyProof.wordCountMax);
		metric('body_character_count_total', bodyProof.characterCountTotal);
		metric('body_characters_per_note_average', bodyProof.characterCountAverage.toFixed(2));
		metric('body_characters_per_note_min', bodyProof.characterCountMin);
		metric('body_characters_per_note_max', bodyProof.characterCountMax);

		const projection = await timed('tier2_projection_wall_ms', () => browser.executeObsidian(async ({ app }) => {
			// @ts-expect-error - Crosswalker E2E API
			const plugin = app.plugins.plugins['crosswalker'];
			return plugin.runProjection();
		}));
		expect(projection.success).toBe(true);
		expect(projection.errors).toEqual([]);
		expect(projection.counts.concepts).toBe(EXPECTED_RECORD_COUNT);
		expect(projection.counts.mappings).toBe(0);
		metric('projected_concept_count', projection.counts.concepts);

		const conceptsCold = await timed('query_concepts_cold_ms', () => browser.executeObsidian(async ({ app }, ontology) => {
			// @ts-expect-error - Crosswalker E2E API
			const plugin = app.plugins.plugins['crosswalker'];
			return plugin.queryConcepts(ontology);
		}, ONTOLOGY));
		expect(conceptsCold.length).toBe(EXPECTED_RECORD_COUNT);
		expect(conceptsCold.some((concept: any) => concept.curie === 'nist-800-53:AC-2(1)')).toBe(true);

		const conceptsWarm = await timed('query_concepts_warm_ms', () => browser.executeObsidian(async ({ app }, ontology) => {
			// @ts-expect-error - Crosswalker E2E API
			const plugin = app.plugins.plugins['crosswalker'];
			return plugin.queryConcepts(ontology);
		}, ONTOLOGY));
		expect(conceptsWarm.length).toBe(EXPECTED_RECORD_COUNT);

		const sampleNotePath = `${DESTINATION}/AC-2(1).md`;
		const opened = await browser.executeObsidian(async ({ app, obsidian }, notePath) => {
			const file = app.vault.getAbstractFileByPath(notePath);
			if (!file || !(file instanceof obsidian.TFile)) return false;
			const leaf = app.workspace.getLeaf(false);
			await leaf.openFile(file, { state: { mode: 'preview' }, active: true });
			app.workspace.revealLeaf(leaf);
			// @ts-expect-error - internal split API
			app.workspace.leftSplit.expand();
			// @ts-expect-error - command registry API
			app.commands.executeCommandById('file-explorer:reveal-active-file');
			return true;
		}, sampleNotePath);
		expect(opened).toBe(true);

		await browser.waitUntil(async () => browser.execute((notePath) => {
			const titles = [...document.querySelectorAll<HTMLElement>('.nav-file-title[data-path]')];
			const target = titles.find((element) => element.dataset.path === notePath);
			if (!target) return false;
			target.scrollIntoView({ block: 'center' });
			return true;
		}, sampleNotePath), {
			timeout: 15_000,
			timeoutMsg: 'generated NIST note was not revealed in the file explorer',
		});
		await browser.waitUntil(async () => browser.execute(() => document.querySelectorAll('.notice').length === 0), {
			timeout: 15_000,
			timeoutMsg: 'startup notices did not clear before visual evidence capture',
		});
		await browser.saveScreenshot(path.join(SCREENSHOT_DIR, 'full-nist-framework-tree.png'));

		await browser.waitUntil(async () => browser.execute(() => {
			const property = document.querySelector<HTMLElement>('[data-property-key="control_id"]');
			const previews = [...document.querySelectorAll<HTMLElement>('.markdown-preview-view')];
			const preview = previews.find((candidate) => {
				const text = candidate.innerText;
				return text.includes('Account Management | Automated System Account Management')
					&& text.includes('Control')
					&& text.includes('Discussion');
			});
			if (!property || !preview) return false;
			preview.scrollTop = 0;
			return true;
		}), {
			timeout: 15_000,
			timeoutMsg: 'opened control note did not render readable body sections with its properties',
		});
		await browser.saveScreenshot(path.join(SCREENSHOT_DIR, 'nist-body-ac-2-1.png'));

		metric('total_spec_ms', Date.now() - specStarted);
	});
});
