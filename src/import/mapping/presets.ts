/**
 * mapping/presets.ts — shape presets ("how I typically do it", spec §3c/§3c½).
 *
 * A preset is a LEVEL-COUNT-AGNOSTIC policy document. It never names columns or
 * level counts; it speaks in quantifiers (`every_level` · `leaf` · `tail`, plus
 * `facets` and `links`). That is what lets one preset serve any ontology and
 * what makes it the code-level escape hatch: a plain JSON file, validated by
 * spec/preset.schema.json, writable without the UI, shareable.
 *
 * The types here mirror spec/preset.schema.json exactly (a test validates every
 * built-in against that schema via the project AJV setup). Instantiation
 * (`instantiate.ts`) stamps these generic rules onto concrete matrix rows using
 * the detections from a specific source.
 *
 * Pure module: NO Obsidian imports.
 */

import type { LinkDirection, BodyPosition, Enrichment } from './types';

// ============================================================================
// Preset document types (mirror preset.schema.json)
// ============================================================================

/** A destination as GENERIC policy — a primitive plus only column-independent params. */
export type PresetDestination =
	| { primitive: 'folder' }
	| { primitive: 'name' }
	| { primitive: 'note' }
	| { primitive: 'tag'; path?: 'nested' | 'flat'; order?: number }
	| { primitive: 'heading'; depth?: number }
	| { primitive: 'link'; direction?: LinkDirection; predicate?: string }
	| { primitive: 'property'; list?: boolean }
	| { primitive: 'alias' }
	| { primitive: 'body'; position?: BodyPosition };

/** How a level's name is composed, quantified (no column names). */
export type PresetNaming = 'part' | 'prefix' | 'joined' | 'joined-full';

/** A rule applied to a quantified set of levels (every interior level, or the leaf). */
export interface QuantifierRule {
	destinations: PresetDestination[];
	naming?: PresetNaming;
}

/** Policy for the variable-depth tail (ragged remainder). */
export interface PresetTailRule {
	destinations?: PresetDestination[];
	naming?: 'part' | 'prefix';
	max_depth?: number;
	on_overflow?: 'truncate' | 'error';
	placement?: 'sibling' | 'folder-note';
}

/** A rule for facet or parent-link detections. */
export interface PresetRelationRule {
	destinations: PresetDestination[];
}

/** A complete shape preset. */
export interface Preset {
	preset: string;
	label?: string;
	description?: string;
	structural: {
		every_level?: QuantifierRule;
		leaf?: QuantifierRule;
		tail?: PresetTailRule;
	};
	facets?: PresetRelationRule;
	links?: PresetRelationRule;
}

/** Built-in preset ids. */
export type BuiltInPresetId =
	| 'browsable-framework'
	| 'deep-everything'
	| 'flat-and-linked'
	| 'single-reference-file';

// ============================================================================
// Built-in presets
// ============================================================================

/**
 * The GRC default (spec §3c). Folders for the hierarchy, facet tags for
 * post-coordinated filtering, and a parent link. Accept-all-defaults over a
 * framework source produces a browsable, faceted, graph-connected vault — the
 * "magic path".
 */
export const BROWSABLE_FRAMEWORK: Preset = {
	preset: 'browsable-framework',
	label: 'Browsable framework',
	description: 'Folders you can browse, facet tags you can filter, and a parent link per note.',
	structural: {
		every_level: { destinations: [{ primitive: 'folder' }] },
		leaf: { destinations: [{ primitive: 'name' }], naming: 'joined-full' },
		tail: { destinations: [{ primitive: 'folder' }], naming: 'prefix', max_depth: 6, on_overflow: 'truncate' },
	},
	facets: { destinations: [{ primitive: 'tag' }] },
	links: { destinations: [{ primitive: 'link', direction: 'parent-on-child' }] },
};

/**
 * "Deep everything" (spec §3c½, verbatim intent). Every level becomes both a
 * folder AND a nested tag; the leaf keeps its full packed id; the tail runs deep
 * (max_depth 8, truncate). Facets also become tags.
 */
export const DEEP_EVERYTHING: Preset = {
	preset: 'deep-everything',
	label: 'Deep everything',
	description: 'Every level lands as a folder and a nested tag; leaves keep their full id; deep nesting.',
	structural: {
		every_level: { destinations: [{ primitive: 'folder' }, { primitive: 'tag', path: 'nested' }] },
		leaf: { destinations: [{ primitive: 'name' }], naming: 'joined-full' },
		tail: { max_depth: 8, on_overflow: 'truncate' },
	},
	facets: { destinations: [{ primitive: 'tag' }] },
};

