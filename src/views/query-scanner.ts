/**
 * query-scanner.ts — Phase 4.7
 *
 * Pure read function: scans `_crosswalker/queries/**\/index.md` for canonical
 * v2 query state. Returns a list of validated entries used by the Embed
 * picker (lightweight selector for inserting an embed in a host note) and
 * the Browse modal (full discovery surface for editing/deleting).
 *
 * Cheap by design — no template rendering, no Bases YAML processing.
 * Just frontmatter validation + file-path collection.
 */

import type { App, TFile } from 'obsidian';
import { readQueryFrontmatter } from './query-frontmatter-io';
import type { CrosswalkerQueryFrontmatter } from './query-frontmatter-schema';

const QUERY_FOLDER_PREFIX = '_crosswalker/queries/';

export interface QueryEntry {
	slug: string;
	queryId: string;
	recipe: string;
	shape: string;
	params: Record<string, unknown>;
	viewFile: string; // vault-relative path to view.base
	indexFile: string; // vault-relative path to index.md
	generatedAt: string;
}

/**
 * Scan the vault for canonical Layout B+ queries.
 * Returns entries sorted by generatedAt DESC (most recent first).
 */
export async function scanQueries(app: App): Promise<QueryEntry[]> {
	const entries: QueryEntry[] = [];
	const files = app.vault.getMarkdownFiles();
	for (const file of files) {
		if (!isCanonicalIndexPath(file.path)) continue;
		const fm = await readQueryFrontmatter(app, file);
		if (!fm.present || !fm.data) continue;
		entries.push(buildEntry(fm.data, file));
	}
	entries.sort((a, b) => (a.generatedAt < b.generatedAt ? 1 : -1));
	return entries;
}

function isCanonicalIndexPath(path: string): boolean {
	return path.startsWith(QUERY_FOLDER_PREFIX) && path.endsWith('/index.md');
}

function buildEntry(fm: CrosswalkerQueryFrontmatter, file: TFile): QueryEntry {
	return {
		slug: fm.slug,
		queryId: fm.query_id,
		recipe: fm.recipe,
		shape: fm.shape,
		params: fm.params,
		viewFile: fm.view_file,
		indexFile: file.path,
		generatedAt: fm.generated_at,
	};
}

/**
 * Format a one-line summary of params for display in pickers.
 * Example: `{confidence_threshold: 0.7, source: "nist-csf"}` → "confidence_threshold=0.7, source=nist-csf"
 */
export function formatParamsSummary(params: Record<string, unknown>): string {
	const keys = Object.keys(params);
	if (keys.length === 0) return '(no params)';
	const parts = keys.map((k) => {
		const v = params[k];
		if (typeof v === 'string') return `${k}="${v}"`;
		if (typeof v === 'number' || typeof v === 'boolean') return `${k}=${v}`;
		if (Array.isArray(v)) return `${k}=[${v.length}]`;
		return `${k}=…`;
	});
	return parts.join(', ');
}
