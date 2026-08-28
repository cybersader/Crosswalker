/**
 * materialize.ts — Phase 5 materialization writer.
 *
 * Writes a snapshot of a query's resolved result to disk at
 * `_crosswalker/queries/<slug>/materialized/result.json`, plus a sibling
 * `stale.flag` removed on success (presence = "needs re-materialization").
 *
 * Shape-agnostic: serializes whatever the caller passes. Pivot today; the
 * same writer will be reused for table / list / hierarchy shapes in v0.1.7+.
 * The per-query folder layout (Layout B+, synthesis log 2026-05-18) makes
 * this trivial — derivative artifacts have a stable home.
 *
 * NOT called on every render — explicit opt-in via the
 * `Crosswalker: Explore data: save a snapshot of the current query`
 * command. Default browse stays live.
 * Per Ch 32 deliverable B: materialization is the audit/share path, not
 * the default browse path.
 */

import type { App, TFile } from 'obsidian';
import type { DebugLog } from '../utils/debug';
import { queryFolderFor, indexFileFor } from './query-frontmatter-schema';
import { readQueryFrontmatter } from './query-frontmatter-io';

export interface MaterializeResult {
	ok: boolean;
	slug: string;
	resultPath: string;
	bytesWritten: number;
	error?: string;
}

export interface MaterializePayload {
	slug: string;
	queryId: string;
	recipe: string;
	shape: string;
	/** Free-form resolved result (e.g. PivotGridResult, TableRows[], HierarchyTree, etc.). */
	data: unknown;
	/** Optional metadata: source hash, row count, timing, anything useful for audit. */
	metadata?: Record<string, unknown>;
}

/**
 * Write a materialized snapshot for a query. Caller provides the resolved
 * shape-specific data (the view computed it and is sharing back). Writer
 * is shape-agnostic.
 */
export async function materializeQuery(
	app: App,
	payload: MaterializePayload,
	debug?: DebugLog,
): Promise<MaterializeResult> {
	const folder = queryFolderFor(payload.slug);
	const matFolder = `${folder}/materialized`;
	const resultPath = `${matFolder}/result.json`;
	const stalePath = `${matFolder}/stale.flag`;

	try {
		// Ensure materialized/ folder exists
		if (!app.vault.getAbstractFileByPath(matFolder)) {
			try {
				await app.vault.createFolder(matFolder);
			} catch (err) {
				const msg = err instanceof Error ? err.message : String(err);
				if (!msg.includes('already exists')) throw err;
			}
		}

		// Serialize payload as JSON with stable key order + 2-space indent (git-diff-friendly)
		const json = serializeStable({
			schema_version: 1,
			materialized_at: new Date().toISOString(),
			query_id: payload.queryId,
			slug: payload.slug,
			recipe: payload.recipe,
			shape: payload.shape,
			metadata: payload.metadata ?? {},
			data: payload.data,
		});

		// Write or overwrite result.json
		const existing = app.vault.getAbstractFileByPath(resultPath);
		if (existing && 'path' in existing) {
			await app.vault.modify(existing as TFile, json);
		} else {
			await app.vault.create(resultPath, json);
		}

		// Remove stale.flag on success (absence = fresh)
		const stale = app.vault.getAbstractFileByPath(stalePath);
		if (stale && 'path' in stale) {
			try {
				await app.vault.delete(stale, true);
			} catch {
				// Non-fatal; the flag is just a cache marker
			}
		}

		debug?.info('view', 'query-materialized', `Materialized snapshot written`, {
			slug: payload.slug,
			resultPath,
			bytes: json.length,
		});

		return { ok: true, slug: payload.slug, resultPath, bytesWritten: json.length };
	} catch (err) {
		const msg = err instanceof Error ? err.message : String(err);
		debug?.error('view', 'materialize-failed', `Materialization failed: ${msg}`, {
			slug: payload.slug,
			error: msg,
		});
		return { ok: false, slug: payload.slug, resultPath, bytesWritten: 0, error: msg };
	}
}

/**
 * Mark a query's materialized snapshot as stale (writes the stale.flag).
 * Called when the source data changes — viewer can show "results may be
 * out of date" or trigger re-materialize. v0.1.7+ refinement.
 */
export async function markStale(app: App, slug: string): Promise<void> {
	const folder = queryFolderFor(slug);
	const matFolder = `${folder}/materialized`;
	const stalePath = `${matFolder}/stale.flag`;
	if (!app.vault.getAbstractFileByPath(matFolder)) {
		// No materialized snapshot exists — nothing to mark stale
		return;
	}
	if (!app.vault.getAbstractFileByPath(stalePath)) {
		await app.vault.create(stalePath, new Date().toISOString());
	}
}

/**
 * Look up a query by slug via the canonical index.md. Returns the validated
 * frontmatter or null if the query doesn't exist or is malformed. Used by
 * the materialize command to find the recipe/params before rendering.
 */
export async function lookupQuery(
	app: App,
	slug: string,
): Promise<{ queryId: string; recipe: string; shape: string; params: Record<string, unknown> } | null> {
	const indexPath = indexFileFor(slug);
	const indexFile = app.vault.getAbstractFileByPath(indexPath);
	if (!indexFile || !('path' in indexFile)) return null;
	const fm = await readQueryFrontmatter(app, indexFile as TFile);
	if (!fm.present || !fm.data) return null;
	return {
		queryId: fm.data.query_id,
		recipe: fm.data.recipe,
		shape: fm.data.shape,
		params: fm.data.params,
	};
}

/**
 * Deterministic JSON serializer — sorts object keys alphabetically.
 * Makes materialized output git-diff-friendly. Arrays preserve order.
 */
function serializeStable(value: unknown): string {
	return JSON.stringify(value, sortedReplacer, 2) + '\n';
}

function sortedReplacer(_key: string, value: unknown): unknown {
	if (value === null || typeof value !== 'object' || Array.isArray(value)) return value;
	const sorted: Record<string, unknown> = {};
	for (const k of Object.keys(value as Record<string, unknown>).sort()) {
		sorted[k] = (value as Record<string, unknown>)[k];
	}
	return sorted;
}
