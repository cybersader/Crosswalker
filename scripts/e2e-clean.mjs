#!/usr/bin/env node
/**
 * e2e-clean.mjs — one-shot cleanup for the `test-vault/Frameworks/` backlog
 * of Crosswalker-generated notes accumulated by historical e2e/manual runs
 * (3,553 notes found 2026-07-11 — the graph view's `path:"Frameworks"`
 * filter drowns in that backlog instead of showing a legible cluster; see
 * `tests/e2e/visual-graph.spec.ts` header for the discovery writeup).
 *
 * This is a manual, deliberate-run tool (NOT wired into the wdio harness —
 * see `tests/e2e/helpers/vault-hygiene.ts` + `wdio.conf.mts` `onPrepare` for
 * the automatic per-run cleanup of spec-scoped output folders like
 * `GraphTest-*`). Use this one when the Frameworks/ backlog itself needs a
 * one-time sweep.
 *
 *   node scripts/e2e-clean.mjs            # dry run (default) — reports only
 *   node scripts/e2e-clean.mjs --force    # actually deletes
 *
 * SAFETY:
 *   - Only ever deletes a file whose frontmatter carries a `_crosswalker:`
 *     block with a nested `producer:` key (i.e. Crosswalker-generated —
 *     see `tests/e2e/helpers/vault-hygiene.ts` `isGeneratedNote()` for the
 *     same check used by the automated per-run hygiene hook).
 *   - Never touches the curated/licensed corpus or committed fixtures —
 *     see PROTECTED below. Mirrors `scripts/reset-test-vault.mjs`'s
 *     protected list (deleting `_licensed/` would destroy hours of manual
 *     corpus curation that isn't reproducible from a script).
 */

import { readdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import { join, relative, dirname } from 'node:path';

const VAULT_FRAMEWORKS = join('test-vault', 'Frameworks');
const FORCE = process.argv.includes('--force');

// Relative to VAULT_FRAMEWORKS. Never touched, generated marker or not.
const PROTECTED = ['NIST-mini', '_licensed', 'PROVENANCE.md'].map((p) => join(VAULT_FRAMEWORKS, p));

const isProtected = (p) => PROTECTED.some((prot) => p === prot || p.startsWith(prot + '/'));

/** Same check as tests/e2e/helpers/vault-hygiene.ts isGeneratedNote() — kept
 *  duplicated (not imported) so this plain-Node script has zero TS/loader
 *  dependency and can run with a bare `node`. */
function isGeneratedNote(content) {
	if (!/^_crosswalker:\s*$/m.test(content)) return false;
	return /^\s{2,6}producer:\s*$/m.test(content);
}

function walk(dir, out = []) {
	let entries;
	try {
		entries = readdirSync(dir, { withFileTypes: true });
	} catch {
		return out;
	}
	for (const e of entries) {
		const full = join(dir, e.name);
		if (e.isDirectory()) walk(full, out);
		else if (e.isFile() && e.name.endsWith('.md')) out.push(full);
	}
	return out;
}

if (!statSyncSafe(VAULT_FRAMEWORKS)) {
	console.log(`\n  No ${VAULT_FRAMEWORKS}/ found — nothing to clean.\n`);
	process.exit(0);
}

function statSyncSafe(p) {
	try {
		return statSync(p);
	} catch {
		return null;
	}
}

const allMd = walk(VAULT_FRAMEWORKS);
const eligible = allMd.filter((f) => !isProtected(f));
const targets = [];
const skippedNonGenerated = [];
const skippedProtectedCount = allMd.length - eligible.length;

for (const f of eligible) {
	let content;
	try {
		content = readFileSync(f, 'utf8');
	} catch {
		continue;
	}
	if (isGeneratedNote(content)) targets.push(f);
	else skippedNonGenerated.push(f);
}

const byFolder = new Map();
for (const f of targets) {
	const folder = relative(VAULT_FRAMEWORKS, dirname(f)) || '(root)';
	byFolder.set(folder, (byFolder.get(folder) ?? 0) + 1);
}

console.log(`\n  Crosswalker e2e:clean — ${FORCE ? 'DELETING' : 'DRY RUN'} (${VAULT_FRAMEWORKS}/)\n`);
console.log(`  Scanned: ${allMd.length} .md file(s) total`);
console.log(`  Protected (never touched): ${skippedProtectedCount} file(s) under ${PROTECTED.map((p) => relative(VAULT_FRAMEWORKS, p) + '/').join(', ')}`);
console.log(`  Non-generated, left alone: ${skippedNonGenerated.length} file(s) (no _crosswalker.producer marker)`);

if (targets.length === 0) {
	console.log(`\n  Nothing to delete — no generated notes outside the protected areas.\n`);
	process.exit(0);
}

console.log(`\n  Generated notes to remove, by folder:`);
for (const [folder, n] of [...byFolder].sort((a, b) => b[1] - a[1])) {
	console.log(`    ${String(n).padStart(5)}  ${folder}/`);
}
console.log(`\n  ${targets.length} generated note(s) eligible for removal.`);

if (!FORCE) {
	console.log(`\n  Dry run only. Re-run with \`node scripts/e2e-clean.mjs --force\` to delete.\n`);
	process.exit(0);
}

const touchedDirs = new Set();
for (const f of targets) {
	rmSync(f, { force: true });
	touchedDirs.add(dirname(f));
}
function pruneEmpty(dir) {
	if (isProtected(dir) || dir === VAULT_FRAMEWORKS) return;
	try {
		if (readdirSync(dir).length === 0) {
			rmSync(dir, { recursive: true, force: true });
			pruneEmpty(dirname(dir));
		}
	} catch {
		/* gone already, or not empty */
	}
}
for (const dir of [...touchedDirs].sort((a, b) => b.length - a.length)) pruneEmpty(dir);

console.log(`\n  Deleted ${targets.length} note(s) + pruned empty folders.\n`);
