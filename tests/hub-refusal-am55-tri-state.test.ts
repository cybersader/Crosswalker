/**
 * hub-refusal-am55-tri-state.test.ts -- AM-55 (2026-09-04, pass 18, Task C item
 * 2): a kept folder's hub is a FACT READ FROM THE VAULT, tri-state, and the
 * `enrich()`-level half of it -- text AND accounting together, one test per row
 * of the amendment's table, so a consequence clause can never drift from the
 * run again.
 *
 * THE DEFECT THIS PINS (pass-17 CONFIRMED 3 / Ground 3). The old kept-cause
 * refusal said the index note "stays as it was" for EVERY kept folder with no
 * usable recorded chain, including the ordinary case where the note is sitting
 * right there in the vault -- and the SAME run's orphan pass then reported that
 * same note as vanished, because nothing marked its curie produced. The cause
 * (Skip existing kept the rows) was true; the consequence clause (the note
 * "stays as it was", i.e. is accounted for) was false, and it is the half a
 * user acts on.
 *
 * THE RULE. `OwnedHubAtFolder` is `{ state: 'one', ...}` (with or without a
 * usable `values` chain) or `{ state: 'many', paths }`. Each observed shape has
 * its own row in the amendment's table, and each row's TEXT and ACCOUNTING are
 * asserted TOGETHER here so the two cannot silently disagree again:
 *
 *   Row 1 -- usable chain          -> exempt, rewritten, no deviation.
 *   Row 2 -- present, no usable chain -> refused (kept cause), its curie still
 *                                        added to `levelHubs.keptExistingCuries`.
 *   Row 3 -- no hub in the folder  -> refused (kept cause), nothing to account.
 *   many  -- two hubs in one folder -> refused by NAME, neither curie accounted.
 */

import { enrich, type EnrichNote, type OwnedHubsByFolder } from '../src/generation/enrich';

const ONT = 'hg';
const HUB_CONFIG = { children_lists: true, facet_notes: 'none' as const, level_hubs: 'notes' as const };
const ROOT = 'Frameworks';
const FOLDER = `${ROOT}/Persistence`;

/** A single kept row holding FOLDER, recategorised to a different folder this run. */
function keptNote(): EnrichNote {
	return {
		path: `${FOLDER}/T1.md`,
		renderedPath: `${ROOT}/IA/T1.md`,
		curie: `${ONT}:t1`,
		frontmatter: {},
		facets: [],
		layoutValues: [{ level: 'tactic', value: 'IA' }],
	};
}

const hubByPath = (result: ReturnType<typeof enrich>, path: string) =>
	result.levelHubs.notes.find((h) => h.path === path);
const deviationFor = (result: ReturnType<typeof enrich>, folder: string) =>
	result.deviations.find((d) => d.includes(`"${folder}"`));

describe('AM-55 row 1: a usable recorded chain exempts the folder -- rewritten, no deviation, nothing to account separately', () => {
	it('the hub is written from the recorded chain and no curie is added to keptExistingCuries (it is written, not merely accounted for)', () => {
		const ownedHubsByFolder: OwnedHubsByFolder = new Map([
			[FOLDER, { state: 'one', path: `${FOLDER}/Persistence.md`, curie: `${ONT}:hub/persistence`, values: [{ level: 'tactic', value: 'Persistence' }] }],
		]);
		const result = enrich([keptNote()], { ontology: ONT, config: HUB_CONFIG, rootFolder: ROOT, ownedHubsByFolder });

		expect(deviationFor(result, FOLDER)).toBeUndefined();
		const hub = hubByPath(result, `${FOLDER}/Persistence.md`);
		expect(hub).toBeDefined();
		expect(hub!.curie).toBe(`${ONT}:hub/persistence`);
		// Written as a real hub note, so accounting for it a SECOND time via
		// keptExistingCuries would be a duplicate claim.
		expect(result.levelHubs.keptExistingCuries).not.toContain(`${ONT}:hub/persistence`);
	});
});

