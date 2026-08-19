/**
 * Generation Engine
 *
 * Creates folders and notes in the vault based on parsed data and configuration.
 *
 * Key design decisions (see https://cybersader.github.io/crosswalker/concepts/ontology-evolution/):
 * - Include `_crosswalker` metadata block in generated notes
 * - Track `importedProperties` for safe reimport
 * - Use `sourceId` as canonical identifier
 * - Default to "skip existing" behavior
 * - Store `frameworkId` for future cross-framework features
 */

import { App, TFile, TFolder, normalizePath, Notice } from 'obsidian';
import {
	ParsedData,
	ImportRecipe,
	GenerationResult,
	GenerationError,
	MappingConfig,
	HierarchyMapping,
	FrontmatterMapping,
	BodyMapping,
	LinkMapping
} from '../types/config';
import { DebugLog } from '../utils/debug';
import {
	render,
	RenderError,
	renderTemplate,
	type Recipe,
	type RenderedBodyRegion,
	type RenderReport,
} from '../render';
import { legacyConfigToRecipe } from './legacy-recipe-shim';
import { mergeFrontmatter, computeManagedKeys } from './frontmatter-merge';
import { buildProvenance } from './provenance';
import { computeConceptCid, computeRecipeHash } from './hash';
import { validateTier1Frontmatter } from '../validation/validator';
import {
	enrich,
	mergeHubBody,
	folderNoteCandidatePath,
	buildManagedChildrenSection,
	mergeManagedChildrenSection,
	ensureWaypointMarker,
	type EnrichNote,
	type HubNote,
} from './enrich';
import type { FacetMembership } from '../import/mapping/facets';

// ============================================================================
// Types
// ============================================================================

/**
 * Crosswalker metadata stored in each generated note.
 * Enables safe reimport, tracking, and future cross-framework features.
 */
export interface CrosswalkerMetadata {
	/** ID from source data - canonical identifier */
	sourceId: string;

	/** Framework identifier (from config) */
	frameworkId?: string;

	/** Framework version if specified */
	frameworkVersion?: string;

	/** Unique ID for this import operation */
	importId: string;

	/** Config ID used for this import */
	configId?: string;

	/** Schema version of this metadata structure */
	schemaVersion: number;

	/** ISO timestamp when note was created/updated */
	importedAt: string;

	/** List of property keys that were imported (vs user-added) */
	importedProperties: string[];

	/** Source file this data came from */
	sourceFile?: string;

	/** Row number in source (for debugging) */
	sourceRow?: number;
}

export interface GenerationOptions {
	/** Base path for output (e.g., "Ontologies/MyFramework") */
	basePath: string;

	/** How to handle existing files */
	overwriteMode: 'skip' | 'replace' | 'error';

	/** Whether to create folders that don't exist */
	createFolders: boolean;

	/** Framework name for _crosswalker metadata */
	frameworkId?: string;

	/** Framework version */
	frameworkVersion?: string;

	/** Config ID (if using saved config) */
	configId?: string;

	/** Source file name */
	sourceFileName?: string;

	/** Progress callback */
	onProgress?: (current: number, total: number, message: string) => void;

	/** Max note writes in flight at once (default DEFAULT_CONCURRENCY). 1 = sequential. */
	concurrency?: number;

	/**
	 * A pre-built Recipe to render with, bypassing the legacy column-role shim.
	 * The shape workbench (a first-class Tier 1 producer, commitment #1) emits a
	 * real recipe via `toRecipeRegions`; folders / files / headings / variadic /
	 * managed frontmatter / managed wikilinks all flow through render() faithfully
	 * rather than being squeezed through `legacyConfigToRecipe`, which cannot
	 * express variadic folders or nested tags. When set, `config.mapping` is still
	 * used for legacy body content only.
	 */
	recipeOverride?: import('../render').Recipe;

	/**
	 * Mapping-driven facet memberships for a row (spec §7k) — used by the Pass 1.5
	 * enrichment pass to materialize facet hub notes with their ORIGINAL-case display
	 * names. When omitted, memberships are derived from the rendered (tagsafe) facet
	 * tags, which lose original casing. The workbench supplies this from its live
	 * mapping via `deriveFacetMemberships(mapping, row)`. Consumed on the enrichment
	 * path (when the recipe declares `target.enrichment`).
	 */
	facetsForRow?: (row: Record<string, unknown>, rowNum: number) => import('../import/mapping/facets').FacetMembership[];

	/**
	 * If true, abort on the first row whose rendered frontmatter fails Tier 1
	 * schema validation. Mirrors `RecipeImportOptions.strictValidation`
	 * (`generateFromRecipe`) — see M1, 2026-07-12 pre-merge review:
	 * `generateNotes` (the wizard/workbench entry point) never ran Tier 1
	 * validation at all before this option was added. Default: true, matching
	 * `generateFromRecipe` exactly so both entry points enforce the
	 * architectural commitment "schema-as-primitive" identically.
	 */
	strictValidation?: boolean;
}

interface GeneratedNoteData {
	path: string;
	frontmatter: Record<string, any>;
	body: string;
	sourceRow: number;
}

// ============================================================================
// Pass 1.5 batch enrichment — shared between generateNotes and
// generateFromRecipe (v0.1.6.1 — 2026-07-11)
// ============================================================================

/**
 * One lightweight record per written note, collected during EITHER write loop
 * (`generateNotes`'s legacy/workbench path or `generateFromRecipe`'s native
 * path) so the shared post-stream enrichment phase (`applyEnrichment` below)
 * can derive parent→children lists + facet hub notes without re-reading the
 * vault. Only collected when the effective recipe declares `target.enrichment`.
 */
interface EnrichRecord extends EnrichNote {
	body: string;
}

/**
 * Minimal shape `applyEnrichment` needs to place facet hub notes and stamp
 * provenance — a structural subset both `GenerationOptions` and
 * `RecipeImportOptions` satisfy, so the same enrichment phase can run after
 * either write loop without those two option shapes needing to unify.
 */
interface EnrichmentWriteOptions {
	basePath: string;
	sourceFileName?: string;
	sourceVersion?: string;
}

// Current schema version for _crosswalker metadata
const CROSSWALKER_METADATA_VERSION = 1;

// ============================================================================
// Concurrency infrastructure (v0.1.6 — 2026-06-13)
// ============================================================================

/** Default number of note writes kept in flight at once. Vault writes are
 *  I/O-bound, so a moderate pool gives a large wall-clock win over awaiting
 *  one at a time, without overwhelming Obsidian's metadata cache. */
export const DEFAULT_CONCURRENCY = 8;

/**
 * Drive a worker over a sync OR async iterable with a bounded number of
 * concurrent invocations (a sliding window). Items are PULLED in order and
 * each worker's synchronous prefix runs in order (JS is single-threaded), so
 * any in-prefix bookkeeping — e.g. path-collision reservation — stays
 * deterministic by item order even though the async tails overlap.
 */
export async function forEachConcurrent<T>(
	source: Iterable<T> | AsyncIterable<T>,
	limit: number,
	worker: (item: T, index: number) => Promise<void>,
): Promise<void> {
	const asyncFactory = (source as AsyncIterable<T>)[Symbol.asyncIterator];
	const it: Iterator<T> | AsyncIterator<T> = asyncFactory
		? asyncFactory.call(source)
		: (source as Iterable<T>)[Symbol.iterator]();
	let index = 0;
	let drained = false;
	const active = new Set<Promise<void>>();

	const fill = async () => {
		while (active.size < limit && !drained) {
			const next = await it.next(); // works for sync + async iterators
			if (next.done) { drained = true; break; }
			const idx = index++;
			const p = Promise.resolve(worker(next.value, idx)).finally(() => active.delete(p));
			active.add(p);
		}
	};

	await fill();
	while (active.size > 0) {
		await Promise.race(active);
		await fill();
	}
}

/**
 * Folder-creation de-duplicator for concurrent writes. Without this, two notes
 * destined for the same new folder would both see "doesn't exist" and both call
 * createFolder → one throws "already exists". Each path (and its ancestors) is
 * created exactly once; concurrent callers await the same promise.
 */
export function createFolderEnsurer(app: App): (path: string) => Promise<void> {
	const cache = new Map<string, Promise<void>>();
	const ensure = (path: string): Promise<void> => {
		if (!path) return Promise.resolve();
		const cached = cache.get(path);
		if (cached) return cached;
		const promise = (async () => {
			const parent = getParentPath(path);
			if (parent) await ensure(parent);
			const normalized = normalizePath(path);
			if (!app.vault.getAbstractFileByPath(normalized)) {
				try {
					await app.vault.createFolder(normalized);
				} catch {
					// A concurrent create won the race — the folder now exists,
					// which is exactly what we wanted. Swallow.
				}
			}
		})();
		cache.set(path, promise);
		return promise;
	};
	return ensure;
}

// ============================================================================
// Main Generation Function
// ============================================================================

/**
 * Generate notes from parsed data using the provided configuration.
 */
