/**
 * mapping/types.ts — the StructureMapping v2 model (shape-first workbench §3a½ + §7b).
 *
 * Pure module: NO Obsidian imports, NO UI. This is the load-bearing model the
 * whole workbench reads and writes. Per the view-coherence law (spec §3a½): the
 * preset picker, the shape cards, and the per-level matrix are three views over
 * ONE `ImportMapping`; opening a deeper view always shows exactly what the
 * shallower one wrote. There is no separate "simple mode" state.
 *
 * The distilled engine (spec §3a½): every translation is one pipeline —
 *   split the source into ordered levels
 *     → regroup them (merge adjacent, drop some, leave the rest packed)
 *     → assign each group to Obsidian primitives
 *     → set policies (ragged, placement, depth).
 * `LevelRule` is one group; its `destinations` are the assignment; `TailRule` is
 * the "however many levels remain" group (variadic).
 *
 * ------------------------------------------------------------------------------
 * Model additions beyond the literal spec sketch (documented, per the task's
 * "resolve ambiguities and report how" contract):
 *
 *   - `LevelRule.delimiter` — the split delimiter for part-indexed sources in
 *     this rule. The spec fixes `PartRef = { column, part? }` with no delimiter,
 *     but a `part` index is meaningless without knowing what the column was
 *     split on. Carrying the delimiter per LevelRule (not per PartRef) keeps
 *     PartRef exactly as specified while making the split reconstructable, and
 *     it lets one source column be split on different delimiters at different
 *     levels (the CSF `GV.OC-01` case: `split(.,0)` then `split(-,0)`).
 *   - `LevelRule.filters` — the trailing filter chain (`fs-safe`, `tagsafe`,
 *     `trim`, `lower`) that every real recipe applies to rendered names. Without
 *     it, `{CIS Control|trim|fs-safe}.md` could not round-trip.
 *   - `TailRule.source` / `.delimiter` / `.drop_last` — the variadic block lives
 *     on a folder layout entry that carries a template (the source) and a
 *     delimiter; the tail cannot serialize to `VariadicConfig` without them. The
 *     spec sketch of TailRule omitted them because it focused on the policy
 *     knobs.
 *
 * Non-serializable fields (known spec gaps awaiting architect sign-off — carried
 * by the model, dropped by serialization, pinned lossy by tests):
 *   - `LevelRule.missing` — per-level missing policy has no recipe surface yet.
 *   - `LevelRule.materialize` / the `note` destination — "does this level get its
 *     own note" (folder-note generalization) is the biggest open design surface
 *     (spec §7b); no recipe knob exists yet.
 *   - `LevelRule.naming.lookup` — needs the level's sibling columns in scope; a
 *     serialized `{otherColumn}` template is indistinguishable from a whole-column
 *     source on the way back.
 *   - `TailRule.placement` — the `parent_note: sibling | folder-note` knob is a
 *     pending schema addition (spec §4 + §5).
 *   - `ImportMapping.filters` (row filters) — no recipe surface yet (spec §7b).
 */

// ============================================================================
// Source references
// ============================================================================

/**
 * A reference to source material for one part of a level's name.
 *
 * `part` selects which piece of the (split) column value to use:
 *   - undefined      → the whole column value (`{column}`).
 *   - number `n`     → the nth piece after splitting on the level's delimiter
 *                      (`{column|split(delimiter,n)}`).
 *   - `[i, j]`       → a merged, contiguous range of pieces `i..j` joined by the
 *                      level's `join` text (the CSF prefix trick — one template
 *                      composing several split pieces).
 *
 * The split delimiter lives on the owning `LevelRule` (see the module note),
 * keeping this shape exactly `{ column, part? }` per spec §7b.
 */
export interface PartRef {
	/** Source column name. May be a dotted JSON path (e.g. `external_references.0.external_id`). */
	column: string;
	/** Which split piece(s) of the column to use. Omit for the whole value. */
	part?: number | [number, number];
}

