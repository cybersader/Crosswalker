/**
 * mapping/serialize.ts — StructureMapping ⇄ recipe regions (spec §5 parity contract).
 *
 * `toRecipeRegions(mapping)` projects the model onto the recipe regions it maps
 * to 1:1: folder/name/heading levels → layout entries; tag/property/link/alias
 * destinations → also_emit; the ragged tail → a `variadic` folder block.
 * `fromRecipe(recipe)` reconstructs the model from those regions, including
 * recognizing merged-template rows (composed `split()` templates → a merged
 * source range) and re-grouping also_emit destinations back onto the structural
 * level that shares their source.
 *
 * The ROUND-TRIP LAW (spec §3a½): `fromRegions(toRecipeRegions(m))` deep-equals
 * `m` for every mapping expressible in recipe regions. Fields with no recipe
 * surface (per-level `missing`, `materialize`, `naming.lookup`, tail `placement`,
 * row filters, the `note`/`body` destinations) are LOSSY: serialization drops
 * them and reconstruction restores defaults. Those gaps are pinned by dedicated
 * tests so they stay visible until the architect wires a recipe surface.
 *
 * Assumptions that keep the mapping ⇄ layout correspondence tractable:
 *   - A level carries AT MOST ONE structural destination (folder XOR name XOR
 *     heading) plus any number of metadata destinations (tag/property/link/alias).
 *     Real recipes never split one source level across two structural mechanisms.
 *   - Literal path prefixes on a template (`Frameworks/{catalog.name}`) are not
 *     modeled; a template with a leading literal beyond a tag namespace is
 *     reconstructed best-effort (documented limitation — none of the v0.1 corpus
 *     structural templates use one).
 *
 * Pure module: NO Obsidian imports.
 */

import type { VariadicConfig } from '../../render/types';
import type {
	ImportMapping,
	StructureMapping,
	LevelRule,
	TailRule,
	Destination,
	LevelSource,
	PartRef,
	LevelNaming,
	Enrichment,
} from './types';
import { destinationRank, toSourceRefs, isConstantRef, DEFAULT_MISSING } from './types';

// ============================================================================
// Recipe region shapes (structural subset of spec/recipe.schema.json)
// ============================================================================

/** A single recipe layout entry (the structural subset we read/write). */
export interface LayoutEntry {
	level: string;
	mechanism: 'folder' | 'file' | 'heading';
	template: string;
	level_depth?: number;
	variadic?: VariadicConfig;
}

/** A managed list-valued wikilink spec (schema `managed_links`). */
export interface ManagedLinkSpec {
	template: string;
	split?: string[];
}

/** The cross-cutting also_emit region. */
export interface AlsoEmit {
	tags?: string[];
	aliases?: string[];
	frontmatter?: {
		managed?: Record<string, string>;
		managed_links?: Record<string, ManagedLinkSpec>;
		user_preserve?: string[];
	};
}

/** The regions `toRecipeRegions` produces / `fromRegions` consumes. */
export interface RecipeRegions {
	layout: LayoutEntry[];
	also_emit?: AlsoEmit;
	/** Batch enrichment (Pass 1.5). Serializes to recipe target.enrichment. */
	enrichment?: Enrichment;
}

/** A recipe (structural subset) accepted by `fromRecipe`. */
export interface RecipeLike {
	target: RecipeRegions;
}

/** A constant level id for the variadic tail's folder entry (irrelevant to the tail model). */
const TAIL_LEVEL_ID = 'tail';

// ============================================================================
// Serialization: mapping → recipe regions
// ============================================================================

/** Structural destination primitives — those that place a note in the vault tree. */
function isStructuralDestination(dest: Destination): boolean {
	return dest.primitive === 'folder' || dest.primitive === 'name' || dest.primitive === 'heading';
}

/** Does a mapping carry any structural destination (levels or tail)? */
function hasStructuralDestination(m: StructureMapping): boolean {
	if (m.levels.some((l) => l.destinations.some(isStructuralDestination))) return true;
	return m.tail !== undefined && m.tail.destinations.some(isStructuralDestination);
}

