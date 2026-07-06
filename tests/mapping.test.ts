/**
 * mapping.test.ts — the StructureMapping model layer (shape-first workbench §3a½/§3c/§5/§7b).
 *
 * Covers:
 *   - preset schema validation (built-ins pass; a column-naming preset fails)
 *   - instantiation over REAL Phase-A detection outputs (ATT&CK + CSF shapes)
 *   - the ROUND-TRIP LAW: mapping → toRecipeRegions → fromRegions → deep-equal
 *   - corpus reconstruction of real recipes/import/*.json
 *   - lossy-field pinning (missing / materialize have no recipe surface yet)
 *   - determinism
 */

import Ajv2020 from 'ajv/dist/2020';
import addFormats from 'ajv-formats';

import presetSchema from '../spec/preset.schema.json';
import csfRecipe from '../recipes/import/nist-csf-2-cprt-hierarchical.json';
import mitreRecipe from '../recipes/import/mitre-attack-technique.json';
import cisRecipe from '../recipes/import/cis-controls-v8-controls.json';

import { detectStructure } from '../src/import/detection';
import type { Detection } from '../src/import/detection';
import { analyzeColumns } from '../src/import/parsers/csv-parser';
import type { ParsedData, ColumnInfo } from '../src/types/config';

import {
	BUILT_IN_PRESETS,
	BROWSABLE_FRAMEWORK,
	DEEP_EVERYTHING,
	getBuiltInPreset,
} from '../src/import/mapping/presets';
import { instantiate } from '../src/import/mapping/instantiate';
import { toRecipeRegions, fromRegions, fromRecipe } from '../src/import/mapping/serialize';
import type { RecipeRegions } from '../src/import/mapping/serialize';
import type { ImportMapping } from '../src/import/mapping/types';

// ---------------------------------------------------------------------------
// Fixture helpers
// ---------------------------------------------------------------------------

function makeData(rows: Record<string, unknown>[]): { data: ParsedData; columns: ColumnInfo[] } {
	const columns = rows.length > 0 ? Object.keys(rows[0]) : [];
	const data: ParsedData = { columns, rows, rowCount: rows.length };
	return { data, columns: analyzeColumns(data) };
}

function detect(rows: Record<string, unknown>[]): Detection[] {
	const { data, columns } = makeData(rows);
	return detectStructure(data, columns);
}

function rowsFrom(column: string, values: string[]): Record<string, unknown>[] {
	return values.map((v) => ({ [column]: v }));
}

// ===========================================================================
// 1. Preset schema validation
// ===========================================================================

describe('preset schema validation', () => {
	const ajv = new Ajv2020({ allErrors: true, strict: false });
	addFormats(ajv);
	const validate = ajv.compile(presetSchema);

	it('every built-in preset validates against preset.schema.json', () => {
		for (const [id, preset] of Object.entries(BUILT_IN_PRESETS)) {
			const ok = validate(preset);
			expect({ id, ok, errors: validate.errors }).toEqual({ id, ok: true, errors: null });
		}
	});

	it('rejects a preset that names a column (presets must be level-agnostic)', () => {
		const bad = {
			preset: 'bad-names-a-column',
			structural: {
				// A destination binding a specific column is exactly what makes a preset NOT
				// level-agnostic; additionalProperties:false rejects it.
				every_level: { destinations: [{ primitive: 'folder', column: 'element_identifier' }] },
			},
		};
		expect(validate(bad)).toBe(false);
	});

	it('rejects a preset with an unknown top-level key', () => {
		const bad = { preset: 'x', structural: {}, columns: ['id'] };
		expect(validate(bad)).toBe(false);
	});
});

// ===========================================================================
// 2. Instantiation over real detection outputs
// ===========================================================================

