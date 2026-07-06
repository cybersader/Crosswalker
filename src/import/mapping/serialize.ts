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
} from './types';
import { destinationRank, toPartRefs, DEFAULT_MISSING } from './types';

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

/** The cross-cutting also_emit region. */
export interface AlsoEmit {
	tags?: string[];
	aliases?: string[];
	frontmatter?: {
		managed?: Record<string, string>;
		user_preserve?: string[];
	};
}

/** The regions `toRecipeRegions` produces / `fromRegions` consumes. */
export interface RecipeRegions {
	layout: LayoutEntry[];
	also_emit?: AlsoEmit;
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

/**
 * Project an ImportMapping onto recipe regions. Structural destinations become
 * layout entries; metadata destinations become also_emit; a tail becomes a
 * variadic folder entry. Lossy fields (see the module note) are silently
 * dropped.
 */
export function toRecipeRegions(mapping: ImportMapping): RecipeRegions {
	const layout: LayoutEntry[] = [];
	const tags: string[] = [];
	const aliases: string[] = [];
	const managed: Record<string, string> = {};

	for (const structure of mapping.mappings) {
		for (const rule of structure.levels) {
			emitLevel(rule, layout, tags, aliases, managed);
		}
		if (structure.tail) {
			layout.push(tailToEntry(structure.tail));
		}
	}

	const also_emit = buildAlsoEmit(tags, aliases, managed);
	return also_emit ? { layout, also_emit } : { layout };
}

/** Emit one level's destinations into the appropriate regions. */
function emitLevel(
	rule: LevelRule,
	layout: LayoutEntry[],
	tags: string[],
	aliases: string[],
	managed: Record<string, string>,
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
				managed[dest.key] = `[[${name}]]`;
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
	// NOTE: tail.placement has no recipe surface yet (parent_note knob pending) — dropped.
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
): AlsoEmit | undefined {
	const out: AlsoEmit = {};
	if (tags.length) out.tags = tags;
	if (aliases.length) out.aliases = aliases;
	if (Object.keys(managed).length) out.frontmatter = { managed };
	return tags.length || aliases.length || Object.keys(managed).length ? out : undefined;
}

// ============================================================================
// Template building
// ============================================================================

/**
 * Build a template string from a source. Each PartRef becomes one interpolation:
 *   - whole column        → `{col}`
 *   - part index n        → `{col|split(delimiter,n)}`
 *   - range [i,j]         → `{col|split(delimiter,i)}` … `{col|split(delimiter,j)}`
 * Interpolations are concatenated with `join ?? delimiter ?? ''`. Trailing
 * filters chain inside each interpolation. This is the exact inverse of
 * `parseStructuralTemplate`.
 */
export function buildName(
	source: LevelSource,
	delimiter: string | undefined,
	join: string | undefined,
	filters: string[] | undefined,
): string {
	const sep = join ?? delimiter ?? '';
	const bodies: string[] = [];
	for (const ref of toPartRefs(source)) {
		if (ref.part === undefined) {
			bodies.push(withFilters(ref.column, filters));
		} else if (typeof ref.part === 'number') {
			bodies.push(withFilters(`${ref.column}|split(${delimiter},${ref.part})`, filters));
		} else {
			const [i, j] = ref.part;
			for (let k = i; k <= j; k++) {
				bodies.push(withFilters(`${ref.column}|split(${delimiter},${k})`, filters));
			}
		}
	}
	return bodies.map((b) => `{${b}}`).join(sep);
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

	return { mappings };
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
		// No interpolation at all — treat the whole literal as a column name.
		return { source: { column: template }, filters: [] };
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
	const parsed = rest ? parseStructuralTemplate(rest) : { source: { column: template } as PartRef, filters: [] };
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
	const refs = toPartRefs(source);
	if (refs.length > 1) return 'joined';
	const only = refs[0];
	if (Array.isArray(only.part)) return 'joined';
	return 'part';
}

/** Canonical signature of a parsed source for metadata re-grouping. */
function sourceSignature(parsed: ParsedSource): string {
	const refs = toPartRefs(parsed.source).map((r) => ({
		column: r.column,
		part: r.part ?? null,
	}));
	return JSON.stringify({ refs, delimiter: parsed.delimiter ?? null, filters: parsed.filters });
}

/** Deterministic level id for a standalone (metadata-only) source. */
function synthLevelId(parsed: ParsedSource): string {
	return firstColumn(parsed.source);
}

/** First column referenced by a source. */
function firstColumn(source: LevelSource): string {
	return toPartRefs(source)[0].column;
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
