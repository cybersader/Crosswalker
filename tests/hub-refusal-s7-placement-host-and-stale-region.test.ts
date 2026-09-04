/**
 * hub-refusal-s7-placement-host-and-stale-region.test.ts -- S7 ruling
 * (2026-09-04, pass 16 ruling, implemented pass 17, Task C item 6):
 * `identityOf`'s host lookup is decided by PLACEMENT (the same set the
 * refusal already uses), and a folder this run refuses leaves no stale
 * managed Contents region behind on the note that used to host it.
 *
 * THE DEFECT THIS PINS. S4 narrowed the REFUSAL's hosting exemption to
 * `hostByFolder` (placement: a note inside the folder, or beside it), but
 * left `identityOf` -- the function that actually decides a folder's WRITE
 * identity -- reading the old whole-batch, basename-keyed `byBasename`. Two
 * consequences followed, both on the write path:
 *
 *   1. A folder genuinely DESCRIBED by this run's values (so the refusal
 *      exempts it on its very first line) could still take an UNRELATED
 *      note's curie if that note happened to share the folder's last path
 *      segment anywhere else in the batch -- the folder got no hub note of
 *      its own, and its children list was written into that unrelated note's
 *      path instead.
 *   2. A folder this run REFUSES, whose basename WAS hosted by some note
 *      under the pre-S4 whole-batch rule, left that note's managed Contents
 *      region holding a list this run no longer stands behind -- stale, in
 *      the one part of a note the user is told not to hand-edit because the
 *      next run rewrites it. It no longer will.
 *
 * THE RULE. `identityOf` reads `hostByFolder` -- the exact set `refusalFor`
 * consults -- so hosting answers the same way on both paths. And
 * `staleHostedPaths` collects, for every REFUSED folder, the note the OLD
 * basename rule would have hosted it under; after the main pass, any such
 * path nothing else claimed is set to an EMPTY managed region, retracting it
 * rather than leaving it stale. Never over a real entry: a folder that
 * legitimately hosts there always wins.
 */

import { enrich, type EnrichNote } from '../src/generation/enrich';

const ONT = 'hg';
const HUB_CONFIG = { children_lists: true, facet_notes: 'none' as const, level_hubs: 'notes' as const };
const ROOT = 'Frameworks';

const hubCuriesOf = (result: ReturnType<typeof enrich>): string[] =>
	result.levelHubs.notes.map((h) => h.curie).sort();

describe('S7 (write path): identityOf hosts a folder by PLACEMENT, never by an unrelated note\'s basename', () => {
	it('a folder genuinely described by values does not adopt a far-away note\'s curie just because it shares a basename', () => {
		// "Group" is genuinely ALIGNED -- Item's own values describe it correctly
		// -- so the refusal exempts it on its first line (valuesByFolder), never
		// reaching the hosting question at all.
		const item: EnrichNote = {
			path: `${ROOT}/Group/Item.md`,
			curie: `${ONT}:item`,
			frontmatter: {},
			facets: [],
			layoutValues: [{ level: 'group', value: 'Group' }],
		};
		// An unrelated note elsewhere in the batch sharing the folder's basename --
		// neither inside Frameworks/Group nor beside it, so it hosts nothing.
		const unrelated: EnrichNote = {
			path: `${ROOT}/Somewhere/Deep/Group.md`,
			curie: `${ONT}:unrelated-group`,
			frontmatter: {},
			facets: [],
			layoutValues: [{ level: 'deep', value: 'Somewhere' }, { level: 'x', value: 'Deep' }],
		};
		const result = enrich([item, unrelated], { ontology: ONT, config: HUB_CONFIG, rootFolder: ROOT });

		expect(result.deviations).toEqual([]);
		// Written under its OWN synthesized identity -- never the unrelated
		// note's curie.
		expect(hubCuriesOf(result)).toContain(`${ONT}:hub/group`);
		expect(hubCuriesOf(result)).not.toContain(`${ONT}:unrelated-group`);
		// The unrelated note's path never received a hosted-children entry --
		// Group's own hub note carries its Contents instead.
		expect(result.levelHubs.hostedChildrenByPath.has(`${ROOT}/Somewhere/Deep/Group.md`)).toBe(false);
		expect(result.levelHubs.notes.some((h) => h.path === `${ROOT}/Group/Group.md`)).toBe(true);
	});

	it('control: a note actually PLACED at the folder (inside OR beside) still hosts it on the write path, unrelated to basename alone', () => {
		const item: EnrichNote = {
			path: `${ROOT}/Group/Item.md`,
			curie: `${ONT}:item`,
			frontmatter: {},
			facets: [],
			layoutValues: [{ level: 'group', value: 'Group' }],
		};
		const host: EnrichNote = {
			path: `${ROOT}/Group.md`, // sibling / production form
			curie: `${ONT}:group-host`,
			frontmatter: {},
			facets: [],
		};
		const result = enrich([item, host], { ontology: ONT, config: HUB_CONFIG, rootFolder: ROOT });

		expect(result.deviations).toEqual([]);
		expect(result.levelHubs.hostedChildrenByPath.get(`${ROOT}/Group.md`)).toContain('[[Item]]');
		expect(hubCuriesOf(result)).not.toContain(`${ONT}:hub/group`); // hosted, not synthesized
	});
});

