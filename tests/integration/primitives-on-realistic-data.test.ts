/**
 * primitives-on-realistic-data.test.ts — Phase 6.1 integration tests.
 *
 * Loads realistic ontology/framework fixtures from tools/fixtures/realistic/
 * and runs every Layer A primitive against real-shape data. Catches the
 * class of regressions unit tests miss: wrong column name, null handling
 * on real CSV/TSV inputs, CURIE-shape assumptions, predicate handling.
 *
 * Fixtures cover NIST CSF 2.0 (Govern + Identify), NIST 800-53 (AC family),
 * ISO 27001:2022, SOC 2, CIS Controls v8, MITRE ATT&CK (Persistence) +
 * three crosswalks (CSF→800-53, ISO→SOC2 SSSOM, CSF→ATT&CK SSSOM).
 *
 * The numbers asserted are derived from running the loader once + sanity-
 * checking against the fixture files; if a fixture is edited the count
 * assertions need updating (or move to range-based assertions).
 */

import { bind, bindMany } from '../../src/views/bind-primitive';
import { setOp, union, intersection, difference } from '../../src/views/set-op-primitive';
import { diff } from '../../src/views/diff-primitive';
import { innerJoin, leftOuterJoin, antiJoin, executeJoin } from '../../src/views/join-primitives';
import {
	loadConceptFixture,
	loadCrosswalkFixture,
	REALISTIC_FIXTURES,
	type ConceptRow,
	type CrosswalkRow,
} from '../helpers/fixture-loader';

// ---------------------------------------------------------------------------
// Loader sanity — every fixture parses with the right shape
// ---------------------------------------------------------------------------

describe('fixture loader — every fixture parses without errors', () => {
	for (const [key, filename] of Object.entries(REALISTIC_FIXTURES.concepts)) {
		it(`loads concept fixture "${key}" (${filename}) and returns id+title rows`, () => {
			const rows = loadConceptFixture(filename);
			expect(rows.length).toBeGreaterThan(0);
			expect(rows[0].id).toBeTruthy();
			expect(rows[0].title).toBeTruthy();
		});
	}

	for (const [key, filename] of Object.entries(REALISTIC_FIXTURES.crosswalks)) {
		it(`loads crosswalk fixture "${key}" (${filename}) and returns SPO rows`, () => {
			const rows = loadCrosswalkFixture(filename);
			expect(rows.length).toBeGreaterThan(0);
			expect(rows[0].subject_id).toBeTruthy();
			expect(rows[0].predicate_id).toBeTruthy();
			expect(rows[0].object_id).toBeTruthy();
		});
	}
});

// ---------------------------------------------------------------------------
// Layer A primitive #1: filter (over realistic concept rows)
// ---------------------------------------------------------------------------

describe('filter — realistic concept rows', () => {
	it('filters NIST CSF concepts by function = "GOVERN"', () => {
		const csf = loadConceptFixture(REALISTIC_FIXTURES.concepts.nistCsf);
		const govern = csf.filter((r) => r.function === 'GOVERN');
		expect(govern.length).toBeGreaterThan(0);
		expect(govern.every((r) => r.function === 'GOVERN')).toBe(true);
	});

	it('filters NIST 800-53 to only top-level controls (parent empty)', () => {
		const ac = loadConceptFixture(REALISTIC_FIXTURES.concepts.nist80053);
		const topLevel = ac.filter((r) => !r.parent || r.parent === '');
		// AC family has AC-1 through AC-N top-level controls
		expect(topLevel.length).toBeGreaterThan(0);
		expect(topLevel.length).toBeLessThan(ac.length); // some are sub-controls
	});
});

// ---------------------------------------------------------------------------
// Layer A primitive #3: bind (derived columns over realistic data)
// ---------------------------------------------------------------------------

