/**
 * sssom-importer.ts — Phase 2 v0.1.6 (per Ch 35)
 *
 * Orchestrates SSSOM TSV import: reads file → parses → builds a synthetic
 * crosswalk-edge recipe → calls generateFromRecipe → triggers eager closure
 * precomputation in the Tier 2 sidecar.
 *
 * Architecture:
 *   Phase 1 (this importer):  TSV → SssomParseResult
 *   Phase 2 (synthetic recipe): SssomParseResult → Recipe (crosswalk-edge layout)
 *   Phase 3 (generation):     generateFromRecipe writes one .md per row to
 *                             _crosswalker/mappings/<source>-to-<target>/
 *   Phase 4 (Tier 2):         The plugin's auto-projection (per v0.1.5 P4)
 *                             picks up new junction-edge files on next run;
 *                             we ALSO trigger an immediate projection pass
 *                             so the user can query the imported data right
 *                             after import without waiting for layout-ready.
 *   Phase 5 (closure):        After mappings populate, eagerly precompute
 *                             closure for the imported (source, target)
 *                             ontology pair (per Ch 35 — "every production
 *                             ontology-web system materializes precomputed
 *                             pairwise crosswalks").
 *
 * Engine-neutrality: this importer composes existing primitives (parser,
 * recipe-driven generation, sidecar projector, closure helper). No SSSOM
 * logic leaks into Tier 2 schema or query helpers — `mappings` table is
 * already SSSOM-shaped per v0.1.5 P3.
 */

import type { App } from 'obsidian';
import type { ParsedData, GenerationResult } from '../types/config';
import { generateFromRecipe } from '../generation/generation-engine';
import type { Recipe } from '../render';
import type { DebugLog } from '../utils/debug';
import {
	parseSssomTsv,
	detectOntologyPair,
	type SssomParseResult,
	type SssomRow,
} from './sssom-parser';

/** Options accepted by importSssom(). */
export interface SssomImportOptions {
	/** Vault-relative folder for generated junction-edge notes.
	 *  Default: `_crosswalker/mappings/<source>-to-<target>/`. */
	outputFolder?: string;
	/** Override the source ontology id (default: detected from TSV header or first-row prefix). */
	sourceOntology?: string;
	/** Override the target ontology id. */
	targetOntology?: string;
	/** How to handle existing files. Default: 'replace' (idempotent re-imports). */
	overwriteMode?: 'skip' | 'replace' | 'error';
	/** Whether to trigger Tier 2 projection + closure precompute after generation.
	 *  Default: true. Pass false in tests that don't have a sidecar handle. */
	runTier2Projection?: boolean;
	/** Optional progress callback. */
	onProgress?: (current: number, total: number, message: string) => void;
}

/** Composite result of an SSSOM import: parse result + generation result. */
export interface SssomImportResult {
	parse: SssomParseResult;
	generation: GenerationResult | null;
	source: string | null;
	target: string | null;
	folder: string | null;
	skipped?: 'parse-error' | 'no-rows';
}

/**
 * Run an end-to-end SSSOM import: parse → generate → project → precompute closure.
 *
 * Errors flow through SssomImportResult; this function does NOT throw on
 * parse errors or generation errors (it returns them in the result so the
 * UI layer can render structured feedback).
 */
export async function importSssom(
	app: App,
	tsvContent: string,
	pluginRunProjection: (() => Promise<unknown>) | null,
	pluginPrecomputeClosure: ((sourceOnt: string, targetOnt: string) => Promise<number>) | null,
	options: SssomImportOptions = {},
	debug?: DebugLog,
): Promise<SssomImportResult> {
	// Phase 3.5c: thread a trace_id through the SSSOM import flow so the whole
	// pipeline (parse → ontology detection → synthetic recipe → generateFromRecipe
	// → Tier 2 projection → closure precompute) is correlatable via one grep.
	// If the caller already set a trace (e.g. via plugin.runImport), we reuse it.
	const existingTrace = debug?.currentTraceId();
	if (existingTrace) {
		return runImportSssom(app, tsvContent, pluginRunProjection, pluginPrecomputeClosure, options, debug);
	}
	const traceId = debug?.newTraceId();
	if (!debug || !traceId) {
		return runImportSssom(app, tsvContent, pluginRunProjection, pluginPrecomputeClosure, options, debug);
	}
	return debug.withTrace(traceId, () =>
		runImportSssom(app, tsvContent, pluginRunProjection, pluginPrecomputeClosure, options, debug),
	);
}

