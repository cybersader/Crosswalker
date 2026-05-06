/**
 * Tier 2 projector — reads Tier 1 Markdown frontmatter, populates the
 * SQLite sidecar tables.
 *
 * Per the [v0.1 schema spec §7 projection rules](https://cybersader.github.io/crosswalker/agent-context/v0-1-schema-spec/#7-tier-2-sidecar-sql-schema-sqlite-wasm-projection)
 * + the [system architecture page Layer 3](https://cybersader.github.io/crosswalker/concepts/system-architecture/#layer-3--projection-t1--t2):
 *
 *   1. Walks the vault's `.md` files via Obsidian's metadataCache (no
 *      filesystem reads — frontmatter parsed once at vault load)
 *   2. Skips files without `_crosswalker` (not produced by Crosswalker)
 *   3. Dispatches by `kind`:
 *        - default / 'concept' → upsert into `concepts`
 *        - 'junction-note'     → upsert into `junction_notes`
 *        - 'crosswalk-edge'    → upsert into `mappings`
 *   4. Cooperative yielding every N files (default 50) so UI doesn't freeze
 *
 * Recovery property (Ch 24 §2): if Tier 2 is missing/corrupted/stale, the
 * projector rebuilds it from canonical Tier 1. This module is what makes
 * that property real.
 *
 * Idempotent: re-running on an unchanged vault is a no-op (INSERT OR REPLACE
 * keyed on vault_path / curie).
 */

import { App, TFile } from 'obsidian';
import { DebugLog } from '../utils/debug';

/**
 * Result of a projection pass. Counts per Tier 2 table + skipped (files
 * without `_crosswalker`) + errors.
 */
export interface ProjectionResult {
	success: boolean;
	counts: {
		concepts: number;
		mappings: number;
		junction_notes: number;
		ontologies: number;
		skipped: number;
		errors: number;
	};
	errors: Array<{ vault_path: string; message: string }>;
	durationMs: number;
}

export interface ProjectionOptions {
	/** Cooperative-yield interval in files. Default 50. */
	yieldEvery?: number;
	/** Optional debug logger. */
	debug?: DebugLog;
	/**
	 * Restrict projection to files matching this path-prefix predicate.
	 * Default: all .md files in the vault.
	 */
	pathFilter?: (path: string) => boolean;
}

/**
 * Project Tier 1 frontmatter into the Tier 2 SQLite sidecar.
 *
 * - `db` is the sqlite-wasm OO1 DB handle from `openSidecar()`.
 * - Walks `app.vault.getMarkdownFiles()` lazily (one file at a time;
 *   never accumulates the full vault state in RAM).
 * - Per-file frontmatter via `app.metadataCache.getFileCache(file)?.frontmatter`.
 *
 * Returns counts + errors for the caller to surface (Notice / debug log).
 */
export async function projectFromTier1(
	app: App,
	db: any,
	options: ProjectionOptions = {},
): Promise<ProjectionResult> {
	const startMs = Date.now();
	const yieldEvery = options.yieldEvery ?? 50;
	const result: ProjectionResult = {
		success: true,
		counts: {
			concepts: 0,
			mappings: 0,
			junction_notes: 0,
			ontologies: 0,
			skipped: 0,
			errors: 0,
		},
		errors: [],
		durationMs: 0,
	};

	await options.debug?.log('projectFromTier1: starting');

	// Pre-prepare statements (sqlite-wasm OO1 supports prepared statements
	// via db.prepare; using db.exec with parameter binding is also fine).
	// We use db.exec with $-prefixed bind params for simplicity.

	// Track ontologies seen so we don't issue redundant upserts
	const ontologiesSeen = new Set<string>();

	const files = app.vault.getMarkdownFiles();
	const filtered = options.pathFilter ? files.filter((f) => options.pathFilter!(f.path)) : files;

	let i = 0;
	for (const file of filtered) {
		i += 1;

		// Cooperative yield every N files
		if (i % yieldEvery === 0) {
			await new Promise<void>((r) => setTimeout(r, 0));
		}

		try {
			const fm = readFrontmatter(app, file);
			if (!fm) {
				result.counts.skipped += 1;
				continue;
			}
			if (!fm._crosswalker) {
				// Not produced by Crosswalker; skip silently
				result.counts.skipped += 1;
				continue;
			}

			// Dispatch by kind
			const kind = typeof fm.kind === 'string' ? fm.kind : 'concept';

			if (kind === 'junction-note') {
				upsertJunctionNote(db, file, fm);
				result.counts.junction_notes += 1;
			} else if (kind === 'crosswalk-edge') {
				// Crosswalk-edges span two ontologies — register both subject + object
				ensureOntologyForKind(db, fm, ontologiesSeen, file.path, 'crosswalk-edge');
				upsertMapping(db, file, fm);
				result.counts.mappings += 1;
			} else {
				// default / 'concept'
				ensureOntologyForKind(db, fm, ontologiesSeen, file.path, 'concept');
				upsertConcept(db, file, fm);
				result.counts.concepts += 1;
			}
		} catch (err) {
			const msg = err instanceof Error ? err.message : String(err);
			result.errors.push({ vault_path: file.path, message: msg });
			result.counts.errors += 1;
			await options.debug?.log('projection row error', { path: file.path, error: msg });
		}
	}

	// If any mappings were written, invalidate the closure cache (Ch 18 §2.5)
	if (result.counts.mappings > 0) {
		try {
			db.exec('DELETE FROM closure_cache');
		} catch (err) {
			// Non-fatal — closure_cache may not exist if migrations haven't run
			await options.debug?.log('closure_cache invalidate failed (non-fatal)', {
				error: err instanceof Error ? err.message : String(err),
			});
		}
	}

	// Final ontology count is from the seen-set
	result.counts.ontologies = ontologiesSeen.size;

	if (result.errors.length > 0) {
		result.success = false;
	}

	result.durationMs = Date.now() - startMs;

	await options.debug?.log('projectFromTier1: complete', {
		success: result.success,
		counts: result.counts,
		duration_ms: result.durationMs,
	});

	return result;
}

