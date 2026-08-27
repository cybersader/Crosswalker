/**
 * shorthand.ts — the comma-shorthand row filter, translated into an explicit
 * `source.where` expression.
 *
 * WHY THIS EXISTS. The plugin shipped TWO row predicates. `src/source/where.ts`
 * is the loud one: G1 demands a strict boolean, G2 rejects a name that does not
 * exist in the collection, G3 rejects a predicate that admits nothing. The other
 * one — `parseWhere` / `applyWhere` in the JSON parser — was silent, and its
 * documented behaviour was "a missing field never `=`-matches, and always
 * `!=`-matches". A typo'd column therefore returned zero rows (`=`) or every row
 * (`!=`) with no diagnostic at all.
 *
 * The ruling (2026-08-27 contract §11) is to reconcile, not to deprecate: a
 * deprecated silent predicate is still a shipped silent predicate. The silent
 * implementation is DELETED, and this module translates the shorthand the wizard
 * field accepts into an expression `source.where` evaluates under all three
 * guards. One predicate, portable with the recipe, applied to CSV and XLSX as
 * well as JSON.
 *
 * THE TRUTH TABLE IS DELIBERATELY UNCHANGED:
 *
 *   a=b   ->  ($exists(`a`) and $string(`a`) = 'b')
 *   a!=b  ->  ($not($exists(`a`)) or $string(`a`) != 'b')
 *   a,b   ->  (<a>) and (<b>)
 *
 * The `!=` form reads literally as "the field is absent, or it is not that
 * value". The contract sketched this with a ternary; a ternary is outside the
 * permitted source-expression subset (it is computation, and the subset exists
 * to keep that in the producer), so the same truth table is expressed with
 * $not/$exists/or, all of which are permitted. Same semantics, same guards.
 *
 * The `!=` form keeps "a record lacking the field is not equal to `b`" because
 * THE DEFECT WAS NEVER THE TRUTH TABLE. The defect was that the truth table was
 * implicit and unguarded. Written into the expression text the UI displays, a
 * reader can see it; and G2 catches the typo case that made it dangerous.
 *
 * This matters concretely. The documented MITRE ATT&CK STIX filter is
 * `type=attack-pattern,revoked!=true,x_mitre_deprecated!=true` over a SPARSE
 * field. A naive translation to `` `revoked` != 'true' `` returns a non-boolean
 * on every record lacking `revoked`, trips G1, and fails an import that works
 * today. The $not/$exists form keeps it working while staying loud about the
 * thing that was actually broken.
 *
 * String comparison is preserved: `toSourceRows` coerces JSON scalars with
 * `String(v).trim()`, so a raw JSON `true` is already the string `"true"` by the
 * time either predicate sees it. `$string()` in the translation matches. No
 * semantic drift beyond the intended loudness.
 */

/**
 * Translate the comma-shorthand into a `source.where` expression.
 *
 * Returns `undefined` for an empty or whitespace-only spec, so a blank UI field
 * declares no predicate at all (and `prepareSourceStage` takes its additive
 * path, never entering the expression engine).
 *
 * Throws on a malformed clause. The message names the clause, because the user
 * typed it.
 */
export function shorthandToSourceExpression(spec: string | undefined | null): string | undefined {
	if (spec === undefined || spec === null) return undefined;
	const clauses: string[] = [];
	for (const part of spec.split(',')) {
		const clause = part.trim();
		if (!clause) continue;
		const negIdx = clause.indexOf('!=');
		const eqIdx = clause.indexOf('=');
		let path: string;
		let value: string;
		let negate: boolean;
		if (negIdx >= 0 && (eqIdx === -1 || negIdx <= eqIdx)) {
			path = clause.slice(0, negIdx).trim();
			value = clause.slice(negIdx + 2).trim();
			negate = true;
		} else if (eqIdx > 0) {
			path = clause.slice(0, eqIdx).trim();
			value = clause.slice(eqIdx + 1).trim();
			negate = false;
		} else {
			throw new Error(`Malformed filter "${clause}". Write field=value to keep matches, or field!=value to drop them.`);
		}
		if (!path) throw new Error(`Malformed filter "${clause}". The field name is empty.`);
		const ref = quotePath(path);
		const literal = quoteLiteral(value);
		clauses.push(negate
			? `($not($exists(${ref})) or $string(${ref}) != ${literal})`
			: `($exists(${ref}) and $string(${ref}) = ${literal})`);
	}
	if (clauses.length === 0) return undefined;
	return clauses.length === 1 ? clauses[0] : clauses.join(' and ');
}

/**
 * A dotted shorthand path becomes backtick-quoted segments: `meta.tier` ->
 * `` `meta`.`tier` ``. Backticks are the JSONata escape for a name that is not
 * a bare identifier, which is most real-world column names (spaces, hyphens,
 * leading digits). A segment containing a backtick cannot be expressed and is
 * rejected rather than silently mangled.
 */
function quotePath(path: string): string {
	return path
		.split('.')
		.map((segment) => {
			const name = segment.trim();
			if (name === '') throw new Error(`Malformed filter path "${path}". It has an empty segment.`);
			if (name.includes('`')) throw new Error(`Filter path "${path}" contains a backtick, which cannot be quoted.`);
			return `\`${name}\``;
		})
		.join('.');
}

/** Single-quoted string literal, with embedded single quotes escaped. */
function quoteLiteral(value: string): string {
	return `'${value.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
}
