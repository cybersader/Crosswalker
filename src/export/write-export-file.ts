/**
 * write-export-file.ts — write (or overwrite) one exported file into the
 * vault, always as a sibling of the exported folder — never outside the
 * vault (no OS file picker; per v0.1.7's "Open questions" the v0.1 answer is
 * a vault path, not a native save dialog — simplest, and every exported
 * format here is plain text a user can immediately reopen/re-import inside
 * Obsidian).
 *
 * Naming: `<folder-name>.export.<ext>`, written into the exported folder's
 * PARENT directory (a sibling of the folder itself) so re-running the export
 * command never picks up its own previous output as new source rows.
 */

import type { App, TFolder } from 'obsidian';
import { TFile, normalizePath } from 'obsidian';

/** The vault-relative sibling path `<folder>.export.<ext>` for a chosen export folder. */
export function exportSiblingPath(folder: TFolder, extension: string): string {
	const label = folder.path === '' ? 'vault' : folder.name;
	const parentPath = folder.parent && folder.parent.path !== folder.path ? folder.parent.path : '';
	return normalizePath(`${parentPath ? `${parentPath}/` : ''}${label}.export.${extension}`);
}

/** Create the file if it doesn't exist yet, else overwrite it (exports are expected to be re-run). */
export async function writeExportFile(app: App, path: string, content: string): Promise<void> {
	const normalized = normalizePath(path);
	const existing = app.vault.getAbstractFileByPath(normalized);
	if (existing instanceof TFile) {
		await app.vault.modify(existing, content);
		return;
	}
	const parentPath = normalized.split('/').slice(0, -1).join('/');
	if (parentPath && !app.vault.getAbstractFileByPath(parentPath)) {
		await app.vault.createFolder(parentPath);
	}
	await app.vault.create(normalized, content);
}
