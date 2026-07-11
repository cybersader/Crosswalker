/**
 * enrich.test.ts — Pass 1.5 batch enrichment (pure logic).
 *
 * Covers the 2026-07-10 batch-enrichment design §5 acceptance cases 1, 2, 4:
 *   1. T1078 gains a sorted `children` list.
 *   2. A facet hub note (Persistence) materializes with kind:facet + members + H1.
 *   4. Deterministic (same notes → deep-equal result); user prose survives a
 *      re-import while `members` regenerates.
 * Plus: children/parent derivation, edge count, multi-value link split (render),
 * folder-note fallback deviation, and hub min-members.
 */

import { render, splitLinkValues, type Recipe } from '../src/render';
import { enrich, mergeHubBody, extractWikilinkTargets, HUB_MIN_MEMBERS, type EnrichNote } from '../src/generation/enrich';
import { mergeFrontmatter, computeManagedKeys } from '../src/generation/frontmatter-merge';

// ---------------------------------------------------------------------------
// Fixture — an ATT&CK-persistence-shaped batch (with a `tactic` facet so the
// hub path is exercised; the committed subset's tactic is single-valued, so this
// synthetic fixture is where the multi-member hub case lives).
// ---------------------------------------------------------------------------

function note(path: string, id: string, parent: string, tactic: string): EnrichNote {
	return {
		path,
		curie: `attack:${id}`,
		frontmatter: { parent: `[[${parent}]]`, curie: `attack:${id}` },
		facets: [{ namespace: 'tactic', value: tactic }],
	};
}

function attackBatch(): EnrichNote[] {
	return [
		note('T1078.md', 'T1078', '', 'Persistence'),
		note('T1078/T1078.001.md', 'T1078.001', 'T1078', 'Persistence'),
		note('T1078/T1078.002.md', 'T1078.002', 'T1078', 'Persistence'),
		note('T1078/T1078.003.md', 'T1078.003', 'T1078', 'Persistence'),
		note('T1078/T1078.004.md', 'T1078.004', 'T1078', 'Persistence'),
	];
}

const CONFIG = { children_lists: true, facet_notes: 'notes' as const, parent_note: 'sibling' as const };

// ===========================================================================
// Acceptance case 1 — children lists
// ===========================================================================

describe('enrich — children lists (design §5 case 1)', () => {
	it('T1078 gains a sorted children list of its four sub-techniques', () => {
		const result = enrich(attackBatch(), { ontology: 'attack', config: CONFIG });
		expect(result.childrenByPath.get('T1078.md')).toEqual([
			'[[T1078.001]]',
			'[[T1078.002]]',
			'[[T1078.003]]',
			'[[T1078.004]]',
		]);
	});

	it('children are sorted by curie regardless of input order', () => {
		const shuffled = [
			attackBatch()[3],
			attackBatch()[0],
			attackBatch()[4],
			attackBatch()[1],
			attackBatch()[2],
		];
		const result = enrich(shuffled, { ontology: 'attack', config: CONFIG });
		expect(result.childrenByPath.get('T1078.md')).toEqual([
			'[[T1078.001]]',
			'[[T1078.002]]',
			'[[T1078.003]]',
			'[[T1078.004]]',
		]);
	});

	it('a note with no children gets no children patch', () => {
		const result = enrich(attackBatch(), { ontology: 'attack', config: CONFIG });
		expect(result.childrenByPath.has('T1078/T1078.001.md')).toBe(false);
	});

	it('children_lists off → no children patches (but parent links still counted)', () => {
		const result = enrich(attackBatch(), {
			ontology: 'attack',
			config: { children_lists: false, facet_notes: 'none' },
		});
		expect(result.childrenByPath.size).toBe(0);
		expect(result.edgeCount).toBe(4); // 4 resolvable parent links
	});
});

// ===========================================================================
// Acceptance case 2 — facet hub note
// ===========================================================================

