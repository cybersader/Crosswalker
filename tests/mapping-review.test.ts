/**
 * mapping-review.test.ts — the step-3 review-screen pure helpers (spec §7j).
 *
 * Covers the destination default derivation (blank setting → Frameworks/<basename>),
 * provenance derivation (built-in vs yours vs custom-based-on), and the shape-map
 * recap assembly. All three are pure functions — the wizard only renders them.
 */

import { detectStructure } from '../src/import/detection';
import type { Detection } from '../src/import/detection';
import { analyzeColumns } from '../src/import/parsers/csv-parser';
import type { ParsedData } from '../src/types/config';
import { BROWSABLE_FRAMEWORK } from '../src/import/mapping/presets';
import { instantiate } from '../src/import/mapping/instantiate';
import {
	deriveDestinationDefault,
	deriveProvenance,
	buildShapeMapRecap,
	toggleDestinationAcrossMapping,
} from '../src/import/mapping/view-model';

function detect(rows: Record<string, unknown>[]): Detection[] {
	const columns = rows.length > 0 ? Object.keys(rows[0]) : [];
	const data: ParsedData = { columns, rows, rowCount: rows.length };
	return detectStructure(data, analyzeColumns(data));
}

const ATTACK_ROWS = [
	{ technique_id: 'T1055', name: 'Process Injection', tactic: 'Defense Evasion' },
	{ technique_id: 'T1055.001', name: 'DLL Injection', tactic: 'Defense Evasion' },
	{ technique_id: 'T1059', name: 'Command Interpreter', tactic: 'Execution' },
	{ technique_id: 'T1059.001', name: 'PowerShell', tactic: 'Execution' },
];

// ---------------------------------------------------------------------------
// deriveDestinationDefault
// ---------------------------------------------------------------------------

describe('deriveDestinationDefault', () => {
	it('honors an explicit outputPath setting', () => {
		expect(deriveDestinationDefault('Ontologies/NIST', 'nist.csv')).toBe('Ontologies/NIST');
	});

	it('trims an explicit setting', () => {
		expect(deriveDestinationDefault('  Frameworks  ', 'x.csv')).toBe('Frameworks');
	});

	it('derives Frameworks/<basename> when the setting is blank', () => {
		expect(deriveDestinationDefault('', 'cis-controls-v8.csv')).toBe('Frameworks/cis-controls-v8');
	});

	it('strips the extension and any directory from the source name', () => {
		expect(deriveDestinationDefault('   ', '/tmp/exports/mitre-attack.xlsx')).toBe('Frameworks/mitre-attack');
	});

	it('handles a name with no extension', () => {
		expect(deriveDestinationDefault('', 'catalog')).toBe('Frameworks/catalog');
	});

	it('falls back to Frameworks/Imported when there is no source name', () => {
		expect(deriveDestinationDefault('', null)).toBe('Frameworks/Imported');
		expect(deriveDestinationDefault('', undefined)).toBe('Frameworks/Imported');
		expect(deriveDestinationDefault('', '')).toBe('Frameworks/Imported');
	});

	it('does not treat a leading-dot dotfile as an extension', () => {
		expect(deriveDestinationDefault('', '.hidden')).toBe('Frameworks/.hidden');
	});
});

// ---------------------------------------------------------------------------
// deriveProvenance
// ---------------------------------------------------------------------------

