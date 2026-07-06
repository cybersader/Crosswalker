/**
 * mapping/instantiate.ts — preset × detection → ImportMapping (spec §3c½).
 *
 * Instantiation is the intentional relationship between the chooser page and the
 * matrix page: a preset is generic policy (quantified rules); a detection supplies
 * the actual levels/facets/links of THIS source; instantiation stamps the preset's
 * rules onto concrete matrix rows. The matrix page IS the instantiated preset,
 * made editable.
 *
 * Guarantee (the defaults law, spec §3a½): the matrix is never empty when any
 * detection exists — accept-all-defaults always produces a usable vault.
 *
 * Detection taxonomy coverage (detection.ts is the source of truth; do not edit
 * it here): packed-hierarchy and level-column-chain → structural mappings; facet
 * → tag mapping; parent-column and multi-value-link → link mappings. The
 * remaining kinds (title-candidate, row-type-discriminator, edge-file,
 * body-candidate) carry no clean recipe-region projection yet and are skipped
 * (they surface in the UI as flags / route elsewhere) — the defaults law still
 * guarantees a non-empty matrix.
 *
 * Pure module: NO Obsidian imports.
 */

import type { Detection, LayoutProposal, EdgeProposal } from '../detection';
import type { Preset, PresetDestination } from './presets';
import type {
	ImportMapping,
	StructureMapping,
	LevelRule,
	TailRule,
	Destination,
	LevelSource,
	LevelNaming,
} from './types';
import { DEFAULT_MISSING, isConstantRef } from './types';
import { parseStructuralTemplate } from './serialize';

/**
 * Instantiate a preset over a source's detections. Output order mirrors detection
 * order so the result is deterministic.
 */
export function instantiate(preset: Preset, detections: Detection[]): ImportMapping {
	const mappings: StructureMapping[] = [];

	for (const detection of detections) {
		switch (detection.kind) {
			case 'packed-hierarchy':
				mappings.push(instantiateStructural(preset, detection.proposal, detection.column));
				break;
			case 'level-column-chain':
				mappings.push(
					instantiateStructural(preset, detection.proposal, lastColumn(detection.columns)),
				);
				break;
			case 'facet-candidate': {
				const m = instantiateFacet(preset, detection.column);
				if (m) mappings.push(m);
				break;
			}
			case 'parent-column':
			case 'multi-value-link': {
				const m = instantiateLink(preset, detection.column, detection.proposal);
				if (m) mappings.push(m);
				break;
			}
			case 'title-candidate':
			case 'row-type-discriminator':
			case 'edge-file':
			case 'body-candidate':
				// No clean recipe-region projection yet — skipped (defaults law covers emptiness).
				break;
		}
	}

	// Defaults law: never leave the matrix empty when detections exist.
	if (mappings.length === 0 && detections.length > 0) {
		const column = detectionColumn(detections[0]);
		if (column) mappings.push(fallbackNameMapping(column));
	}

	return { mappings };
}

// ============================================================================
// Structural (packed hierarchy or level-column chain) → structural mapping
// ============================================================================

/**
 * Build a structural mapping from a LayoutProposal (fixed levels or a variadic
 * tail). `primaryColumn` names the leaf note and, for variadic, the tail source.
 * Each fixed level's own column is recovered from its template so a
 * level-column-chain (distinct column per level) and a packed hierarchy (one
 * column split per level) both work.
 */
function instantiateStructural(
	preset: Preset,
	proposal: LayoutProposal,
	primaryColumn: string,
): StructureMapping {
	const everyLevelDests: PresetDestination[] =
		preset.structural.every_level?.destinations ?? [{ primitive: 'folder' }];

	if (proposal.mechanism === 'fixed-folders') {
		const levels: LevelRule[] = [];
		proposal.templates.forEach((template, i) => {
			const parsed = parseStructuralTemplate(template);
			const levelColumn = firstColumn(parsed.source);
			const rule: LevelRule = {
				level: `level-${i + 1}`,
				source: parsed.source,
				destinations: everyLevelDests.map((d) =>
					mapDestination(d, { column: levelColumn, propertyKey: `level-${i + 1}` }),
				),
				naming: 'part',
				missing: DEFAULT_MISSING,
				materialize: false,
			};
			if (parsed.delimiter !== undefined) rule.delimiter = parsed.delimiter;
			if (parsed.filters.length > 0) rule.filters = parsed.filters;
			levels.push(rule);
		});
		levels.push(leafLevel(preset, primaryColumn));
		return { levels };
	}

	// Ragged — variadic tail + leaf.
	const variadic = proposal.variadic;
	const folderDest: PresetDestination = { primitive: 'folder' };
	const tailDests = everyLevelDests.filter((d) => d.primitive === 'folder');
	const tail: TailRule = {
		source: { column: primaryColumn },
		delimiter: variadic.delimiter,
		drop_last: variadic.drop_last,
		destinations: (tailDests.length ? tailDests : [folderDest]).map((d) =>
			mapDestination(d, { column: primaryColumn }),
		),
		naming: variadic.segment === 'part' ? 'part' : 'prefix',
	};
	const presetTail = preset.structural.tail;
	if (presetTail?.max_depth !== undefined) tail.max_depth = presetTail.max_depth;
	if (presetTail?.on_overflow !== undefined) tail.on_overflow = presetTail.on_overflow;
	if (presetTail?.placement !== undefined) tail.placement = presetTail.placement;

	return { levels: [leafLevel(preset, primaryColumn)], tail };
}

