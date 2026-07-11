/**
 * workbench-recipe.test.ts — the shape workbench's non-DOM integration logic.
 *
 * The DOM rendering of the workbench is covered later by e2e. This suite guards
 * the wiring the UI depends on: recipe assembly (shape mappings + the demoted
 * "all columns" frontmatter layer), the live preview render over sample rows,
 * and the legacy body bridge used at generate time. Construction and these
 * methods touch no Obsidian DOM.
 */

import { MappingWorkbench } from '../src/import/workbench';
import { analyzeColumns } from '../src/import/parsers/csv-parser';
import type { ParsedData } from '../src/types/config';
import type { ImportMapping } from '../src/import/mapping/types';
import type { DebugLog } from '../src/utils/debug';
import { deriveFacetMemberships } from '../src/import/mapping/facets';
import { facetTagColumns, buildParentPlacementPreview, toFolderNotePaths } from '../src/import/mapping/view-model';
import { findRecipeForOntologyName } from '../src/views/workspace-view-helpers';

// A no-op DebugLog stub (the workbench only calls .info/.trace).
const debug = {
	info() {},
	trace() {},
	warn() {},
	error() {},
} as unknown as DebugLog;

function makeWorkbench(rows: Record<string, unknown>[]): MappingWorkbench {
	const columns = rows.length ? Object.keys(rows[0]) : [];
	const parsedData: ParsedData = { columns, rows, rowCount: rows.length };
	return new MappingWorkbench({
		parsedData,
		columnInfos: analyzeColumns(parsedData),
		outputPath: 'Frameworks',
		debug,
		defaultPresetId: 'browsable-framework',
		onChange: () => {},
	});
}

// Ragged ATT&CK ids (variadic) + a facet + a free-text column.
function attackRows(): Record<string, unknown>[] {
	const ids = ['T1055', 'T1059', 'T1003', 'T1071', 'T1027', 'T1005', 'T1055.011', 'T1059.001', 'T1003.001', 'T1071.004'];
	const tactics = ['defense-evasion', 'execution', 'discovery'];
	// Names deliberately carry no delimiters (real ATT&CK: "Process Injection"),
	// so `name` reads as a title, not a packed hierarchy.
	const names = ['Process Injection', 'Command Interpreter', 'OS Credential Dumping', 'Application Layer', 'Obfuscated Files', 'Data Staged', 'Portable Executable', 'PowerShell', 'LSASS Memory', 'DNS'];
	return ids.map((id, i) => ({
		technique_id: id,
		name: names[i],
		tactic: tactics[i % 3],
		description: `A longer description of the technique used to test body detection and property emission for row ${i}.`,
	}));
}

