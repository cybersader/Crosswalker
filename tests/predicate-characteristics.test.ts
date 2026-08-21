import tier1Schema from '../spec/tier1.schema.json';
import {
	PREDICATE_CHARACTERISTICS,
	getPredicateCharacteristics,
	type CrosswalkerPredicateId,
} from '../src/tier2/predicate-characteristics';

const schemaPredicates = (
	(tier1Schema as any).$defs.crosswalk_edge_frontmatter.properties.predicate_id.enum as string[]
).slice();

const characteristicRows = Object.values(PREDICATE_CHARACTERISTICS);

describe('Crosswalker predicate characteristics', () => {
	it('has exact key parity with the Tier 1 predicate enum', () => {
		expect(Object.keys(PREDICATE_CHARACTERISTICS).sort()).toEqual(schemaPredicates.sort());
	});

	it('round-trips every inverse and marks exactly self-inverse predicates symmetric', () => {
		for (const row of characteristicRows) {
			const inverse = PREDICATE_CHARACTERISTICS[row.inverse_predicate_id];
			expect(inverse).toBeDefined();
			expect(inverse.inverse_predicate_id).toBe(row.predicate_id);
			expect(row.symmetric).toBe(row.inverse_predicate_id === row.predicate_id);
		}
	});

	it('declares exactly equivalent, broader, and narrower predicates transitive', () => {
		expect(
			characteristicRows
				.filter((row) => row.transitive)
				.map((row) => row.predicate_id)
				.sort(),
		).toEqual(['is_broader_than', 'is_equivalent_to', 'is_narrower_than']);
	});

	it('labels only approximation as a Crosswalker extension', () => {
		expect(
			characteristicRows
				.filter((row) => row.authority === 'crosswalker-extension')
				.map((row) => row.predicate_id),
		).toEqual(['is_approximate_to']);
		expect(PREDICATE_CHARACTERISTICS.is_approximate_to.rationale).toContain(
			'Crosswalker judgment',
		);
	});

	it('freezes the authority table and every row at runtime', () => {
		expect(Object.isFrozen(PREDICATE_CHARACTERISTICS)).toBe(true);
		for (const row of characteristicRows) expect(Object.isFrozen(row)).toBe(true);

		const mutableView = PREDICATE_CHARACTERISTICS as unknown as Record<
			CrosswalkerPredicateId,
			{ transitive: boolean }
		>;
		expect(Reflect.set(mutableView.is_approximate_to, 'transitive', true)).toBe(false);
		expect(PREDICATE_CHARACTERISTICS.is_approximate_to.transitive).toBe(false);
	});

	it('returns null for unknown strings and the frozen row for known strings', () => {
		expect(getPredicateCharacteristics('skos:closeMatch')).toBeNull();
		expect(getPredicateCharacteristics('is_broader_than')).toBe(
			PREDICATE_CHARACTERISTICS.is_broader_than,
		);
	});
});