describe('bind — derived columns on realistic data', () => {
	it('derives a canonical CURIE from id + ontology prefix', () => {
		const csf = loadConceptFixture(REALISTIC_FIXTURES.concepts.nistCsf);
		const withCurie = bind(csf, 'curie', (r) => `nist-csf:${r.id}`);
		expect(withCurie[0].curie).toBe(`nist-csf:${csf[0].id}`);
		expect(withCurie.every((r) => (r.curie as string).startsWith('nist-csf:'))).toBe(true);
	});

	it('derives a normalized title-length metric (chained bindMany)', () => {
		const iso = loadConceptFixture(REALISTIC_FIXTURES.concepts.iso27001);
		const enriched = bindMany(iso, [
			['title_length', (r) => ((r.title as string) ?? '').length],
			['is_short', (r) => (r.title_length as number) < 40],
		]);
		expect(enriched[0].title_length).toBeGreaterThan(0);
		expect(typeof enriched[0].is_short).toBe('boolean');
	});

	it('binds confidence threshold over real SSSOM crosswalk rows', () => {
		const mappings = loadCrosswalkFixture(REALISTIC_FIXTURES.crosswalks.nistCsfToMitreAttack);
		const flagged = bind(mappings, 'high_confidence', (r) => (r.confidence as number) >= 0.8);
		const highCount = flagged.filter((r) => r.high_confidence === true).length;
		expect(highCount).toBeGreaterThan(0); // some real mappings are >= 0.8
		expect(highCount).toBeLessThan(mappings.length); // not all are
	});
});

// ---------------------------------------------------------------------------
// Layer A primitive #5 (was aggregate)  — count by group
// ---------------------------------------------------------------------------

describe('aggregate — group-by count over realistic data', () => {
	it('counts NIST CSF concepts by function (Govern vs Identify subsets)', () => {
		const csf = loadConceptFixture(REALISTIC_FIXTURES.concepts.nistCsf);
		const counts = new Map<string, number>();
		for (const r of csf) {
			const fn = (r.function as string) || '(empty)';
			counts.set(fn, (counts.get(fn) ?? 0) + 1);
		}
		// Both GOVERN and IDENTIFY families are present in the fixture
		expect(counts.size).toBeGreaterThanOrEqual(2);
		// Sum of all = total rows
		const total = [...counts.values()].reduce((a, b) => a + b, 0);
		expect(total).toBe(csf.length);
	});

	it('counts CSF→ATT&CK crosswalk mappings by predicate', () => {
		const mappings = loadCrosswalkFixture(REALISTIC_FIXTURES.crosswalks.nistCsfToMitreAttack);
		const byPredicate = new Map<string, number>();
		for (const m of mappings) {
			byPredicate.set(m.predicate_id, (byPredicate.get(m.predicate_id) ?? 0) + 1);
		}
		// Real SSSOM has multiple predicate types — skos:closeMatch, skos:relatedMatch, etc.
		expect(byPredicate.size).toBeGreaterThan(0);
	});
});

// ---------------------------------------------------------------------------
// Layer A primitive #6: anti-join (real "controls without mappings" query)
// ---------------------------------------------------------------------------