export async function generateNotes(
	app: App,
	parsedData: ParsedData,
	config: Partial<ImportRecipe>,
	options: GenerationOptions,
	debug?: DebugLog
): Promise<GenerationResult> {
	const startTime = Date.now();
	const result: GenerationResult = {
		success: true,
		created: [],
		skipped: [],
		errors: [],
		duration: 0
	};

	const importId = generateImportId();
	// M1 (2026-07-12 pre-merge review): mirrors generateFromRecipe's `strict`
	// default exactly (RecipeImportOptions.strictValidation ?? true).
	const strict = options.strictValidation ?? true;

	debug?.info('generation', 'start', `Starting generation of ${parsedData.rowCount} rows`, {
		rowCount: parsedData.rowCount,
		basePath: options.basePath,
		overwriteMode: options.overwriteMode,
		configId: options.configId
	});

	try {
		// Validate configuration
		const mapping = config.mapping;
		if (!mapping) {
			throw new Error('No mapping configuration provided');
		}

		// Ensure base folder exists
		if (options.createFolders) {
			await ensureFolderExists(app, options.basePath);
		}

		// v0.1.3: translate the legacy v0.1.0 config shape into a Ch 22 Recipe
		// once before the per-row loop. The recipe is what render() consumes.
		// The shape workbench passes a pre-built recipe (recipeOverride) so its
		// full mechanism set survives; otherwise the legacy shim translates.
		const recipe = options.recipeOverride ?? legacyConfigToRecipe(config as ImportRecipe);

		// _crosswalker.recipe.hash: computed ONCE per generation run (the
		// recipe's target doesn't change per-row) and threaded through every
		// buildProvenance call this run makes — see src/generation/hash.ts.
		const recipeHash = computeRecipeHash(recipe.target);

		// Track paths emitted in THIS generation pass to detect collisions
		// (two source rows rendering to the same vault path).
		const emittedPaths = new Set<string>();

		// Pass 1.5 enrichment (v0.1.6.1): the wizard/workbench path shares the
		// SAME enrichment phase generateFromRecipe uses (see applyEnrichment
		// below) — children lists, facet hub notes, and edgeCount are no longer
		// exclusive to the native-recipe path. `ontologyId` mirrors
		// generateFromRecipe's `recipe.source?.ontology ?? recipe.recipe`
		// priority, falling back to the legacy config name (what buildNoteData
		// ViaRender already used before this change, so per-row curies are
		// unaffected when the recipe carries no `source.ontology`, e.g. the
		// workbench recipe today).
		const enrichmentEnabled = !!recipe.target.enrichment;
		const ontologyId = recipe.source?.ontology ?? (config.name ?? 'unknown');
		const curiePrefix = slugifyForCurie(ontologyId);
		const enrichRecords: EnrichRecord[] = [];
		// parent_note: 'folder-note' needs the whole batch's shape up front —
		// a streamed (AsyncIterable) source can't provide that (design §3 step 2
		// v1 restriction). applyEnrichment falls back to sibling + a deviation.
		const isStreamed = !Array.isArray(parsedData.rows);

		// v0.1.4.5: iterate so streaming-row sources (AsyncIterable) work alongside
		// the eager array case. v0.1.6 (2026-06-13): writes run in a bounded
		// concurrency pool — the per-row SYNC prefix (render + collision reserve)
		// runs in order, only the async I/O tail (folder ensure + write) overlaps.
		const total = parsedData.rowCount > 0 ? parsedData.rowCount : -1;
		const ensureFolderOnce = createFolderEnsurer(app);
		const limit = Math.max(1, options.concurrency ?? DEFAULT_CONCURRENCY);
		let completed = 0;

		await forEachConcurrent(
			parsedData.rows as Iterable<Record<string, any>> | AsyncIterable<Record<string, any>>,
			limit,
			async (row, idx) => {
				const rowNum = idx + 1; // 1-indexed for user display
				try {
					// v0.1.3: build path + base frontmatter via render(); body/link
					// content still comes from the existing column-role logic for
					// backward-compat.
					const renderReport: RenderReport = { notes: [] };
					const noteData = buildNoteDataViaRender(
						row,
						rowNum,
						mapping,
						options,
						recipe,
						ontologyId,
						renderReport,
						recipeHash,
					);
					if (renderReport.notes.length > 0) {
						result.warnings ??= [];
						for (const note of renderReport.notes) {
							result.warnings.push({ row: rowNum, message: note.detail });
						}
					}

					// Skip if no valid path generated
					if (!noteData.path) {
						result.errors.push({
							row: rowNum,
							message: 'Could not generate file path - missing hierarchy or title data'
						});
						return;
					}

					// Path collision detection — fail loud rather than silently
					// overwriting one row's output with another's. (Runs in the sync
					// prefix, so it's deterministic by row order under concurrency.)
					if (emittedPaths.has(noteData.path)) {
						result.errors.push({
							row: rowNum,
							message: `Path collision: ${noteData.path} already produced by an earlier row in this import. Two source rows resolve to the same target file. Adjust your filename template or hierarchy mappings to disambiguate.`,
						});
						return;
					}
					emittedPaths.add(noteData.path);

					// M1 (2026-07-12 pre-merge review): validate against Tier 1 schema
					// BEFORE writing — mirrors generateFromRecipe's step 6 (~line 1692)
					// exactly. Previously this entry point (the wizard/workbench's ONLY
					// generation path) never validated at all, contradicting
					// architectural commitment #1 ("schema-as-primitive... the
					// load-bearing contract").
					{
						const validation = validateTier1Frontmatter(noteData.frontmatter);
						if (!validation.valid) {
							const errMsg = `Tier 1 validation failed for row ${rowNum} (${noteData.path}): ${
								validation.errors.length > 0 ? validation.errors.join('; ') : 'unknown'
							}`;
							if (strict) {
								result.errors.push({ row: rowNum, message: errMsg });
								return;
							} else {
								debug?.warn('generation', 'validation-warning', `Validation warning at ${noteData.path} (non-strict mode)`, { path: noteData.path, error: errMsg });
							}
						}
					}

					// Check if file exists. Consults BOTH the sibling path AND (when
					// enrichment is on) the folder-note-relocated path by curie — see
					// resolveWriteTarget's docstring (re-import identity, design §4).
					const fullPath = normalizePath(noteData.path);
					const target = resolveWriteTarget(app, fullPath, noteData.curie, enrichmentEnabled);
					const existingFile = target.existingFile;
					const writePath = target.writePath;

					if (existingFile instanceof TFile) {
						if (options.overwriteMode === 'skip') {
							result.skipped.push(writePath);
							debug?.info('generation', 'skipped-existing', `Skipped existing file ${writePath}`, { path: writePath });
							return;
						} else if (options.overwriteMode === 'error') {
							result.errors.push({
								row: rowNum,
								message: `File already exists: ${writePath}`
							});
							result.success = false;
							return;
						}
						// 'replace' mode — merge with existing frontmatter so
						// user-edited keys (reviewer, status, etc.) survive
						// re-import. Per Ch 22 §8.4 managed/user_preserve split.
						try {
							const existingFm = await readExistingFrontmatter(app, existingFile);
							if (existingFm && Object.keys(existingFm).length > 0) {
								// M2 (2026-07-12 pre-merge review): mirror generateFromRecipe's
								// user_preserve read (~line 1724) — this call previously
								// hardcoded `[]`, so a recipe-declared user_preserve key was
								// silently overwritten on re-import through the wizard path.
								const userPreserve = recipe.target.also_emit?.frontmatter?.user_preserve ?? [];
								const managedKeys = computeManagedKeys(noteData.frontmatter, userPreserve);
								noteData.frontmatter = mergeFrontmatter(
									existingFm,
									noteData.frontmatter,
									managedKeys,
								);
							}
						} catch (mergeErr) {
							debug?.warn('generation', 'frontmatter-merge-failed', `Frontmatter merge failed at ${writePath}; using new frontmatter as-is`, {
								path: writePath,
								error: mergeErr instanceof Error ? mergeErr.message : String(mergeErr),
							});
						}
					}

					// Ensure parent folder exists (de-duplicated across concurrent rows)
					const parentPath = getParentPath(writePath);
					if (parentPath && options.createFolders) {
						await ensureFolderOnce(parentPath);
					}

					// Build file content
					const content = buildNoteContent(noteData.frontmatter, noteData.body);

					// Create or update file
					if (existingFile instanceof TFile) {
						await app.vault.modify(existingFile, content);
						debug?.info('generation', 'file-replaced', `Replaced existing file ${writePath}`, { path: writePath });
					} else {
						await app.vault.create(writePath, content);
						debug?.info('generation', 'file-created', `Created new file ${writePath}`, { path: writePath });
					}

					result.created.push(writePath);

					// Collect a record for Pass 1.5 enrichment (parent→children +
					// facet hubs) — same collection generateFromRecipe performs.
					if (enrichmentEnabled) {
						const facets = options.facetsForRow
							? options.facetsForRow(row as Record<string, unknown>, rowNum)
							: facetMembershipsFromTags(noteData.tags);
						enrichRecords.push({
							path: writePath,
							renderedPath: fullPath,
							curie: noteData.curie,
							frontmatter: { ...noteData.frontmatter },
							facets,
							body: noteData.body,
						});
					}
				} catch (rowError) {
					const errorMessage = rowError instanceof Error ? rowError.message : String(rowError);
					result.errors.push({
						row: rowNum,
						message: errorMessage
					});
					debug?.error('generation', 'row-error', `Row ${rowNum} failed`, { row: rowNum, error: errorMessage });
				} finally {
					completed += 1;
					if (options.onProgress && (completed % 10 === 0 || completed === total)) {
						options.onProgress(completed, total, `Processing row ${completed}`);
					}
				}
			},
		);

		// Pass 1.5 — batch enrichment patch phase (post-stream), same phase
		// generateFromRecipe runs. See applyEnrichment for the exact semantics
		// (children lists + facet hub notes + edgeCount, re-import-safe merge).
		if (enrichmentEnabled && enrichRecords.length > 0) {
			try {
				await applyEnrichment(
					app,
					recipe,
					{
						basePath: options.basePath,
						sourceFileName: options.sourceFileName,
						sourceVersion: options.frameworkVersion ?? recipe.source?.version,
					},
					curiePrefix,
					enrichRecords,
					result,
					isStreamed,
					debug,
				);
			} catch (enrichErr) {
				const msg = enrichErr instanceof Error ? enrichErr.message : String(enrichErr);
				result.warnings ??= [];
				result.warnings.push({ row: 0, message: `Enrichment pass failed: ${msg}` });
				debug?.error('generation', 'enrichment-failed', 'Enrichment pass failed', { error: msg });
			}
		}

		// Final progress update
		if (options.onProgress) {
			options.onProgress(completed, total, 'Complete');
		}

	} catch (error) {
		const errorMessage = error instanceof Error ? error.message : String(error);
		result.success = false;
		result.errors.push({
			row: 0,
			message: `Generation failed: ${errorMessage}`
		});
		debug?.error('generation', 'failed', 'Generation failed', { error: errorMessage });
	}

	result.duration = Date.now() - startTime;

	debug?.info('generation', 'complete', `Generation complete: ${result.created.length} created, ${result.errors.length} errors, ${result.warnings?.length ?? 0} warnings`, {
		success: result.success,
		created: result.created.length,
		skipped: result.skipped.length,
		errors: result.errors.length,
		warnings: result.warnings?.length ?? 0,
		duration: result.duration
	});

	return result;
}

