import { Plugin, Notice, TFile, TFolder, MarkdownView, Platform, apiVersion, type WorkspaceLeaf } from 'obsidian';
import { CrosswalkerSettings, DEFAULT_SETTINGS } from './settings/settings-data';
import {
	isImportableExtension,
	countTopLevelOntologyFolders,
	formatOntologyStatusLabel,
	checkFirstRun,
	type TopLevelEntry,
} from './ui/entry-points';
import { CrosswalkerSettingTab } from './settings/settings-tab';
import { ImportWizardModal } from './import/import-wizard';
import { SssomImportModal } from './import/sssom-import-modal';
import { ConfigBrowserModal } from './config/config-browser-modal';
import { buildCrosswalkerPivotViewFactory } from './views/crosswalker-pivot-view';
import {
	registerCrosswalkerBasesView,
	isBasesPluginAvailable,
	type CrosswalkerBasesViewOption,
} from './views/bases-api';
import { writeReferenceBaseFiles } from './views/reference-base-files';
import { CrosswalkerWorkspaceView, VIEW_TYPE_CROSSWALKER_WORKSPACE } from './views/workspace-view';
import { DebugLog } from './utils/debug';
import { DraftStore } from './import/draft-store';
import { RecipePickerModal } from './views/recipe-picker-modal';
import { applyQueryToNote } from './views/apply-query-to-note';
import { regenerateAll } from './views/regenerate-query-views';
import { readQueryFrontmatter } from './views/query-frontmatter-io';
import { initValidator, validateRecipe as validateRecipeFn, validateTier1Frontmatter } from './validation/validator';
import { render } from './render';
import { legacyConfigToRecipe } from './generation/legacy-recipe-shim';
import { mergeFrontmatter, computeManagedKeys } from './generation/frontmatter-merge';
import { buildProvenance } from './generation/provenance';
import { generateNotes, generateFromRecipe } from './generation/generation-engine';
import { openSidecar, clearSidecar, type SidecarHandle } from './tier2/sidecar';
import { projectFromTier1, type ProjectionResult } from './tier2/projector';
import {
	getConceptsByOntology,
	crosswalkBetween,
	closureFromConcept,
	precomputeClosureForOntologyPair,
	type ConceptRow,
	type MappingRow,
	type ClosureEntry,
} from './tier2/queries';

/** Short platform label for the diagnostics bundle (no device-identifying detail). */
function diagnosticsPlatformLabel(): string {
	if (Platform.isMobileApp) {
		if (Platform.isIosApp) return 'mobile-ios';
		if (Platform.isAndroidApp) return 'mobile-android';
		return 'mobile';
	}
	if (Platform.isMacOS) return 'desktop-mac';
	if (Platform.isWin) return 'desktop-win';
	if (Platform.isLinux) return 'desktop-linux';
	return 'desktop';
}

/**
 * Crosswalker - Import structured ontologies into Obsidian
 *
 * Core capabilities:
 * 1. Import structured data (ontologies, taxonomies, frameworks) from CSV/XLSX/JSON
 * 2. Generate hierarchical folder structures with markdown notes
 * 3. Map columns to frontmatter properties with configurable transformations
 * 4. Create WikiLinks for crosswalks between nodes
 * 5. Enable typed links with metadata (Phase 2)
 */
export default class CrosswalkerPlugin extends Plugin {
	settings: CrosswalkerSettings;
	debug: DebugLog;
	draftStore: DraftStore;

	/**
	 * Status bar "installed ontologies" indicator (discoverability entry
	 * point 3). Held so the count can be refreshed on layout-ready and on
	 * vault structure changes without re-adding the element.
	 */
	private ontologyStatusBarEl: HTMLElement | null = null;

	// Validator + render + generation-module handles attached to the plugin
	// instance so E2E tests + future command implementations can call them
	// via the plugin reference. Underlying implementations are pure module
	// exports.
	//
	// validateRecipe wraps the module export. The `recipeSchemaStyle` setting
	// was removed (settings-redesign report, 2026-07-11) — both discriminator
	// styles validated identically, so style 'A' is now hardcoded.
	validateRecipe = (recipe: unknown) => validateRecipeFn(recipe, 'A');
	validateTier1Frontmatter = validateTier1Frontmatter;
	render = render;
	legacyConfigToRecipe = legacyConfigToRecipe;
	mergeFrontmatter = mergeFrontmatter;
	computeManagedKeys = computeManagedKeys;
	buildProvenance = buildProvenance;

	/**
	 * runImport — exposed for E2E tests to invoke a full generation pass
	 * against a known parsedData + config. Wraps the public `generateNotes`
	 * export with the plugin's app + debug instances.
	 */
	runImport = async (parsedData: any, config: any, options: any) => {
		return generateNotes(this.app, parsedData, config, options, this.debug);
	};

	/**
	 * runImportFromRecipe — v0.1.4 native Ch 22 recipe entry. Bypasses the
	 * v0.1.0 column-role legacy logic and runs render() against the recipe
	 * directly. Used by junction-note + crosswalk-edge recipes (and any
	 * concept recipe authored natively without the wizard).
	 */
	runImportFromRecipe = async (parsedData: any, recipe: any, options: any) => {
		return generateFromRecipe(this.app, parsedData, recipe, options, this.debug);
	};

	/**
	 * Tier 2 sidecar handle. Lazily opened on first access (or via
	 * runProjection() E2E entry point). Reset to null when clearSidecar
	 * runs — next openTier2() call recreates from canonical Tier 1.
	 */
	tier2Handle: SidecarHandle | null = null;