/**
 * Flat and linked (spec §3c). Notes stay flat (the id reads at a glance in the
 * file name); each level is also written as a queryable property; a parent link
 * connects the graph.
 */
export const FLAT_AND_LINKED: Preset = {
	preset: 'flat-and-linked',
	label: 'Flat and linked',
	description: 'Flat file names, each level as a property, and a parent link per note.',
	structural: {
		every_level: { destinations: [{ primitive: 'property' }] },
		leaf: { destinations: [{ primitive: 'name' }], naming: 'joined-full' },
		tail: { destinations: [{ primitive: 'property' }], naming: 'prefix', max_depth: 6, on_overflow: 'truncate' },
	},
	links: { destinations: [{ primitive: 'link', direction: 'parent-on-child' }] },
};

/**
 * Single reference file (spec §3c). One portable document read top to bottom:
 * every level becomes a heading, and each level is also written as a property so
 * the outline stays queryable.
 */
export const SINGLE_REFERENCE_FILE: Preset = {
	preset: 'single-reference-file',
	label: 'Single reference file',
	description: 'One document of nested headings, with each level also captured as a property.',
	structural: {
		every_level: { destinations: [{ primitive: 'heading', depth: 2 }, { primitive: 'property' }] },
		leaf: { destinations: [{ primitive: 'heading', depth: 3 }], naming: 'joined-full' },
	},
};

/** All built-ins, keyed by id. Deterministic order = declaration order. */
export const BUILT_IN_PRESETS: Record<BuiltInPresetId, Preset> = {
	'browsable-framework': BROWSABLE_FRAMEWORK,
	'deep-everything': DEEP_EVERYTHING,
	'flat-and-linked': FLAT_AND_LINKED,
	'single-reference-file': SINGLE_REFERENCE_FILE,
};

/**
 * Batch enrichment (Pass 1.5) defaults per built-in preset. Kept as a lookup
 * table rather than a field on the preset object so the built-ins stay valid
 * against preset.schema.json unchanged. `instantiate` stamps the matching entry
 * onto `ImportMapping.enrichment` (an unknown/custom preset gets no enrichment).
 * Per the 2026-07-10 batch-enrichment design: browsable-framework is the
 * hyperconnected default (children lists + facet hub notes). 2026-07-11 (ICSB
 * audit gap #1): browsable-framework also defaults `level_hubs: 'notes'` —
 * every folder level gets an index/MOC note, closing the "no Home/MOC
 * concept" gap.
 *
 * `parent_note` deliberately has NO entry here (M3, 2026-07-12): a hardcoded
 * `'sibling'` on every built-in preset out-voted the documented "folder-note
 * is the default outright" decision (`preferredParentNote()`, view-model.ts)
 * on every fresh import, since `MappingWorkbench.applyDefaultsOverlay()` only
 * falls back to the adaptive default when the preset left `parent_note`
 * unset. Leaving it out here lets the real precedence chain (vault default >
 * the preset's own defaults > adaptive folder-note detection) actually run.
 */
export const PRESET_ENRICHMENT_DEFAULTS: Record<BuiltInPresetId, Enrichment> = {
	'browsable-framework': { children_lists: true, facet_notes: 'notes', level_hubs: 'notes' },
	'deep-everything': { children_lists: true, facet_notes: 'notes' },
	'flat-and-linked': { children_lists: true, facet_notes: 'tags-only' },
	'single-reference-file': { children_lists: false, facet_notes: 'none' },
};

/** Enrichment defaults for a preset id (undefined for an unknown/custom preset). */
export function enrichmentForPreset(presetId: string): Enrichment | undefined {
	return (PRESET_ENRICHMENT_DEFAULTS as Record<string, Enrichment>)[presetId];
}

/** The default preset for accept-all-defaults (settings may override, spec §3c½). */
export const DEFAULT_PRESET_ID: BuiltInPresetId = 'browsable-framework';

/** Look up a built-in preset by id, or undefined. */
export function getBuiltInPreset(id: string): Preset | undefined {
	return (BUILT_IN_PRESETS as Record<string, Preset>)[id];
}
