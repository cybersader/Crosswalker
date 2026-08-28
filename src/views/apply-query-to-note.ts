/**
 * apply-query-to-note.ts — Phase 4.6 orchestrator (Layout B+).
 *
 * Single entry point for "apply this recipe + params":
 *   1. Decide CREATE vs UPDATE based on options.existingSlug (if provided)
 *   2. For CREATE: derive slug from recipe.name, detect collision; caller
 *      handles refuse-and-prompt (picker) or addCollisionSuffix (programmatic)
 *   3. Generate / regenerate `view.base` content via recipe-templates
 *   4. Write `_crosswalker/queries/<slug>/{index.md, view.base}`
 *   5. Insert `![[<slug>/view.base]]` embed at host-note cursor (CREATE only)
 *
 * Layout B+ change from Phase 4.5: canonical state moves OUT of the host note
 * (which is the note the user is editing) and INTO a per-query folder.
 * The host note gets only the embed; no `crosswalker_query:` frontmatter.
 *
 * Decision chain: synthesis log `2026-05-18-query-state-location-synthesis`.
 */

import type { App, Editor, TFile } from 'obsidian';
import type { DebugLog } from '../utils/debug';
import { renderRecipeTemplate } from './recipe-templates';
import { insertEmbedAtCursor } from './insert-base-block';
import {
	newQueryId,
	slugify,
	addCollisionSuffix,
	queryFolderFor,
	indexFileFor,
	viewFileFor,
	type CrosswalkerQueryFrontmatter,
} from './query-frontmatter-schema';
import {
	writeQueryFrontmatter,
	buildFrontmatter,
	updateFrontmatterParams,
	readQueryFrontmatter,
} from './query-frontmatter-io';

export type ApplyResult =
	| {
			ok: true;
			action: 'created' | 'updated';
			queryId: string;
			slug: string;
			viewFile: string;
			indexFile: string;
			frontmatter: CrosswalkerQueryFrontmatter;
	  }
	| { ok: false; reason: 'no-active-file' | 'template-missing' | 'frontmatter-write-failed' | 'base-file-write-failed' | 'slug-collision'; error?: string; existingSlug?: string };

export interface ApplyOptions {
	/** The recipe ID (e.g. 'nist-csf-coverage-matrix'). */
	recipeId: string;
	/** The recipe display name — used to derive the slug for CREATE. */
	recipeName?: string;
	/** The view shape (e.g. 'pivot'). */
	shape: string;
	/** User-edited param values. */
	params: Record<string, unknown>;
	/** App context. */
	app: App;
	/**
	 * The host note where the embed should be inserted. The plugin does NOT
	 * write to this note's frontmatter; only inserts the embed at cursor.
	 */
	file: TFile | null;
	/** Editor for cursor-positioned embed insertion. */
	editor: Editor | null;
	/**
	 * If provided, UPDATE that existing query at `_crosswalker/queries/<existingSlug>/`.
	 * If absent, CREATE a new query (deriving slug from recipeName).
	 */
	existingSlug?: string;
	/**
	 * Collision-resolution mode for CREATE flow:
	 *   - 'refuse': return ok=false reason='slug-collision' if slug exists; caller (picker) prompts user
	 *   - 'auto-suffix': append -<4hex> on collision (programmatic / agent path)
	 *   - 'force-new': force-create even if slug exists (caller-supplied override)
	 *   - undefined: defaults to 'refuse' (safest)
	 */
	collisionMode?: 'refuse' | 'auto-suffix' | 'force-new';
	/** Optional logger; events use category='view'. */
	debug?: DebugLog;
}

/**
 * Apply a recipe + params. CREATE writes a new per-query folder; UPDATE
 * regenerates the existing folder's contents preserving query_id + slug.
 */
