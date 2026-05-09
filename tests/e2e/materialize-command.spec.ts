/**
 * materialize-command.spec.ts — Phase 5 v0.1.6 E2E (SCAFFOLD)
 *
 * Tests for opt-in materialization command + folder convention.
 * Currently scaffolded with it() — fill in when Phase 5 lands.
 *
 * Phase 5 deliverables under test:
 *   - Command palette: "Crosswalker: Materialize this recipe"
 *   - Output to _crosswalker/audit/<recipe-id>/<timestamp>.md
 *   - Frontmatter flags: crosswalker.materialized: true, do_not_edit: true
 *   - Default .gitignore template entry for _crosswalker/audit/
 *   - First-run flow: "Add _crosswalker/views/ to Excluded Files? [Yes/No]" prompt
 *   - Sparse-pivot guard fires at >100K cells with friendly warning + CSV export option
 *   - Timestamped new files; never overwrite (.latest.md alias pointer)
 *   - Deterministic regen: same recipe + same data → byte-identical materialized output
 *     (prerequisite for OpenTimestamps integration in v0.1.8)
 */

describe('Phase 5 — opt-in materialization command + folder convention (PENDING)', () => {
	it('Ch 32 + D1: Crosswalker: Materialize this recipe command');
	it('Ch 32 + D1: output to _crosswalker/audit/<recipe>/<timestamp>.md');
	it('Ch 32 + D1: frontmatter flags (crosswalker.materialized, do_not_edit)');
	it('Ch 32 + D1: timestamped new files (no overwrite)');
	it('Ch 32 + D1: .latest.md alias pointer updates correctly');
	it('Ch 32 + D1: deterministic regen (byte-identical on re-run)');
	it('Ch 35: sparse-pivot guard at >100K cells');
	it('Settled #3: first-run prompt for _crosswalker/views/ Excluded Files');
	it('Settled #3: .gitignore template includes _crosswalker/audit/');
});