	/**
	 * Lazy open the Tier 2 sidecar. Returns the cached handle if already
	 * open. Used by E2E + future Bases-query / exporter milestones.
	 */
	openTier2 = async (): Promise<SidecarHandle> => {
		if (this.tier2Handle) return this.tier2Handle;
		this.tier2Handle = await openSidecar(this, this.app, {
			sidecarPath: this.settings.tier2SidecarPath,
		});
		return this.tier2Handle;
	};

	/**
	 * Run a Tier 1 → Tier 2 projection pass over the vault. Walks every
	 * `.md` file, dispatches by `kind`, populates `concepts` /
	 * `mappings` / `junction_notes` tables. Idempotent — re-running on
	 * an unchanged vault produces the same Tier 2 state. Per
	 * [system architecture Layer 3](https://cybersader.github.io/crosswalker/concepts/system-architecture/#layer-3--projection-t1--t2).
	 */
	runProjection = async (): Promise<ProjectionResult> => {
		const handle = await this.openTier2();
		return projectFromTier1(this.app, handle.db, { debug: this.debug });
	};

	/**
	 * v0.1.5 Phase 3 query API — typed SQL helpers for the v0.1.6 Bases
	 * query layer + v0.1.7 exporters. Per
	 * [system architecture Layer 4](https://cybersader.github.io/crosswalker/concepts/system-architecture/#layer-4--query-t1--t2--user).
	 */
	queryConcepts = async (ontologyId: string): Promise<ConceptRow[]> => {
		const handle = await this.openTier2();
		return getConceptsByOntology(handle.db, ontologyId);
	};

	queryCrosswalk = async (
		subjectOntology: string,
		objectOntology: string,
		predicateId?: string,
	): Promise<MappingRow[]> => {
		const handle = await this.openTier2();
		return crosswalkBetween(handle.db, subjectOntology, objectOntology, predicateId);
	};

	queryClosure = async (
		startCurie: string,
		predicateId?: string,
		maxDepth?: number,
	): Promise<ClosureEntry[]> => {
		const handle = await this.openTier2();
		return closureFromConcept(handle.db, startCurie, predicateId, maxDepth);
	};

	/**
	 * v0.1.6 Phase 2 (per Ch 35): eagerly precompute closure for an
	 * imported ontology pair after SSSOM import. Idempotent. Returns the
	 * count of cached (subject, target) pairs after precompute.
	 */
	precomputeClosure = async (
		sourceOntology: string,
		targetOntology: string,
		predicateId?: string,
	): Promise<number> => {
		const handle = await this.openTier2();
		return precomputeClosureForOntologyPair(handle.db, sourceOntology, targetOntology, predicateId);
	};