export async function applyQueryToNote(options: ApplyOptions): Promise<ApplyResult> {
	const { app, file, editor, recipeId, recipeName, shape, params, existingSlug, collisionMode = 'refuse', debug } = options;

	// 1. Decide CREATE vs UPDATE
	const isUpdate = !!existingSlug;
	let slug: string;
	let queryId: string;
	let existingFrontmatter: CrosswalkerQueryFrontmatter | null = null;

	if (isUpdate) {
		// UPDATE path: read existing index.md to preserve query_id + slug
		const indexPath = indexFileFor(existingSlug!);
		const indexFile = app.vault.getAbstractFileByPath(indexPath);
		if (!indexFile || !('path' in indexFile)) {
			return { ok: false, reason: 'no-active-file', error: `Existing query folder missing: ${indexPath}` };
		}
		const fmResult = await readQueryFrontmatter(app, indexFile as TFile);
		if (!fmResult.present || !fmResult.data) {
			return { ok: false, reason: 'frontmatter-write-failed', error: `Existing query has malformed frontmatter: ${(fmResult.errors ?? []).join('; ')}` };
		}
		existingFrontmatter = fmResult.data;
		slug = existingFrontmatter.slug;
		queryId = existingFrontmatter.query_id;
	} else {
		// CREATE path: derive slug, detect collision
		queryId = newQueryId();
		const baseSlug = slugify(recipeName ?? recipeId, queryId);

		// Collision check
		const candidatePath = queryFolderFor(baseSlug);
		const existing = app.vault.getAbstractFileByPath(candidatePath);
		if (existing) {
			if (collisionMode === 'refuse') {
				return { ok: false, reason: 'slug-collision', existingSlug: baseSlug, error: `Query folder already exists at ${candidatePath}` };
			} else if (collisionMode === 'auto-suffix') {
				// Try up to 5 times to find a unique suffix
				let resolvedSlug = baseSlug;
				for (let i = 0; i < 5; i++) {
					resolvedSlug = addCollisionSuffix(baseSlug);
					if (!app.vault.getAbstractFileByPath(queryFolderFor(resolvedSlug))) {
						break;
					}
				}
				slug = resolvedSlug;
			} else {
				// force-new: caller takes responsibility — just write into the existing folder (will overwrite)
				slug = baseSlug;
			}
		} else {
			slug = baseSlug;
		}
	}

	const indexPath = indexFileFor(slug);
	const viewFilePath = viewFileFor(slug);

	// 2. Generate view.base content via recipe template
	const baseBody = renderRecipeTemplate(recipeId, params);
	if (baseBody === null) {
		debug?.error('view', 'apply-no-template', `No template registered for recipe ${recipeId}`, { recipeId });
		return { ok: false, reason: 'template-missing' };
	}

	const baseFileContent = buildBaseFileContent(baseBody, {
		recipeId,
		queryId,
		slug,
		sourceNotePath: file?.path ?? '(no source note)',
	});

	// 3. Write view.base
	try {
		await writeFile(app, viewFilePath, baseFileContent);
		debug?.info('view', 'query-base-file-written', `view.base written: ${viewFilePath}`, { viewFile: viewFilePath, queryId, slug });
	} catch (err) {
		const msg = err instanceof Error ? err.message : String(err);
		debug?.error('view', 'base-file-write-failed', `Failed to write view.base: ${msg}`, { viewFile: viewFilePath, error: msg });
		return { ok: false, reason: 'base-file-write-failed', error: msg };
	}

	// 4. Build + write index.md (canonical frontmatter)
	const frontmatter: CrosswalkerQueryFrontmatter =
		isUpdate && existingFrontmatter
			? updateFrontmatterParams(existingFrontmatter, params, {
					recipeChanged: recipeId !== existingFrontmatter.recipe ? recipeId : undefined,
					shapeChanged: shape !== existingFrontmatter.shape ? shape : undefined,
			  })
			: buildFrontmatter({ query_id: queryId, slug, recipe: recipeId, shape, params, view_file: viewFilePath });

	// Ensure index.md exists (with empty body) before processFrontMatter can write to it
	if (!isUpdate) {
		const indexExisting = app.vault.getAbstractFileByPath(indexPath);
		if (!indexExisting) {
			await writeFile(app, indexPath, buildIndexBody(frontmatter, slug));
		}
	}

	const indexFile = app.vault.getAbstractFileByPath(indexPath) as TFile | null;
	if (!indexFile) {
		return { ok: false, reason: 'frontmatter-write-failed', error: `index.md missing after creation: ${indexPath}` };
	}
	const writeResult = await writeQueryFrontmatter(app, indexFile, frontmatter);
	if (!writeResult.ok) {
		const errMsg = (writeResult.errors ?? []).join('; ');
		debug?.error('view', 'frontmatter-write-failed', `index.md frontmatter write failed: ${errMsg}`, { indexFile: indexPath, errors: writeResult.errors });
		return { ok: false, reason: 'frontmatter-write-failed', error: errMsg };
	}

	// 5. Insert embed at host-note cursor (CREATE only — UPDATE preserves existing embeds)
	if (!isUpdate && editor) {
		const insertResult = insertEmbedAtCursor(editor, viewFilePath);
		if (!insertResult.ok) {
			debug?.warn('view', 'embed-insert-failed', `Embed insertion failed (index.md + view.base still written)`, {
				reason: insertResult.reason,
				error: insertResult.error,
			});
		}
	}

	debug?.info('view', 'query-applied', `Query ${isUpdate ? 'updated' : 'created'} (${recipeId})`, {
		action: isUpdate ? 'updated' : 'created',
		queryId,
		slug,
		viewFile: viewFilePath,
		recipeId,
		shape,
	});

	return {
		ok: true,
		action: isUpdate ? 'updated' : 'created',
		queryId,
		slug,
		viewFile: viewFilePath,
		indexFile: indexPath,
		frontmatter,
	};
}