describe('MappingWorkbench recipe assembly', () => {
	it('produces a recipe with a layout from the detected shapes', () => {
		const wb = makeWorkbench(attackRows());
		const recipe = wb.buildRecipe();
		expect(recipe.target.layout.length).toBeGreaterThan(0);
		// A file (leaf) entry always exists.
		expect(recipe.target.layout.some((e) => e.mechanism === 'file')).toBe(true);
	});

	it('renders a live preview over sample rows (paths + no throw)', () => {
		const wb = makeWorkbench(attackRows());
		const preview = wb.computePreview();
		expect(preview).not.toBeNull();
		expect(preview!.addresses.length).toBeGreaterThan(0);
		for (const a of preview!.addresses) {
			expect(typeof a.address.primary.path).toBe('string');
			expect(a.address.primary.path.length).toBeGreaterThan(0);
		}
	});

	it('ragged ids nest under their parent folder (tail precedes the leaf in layout)', () => {
		// Regression for the inverted-path bug found via E2E screenshot: the
		// variadic tail entry was serialized after the file leaf, so render()
		// produced "T1055.011.md/T1055" instead of "T1055/T1055.011.md".
		const wb = makeWorkbench(attackRows());
		const preview = wb.computePreview()!;
		const paths = preview.addresses.map((a) => a.address.primary.path);
		expect(paths).toContain('T1055/T1055.011.md');
		expect(paths).toContain('T1055.md');
		expect(paths.find((p) => p.includes('.md/'))).toBeUndefined();
	});

	it('nothing is dropped: non-structural columns default to frontmatter properties', () => {
		const wb = makeWorkbench(attackRows());
		const regions = wb.buildFinalRegions();
		const managed = regions.also_emit?.frontmatter?.managed ?? {};
		// `name` is not a structural source, so it lands as a managed property.
		expect(Object.keys(managed)).toContain('name');
	});

	it('returns null preview for a non-eager (streamed) source', async () => {
		async function* gen() {
			/* no rows */
		}
		const parsedData: ParsedData = { columns: ['id'], rows: gen(), rowCount: -1 };
		const wb = new MappingWorkbench({
			parsedData,
			columnInfos: [],
			outputPath: '',
			debug,
			defaultPresetId: 'browsable-framework',
			onChange: () => {},
		});
		expect(wb.computePreview()).toBeNull();
	});

	it('exposes a stable leaf file template and legacy body bridge', () => {
		const wb = makeWorkbench(attackRows());
		expect(wb.leafFileTemplate()).toMatch(/\.md$/);
		// The long `description` column is a body-candidate, so it defaults to the
		// note body. As the PRIMARY body column it bridges with an empty heading
		// (clean document body: H1 + prose, no '## description' section).
		expect(wb.getLegacyBodyMappings()).toEqual([{ column: 'description', heading: '' }]);
	});
});

describe('MappingWorkbench draft rehydration (spec §7i)', () => {
	// A deliberately minimal mapping, distinct from what browsable-framework would
	// instantiate over attackRows (which adds folder/tag/link destinations). If the
	// workbench honors initialMapping it stays name-only; if it re-detects instead
	// it would balloon.
	function seededMapping(): ImportMapping {
		return {
			mappings: [
				{
					levels: [
						{
							level: 'leaf',
							source: { column: 'technique_id' },
							destinations: [{ primitive: 'name' }],
							naming: 'part',
							missing: 'skip',
							materialize: false,
						},
					],
				},
			],
		};
	}

	it('seeds the model from initialMapping instead of re-instantiating from detections', () => {
		const rows = attackRows();
		const columns = Object.keys(rows[0]);
		const parsedData: ParsedData = { columns, rows, rowCount: rows.length };
		const initialMapping = seededMapping();
		const wb = new MappingWorkbench({
			parsedData,
			columnInfos: analyzeColumns(parsedData),
			outputPath: 'Frameworks',
			debug,
			defaultPresetId: 'browsable-framework',
			initialMapping,
			onChange: () => {},
		});
		expect(wb.getMapping()).toEqual(initialMapping);
	});

	it('without initialMapping, instantiates the preset over detections (baseline differs)', () => {
		const wb = makeWorkbench(attackRows());
		// The fresh instantiation is not the minimal name-only seed — it detects the
		// packed hierarchy and facet, so the mapping is richer.
		expect(wb.getMapping()).not.toEqual(seededMapping());
	});
});

describe('MappingWorkbench facet display names (spec §7k, item 3)', () => {
	// Original-case (not tagsafe) facet values, so we can assert casing survives.
	function attackRowsOriginalCase(): Record<string, unknown>[] {
		const ids = ['T1055', 'T1059', 'T1003', 'T1071', 'T1027', 'T1005', 'T1055.011', 'T1059.001', 'T1003.001', 'T1071.004'];
		const tactics = ['Defense Evasion', 'Execution', 'Discovery'];
		return ids.map((id, i) => ({
			technique_id: id,
			name: `Technique ${i}`,
			tactic: tactics[i % 3],
			description: `A longer description of the technique for row ${i}, long enough to read as a body candidate rather than a title.`,
		}));
	}

	it('deriveFacetMemberships over the workbench mapping keeps ORIGINAL-case names', () => {
		const rows = attackRowsOriginalCase();
		const columns = Object.keys(rows[0]);
		const parsedData: ParsedData = { columns, rows, rowCount: rows.length };
		const wb = new MappingWorkbench({
			parsedData,
			columnInfos: analyzeColumns(parsedData),
			outputPath: 'Frameworks',
			debug,
			defaultPresetId: 'browsable-framework',
			onChange: () => {},
		});
		// The tactic column is a facet (low cardinality) → a tag destination.
		const memberships = deriveFacetMemberships(wb.getMapping(), { tactic: 'Defense Evasion' });
		const tacticFacet = memberships.find((m) => m.namespace === 'tactic');
		expect(tacticFacet).toBeDefined();
		// The hub display name must be the raw value, NOT the tagsafe "defense-evasion".
		expect(tacticFacet!.value).toBe('Defense Evasion');
	});
});

