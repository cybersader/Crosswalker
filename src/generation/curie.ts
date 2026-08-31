/**
 * curie.ts — the one normalization every curie prefix passes through.
 *
 * Extracted from `generation-engine.ts` (AM-18, 2026-08-31) so the modules that
 * REASON about curie prefixes (`import-set.ts`, which answers whether a new set
 * would collide with an existing one) can share the same function as the module
 * that MINTS them, without importing the engine and closing a cycle.
 *
 * Failure mode prevented: a second, slightly different slugifier. A prefix
 * compared in one normalization against a prefix stamped in another matches
 * nothing, which reads as "no set occupies this space" and mints a duplicate.
 * `generation-engine.ts` re-exports this so existing importers are unaffected.
 */

/**
 * Slugify a string for use as a CURIE prefix (must match the schema's
 * `^[a-z][a-z0-9_-]*` pattern from spec/tier1.schema.json $defs/curie).
 *
 * Exported so a caller comparing a source against the ontology prefixes ALREADY
 * STAMPED on vault notes produces the same prefix generation stamps. Comparing
 * against the un-slugged ontology instead silently misses every name that needed
 * normalizing, which reads as "no set matches" and mints a duplicate.
 */
export function slugifyForCurie(input: string): string {
	const lower = String(input).toLowerCase();
	const cleaned = lower.replace(/[^a-z0-9_-]+/g, '-').replace(/^-|-$/g, '');
	// Ensure first char is a letter (schema requires)
	return /^[a-z]/.test(cleaned) ? cleaned : `cw-${cleaned}`;
}