describe('S7 (stale-region retraction): a refused folder\'s former (pre-S4) host has its Contents region emptied, not left stale', () => {
	it('a far-away note that would have hosted this folder under the OLD basename rule gets its managed region retracted to empty', () => {
		// "Group" genuinely disagrees (values say WRONG, the directory is Group) --
		// a real, row-caused refusal.
		const disagreeing: EnrichNote = {
			path: `${ROOT}/Group/Item.md`,
			curie: `${ONT}:item`,
			frontmatter: {},
			facets: [],
			layoutValues: [{ level: 'group', value: 'WRONG' }],
		};
		// The note the PRE-S4 whole-batch basename rule would have hosted Group
		// under -- present in the batch, sharing the basename, but placed
		// nowhere near the folder.
		const formerHostPath = `${ROOT}/Somewhere/Deep/Group.md`;
		const unrelated: EnrichNote = {
			path: formerHostPath,
			curie: `${ONT}:unrelated-group`,
			frontmatter: {},
			facets: [],
			layoutValues: [{ level: 'deep', value: 'Somewhere' }, { level: 'x', value: 'Deep' }],
		};
		const result = enrich([disagreeing, unrelated], { ontology: ONT, config: HUB_CONFIG, rootFolder: ROOT });

		// Refused, as S4 already pins.
		expect(hubCuriesOf(result)).not.toContain(`${ONT}:hub/group`);
		expect(result.deviations.find((d) => d.includes(`${ROOT}/Group`))).toBeDefined();

		// THE NEW ASSERTION S7 ADDS: the former host's managed Contents region is
		// explicitly retracted to empty -- present in the map, holding nothing --
		// rather than simply absent (which would leave whatever list a PRIOR run
		// had written there untouched on disk).
		expect(result.levelHubs.hostedChildrenByPath.has(formerHostPath)).toBe(true);
		expect(result.levelHubs.hostedChildrenByPath.get(formerHostPath)).toEqual([]);
	});

	it('never retracts over a real hosting claim: the SAME note that is Group\'s only basename match also genuinely hosts a DIFFERENT Group folder elsewhere, and its real Contents list survives', () => {
		// Two folders share the last path segment "Group" -- Cat1/Group (which
		// disagrees and is refused) and Cat2/Group (which is genuinely HOSTED by
		// a sibling note, and is the batch's ONLY note with basename "Group", so
		// it is also the former-host `byBasename` resolves for Cat1/Group's
		// retraction).
		const disagreeingGroup: EnrichNote = {
			path: `${ROOT}/Cat1/Group/Item1.md`,
			curie: `${ONT}:item1`,
			frontmatter: {},
			facets: [],
			layoutValues: [{ level: 'group', value: 'WRONG' }],
		};
		const hostedGroupLeaf: EnrichNote = {
			path: `${ROOT}/Cat2/Group/Leaf2.md`,
			curie: `${ONT}:leaf2`,
			frontmatter: {},
			facets: [],
		};
		const hostedGroupHost: EnrichNote = {
			path: `${ROOT}/Cat2/Group.md`, // sibling form -- genuinely hosts Cat2/Group
			curie: `${ONT}:group-host`,
			frontmatter: {},
			facets: [],
		};

		const result = enrich(
			[disagreeingGroup, hostedGroupLeaf, hostedGroupHost],
			{ ontology: ONT, config: HUB_CONFIG, rootFolder: ROOT },
		);

		// Cat1/Group is refused, as before.
		expect(result.deviations.find((d) => d.includes(`${ROOT}/Cat1/Group`))).toBeDefined();

		// Cat2/Group.md is the path staleHostedPaths would retract FOR Cat1/Group
		// (it is the only "Group"-basenamed note in the batch) -- but it is ALSO
		// a real, placement-based host for Cat2/Group, claimed during the main
		// pass BEFORE the retraction sweep runs. The real claim must win:
		// present, non-empty, and containing what it actually hosts.
		const hosted = result.levelHubs.hostedChildrenByPath.get(`${ROOT}/Cat2/Group.md`);
		expect(hosted).toContain('[[Leaf2]]');
		expect(hosted).not.toEqual([]);
	});
});
