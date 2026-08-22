/**
 * Tests for v0.1.4 kind dispatch in render().
 *
 * Verifies:
 *  - render() with kind: 'concept' (default) does NOT emit a kind discriminator
 *  - render() with kind: 'junction-note' emits kind: 'junction-note'
 *  - render() with kind: 'crosswalk-edge' emits kind: 'crosswalk-edge'
 *  - kind on a non-leaf entry is honored (last non-default wins)
 *  - kind dispatch composes with also_emit.frontmatter.managed (managed values
 *    appear alongside the kind field)
 */

import { render, type Recipe } from '../src/render';
import evidenceJunctionRecipe from '../recipes/starter/evidence-junction-notes.json';

describe('render() kind dispatch (v0.1.4)', () => {
	const baseScope = {
		subject_id: 'nist-csf:PR.AC-01',
		predicate_id: 'is_equivalent_to',
		object_id: 'nist:AC-2',
		match_type: 'exact',
		mapping_justification: 'semapv:ManualMappingCuration',
		mapping_provider: 'NIST OLIR',
	};

	test('default kind (concept) — no kind discriminator in frontmatter', () => {
		const recipe: Recipe = {
			recipe: 'test-concept',
			source: { ontology: 'nist', levels: ['control'] },
			target: {
				layout: [
					{
						level: 'control',
						mechanism: 'file',
						template: '{subject_id|slug}.md',
					},
				],
			},
		};

		const address = render(recipe, {
			curie: 'nist:test',
			scope: baseScope,
		});

		expect(address.frontmatter.kind).toBeUndefined();
	});

	test('kind: "junction-note" — emits kind discriminator', () => {
		const recipe: Recipe = {
			recipe: 'test-junction',
			source: { ontology: 'evidence', levels: ['ev'] },
			target: {
				layout: [
					{
						level: 'ev',
						mechanism: 'file',
						template: 'jn-{subject_id|slug}.md',
						kind: 'junction-note',
					},
				],
			},
		};

		const address = render(recipe, {
			curie: 'cwk:jn-test',
			scope: baseScope,
		});

		expect(address.frontmatter.kind).toBe('junction-note');
	});

	test('kind: "crosswalk-edge" — emits kind discriminator + managed fields', () => {
		const recipe: Recipe = {
			recipe: 'test-crosswalk',
			source: { ontology: 'nist-olir', levels: ['mapping'] },
			target: {
				layout: [
					{
						level: 'mapping',
						mechanism: 'file',
						template: 'cw-{subject_id|slug}-{object_id|slug}.md',
						kind: 'crosswalk-edge',
					},
				],
				also_emit: {
					frontmatter: {
						managed: {
							subject_id: '{subject_id}',
							predicate_id: '{predicate_id}',
							object_id: '{object_id}',
						},
					},
				},
			},
		};

		const address = render(recipe, {
			curie: 'cwk:cw-test',
			scope: baseScope,
		});

		expect(address.frontmatter.kind).toBe('crosswalk-edge');
		expect(address.frontmatter.subject_id).toBe('nist-csf:PR.AC-01');
		expect(address.frontmatter.predicate_id).toBe('is_equivalent_to');
		expect(address.frontmatter.object_id).toBe('nist:AC-2');
	});

	test('kind on intermediate folder entry — last non-default wins', () => {
		const recipe: Recipe = {
			recipe: 'test-multi',
			source: { ontology: 'test', levels: ['outer', 'inner'] },
			target: {
				layout: [
					{
						level: 'outer',
						mechanism: 'folder',
						template: 'Frameworks',
					},
					{
						level: 'inner',
						mechanism: 'file',
						template: '{subject_id|slug}.md',
						kind: 'junction-note',
					},
				],
			},
		};

		const address = render(recipe, {
			curie: 'cwk:test',
			scope: baseScope,
		});

		expect(address.frontmatter.kind).toBe('junction-note');
	});

	test('explicit kind: "concept" — still no discriminator (default value)', () => {
		const recipe: Recipe = {
			recipe: 'test-explicit-concept',
			source: { ontology: 'nist', levels: ['control'] },
			target: {
				layout: [
					{
						level: 'control',
						mechanism: 'file',
						template: '{subject_id|slug}.md',
						kind: 'concept',
					},
				],
			},
		};

		const address = render(recipe, {
			curie: 'nist:test',
			scope: baseScope,
		});

		expect(address.frontmatter.kind).toBeUndefined();
	});
});


describe('evidence junction starter identity companions', () => {
	const base = {
		subject: 'Frameworks/NIST/AC-2',
		// A source column named `predicate` is still supplied, because real
		// spreadsheets have one. The recipe must IGNORE it (see below).
		predicate: 'evidences',
		object: 'Evidence/Access review',
		coverage: 'full',
		scope: 'annual',
	};

	it('keeps clickable addresses and emits supplied stable identities in direction', () => {
		const address = render(evidenceJunctionRecipe as Recipe, {
			curie: 'cwk:jn-1',
			scope: { ...base, subject_curie: 'nist:AC-2', object_curie: 'evidence:access-review' },
		});
		expect(address.frontmatter).toEqual(expect.objectContaining({
			subject: '[[Frameworks/NIST/AC-2]]',
			subject_curie: 'nist:AC-2',
			// Fixed by the recipe, NOT taken from the row's predicate column.
			// Coverage counts only `has_evidence`, so honouring a per-row value
			// would emit junctions that look right and never count toward any
			// report (2026-08-21, Challenge 45).
			predicate: 'has_evidence',
			object: '[[Evidence/Access review]]',
			object_curie: 'evidence:access-review',
		}));
	});

	it.each([{}, { subject_curie: '', object_curie: '' }])(
		'renders when optional identity columns are absent or empty',
		(identityFields) => {
			const address = render(evidenceJunctionRecipe as Recipe, {
				curie: 'cwk:jn-2',
				scope: { ...base, ...identityFields },
			});
			expect(address.frontmatter.subject_curie).toBeUndefined();
			expect(address.frontmatter.object_curie).toBeUndefined();
		},
	);
});