describe('anti-join — realistic "concepts without mappings" gap query', () => {
	it('finds NIST CSF concepts with NO mapping to MITRE ATT&CK', () => {
		const csf = loadConceptFixture(REALISTIC_FIXTURES.concepts.nistCsf);
		const mappings = loadCrosswalkFixture(REALISTIC_FIXTURES.crosswalks.nistCsfToMitreAttack);

		// Join key: concept's id (with CURIE prefix) vs mapping's subject_id
		const csfWithCurie = bind(csf, 'curie', (r) => `nist-csf:${r.id}`);
		const gaps = antiJoin(csfWithCurie, mappings, {
			leftOn: 'curie',
			rightOn: 'subject_id',
		});

		// Most CSF concepts in our fixture have NO mapping (only 13 mappings, ~25 concepts)
		expect(gaps.length).toBeGreaterThan(0);
		expect(gaps.length).toBeLessThanOrEqual(csfWithCurie.length);
		// Every gap row preserves the original CSF concept fields
		expect(gaps.every((g) => g.id != null && g.title != null)).toBe(true);
	});

	it('finds ISO 27001 controls with NO mapping to SOC 2', () => {
		const iso = loadConceptFixture(REALISTIC_FIXTURES.concepts.iso27001);
		const mappings = loadCrosswalkFixture(REALISTIC_FIXTURES.crosswalks.iso27001ToSoc2);

		const isoWithCurie = bind(iso, 'curie', (r) => `iso27001:${r.id}`);
		const gaps = antiJoin(isoWithCurie, mappings, {
			leftOn: 'curie',
			rightOn: 'subject_id',
		});

		// All ISO controls not in the (small) mapping set should appear
		expect(gaps.length).toBeGreaterThan(0);
	});
});

// ---------------------------------------------------------------------------
// Layer A join modes — realistic concept × crosswalk traversal
// ---------------------------------------------------------------------------

describe('join modes — realistic concept × crosswalk', () => {
	it('inner-joins CSF concepts (GOVERN/IDENTIFY) with their CSF→800-53 mappings', () => {
		// Use CSF→800-53 crosswalk, which actually overlaps the GOVERN-family concepts
		// in the fixture. (The CSF→ATT&CK crosswalk targets PROTECT/DETECT subjects,
		// which our fixture does not include — the empty case is verified separately below.)
		const csf = loadConceptFixture(REALISTIC_FIXTURES.concepts.nistCsf);
		const mappings = loadCrosswalkFixture(REALISTIC_FIXTURES.crosswalks.csfTo80053);

		const csfWithCurie = bind(csf, 'curie', (r) => `nist-csf:${r.id}`);
		const joined = innerJoin(csfWithCurie, mappings, {
			leftOn: 'curie',
			rightOn: 'subject_id',
		});

		// Each row should have both CSF fields (left) + mapping fields (right, prefixed)
		expect(joined.length).toBeGreaterThan(0);
		expect(joined.every((j) => j.id != null && j.r_object_id != null)).toBe(true);
	});

	it('inner-join over non-overlapping fixture subsets returns empty (realistic data shape)', () => {
		// CSF concepts fixture = GOVERN/IDENTIFY; ATT&CK mapping subjects = PROTECT/DETECT.
		// These intentionally don't overlap — documents the data shape via a passing test.
		const csf = loadConceptFixture(REALISTIC_FIXTURES.concepts.nistCsf);
		const mappings = loadCrosswalkFixture(REALISTIC_FIXTURES.crosswalks.nistCsfToMitreAttack);

		const csfWithCurie = bind(csf, 'curie', (r) => `nist-csf:${r.id}`);
		const joined = innerJoin(csfWithCurie, mappings, {
			leftOn: 'curie',
			rightOn: 'subject_id',
		});
		expect(joined).toEqual([]);
	});

	it('left-outer-joins CSF concepts with mappings; preserves unmapped concepts', () => {
		const csf = loadConceptFixture(REALISTIC_FIXTURES.concepts.nistCsf);
		const mappings = loadCrosswalkFixture(REALISTIC_FIXTURES.crosswalks.nistCsfToMitreAttack);

		const csfWithCurie = bind(csf, 'curie', (r) => `nist-csf:${r.id}`);
		const allRows = leftOuterJoin(csfWithCurie, mappings, {
			leftOn: 'curie',
			rightOn: 'subject_id',
		});

		// Every CSF concept appears at least once; some null-padded
		expect(allRows.length).toBeGreaterThanOrEqual(csfWithCurie.length);
		const unmatched = allRows.filter((r) => r.r_object_id == null);
		expect(unmatched.length).toBeGreaterThan(0);
	});

	it('joins CSF→800-53 crosswalk rows back to AC-family 800-53 concepts', () => {
		const ac = loadConceptFixture(REALISTIC_FIXTURES.concepts.nist80053);
		const mappings = loadCrosswalkFixture(REALISTIC_FIXTURES.crosswalks.csfTo80053);

		const acWithCurie = bind(ac, 'curie', (r) => `nist:${r.id}`);
		const joined = innerJoin(mappings, acWithCurie, {
			leftOn: 'object_id',
			rightOn: 'curie',
		});

		// Some CSF→800-53 mappings reference AC controls; others reference different families
		expect(joined.length).toBeGreaterThan(0);
		expect(joined.length).toBeLessThanOrEqual(mappings.length);
	});
});