// ============================================================================
// Note Building (v0.1.3 — render() + legacy column-role logic)
// ============================================================================

/**
 * Read existing frontmatter for a file via Obsidian's metadata cache.
 * Returns an empty object if the file has no frontmatter or the cache hasn't
 * indexed it yet. Errors during retrieval surface as exceptions.
 */
async function readExistingFrontmatter(app: App, file: TFile): Promise<Record<string, unknown>> {
	const cache = app.metadataCache.getFileCache(file);
	const fm = cache?.frontmatter;
	if (!fm || typeof fm !== 'object') return {};

	// Strip Obsidian's internal `position` key from the result. The metadata
	// cache attaches it to track where in the file the frontmatter lives;
	// it's not part of the user-visible YAML.
	const result: Record<string, unknown> = {};
	for (const [k, v] of Object.entries(fm)) {
		if (k !== 'position') result[k] = v;
	}
	return result;
}

/**
 * Resolve the actual write target for a row, accounting for a prior Pass 1.5
 * folder-note relocation (batch-enrichment design §4 — the "risky seam").
 * `render()` always computes the SIBLING-shaped path (Pass 1 knows nothing
 * about `parent_note`); a PRIOR import may have relocated this concept to its
 * folder-note-shaped path (`X/X.md`), or a prior import may have left it
 * folder-note-shaped when the CURRENT config has since flipped back to
 * sibling. Re-import must find the note by CURIE wherever it actually lives —
 * never assume the sibling path alone — or every re-import would create a
 * stray duplicate there (which Pass 1.5 would then have to clean up after the
 * fact instead of never creating it).
 *
 * Only consulted when the recipe declares `target.enrichment` at all — a
 * plain (non-enrichment) import behaves exactly as before (one lookup, one
 * path). The folder-note candidate check costs one extra synchronous vault
 * lookup per row when enrichment is on; Pass 1.5 (not this function) is what
 * actually DECIDES whether a concept should move — this only finds where it
 * currently sits so the row write lands there instead of an orphaned sibling.
 */
function resolveWriteTarget(
	app: App,
	siblingPath: string,
	curie: string,
	enrichmentEnabled: boolean,
): { existingFile: TFile | null; writePath: string } {
	const direct = app.vault.getAbstractFileByPath(siblingPath);
	if (direct instanceof TFile) return { existingFile: direct, writePath: siblingPath };
	if (enrichmentEnabled) {
		const candidatePath = folderNoteCandidatePath(siblingPath);
		if (candidatePath !== siblingPath) {
			const relocated = app.vault.getAbstractFileByPath(candidatePath);
			if (relocated instanceof TFile) {
				const fm = app.metadataCache.getFileCache(relocated)?.frontmatter;
				if (fm && fm.curie === curie) {
					return { existingFile: relocated, writePath: candidatePath };
				}
			}
		}
	}
	return { existingFile: null, writePath: siblingPath };
}

/**
 * Build note data from a single row using render() for path + base
 * frontmatter, then layering link + body content from the legacy column-role
 * logic.
 *
 * v0.1.3: this is the new code path that uses spec-driven Recipe + Address.
 * The body/link content building still uses the v0.1.0 buildNoteData internals
 * because body templates haven't migrated to spec yet (deferred to a later
 * milestone where body becomes a recipe-defined `also_emit.body` or similar).
 */
function buildNoteDataViaRender(
	row: Record<string, any>,
	rowNum: number,
	mapping: MappingConfig,
	options: GenerationOptions,
	recipe: ReturnType<typeof legacyConfigToRecipe>,
	ontologyId: string,
	report?: RenderReport,
	recipeHash?: string,
): { path: string; frontmatter: Record<string, any>; body: string; sourceRow: number; curie: string; tags: string[] } {
	// 1. Build a CURIE for this row. Strategy: ontology + filename stem.
	//    The filename is whatever the recipe's leaf file template resolves to.
	const filenameStem = deriveFilenameStem(row, mapping, rowNum);
	const curie = `${slugifyForCurie(ontologyId)}:${filenameStem}`;

	// 2. render() expects a SourceScope object — the row IS the scope (column
	//    names map to template variables).
	let address;
	try {
		address = render(recipe, { curie, scope: row as Record<string, unknown> }, report);
	} catch (err) {
		if (err instanceof RenderError) {
			throw new Error(`render() failed for row ${rowNum}: ${err.message}`);
		}
		throw err;
	}

	// 3. Combine basePath with the recipe-relative path render() produced.
	const fullPath = options.basePath
		? normalizePath(`${options.basePath}/${address.primary.path}`)
		: normalizePath(address.primary.path);

	// 4. Frontmatter starts from render's output (curie + managed keys).
	const frontmatter: Record<string, any> = { ...address.frontmatter };

	// 4b. Carry tags + aliases from the render Address (spec §7k item 3).
	//     buildNoteDataViaRender previously dropped both, so recipe-emitted
	//     facet tags and id↔name aliases never reached the vault and the graph
	//     stayed disconnected. Frontmatter tags are BARE (no leading '#'); we
	//     strip any '#' defensively, drop empties, and de-dupe. Emission flows
	//     through buildNoteContent's array branch (block-style YAML list).
	if (address.tags.length > 0) {
		const tags = normalizeTagList(address.tags);
		if (tags.length > 0) frontmatter.tags = tags;
	}
	if (address.aliases.length > 0) {
		const aliases = normalizeAliasList(address.aliases);
		if (aliases.length > 0) frontmatter.aliases = aliases;
	}

	// 5. Layer in link content plus the legacy MappingConfig.body fallback.
	// Canonical body declarations are evaluated only by render(); their presence
	// suppresses legacy body-column projection rather than double-emitting it.
	// Body-located link sections remain independent, preserving existing behavior.
	const hasCanonicalBody = (recipe.target.also_emit?.body?.length ?? 0) > 0;
	const legacy = buildNoteData(row, rowNum, mapping, options, '', [], !hasCanonicalBody);
	for (const [k, v] of Object.entries(legacy.frontmatter)) {
		// Skip _crosswalker — we'll write a fresh provenance block below.
		// Skip keys already set by render's also_emit (managed wins).
		if (k === '_crosswalker') continue;
		if (!(k in frontmatter)) frontmatter[k] = v;
	}

	// 5b. Give the note a document shape (spec §7k item 2): an H1 title, a
	//     blank line, then the body content (link sections + body-column prose).
	//     Only when a title column drives the leaf filename AND there is body
	//     content — a frontmatter-only note gets no forced heading. The title
	//     text is the raw (unsanitized) leaf template value so an H1 reads
	//     `# AC-2: Account management` even though the file is `AC-2- ....md`.
	const titleText = mapping.filename?.template ? deriveTitleText(row, mapping, filenameStem) : '';
	const managedBody = renderedBodyRegionsToMarkdown(address.body);
	const bodyContent = [managedBody, legacy.body].filter((part) => part.trim() !== '').join('\n\n');
	const body = composeDocumentBody(titleText, bodyContent);

	// 6. Always write a fresh _crosswalker provenance block per
	//    spec/tier1.schema.json. Captures the source ref + producer +
	//    recipe-id at this generation time, plus the two hashes that let a
	//    future re-import distinguish source-content drift from recipe drift
	//    (concept_cid: pre-render identity hash of (curie, row); recipe.hash:
	//    hash of the effective recipe target — see src/generation/hash.ts's
	//    doc comments for the exact, load-bearing field-set definitions).
	frontmatter._crosswalker = buildProvenance(
		{
			sourceFile: options.sourceFileName,
			sourceVersion: options.frameworkVersion ?? recipe.source?.version,
			recipeId: options.recipeOverride ? recipe.recipe : (options.configId ?? recipe.recipe),
			recipeHash,
			conceptCid: computeConceptCid({ curie, scope: row as Record<string, unknown> }),
		},
		PLUGIN_VERSION,
	);

	return {
		path: fullPath,
		frontmatter,
		body,
		sourceRow: rowNum,
		// Curie + raw (tagsafe) rendered tags — needed only by the Pass 1.5
		// enrichment collector in generateNotes (curie for deterministic sort /
		// hub-note curie namespace; tags for the facetsForRow fallback when the
		// caller doesn't supply mapping-driven facet memberships).
		curie,
		tags: address.tags,
	};
}

/**
 * Normalize a list of rendered tag strings for a frontmatter `tags` array:
 * strip any leading '#' (frontmatter tags are bare), trim, drop empties, and
 * de-dupe preserving first-seen order. Deterministic. Exported for tests.
 */
