/**
 * vault-reader.test.ts — v0.1.7 exporters: classification correctness.
 *
 * Two layers:
 *   1. Hand-crafted frontmatter blocks for each Tier 1 kind (concept,
 *      crosswalk-edge, junction-note, hub, facet) — pins the classifier's
 *      contract directly against spec/tier1.schema.json's shapes.
 *   2. Against the golden corpora (tests/helpers/golden-vault.ts's
 *      `buildVaultDetailed`, the L3 harness) — every note the real
 *      generation pipeline produces (concepts + facet hubs + level hubs,
 *      since the browsable-framework preset defaults both `facet_notes` and
 *      `level_hubs` to 'notes') gets classified into exactly one bucket,
 *      with zero skips and zero double-counting.
 */

import { buildVaultDetailed, corpusPath, CORPORA } from '../helpers/golden-vault';
import { buildNoteContent } from '../../src/generation/generation-engine';
import { readVaultTree, classifyFrontmatterKind, listMarkdownFilesUnder } from '../../src/export/vault-reader';
import { makeMockApp } from './helpers';

/** Build one note's content via the SAME serializer production code uses
 *  (generation-engine.ts's buildNoteContent), so these hand-crafted fixtures
 *  are byte-shape-identical to what a real import would write, and exercise
 *  the exact YAML dialect the mock's parseYaml (tests/__mocks__/obsidian.ts)
 *  is built to parse. */
function conceptNote(fm: Record<string, unknown>): string {
	return buildNoteContent(fm, '# body\n');
}

describe('vault-reader — classifyFrontmatterKind', () => {
	it('defaults to concept when kind is absent', () => {
		expect(classifyFrontmatterKind({ curie: 'nist:AC-2' })).toBe('concept');
	});
	it('recognizes crosswalk-edge, junction-note, hub, facet', () => {
		expect(classifyFrontmatterKind({ kind: 'crosswalk-edge' })).toBe('crosswalk-edge');
		expect(classifyFrontmatterKind({ kind: 'junction-note' })).toBe('junction-note');
		expect(classifyFrontmatterKind({ kind: 'hub' })).toBe('hub');
		expect(classifyFrontmatterKind({ kind: 'facet' })).toBe('facet');
	});
	it('an unrecognized kind value still falls back to concept (spec discriminator behavior)', () => {
		expect(classifyFrontmatterKind({ kind: 'something-else' })).toBe('concept');
	});
});