// ---------------------------------------------------------------------------
// Layer A primitive #7: set-op (real cross-ontology comparisons)
// ---------------------------------------------------------------------------

describe('set-op — realistic cross-ontology comparisons', () => {
	it('intersects CIS Controls and SOC 2 by id (likely empty — different naming)', () => {
		const cis = loadConceptFixture(REALISTIC_FIXTURES.concepts.cis);
		const soc2 = loadConceptFixture(REALISTIC_FIXTURES.concepts.soc2);

		const inBoth = intersection(cis, soc2, { keyOf: 'id', mode: 'intersection' });
		// CIS uses "CIS-N" ids, SOC 2 uses "CCN.N" — no overlap
		expect(inBoth).toEqual([]);
	});

	it('unions CIS Controls + SOC 2 → all rows from both (no key collisions)', () => {
		const cis = loadConceptFixture(REALISTIC_FIXTURES.concepts.cis);
		const soc2 = loadConceptFixture(REALISTIC_FIXTURES.concepts.soc2);

		const merged = union(cis, soc2, { keyOf: 'id', mode: 'union' });
		expect(merged.length).toBe(cis.length + soc2.length);
	});

	it('difference: NIST CSF concepts that are NOT subject of any CSF→800-53 mapping (by CURIE)', () => {
		const csf = loadConceptFixture(REALISTIC_FIXTURES.concepts.nistCsf);
		const mappings = loadCrosswalkFixture(REALISTIC_FIXTURES.crosswalks.csfTo80053);

		const csfWithCurie = bind(csf, 'curie', (r) => `nist-csf:${r.id}`);
		// Project mappings down to subject curies (row-set with just `curie` key)
		const mappingSubjects = mappings.map((m) => ({ curie: m.subject_id as string }));

		const unmapped = difference(csfWithCurie, mappingSubjects, {
			keyOf: 'curie',
			mode: 'difference',
		});
		// Some CSF concepts ARE subjects of mappings; some are not — answer is a strict subset
		expect(unmapped.length).toBeGreaterThan(0);
		expect(unmapped.length).toBeLessThan(csfWithCurie.length);
	});
});

// ---------------------------------------------------------------------------
// Layer A primitive #8: diff (snapshot delta of a realistic ontology)
// ---------------------------------------------------------------------------

