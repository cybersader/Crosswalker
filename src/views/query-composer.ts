/**
 * query-composer.ts — Phase 7 (recipe → primitive bridge)
 *
 * Chains Layer A primitives per a recipe's declared query spec. This is the
 * piece that makes `joinMode: anti` in a recipe actually DO something — it
 * maps the recipe's `Join.kind` enum onto the join-primitives modes and
 * composes filter → join(s) → output.
 *
 * **Scope boundary (honest):** the composer operates on already-resolved
 * row-sets + already-compiled predicate functions. It does NOT:
 *   - evaluate JSONata filter expressions (that's the recipe-load layer's job;
 *     it compiles a QueryFilter → predicate fn and hands it here)
 *   - pull data from the vault / Tier 2 SQL (the caller resolves row-sets and
 *     passes them in as a named source map)
 *   - render anything (Layer B view shapes consume the composer's output)
 *
 * Keeping those out makes the composer pure + fully unit-testable. The live
 * Bases-view wiring (resolve sources from the vault → compose → render) is a
 * separate integration step that requires the Obsidian runtime.
 *
 * Both array + streaming execution paths, matching the Phase 6.2 primitive
 * shapes.
 */

import { filter, filterStream, type FilterPredicate } from './filter-primitive';
import {
	executeJoin,
	executeJoinStream,
	type JoinEntry,
	type JoinMode,
	type KeyExtractor,
} from './join-primitives';

export type ComposerRow = Record<string, unknown>;

/**
 * Recipe `Join.kind` enum (from spec/recipe.schema.json) → join-primitives
 * JoinMode. The schema uses short names (left/right/outer); the primitives use
 * explicit names (left-outer/right-outer/full-outer). Single mapping point.
 */
const JOIN_KIND_TO_MODE: Record<string, JoinMode> = {
	inner: 'inner',
	left: 'left-outer',
	right: 'right-outer',
	outer: 'full-outer',
	anti: 'anti',
};

export function joinKindToMode(kind: string): JoinMode {
	const mode = JOIN_KIND_TO_MODE[kind];
	if (!mode) {
		throw new Error(`Unknown join kind '${kind}'. Expected one of: ${Object.keys(JOIN_KIND_TO_MODE).join(', ')}`);
	}
	return mode;
}

/**
 * One join step in a composed query. `withSource` names the row-set (in the
 * source map) to join against. `leftOn`/`rightOn` extract the join keys.
 * `kind` is the recipe enum value (inner/left/right/outer/anti).
 */
export interface ComposerJoinStep {
	/** Name of the right-side source in the source map. */
	withSource: string;
	/** Recipe join kind (inner/left/right/outer/anti). */
	kind: string;
	/** Left-side key extractor. */
	leftOn: KeyExtractor;
	/** Right-side key extractor. */
	rightOn: KeyExtractor;
	/** Optional right-key prefix on merge (default 'r_'; '' = overwrite left). */
	rightPrefix?: string;
}

export interface ComposeQuerySpec {
	/** Name of the primary (left-most) source in the source map. */
	from: string;
	/** Optional pre-filter applied to the primary source before joins. */
	where?: FilterPredicate;
	/** Ordered join steps; each joins the running result against a named source. */
	joins?: ComposerJoinStep[];
	/** Optional post-filter applied to the final composed result. */
	having?: FilterPredicate;
}

/** Named row-sets the composer joins together. */
export type SourceMap = Record<string, ComposerRow[]>;

/**
 * Compose a query (array path). Resolves `from` → applies `where` →
 * folds each join step left-to-right → applies `having`. Returns the
 * fully-materialized row-set.
 */
export function composeQuery(spec: ComposeQuerySpec, sources: SourceMap): ComposerRow[] {
	const primary = sources[spec.from];
	if (!primary) {
		throw new Error(`composeQuery: source '${spec.from}' not found in source map (have: ${Object.keys(sources).join(', ')})`);
	}

	let current: ComposerRow[] = spec.where ? filter(primary, spec.where) : primary;

	for (const step of spec.joins ?? []) {
		const right = sources[step.withSource];
		if (!right) {
			throw new Error(`composeQuery: join source '${step.withSource}' not found in source map`);
		}
		current = executeJoin(current as JoinEntry[], right as JoinEntry[], {
			leftOn: step.leftOn,
			rightOn: step.rightOn,
			mode: joinKindToMode(step.kind),
			rightPrefix: step.rightPrefix,
		}) as ComposerRow[];
	}

	if (spec.having) {
		current = filter(current, spec.having);
	}
	return current;
}

/**
 * Compose a query (streaming path). The PRIMARY source streams; each join's
 * right side is hash-built (per the Phase 6.2 contract). `where` is a lazy
 * generator filter; `having` filters the final stream. Returns an Iterable —
 * nothing is materialized until the caller consumes it.
 *
 * Note: chained joins each buffer their right side (O(right) per join). The
 * left side stays streamed end-to-end. For a pipeline that renders only the
 * first N rows, the full result is never materialized.
 */
export function composeQueryStream(spec: ComposeQuerySpec, sources: SourceMap): Iterable<ComposerRow> {
	const primary = sources[spec.from];
	if (!primary) {
		throw new Error(`composeQueryStream: source '${spec.from}' not found in source map (have: ${Object.keys(sources).join(', ')})`);
	}

	let current: Iterable<ComposerRow> = spec.where ? filterStream(primary, spec.where) : primary;

	for (const step of spec.joins ?? []) {
		const right = sources[step.withSource];
		if (!right) {
			throw new Error(`composeQueryStream: join source '${step.withSource}' not found in source map`);
		}
		current = executeJoinStream(current as Iterable<JoinEntry>, right as Iterable<JoinEntry>, {
			leftOn: step.leftOn,
			rightOn: step.rightOn,
			mode: joinKindToMode(step.kind),
			rightPrefix: step.rightPrefix,
		}) as Iterable<ComposerRow>;
	}

	if (spec.having) {
		current = filterStream(current, spec.having);
	}
	return current;
}