// ============================================================================
// Per-kind upsert helpers
// ============================================================================

function upsertConcept(db: any, file: TFile, fm: Record<string, any>): void {
	const ontologyId = deriveConceptOntologyId(fm);
	const curie = String(fm.curie ?? '').trim();
	if (!curie) {
		throw new Error(`concept-note frontmatter missing required 'curie' field`);
	}

	const title = String(fm.title ?? '');
	const parentCurie = extractParentCurie(fm.parent);
	const status = typeof fm.status === 'string' ? fm.status : 'active';
	const sourceHash = hashFrontmatter(fm);
	const importedAt = extractProducedAt(fm) ?? new Date().toISOString();
	const modifiedAt = new Date(file.stat.mtime).toISOString();

	db.exec({
		sql: `
			INSERT OR REPLACE INTO concepts
				(ontology_id, curie, vault_path, source_hash, title, parent_curie, status, imported_at, modified_at)
			VALUES ($ontology_id, $curie, $vault_path, $source_hash, $title, $parent_curie, $status, $imported_at, $modified_at)
		`,
		bind: {
			$ontology_id: ontologyId,
			$curie: curie,
			$vault_path: file.path,
			$source_hash: sourceHash,
			$title: title,
			$parent_curie: parentCurie,
			$status: status,
			$imported_at: importedAt,
			$modified_at: modifiedAt,
		},
	});
}

function upsertJunctionNote(db: any, file: TFile, fm: Record<string, any>): void {
	const curie = String(fm.curie ?? '').trim();
	if (!curie) {
		throw new Error(`junction-note frontmatter missing required 'curie' field`);
	}
	const subject = String(fm.subject ?? '');
	const predicate = String(fm.predicate ?? '');
	const object = String(fm.object ?? '');
	if (!subject || !predicate || !object) {
		throw new Error(`junction-note missing required subject/predicate/object`);
	}

	const sourceHash = hashFrontmatter(fm);
	const modifiedAt = new Date(file.stat.mtime).toISOString();

	db.exec({
		sql: `
			INSERT OR REPLACE INTO junction_notes
				(vault_path, curie, subject, predicate, object, coverage, reviewer, review_date, status, confidence, scope, expires_at, notes, source_hash, modified_at)
			VALUES ($vault_path, $curie, $subject, $predicate, $object, $coverage, $reviewer, $review_date, $status, $confidence, $scope, $expires_at, $notes, $source_hash, $modified_at)
		`,
		bind: {
			$vault_path: file.path,
			$curie: curie,
			$subject: subject,
			$predicate: predicate,
			$object: object,
			$coverage: stringOrNull(fm.coverage),
			$reviewer: stringOrNull(fm.reviewer),
			$review_date: stringOrNull(fm.review_date),
			$status: stringOrNull(fm.status),
			$confidence: numberOrNull(fm.confidence),
			$scope: stringOrNull(fm.scope),
			$expires_at: stringOrNull(fm.expires_at),
			$notes: stringOrNull(fm.notes),
			$source_hash: sourceHash,
			$modified_at: modifiedAt,
		},
	});
}

