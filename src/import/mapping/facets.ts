/**
 * mapping/facets.ts — derive a row's facet memberships from an ImportMapping.
 *
 * A facet is a level whose destinations include a `tag` primitive (spec §7c). The
 * enrichment pass (src/generation/enrich.ts) materializes one hub note per facet
 * VALUE, so it needs, per row, the (namespace, raw value) pairs that row belongs
 * to. This helper reads them straight off the mapping + row — the same source the
 * tag templates are built from — so hub display names keep their original casing
 * (`Access Control`, not the tagsafe `access-control`).
 *
 * Pure module: NO Obsidian imports.
 */

import type { ImportMapping, Destination, LevelSource } from './types';
import { isConstantRef, toSourceRefs } from './types';

/** One facet a row belongs to: a tag namespace + the raw (display) cell value. */
export interface FacetMembership {
	/** Tag namespace (the facet's column-slug, e.g. `control-family`). */
	namespace: string;
	/** Raw cell value, original casing (e.g. `Access Control`). */
	value: string;
}

/** Common list separators for multi-value facet cells. */
const LIST_DELIMITERS = [',', ';'];

/**
 * Every facet membership a row belongs to, across all tag destinations in the
 * mapping. Multi-value cells (`a, b`) split into several memberships. Deterministic:
 * mappings walked in order, values in cell order. Empty cells contribute nothing.
 */
export function deriveFacetMemberships(mapping: ImportMapping, row: Record<string, unknown>): FacetMembership[] {
	const out: FacetMembership[] = [];
	for (const structure of mapping.mappings) {
		for (const level of structure.levels) {
			const tagDest = level.destinations.find((d): d is Extract<Destination, { primitive: 'tag' }> => d.primitive === 'tag');
			if (!tagDest) continue;
			const column = firstColumn(level.source);
			const namespace = tagDest.namespace ?? slug(column);
			const raw = row[column];
			for (const piece of splitMultiValue(raw)) {
				out.push({ namespace, value: piece });
			}
		}
	}
	return out;
}

/** First column referenced by a level source (constants contribute their literal). */
function firstColumn(source: LevelSource): string {
	const ref = toSourceRefs(source)[0];
	return isConstantRef(ref) ? ref.constant : ref.column;
}

/** Split a cell on list delimiters, trim, drop empties. */
function splitMultiValue(value: unknown): string[] {
	let pieces = [String(value ?? '')];
	for (const d of LIST_DELIMITERS) pieces = pieces.flatMap((p) => p.split(d));
	return pieces.map((p) => p.trim()).filter((p) => p !== '');
}

/** Slug a column name into a tag namespace (mirrors detection.tagRoot / serialize.slug). */
function slug(column: string): string {
	return column
		.trim()
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '');
}