describe('instantiation — packed hierarchy (real detections)', () => {
	// ATT&CK-shaped: ~40% sub-techniques → ragged '.' → variadic tail.
	const attack = ['T1055', 'T1059', 'T1003', 'T1071', 'T1027', 'T1005', 'T1055.011', 'T1059.001', 'T1003.001', 'T1071.004'];
	// CSF-shaped: uniform two-delimiter → fixed folders.
	const csf = ['GV.OC-01', 'GV.OC-02', 'DE.AE-02', 'DE.AE-03', 'PR.AA-05', 'ID.AM-01'];

	it('ragged ATT&CK → a mapping with a variadic tail + a leaf name level', () => {
		const detections = detect(rowsFrom('technique_id', attack));
		const mapping = instantiate(BROWSABLE_FRAMEWORK, detections);

		expect(mapping.mappings.length).toBe(1);
		const m = mapping.mappings[0];
		expect(m.tail).toBeDefined();
		expect(m.tail!.delimiter).toBe('.');
		expect(m.tail!.naming).toBe('prefix');
		expect(m.tail!.destinations).toEqual([{ primitive: 'folder' }]);
		// preset tail policy applied
		expect(m.tail!.max_depth).toBe(6);
		expect(m.tail!.on_overflow).toBe('truncate');
		// leaf carries a name destination
		const leaf = m.levels.find((l) => l.destinations.some((d) => d.primitive === 'name'));
		expect(leaf).toBeDefined();
		expect(leaf!.source).toEqual({ column: 'technique_id' });
	});

	it('uniform CSF → fixed folder levels + a leaf, in order', () => {
		const detections = detect(rowsFrom('element_identifier', csf));
		const mapping = instantiate(BROWSABLE_FRAMEWORK, detections);

		expect(mapping.mappings.length).toBe(1);
		const levels = mapping.mappings[0].levels;
		expect(levels.length).toBe(3);
		expect(levels[0].destinations).toEqual([{ primitive: 'folder' }]);
		expect(levels[0].source).toEqual({ column: 'element_identifier', part: 0 });
		expect(levels[0].delimiter).toBe('.');
		expect(levels[1].destinations).toEqual([{ primitive: 'folder' }]);
		expect(levels[1].delimiter).toBe('-');
		expect(levels[2].destinations).toEqual([{ primitive: 'name' }]);
		expect(mapping.mappings[0].tail).toBeUndefined();
	});

	it('deep-everything puts folder + nested tag on every structural level', () => {
		const detections = detect(rowsFrom('element_identifier', csf));
		const mapping = instantiate(DEEP_EVERYTHING, detections);
		const level0 = mapping.mappings[0].levels[0];
		expect(level0.destinations).toEqual([
			{ primitive: 'folder' },
			{ primitive: 'tag', namespace: 'element-identifier' },
		]);
	});

	it('matrix is never empty when any detection exists', () => {
		// A title-only detection produces no structural/facet/link mapping on its own,
		// but the defaults law still yields a non-empty matrix.
		const titleOnly: Detection[] = [
			{ kind: 'title-candidate', column: 'name', distinctness: 1, sampleValues: ['Alpha', 'Beta'] },
		];
		const mapping = instantiate(BROWSABLE_FRAMEWORK, titleOnly);
		expect(mapping.mappings.length).toBeGreaterThan(0);
		expect(mapping.mappings[0].levels.length).toBeGreaterThan(0);
	});

	it('empty detections → empty matrix (nothing to instantiate)', () => {
		expect(instantiate(BROWSABLE_FRAMEWORK, [])).toEqual({ mappings: [] });
	});
});

describe('instantiation — facet + parent-column', () => {
	const rows: Record<string, unknown>[] = [];
	const tactics = ['recon', 'access', 'execution', 'persistence', 'evasion', 'impact'];
	for (let i = 0; i < 200; i++) rows.push({ id: String(i), tactic: tactics[i % 6], parent_id: i > 0 ? String(i - 1) : '' });

	it('facet detection → a tag mapping; parent detection → a link mapping', () => {
		const detections = detect(rows);
		const mapping = instantiate(BROWSABLE_FRAMEWORK, detections);
		const kinds = mapping.mappings.flatMap((m) => m.levels.flatMap((l) => l.destinations.map((d) => d.primitive)));
		expect(kinds).toContain('tag');
		expect(kinds).toContain('link');
	});
});

// ===========================================================================
// 3. The round-trip law
// ===========================================================================

/** Assert fromRegions(toRecipeRegions(m)) deep-equals m. */
function assertRoundTrip(m: ImportMapping): void {
	const regions = toRecipeRegions(m);
	const back = fromRegions(regions);
	expect(back).toEqual(m);
}

