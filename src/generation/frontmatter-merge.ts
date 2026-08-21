/**
 * frontmatter-merge.ts — managed/user_preserve merge semantics
 *
 * Per Ch 22 §8.4: managed frontmatter keys are recipe-owned (overwritten on
 * every re-render); user_preserve keys are user annotations (preserved on
 * every re-render); third-party keys (added by other plugins or hand-edited
 * outside the recipe's known fields) are also preserved by default.
 *
 * On re-import, the engine reads the existing file's frontmatter, merges it
 * with the freshly-rendered frontmatter, and writes the merged result.
 *
 * This is the "destination has user data" problem from Airbyte / dbt;
 * the answer is the same: declare what's managed; preserve everything else.
 */

/**
 * Merge new (recipe-managed) frontmatter with existing (possibly user-edited)
 * frontmatter, preserving user keys.
 *
 * @param existing      Frontmatter currently in the file (may be empty)
 * @param managed       Frontmatter keys + values rendered from the recipe
 * @param managedKeys   Set of keys this recipe knows it manages
 *                      (used to identify "what to overwrite vs preserve")
 * @returns merged frontmatter — managed keys take new values; everything else
 *          from existing is preserved
 *
 * Always-preserved special keys: `_crosswalker` (provenance — always
 * recipe-emitted; never user-edited), `curie` (concept identity — always
 * recipe-emitted).
 *
 * Always-managed special keys: `_crosswalker`, `curie` (overwritten on
 * every re-render).
 *
 * List-union special keys (`tags`, `aliases`): even though these are managed
 * (the recipe emits them), their existing value is UNIONED with the new value
 * rather than overwritten — recipe values first, then any user-added extras.
 * This preserves a user's hand-added tags/aliases across re-import while still
 * guaranteeing every recipe-emitted tag/alias is present. Tradeoff: a tag the
 * recipe STOPS emitting is not removed on re-import (it now looks user-added).
 * That is deliberate — silently deleting a user's tag is worse than keeping a
 * stale one, and both are user-fixable. (spec §7k connectedness mandate.)
 */
export function mergeFrontmatter(
	existing: Record<string, unknown>,
	managed: Record<string, unknown>,
	managedKeys: Set<string>,
): Record<string, unknown> {
	const result: Record<string, unknown> = {};

	// 1. Preserve everything in `existing` that ISN'T in managedKeys
	//    (third-party-plugin keys, user annotations, hand-edited fields)
	for (const [k, v] of Object.entries(existing)) {
		if (!managedKeys.has(k) && k !== '_crosswalker' && k !== 'curie') {
			result[k] = v;
		}
	}

	// 2. Apply managed values ONLY for keys still in managedKeys.
	//    Keys removed from managedKeys (via user_preserve patterns) keep the
	//    existing value, even if the recipe wrote them initially. The list-union
	//    keys (tags/aliases) merge with the existing value instead of clobbering.
	for (const [k, v] of Object.entries(managed)) {
		if (managedKeys.has(k)) {
			if (LIST_UNION_KEYS.has(k) && k in existing) {
				result[k] = unionStringList(v, existing[k]);
			} else {
				result[k] = v;
			}
		}
	}

	// 3. Always-overwrite specials: _crosswalker provenance + curie ID
	//    (these are recipe-only; user_preserve cannot exempt them)
	if ('_crosswalker' in managed) result._crosswalker = managed._crosswalker;
	if ('curie' in managed) result.curie = managed.curie;

	return result;
}

/**
 * Managed keys whose values are UNIONED with the existing note's value on
 * re-import (recipe values first, then user-added extras) instead of being
 * overwritten wholesale. See mergeFrontmatter's doc comment for the rationale.
 */
const LIST_UNION_KEYS = new Set(['tags', 'aliases']);

/**
 * Union two frontmatter list values into a de-duplicated array, `managed`
 * entries first (recipe order preserved), then any `existing` entries not
 * already present. Scalars are coerced to a single-element list; empty/null
 * values contribute nothing. Deterministic and idempotent
 * (union(m, union(m, e)) === union(m, e)).
 */
function unionStringList(managed: unknown, existing: unknown): unknown[] {
	const toArr = (v: unknown): unknown[] =>
		Array.isArray(v) ? v : v === undefined || v === null || v === '' ? [] : [v];
	const out: unknown[] = [];
	const seen = new Set<string>();
	for (const item of [...toArr(managed), ...toArr(existing)]) {
		const key = String(item);
		if (seen.has(key)) continue;
		seen.add(key);
		out.push(item);
	}
	return out;
}

/**
 * Compute the set of keys this recipe manages.
 *
 * Authority is the union of keys present in the rendered object and keys the
 * recipe declares as managed. This lets a declared-but-empty value delete a
 * stale value without serializing an empty placeholder. The always-managed
 * special keys (`_crosswalker`, `curie`). Recipes that explicitly declare
 * `also_emit.frontmatter.user_preserve` patterns are honored upstream
 * (the patterns get filtered OUT of `managedKeys` so they're treated as
 * user-owned even if the recipe wrote them initially).
 */
export function computeDeclaredManagedKeys(frontmatter?: {
	managed?: Record<string, unknown>;
	managed_links?: Record<string, unknown>;
}): Set<string> {
	return new Set([
		...Object.keys(frontmatter?.managed ?? {}),
		...Object.keys(frontmatter?.managed_links ?? {}),
	]);
}

export function computeManagedKeys(
	managed: Record<string, unknown>,
	userPreservePatterns: string[] = [],
	declaredManagedKeys: Iterable<string> = [],
): Set<string> {
	const keys = new Set<string>([...Object.keys(managed), ...declaredManagedKeys]);
	keys.add('_crosswalker');
	keys.add('curie');

	// Honor user_preserve patterns — these keys are user-owned even if the
	// recipe writes them on first import. v0.1 supports exact matches and
	// `*`-prefix/suffix glob; full glob support comes later.
	for (const pattern of userPreservePatterns) {
		if (pattern.includes('*')) {
			// Glob match: remove any existing managed key that matches
			const re = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$');
			for (const k of [...keys]) {
				if (re.test(k)) keys.delete(k);
			}
		} else {
			keys.delete(pattern);
		}
	}

	return keys;
}