	async onload() {
		await this.loadSettings();

		// Initialize debug logging (Phase 3.5 — wide-event NDJSON logger)
		this.debug = new DebugLog(
			this.app,
			this.settings.enableDebugLog,
			this.settings.verboseLogging,
			this.settings.debugLogCategoryFilters,
			this.settings.debugLogLevel,
		);

		// Initialize draft store (Phase 3.6 — wizard auto-save / resume).
		// Constructed unconditionally so commands always have a handle; gated
		// by enableDraftSessions at the wizard hook sites.
		this.draftStore = new DraftStore(this.app, this.debug, {
			draftExpiryDays: this.settings.draftExpiryDays,
			maxDrafts: this.settings.maxDrafts,
		});

		// Compile spec schemas (spec/tier1.schema.json + spec/recipe.schema.json)
		// at startup. Throws fast if schema files are malformed.
		initValidator();

		// Register the main import command
		this.addCommand({
			id: 'import-structured-data',
			name: 'Import structured data',
			callback: () => {
				new ImportWizardModal(this.app, this).open();
			}
		});

		// v0.1.6 Phase 2: SSSOM TSV import (per Ch 35)
		this.addCommand({
			id: 'import-sssom',
			name: 'Import crosswalk mapping file',
			callback: () => {
				new SssomImportModal(this.app, this).open();
			},
		});

		// v0.1.6 Phase 4.6: recipe picker — create a new query (Layout B+).
		// Canonical state lives at _crosswalker/queries/<slug>/{index.md,view.base};
		// the host note (current editor) receives only an `![[<slug>/view.base]]`
		// embed at cursor. To edit an existing query, open its index.md directly
		// and re-run "Refresh query views" — or use "Migrate queries to folder
		// layout" if you have legacy Phase 4.5 frontmatter on host notes.
		this.addCommand({
			id: 'insert-query-into-note',
			name: 'Insert query into note',
			editorCallback: (editor, ctx) => {
				const file = ctx.file;
				if (!file) {
					new Notice('Open a Markdown note before running this command.', 5000);
					return;
				}
				const traceId = this.debug.newTraceId();
				void this.debug.withTrace(traceId, async () => {
					// Phase 4.6: check for legacy v1 host-note frontmatter — prompt migration first
					const cache = this.app.metadataCache.getFileCache(file);
					if (cache?.frontmatter?.crosswalker_query) {
						const sv = (cache.frontmatter.crosswalker_query as { schema_version?: number }).schema_version;
						if (sv === 1) {
							new Notice(
								'This note has legacy (Phase 4.5) Crosswalker frontmatter. ' +
								'Run "Migrate queries to folder layout" first to move it into _crosswalker/queries/.',
								8000,
							);
							this.debug.info('view', 'picker-blocked-on-legacy', 'Picker blocked — legacy v1 frontmatter on host note', { host: file.path });
							return;
						}
					}
					this.debug.info('view', 'picker-open', 'Recipe picker opened (Layout B+ CREATE flow)');
					new RecipePickerModal(this.app, this, async (result) => {
						if (result.action === 'cancel') {
							this.debug.info('view', 'picker-cancelled', 'Recipe picker cancelled');
							return;
						}
						const applyResult = await applyQueryToNote({
							app: this.app,
							file,
							editor,
							recipeId: result.recipeId,
							recipeName: result.recipeName,
							shape: result.shape,
							params: result.params,
							collisionMode: 'auto-suffix', // TODO Phase 4.7: refuse-and-prompt modal for picker entry point
							debug: this.debug,
						});
						if (applyResult.ok) {
							new Notice(`Created query: ${applyResult.slug}`, 4000);
						} else if (applyResult.reason === 'slug-collision') {
							new Notice(`Query name "${applyResult.existingSlug}" already exists. Pick a different name or use a different recipe.`, 8000);
						} else {
							new Notice(`Could not apply query: ${applyResult.reason}.`, 6000);
						}
					}, null).open();
				});
			},
		});

		// v0.1.6 Phase 4.6: one-shot migration of legacy Phase 4.5 host-note
		// frontmatter to Layout B+ per-query folders. Idempotent.
		this.addCommand({
			id: 'migrate-query-layout',
			name: 'Migrate queries to folder layout',
			callback: async () => {
				const traceId = this.debug.newTraceId();
				await this.debug.withTrace(traceId, async () => {
					const { migrateQueriesToFolderLayout } = await import('./views/migrate-query-layout');
					const { loadAllRecipes } = await import('./views/recipe-loader');
					// `recipeSchemaStyle` setting removed (settings-redesign report, 2026-07-11); style 'A' hardcoded.
					const loadResult = await loadAllRecipes(this.app, 'A', this.debug);
					const result = await migrateQueriesToFolderLayout({
						app: this.app,
						debug: this.debug,
						recipes: loadResult.recipes,
					});
					new Notice(
						`Migration scan: scanned ${result.scanned}, migrated ${result.migrated}, skipped ${result.skipped}` +
							(result.errors.length > 0 ? `, ${result.errors.length} error${result.errors.length === 1 ? '' : 's'}` : ''),
						8000,
					);
				});
			},
		});

		// v0.1.6 Phase 4.7: Embed an existing query at the cursor — lightweight
		// picker over `_crosswalker/queries/<slug>/`. Per the 3-command split,
		// embedding is CHEAP (just inserts `![[<slug>/view.base]]`); no scan.
		this.addCommand({
			id: 'embed-existing-query',
			name: 'Embed existing query into note',
			editorCallback: async (editor, ctx) => {
				const file = ctx.file;
				if (!file) {
					new Notice('Open a Markdown note before running this command.', 5000);
					return;
				}
				const traceId = this.debug.newTraceId();
				await this.debug.withTrace(traceId, async () => {
					const { EmbedExistingQueryModal } = await import('./views/embed-existing-query-modal');
					const { insertEmbedAtCursor } = await import('./views/insert-base-block');
					new EmbedExistingQueryModal(this.app, async (result) => {
						if (result.action === 'cancel') {
							this.debug.info('view', 'embed-picker-cancelled', 'Embed picker cancelled');
							return;
						}
						const insertResult = insertEmbedAtCursor(editor, result.viewFile);
						if (insertResult.ok) {
							this.debug.info('view', 'embed-inserted', `Embed inserted at cursor`, { slug: result.slug, host: file.path, position: insertResult.reason });
							new Notice(`Embedded "${result.slug}" at cursor.`, 4000);
						} else {
							this.debug.warn('view', 'embed-insert-failed', `Could not insert embed`, { reason: insertResult.reason });
							new Notice(`Could not insert embed: ${insertResult.reason}`, 6000);
						}
					}).open();
				});
			},
		});

		// v0.1.6 Phase 4.7: Browse all queries — discovery surface with
		// per-row actions (Open canonical / Embed here / Delete folder).
		this.addCommand({
			id: 'browse-queries',
			name: 'Browse my queries',
			callback: async () => {
				const traceId = this.debug.newTraceId();
				await this.debug.withTrace(traceId, async () => {
					const { BrowseQueriesModal } = await import('./views/browse-queries-modal');
					const { insertEmbedAtCursor } = await import('./views/insert-base-block');
					const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
					const editor = activeView?.editor ?? null;
					const activeFile = activeView?.file ?? null;
					new BrowseQueriesModal(this.app, {
						editor,
						activeFile,
						insertEmbed: async (slug, viewFile) => {
							if (!editor) return;
							const r = insertEmbedAtCursor(editor, viewFile);
							if (r.ok) {
								this.debug.info('view', 'embed-inserted', `Embed inserted at cursor (from Browse)`, { slug, host: activeFile?.path, position: r.reason });
								new Notice(`Embedded "${slug}" at cursor.`, 4000);
							} else {
								this.debug.warn('view', 'embed-insert-failed', `Could not embed from Browse`, { reason: r.reason });
								new Notice(`Could not embed: ${r.reason}`, 6000);
							}
						},
					}).open();
				});
			},
		});

		// v0.1.6 Phase 6.3: import a bundled realistic crosswalk fixture.
		// One-click way to populate the vault with junction notes so the pivot
		// can render with real data. Dev convenience — bundles ~6KB of SSSOM
		// TSV inside main.js to skip the manual file-copy step.
		this.addCommand({
			id: 'import-bundled-fixture',
			name: 'Import bundled test fixture (dev)',
			callback: async () => {
				const traceId = this.debug.newTraceId();
				await this.debug.withTrace(traceId, async () => {
					const { BUNDLED_FIXTURES } = await import('./views/bundled-fixtures');
					const { importSssom } = await import('./import/sssom-importer');

					// Pick a fixture via a small AskUserQuestion-style modal
					const { Modal, ButtonComponent } = await import('obsidian');
					const picked = await new Promise<string | null>((resolve) => {
						const modal = new Modal(this.app);
						modal.contentEl.createEl('h2', { text: 'Import a bundled test fixture' });
						modal.contentEl.createEl('p', {
							// eslint-disable-next-line obsidianmd/ui/sentence-case -- SSSOM is a domain acronym not in the linter's default acronym list
							text: 'Populates _crosswalker/mappings/ with junction notes from a realistic SSSOM crosswalk. Useful for end-to-end pivot testing.',
							cls: 'crosswalker-modal-subtitle',
						});
						for (const fx of BUNDLED_FIXTURES) {
							const row = modal.contentEl.createDiv({ cls: 'crosswalker-fixture-row' });
							row.createEl('div', { text: fx.displayName, cls: 'crosswalker-fixture-title' });
							row.createEl('div', {
								text: `${fx.rowCount} mappings · ${fx.subjectOntology} → ${fx.objectOntology}`,
								cls: 'crosswalker-fixture-meta',
							});
							new ButtonComponent(row).setButtonText('Import').setCta().onClick(() => {
								modal.close();
								resolve(fx.id);
							});
						}
						const footer = modal.contentEl.createDiv({ cls: 'crosswalker-modal-footer' });
						new ButtonComponent(footer).setButtonText('Cancel').onClick(() => {
							modal.close();
							resolve(null);
						});
						modal.open();
					});

					if (!picked) return;
					const fx = BUNDLED_FIXTURES.find((f) => f.id === picked)!;
					new Notice(`Importing ${fx.displayName}...`, 3000);

					const result = await importSssom(
						this.app,
						fx.tsv,
						null, // no projection callback
						null, // no closure callback
						{},
						this.debug,
					);
					const created = result.generation?.created ?? 0;
					const errors = result.generation?.errors?.length ?? 0;
					const skipReason = result.skipped ? ` (skipped: ${result.skipped})` : '';
					new Notice(
						`Imported "${fx.displayName}": ${created} junction notes${errors > 0 ? `, ${errors} errors` : ''}${skipReason}.`,
						6000,
					);
				});
			},
		});

		// Rapid-test loop (dev): clear an ad-hoc test import in one click without
		// touching the curated corpus / fixtures / views. The CLI twin is
		// `bun run reset` (scripts/reset-test-vault.mjs) — same protected list.
		this.addCommand({
			id: 'reset-imported-notes',
			name: 'Reset imported notes — delete a test import (dev)',
			callback: async () => {
				const { scanGeneratedImports, deleteImportedNotes } = await import('./views/reset-imports');
				const { Modal, ButtonComponent, Notice } = await import('obsidian');
				const groups = await scanGeneratedImports(this.app);
				const deletable = groups.filter((g) => !g.protected);
				const totalDeletable = deletable.reduce((n, g) => n + g.count, 0);

				const modal = new Modal(this.app);
				modal.titleEl.setText('Reset imported notes');
				const c = modal.contentEl;
				if (groups.length === 0) {
					// eslint-disable-next-line obsidianmd/ui/sentence-case -- "Crosswalker" is the plugin's proper name
					c.createEl('p', { text: 'No Crosswalker-generated notes found.', cls: 'crosswalker-modal-subtitle' });
				} else {
					c.createEl('p', {
						text: 'Delete an ad-hoc test import. The curated corpus, fixtures, and views are listed but protected.',
						cls: 'crosswalker-modal-subtitle',
					});
					for (const g of deletable) {
						const row = c.createDiv({ cls: 'crosswalker-fixture-row' });
						const txt = row.createDiv();
						txt.createEl('div', { text: `${g.folder}/`, cls: 'crosswalker-fixture-title' });
						txt.createEl('div', { text: `${g.count} generated notes`, cls: 'crosswalker-fixture-meta' });
						new ButtonComponent(row).setButtonText('Delete').setWarning().onClick(async () => {
							modal.close();
							const n = await deleteImportedNotes(this.app, g.paths);
							new Notice(`Deleted ${n} notes from ${g.folder}/`);
						});
					}
					if (deletable.length === 0) {
						c.createEl('p', { text: 'No deletable test imports — every generated note is curated corpus.', cls: 'crosswalker-fixture-meta' });
					}
					for (const g of groups.filter((x) => x.protected)) {
						const row = c.createDiv({ cls: 'crosswalker-fixture-row crosswalker-fixture-protected' });
						const txt = row.createDiv();
						txt.createEl('div', { text: `${g.folder}/  ·  protected corpus`, cls: 'crosswalker-fixture-title' });
						txt.createEl('div', { text: `${g.count} notes — kept`, cls: 'crosswalker-fixture-meta' });
					}
					const footer = c.createDiv({ cls: 'crosswalker-modal-footer' });
					if (totalDeletable > 0) {
						new ButtonComponent(footer)
							.setButtonText(`Delete all ${totalDeletable} test notes`)
							.setWarning()
							.onClick(async () => {
								modal.close();
								const n = await deleteImportedNotes(this.app, deletable.flatMap((g) => g.paths));
								new Notice(`Deleted ${n} test notes. Curated corpus untouched.`);
							});
					}
					new ButtonComponent(footer).setButtonText('Cancel').onClick(() => modal.close());
				}
				modal.open();
			},
		});

		// v0.1.6 Phase 6.3: run the Layer A primitive benchmark suite.
		// No vault data needed — synthesizes data at varying scales (100/1k/10k
		// rows), times each primitive (array + streaming variants), emits NDJSON
		// `perf` events into the debug log. Useful for spotting regressions +
		// understanding scale characteristics.
		this.addCommand({
			id: 'benchmark-primitives',
			name: 'Run primitives benchmark (perf)',
			callback: async () => {
				const traceId = this.debug.newTraceId();
				await this.debug.withTrace(traceId, async () => {
					const { runBenchmark, formatBenchmarkSummary } = await import('./views/benchmark-primitives');
					new Notice('Running primitives benchmark (this takes a few seconds)...', 3000);
					// Yield once so the Notice renders before we block on CPU
					await new Promise((r) => setTimeout(r, 50));
					const summary = runBenchmark({ debug: this.debug });
					const formatted = formatBenchmarkSummary(summary);
					this.debug.info('perf', 'benchmark-summary', `Benchmark complete`, {
						totalDurationMs: summary.totalDurationMs,
						scales: summary.scales,
						resultCount: summary.results.length,
					});
					try {
						await navigator.clipboard.writeText(formatted);
						new Notice(
							`Benchmark complete in ${summary.totalDurationMs.toFixed(0)}ms. ` +
							`${summary.results.length} timings logged to crosswalker-debug.log. ` +
							`Summary copied to clipboard.`,
							8000,
						);
					} catch {
						new Notice(
							`Benchmark complete in ${summary.totalDurationMs.toFixed(0)}ms. ` +
							`${summary.results.length} timings logged to crosswalker-debug.log. ` +
							`(Clipboard write failed; check debug log for full numbers.)`,
							8000,
						);
					}
				});
			},
		});

		// v0.1.6 Phase 5: materialize the current query (write a snapshot
		// JSON to <slug>/materialized/result.json). Opt-in, audit/share use
		// case per Ch 32 deliverable B. Default browse stays live.
		this.addCommand({
			id: 'materialize-query',
			name: 'Materialize this query (snapshot)',
			editorCallback: async (_editor, ctx) => {
				const file = ctx.file;
				if (!file) {
					new Notice('Open a Markdown note (query index.md or host) before materializing.', 5000);
					return;
				}
				const traceId = this.debug.newTraceId();
				await this.debug.withTrace(traceId, async () => {
					const { materializeQuery, lookupQuery } = await import('./views/materialize');
					const { readQueryFrontmatter } = await import('./views/query-frontmatter-io');

					// Resolve target slug: prefer canonical index.md (file is the query itself)
					let slug: string | null = null;
					if (file.path.startsWith('_crosswalker/queries/') && file.path.endsWith('/index.md')) {
						const fm = await readQueryFrontmatter(this.app, file);
						if (fm.present && fm.data) slug = fm.data.slug;
					}
					if (!slug) {
						new Notice('Open a query\'s index.md (under _crosswalker/queries/) and re-run this command.', 6000);
						return;
					}
					const q = await lookupQuery(this.app, slug);
					if (!q) {
						new Notice(`Could not look up query "${slug}".`, 5000);
						return;
					}

					// Minimal Phase 5 snapshot: record the recipe+params + a timestamp.
					// The view-shape-specific resolved data is written by view-side
					// materialization helpers in v0.1.7+ (table/list/pivot/hierarchy
					// each contribute their snapshot via materializeQuery as needed).
					const r = await materializeQuery(this.app, {
						slug,
						queryId: q.queryId,
						recipe: q.recipe,
						shape: q.shape,
						data: { note: 'Phase 5 baseline snapshot — view-shape-specific resolved data lands in v0.1.7+.', params: q.params },
						metadata: { phase: '5-baseline' },
					}, this.debug);
					if (r.ok) {
						new Notice(`Materialized "${slug}" → ${r.resultPath} (${r.bytesWritten} bytes)`, 5000);
					} else {
						new Notice(`Materialize failed: ${r.error}`, 6000);
					}
				});
			},
		});

		// v0.1.6 Phase 4.5: explicit refresh — re-scan all notes with
		// `crosswalker_query:` frontmatter and regenerate their .base files from
		// the (possibly hand-edited) frontmatter. Idempotent — skips notes
		// whose .base content already matches.
		this.addCommand({
			id: 'refresh-query-views',
			name: 'Refresh query views',
			callback: async () => {
				const traceId = this.debug.newTraceId();
				await this.debug.withTrace(traceId, async () => {
					const result = await regenerateAll(this.app, this.debug);
					new Notice(
						`Refreshed ${result.regenerated} view${result.regenerated === 1 ? '' : 's'}` +
							(result.skipped > 0 ? `; ${result.skipped} up-to-date` : '') +
							(result.errors.length > 0 ? `; ${result.errors.length} error${result.errors.length === 1 ? '' : 's'}` : ''),
						5000,
					);
				});
			},
		});

		// Register config browser command
		this.addCommand({
			id: 'browse-saved-configs',
			name: 'Browse saved configurations',
			callback: () => {
				new ConfigBrowserModal(this.app, this, 'browse').open();
			}
		});

		// v0.1.5: Tier 2 sidecar — clear command
		this.addCommand({
			id: 'clear-tier-2-sidecar',
			name: 'Clear fast query index (rebuilds automatically)',
			callback: async () => {
				try {
					if (this.tier2Handle) {
						await this.tier2Handle.close();
						this.tier2Handle = null;
					}
					await clearSidecar(this, this.settings.tier2SidecarPath);
					new Notice('Fast query index cleared. It rebuilds automatically.');
				} catch (err) {
					const msg = err instanceof Error ? err.message : String(err);
					new Notice(`Failed to clear the fast query index: ${msg}`);
					this.debug?.error('tier2', 'clear-failed', 'Tier 2 sidecar clear failed', { error: msg });
				}
			},
		});

		// v0.1.6 Phase 3.5: debug log commands — open / export / clear
		this.addCommand({
			id: 'open-debug-log',
			name: 'Open debug log',
			callback: async () => {
				const path = this.debug.getLogPath();
				const file = this.app.vault.getAbstractFileByPath(path);
				if (file instanceof TFile) {
					await this.app.workspace.getLeaf(true).openFile(file);
				} else {
					new Notice(`Debug log not found at vault root (${path}). Enable debug logging in settings and trigger any action to generate one.`);
				}
			},
		});

		this.addCommand({
			id: 'export-debug-log',
			name: 'Export debug log to clipboard (last 1 megabyte, secrets redacted)',
			callback: async () => {
				const content = await this.debug.readForExport();
				if (!content) {
					new Notice('Debug log is empty or unreadable.');
					return;
				}
				try {
					await navigator.clipboard.writeText(content);
					new Notice(`Copied ${Math.round(content.length / 1024)} KB to clipboard (likely tokens redacted).`);
				} catch (err) {
					const msg = err instanceof Error ? err.message : String(err);
					new Notice(`Clipboard write failed: ${msg}`);
				}
			},
		});

		this.addCommand({
			id: 'copy-diagnostics',
			name: 'Copy diagnostics to clipboard',
			callback: async () => {
				const bundle = this.debug.assembleDiagnostics({
					pluginVersion: this.manifest.version,
					obsidianVersion: apiVersion,
					platform: diagnosticsPlatformLabel(),
					settings: this.settings as unknown as Record<string, unknown>,
				});
				try {
					await navigator.clipboard.writeText(bundle);
					new Notice(`Copied diagnostics (${Math.round(bundle.length / 1024)} KB) to clipboard. Redacted: no vault paths, file names, or cell values.`);
				} catch (err) {
					const msg = err instanceof Error ? err.message : String(err);
					new Notice(`Clipboard write failed: ${msg}`);
				}
			},
		});

		this.addCommand({
			id: 'clear-debug-log',
			name: 'Clear debug log',
			callback: async () => {
				await this.debug.clear();
				new Notice('Debug log cleared.');
			},
		});

		// v0.1.6 Phase 3.6: draft session commands. The wizard's Step 1 now
		// always shows a 'Drafts from previous sessions' section, so this
		// command just opens the wizard. The user picks Resume from Step 1.
		this.addCommand({
			id: 'resume-draft-import',
			name: 'Resume draft import',
			callback: () => {
				new ImportWizardModal(this.app, this).open();
			},
		});

		this.addCommand({
			id: 'clear-all-drafts',
			name: 'Clear all import drafts',
			callback: async () => {
				const count = await this.draftStore.clearAll();
				new Notice(`Cleared ${count} draft import${count === 1 ? '' : 's'}.`);
			},
		});

		this.addCommand({
			id: 'purge-expired-drafts',
			name: 'Purge expired import drafts',
			callback: async () => {
				const count = await this.draftStore.purgeExpired();
				new Notice(`Purged ${count} expired draft import${count === 1 ? '' : 's'}.`);
			},
		});

		// Register settings tab
		this.addSettingTab(new CrosswalkerSettingTab(this.app, this));

		// Shape-first wizard spec §7n: dedicated workspace tab hosting the
		// import experience outside the modal (Kanban/Excalidraw/Bases precedent).
		this.registerView(
			VIEW_TYPE_CROSSWALKER_WORKSPACE,
			(leaf) => new CrosswalkerWorkspaceView(leaf, this),
		);
		this.addRibbonIcon('network', 'Open workspace', () => {
			void this.activateWorkspaceView();
		});
		this.addCommand({
			id: 'open-crosswalker-workspace',
			name: 'Open workspace',
			callback: () => {
				void this.activateWorkspaceView();
			},
		});

		// Discoverability entry point 1+2: the file-explorer right-click menu
		// and a file's "more options" (⋯) menu both fire the same workspace
		// 'file-menu' event (Obsidian dispatches it from both surfaces), so one
		// handler covers both without registering a dedicated view type for
		// CSV/XLSX/JSON files.
		this.registerEvent(
			this.app.workspace.on('file-menu', (menu, file) => {
				if (!(file instanceof TFile)) return;
				if (!isImportableExtension(file.extension)) return;
				menu.addItem((item) => {
					item
						// eslint-disable-next-line obsidianmd/ui/sentence-case -- "Crosswalker" is the plugin's proper name
						.setTitle('Import into vault with Crosswalker')
						.setIcon('import')
						.onClick(() => {
							// Prefer the workspace view (the primary import surface,
							// spec §7n) with the clicked file already selected;
							// fall back to the modal if the view isn't available.
							void (async () => {
								const leaf = await this.activateWorkspaceView();
								const view = leaf.view;
								if (view instanceof CrosswalkerWorkspaceView) {
									view.startImportWithFile(file);
								} else {
									new ImportWizardModal(this.app, this, { prefillFile: file }).open();
								}
							})();
						});
				});
			}),
		);

		// Discoverability entry point 3: subtle status bar indicator showing
		// how many ontologies are installed (top-level folders under the
		// configured output path). Click opens the workspace tab via the
		// existing view-type machinery — no import of the sibling-owned view
		// module needed.
		this.ontologyStatusBarEl = this.addStatusBarItem();
		this.ontologyStatusBarEl.addClass('crosswalker-status-bar-item');
		this.ontologyStatusBarEl.addClass('mod-clickable');
		this.ontologyStatusBarEl.setAttr('aria-label', 'Open the Crosswalker workspace');
		this.ontologyStatusBarEl.setText(formatOntologyStatusLabel(0));
		this.ontologyStatusBarEl.addEventListener('click', () => {
			void this.activateWorkspaceView();
		});
		this.registerEvent(
			this.app.vault.on('create', (file) => {
				if (file instanceof TFolder) this.refreshOntologyStatusBar();
			}),
		);
		this.registerEvent(
			this.app.vault.on('delete', (file) => {
				if (file instanceof TFolder) this.refreshOntologyStatusBar();
			}),
		);
		this.registerEvent(
			this.app.vault.on('rename', (file) => {
				if (file instanceof TFolder) this.refreshOntologyStatusBar();
			}),
		);

		// v0.1.6 Phase 3: register the crosswalkerPivot custom Bases view
		// (per Settled #2 + Ch 30). Public API path; Obsidian 1.10.0+ required.
		// Bases-disabled fallback Notice surfaces if the user has the Bases
		// internal plugin disabled.
		this.registerCrosswalkerPivotView();

		// v0.1.5 Phase 4: auto-trigger Tier 2 projection on vault load.
		// `onLayoutReady` fires once when the Obsidian workspace is fully
		// initialized; safer than running on plugin onload (which may run
		// before metadataCache has finished indexing the vault). Lazy +
		// silent — projection runs in background, errors logged to debug
		// log without surfacing a Notice unless something genuinely fails.
		this.app.workspace.onLayoutReady(() => {
			void this.autoProjectOnLayoutReady();
			// v0.1.6 Phase 3: ship reference .base files on first run
			// (idempotent — never overwrites user edits).
			void writeReferenceBaseFiles(this.app, this.debug);
			// v0.1.6 Phase 4.5: regenerate any stale .base files from
			// `crosswalker_query:` frontmatter (idempotent — skips notes whose
			// content already matches). Catches stale state after the user
			// hand-edits frontmatter or the recipe template changes.
			void regenerateAll(this.app, this.debug);
			// Discoverability entry point 3: now that the vault is indexed,
			// the output folder's top-level children can be counted.
			this.refreshOntologyStatusBar();
		});

		// Discoverability entry point 4: first-run / post-update notice. Fires
		// once on a fresh install and once per version change, never twice for
		// the same version. `lastSeenVersion` is persisted in plugin data
		// alongside settings (loadSettings/saveSettings already merge the full
		// data.json blob onto `this.settings`), without adding a field to
		// settings-data.ts.
		this.maybeShowFirstRunNotice();

		this.debug.info('lifecycle', 'loaded', 'Crosswalker plugin loaded', { version: '0.1.6' });
	}

