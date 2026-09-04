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
	return normalizeOutputRoot(settings.defaultOutputPath);
}

/**
 * AM-53. The normalization itself, for the one caller that reads a root from
 * somewhere other than settings.
 *
 * S6 ruling (2026-09-04) routes `import-set.ts`'s `normalizeFolder` here. That was
 * trim plus edge separators, which is a fraction of one of the host's four
 * mutations - verbatim what AM-49 says `stripSlashes` was and why it was not
 * enough - and its result was then compared against fully normalized vault paths
 * to decide where a refresh believes an import set lives. A second spelling of one
 * normalization is a second answer to one question.
 */
export function normalizeOutputRoot(value: string): string {
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
