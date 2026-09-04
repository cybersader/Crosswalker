/**
 * hub-refusal-am52-kept-not-moved.test.ts -- AM-52 (2026-09-04, pass 17, Task C
 * item 2): a kept note is not a moved note.
 *
 * THE DEFECT THIS PINS (pass-16 Ground 2 / CONFIRMED 2). A source release that
 * recategorises a row (a control moves from one section to another) imported
 * with Skip existing leaves the note exactly where it is and renders it
 * somewhere else -- the ONE shape `enrich()` sees that also matches the
 * relocated-note shape AM-50 refuses. Before AM-52, that folder was refused
 * with the MOVED cause ("the note may have been moved... move it back"), its
 * hub stopped being written, dropped out of the parent's Contents, and the
 * orphan pass reported the still-occupied folder's index note as vanished --
 * A-8's "zero new orphans, skip included" clause failing on an ORDINARY
 * refresh, over a cause the user did not create and cannot act on.
 *
 * THE RULE. `enrich()` receives, per record, both the FINAL path and the
 * RENDERED path (it already does). A folder holding one of THIS RUN'S OWN kept
 * records (`dirOf(path) !== dirOf(renderedPath)`, positive evidence only) is a
 * fourth state: its hub keeps the RECORDED identity the caller reads off the
 * existing hub note's own `hub_values` -- never re-derived from the path -- and
 * is written and listed in Contents exactly as before. With no recorded
 * identity (a hub that never existed, or a half-record), the folder is refused
 * with the KEPT cause instead, naming what was actually observed ("this folder
 * holds notes the refresh kept in place because Skip existing was chosen") --
 * never the MOVED cause, which nobody's actions produced.
 *
 * `dirOf(path) !== dirOf(renderedPath)` has exactly one real producer
 * (generation-engine.ts's `keptRecords.push`, both call sites): a skip-mode
 * kept row. A replace-mode move renames FIRST, so `path` and `renderedPath`
 * agree by the time a record reaches `enrich()` -- see the updated comment on
 * hub-refusal-am50-and-s4.test.ts's "a note relocated away..." case, which now
 * demonstrates AM-52's no-recorded-identity branch rather than AM-50's.
 */

import { enrich, type EnrichNote } from '../src/generation/enrich';
import type { LayoutValue } from '../src/render';

const ONT = 'hg';
const HUB_CONFIG = { children_lists: true, facet_notes: 'none' as const, level_hubs: 'notes' as const };
const ROOT = 'Frameworks';

const hubByPath = (result: ReturnType<typeof enrich>, path: string) =>
	result.levelHubs.notes.find((h) => h.path === path);

describe('AM-52: a folder holding a row this run KEPT, with a RECORDED identity, is exempt and written as before', () => {
	it('exempt from refusal, keeps its recorded curie, carries hub_levels/hub_values forward, and is still listed in the parent Contents', () => {
		// T1 stays at Frameworks/Persistence/T1.md (skip mode never moves it) but
		// this source release recategorises it to IA.
		const notes: EnrichNote[] = [{
			path: `${ROOT}/Persistence/T1.md`,
			renderedPath: `${ROOT}/IA/T1.md`,
			curie: `${ONT}:t1`,
			frontmatter: {},
			facets: [],
			layoutValues: [{ level: 'tactic', value: 'IA' }],
		}];
		const recordedHubValues = new Map<string, LayoutValue[]>([
			[`${ROOT}/Persistence`, [{ level: 'tactic', value: 'Persistence' }]],
		]);
		const result = enrich(notes, { ontology: ONT, config: HUB_CONFIG, rootFolder: ROOT, recordedHubValues });

		// No refusal at all for Persistence -- the recorded identity answers it.
		expect(result.deviations).toEqual([]);

		const persistence = hubByPath(result, `${ROOT}/Persistence/Persistence.md`);
		expect(persistence).toBeDefined();
		// The SAME curie the existing hub note already carries -- found, not
		// re-minted, and never derived from the current folder chain (which would
		// have been `hub/ia` or nothing at all).
		expect(persistence!.curie).toBe(`${ONT}:hub/persistence`);
		// hub_levels/hub_values round-trip: dropping them would erase the one
		// record of what the folder is about (both are always-managed keys).
		expect(persistence!.frontmatter.hub_levels).toEqual(['tactic']);
		expect(persistence!.frontmatter.hub_values).toEqual(['Persistence']);

		// Still linked from the root's Contents, exactly as before.
		const root = hubByPath(result, `${ROOT}/${ROOT}.md`);
		expect(root!.childrenLinks).toContain('[[Persistence]]');
		expect(root!.body).toContain('[[Persistence]]');
	});
});

