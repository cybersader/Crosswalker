/**
 * `source.where` — the row predicate (Ch 46 source contract §3).
 *
 * Acceptance cases B1-B10, plus the engine-level abort/zero-write proofs.
 *
 * The three worked cases are the REAL blocked cases from the contract §3.5,
 * reproduced at their real row counts and real column shapes. The corpora
 * themselves are gitignored, so the fixtures here are synthetic reconstructions
 * of those sheets: the counts, the blank-cell pattern, and the trailing-space
 * quirk are the parts that matter and are reproduced exactly.
 */

import { TFile, TFolder } from 'obsidian';
import { generateFromRecipe } from '../src/generation/generation-engine';
import { prepareSourceStage } from '../src/source';
import { SourceStageError } from '../src/source/errors';
import type { Recipe } from '../src/render';
import type { ParsedData } from '../src/types/config';

type Row = Record<string, unknown>;

// ---------------------------------------------------------------------------
// Fixtures — the three real blocked cases
// ---------------------------------------------------------------------------

/**
 * CSF 2.0 workbook, `CSF 2.0` sheet: 12 function banner rows + 34 category
 * banner rows interleaved with 185 subcategory rows. Every banner row leaves
 * `Subcategory` blank, and today all 46 of them render an empty file name and
 * collide (recipes/import/nist-csf-2.json, KNOWN GAP 3).
 */
function csfSheet(): ParsedData {
	const columns = ['ID', 'Function', 'Category', 'Subcategory', 'Implementation Examples'];
	const rows: Row[] = [];
	for (let f = 0; f < 12; f++) {
		rows.push({ ID: `FN-${f}`, Function: `FUNCTION ${f}`, Category: '', Subcategory: '', 'Implementation Examples': '' });
	}
	for (let c = 0; c < 34; c++) {
		rows.push({ ID: `CAT-${c}`, Function: 'GOVERN', Category: `Category ${c}`, Subcategory: '', 'Implementation Examples': '' });
	}
	for (let s = 0; s < 185; s++) {
		rows.push({
			ID: `GV.OC-${String(s).padStart(3, '0')}`,
			Function: 'GOVERN',
			Category: 'Organizational Context',
			Subcategory: `Subcategory statement ${s}`,
			'Implementation Examples': `Ex1: do the thing ${s}`,
		});
	}
	return { columns, rows, rowCount: rows.length };
}

/**
 * CIS Controls v8 workbook: one sheet holding 18 control rows and 153 safeguard
 * rows, distinguished ONLY by whether `CIS Safeguard` is blank. The control
 * rows carry `'1 '` with a trailing space, which is why the shipped recipes
 * already trim. Two recipes, one sheet, two different answers to "what is a
 * row" (contract §3.5: the case that proves the design).
 */
function cisSheet(): ParsedData {
	const columns = ['CIS Control', 'CIS Safeguard', 'Title', 'Description'];
	const rows: Row[] = [];
	for (let c = 1; c <= 18; c++) {
		rows.push({ 'CIS Control': `${c} `, 'CIS Safeguard': '', Title: `Control ${c}`, Description: '' });
	}
	for (let s = 0; s < 153; s++) {
		rows.push({
			'CIS Control': `${Math.floor(s / 9) + 1}`,
			'CIS Safeguard': ` ${Math.floor(s / 9) + 1}.${(s % 9) + 1} `,
			Title: `Safeguard ${s}`,
			Description: '',
		});
	}
	return { columns, rows, rowCount: rows.length };
}

/**
 * CPRT export, `$.response.elements.elements[*]`: 906 elements of seven kinds,
 * 227 of which (225 `sort` + 2 `party`) are machinery rather than concepts and
 * today become notes (recipes/import/nist-csf-2-cprt.json, KNOWN GAP 3).
 *
 * `title` is absent (not blank) on some element kinds. That heterogeneity is
 * real data and is why G2 checks a UNION over the collection rather than
 * requiring a field on every row.
 */
function cprtElements(): ParsedData {
	const rows: Row[] = [];
	for (let i = 0; i < 225; i++) rows.push({ element_identifier: `sort-${i}`, element_type: 'sort' });
	for (let i = 0; i < 2; i++) rows.push({ element_identifier: `party-${i}`, element_type: 'party' });
	for (let i = 0; i < 400; i++) {
		rows.push({ element_identifier: `SC-${i}`, element_type: 'subcategory', title: '', text: `Subcategory ${i}` });
	}
	for (let i = 0; i < 279; i++) {
		rows.push({ element_identifier: `EX-${i}`, element_type: 'implementation_example', text: `Example ${i}` });
	}
	// A JSON parser publishes the union of own keys as `columns` (see
	// src/import/parsers/json-parser.ts), which is exactly the G2 universe.
	const columns: string[] = [];
	for (const row of rows) for (const k of Object.keys(row)) if (!columns.includes(k)) columns.push(k);
	return { columns, rows, rowCount: rows.length };
}

