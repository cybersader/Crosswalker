/**
 * entry-points.ts — pure helpers behind Crosswalker's non-command-palette
 * discovery surfaces: file-explorer context menu, the file "more options"
 * menu, the status bar ontology count, and the first-run notice.
 *
 * Kept free of the `obsidian` import and any side effects so every branch is
 * unit-testable without a running plugin/app instance. Callers in main.ts do
 * the vault/workspace I/O and pass plain data in.
 */

/**
 * File extensions Crosswalker's import wizard understands (no leading dot,
 * lower case). Mirrors the wizard's `accept` filter and `detectFileType()`
 * in src/import/import-wizard.ts.
 */
export const IMPORTABLE_EXTENSIONS = ['csv', 'xlsx', 'xls', 'json'] as const;

export type ImportableExtension = (typeof IMPORTABLE_EXTENSIONS)[number];

/**
 * Whether a file extension (as returned by `TFile.extension`, no leading
 * dot) is one the import wizard can read. Case-insensitive.
 */
export function isImportableExtension(extension: string): boolean {
	return (IMPORTABLE_EXTENSIONS as readonly string[]).includes(extension.toLowerCase());
}

/**
 * A minimal, vault-I/O-free description of one entry directly under the
 * configured output folder. Callers list the folder's immediate children
 * and map them to this shape; this module never touches the vault itself.
 */
export interface TopLevelEntry {
	name: string;
	isFolder: boolean;
}

/**
 * Derive the "installed ontology" count for the status bar: the number of
 * top-level folders directly under the configured output path. Cheap by
 * construction — it only ever looks at one level, never recurses.
 */
export function countTopLevelOntologyFolders(entries: TopLevelEntry[]): number {
	return entries.filter((entry) => entry.isFolder).length;
}

/**
 * Status bar label for a given ontology count. Sentence case, no internal
 * jargon, no em dashes (per plugin UI-copy convention).
 */
export function formatOntologyStatusLabel(count: number): string {
	if (count === 0) return 'Crosswalker: no ontologies yet';
	return `Crosswalker: ${count} ontolog${count === 1 ? 'y' : 'ies'}`;
}

export type FirstRunReason = 'first-install' | 'version-changed' | 'already-seen';

export interface FirstRunCheckResult {
	shouldShow: boolean;
	reason: FirstRunReason;
}

/**
 * First-run / post-update gate. Compares the last version this install
 * recorded seeing (persisted in plugin data, not settings — see main.ts'
 * onload) against the currently running manifest version.
 *
 * Fires once on a fresh install (no recorded version) and once per version
 * change (update) — never twice for the same version.
 */
export function checkFirstRun(
	lastSeenVersion: string | null | undefined,
	currentVersion: string,
): FirstRunCheckResult {
	if (!lastSeenVersion) return { shouldShow: true, reason: 'first-install' };
	if (lastSeenVersion !== currentVersion) return { shouldShow: true, reason: 'version-changed' };
	return { shouldShow: false, reason: 'already-seen' };
}