/**
 * Build the initial body of `index.md`. Frontmatter is added by
 * processFrontMatter later — this just establishes the file with a default
 * body that transcludes view.base so opening the folder note shows the query.
 */
export function buildIndexBody(_frontmatter: CrosswalkerQueryFrontmatter, slug: string): string {
	return [
		'',
		`# ${slug}`,
		'',
		'<!-- This is the canonical state for a Crosswalker query.',
		'     Edit the frontmatter (via the Crosswalker picker or hand-edit) to change params.',
		'     Run "Crosswalker: Maintenance: refresh saved query views" to regenerate view.base. -->',
		'',
		`![[${slug}/view.base]]`,
		'',
	].join('\n');
}

/**
 * Build the full `view.base` file content: comment header + Bases YAML body.
 * Exported for direct testing.
 */
export function buildBaseFileContent(
	yamlBody: string,
	context: { recipeId: string; queryId: string; slug: string; sourceNotePath: string },
): string {
	const generatedAt = new Date().toISOString();
	const header = [
		`# Auto-generated by Crosswalker on ${generatedAt}`,
		`# Slug: ${context.slug}`,
		`# Query ID: ${context.queryId}`,
		`# Recipe: ${context.recipeId}`,
		`# Source note (where embed was inserted): ${context.sourceNotePath}`,
		'#',
		`# Edit the canonical state at _crosswalker/queries/${context.slug}/index.md`,
		'# To regenerate: run "Crosswalker: Maintenance: refresh saved query views".',
		'# Manual edits to this file are overwritten on the next refresh.',
		'',
	].join('\n');
	return header + yamlBody + '\n';
}

/**
 * Write a file (create or modify). Creates parent folders if needed. Idempotent.
 */
async function writeFile(app: App, vaultPath: string, content: string): Promise<void> {
	const existing = app.vault.getAbstractFileByPath(vaultPath);
	if (existing && 'path' in existing && typeof (existing as { extension?: string }).extension === 'string') {
		await app.vault.modify(existing as TFile, content);
		return;
	}
	const parentPath = vaultPath.split('/').slice(0, -1).join('/');
	if (parentPath && !app.vault.getAbstractFileByPath(parentPath)) {
		try {
			await app.vault.createFolder(parentPath);
		} catch (err) {
			const msg = err instanceof Error ? err.message : String(err);
			if (!msg.includes('already exists')) throw err;
		}
	}
	await app.vault.create(vaultPath, content);
}
