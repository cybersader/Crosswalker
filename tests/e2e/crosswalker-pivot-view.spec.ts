/**
 * crosswalker-pivot-view.spec.ts — Phase 3 v0.1.6 E2E (PARTIAL — Mocha pending)
 *
 * Tests for the registerBasesView('crosswalker-pivot') custom Bases view.
 * Most assertions live in the partial unit-test layer (tests/pivot-grid.test.ts
 * + tests/reference-base-files.test.ts). The E2E suite below documents the
 * end-to-end behavior — pending until WebdriverIO env is reliably available.
 *
 * Phase 3 deliverables under test:
 *   - registerBasesView call in onload() succeeds (returns truthy on Obsidian 1.10+)
 *   - Bases-disabled fallback Notice appears when Bases is off
 *   - CrosswalkerPivotView extends Component, renders correctly
 *   - View consumes controller.entries (filtered BasesEntry[])
 *   - View options panel: rowsBy, colsBy, cellOp, cellOf, empty, heatmap, rowSort, colSort
 *   - Reference .base file shipped to _crosswalker/views/coverage-matrix.base on first run
 *   - Idempotent first-run write (doesn't overwrite user edits)
 *   - Pivot grid renders with correct row/col labels + cell counts
 *
 * Reference: TaskNotes v4 (zARCHIVE/tasknotes-enhancements/src/bases/) — same
 * registerBasesView API, same Component-extends-BasesView pattern.
 */

describe('Phase 3 — crosswalkerPivot custom Bases view (PARTIAL — unit covered; E2E pending)', () => {
	// Unit-test coverage:
	//   - tests/pivot-grid.test.ts (31 tests) — pivot data shaping, all aggregation ops,
	//     empty semantics, sort, heatmap intensity, edge cases
	//   - tests/reference-base-files.test.ts (6 tests) — first-run .base file write
	// The view class itself (DOM rendering) is covered manually via
	// TEST_PHASE3_PIVOT_VIEW.md scenarios.

	it('Settled #2 + Ch 30: crosswalkerPivot view registration succeeds on Obsidian 1.10.0+');
	it('Settled #2 + Ch 30: Bases-disabled fallback Notice (manual test scenario in TEST_PHASE3_PIVOT_VIEW.md)');
	it('Settled #2 + Ch 30: pivot grid renders correctly via TEST_PHASE3 Scenario 2');
	it('Settled #2 + Ch 30: view consumes BasesEntry[] from controller (covered by pivot-grid tests + manual)');
	it('Settled #2 + Ch 30: view options panel persists settings across reloads (manual)');
	it('Settled #2 + Ch 30: reference .base file shipped on first run (covered by reference-base-files tests + manual)');
	it('Settled #2 + Ch 30: idempotent first-run write does not overwrite user edits (manual; TEST_PHASE3 Scenario 4)');
	it('Settled #2 + Ch 30: pivot output uses Tier 2 SQL helpers under the hood (covered by SSSOM Phase 2 tests + manual)');
	it('Ch 30 §6: heatmap rendering uses CSS custom property --crosswalker-pivot-cell-intensity (manual visual check)');
});