describe('AM-55 row 2: present, no usable chain -- refused with the row-2 text AND the curie is marked produced via keptExistingCuries', () => {
	it('a pre-AM-38 hub (values present, no usable chain to derive from) is refused, never written, and its OWN curie is accounted for', () => {
		const ownedHubsByFolder: OwnedHubsByFolder = new Map([
			[FOLDER, { state: 'one', path: `${FOLDER}/Persistence.md`, curie: `${ONT}:hub/persistence` }],
		]);
		const result = enrich([keptNote()], { ontology: ONT, config: HUB_CONFIG, rootFolder: ROOT, ownedHubsByFolder });

		expect(hubByPath(result, `${FOLDER}/Persistence.md`)).toBeUndefined();
		const deviation = deviationFor(result, FOLDER);
		expect(deviation).toBeDefined();
		expect(deviation).toContain('was left as it was and not updated this run');
		expect(deviation).toContain('predates recorded identity');
		expect(deviation).toContain('Re-run with Replace to re-establish it');
		// The note demonstrably exists -- its EXISTING curie (never a re-derived
		// one) is added to the accounting list the caller marks produced.
		expect(result.levelHubs.keptExistingCuries).toEqual([`${ONT}:hub/persistence`]);
	});

	it('a half-record (values array present but empty) is fail-closed to the SAME row-2 behaviour, not a guess', () => {
		const ownedHubsByFolder: OwnedHubsByFolder = new Map([
			[FOLDER, { state: 'one', path: `${FOLDER}/Persistence.md`, curie: `${ONT}:hub/persistence`, values: [] }],
		]);
		const result = enrich([keptNote()], { ontology: ONT, config: HUB_CONFIG, rootFolder: ROOT, ownedHubsByFolder });

		expect(deviationFor(result, FOLDER)).toContain('was left as it was and not updated this run');
		expect(result.levelHubs.keptExistingCuries).toEqual([`${ONT}:hub/persistence`]);
	});
});

describe('AM-55 row 3: no hub in the folder at all -- refused with the row-3 text, and nothing to account for', () => {
	it('an empty ownedHubsByFolder map (nothing recorded, nothing on disk) refuses with the row-3 text and marks no curie produced', () => {
		const ownedHubsByFolder: OwnedHubsByFolder = new Map();
		const result = enrich([keptNote()], { ontology: ONT, config: HUB_CONFIG, rootFolder: ROOT, ownedHubsByFolder });

		expect(hubByPath(result, `${FOLDER}/Persistence.md`)).toBeUndefined();
		const deviation = deviationFor(result, FOLDER);
		expect(deviation).toBeDefined();
		expect(deviation).toContain('No index note exists for the folder');
		expect(deviation).toContain('none was created');
		expect(deviation).toContain('Re-run with Replace to create it');
		expect(result.levelHubs.keptExistingCuries).toEqual([]);
	});

	it('no ownedHubsByFolder option supplied at all behaves identically to an empty map (the caller-optional contract)', () => {
		const result = enrich([keptNote()], { ontology: ONT, config: HUB_CONFIG, rootFolder: ROOT });
		expect(deviationFor(result, FOLDER)).toContain('No index note exists for the folder');
		expect(result.levelHubs.keptExistingCuries).toEqual([]);
	});
});

describe('AM-55 "many": two index notes in one folder is a refusal by NAME, never a pick, and neither curie is accounted for', () => {
	it('names both paths in the refusal and marks nothing produced', () => {
		const ownedHubsByFolder: OwnedHubsByFolder = new Map([
			[FOLDER, { state: 'many', paths: [`${FOLDER}/Persistence.md`, `${FOLDER}/Persistence-copy.md`] }],
		]);
		const result = enrich([keptNote()], { ontology: ONT, config: HUB_CONFIG, rootFolder: ROOT, ownedHubsByFolder });

		expect(hubByPath(result, `${FOLDER}/Persistence.md`)).toBeUndefined();
		const deviation = deviationFor(result, FOLDER);
		expect(deviation).toBeDefined();
		expect(deviation).toContain('more than one index note');
		expect(deviation).toContain(`${FOLDER}/Persistence.md`);
		expect(deviation).toContain(`${FOLDER}/Persistence-copy.md`);
		expect(deviation).toContain('cannot say which one');
		// Neither of the two competing notes' curies is claimed as produced --
		// picking one to mark would be exactly the "pick" the ruling forbids.
		expect(result.levelHubs.keptExistingCuries).toEqual([]);
	});
});

describe('AM-56 disclosure: every AM-55 refusal text carries the trailing stale-list sentence', () => {
	it('row 2, row 3, and "many" all end with the disclosure that a stale host list is left as it was, not un-written', () => {
		const disclosure = "Any list that still names this folder's index note is left as it was.";
		const many = enrich([keptNote()], {
			ontology: ONT, config: HUB_CONFIG, rootFolder: ROOT,
			ownedHubsByFolder: new Map([[FOLDER, { state: 'many', paths: [`${FOLDER}/A.md`, `${FOLDER}/B.md`] }]]),
		});
		expect(deviationFor(many, FOLDER)).toContain(disclosure);

		const row2 = enrich([keptNote()], {
			ontology: ONT, config: HUB_CONFIG, rootFolder: ROOT,
			ownedHubsByFolder: new Map([[FOLDER, { state: 'one', path: `${FOLDER}/Persistence.md`, curie: `${ONT}:hub/persistence` }]]),
		});
		expect(deviationFor(row2, FOLDER)).toContain(disclosure);

		const row3 = enrich([keptNote()], { ontology: ONT, config: HUB_CONFIG, rootFolder: ROOT, ownedHubsByFolder: new Map() });
		expect(deviationFor(row3, FOLDER)).toContain(disclosure);
	});
});
