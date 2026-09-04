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
	type SourceScope,
} from '../render';
import { legacyConfigToRecipe, LEGACY_ONTOLOGY_SENTINEL } from './legacy-recipe-shim';
// AM-28. `DeclaredCurieCharsetError` / `DeclaredCuriePrefixError` are thrown by
// `declaredCurieLocalPart` and are deliberately NOT caught by name here: both row
// loops already catch per row and push the message into `result.errors`, which is
// the actionable refusal the amendment asks for. Naming them would add a second
// place for the refusal wording to drift.
import {
	declaredCurieLocalPart,
	declaredIdentity,
	edgeIdentityLocalPart,
	injectiveCurieLocalPart,
	injectiveDeclaredIdLocalPart,
	slugifyForCurie,
} from './curie';
import { mergeFrontmatter, computeDeclaredManagedKeys, computeManagedKeys } from './frontmatter-merge';
import { buildIdentityIndex, type IdentityIndex } from './identity-index';
// AM-33: the tri-state note read, for the hub value index's cache-cold fallback.
import { readNoteFrontmatterState, type NoteFrontmatterRead } from '../export/vault-reader';
import { buildProvenance } from './provenance';
import { derivationOf, resolveImportSet, type ImportSetDerivation, type ImportSetOption, type ImportSetReference } from './import-set';
import {
	computeConceptCid,
	computeRecipeHash,
	computeReviewCid,
	computeReviewGroupCids,
	identityScopeForNoteKind,
	readReviewGroupCids,
	type ReviewGroupCids,
} from './hash';
import { reviewedAgainstFor } from '../views/evidence-link';
import { prepareSourceStage, SourceStageError, type SourceStage } from '../source';
import { SourceOrderStamper, stripBasePath, shouldStampSourceOrder } from './source-order';
import { validateTier1Frontmatter } from '../validation/validator';
import {
	enrich,
	folderNoteCandidatePath,
	buildManagedChildrenSection,
	mergeManagedChildrenSection,
	ensureWaypointMarker,
	type EnrichNote,
	type HubNote,
	type LayoutValue,
} from './enrich';
import { wrapManagedBody, scanRegions } from './managed-body';
import { mergeExistingNote, readExistingNote, ExistingNoteReadError } from './existing-note';
import type { FacetMembership } from '../import/mapping/facets';
import { normalizeMappingSetId, normalizePredicateModifierInput } from '../utils/mapping-provenance';

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

	/** Import-set selection from the review step. Absent applies destination discovery. */
	importSet?: ImportSetOption;

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
	/**
	 * Carried in so the enrichment phase can honour `skip` on its own. A hub
	 * relocation is a change to the vault, and `skip` means leave existing notes
	 * alone; the row loops already gate their moves on this, and the enrichment
	 * phase must not be the one place whose safety depends on the caller having
	 * chosen a destination that never asks for a move.
	 */
	overwriteMode?: 'skip' | 'replace' | 'error';
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
		duration: 0,
		// AM-7. Starts FALSE, not absent. A run that throws before the orphan pass
		// checked nothing, and a reader must not read that silence as `no orphans`.
		// The orphan pass below sets it true only when it actually ran.
		orphansChecked: false,
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

		// v0.1.3: translate the legacy v0.1.0 config shape into a Ch 22 Recipe
		// once before the per-row loop. The recipe is what render() consumes.
		// The shape workbench passes a pre-built recipe (recipeOverride) so its
		// full mechanism set survives; otherwise the legacy shim translates.
		// AM-1: the source file name reaches the shim so a nameless classic import
		// stamps its file stem as the ontology instead of the `unknown` sentinel.
		// Failure mode prevented: every nameless classic import sharing one
		// placeholder identity, which makes two unrelated frameworks look like
		// the same source.
		//
		// AM-6 moved this ABOVE ownership resolution: the ontology this source
		// proposes is an input to resolving the set, because a set that already
		// exists overrides the proposal with the ontology it is pinned to.
		const recipe = options.recipeOverride
			?? legacyConfigToRecipe(config as ImportRecipe, { sourceFileName: options.sourceFileName });
		// Compute recipe ownership once and reuse the exact value written to
		// `_crosswalker.recipe.id`; orphan detection must never invent a different
		// ownership key from the provenance stored on notes.
		const provenanceRecipeId = options.recipeOverride
			? recipe.recipe
			: (options.configId ?? recipe.recipe);
		// AM-6. What this run WOULD mint curies under if the set were new. A
		// proposal, not the answer: see `ontologyId` below.
		const proposedOntologyId = recipe.source?.ontology ?? (config.name ?? LEGACY_ONTOLOGY_SENTINEL);

		// Ownership is minted or selected once per run, before any note is written.
		// Never derive this id from recipe/source/path: all are allowed to change on
		// a legitimate refresh, while the import set must remain the same.
		const importSet = await resolveImportSet(app, options.basePath, options.importSet, proposedOntologyId);

		// Ensure base folder exists
		if (options.createFolders) {
			await ensureFolderExists(app, options.basePath);
		}

		// Snapshot this set's PRE-RUN membership. Metadata-cache updates are not
		// guaranteed to land before generation completes, and orphan reporting asks
		// what the set owned before this run, not what the cache happens to expose
		// after writes. recipeId stays as the deprecated grace parameter; the
		// import-set filter takes precedence, so unstamped legacy notes stay outside.
		const ownedIdentityIndex = await buildIdentityIndex(app, {
			importSetId: importSet.id,
			recipeId: provenanceRecipeId,
		});
		// Authority for which frontmatter keys this run OWNS comes from the recipe's
		// declaration, not from which keys happened to render non-empty for a row.
		// Without this, a declared field that renders empty is absent from managedKeys,
		// so the merge below mistakes the stale previous value for user content and
		// keeps it forever - which silently inverts a predicate_modifier of NOT.
		const declaredManagedKeys = computeDeclaredManagedKeys(recipe.target.also_emit?.frontmatter);
		// One pass over the vault's markdown list, reading Obsidian's existing metadata
		// cache. Lets every row below find its note by identity instead of by address.
		const identityIndex = await buildIdentityIndex(app);
		if (identityIndex.collisions.length > 0) {
			// Two notes claiming one concept is ambiguous. Choosing a winner silently is
			// how a duplicate becomes permanent, so report and let the caller decide.
			for (const c of identityIndex.collisions) {
				result.errors.push({ row: 0, message: `Ambiguous identity ${c.curie} claimed by: ${c.paths.join(', ')}` });
			}
		}

		// _crosswalker.recipe.hash: computed ONCE per generation run (the
		// recipe's target doesn't change per-row) and threaded through every
		// buildProvenance call this run makes — see src/generation/hash.ts.
		// `recipe.source` is passed at every call site so one recipe hashes to
		// one value no matter which code path computed it.
		const recipeHash = computeRecipeHash(recipe.target, recipe.source);

		// Track paths emitted in THIS generation pass to detect collisions
		// (two source rows rendering to the same vault path).
		const emittedPaths = new Set<string>();
		const producedCuries = new Set<string>();
		// AM-27. Which ROW produced each curie, so the duplicate refusal can name
		// both claimants. `producedCuries` alone cannot: it also carries the hub
		// identities enrichment implies, which have no row.
		const curieOrigins = new Map<string, ProducedCurieOrigin>();
		const sourceOrderStamper = new SourceOrderStamper();

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
		// AM-6. The SET decides the ontology, not the run. A refresh that
		// recomputed this from its own recipe could land on a different answer
		// (a renamed config, a differently named export file), and every curie it
		// then wrote would match none of the notes the set already owns: a second
		// copy of the whole framework, with every original reported as an orphan.
		// A set with no pin (legacy, or genuinely new) falls back to the proposal.
		const ontologyId = importSet.ontology ?? proposedOntologyId;
		// AM-13. The SET's scheme decides the identity space, not just the ontology.
		// A set minted set-qualified writes qualified curies for its concepts and
		// for every hub enrichment derives from this prefix, which is what lets a
		// second release of the same framework exist beside the first.
		const curiePrefix = curiePrefixFor(importSet, ontologyId);
		// AM-34. The un-qualified ontology prefix behind it. A source states this
		// one; the vault holds the resolved one; the set stamp records what turns
		// one into the other.
		const basePrefix = baseCuriePrefixFor(importSet, ontologyId);
		const enrichRecords: EnrichRecord[] = [];
		// AM-2. Rows this run KEPT rather than wrote (overwriteMode 'skip').
		//
		// Failure mode prevented: a skip refresh orphaning every hub the set owns.
		// A skipped row is still a row this run vouches for, but the skip branch
		// returns above the enrichment bookkeeping, so an unchanged set produced no
		// enrichRecords at all, `applyEnrichment` never ran, no hub curie was ever
		// marked produced, and orphan detection then reported every hub as gone.
		// These records are used for BOOKKEEPING ONLY -- never written, never
		// merged, never relocated -- so hub prose is untouched.
		const keptRecords: EnrichRecord[] = [];
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

		// SOURCE STAGE, same spec-owned position as in generateFromRecipe. The
		// wizard/workbench path accepts a full recipe through `recipeOverride`,
		// so a declared predicate reaches here too. Ignoring it on this path
		// would be exactly the silent, shape-dependent degradation the whole
		// loudness contract exists to prevent. A legacy config carries no source
		// shaping, so this path is unchanged for every wizard import.
		let sourceStage: SourceStage;
		try {
			sourceStage = await prepareSourceStage(parsedData, recipe.source);
		} catch (stageErr) {
			if (!(stageErr instanceof SourceStageError)) throw stageErr;
			result.errors.push({ row: stageErr.row ?? 0, message: stageErr.message, declaration: stageErr.declaration });
			result.success = false;
			result.duration = Date.now() - startTime;
			debug?.error('generation', 'source-stage-preflight-failed', stageErr.message, {
				declaration: stageErr.declaration,
				expression: stageErr.expression,
			});
			return result;
		}
		let sourceStageFailure: SourceStageError | null = null;
		const captureSourceStageFailure = (stageErr: unknown): void => {
			if (!(stageErr instanceof SourceStageError)) throw stageErr;
			sourceStageFailure = stageErr;
			result.errors.push({ row: stageErr.row ?? 0, message: stageErr.message, declaration: stageErr.declaration });
			result.success = false;
			debug?.error('generation', 'source-stage-failed', stageErr.message, {
				declaration: stageErr.declaration,
				expression: stageErr.expression,
				row: stageErr.row,
			});
		};

		await forEachConcurrent(
			sourceStage.rows as Iterable<Record<string, any>> | AsyncIterable<Record<string, any>>,
			limit,
			async (row, idx) => {
				// The SOURCE row number, identical to `idx + 1` whenever no
				// source shaping is declared.
				const rowNum = sourceStage.sourceRowNumber(row, idx); // 1-indexed for user display
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
						curiePrefix,
						basePrefix,
						renderReport,
						recipeHash,
						provenanceRecipeId,
						importSet,
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

					// AM-12. A write never crosses a set boundary. The vault-wide index is
					// consulted for DETECTION only: a note elsewhere in the vault already
					// holding this curie, under a different set, is reported by name and the
					// row is dropped - not adopted, not moved, not restamped, and with no
					// fall back to its address. A refused row naming its owner beats an
					// annexed framework.
					//
					// Refused the moment the curie is known rather than at the write itself:
					// a row this run declines to write must not be counted as produced, must
					// not reserve its rendered path against a later row, and must not be
					// recorded anywhere as a note that is going to exist.
					const foreign = foreignSetClaim(ownedIdentityIndex, identityIndex, noteData.curie);
					if (foreign) {
						result.errors.push({ row: rowNum, message: crossSetCollisionMessage(noteData.curie, foreign) });
						return;
					}

					// AM-27. Within-run injectivity. Sits beside the cross-set refusal
					// because both are answers about identity alone: a row refused here
					// must not reserve its rendered path against a later row, must not be
					// counted as produced, and must not cost a render or a folder.
					const firstClaim = curieOrigins.get(noteData.curie);
					if (firstClaim) {
						result.errors.push({ row: rowNum, message: duplicateCurieMessage(noteData.curie, firstClaim) });
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

					// AM-14. The ADDRESS is the last route into a note, so write resolution
					// runs HERE, above every record this row would otherwise leave behind. A
					// row refused at its address must not reserve its rendered path against a
					// later row, must not be counted as produced, and must not be stamped with
					// a source order, exactly as AM-12's identity refusal must not. Resolution
					// is a pure set of lookups; only the point at which it runs moved.
					//
					// Deliberately BELOW the path-collision check: two rows rendering one
					// address are that check's answer, and letting the second row race the
					// first row's freshly written file into an address refusal would report a
					// source problem as a vault problem.
					const fullPath = normalizePath(noteData.path);
					// AM-12: the OWNED index resolves. Every row whose identity is held
					// outside this set was refused above, so a hit here is always a note this
					// run owns. AM-14: the vault-wide index plus the set id are what the
					// ADDRESS branches judge with, and they report rather than adopt.
					const target = resolveWriteTarget(
						app,
						fullPath,
						noteData.curie,
						enrichmentEnabled,
						ownedIdentityIndex,
						identityIndex,
						importSet.id,
					);
					if (target.refusal) {
						reportAddressRefusal(result, debug, target.refusal, rowNum, noteData.curie);
						return;
					}

					emittedPaths.add(noteData.path);

					// P1 (2026-07-27): stamp source publication order onto concept
					// notes. Sync prefix — see SourceOrderStamper's determinism note.
					if (shouldStampSourceOrder(noteData.frontmatter)) {
						noteData.frontmatter.source_order = sourceOrderStamper.stamp(
							stripBasePath(noteData.path, options.basePath),
							rowNum,
						);
					}

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

					// This identity belongs to the current source set even when the note is
					// skipped or merged rather than newly created.
					// AM-27. Recorded only once the row is past every refusal above: a row
					// this run declines to write has claimed nothing, so a later row with
					// the same identity is the FIRST claimant, not a duplicate.
					// AM-31: through the one claim function, so the produced set and the
					// origin map cannot record different things.
					claimProducedCurie(producedCuries, curieOrigins, noteData.curie, {
						row: rowNum, path: noteData.path, kind: 'row',
					});

					// The write target was resolved above (AM-14), before this row reserved
					// anything. Consults BOTH the sibling path AND (when enrichment is on) the
					// folder-note-relocated path by curie — see resolveWriteTarget's docstring
					// (re-import identity, design §4).
					const existingFile = target.existingFile;
					const writePath = target.writePath;

					// The vault holds this concept at a stale address. Move it, so links
					// pointing at it follow, rather than leaving a second copy behind.
					// Skipped when overwriteMode is 'skip': that mode means leave existing
					// notes entirely alone, and a move is still a change to the vault.
					if (existingFile instanceof TFile && target.moveFrom && options.overwriteMode !== 'skip') {
						const parent = getParentPath(writePath);
						if (parent && options.createFolders) await ensureFolderOnce(parent);
						await app.fileManager.renameFile(existingFile, writePath);
						(result.moved ??= []).push({ curie: noteData.curie, from: target.moveFrom, to: writePath });
						debug?.info('generation', 'identity-move', `Moved ${target.moveFrom} -> ${writePath}`, {
							curie: noteData.curie, from: target.moveFrom, to: writePath,
						});
					}

					if (existingFile instanceof TFile) {
						if (options.overwriteMode === 'skip') {
							// The path that EXISTS, never the one the move was going to use.
							// Reporting the desired path names a file the run deliberately did
							// not create, so "every reported path exists" stops holding and a
							// user following the report lands on nothing.
							const skippedPath = existingFile.path;
							result.skipped.push(skippedPath);
							debug?.info('generation', 'skipped-existing', `Skipped existing file ${skippedPath}`, { path: skippedPath });
							// AM-2. Record what was kept so the post-stream bookkeeping pass
							// can derive the hubs these rows imply. `path` is the note that
							// ACTUALLY exists, not the desired one: a bookkeeping pass keyed
							// on a path the run declined to create would derive hubs for a
							// shape the vault is not in.
							if (enrichmentEnabled) {
								keptRecords.push({
									path: skippedPath,
									renderedPath: fullPath,
									// AM-33: a kept row still describes the folders it implies.
									layoutValues: noteData.layoutValues,
									curie: noteData.curie,
									frontmatter: { ...noteData.frontmatter },
									facets: options.facetsForRow
										? options.facetsForRow(row as Record<string, unknown>, rowNum)
										: facetMembershipsFromTags(noteData.tags),
									// Never read: this record is never written back. Kept empty
									// rather than carrying a fresh render, which is exactly the
									// content a skip promised not to write.
									body: '',
								});
							}
							return;
						} else if (options.overwriteMode === 'error') {
							result.errors.push({
								row: rowNum,
								message: `File already exists: ${writePath}`
							});
							result.success = false;
							return;
						}
					}

					// 'replace' mode — ONE shared reader and merger decides what an
					// existing note becomes (src/generation/existing-note.ts). It merges
					// frontmatter on the managed/user_preserve split (Ch 22 §8.4) AND
					// rebuilds only the managed body region, so anything the user typed
					// outside it survives byte-for-byte. A note it cannot understand is a
					// per-note conflict: the file is not modified at all, and the run
					// continues. `generateFromRecipe` calls the same function; a fix that
					// lands on one path only is how a "removed" behaviour comes back.
					let bodyToWrite: string;
					if (existingFile instanceof TFile) {
						const userPreserve = recipe.target.also_emit?.frontmatter?.user_preserve ?? [];
						const managedKeys = computeManagedKeys(noteData.frontmatter, userPreserve, declaredManagedKeys);
						const outcome = await mergeExistingNote({
							app,
							file: existingFile,
							freshFrontmatter: noteData.frontmatter,
							managedKeys,
							freshManagedBody: noteData.body,
							kind: 'note',
						});
						if (!outcome.ok) {
							recordConflict(result, debug, writePath, noteData.curie, outcome.code, outcome.detail);
							return;
						}
						noteData.frontmatter = outcome.frontmatter;
						bodyToWrite = outcome.body;
					} else {
						bodyToWrite = wrapManagedBody(noteData.body);
					}

					// Ensure parent folder exists (de-duplicated across concurrent rows)
					const parentPath = getParentPath(writePath);
					if (parentPath && options.createFolders) {
						await ensureFolderOnce(parentPath);
					}

					// Build file content
					const content = buildNoteContent(noteData.frontmatter, bodyToWrite);

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
							// AM-33: the folder values this row rendered, so hub identity is
							// derived from facts rather than recovered from `dirname(path)`.
							layoutValues: noteData.layoutValues,
							curie: noteData.curie,
							frontmatter: { ...noteData.frontmatter },
							facets,
							// The body AS ACTUALLY WRITTEN, never the fresh render. Pass 1.5
							// writes this back (applyEnrichment step 1); pushing the unmerged
							// render here would destroy exactly the prose the row write just
							// preserved, silently undoing this whole slice.
							body: bodyToWrite,
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
		).catch(captureSourceStageFailure);

		// G3 — a predicate that admits nothing from a non-empty collection is an
		// error, checked at end of stream, after zero writes have happened.
		if (!sourceStageFailure) {
			try {
				sourceStage.finalize();
			} catch (stageErr) {
				captureSourceStageFailure(stageErr);
			}
		}

		// Pass 1.5 — batch enrichment patch phase (post-stream), same phase
		// generateFromRecipe runs. See applyEnrichment for the exact semantics
		// (children lists + facet hub notes + edgeCount, re-import-safe merge).
		let enrichmentComplete = true;

		// AM-2. Account for the rows this run KEPT, so a skip refresh of an
		// unchanged set reports zero orphans. Bookkeeping only, no writes.
		if (enrichmentEnabled && keptRecords.length > 0 && !sourceStageFailure) {
			enrichmentComplete = markKeptHubsProduced({
				recipe,
				curiePrefix,
				basePath: options.basePath,
				streamed: isStreamed,
				records: [...enrichRecords, ...keptRecords],
				producedCuries,
				result,
				debug,
			}) && enrichmentComplete;
		}

		if (enrichmentEnabled && enrichRecords.length > 0 && !sourceStageFailure) {
			try {
				await applyEnrichment(
					app,
					recipe,
					{
						basePath: options.basePath,
						sourceFileName: options.sourceFileName,
						sourceVersion: options.frameworkVersion ?? recipe.source?.version,
						overwriteMode: options.overwriteMode,
					},
					curiePrefix,
					enrichRecords,
					result,
					importSet,
					producedCuries,
					curieOrigins,
					isStreamed,
					{ owned: ownedIdentityIndex, vaultWide: identityIndex },
					debug,
				);
			} catch (enrichErr) {
				enrichmentComplete = false;
				const msg = enrichErr instanceof Error ? enrichErr.message : String(enrichErr);
				result.warnings ??= [];
				result.warnings.push({ row: 0, message: `Enrichment pass failed: ${msg}` });
				debug?.error('generation', 'enrichment-failed', 'Enrichment pass failed', { error: msg });
			}
		}

		// Orphan detection is safe only after every expected row was visited and no
		// row failed. A partial source would make every unvisited identity look gone.
		// Membership is import-set-only: legacy unstamped notes are outside the set,
		// and enrichment hubs are included because applyEnrichment records their
		// curies at the same point that it stamps their ownership provenance.
		// Rows the source stage excluded were still seen and decided, so they count
		// toward "the whole source was processed". `excludedCount` is 0 whenever no
		// source shaping is declared.
		// Report what the predicate dropped. The wizard used to show this at parse
		// time; `source.where` runs at generation now, so the count travels here.
		if (sourceStage.active) result.filteredOut = sourceStage.excludedCount;

		const rowCountComplete =
			parsedData.rowCount < 0 || completed + sourceStage.excludedCount === parsedData.rowCount;
		// AM-7. Record WHETHER detection ran, not just what it found. Absent
		// `orphans` means both `a complete run found none` and `nobody could
		// check`, and a caller that cannot tell them apart tells the user their
		// framework is intact when the run never looked.
		result.orphansChecked = result.success && result.errors.length === 0 && rowCountComplete && enrichmentComplete;
		if (result.orphansChecked) {
			const orphans = ownedIdentityIndex.curies()
				.filter((curie) => !producedCuries.has(curie))
				.map((curie) => ({ curie, path: ownedIdentityIndex.get(curie)!.path }))
				.sort((a, b) => a.curie.localeCompare(b.curie) || a.path.localeCompare(b.path));
			if (orphans.length > 0) result.orphans = orphans;
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
 * Record a per-note conflict: a good note was produced and DELIBERATELY not
 * written, because the engine could not prove what modifying the file would do.
 *
 * Never `result.success = false`, never an abort. Aborting a 1,200-row import at
 * row 900 leaves a half-written tree, which Ch 45 §4.4 step 5 already names as
 * the bad shape. "Fail closed" means the FILE, not the RUN; the run-level abort
 * is `overwriteMode: 'error'` and always was.
 */
function recordConflict(
	result: GenerationResult,
	debug: DebugLog | undefined,
	path: string,
	curie: string | undefined,
	code: string,
	detail: string,
): void {
	(result.conflicts ??= []).push({ path, curie, code, detail });
	debug?.warn('generation', 'note-conflict', `Left ${path} unchanged: ${code}`, { path, curie, code, detail });
}

/**
 * AM-19 (2026-08-31). Surface ONE address refusal at the altitude that fits it.
 *
 * Three of the four reasons are ownership verdicts about a note the engine could
 * read: they are run errors, because the user has to decide something about the
 * vault (refresh the other set, move the stranger's note, pick another folder).
 * `unreadable` is not a verdict at all - it is a note the engine could not read -
 * and it is the same outcome `mergeExistingNote` produced before AM-14 closed the
 * address route: the file is left exactly as it stands and a per-note conflict
 * says why. Reporting it as an ownership error is what made a damaged note the
 * set genuinely owns read as "a note that is not Crosswalker's. Move or rename
 * that note", which is a false cause carrying a destructive instruction.
 *
 * One function so the four write sites cannot disagree about which surface a
 * given reason lands on.
 */
function reportAddressRefusal(
	result: GenerationResult,
	debug: DebugLog | undefined,
	refusal: AddressRefusal,
	row: number,
	curie?: string,
): void {
	if (refusal.reason === 'unreadable') {
		recordConflict(
			result,
			debug,
			refusal.path,
			curie,
			'frontmatter-unreadable',
			'Its properties block did not parse, so Crosswalker could not tell whether the note is one of its own. '
			+ 'Fix that block, then import again.',
		);
		return;
	}
	result.errors.push({ row, message: crossSetAddressMessage(refusal) });
}

/**
 * AM-13 (2026-08-30). The curie prefix one import set mints under.
 *
 * `endpoint-v1` is the ontology slug and nothing else, so every set minted
 * before this existed keeps the exact identities it already wrote.
 * `set-qualified-v1` appends the set id, which is what makes two releases of one
 * framework - or two crosswalks over one pair - occupy DIFFERENT identity spaces
 * instead of fighting over one. Applied at the prefix rather than at the leaf so
 * concept notes, facet hubs and level hubs are all qualified by the same rule:
 * enrichment builds hub curies from this prefix alone, so qualifying only the
 * concept leaf would leave every hub colliding and AM-12 refusing them.
 *
 * Idempotent on purpose. A legacy set-qualified set carrying no ontology pin
 * recovers its ontology from the prefix its own notes show, and that prefix is
 * already qualified; re-appending the id there would rename every note the set
 * owns, which is the exact failure AM-6 exists to prevent.
 */
export function curiePrefixFor(importSet: ImportSetReference, ontologyId: string): string {
	const base = slugifyForCurie(ontologyId);
	if (importSet.scheme !== 'set-qualified-v1') return base;
	const suffix = `-${importSet.id}`;
	return base.endsWith(suffix) ? base : `${base}${suffix}`;
}

/**
 * AM-34 (2026-09-01). The BASE ontology prefix behind `curiePrefixFor` - the
 * exact inverse of the set-qualification it applies.
 *
 * Set-qualification is a uniform re-prefixing recorded on every note it touches
 * (`_crosswalker.import_set` carries the scheme and the id that produced it), so
 * it is invertible: strip the id suffix and the identity the source declared is
 * back, byte-for-byte.
 *
 * Failure mode prevented: Crosswalker's own export becoming un-importable. A CSV
 * export writes `curie` as its first column; a second release of that framework
 * auto-mints set-qualified and writes `nist-iset-<id>:`; checking a declared
 * curie against THAT refused every row and told the user to rewrite their source
 * using a set id that does not exist until the import runs. The source states
 * `nist:AC-2` and always will; the qualification is the vault's business, not the
 * source's, and it is applied after the check rather than demanded before it.
 */
export function baseCuriePrefixFor(importSet: ImportSetReference, ontologyId: string): string {
	const base = slugifyForCurie(ontologyId);
	if (importSet.scheme !== 'set-qualified-v1') return base;
	const suffix = `-${importSet.id}`;
	return base.endsWith(suffix) ? base.slice(0, base.length - suffix.length) : base;
}

/**
 * AM-12 (2026-08-30). A note in the vault that already claims this identity and
 * is NOT owned by the set this run writes, or null.
 *
 * R3 settled in August that reconciliation only touches notes carrying matching
 * import-set provenance. The orphan pass has used the owned index since; the
 * write path never did, and resolved every row through a vault-wide index. A new
 * set whose curies collide with an existing set's - which `endpoint-v1` permits,
 * because two releases of one framework mint the same curies - therefore took the
 * other set's notes as `existingFile`, moved them, merged into them, and
 * restamped them with the new set's id. This is the detection half of applying
 * the ratified rule to the write path: the owned index resolves, the vault-wide
 * index only reports.
 */
function foreignSetClaim(
	owned: IdentityIndex | undefined,
	vaultWide: IdentityIndex | undefined,
	curie: string,
): ForeignClaim | null {
	if (!vaultWide) return null;
	// Owned wins outright. A note this run owns is this run's to reconcile, and
	// the vault-wide index holds it too.
	if (owned?.get(curie)) return null;
	const claimant = vaultWide.get(curie);
	if (!claimant) return null;
	// A null owner is a real and different case, not a missing string: a note
	// written before import sets existed carries provenance but no ownership, so
	// there is no set to send the user to. Naming a fabricated owner there would
	// point them at something they cannot find.
	return { path: claimant.path, setId: vaultWide.owner(curie) };
}

/** A note outside the set this run writes that already holds one of its identities. */
interface ForeignClaim {
	path: string;
	setId: string | null;
}

/**
 * The error a refused row reports. Names the identity, the owner, and the file,
 * because "something is in the way" is not something a user can act on, and ends
 * with the action that fits the case that actually occurred.
 */
function crossSetCollisionMessage(curie: string, claim: ForeignClaim): string {
	return claim.setId
		? `Cross-set identity collision: ${curie} is claimed by import set ${claim.setId} at ${claim.path}. `
			+ 'Nothing was written for it. Refresh that set instead, or rename this source so it uses its own identities.'
		: `Cross-set identity collision: ${curie} is claimed by ${claim.path}, a note from an earlier import that carries no import set. `
			+ 'Nothing was written for it. Move or delete that note, or rename this source so it uses its own identities.';
}

/**
 * AM-27 (2026-08-31). What one run has already claimed, so it cannot claim it twice.
 *
 * Failure mode prevented: one import writing two rows onto one identity. Two
 * source rows whose identities collapse together (any derivation can do this -
 * the legacy one collapses on characters, an injective one still collapses when
 * the source itself repeats a code) either overwrite each other at one address,
 * or land at two addresses and leave the vault holding one curie twice. The
 * second is permanent: the identity index reports it as `Ambiguous identity` and
 * every later import in that vault fails, from a cause the user cannot connect to
 * the import that caused it.
 *
 * Deliberately identity-NEUTRAL, so it applies to legacy sets too. It changes no
 * curie and re-identifies nothing; it only refuses to write the second claimant,
 * by name, naming the first as well so the user can see which two rows disagree.
 *
 * AM-31 (2026-08-31). ONE RULE, ALL WRITERS. Until this amendment only the two
 * row loops consulted the guard; every hub and facet writer added to
 * `producedCuries` and checked nothing, so a hub identity equal to a row identity
 * this run produced, or two hubs whose slugged values collapse, were written
 * anyway. Hubs run after rows, so the row could not see the hub and the hub did
 * not look. `row: 0` marks a claimant that is not a source row, and the message
 * says so rather than pointing a user at a row number that does not exist.
 */
type ProducedCurieOrigin = { row: number; path: string; kind: 'row' | 'hub' };

/**
 * Claim one identity for this run, or say who claimed it first.
 *
 * The single place a produced curie is recorded, so `producedCuries` (which
 * orphan detection reads) and `curieOrigins` (which the refusal reads) cannot
 * drift apart - the split between them is exactly what left hubs unguarded.
 */
function claimProducedCurie(
	producedCuries: Set<string>,
	curieOrigins: Map<string, ProducedCurieOrigin>,
	curie: string,
	origin: ProducedCurieOrigin,
): ProducedCurieOrigin | null {
	const first = curieOrigins.get(curie);
	if (first) return first;
	producedCuries.add(curie);
	curieOrigins.set(curie, origin);
	return null;
}

/** Who already holds this identity in this run, phrased for whatever it was. */
function firstClaimantOf(first: ProducedCurieOrigin): string {
	return first.kind === 'hub'
		? `a hub note this import produced (${first.path})`
		: `row ${first.row} (${first.path})`;
}

function duplicateCurieMessage(curie: string, first: ProducedCurieOrigin): string {
	return `Duplicate identity in this import: ${curie} was already produced by ${firstClaimantOf(first)}. `
		+ 'Nothing was written for this row. Two rows resolve to one identity, so one of them would overwrite the other. '
		+ 'Give them distinct values in the column your import uses for identity.';
}

/**
 * AM-31. The same refusal for a hub, whose cause and cure are different: a user
 * cannot fix a hub by editing an identity column, so the message names the
 * grouping value instead.
 */
function duplicateHubCurieMessage(curie: string, hubPath: string, first: ProducedCurieOrigin): string {
	return `Duplicate identity in this import: the note ${hubPath} would be written as ${curie}, `
		+ `which was already produced by ${firstClaimantOf(first)}. Nothing was written for it. `
		+ 'Two groups of notes resolve to one identity, so one would overwrite the other. '
		+ 'Give them values that differ by more than punctuation or capitalisation.';
}

/**
 * AM-14 (2026-08-30). Why a note sitting at a rendered address may not be adopted.
 *
 * Three cases, kept apart because they are three different things for a user to
 * do something about:
 *   `foreign-set`   another import set owns it. Refresh that set instead.
 *   `not-crosswalker` a person's own note. Crosswalker never merges into one.
 *   `unstamped`     provenance from an import predating import sets. Same answer
 *                   the identity route already gives such a note: move or delete.
 *
 * AM-19 (2026-08-31) adds a fourth, which is the one that is NOT about ownership:
 *   `unreadable`    the note was seen and nothing could be read off it. Who owns
 *                   it is unknown, so nothing may be claimed about it and the
 *                   only honest instruction is "fix this note, then import again".
 */
export type AddressRefusalReason = 'foreign-set' | 'not-crosswalker' | 'unstamped' | 'unreadable';

export interface AddressRefusal {
	reason: AddressRefusalReason;
	path: string;
	/** The owning set, for `foreign-set` only. Never fabricated for the others. */
	setId: string | null;
}

/**
 * AM-14. The last route into a note is its ADDRESS, and until now it was the one
 * route with no ownership check: `resolveWriteTarget` consulted
 * `getAbstractFileByPath` FIRST and adopted whatever it found, without ever
 * reading the `_crosswalker.import_set` stamp off it.
 *
 * Failure mode prevented: two notes with different curies and one rendered
 * address. AM-12 closed the identity route (same curie, other owner); this closes
 * the case where the curies differ, the addresses collide, and the foreign note is
 * merged into and restamped with this run's set. A framework annexed one note at a
 * time is the single worst thing this product can do.
 *
 * Returns null when the address may be adopted: the note is stamped with the set
 * this run writes (the ORDINARY same-set re-import, which must keep working), or
 * this run produced the note itself and the index simply predates it, or there is
 * no index to judge with (a caller that passes none keeps its old behaviour rather
 * than refusing everything).
 *
 * AM-17 (2026-08-31): exported, because the engine is not the only writer of a
 * Crosswalker artifact. A window that writes one asks the same question here
 * rather than carrying a second copy of the answer. `ownedSetId` is `null` for a
 * writer that owns no set at all: every note it finds at the address is then
 * someone's but not its own, which is exactly the refusal it needs.
 */
export function addressRefusal(
	vaultWide: IdentityIndex | undefined,
	path: string,
	ownedSetId: string | null,
	producedThisRun?: ReadonlySet<string>,
): AddressRefusal | null {
	if (!vaultWide) return null;
	// A note this run wrote minutes ago is this run's, and the index was built
	// before it existed. Without this, a hub landing on a path an earlier row of
	// the same run created would refuse itself as "not Crosswalker's".
	if (producedThisRun?.has(path)) return null;
	const stamp = vaultWide.provenanceAt(path);
	// AM-19. Checked FIRST and answered on its own terms. Nothing below this line
	// knows anything about a note whose properties would not parse, so every
	// answer below would be an invention.
	if (stamp === 'unreadable') return { reason: 'unreadable', path, setId: null };
	if (!stamp) return { reason: 'not-crosswalker', path, setId: null };
	if (stamp.importSetId === null) return { reason: 'unstamped', path, setId: null };
	if (stamp.importSetId === ownedSetId) return null;
	return { reason: 'foreign-set', path, setId: stamp.importSetId };
}

/**
 * The error a row refused at its address reports. Names the file and the owner,
 * and ends with the action that fits the case that actually occurred, because
 * "something is in the way" is not something a user can act on.
 */
export function crossSetAddressMessage(refusal: AddressRefusal): string {
	if (refusal.reason === 'unreadable') {
		// AM-19. Names the ONE thing that is actually known, and asks for the one
		// action that fixes it. It must never say the note is not Crosswalker's
		// (nothing here established that) and must never invite move-or-delete
		// (this may be the user's own imported note, damaged by a hand edit).
		return `Crosswalker could not read the properties of ${refusal.path}, so it could not tell whether that note is one of its own. `
			+ 'Nothing was written for it. Fix that note\'s properties block, then import again.';
	}
	if (refusal.reason === 'foreign-set') {
		return `Cross-set address collision: ${refusal.path} is owned by import set ${refusal.setId}. `
			+ 'Nothing was written for it. Refresh that set instead, or choose a different destination folder for this import.';
	}
	if (refusal.reason === 'unstamped') {
		return `Address collision: ${refusal.path} is a note from an earlier import that carries no import set. `
			+ 'Nothing was written for it. Move or delete that note, or choose a different destination folder for this import.';
	}
	return `Address collision: a note that is not Crosswalker's sits at ${refusal.path}. `
		+ 'Nothing was written for it. Move or rename that note, or choose a different destination folder for this import.';
}

/**
 * AM-12 for hubs. A hub resolves through its own curie OR through an
 * address-derived legacy alias, so BOTH have to be checked: adopting a note via
 * an alias claimed by another set crosses the same boundary as adopting it
 * directly. Returns the first identity that is claimed elsewhere.
 */
function foreignHubClaim(
	owned: IdentityIndex | undefined,
	vaultWide: IdentityIndex | undefined,
	curie: string | null,
	legacyCuries: readonly string[] | undefined,
): { curie: string; claim: ForeignClaim } | null {
	for (const candidate of [...(curie ? [curie] : []), ...(legacyCuries ?? [])]) {
		const claim = foreignSetClaim(owned, vaultWide, candidate);
		if (claim) return { curie: candidate, claim };
	}
	return null;
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
 *
 * AM-14 (2026-08-30): every ADDRESS branch below now checks the stamp on the note
 * it found and returns a `refusal` rather than adopting it, unless the stamp names
 * the set this run writes. Identity, then address, then create fresh is the whole
 * set of routes into a note; identity was closed by AM-12 and this closes the
 * other. The caller must treat a `refusal` as a refused row: report it and write
 * nothing.
 */
function resolveWriteTarget(
	app: App,
	siblingPath: string,
	curie: string,
	enrichmentEnabled: boolean,
	ownedIndex?: IdentityIndex,
	vaultWideIndex?: IdentityIndex,
	ownedSetId?: string,
): { existingFile: TFile | null; writePath: string; moveFrom?: string; refusal?: AddressRefusal } {
	const direct = app.vault.getAbstractFileByPath(siblingPath);
	if (direct instanceof TFile) {
		// AM-14. The owned-stamp case is the ordinary same-set re-import and is
		// adopted exactly as before; anything else is refused rather than merged
		// into, moved, or restamped.
		const refusal = addressRefusal(vaultWideIndex, direct.path, ownedSetId ?? null);
		if (refusal) return { existingFile: null, writePath: siblingPath, refusal };
		return { existingFile: direct, writePath: siblingPath };
	}

	// Identity reconciliation (2026-08-21): the note is not at the address this
	// recipe renders, but the vault may still hold this concept SOMEWHERE — under a
	// previous layout, a renamed folder, or a destination the user chose. Finding it
	// by curie is what turns "write a second note" into "move the one that exists".
	// Checked before the folder-note guess below because it subsumes it: identity is
	// a fact about the note, whereas a candidate path is only a guess.
	// AM-12: the OWNED index, never the vault-wide one. Resolving a write through
	// every Crosswalker note in the vault is how a run annexed another set's notes.
	// The caller has already refused any row whose identity is claimed outside this
	// set, so a hit here is always a note this run owns.
	const byIdentity = ownedIndex?.get(curie) ?? null;
	if (byIdentity) {
		if (enrichmentEnabled) {
			// Enrichment relocates concepts to their folder-note shape on purpose, so a
			// note sitting there is where it belongs; moving it back would fight Pass 1.5.
			const folderNotePath = folderNoteCandidatePath(siblingPath);
			if (byIdentity.path === folderNotePath) {
				return { existingFile: byIdentity, writePath: folderNotePath };
			}
		}
		return { existingFile: byIdentity, writePath: siblingPath, moveFrom: byIdentity.path };
	}
	if (enrichmentEnabled) {
		const candidatePath = folderNoteCandidatePath(siblingPath);
		if (candidatePath !== siblingPath) {
			const relocated = app.vault.getAbstractFileByPath(candidatePath);
			if (relocated instanceof TFile) {
				const fm = app.metadataCache.getFileCache(relocated)?.frontmatter;
				if (fm && fm.curie === curie) {
					// AM-14. Also an address branch, and the one AM-12 cannot reach: a
					// note carrying this curie but NO `_crosswalker` block is invisible to
					// the vault-wide identity index, so the caller's identity refusal never
					// saw it and this branch would adopt a note that is not Crosswalker's.
					const refusal = addressRefusal(vaultWideIndex, relocated.path, ownedSetId ?? null);
					if (refusal) return { existingFile: null, writePath: siblingPath, refusal };
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
	/**
	 * The ALREADY-RESOLVED curie prefix (`curiePrefixFor`), not the raw ontology.
	 * AM-13: the prefix depends on the set's scheme as well as its ontology, and a
	 * second derivation here would silently write unqualified concept curies while
	 * enrichment wrote qualified hub curies for the same run.
	 */
	curiePrefix: string,
	/**
	 * AM-34. The set's BASE ontology prefix - the one a source's declared `curie`
	 * is checked against. Handed down beside the resolved prefix rather than
	 * re-derived here: a second derivation is a second place the two can disagree,
	 * and the disagreement would be an identity written under a prefix nothing
	 * else in the run uses.
	 */
	basePrefix: string,
	report?: RenderReport,
	recipeHash?: string,
	provenanceRecipeId?: string,
	importSet?: ImportSetReference,
): { path: string; frontmatter: Record<string, any>; body: string; sourceRow: number; curie: string; tags: string[]; layoutValues: LayoutValue[] } {
	// 1. Build a CURIE for this row, under the derivation THIS SET IS PINNED TO.
	//
	// AM-27. Why identity may not pass through a filename sanitizer: a filename
	// sanitizer exists to make a string safe for a filesystem, and it does that by
	// mapping many strings onto one (`AC 2`, `AC-2` and `AC/2` all become `AC-2`).
	// An identity built that way is not an identity: two source rows that differ
	// only in a collapsed character claim one CURIE, which is a permanent
	// `Ambiguous identity` collision failing every later import in the vault, and -
	// when they also share an address - one row silently overwriting the other.
	//
	// The legacy rule did exactly that, so it is kept byte-exact for the sets that
	// already carry it rather than corrected underneath them: correcting it would
	// change the curie of every note in every existing vault, and the next refresh
	// would match none of them.
	//
	// `filenameStem` stays on the legacy rule under BOTH derivations: it is only a
	// fallback for the note's H1 (step 5b), a display concern, and changing what a
	// heading says is not what this amendment is about.
	//
	// AM-28. `curiePrefix` is handed down rather than re-derived: a declared
	// `curie` is checked against the prefix this run will actually WRITE, and is
	// then kept verbatim, so the value in the vault is the value the source
	// stated. Stripping the declared prefix and substituting ours is the silent
	// rewrite the amendment forbids.
	const filenameStem = deriveFilenameStem(row, mapping, rowNum);
	// AM-34. The declared prefix is checked against the BASE ontology; the
	// resolved (possibly set-qualified) prefix is what goes in front. One check,
	// one uniform transform, both recorded on the set.
	const curie = `${curiePrefix}:${
		derivationOf(importSet) === 'declared-facts-v1'
			? declaredFactsLocalPart(row, () => deriveRawFilenameStem(row, mapping, rowNum), basePrefix)
			: filenameStem
	}`;

	// 2. render() expects a SourceScope object — the row IS the scope (column
	//    names map to template variables).
	//
	// Mapping-provenance defaults are normalized in exactly the same way
	// generateFromRecipe does, and for the same reason: the bundled crosswalk
	// recipes reference {mapping_set_id} and {predicate_modifier}, and render()
	// throws on a variable it cannot resolve. Without this, importing a crosswalk
	// source that predates those columns fails on EVERY row through the wizard,
	// while the identical import succeeds through the recipe path. Supplying the
	// empty default lets render omit the key entirely, which is the correct
	// missing-value semantic for optional metadata.
	//
	// Scoped to crosswalk-edge recipes so nothing else gains fields it never had,
	// and deliberately NOT fed into concept identity: see identityScopeForNoteKind.
	const sourceScope = row as Record<string, unknown>;
	const noteKind = recipe.target.layout.find((entry) => entry.mechanism === 'file')?.kind ?? 'concept';
	const renderScope: Record<string, unknown> = noteKind === 'crosswalk-edge'
		? {
			...sourceScope,
			mapping_set_id: normalizeMappingSetId(sourceScope.mapping_set_id),
			predicate_modifier: normalizePredicateModifierInput(sourceScope.predicate_modifier),
		}
		: sourceScope;

	// AM-33. The folder levels' VALUES, collected as render produces them. Handed
	// on to enrichment so hub identity never has to be recovered by parsing a
	// path back apart.
	const layoutValues: LayoutValue[] = [];
	let address;
	try {
		address = render(recipe, { curie, scope: renderScope }, report, layoutValues);
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
	//     `target.auto_heading` lets the recipe choose that heading's text or
	//     suppress it; absent, resolveAutoHeadingText returns titleText and the
	//     conditional below is byte-for-byte what it always was.
	let headingText: string | null;
	try {
		headingText = resolveAutoHeadingText(recipe, renderScope, titleText, report);
	} catch (err) {
		if (err instanceof RenderError) {
			throw new Error(`target.auto_heading failed for row ${rowNum}: ${err.message}`);
		}
		throw err;
	}
	const body = composeDocumentBody(headingText, bodyContent);

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
			recipeId: provenanceRecipeId,
			recipeHash,
			importSet,
			// Raw source scope on purpose: mapping-only defaults must never enter
			// concept identity, or every concept's content hash shifts.
			conceptCid: computeConceptCid({ curie, scope: sourceScope }),
			// The same record, hashed with cosmetic differences folded away, so an
			// attestation can tell a rewritten control from a re-typeset one.
			// A SECOND hash: concept_cid is untouched, byte for byte.
			reviewCid: computeReviewCid({ curie, scope: sourceScope }),
			reviewGroups: computeReviewGroupCids({ curie, scope: sourceScope }, recipe),
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
		// AM-33: the folder levels' values, for the enrichment collector.
		layoutValues,
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
 * Resolve the engine's automatic heading text for one row.
 *
 * `recipe.target.auto_heading` (schema SchemaVer 1.8.0) is the recipe's control
 * over the note's first line:
 *
 *   - a template string -> render it against the row scope (full template
 *                          grammar, so `{name}` / `{title|trim}` both work)
 *   - `false`           -> suppress the heading entirely; returns null
 *   - absent            -> the caller's `fallbackTitle`, i.e. today's behaviour
 *
 * BOTH generation paths call this and each keeps its own, deliberately
 * different, emission conditional: the wizard path (composeDocumentBody) emits
 * only when body content exists; the recipe path (buildDefaultBody) emits
 * unconditionally. Threading the option through one path only is how a
 * "removed" heading comes back from the other.
 *
 * Throws RenderError when the template references a missing variable without
 * `|optional`; callers record that as a per-row error and continue.
 *
 * Deterministic (no timestamps). Exported for tests.
 */
export function resolveAutoHeadingText(
	recipe: { target: { auto_heading?: string | false } },
	scope: SourceScope,
	fallbackTitle: string,
	report?: RenderReport,
): string | null {
	const cfg = recipe.target.auto_heading;
	if (cfg === false) return null;
	if (typeof cfg === 'string') return renderTemplate(cfg, scope, report).trim();
	return fallbackTitle;                       // absent -> today's behaviour
}

/**
 * Assemble a document-style note body: an H1 title, a blank line, then the
 * body content. Returns the body unchanged when there is no content OR no
 * title (a frontmatter-only note gets no forced heading), and when the heading
 * is null (the recipe set `auto_heading: false`, or its template rendered
 * empty). Deterministic (no timestamps). Exported for tests.
 */
export function composeDocumentBody(titleText: string | null, body: string): string {
	if (titleText === null) return body;
	if (body.trim() === '' || titleText.trim() === '') return body;
	return `# ${titleText}\n\n${body}`;
}

/**
 * Pulled from buildNoteData's filename logic — returns the stem (no .md) for
 * use in CURIE generation.
 *
 * AM-27. `filename-stem-v1` ONLY. Frozen: this must keep returning byte-for-byte
 * what it returned before, because it is the recorded derivation of every set
 * minted before the pin existed. `sanitizeFileName` at the end is the collapse
 * the amendment names - it is kept here deliberately, and kept OUT of
 * `deriveRawFilenameStem` below, which is what the injective rule sanitizes
 * itself.
 */
function deriveFilenameStem(
	row: Record<string, any>,
	mapping: MappingConfig,
	rowNum: number,
): string {
	return sanitizeFileName(deriveRawFilenameStem(row, mapping, rowNum));
}

/**
 * The filename stem BEFORE any sanitizer touches it.
 *
 * AM-27. Identity may not pass through a filename sanitizer, so the injective
 * derivation needs the exact source value: the hash that disambiguates a
 * collapsed value is taken over THIS string, not over the collapsed one. Taking
 * it after sanitization would hash two already-merged values to one digest and
 * disambiguate nothing.
 */
function deriveRawFilenameStem(
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
	return filename;
}

// AM-18. `slugifyForCurie` now lives in `./curie` so `import-set.ts` can share
// it without importing the engine. Re-exported here because it has always been
// part of this module's surface, and a second normalization is exactly the kind
// of near-copy the amendment set exists to remove.
export { slugifyForCurie } from './curie';

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
	/** Select an existing import set explicitly or force a freshly minted set. */
	importSet?: ImportSetOption;
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
	curieLocalPart?: (row: Record<string, unknown>, rowNum: number, importSet: ImportSetReference) => string;
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
		// AM-7. Starts FALSE, not absent. A run that throws before the orphan pass
		// checked nothing, and a reader must not read that silence as `no orphans`.
		// The orphan pass below sets it true only when it actually ran.
		orphansChecked: false,
	};

	const strict = options.strictValidation ?? true;
	const createFolders = options.createFolders ?? true;
	// AM-6. What this run WOULD mint curies under if the set were new.
	const proposedOntologyId = recipe.source?.ontology ?? recipe.recipe;
	// Headless imports obey the same destination-discovery rules as the wizard.
	// Callers can name a wiped/empty set explicitly or force a new mint.
	const importSet = await resolveImportSet(app, options.basePath, options.importSet, proposedOntologyId);
	// AM-6. The set's pin wins over this run's proposal. A refresh whose curie
	// prefix disagrees with the notes it owns writes a second copy of the whole
	// import and orphans the first. An explicit `options.curiePrefix` still wins
	// over both: that caller is naming the identity space on purpose.
	const ontologyId = importSet.ontology ?? proposedOntologyId;
	// AM-13. Scheme-aware, same rule as generateNotes. An explicit
	// `options.curiePrefix` still wins over both: the SSSOM importer names its own
	// identity space and already qualifies its LEAF by scheme, so it must not be
	// qualified a second time at the prefix.
	const curiePrefix = options.curiePrefix ?? curiePrefixFor(importSet, ontologyId);
	// AM-34. The base ontology prefix a source's declared `curie` is checked
	// against. An explicit `options.curiePrefix` names its own identity space, so
	// there is no qualification to invert and the two are the same value.
	const baseCuriePrefix = options.curiePrefix ?? baseCuriePrefixFor(importSet, ontologyId);
	const ownedIdentityIndex = await buildIdentityIndex(app, { importSetId: importSet.id });

	// _crosswalker.recipe.hash: computed ONCE per generation run — see
	// src/generation/hash.ts's doc comments for the exact field-set definition.
	// `recipe.source` participates only through its shaping declarations; a
	// recipe declaring none hashes byte-identically to its pre-1.9.0 self.
	const recipeHash = computeRecipeHash(recipe.target, recipe.source);
	// A recipe declares the note kind at its file leaf. Mapping-only render
	// defaults must never widen concept or junction identity/source scopes.
	const recipeNoteKind = recipe.target.layout.find((entry) => entry.mechanism === 'file')?.kind ?? 'concept';
	// See generateNotes above: recipe declaration, not row output, decides ownership.
	const declaredManagedKeys = computeDeclaredManagedKeys(recipe.target.also_emit?.frontmatter);
	// Resolve existing notes by canonical identity before considering their current
	// address. The index admits only notes with Crosswalker provenance, so a
	// hand-written note elsewhere in the vault is never a relocation candidate.
	const identityIndex = await buildIdentityIndex(app);
	const ambiguousCuries = new Set(identityIndex.collisions.map((collision) => collision.curie));
	for (const collision of identityIndex.collisions) {
		result.errors.push({
			row: 0,
			message: `Ambiguous identity ${collision.curie} claimed by: ${collision.paths.join(', ')}`,
		});
	}

	debug?.info('generation', 'recipe-start', `generateFromRecipe: starting (${recipe.recipe})`, {
		recipe: recipe.recipe,
		rowCount: parsedData.rowCount,
		strict,
		ontologyId,
	});

	// SOURCE STAGE (Ch 46 source contract §2). Spec-owned position: source
	// shaping runs BEFORE identity, curie minting, concept_cid and render(),
	// because it decides what a row IS and therefore which notes exist.
	//
	// Preflight (expression parse, permitted-subset walk, G2 reference check)
	// happens inside prepareSourceStage, deliberately BEFORE the first folder is
	// created, so the common typo produces zero writes and one clear error.
	//
	// A recipe declaring no source shaping gets its own `parsedData.rows`
	// reference back untouched and never enters the jsonata module at all.
	let sourceStage: SourceStage;
	try {
		sourceStage = await prepareSourceStage(parsedData, recipe.source);
	} catch (stageErr) {
		if (stageErr instanceof SourceStageError) {
			// Preflight failure. row 0 matches the existing `Ambiguous identity`
			// convention above.
			result.errors.push({ row: stageErr.row ?? 0, message: stageErr.message, declaration: stageErr.declaration });
			result.success = false;
			result.duration = Date.now() - startTime;
			debug?.error('generation', 'source-stage-preflight-failed', stageErr.message, {
				declaration: stageErr.declaration,
				expression: stageErr.expression,
			});
			return result;
		}
		throw stageErr;
	}

	if (createFolders && options.basePath) {
		await ensureFolderExists(app, options.basePath);
	}

	const emittedPaths = new Set<string>();
	const producedCuries = new Set<string>();
	// AM-27. Which row produced each curie, so the duplicate refusal can name both
	// claimants. Same guard, same reason, as the wizard path above.
	const curieOrigins = new Map<string, ProducedCurieOrigin>();
	// Ch 43 re-attestation: review fingerprints of concepts produced by THIS run,
	// so a recipe that emits a concept and an evidence link for it in one pass can
	// stamp the link against the concept it just wrote.
	type ReviewBaseline = { reviewCid: string; reviewGroups: ReviewGroupCids | null };
	const producedReviewBaselines = new Map<string, ReviewBaseline>();
	// Approved junction rows written with no review baseline, because their
	// subject's fingerprint was not resolvable. Counted, never silently dropped.
	let unbaselinedJunctions = 0;
	/**
	 * The subject's current review fingerprint, or null when it cannot be had.
	 *
	 * DELIBERATELY VAULT-WIDE (AM-16). This is a READ, never a write: it resolves
	 * the subject through `identityIndex`, not the owned one, because a crosswalk
	 * legitimately spans sets - its subject is routinely a concept another import
	 * set owns, and refusing to read that would leave every cross-framework
	 * attestation unbaselined. AM-12's owned-index rule governs what a run may
	 * WRITE; nothing here modifies the subject.
	 *
	 * Null is a real answer here - a junction row generated before its subject
	 * concept exists, a subject that is not in this vault at all, a subject whose
	 * note carries no review fingerprint. There is deliberately NO second pass to
	 * fill these in later: a resolve pass would stamp a fingerprint the IMPORTER
	 * computed against content no human reviewed, which is fabricating an approval
	 * with extra steps.
	 *
	 * AM-39 (closing adversarial CONFIRMED 7). "Not indexed yet" is NOT one of
	 * those real answers, and this line used to accept it as one - a metadata-cache
	 * miss read as "this note carries no fingerprint". The asymmetry was provable
	 * one line above: `identityIndex` finds a cache-cold note by READING IT off
	 * disk, and then this asked the cache the same question and believed the
	 * silence. The consequence is permanent and invisible: a link imported while
	 * Obsidian was still indexing is written with no baseline, so no later upstream
	 * edit can ever invalidate it, and it is indistinguishable from a link that
	 * honestly had none. Cache lag is not absence (`project_cache_lag_is_not_absence`,
	 * ninth appearance). `ok` is read, `none` is the real null, and `unreadable`
	 * says so rather than passing for absence.
	 */
	const resolveSubjectReviewBaseline = async (
		subjectCurie: string,
		rowNum: number,
	): Promise<ReviewBaseline | null> => {
		const fromThisRun = producedReviewBaselines.get(subjectCurie);
		if (fromThisRun) return fromThisRun;
		const file = identityIndex.get(subjectCurie);
		if (!file) return null;
		// S8 (ruled 2026-09-02). ONE discriminator, shared with the hub-value index
		// below: an entry that carries no properties is not the cache answering,
		// so the note is read. This costs a disk read for a subject whose cache
		// entry is momentarily empty, which is bounded to edge-subject baselines
		// and is the price of never recording "no baseline" for a note that has
		// one. Absence is not a fact (`project_cache_lag_is_not_absence`).
		const read = await readFrontmatterForRun(app, file);
		if (read.state === 'unreadable') {
			result.warnings ??= [];
			result.warnings.push({
				row: rowNum,
				message: `The properties of ${file.path} could not be read, so this approved link was written with `
					+ 'no review baseline and Crosswalker cannot tell you later if that note changes. '
					+ 'Fix that note\'s properties, then re-import.',
			});
			return null;
		}
		if (read.state !== 'ok') return null;
		const provenance = read.frontmatter._crosswalker;
		if (!provenance || typeof provenance !== 'object') return null;
		const source = provenance as Record<string, unknown>;
		const value = source.review_cid;
		const reviewCid = typeof value === 'string' && value.trim() !== '' ? value.trim() : null;
		return reviewCid
			? { reviewCid, reviewGroups: readReviewGroupCids(source.review_groups) }
			: null;
	};
	// Pass 1.5 enrichment (v0.1.6): records collected during the stream so the
	// post-stream patch phase can derive parent→children + facet hubs without
	// re-reading the vault. One lightweight record per written note. Only
	// populated when the recipe declares target.enrichment.
	const enrichmentEnabled = !!recipe.target.enrichment;
	const enrichRecords: EnrichRecord[] = [];
	// AM-2. Rows this run KEPT rather than wrote (overwriteMode 'skip'). The same
	// hole generateNotes had: the skip branch returns above the enrichment
	// collection, so a skip refresh of an unchanged set marked no hub produced and
	// orphaned every hub the set owns. A fix that lands on one generation entry
	// point only is how a removed behaviour comes back on the other.
	const keptRecords: EnrichRecord[] = [];
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

	// A source-stage failure raised per row is thrown out of the ITERATOR, not
	// inside the worker's try/catch below. That is deliberate: it aborts the
	// run, which is the contract. Skipping a row is the banned behaviour, and a
	// "skip" that logs a warning is still a vault that quietly lost rows.
	//
	// Captured through `.catch` rather than by wrapping the row loop in a try
	// block, so the loop below keeps its indentation and its diff.
	let sourceStageFailure: SourceStageError | null = null;
	const captureSourceStageFailure = (stageErr: unknown): void => {
		if (!(stageErr instanceof SourceStageError)) throw stageErr;
		sourceStageFailure = stageErr;
		result.errors.push({ row: stageErr.row ?? 0, message: stageErr.message, declaration: stageErr.declaration });
		result.success = false;
		debug?.error('generation', 'source-stage-failed', stageErr.message, {
			declaration: stageErr.declaration,
			expression: stageErr.expression,
			row: stageErr.row,
		});
	};

	await forEachConcurrent(
		sourceStage.rows as Iterable<Record<string, any>> | AsyncIterable<Record<string, any>>,
		limit,
		async (row, idx) => {
		// The SOURCE row number, not the post-filter position: an error must
		// name the row the user can find in their spreadsheet. Identical to
		// `idx + 1` whenever no source shaping is declared.
		const rowNum = sourceStage.sourceRowNumber(row, idx);

		try {
			const sourceScope = row as Record<string, unknown>;
			const scope: Record<string, unknown> = recipeNoteKind === 'crosswalk-edge'
				? {
					...sourceScope,
					mapping_set_id: normalizeMappingSetId(sourceScope.mapping_set_id),
					predicate_modifier: normalizePredicateModifierInput(sourceScope.predicate_modifier),
				}
				: sourceScope;

			// 1. Build CURIE for this row
			// AM-27. The derivation is the SET's, not this version's. An override
			// (the SSSOM importer) reads the same pin off the reference it is handed.
			// AM-28. The prefix travels with the row: a declared `curie` is honoured
			// verbatim only when it already carries the prefix this run writes, and is
			// refused by name otherwise, never stripped and re-prefixed.
			const localPart = options.curieLocalPart
				? options.curieLocalPart(scope, rowNum, importSet)
				// AM-34: checked against the base ontology, written under the resolved prefix.
				: defaultCurieLocalPart(scope, rowNum, derivationOf(importSet), baseCuriePrefix);
			const curie = `${curiePrefix}:${localPart}`;
			// The index deliberately does not return an arbitrary winner for a
			// collision. Refuse this row instead of making the duplicate permanent.
			if (ambiguousCuries.has(curie)) return;

			// AM-12. A write never crosses a set boundary. Same rule as generateNotes,
			// refused at the same point: the vault-wide index only DETECTS, and a curie
			// another set already holds stops the row here - not adopted, not moved, not
			// restamped, with no fall back to its address. It sits beside the ambiguity
			// refusal because both are answers about identity alone, so neither should
			// cost a render, a folder, a produced curie, or a review baseline recorded
			// for a note this run will never write.
			const foreignClaim = foreignSetClaim(ownedIdentityIndex, identityIndex, curie);
			if (foreignClaim) {
				result.errors.push({ row: rowNum, message: crossSetCollisionMessage(curie, foreignClaim) });
				return;
			}

			// AM-27. Within-run injectivity, beside the other two identity-only
			// refusals and above every record this row would otherwise leave behind.
			const firstClaim = curieOrigins.get(curie);
			if (firstClaim) {
				result.errors.push({ row: rowNum, message: duplicateCurieMessage(curie, firstClaim) });
				return;
			}

			// 2. Render. Expose the already-derived local part as a reserved,
			//    render-only variable so a recipe can keep its file address aligned
			//    with scheme-aware identity. It is deliberately excluded from the
			//    source/identity scopes used for concept CID computation.
			const renderScope = { ...scope, _crosswalker_curie_local_part: localPart };
			const renderReport: RenderReport = { notes: [] };
			// AM-33. The folder levels' values, collected as render produces them —
			// same rule on both generation entry points, so hub identity cannot mean
			// one thing through the wizard and another through a recipe.
			const layoutValues: LayoutValue[] = [];
			let address;
			try {
				address = render(recipe, { curie, scope: renderScope }, renderReport, layoutValues);
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
			// AM-14. The ADDRESS is the last route into a note, so write resolution
			// runs HERE, above every record this row would otherwise leave behind: the
			// reserved path, the produced curie, the review baseline. A row refused at
			// its address is a row this run never vouched for, exactly as AM-12's
			// identity refusal is. Resolution is a pure set of lookups; only the point
			// at which it runs moved.
			//
			// Deliberately BELOW the path-collision check: two rows rendering one
			// address are that check's answer, and letting the second row race the
			// first row's freshly written file into an address refusal would report a
			// source problem as a vault problem.
			//
			// AM-12: the OWNED index resolves. Every row whose identity is held outside
			// this set was refused above, so a hit there is always a note this run owns.
			// AM-14: the vault-wide index plus the set id are what the ADDRESS branches
			// judge with, and they report rather than adopt.
			const target = resolveWriteTarget(
				app,
				fullPath,
				curie,
				enrichmentEnabled,
				ownedIdentityIndex,
				identityIndex,
				importSet.id,
			);
			if (target.refusal) {
				reportAddressRefusal(result, debug, target.refusal, rowNum, curie);
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
			const identityScope = identityScopeForNoteKind(address.frontmatter.kind, sourceScope, scope);
			const reviewRecord = { curie, scope: identityScope };
			const reviewCid = computeReviewCid(reviewRecord);
			const reviewGroups = computeReviewGroupCids(reviewRecord, recipe);
			// An imported evidence link records what its subject looked like at
			// approval, exactly as the link modal does — but only when the row is
			// approved AND the subject's fingerprint is genuinely resolvable.
			// Never fabricated: an importer computing a baseline against content no
			// human read is an audit fact nobody asserted.
			if (address.frontmatter.kind === 'junction-note' && frontmatter.status === 'approved') {
				const subjectCurie = typeof frontmatter.subject_curie === 'string'
					? frontmatter.subject_curie
					: null;
				const subjectBaseline = subjectCurie ? await resolveSubjectReviewBaseline(subjectCurie, rowNum) : null;
				const reviewedAgainst = reviewedAgainstFor(
					subjectCurie,
					subjectBaseline?.reviewCid,
					subjectBaseline?.reviewGroups,
				);
				if (reviewedAgainst) {
					frontmatter.reviewed_against = reviewedAgainst;
				} else {
					// Counted, never silently dropped: "N links written without a
					// baseline" is the honest summary line.
					unbaselinedJunctions += 1;
				}
			}
			frontmatter._crosswalker = buildProvenance(
				{
					sourceFile: options.sourceFileName,
					sourceVersion: options.sourceVersion ?? recipe.source?.version,
					recipeId: recipe.recipe,
					recipeHash,
					importSet,
					conceptCid: computeConceptCid({ curie, scope: identityScope }),
					reviewCid,
					reviewGroups,
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

			// This identity belongs to the current source set even when overwrite mode
			// skips or merges the note rather than creating a new file.
			// AM-27. Only once the row is past every refusal above: a row this run
			// declined to write has claimed nothing.
			// AM-31: through the one claim function, so the produced set and the origin
			// map cannot record different things.
			claimProducedCurie(producedCuries, curieOrigins, curie, { row: rowNum, path: fullPath, kind: 'row' });
			// Recorded only for a row that survived validation, so a junction row
			// later in the same run can never be stamped against a concept this run
			// refused to write.
			if (address.frontmatter.kind !== 'junction-note' && address.frontmatter.kind !== 'crosswalk-edge') {
				producedReviewBaselines.set(curie, { reviewCid, reviewGroups });
			}

			// 7. Existing-file handling + merge. The target was resolved above (AM-14),
			//    before this row reserved anything. Consults BOTH the sibling path AND
			//    (when enrichment is on) the folder-note-relocated path by curie —
			//    see resolveWriteTarget's docstring (re-import identity, design §4).
			const existingFile = target.existingFile;
			const writePath = target.writePath;

			// A move is part of replacement, never part of skip mode. Use Obsidian's
			// rename API so links to the canonical note follow its new address.
			if (existingFile instanceof TFile && target.moveFrom && options.overwriteMode !== 'skip') {
				const parentPath = getParentPath(writePath);
				if (parentPath && createFolders) await ensureFolderOnce(parentPath);
				await app.fileManager.renameFile(existingFile, writePath);
				(result.moved ??= []).push({ curie, from: target.moveFrom, to: writePath });
				debug?.info('generation', 'identity-move', `Moved ${target.moveFrom} -> ${writePath}`, {
					curie, from: target.moveFrom, to: writePath,
				});
			}

			if (existingFile instanceof TFile) {
				if (options.overwriteMode === 'skip') {
					// The path that EXISTS, never the desired one — see generateNotes.
					result.skipped.push(existingFile.path);
					// AM-2. Record what was kept so the post-stream bookkeeping pass can
					// derive the hubs these rows imply. Keyed on the note that ACTUALLY
					// exists, never the desired path: bookkeeping against a path the run
					// declined to create describes a vault shape that is not there.
					if (enrichmentEnabled) {
						keptRecords.push({
							path: existingFile.path,
							renderedPath: fullPath,
							// AM-33: a kept row still describes the folders it implies.
							layoutValues,
							curie,
							frontmatter: { ...frontmatter },
							facets: options.facetsForRow
								? options.facetsForRow(row as Record<string, unknown>, rowNum)
								: facetMembershipsFromTags(address.tags),
							// Never read: this record is never written back. Empty rather
							// than a fresh render, which is the content a skip promised not
							// to write.
							body: '',
						});
					}
					return;
				} else if (options.overwriteMode === 'error') {
					result.errors.push({ row: rowNum, message: `File already exists: ${writePath}` });
					result.success = false;
					return;
				}
			}

			// 8. Ensure parent folder
			const parentPath = getParentPath(writePath);
			if (parentPath && createFolders) {
				await ensureFolderOnce(parentPath);
			}

			// 9. Managed body — deterministic H1 plus the canonical regions already
			// evaluated by pure render(). Generation only assembles Markdown.
			// The H1 is `target.auto_heading`-controlled; absent, the historical
			// unconditional `# <title>` branch is preserved exactly. Built BEFORE the
			// existing-note merge (it is that merge's input), which is why step 9 now
			// precedes what used to be step 7's frontmatter merge.
			const headingReport: RenderReport = { notes: [] };
			let managedBody: string;
			try {
				managedBody = buildDefaultBody(frontmatter, address, recipe, renderScope, headingReport);
			} catch (bodyErr) {
				if (bodyErr instanceof RenderError) {
					result.errors.push({ row: rowNum, message: `target.auto_heading failed: ${bodyErr.message}` });
					return;
				}
				throw bodyErr;
			}
			if (headingReport.notes.length > 0) {
				result.warnings ??= [];
				for (const note of headingReport.notes) {
					result.warnings.push({ row: rowNum, message: note.detail });
				}
			}

			// 9b. 'replace' — THE SAME shared reader and merger `generateNotes` calls
			// (src/generation/existing-note.ts). Frontmatter merges on the
			// managed/user_preserve split; only the managed body region is rebuilt, so
			// user prose outside it survives byte-for-byte. A note whose markers or
			// properties cannot be understood is a per-note conflict: file untouched,
			// run continues.
			let body: string;
			if (existingFile instanceof TFile) {
				const userPreserve = recipe.target.also_emit?.frontmatter?.user_preserve ?? [];
				const managedKeys = computeManagedKeys(frontmatter, userPreserve, declaredManagedKeys);
				const outcome = await mergeExistingNote({
					app,
					file: existingFile,
					freshFrontmatter: frontmatter,
					managedKeys,
					freshManagedBody: managedBody,
					kind: 'note',
				});
				if (!outcome.ok) {
					recordConflict(result, debug, writePath, curie, outcome.code, outcome.detail);
					return;
				}
				Object.keys(frontmatter).forEach((k) => delete frontmatter[k]);
				Object.assign(frontmatter, outcome.frontmatter);
				body = outcome.body;
			} else {
				body = wrapManagedBody(managedBody);
			}

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
				// `body` is the body AS ACTUALLY WRITTEN (merged when the note existed),
				// never the fresh render — Pass 1.5 writes this back, so the unmerged
				// render here would destroy the prose the row write just preserved.
				// AM-33: `layoutValues` travels with the record so the hub pass derives
				// identity from the values, not from `dirname(writePath)`.
				enrichRecords.push({ path: writePath, renderedPath: fullPath, layoutValues, curie, frontmatter: { ...frontmatter }, facets, body });
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
	).catch(captureSourceStageFailure);

	// G3 — a predicate that admits nothing from a non-empty collection is an
	// error, checked at end of stream. Safe there: zero admitted rows means zero
	// writes have happened, so no rollback is needed.
	if (!sourceStageFailure) {
		try {
			sourceStage.finalize();
		} catch (stageErr) {
			captureSourceStageFailure(stageErr);
		}
	}

	if (unbaselinedJunctions > 0) {
		// Undefined when zero, so a plain concept import says nothing about
		// baselines rather than claiming a zero it never measured.
		result.unbaselinedJunctions = unbaselinedJunctions;
	}

	if (sourceStage.active && !sourceStageFailure) {
		// Same reporting as the wizard path: what the predicate dropped is a
		// user-visible number, not a debug-log-only one.
		result.filteredOut = sourceStage.excludedCount;
		debug?.info('generation', 'source-stage-applied', `source stage admitted ${completed} of ${sourceStage.examinedCount} source rows`, {
			examined: sourceStage.examinedCount,
			excluded: sourceStage.excludedCount,
			joins: sourceStage.joins.map((join) => ({
				alias: join.alias,
				indexedRows: join.indexedRowCount,
				distinctKeys: join.distinctKeyCount,
			})),
		});
	}

	// Pass 1.5 — batch enrichment patch phase (post-stream). Derives parent→children
	// + facet hubs from the collected records (never re-reads the vault for the
	// derivation), then writes children onto parents and materializes hub notes via
	// the same managed-merge path so re-imports stay idempotent + user-safe.
	let enrichmentComplete = true;

	// AM-2. Account for the rows this run KEPT, so a skip refresh of an unchanged
	// set reports zero orphans. Bookkeeping only, no writes.
	if (enrichmentEnabled && keptRecords.length > 0 && !sourceStageFailure) {
		enrichmentComplete = markKeptHubsProduced({
			recipe,
			curiePrefix,
			basePath: options.basePath,
			streamed: isStreamed,
			records: [...enrichRecords, ...keptRecords],
			producedCuries,
			result,
			debug,
		}) && enrichmentComplete;
	}

	if (enrichmentEnabled && enrichRecords.length > 0 && !sourceStageFailure) {
		try {
			await applyEnrichment(
				app,
				recipe,
				{ ...options, sourceVersion: options.sourceVersion ?? recipe.source?.version },
				curiePrefix,
				enrichRecords,
				result,
				importSet,
				producedCuries,
				curieOrigins,
				isStreamed,
				{ owned: ownedIdentityIndex, vaultWide: identityIndex },
				debug,
			);
		} catch (enrichErr) {
			enrichmentComplete = false;
			const msg = enrichErr instanceof Error ? enrichErr.message : String(enrichErr);
			result.warnings ??= [];
			result.warnings.push({ row: 0, message: `Enrichment pass failed: ${msg}` });
			debug?.error('generation', 'enrichment-failed', 'Enrichment pass failed', { error: msg });
		}
	}

	// Same fail-closed orphan guard as the wizard path: only a complete run with
	// zero errors can prove that a formerly-owned identity is absent from source.
	// Rows the source stage excluded were still seen and still decided. They
	// count toward "the whole source was processed", so orphan detection stays
	// available for a filtered import: a note whose row is now excluded is a
	// genuine orphan and must be reported as one. `excludedCount` is 0 whenever
	// no source shaping is declared, leaving this expression exactly as it was.
	const rowCountComplete =
		parsedData.rowCount < 0 || completed + sourceStage.excludedCount === parsedData.rowCount;
	// AM-7. Record WHETHER detection ran. An uncomputed orphan count is not
	// zero, and a surface that renders it as zero says the import is intact
	// when nothing checked.
	result.orphansChecked = result.success && result.errors.length === 0 && rowCountComplete && enrichmentComplete;
	if (result.orphansChecked) {
		const orphans = ownedIdentityIndex.curies()
			.filter((curie) => !producedCuries.has(curie))
			.map((curie) => ({ curie, path: ownedIdentityIndex.get(curie)!.path }))
			.sort((a, b) => a.curie.localeCompare(b.curie) || a.path.localeCompare(b.path));
		if (orphans.length > 0) result.orphans = orphans;
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
 * Where a hub note should be written, resolved by identity first and by address
 * only as a last resort.
 *
 * A hub used to be found with `getAbstractFileByPath` alone. That is a guess
 * about a note dressed up as a lookup: the moment an import's destination
 * changes, the guess misses, a second hub is created for a concept the vault
 * already holds, and the two files claim one curie forever — which surfaces as
 * "Ambiguous identity", which in turn suppresses orphan reporting for the whole
 * run. Concepts have gone through the identity index since 2026-08-21; hubs did
 * not, and this closes that gap.
 *
 * `legacyCuries` is the second half of the same problem: hub identity itself used
 * to be derived from the hub's full vault path (see `HubNote.legacyCuries`), so a
 * moved destination did not merely relocate a hub, it RENAMED it. Accepting the
 * old form as an alias is what keeps those hubs reconcilable instead of orphaned.
 * A hub can carry user prose and user frontmatter, so recreating one at the new
 * address and cleaning up the old is not available: it would destroy that content.
 *
 * AM-33 (2026-09-01). Three identity steps, values first and notes last, before
 * the address is consulted at all:
 *
 *   1. the VALUE-derived identity, through the owned index;
 *   2. the legacy PATH-derived forms — and these are computed from the CURRENT
 *      render, so they can only ever match a hub that has not moved. That is
 *      their whole and stated limitation: they reconcile a scheme upgrade at an
 *      unchanged address and nothing else. A form recomputed from a path is
 *      never trusted past this step;
 *   3. owned hub notes whose RECORDED values equal these values, found by
 *      reading the notes. This is the step that survives a moved destination, a
 *      changed layout above the hub, and a later improvement to the derivation:
 *      the note says what it is about, and a recorded fact does not move.
 *
 * Only then the address (AM-14), and only then a create.
 */
function resolveHubTarget(
	app: App,
	desiredPath: string,
	curie: string | null,
	legacyCuries: string[] | undefined,
	ownedIndex?: IdentityIndex,
	vaultWideIndex?: IdentityIndex,
	ownedSetId?: string,
	producedThisRun?: ReadonlySet<string>,
	/** AM-33 step 3: this hub's layout values, and the owned hubs that record theirs. */
	byValues?: { levelValues?: LayoutValue[]; index?: OwnedHubValueIndex },
): { existingFile: TFile | null; writePath: string; moveFrom?: string; adoptedAlias?: string; refusal?: AddressRefusal } {
	// AM-12: the OWNED index. A hub held by another set is refused by the caller
	// before this runs, so anything found here belongs to the set being written.
	const byIdentity = curie && ownedIndex ? ownedIndex.get(curie) : null;
	if (byIdentity) {
		return byIdentity.path === desiredPath
			? { existingFile: byIdentity, writePath: desiredPath }
			: { existingFile: byIdentity, writePath: desiredPath, moveFrom: byIdentity.path };
	}

	if (ownedIndex && legacyCuries) {
		for (const alias of legacyCuries) {
			const aliased = ownedIndex.get(alias);
			if (!aliased) continue;
			return aliased.path === desiredPath
				? { existingFile: aliased, writePath: desiredPath, adoptedAlias: alias }
				: { existingFile: aliased, writePath: desiredPath, moveFrom: aliased.path, adoptedAlias: alias };
		}
	}

	// AM-33 step 3. The notes, read. Steps 1 and 2 both ask an INDEX about a value
	// this run just computed; when the hub moved, or the layout above it changed,
	// or the derivation improved, every computed form misses and the hub that
	// plainly exists is found by nothing - which is how a second hub gets written
	// and the first is orphaned carrying the user's prose. A hub records what it
	// is about, and that record is matched here.
	//
	// The note's own recorded curie travels back as `adoptedAlias`, so the
	// identity this run supersedes is claimed rather than reported as a note that
	// vanished - the same treatment step 2's aliases already get.
	if (byValues?.index && byValues.levelValues && byValues.levelValues.length > 0) {
		const found = byValues.index.get(byValues.levelValues);
		if (found) {
			return found.file.path === desiredPath
				? { existingFile: found.file, writePath: desiredPath, adoptedAlias: found.curie }
				: { existingFile: found.file, writePath: desiredPath, moveFrom: found.file.path, adoptedAlias: found.curie };
		}
	}

	// Address is consulted last, and since AM-12 the index it could not be seen in
	// is the OWNED one, so this branch covers two cases: a note with no
	// `_crosswalker` block of its own, and a note some other set owns that happens
	// to sit at this address under a DIFFERENT identity. AM-12 refuses the first
	// kind of boundary crossing (same identity, other owner) at the caller.
	//
	// AM-14 closes the second, which was the last unguarded route into a note: a
	// hub whose rendered address happens to hold another set's note was merged
	// into and restamped, no matter whose it was. The owned-stamp case is the
	// ordinary same-set re-import and is adopted exactly as before.
	const direct = app.vault.getAbstractFileByPath(desiredPath);
	if (direct instanceof TFile) {
		const refusal = addressRefusal(vaultWideIndex, direct.path, ownedSetId ?? null, producedThisRun);
		if (refusal) return { existingFile: null, writePath: desiredPath, refusal };
		return { existingFile: direct, writePath: desiredPath };
	}
	return { existingFile: null, writePath: desiredPath };
}

/**
 * AM-33 (2026-09-01). Owned hub notes, looked up by the VALUES they record.
 *
 * The third and last identity step for a hub. Steps 1 and 2 ask an index about a
 * form this run just computed from the current render; this one asks the notes
 * what they say about themselves. A recorded fact survives a moved destination,
 * a changed layout above the hub, and any later improvement to the derivation -
 * none of which a recomputed form survives.
 *
 * Keyed on the VALUES alone, not on the level NAMES beside them: renaming a
 * layout level (`family` -> `control_family`) is a change to how the source is
 * described, not to which folder this hub is about, and re-minting every hub for
 * it would orphan them all. The level names are recorded on the note anyway, for
 * a reader and for diagnosis.
 *
 * Scoped to the notes the OWNED index already admitted, so it costs a
 * frontmatter read per owned note rather than a second whole-vault pass, and so
 * it cannot reach across a set boundary (AM-12).
 */
interface OwnedHubValueIndex {
	get(values: LayoutValue[]): { file: TFile; curie: string } | null;
	size: number;
}

/** Canonical key for a hub's value chain. Values only - see `OwnedHubValueIndex`. */
function hubValuesKey(values: readonly string[]): string {
	return JSON.stringify(values);
}

/**
 * AM-39. The keys that RECORD what a hub is about, declared managed on every hub
 * write whether or not this run computed them.
 *
 * Managed keys are otherwise derived from the fresh frontmatter, which means a
 * key the run could not compute is absent, and an absent key is preserved as
 * though the user had written it. For a record the product itself matches on,
 * that is a stale assertion nothing can retract: `buildOwnedHubValueIndex` keeps
 * offering the note as the hub for values it no longer covers, and a later run
 * whose folder genuinely has those values adopts it, moves it, and restamps it.
 * A record that cannot be cleared is not a record.
 */
const HUB_VALUE_RECORD_KEYS: readonly string[] = ['hub_levels', 'hub_values'];

/**
 * SUSPECTED 8, ruled 2026-09-02. THE ONE DISCRIMINATOR for "did the cache answer
 * about this note?", used by every read in this file that has a disk fallback.
 *
 * There were two readings of that question here, added in the same pass. One
 * asked whether a cache ENTRY existed (`!cached`) and treated an entry whose
 * `frontmatter` was momentarily absent as a fact about the note; the other asked
 * whether the FRONTMATTER was there (`!fm`) and re-read the file. The second is
 * the safe one, and coexisting readings of the same question is how this project
 * has accumulated nine recorded instances of absence read as fact.
 *
 * `readNoteFrontmatterState` IS that reading: it accepts a cache entry only when
 * it actually carries properties, reads the file otherwise, and answers with the
 * tri-state (`ok` / `none` / `unreadable`) so a caller can tell a note that has
 * no properties from a note nothing could be read from. This wrapper exists to
 * be the single seam: Part B's `readIndexed` accessor replaces its body, and
 * these are its first callers.
 */
function readFrontmatterForRun(app: App, file: TFile): Promise<NoteFrontmatterRead> {
	return readNoteFrontmatterState(app, file);
}

/** A frontmatter value that is a list of strings, or null. */
function readStringArray(value: unknown): string[] | null {
	if (!Array.isArray(value)) return null;
	if (!value.every((v) => typeof v === 'string')) return null;
	return value as string[];
}

async function buildOwnedHubValueIndex(app: App, owned: IdentityIndex | undefined): Promise<OwnedHubValueIndex> {
	const byKey = new Map<string, { file: TFile; curie: string }>();
	if (owned) {
		for (const curie of owned.curies()) {
			const file = owned.get(curie);
			if (!file) continue;
			// S8 (ruled 2026-09-02): the same discriminator the review-baseline read
			// uses. Cache lag is not absence (`project_cache_lag_is_not_absence`): a
			// note Obsidian has not reached yet, or whose entry carries no
			// properties, is read rather than assumed to record nothing.
			const read = await readFrontmatterForRun(app, file);
			if (read.state !== 'ok') continue;
			const fm = read.frontmatter;
			if (fm.kind !== 'hub') continue;
			const values = readStringArray(fm.hub_values);
			if (!values || values.length === 0) continue;
			const key = hubValuesKey(values);
			// First claimant wins, matching the identity index's own collision rule,
			// so the two cannot disagree about which note answers.
			if (!byKey.has(key)) byKey.set(key, { file, curie });
		}
	}
	return {
		get: (values: LayoutValue[]) => byKey.get(hubValuesKey(values.map((v) => v.value))) ?? null,
		size: byKey.size,
	};
}

/**
 * Physically apply a hub relocation decided by `resolveHubTarget`. Returns the
 * path to write at: the destination when the move succeeded, and the note's
 * CURRENT path when the destination is already occupied by something this batch
 * did not produce. Refusing to move is always safe; clobbering is not.
 */
async function applyHubRelocation(
	app: App,
	target: { existingFile: TFile | null; writePath: string; moveFrom?: string },
	curie: string | null,
	result: GenerationResult,
	overwriteMode: 'skip' | 'replace' | 'error' | undefined,
	/**
	 * AM-20 (2026-08-31). The addresses this run has already put a note at.
	 *
	 * Failure mode prevented: a hub this run RELOCATED being refused, by a later
	 * hub resolving onto its new address, as a note that is not Crosswalker's.
	 * The vault-wide index is a pre-run snapshot and knows the moved note only
	 * under its OLD path, so `provenanceAt(newPath)` answers null and
	 * `addressRefusal` reads that as `not-crosswalker`. A rename is a mutation
	 * this run made, exactly like a create, so it is recorded exactly like one.
	 * Reachable when `hub_note_folder` overlaps a layout folder: the facet-hub
	 * loop relocates first, the level-hub loop resolves second.
	 */
	producedThisRun: Set<string>,
	debug?: DebugLog,
): Promise<string> {
	if (!target.moveFrom || !target.existingFile) return target.writePath;
	if (overwriteMode === 'skip') {
		// Leave it exactly where it is, and do not create the folder it would have
		// moved into: a destination that will receive nothing must not be built.
		debug?.info('generation', 'hub-relocation-skipped', `Hub ${curie ?? target.existingFile.path} left at ${target.moveFrom} (skip mode)`, {
			curie, from: target.moveFrom, to: target.writePath,
		});
		return target.existingFile.path;
	}
	if (app.vault.getAbstractFileByPath(target.writePath)) {
		result.warnings ??= [];
		result.warnings.push({
			row: 0,
			message: `Hub ${curie ?? target.existingFile.path}: left at ${target.moveFrom} because ${target.writePath} is already occupied.`,
		});
		return target.existingFile.path;
	}
	const parentPath = getParentPath(target.writePath);
	if (parentPath) await ensureFolderExists(app, parentPath).catch(() => {});
	await app.vault.rename(target.existingFile, target.writePath);
	// AM-20. A hub this run relocated is a note this run produced.
	producedThisRun.add(normalizePath(target.writePath));
	result.moved ??= [];
	result.moved.push({ curie: curie ?? '', from: target.moveFrom, to: target.writePath });
	debug?.info('generation', 'hub-relocated', `Hub ${curie ?? ''} moved`, { from: target.moveFrom, to: target.writePath });
	return target.writePath;
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
/**
 * AM-2 (2026-08-30). Mark the hub identities a run's rows IMPLY as produced,
 * without writing anything.
 *
 * Failure mode prevented: a skip-mode refresh orphaning every hub the import set
 * owns. Both write loops return early for a skipped row, ABOVE the point where
 * they collect enrichment records, so an unchanged set produced no records at
 * all, `applyEnrichment` never ran, no hub curie was ever added to
 * `producedCuries`, and orphan detection then reported every hub as vanished.
 * A row that is skipped is still a row this run vouches for.
 *
 * BOOKKEEPING ONLY. `enrich()` is pure (no vault I/O) and only its curies are
 * consumed here. No note is written, merged, moved or relocated, and no folder
 * is created, so hub prose is untouched and `applyHubRelocation` stays the
 * no-op under skip that it already was.
 *
 * Legacy hub curies are marked alongside the current form. A hub written under
 * the older address-derived identity still carries that curie on disk, and that
 * is the curie the owned identity index holds; marking only the current form
 * would leave the very hub this run kept looking exactly like one that vanished.
 *
 * Returns false when the derivation failed, so the caller suppresses orphan
 * reporting rather than publishing a list derived from an incomplete picture.
 */
function markKeptHubsProduced(args: {
	recipe: Recipe;
	curiePrefix: string;
	basePath: string;
	streamed: boolean;
	records: EnrichRecord[];
	producedCuries: Set<string>;
	result: GenerationResult;
	debug?: DebugLog;
}): boolean {
	const { recipe, curiePrefix, basePath, streamed, records, producedCuries, result, debug } = args;
	try {
		const implied = enrich(
			records.map((r) => ({
				path: r.path,
				curie: r.curie,
				frontmatter: r.frontmatter,
				facets: r.facets,
				renderedPath: r.renderedPath,
				// AM-33: carried through. Dropping it here would silently put the hub
				// pass back on the path-derived identity for kept rows only, so a
				// skip refresh and a write refresh would disagree about what a hub is.
				layoutValues: r.layoutValues,
			})),
			{ ontology: curiePrefix, config: recipe.target.enrichment ?? {}, streamed, rootFolder: basePath },
		);
		// AM-31, deliberately NOT guarded here, and this is the reasoned exception
		// to "one rule, all writers": this pass writes nothing, so there is nothing
		// to refuse. It is also handed `[...enrichRecords, ...keptRecords]`, i.e.
		// the SAME hubs `applyEnrichment` is about to write in a mixed skip/write
		// run, so recording a claim here would make every one of those hubs refuse
		// itself as a duplicate of its own bookkeeping entry. The guard belongs at
		// the writers; this pass only vouches for what the run kept.
		const mark = (hub: HubNote): void => {
			const hubCurie = typeof hub.frontmatter.curie === 'string' ? hub.frontmatter.curie : null;
			if (hubCurie) producedCuries.add(hubCurie);
			for (const alias of hub.legacyCuries ?? []) producedCuries.add(alias);
		};
		for (const hub of implied.hubs) mark(hub);
		for (const hub of implied.levelHubs.notes) mark(hub);
		return true;
	} catch (bookkeepErr) {
		const msg = bookkeepErr instanceof Error ? bookkeepErr.message : String(bookkeepErr);
		result.warnings ??= [];
		result.warnings.push({
			row: 0,
			message: `Could not account for the notes this import kept, so notes no longer in the source were not reported. ${msg}`,
		});
		debug?.error('generation', 'kept-bookkeeping-failed', 'Kept-row hub bookkeeping failed', { error: msg });
		return false;
	}
}

async function applyEnrichment(
	app: App,
	recipe: Recipe,
	options: EnrichmentWriteOptions,
	curiePrefix: string,
	records: EnrichRecord[],
	result: GenerationResult,
	importSet: ImportSetReference,
	producedCuries: Set<string>,
	/**
	 * AM-31. The run's claim ledger, shared with the row loops. A hub is a writer
	 * like any other: it must not take an identity this run already produced, and
	 * it must record the one it takes so nothing later can take it again.
	 */
	curieOrigins: Map<string, ProducedCurieOrigin>,
	streamed: boolean,
	/**
	 * AM-12. Two indexes, two jobs: `owned` RESOLVES a hub to the note this set
	 * already has, `vaultWide` only DETECTS one held by a different set. Passing a
	 * single vault-wide index here is what let hub writes cross a set boundary.
	 */
	indexes: { owned?: IdentityIndex; vaultWide?: IdentityIndex } | undefined,
	debug?: DebugLog,
): Promise<void> {
	const config = recipe.target.enrichment ?? {};
	// Hub/facet notes are synthetic (no source row → no concept identity), so
	// they carry recipe.hash but never concept_cid — see the two buildProvenance
	// calls below. Computed once per applyEnrichment call (one per generation run).
	const recipeHash = computeRecipeHash(recipe.target, recipe.source);
	const enrichment = enrich(
		records.map((r) => ({
			path: r.path,
			curie: r.curie,
			frontmatter: r.frontmatter,
			facets: r.facets,
			renderedPath: r.renderedPath,
			// AM-33: the values this row's folder levels rendered, carried to the hub pass.
			layoutValues: r.layoutValues,
		})),
		{ ontology: curiePrefix, config, streamed, rootFolder: options.basePath },
	);
	result.edgeCount = enrichment.edgeCount;

	if (enrichment.deviations.length > 0) {
		result.warnings ??= [];
		for (const d of enrichment.deviations) result.warnings.push({ row: 0, message: d });
	}

	const recordsByPath = new Map(records.map((r) => [r.path, r]));

	// AM-14. Every address THIS run has already written or kept. Both identity
	// indexes were built before the run started, so a note this run created is
	// absent from them; without this a hub resolving onto an address an earlier
	// row of the SAME run wrote would refuse itself as `not Crosswalker's`.
	// Ownership is the stamp on the note, and that stamp names this set.
	const producedThisRun = new Set<string>([
		...records.map((r) => normalizePath(r.path)),
		...result.created.map((path) => normalizePath(path)),
		...result.skipped.map((path) => normalizePath(path)),
	]);

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
		producedThisRun.add(toPath);

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
			{ sourceFile: options.sourceFileName, sourceVersion: options.sourceVersion, recipeId: recipe.recipe, recipeHash, importSet },
			PLUGIN_VERSION,
		);
		// Hub ownership and produced membership are recorded together. Splitting
		// these operations is what previously made successful hubs look orphaned.
		const hubCurie = typeof frontmatter.curie === 'string' ? frontmatter.curie : null;
		// AM-12. Detection before ownership: a hub identity claimed by another set is
		// reported and this hub is left entirely alone. Recording it as produced
		// first would vouch for a note this run refused to write.
		const foreignHub = foreignHubClaim(indexes?.owned, indexes?.vaultWide, hubCurie, hub.legacyCuries);
		if (foreignHub) {
			result.errors.push({ row: 0, message: crossSetCollisionMessage(foreignHub.curie, foreignHub.claim) });
			continue;
		}
		// Identity first: a facet hub curie is already address-independent, but it
		// was resolved by path alone, so a changed destination created a duplicate
		// instead of finding the hub that exists.
		//
		// AM-14. Resolved BEFORE the hub is recorded as produced, for the same
		// reason AM-12's detection is: a hub refused at its address is a hub this
		// run never wrote, and marking it produced would both vouch for a note that
		// does not exist and hide a real orphan behind it.
		const target = resolveHubTarget(
			app,
			fullPath,
			hubCurie,
			hub.legacyCuries,
			indexes?.owned,
			indexes?.vaultWide,
			importSet.id,
			producedThisRun,
		);
		if (target.refusal) {
			reportAddressRefusal(result, debug, target.refusal, 0, hubCurie ?? undefined);
			continue;
		}
		// AM-31. The within-run duplicate guard, at a hub writer. A facet value and
		// a row identity, or two facet values whose slug collapses (`Access Control`
		// and `access-control`), can produce one curie; before this the second was
		// written anyway, leaving the vault holding one identity twice - permanent,
		// and fatal to every later import in that vault. Refused HERE, above every
		// write and above the relocation, so a refused hub is one this run never
		// touched.
		if (hubCurie) {
			const firstClaim = claimProducedCurie(producedCuries, curieOrigins, hubCurie, {
				row: 0, path: fullPath, kind: 'hub',
			});
			if (firstClaim) {
				result.errors.push({ row: 0, message: duplicateHubCurieMessage(hubCurie, fullPath, firstClaim) });
				continue;
			}
		}
		let body = hub.body;

		const existing = target.existingFile;
		const writePath = await applyHubRelocation(app, target, hubCurie, result, options.overwriteMode, producedThisRun, debug);
		if (existing instanceof TFile) {
			// Re-import through the SAME shared merger the row writes use. `kind:
			// 'facet-hub'` selects adopt-by-replay: `mergeHubBody` was already
			// non-destructive, so an equality rule would REGRESS a working path and
			// stop hubs updating. A facet hub therefore never conflicts on its body,
			// only on unreadable properties or corrupt markers.
			// AM-31. The superseded identity is claimed too, and by the same rule: if
			// something else in this run already produced it, two writers disagree
			// about one identity and neither may proceed silently.
			if (target.adoptedAlias) {
				const firstClaim = claimProducedCurie(producedCuries, curieOrigins, target.adoptedAlias, {
					row: 0, path: existing.path, kind: 'hub',
				});
				if (firstClaim) {
					result.errors.push({
						row: 0,
						message: duplicateHubCurieMessage(target.adoptedAlias, existing.path, firstClaim),
					});
					continue;
				}
			}
			const outcome = await mergeExistingNote({
				app,
				file: existing,
				freshFrontmatter: frontmatter,
				managedKeys: computeManagedKeys(frontmatter, userPreserve),
				freshManagedBody: hub.body,
				kind: 'facet-hub',
			});
			if (!outcome.ok) {
				recordConflict(result, debug, writePath, hubCurie ?? undefined, outcome.code, outcome.detail);
				continue;
			}
			Object.keys(frontmatter).forEach((k) => delete frontmatter[k]);
			Object.assign(frontmatter, outcome.frontmatter);
			body = outcome.body;
			await app.vault.modify(existing, buildNoteContent(frontmatter, body));
		} else {
			body = wrapManagedBody(hub.body);
			const parentPath = getParentPath(writePath);
			if (parentPath) await ensureFolderExists(app, parentPath).catch(() => {});
			await app.vault.create(writePath, buildNoteContent(frontmatter, body));
			result.created.push(writePath);
			producedThisRun.add(normalizePath(writePath));
		}
	}

	// AM-33 step 3's index. Built once, and only when at least one level hub
	// actually carries recorded values, so an import with no level hubs (or one
	// whose hubs predate the values) pays nothing for it.
	const hubValueIndex = enrichment.levelHubs.notes.some((h) => h.levelValues && h.levelValues.length > 0)
		? await buildOwnedHubValueIndex(app, indexes?.owned)
		: undefined;

	// 3. Synthetic level-hub notes (level_hubs='notes', pure structural folders
	//    with no hosting concept note — module doc step 4.5). `hub.path` here is
	//    ALREADY a full vault-relative path (it was built from `rootFolder`,
	//    i.e. `options.basePath`) — unlike facet `hub.path` above (relative to
	//    `hub_note_folder`), this one must NOT be re-prefixed with basePath.
	for (const hub of enrichment.levelHubs.notes) {
		const fullPath = normalizePath(hub.path);
		const frontmatter: Record<string, any> = { ...hub.frontmatter };
		frontmatter._crosswalker = buildProvenance(
			{ sourceFile: options.sourceFileName, sourceVersion: options.sourceVersion, recipeId: recipe.recipe, recipeHash, importSet },
			PLUGIN_VERSION,
		);
		// Hub ownership and produced membership are recorded together. Splitting
		// these operations is what previously made successful hubs look orphaned.
		const hubCurie = typeof frontmatter.curie === 'string' ? frontmatter.curie : null;
		// AM-12. Detection before ownership: a hub identity claimed by another set is
		// reported and this hub is left entirely alone. Recording it as produced
		// first would vouch for a note this run refused to write.
		const foreignHub = foreignHubClaim(indexes?.owned, indexes?.vaultWide, hubCurie, hub.legacyCuries);
		if (foreignHub) {
			result.errors.push({ row: 0, message: crossSetCollisionMessage(foreignHub.curie, foreignHub.claim) });
			continue;
		}
		// Identity first, with the address-derived legacy forms accepted as aliases.
		// A level hub whose curie moved with its folder is the silent case: no
		// collision, no error, just two files and a batch of new orphans. The alias
		// is what lets the existing note keep its content and be restamped instead.
		//
		// AM-14. Resolved BEFORE the hub is recorded as produced, for the same
		// reason AM-12's detection is: a hub refused at its address is a hub this
		// run never wrote, and marking it produced would vouch for a note that does
		// not exist.
		const target = resolveHubTarget(
			app,
			fullPath,
			hubCurie,
			hub.legacyCuries,
			indexes?.owned,
			indexes?.vaultWide,
			importSet.id,
			producedThisRun,
			// AM-33 step 3: the values this hub is about, and the owned hubs that
			// record theirs. Consulted only after both computed forms miss.
			{ levelValues: hub.levelValues, index: hubValueIndex },
		);
		if (target.refusal) {
			reportAddressRefusal(result, debug, target.refusal, 0, hubCurie ?? undefined);
			continue;
		}
		// AM-31. Same guard as the facet hubs above, at the other hub writer. One
		// rule, all writers: a level hub that would take an identity this run
		// already produced is refused by name rather than written into a collision.
		if (hubCurie) {
			const firstClaim = claimProducedCurie(producedCuries, curieOrigins, hubCurie, {
				row: 0, path: fullPath, kind: 'hub',
			});
			if (firstClaim) {
				result.errors.push({ row: 0, message: duplicateHubCurieMessage(hubCurie, fullPath, firstClaim) });
				continue;
			}
		}
		let body = hub.body;

		const existing = target.existingFile;
		// The adopted alias is recorded as produced so the identity this run
		// deliberately superseded is not then reported as a note that vanished.
		// AM-31: claimed, not merely added, so a second writer of that same
		// superseded identity is refused rather than silently agreed with.
		//
		// AM-39. Claimed ABOVE the relocation, exactly as the curie claim above is.
		// AM-31's invariant is "above every write and above the relocation", and
		// this was the one claim below it. It was unreachable until AM-33 step 3,
		// whose whole purpose is an alias on a note that has MOVED: a hub refused
		// here after the move had already run was physically renamed to the new
		// address and then abandoned by `continue` with nothing written into it, so
		// a refusal left the vault rearranged. A refusal must leave the vault
		// exactly as it found it.
		if (existing instanceof TFile && target.adoptedAlias) {
			const firstClaim = claimProducedCurie(producedCuries, curieOrigins, target.adoptedAlias, {
				row: 0, path: existing.path, kind: 'hub',
			});
			if (firstClaim) {
				result.errors.push({
					row: 0,
					message: duplicateHubCurieMessage(target.adoptedAlias, existing.path, firstClaim),
				});
				continue;
			}
		}
		const writePath = await applyHubRelocation(app, target, hubCurie, result, options.overwriteMode, producedThisRun, debug);
		if (existing instanceof TFile) {
			// Re-import: regenerate the managed Contents section, preserve user
			// frontmatter + any prose outside it (title, notes, etc.).
			//
			// A synthetic level hub gets NO `body` region in v1 (contract §2.3): it
			// has no row render, and its entire managed content IS `children`. So it
			// merges through the children region alone, not through mergeExistingNote.
			// The frontmatter read is still the fail-closed one: a cache miss must
			// never look like "this note has no properties".
			let existingNote: { frontmatter: Record<string, unknown>; body: string };
			try {
				existingNote = await readExistingNote(app, existing);
			} catch (readErr) {
				const detail = readErr instanceof ExistingNoteReadError ? readErr.detail : String(readErr);
				recordConflict(result, debug, writePath, hubCurie ?? undefined, 'frontmatter-unreadable', detail);
				continue;
			}
			const scan = scanRegions(existingNote.body);
			if (!scan.ok) {
				recordConflict(result, debug, writePath, hubCurie ?? undefined, scan.code, scan.detail);
				continue;
			}
			if (Object.keys(existingNote.frontmatter).length > 0) {
				try {
					// AM-39. `hub_levels`/`hub_values` are ALWAYS managed on a hub, even
					// in a run that computes none. Managed keys are otherwise the keys
					// the fresh frontmatter happens to carry, so a run that could not
					// compute values simply omitted them and the merge preserved the
					// note's OLD values as if they were a user annotation. A stale
					// record is worse than no record: the value index keeps offering
					// that note as the hub for values it no longer covers, and step 3
					// then moves it and restamps it into a folder that is about
					// something else. Declaring them managed makes "no values this run"
					// delete the claim instead of leaving it standing.
					const managedKeys = computeManagedKeys(frontmatter, userPreserve, HUB_VALUE_RECORD_KEYS);
					const merged = mergeFrontmatter(existingNote.frontmatter, frontmatter, managedKeys);
					Object.keys(frontmatter).forEach((k) => delete frontmatter[k]);
					Object.assign(frontmatter, merged);
				} catch (mergeErr) {
					recordConflict(result, debug, writePath, hubCurie ?? undefined, 'frontmatter-merge-failed',
						mergeErr instanceof Error ? mergeErr.message : String(mergeErr));
					continue;
				}
			}
			// hub.facetLinks: the ROOT hub only (enrich.ts's computeLevelHubs) —
			// re-derive the same "Facets" extraGroup a fresh import would build,
			// so a re-import doesn't silently drop it (the merge rebuilds the
			// managed section from these fields, never by re-parsing `body`).
			const facetGroup = hub.facetLinks ? [{ label: 'Facets', links: hub.facetLinks }] : [];
			const freshSection = buildManagedChildrenSection('Contents', hub.childrenLinks ?? [], facetGroup);
			body = mergeManagedChildrenSection(existingNote.body, freshSection);
			if (config.waypoint_marker) body = ensureWaypointMarker(body);
			await app.vault.modify(existing, buildNoteContent(frontmatter, body));
		} else {
			if (config.waypoint_marker) body = ensureWaypointMarker(body);
			const parentPath = getParentPath(writePath);
			if (parentPath) await ensureFolderExists(app, parentPath).catch(() => {});
			await app.vault.create(writePath, buildNoteContent(frontmatter, body));
			result.created.push(writePath);
			producedThisRun.add(normalizePath(writePath));
		}
	}
}

/**
 * Default body for native-recipe-rendered notes: H1 plus rendered regions.
 *
 * The H1 is `recipe.target.auto_heading`-controlled (SchemaVer 1.8.0). With the
 * key absent this is byte-for-byte the historical function: an UNCONDITIONAL
 * `# <title>`, emitted even when the body is empty — deliberately unlike the
 * wizard path's conditional. `false`, or a template that renders empty, drops
 * the heading and emits the managed body alone (never a bare `# `).
 *
 * Exported for tests (and used by tests/helpers/golden-vault.ts so the golden
 * harness cannot drift from the writer).
 */
export function buildDefaultBody(
	frontmatter: Record<string, any>,
	address: Pick<ReturnType<typeof render>, 'body'>,
	recipe: { target: { auto_heading?: string | false } },
	scope: SourceScope,
	report?: RenderReport,
): string {
	const fallbackTitle = String(frontmatter.title ?? frontmatter.curie ?? 'Untitled');
	const heading = resolveAutoHeadingText(recipe, scope, fallbackTitle, report);
	const managedBody = renderedBodyRegionsToMarkdown(address.body);
	// An empty render only suppresses when a template was actually configured.
	// The absent case keeps the historical branch even for a pathologically
	// empty fallback title, so no already-generated vault shifts.
	const configured = typeof recipe.target.auto_heading === 'string';
	if (heading === null || (configured && heading.trim() === '')) {
		return managedBody === '' ? '' : `${managedBody}\n`;
	}
	return managedBody === '' ? `# ${heading}\n` : `# ${heading}\n\n${managedBody}\n`;
}

/**
 * Default per-row CURIE local part, under the derivation the set is pinned to.
 *
 * AM-27. `filename-stem-v1` is frozen: row.curie's local part if present, else
 * row.id / row.subject_id / row.control_id / row.code, else row-N, all of it
 * through `sanitizeFileName`. That last step is the defect - it rewrites even a
 * DECLARED curie, so a source that states `nist:AC-2(1)/a` gets a different
 * identity written into the vault than the one it declared - but it is what every
 * set minted before the pin already carries, and it is kept for exactly those.
 */
function defaultCurieLocalPart(
	row: Record<string, unknown>,
	rowNum: number,
	derivation: ImportSetDerivation,
	/**
	 * AM-28/AM-34. The set's BASE ontology prefix - the one a source may state.
	 * A declared `curie` is checked against it rather than being stripped and
	 * re-prefixed, so a value that passes is reproduced verbatim; the caller then
	 * puts the set's resolved prefix in front, uniformly and invertibly.
	 */
	basePrefix: string,
): string {
	if (derivation === 'declared-facts-v1') {
		return declaredFactsLocalPart(row, () => `row-${rowNum}`, basePrefix);
	}
	const candidate = row.curie ?? row.id ?? row.subject_id ?? row.control_id ?? row.code;
	if (typeof candidate === 'string' && candidate.length > 0) {
		// If it's already a full CURIE, take the local part
		const colonIdx = candidate.indexOf(':');
		const local = colonIdx > 0 ? candidate.slice(colonIdx + 1) : candidate;
		return sanitizeFileName(local);
	}
	return `row-${rowNum}`;
}

/**
 * AM-27. `declared-facts-v1`: one rule, shared by both generation entry points.
 *
 * Declared facts first. The source's own identity columns are consulted before
 * anything derived from an address, because an identity a source STATES is the
 * only one that can be joined back to the source system; a stem read off a
 * filename template is a fact about where the note went, not about what it is.
 *
 * Four behaviours, in order:
 *   - a declared `curie` column is honoured VERBATIM, prefix included, or REFUSED
 *     BY NAME (AM-28). Never sanitized and never re-prefixed: silently rewriting
 *     a declared identity puts a value in the vault that the source never
 *     asserted, and merges rows whose declared curies differ only in a rejected
 *     character or in whose prefix they carry.
 *   - a declared `id` is an identifier, not a declared CURIE, so it may be made
 *     charset-safe - but injectively over the EXACT raw value (AM-28), so no two
 *     of them collapse together.
 *   - an EDGE-shaped row (AM-29: the run declares both a subject and an object)
 *     is identified by its three endpoints together. `subject_id` used to sit in
 *     the chain above, which gave every edge leaving one control that control's
 *     identity - one identity for many edges. A relationship is never identified
 *     by one of its ends. Concept-only identifiers (`control_id`, `code`) are
 *     consulted only for a row that is not edge-shaped, for the same reason.
 *   - `lastResort` supplies the caller's fallback (the filename stem for the
 *     wizard path, `row-N` for the recipe path), also injectively.
 */
function declaredFactsLocalPart(
	row: Record<string, unknown>,
	lastResort: () => string,
	/**
	 * AM-34. The set's BASE ontology prefix - what a source is entitled to state.
	 * The caller re-prefixes with the set's resolved (possibly set-qualified)
	 * prefix, uniformly, and the set stamp records what it takes to invert that.
	 */
	basePrefix: string,
): string {
	const declared = declaredIdentity(row);
	if (declared?.kind === 'edge') {
		return edgeIdentityLocalPart(declared.subject, declared.predicate, declared.object);
	}
	if (declared) {
		if (declared.column === 'curie') return declaredCurieLocalPart(declared.raw, basePrefix);
		return injectiveDeclaredIdLocalPart(declared.raw);
	}
	return injectiveCurieLocalPart(lastResort());
}