function upsertMapping(db: any, file: TFile, fm: Record<string, any>): void {
	const subjectId = String(fm.subject_id ?? '').trim();
	const predicateId = String(fm.predicate_id ?? '').trim();
	const objectId = String(fm.object_id ?? '').trim();
	if (!subjectId || !predicateId || !objectId) {
		throw new Error(`crosswalk-edge missing required subject_id/predicate_id/object_id`);
	}

	const sourceHash = hashFrontmatter(fm);

	// Mappings is keyed on source_path (UNIQUE constraint) so re-running
	// over the same .md file replaces in place. The auto-increment id
	// rolls over for true new rows; in INSERT OR REPLACE mode SQLite
	// re-uses the existing id when source_path matches.
	db.exec({
		sql: `
			INSERT OR REPLACE INTO mappings
				(subject_id, predicate_id, object_id, match_type, match_confidence, mapping_justification, mapping_provider, mapping_date, creator_id, review_status, source_path, source_hash)
			VALUES ($subject_id, $predicate_id, $object_id, $match_type, $match_confidence, $mapping_justification, $mapping_provider, $mapping_date, $creator_id, $review_status, $source_path, $source_hash)
		`,
		bind: {
			$subject_id: subjectId,
			$predicate_id: predicateId,
			$object_id: objectId,
			$match_type: stringOrNull(fm.match_type),
			$match_confidence: numberOrNull(fm.match_confidence),
			$mapping_justification: stringOrNull(fm.mapping_justification),
			$mapping_provider: stringOrNull(fm.mapping_provider),
			$mapping_date: stringOrNull(fm.mapping_date),
			$creator_id: stringOrNull(fm.creator_id),
			$review_status: stringOrNull(fm.review_status),
			$source_path: file.path,
			$source_hash: sourceHash,
		},
	});
}

/**
 * Ensure ontology row(s) exist for the given frontmatter, kind-aware:
 *   - 'concept' → register the concept's own ontology (from fm.curie prefix)
 *   - 'crosswalk-edge' → register BOTH subject + object ontologies
 *
 * Idempotent — INSERT OR IGNORE so existing ontologies aren't clobbered.
 * Placeholder name/version/base_path/recipe_id — fully populated in a
 * future milestone when the projector also walks ImportRecipe metadata.
 */
function ensureOntologyForKind(
	db: any,
	fm: Record<string, any>,
	seen: Set<string>,
	vaultPath: string,
	kind: 'concept' | 'crosswalk-edge',
): void {
	const ids: string[] = [];
	if (kind === 'concept') {
		const id = deriveConceptOntologyId(fm);
		if (id) ids.push(id);
	} else if (kind === 'crosswalk-edge') {
		const subjectId = curiePrefix(fm.subject_id);
		const objectId = curiePrefix(fm.object_id);
		if (subjectId) ids.push(subjectId);
		if (objectId) ids.push(objectId);
	}

	const importedAt = extractProducedAt(fm) ?? new Date().toISOString();
	const basePath = derivePathPrefix(vaultPath);

	for (const id of ids) {
		if (seen.has(id)) continue;
		db.exec({
			sql: `
				INSERT OR IGNORE INTO ontologies
					(id, name, version, base_path, upstream_url, recipe_id, imported_at, control_count)
				VALUES ($id, $name, $version, $base_path, $upstream_url, $recipe_id, $imported_at, 0)
			`,
			bind: {
				$id: id,
				$name: id,
				$version: '',
				$base_path: basePath,
				$upstream_url: null,
				$recipe_id: id,
				$imported_at: importedAt,
			},
		});
		seen.add(id);
	}
}

// ============================================================================
// Frontmatter helpers
// ============================================================================

/**
 * Read frontmatter via Obsidian's metadataCache. Strips the internal
 * `position` key which is not part of the user-visible YAML.
 */
function readFrontmatter(app: App, file: TFile): Record<string, any> | null {
	const cache = app.metadataCache.getFileCache(file);
	const fm = cache?.frontmatter;
	if (!fm || typeof fm !== 'object') return null;
	const out: Record<string, any> = {};
	for (const [k, v] of Object.entries(fm)) {
		if (k !== 'position') out[k] = v;
	}
	return out;
}

/**
 * Derive the ontology_id for a concept-note. Prefers the concept's own
 * `fm.curie` prefix because the concept's identity is more authoritative
 * than `_crosswalker.source_ref.curie` (which can be the fallback
 * 'unknown:_' when no source-ref keys are present at write time).
 *
 * Strategy:
 *   1. `fm.curie` prefix (concept's identity) — e.g., 'nist:AC-2' → 'nist'
 *   2. `_crosswalker.source_ref.curie` prefix — provenance fallback
 *   3. 'unknown' if neither yields a CURIE
 */
