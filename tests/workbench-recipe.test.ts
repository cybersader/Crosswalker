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
		// No body destinations by default → empty legacy body list.
		expect(wb.getLegacyBodyMappings()).toEqual([]);
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
