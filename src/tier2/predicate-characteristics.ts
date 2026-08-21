export type CrosswalkerPredicateId =
	| 'is_equivalent_to'
	| 'is_broader_than'
	| 'is_narrower_than'
	| 'is_approximate_to'
	| 'intersects_with'
	| 'no_relationship';

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
});

export function getPredicateCharacteristics(
	predicateId: string,
): Readonly<PredicateCharacteristics> | null {
	if (!Object.prototype.hasOwnProperty.call(PREDICATE_CHARACTERISTICS, predicateId)) {
		return null;
	}
	return PREDICATE_CHARACTERISTICS[predicateId as CrosswalkerPredicateId];
}