describe('deriveProvenance', () => {
	it('reports an unmodified built-in preset as Built-in', () => {
		const p = deriveProvenance({ presetLabel: 'Browsable framework', isBuiltIn: true, unmodified: true, recommended: false });
		expect(p.origin).toBe('built-in');
		expect(p.badge).toBe('Built-in');
		expect(p.line).toBe('Browsable framework · built-in preset · unmodified');
		expect(p.recommended).toBe(false);
	});

	it('flags the recommended default', () => {
		const p = deriveProvenance({ presetLabel: 'Browsable framework', isBuiltIn: true, unmodified: true, recommended: true });
		expect(p.recommended).toBe(true);
	});

	it('reports an edited preset as Custom (based on X)', () => {
		const p = deriveProvenance({ presetLabel: 'Browsable framework', isBuiltIn: true, unmodified: false, recommended: false });
		expect(p.origin).toBe('custom');
		expect(p.badge).toBe('Custom (based on Browsable framework)');
		expect(p.line).toBe('Browsable framework · custom · edited');
		expect(p.recommended).toBe(false);
	});

	it('reports an applied saved config as Yours regardless of preset', () => {
		const p = deriveProvenance({ presetLabel: 'Browsable framework', isBuiltIn: true, unmodified: true, recommended: true, appliedConfigName: 'My NIST house style' });
		expect(p.origin).toBe('yours');
		expect(p.badge).toBe('Yours');
		expect(p.line).toBe('My NIST house style · your saved config');
		// A saved config is never itself the "recommended" preset tag.
		expect(p.recommended).toBe(false);
	});

	it('marks an edited saved config', () => {
		const p = deriveProvenance({ presetLabel: 'Browsable framework', isBuiltIn: true, unmodified: false, recommended: false, appliedConfigName: 'My style' });
		expect(p.origin).toBe('yours');
		expect(p.line).toBe('My style · your saved config · edited');
	});
});

// ---------------------------------------------------------------------------
// buildShapeMapRecap
// ---------------------------------------------------------------------------

describe('buildShapeMapRecap', () => {
	it('always starts with the one-note-per-row header row', () => {
		const mapping = instantiate(BROWSABLE_FRAMEWORK, detect(ATTACK_ROWS));
		const rows = buildShapeMapRecap(mapping, 823);
		expect(rows[0]).toEqual({ from: 'Each row', becomes: 'Notes, one per row', count: '823' });
	});

	it('lists the vault shapes a structural mapping lands as', () => {
		const mapping = instantiate(BROWSABLE_FRAMEWORK, detect(ATTACK_ROWS));
		const rows = buildShapeMapRecap(mapping, 4);
		// The technique_id packed hierarchy lands as folders (browsable-framework).
		const structural = rows.find((r) => r.from.includes('technique_id'));
		expect(structural).toBeDefined();
		expect(structural!.becomes).toContain('folders');
	});

	it('reflects a toggled-on shape in the recap', () => {
		let mapping = instantiate(BROWSABLE_FRAMEWORK, detect(ATTACK_ROWS));
		const before = buildShapeMapRecap(mapping, 4).find((r) => r.from.includes('technique_id'))!;
		expect(before.becomes).not.toContain('tags');
		// Turn tags on across the structural mapping; the recap must now list them.
		const structuralMapping = toggleDestinationAcrossMapping(mapping.mappings[0], 'tag', true);
		mapping = { ...mapping, mappings: [structuralMapping, ...mapping.mappings.slice(1)] };
		const after = buildShapeMapRecap(mapping, 4).find((r) => r.from.includes('technique_id'))!;
		expect(after.becomes).toContain('tags');
	});

	it('skips mappings that carry no shapes', () => {
		let mapping = instantiate(BROWSABLE_FRAMEWORK, detect(ATTACK_ROWS));
		// Strip every structural primitive off the first mapping so it reports no shapes.
		const first = mapping.mappings[0];
		let stripped = first;
		for (const prim of ['folder', 'name', 'tag', 'heading', 'link', 'property'] as const) {
			stripped = toggleDestinationAcrossMapping(stripped, prim, false);
		}
		mapping = { ...mapping, mappings: [stripped, ...mapping.mappings.slice(1)] };
		const rows = buildShapeMapRecap(mapping, 4);
		// Header row is always present; the stripped mapping should not add a row.
		expect(rows.some((r) => r.from.includes('technique_id') && r.becomes.length > 0 && r.becomes !== 'Notes, one per row')).toBe(false);
	});
});
