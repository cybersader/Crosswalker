/**
 * plan.test.ts — the pre-generate numeric plan (mapping/plan.ts), closing the
 * 2026-07-11 ICSB emitter-controls gap audit's #2-priority gap (`emit.py plan`
 * parity). Pure builder function: no render(), no Obsidian imports.
 */

import { computePlan } from '../src/import/mapping/plan';
import type { ImportMapping, StructureMapping } from '../src/import/mapping/types';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

/** One structural mapping: a single folder level drawing from `family`, no tail. */
function folderMapping(): StructureMapping {
	return {
		levels: [
			{
				level: 'family',
				source: { column: 'family' },
				destinations: [{ primitive: 'folder' }],
				naming: 'part',
				missing: 'skip',
			},
		],
	};
}

/** A metadata-only facet mapping: a tag destination on `tactic`. */
function facetMapping(): StructureMapping {
	return {
		levels: [
			{
				level: 'tactic',
				source: { column: 'tactic' },
				destinations: [{ primitive: 'tag' }],
				naming: 'part',
				missing: 'skip',
			},
		],
	};
}

/** A metadata-only parent-link mapping. */
function linkMapping(): StructureMapping {
	return {
		levels: [
			{
				level: 'parent',
				source: { column: 'parent_id' },
				destinations: [{ primitive: 'link', key: 'parent', direction: 'parent-on-child' }],
				naming: 'part',
				missing: 'skip',
			},
		],
	};
}

function rows(): Record<string, unknown>[] {
	return [
		{ family: 'A', tactic: 'Persistence', parent_id: '' },
		{ family: 'A', tactic: 'Persistence', parent_id: 'A' },
		{ family: 'A', tactic: 'Persistence', parent_id: 'A' },
		{ family: 'B', tactic: 'Execution', parent_id: '' },
		{ family: 'B', tactic: 'Execution', parent_id: 'B' },
	];
}

// ===========================================================================
// notes — always exact, from rowCount
// ===========================================================================

describe('computePlan — notes (exact)', () => {
	it('one note per row, regardless of mapping content', () => {
		const mapping: ImportMapping = { mappings: [] };
		const plan = computePlan(mapping, [], 823);
		expect(plan.notes).toEqual({ count: 823, exact: true });
	});
});

// ===========================================================================
// folders — estimate, from raw column values
// ===========================================================================

describe('computePlan — folders (estimate)', () => {
	it('distinct raw values of the folder-destination column, across every row', () => {
		const mapping: ImportMapping = { mappings: [folderMapping()] };
		const plan = computePlan(mapping, rows(), rows().length);
		expect(plan.folders).toEqual({ count: 2, exact: false }); // "A", "B"
	});

	it('no structural (folder) mapping → zero folders, still labeled an estimate', () => {
		const mapping: ImportMapping = { mappings: [facetMapping()] };
		const plan = computePlan(mapping, rows(), rows().length);
		expect(plan.folders).toEqual({ count: 0, exact: false });
	});

	it('streamed source (no rows materialized) → zero folders, not a crash', () => {
		const mapping: ImportMapping = { mappings: [folderMapping()] };
		const plan = computePlan(mapping, [], 823);
		expect(plan.folders).toEqual({ count: 0, exact: false });
		expect(plan.notes.count).toBe(823); // notes is unaffected by the empty rows array
	});
});

// ===========================================================================
// facetHubs — exact when facet_notes is on and rows are available
// ===========================================================================

describe('computePlan — facetHubs (exact via deriveFacetMemberships)', () => {
	it('counts facet values with >= 2 members when facet_notes: notes', () => {
		const mapping: ImportMapping = {
			mappings: [facetMapping()],
			enrichment: { facet_notes: 'notes' },
		};
		const plan = computePlan(mapping, rows(), rows().length);
		// Persistence: 3 rows, Execution: 2 rows — both >= HUB_MIN_MEMBERS(2).
		expect(plan.facetHubs).toEqual({ count: 2, exact: true });
	});

	it('facet_notes off → zero facet hubs (exact — nothing to estimate)', () => {
		const mapping: ImportMapping = { mappings: [facetMapping()] };
		const plan = computePlan(mapping, rows(), rows().length);
		expect(plan.facetHubs).toEqual({ count: 0, exact: true });
	});

	it('a value below HUB_MIN_MEMBERS does not count as a hub', () => {
		const oneRow = [{ family: 'A', tactic: 'Solo', parent_id: '' }];
		const mapping: ImportMapping = { mappings: [facetMapping()], enrichment: { facet_notes: 'notes' } };
		const plan = computePlan(mapping, oneRow, 1);
		expect(plan.facetHubs).toEqual({ count: 0, exact: true });
	});
});

// ===========================================================================
// folderIndexNotes — one per distinct folder, only when level_hubs is on
// ===========================================================================

describe('computePlan — folderIndexNotes (estimate, mirrors folders)', () => {
	it('zero when level_hubs is off (the default)', () => {
		const mapping: ImportMapping = { mappings: [folderMapping()] };
		const plan = computePlan(mapping, rows(), rows().length);
		expect(plan.folderIndexNotes).toEqual({ count: 0, exact: false });
	});

	it('mirrors the folder estimate when level_hubs: notes', () => {
		const mapping: ImportMapping = { mappings: [folderMapping()], enrichment: { level_hubs: 'notes' } };
		const plan = computePlan(mapping, rows(), rows().length);
		expect(plan.folderIndexNotes).toEqual({ count: 2, exact: false });
	});
});

// ===========================================================================
// links — estimate, sum-not-dedupe across enabled mechanisms
// ===========================================================================

describe('computePlan — links (estimate)', () => {
	it('zero when nothing produces links (no link destination, children_lists off, level_hubs off)', () => {
		const mapping: ImportMapping = { mappings: [folderMapping()] };
		const plan = computePlan(mapping, rows(), rows().length);
		expect(plan.links).toEqual({ count: 0, exact: false });
	});

	it('a link destination alone contributes the child-edge estimate', () => {
		const mapping: ImportMapping = { mappings: [linkMapping()] };
		const plan = computePlan(mapping, rows(), rows().length);
		// No folder mapping here, so folders=0 → childEdgeEstimate = rowCount - 0 = 5.
		expect(plan.links.count).toBe(5);
		expect(plan.links.exact).toBe(false);
	});

	it('children_lists and level_hubs each add another childEdgeEstimate on top (sum-not-dedupe, mirrors enrich()’s edgeCount)', () => {
		const mapping: ImportMapping = {
			mappings: [linkMapping()],
			enrichment: { children_lists: true, level_hubs: 'notes' },
		};
		const plan = computePlan(mapping, rows(), rows().length);
		// link(5) + children_lists(5) + level_hubs(5) = 15.
		expect(plan.links.count).toBe(15);
	});

	it('facet-hub member edges add on top too', () => {
		const combined: StructureMapping = {
			levels: [...folderMapping().levels, ...facetMapping().levels, ...linkMapping().levels],
		};
		const mapping: ImportMapping = {
			mappings: [combined],
			enrichment: { facet_notes: 'notes' },
		};
		const plan = computePlan(mapping, rows(), rows().length);
		// childEdgeEstimate = rowCount(5) - folders(2) = 3, from the link destination.
		// facetMemberEdges = 3 (Persistence) + 2 (Execution) = 5.
		expect(plan.links.count).toBe(3 + 5);
	});
});