describe('round-trip law: mapping → regions → mapping', () => {
	it('uniform fixed levels (two folders + a leaf file)', () => {
		assertRoundTrip({
			mappings: [
				{
					levels: [
						{ level: 'level-1', source: { column: 'id', part: 0 }, delimiter: '.', destinations: [{ primitive: 'folder' }], naming: 'part', missing: 'skip', materialize: false },
						{ level: 'level-2', source: { column: 'id', part: 0 }, delimiter: '-', destinations: [{ primitive: 'folder' }], naming: 'part', missing: 'skip', materialize: false },
						{ level: 'leaf', source: { column: 'id' }, filters: ['fs-safe'], destinations: [{ primitive: 'name' }], naming: 'part', missing: 'skip', materialize: false },
					],
				},
			],
		});
	});

	it('merged range (the CSF prefix trick — one folder from parts [0,1])', () => {
		assertRoundTrip({
			mappings: [
				{
					levels: [
						{ level: 'prefix', source: { column: 'tid', part: [0, 1] }, delimiter: '.', join: '.', destinations: [{ primitive: 'folder' }], naming: 'joined', missing: 'skip', materialize: false },
						{ level: 'leaf', source: { column: 'tid' }, destinations: [{ primitive: 'name' }], naming: 'part', missing: 'skip', materialize: false },
					],
				},
			],
		});
	});

	it('ragged tail (variadic block)', () => {
		assertRoundTrip({
			mappings: [
				{
					levels: [
						{ level: 'leaf', source: { column: 'tid' }, destinations: [{ primitive: 'name' }], naming: 'part', missing: 'skip', materialize: false },
					],
					tail: {
						source: { column: 'tid' },
						delimiter: '.',
						drop_last: true,
						destinations: [{ primitive: 'folder' }],
						naming: 'prefix',
						max_depth: 6,
						on_overflow: 'truncate',
					},
				},
			],
		});
	});

	it('multi-destination row (folder + property + tag off one source)', () => {
		assertRoundTrip({
			mappings: [
				{
					levels: [
						{
							level: 'level-1',
							source: { column: 'id', part: 0 },
							delimiter: '.',
							destinations: [
								{ primitive: 'folder' },
								{ primitive: 'property', key: 'fn' },
								{ primitive: 'tag', namespace: 'fn' },
							],
							naming: 'part',
							missing: 'skip',
							materialize: false,
						},
					],
				},
			],
		});
	});

	it('link + facet mappings (no layout, two standalone mappings)', () => {
		assertRoundTrip({
			mappings: [
				{
					levels: [
						{ level: 'tactic', source: { column: 'tactic' }, destinations: [{ primitive: 'tag', namespace: 'tactic' }], naming: 'part', missing: 'skip', materialize: false },
					],
				},
				{
					levels: [
						{ level: 'parent', source: { column: 'parent' }, destinations: [{ primitive: 'link', key: 'parent', direction: 'parent-on-child' }], naming: 'part', missing: 'skip', materialize: false },
					],
				},
			],
		});
	});

	it('alias + property on a standalone source', () => {
		assertRoundTrip({
			mappings: [
				{
					levels: [
						{
							level: 'title',
							source: { column: 'title' },
							filters: ['trim'],
							destinations: [{ primitive: 'property', key: 'title' }, { primitive: 'alias' }],
							naming: 'part',
							missing: 'skip',
							materialize: false,
						},
					],
				},
			],
		});
	});
});

// ===========================================================================
// 4. Lossy-field pinning (known spec gaps)
// ===========================================================================

describe('lossy fields (no recipe surface — pinned so the gap stays visible)', () => {
	it('per-level `missing` and `materialize` do NOT survive serialization', () => {
		const m: ImportMapping = {
			mappings: [
				{
					levels: [
						{ level: 'leaf', source: { column: 'id' }, destinations: [{ primitive: 'name' }], naming: 'part', missing: 'error', materialize: true },
					],
				},
			],
		};
		const back = fromRegions(toRecipeRegions(m));
		const leaf = back.mappings[0].levels[0];
		// TODO(architect): wire a recipe surface for per-level missing policy + materialize.
		expect(leaf.missing).toBe('skip');
		expect(leaf.materialize).toBe(false);
	});

	it('row filters do NOT survive serialization', () => {
		const m: ImportMapping = {
			mappings: [
				{ levels: [{ level: 'leaf', source: { column: 'id' }, destinations: [{ primitive: 'name' }], naming: 'part', missing: 'skip', materialize: false }] },
			],
			filters: [{ column: 'status', op: 'equals', value: 'active' }],
		};
		const back = fromRegions(toRecipeRegions(m));
		// TODO(architect): recipes have no row-filter region yet.
		expect(back.filters).toBeUndefined();
	});

	it('tail `placement` does NOT survive serialization', () => {
		const m: ImportMapping = {
			mappings: [
				{
					levels: [{ level: 'leaf', source: { column: 'tid' }, destinations: [{ primitive: 'name' }], naming: 'part', missing: 'skip', materialize: false }],
					tail: { source: { column: 'tid' }, delimiter: '.', destinations: [{ primitive: 'folder' }], naming: 'prefix', placement: 'folder-note' },
				},
			],
		};
		const back = fromRegions(toRecipeRegions(m));
		// TODO(architect): parent_note (sibling|folder-note) is a pending schema knob.
		expect(back.mappings[0].tail!.placement).toBeUndefined();
	});
});