describe('diff — synthetic version-delta over realistic data shape', () => {
	it('detects renamed control title between two CSF snapshots', () => {
		const v1 = loadConceptFixture(REALISTIC_FIXTURES.concepts.nistCsf);
		// Synthesize a v2 with one renamed title + one removed concept + one added concept
		const v2: ConceptRow[] = v1.slice(0, -1).map((r, i) => {
			if (i === 0) return { ...r, title: `${r.title} (revised)` };
			return r;
		});
		v2.push({ id: 'GV.SYN-1', title: 'Synthesized for diff test', function: 'GOVERN' });

		const d = diff(v1, v2, { keyOf: 'id' });
		expect(d.added.length).toBe(1);
		expect(d.added[0].id).toBe('GV.SYN-1');
		expect(d.removed.length).toBe(1); // the last v1 row that wasn't carried forward
		expect(d.changed.length).toBe(1);
		expect(d.changed[0].changedFields.some((f) => f.field === 'title')).toBe(true);
	});

	it('ignores synthetic timestamp drift via ignoreFields', () => {
		const v1 = loadConceptFixture(REALISTIC_FIXTURES.concepts.iso27001).map((r) => ({
			...r,
			last_reviewed: '2025-01-01',
		}));
		const v2 = v1.map((r) => ({ ...r, last_reviewed: '2026-01-01' }));

		// No real field changed — only the noise field
		const dNoIgnore = diff(v1, v2, { keyOf: 'id' });
		expect(dNoIgnore.changed.length).toBe(v1.length); // every row appears changed without ignore

		const dIgnored = diff(v1, v2, { keyOf: 'id', ignoreFields: ['last_reviewed'] });
		expect(dIgnored.changed).toEqual([]); // every row equal once noise field stripped
	});

	it('uses a custom equality function for fuzzy confidence comparison', () => {
		const before = loadCrosswalkFixture(REALISTIC_FIXTURES.crosswalks.nistCsfToMitreAttack);
		// Wiggle every confidence by ±0.001
		const after = before.map((r) => ({ ...r, confidence: (r.confidence as number) + 0.001 }));

		const d = diff(before, after, {
			keyOf: 'subject_id',
			equalsFn: (b, a) =>
				Math.abs((b.confidence as number) - (a.confidence as number)) < 0.01 &&
				b.predicate_id === a.predicate_id &&
				b.object_id === a.object_id,
		});
		expect(d.changed).toEqual([]);
	});
});

// ---------------------------------------------------------------------------
// Cross-fixture composition — multiple primitives chained over real data
// ---------------------------------------------------------------------------

describe('primitive composition — realistic multi-step query', () => {
	it('finds NIST 800-53 AC controls that are referenced by a CSF mapping with confidence ≥ 0.8 (via implied predicate strength)', () => {
		// Pipeline: filter mappings → join with controls → bind a marker → count
		const ac = loadConceptFixture(REALISTIC_FIXTURES.concepts.nist80053);
		const mappings = loadCrosswalkFixture(REALISTIC_FIXTURES.crosswalks.csfTo80053);

		// CSF→800-53 fixture has match_type but no confidence column; map match_type to a numeric for the test
		const matchStrength: Record<string, number> = {
			exact: 1.0,
			close: 0.85,
			broad: 0.7,
			narrow: 0.7,
			related: 0.6,
		};
		const enrichedMappings = bind(mappings, 'strength', (r) => matchStrength[(r.match_type as string) ?? ''] ?? 0.5);

		const strong = enrichedMappings.filter((m) => (m.strength as number) >= 0.8);
		expect(strong.length).toBeGreaterThan(0);

		const acWithCurie = bind(ac, 'curie', (r) => `nist:${r.id}`);
		const joined = executeJoin(strong, acWithCurie, {
			leftOn: 'object_id',
			rightOn: 'curie',
			mode: 'inner',
		});
		// Every row has both a mapping side (subject_id, on left) and an AC concept side
		// (right-side `id` becomes `r_id` after merge per the default rightPrefix='r_').
		expect(joined.every((r) => r.subject_id != null && r.r_id != null)).toBe(true);
	});

	it('"framework overlap by id" — CIS ∩ SOC 2 stays empty even after CURIE normalization', () => {
		const cis = loadConceptFixture(REALISTIC_FIXTURES.concepts.cis);
		const soc2 = loadConceptFixture(REALISTIC_FIXTURES.concepts.soc2);

		const cisCurie = bind(cis, 'curie', (r) => `cis:${r.id}`);
		const soc2Curie = bind(soc2, 'curie', (r) => `soc2:${r.id}`);
		const overlap = intersection(cisCurie, soc2Curie, { keyOf: 'curie', mode: 'intersection' });
		// Different ontology prefixes → no string-equality overlap; would require a crosswalk
		expect(overlap).toEqual([]);
	});
});
