/**
 * ch43-release-drift.spec.ts — the Ch 43 central claim, end to end, in real
 * Obsidian, against a real publisher release pair.
 *
 * WHAT THIS PROVES THAT THE JEST SUITE CANNOT
 *   `tests/ch43-real-release-drift.test.ts` measures the same claim over the
 *   whole 637-technique population, but it inserts Tier 2 rows directly. It
 *   therefore assumes the two ends of the chain rather than exercising them:
 *   that the GENERATION ENGINE stamps `_crosswalker.review_cid` into a note it
 *   writes, that it stamps `reviewed_against` onto an approved attestation from
 *   the subject's own fingerprint, and that the PROJECTOR reads both back out
 *   of real frontmatter.
 *
 *   This spec runs the actual chain: real recipe -> real `runImportFromRecipe`
 *   -> real files on disk -> real metadata cache -> real `runProjection()` ->
 *   real `junction_notes_with_freshness`. Then it RE-IMPORTS the 16.1 rows over
 *   the same identities and re-projects, which is the operation the whole
 *   feature exists to survive.
 *
 *   It also pins a defect found while writing it: a junction note produced by
 *   the evidence-link MODAL carries no `_crosswalker` block, so it is not valid
 *   Tier 1 and the projector skips it. See the `PATH A` test below.
 *
 * RIGHTS: ATT&CK content is reproduced under the MITRE terms of use. Only a
 * handful of techniques are imported and no prose is asserted on.
 *
 * Run:
 *   DISPLAY=:0 bun run e2e -- --spec tests/e2e/ch43-release-drift.spec.ts
 */

import { browser } from '@wdio/globals';
import { expect } from 'expect';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import * as XLSX from 'xlsx';
import { buildEvidenceLink } from '../../src/views/evidence-link';
import { requireFrontmatterIndexed } from './helpers/vault-readiness';

const ROOT = path.resolve(__dirname, '..', '..');
const V15 = path.join(ROOT, 'Frameworks', 'enterprise-attack-v15.1.xlsx');
const V16 = path.join(ROOT, 'Frameworks', 'enterprise-attack-v16.1.xlsx');
const RECIPE = JSON.parse(
	readFileSync(path.join(ROOT, 'recipes', 'import', 'mitre-attack-technique.json'), 'utf8'),
);

const DESTINATION = 'Frameworks/ch43-attack';
const JUNCTIONS = 'Evidence/ch43';
const MODAL_FOLDER = 'Evidence/ch43-modal';

/**
 * The scenario set. Every classification here was MEASURED from the two
 * workbooks, not chosen by hand:
 *   material    — description changed under a stable ID
 *   rename      — the release's only stable-ID name change
 *   steady      — the whole source row is byte-identical across the release
 *   cosmetic    — the raw row changed, but only inside citation spans, which
 *                 normalization step 2 deletes
 *   bookkeeping — description drift that folds under normalization, but the
 *                 publisher also stamped `version` / `last modified`
 */
const SCENARIOS = [
	{ id: 'T1496', kind: 'material', expectFlag: true },
	{ id: 'T1558', kind: 'material', expectFlag: true },
	{ id: 'T1001.003', kind: 'rename', expectFlag: true },
	{ id: 'T1548.004', kind: 'steady', expectFlag: false },
	{ id: 'T1650', kind: 'steady', expectFlag: false },
	{ id: 'T1595', kind: 'steady', expectFlag: false },
	{ id: 'T1548.001', kind: 'cosmetic', expectFlag: false },
	{ id: 'T1574.001', kind: 'bookkeeping', expectFlag: true },
] as const;

/** Attested with no baseline — the pre-feature vault. Materially rewritten. */
const NO_BASELINE_ID = 'T1496';

/**
 * A junction recipe that goes through the ORDINARY generation path, so the
 * engine's own approval stamping (generation-engine.ts, `resolveSubjectReviewCid`)
 * writes `reviewed_against` from the control's `_crosswalker.review_cid`. The
 * spec never computes a fingerprint itself.
 */
const JUNCTION_RECIPE = {
	$schema: 'https://crosswalker.dev/spec/recipe.schema.json',
	recipe: 'ch43-evidence-junctions',
	spec_version: 'https://crosswalker.dev/spec/recipe.schema.json',
	source: { ontology: 'ch43-evidence', levels: ['evidence'] },
	target: {
		layout: [{
			level: 'evidence',
			mechanism: 'file',
			template: '{link_id|fs-safe}.md',
			kind: 'junction-note',
		}],
		also_emit: {
			frontmatter: {
				managed: {
					title: '{link_id}',
					subject: '[[{subject_path}]]',
					subject_curie: '{subject_curie}',
					predicate: 'has_evidence',
					object: '[[Evidence/EDR-Runbook]]',
					coverage: 'full',
					status: '{status}',
				},
			},
		},
	},
};