describe('enrich — facet hub notes (design §5 case 2)', () => {
	it('Persistence.md exists with kind:facet, sorted members, facet tag, H1 body', () => {
		const result = enrich(attackBatch(), { ontology: 'attack', config: CONFIG });
		expect(result.hubs).toHaveLength(1);
		const hub = result.hubs[0];
		expect(hub.path).toBe('Persistence.md');
		expect(hub.curie).toBe('attack:facet/tactic/persistence');
		expect(hub.frontmatter.kind).toBe('facet');
		expect(hub.frontmatter.tags).toEqual(['tactic/persistence']);
		expect(hub.frontmatter.members).toEqual([
			'[[T1078]]',
			'[[T1078.001]]',
			'[[T1078.002]]',
			'[[T1078.003]]',
			'[[T1078.004]]',
		]);
		expect(hub.body).toBe('# Persistence\n');
	});

	it('materializes one hub per facet value (multi-tactic → multiple hubs, sorted by path)', () => {
		const batch = [
			note('T1078.md', 'T1078', '', 'Persistence'),
			note('T1078/T1078.001.md', 'T1078.001', 'T1078', 'Persistence'),
			{ ...note('T1548.md', 'T1548', '', 'Privilege Escalation'), facets: [{ namespace: 'tactic', value: 'Privilege Escalation' }] },
			{ ...note('T1548/T1548.001.md', 'T1548.001', 'T1548', 'Privilege Escalation'), facets: [{ namespace: 'tactic', value: 'Privilege Escalation' }] },
		];
		const result = enrich(batch, { ontology: 'attack', config: CONFIG });
		// Filenames preserve spaces (mirrors the fs-safe filter); curie value-slug
		// lowercases + hyphenates.
		expect(result.hubs.map((h) => h.path)).toEqual(['Persistence.md', 'Privilege Escalation.md']);
		expect(result.hubs[1].curie).toBe('attack:facet/tactic/privilege-escalation');
	});

	it('facet_notes tags-only → no hub notes', () => {
		const result = enrich(attackBatch(), {
			ontology: 'attack',
			config: { children_lists: true, facet_notes: 'tags-only' },
		});
		expect(result.hubs).toEqual([]);
	});

	it('hubs with fewer than HUB_MIN_MEMBERS members are not materialized', () => {
		const batch = [
			{ ...note('A.md', 'A', '', 'Solo'), facets: [{ namespace: 'tactic', value: 'Solo' }] },
			{ ...note('B.md', 'B', '', 'Pair'), facets: [{ namespace: 'tactic', value: 'Pair' }] },
			{ ...note('C.md', 'C', '', 'Pair'), facets: [{ namespace: 'tactic', value: 'Pair' }] },
		];
		const result = enrich(batch, { ontology: 'attack', config: CONFIG });
		expect(HUB_MIN_MEMBERS).toBe(2);
		expect(result.hubs.map((h) => h.path)).toEqual(['Pair.md']); // Solo (1 member) skipped
	});

	it('hub_note_folder places hubs under the given folder', () => {
		const result = enrich(attackBatch(), {
			ontology: 'attack',
			config: { ...CONFIG, hub_note_folder: 'Facets' },
		});
		expect(result.hubs[0].path).toBe('Facets/Persistence.md');
	});
});

// ===========================================================================
// Edge count (design §3.5)
// ===========================================================================

describe('enrich — edge count', () => {
	it('edgeCount = parent links + children entries + member entries', () => {
		const result = enrich(attackBatch(), { ontology: 'attack', config: CONFIG });
		// 4 parent links + 4 children entries + 5 hub members = 13.
		expect(result.edgeCount).toBe(13);
	});
});

// ===========================================================================
// Acceptance case 4 — determinism + re-import safety
// ===========================================================================

describe('enrich — determinism (design §5 case 4)', () => {
	it('two runs over the same batch produce deep-equal results', () => {
		const a = enrich(attackBatch(), { ontology: 'attack', config: CONFIG });
		const b = enrich(attackBatch(), { ontology: 'attack', config: CONFIG });
		expect(serialize(a)).toEqual(serialize(b));
	});

	it('input order does not change the hubs or edge count', () => {
		const forward = enrich(attackBatch(), { ontology: 'attack', config: CONFIG });
		const reversed = enrich([...attackBatch()].reverse(), { ontology: 'attack', config: CONFIG });
		expect(serialize(forward)).toEqual(serialize(reversed));
	});
});