describe('AM-52: a folder holding a kept row with NO recorded identity is refused with the KEPT cause, never the MOVED cause', () => {
	it('no recordedHubValues supplied at all: the deviation names Skip existing, not a moved note', () => {
		const notes: EnrichNote[] = [{
			path: `${ROOT}/Persistence/T1.md`,
			renderedPath: `${ROOT}/IA/T1.md`,
			curie: `${ONT}:t1`,
			frontmatter: {},
			facets: [],
			layoutValues: [{ level: 'tactic', value: 'IA' }],
		}];
		const result = enrich(notes, { ontology: ONT, config: HUB_CONFIG, rootFolder: ROOT }); // no recordedHubValues at all

		expect(hubByPath(result, `${ROOT}/Persistence/Persistence.md`)).toBeUndefined();
		const deviation = result.deviations.find((d) => d.includes(`${ROOT}/Persistence`));
		expect(deviation).toBeDefined();
		expect(deviation).toContain('This folder holds notes the refresh kept in place');
		expect(deviation).toContain('Skip existing was chosen');
		expect(deviation).toContain('re-run with Replace');
		// Never the address-derived cause this state used to fall through to.
		expect(deviation).not.toContain('the note may');
		expect(deviation).not.toContain('have been moved');

		// Absent from the parent's Contents -- no dangling link to a hub that was
		// never written.
		const root = hubByPath(result, `${ROOT}/${ROOT}.md`);
		expect(root!.childrenLinks ?? []).not.toContain('[[Persistence]]');
	});

	it('a half-record (hub_values with no matching hub_levels) is fail-closed to the SAME kept cause, not a guess', () => {
		const notes: EnrichNote[] = [{
			path: `${ROOT}/Persistence/T1.md`,
			renderedPath: `${ROOT}/IA/T1.md`,
			curie: `${ONT}:t1`,
			frontmatter: {},
			facets: [],
			layoutValues: [{ level: 'tactic', value: 'IA' }],
		}];
		// The caller (buildRecordedHubValues) never hands over a half-record in
		// practice -- it reads hub_levels and hub_values TOGETHER or not at all --
		// but `enrich()` itself must not assume a well-formed map either. Passing
		// an empty array is the shape "found nothing to record" collapses to.
		const recordedHubValues = new Map<string, LayoutValue[]>([
			[`${ROOT}/Persistence`, []],
		]);
		const result = enrich(notes, { ontology: ONT, config: HUB_CONFIG, rootFolder: ROOT, recordedHubValues });

		const deviation = result.deviations.find((d) => d.includes(`${ROOT}/Persistence`));
		expect(deviation).toBeDefined();
		expect(deviation).toContain('Skip existing was chosen');
	});
});

describe('AM-52 does not widen the address route: an ancestor no row of this run holds a kept record in still gets the MOVED cause', () => {
	it('an ancestor TWO levels above a kept folder, described by no chain and holding no kept record itself, is still refused as undescribed', () => {
		// A three-level layout: Root/Category/Section/Item.md. This run's one row
		// is kept in place at Root/Cat/Sub/Item.md but renders to
		// Root/OtherCat/Sub/Item.md -- a top-level recategorisation. Root/Cat/Sub
		// (the DIRECT holder) is a kept folder and is exempt below via a recorded
		// identity; Root/Cat (its ANCESTOR) holds no note of this run's batch at
		// all and no chain describes it either -- AM-52's positive-evidence rule
		// (`dirOf(path) !== dirOf(renderedPath)`) is about the note's OWN
		// directory, not its ancestors, so this stays AM-50's undescribed state.
		const notes: EnrichNote[] = [{
			path: `${ROOT}/Cat/Sub/Item.md`,
			renderedPath: `${ROOT}/OtherCat/Sub/Item.md`,
			curie: `${ONT}:item`,
			frontmatter: {},
			facets: [],
			layoutValues: [{ level: 'cat', value: 'OtherCat' }, { level: 'sub', value: 'Sub' }],
		}];
		const recordedHubValues = new Map<string, LayoutValue[]>([
			[`${ROOT}/Cat/Sub`, [{ level: 'cat', value: 'Cat' }, { level: 'sub', value: 'Sub' }]],
			// Deliberately no entry for Root/Cat -- nothing recorded it either.
		]);
		const result = enrich(notes, { ontology: ONT, config: HUB_CONFIG, rootFolder: ROOT, recordedHubValues });

		// The DIRECT holder: exempt, via its recorded identity.
		expect(hubByPath(result, `${ROOT}/Cat/Sub/Sub.md`)).toBeDefined();
		expect(result.deviations.find((d) => d.includes(`${ROOT}/Cat/Sub"`))).toBeUndefined();

		// The ANCESTOR: still refused, and still with the MOVED cause -- AM-52
		// only ever exempts the folder a kept record directly sits in.
		expect(hubByPath(result, `${ROOT}/Cat/Cat.md`)).toBeUndefined();
		const ancestorDeviation = result.deviations.find((d) => d.includes(`${ROOT}/Cat"`));
		expect(ancestorDeviation).toBeDefined();
		expect(ancestorDeviation).toContain('the note may');
		expect(ancestorDeviation).toContain('have been moved');
		expect(ancestorDeviation).not.toContain('Skip existing');
	});
});