export function normalizeTagList(tags: unknown[]): string[] {
	const out: string[] = [];
	const seen = new Set<string>();
	for (const t of tags) {
		const clean = String(t).replace(/^#+/, '').trim();
		if (clean === '' || seen.has(clean)) continue;
		seen.add(clean);
		out.push(clean);
	}
	return out;
}

/**
 * Normalize a list of rendered alias strings: trim, drop empties, de-dupe.
 * Deterministic. Exported for tests.
 */
export function normalizeAliasList(aliases: unknown[]): string[] {
	const out: string[] = [];
	const seen = new Set<string>();
	for (const a of aliases) {
		const clean = String(a).trim();
		if (clean === '' || seen.has(clean)) continue;
		seen.add(clean);
		out.push(clean);
	}
	return out;
}

/**
 * Resolve a human-readable title for a note's H1 heading. Uses the leaf
 * filename template resolved against the row (single-brace render syntax,
 * pre-sanitization) so the H1 keeps characters a filename can't (`:`), falling
 * back to the already-sanitized filename stem when the template can't resolve.
 */
function deriveTitleText(
	row: Record<string, any>,
	mapping: MappingConfig,
	fallbackStem: string,
): string {
	if (mapping.filename?.template) {
		try {
			const raw = renderTemplate(mapping.filename.template, row as Record<string, unknown>)
				.replace(/\.md$/i, '')
				.trim();
			if (raw) return raw;
		} catch {
			// Template variable missing — fall through to the sanitized stem.
		}
	}
	return fallbackStem;
}

/** Convert pure render() body regions to Markdown without evaluating templates. */
export function renderedBodyRegionsToMarkdown(regions: RenderedBodyRegion[]): string {
	return regions
		.map((region) => {
			if (region.position === 'append') return region.content;
			const heading = `${'#'.repeat(region.headingDepth ?? 2)} ${region.heading ?? ''}`;
			return region.content === '' ? heading : `${heading}\n\n${region.content}`;
		})
		.join('\n\n');
}

/**
 * Assemble a document-style note body: an H1 title, a blank line, then the
 * body content. Returns the body unchanged when there is no content OR no
 * title (a frontmatter-only note gets no forced heading). Deterministic (no
 * timestamps). Exported for tests.
 */
export function composeDocumentBody(titleText: string, body: string): string {
	if (body.trim() === '' || titleText.trim() === '') return body;
	return `# ${titleText}\n\n${body}`;
}

/**
 * Pulled from buildNoteData's filename logic — returns the stem (no .md) for
 * use in CURIE generation.
 */
function deriveFilenameStem(
	row: Record<string, any>,
	mapping: MappingConfig,
	rowNum: number,
): string {
	let filename = '';
	if (mapping.filename?.template) {
		// Use the new render template engine ({var|filter} syntax). Legacy
		// configs that used `{{var}}` mustache-style won't interpolate via
		// renderTemplate — they get caught by the empty-result fallback
		// below and resolved to row-N.
		try {
			filename = renderTemplate(mapping.filename.template, row as Record<string, unknown>);
		} catch {
			// Template variable missing — fall through to first-frontmatter fallback
			filename = '';
		}
	}
	if (!filename && mapping.frontmatter && mapping.frontmatter.length > 0) {
		const firstValue = row[mapping.frontmatter[0].column];
		if (firstValue) filename = String(firstValue);
	}

	if (!filename) {
		filename = `row-${rowNum}`;
	}

	// Strip .md if the template included it; CURIE local part doesn't want it
	if (filename.endsWith('.md')) {
		filename = filename.slice(0, -3);
	}
	return sanitizeFileName(filename);
}

/**
 * Slugify a string for use as a CURIE prefix (must match the schema's
 * `^[a-z][a-z0-9_-]*` pattern from spec/tier1.schema.json $defs/curie).
 */
function slugifyForCurie(input: string): string {
	const lower = String(input).toLowerCase();
	const cleaned = lower.replace(/[^a-z0-9_-]+/g, '-').replace(/^-|-$/g, '');
	// Ensure first char is a letter (schema requires)
	return /^[a-z]/.test(cleaned) ? cleaned : `cw-${cleaned}`;
}

// Plugin version constant — populated from manifest.json. esbuild bundles
// the import via the JSON loader.
import manifest from '../../manifest.json';
const PLUGIN_VERSION = manifest.version;

/**
 * Build note data from a single row (v0.1.0 column-role logic; preserved
 * for body/link content. v0.1.3 routes path + base frontmatter through
 * render() instead — see buildNoteDataViaRender above).
 */
export function buildNoteData(
	row: Record<string, any>,
	rowNum: number,
	mapping: MappingConfig,
	options: GenerationOptions,
	importId: string,
	allColumns: string[],
	includeBodyMappings = true,
): GeneratedNoteData {
	const frontmatter: Record<string, any> = {};
	const importedProperties: string[] = [];
	let bodyParts: string[] = [];
	let path = options.basePath;

	// 1. Process hierarchy columns (build folder path)
	const hierarchyValues: string[] = [];
	if (mapping.hierarchy && mapping.hierarchy.length > 0) {
		// Sort by level to ensure proper order
		const sortedHierarchy = [...mapping.hierarchy].sort((a, b) => a.level - b.level);

		for (const h of sortedHierarchy) {
			const value = row[h.column];
			if (value !== undefined && value !== null && value !== '') {
				const sanitized = sanitizePathSegment(String(value));
				if (sanitized) {
					hierarchyValues.push(sanitized);
				}
			}
		}
	}

	// 2. Determine filename from filename config or first non-hierarchy column with data
	let filename = '';
	if (mapping.filename?.template) {
		filename = resolveTemplate(mapping.filename.template, row);
	} else {
		// Fall back: use first frontmatter column value as filename
		if (mapping.frontmatter && mapping.frontmatter.length > 0) {
			const firstValue = row[mapping.frontmatter[0].column];
			if (firstValue) {
				filename = String(firstValue);
			}
		}
	}

	if (!filename) {
		// Last resort: use row number
		filename = `row-${rowNum}`;
	}

	// Sanitize filename
	filename = sanitizeFileName(filename);
	if (mapping.filename?.maxLength) {
		filename = filename.substring(0, mapping.filename.maxLength);
	}

	// Build full path
	if (hierarchyValues.length > 0) {
		path = normalizePath(`${path}/${hierarchyValues.join('/')}/${filename}.md`);
	} else {
		path = normalizePath(`${path}/${filename}.md`);
	}

	// 3. Process frontmatter columns
	if (mapping.frontmatter) {
		for (const fm of mapping.frontmatter) {
			const value = row[fm.column];

			// Handle empty values
			if (value === undefined || value === null || value === '') {
				if (!fm.omitIfEmpty) {
					frontmatter[fm.key] = formatValue(value, fm.format);
				}
			} else {
				frontmatter[fm.key] = formatValue(value, fm.format);
			}

			importedProperties.push(fm.key);
		}
	}

	// 4. Process link columns
	if (mapping.links) {
		for (const link of mapping.links) {
			const value = row[link.column];
			if (value !== undefined && value !== null && value !== '') {
				const linkValue = formatAsLink(value, link);

				if (link.location === 'frontmatter' || link.location === 'both') {
					const key = link.frontmatterKey || link.column;
					frontmatter[key] = linkValue;
					importedProperties.push(key);
				}

				if (link.location === 'body' || link.location === 'both') {
					const section = link.bodySection || 'Related';
					bodyParts.push(`## ${section}\n\n${linkValue}\n`);
				}
			}
		}
	}

	// 5. Process legacy body columns only when no canonical also_emit.body block
	// owns body output. Link sections above remain independent and still emit.
	if (includeBodyMappings && mapping.body) {
		for (const body of mapping.body) {
			const value = row[body.column];
			if (value !== undefined && value !== null && value !== '') {
				const formatted = formatBodyContent(value, body);
				if (body.heading) {
					bodyParts.push(`## ${body.heading}\n\n${formatted}\n`);
				} else {
					bodyParts.push(`${formatted}\n`);
				}
			}
		}
	}

	// 6. Add _crosswalker metadata
	const crosswalkerMetadata: CrosswalkerMetadata = {
		sourceId: determineSourceId(row, mapping, rowNum),
		frameworkId: options.frameworkId,
		frameworkVersion: options.frameworkVersion,
		importId: importId,
		configId: options.configId,
		schemaVersion: CROSSWALKER_METADATA_VERSION,
		importedAt: new Date().toISOString(),
		importedProperties: importedProperties,
		sourceFile: options.sourceFileName,
		sourceRow: rowNum
	};

	// Remove undefined values from crosswalker metadata
	const cleanedMetadata = Object.fromEntries(
		Object.entries(crosswalkerMetadata).filter(([_, v]) => v !== undefined)
	);

	frontmatter['_crosswalker'] = cleanedMetadata;

	return {
		path,
		frontmatter,
		body: bodyParts.join('\n'),
		sourceRow: rowNum
	};
}

/**
 * Determine the source ID for a row (canonical identifier)
 */
function determineSourceId(row: Record<string, any>, mapping: MappingConfig, rowNum: number): string {
	// Look for common ID column names
	const idColumnCandidates = [
		'id', 'ID', 'Id',
		'control_id', 'Control ID', 'ControlID',
		'identifier', 'Identifier',
		'code', 'Code',
		'key', 'Key'
	];

	// Check frontmatter mappings for an ID field
	if (mapping.frontmatter) {
		for (const fm of mapping.frontmatter) {
			if (idColumnCandidates.some(c => fm.column.toLowerCase() === c.toLowerCase())) {
				const value = row[fm.column];
				if (value) return String(value);
			}
			// Also check output key
			if (idColumnCandidates.some(c => fm.key.toLowerCase() === c.toLowerCase())) {
				const value = row[fm.column];
				if (value) return String(value);
			}
		}
	}

	// Check raw row data
	for (const candidate of idColumnCandidates) {
		if (row[candidate]) {
			return String(row[candidate]);
		}
	}

	// Fall back to row number
	return `row-${rowNum}`;
}

// ============================================================================
// Formatting Helpers
// ============================================================================

/**
 * Format a value for frontmatter based on format type
 */
function formatValue(value: any, format?: string): any {
	if (value === undefined || value === null) {
		return '';
	}

	switch (format) {
		case 'number':
			const num = Number(value);
			return isNaN(num) ? value : num;

		case 'boolean':
			if (typeof value === 'boolean') return value;
			const lower = String(value).toLowerCase();
			return lower === 'true' || lower === 'yes' || lower === '1';

		case 'array':
			if (Array.isArray(value)) return value;
			// Try to split by common delimiters
			if (typeof value === 'string') {
				if (value.includes(',')) return value.split(',').map(s => s.trim());
				if (value.includes(';')) return value.split(';').map(s => s.trim());
				if (value.includes('\n')) return value.split('\n').map(s => s.trim());
			}
			return [value];

		case 'date':
			// Return as-is for now, could parse/validate
			return String(value);

		default:
			return String(value);
	}
}

/**
 * Format a value as a link
 */
function formatAsLink(value: any, config: LinkMapping): string | string[] {
	const values = Array.isArray(value) ? value : [value];

	const links = values.map(v => {
		const linkText = String(v).trim();
		if (!linkText) return '';

		if (config.type === 'wikilink') {
			return `[[${linkText}]]`;
		} else {
			// Markdown link - would need path resolution
			return `[${linkText}](${linkText})`;
		}
	}).filter(l => l !== '');

	return links.length === 1 ? links[0] : links;
}

/**
 * Format body content
 */
function formatBodyContent(value: any, config: BodyMapping): string {
	const text = String(value);

	switch (config.format) {
		case 'code':
			return '```\n' + text + '\n```';
		case 'quote':
			return text.split('\n').map(line => '> ' + line).join('\n');
		case 'list':
			return text.split('\n').map(line => '- ' + line.trim()).join('\n');
		default:
			return text;
	}
}

/**
 * Resolve a template string with row values
 */
function resolveTemplate(template: string, row: Record<string, any>): string {
	return template.replace(/\{\{([^}]+)\}\}/g, (match, key) => {
		const trimmedKey = key.trim();
		const value = row[trimmedKey];
		return value !== undefined && value !== null ? String(value) : '';
	});
}

