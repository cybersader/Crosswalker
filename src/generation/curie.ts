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

import { sha256Hex } from './hash';

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

// ---------------------------------------------------------------------------
// AM-27 (2026-08-31). Injective local parts.
//
// Failure mode prevented: two distinct source values answering to one CURIE.
// Every sanitizer in this codebase was written to make a string safe for a
// FILESYSTEM, and a filesystem sanitizer is many-to-one by design - `AC 2` and
// `AC-2`, `a/b` and `a-b`, `.x` and `x` all collapse. Identity may not pass
// through such a function: two rows that collapse together produce two files
// holding one curie, which is a permanent `Ambiguous identity` collision that
// fails EVERY later import in the vault, and one row silently overwriting the
// other's note when they also share an address.
//
// The construction below is injective by construction rather than by luck: a
// value already inside the target charset (and free of the reserved marker) is
// passed through unchanged, and any other value is rewritten as
// `<safe form><marker><short hash of the EXACT raw value>`. The two output sets
// are disjoint because only the second ever contains the marker, and inside the
// second the hash is fixed-length hex containing no marker character, so the
// last marker is always the separator and the decomposition is unique.
// ---------------------------------------------------------------------------

/**
 * The local half of a CURIE, per `spec/tier1.schema.json` `$defs/curie`
 * (`^[a-z][a-z0-9_-]*:[A-Za-z0-9._\-()/]+$`). Anchored on its own so a single
 * declared value can be checked without rebuilding the prefix.
 */
export const CURIE_LOCAL_PART_PATTERN = /^[A-Za-z0-9._\-()/]+$/;

/** Does this value satisfy the spec's CURIE local-part charset as written? */
export function isValidCurieLocalPart(value: string): boolean {
	return CURIE_LOCAL_PART_PATTERN.test(value);
}

/**
 * Reserved marker for the CURIE charset. `.` is inside the spec charset, so the
 * escaped form stays a legal CURIE; `..` is the marker because a hex digest
 * contains no `.`, which is what makes the separator unambiguous.
 */
const CURIE_ESCAPE_MARKER = '..';

/**
 * Reserved marker for the narrower endpoint-token charset the SSSOM importer
 * uses (`[A-Za-z0-9_-]`). Same argument as above with `-` in place of `.`.
 */
const TOKEN_ESCAPE_MARKER = '--';

/** Short digest of the EXACT pre-sanitizer value. Same 10-hex convention as
 * `evidence-link.ts`'s pair hash (AM-22), so one project reads one length. */
function rawFormHash(raw: string): string {
	return sha256Hex(raw).slice(0, 10);
}

function escapeInto(raw: string, unsafe: RegExp, marker: string): string {
	const safe = raw.replace(unsafe, '-');
	// The marker test is not decoration. Without it an unchanged raw value that
	// happened to contain the marker could equal some other value's escaped form,
	// and the two output sets would overlap at exactly that point.
	if (safe === raw && !raw.includes(marker)) return raw;
	return `${safe}${marker}${rawFormHash(raw)}`;
}

/**
 * A CURIE local part that is safe for the spec charset AND injective.
 *
 * Readable values (`AC-2`, `A.9.2.1`, `T1078`) pass through untouched, so a
 * vault stays legible; only a value that would otherwise have been collapsed
 * pays for the disambiguation.
 */
export function injectiveCurieLocalPart(raw: string): string {
	return escapeInto(raw, /[^A-Za-z0-9._\-()/]+/g, CURIE_ESCAPE_MARKER);
}

/**
 * The same treatment for a deterministic endpoint token (SSSOM subject/object
 * ids), whose target charset is deliberately narrower than the spec's so the
 * assembled `cw-<subject>-<object>` local part stays legible and filesystem-safe.
 */
export function injectiveEndpointToken(raw: string): string {
	return escapeInto(raw, /[^A-Za-z0-9_-]+/g, TOKEN_ESCAPE_MARKER);
}

/**
 * AM-27. The declared-facts chain: the columns a source uses to state an
 * identity, in the order the recipe path has always consulted them.
 *
 * Returns the column that answered and its EXACT raw value, so a caller can name
 * the column in a refusal. `curie` is first and is treated differently by
 * callers: a value in that column is a declared CURIE, and rewriting a declared
 * identity is the thing this amendment forbids.
 */
export const DECLARED_IDENTITY_COLUMNS = ['curie', 'id', 'subject_id', 'control_id', 'code'] as const;
export type DeclaredIdentityColumn = typeof DECLARED_IDENTITY_COLUMNS[number];

export function declaredIdentity(
	row: Record<string, unknown>,
): { column: DeclaredIdentityColumn; raw: string } | null {
	for (const column of DECLARED_IDENTITY_COLUMNS) {
		const value = row[column];
		if (typeof value === 'string' && value.length > 0) return { column, raw: value };
	}
	return null;
}

/**
 * The local half of a value that may already be a full CURIE (`nist:AC-2`).
 * Identical to what the recipe path has always done, kept in one place so the
 * legacy and the new derivation cannot disagree about where the prefix ends.
 */
export function stripCuriePrefix(value: string): string {
	const colon = value.indexOf(':');
	return colon > 0 ? value.slice(colon + 1) : value;
}

/**
 * AM-27. A declared `curie` column whose value the spec charset rejects.
 *
 * Thrown, not sanitized: the row SAID what its identity is. Quietly rewriting it
 * means the vault holds an identity the source never declared, nothing downstream
 * can join back to the source system, and two rows whose declared curies differ
 * only in a rejected character silently become one note.
 */
export class DeclaredCurieCharsetError extends Error {
	constructor(public readonly declared: string) {
		super(
			`The curie column on this row is "${declared}", which uses characters a CURIE cannot contain. `
			+ 'After the prefix, a CURIE allows letters, digits, and these characters: . _ - ( ) / '
			+ 'Fix the value in your source, or clear the curie column and let the import derive an identity from another column.',
		);
		this.name = 'DeclaredCurieCharsetError';
	}
}