function deriveConceptOntologyId(fm: Record<string, any>): string {
	const fromCurie = curiePrefix(fm.curie);
	if (fromCurie) return fromCurie;
	const sourceCurie = curiePrefix(fm._crosswalker?.source_ref?.curie);
	if (sourceCurie) return sourceCurie;
	return 'unknown';
}

/**
 * Extract the prefix from a CURIE-shaped string, or null if the input
 * doesn't have a colon-separated prefix.
 */
function curiePrefix(value: unknown): string | null {
	if (typeof value !== 'string') return null;
	const idx = value.indexOf(':');
	if (idx <= 0) return null;
	return value.slice(0, idx);
}

/**
 * Extract a parent CURIE if `fm.parent` is a CURIE-shaped string.
 * For wikilink-target form (`[[Frameworks/.../X]]`), returns null in v0.1.5
 * Phase 2 — wikilink resolution requires looking up target file's frontmatter
 * which is a future enhancement.
 */
function extractParentCurie(parent: unknown): string | null {
	if (typeof parent !== 'string') return null;
	const trimmed = parent.trim();
	// Bare CURIE shape: prefix:local
	if (/^[a-z][a-z0-9_-]*:[A-Za-z0-9._\-()/]+$/.test(trimmed)) {
		return trimmed;
	}
	return null;
}

/**
 * Extract the imported_at timestamp from `_crosswalker.produced_at`,
 * falling back to null if not present.
 */
function extractProducedAt(fm: Record<string, any>): string | null {
	const t = fm._crosswalker?.produced_at;
	return typeof t === 'string' ? t : null;
}

/**
 * Derive the path prefix (everything before the filename) for use as
 * an ontology base_path. Used as a placeholder until recipe metadata
 * is walked.
 */
function derivePathPrefix(vaultPath: string): string {
	const lastSlash = vaultPath.lastIndexOf('/');
	if (lastSlash === -1) return '';
	return vaultPath.slice(0, lastSlash);
}

/**
 * Compute a deterministic content hash of frontmatter. Excludes
 * `_crosswalker.produced_at` (varies per import) so re-imports of
 * unchanged source data produce stable hashes.
 *
 * Synchronous Web Crypto isn't available in the renderer, so we use
 * a non-cryptographic FNV-1a hash. Source-hash collisions are not
 * security-critical here — this is for change detection, not integrity.
 * (Cryptographic hashes for the audit trail are a v0.1.8 concern.)
 */
function hashFrontmatter(fm: Record<string, any>): string {
	const stable = stripVolatile(fm);
	const json = canonicalJson(stable);
	return 'fnv1a-' + fnv1a32(json).toString(16).padStart(8, '0');
}

function stripVolatile(fm: Record<string, any>): Record<string, any> {
	const out: Record<string, any> = {};
	for (const [k, v] of Object.entries(fm)) {
		if (k === '_crosswalker' && v && typeof v === 'object') {
			const { produced_at: _omit, ...rest } = v as Record<string, any>;
			out[k] = rest;
		} else {
			out[k] = v;
		}
	}
	return out;
}

/**
 * Canonical JSON serialization with sorted keys at every nesting level.
 * Deterministic across runs.
 */
function canonicalJson(value: unknown): string {
	if (value === null || value === undefined) return JSON.stringify(value);
	if (typeof value !== 'object') return JSON.stringify(value);
	if (Array.isArray(value)) return '[' + value.map(canonicalJson).join(',') + ']';
	const keys = Object.keys(value as Record<string, unknown>).sort();
	return (
		'{' +
		keys
			.map((k) => JSON.stringify(k) + ':' + canonicalJson((value as Record<string, unknown>)[k]))
			.join(',') +
		'}'
	);
}

/**
 * 32-bit FNV-1a hash. Non-cryptographic; used only for change detection.
 */
function fnv1a32(s: string): number {
	let h = 2166136261;
	for (let i = 0; i < s.length; i++) {
		h ^= s.charCodeAt(i);
		h = Math.imul(h, 16777619);
	}
	return h >>> 0;
}

// ============================================================================
// Type coercion helpers
// ============================================================================

function stringOrNull(v: unknown): string | null {
	if (v === undefined || v === null || v === '') return null;
	return String(v);
}

function numberOrNull(v: unknown): number | null {
	if (v === undefined || v === null || v === '') return null;
	const n = Number(v);
	return Number.isFinite(n) ? n : null;
}