// ============================================================================
// File System Helpers
// ============================================================================

/**
 * Build the note content from frontmatter and body.
 * Exported for tests: the YAML quoting rules here are load-bearing (an
 * unquoted wikilink value silently breaks the whole graph).
 */
export function buildNoteContent(frontmatter: Record<string, any>, body: string): string {
	const yamlLines = ['---'];

	for (const [key, value] of Object.entries(frontmatter)) {
		yamlLines.push(formatYamlLine(key, value, 0));
	}

	yamlLines.push('---');

	if (body.trim()) {
		return yamlLines.join('\n') + '\n\n' + body;
	} else {
		return yamlLines.join('\n') + '\n';
	}
}

/**
 * Format a single YAML line (handles nested objects and arrays)
 */
function formatYamlLine(key: string, value: any, indent: number): string {
	const prefix = '  '.repeat(indent);

	if (value === null || value === undefined) {
		return `${prefix}${key}:`;
	}

	if (typeof value === 'object' && !Array.isArray(value)) {
		const lines = [`${prefix}${key}:`];
		for (const [k, v] of Object.entries(value)) {
			lines.push(formatYamlLine(k, v, indent + 1));
		}
		return lines.join('\n');
	}

	if (Array.isArray(value)) {
		if (value.length === 0) {
			return `${prefix}${key}: []`;
		}
		const lines = [`${prefix}${key}:`];
		for (const item of value) {
			if (typeof item === 'object') {
				lines.push(`${prefix}  -`);
				for (const [k, v] of Object.entries(item)) {
					lines.push(formatYamlLine(k, v, indent + 2));
				}
			} else {
				lines.push(`${prefix}  - ${formatYamlValue(item)}`);
			}
		}
		return lines.join('\n');
	}

	return `${prefix}${key}: ${formatYamlValue(value)}`;
}

/**
 * Format a YAML value (quote strings if needed)
 */
function formatYamlValue(value: any): string {
	if (typeof value === 'string') {
		// Quote if contains special characters or looks like a number/boolean.
		// Leading YAML-structural characters MUST be quoted: an unquoted
		// `[[T1078]]` parses as a nested array, so Obsidian indexes no link and
		// the graph shows nothing connected (found 2026-07-10, first graph test).
		if (
			/^[[\]{}\-*&!|>%@`,'" \t]/.test(value) ||
			value.includes(':') ||
			value.includes('#') ||
			value.includes('"') ||
			value.includes("'") ||
			value.includes('\n') ||
			value.match(/^[0-9]/) ||
			['true', 'false', 'yes', 'no', 'null'].includes(value.toLowerCase())
		) {
			// Use double quotes and escape internal quotes
			return `"${value.replace(/"/g, '\\"')}"`;
		}
		return value;
	}

	if (typeof value === 'boolean') {
		return value ? 'true' : 'false';
	}

	if (typeof value === 'number') {
		return String(value);
	}

	return String(value);
}

/**
 * Ensure a folder exists, creating it if necessary
 */
async function ensureFolderExists(app: App, path: string): Promise<void> {
	const normalizedPath = normalizePath(path);
	const existing = app.vault.getAbstractFileByPath(normalizedPath);

	if (existing instanceof TFolder) {
		return; // Already exists
	}

	if (existing instanceof TFile) {
		throw new Error(`Cannot create folder "${path}" - a file exists at that path`);
	}

	// Create folder (Obsidian API creates parent folders automatically)
	await app.vault.createFolder(normalizedPath);
}

/**
 * Get parent path from a file path
 */
function getParentPath(filePath: string): string | null {
	const lastSlash = filePath.lastIndexOf('/');
	if (lastSlash === -1) return null;
	return filePath.substring(0, lastSlash);
}

/**
 * Sanitize a string for use as a path segment (folder name)
 */
