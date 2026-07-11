/**
 * vault-hygiene.ts — clean known e2e generated-output folders between/before
 * runs so specs never accumulate a backlog the way `Frameworks/` did (3,553
 * notes from historical runs before this helper existed — see
 * `scripts/e2e-clean.mjs` for the one-shot backlog cleaner for that specific
 * folder).
 *
 * SAFETY: a file is only ever deleted if its frontmatter carries a
 * `_crosswalker:` block with a nested `producer:` key — i.e. it was written
 * by Crosswalker's own generation engine (see `_crosswalker.producer` in
 * generated frontmatter, e.g. `producer: { kind: plugin-engine, ... }`).
 * Hand-authored content living inside a matched folder is left in place and
 * reported via `skippedNonGenerated` — this helper NEVER wipes non-generated
 * content, even if the containing folder name matches a pattern.
 *
 * Used from `wdio.conf.mts` `onPrepare` (runs once, against the SOURCE
 * `test-vault/` before wdio-obsidian-service copies it into a sandboxed
 * `test-vault-XXXXXX/`), so every run starts from a clean slate for the
 * folders it's told to manage.
 */

import { readdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import path from 'node:path';

export interface WipeResult {
	/** Top-level folder names under vaultDir that matched a pattern. */
	matchedFolders: string[];
	/** Absolute paths of generated notes actually deleted. */
	deletedFiles: string[];
	/** Absolute paths of .md files inside a matched folder that were NOT
	 *  deleted because they lack the `_crosswalker.producer` marker. */
	skippedNonGenerated: string[];
}

/** A note is Crosswalker-generated if its frontmatter carries a top-level
 *  `_crosswalker:` block with a nested `producer:` key. Matches the shape
 *  emitted by the generation engine, e.g.:
 *    _crosswalker:
 *      spec_version: "..."
 *      producer:
 *        kind: plugin-engine
 */
export function isGeneratedNote(content: string): boolean {
	if (!/^_crosswalker:\s*$/m.test(content)) return false;
	return /^\s{2,6}producer:\s*$/m.test(content);
}

/** Supports at most one `*` wildcard per pattern (e.g. `GraphTest-*`). */
function matchesPattern(name: string, pattern: string): boolean {
	if (!pattern.includes('*')) return name === pattern;
	const escaped = pattern
		.split('*')
		.map((s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
		.join('.*');
	return new RegExp(`^${escaped}$`).test(name);
}

function walkMarkdown(dir: string, out: string[] = []): string[] {
	let entries;
	try {
		entries = readdirSync(dir, { withFileTypes: true });
	} catch {
		return out;
	}
	for (const e of entries) {
		const full = path.join(dir, e.name);
		if (e.isDirectory()) walkMarkdown(full, out);
		else if (e.isFile() && e.name.endsWith('.md')) out.push(full);
	}
	return out;
}

/**
 * Delete Crosswalker-generated notes from top-level folders under `vaultDir`
 * whose name matches one of `folders` (glob patterns supported, e.g.
 * `GraphTest-*`). Prunes directories left empty afterward. Never deletes a
 * file lacking the generated marker.
 */
export function wipeGeneratedOutput(folders: string[], vaultDir: string): WipeResult {
	const result: WipeResult = { matchedFolders: [], deletedFiles: [], skippedNonGenerated: [] };

	let topLevel: string[];
	try {
		topLevel = readdirSync(vaultDir);
	} catch {
		return result; // vaultDir doesn't exist yet — nothing to do
	}

	for (const name of topLevel) {
		if (!folders.some((p) => matchesPattern(name, p))) continue;
		const full = path.join(vaultDir, name);
		let st;
		try {
			st = statSync(full);
		} catch {
			continue;
		}
		if (!st.isDirectory()) continue;
		result.matchedFolders.push(name);

		const mdFiles = walkMarkdown(full);
		const touchedDirs = new Set<string>();
		for (const f of mdFiles) {
			let content: string;
			try {
				content = readFileSync(f, 'utf8');
			} catch {
				continue;
			}
			if (isGeneratedNote(content)) {
				rmSync(f, { force: true });
				result.deletedFiles.push(f);
				touchedDirs.add(path.dirname(f));
			} else {
				result.skippedNonGenerated.push(f);
			}
		}

		// Prune now-empty directories bottom-up. Never removes vaultDir itself,
		// and stops pruning a branch as soon as it finds remaining content
		// (e.g. a skipped hand-authored file keeps its parent folder alive).
		const pruneEmpty = (dir: string) => {
			if (dir === vaultDir || !dir.startsWith(vaultDir)) return;
			try {
				if (readdirSync(dir).length === 0) {
					rmSync(dir, { recursive: true, force: true });
					pruneEmpty(path.dirname(dir));
				}
			} catch {
				/* already gone, or not empty — leave it */
			}
		};
		for (const dir of [...touchedDirs].sort((a, b) => b.length - a.length)) pruneEmpty(dir);
	}

	return result;
}