	/**
	 * Recompute + repaint the status bar ontology count from the top-level
	 * folders under the configured output path. Cheap — only ever looks at
	 * one level, never recurses into the ontology folders themselves.
	 */
	private refreshOntologyStatusBar(): void {
		if (!this.ontologyStatusBarEl) return;
		const folder = this.app.vault.getAbstractFileByPath(this.settings.defaultOutputPath);
		const entries: TopLevelEntry[] = folder instanceof TFolder
			? folder.children.map((child) => ({ name: child.name, isFolder: child instanceof TFolder }))
			: [];
		const count = countTopLevelOntologyFolders(entries);
		this.ontologyStatusBarEl.setText(formatOntologyStatusLabel(count));
	}

	/**
	 * Discoverability entry point 4: a one-time, humble Notice (no modal
	 * takeover) pointing new/updated users at the workspace tab. Gate state
	 * (`lastSeenVersion`) is stored in plugin data directly rather than as a
	 * typed settings field — see settings-data.ts ownership boundary.
	 */
	private maybeShowFirstRunNotice(): void {
		const currentVersion = this.manifest.version;
		const settingsWithGate = this.settings as CrosswalkerSettings & { lastSeenVersion?: string };
		const check = checkFirstRun(settingsWithGate.lastSeenVersion ?? null, currentVersion);
		if (!check.shouldShow) return;

		settingsWithGate.lastSeenVersion = currentVersion;
		void this.saveSettings();

		// noticeEl (not the newer messageEl) is used for manifest.json's
		// declared minAppVersion (1.0.0) compatibility — messageEl only
		// exists since Obsidian 1.8.7.
		const notice = new Notice('', 12000);
		notice.noticeEl.createEl('div', { text: 'Crosswalker is ready.' });
		const link = notice.noticeEl.createEl('a', {
			// eslint-disable-next-line obsidianmd/ui/sentence-case -- "Crosswalker" is the plugin's proper name
			text: 'Open the Crosswalker workspace to get started',
			href: '#',
		});
		// Inline minimal styling (no styles.css touch — see delivery report):
		// a bare <a> in a Notice inherits no link styling from Obsidian core.
		link.style.textDecoration = 'underline';
		link.style.cursor = 'pointer';
		link.addEventListener('click', (evt) => {
			evt.preventDefault();
			notice.hide();
			void this.activateWorkspaceView();
		});
	}