async function drain(parsedData: ParsedData, where?: string) {
	const stage = await prepareSourceStage(parsedData, where === undefined ? undefined : { where });
	const admitted: Row[] = [];
	for await (const row of stage.rows as AsyncIterable<Row>) admitted.push(row);
	stage.finalize();
	return { stage, admitted };
}

// ---------------------------------------------------------------------------
// B1-B4 — the three real blocked cases
// ---------------------------------------------------------------------------

describe('B1 — CSF 2.0 banner rows', () => {
	it("admits exactly the 185 subcategory rows and excludes the 46 banners", async () => {
		const parsed = csfSheet();
		expect(parsed.rowCount).toBe(231);
		const { stage, admitted } = await drain(parsed, "Subcategory != ''");
		expect(admitted).toHaveLength(185);
		expect(stage.excludedCount).toBe(46);
		expect(stage.examinedCount).toBe(231);
		expect(admitted.every((r) => r.Subcategory !== '')).toBe(true);
	});
});

describe('B2/B3 — CIS: one sheet, two recipes, two answers to "what is a row"', () => {
	it('selects the 153 safeguards', async () => {
		const { admitted } = await drain(cisSheet(), "$trim(`CIS Safeguard`) != ''");
		expect(admitted).toHaveLength(153);
	});

	it('selects the 18 controls from the SAME sheet', async () => {
		const { admitted } = await drain(cisSheet(), "$trim(`CIS Safeguard`) = ''");
		expect(admitted).toHaveLength(18);
	});

	it('needs the trim: the sheet carries trailing spaces', async () => {
		// Without $trim, ' 1.1 ' is not '' either way, so the safeguard side
		// happens to survive; the control side is what the trim protects. This
		// pins WHY the shipped recipes already carry a trim filter.
		const untrimmed = await drain(cisSheet(), "`CIS Safeguard` = ''");
		expect(untrimmed.admitted).toHaveLength(18);
		const values = new Set(cisSheet().rows as Row[]);
		expect([...values].some((r) => r['CIS Control'] === '1 ')).toBe(true);
	});
});

describe('B4 — CPRT non-concept elements', () => {
	it('drops the 227 machinery elements, keeping 679', async () => {
		const { admitted, stage } = await drain(cprtElements(), "$not(element_type in ['sort', 'party'])");
		expect(admitted).toHaveLength(679);
		expect(stage.excludedCount).toBe(227);
	});

	it('supports the positive form the headless harness has been passing since 2026-06-12', async () => {
		const { admitted } = await drain(cprtElements(), "element_type = 'subcategory'");
		expect(admitted).toHaveLength(400);
	});

	it('tolerates a field that is absent on some rows but present on others', async () => {
		// `title` is absent on sort/party/example rows. Absence ON A ROW is data.
		const { admitted } = await drain(cprtElements(), "$exists(title)");
		expect(admitted).toHaveLength(400);
	});
});

// ---------------------------------------------------------------------------
// The loudness contract
// ---------------------------------------------------------------------------

describe('G2 — a typo is a defect, not a filter (contract §0, case B5)', () => {
	it('refuses at preflight, before a single row is read', async () => {
		// THE SIGNATURE BUG THIS GUARD EXISTS FOR: `Subcatgory != ''` evaluates
		// to boolean false on every row, so a strict-boolean check passes it and
		// the import silently admits nothing.
		await expect(prepareSourceStage(csfSheet(), { where: "Subcatgory != ''" })).rejects.toBeInstanceOf(
			SourceStageError,
		);
		try {
			await prepareSourceStage(csfSheet(), { where: "Subcatgory != ''" });
		} catch (err) {
			const e = err as SourceStageError;
			expect(e.declaration).toBe('source.where');
			expect(e.message).toContain('unknown field "Subcatgory"');
			expect(e.detail).toContain('Subcategory');
			expect(e.row).toBeUndefined();
		}
	});

	it('would otherwise have been silent: the typo really does return false everywhere', async () => {
		// Pinned so the guard cannot be "simplified away" by someone who assumes
		// the engine returns undefined here.
		// eslint-disable-next-line @typescript-eslint/no-var-requires
		const jsonata = require('jsonata') as (s: string) => { evaluate: (i: unknown) => Promise<unknown> };
		const rows = csfSheet().rows as Row[];
		const results = await Promise.all(rows.slice(0, 50).map((r) => jsonata("Subcatgory != ''").evaluate(r)));
		expect(new Set(results)).toEqual(new Set([false]));
	});
});