describe('mergeHubBody — user prose survives re-import while members regenerate', () => {
	it('preserves user prose below the managed H1', () => {
		const existing = '# Persistence\n\nMy notes about this tactic.\n\n- a bullet\n';
		const fresh = '# Persistence\n';
		expect(mergeHubBody(existing, fresh)).toBe('# Persistence\n\nMy notes about this tactic.\n\n- a bullet\n');
	});

	it('regenerates the H1 (e.g. a renamed value) but keeps the prose', () => {
		const existing = '# Old Name\n\nUser prose.\n';
		const fresh = '# Persistence\n';
		expect(mergeHubBody(existing, fresh)).toBe('# Persistence\n\nUser prose.\n');
	});

	it('is idempotent (merging a fresh-only body twice is stable)', () => {
		const fresh = '# Persistence\n';
		const once = mergeHubBody(fresh, fresh);
		expect(mergeHubBody(once, fresh)).toBe(once);
	});

	it('members regenerate via the managed-key merge while user keys survive', () => {
		// Simulate a re-import: existing hub has user-added `reviewer`; fresh has new members.
		const existing = { curie: 'attack:facet/tactic/persistence', kind: 'facet', members: ['[[T1078]]'], reviewer: 'me' };
		const fresh = {
			curie: 'attack:facet/tactic/persistence',
			kind: 'facet',
			members: ['[[T1078]]', '[[T1098]]'],
		};
		const merged = mergeFrontmatter(existing, fresh, computeManagedKeys(fresh));
		expect(merged.members).toEqual(['[[T1078]]', '[[T1098]]']); // regenerated wholesale
		expect(merged.reviewer).toBe('me'); // user key preserved
	});
});

// ===========================================================================
// Multi-value link split (render managed_links)
// ===========================================================================

describe('render — managed_links multi-value split', () => {
	const recipe: Recipe = {
		recipe: 'nist',
		source: { ontology: 'nist' },
		target: {
			layout: [{ level: 'leaf', mechanism: 'file', template: '{Control ID}.md' }],
			also_emit: { frontmatter: { managed_links: { related: { template: '{Related Controls}' } } } },
		},
	};

	it('splits a comma-separated cell into a wikilink array', () => {
		const addr = render(recipe, { curie: 'nist:AC-2', scope: { 'Control ID': 'AC-2', 'Related Controls': 'AC-1, AC-3, PM-9' } });
		expect(addr.frontmatter.related).toEqual(['[[AC-1]]', '[[AC-3]]', '[[PM-9]]']);
	});

	it('omits the key entirely for an empty cell (no dead empty array)', () => {
		const addr = render(recipe, { curie: 'nist:AC-2', scope: { 'Control ID': 'AC-2', 'Related Controls': '' } });
		expect('related' in addr.frontmatter).toBe(false);
	});

	it('splitLinkValues splits on comma and semicolon by default, trimming', () => {
		expect(splitLinkValues('AC-1, AC-3; PM-9')).toEqual(['AC-1', 'AC-3', 'PM-9']);
		expect(splitLinkValues('  solo  ')).toEqual(['solo']);
		expect(splitLinkValues('')).toEqual([]);
	});
});

// ===========================================================================
// parent_note folder-note fallback (v0.1 sibling-only)
// ===========================================================================

describe('enrich — parent_note folder-note falls back to sibling with a deviation', () => {
	it('records a deviation and does NOT relocate parents in v0.1', () => {
		const result = enrich(attackBatch(), {
			ontology: 'attack',
			config: { ...CONFIG, parent_note: 'folder-note' },
		});
		expect(result.deviations).toHaveLength(1);
		expect(result.deviations[0]).toMatch(/folder-note is not implemented/);
		// Children still derived normally (sibling placement).
		expect(result.childrenByPath.get('T1078.md')).toHaveLength(4);
	});

	it('sibling placement records no deviation', () => {
		const result = enrich(attackBatch(), { ontology: 'attack', config: CONFIG });
		expect(result.deviations).toEqual([]);
	});
});

// ===========================================================================
// extractWikilinkTargets (empty [[]] ignored)
// ===========================================================================

describe('enrich — parent resolution ignores empty [[]]', () => {
	it('empty parent link yields no children edge', () => {
		expect(extractWikilinkTargets('[[]]')).toEqual([]);
		// Root T1078 has parent "[[]]" — it must not become its own or anyone's child.
		const result = enrich(attackBatch(), { ontology: 'attack', config: CONFIG });
		let rootChildEdges = 0;
		for (const kids of result.childrenByPath.values()) rootChildEdges += kids.length;
		expect(rootChildEdges).toBe(4); // only the 4 real sub-techniques
	});
});

// ---------------------------------------------------------------------------
// Helper — a stable serialization of an EnrichmentResult for deep-equal.
// ---------------------------------------------------------------------------

function serialize(r: ReturnType<typeof enrich>): unknown {
	return {
		children: [...r.childrenByPath.entries()].sort(),
		hubs: r.hubs,
		edgeCount: r.edgeCount,
		deviations: r.deviations,
	};
}
