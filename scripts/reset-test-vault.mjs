#!/usr/bin/env node
/**
 * reset-test-vault.mjs — clear the ad-hoc imports you made while testing, so you
 * can start fresh, WITHOUT touching the curated corpus / fixtures / views.
 *
 *   bun run reset            # dry run — reports what WOULD be deleted
 *   bun run reset -- --yes   # actually delete
 *
 * What it deletes: every Crosswalker-generated note (one carrying `_crosswalker:`
 * provenance) that lives OUTSIDE the protected list below, plus any folders left
 * empty afterwards. Hand-written notes (no provenance) are never touched.
 *
 * Protected (never deleted):
 *   - .obsidian/                         plugin + vault config
 *   - Frameworks/_licensed/              the regenerated licensed corpus (slow to rebuild)
 *   - Frameworks/NIST-mini/              committed synthetic fixtures (`bun run fixtures`)
 *   - Frameworks/PROVENANCE.md           data provenance doc
 *   - _crosswalker/                      crosswalk edges + saved query state
 *   - GRC analysis/                      committed .base views + index notes
 *   - _test-guides/, Crosswalker Test Data/   sample/test content
 */

import { readdirSync, readFileSync, statSync, rmSync } from 'node:fs';
import { join, relative, dirname } from 'node:path';

const VAULT = 'test-vault';
const APPLY = process.argv.includes('--yes');

const PROTECTED = [
	'.obsidian',
	'Frameworks/_licensed',
	'Frameworks/NIST-mini',
	'Frameworks/PROVENANCE.md',
	'_crosswalker',
	'GRC analysis',
	'_test-guides',
	'Crosswalker Test Data',
].map((p) => join(VAULT, p));

const isProtected = (path) => PROTECTED.some((p) => path === p || path.startsWith(p + '/'));

/** Recursively collect all .md files under a dir. */
function walk(dir, out = []) {
	for (const name of readdirSync(dir)) {
		const full = join(dir, name);
		const st = statSync(full);
		if (st.isDirectory()) walk(full, out);
		else if (name.endsWith('.md')) out.push(full);
	}
	return out;
}

/** A note is Crosswalker-generated if its frontmatter carries `_crosswalker:`. */
function isGenerated(file) {
	try {
		return readFileSync(file, 'utf8').includes('\n  spec_version:') || /^_crosswalker:/m.test(readFileSync(file, 'utf8'));
	} catch {
		return false;
	}
}

const all = walk(VAULT);
const targets = all.filter((f) => !isProtected(f) && isGenerated(f));

// Report grouped by folder.
const byFolder = new Map();
for (const f of targets) {
	const folder = relative(VAULT, dirname(f)) || '(root)';
	byFolder.set(folder, (byFolder.get(folder) ?? 0) + 1);
}

console.log(`\n  Crosswalker test-vault reset — ${APPLY ? 'DELETING' : 'DRY RUN'}\n`);
if (targets.length === 0) {
	console.log('  Nothing to delete — no generated notes outside the protected areas.\n');
	process.exit(0);
}
for (const [folder, n] of [...byFolder].sort((a, b) => b[1] - a[1])) {
	console.log(`    ${String(n).padStart(5)}  ${folder}/`);
}
console.log(`\n  ${targets.length} generated note(s) to remove (curated corpus/fixtures/views untouched).`);

if (!APPLY) {
	console.log('\n  Dry run only. Re-run with `bun run reset -- --yes` to delete.\n');
	process.exit(0);
}

// Delete the notes, then prune folders that became empty (bottom-up).
const touchedDirs = new Set();
for (const f of targets) {
	rmSync(f, { force: true });
	touchedDirs.add(dirname(f));
}
function pruneEmpty(dir) {
	if (isProtected(dir) || dir === VAULT) return;
	try {
		if (readdirSync(dir).length === 0) {
			rmSync(dir, { recursive: true, force: true });
			pruneEmpty(dirname(dir));
		}
	} catch { /* gone already */ }
}
// Walk up from each touched dir, deepest first.
for (const dir of [...touchedDirs].sort((a, b) => b.length - a.length)) pruneEmpty(dir);

console.log(`\n  ✅ Deleted ${targets.length} note(s) + pruned empty folders.\n`);