// ===========================================================================
// 5. Corpus reconstruction of real recipes
// ===========================================================================

/** Compare serialized regions to a recipe's own target regions (order-tolerant on managed). */
function assertReSerializesEquivalent(recipe: { target: RecipeRegions }): void {
	const mapping = fromRecipe(recipe as { target: RecipeRegions });
	const regions = toRecipeRegions(mapping);
	expect(regions.layout).toEqual(recipe.target.layout);
	const originalManaged = recipe.target.also_emit?.frontmatter?.managed ?? {};
	const roundManaged = regions.also_emit?.frontmatter?.managed ?? {};
	expect(roundManaged).toEqual(originalManaged);
}

describe('corpus — real recipes reconstruct + re-serialize equivalently', () => {
	it('nist-csf-2-cprt-hierarchical (folder / folder / file + merged managed properties)', () => {
		const mapping = fromRecipe(csfRecipe as unknown as { target: RecipeRegions });
		// Structural mapping present with three layout-derived levels.
		const structural = mapping.mappings[0];
		expect(structural.levels.length).toBe(3);
		expect(structural.levels[0].destinations.some((d) => d.primitive === 'folder')).toBe(true);
		// The function/category managed props re-group onto their folder levels (shared source).
		expect(structural.levels[0].destinations.some((d) => d.primitive === 'property')).toBe(true);
		assertReSerializesEquivalent(csfRecipe as unknown as { target: RecipeRegions });
	});

	it('mitre-attack-technique (single file leaf + standalone managed properties)', () => {
		const mapping = fromRecipe(mitreRecipe as unknown as { target: RecipeRegions });
		const structural = mapping.mappings[0];
		expect(structural.levels[0].destinations).toEqual([{ primitive: 'name' }]);
		expect(structural.levels[0].source).toEqual({ column: 'external_references.0.external_id' });
		assertReSerializesEquivalent(mitreRecipe as unknown as { target: RecipeRegions });
	});

	it('cis-controls-v8-controls (leaf with a trim|fs-safe filter chain)', () => {
		const recipe = cisRecipe as unknown as { target: RecipeRegions };
		const mapping = fromRecipe(recipe);
		expect(mapping.mappings[0].levels[0].filters).toEqual(['trim', 'fs-safe']);
		// Layout (the single file leaf) round-trips exactly.
		const regions = toRecipeRegions(mapping);
		expect(regions.layout).toEqual(recipe.target.layout);
		// KNOWN LIMITATION (architect input): a CONSTANT managed value ("level": "control",
		// no {template}) is not expressible in the source-based model — it reconstructs as a
		// whole-column reference and re-serializes as "{control}". The templated keys are
		// equivalent; the constant is the one lossy field. Pin both so the gap stays visible.
		const originalManaged = recipe.target.also_emit!.frontmatter!.managed!;
		const roundManaged = regions.also_emit!.frontmatter!.managed!;
		for (const [key, value] of Object.entries(originalManaged)) {
			if (value.includes('{')) {
				expect(roundManaged[key]).toBe(value); // templated → equivalent
			}
		}
		// TODO(architect): no model surface for constant (non-templated) frontmatter values.
		expect(originalManaged.level).toBe('control');
		expect(roundManaged.level).toBe('{control}');
	});
});

// ===========================================================================
// 6. Determinism
// ===========================================================================

describe('determinism', () => {
	const csf = ['GV.OC-01', 'GV.OC-02', 'DE.AE-02', 'DE.AE-03', 'PR.AA-05', 'ID.AM-01'];

	it('instantiate is deterministic (same inputs → deep-equal)', () => {
		const detections = detect(rowsFrom('element_identifier', csf));
		expect(instantiate(BROWSABLE_FRAMEWORK, detections)).toEqual(instantiate(BROWSABLE_FRAMEWORK, detections));
	});

	it('toRecipeRegions is deterministic', () => {
		const detections = detect(rowsFrom('element_identifier', csf));
		const m = instantiate(getBuiltInPreset('deep-everything')!, detections);
		expect(toRecipeRegions(m)).toEqual(toRecipeRegions(m));
	});
});
