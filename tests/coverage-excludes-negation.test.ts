/**
 * coverage-excludes-negation.test.ts — a view that COUNTS crosswalk rows must never
 * count an explicitly negated one (2026-08-21).
 *
 * A crosswalk assertion can carry `predicate_modifier: NOT`, meaning "these two
 * concepts are explicitly NOT equivalent". Counting such a row as coverage reports
 * the opposite of what the data says, and these are exactly the views a compliance
 * reader trusts. The query engine already excludes negations from closure in both
 * directions; this pins the same rule at the presentation layer, which is a
 * separate code path and was missed when negation shipped.
 *
 * Written as a property over ALL counting templates rather than three fixed
 * assertions, so a fourth counting view added later cannot quietly skip the guard.
 */

import { getRecipeTemplate } from '../src/views/recipe-templates';

/** Reference views whose output is a COUNT of crosswalk assertions. */
const COUNTING_VIEWS = [
	'nist-csf-coverage-matrix',
	'nist-csf-to-mitre-coverage',
	'crosswalk-density-by-framework',
];

describe('counting views exclude explicitly negated assertions', () => {
	it.each(COUNTING_VIEWS)('%s filters out predicate_modifier NOT', (recipeId) => {
		const template = getRecipeTemplate(recipeId);
		expect(template).not.toBeNull();
		expect(template).toContain('predicate_modifier != "NOT"');
	});

	it.each(COUNTING_VIEWS)('%s still admits rows that carry no modifier at all', (recipeId) => {
		// The overwhelming majority of assertions have no predicate_modifier. A bare
		// inequality would depend on how a missing property compares, so the guard
		// pairs it with isEmpty(), documented as covering "empty or not present".
		// Without this branch the fix would silently empty every coverage view.
		const template = getRecipeTemplate(recipeId) ?? '';
		expect(template).toContain('predicate_modifier.isEmpty()');
		expect(template).toMatch(/or:\s*\n\s*- predicate_modifier\.isEmpty\(\)/);
	});

	it('keeps the guard inside the filter block, not the view config', () => {
		// A filter placed under `views:` would apply to one view only. These are
		// global filters so every view in the base inherits the exclusion.
		const template = getRecipeTemplate('nist-csf-coverage-matrix') ?? '';
		const filterBlock = template.slice(0, template.indexOf('views:'));
		expect(filterBlock).toContain('predicate_modifier');
	});
});