describe('vault-reader — readVaultTree over hand-crafted notes', () => {
	it('buckets one note of each kind correctly and reconstructs the typed fields', async () => {
		const { app, written } = makeMockApp();

		written.set(
			'Frameworks/NIST/AC-2.md',
			conceptNote({
				curie: 'nist:AC-2',
				title: 'Account Management',
				aliases: ['AC-2'],
				tags: ['framework/nist/ac-2'],
				parent: '[[Frameworks/NIST/AC]]',
				parent_curie: 'nist:AC',
				children: ['[[AC-2(1)]]'],
				control_family: 'Access Control',
			}),
		);

		written.set(
			'_crosswalker/mappings/nist-to-iso/cw-ac-2--a-9-2-1.md',
			conceptNote({
				curie: 'xwalk:ac-2--a-9-2-1',
				kind: 'crosswalk-edge',
				subject_id: 'nist:AC-2',
				predicate_id: 'is_equivalent_to',
				object_id: 'iso27001:A.9.2.1',
				mapping_set_id: '  Set-A  ',
				predicate_modifier: 'NOT',
				match_type: 'close',
				match_confidence: 0.9,
				mapping_justification: 'semapv:ManualMappingCuration',
				mapping_provider: 'NIST OLIR',
			}),
		);

		written.set(
			'Evidence/jn-1.md',
			conceptNote({
				curie: 'cwk:jn-1',
				kind: 'junction-note',
				subject: '[[Frameworks/NIST/AC-2]]',
				subject_curie: 'nist:AC-2',
				predicate: 'covers',
				object: '[[Evidence/MFA-Policy]]',
				object_curie: 'org:mfa-policy',
				coverage: 'partial',
				status: 'approved',
				confidence: 0.85,
			}),
		);

		written.set(
			'Frameworks/NIST/AC.md',
			conceptNote({ curie: 'nist:hub/ac', kind: 'hub', children: ['[[AC-2]]', '[[AC-3]]'] }),
		);

		written.set(
			'_crosswalker/facets/access-control.md',
			conceptNote({ curie: 'nist:facet/family/access-control', kind: 'facet', members: ['[[AC-2]]', '[[AC-3]]'] }),
		);

		const tree = await readVaultTree(app, '');

		expect(tree.skipped).toEqual([]);
		expect(tree.concepts).toHaveLength(1);
		expect(tree.crosswalkEdges).toHaveLength(1);
		expect(tree.junctionNotes).toHaveLength(1);
		expect(tree.hubs).toHaveLength(2);

		const concept = tree.concepts[0];
		expect(concept.curie).toBe('nist:AC-2');
		expect(concept.title).toBe('Account Management');
		expect(concept.aliases).toEqual(['AC-2']);
		expect(concept.tags).toEqual(['framework/nist/ac-2']);
		expect(concept.parent).toBe('[[Frameworks/NIST/AC]]');
		expect(concept.parent_curie).toBe('nist:AC');
		expect(concept.children).toEqual(['[[AC-2(1)]]']);
		expect(concept.frontmatter.control_family).toBe('Access Control');

		const edge = tree.crosswalkEdges[0];
		expect(edge.subject_id).toBe('nist:AC-2');
		expect(edge.predicate_id).toBe('is_equivalent_to');
		expect(edge.object_id).toBe('iso27001:A.9.2.1');
		expect(edge.match_type).toBe('close');
		expect(edge.match_confidence).toBe(0.9);
		expect(edge.mapping_provider).toBe('NIST OLIR');
		expect(edge.mapping_set_id).toBe('Set-A');
		expect(edge.predicate_modifier).toBe('NOT');

		const jn = tree.junctionNotes[0];
		expect(jn.subject).toBe('[[Frameworks/NIST/AC-2]]');
		expect(jn.subject_curie).toBe('nist:AC-2');
		expect(jn.predicate).toBe('covers');
		expect(jn.object).toBe('[[Evidence/MFA-Policy]]');
		expect(jn.object_curie).toBe('org:mfa-policy');
		expect(jn.coverage).toBe('partial');
		expect(jn.confidence).toBe(0.85);

		const hub = tree.hubs.find((h) => h.kind === 'hub')!;
		expect(hub.children).toEqual(['[[AC-2]]', '[[AC-3]]']);
		const facet = tree.hubs.find((h) => h.kind === 'facet')!;
		expect(facet.children).toEqual(['[[AC-2]]', '[[AC-3]]']); // normalized from `members`
	});

	it('skips notes with no frontmatter block and notes missing curie, without throwing', async () => {
		const { app, written } = makeMockApp();
		written.set('Notes/no-frontmatter.md', '# Just a heading\n\nSome text.\n');
		written.set('Notes/no-curie.md', '---\ntitle: "Untitled thing"\n---\n\nbody\n');

		const tree = await readVaultTree(app, '');
		expect(tree.concepts).toEqual([]);
		expect(tree.skipped).toHaveLength(2);
		expect(tree.skipped.map((s) => s.path).sort()).toEqual(['Notes/no-curie.md', 'Notes/no-frontmatter.md']);
	});

	it('skips a crosswalk note with malformed explicit negation instead of exposing it as positive', async () => {
		const { app, written } = makeMockApp();
		written.set('Mappings/bad.md', conceptNote({
			curie: 'xwalk:bad', kind: 'crosswalk-edge', subject_id: 'x:A',
			predicate_id: 'is_equivalent_to', predicate_modifier: '', object_id: 'x:B',
		}));
		const tree = await readVaultTree(app, 'Mappings');
		expect(tree.crosswalkEdges).toEqual([]);
		expect(tree.skipped).toEqual([{ path: 'Mappings/bad.md', reason: 'stored predicate_modifier must be absent or exact uppercase NOT' }]);
	});

	it('scopes to the given root folder only', async () => {
		const { app, written } = makeMockApp();
		written.set('A/one.md', conceptNote({ curie: 'x:one' }));
		written.set('B/two.md', conceptNote({ curie: 'x:two' }));

		const scoped = await readVaultTree(app, 'A');
		expect(scoped.concepts.map((c) => c.curie)).toEqual(['x:one']);

		const files = listMarkdownFilesUnder(app, 'B');
		expect(files.map((f) => f.path)).toEqual(['B/two.md']);
	});
});

describe('vault-reader — golden corpora classification', () => {
	it.each(CORPORA)('classifies every note in %s with zero skips and no double-counting', async (corpus) => {
		const { vault, enrichment } = await buildVaultDetailed(corpusPath(corpus));
		const { app, written } = makeMockApp();
		for (const [path, content] of vault) written.set(path, content);

		const tree = await readVaultTree(app, '');

		expect(tree.skipped).toEqual([]);
		const total = tree.concepts.length + tree.hubs.length + tree.crosswalkEdges.length + tree.junctionNotes.length;
		expect(total).toBe(vault.size);

		// This corpus family (concept-only imports) never produces crosswalk-edge
		// or junction-note kinds.
		expect(tree.crosswalkEdges).toEqual([]);
		expect(tree.junctionNotes).toEqual([]);

		// The browsable-framework preset (tests/helpers/golden-vault.ts's default)
		// sets facet_notes: 'notes' and level_hubs: 'notes' — every synthetic hub
		// the enrichment pass produced should land in tree.hubs, nothing more,
		// nothing less.
		const expectedHubCount = enrichment.hubs.length + enrichment.levelHubs.notes.length;
		expect(tree.hubs.length).toBe(expectedHubCount);

		for (const concept of tree.concepts) {
			expect(vault.has(concept.path)).toBe(true);
			expect(concept.curie.length).toBeGreaterThan(0);
		}
	});
});