async function runImportSssom(
	app: App,
	tsvContent: string,
	pluginRunProjection: (() => Promise<unknown>) | null,
	pluginPrecomputeClosure: ((sourceOnt: string, targetOnt: string) => Promise<number>) | null,
	options: SssomImportOptions = {},
	debug?: DebugLog,
): Promise<SssomImportResult> {
	const result: SssomImportResult = {
		parse: { header: {}, rows: [], warnings: [], errors: [] },
		generation: null,
		source: null,
		target: null,
		folder: null,
	};

	// ----- Phase 1: Parse -----
	const parsed = parseSssomTsv(tsvContent);
	result.parse = parsed;
	if (parsed.errors.length > 0) {
		result.skipped = 'parse-error';
		debug?.error('sssom-import', 'parse-aborted', 'SSSOM import aborted: parse errors', { errors: parsed.errors });
		return result;
	}
	if (parsed.rows.length === 0) {
		result.skipped = 'no-rows';
		debug?.warn('sssom-import', 'no-rows', 'SSSOM import aborted: no rows');
		return result;
	}

	// ----- Phase 2: Detect ontology pair -----
	const detected = detectOntologyPair(parsed);
	const source = options.sourceOntology ?? detected?.source;
	const target = options.targetOntology ?? detected?.target;
	if (!source || !target) {
		parsed.errors.push(
			'Could not detect SSSOM ontology pair. Add subject_source/object_source to the header or use CURIE prefixes.',
		);
		result.skipped = 'parse-error';
		return result;
	}
	result.source = source;
	result.target = target;

	const folder = options.outputFolder ?? `_crosswalker/mappings/${source}-to-${target}`;
	result.folder = folder;

	debug?.info('sssom-import', 'pair-detected', `SSSOM ontology pair: ${source} → ${target}`, {
		source,
		target,
		folder,
		rowCount: parsed.rows.length,
	});

	// ----- Phase 3: Build synthetic recipe + run generateFromRecipe -----
	const recipe = buildSyntheticRecipe(source, target, folder);
	// Inject set-level metadata from header into every row so managed-frontmatter
	// templates referencing mapping_set_id / mapping_provider / mapping_date can
	// resolve. SSSOM puts these at the mapping-set level, not per-row, so we
	// fan them out here. Per-row values (if present) take precedence.
	const setLevelDefaults: Record<string, unknown> = {
		mapping_set_id: typeof parsed.header.mapping_set_id === 'string' ? parsed.header.mapping_set_id : '',
		mapping_provider:
			typeof parsed.header.mapping_provider === 'string' ? parsed.header.mapping_provider : '',
		mapping_date: typeof parsed.header.mapping_date === 'string' ? parsed.header.mapping_date : '',
	};
	const rowsForRecipe = parsed.rows.map((row) => {
		const record = rowToRecord(row);
		// Normalize SSSOM/SKOS predicate → STRM for the Tier 1-validated `predicate_id`
		// frontmatter field. Preserve the original SSSOM predicate as `sssom_predicate`.
		const sssomPred = String(record.predicate_id ?? '');
		const { strm, warning } = normalizePredicate(sssomPred);
		if (warning) {
			parsed.warnings.push(warning);
		}
		return {
			...setLevelDefaults,
			...record,
			sssom_predicate: sssomPred,
			predicate_id: strm,
		};
	});
	const parsedData: ParsedData = {
		columns: Array.from(new Set([...Object.keys(setLevelDefaults), 'sssom_predicate', ...collectAllColumns(parsed.rows)])),
		rows: rowsForRecipe,
		rowCount: parsed.rows.length,
	};

	options.onProgress?.(0, parsed.rows.length, `Generating ${parsed.rows.length} junction notes...`);

	const gen = await generateFromRecipe(
		app,
		parsedData,
		recipe,
		{
			basePath: folder,
			overwriteMode: options.overwriteMode ?? 'replace',
			createFolders: true,
			sourceFileName: typeof parsed.header.mapping_set_id === 'string' ? parsed.header.mapping_set_id : 'sssom-import',
			strictValidation: true,
			curieLocalPart: (row, _rowNum) => sssomEdgeCurie(row),
			curiePrefix: 'sssom',
			onProgress: options.onProgress,
		},
		debug,
	);
	result.generation = gen;

	if (!gen.success) {
		debug?.error('sssom-import', 'generation-failed', 'SSSOM import: generation failed', {
			errors: gen.errors,
		});
		return result;
	}

	// ----- Phase 4: Trigger Tier 2 projection -----
	// Re-projects newly-written junction-edge .md files into the `mappings` table.
	// pluginRunProjection is the plugin.runProjection handle; null in tests.
	if (options.runTier2Projection !== false && pluginRunProjection) {
		debug?.info('sssom-import', 'projection-start', 'SSSOM import: running Tier 2 projection');
		try {
			await pluginRunProjection();
		} catch (err) {
			const msg = err instanceof Error ? err.message : String(err);
			gen.errors.push({ row: -1, message: `Tier 2 projection failed: ${msg}` });
			debug?.warn('sssom-import', 'projection-failed', 'SSSOM import: projection failed', { error: msg });
		}
	}

	// ----- Phase 5: Eager closure precomputation per Ch 35 -----
	if (pluginPrecomputeClosure) {
		debug?.info('sssom-import', 'closure-precompute-start', 'SSSOM import: precomputing closure', { source, target });
		try {
			const cachedRows = await pluginPrecomputeClosure(source, target);
			debug?.info('sssom-import', 'closure-precomputed', `SSSOM import: closure precomputed (${cachedRows} rows)`, { cachedRows });
		} catch (err) {
			const msg = err instanceof Error ? err.message : String(err);
			gen.errors.push({ row: -1, message: `Closure precompute failed: ${msg}` });
			debug?.warn('sssom-import', 'precompute-failed', 'SSSOM import: precompute failed', { error: msg });
		}
	}

	options.onProgress?.(parsed.rows.length, parsed.rows.length, 'SSSOM import complete');
	return result;
}