describe('OPEN BUG (spec §7o): buildRecipe() drops mapping.enrichment', () => {
	// Repro shape mirrors tests/e2e/visual-graph.spec.ts: 12 rows, dotted (ragged)
	// ids so a packed-hierarchy structural mapping is elected, `;`-joined
	// multi-value tactic cells so the facet caps stay satisfied (7 atoms < the
	// cardinality cap), driven with ZERO workbench interaction (defaultPresetId
	// only — no columnDests overrides).
	function attackRepro12(): Record<string, unknown>[] {
		const rows: { technique_id: string; name: string; tactic: string }[] = [
			{ technique_id: 'T1055', name: 'Process Injection', tactic: 'Defense Evasion; Privilege Escalation' },
			{ technique_id: 'T1055.001', name: 'DLL Injection', tactic: 'Defense Evasion; Privilege Escalation' },
			{ technique_id: 'T1055.011', name: 'EWM Injection', tactic: 'Defense Evasion; Privilege Escalation' },
			{ technique_id: 'T1059', name: 'Command and Scripting Interpreter', tactic: 'Execution' },
			{ technique_id: 'T1059.001', name: 'PowerShell', tactic: 'Execution' },
			{ technique_id: 'T1059.003', name: 'Windows Command Shell', tactic: 'Execution' },
			{ technique_id: 'T1071', name: 'Application Layer Protocol', tactic: 'Command and Control' },
			{ technique_id: 'T1071.001', name: 'Web Protocols', tactic: 'Command and Control' },
			{ technique_id: 'T1547', name: 'Boot or Logon Autostart Execution', tactic: 'Persistence; Privilege Escalation' },
			{ technique_id: 'T1547.001', name: 'Registry Run Keys / Startup Folder', tactic: 'Persistence; Privilege Escalation' },
			{ technique_id: 'T1003', name: 'OS Credential Dumping', tactic: 'Credential Access' },
			{ technique_id: 'T1486', name: 'Data Encrypted for Impact', tactic: 'Impact' },
		];
		// `description` gives every row a body-candidate column, matching the real
		// fixture's shape (avoids `name` being misread as the body column).
		return rows.map((r) => ({ ...r, description: 'x'.repeat(80) }));
	}

	function reproWorkbench(): MappingWorkbench {
		const rows = attackRepro12();
		const columns = Object.keys(rows[0]);
		const parsedData: ParsedData = { columns, rows, rowCount: rows.length };
		return new MappingWorkbench({
			parsedData,
			columnInfos: analyzeColumns(parsedData),
			outputPath: 'GraphTest-e2e',
			debug,
			defaultPresetId: 'browsable-framework',
			onChange: () => {},
		});
	}

	it('sanity: instantiate() DOES stamp enrichment onto the mapping (not the bug)', () => {
		const wb = reproWorkbench();
		expect(wb.getMapping().enrichment).toEqual({
			children_lists: true,
			facet_notes: 'notes',
			parent_note: 'sibling',
		});
	});

	it('buildRecipe() carries target.enrichment through (spec §7o root cause, fixed)', () => {
		// Root cause (found 2026-07-11, generation-engine.ts/generation surface
		// investigation of spec §7o): MappingWorkbench.buildFinalRegions() in
		// src/import/workbench.ts computed `const base = toRecipeRegions(this.mapping)`
		// (which DOES carry `base.enrichment`, per the sanity test above and
		// serialize.ts's toRecipeRegions), but its final `return` reconstructed a
		// brand-new RecipeRegions literal — `{ layout, also_emit }` or `{ layout }`
		// — that never copied `base.enrichment` across. `enrichmentEnabled` in
		// generateNotes (`!!recipe.target.enrichment`) was therefore always false
		// on the wizard/workbench path, so Pass 1.5 (children lists + facet hub
		// notes + edgeCount) never ran — regardless of whether facetsForRow was
		// wired correctly (it was; see the facet-display-names describe block
		// above and generate-notes-enrichment.test.ts).
		//
		// Fixed in buildFinalRegions()'s return statement: `if (base.enrichment)
		// regions.enrichment = base.enrichment;` before returning.
		//
		// Verified end-to-end (headless, outside this file) with that patch
		// applied: generateNotes on this exact 12-row fixture produces 17 created
		// files (12 leaf + 5 facet hubs meeting HUB_MIN_MEMBERS=2: Defense Evasion,
		// Privilege Escalation, Execution, Command and Control, Persistence) and
		// edgeCount 15.
		const wb = reproWorkbench();
		const recipe = wb.buildRecipe();
		expect(recipe.target.enrichment).toEqual({
			children_lists: true,
			facet_notes: 'notes',
			parent_note: 'sibling',
		});
	});
});

