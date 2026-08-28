import {
	computeReviewCid,
	computeReviewGroupCids,
	readReviewGroupCids,
} from '../src/generation/hash';
import type { Recipe } from '../src/render';

const recipe: Recipe = {
	recipe: 'test-review-groups',
	target: {
		layout: [{ level: 'item', mechanism: 'file', template: '{id}.md' }],
		also_emit: {
			frontmatter: {
				managed: { domain: '{domain}', region: '{nested.region}' },
				managed_links: { parents: { template: '{parent ids}' } },
			},
			body: [
				{ position: 'section', heading: 'Description', template: '{description}' },
				{ position: 'section', heading: 'Nested text', template: '{nested.text}' },
			],
		},
	},
};

const base = {
	id: 'T1',
	description: 'Words a reviewer reads',
	domain: 'enterprise',
	'parent ids': 'T0',
	publisher_stamp: '2026-01',
	nested: { text: 'Nested words', region: 'EU', unused: 'x' },
};

function groups(scope: Record<string, unknown>) {
	return computeReviewGroupCids({ curie: 'test:T1', scope }, recipe);
}

describe('recipe-driven review group fingerprints', () => {
	it('does not redefine the whole-row review_cid', () => {
		const changed = { ...base, publisher_stamp: '2026-02' };
		expect(computeReviewCid({ curie: 'test:T1', scope: base }))
			.not.toBe(computeReviewCid({ curie: 'test:T1', scope: changed }));
	});

	it('body-projected source changes only the wording fingerprint', () => {
		const before = groups(base);
		const after = groups({ ...base, description: 'Rewritten words' });
		expect(after.wording).not.toBe(before.wording);
		expect(after.scope).toBe(before.scope);
		expect(after.housekeeping).toBe(before.housekeeping);
	});

	it('managed frontmatter and managed links change only the scope fingerprint', () => {
		const before = groups(base);
		for (const changed of [
			{ ...base, domain: 'mobile' },
			{ ...base, 'parent ids': 'T9' },
			{ ...base, nested: { ...base.nested, region: 'US' } },
		]) {
			const after = groups(changed);
			expect(after.wording).toBe(before.wording);
			expect(after.scope).not.toBe(before.scope);
			expect(after.housekeeping).toBe(before.housekeeping);
		}
	});

	it('unconsumed top-level and nested siblings change only housekeeping', () => {
		const before = groups(base);
		for (const changed of [
			{ ...base, publisher_stamp: '2026-02' },
			{ ...base, nested: { ...base.nested, unused: 'y' } },
		]) {
			const after = groups(changed);
			expect(after.wording).toBe(before.wording);
			expect(after.scope).toBe(before.scope);
			expect(after.housekeeping).not.toBe(before.housekeeping);
		}
	});

	it('uses the template exact-key rule for dotted spreadsheet headers', () => {
		const dottedRecipe: Recipe = {
			recipe: 'dotted',
			target: {
				layout: [{ level: 'item', mechanism: 'file', template: '{id}.md' }],
				also_emit: { body: [{ position: 'section', heading: 'Text', template: '{A.B}' }] },
			},
		};
		const before = { id: '1', 'A.B': 'flat', A: { B: 'nested', C: 'sibling' } };
		const flatChanged = { ...before, 'A.B': 'changed' };
		const siblingChanged = { ...before, A: { ...before.A, C: 'changed' } };
		const old = computeReviewGroupCids({ curie: 'test:1', scope: before }, dottedRecipe);
		const flat = computeReviewGroupCids({ curie: 'test:1', scope: flatChanged }, dottedRecipe);
		const sibling = computeReviewGroupCids({ curie: 'test:1', scope: siblingChanged }, dottedRecipe);
		expect(flat.wording).not.toBe(old.wording);
		expect(flat.housekeeping).toBe(old.housekeeping);
		expect(sibling.wording).toBe(old.wording);
		expect(sibling.housekeeping).not.toBe(old.housekeeping);
	});

	it('rejects partial group blocks as absence', () => {
		const complete = groups(base);
		expect(readReviewGroupCids(complete)).toEqual(complete);
		expect(readReviewGroupCids({ wording: complete.wording })).toBeNull();
	});
});