/**
 * Build a synthetic crosswalk-edge recipe that maps SSSOM rows to
 * junction-edge .md files. The recipe is constructed in-memory; not
 * persisted to disk. Reuses Crosswalker's existing crosswalk-edge layout
 * mechanism so render() + frontmatter-merge + Tier 1 validation all
 * work unchanged.
 */
function buildSyntheticRecipe(source: string, target: string, _folder: string): Recipe {
	// Note: template is RELATIVE to options.basePath (which is `folder`); the
	// generation engine joins them. Don't repeat `folder` here or paths
	// double-prefix.
	return {
		recipe: `sssom-${source}-to-${target}`,
		source: { ontology: source, levels: ['mapping'] },
		target: {
			layout: [
				{
					level: 'mapping',
					mechanism: 'file',
					template: 'cw-{subject_id|slug}-{object_id|slug}.md',
					kind: 'crosswalk-edge',
				},
			],
			also_emit: {
				tags: [`crosswalk/${source}-to-${target}`],
				frontmatter: {
					managed: {
						title: '{subject_id} -> {object_id}',
						// STRM predicate (Tier 1 schema-compliant; required field)
						predicate_id: '{predicate_id}',
						subject_id: '{subject_id}',
						object_id: '{object_id}',
						subject_label: '{subject_label}',
						object_label: '{object_label}',
						mapping_justification: '{mapping_justification}',
						mapping_provider: '{mapping_provider}',
						mapping_set_id: '{mapping_set_id}',
						source_framework: source,
						target_framework: target,
						// Preserve the original SSSOM predicate before STRM normalization
						sssom_predicate: '{sssom_predicate}',
						// SSSOM confidence preserved as a string (Tier 1's typed
						// match_confidence requires a number; render engine emits
						// strings — leave the strictly-typed field for a follow-up
						// that adds numeric template coercion).
						sssom_confidence: '{confidence}',
					},
					user_preserve: ['review_status', 'reviewer', '*notes*'],
				},
			},
		},
	};
}

/**
 * Map SSSOM/SKOS mapping predicates to Tier 1 STRM predicates per v0.1 schema.
 * STRM (NIST IR 8477) is the v0.1 crosswalk-edge predicate vocabulary; SSSOM
 * is the wire format. This normalization lets SSSOM imports populate STRM
 * frontmatter while preserving the original predicate as `sssom_predicate`.
 *
 * Mapping table (per Crosswalker v0.1 design + SKOS Mapping Properties spec):
 *   skos:exactMatch    → is_equivalent_to    (perfect synonym)
 *   skos:closeMatch    → is_approximate_to   (near-synonym; exchangeable in many contexts)
 *   skos:broadMatch    → is_broader_than     (subject is broader than object)
 *   skos:narrowMatch   → is_narrower_than    (subject is narrower than object)
 *   skos:relatedMatch  → intersects_with     (overlapping concepts)
 *
 * Unknown predicates fall back to `intersects_with` with a warning logged.
 */
const SKOS_TO_STRM: Record<string, string> = {
	'skos:exactMatch': 'is_equivalent_to',
	'skos:closeMatch': 'is_approximate_to',
	'skos:broadMatch': 'is_broader_than',
	'skos:narrowMatch': 'is_narrower_than',
	'skos:relatedMatch': 'intersects_with',
};

function normalizePredicate(sssomPredicate: string): { strm: string; warning?: string } {
	const strm = SKOS_TO_STRM[sssomPredicate];
	if (strm) return { strm };
	// Unknown predicate — fall back to intersects_with (the most permissive STRM
	// predicate) and surface a warning so the user knows the mapping is approximate.
	return {
		strm: 'intersects_with',
		warning: `Unknown SSSOM predicate "${sssomPredicate}"; normalized to STRM "intersects_with". Add a SKOS→STRM mapping if this is wrong.`,
	};
}

/** Stable CURIE local-part for one SSSOM edge: cw-<subject>-<object>, sanitized. */
function sssomEdgeCurie(row: Record<string, unknown>): string {
	const subj = String(row.subject_id ?? 'unknown').replace(/[^a-zA-Z0-9_-]+/g, '-');
	const obj = String(row.object_id ?? 'unknown').replace(/[^a-zA-Z0-9_-]+/g, '-');
	return `cw-${subj}-${obj}`;
}

/** Convert a SssomRow to a plain Record for the generation engine. */
function rowToRecord(row: SssomRow): Record<string, unknown> {
	const out: Record<string, unknown> = {};
	for (const [k, v] of Object.entries(row)) {
		if (v === undefined) continue;
		out[k] = v;
	}
	return out;
}

/** Collect the union of all column keys present across all rows. */
function collectAllColumns(rows: SssomRow[]): string[] {
	const cols = new Set<string>();
	for (const row of rows) {
		for (const k of Object.keys(row)) cols.add(k);
	}
	return Array.from(cols);
}
