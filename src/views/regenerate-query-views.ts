/**
 * regenerate-query-views.ts — Phase 4.5
 *
 * Scans the vault for notes with `crosswalker:` frontmatter; for each one
 * regenerates its `.base` file at `view_file` from the frontmatter's
 * recipe + params. Idempotent — skips files whose generated content already
 * matches what would be written.
 *
 * Two entry points:
 *   - `regenerateAll(app, debug)` — scan + regenerate every note
 *   - `regenerateOne(app, file, debug)` — single note (used after a known
 *     frontmatter edit; e.g. could be wired to file-modify events later)
 *
 * Runs on plugin load (onLayoutReady) as a stale-state recovery — same
 * pattern as Phase 3 reference file write + Phase 1.5 fixture drift check.
 * Also exposed as the explicit command `Crosswalker: Refresh query views`.
 */

import type { App, TFile } from 'obsidian';
import type { DebugLog } from '../utils/debug';
import { readQueryFrontmatter } from './query-frontmatter-io';
import { renderRecipeTemplate } from './recipe-templates';
import { buildBaseFileContent } from './apply-query-to-note';

export interface RegenerateResult {
	scanned: number;
	regenerated: number;
	skipped: number;
	errors: Array<{ note: string; reason: string }>;
}

/**
 * Scan the vault for notes with `crosswalker:` frontmatter; regenerate each
 * one's `.base` file. Returns aggregate counts + per-error details.
 */
export async function regenerateAll(app: App, debug?: DebugLog): Promise<RegenerateResult> {
	const result: RegenerateResult = {
		scanned: 0,
		regenerated: 0,
		skipped: 0,
		errors: [],
	};

	const allFiles = app.vault.getMarkdownFiles();
	for (const file of allFiles) {
		result.scanned += 1;
		try {
			const subResult = await regenerateOne(app, file, debug, { _shared: true });
			if (subResult === 'skipped') result.skipped += 1;
			else if (subResult === 'regenerated') result.regenerated += 1;
			else if (subResult === 'not-applicable') {
				// File had no `crosswalker:` block — common; not counted
			} else {
				result.errors.push({ note: file.path, reason: subResult });
			}
		} catch (err) {
			const msg = err instanceof Error ? err.message : String(err);
			result.errors.push({ note: file.path, reason: msg });
		}
	}

	debug?.info('view', 'regenerate-all-complete', `Regeneration scan complete`, {
		scanned: result.scanned,
		regenerated: result.regenerated,
		skipped: result.skipped,
		errorCount: result.errors.length,
	});

	return result;
}

type SingleResult = 'regenerated' | 'skipped' | 'not-applicable' | string;

/**
 * Regenerate a single note's `.base` file if its `crosswalker:` frontmatter
 * declares one. Returns:
 *   - 'regenerated' — content changed; .base file written
 *   - 'skipped' — content matches; no write needed (idempotent)
 *   - 'not-applicable' — file has no crosswalker block
 *   - any other string — error message
 *
 * The `_shared` option suppresses individual-note debug events when called
 * from `regenerateAll` (which logs aggregate).
 */
export async function regenerateOne(
	app: App,
	file: TFile,
	debug?: DebugLog,
	opts: { _shared?: boolean } = {},
): Promise<SingleResult> {
	const fm = await readQueryFrontmatter(app, file);

	if (!fm.present) {
		return 'not-applicable';
	}
	if (!fm.data) {
		const err = `Malformed crosswalker block: ${fm.errors.join('; ')}`;
		if (!opts._shared) {
			debug?.warn('view', 'regenerate-malformed-frontmatter', `Skipping note with malformed crosswalker block`, {
				note: file.path,
				errors: fm.errors,
			});
		}
		return err;
	}

	const { recipe, params, view_file: viewFile, query_id: queryId } = fm.data;

	// Re-render the template
	const baseBody = renderRecipeTemplate(recipe, params);
	if (baseBody === null) {
		const err = `No template registered for recipe '${recipe}' — cannot regenerate`;
		if (!opts._shared) {
			debug?.warn('view', 'regenerate-missing-template', err, {
				note: file.path,
				recipe,
			});
		}
		return err;
	}

	const newContent = buildBaseFileContent(baseBody, {
		recipeId: recipe,
		queryId,
		sourceNotePath: file.path,
	});

	// Idempotent check — read existing .base file content + skip if identical
	// EXCEPT for the timestamp comment (which always differs). We compare
	// only the YAML body to determine if a write is needed.
	const existing = app.vault.getAbstractFileByPath(viewFile);
	if (existing && 'path' in existing && typeof (existing as { extension?: string }).extension === 'string') {
		const existingFile = existing as TFile;
		try {
			const existingContent = await app.vault.read(existingFile);
			if (yamlBodyMatches(existingContent, newContent)) {
				// No semantic change — skip
				return 'skipped';
			}
			await app.vault.modify(existingFile, newContent);
		} catch (err) {
			return err instanceof Error ? err.message : String(err);
		}
	} else {
		// .base file missing — create it (re-establishes the back-pointer)
		const parentPath = viewFile.split('/').slice(0, -1).join('/');
		if (parentPath && !app.vault.getAbstractFileByPath(parentPath)) {
			try {
				await app.vault.createFolder(parentPath);
			} catch (err) {
				const msg = err instanceof Error ? err.message : String(err);
				if (!msg.includes('already exists')) {
					return msg;
				}
			}
		}
		try {
			await app.vault.create(viewFile, newContent);
		} catch (err) {
			return err instanceof Error ? err.message : String(err);
		}
	}

	if (!opts._shared) {
		debug?.info('view', 'query-regenerated', `Regenerated .base file: ${viewFile}`, {
			note: file.path,
			viewFile,
			queryId,
			recipe,
		});
	}

	return 'regenerated';
}

/**
 * Compare two `.base` file contents by their YAML body (strips the header
 * comment block which always contains a timestamp). Returns true if the
 * actual queries match — a "no-op regeneration" signal.
 *
 * Exported for direct testing.
 */
export function yamlBodyMatches(a: string, b: string): boolean {
	return stripHeaderComments(a) === stripHeaderComments(b);
}

function stripHeaderComments(content: string): string {
	const lines = content.split('\n');
	let i = 0;
	while (i < lines.length && (lines[i].startsWith('#') || lines[i].trim() === '')) {
		i += 1;
	}
	return lines.slice(i).join('\n').trim();
}