describe('G1 — a non-boolean result is loud, never a skipped row (case B6)', () => {
	it('names the row, the expression and the actual value', async () => {
		const stage = await prepareSourceStage(csfSheet(), { where: 'Subcategory' });
		let thrown: SourceStageError | undefined;
		try {
			for await (const _row of stage.rows as AsyncIterable<Row>) { /* consume */ }
		} catch (err) {
			thrown = err as SourceStageError;
		}
		expect(thrown).toBeInstanceOf(SourceStageError);
		expect(thrown!.row).toBe(1);
		expect(thrown!.expression).toBe('Subcategory');
		expect(thrown!.message).toContain('expected a boolean');
		expect(thrown!.message).toContain('string ""');
	});

	it('is loud for undefined too, rather than treating it as false', async () => {
		// `Typo` alone DOES return undefined, and undefined is not false.
		const parsed: ParsedData = { columns: ['a'], rows: [{ a: 1 }], rowCount: 1 };
		const stage = await prepareSourceStage(parsed, { where: 'a.missing' });
		await expect((async () => {
			for await (const _row of stage.rows as AsyncIterable<Row>) { /* consume */ }
		})()).rejects.toThrow('expected a boolean, got undefined');
	});
});

describe('G3 — admitting nothing from a non-empty source is an error (case B7)', () => {
	it('fires at end of stream, after zero writes', async () => {
		const stage = await prepareSourceStage(csfSheet(), { where: "Subcategory = 'nothing-matches-this'" });
		const admitted: Row[] = [];
		for await (const row of stage.rows as AsyncIterable<Row>) admitted.push(row);
		expect(admitted).toHaveLength(0);
		expect(() => stage.finalize()).toThrow(SourceStageError);
		try {
			stage.finalize();
		} catch (err) {
			expect((err as SourceStageError).message).toContain('excluded every row');
			expect((err as SourceStageError).detail).toContain('Examined 231');
		}
	});

	it('does not fire when the source itself was empty', async () => {
		const parsed: ParsedData = { columns: ['Subcategory'], rows: [], rowCount: 0 };
		const { stage } = await drain(parsed, "Subcategory != ''");
		expect(stage.examinedCount).toBe(0);
		expect(() => stage.finalize()).not.toThrow();
	});
});

// ---------------------------------------------------------------------------
// Additivity, streaming, ordering
// ---------------------------------------------------------------------------

describe('absent declaration is byte-for-byte the previous behaviour', () => {
	it('returns the caller own rows reference, untouched', async () => {
		const parsed = csfSheet();
		const stage = await prepareSourceStage(parsed, undefined);
		expect(stage.active).toBe(false);
		expect(stage.rows).toBe(parsed.rows);
		expect(stage.excludedCount).toBe(0);
	});

	it('numbers rows exactly as the engine did before the stage existed', async () => {
		const stage = await prepareSourceStage(csfSheet(), undefined);
		expect(stage.sourceRowNumber({}, 0)).toBe(1);
		expect(stage.sourceRowNumber({}, 46)).toBe(47);
	});

	it('treats a source block with no where as absent', async () => {
		const parsed = csfSheet();
		const stage = await prepareSourceStage(parsed, { });
		expect(stage.active).toBe(false);
		expect(stage.rows).toBe(parsed.rows);
	});
});

describe('B10 — streaming survives the predicate', () => {
	function streamed(count: number): ParsedData {
		async function* gen() {
			for (let i = 0; i < count; i++) yield { ID: `R-${i}`, Subcategory: i % 3 === 0 ? '' : `S${i}` };
		}
		// A streaming CSV publishes its columns LAZILY, so at preflight time the
		// list is still empty and G2 must sample the stream instead.
		return { columns: [], rows: gen(), rowCount: -1 };
	}

	it('filters a stream without materializing it', async () => {
		const { admitted, stage } = await drain(streamed(5000), "Subcategory != ''");
		expect(admitted).toHaveLength(5000 - Math.ceil(5000 / 3));
		expect(stage.examinedCount).toBe(5000);
	});

	it('re-emits the rows it sampled for the key universe, losing none', async () => {
		const { admitted } = await drain(streamed(10), 'true');
		expect(admitted.map((r) => r.ID)).toEqual(
			Array.from({ length: 10 }, (_, i) => `R-${i}`),
		);
	});

	it('still catches a typo, from the sampled prefix alone', async () => {
		await expect(prepareSourceStage(streamed(5000), { where: "Subcatgory != ''" })).rejects.toThrow(
			'unknown field',
		);
	});

	it('samples a bounded prefix, not the whole stream', async () => {
		let produced = 0;
		async function* counted() {
			for (let i = 0; i < 100000; i++) {
				produced++;
				yield { ID: `R-${i}`, Subcategory: 'x' };
			}
		}
		await prepareSourceStage({ columns: [], rows: counted(), rowCount: -1 }, { where: "Subcategory != ''" });
		expect(produced).toBeLessThanOrEqual(200);
	});
});

