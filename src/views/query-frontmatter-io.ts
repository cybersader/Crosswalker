/**
 * query-frontmatter-io.ts — Phase 4.5
 *
 * Read + write the `crosswalker_query:` frontmatter block on user notes. Uses
 * Obsidian's `app.fileManager.processFrontMatter(file, cb)` — the canonical
 * safe API for frontmatter edits. processFrontMatter parses YAML, calls the
 * callback for mutation, then serializes back; safer than manual string
 * manipulation of the frontmatter delimiters.
 *
 * All three helpers validate against `query-frontmatter-schema.ts` AJV
 * schema. Invalid blocks are surfaced via structured ReadResult.errors so
 * the picker can show "starting fresh — existing block is malformed" Notice
 * + proceed with CREATE mode.
 */

import type { App, TFile } from 'obsidian';
import {
	validateQueryFrontmatter,
	QUERY_FRONTMATTER_SCHEMA_VERSION,
	type CrosswalkerQueryFrontmatter,
} from './query-frontmatter-schema';

/**
 * The frontmatter key the picker writes to. Renamed from 'crosswalker' →
 * 'crosswalker_query' (2026-05-16) to distinguish from the existing
 * `_crosswalker:` provenance block on imported concept/junction notes
 * (Phase 3 / Tier 1 schema) and to make the block's purpose explicit
 * (it's a QUERY definition, not generic plugin metadata).
 */
const BLOCK_KEY = 'crosswalker_query';

export interface ReadResult {
	/** True if the file has a `crosswalker_query:` block AT ALL (regardless of validity). */
	present: boolean;
	/** Validated block when present + valid. Otherwise null. */
	data: CrosswalkerQueryFrontmatter | null;
	/** Validation errors when the block is present but malformed. Empty otherwise. */
	errors: string[];
}

/**
 * Read the `crosswalker_query:` frontmatter block from a file. Returns structured
 * result distinguishing "no block" / "block present but invalid" / "valid".
 */
export async function readQueryFrontmatter(app: App, file: TFile): Promise<ReadResult> {
	// Prefer metadataCache if available — it's the fast path (already parsed).
	const cache = (app as unknown as { metadataCache?: { getFileCache?: (f: TFile) => { frontmatter?: Record<string, unknown> } | null } }).metadataCache;
	const fm = cache?.getFileCache?.(file)?.frontmatter ?? null;

	if (!fm || !(BLOCK_KEY in fm)) {
		return { present: false, data: null, errors: [] };
	}

	const raw = (fm as Record<string, unknown>)[BLOCK_KEY];
	const result = validateQueryFrontmatter(raw);
	if (!result.valid) {
		return { present: true, data: null, errors: result.errors };
	}
	return { present: true, data: raw as CrosswalkerQueryFrontmatter, errors: [] };
}

/**
 * True if the file has any `crosswalker_query:` block (valid or not). Cheap
 * detection used by the picker to decide CREATE vs UPDATE mode.
 */
export async function hasQueryFrontmatter(app: App, file: TFile): Promise<boolean> {
	const r = await readQueryFrontmatter(app, file);
	return r.present;
}

/**
 * Write (or update) the `crosswalker_query:` frontmatter block on a file.
 *
 * The block is validated BEFORE writing — invalid data is rejected with
 * structured errors, never persisted. This protects users from
 * malformed frontmatter that would break their notes.
 *
 * For UPDATE flow: only the fields you pass are changed. Pass the full
 * block to replace everything; pass a partial to merge.
 */
export async function writeQueryFrontmatter(
	app: App,
	file: TFile,
	data: CrosswalkerQueryFrontmatter,
): Promise<WriteResult> {
	// Validate before write
	const validation = validateQueryFrontmatter(data);
	if (!validation.valid) {
		return { ok: false, errors: validation.errors };
	}

	try {
		const fileManager = (app as unknown as {
			fileManager: { processFrontMatter: (f: TFile, cb: (fm: Record<string, unknown>) => void) => Promise<void> };
		}).fileManager;
		await fileManager.processFrontMatter(file, (fm: Record<string, unknown>) => {
			fm[BLOCK_KEY] = data;
		});
		return { ok: true };
	} catch (err) {
		return {
			ok: false,
			errors: [err instanceof Error ? err.message : String(err)],
		};
	}
}

export interface WriteResult {
	ok: boolean;
	errors?: string[];
}

/**
 * Build a fresh `CrosswalkerQueryFrontmatter` object for a NEW query (Phase 4.6 v2).
 * Caller provides slug + recipe + shape + params + view_file + a fresh query_id.
 * Convenience helper so the orchestrator doesn't have to assemble fields.
 */
export function buildFrontmatter(args: {
	query_id: string;
	slug: string;
	recipe: string;
	shape: string;
	params: Record<string, unknown>;
	view_file: string;
	now?: Date;
}): CrosswalkerQueryFrontmatter {
	return {
		query_id: args.query_id,
		slug: args.slug,
		recipe: args.recipe,
		shape: args.shape,
		params: args.params,
		view_file: args.view_file,
		generated_at: (args.now ?? new Date()).toISOString(),
		schema_version: QUERY_FRONTMATTER_SCHEMA_VERSION,
	};
}

/**
 * Update an existing `CrosswalkerQueryFrontmatter` with new params,
 * preserving the stable fields (query_id, recipe, view_file).
 * Returns a fresh object; doesn't mutate.
 */
export function updateFrontmatterParams(
	existing: CrosswalkerQueryFrontmatter,
	newParams: Record<string, unknown>,
	options: { recipeChanged?: string; shapeChanged?: string; now?: Date } = {},
): CrosswalkerQueryFrontmatter {
	return {
		...existing,
		params: newParams,
		recipe: options.recipeChanged ?? existing.recipe,
		shape: options.shapeChanged ?? existing.shape,
		generated_at: (options.now ?? new Date()).toISOString(),
	};
}
