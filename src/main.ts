import { Plugin, Notice, TFile } from 'obsidian';
import { CrosswalkerSettings, DEFAULT_SETTINGS } from './settings/settings-data';
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
import { DebugLog } from './utils/debug';
import { DraftStore } from './import/draft-store';
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

	// Validator + render + generation-module handles attached to the plugin
	// instance so E2E tests + future command implementations can call them
	// via the plugin reference. Underlying implementations are pure module
	// exports.
	//
	// validateRecipe wraps the module export with the active recipeSchemaStyle
	// from settings (per Ch 31 v0.1.6) — callers don't need to know which
	// discriminator style is active.
	validateRecipe = (recipe: unknown) => validateRecipeFn(recipe, this.settings.recipeSchemaStyle);
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
			// eslint-disable-next-line obsidianmd/ui/sentence-case -- SSSOM is a proper-noun acronym (Simple Standard for Sharing Ontological Mappings); canonical casing required
			name: 'Import SSSOM mapping file',
			callback: () => {
				new SssomImportModal(this.app, this).open();
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
			name: 'Clear Tier 2 sidecar (reproject from canonical Tier 1 on next open)',
			callback: async () => {
				try {
					if (this.tier2Handle) {
						await this.tier2Handle.close();
						this.tier2Handle = null;
					}
					await clearSidecar(this, this.settings.tier2SidecarPath);
					new Notice('Tier 2 sidecar cleared. Next query will reproject from Tier 1.');
				} catch (err) {
					const msg = err instanceof Error ? err.message : String(err);
					new Notice(`Failed to clear Tier 2 sidecar: ${msg}`);
					await this.debug?.log('Tier 2 clear failed', { error: msg });
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
			name: 'Export debug log to clipboard (last 1 MB, secrets redacted)',
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
		});

		await this.debug.log('Crosswalker plugin loaded');
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
			await this.debug?.log('Tier 2 auto-projection disabled in settings');
			return;
		}
		try {
			await this.debug?.log('Tier 2 auto-projection: starting');
			const result = await this.runProjection();
			await this.debug?.log('Tier 2 auto-projection: complete', {
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
			await this.debug?.log('Tier 2 auto-projection failed', { error: msg });
			// Non-fatal — Tier 1 vault is still functional. Surface a notice
			// so the user knows queries against Tier 2 may not return fresh
			// results, but don't block the plugin lifecycle.
			new Notice(
				`Tier 2 projection failed (Tier 1 vault is unaffected; queries may be stale). See debug log.`,
				6000,
			);
		}
	}

	onunload() {
		this.tier2Handle?.close();
		this.debug?.log('Crosswalker plugin unloaded');
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
			void this.debug?.log('crosswalkerPivot Bases view registration failed', { reason: result.reason });
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
