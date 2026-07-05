/**
 * reset-imports.ts — the in-Obsidian half of the rapid-test loop. Scans the
 * vault for Crosswalker-generated notes (ones carrying `_crosswalker` provenance)
 * and groups them by where they landed, so the "Reset imported notes (dev)"
 * command can let you clear an ad-hoc test import with one click — without
 * touching the curated corpus / fixtures / views.
 *
 * The CLI twin is `scripts/reset-test-vault.mjs` (`bun run reset`); both use the
 * same protected-prefix list so agent-driven and click-driven resets agree.
 */

import { App, TFile } from 'obsidian';

/** Path prefixes whose notes are curated/expensive corpus — never offered for
 *  one-click deletion (the user can still delete a file by hand). Mirrors
 *  scripts/reset-test-vault.mjs. */
export const PROTECTED_PREFIXES = [
	'Frameworks/_licensed',
	'Frameworks/NIST-mini',
	'_crosswalker',
	'GRC analysis',
];

export const isProtectedPath = (path: string): boolean =>
	PROTECTED_PREFIXES.some((p) => path === p || path.startsWith(p + '/'));

export interface ImportGroup {
	/** Display key — the first 1–2 path segments the notes share. */
	folder: string;
	count: number;
	paths: string[];
	/** True when this group is curated corpus (shown but not one-click-deletable). */
	protected: boolean;
}

/** First two path segments of a file path (or one, if shallow) — the grouping key. */
function groupKey(path: string): string {
	const segs = path.split('/');
	segs.pop(); // drop filename
	if (segs.length === 0) return '(vault root)';
	return segs.slice(0, 2).join('/');
}

/** A note is Crosswalker-generated when its frontmatter carries `_crosswalker`. */
async function isGenerated(app: App, file: TFile): Promise<boolean> {
	const cached = app.metadataCache.getFileCache(file)?.frontmatter;
	if (cached && '_crosswalker' in cached) return true;
	// Fallback for notes not yet in the metadata cache.
	try {
		const txt = await app.vault.cachedRead(file);
		return /^_crosswalker:/m.test(txt);
	} catch {
		return false;
	}
}

/** Scan the vault and group generated notes by output folder. */
export async function scanGeneratedImports(app: App): Promise<ImportGroup[]> {
	const groups = new Map<string, { paths: string[]; protectedFlag: boolean }>();
	for (const file of app.vault.getMarkdownFiles()) {
		if (!(await isGenerated(app, file))) continue;
		const key = groupKey(file.path);
		const g = groups.get(key) ?? { paths: [], protectedFlag: isProtectedPath(file.path) };
		g.paths.push(file.path);
		groups.set(key, g);
	}
	return [...groups.entries()]
		.map(([folder, g]) => ({ folder, count: g.paths.length, paths: g.paths, protected: g.protectedFlag }))
		.sort((a, b) => Number(a.protected) - Number(b.protected) || b.count - a.count);
}

/** Delete the given note paths, then prune folders left empty. Returns count deleted. */
export async function deleteImportedNotes(app: App, paths: string[]): Promise<number> {
	let deleted = 0;
	const dirs = new Set<string>();
	for (const p of paths) {
		const f = app.vault.getAbstractFileByPath(p);
		if (f instanceof TFile) {
			await app.fileManager.trashFile(f); // honors the user's "deleted files" setting
			deleted++;
			const dir = p.split('/').slice(0, -1).join('/');
			if (dir) dirs.add(dir);
		}
	}
	// Prune now-empty folders, deepest first.
	for (const dir of [...dirs].sort((a, b) => b.length - a.length)) {
		const folder = app.vault.getAbstractFileByPath(dir);
		// @ts-expect-error - TFolder has children
		if (folder && Array.isArray(folder.children) && folder.children.length === 0 && !isProtectedPath(dir)) {
			try { await app.fileManager.trashFile(folder); } catch { /* ignore */ }
		}
	}
	return deleted;
}
