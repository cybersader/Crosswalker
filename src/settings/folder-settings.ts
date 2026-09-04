import { App, TAbstractFile, normalizePath } from 'obsidian';
import type { CrosswalkerSettings } from './settings-data';

/**
 * AM-53 (2026-09-04). THE ONE READING of the configured output root.
 *
 * The settings field stores exactly what the person typed. That is deliberate: a
 * text box that rewrites itself under the cursor is hostile, and the folder
 * suggester hands over host paths that are already well formed. What was not
 * deliberate is that every reader then interpreted that raw text for itself.
 *
 * Failure mode prevented: the engine normalized the root at its own boundary
 * (AM-49) and the two surfaces that COUNT what the engine wrote compared against
 * the same setting raw. `getAbstractFileByPath` is a direct key lookup in the
 * vault's file map and normalizes nothing, so a single trailing separator was
 * enough: the import landed correctly under `Frameworks/`, and then
 * `getAbstractFileByPath('Frameworks/')` answered null, the workspace rendered
 * "Nothing imported yet. Run 'Import structured data' to bring in your first
 * framework." and the status bar read 0 ontologies over a vault that had just
 * imported one. The four characters AM-49 exists for (an NBSP pasted from a
 * document, an NFD accent, a backslash, an internal `//`) do the same thing. This
 * is the memory rule `project_reimport_identity_reconciliation` inside its own
 * stated scope: identity, never path, applies to discovery, counting and display
 * too.
 *
 * A normalization applied to what you record must be applied to what you compare
 * it against, and "applied" means through the SAME function, not through a second
 * spelling of it. This is that function.
 */
export function outputRootPath(settings: Pick<CrosswalkerSettings, 'defaultOutputPath'>): string {
	return normalizeFolderSetting(settings.defaultOutputPath);
}

/**
 * AM-53. The normalization itself, for the callers that read a folder from
 * somewhere other than the output-root setting.
 *
 * S6 ruling (2026-09-04) routes `import-set.ts`'s `normalizeFolder` here. That was
 * trim plus edge separators, which is a fraction of one of the host's four
 * mutations - verbatim what AM-49 says `stripSlashes` was and why it was not
 * enough - and its result was then compared against fully normalized vault paths
 * to decide where a refresh believes an import set lives. A second spelling of one
 * normalization is a second answer to one question.
 *
 * AM-57 (2026-09-04). Renamed from `normalizeOutputRoot` because the output root is
 * not the only folder a person types into settings, and every one of them is
 * composed into a vault path the same way. Same body: the rule was never specific
 * to the root, only its name was.
 */
export function normalizeFolderSetting(value: string): string {
	const trimmed = value.trim();
	if (trimmed === '') return '';
	const normalized = normalizePath(trimmed);
	// The host's `normalizePath('')` is `'/'`, which is TRUTHY, so every
	// `if (!root)` emptiness guard in this product was dead for the supported
	// "Vault root" state (settings renders it as such) and no vault event ever
	// scheduled the ontology status-bar refresh. Both spellings of the root come
	// back as the empty string, which is the same mapping `normalizeBasePath` makes
	// at the engine boundary, so the two agree by construction rather than by
	// inspection.
	return normalized === '/' ? '' : normalized;
}

/**
 * AM-53. The output root AS A VAULT ENTRY, for the surfaces that count what is
 * under it.
 *
 * The empty root is the vault root, whose own key in the file map is `'/'` and not
 * `''`; asking for `''` returns null, which reads to every caller as "nothing is
 * installed". So the one place that difference matters converts back here, beside
 * the mapping that produced it, rather than in each caller.
 */
export function outputRootFile(
	app: App,
	settings: Pick<CrosswalkerSettings, 'defaultOutputPath'>,
): TAbstractFile | null {
	const root = outputRootPath(settings);
	return app.vault.getAbstractFileByPath(root === '' ? '/' : root);
}

/**
 * AM-57. The fallbacks the settings tab writes when a person clears the field, and
 * the fallbacks the accessors apply when the stored value normalizes to nothing.
 * Named once so the two cannot drift into disagreeing about where evidence lands.
 */
export const DEFAULT_EVIDENCE_JUNCTION_FOLDER = 'Evidence/Junctions';
export const DEFAULT_EVIDENCE_REPORT_FOLDER = 'Reports';

/**
 * AM-57 (2026-09-04). THE ONE READING of the evidence link folder.
 *
 * Failure mode prevented: the output root's own bug, one settings field over. This
 * value is composed straight into a vault path (`<folder>/<name>-<hash>.md`) which
 * is then handed to `getAbstractFileByPath`, `createFolder` and `create`. Typed
 * with a trailing separator it produced `Evidence/Junctions//X.md`: the occupant
 * check answered null on a key the file map does not hold, so the address refusal
 * that exists to stop a junction from landing on somebody else's note could not
 * fire, and the note was created at a path nobody had normalized. The four
 * characters AM-49 names (an NBSP, a backslash, an internal `//`, a bare `/`) all
 * reach the same place.
 *
 * The default is applied here rather than at each composition site, so "the person
 * cleared the field" has one answer instead of one per caller.
 */
export function evidenceJunctionFolder(settings: Pick<CrosswalkerSettings, 'evidenceJunctionFolder'>): string {
	return normalizeFolderSetting(settings.evidenceJunctionFolder) || DEFAULT_EVIDENCE_JUNCTION_FOLDER;
}

/** AM-57. THE ONE READING of the coverage report folder. Same rule, same reason. */
export function evidenceReportFolder(settings: Pick<CrosswalkerSettings, 'evidenceReportFolder'>): string {
	return normalizeFolderSetting(settings.evidenceReportFolder) || DEFAULT_EVIDENCE_REPORT_FOLDER;
}