const normKey = (key: string): string => key.replace(/\s+/g, ' ').trim();

function loadTechniques(file: string): Record<string, string>[] {
	const workbook = XLSX.read(readFileSync(file), { type: 'buffer' });
	const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(workbook.Sheets['techniques'], {
		range: 0, defval: '', blankrows: false, raw: false,
	});
	return raw.map((record) => {
		const row: Record<string, string> = {};
		for (const [key, value] of Object.entries(record)) {
			row[normKey(key)] = value === null || value === undefined ? '' : String(value).trim();
		}
		return row;
	});
}

function subset(rows: Record<string, string>[]): { columns: string[]; rows: Record<string, string>[] } {
	const wanted = new Set<string>(SCENARIOS.map((s) => s.id));
	const picked = rows.filter((row) => wanted.has(row['ID']));
	const columns: string[] = [];
	const seen = new Set<string>();
	// Column order comes from the FULL sheet, not the subset, so both import
	// passes present identically-shaped rows.
	for (const row of rows) {
		for (const key of Object.keys(row)) {
			if (!seen.has(key)) { seen.add(key); columns.push(key); }
		}
	}
	return { columns, rows: picked };
}

async function runRecipe(
	columns: string[],
	rows: Record<string, string>[],
	recipe: unknown,
	destination: string,
	sourceFileName: string,
): Promise<any> {
	return browser.executeObsidian(async ({ app }, args) => {
		// @ts-expect-error — Crosswalker E2E API
		const plugin = app.plugins.plugins['crosswalker'];
		return plugin.runImportFromRecipe(
			{
				columns: args.columns,
				rows: args.rows,
				rowCount: args.rows.length,
				source: { type: 'xlsx' },
				headerRow: 0,
			},
			args.recipe,
			{
				basePath: args.destination,
				overwriteMode: 'replace',
				createFolders: true,
				strictValidation: true,
				sourceFileName: args.sourceFileName,
			},
		);
	}, { columns, rows, recipe, destination, sourceFileName });
}

async function importRelease(rows: Record<string, string>[], sourceFileName: string): Promise<any> {
	const { columns, rows: picked } = subset(rows);
	return runRecipe(columns, picked, RECIPE, DESTINATION, sourceFileName);
}

/** Projection result plus every junction's freshness, keyed by note path. */
async function project(): Promise<{
	counts: Record<string, number>;
	rows: Record<string, { freshness: string; baseline: string }>;
}> {
	return browser.executeObsidian(async ({ app }) => {
		// @ts-expect-error — Crosswalker E2E API
		const plugin = app.plugins.plugins['crosswalker'];
		const result = await plugin.runProjection();
		const handle = await plugin.openTier2();
		const rows = handle.db.exec({
			sql: 'SELECT vault_path, freshness, subject_baseline FROM junction_notes_with_freshness ORDER BY vault_path',
			rowMode: 'array',
			returnValue: 'resultRows',
		}) as unknown[][];
		const out: Record<string, { freshness: string; baseline: string }> = {};
		for (const row of rows) {
			out[String(row[0])] = { freshness: String(row[1]), baseline: String(row[2]) };
		}
		return { counts: result.counts, rows: out };
	});
}