function sanitizePathSegment(name: string): string {
	return name
		.replace(/[\\/:*?"<>|]/g, '-') // Replace illegal characters
		.replace(/\s+/g, ' ')          // Normalize whitespace
		.replace(/^\.+|\.+$/g, '')     // Remove leading/trailing dots
		.trim()
		.substring(0, 100);            // Limit length
}

/**
 * Sanitize a string for use as a filename
 */
function sanitizeFileName(name: string): string {
	return name
		.replace(/[\\/:*?"<>|]/g, '-') // Replace illegal characters
		.replace(/\s+/g, ' ')          // Normalize whitespace
		.replace(/^\.+/g, '')          // Remove leading dots
		.replace(/\.md$/i, '')         // Remove existing .md extension
		.trim();
}

/**
 * Generate a unique import ID
 */
function generateImportId(): string {
	const timestamp = Date.now().toString(36);
	const random = Math.random().toString(36).substring(2, 8);
	return `import_${timestamp}_${random}`;
}

// ============================================================================
// Export Helpers for Wizard
// ============================================================================

/**
 * Build a full config from wizard state for generation.
 *
 * The optional `appliedConfigFilename` is the filename block from a saved
 * config that was auto-applied via smart-match. When no column is marked as
 * "Note title" in the wizard, this template is used as the leaf filename so
 * the saved config's intent ("filename = Control ID") survives the wizard
 * round-trip. Without this fallback, the legacy-shim would default to the
 * first frontmatter column, which is often the wrong column.
 *
 * Legacy Mustache `{{X}}` syntax in `appliedConfigFilename.template` is
 * tolerated — translated to single-brace `{X}` at use site. The render
 * engine only understands single-brace.
 */
/**
 * Detect the delimiter structure of a taxonomy-id column and return the folder
 * templates that decompose it into a nested tree — the wizard equivalent of the
 * hand-written hierarchical recipe (id `DE.AE-02` → `DE/ → DE.AE/ → DE.AE-02.md`).
 *
 * Strategy: find the delimiter characters that appear in (nearly) every value,
 * ordered by where they first appear in a representative value, then emit one
 * folder template `{col|split(<delim>,0)}` per delimiter — the cumulative prefix
 * up to that delimiter. Domain-general: works for `AC-2` (→ `AC/`), `GV.OC-01`
 * (→ `GV/ → GV.OC/`), `T1055.011` (→ `T1055/`), etc. Returns [] when the values
 * have no consistent delimiter (nothing to split → caller falls back to flat).
 */
export function deriveIdSplitTemplates(column: string, values: string[]): string[] {
	const DELIMS = ['.', '-', '_', '/', ':'];
	const samples = values.map((v) => String(v ?? '').trim()).filter(Boolean).slice(0, 200);
	if (samples.length === 0) return [];

	// A delimiter qualifies if it appears (with content on both sides) in most
	// values — ≥80% — so one-off punctuation doesn't create spurious folders.
	const threshold = Math.max(1, Math.floor(samples.length * 0.8));
	const qualifying = DELIMS.filter((d) => {
		let hits = 0;
		for (const s of samples) {
			const i = s.indexOf(d);
			if (i > 0 && i < s.length - 1) hits++;
		}
		return hits >= threshold;
	});
	if (qualifying.length === 0) return [];

	// Order delimiters by their first position in a representative (longest) value,
	// so cumulative `split(d,0)` prefixes nest correctly (`.` before `-` in CSF ids).
	const rep = samples.reduce((a, b) => (b.length > a.length ? b : a), samples[0]);
	const ordered = qualifying
		.map((d) => ({ d, pos: rep.indexOf(d) }))
		.filter((x) => x.pos >= 0)
		.sort((a, b) => a.pos - b.pos)
		.map((x) => x.d);

	return ordered.map((d) => `{${column}|split(${d},0)}`);
}

export function buildConfigFromWizardState(
	columnConfigs: Map<string, { useAs: string; outputKey: string; folderTemplates?: string[] }>,
	parsedColumns: string[],
	appliedConfigFilename?: { template?: string; sanitize?: boolean; maxLength?: number }
): Partial<ImportRecipe> {
	const hierarchy: HierarchyMapping[] = [];
	const frontmatter: FrontmatterMapping[] = [];
	const links: LinkMapping[] = [];
	const body: BodyMapping[] = [];

	let hierarchyLevel = 1;

	for (const col of parsedColumns) {
		const config = columnConfigs.get(col);
		if (!config) continue;

		switch (config.useAs) {
			case 'hierarchy':
				hierarchy.push({
					column: col,
					level: hierarchyLevel++
				});
				break;

			case 'folder-tree':
				// Id-derived nested folders: one folder level per detected
				// delimiter (templates computed by the wizard from sample values).
				for (const template of config.folderTemplates ?? []) {
					hierarchy.push({ column: col, level: hierarchyLevel++, template });
				}
				break;

			case 'frontmatter':
				frontmatter.push({
					column: col,
					key: config.outputKey
				});
				break;

			case 'link':
				links.push({
					column: col,
					type: 'wikilink',
					location: 'frontmatter',
					frontmatterKey: config.outputKey
				});
				break;

			case 'body':
				body.push({
					column: col,
					heading: config.outputKey
				});
				break;

			case 'title':
				// Title column used in filename template
				break;

			case 'skip':
			default:
				// Skip this column
				break;
		}
	}

	// Filename template precedence (highest to lowest):
	//   1. A column explicitly marked as 'title' in the wizard → `{<col>}`
	//   2. An applied-saved-config filename template, translated from Mustache
	//      `{{X}}` to single-brace `{X}` if needed
	//   3. Omitted — the legacy-recipe-shim falls back to first frontmatter
	//      column → `{<column>}.md`
	const titleCol = parsedColumns.find(col => columnConfigs.get(col)?.useAs === 'title');
	// A folder-tree id column names the leaf file too (the full id), unless an
	// explicit title column is set — matching the hierarchical recipe where the
	// id is both the structure and the filename.
	const folderTreeCol = parsedColumns.find(col => columnConfigs.get(col)?.useAs === 'folder-tree');

	let resolvedFilename: { template: string; sanitize: boolean; maxLength?: number } | undefined;
	if (titleCol) {
		resolvedFilename = { template: `{${titleCol}}`, sanitize: true };
	} else if (folderTreeCol) {
		resolvedFilename = { template: `{${folderTreeCol}}`, sanitize: true };
	} else if (appliedConfigFilename?.template) {
		// Translate Mustache `{{X}}` → single-brace `{X}` for the new render
		// engine. Pre-existing single-brace templates pass through unchanged
		// (the regex matches both forms).
		const translated = appliedConfigFilename.template.replace(/\{\{([^{}]+)\}\}/g, '{$1}');
		resolvedFilename = {
			template: translated,
			sanitize: appliedConfigFilename.sanitize ?? true,
			...(appliedConfigFilename.maxLength !== undefined && { maxLength: appliedConfigFilename.maxLength }),
		};
	}

	return {
		mapping: {
			hierarchy,
			frontmatter,
			links,
			body,
			...(resolvedFilename && { filename: resolvedFilename })
		}
	};
}

/**
 * Estimate the number of notes and folders that will be created
 */
export function estimateOutput(
	parsedData: ParsedData,
	config: Partial<ImportRecipe>
): { noteCount: number; folderCount: number; linkCount: number } {
	// Note count = row count (one note per row)
	const noteCount = parsedData.rowCount;

	// Estimate folder count based on hierarchy
	let folderCount = 1; // At least the base folder
	if (config.mapping?.hierarchy && config.mapping.hierarchy.length > 0) {
		// Count unique combinations at each level. estimateOutput is only
		// called on the eager-array form (wizard preview); streaming sources
		// don't have a known total ahead of generation.
		if (Array.isArray(parsedData.rows)) {
			const uniqueHierarchies = new Set<string>();
			for (const row of parsedData.rows) {
				let path = '';
				for (const h of config.mapping.hierarchy.sort((a, b) => a.level - b.level)) {
					const value = row[h.column];
					if (value) {
						path += '/' + String(value);
						uniqueHierarchies.add(path);
					}
				}
			}
			folderCount = uniqueHierarchies.size + 1;
		}
	}

	// Estimate link count — eager-array path only (wizard preview)
	let linkCount = 0;
	if (config.mapping?.links && config.mapping.links.length > 0 && Array.isArray(parsedData.rows)) {
		for (const row of parsedData.rows) {
			for (const link of config.mapping.links) {
				const value = row[link.column];
				if (value) {
					// Count array items or single value
					if (Array.isArray(value)) {
						linkCount += value.length;
					} else if (typeof value === 'string' && (value.includes(',') || value.includes(';'))) {
						linkCount += value.split(/[,;]/).length;
					} else {
						linkCount += 1;
					}
				}
			}
		}
	}

	return { noteCount, folderCount, linkCount };
}

// ============================================================================
// v0.1.4 — Native Ch 22 Recipe Path (kind dispatch + STRM enforcement)
// ============================================================================

/**
 * Options for generateFromRecipe — the native Ch 22 entry point. Skips the
 * v0.1.0 column-role legacy logic entirely and runs render() against the
 * recipe directly. Used by recipes that declare non-concept kinds
 * (junction-note, crosswalk-edge) where the frontmatter shape is fully
 * driven by recipe.target.also_emit.frontmatter.managed templates.
 */
export interface RecipeImportOptions {
	/** Vault-relative output base path. May be empty if the recipe's layout
	 *  templates already resolve to absolute paths. */
	basePath: string;
	/** How to handle existing files. */
	overwriteMode: 'skip' | 'replace' | 'error';
	/** Whether to create missing folders. Defaults to true. */
	createFolders?: boolean;
	/** Source file name for provenance. */
	sourceFileName?: string;
	/** Source version for provenance. */
	sourceVersion?: string;
	/**
	 * If true, abort on the first row whose rendered frontmatter fails Tier 1
	 * schema validation. Required for v0.1.4 STRM predicate enforcement on
	 * crosswalk-edge layouts. Default: true.
	 */
	strictValidation?: boolean;
	/**
	 * Function returning the CURIE local-part for a row. Default: row.id (or
	 * row.curie if already pre-built; or `row-N` fallback). Recipes for
	 * non-concept kinds typically need a per-row identity (e.g., for a
	 * crosswalk-edge: `cw-{subject}-{object}`).
	 */
	curieLocalPart?: (row: Record<string, unknown>, rowNum: number) => string;
	/** CURIE prefix override. Default: recipe.source.ontology slug. */
	curiePrefix?: string;
	/** Progress callback. */
	onProgress?: (current: number, total: number, message: string) => void;
	/** Max note writes in flight at once (default DEFAULT_CONCURRENCY). 1 = sequential. */
	concurrency?: number;
	/**
	 * Facet memberships for a row — used by Pass 1.5 enrichment to materialize
	 * facet hub notes with their original-case display names. When omitted, the
	 * engine derives memberships from the rendered facet tags (which are tagsafe,
	 * so hub names lose original casing). Callers that hold the ImportMapping
	 * (the workbench) should pass a mapping-driven function via
	 * `deriveFacetMemberships(mapping, row)` for faithful display names.
	 */
	facetsForRow?: (row: Record<string, unknown>, rowNum: number) => FacetMembership[];
}

/**
 * Native Ch 22 recipe entry point. Renders one note per row, validates
 * against spec/tier1.schema.json, writes to vault. Idempotent re-imports
 * preserve user-edited frontmatter via the same managed/user_preserve merge
 * semantics as the legacy path.
 *
 * v0.1.4: this path is the one used by junction-note + crosswalk-edge
 * recipes. Concept-note recipes still flow through generateNotes (legacy
 * column-role) for back-compat with the wizard UI; native concept recipes
 * also work here.
 */
export async function generateFromRecipe(
	app: App,
	parsedData: ParsedData,
	recipe: Recipe,
	options: RecipeImportOptions,
	debug?: DebugLog,
): Promise<GenerationResult> {
	const startTime = Date.now();
	const result: GenerationResult = {
		success: true,
		created: [],
		skipped: [],
		errors: [],
		duration: 0,
	};

	const strict = options.strictValidation ?? true;
	const createFolders = options.createFolders ?? true;
	const ontologyId = recipe.source?.ontology ?? recipe.recipe;
	const curiePrefix = options.curiePrefix ?? slugifyForCurie(ontologyId);

	// _crosswalker.recipe.hash: computed ONCE per generation run — see
	// src/generation/hash.ts's doc comments for the exact field-set definition.
	const recipeHash = computeRecipeHash(recipe.target);

	debug?.info('generation', 'recipe-start', `generateFromRecipe: starting (${recipe.recipe})`, {
		recipe: recipe.recipe,
		rowCount: parsedData.rowCount,
		strict,
		ontologyId,
	});

	if (createFolders && options.basePath) {
		await ensureFolderExists(app, options.basePath);
	}

	const emittedPaths = new Set<string>();
	// Pass 1.5 enrichment (v0.1.6): records collected during the stream so the
	// post-stream patch phase can derive parent→children + facet hubs without
	// re-reading the vault. One lightweight record per written note. Only
	// populated when the recipe declares target.enrichment.
	const enrichmentEnabled = !!recipe.target.enrichment;
	const enrichRecords: EnrichRecord[] = [];
	// parent_note: 'folder-note' needs the whole batch's shape up front — a
	// streamed (AsyncIterable) source can't provide that (design §3 step 2 v1
	// restriction). applyEnrichment falls back to sibling + a deviation.
	const isStreamed = !Array.isArray(parsedData.rows);
	// v0.1.4.5: streaming-friendly iteration (array OR AsyncIterable<Row>).
	// v0.1.6 (2026-06-13): writes run in a bounded concurrency pool; the sync
	// prefix (render + collision reserve) stays in row order.
	const total = parsedData.rowCount > 0 ? parsedData.rowCount : -1;
	const ensureFolderOnce = createFolderEnsurer(app);
	const limit = Math.max(1, options.concurrency ?? DEFAULT_CONCURRENCY);
	let completed = 0;

	await forEachConcurrent(
		parsedData.rows as Iterable<Record<string, any>> | AsyncIterable<Record<string, any>>,
		limit,
		async (row, idx) => {
		const rowNum = idx + 1;

		try {
			// 1. Build CURIE for this row
			const localPart = options.curieLocalPart
				? options.curieLocalPart(row, rowNum)
				: defaultCurieLocalPart(row, rowNum);
			const curie = `${curiePrefix}:${localPart}`;

			// 2. Render. The report collects per-row deviations (skipped folder
			//    level, split/regex fallback) — the row still imports; the
			//    deviation surfaces as a warning instead of silent weirdness.
			const renderReport: RenderReport = { notes: [] };
			let address;
			try {
				address = render(recipe, { curie, scope: row as Record<string, unknown> }, renderReport);
			} catch (err) {
				if (err instanceof RenderError) {
					result.errors.push({ row: rowNum, message: `render() failed: ${err.message}` });
					return;
				}
				throw err;
			}
			if (renderReport.notes.length > 0) {
				result.warnings ??= [];
				for (const note of renderReport.notes) {
					result.warnings.push({ row: rowNum, message: note.detail });
				}
			}

			// 3. Build full path
			const recipePath = address.primary.path;
			const fullPath = options.basePath
				? normalizePath(`${options.basePath}/${recipePath}`)
				: normalizePath(recipePath);

			if (!fullPath || fullPath === '.md') {
				result.errors.push({
					row: rowNum,
					message: 'Empty or invalid path produced by render(); check recipe.target.layout templates.',
				});
				return;
			}

			// 4. Path collision detection
			if (emittedPaths.has(fullPath)) {
				result.errors.push({
					row: rowNum,
					message: `Path collision: ${fullPath} already produced earlier in this import. Two source rows resolve to the same target file.`,
				});
				return;
			}
			emittedPaths.add(fullPath);

			// 5. Compose frontmatter
			const frontmatter: Record<string, any> = { ...address.frontmatter };
			if (address.tags.length > 0) {
				const tags = normalizeTagList(address.tags);
				if (tags.length > 0) frontmatter.tags = tags;
			}
			if (address.aliases.length > 0) {
				const aliases = normalizeAliasList(address.aliases);
				if (aliases.length > 0) frontmatter.aliases = aliases;
			}
			frontmatter._crosswalker = buildProvenance(
				{
					sourceFile: options.sourceFileName,
					sourceVersion: options.sourceVersion ?? recipe.source?.version,
					recipeId: recipe.recipe,
					recipeHash,
					conceptCid: computeConceptCid({ curie, scope: row as Record<string, unknown> }),
				},
				PLUGIN_VERSION,
			);

			// 6. Validate against Tier 1 schema BEFORE writing. STRM predicate
			//    enforcement happens inside the schema's crosswalk_edge_frontmatter
			//    enum constraint; AJV catches it here.
			const validation = validateTier1Frontmatter(frontmatter);
			if (!validation.valid) {
				const errMsg = `Tier 1 validation failed for row ${rowNum} (${fullPath}): ${
					validation.errors.length > 0 ? validation.errors.join('; ') : 'unknown'
				}`;
				if (strict) {
					result.errors.push({ row: rowNum, message: errMsg });
					return;
				} else {
					debug?.warn('generation', 'validation-warning', `Validation warning at ${fullPath} (non-strict mode)`, { path: fullPath, error: errMsg });
				}
			}

			// 7. Existing-file handling + merge. Consults BOTH the sibling path AND
			//    (when enrichment is on) the folder-note-relocated path by curie —
			//    see resolveWriteTarget's docstring (re-import identity, design §4).
			const target = resolveWriteTarget(app, fullPath, curie, enrichmentEnabled);
			const existingFile = target.existingFile;
			const writePath = target.writePath;
			if (existingFile instanceof TFile) {
				if (options.overwriteMode === 'skip') {
					result.skipped.push(writePath);
					return;
				} else if (options.overwriteMode === 'error') {
					result.errors.push({ row: rowNum, message: `File already exists: ${writePath}` });
					result.success = false;
					return;
				}
				// 'replace' — merge with existing
				try {
					const existingFm = await readExistingFrontmatter(app, existingFile);
					if (existingFm && Object.keys(existingFm).length > 0) {
						const userPreserve = recipe.target.also_emit?.frontmatter?.user_preserve ?? [];
						const managedKeys = computeManagedKeys(frontmatter, userPreserve);
						const merged = mergeFrontmatter(existingFm, frontmatter, managedKeys);
						Object.keys(frontmatter).forEach((k) => delete frontmatter[k]);
						Object.assign(frontmatter, merged);
					}
				} catch (mergeErr) {
					debug?.warn('generation', 'frontmatter-merge-failed', `Frontmatter merge failed at ${writePath}; using new frontmatter as-is`, {
						path: writePath,
						error: mergeErr instanceof Error ? mergeErr.message : String(mergeErr),
					});
				}
			}

			// 8. Ensure parent folder
			const parentPath = getParentPath(writePath);
			if (parentPath && createFolders) {
				await ensureFolderOnce(parentPath);
			}

			// 9. Body — deterministic H1 plus the canonical regions already
			// evaluated by pure render(). Generation only assembles Markdown.
			const body = buildDefaultBody(frontmatter, address);

			// 10. Write
			const content = buildNoteContent(frontmatter, body);
			if (existingFile instanceof TFile) {
				await app.vault.modify(existingFile, content);
			} else {
				await app.vault.create(writePath, content);
			}
			result.created.push(writePath);

			// Collect a record for Pass 1.5 enrichment (parent→children + facet hubs).
			if (enrichmentEnabled) {
				const facets = options.facetsForRow
					? options.facetsForRow(row as Record<string, unknown>, rowNum)
					: facetMembershipsFromTags(address.tags);
				enrichRecords.push({ path: writePath, renderedPath: fullPath, curie, frontmatter: { ...frontmatter }, facets, body });
			}
		} catch (rowError) {
			const errorMessage = rowError instanceof Error ? rowError.message : String(rowError);
			result.errors.push({ row: rowNum, message: errorMessage });
			debug?.error('generation', 'row-error', `Row ${rowNum} failed`, { row: rowNum, error: errorMessage });
		} finally {
			completed += 1;
			if (options.onProgress && (completed % 10 === 0 || completed === total)) {
				options.onProgress(completed, total, `Processing row ${completed}`);
			}
		}
		},
	);

	// Pass 1.5 — batch enrichment patch phase (post-stream). Derives parent→children
	// + facet hubs from the collected records (never re-reads the vault for the
	// derivation), then writes children onto parents and materializes hub notes via
	// the same managed-merge path so re-imports stay idempotent + user-safe.
	if (enrichmentEnabled && enrichRecords.length > 0) {
		try {
			await applyEnrichment(
				app,
				recipe,
				{ ...options, sourceVersion: options.sourceVersion ?? recipe.source?.version },
				curiePrefix,
				enrichRecords,
				result,
				isStreamed,
				debug,
			);
		} catch (enrichErr) {
			const msg = enrichErr instanceof Error ? enrichErr.message : String(enrichErr);
			result.warnings ??= [];
			result.warnings.push({ row: 0, message: `Enrichment pass failed: ${msg}` });
			debug?.error('generation', 'enrichment-failed', 'Enrichment pass failed', { error: msg });
		}
	}

	if (options.onProgress) options.onProgress(completed, total, 'Complete');
	if (result.errors.length > 0) result.success = false;
	result.duration = Date.now() - startTime;

	debug?.info('generation', 'recipe-complete', `generateFromRecipe: complete (${result.created.length} created, ${result.errors.length} errors, ${result.warnings?.length ?? 0} warnings, ${result.edgeCount ?? 0} edges)`, {
		success: result.success,
		created: result.created.length,
		skipped: result.skipped.length,
		errors: result.errors.length,
		warnings: result.warnings?.length ?? 0,
		duration: result.duration,
	});

	return result;
}

/**
 * Best-effort facet memberships from a note's rendered (tagsafe) facet tags.
 * Each `namespace/value` tag → one membership; nested tags (several slashes)
 * split on the LAST slash. Display value is the tagsafe token (lowercased) — the
 * mapping-driven `facetsForRow` callback preserves original casing when the
 * caller can supply it. Deterministic. Exported for tests.
 */
export function facetMembershipsFromTags(tags: string[]): FacetMembership[] {
	const out: FacetMembership[] = [];
	for (const tag of tags) {
		const clean = String(tag).replace(/^#+/, '').trim();
		const slash = clean.lastIndexOf('/');
		if (slash <= 0 || slash === clean.length - 1) continue; // need namespace + value
		out.push({ namespace: clean.slice(0, slash), value: clean.slice(slash + 1) });
	}
	return out;
}

/**
 * Pass 1.5 enrichment patch phase (post-stream). Derives parent→children +
 * facet hubs from the in-memory records, then writes `children` onto parents and
 * materializes facet hub notes — both via the managed-merge path so re-imports
 * are idempotent and user prose / user frontmatter survives.
 *
 * Shared between `generateFromRecipe` (native Ch 22 recipes) and `generateNotes`
 * (the legacy column-role / workbench path) — `options` only needs the
 * structural subset both callers' option shapes carry (see
 * `EnrichmentWriteOptions`), so this one phase runs identically after either
 * write loop.
 */
async function applyEnrichment(
	app: App,
	recipe: Recipe,
	options: EnrichmentWriteOptions,
	curiePrefix: string,
	records: EnrichRecord[],
	result: GenerationResult,
	streamed: boolean,
	debug?: DebugLog,
): Promise<void> {
	const config = recipe.target.enrichment ?? {};
	// Hub/facet notes are synthetic (no source row → no concept identity), so
	// they carry recipe.hash but never concept_cid — see the two buildProvenance
	// calls below. Computed once per applyEnrichment call (one per generation run).
	const recipeHash = computeRecipeHash(recipe.target);
	const enrichment = enrich(
		records.map((r) => ({
			path: r.path,
			curie: r.curie,
			frontmatter: r.frontmatter,
			facets: r.facets,
			renderedPath: r.renderedPath,
		})),
		{ ontology: curiePrefix, config, streamed, rootFolder: options.basePath },
	);
	result.edgeCount = enrichment.edgeCount;

	if (enrichment.deviations.length > 0) {
		result.warnings ??= [];
		for (const d of enrichment.deviations) result.warnings.push({ row: 0, message: d });
	}

	const recordsByPath = new Map(records.map((r) => [r.path, r]));

	// 0. Parent-note relocations (batch-enrichment design §3 step 2) — physically
	//    move each file BEFORE the children-list patch below, which writes to
	//    the FINAL (post-relocation) path — enrichment.childrenByPath is
	//    already keyed by it. Processed in the order enrich() produced them
	//    (sorted by curie, deterministic). By the time this runs, the row
	//    write loop's resolveWriteTarget has already resolved every note to
	//    wherever it CURRENTLY lives (curie-verified), so most relocations here
	//    are genuinely NEW transitions — a note already in its target shape
	//    never appears in `enrichment.relocations` (enrich()'s idempotency
	//    guard), so re-importing the same config twice is a no-op here.
	for (const reloc of enrichment.relocations) {
		const record = recordsByPath.get(reloc.from);
		const file = app.vault.getAbstractFileByPath(normalizePath(reloc.from));
		if (!record || !(file instanceof TFile)) {
			debug?.warn('generation', 'relocation-source-missing', `Could not relocate ${reloc.curie}: ${reloc.from} not found`, {
				curie: reloc.curie,
				from: reloc.from,
			});
			continue;
		}
		const toPath = normalizePath(reloc.to);
		if (app.vault.getAbstractFileByPath(toPath)) {
			// Shouldn't happen — enrich() already guards against in-batch path
			// collisions. Something outside this batch occupies the target;
			// leave the note where it is rather than risk clobbering it.
			result.warnings ??= [];
			result.warnings.push({
				row: 0,
				message: `parent_note: could not relocate ${reloc.curie} — ${toPath} already exists in the vault (not produced by this import).`,
			});
			continue;
		}
		const relocParentPath = getParentPath(toPath);
		if (relocParentPath) await ensureFolderExists(app, relocParentPath).catch(() => {});
		await app.vault.rename(file, toPath);

		recordsByPath.delete(reloc.from);
		record.path = toPath;
		recordsByPath.set(toPath, record);

		const createdIdx = result.created.indexOf(reloc.from);
		if (createdIdx !== -1) {
			result.created[createdIdx] = toPath;
		} else {
			const skippedIdx = result.skipped.indexOf(reloc.from);
			if (skippedIdx !== -1) result.skipped[skippedIdx] = toPath;
		}
	}

	// 1. Children lists + level-hub "hosted" Contents sections — combined into
	//    ONE write per note, since a note can be both a children_lists parent
	//    AND a level-hub host (the common case: a folder-note-relocated
	//    concept). `patch.children` → managed `children` frontmatter array
	//    (children_lists); `patch.hubChildren` → the managed body "Contents"
	//    section (level_hubs='notes', hosted folders — module doc step 4.5).
	const patchByPath = new Map<string, { children?: string[]; hubChildren?: string[] }>();
	for (const [path, children] of enrichment.childrenByPath) {
		patchByPath.set(path, { ...(patchByPath.get(path) ?? {}), children });
	}
	for (const [path, children] of enrichment.levelHubs.hostedChildrenByPath) {
		patchByPath.set(path, { ...(patchByPath.get(path) ?? {}), hubChildren: children });
	}
	for (const [path, patch] of patchByPath) {
		const record = recordsByPath.get(path);
		if (!record) continue;
		const file = app.vault.getAbstractFileByPath(normalizePath(path));
		if (!(file instanceof TFile)) continue;
		// Rebuild deterministically: drop any STALE `children` (a prior import's
		// merge may have preserved it at the front, since render() doesn't emit it),
		// then re-append the fresh list just before the provenance block so the key
		// order is identical on every re-import (matches the golden shape).
		const { _crosswalker, children: _stale, ...rest } = record.frontmatter as Record<string, unknown>;
		void _stale;
		const frontmatter = {
			...rest,
			...(patch.children ? { children: patch.children } : {}),
			...(_crosswalker !== undefined ? { _crosswalker } : {}),
		};
		let body = record.body;
		if (patch.hubChildren) {
			body = mergeManagedChildrenSection(body, buildManagedChildrenSection('Contents', patch.hubChildren));
			if (config.waypoint_marker) body = ensureWaypointMarker(body);
		}
		await app.vault.modify(file, buildNoteContent(frontmatter, body));
	}

	// 2. Facet hub notes — create or merge, preserving user body prose + user keys.
	const userPreserve = recipe.target.also_emit?.frontmatter?.user_preserve ?? [];
	for (const hub of enrichment.hubs) {
		const fullPath = options.basePath ? normalizePath(`${options.basePath}/${hub.path}`) : normalizePath(hub.path);
		const frontmatter: Record<string, any> = { ...hub.frontmatter };
		frontmatter._crosswalker = buildProvenance(
			{ sourceFile: options.sourceFileName, sourceVersion: options.sourceVersion, recipeId: recipe.recipe, recipeHash },
			PLUGIN_VERSION,
		);
		let body = hub.body;

		const existing = app.vault.getAbstractFileByPath(fullPath);
		if (existing instanceof TFile) {
			// Re-import: regenerate managed members, preserve user frontmatter + prose.
			try {
				const existingFm = await readExistingFrontmatter(app, existing);
				if (existingFm && Object.keys(existingFm).length > 0) {
					const managedKeys = computeManagedKeys(frontmatter, userPreserve);
					const merged = mergeFrontmatter(existingFm, frontmatter, managedKeys);
					Object.keys(frontmatter).forEach((k) => delete frontmatter[k]);
					Object.assign(frontmatter, merged);
				}
				const existingText = await app.vault.read(existing);
				body = mergeHubBody(stripFrontmatterBlock(existingText), hub.body);
			} catch (mergeErr) {
				debug?.warn('generation', 'hub-merge-failed', `Hub merge failed at ${fullPath}; using fresh content`, {
					path: fullPath,
					error: mergeErr instanceof Error ? mergeErr.message : String(mergeErr),
				});
			}
			await app.vault.modify(existing, buildNoteContent(frontmatter, body));
		} else {
			const parentPath = getParentPath(fullPath);
			if (parentPath) await ensureFolderExists(app, parentPath).catch(() => {});
			await app.vault.create(fullPath, buildNoteContent(frontmatter, body));
			result.created.push(fullPath);
		}
	}

	// 3. Synthetic level-hub notes (level_hubs='notes', pure structural folders
	//    with no hosting concept note — module doc step 4.5). `hub.path` here is
	//    ALREADY a full vault-relative path (it was built from `rootFolder`,
	//    i.e. `options.basePath`) — unlike facet `hub.path` above (relative to
	//    `hub_note_folder`), this one must NOT be re-prefixed with basePath.
	for (const hub of enrichment.levelHubs.notes) {
		const fullPath = normalizePath(hub.path);
		const frontmatter: Record<string, any> = { ...hub.frontmatter };
		frontmatter._crosswalker = buildProvenance(
			{ sourceFile: options.sourceFileName, sourceVersion: options.sourceVersion, recipeId: recipe.recipe, recipeHash },
			PLUGIN_VERSION,
		);
		let body = hub.body;

		const existing = app.vault.getAbstractFileByPath(fullPath);
		if (existing instanceof TFile) {
			// Re-import: regenerate the managed Contents section, preserve user
			// frontmatter + any prose outside it (title, notes, etc.).
			try {
				const existingFm = await readExistingFrontmatter(app, existing);
				if (existingFm && Object.keys(existingFm).length > 0) {
					const managedKeys = computeManagedKeys(frontmatter, userPreserve);
					const merged = mergeFrontmatter(existingFm, frontmatter, managedKeys);
					Object.keys(frontmatter).forEach((k) => delete frontmatter[k]);
					Object.assign(frontmatter, merged);
				}
				const existingText = await app.vault.read(existing);
				// hub.facetLinks: the ROOT hub only (enrich.ts's computeLevelHubs) —
				// re-derive the same "Facets" extraGroup a fresh import would build,
				// so a re-import doesn't silently drop it (the merge rebuilds the
				// managed section from these fields, never by re-parsing `body`).
				const facetGroup = hub.facetLinks ? [{ label: 'Facets', links: hub.facetLinks }] : [];
				const freshSection = buildManagedChildrenSection('Contents', hub.childrenLinks ?? [], facetGroup);
				body = mergeManagedChildrenSection(stripFrontmatterBlock(existingText), freshSection);
			} catch (mergeErr) {
				debug?.warn('generation', 'level-hub-merge-failed', `Level hub merge failed at ${fullPath}; using fresh content`, {
					path: fullPath,
					error: mergeErr instanceof Error ? mergeErr.message : String(mergeErr),
				});
			}
			if (config.waypoint_marker) body = ensureWaypointMarker(body);
			await app.vault.modify(existing, buildNoteContent(frontmatter, body));
		} else {
			if (config.waypoint_marker) body = ensureWaypointMarker(body);
			const parentPath = getParentPath(fullPath);
			if (parentPath) await ensureFolderExists(app, parentPath).catch(() => {});
			await app.vault.create(fullPath, buildNoteContent(frontmatter, body));
			result.created.push(fullPath);
		}
	}
}

/** Strip a leading `---\n…\n---` frontmatter block, returning the body text. */
function stripFrontmatterBlock(text: string): string {
	const normalized = text.replace(/\r\n/g, '\n');
	if (!normalized.startsWith('---\n')) return normalized;
	const end = normalized.indexOf('\n---', 3);
	if (end === -1) return normalized;
	const afterFence = normalized.indexOf('\n', end + 1);
	return afterFence === -1 ? '' : normalized.slice(afterFence + 1);
}

/** Default body for native-recipe-rendered notes: H1 plus rendered regions. */
function buildDefaultBody(
	frontmatter: Record<string, any>,
	address: ReturnType<typeof render>,
): string {
	const title = frontmatter.title ?? frontmatter.curie ?? 'Untitled';
	const managedBody = renderedBodyRegionsToMarkdown(address.body);
	return managedBody === '' ? `# ${title}\n` : `# ${title}\n\n${managedBody}\n`;
}

/**
 * Default per-row CURIE local part: row.curie's local part if present, else
 * row.id, else row.subject_id, else row-N.
 */
function defaultCurieLocalPart(row: Record<string, unknown>, rowNum: number): string {
	const candidate = row.curie ?? row.id ?? row.subject_id ?? row.control_id ?? row.code;
	if (typeof candidate === 'string' && candidate.length > 0) {
		// If it's already a full CURIE, take the local part
		const colonIdx = candidate.indexOf(':');
		const local = colonIdx > 0 ? candidate.slice(colonIdx + 1) : candidate;
		return sanitizeFileName(local);
	}
	return `row-${rowNum}`;
}
