#!/usr/bin/env bun
/**
 * check-fixtures-drift.mjs — verify committed fixtures match a clean regeneration
 *
 * Used as a CI gate (and pre-commit check) to catch silent drift when:
 *   - spec/tier1.schema.json or spec/recipe.schema.json changes
 *   - tools/generate-fixtures.ts logic changes
 *   - tools/fixtures/synthetic/*.csv source data changes
 *   - The fixture generator becomes non-deterministic (regression on the
 *     2026-05-09 deterministic-fixtures commit)
 *
 * How it works:
 *   1. Save current state of test-vault/Frameworks/NIST-mini/ via git stash
 *      (only that subtree; other working changes preserved)
 *   2. Run `bun run fixtures` (which uses --deterministic)
 *   3. git diff test-vault/Frameworks/NIST-mini/ — fail if non-empty
 *   4. Restore stashed state regardless of pass/fail
 *
 * Exit codes:
 *   0 — fixtures match canonical regeneration (no drift)
 *   1 — drift detected (committed fixtures differ from regen output)
 *   2 — script error (couldn't stash, regen failed, etc.)
 *
 * Usage:
 *   bun run check:fixtures-drift     # CI / pre-commit
 *   bun scripts/check-fixtures-drift.mjs --verbose
 */

import { execSync } from 'node:child_process';

const FIXTURE_DIR = 'test-vault/Frameworks/NIST-mini';
const VERBOSE = process.argv.includes('--verbose');

function sh(cmd, opts = {}) {
	try {
		return execSync(cmd, { encoding: 'utf-8', stdio: VERBOSE ? 'inherit' : 'pipe', ...opts }).toString().trim();
	} catch (err) {
		if (opts.allowFail) return null;
		throw err;
	}
}

function run() {
	console.log(`Checking fixture drift in ${FIXTURE_DIR}...`);

	// Stash only the fixture dir (preserves other working changes).
	// `git stash push -- <path>` is the path-scoped stash form.
	let stashed = false;
	const status = sh(`git status --short ${FIXTURE_DIR}`, { allowFail: true });
	if (status && status.length > 0) {
		console.log('  Stashing existing fixture changes...');
		sh(`git stash push --include-untracked -- ${FIXTURE_DIR}`);
		stashed = true;
	}

	let driftDetected = false;
	let regenError = null;

	try {
		// Regenerate from canonical source.
		console.log('  Running bun run fixtures...');
		sh('bun run fixtures');

		// Diff against committed (HEAD) state.
		const diff = sh(`git diff ${FIXTURE_DIR}`, { allowFail: true });
		if (diff && diff.length > 0) {
			driftDetected = true;
			console.error('\n❌ Fixture drift detected!\n');
			console.error('Committed fixtures differ from a clean regeneration. Run:');
			console.error('    bun run fixtures');
			console.error('and commit the result. Likely causes:');
			console.error('  - spec/*.schema.json changed without regenerating fixtures');
			console.error('  - tools/generate-fixtures.ts logic changed');
			console.error('  - tools/fixtures/synthetic/*.csv source data changed');
			console.error('  - generate-fixtures.ts is non-deterministic (regression — fix this first)');
			console.error('\nFirst 50 lines of drift:');
			console.error(diff.split('\n').slice(0, 50).join('\n'));
		} else {
			console.log('  ✓ No drift — fixtures match canonical regeneration');
		}
	} catch (err) {
		regenError = err;
	} finally {
		// Restore stashed changes regardless of pass/fail.
		if (stashed) {
			console.log('  Restoring stashed fixture state...');
			// Discard the regenerated fixtures first; they'll be re-applied by stash pop.
			sh(`git checkout -- ${FIXTURE_DIR}`, { allowFail: true });
			sh('git stash pop', { allowFail: true });
		} else {
			// No prior changes; clean up the regenerated fixtures since they shouldn't differ.
			// (Drift case logs the diff above; we still discard so the working tree is clean.)
			if (driftDetected) {
				sh(`git checkout -- ${FIXTURE_DIR}`, { allowFail: true });
			}
		}
	}

	if (regenError) {
		console.error(`\n❌ Fixture regeneration failed: ${regenError.message}`);
		process.exit(2);
	}
	if (driftDetected) {
		process.exit(1);
	}
	process.exit(0);
}

run();