describe('MappingWorkbench recognized-recipe seed (spec §7m)', () => {
	// A recipe-seeded workbench (seedColumnDefaults: false) must emit EXACTLY the
	// recipe — no auto-added per-column properties. Here the seed maps only
	// technique_id → file name; `name`/`tactic`/`description` must NOT appear.
	function nameOnlyMapping(): ImportMapping {
		return {
			mappings: [
				{
					levels: [
						{
							level: 'leaf',
							source: { column: 'technique_id' },
							destinations: [{ primitive: 'name' }],
							naming: 'part',
							missing: 'skip',
							materialize: false,
						},
					],
				},
			],
		};
	}

	it('emits exactly the seeded recipe when seedColumnDefaults is false', () => {
		const rows = attackRows();
		const columns = Object.keys(rows[0]);
		const parsedData: ParsedData = { columns, rows, rowCount: rows.length };
		const wb = new MappingWorkbench({
			parsedData,
			columnInfos: analyzeColumns(parsedData),
			outputPath: 'Frameworks',
			debug,
			defaultPresetId: 'browsable-framework',
			initialMapping: nameOnlyMapping(),
			seedColumnDefaults: false,
			onChange: () => {},
		});
		const managed = wb.buildFinalRegions().also_emit?.frontmatter?.managed ?? {};
		// No incidental per-column properties were injected.
		expect(Object.keys(managed)).not.toContain('name');
		expect(Object.keys(managed)).not.toContain('tactic');
		expect(Object.keys(managed)).not.toContain('description');
	});

	it('still auto-seeds per-column properties by default (seedColumnDefaults omitted)', () => {
		const wb = makeWorkbench(attackRows());
		const managed = wb.buildFinalRegions().also_emit?.frontmatter?.managed ?? {};
		expect(Object.keys(managed)).toContain('name');
	});
});

// ============================================================================
// Connections helpers (mapping/view-model.ts, spec §7k) — the pure logic
// behind the workbench's Connections card: facetTagColumns (the facet-hubs
// label) and the sibling/folder-note placement mini-trees.
// ============================================================================

describe('facetTagColumns (spec §7k)', () => {
	it('returns the browsable-framework preset facet column for a ragged ATT&CK-shaped mapping', () => {
		const wb = makeWorkbench(attackRows());
		expect(facetTagColumns(wb.getMapping())).toEqual(['tactic']);
	});

	it('returns an empty list when no mapping carries a tag destination', () => {
		const mapping: ImportMapping = {
			mappings: [
				{
					levels: [
						{
							level: 'leaf',
							source: { column: 'id' },
							destinations: [{ primitive: 'name' }],
							naming: 'part',
							missing: 'skip',
							materialize: false,
						},
					],
				},
			],
		};
		expect(facetTagColumns(mapping)).toEqual([]);
	});
});

