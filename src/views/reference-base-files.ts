/**
 * reference-base-files.ts — Phase 3 v0.1.6 (per Settled #2 + Ch 30)
 *
 * Inlined .base file templates that the plugin writes to the user's vault on
 * first run. Source-of-truth copies live at `templates/*.base` in the repo
 * for editor syntax highlighting + manual review. esbuild bundles `main.js`
 * as a single file, so we inline the strings here rather than file-read
 * at runtime.
 *
 * To update a template: edit the matching `templates/*.base` file in the repo,
 * then copy the contents to the matching constant in this file. (A future
 * codegen could automate this; v0.1.6 keeps the source-of-truth simple.)
 *
 * Idempotent first-run write: `writeReferenceBaseFiles` only creates files
 * that don't already exist — never overwrites user edits. To regenerate
 * defaults, the user deletes the file and reloads the plugin.
 */

import type { App } from 'obsidian';
import { TFile, normalizePath } from 'obsidian';
import type { DebugLog } from '../utils/debug';

/** Reference Coverage Matrix .base file content. Mirrors templates/coverage-matrix.base. */
export const REFERENCE_COVERAGE_MATRIX_BASE = `# Crosswalker Coverage Matrix — reference .base file (v0.1.6 Phase 3)
#
# Crosswalker shipped this on first plugin run. Idempotent: never
# overwrites your edits. Delete the file + reload the plugin to regenerate.
#
# Reference: SSSOM spec at https://w3id.org/sssom/

filters:
  and:
    - file.inFolder("_crosswalker/mappings")
    - 'file.ext == "md"'

formulas:
  pair: 'source_framework + " → " + target_framework'

properties:
  subject_id:
    displayName: "Subject"
  object_id:
    displayName: "Object"
  predicate_id:
    displayName: "STRM predicate"
  sssom_predicate:
    displayName: "SSSOM predicate"
  source_framework:
    displayName: "Source"
  target_framework:
    displayName: "Target"
  formula.pair:
    displayName: "Pair"

views:
  # Custom Crosswalker pivot view — registered by the plugin via
  # plugin.registerBasesView("crosswalker-pivot", ...).
  - type: crosswalker-pivot
    name: "Coverage matrix"
    config:
      rowsBy: "subject_id"
      colsBy: "object_id"
      cellOp: "count"
      empty: "gap"
      heatmap: false
      rowSort: "asc"
      colSort: "asc"

  # Bases-native fallback Table view — works even when the crosswalker-pivot
  # view is unavailable (Bases disabled, plugin uninstalled).
  - type: table
    name: "Mappings table"
    order:
      - file.name
      - subject_id
      - predicate_id
      - object_id
      - sssom_predicate
      - mapping_justification
      - confidence
    summaries:
      file.name: Filled
`;

/** Default first-run write target. */
export const COVERAGE_MATRIX_BASE_PATH = '_crosswalker/views/coverage-matrix.base';

/**
 * Write reference .base files to the vault on first plugin run. Idempotent —
 * skips files that already exist. Returns the list of paths actually created.
 *
 * Per Settled #3 ("_crosswalker/ underscore folder convention"): output
 * folder uses underscore prefix so Obsidian indexes it (dot-prefix folders
 * would be hidden). Per Settled #2: ships exactly one reference .base in
 * v0.1.6 (Coverage Matrix); v0.2+ adds siblings.
 */
export async function writeReferenceBaseFiles(app: App, debug?: DebugLog): Promise<string[]> {
	const created: string[] = [];
	const writes: Array<{ path: string; content: string }> = [
		{ path: COVERAGE_MATRIX_BASE_PATH, content: REFERENCE_COVERAGE_MATRIX_BASE },
	];

	for (const { path, content } of writes) {
		const normalized = normalizePath(path);
		const existing = app.vault.getAbstractFileByPath(normalized);
		if (existing instanceof TFile) {
			// File exists; do not overwrite (preserves user edits).
			continue;
		}

		try {
			// Ensure parent folder exists.
			const parentPath = normalized.split('/').slice(0, -1).join('/');
			if (parentPath && !app.vault.getAbstractFileByPath(parentPath)) {
				await app.vault.createFolder(parentPath);
			}
			await app.vault.create(normalized, content);
			created.push(normalized);
			debug?.info('view', 'reference-base-written', `Reference .base file written: ${normalized}`, { path: normalized });
		} catch (err) {
			const msg = err instanceof Error ? err.message : String(err);
			debug?.warn('view', 'reference-base-write-failed', `Failed to write reference .base file ${normalized}: ${msg}`, { path: normalized, error: msg });
			// Continue with the rest; one failure shouldn't block other writes.
		}
	}

	return created;
}