/**
 * Guard the single-structural constraint (spec §7g) LOUDLY. render() walks the
 * concatenated layout in order, so two structural mappings interleave their
 * folder/file entries into garbage paths (`T1055/T1055.011.md/defense/...`). A
 * loud throw here beats silent path corruption. instantiate() already elects one
 * structural winner; this catches a hand-built or mis-merged mapping that slipped
 * past. Metadata-only mappings (tags/links/properties/aliases/body) are unlimited.
 */
function assertSingleStructural(mapping: ImportMapping): void {
	const structural = mapping.mappings.filter(hasStructuralDestination);
	if (structural.length > 1) {
		const describe = (m: StructureMapping): string =>
			m.levels.map((l) => l.level).join('+') + (m.tail ? '+tail' : '');
		throw new Error(
			`one recipe supports exactly one structural mapping (folder/name/heading); found ${structural.length}: ${structural
				.map(describe)
				.join(', ')}. Metadata-only mappings are unlimited; demote the extra structural detection in instantiate() (spec section 7g).`,
		);
	}
}

/**
 * Project an ImportMapping onto recipe regions. Structural destinations become
 * layout entries; metadata destinations become also_emit; a tail becomes a
 * variadic folder entry. Lossy fields (see the module note) are silently
 * dropped.
 */
export function toRecipeRegions(mapping: ImportMapping): RecipeRegions {
	assertSingleStructural(mapping);
	const layout: LayoutEntry[] = [];
	const tags: string[] = [];
	const aliases: string[] = [];
	const managed: Record<string, string> = {};
	const managedLinks: Record<string, ManagedLinkSpec> = {};

	// A tail's `placement` is the more specific (per-hierarchy, wizard-facing)
	// knob; the recipe only has ONE global `target.enrichment.parent_note`
	// scope, so the last tail that sets `placement` wins over any explicit
	// top-level `mapping.enrichment.parent_note` (see the module note + the
	// `TailRule.placement` doc comment in types.ts — this closes that gap).
	let tailPlacement: 'sibling' | 'folder-note' | undefined;

	for (const structure of mapping.mappings) {
		const structLayout: LayoutEntry[] = [];
		for (const rule of structure.levels) {
			emitLevel(rule, structLayout, tags, aliases, managed, managedLinks);
		}
		if (structure.tail) {
			// render() walks layout in order, so the variadic tail (parent
			// folders) must precede the leaf file/heading entry. Appending it
			// after the leaf inverts every ragged path (T1055.001.md/T1055
			// instead of T1055/T1055.001.md) — found via E2E screenshot.
			const leafIdx = structLayout.findIndex(
				(e) => e.mechanism === 'file' || e.mechanism === 'heading',
			);
			const tailEntry = tailToEntry(structure.tail);
			if (leafIdx >= 0) structLayout.splice(leafIdx, 0, tailEntry);
			else structLayout.push(tailEntry);
			if (structure.tail.placement !== undefined) tailPlacement = structure.tail.placement;
		}
		layout.push(...structLayout);
	}

	const also_emit = buildAlsoEmit(tags, aliases, managed, managedLinks);
	const regions: RecipeRegions = also_emit ? { layout, also_emit } : { layout };
	const parentNote = tailPlacement ?? mapping.enrichment?.parent_note;
	if (mapping.enrichment || parentNote !== undefined) {
		regions.enrichment = { ...mapping.enrichment, ...(parentNote !== undefined ? { parent_note: parentNote } : {}) };
	}
	return regions;
}

/** Emit one level's destinations into the appropriate regions. */
function emitLevel(
	rule: LevelRule,
	layout: LayoutEntry[],
	tags: string[],
	aliases: string[],
	managed: Record<string, string>,
	managedLinks: Record<string, ManagedLinkSpec>,
): void {
	const name = buildName(rule.source, rule.delimiter, rule.join, rule.filters);
	for (const dest of rule.destinations) {
		switch (dest.primitive) {
			case 'folder':
				layout.push({ level: rule.level, mechanism: 'folder', template: name });
				break;
			case 'name':
				layout.push({ level: rule.level, mechanism: 'file', template: `${name}.md` });
				break;
			case 'heading':
				layout.push({
					level: rule.level,
					mechanism: 'heading',
					level_depth: dest.depth,
					template: name,
				});
				break;
			case 'tag': {
				const ns = dest.namespace ?? slug(firstColumn(rule.source));
				const tagValue = buildName(rule.source, rule.delimiter, rule.join, appendFilter(rule.filters, 'tagsafe'));
				tags.push(`${ns}/${tagValue}`);
				break;
			}
			case 'property':
				managed[dest.key] = name;
				break;
			case 'link':
				if (dest.list) {
					// Multi-value link → a list-valued managed wikilink array. The
					// template is the bare column value; render() splits + wikilinks it.
					managedLinks[dest.key] = { template: name };
				} else {
					managed[dest.key] = `[[${name}]]`;
				}
				break;
			case 'alias':
				aliases.push(name);
				break;
			case 'note':
			case 'body':
				// Not serializable yet — no recipe surface. Lossy on purpose (see module note).
				break;
		}
	}
}