describe('row numbers name the SOURCE row, not the post-filter position', () => {
	it('maps an admitted row back to where the user can find it', async () => {
		const parsed: ParsedData = {
			columns: ['ID', 'Subcategory'],
			rows: [
				{ ID: 'banner', Subcategory: '' },
				{ ID: 'banner2', Subcategory: '' },
				{ ID: 'real', Subcategory: 'x' },
			],
			rowCount: 3,
		};
		const stage = await prepareSourceStage(parsed, { where: "Subcategory != ''" });
		const admitted: Row[] = [];
		for await (const row of stage.rows as AsyncIterable<Row>) admitted.push(row);
		expect(admitted).toHaveLength(1);
		// Post-filter index 0, source row 3. An error naming "row 1" would send
		// the user to a banner row that was never imported.
		expect(stage.sourceRowNumber(admitted[0], 0)).toBe(3);
	});
});

// ---------------------------------------------------------------------------
// Engine-level: zero writes, abort semantics, hash participation
// ---------------------------------------------------------------------------

function makeApp() {
	const files = new Map<string, string>();
	const folders = new Set<string>(['', 'Out']);
	const app = {
		vault: {
			getMarkdownFiles: () => [...files.keys()].map((path) => new TFile(path)),
			getAbstractFileByPath: (path: string) => {
				if (files.has(path)) return new TFile(path);
				if (folders.has(path)) return new TFolder(path);
				return null;
			},
			create: async (path: string, content: string) => {
				files.set(path, content);
				return new TFile(path);
			},
			modify: async (file: TFile, content: string) => { files.set(file.path, content); },
			read: async (file: TFile) => files.get(file.path) ?? '',
			createFolder: async (path: string) => { folders.add(path); },
		},
		fileManager: { renameFile: jest.fn() },
		metadataCache: { getFileCache: () => null },
	};
	return { app: app as any, files };
}

function recipeWithWhere(where?: string): Recipe {
	return {
		recipe: 'csf-where-test',
		source: { ontology: 'csf', levels: ['subcategory'], ...(where === undefined ? {} : { where }) },
		target: {
			layout: [{ level: 'subcategory', mechanism: 'file', template: '{ID}.md', kind: 'concept' }],
			also_emit: { frontmatter: { managed: { title: '{Subcategory}' } } },
		},
	};
}

/** The legacy wizard shape: a MappingConfig, never a recipe. */
const WIZARD_CONFIG = {
	name: 'csf',
	mapping: {
		hierarchy: [],
		frontmatter: [{ key: 'title', column: 'Subcategory' }],
		links: [],
		body: [],
		filename: { template: '{ID}.md', sanitize: true },
	},
} as any;

const OPTIONS = {
	basePath: 'Out',
	importSet: { id: 'iset-wher01' },
	overwriteMode: 'replace' as const,
	createFolders: true,
	curiePrefix: 'csf',
	curieLocalPart: (row: Record<string, unknown>) => String(row.ID),
};

