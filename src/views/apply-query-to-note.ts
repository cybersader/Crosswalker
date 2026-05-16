/**
 * apply-query-to-note.ts — Phase 4.5 orchestrator.
 *
 * Single entry point for "apply this recipe + params to this note":
 *   1. Decide CREATE vs UPDATE based on existing `crosswalker_query:` frontmatter
 *   2. Generate / regenerate the `.base` file content via recipe-templates
 *   3. Write `.base` file at `_crosswalker/views/<query_id>.base`
 *   4. Write/update `crosswalker_query:` frontmatter on the user's note
 *   5. Insert `![[<view_file>]]` embed at editor cursor (CREATE only;
 *      UPDATE flow skips because the embed is already present)
 *
 * Returns a structured result so the caller (command in main.ts) can
 * surface Notices + emit categorized debug events without orchestration
 * knowledge.
 */

import type { App, Editor, TFile } from 'obsidian';
import type { DebugLog } from '../utils/debug';
import { renderRecipeTemplate } from './recipe-templates';
import { insertEmbedAtCursor } from './insert-base-block';
import {
	newQueryId,
	viewFileFor,
	type CrosswalkerQueryFrontmatter,
} from './query-frontmatter-schema';
import {
	readQueryFrontmatter,
	writeQueryFrontmatter,
	buildFrontmatter,
	updateFrontmatterParams,
} from './query-frontmatter-io';

export type ApplyResult =
	| {
			ok: true;
			action: 'created' | 'updated';
			queryId: string;
			viewFile: string;
			frontmatter: CrosswalkerQueryFrontmatter;
	  }
	| { ok: false; reason: 'no-active-file' | 'template-missing' | 'frontmatter-write-failed' | 'base-file-write-failed'; error?: string };

export interface ApplyOptions {
	/** The recipe ID (e.g. 'nist-csf-coverage-matrix'). */
	recipeId: string;
	/** The view shape (e.g. 'pivot'). Stored in frontmatter for Bases-queryability. */
	shape: string;
	/** User-edited param values (passed to the recipe template). */
	params: Record<string, unknown>;
	/** App context. */
	app: App;
	/** The user's note to apply the query to. */
	file: TFile;
	/** Editor for cursor-positioned embed insertion (null on UPDATE flow OK). */
	editor: Editor | null;
	/** Optional logger; events use category='view'. */
	debug?: DebugLog;
}

/**
 * Apply a recipe + params to a note. Handles both CREATE (note has no
 * `crosswalker_query:` block) and UPDATE (existing block — keep query_id and
 * view_file stable; rewrite params + regenerate `.base` content).
 */