/** Build a folder entry carrying the variadic block from a tail rule. */
function tailToEntry(tail: TailRule): LayoutEntry {
	const variadic: VariadicConfig = { delimiter: tail.delimiter };
	if (tail.naming) variadic.segment = tail.naming;
	if (tail.drop_last !== undefined) variadic.drop_last = tail.drop_last;
	if (tail.max_depth !== undefined) variadic.max_depth = tail.max_depth;
	if (tail.on_overflow !== undefined) variadic.on_overflow = tail.on_overflow;
	// tail.placement has no PER-ENTRY recipe surface (the variadic block has no
	// placement field) — it serializes to the recipe's global
	// target.enrichment.parent_note instead, in toRecipeRegions (the caller).
	return {
		level: TAIL_LEVEL_ID,
		mechanism: 'folder',
		template: buildName(tail.source, tail.delimiter, undefined, undefined),
		variadic,
	};
}

/** Assemble the also_emit region, omitting empty sub-blocks (matches recipe shape). */
function buildAlsoEmit(
	tags: string[],
	aliases: string[],
	managed: Record<string, string>,
	managedLinks: Record<string, ManagedLinkSpec>,
): AlsoEmit | undefined {
	const out: AlsoEmit = {};
	if (tags.length) out.tags = tags;
	if (aliases.length) out.aliases = aliases;
	const hasManaged = Object.keys(managed).length > 0;
	const hasManagedLinks = Object.keys(managedLinks).length > 0;
	if (hasManaged || hasManagedLinks) {
		out.frontmatter = {};
		if (hasManaged) out.frontmatter.managed = managed;
		if (hasManagedLinks) out.frontmatter.managed_links = managedLinks;
	}
	return tags.length || aliases.length || hasManaged || hasManagedLinks ? out : undefined;
}

// ============================================================================
// Template building
// ============================================================================

/**
 * Build a template string from a source. Each ref becomes one piece:
 *   - constant            → the literal string, verbatim (no braces, no filters)
 *   - whole column        → `{col}`
 *   - part index n        → `{col|split(delimiter,n)}`
 *   - range [i,j]         → `{col|split(delimiter,i)}` … `{col|split(delimiter,j)}`
 * Pieces are concatenated with `join ?? delimiter ?? ''`. Trailing filters chain
 * inside each interpolation. This is the exact inverse of
 * `parseStructuralTemplate`.
 */
export function buildName(
	source: LevelSource,
	delimiter: string | undefined,
	join: string | undefined,
	filters: string[] | undefined,
): string {
	const sep = join ?? delimiter ?? '';
	const pieces: string[] = [];
	for (const ref of toSourceRefs(source)) {
		if (isConstantRef(ref)) {
			// Literal — emitted as-is (a constant carries no split/filter).
			pieces.push(ref.constant);
		} else if (ref.part === undefined) {
			pieces.push(`{${withFilters(ref.column, filters)}}`);
		} else if (typeof ref.part === 'number') {
			pieces.push(`{${withFilters(`${ref.column}|split(${delimiter},${ref.part})`, filters)}}`);
		} else {
			const [i, j] = ref.part;
			for (let k = i; k <= j; k++) {
				pieces.push(`{${withFilters(`${ref.column}|split(${delimiter},${k})`, filters)}}`);
			}
		}
	}
	return pieces.join(sep);
}

/** Append a filter chain onto an interpolation body. */
function withFilters(base: string, filters: string[] | undefined): string {
	if (!filters || filters.length === 0) return base;
	return base + filters.map((f) => `|${f}`).join('');
}