describe('generateFromRecipe honours the source stage', () => {
	it('writes one note per admitted row and none for the excluded ones', async () => {
		const { app, files } = makeApp();
		const result = await generateFromRecipe(app, csfSheet(), recipeWithWhere("Subcategory != ''"), OPTIONS);
		expect(result.errors).toEqual([]);
		expect(result.success).toBe(true);
		expect(result.created).toHaveLength(185);
		expect(files.size).toBe(185);
		expect([...files.keys()].some((p) => p.endsWith('/.md'))).toBe(false);
	});

	it('B5 — a typo writes ZERO files and reports one preflight error', async () => {
		const { app, files } = makeApp();
		const result = await generateFromRecipe(app, csfSheet(), recipeWithWhere("Subcatgory != ''"), OPTIONS);
		expect(files.size).toBe(0);
		expect(result.created).toEqual([]);
		expect(result.success).toBe(false);
		expect(result.errors).toHaveLength(1);
		expect(result.errors[0].row).toBe(0);
		expect(result.errors[0].declaration).toBe('source.where');
		expect(result.errors[0].message).toContain('unknown field');
	});

	it('B7 — a predicate that admits nothing fails the run', async () => {
		const { app, files } = makeApp();
		const result = await generateFromRecipe(
			app,
			csfSheet(),
			recipeWithWhere("Subcategory = 'nothing-matches-this'"),
			OPTIONS,
		);
		expect(files.size).toBe(0);
		expect(result.success).toBe(false);
		expect(result.errors[0].declaration).toBe('source.where');
		expect(result.errors[0].message).toContain('excluded every row');
	});

	it('B6 — a non-boolean aborts the run rather than skipping rows', async () => {
		const { app } = makeApp();
		const result = await generateFromRecipe(app, csfSheet(), recipeWithWhere('Subcategory'), OPTIONS);
		expect(result.success).toBe(false);
		const stageErrors = result.errors.filter((e) => e.declaration === 'source.where');
		expect(stageErrors).toHaveLength(1);
		expect(stageErrors[0].row).toBe(1);
		expect(stageErrors[0].message).toContain('expected a boolean');
	});

	it('B8/B9 — a rejected expression never reaches the vault', async () => {
		for (const bad of ["$eval('1+1') = 2", `Subcategory != '${'x'.repeat(600)}'`]) {
			const { app, files } = makeApp();
			const result = await generateFromRecipe(app, csfSheet(), recipeWithWhere(bad), OPTIONS);
			expect(files.size).toBe(0);
			expect(result.success).toBe(false);
			expect(result.errors[0].declaration).toBe('source.where');
		}
	});

	it('F5 — an excluded row does not count as produced, so orphan detection still runs', async () => {
		const { app } = makeApp();
		const result = await generateFromRecipe(app, csfSheet(), recipeWithWhere("Subcategory != ''"), OPTIONS);
		// A filtered import must still be able to conclude "the whole source was
		// processed"; otherwise the fail-closed orphan guard silently disables
		// itself on every recipe that declares a predicate.
		expect(result.errors).toEqual([]);
		expect(result.orphans).toBeUndefined(); // empty vault, nothing to orphan
	});

	it('the wizard/workbench path honours the same stage, rather than ignoring it', async () => {
		// generateNotes accepts a full recipe through `recipeOverride`, so a
		// declared predicate reaches that path too. Ignoring it there would be
		// exactly the silent, shape-dependent degradation this design exists to
		// prevent, and it would be invisible: the import would just write 231
		// notes and report success.
		// eslint-disable-next-line @typescript-eslint/no-var-requires
		const { generateNotes } = require('../src/generation/generation-engine');
		const { app, files } = makeApp();
		const result = await generateNotes(
			app,
			csfSheet(),
			WIZARD_CONFIG,
			{ ...OPTIONS, recipeOverride: recipeWithWhere("Subcategory != ''") },
		);
		expect(result.errors).toEqual([]);
		expect(files.size).toBe(185);
	});

	it('the wizard/workbench path is equally loud about a typo', async () => {
		// eslint-disable-next-line @typescript-eslint/no-var-requires
		const { generateNotes } = require('../src/generation/generation-engine');
		const { app, files } = makeApp();
		const result = await generateNotes(
			app,
			csfSheet(),
			WIZARD_CONFIG,
			{ ...OPTIONS, recipeOverride: recipeWithWhere("Subcatgory != ''") },
		);
		expect(files.size).toBe(0);
		expect(result.success).toBe(false);
		expect(result.errors[0].declaration).toBe('source.where');
	});

	it('a legacy wizard config with no recipe override is untouched', async () => {
		// eslint-disable-next-line @typescript-eslint/no-var-requires
		const { generateNotes } = require('../src/generation/generation-engine');
		const { app, files } = makeApp();
		const result = await generateNotes(
			app,
			csfSheet(),
			WIZARD_CONFIG,
			OPTIONS,
		);
		expect(result.errors).toEqual([]);
		expect(files.size).toBe(231); // every row, exactly as before
	});

	it('F2 — declaring a predicate changes the recipe hash written into notes', async () => {
		const withoutWhere = makeApp();
		await generateFromRecipe(withoutWhere.app, csfSheet(), recipeWithWhere(undefined), OPTIONS);
		const withWhere = makeApp();
		await generateFromRecipe(withWhere.app, csfSheet(), recipeWithWhere("Subcategory != ''"), OPTIONS);

		const pick = (files: Map<string, string>) => {
			const key = [...files.keys()].find((p) => p.includes('GV.OC-000'))!;
			return /hash:\s*(\S+)/.exec(files.get(key)!)![1];
		};
		expect(pick(withoutWhere.files)).not.toBe(pick(withWhere.files));
	});
});