	/**
	 * Auto-projection on vault load. Per v0.1 schema spec §7 recovery
	 * property + Ch 24 §2: "if .crosswalker.sqlite is missing, corrupted,
	 * or stale, the projector rebuilds it from canonical Tier 1 on next
	 * vault load." This is the entry point that makes that property real.
	 *
	 * Settings-toggleable via `enableTier2Projection` (default true).
	 * Yields control to the UI thread between batches via the projector's
	 * cooperative-yield mechanism so the workspace stays responsive.
	 */
	private async autoProjectOnLayoutReady(): Promise<void> {
		if (!this.settings.enableTier2Projection) {
			this.debug?.info('tier2', 'auto-projection-disabled', 'Tier 2 auto-projection disabled in settings');
			return;
		}
		// Phase 3.5c: thread a trace_id through the auto-projection flow so all
		// downstream tier2 events correlate via `grep trace_id` in the log.
		const traceId = this.debug.newTraceId();
		await this.debug.withTrace(traceId, async () => {
			try {
				this.debug.info('tier2', 'auto-projection-start', 'Tier 2 auto-projection: starting');
				const result = await this.runProjection();
				this.debug.info('tier2', 'auto-projection-complete', 'Tier 2 auto-projection: complete', {
					success: result.success,
					counts: result.counts,
					durationMs: result.durationMs,
				});
				if (!result.success && result.errors.length > 0) {
					new Notice(
						`Tier 2 projection finished with ${result.errors.length} errors. Check debug log.`,
						6000,
					);
				}
			} catch (err) {
				const msg = err instanceof Error ? err.message : String(err);
				this.debug.error('tier2', 'auto-projection-failed', 'Tier 2 auto-projection failed', { error: msg });
				// Non-fatal — Tier 1 vault is still functional. Surface a notice
				// so the user knows queries against Tier 2 may not return fresh
				// results, but don't block the plugin lifecycle.
				new Notice(
					// eslint-disable-next-line obsidianmd/ui/sentence-case -- "Tier 1"/"Tier 2" are Crosswalker's architecture-tier terms
					`Tier 2 projection failed (Tier 1 vault is unaffected; queries may be stale). See debug log.`,
					6000,
				);
			}
		});
	}

