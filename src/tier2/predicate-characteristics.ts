export type CrosswalkerPredicateId =
	| 'is_equivalent_to'
	| 'is_broader_than'
	| 'is_narrower_than'
	| 'is_approximate_to'
	| 'intersects_with'
	| 'no_relationship'
	| 'superseded_by'
	| 'supersedes';

export type PredicateAuthority =
	| 'external-strm-set-theory'
	| 'crosswalker-extension';

export interface PredicateCharacteristics {
	predicate_id: CrosswalkerPredicateId;
	inverse_predicate_id: CrosswalkerPredicateId;
	symmetric: boolean;
	transitive: boolean;
	authority: PredicateAuthority;
	rationale: string;
}

function frozenCharacteristics(
	characteristics: PredicateCharacteristics,
): Readonly<PredicateCharacteristics> {
	return Object.freeze(characteristics);
}

export const PREDICATE_CHARACTERISTICS: Readonly<
	Record<CrosswalkerPredicateId, Readonly<PredicateCharacteristics>>
> = Object.freeze({
	is_equivalent_to: frozenCharacteristics({
		predicate_id: 'is_equivalent_to',
		inverse_predicate_id: 'is_equivalent_to',
		symmetric: true,
		transitive: true,
		authority: 'external-strm-set-theory',
		rationale:
			'Set equality is self-inverse and symmetric: if A = B, then B = A. It is transitive: A = B and B = C imply A = C.',
	}),
	is_broader_than: frozenCharacteristics({
		predicate_id: 'is_broader_than',
		inverse_predicate_id: 'is_narrower_than',
		symmetric: false,
		transitive: true,
		authority: 'external-strm-set-theory',
		rationale:
			'A broader than B means A contains everything B contains and more (NIST IR 8477 defines Superset of in exactly those words). Reversing the operands yields B narrower than A. Strict containment chains in one direction, so A ⊃ B and B ⊃ C imply A ⊃ C.',
	}),
	is_narrower_than: frozenCharacteristics({
		predicate_id: 'is_narrower_than',
		inverse_predicate_id: 'is_broader_than',
		symmetric: false,
		transitive: true,
		authority: 'external-strm-set-theory',
		rationale:
			'A narrower than B means B contains everything A contains and more (NIST IR 8477 defines Subset of in exactly those words). Reversing the operands yields B broader than A. Strict containment chains in one direction, so A ⊂ B and B ⊂ C imply A ⊂ C.',
	}),
	is_approximate_to: frozenCharacteristics({
		predicate_id: 'is_approximate_to',
		inverse_predicate_id: 'is_approximate_to',
		symmetric: true,
		transitive: false,
		authority: 'crosswalker-extension',
		// Crosswalker product judgment, not a characteristic dictated by NIST IR 8477:
		// near-equivalence is mutual for navigation, but chaining compounds tolerance
		// and can relate endpoints that no longer approximate one another.
		rationale:
			'Crosswalker judgment: treat near-equivalence as mutual for navigation, so the inverse is itself. Do not chain it. Approximation depends on a tolerance and context; two individually acceptable hops can compound semantic drift beyond that tolerance. Therefore A≈B and B≈C do not establish A≈C without a separate direct assertion.',
	}),
	intersects_with: frozenCharacteristics({
		predicate_id: 'intersects_with',
		inverse_predicate_id: 'intersects_with',
		symmetric: true,
		transitive: false,
		authority: 'external-strm-set-theory',
		rationale:
			'Intersection is symmetric because A ∩ B = B ∩ A. It is not transitive: A={1}, B={1,2}, C={2} gives A∩B≠∅ and B∩C≠∅ while A∩C=∅.',
	}),
	no_relationship: frozenCharacteristics({
		predicate_id: 'no_relationship',
		inverse_predicate_id: 'no_relationship',
		symmetric: true,
		transitive: false,
		authority: 'external-strm-set-theory',
		rationale:
			'In the set-theoretic vocabulary this is disjointness/no overlap, which is symmetric. It is not transitive: A={1}, B={2}, C={1} makes A disjoint from B and B disjoint from C, but A is not disjoint from C.',
	}),
	// Release lineage (Ch 43). A version transition between two releases of the
	// same framework IS a crosswalk: a rename is one edge, a split is N edges
	// sharing a subject, a merge is N edges sharing an object. Modelling it this
	// way is the whole point — a flat `previous_ids` field cannot express
	// many-to-many and would put history inside concept identity.
	superseded_by: frozenCharacteristics({
		predicate_id: 'superseded_by',
		inverse_predicate_id: 'supersedes',
		symmetric: false,
		transitive: true,
		authority: 'crosswalker-extension',
		rationale:
			'Release lineage. A superseded_by B states that B replaces A in a later release of the same ontology. Reversing the operands yields B supersedes A. Transitive because replacement chains across releases: if r4:AC-2 is superseded by r5:AC-2 and r5:AC-2 by r6:PT-1, an attestation approved against r4:AC-2 must be able to find r6:PT-1. Unlike is_approximate_to, chaining compounds no tolerance: each hop asserts replacement, not similarity.',
	}),
	supersedes: frozenCharacteristics({
		predicate_id: 'supersedes',
		inverse_predicate_id: 'superseded_by',
		symmetric: false,
		transitive: true,
		authority: 'crosswalker-extension',
		rationale:
			'Release lineage, stated from the newer end. A supersedes B states that A replaces B in a later release of the same ontology; reversing the operands yields B superseded_by A. Transitive for the same reason as its inverse: replacement chains across releases. Named explicitly rather than left implicit because the effective-edge traversal materialises the inverse spelling into query rows, and a predicate that appears in a result row must be a predicate that exists.',
	}),
});

export function getPredicateCharacteristics(
	predicateId: string,
): Readonly<PredicateCharacteristics> | null {
	if (!Object.prototype.hasOwnProperty.call(PREDICATE_CHARACTERISTICS, predicateId)) {
		return null;
	}
	return PREDICATE_CHARACTERISTICS[predicateId as CrosswalkerPredicateId];
}

/**
 * The release-lineage predicates, as one named set.
 *
 * Lineage says "B replaces A in a later release". It is NOT a statement about
 * how the two concepts scopes overlap, so it has no OLIR/STRM relationship type
 * and no SKOS mapping property. Every consumer that translates a Crosswalker
 * predicate into a set-theoretic vocabulary must exclude these rather than fall
 * back: a fallback turns a lineage record into the auditor-facing claim that two
 * controls intersect.
 *
 * Exported as a set rather than re-derived at each call site so that a third
 * lineage predicate, if one is ever added, cannot be silently missed by one
 * exporter and honoured by the other.
 */
export const LINEAGE_PREDICATE_IDS: readonly CrosswalkerPredicateId[] = Object.freeze([
	'superseded_by',
	'supersedes',
]);

/** True when this predicate records release lineage rather than set overlap. */
export function isLineagePredicate(predicateId: string): boolean {
	return (LINEAGE_PREDICATE_IDS as readonly string[]).includes(predicateId);
}

/**
 * The reason recorded against a row an exporter refuses to translate. One
 * constant so the two exporters and their regression tests cannot drift into
 * different wording.
 */
export const LINEAGE_NOT_REPRESENTABLE_REASON =
	'lineage-predicate-not-representable-in-strm';