/** A source is one PartRef, or several PartRefs merged (incl. across columns, spec §7b). */
export type LevelSource = PartRef | PartRef[];

// ============================================================================
// Destinations — the six Obsidian structuring primitives + content carriers
// ============================================================================

/**
 * How a merged level's rendered name is produced (spec §3a½).
 *   - 'part'   — the single selected part, verbatim.
 *   - 'prefix' — cumulative prefix (used by the variadic tail's `segment: prefix`).
 *   - 'joined' — the merged pieces concatenated with the level's `join` text.
 *   - { lookup } — a human label pulled from a sibling column (`GV — Govern`).
 *                  NOT round-trip safe yet (see module note).
 */
export type LevelNaming = 'part' | 'prefix' | 'joined' | { lookup: string };

/** Whether a parent link points from child→parent, parent→children, or both. */
export type LinkDirection = 'parent-on-child' | 'children-on-parent' | 'both';

/** Where a body destination writes into the host note. */
export type BodyPosition = 'section' | 'append' | 'table-row';

/**
 * A destination is one Obsidian primitive a level lands in, plus that
 * primitive's parameters (spec §7c — the full ⊕ menu). A single level may carry
 * several destinations at once (folder AND property AND tag), which is why
 * `LevelRule.destinations` is plural.
 */
export type Destination =
	/** A directory segment. */
	| { primitive: 'folder' }
	/** A file-name segment (the leaf-bearing markdown file, or a name fragment). */
	| { primitive: 'name' }
	/**
	 * This level becomes its own concept note (the category/parent as a real
	 * note). Generalizes the folder-note pattern (spec §7b). Not serializable yet.
	 */
	| { primitive: 'note' }
	/** A nested tag-path segment. */
	| {
			primitive: 'tag';
			/** Literal tag namespace root (defaults to a slug of the source column at instantiation). */
			namespace?: string;
			/** Optional sibling-ordering hint within a polyhierarchy of tags. */
			order?: number;
	  }
	/** An intra-file heading. */
	| {
			primitive: 'heading';
			/** How the host file is chosen/grouped (e.g. 'root' = one document). */
			hostRule: string;
			/** Markdown heading depth 1–6. */
			depth: number;
	  }
	/** A frontmatter wikilink to a related note (the `parent: "[[…]]"` --depad pattern). */
	| {
			primitive: 'link';
			/** Frontmatter key holding the link (e.g. 'parent'). */
			key: string;
			direction: LinkDirection;
			/** Typed predicate (e.g. 'skos:broader'). Not serializable via managed frontmatter yet. */
			predicate?: string;
	  }
	/** A plain queryable frontmatter field. */
	| {
			primitive: 'property';
			/** Frontmatter key. */
			key: string;
			/** True → a list-valued property. Not distinguishable on the way back (lossy). */
			list?: boolean;
	  }
	/** A note alias (`also_emit.aliases`). */
	| { primitive: 'alias' }
	/** Note body content. */
	| { primitive: 'body'; position: BodyPosition };

/** Discriminant union of every destination primitive. */
export type DestinationPrimitive = Destination['primitive'];

/** Per-level missing-value policy (spec §3a½). Not serializable yet. */
export type MissingPolicy = 'skip' | 'fallback' | 'error';

// ============================================================================
// Level + tail rules
// ============================================================================

/**
 * One row of the mapping matrix: how a single target level is built and where
 * it lands. A level draws from `source`, is named per `naming`, and is emitted
 * to every entry in `destinations`.
 */
export interface LevelRule {
	/** A short, stable id for this level (for matrix rows and level scoping). */
	level: string;
	/** Where the level's name comes from — a part, a merged range, or several columns. */
	source: LevelSource;
	/**
	 * Split delimiter for any part-indexed PartRefs in `source`. See the module
	 * note — carried here (not on PartRef) so PartRef stays `{ column, part? }`.
	 */
	delimiter?: string;
	/** Text placed between merged pieces (range or multi-column). Defaults to the delimiter. */
	join?: string;
	/** Trailing filter chain applied to the rendered name (`fs-safe`, `tagsafe`, `trim`, `lower`). */
	filters?: string[];
	/** One or more primitives this level lands in (plural — spec §3a½). */
	destinations: Destination[];
	/** How the rendered name is composed. */
	naming: LevelNaming;
	/** Per-level missing-value policy. Not serializable yet (lossy TODO). */
	missing: MissingPolicy;
	/** Whether this level gets its own note (materialize). Not serializable yet (lossy TODO). */
	materialize: boolean;
}