	/**
	 * Open the Crosswalker workspace tab, reusing an existing leaf if one is
	 * already open (per the shape-first wizard spec §7n). Returns the leaf so
	 * callers (e.g. the file-menu entry point) can reach the mounted view.
	 */
	private async activateWorkspaceView(): Promise<WorkspaceLeaf> {
		const { workspace } = this.app;
		const existing = workspace.getLeavesOfType(VIEW_TYPE_CROSSWALKER_WORKSPACE);
		if (existing.length > 0) {
			workspace.revealLeaf(existing[0]);
			return existing[0];
		}
		const leaf = workspace.getLeaf('tab');
		await leaf.setViewState({ type: VIEW_TYPE_CROSSWALKER_WORKSPACE, active: true });
		workspace.revealLeaf(leaf);
		return leaf;
	}

	onunload() {
		this.tier2Handle?.close();
		this.debug?.info('lifecycle', 'unloaded', 'Crosswalker plugin unloaded');
	}

	/**
	 * v0.1.6 Phase 3: register the crosswalkerPivot custom Bases view per
	 * Settled #2 + Ch 30. Uses the Obsidian 1.10.0+ public registerBasesView
	 * API. If Bases is disabled or the API is unavailable, surfaces a Notice
	 * with a hint to enable Bases in Settings → Core plugins.
	 *
	 * Idempotent: re-registering the same viewId is treated as success by
	 * the api wrapper (per the TaskNotes-precedent error-handling pattern).
	 */
	private registerCrosswalkerPivotView(): void {
		const factory = buildCrosswalkerPivotViewFactory(this);
		const options: () => CrosswalkerBasesViewOption[] = () => [
			{
				type: 'property',
				key: 'rowsBy',
				displayName: 'Rows by',
				placeholder: 'e.g. subject_id, control_id, framework',
				filter: (prop) => prop.startsWith('note.') || !prop.includes('.'),
			},
			{
				type: 'property',
				key: 'colsBy',
				displayName: 'Cols by',
				placeholder: 'e.g. object_id, target_framework',
				filter: (prop) => prop.startsWith('note.') || !prop.includes('.'),
			},
			{
				type: 'dropdown',
				key: 'cellOp',
				displayName: 'Cell aggregation',
				options: ['count', 'count_distinct', 'sum', 'avg', 'min', 'max', 'first', 'last'],
				default: 'count',
			},
			{
				type: 'property',
				key: 'cellOf',
				displayName: 'Cell value (for non-count ops)',
				placeholder: 'e.g. confidence, sssom_confidence',
				filter: (prop) => prop.startsWith('note.') || !prop.includes('.'),
			},
			{
				type: 'dropdown',
				key: 'empty',
				displayName: 'Empty cells',
				options: ['gap', 'blank', 'zero'],
				default: 'gap',
			},
			{
				type: 'toggle',
				key: 'heatmap',
				displayName: 'Heatmap shading',
				default: false,
			},
			{
				type: 'dropdown',
				key: 'rowSort',
				displayName: 'Row sort',
				options: ['asc', 'desc', 'none'],
				default: 'asc',
			},
			{
				type: 'dropdown',
				key: 'colSort',
				displayName: 'Col sort',
				options: ['asc', 'desc', 'none'],
				default: 'asc',
			},
		];

		const result = registerCrosswalkerBasesView(this, 'crosswalker-pivot', {
			name: 'Crosswalker pivot',
			icon: 'table',
			factory,
			options,
		});

		if (!result.success) {
			this.debug?.warn('view', 'register-pivot-failed', 'crosswalkerPivot Bases view registration failed', { reason: result.reason });
			if (result.reason === 'no-public-api') {
				new Notice(
					'Crosswalker: pivot view requires Obsidian 1.10.0 or later. Update Obsidian to use the pivot view; other features still work.',
					12000,
				);
			} else if (result.reason === 'bases-disabled') {
				const enabled = isBasesPluginAvailable(this.app);
				new Notice(
					enabled
						? 'Crosswalker: Bases view registration returned false. Try restarting Obsidian. The plugin still works without it.'
						: 'Crosswalker: enable the Bases core plugin (Settings → Core plugins → Bases) to use the pivot view. Other features still work.',
					12000,
				);
			} else if (result.reason === 'error') {
				new Notice(`Crosswalker: pivot view registration error: ${result.error?.message ?? 'unknown'}`);
			}
		}
		// Bind the factory to the Component lifecycle so onunload cleans it up
		// (the factory itself just constructs Component instances; Bases owns
		// their lifecycle. Crosswalker's onunload doesn't need to unregister
		// the view — Obsidian unloads the plugin and tears down everything.)
		void factory;
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}