export async function applyQueryToNote(options: ApplyOptions): Promise<ApplyResult> {
	const { app, file, editor, recipeId, shape, params, debug } = options;
	if (!file) {
		return { ok: false, reason: 'no-active-file' };
	}

	// 1. Decide CREATE vs UPDATE
	const existing = await readQueryFrontmatter(app, file);
	const isUpdate = existing.present && existing.data !== null;
	const queryId = isUpdate && existing.data ? existing.data.query_id : newQueryId();
	const viewFile = isUpdate && existing.data ? existing.data.view_file : viewFileFor(queryId);

	// 2. Generate .base file content via recipe template
	const baseBody = renderRecipeTemplate(recipeId, params);
	if (baseBody === null) {
		debug?.error('view', 'apply-no-template', `No template registered for recipe ${recipeId}`, {
			recipeId,
		});
		return { ok: false, reason: 'template-missing' };
	}

	const baseFileContent = buildBaseFileContent(baseBody, {
		recipeId,
		queryId,
		sourceNotePath: file.path,
	});

	// 3. Write .base file
	try {
		await writeBaseFile(app, viewFile, baseFileContent);
		debug?.info('view', 'query-base-file-written', `.base file written: ${viewFile}`, {
			viewFile,
			queryId,
		});
	} catch (err) {
		const msg = err instanceof Error ? err.message : String(err);
		debug?.error('view', 'base-file-write-failed', `Failed to write .base file: ${msg}`, {
			viewFile,
			error: msg,
		});
		return { ok: false, reason: 'base-file-write-failed', error: msg };
	}

	// 4. Write/update frontmatter
	const frontmatter: CrosswalkerQueryFrontmatter =
		isUpdate && existing.data
			? updateFrontmatterParams(existing.data, params, {
					recipeChanged: recipeId !== existing.data.recipe ? recipeId : undefined,
					shapeChanged: shape !== existing.data.shape ? shape : undefined,
			  })
			: buildFrontmatter({
					query_id: queryId,
					recipe: recipeId,
					shape,
					params,
					view_file: viewFile,
			  });

	const writeResult = await writeQueryFrontmatter(app, file, frontmatter);
	if (!writeResult.ok) {
		const errMsg = (writeResult.errors ?? []).join('; ');
		debug?.error('view', 'frontmatter-write-failed', `Frontmatter write failed: ${errMsg}`, {
			file: file.path,
			errors: writeResult.errors,
		});
		return { ok: false, reason: 'frontmatter-write-failed', error: errMsg };
	}

	// 5. Insert embed at cursor (CREATE flow only — UPDATE skips because the
	//    embed is already in the note OR insertEmbedAtCursor itself is idempotent)
	if (!isUpdate && editor) {
		const insertResult = insertEmbedAtCursor(editor, viewFile);
		if (!insertResult.ok) {
			debug?.warn('view', 'embed-insert-failed', `Embed insertion failed (frontmatter + .base file still written)`, {
				reason: insertResult.reason,
				error: insertResult.error,
			});
			// Don't fail the whole apply — frontmatter + .base file are still good
		}
	}

	debug?.info('view', 'query-applied', `Query ${isUpdate ? 'updated' : 'created'} (${recipeId})`, {
		action: isUpdate ? 'updated' : 'created',
		queryId,
		viewFile,
		recipeId,
		shape,
	});

	return {
		ok: true,
		action: isUpdate ? 'updated' : 'created',
		queryId,
		viewFile,
		frontmatter,
	};
}

/**
 * Build the full `.base` file content: comment header + Bases YAML body.
 * Exported for direct testing.
 */
export function buildBaseFileContent(
	yamlBody: string,
	context: { recipeId: string; queryId: string; sourceNotePath: string },
): string {
	const generatedAt = new Date().toISOString();
	const header = [
		`# Auto-generated by Crosswalker on ${generatedAt}`,
		`# Source note: ${context.sourceNotePath}`,
		`# Recipe: ${context.recipeId}`,
		`# Query ID: ${context.queryId}`,
		'#',
		'# Edit the source note\'s `crosswalker_query:` frontmatter to change this query.',
		'# To regenerate: run "Crosswalker: Refresh query views".',
		'# Manual edits to this file are overwritten on the next refresh.',
		'',
	].join('\n');
	return header + yamlBody + '\n';
}

/**
 * Write a `.base` file to the vault. Creates parent folders if needed.
 * Idempotent at the API level: creates if missing, modifies if existing.
 * The CALLER decides whether to write (don't write if content unchanged).
 */
async function writeBaseFile(app: App, vaultPath: string, content: string): Promise<void> {
	const existing = app.vault.getAbstractFileByPath(vaultPath);
	if (existing && 'path' in existing && typeof (existing as { extension?: string }).extension === 'string') {
		// existing is a TFile — modify
		await app.vault.modify(existing as TFile, content);
		return;
	}
	// New file — ensure parent folder, then create
	const parentPath = vaultPath.split('/').slice(0, -1).join('/');
	if (parentPath && !app.vault.getAbstractFileByPath(parentPath)) {
		try {
			await app.vault.createFolder(parentPath);
		} catch (err) {
			// Race-condition tolerance — another concurrent write may have created it
			const msg = err instanceof Error ? err.message : String(err);
			if (!msg.includes('already exists')) throw err;
		}
	}
	await app.vault.create(vaultPath, content);
}