/** Add one filter to a (possibly undefined) filter chain, once. */
function appendFilter(filters: string[] | undefined, filter: string): string[] {
	const list = filters ? [...filters] : [];
	if (!list.includes(filter)) list.push(filter);
	return list;
}

// ============================================================================
// Deserialization: recipe regions → mapping
// ============================================================================

/** Reconstruct an ImportMapping from a full recipe. */
export function fromRecipe(recipe: RecipeLike): ImportMapping {
	return fromRegions(recipe.target);
}

/**
 * Reconstruct an ImportMapping from recipe regions.
 *
 * Structural (layout) entries form one StructureMapping (levels in layout order;
 * a variadic entry becomes the tail). Each also_emit destination is re-grouped
 * onto the structural level that shares its source; destinations with no
 * structural match form their own single-level StructureMappings, in encounter
 * order (tags → aliases → managed).
 */
export function fromRegions(regions: RecipeRegions): ImportMapping {
	const structuralLevels: LevelRule[] = [];
	let tail: TailRule | undefined;
	// Signature → the structural level that owns that source (for metadata re-grouping).
	const sigToLevel = new Map<string, LevelRule>();

	for (const entry of regions.layout) {
		if (entry.variadic) {
			tail = variadicToTail(entry);
			// The recipe's global target.enrichment.parent_note is the tail's
			// placement — the reverse of toRecipeRegions' tail→enrichment
			// promotion above. Only one tail carries a structural placement in
			// v0.1's single-structural-mapping constraint, so this is exact.
			if (regions.enrichment?.parent_note !== undefined) tail.placement = regions.enrichment.parent_note;
			continue;
		}
		const isFile = entry.mechanism === 'file';
		const parsed = parseStructuralTemplate(isFile ? stripMd(entry.template) : entry.template);
		const dest: Destination =
			entry.mechanism === 'folder'
				? { primitive: 'folder' }
				: entry.mechanism === 'heading'
					? { primitive: 'heading', hostRule: 'root', depth: entry.level_depth ?? 1 }
					: { primitive: 'name' };
		const rule = makeLevel(entry.level, parsed, [dest]);
		structuralLevels.push(rule);
		sigToLevel.set(sourceSignature(parsed), rule);
	}

	// Standalone metadata destinations, grouped by source signature (insertion-ordered).
	const standalone = new Map<string, LevelRule>();

	const attach = (parsed: ParsedSource, dest: Destination): void => {
		const sig = sourceSignature(parsed);
		const owner = sigToLevel.get(sig);
		if (owner) {
			owner.destinations.push(dest);
			return;
		}
		const existing = standalone.get(sig);
		if (existing) {
			existing.destinations.push(dest);
		} else {
			standalone.set(sig, makeLevel(synthLevelId(parsed), parsed, [dest]));
		}
	};

	const emit = regions.also_emit;
	if (emit) {
		for (const tag of emit.tags ?? []) {
			const { namespace, parsed } = parseTagTemplate(tag);
			attach(parsed, { primitive: 'tag', namespace });
		}
		for (const alias of emit.aliases ?? []) {
			attach(parseStructuralTemplate(alias), { primitive: 'alias' });
		}
		const managed = emit.frontmatter?.managed ?? {};
		for (const [key, template] of Object.entries(managed)) {
			const link = matchWikilink(template);
			if (link) {
				attach(parseStructuralTemplate(link), { primitive: 'link', key, direction: 'parent-on-child' });
			} else {
				attach(parseStructuralTemplate(template), { primitive: 'property', key });
			}
		}
		// managed_links → list-valued link destinations. The stored template is the
		// bare column value (no `[[…]]` wrapper — render() wikilinks each piece).
		const managedLinks = emit.frontmatter?.managed_links ?? {};
		for (const [key, spec] of Object.entries(managedLinks)) {
			attach(parseStructuralTemplate(spec.template), {
				primitive: 'link',
				key,
				direction: 'parent-on-child',
				list: true,
			});
		}
	}

	// Canonicalize destination order on every level.
	for (const rule of structuralLevels) sortDestinations(rule);
	for (const rule of standalone.values()) sortDestinations(rule);

	const mappings: StructureMapping[] = [];
	if (structuralLevels.length > 0 || tail) {
		mappings.push(tail ? { levels: structuralLevels, tail } : { levels: structuralLevels });
	}
	for (const rule of standalone.values()) {
		mappings.push({ levels: [rule] });
	}

	return regions.enrichment ? { mappings, enrichment: regions.enrichment } : { mappings };
}