/**
 * The variadic "however many levels remain" group (spec §3a½). Serializes to the
 * `variadic` block on a folder layout entry. Because the block sits on an entry
 * with a template + delimiter, the tail must carry its own `source` and
 * `delimiter` (see the module note).
 */
export interface TailRule {
	/** Source column(s) the variable-depth folders explode from. */
	source: LevelSource;
	/** Delimiter the rendered value is split on. */
	delimiter: string;
	/** Drop the final piece (the leaf, which the file entry already names). Default true. */
	drop_last?: boolean;
	/** Where the exploded levels land. Variadic is folder-only today, but kept plural for symmetry. */
	destinations: Destination[];
	/** 'prefix' → cumulative folder names; 'part' → raw pieces. */
	naming: 'part' | 'prefix';
	/** Safety cap on folder depth. */
	max_depth?: number;
	/** Overflow behavior past max_depth. */
	on_overflow?: 'truncate' | 'error';
	/** parent-note placement. Not serializable yet — schema knob pending (spec §4/§5). */
	placement?: 'sibling' | 'folder-note';
}

// ============================================================================
// Row filters + top-level mapping
// ============================================================================

/** Comparison operators for a row-include filter (spec §7b). Not serializable yet. */
export type RowFilterOp = 'equals' | 'not-equals' | 'contains' | 'non-empty' | 'matches';

/**
 * `include only where <predicate>` (spec §7b, owned by the source rail). No
 * recipe surface yet — carried by the model, dropped by serialization.
 */
export interface RowFilter {
	column: string;
	op: RowFilterOp;
	/** Comparison value (omit for `non-empty`). */
	value?: string;
}

/**
 * One hierarchy projected from the source. A packed-hierarchy detection yields a
 * multi-level mapping (levels + optional tail); a facet or a parent link yields a
 * single-level mapping. The workbench holds a LIST of these (spec §7a) so one
 * source can project several parallel hierarchies.
 */
export interface StructureMapping {
	/** Ordered target levels (outer → inner). */
	levels: LevelRule[];
	/** Variable-depth tail (variadic). Present only for ragged hierarchies. */
	tail?: TailRule;
}

/**
 * The complete import model: every parallel hierarchy plus source-level row
 * filters (spec §7b). This is what all three workbench views read and write.
 */
export interface ImportMapping {
	mappings: StructureMapping[];
	/** Row-include predicates. Not serializable yet (lossy TODO). */
	filters?: RowFilter[];
}

// ============================================================================
// Defaults + guards
// ============================================================================

/** Default missing policy for freshly instantiated / reconstructed levels. */
export const DEFAULT_MISSING: MissingPolicy = 'skip';

/**
 * Canonical destination ordering. Reconstruction (`fromRecipe`) sorts a level's
 * destinations by this rank so that serialize∘deserialize is order-stable and
 * the round-trip law can assert deep-equality. Construct test mappings in this
 * order.
 */
export const DESTINATION_ORDER: DestinationPrimitive[] = [
	'folder',
	'name',
	'heading',
	'note',
	'property',
	'tag',
	'link',
	'alias',
	'body',
];

/** Rank a destination primitive for canonical ordering. */
export function destinationRank(p: DestinationPrimitive): number {
	const i = DESTINATION_ORDER.indexOf(p);
	return i === -1 ? DESTINATION_ORDER.length : i;
}

/** Normalize a LevelSource to a PartRef array (single ref → one-element array). */
export function toPartRefs(source: LevelSource): PartRef[] {
	return Array.isArray(source) ? source : [source];
}