describe('Ch 43 — a real ATT&CK release re-import, end to end', function () {
	this.timeout(8 * 60_000);

	let v15: Record<string, string>[];
	let v16: Record<string, string>[];
	/** curie + review_cid as the generation engine actually stamped them. */
	let stamped: Record<string, { curie: string; reviewCid: string }>;

	before(() => {
		v15 = loadTechniques(V15);
		v16 = loadTechniques(V16);
	});

	it('starts from a clean destination', async () => {
		const cleaned = await browser.executeObsidian(async ({ app }, folders) => {
			for (const folder of folders) {
				const node = app.vault.getAbstractFileByPath(folder);
				// @ts-expect-error — internal trash API, isolated E2E vault only
				if (node) await app.vault.trash(node, false);
			}
			const deadline = Date.now() + 20000;
			while (folders.some((f) => app.vault.getAbstractFileByPath(f)) && Date.now() < deadline) {
				await new Promise((resolve) => setTimeout(resolve, 50));
			}
			return folders.every((f) => !app.vault.getAbstractFileByPath(f));
		}, [DESTINATION, JUNCTIONS, MODAL_FOLDER]);
		expect(cleaned).toBe(true);
	});

	it('imports the 15.1 rows and proves the engine stamped a review fingerprint on every note', async () => {
		const result = await importRelease(v15, 'enterprise-attack-v15.1.xlsx');
		expect(result.success).toBe(true);
		expect(result.errors).toEqual([]);
		expect(result.created.length).toBe(SCENARIOS.length);

		await requireFrontmatterIndexed({
			pathPrefixes: DESTINATION,
			expectedCount: SCENARIOS.length,
			requireKeys: ['curie', '_crosswalker'],
			timeoutMs: 120000,
		});

		stamped = await browser.executeObsidian(async ({ app, obsidian }, args) => {
			const out: Record<string, { curie: string; reviewCid: string }> = {};
			for (const id of args.ids) {
				const file = app.vault.getAbstractFileByPath(`${args.destination}/${id}.md`);
				if (!(file instanceof obsidian.TFile)) throw new Error(`missing note for ${id}`);
				const fm = app.metadataCache.getFileCache(file)?.frontmatter;
				if (!fm) throw new Error(`no frontmatter cached for ${id}`);
				out[id] = {
					curie: String(fm.curie),
					reviewCid: String((fm._crosswalker || {}).review_cid || ''),
				};
			}
			return out;
		}, { ids: SCENARIOS.map((s) => s.id), destination: DESTINATION });

		// The chain's first link: no stamp, no feature.
		for (const scenario of SCENARIOS) {
			expect(stamped[scenario.id].curie).toMatch(/^mitre-attack:/);
			expect(stamped[scenario.id].reviewCid).toMatch(/^sha256-[0-9a-f]{64}$/);
		}
		// Distinct content must produce distinct fingerprints, or the whole
		// comparison below is vacuous.
		expect(new Set(SCENARIOS.map((s) => stamped[s.id].reviewCid)).size).toBe(SCENARIOS.length);
	});

	it('PATH A (DEFECT): a modal-authored attestation never reaches Tier 2 at all', async () => {
		// The bytes here are produced by the SHIPPED builder, not hand-written:
		// this is exactly what a user gets from "Link evidence to control".
		const note = buildEvidenceLink({
			folder: MODAL_FOLDER,
			controlPath: `${DESTINATION}/${SCENARIOS[0].id}`,
			evidencePath: 'Evidence/EDR-Runbook',
			coverage: 'full',
			status: 'approved',
			reviewer: 'control-owner',
			controlCurie: stamped[SCENARIOS[0].id].curie,
			controlReviewCid: stamped[SCENARIOS[0].id].reviewCid,
		} as any);

		// The baseline IS written. The modal half of Ch 43 works.
		expect(note.markdown).toContain('reviewed_against:');
		expect(note.markdown).toContain(stamped[SCENARIOS[0].id].reviewCid);
		// But no provenance block is emitted, and `_crosswalker` is REQUIRED on a
		// junction note by spec/tier1.schema.json. The note is not valid Tier 1.
		expect(note.markdown).not.toContain('_crosswalker');

		await browser.executeObsidian(async ({ app }, args) => {
			const folder = args.notePath.slice(0, args.notePath.lastIndexOf('/'));
			await app.vault.createFolder(folder).catch(() => undefined);
			const existing = app.vault.getAbstractFileByPath(args.notePath);
			// @ts-expect-error — internal trash API, isolated E2E vault only
			if (existing) await app.vault.trash(existing, false);
			await app.vault.create(args.notePath, args.markdown);
		}, { notePath: note.path, markdown: note.markdown });

		await requireFrontmatterIndexed({
			pathPrefixes: MODAL_FOLDER,
			expectedCount: 1,
			requireKeys: ['curie', 'subject_curie', 'reviewed_against'],
			timeoutMs: 120000,
		});

		const projected = await project();
		// THE DEFECT, pinned: projector.ts skips any note without `_crosswalker`,
		// so this link is invisible to coverage and to the whole freshness
		// feature. Flip this assertion the day the modal emits provenance.
		expect(Object.keys(projected.rows)).toEqual([]);
		expect(projected.counts.junction_notes).toBe(0);
	});

	it('PATH B: an imported approved attestation is stamped by the engine itself', async () => {
		const rows = [
			...SCENARIOS.map((s) => ({
				link_id: `jn-${s.id}`,
				subject_path: `${DESTINATION}/${s.id}`,
				subject_curie: stamped[s.id].curie,
				status: 'approved',
			})),
			{
				// The pre-feature link: `proposed` at write time, so the engine
				// records no baseline. It is promoted to `approved` below, which is
				// exactly how a link written before this feature existed looks.
				link_id: `jn-${NO_BASELINE_ID}-pre-feature`,
				subject_path: `${DESTINATION}/${NO_BASELINE_ID}`,
				subject_curie: stamped[NO_BASELINE_ID].curie,
				status: 'proposed',
			},
		];
		const result = await runRecipe(
			['link_id', 'subject_path', 'subject_curie', 'status'],
			rows,
			JUNCTION_RECIPE,
			JUNCTIONS,
			'ch43-evidence.csv',
		);
		expect(result.success).toBe(true);
		expect(result.errors).toEqual([]);
		expect(result.created.length).toBe(rows.length);

		await requireFrontmatterIndexed({
			pathPrefixes: JUNCTIONS,
			expectedCount: rows.length,
			requireKeys: ['curie', 'subject_curie', '_crosswalker'],
			timeoutMs: 120000,
		});

		const written = await browser.executeObsidian(async ({ app, obsidian }, args) => {
			const out: Record<string, { baselineCid: string | null; baselineCurie: string | null }> = {};
			for (const id of args.ids) {
				const file = app.vault.getAbstractFileByPath(`${args.junctions}/${id}.md`);
				if (!(file instanceof obsidian.TFile)) throw new Error(`missing junction ${id}`);
				const ra = app.metadataCache.getFileCache(file)?.frontmatter?.reviewed_against;
				out[id] = {
					baselineCid: ra ? String(ra.review_cid) : null,
					baselineCurie: ra ? String(ra.curie) : null,
				};
			}
			return out;
		}, { ids: rows.map((r) => r.link_id), junctions: JUNCTIONS });

		// The engine resolved each subject through the identity index and stamped
		// the control's OWN fingerprint. Nothing in this spec computed a hash.
		for (const scenario of SCENARIOS) {
			expect({ id: scenario.id, ...written[`jn-${scenario.id}`] }).toEqual({
				id: scenario.id,
				baselineCid: stamped[scenario.id].reviewCid,
				baselineCurie: stamped[scenario.id].curie,
			});
		}
		// A non-approved link is never stamped: nobody reviewed anything yet.
		expect(written[`jn-${NO_BASELINE_ID}-pre-feature`])
			.toEqual({ baselineCid: null, baselineCurie: null });

		// Promote the unbaselined link to approved WITHOUT adding a baseline —
		// the exact shape of every attestation written before this feature.
		await browser.executeObsidian(async ({ app, obsidian }, notePath) => {
			const file = app.vault.getAbstractFileByPath(notePath);
			if (!(file instanceof obsidian.TFile)) throw new Error(`missing ${notePath}`);
			const text = await app.vault.read(file);
			await app.vault.modify(file, text.replace('status: proposed', 'status: approved'));
		}, `${JUNCTIONS}/jn-${NO_BASELINE_ID}-pre-feature.md`);

		await browser.waitUntil(
			async () => browser.executeObsidian(({ app }, notePath) => {
				const file = app.vault.getAbstractFileByPath(notePath);
				// @ts-expect-error — TFile at runtime
				return app.metadataCache.getFileCache(file)?.frontmatter?.status === 'approved';
			}, `${JUNCTIONS}/jn-${NO_BASELINE_ID}-pre-feature.md`),
			{ timeout: 60000, interval: 250, timeoutMsg: 'status promotion never reached the cache' },
		);
	});

	it('before the re-import, every baselined link matches and the pre-feature link is unrecorded', async () => {
		const { counts, rows } = await project();
		expect(counts.junction_notes).toBe(SCENARIOS.length + 1);
		for (const scenario of SCENARIOS) {
			expect({ id: scenario.id, ...rows[`${JUNCTIONS}/jn-${scenario.id}.md`] })
				.toEqual({ id: scenario.id, freshness: 'not-set', baseline: 'match' });
		}
		expect(rows[`${JUNCTIONS}/jn-${NO_BASELINE_ID}-pre-feature.md`])
			.toEqual({ freshness: 'not-set', baseline: 'unrecorded' });
	});

	it('THE CLAIM: re-importing 16.1 invalidates exactly the changed subjects', async () => {
		const result = await importRelease(v16, 'enterprise-attack-v16.1.xlsx');
		expect(result.success).toBe(true);
		expect(result.errors).toEqual([]);

		await requireFrontmatterIndexed({
			pathPrefixes: DESTINATION,
			expectedCount: SCENARIOS.length,
			requireKeys: ['curie', '_crosswalker'],
			timeoutMs: 120000,
		});

		// The engine must have re-stamped: a changed row means a changed hash,
		// and an unchanged row means a byte-identical one.
		const restamped = await browser.executeObsidian(async ({ app, obsidian }, args) => {
			const out: Record<string, string> = {};
			for (const id of args.ids) {
				const file = app.vault.getAbstractFileByPath(`${args.destination}/${id}.md`);
				if (!(file instanceof obsidian.TFile)) throw new Error(`missing note for ${id}`);
				const fm = app.metadataCache.getFileCache(file)?.frontmatter;
				out[id] = String(((fm || {})._crosswalker || {}).review_cid || '');
			}
			return out;
		}, { ids: SCENARIOS.map((s) => s.id), destination: DESTINATION });

		for (const scenario of SCENARIOS) {
			const moved = restamped[scenario.id] !== stamped[scenario.id].reviewCid;
			expect({ id: scenario.id, moved }).toEqual({ id: scenario.id, moved: scenario.expectFlag });
		}

		const { rows } = await project();
		for (const scenario of SCENARIOS) {
			expect({ id: scenario.id, ...rows[`${JUNCTIONS}/jn-${scenario.id}.md`] }).toEqual({
				id: scenario.id,
				freshness: scenario.expectFlag ? 'subject-changed' : 'not-set',
				baseline: scenario.expectFlag ? 'changed' : 'match',
			});
		}

		// The backward-compatibility guarantee, after the same re-import that
		// invalidated four of its neighbours: untouched, and named.
		expect(rows[`${JUNCTIONS}/jn-${NO_BASELINE_ID}-pre-feature.md`])
			.toEqual({ freshness: 'not-set', baseline: 'unrecorded' });
	});

	it('the vault can name which links stopped counting and which cannot be judged', async () => {
		const report = await browser.executeObsidian(async ({ app }) => {
			// @ts-expect-error — Crosswalker E2E API
			const plugin = app.plugins.plugins['crosswalker'];
			const handle = await plugin.openTier2();
			const changed = handle.db.exec({
				sql: "SELECT vault_path FROM junction_notes_with_freshness WHERE freshness = 'subject-changed' ORDER BY vault_path",
				rowMode: 'array', returnValue: 'resultRows',
			}) as unknown[][];
			const unbaselined = handle.db.exec({
				sql: "SELECT vault_path FROM junction_notes_with_freshness WHERE subject_baseline = 'unrecorded' ORDER BY vault_path",
				rowMode: 'array', returnValue: 'resultRows',
			}) as unknown[][];
			return {
				changed: changed.map((r) => String(r[0])),
				unbaselined: unbaselined.map((r) => String(r[0])),
			};
		});

		expect(report.changed.slice().sort()).toEqual(
			SCENARIOS.filter((s) => s.expectFlag).map((s) => `${JUNCTIONS}/jn-${s.id}.md`).sort(),
		);
		expect(report.unbaselined).toEqual([`${JUNCTIONS}/jn-${NO_BASELINE_ID}-pre-feature.md`]);
	});

	it('and the report a human opens says all of it in words', async () => {
		// The last link in the chain. Everything above proves the index knows;
		// this proves the artifact a control owner actually reads says so.
		const written = await browser.executeObsidian(async ({ app, obsidian }, args) => {
			// @ts-expect-error — internal commands API
			app.commands.executeCommandById('crosswalker:evidence-coverage-report');
			await new Promise((resolve) => setTimeout(resolve, 900));
			// The vault holds several frameworks, so a chooser appears. Pick by
			// name rather than taking whatever is highlighted.
			const input = document.querySelector('.prompt input') as HTMLInputElement | null;
			if (input) {
				input.value = args.ontology;
				input.dispatchEvent(new Event('input', { bubbles: true }));
				await new Promise((resolve) => setTimeout(resolve, 500));
				input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
			}
			const deadline = Date.now() + 30000;
			while (Date.now() < deadline) {
				const file = app.vault.getMarkdownFiles()
					.find((f) => f.path.includes('coverage') && f.path.includes(args.ontology));
				if (file instanceof obsidian.TFile) return { path: file.path, text: await app.vault.read(file) };
				await new Promise((resolve) => setTimeout(resolve, 250));
			}
			return { path: '', text: '' };
		}, { ontology: 'mitre-attack' });

		expect(written.path).not.toBe('');
		// Every invalidated link is named, with a reason a reader can act on.
		for (const scenario of SCENARIOS.filter((s) => s.expectFlag)) {
			expect(written.text).toContain(`jn-${scenario.id}.md`);
		}
		expect(written.text).toContain('subject-changed');
		// And the pre-feature link is reported as un-judgeable, never as fine.
		expect(written.text).toContain(`jn-${NO_BASELINE_ID}-pre-feature.md`);
		expect(written.text.toLowerCase()).toContain('cannot tell');
	});
});