/** Turn a parsed source + destinations into a LevelRule with default policies. */
function makeLevel(level: string, parsed: ParsedSource, destinations: Destination[]): LevelRule {
	const rule: LevelRule = {
		level,
		source: parsed.source,
		destinations,
		naming: inferNaming(parsed.source),
		missing: DEFAULT_MISSING,
		materialize: false,
	};
	if (parsed.delimiter !== undefined) rule.delimiter = parsed.delimiter;
	if (parsed.join !== undefined) rule.join = parsed.join;
	if (parsed.filters.length > 0) rule.filters = parsed.filters;
	return rule;
}

/** Sort a level's destinations into the canonical order for stable round-trips. */
function sortDestinations(rule: LevelRule): void {
	rule.destinations.sort((a, b) => destinationRank(a.primitive) - destinationRank(b.primitive));
}

/** Reconstruct a TailRule from a variadic folder entry. */
function variadicToTail(entry: LayoutEntry): TailRule {
	const v = entry.variadic as VariadicConfig;
	const parsed = parseStructuralTemplate(entry.template);
	const tail: TailRule = {
		source: parsed.source,
		delimiter: v.delimiter,
		destinations: [{ primitive: 'folder' }],
		naming: v.segment === 'part' ? 'part' : 'prefix',
	};
	if (v.drop_last !== undefined) tail.drop_last = v.drop_last;
	if (v.max_depth !== undefined) tail.max_depth = v.max_depth;
	if (v.on_overflow !== undefined) tail.on_overflow = v.on_overflow;
	return tail;
}

// ============================================================================
// Template parsing
// ============================================================================

/** A source recovered from a template. */
export interface ParsedSource {
	source: LevelSource;
	delimiter?: string;
	join?: string;
	filters: string[];
}

interface ParsedInterp {
	column: string;
	part?: number;
	delimiter?: string;
	filters: string[];
}

type Segment = { kind: 'lit'; text: string } | { kind: 'interp'; body: string };

/**
 * Parse a structural template (folder / file-name-without-.md / heading / plain
 * managed value) back into a source. Recognizes merged rows: several `split()`
 * interpolations over one column at consecutive indices collapse into one merged
 * range `[i,j]`. The exact inverse of `buildName`.
 */
export function parseStructuralTemplate(template: string): ParsedSource {
	const segments = parseTemplate(template);
	const interps = segments.filter((s): s is { kind: 'interp'; body: string } => s.kind === 'interp');
	const separators = segments.filter((s): s is { kind: 'lit'; text: string } => s.kind === 'lit').map((s) => s.text);

	if (interps.length === 0) {
		// No interpolation at all — a literal value (spec §7f). A brace-less
		// template is never a column reference (real templates always use
		// `{col}`); it is a constant, e.g. CIS `level: "control"` or a
		// `Frameworks/` path prefix.
		return { source: { constant: template }, filters: [] };
	}

	const parsedInterps = interps.map((s) => parseInterp(s.body));
	const sep = separators.length > 0 ? separators[separators.length - 1] : undefined;

	// Single interpolation → single part or whole column.
	if (parsedInterps.length === 1) {
		const p = parsedInterps[0];
		const ref: PartRef = p.part === undefined ? { column: p.column } : { column: p.column, part: p.part };
		return {
			source: ref,
			delimiter: p.delimiter,
			filters: p.filters,
		};
	}

	// Multiple interpolations. Merged range when all share one column + delimiter and
	// their indices are consecutive ascending; otherwise a cross-column PartRef[].
	const sameColumn = parsedInterps.every((p) => p.column === parsedInterps[0].column);
	const allIndexed = parsedInterps.every((p) => typeof p.part === 'number');
	const delimiter = parsedInterps[0].delimiter;
	const sameDelimiter = parsedInterps.every((p) => p.delimiter === delimiter);
	const consecutive =
		allIndexed &&
		parsedInterps.every((p, i) => i === 0 || (p.part as number) === (parsedInterps[i - 1].part as number) + 1);

	if (sameColumn && allIndexed && sameDelimiter && consecutive) {
		const first = parsedInterps[0].part as number;
		const last = parsedInterps[parsedInterps.length - 1].part as number;
		return {
			source: { column: parsedInterps[0].column, part: [first, last] },
			delimiter,
			join: sep,
			filters: parsedInterps[0].filters,
		};
	}

	// Cross-column merge.
	const refs: PartRef[] = parsedInterps.map((p) =>
		p.part === undefined ? { column: p.column } : { column: p.column, part: p.part },
	);
	return { source: refs, delimiter, join: sep, filters: [] };
}