/** Build the leaf level (the note that keeps the full packed id). */
function leafLevel(preset: Preset, column: string): LevelRule {
	const leaf = preset.structural.leaf;
	const dests: PresetDestination[] = leaf?.destinations ?? [{ primitive: 'name' }];
	return {
		level: 'leaf',
		source: { column },
		destinations: dests.map((d) => mapDestination(d, { column, propertyKey: column })),
		naming: presetNamingToLevel(leaf?.naming),
		missing: DEFAULT_MISSING,
		materialize: false,
	};
}

// ============================================================================
// Facet → tag mapping; parent-like → link mapping
// ============================================================================

function instantiateFacet(preset: Preset, column: string): StructureMapping | null {
	const dests = preset.facets?.destinations;
	if (!dests || dests.length === 0) return null;
	return {
		levels: [
			{
				level: column,
				source: { column },
				destinations: dests.map((d) => mapDestination(d, { column })),
				naming: 'part',
				missing: DEFAULT_MISSING,
				materialize: false,
			},
		],
	};
}

function instantiateLink(preset: Preset, column: string, proposal: EdgeProposal): StructureMapping | null {
	const dests = preset.links?.destinations;
	if (!dests || dests.length === 0) return null;
	return {
		levels: [
			{
				level: column,
				source: { column },
				destinations: dests.map((d) =>
					mapDestination(d, {
						column,
						linkKey: proposal.frontmatterKey,
						predicate: proposal.predicate,
					}),
				),
				naming: 'part',
				missing: DEFAULT_MISSING,
				materialize: false,
			},
		],
	};
}

/** Guaranteed non-empty fallback — a single name level from a column. */
function fallbackNameMapping(column: string): StructureMapping {
	return {
		levels: [
			{
				level: 'leaf',
				source: { column },
				destinations: [{ primitive: 'name' }],
				naming: 'part',
				missing: DEFAULT_MISSING,
				materialize: false,
			},
		],
	};
}

// ============================================================================
// Preset destination → concrete destination (fills column-bound params)
// ============================================================================

interface DestContext {
	column: string;
	propertyKey?: string;
	linkKey?: string;
	predicate?: string;
}

/** Fill a preset's generic destination with this source's column-bound params. */
function mapDestination(preset: PresetDestination, ctx: DestContext): Destination {
	switch (preset.primitive) {
		case 'folder':
			return { primitive: 'folder' };
		case 'name':
			return { primitive: 'name' };
		case 'note':
			return { primitive: 'note' };
		case 'alias':
			return { primitive: 'alias' };
		case 'tag': {
			const dest: Destination = { primitive: 'tag', namespace: slug(ctx.column) };
			if (preset.order !== undefined) (dest as { order?: number }).order = preset.order;
			return dest;
		}
		case 'heading':
			return { primitive: 'heading', hostRule: 'root', depth: preset.depth ?? 2 };
		case 'link':
			return {
				primitive: 'link',
				key: ctx.linkKey ?? 'parent',
				direction: preset.direction ?? 'parent-on-child',
				...(ctx.predicate ? { predicate: ctx.predicate } : {}),
			};
		case 'property':
			return { primitive: 'property', key: ctx.propertyKey ?? ctx.column, ...(preset.list ? { list: true } : {}) };
		case 'body':
			return { primitive: 'body', position: preset.position ?? 'section' };
	}
}

/** Map a preset naming policy onto the level model's naming. */
function presetNamingToLevel(naming: string | undefined): LevelNaming {
	// 'joined-full' → the whole packed id (a single whole-column part) = 'part' in the model.
	switch (naming) {
		case 'prefix':
			return 'prefix';
		case 'joined':
			return 'joined';
		default:
			return 'part';
	}
}

// ============================================================================
// Small helpers
// ============================================================================

/** First column (or literal) referenced by a source. */
function firstColumn(source: LevelSource): string {
	const ref = Array.isArray(source) ? source[0] : source;
	return isConstantRef(ref) ? ref.constant : ref.column;
}

/** Last column of a chain (defensive: falls back to the first). */
function lastColumn(columns: string[]): string {
	return columns.length > 0 ? columns[columns.length - 1] : columns[0];
}

/** A representative column for any detection kind (undefined for shapes with none). */
function detectionColumn(detection: Detection): string | undefined {
	switch (detection.kind) {
		case 'packed-hierarchy':
		case 'parent-column':
		case 'facet-candidate':
		case 'title-candidate':
		case 'row-type-discriminator':
		case 'multi-value-link':
		case 'body-candidate':
			return detection.column;
		case 'level-column-chain':
			return detection.columns[detection.columns.length - 1];
		case 'edge-file':
			return detection.subjectColumn;
	}
}

/** Slug a column into a tag namespace (mirrors detection.tagRoot / serialize.slug). */
function slug(column: string): string {
	return column
		.trim()
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '');
}