describe('buildParentPlacementPreview / toFolderNotePaths (variadic-split design §4)', () => {
	it('sibling preview keeps a parent note beside its children folder', () => {
		const { sibling } = buildParentPlacementPreview(['Techniques/T1055.md', 'Techniques/T1055/T1055.011.md']);
		expect(sibling).toEqual([
			{ depth: 0, label: 'Techniques', isFile: false },
			{ depth: 1, label: 'T1055.md', isFile: true },
			{ depth: 1, label: 'T1055', isFile: false },
			{ depth: 2, label: 'T1055.011.md', isFile: true },
		]);
	});

	it('toFolderNotePaths relocates a leaf whose stem matches an existing folder', () => {
		const paths = toFolderNotePaths(['Techniques/T1055.md', 'Techniques/T1055/T1055.011.md', 'Techniques/T1548.md']);
		expect(paths).toEqual([
			'Techniques/T1055/T1055.md', // relocated — T1055 has a children folder
			'Techniques/T1055/T1055.011.md',
			'Techniques/T1548.md', // childless leaf, untouched
		]);
	});

	it('folder-note preview nests the relocated parent note inside its own folder', () => {
		const { folderNote } = buildParentPlacementPreview(['Techniques/T1055.md', 'Techniques/T1055/T1055.011.md']);
		expect(folderNote).toEqual([
			{ depth: 0, label: 'Techniques', isFile: false },
			{ depth: 1, label: 'T1055', isFile: false },
			{ depth: 2, label: 'T1055.md', isFile: true },
			{ depth: 2, label: 'T1055.011.md', isFile: true },
		]);
	});

	it('is a no-op when no id in the sample is ragged (nothing to relocate)', () => {
		const paths = ['A.md', 'B.md', 'C.md'];
		expect(toFolderNotePaths(paths)).toEqual(paths);
	});
});

// ============================================================================
// findRecipeForOntologyName — the "Import again" heuristic (workspace-view-helpers.ts,
// spec §7n item 3). Installed-ontology folder name -> bundled recipe, best-effort.
// ============================================================================

describe('findRecipeForOntologyName', () => {
	const registry = [
		{ id: 'nist-csf-2-cprt-hierarchical', label: 'NIST CSF 2.0 (CPRT export, nested)', ontology: 'nist-csf-2' },
		{ id: 'mitre-attack-technique-flat', label: 'MITRE ATT&CK techniques', ontology: 'mitre-attack' },
		{ id: 'cis-controls-v8-controls', label: 'CIS Controls v8 (controls)', ontology: 'cis-v8' },
	];

	it('matches a punctuated folder name against a normalized ontology id', () => {
		const match = findRecipeForOntologyName('NIST-CSF-2.0', registry);
		expect(match?.id).toBe('nist-csf-2-cprt-hierarchical');
	});

	it('matches regardless of extra folder-name words', () => {
		const match = findRecipeForOntologyName('MITRE ATT&CK (Techniques)', registry);
		expect(match?.id).toBe('mitre-attack-technique-flat');
	});

	it('returns null for an unrecognizable folder name', () => {
		expect(findRecipeForOntologyName('My custom notes', registry)).toBeNull();
	});

	it('returns null for an empty folder name', () => {
		expect(findRecipeForOntologyName('', registry)).toBeNull();
	});

	it('prefers the more specific (longer) ontology id on ambiguous ties', () => {
		const ambiguous = [
			{ id: 'a', label: 'A', ontology: 'cis' },
			{ id: 'b', label: 'B', ontology: 'cis-v8' },
		];
		const match = findRecipeForOntologyName('CIS-v8', ambiguous);
		expect(match?.id).toBe('b');
	});
});