/** Split a template into ordered literal + interpolation segments. */
function parseTemplate(template: string): Segment[] {
	const segments: Segment[] = [];
	const re = /\{([^}]*)\}/g;
	let last = 0;
	let m: RegExpExecArray | null;
	while ((m = re.exec(template)) !== null) {
		if (m.index > last) segments.push({ kind: 'lit', text: template.slice(last, m.index) });
		segments.push({ kind: 'interp', body: m[1] });
		last = re.lastIndex;
	}
	if (last < template.length) segments.push({ kind: 'lit', text: template.slice(last) });
	return segments;
}

/** Parse one interpolation body (`col|split(.,0)|fs-safe`) into its parts. */
function parseInterp(body: string): ParsedInterp {
	const tokens = body.split('|');
	const column = tokens[0];
	let part: number | undefined;
	let delimiter: string | undefined;
	const filters: string[] = [];
	for (const tk of tokens.slice(1)) {
		const sp = /^split\((.),(\d+)\)$/.exec(tk);
		if (sp) {
			delimiter = sp[1];
			part = Number(sp[2]);
		} else {
			filters.push(tk);
		}
	}
	return { column, part, delimiter, filters };
}

/** Parse a tag template (`namespace/{col|tagsafe}`) → namespace + source (tagsafe stripped). */
function parseTagTemplate(template: string): { namespace: string; parsed: ParsedSource } {
	const brace = template.indexOf('{');
	const namespace = brace >= 0 ? template.slice(0, brace).replace(/\/+$/, '') : template;
	const rest = brace >= 0 ? template.slice(brace) : '';
	const parsed: ParsedSource = rest
		? parseStructuralTemplate(rest)
		: { source: { constant: template }, filters: [] };
	// The implicit tagsafe filter is not part of the level's own filter chain.
	parsed.filters = parsed.filters.filter((f) => f !== 'tagsafe');
	return { namespace, parsed };
}

/** Return the inner target of a `[[...]]` wikilink template, or null. */
function matchWikilink(template: string): string | null {
	const m = /^\[\[(.+)\]\]$/.exec(template.trim());
	return m ? m[1] : null;
}

// ============================================================================
// Shared helpers
// ============================================================================

/** Infer naming from a source shape (merged → 'joined'; single → 'part'). */
function inferNaming(source: LevelSource): LevelNaming {
	const refs = toSourceRefs(source);
	if (refs.length > 1) return 'joined';
	const only = refs[0];
	if (!isConstantRef(only) && Array.isArray(only.part)) return 'joined';
	return 'part';
}

/** Canonical signature of a parsed source for metadata re-grouping. */
function sourceSignature(parsed: ParsedSource): string {
	const refs = toSourceRefs(parsed.source).map((r) =>
		isConstantRef(r) ? { constant: r.constant } : { column: r.column, part: r.part ?? null },
	);
	return JSON.stringify({ refs, delimiter: parsed.delimiter ?? null, filters: parsed.filters });
}

/** Deterministic level id for a standalone (metadata-only) source. */
function synthLevelId(parsed: ParsedSource): string {
	return firstColumn(parsed.source);
}

/** First column (or literal) referenced by a source — the level's identity key. */
function firstColumn(source: LevelSource): string {
	const ref = toSourceRefs(source)[0];
	return isConstantRef(ref) ? ref.constant : ref.column;
}

/** Strip a trailing `.md` from a file template. */
function stripMd(template: string): string {
	return template.replace(/\.md$/, '');
}

/** Slug a column name into a tag-namespace root (mirrors detection.tagRoot). */
function slug(column: string): string {
	return column
		.trim()
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '');
}
