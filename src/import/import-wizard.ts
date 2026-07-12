import { App, Modal, Setting, Notice, normalizePath, setIcon, TFile, TFolder } from 'obsidian';
import CrosswalkerPlugin from '../main';
import { ParsedData, ImportRecipe, ColumnInfo, SavedConfig, HierarchyMapping, isEagerRows } from '../types/config';
import { parseCSVFile, analyzeColumns, shouldUseStreaming, ParseProgress } from './parsers/csv-parser';
import { parseXLSXFile, listXLSXSheets } from './parsers/xlsx-parser';
import { parseJSONFile, suggestIterators, JsonStructure } from './parsers/json-parser';
import {
	render,
	renderTemplate,
	summarizeRenderNotes,
	type RenderReport,
	type PreviewRowNotes,
} from '../render';
import { legacyConfigToRecipe } from '../generation/legacy-recipe-shim';
import { findMatchingConfigs, ConfigMatch } from '../config/config-manager';
import { ConfigBrowserModal } from '../config/config-browser-modal';
import { VaultImportFilePicker } from '../ui/vault-file-picker';
import {
	generateNotes,
	buildConfigFromWizardState,
	deriveIdSplitTemplates,
	estimateOutput,
	GenerationOptions
} from '../generation/generation-engine';
import {
	autoDraftName,
	columnConfigsToDict,
	dictToColumnConfigs,
	newDraftId,
	relativeTime,
	resolveDraftSource,
	type WizardDraft,
} from './draft-store';
import { MappingWorkbench, renderProvenanceBadge } from './workbench';
import type { ImportMapping, Enrichment } from './mapping/types';
import { buildShapeMapRecap, deriveDestinationDefault, preferredParentNote, detectWaypointPlugin, type Provenance } from './mapping/view-model';
import { computePlan } from './mapping/plan';
import { deriveFacetMemberships } from './mapping/facets';
import {
	bestRecognizedRecipe,
	recipeMapping,
	summarizeRecipeShapes,
	RECIPE_REGISTRY,
	type RecipeMatch,
	type RecipeRegistryEntry,
} from './recipe-registry';

/**
 * Curated destination default for a recognized recipe (spec §7m): an explicit
 * plugin-wide default output path always wins (the user already told us where
 * their imports go); otherwise the registry's curated `suggestedFolder`
 * ("Frameworks/CIS Controls v8", etc.) beats the generic `Frameworks/<file
 * name>` fallback `deriveDestinationDefault` would otherwise produce.
 */
export function recognizedDestination(entry: RecipeRegistryEntry, globalDefault: string): string {
	const explicit = (globalDefault ?? '').trim();
	return explicit || entry.suggestedFolder;
}

/**
 * The `autoApplyExactMatch` gate (settings § Suggestions, "Skip the
 * recognized-source card on exact matches"): true only when the setting is on
 * AND the match is a perfect (100%) score. Anything below 100 always shows
 * the trust card regardless of the setting — this only decides whether the
 * card itself is skipped straight to the review screen; review stays
 * mandatory either way (never straight to generate). Pure so the gate is
 * unit-testable without mounting the wizard.
 */
export function shouldAutoApplyRecognizedMatch(autoApplyExactMatch: boolean, score: number): boolean {
	return autoApplyExactMatch && score === 100;
}

/**
 * Honest, gated application of a recognized recipe's `recommendedEnrichment`
 * hint (recipe-registry's "CURATED DEFAULTS" doc comment). A hint is only
 * turned on when the recipe's OWN recipe JSON already emits the mechanism the
 * hint depends on: children lists need an existing parent wikilink (a `links`
 * shape), facet hub notes need an existing `also_emit.tags` destination (a
 * `tags` shape) — reusing `summarizeRecipeShapes`'s shape detection so this
 * stays in lockstep with what the recipe can actually back up. Never flips on
 * a Pass 1.5 mechanism the recipe doesn't already feed. Returns undefined when
 * nothing is live, so an inert recipe's regions stay byte-identical.
 */
export function honestEnrichment(entry: RecipeRegistryEntry): Enrichment | undefined {
	const shapes = summarizeRecipeShapes(entry);
	const hint = entry.recommendedEnrichment;
	const childrenLive = hint.childrenLists && shapes.includes('links');
	const facetLive = hint.facetNotes === 'notes' && shapes.includes('tags');
	if (!childrenLive && !facetLive) return undefined;
	const out: Enrichment = {};
	if (childrenLive) out.children_lists = true;
	if (facetLive) out.facet_notes = 'notes';
	return out;
}

/**
 * A host provides the DOM surface the import flow renders into and decides
 * what "done" means. The modal host closes the modal; the workspace-view
 * host resets the view back to its launchpad (spec §7n — the flow moves
 * into the workspace tab; the modal remains a thin back-compat wrapper).
 */
export interface ImportFlowHost {
	/** The element the flow renders into. Read once at construction; the
	 *  flow owns clearing/rebuilding its own children on every re-render. */
	containerEl: HTMLElement;
	/** Called when the flow reaches a terminal "done" action (generation
	 *  success, the results screen's Close button). */
	close: () => void;
	/**
	 * When set, every step's nav bar shows a persistent quiet exit button with
	 * this label that calls close(). The view host needs it: without an exit,
	 * the flow takes over the tab with no way back to the workspace home
	 * (found in the owner's first in-tab test). The modal host omits it, since
	 * the modal already has its own close affordance.
	 */
	exitLabel?: string;
}

/**
 * Import Flow — the full multi-step (soon: multi-zone) import experience.
 *
 * Multi-step wizard for importing structured data:
 * Step 1: Select source file
 * Step 2: Configure columns (hierarchy, frontmatter, links)
 * Step 3: Preview output
 * Step 4: Generate
 *
 * Host-agnostic (spec §7n): renders into whatever `ImportFlowHost` provides —
 * a modal's contentEl, or a pane inside the Crosswalker workspace view. See
 * `ImportWizardModal` below for the thin modal wrapper, and
 * `src/views/workspace-view.ts` for the in-view host.
 */
export class ImportFlow {
	app: App;
	plugin: CrosswalkerPlugin;
	host: ImportFlowHost;
	currentStep: number = 1;
	totalSteps: number = 4;
	/** Seed the flow to lead with a specific recognized recipe (the "Import
	 *  again" affordance from the workspace view's installed-ontologies list,
	 *  spec §7n item 3). Consumed once, on the first parsed file. */
	presetRecipeId: string | null = null;
	/** A vault file to pre-select on open (the file-explorer context-menu entry
	 *  point, "Import into vault with Crosswalker"). Consumed once in `onOpen`:
	 *  re-parsed automatically and the flow jumps straight to Step 2. */
	pendingPrefill: TFile | null = null;

	// Wizard state
	sourceFile: File | null = null;
	sourceType: 'csv' | 'xlsx' | 'json' | null = null;
	selectedSheet: string | null = null;
	availableSheets: string[] = [];
	xlsxHeaderRow: number = 0;
	jsonIterator: string = '';
	jsonWhere: string = '';
	/** Detected structure of a selected JSON file (drives the record picker). */
	jsonStructure: JsonStructure | null = null;
	/** Step-2 column search filter (UX for very wide sources — SCF has 369 columns). */
	columnFilter: string = '';
	/** Step-2: reveal the collapsed default-role tail when a source is very wide. */
	showAllColumns: boolean = false;
	/** Columns whose roles were auto-suggested by heuristics (shown with a ✨ badge). */
	suggestedColumns: Set<string> = new Set();
	smartDefaultsApplied: boolean = false;
	parsedData: ParsedData | null = null;
	columnInfos: ColumnInfo[] = [];
	config: Partial<ImportRecipe> = {};

	// Column configuration state (captured from Step 2)
	columnConfigs: Map<string, { useAs: string; outputKey: string; folderTemplates?: string[] }> = new Map();

	/** Shape workbench (beta). Created lazily in Step 2 when the setting is on;
	 *  persists across step navigation. Null in classic column-mapping mode. */
	workbench: MappingWorkbench | null = null;

	/** A persisted workbench mapping awaiting rehydration into a freshly-built
	 *  workbench (draft resume, spec §7i). Consumed once by renderStep2_Workbench,
	 *  then cleared so later rebuilds re-instantiate from detections. */
	private pendingWorkbenchMapping: ImportMapping | null = null;

	/** A confidently-recognized bundled recipe for this source (spec §7m), or null. */
	private recognizedMatch: RecipeMatch | null = null;
	/** The user chose "Start from scratch" over the recognized-source card this session. */
	private recognizedDismissed: boolean = false;
	/**
	 * A recognized recipe was chosen (Import / Customize), so the workbench drives
	 * generation even when the beta workbench setting is off — the vetted recipe IS
	 * the same recipe/render pipeline, just fronted by trust (spec §7m).
	 */
	private recognizedFastPath: boolean = false;
	/** The recipe-seeded workbench mapping was edited after the recognized seed. */
	private recognizedEdited: boolean = false;

	/** Step-3 destination breadcrumb is in inline-edit mode (spec §7j #2). */
	private destEditing: boolean = false;
	/** The step-2 workbench one-line hint has been dismissed for the session (spec §7j #5). */
	private workbenchHintDismissed: boolean = false;

	// Output settings (captured from Step 4)
	outputPath: string = '';
	overwriteMode: 'skip' | 'replace' | 'error' = 'skip';
	frameworkId: string = '';

	// Parsing state
	isParsing: boolean = false;
	parseProgress: ParseProgress | null = null;
	parseError: string | null = null;

	// Generation state
	isGenerating: boolean = false;
	generationProgress: { current: number; total: number; message: string } | null = null;
	/** Live refs to the Step-4 progress DOM, so onProgress updates in place
	 *  instead of re-rendering the whole modal every batch. */
	progressEls: { pct: HTMLElement; fill: HTMLElement; count: HTMLElement } | null = null;

	// Config matching state
	configMatches: ConfigMatch[] = [];
	appliedConfig: SavedConfig | null = null;
	configWarnings: string[] = [];

	// Draft session state (Phase 3.6). draftId is assigned at first auto-save
	// (or at the start of a resumed session). Persists across re-renders so a
	// single in-progress wizard maps to a single draft file.
	private draftId: string | null = null;
	private draftSaveTimer: ReturnType<typeof setTimeout> | null = null;
	private skipDraftDeleteOnClose: boolean = false;
	// Drafts visible in Step 1's "Drafts from previous sessions" section.
	// Populated on wizard open; refreshed after delete actions.
	private availableDrafts: WizardDraft[] = [];

	constructor(app: App, plugin: CrosswalkerPlugin, host: ImportFlowHost) {
		this.app = app;
		this.plugin = plugin;
		this.host = host;
		// Initialize from settings
		this.outputPath = plugin.settings.defaultOutputPath;
	}

	onOpen() {
		// Phase 3.6c (revised 2026-05-15): load any existing drafts upfront so
		// Step 1 can render them as an always-visible section. No stacked
		// modal — drafts surface inline, with an empty state when none exist.
		void this.loadAvailableDrafts().then(async () => {
			// File-explorer context menu entry point ("Import into vault with
			// Crosswalker"): a file was already picked, so skip Step 1 entirely —
			// re-parse it from the vault and land straight on Step 2.
			if (this.pendingPrefill) {
				const file = this.pendingPrefill;
				this.pendingPrefill = null;
				const name = file.name.toLowerCase();
				this.sourceType = name.endsWith('.csv') ? 'csv' : name.endsWith('.json') ? 'json' : 'xlsx';
				const ok = await this.reparseFromVault(file.path, file.name);
				if (ok) this.currentStep = 2;
			}
			this.renderStep();
		});
	}

	private async loadAvailableDrafts(): Promise<void> {
		if (!this.plugin.settings.enableDraftSessions) {
			this.availableDrafts = [];
			return;
		}
		try {
			this.availableDrafts = await this.plugin.draftStore.list();
		} catch (err) {
			this.availableDrafts = [];
			this.plugin.debug.warn('drafts', 'list-failed', 'Could not list drafts at wizard open', {
				error: err instanceof Error ? err.message : String(err),
			});
		}
	}

	/**
	 * Hydrate wizard state from a saved draft (spec §7i).
	 *
	 * When the draft recorded a `sourceFile.vaultPath` and that vault file still
	 * exists, the source is re-read and re-parsed automatically through the normal
	 * Step-1 parse path — `parsedData`/`columnInfos` are restored, detection re-runs
	 * (via the workbench), and the wizard jumps straight to the saved step. Only
	 * when the source was an external OS-picker file (no vault path) or the vault
	 * file is gone do we fall back to bumping the user to Step 1 to re-select it.
	 *
	 * The workbench shape mapping (beta) is rehydrated from `draft.workbenchMapping`
	 * so shape decisions survive the round-trip instead of re-detecting from scratch.
	 */
	private async hydrateFromDraft(draft: WizardDraft): Promise<void> {
		this.draftId = draft.id;
		this.currentStep = draft.currentStep;
		this.sourceFile = null;
		this.parsedData = null;
		this.sourceType = draft.sourceType;
		this.selectedSheet = draft.selectedSheet;
		this.columnInfos = draft.columnInfos ?? [];
		this.columnConfigs = dictToColumnConfigs(draft.columnConfigsDict ?? {});
		this.config = draft.config ?? {};
		this.outputPath = draft.outputPath ?? this.plugin.settings.defaultOutputPath;
		this.overwriteMode = draft.overwriteMode ?? 'skip';
		this.frameworkId = draft.frameworkId ?? '';
		// Restored column decisions are authoritative — don't let a re-parse
		// re-run the heuristic smart-defaults over them.
		this.smartDefaultsApplied = true;
		// Stash the persisted shape mapping for renderStep2_Workbench to consume.
		this.pendingWorkbenchMapping = draft.workbenchMapping ?? null;
		this.workbench = null;

		// Re-attach applied config from settings if still present.
		if (draft.appliedConfigId) {
			const found = this.plugin.settings.savedConfigs.find(c => c.id === draft.appliedConfigId);
			if (found) {
				this.appliedConfig = found;
			} else {
				new Notice(`The applied config from this draft was deleted. You can continue with manual settings or pick a new config.`, 8000);
			}
		}

		// Try to re-read + re-parse the source from the vault automatically.
		if (this.currentStep > 1) {
			const decision = resolveDraftSource(draft, (path) => {
				return this.app.vault.getAbstractFileByPath(path) instanceof TFile;
			});
			if (decision.action === 'reparse') {
				const ok = await this.reparseFromVault(decision.vaultPath, draft.sourceFile?.name ?? 'source');
				if (!ok) {
					new Notice('Could not re-read the source file from the vault. Please re-select it to resume.', 8000);
					this.currentStep = 1;
					this.pendingWorkbenchMapping = null;
				}
			} else {
				// External OS-picker file (no vault path) or the file is gone.
				new Notice('Source file needs to be re-selected to resume this draft. Your column configuration has been preserved.', 8000);
				this.currentStep = 1;
				this.pendingWorkbenchMapping = null;
			}
		}

		this.plugin.debug.info('drafts', 'resumed', 'Draft hydrated into wizard', {
			draftId: draft.id,
			step: this.currentStep,
			columnConfigCount: this.columnConfigs.size,
			reparsed: !!this.parsedData,
			seededWorkbench: !!this.pendingWorkbenchMapping,
		});
	}

	/**
	 * Re-read a source file from the vault and run it back through the normal
	 * parse path (spec §7i). Reconstructs a `File` from the vault content so the
	 * existing parsers are reused verbatim. Returns false on any failure so the
	 * caller can fall back to re-selection.
	 */
	private async reparseFromVault(vaultPath: string, name: string): Promise<boolean> {
		try {
			const tfile = this.app.vault.getAbstractFileByPath(vaultPath);
			if (!(tfile instanceof TFile)) return false;
			let file: File;
			if (this.sourceType === 'xlsx') {
				const buf = await this.app.vault.readBinary(tfile);
				file = new File([buf], name);
			} else {
				const text = await this.app.vault.read(tfile);
				file = new File([text], name);
			}
			this.sourceFile = file;
			return await this.parseSourceFile();
		} catch (err) {
			this.plugin.debug.warn('drafts', 'reparse-failed', 'Could not re-parse source from vault', {
				vaultPath,
				error: err instanceof Error ? err.message : String(err),
			});
			return false;
		}
	}

	/**
	 * Best-effort vault path for the currently-selected source file. The OS file
	 * picker yields a browser `File` with no path, so we match by file name against
	 * the vault; a unique match lets a resumed draft re-read it automatically
	 * (spec §7i). Ambiguous / absent matches record null (external file).
	 */
	private findVaultPathForSource(): string | null {
		if (!this.sourceFile) return null;
		const name = this.sourceFile.name;
		const matches = this.app.vault.getFiles().filter((f) => f.name === name);
		return matches.length === 1 ? matches[0].path : null;
	}

	onClose() {
		// Cancel any pending debounced save so we don't write after the modal
		// is gone. Then flush one final synchronous-style save if there's any
		// substantive state worth persisting (past Step 1 file selection).
		if (this.draftSaveTimer) {
			clearTimeout(this.draftSaveTimer);
			this.draftSaveTimer = null;
		}
		if (
			this.plugin.settings.enableDraftSessions
			&& !this.skipDraftDeleteOnClose
			&& this.shouldPersistDraft()
		) {
			void this.saveDraftNow();
		}

		const contentEl = this.host.containerEl;
		contentEl.empty();
	}

	renderStep() {
		const contentEl = this.host.containerEl;
		contentEl.empty();

		// Sticky nav chrome (spec §7h #1): Back (left) · step indicator (center) ·
		// Next/Generate (right), all together as a fixed bar. Only the middle
		// content region scrolls, so the primary CTA never reads as page output.
		const header = contentEl.createEl('div', { cls: 'crosswalker-wizard-header' });

		const navRow = header.createEl('div', { cls: 'crosswalker-nav-row' });

		const navLeft = navRow.createEl('div', { cls: 'crosswalker-nav-left' });
		if (this.host.exitLabel) {
			const exitBtn = navLeft.createEl('button', {
				text: this.host.exitLabel,
				cls: 'crosswalker-exit-btn',
				attr: { 'aria-label': 'Leave this import and return' },
			});
			exitBtn.addEventListener('click', () => this.host.close());
		}
		if (this.currentStep > 1) {
			const backBtn = navLeft.createEl('button', { text: 'Back', cls: 'crosswalker-back-btn' });
			backBtn.addEventListener('click', () => {
				this.currentStep--;
				this.renderStep();
			});
		} else if (!this.host.exitLabel) {
			navLeft.createEl('div', { cls: 'crosswalker-back-placeholder' });
		}

		navRow.createEl('span', {
			text: `Step ${this.currentStep} of ${this.totalSteps}`,
			cls: 'crosswalker-step-indicator'
		});

		const navRight = navRow.createEl('div', { cls: 'crosswalker-nav-right' });
		this.createPrimaryButton(navRight);

		header.createEl('h2', { text: 'Import structured data' });

		// Content based on step
		const content = contentEl.createEl('div', { cls: 'crosswalker-wizard-content' });

		switch (this.currentStep) {
			case 1:
				this.renderStep1_SelectFile(content);
				break;
			case 2:
				this.renderStep2_ConfigureColumns(content);
				break;
			case 3:
				this.renderStep3_Preview(content);
				break;
			case 4:
				this.renderStep4_Generate(content);
				break;
		}

		// Footer with navigation
		this.renderFooter(contentEl);
	}

	// =========================================================================
	// Step 1: Select Source File
	// =========================================================================

	/**
	 * Select an in-vault file as the import source (the vault picker path —
	 * same journey as the file-menu prefill: reset, re-parse from the vault,
	 * land on step 2).
	 */
	private async selectVaultFile(file: TFile): Promise<void> {
		this.appliedConfig = null;
		this.configMatches = [];
		this.configWarnings = [];
		this.recognizedMatch = null;
		this.recognizedDismissed = false;
		this.recognizedFastPath = false;
		this.recognizedEdited = false;
		this.workbench = null;
		this.parsedData = null;
		this.availableSheets = [];
		this.selectedSheet = null;
		this.columnConfigs = new Map();
		this.suggestedColumns = new Set();
		this.smartDefaultsApplied = false;
		const name = file.name.toLowerCase();
		this.sourceType = name.endsWith('.csv') ? 'csv' : name.endsWith('.json') ? 'json' : 'xlsx';
		const ok = await this.reparseFromVault(file.path, file.name);
		if (ok) this.currentStep = 2;
		this.renderStep();
	}

	renderStep1_SelectFile(container: HTMLElement) {
		container.createEl('h3', { text: 'Select source file' });
		container.createEl('p', {
			text: 'Choose a file containing your structured data.',
			cls: 'setting-item-description'
		});

		// Primary: pick from the vault. Obsidian's explorer hides csv/xlsx/json
		// unless "Detect all file extensions" is on, so the vault picker must
		// not depend on the explorer at all.
		const vaultRow = container.createEl('div', { cls: 'crosswalker-vault-pick-row' });
		const vaultBtn = vaultRow.createEl('button', {
			text: 'Choose from vault',
			cls: 'mod-cta',
		});
		vaultBtn.addEventListener('click', () => {
			new VaultImportFilePicker(this.app, (file) => {
				void this.selectVaultFile(file);
			}).open();
		});
		vaultRow.createEl('span', {
			// eslint-disable-next-line obsidianmd/ui/sentence-case -- CSV/XLSX/JSON are file-format acronyms
			text: 'Finds CSV, XLSX, and JSON files even when the file explorer hides them.',
			cls: 'setting-item-description',
		});

		// Secondary: a file from outside the vault via the OS picker.
		const fileInputContainer = container.createEl('div', { cls: 'crosswalker-file-input' });
		fileInputContainer.createEl('div', {
			text: 'Or pick a file from your computer:',
			cls: 'setting-item-description',
		});

		const fileInput = fileInputContainer.createEl('input', {
			type: 'file',
			attr: {
				accept: '.csv,.xlsx,.xls,.json'
			}
		});

		fileInput.addEventListener('change', async (e) => {
			const target = e.target as HTMLInputElement;
			if (target.files && target.files.length > 0) {
				this.sourceFile = target.files[0];
				this.detectFileType();
				// Reset config state when new file selected
				this.appliedConfig = null;
				this.configMatches = [];
				this.configWarnings = [];
				this.recognizedMatch = null;
				this.recognizedDismissed = false;
				this.recognizedFastPath = false;
				this.recognizedEdited = false;
				this.workbench = null;
				this.parsedData = null;
				this.availableSheets = [];
				this.selectedSheet = null;
				this.columnConfigs = new Map();
				this.suggestedColumns = new Set();
				this.smartDefaultsApplied = false;
				if (this.sourceType === 'xlsx') {
					try {
						this.availableSheets = await listXLSXSheets(this.sourceFile);
						this.selectedSheet = this.availableSheets[0] ?? null;
					} catch (err) {
						new Notice(`Could not read workbook sheets: ${err instanceof Error ? err.message : String(err)}`);
					}
				}
				this.jsonStructure = null;
				this.jsonIterator = '';
				if (this.sourceType === 'json') {
					try {
						this.jsonStructure = suggestIterators(await this.sourceFile.text());
						// Magical default: pre-select the biggest record list found.
						const best = this.jsonStructure.candidates[0];
						if (best) this.jsonIterator = best.iterator;
					} catch (err) {
						new Notice(`Could not inspect JSON structure: ${err instanceof Error ? err.message : String(err)}`);
					}
				}
				this.renderStep(); // Re-render to show file info
			}
		});

		// Show selected file info — a card that says how Crosswalker reads this
		// file type, not just bare metadata.
		if (this.sourceFile) {
			const fmt = (bytes: number): string => {
				if (bytes < 1024) return `${bytes} B`;
				if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
				return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
			};
			const typeMeta: Record<string, { icon: string; how: string }> = {
				csv: { icon: '🧾', how: 'Each row becomes a note; columns become its properties.' },
				xlsx: { icon: '📊', how: 'Pick the worksheet that holds your rows — each row becomes a note.' },
				json: { icon: '🧩', how: 'Crosswalker finds the lists of records inside — pick the one to import; each record becomes a note.' },
			};
			const meta = typeMeta[this.sourceType ?? 'csv'] ?? typeMeta.csv;
			const fileInfo = container.createEl('div', { cls: 'crosswalker-file-card' });
			const headRow = fileInfo.createEl('div', { cls: 'crosswalker-file-card-head' });
			headRow.createEl('span', { text: meta.icon, cls: 'crosswalker-file-card-icon' });
			const headText = headRow.createEl('div');
			headText.createEl('div', { text: this.sourceFile.name, cls: 'crosswalker-file-card-name' });
			headText.createEl('div', {
				text: `${this.sourceType?.toUpperCase()} · ${fmt(this.sourceFile.size)}`,
				cls: 'setting-item-description'
			});
			fileInfo.createEl('p', { text: meta.how, cls: 'setting-item-description crosswalker-file-card-how' });

			// XLSX: sheet picker + header-row offset (banner rows above the real headers)
			if (this.sourceType === 'xlsx' && this.availableSheets.length > 0) {
				new Setting(container)
					.setName('Sheet')
					.setDesc('Which worksheet holds the rows to import.')
					.addDropdown((dd) => {
						for (const name of this.availableSheets) dd.addOption(name, name);
						dd.setValue(this.selectedSheet ?? this.availableSheets[0]);
						dd.onChange((v) => { this.selectedSheet = v; });
					});
				new Setting(container)
					.setName('Header row')
					.setDesc('0-based row index of the column headers — raise it to skip banner rows above them.')
					.addText((t) => {
						t.setValue(String(this.xlsxHeaderRow));
						t.inputEl.type = 'number';
						t.inputEl.min = '0';
						t.onChange((v) => { this.xlsxHeaderRow = Math.max(0, parseInt(v, 10) || 0); });
					});
			}

			// JSON: click-to-pick record list (no path syntax required) + an
			// advanced escape hatch for manual iterator/filter entry.
			if (this.sourceType === 'json') {
				this.renderJsonRecordPicker(container);
			}

			// Show streaming info for large files
			if (shouldUseStreaming(this.sourceFile)) {
				container.createEl('p', {
					text: 'Large file detected - streaming parser will be used for memory efficiency.',
					cls: 'setting-item-description'
				});
			}
		}

		// Show parsing progress
		if (this.isParsing) {
			const progressContainer = container.createEl('div', { cls: 'crosswalker-progress' });
			progressContainer.createEl('p', { text: 'Parsing file...' });
			if (this.parseProgress) {
				const percent = this.parseProgress.percentComplete ?? 0;
				progressContainer.createEl('progress', {
					attr: { value: String(percent), max: '100' }
				});
				progressContainer.createEl('p', {
					text: `${this.parseProgress.rowsProcessed.toLocaleString()} rows processed (${percent}%)`,
					cls: 'setting-item-description'
				});
			}
		}

		// Show parse error
		if (this.parseError) {
			const errorContainer = container.createEl('div', { cls: 'crosswalker-error' });
			errorContainer.createEl('p', { text: `Error: ${this.parseError}` });
		}

		// After parsing, lead with the recognized-source card (spec §7m) when a
		// vetted bundled recipe matches; otherwise fall back to saved-config
		// suggestions. The two never stack — the recognized card stays calm.
		if (this.parsedData && !this.isParsing) {
			const shownRecognized = this.renderRecognizedSourceCard(container);
			if (!shownRecognized) this.renderConfigSuggestions(container);
		}

		// Drafts section — always visible (with empty state) so the feature is
		// discoverable on the first wizard open. Suppressed only when the
		// user has disabled draft sessions in settings.
		this.renderDraftsSection(container);
	}

	/**
	 * Render the "Drafts from previous sessions" section in Step 1.
	 * Always-visible empty state when no drafts; per-draft Resume + Delete
	 * actions when drafts exist. The current draft (if user is resuming and
	 * went back to Step 1) is filtered out so the user can't "resume" their
	 * own in-progress state on top of itself.
	 */
	private renderDraftsSection(container: HTMLElement): void {
		if (!this.plugin.settings.enableDraftSessions) return;

		const section = container.createEl('div', { cls: 'crosswalker-drafts-section' });
		section.createEl('h3', { text: 'Drafts from previous sessions' });

		const visible = this.availableDrafts.filter(d => d.id !== this.draftId);

		if (visible.length === 0) {
			section.createEl('p', {
				text: 'No drafts yet. As you configure your import, the wizard will auto-save your progress — close the modal anytime and your work will appear here so you can resume.',
				cls: 'setting-item-description'
			});
			return;
		}

		const list = section.createEl('div', { cls: 'crosswalker-drafts-list' });
		for (const draft of visible) {
			this.renderDraftRow(list, draft);
		}
	}

	private renderDraftRow(list: HTMLElement, draft: WizardDraft): void {
		const row = list.createEl('div', { cls: 'crosswalker-draft-row' });

		const info = row.createEl('div', { cls: 'crosswalker-draft-info' });
		info.createEl('div', { text: draft.name, cls: 'crosswalker-draft-name' });

		const meta = info.createEl('div', { cls: 'crosswalker-draft-meta' });
		meta.createEl('span', { text: draft.sourceFile?.name ?? '(no source file)' });
		meta.createEl('span', { text: ' · ' });
		meta.createEl('span', { text: `Step ${draft.currentStep}/4` });
		meta.createEl('span', { text: ' · ' });
		meta.createEl('span', { text: relativeTime(draft.updatedAt) });
		if (draft.appliedConfigId) {
			const appliedName = this.plugin.settings.savedConfigs.find(c => c.id === draft.appliedConfigId)?.name;
			if (appliedName) {
				meta.createEl('span', { text: ' · ' });
				meta.createEl('span', { text: `Config: ${appliedName}` });
			}
		}

		const actions = row.createEl('div', { cls: 'crosswalker-draft-actions' });

		const resumeBtn = actions.createEl('button', { text: 'Resume', cls: 'mod-cta' });
		resumeBtn.addEventListener('click', async () => {
			await this.hydrateFromDraft(draft);
			this.renderStep();
		});

		const deleteBtn = actions.createEl('button', { text: 'Delete' });
		deleteBtn.addClass('mod-warning');
		deleteBtn.addEventListener('click', async () => {
			try {
				await this.plugin.draftStore.delete(draft.id);
				this.availableDrafts = this.availableDrafts.filter(d => d.id !== draft.id);
				new Notice(`Draft "${draft.name}" deleted.`);
				this.renderStep();
			} catch (err) {
				const msg = err instanceof Error ? err.message : String(err);
				new Notice(`Failed to delete draft: ${msg}`);
			}
		});
	}

	/**
	 * Render config suggestion UI after file is parsed
	 */
	renderConfigSuggestions(container: HTMLElement) {
		// Show applied config indicator if one is selected
		if (this.appliedConfig) {
			const appliedContainer = container.createEl('div', { cls: 'crosswalker-config-applied' });
			appliedContainer.createEl('p', {
				text: `📋 Using config: "${this.appliedConfig.name}"`,
				cls: 'crosswalker-applied-label'
			});

			if (this.configWarnings.length > 0) {
				for (const warning of this.configWarnings) {
					appliedContainer.createEl('p', { text: `⚠️ ${warning}`, cls: 'crosswalker-warning' });
				}
			}

			const clearBtn = appliedContainer.createEl('button', {
				text: 'Clear config',
				cls: 'mod-warning'
			});
			clearBtn.addEventListener('click', () => {
				this.appliedConfig = null;
				this.configWarnings = [];
				this.renderStep();
			});
			return;
		}

		// Check for matching configs
		if (this.configMatches.length === 0 && this.plugin.settings.enableConfigSuggestions) {
			this.findMatchingConfigsForFile();
		}

		// Show suggestion banner if we have matches
		if (this.configMatches.length > 0) {
			const bestMatch = this.configMatches[0];
			const suggestionContainer = container.createEl('div', { cls: 'crosswalker-config-suggestion' });

			const matchStrength = bestMatch.score >= 80 ? 'strong' : 'partial';
			suggestionContainer.createEl('p', {
				text: `💡 This looks like "${bestMatch.config.name}" (${bestMatch.score}% match)`,
				cls: `crosswalker-suggestion-label crosswalker-match-${matchStrength}`
			});

			// Show match details
			if (bestMatch.matchDetails.length > 0) {
				const detailsEl = suggestionContainer.createEl('p', {
					text: bestMatch.matchDetails.slice(0, 3).join(' • '),
					cls: 'setting-item-description'
				});
			}

			// Action buttons
			const btnContainer = suggestionContainer.createEl('div', { cls: 'crosswalker-suggestion-buttons' });

			const useBtn = btnContainer.createEl('button', {
				text: 'Use this config',
				cls: 'mod-cta'
			});
			useBtn.addEventListener('click', () => {
				this.applyConfig(bestMatch.config);
			});

			const browseBtn = btnContainer.createEl('button', {
				text: 'Browse configs...'
			});
			browseBtn.addEventListener('click', () => {
				this.openConfigBrowser();
			});

			const skipBtn = btnContainer.createEl('button', {
				text: 'Start fresh'
			});
			skipBtn.addEventListener('click', () => {
				this.configMatches = []; // Clear so banner doesn't show again
				this.renderStep();
			});

			// Show other matches if more than one
			if (this.configMatches.length > 1) {
				const otherMatches = suggestionContainer.createEl('details', { cls: 'crosswalker-other-matches' });
				otherMatches.createEl('summary', { text: `${this.configMatches.length - 1} other matching config(s)` });

				for (const match of this.configMatches.slice(1, 4)) {
					const matchRow = otherMatches.createEl('div', { cls: 'crosswalker-other-match-row' });
					matchRow.createEl('span', { text: `${match.config.name} (${match.score}%)` });
					const useOtherBtn = matchRow.createEl('button', { text: 'Use', cls: 'mod-small' });
					useOtherBtn.addEventListener('click', () => {
						this.applyConfig(match.config);
					});
				}
			}
		} else if (this.plugin.settings.savedConfigs.length > 0) {
			// No matches, but we have configs - offer to browse
			const noMatchContainer = container.createEl('div', { cls: 'crosswalker-config-no-match' });
			noMatchContainer.createEl('p', {
				text: 'No saved configs match this file.',
				cls: 'setting-item-description'
			});
			const browseBtn = noMatchContainer.createEl('button', { text: 'Browse saved configs' });
			browseBtn.addEventListener('click', () => {
				this.openConfigBrowser();
			});
		}
	}

	/**
	 * Find configs that match the current parsed data
	 */
	findMatchingConfigsForFile() {
		if (!this.parsedData || !this.sourceType) return;

		const threshold = this.plugin.settings.configMatchThreshold;
		const matches = findMatchingConfigs(
			this.parsedData,
			this.sourceType,
			this.plugin.settings.savedConfigs,
			this.sourceFile?.name
		);

		// Filter by threshold
		this.configMatches = matches.filter(m => m.score >= threshold);

		this.plugin.debug.info('wizard', 'config-match-results', `${this.configMatches.length} matching configs (threshold ${threshold})`, {
			totalConfigs: this.plugin.settings.savedConfigs.length,
			threshold,
			matchCount: this.configMatches.length,
			matches: this.configMatches.map(m => ({ name: m.config.name, score: m.score }))
		});
	}

	/**
	 * Apply a saved config to pre-fill wizard settings
	 */
	applyConfig(config: SavedConfig) {
		this.appliedConfig = config;
		this.configWarnings = [];
		// A matched config supersedes heuristic suggestions — clear so the
		// config's mappings re-initialize every column in Step 2.
		this.columnConfigs = new Map();
		this.suggestedColumns = new Set();
		this.smartDefaultsApplied = true; // don't re-suggest over a config

		// Validate column matches
		if (this.parsedData && config.fingerprint.columnNames) {
			const fileColumns = new Set(this.parsedData.columns.map(c => c.toLowerCase()));
			const configColumns = config.fingerprint.columnNames;

			for (const col of configColumns) {
				if (!fileColumns.has(col.toLowerCase())) {
					this.configWarnings.push(`Config expects "${col}" column but file doesn't have it`);
				}
			}

			// Check for extra columns
			const configColumnSet = new Set(configColumns.map(c => c.toLowerCase()));
			const extraColumns = this.parsedData.columns.filter(c => !configColumnSet.has(c.toLowerCase()));
			if (extraColumns.length > 0 && extraColumns.length <= 3) {
				this.configWarnings.push(`File has extra columns: ${extraColumns.join(', ')}`);
			} else if (extraColumns.length > 3) {
				this.configWarnings.push(`File has ${extraColumns.length} extra columns not in config`);
			}
		}

		// Copy config settings to wizard state
		if (config.config) {
			this.config = { ...config.config };
		}

		// Update lastUsedAt
		config.lastUsedAt = new Date().toISOString();
		this.plugin.saveSettings();

		this.plugin.debug.info('wizard', 'config-applied', `Applied saved config: ${config.name}`, {
			configId: config.id,
			configName: config.name,
			warnings: this.configWarnings
		});

		new Notice(`Applied config: ${config.name}`);
		this.renderStep();
	}

	/**
	 * Open config browser in selection mode
	 */
	openConfigBrowser() {
		const modal = new ConfigBrowserModal(this.app, this.plugin, 'select', (result) => {
			if (result.action === 'select' && result.config) {
				this.applyConfig(result.config);
			}
		});
		modal.open();
	}

	// =========================================================================
	// Recognized-source fast path (spec §7m)
	// =========================================================================

	/**
	 * Fingerprint the parsed source against the bundled recipe registry. A confident
	 * match (see recipe-registry `CONFIDENT_MATCH_THRESHOLD`) arms the trust-forward
	 * recognized-source card; no match leaves the ordinary detection flow untouched.
	 */
	private computeRecognizedMatch(): void {
		if (!this.parsedData) {
			this.recognizedMatch = null;
			return;
		}
		// "Import again" (workspace view, spec §7n item 3): the caller pre-armed a
		// specific recipe id. Honor it directly rather than re-fingerprinting — the
		// user already told us which ontology this is. Consumed once.
		if (this.presetRecipeId) {
			const entry = RECIPE_REGISTRY.find((e) => e.id === this.presetRecipeId);
			this.presetRecipeId = null;
			if (entry) {
				this.recognizedMatch = { entry, score: 100 };
				this.plugin.debug.info('wizard', 'recognized-source-preset', `Import again: preset recipe "${entry.id}"`, {
					recipeId: entry.id,
				});
				return;
			}
		}
		this.recognizedMatch = bestRecognizedRecipe(this.parsedData.columns);
		if (this.recognizedMatch) {
			this.plugin.debug.info('wizard', 'recognized-source', `Recognized "${this.recognizedMatch.entry.id}" (${this.recognizedMatch.score}% match)`, {
				recipeId: this.recognizedMatch.entry.id,
				score: this.recognizedMatch.score,
			});
		}
	}

	/**
	 * Render the recognized-source card (spec §7m): a calm, trust-forward lead when
	 * a source matches a vetted bundled recipe. One confident primary action, with
	 * the escape hatches right beside it. Returns true when a card was rendered (the
	 * caller then suppresses the ordinary saved-config suggestion for calm).
	 */
	private renderRecognizedSourceCard(container: HTMLElement): boolean {
		if (!this.recognizedMatch || this.recognizedDismissed || this.appliedConfig) return false;
		const { entry } = this.recognizedMatch;

		const card = container.createEl('div', { cls: 'crosswalker-recognized-card' });

		// Head — recognized name + provenance badge (Built-in vetted).
		const head = card.createEl('div', { cls: 'crosswalker-recognized-head' });
		const titleWrap = head.createEl('div', { cls: 'crosswalker-recognized-titlewrap' });
		const icon = titleWrap.createSpan({ cls: 'crosswalker-recognized-ico' });
		setIcon(icon, 'badge-check');
		const titleText = titleWrap.createEl('div', { cls: 'crosswalker-recognized-titletext' });
		titleText.createEl('div', { cls: 'crosswalker-recognized-eyebrow', text: 'Recognized source' });
		titleText.createEl('div', { cls: 'crosswalker-recognized-title', text: entry.label });
		const prov: Provenance = {
			origin: 'built-in',
			badge: 'Built-in',
			recommended: true,
			line: `${entry.label} · built-in configuration`,
		};
		renderProvenanceBadge(head.createEl('div', { cls: 'crosswalker-recognized-badges' }), prov);

		// What you get — one calm line: rows, the shapes, the destination, and
		// (when live — spec §7m curated defaults) what the enrichment hint adds.
		const rowCount = this.parsedData?.rowCount ?? 0;
		const shapes = summarizeRecipeShapes(entry);
		const dest = recognizedDestination(entry, this.plugin.settings.defaultOutputPath);
		const enrichment = honestEnrichment(entry);
		card.createEl('p', { cls: 'crosswalker-recognized-desc', text: entry.description });
		const summary = card.createEl('div', { cls: 'crosswalker-recognized-summary' });
		summary.createSpan({ cls: 'crosswalker-recognized-metric', text: `${rowCount.toLocaleString()} rows to ${rowCount.toLocaleString()} notes` });
		if (shapes.length) summary.createSpan({ cls: 'crosswalker-recognized-metric', text: shapes.join(', ') });
		summary.createSpan({ cls: 'crosswalker-recognized-metric', text: `lands in ${dest}` });
		if (enrichment?.children_lists) {
			summary.createSpan({ cls: 'crosswalker-recognized-metric', text: 'parents linked to children' });
		}
		if (enrichment?.facet_notes === 'notes') {
			summary.createSpan({
				cls: 'crosswalker-recognized-metric',
				text: `hub notes for ${entry.recommendedEnrichment.facetField ?? 'facets'}`,
			});
		}

		// Actions — one confident primary, escape hatches beside it.
		const actions = card.createEl('div', { cls: 'crosswalker-recognized-actions' });
		const importBtn = actions.createEl('button', { cls: 'mod-cta', text: 'Import with this configuration' });
		importBtn.addEventListener('click', () => this.startRecognizedRecipe(3));
		const customizeBtn = actions.createEl('button', { text: 'Customize' });
		customizeBtn.addEventListener('click', () => this.startRecognizedRecipe(2));
		const scratchBtn = actions.createEl('button', { cls: 'crosswalker-recognized-quiet', text: 'Start from scratch' });
		scratchBtn.addEventListener('click', () => {
			this.recognizedDismissed = true;
			this.plugin.debug.info('wizard', 'recognized-dismissed', 'User chose to start from scratch over the recognized recipe', {
				recipeId: entry.id,
			});
			this.renderStep();
		});

		return true;
	}

	/**
	 * Enter the recognized-recipe fast path: load the vetted recipe into a workbench
	 * via `fromRecipe` (the round-trip law — NOT a fresh detection pass) and jump to
	 * the review screen (`toStep` 3) or the workbench (`toStep` 2, "Customize"). The
	 * SAME recipe/render pipeline drives generation; the card just fronts it with trust.
	 */
	private startRecognizedRecipe(toStep: number): void {
		if (!this.recognizedMatch || !this.parsedData) return;
		const { entry } = this.recognizedMatch;
		this.recognizedFastPath = true;
		this.appliedConfig = null;
		this.configMatches = [];
		// Curated defaults (spec §7m): the registry's suggestedFolder becomes the
		// destination (unless a plugin-wide default already overrides it), and any
		// LIVE recommendedEnrichment hint rides along on the seeded mapping.
		this.outputPath = recognizedDestination(entry, this.plugin.settings.defaultOutputPath);
		const mapping = recipeMapping(entry);
		const enrichment = honestEnrichment(entry);
		if (enrichment) mapping.enrichment = enrichment;
		// Seed the workbench from the recipe (seedColumnDefaults=false → emit EXACTLY
		// the vetted recipe). columnsSignature matches, so renderStep2/3 reuse it.
		this.workbench = this.makeWorkbench(mapping, false);
		this.pendingWorkbenchMapping = null;
		this.currentStep = toStep;
		this.plugin.debug.info('wizard', 'recognized-recipe-chosen', `Fast path: ${entry.id} → step ${toStep}`, {
			recipeId: entry.id,
			toStep,
		});
		this.scheduleDraftSave();
		this.renderStep();
	}

	detectFileType() {
		if (!this.sourceFile) return;

		const name = this.sourceFile.name.toLowerCase();
		if (name.endsWith('.csv')) {
			this.sourceType = 'csv';
		} else if (name.endsWith('.xlsx') || name.endsWith('.xls')) {
			this.sourceType = 'xlsx';
		} else if (name.endsWith('.json')) {
			this.sourceType = 'json';
		}
	}

	// =========================================================================
	// Step 2: Configure Columns
	// =========================================================================

	/** Whether the beta shape workbench should drive step 2 (and feed 3/4). */
	private isWorkbenchMode(): boolean {
		return (this.plugin.settings.enableShapeWorkbench || this.recognizedFastPath) && !!this.parsedData;
	}

	renderStep2_ConfigureColumns(container: HTMLElement) {
		if (this.isWorkbenchMode()) {
			this.renderStep2_Workbench(container);
			return;
		}

		container.createEl('h3', { text: 'Configure columns' });

		if (!this.parsedData) {
			container.createEl('p', { text: 'No data parsed. Please go back and select a file.' });
			return;
		}

		// Show applied config indicator
		if (this.appliedConfig) {
			const configIndicator = container.createEl('div', { cls: 'crosswalker-step2-config-indicator' });
			configIndicator.createEl('span', {
				text: `📋 Pre-filled from: "${this.appliedConfig.name}"`,
				cls: 'crosswalker-config-badge'
			});
			const clearBtn = configIndicator.createEl('button', { text: 'Clear', cls: 'mod-small' });
			clearBtn.addEventListener('click', () => {
				this.appliedConfig = null;
				this.config = {};
				this.configWarnings = [];
				this.renderStep();
			});
		}

		const step2Stats = container.createEl('div', { cls: 'crosswalker-stats-grid crosswalker-preview-stats' });
		for (const [v, l] of [[this.parsedData.rowCount.toLocaleString(), 'rows'], [String(this.parsedData.columns.length), 'columns']] as const) {
			const card = step2Stats.createEl('div', { cls: 'crosswalker-stat-card' });
			card.createEl('div', { text: v, cls: 'crosswalker-stat-value crosswalker-stat-big' });
			card.createEl('div', { text: l, cls: 'crosswalker-stat-label' });
		}
		if (this.suggestedColumns.size > 0 && !this.appliedConfig) {
			const banner = container.createEl('div', { cls: 'crosswalker-suggest-banner' });
			banner.createEl('span', {
				text: `✨ Crosswalker pre-filled ${this.suggestedColumns.size} column role${this.suggestedColumns.size === 1 ? '' : 's'} based on the column names — review the ✨ rows below and adjust freely.`
			});
		}
		// The two questions every first run asks, answered up front:
		container.createEl('p', {
			// eslint-disable-next-line obsidianmd/ui/sentence-case -- "Skip" and "Use as" quote literal control labels
			text: 'All columns are imported as frontmatter properties by default — nothing is dropped unless you set it to Skip. Change "Use as" to map a column onto a different vault primitive (folder, filename, link, body); the last column previews the result.',
			cls: 'setting-item-description'
		});

		// Build column mapping lookup from applied config
		const configMapping = this.buildColumnMappingLookup();

		// Search/filter — essential on wide sources (SCF: 369 columns)
		const filterBar = container.createEl('div', { cls: 'crosswalker-column-filter' });
		const filterInput = filterBar.createEl('input', {
			type: 'search',
			value: this.columnFilter,
			attr: { placeholder: 'Filter columns by name, key, or sample value…' }
		});
		filterInput.addEventListener('input', () => {
			this.columnFilter = filterInput.value;
			this.showAllColumns = false;
			renderRows();
		});

		// Column configuration table
		const tableContainer = container.createEl('div', { cls: 'crosswalker-table-container' });
		const table = tableContainer.createEl('table', { cls: 'crosswalker-column-table' });
		const thead = table.createEl('thead');
		const headerRow = thead.createEl('tr');
		headerRow.createEl('th', { text: 'Column' });
		headerRow.createEl('th', { text: 'Detected type' });
		headerRow.createEl('th', { text: 'Sample values' });
		headerRow.createEl('th', { text: 'Use as' });
		headerRow.createEl('th', { text: 'Output key' });
		headerRow.createEl('th', { text: 'In the vault' });

		const tbody = table.createEl('tbody');

		// Initialize configs for every column up front (sorting needs them)
		for (const colInfo of this.columnInfos) {
			const colMapping = configMapping.get(colInfo.name.toLowerCase());
			if (!this.columnConfigs.has(colInfo.name)) {
				this.columnConfigs.set(colInfo.name, {
					useAs: colMapping?.useAs || 'frontmatter',
					outputKey: colMapping?.outputKey || this.normalizeKey(colInfo.name)
				});
			}
		}

		/** Live "what this becomes in the vault" mini-preview — the 5-primitive
		 *  grammar (folder | file | heading | tag | wikilink) made visible at the
		 *  exact decision point. */
		const vaultPreview = (cfg: { useAs: string; outputKey: string; folderTemplates?: string[] }, sample: string, columnName: string): string => {
			const v = this.truncate(sample || 'value', 18);
			switch (cfg.useAs) {
				case 'hierarchy': return `📁 ${v}/`;
				case 'folder-tree': {
					// Show the actual nested path the id parses into, e.g.
					// "DE.AE-02 → 📁 DE/DE.AE/DE.AE-02.md".
					const parts = (cfg.folderTemplates ?? []).map((t) => {
						try { return renderTemplate(t, { [columnName]: sample }); }
						catch { return ''; }
					}).filter(Boolean);
					const tree = [...parts, `${this.truncate(sample || 'id', 14)}.md`].join('/');
					return `📁 ${tree}`;
				}
				case 'title': return `📄 ${v}.md`;
				case 'link': return `[[${v}]]`;
				case 'body': return '¶ note body';
				case 'skip': return '— not imported';
				default: return `${cfg.outputKey || 'key'}: ${v}`;
			}
		};

		/** Attention hierarchy: special-role + config-mapped columns float to the
		 *  top; the long all-defaults tail collapses on very wide sources. */
		const COLLAPSE_THRESHOLD = 25;
		const DEFAULT_TAIL_SHOWN = 15;

		const renderRows = () => {
			tbody.empty();
			const filter = this.columnFilter.trim().toLowerCase();
			let infos = this.columnInfos;
			if (filter) {
				infos = infos.filter((ci) => {
					const cfg = this.columnConfigs.get(ci.name);
					return ci.name.toLowerCase().includes(filter)
						|| (cfg?.outputKey ?? '').toLowerCase().includes(filter)
						|| ci.sampleValues.slice(0, 3).some((sv) => String(sv).toLowerCase().includes(filter));
				});
			}
			const isSpecial = (ci: typeof infos[number]) =>
				(this.columnConfigs.get(ci.name)?.useAs ?? 'frontmatter') !== 'frontmatter'
				|| configMapping.has(ci.name.toLowerCase());
			const special = infos.filter(isSpecial);
			const defaults = infos.filter((ci) => !isSpecial(ci));

			let shown = [...special, ...defaults];
			let hidden = 0;
			if (!filter && !this.showAllColumns && infos.length > COLLAPSE_THRESHOLD) {
				const tail = defaults.slice(0, DEFAULT_TAIL_SHOWN);
				hidden = defaults.length - tail.length;
				shown = [...special, ...tail];
			}

			for (const colInfo of shown) renderRow(colInfo);

			if (hidden > 0) {
				const moreRow = tbody.createEl('tr');
				const moreCell = moreRow.createEl('td', { attr: { colspan: '6' } });
				const moreBtn = moreCell.createEl('button', {
					text: `Show all columns (${hidden} more, all imported as frontmatter)`,
					cls: 'crosswalker-show-all-btn'
				});
				moreBtn.addEventListener('click', () => {
					this.showAllColumns = true;
					renderRows();
				});
			}
			if (filter && shown.length === 0) {
				const emptyRow = tbody.createEl('tr');
				emptyRow.createEl('td', { text: 'No columns match the filter.', attr: { colspan: '6' } });
			}
		};

		const renderRow = (colInfo: ColumnInfo) => {
			const row = tbody.createEl('tr');
			const colMapping = configMapping.get(colInfo.name.toLowerCase());
			const currentConfig = this.columnConfigs.get(colInfo.name)!;

			// Add visual indicator if this column is from config
			if (colMapping) {
				row.addClass('crosswalker-row-from-config');
			}

			// Column name
			const nameCell = row.createEl('td', { cls: 'crosswalker-col-name' });
			nameCell.createEl('span', { text: colInfo.name });
			if (colMapping) {
				nameCell.createEl('span', { text: ' ⚙️', cls: 'crosswalker-config-icon', attr: { title: 'Pre-filled from config' } });
			} else if (this.suggestedColumns.has(colInfo.name)) {
				nameCell.createEl('span', { text: ' ✨', cls: 'crosswalker-config-icon', attr: { title: 'Suggested role — change freely' } });
			}

			// Detected type
			const typeCell = row.createEl('td');
			const typeIcon = this.getTypeIcon(colInfo.detectedType);
			typeCell.createEl('span', { text: `${typeIcon} ${colInfo.detectedType}` });
			if (colInfo.hasEmptyValues) {
				typeCell.createEl('span', { text: ' (has blanks)', cls: 'crosswalker-warning' });
			}

			// Sample values (first 3)
			const sampleCell = row.createEl('td', { cls: 'crosswalker-samples' });
			const samples = colInfo.sampleValues.slice(0, 3);
			sampleCell.createEl('span', {
				text: samples.map(s => this.truncate(String(s), 20)).join(', '),
				cls: 'setting-item-description'
			});

			// Use as dropdown - pre-fill from config or existing state
			const useAsCell = row.createEl('td');
			const useAsSelect = useAsCell.createEl('select', { cls: 'dropdown' });
			useAsSelect.createEl('option', { text: 'Frontmatter', attr: { value: 'frontmatter' } });
			useAsSelect.createEl('option', { text: 'Hierarchy level', attr: { value: 'hierarchy' } });
			// eslint-disable-next-line obsidianmd/ui/sentence-case -- "id" is the literal column-role label
			useAsSelect.createEl('option', { text: 'Folder tree (from id)', attr: { value: 'folder-tree' } });
			useAsSelect.createEl('option', { text: 'Note title', attr: { value: 'title' } });
			useAsSelect.createEl('option', { text: 'Crosswalk link', attr: { value: 'link' } });
			useAsSelect.createEl('option', { text: 'Body content', attr: { value: 'body' } });
			useAsSelect.createEl('option', { text: 'Skip', attr: { value: 'skip' } });

			// Set value from stored state
			useAsSelect.value = currentConfig.useAs;

			// Output key (editable) - pre-fill from config or existing state
			const keyCell = row.createEl('td');
			const keyInput = keyCell.createEl('input', {
				type: 'text',
				value: currentConfig.outputKey,
				cls: 'crosswalker-key-input'
			});
			// eslint-disable-next-line obsidianmd/ui/sentence-case
			keyInput.placeholder = 'output_key';

			// Live vault preview cell — updates as the role/key change
			const sample = String(colInfo.sampleValues[0] ?? '');
			const previewCell = row.createEl('td', { cls: 'crosswalker-vault-preview' });
			const updatePreview = () => {
				previewCell.setText(vaultPreview(currentConfig, sample, colInfo.name));
			};
			updatePreview();

			// Update state on change (+ refresh the preview in place — no re-render,
			// so dropdown focus survives; re-sorting happens on next full render)
			useAsSelect.addEventListener('change', () => {
				currentConfig.useAs = useAsSelect.value;
				if (useAsSelect.value === 'folder-tree') {
					currentConfig.folderTemplates = deriveIdSplitTemplates(colInfo.name, this.sampleValuesForColumn(colInfo.name));
				}
				this.columnConfigs.set(colInfo.name, currentConfig);
				updatePreview();
				this.scheduleDraftSave();
			});
			keyInput.addEventListener('input', () => {
				currentConfig.outputKey = keyInput.value;
				this.columnConfigs.set(colInfo.name, currentConfig);
				updatePreview();
				this.scheduleDraftSave();
			});
		};

		renderRows();

		// Unique values summary — stat-card grid (one card per column)
		const statsHeading = container.createEl('h4', { text: 'Column statistics' });
		statsHeading.addClass('crosswalker-stats-heading');
		container.createEl('p', {
			text: 'Cardinality of each column. Low unique counts often work well as hierarchy levels; high counts are typically frontmatter or skipped.',
			cls: 'setting-item-description crosswalker-stats-hint'
		});
		const statsGrid = container.createEl('div', { cls: 'crosswalker-stats-grid' });

		const totalRows = this.parsedData?.rowCount ?? 0;
		for (const colInfo of this.columnInfos) {
			const card = statsGrid.createEl('div', { cls: 'crosswalker-stat-card' });
			card.createEl('div', { text: colInfo.name, cls: 'crosswalker-stat-label' });
			card.createEl('div', {
				text: colInfo.uniqueCount.toLocaleString(),
				cls: 'crosswalker-stat-value'
			});
			const meta = card.createEl('div', { cls: 'crosswalker-stat-meta' });
			meta.createEl('span', { text: 'Unique' });
			if (totalRows > 0) {
				const pct = Math.round((colInfo.uniqueCount / totalRows) * 100);
				meta.createEl('span', {
					text: ` · ${pct}% of rows`,
					cls: 'crosswalker-stat-pct'
				});
			}
			if (colInfo.hasEmptyValues) {
				card.createEl('div', { text: 'Has blanks', cls: 'crosswalker-stat-warning' });
			}
		}
	}

	// =========================================================================
	// Step 2 (beta): the shape workbench
	// =========================================================================

	/** Render the shape-first workbench in place of the classic column table. */
	private renderStep2_Workbench(container: HTMLElement): void {
		if (!this.parsedData) {
			container.createEl('p', { text: 'No data parsed. Please go back and select a file.' });
			return;
		}
		container.createEl('h3', { text: 'Map the shapes' });
		container.createEl('p', {
			text: 'Pick how each detected shape lands in your vault.',
			cls: 'setting-item-description crosswalker-wb-subtitle',
		});
		// The longer explainer is a dismissible one-line hint (spec §7j #5), so the
		// header stays a single title + subtitle after the first read.
		if (!this.workbenchHintDismissed) {
			const hint = container.createEl('div', { cls: 'crosswalker-wb-hint' });
			hint.createEl('span', {
				cls: 'crosswalker-wb-hint-text',
				text: 'Accept the defaults for a good vault, or open a mapping to fine-tune. The preview on the right updates live.',
			});
			const x = hint.createEl('button', { cls: 'crosswalker-wb-hint-x', attr: { 'aria-label': 'Dismiss hint' } });
			setIcon(x, 'x');
			x.addEventListener('click', () => { this.workbenchHintDismissed = true; this.renderStep(); });
		}

		const sig = this.parsedData.columns.join('|');
		if (!this.workbench || this.workbench.columnsSignature() !== sig) {
			// Draft resume (spec §7i): seed from the persisted mapping once, then
			// clear it so a later column-signature change re-instantiates fresh.
			const initialMapping = this.pendingWorkbenchMapping ?? undefined;
			this.pendingWorkbenchMapping = null;
			this.workbench = this.makeWorkbench(initialMapping);
		}
		this.workbench.render(container.createDiv());
	}

	/**
	 * Construct a workbench over the current parsed source. `initialMapping` seeds
	 * the model directly (draft resume, or a recognized recipe via `fromRecipe`);
	 * `seedColumnDefaults: false` keeps a recipe-seeded workbench emitting EXACTLY
	 * the vetted recipe — no auto-added per-column properties (spec §7m).
	 */
	private makeWorkbench(initialMapping?: ImportMapping, seedColumnDefaults = true): MappingWorkbench {
		// Adaptive placement default: a vault running a folder-notes plugin has
		// already chosen how parents should live — match it (pure helper over
		// the enabled community-plugin ids).
		// @ts-expect-error internal plugins API (enabledPlugins is a Set<string>)
		const enabled: Set<string> = this.app.plugins?.enabledPlugins ?? new Set();
		return new MappingWorkbench({
			parsedData: this.parsedData!,
			columnInfos: this.columnInfos,
			outputPath: this.outputPath || this.plugin.settings.defaultOutputPath,
			debug: this.plugin.debug,
			defaultPresetId: 'browsable-framework',
			initialMapping,
			seedColumnDefaults,
			defaultParentNote: preferredParentNote(enabled),
			waypointDetected: detectWaypointPlugin(enabled),
			// Vault-level Connections defaults (settings § Connections). Ignored by
			// the workbench whenever `initialMapping` is set (recognized recipe /
			// draft resume both outrank vault defaults in the precedence chain).
			vaultDefaults: this.plugin.settings.defaultEnrichment,
			onChange: () => {
				this.plugin.debug.trace('wizard', 'workbench-change', 'Workbench model changed');
				// A user edit to a recipe-seeded workbench downgrades the fast-path
				// provenance from "Built-in vetted" to "Custom (based on <recipe>)".
				if (this.recognizedFastPath) this.recognizedEdited = true;
				this.scheduleDraftSave();
			},
		});
	}

	/**
	 * Step 3 in workbench mode: a true review screen (spec §7j #1). No workbench
	 * re-render — a focused read-only recap that answers WHERE / WHAT / WHY at a
	 * glance: destination block → shape-map recap → headline stats → deviation
	 * banner → provenance line.
	 */
	private renderStep3_WorkbenchReview(container: HTMLElement): void {
		container.createEl('h3', { text: 'Review and confirm' });
		container.createEl('p', {
			text: 'Where it lands, what gets made, and why these settings. Change anything, then generate.',
			cls: 'setting-item-description',
		});
		if (!this.workbench) {
			container.createEl('p', { text: 'Go back and configure the mapping first.' });
			return;
		}

		// (a) Destination block — WHERE.
		this.renderDestinationBlock(container);

		// (b) Shape-map recap table (moved here from step 4) — WHAT.
		container.createEl('h4', { text: 'Your shape map' });
		const recap = buildShapeMapRecap(this.workbench.getMapping(), this.parsedData?.rowCount ?? 0);
		const table = container.createEl('table', { cls: 'crosswalker-shape-map' });
		const thead = table.createEl('thead').createEl('tr');
		for (const h of ['From your file', 'Becomes', 'Count']) thead.createEl('th', { text: h });
		const tbody = table.createEl('tbody');
		for (const r of recap) {
			const tr = tbody.createEl('tr');
			tr.createEl('td', { cls: 'mono', text: r.from });
			tr.createEl('td', { text: r.becomes });
			tr.createEl('td', { text: r.count });
		}

		// (b½) The numeric plan — "what will be created" from the FULL parse, not
		// just the preview sample (2026-07-11 ICSB audit gap #2, `emit.py plan`
		// parity). Cheap: computePlan() never calls render().
		this.renderPlanLine(container);

		// (c) Headline stat chips.
		const preview = this.workbench.computePreview();
		const statRow = container.createEl('div', { cls: 'crosswalker-stats-grid crosswalker-preview-stats' });
		const stat = (icon: string, value: number, label: string) => {
			const card = statRow.createEl('div', { cls: 'crosswalker-stat-card' });
			const valueRow = card.createEl('div', { cls: 'crosswalker-stat-value' });
			const ico = valueRow.createSpan({ cls: 'crosswalker-wb-ico crosswalker-stat-ico' });
			setIcon(ico, icon);
			valueRow.createSpan({ text: value.toLocaleString() });
			card.createEl('div', { text: label, cls: 'crosswalker-stat-label' });
		};
		const noteCount = this.parsedData?.rowCount ?? 0;
		let folders = 0;
		let links = 0;
		if (preview) {
			const folderSet = new Set<string>();
			for (const a of preview.addresses) {
				const parts = a.address.primary.path.split('/');
				parts.slice(0, -1).forEach((_, i) => folderSet.add(parts.slice(0, i + 1).join('/')));
				links += Object.values(a.address.frontmatter).filter((v) => typeof v === 'string' && v.startsWith('[[')).length;
			}
			folders = folderSet.size;
		}
		stat('file-text', noteCount, 'notes');
		stat('folder', folders, 'folders (in sample)');
		stat('link', links, 'links (in sample)');

		// (d) Deviation banner.
		if (preview && preview.perRow.length) {
			this.renderDeviationBanner(container, preview.perRow, preview.total);
		}

		// (e) Provenance line — WHY TRUST.
		this.renderProvenanceLine(container);
	}

	/**
	 * The numeric plan line (spec: "what will be created", 2026-07-11 ICSB
	 * audit gap #2). Unlike the sample-scoped stat cards above (explicitly
	 * labeled "in sample"), this reads the FULL parsed source — cheaply,
	 * without calling render() per row (see mapping/plan.ts). Estimated
	 * figures get a leading `~` so nothing here claims false precision.
	 */
	private renderPlanLine(container: HTMLElement): void {
		if (!this.workbench || !this.parsedData) return;
		const rows = isEagerRows(this.parsedData.rows) ? (this.parsedData.rows as Record<string, unknown>[]) : [];
		const plan = computePlan(this.workbench.getMapping(), rows, this.parsedData.rowCount);
		const fmt = (p: { count: number; exact: boolean }, label: string): string =>
			`${p.exact ? '' : '~'}${p.count.toLocaleString()} ${label}`;
		const parts = [
			fmt(plan.notes, 'notes'),
			fmt(plan.folders, 'folders'),
			fmt(plan.facetHubs, 'facet hubs'),
			fmt(plan.folderIndexNotes, 'index notes'),
			fmt(plan.links, 'links'),
		];
		const line = container.createEl('p', { cls: 'crosswalker-plan-line' });
		line.createSpan({ text: 'What will be created: ' });
		line.createSpan({ text: parts.join(' · ') });
		line.createEl('span', {
			cls: 'crosswalker-plan-line-note',
			text: rows.length > 0 ? ' (figures marked ~ are estimates from the full file)' : ' (streamed source; only the note count is known before generating)',
		});
	}

	/**
	 * The destination block (spec §7j #2): a prominent, autofilled, inline-editable
	 * breadcrumb path plus a "Show in file explorer" button that reveals the target
	 * folder without closing the modal.
	 */
	private renderDestinationBlock(container: HTMLElement): void {
		// Autofill a sensible default the first time we reach the review screen.
		if (!this.outputPath || !this.outputPath.trim()) {
			this.outputPath = deriveDestinationDefault(this.plugin.settings.defaultOutputPath, this.sourceFile?.name ?? null);
		}
		const block = container.createEl('div', { cls: 'crosswalker-dest-block' });
		const head = block.createEl('div', { cls: 'crosswalker-dest-head' });
		head.createEl('div', { cls: 'crosswalker-dest-label', text: 'Destination' });
		const revealBtn = head.createEl('button', { cls: 'crosswalker-dest-reveal', text: 'Show in file explorer' });
		revealBtn.addEventListener('click', () => this.revealDestinationInExplorer());
		this.renderDestinationPath(block.createEl('div', { cls: 'crosswalker-dest-pathwrap' }));
	}

	/** Breadcrumb path display / inline text editor toggle for the destination. */
	private renderDestinationPath(wrap: HTMLElement): void {
		if (this.destEditing) {
			const input = wrap.createEl('input', { type: 'text', cls: 'crosswalker-dest-input', value: this.outputPath });
			// eslint-disable-next-line obsidianmd/ui/sentence-case -- placeholder is an example vault path
			input.placeholder = 'Frameworks/My import';
			const commit = () => {
				this.outputPath = input.value.trim() || this.outputPath;
				this.destEditing = false;
				this.scheduleDraftSave();
				this.renderStep();
			};
			input.addEventListener('keydown', (e) => {
				if (e.key === 'Enter') { e.preventDefault(); commit(); }
				else if (e.key === 'Escape') { this.destEditing = false; this.renderStep(); }
			});
			input.addEventListener('blur', commit);
			window.setTimeout(() => input.focus(), 0);
			return;
		}
		const crumb = wrap.createEl('button', { cls: 'crosswalker-dest-crumb', attr: { title: 'Click to edit the destination path' } });
		const segs = this.outputPath.split('/').filter(Boolean);
		if (segs.length === 0) {
			crumb.createEl('span', { cls: 'crosswalker-dest-seg', text: '(vault root)' });
		} else {
			segs.forEach((seg, i) => {
				if (i > 0) crumb.createEl('span', { cls: 'crosswalker-dest-sep', text: '/' });
				crumb.createEl('span', { cls: 'crosswalker-dest-seg', text: seg });
			});
		}
		setIcon(crumb.createEl('span', { cls: 'crosswalker-dest-editicon' }), 'pencil');
		crumb.addEventListener('click', () => { this.destEditing = true; this.renderStep(); });
	}

	/**
	 * Reveal + highlight the destination folder in Obsidian's file-explorer pane
	 * without closing the modal (spec §7j #2). Reveals the nearest existing ancestor
	 * when the target folder doesn't exist yet; feature-detects the internal
	 * file-explorer reveal method and falls back to a Notice when it's absent.
	 */
	/**
	 * Wait for Obsidian's metadataCache resolve queue to drain (bounded), so
	 * frontmatter reads immediately after a bulk `vault.create()` batch (the
	 * home screen's installed-frameworks filter, `_crosswalker` producer
	 * frontmatter) see freshly-generated notes instead of racing the async
	 * indexer. `resolved` fires once per full pass; a generation batch queues
	 * new work, so it should fire again shortly. Falls back to the timeout so
	 * a stuck/absent event never hangs the "done" transition.
	 */
	private async waitForMetadataResolve(timeoutMs = 4000): Promise<void> {
		await new Promise<void>((resolve) => {
			let done = false;
			const finish = () => {
				if (done) return;
				done = true;
				this.app.metadataCache.offref(ref);
				resolve();
			};
			const ref = this.app.metadataCache.on('resolved', finish);
			window.setTimeout(finish, timeoutMs);
		});
	}

	private async revealDestinationInExplorer(): Promise<void> {
		const target = this.outputPath.trim().replace(/\/+$/, '');
		// Walk up to the nearest existing folder (target or an ancestor).
		let folder: TFolder | null = null;
		let probe = target;
		while (probe) {
			const af = this.app.vault.getAbstractFileByPath(normalizePath(probe));
			if (af instanceof TFolder) { folder = af; break; }
			const cut = probe.lastIndexOf('/');
			probe = cut > 0 ? probe.slice(0, cut) : '';
		}
		if (!folder) folder = this.app.vault.getRoot();

		const leaf = this.app.workspace.getLeavesOfType('file-explorer')[0];
		if (leaf) {
			// Obsidian 1.7+ defers sidebar views that haven't been shown yet:
			// leaf.view is then a placeholder WITHOUT revealInFolder, which made
			// this feature-detect fail even though the explorer exists (owner
			// hit the fallback notice on a folder that was right there). Reveal
			// and load the leaf BEFORE grabbing the view.
			await this.app.workspace.revealLeaf(leaf);
			const maybeDeferred = leaf as unknown as { loadIfDeferred?: () => Promise<void> };
			if (typeof maybeDeferred.loadIfDeferred === 'function') await maybeDeferred.loadIfDeferred();
			const view = leaf.view as unknown as { revealInFolder?: (f: unknown) => void };
			if (typeof view.revealInFolder === 'function') {
				view.revealInFolder(folder);
				const exists = this.app.vault.getAbstractFileByPath(normalizePath(target)) instanceof TFolder;
				if (!exists) {
					new Notice(`That folder will be created when you generate. Showing the nearest existing folder: ${folder.path || 'vault root'}.`, 6000);
				}
				return;
			}
		}
		new Notice('The file explorer is not available in this layout. The destination folder is created when you generate.', 6000);
	}

	/** The step-3 provenance line + badge (spec §7j #3). */
	private renderProvenanceLine(container: HTMLElement): void {
		if (!this.workbench) return;
		const prov = this.recognizedProvenance() ?? this.workbench.provenance(this.appliedConfig?.name ?? null);
		const line = container.createEl('div', { cls: 'crosswalker-provenance' });
		line.createEl('span', { cls: 'crosswalker-provenance-lead', text: 'Using: ' });
		line.createEl('span', { cls: 'crosswalker-provenance-text', text: prov.line });
		renderProvenanceBadge(line, prov);
	}

	/**
	 * Provenance for the recognized-recipe fast path (spec §7m): an untouched vetted
	 * recipe reads "Built-in", and stays trust-forward on the review screen instead
	 * of the workbench's preset-drift derivation (which would read "Custom"). A user
	 * edit after "Customize" downgrades it to "Custom (based on <recipe>)". Returns
	 * null when not on the fast path (the caller uses the workbench derivation).
	 */
	private recognizedProvenance(): Provenance | null {
		if (!this.recognizedFastPath || !this.recognizedMatch) return null;
		const label = this.recognizedMatch.entry.label;
		if (this.recognizedEdited) {
			return {
				origin: 'custom',
				badge: `Custom (based on ${label})`,
				recommended: false,
				line: `${label} · custom · edited`,
			};
		}
		return {
			origin: 'built-in',
			badge: 'Built-in',
			recommended: true,
			line: `${label} · built-in configuration`,
		};
	}

	/**
	 * Legacy config used only to carry body content + a stable filename stem when
	 * generating in workbench mode. Path + frontmatter come from the workbench
	 * recipe passed as `options.recipeOverride`.
	 */
	private buildWorkbenchConfig(): Partial<ImportRecipe> {
		const wb = this.workbench;
		const body = wb ? wb.getLegacyBodyMappings() : [];
		const leaf = wb?.leafFileTemplate();
		return {
			name: 'shape-workbench',
			mapping: {
				hierarchy: [],
				frontmatter: [],
				links: [],
				body,
				...(leaf ? { filename: { template: leaf, sanitize: true } } : {}),
			},
		};
	}

	/**
	 * Build a lookup map from column name -> { useAs, outputKey } from applied config
	 */
	buildColumnMappingLookup(): Map<string, { useAs: string; outputKey: string }> {
		const lookup = new Map<string, { useAs: string; outputKey: string }>();

		if (!this.appliedConfig?.config?.mapping) {
			return lookup;
		}

		const mapping = this.appliedConfig.config.mapping;

		// Process role assignments in order of structural primacy. Each pass uses
		// "first-write wins" via .has() check, so hierarchy (most structural) is
		// preserved even if a column is ALSO listed as frontmatter in the saved
		// config (which is common — Control Family is often both a folder AND
		// emitted to frontmatter). The pre-3.5b version unconditionally .set()
		// in every loop, causing the last-written role to win — which meant
		// frontmatter mappings clobbered hierarchy and the import produced one
		// note per Control Family instead of one per row.

		// 1. Hierarchy mappings (most structural — folder paths)
		if (mapping.hierarchy) {
			for (const h of mapping.hierarchy) {
				lookup.set(h.column.toLowerCase(), {
					useAs: 'hierarchy',
					outputKey: h.column.toLowerCase().replace(/[^a-z0-9]+/g, '_')
				});
			}
		}

		// 2. Title detection from filename template — only set for columns not
		//    already taken (hierarchy wins; a column can't be both folder and
		//    title at the wizard level). Accepts both single-brace `{X}` and
		//    legacy Mustache `{{X}}` syntax for backward compat with old saved
		//    configs.
		if (mapping.filename?.template) {
			const matches = mapping.filename.template.matchAll(/\{\{?([^{}]+)\}\}?/g);
			for (const match of matches) {
				const colName = match[1].trim().toLowerCase();
				if (!lookup.has(colName)) {
					lookup.set(colName, {
						useAs: 'title',
						outputKey: colName.replace(/[^a-z0-9]+/g, '_')
					});
				}
			}
		}

		// 3. Link mappings — only if column not already assigned
		if (mapping.links) {
			for (const l of mapping.links) {
				const key = l.column.toLowerCase();
				if (!lookup.has(key)) {
					lookup.set(key, {
						useAs: 'link',
						outputKey: l.frontmatterKey || key.replace(/[^a-z0-9]+/g, '_')
					});
				}
			}
		}

		// 4. Body mappings — only if column not already assigned
		if (mapping.body) {
			for (const b of mapping.body) {
				const key = b.column.toLowerCase();
				if (!lookup.has(key)) {
					lookup.set(key, {
						useAs: 'body',
						outputKey: b.heading || b.column
					});
				}
			}
		}

		// 5. Frontmatter mappings last — least structural. Only fills in
		//    columns NOT already assigned a more-structural role. This is the
		//    key fix for the "3 notes generated" bug.
		if (mapping.frontmatter) {
			for (const f of mapping.frontmatter) {
				const key = f.column.toLowerCase();
				if (!lookup.has(key)) {
					lookup.set(key, {
						useAs: 'frontmatter',
						outputKey: f.key
					});
				}
			}
		}

		return lookup;
	}

	getTypeIcon(type: string): string {
		switch (type) {
			case 'number': return '🔢';
			case 'boolean': return '✓';
			case 'array': return '📋';
			default: return '📝';
		}
	}

	truncate(str: string, maxLen: number): string {
		if (str.length <= maxLen) return str;
		return str.substring(0, maxLen - 1) + '…';
	}

	normalizeKey(name: string): string {
		// Convert to snake_case by default
		return name
			.toLowerCase()
			.replace(/[^a-z0-9]+/g, '_')
			.replace(/^_+|_+$/g, '');
	}

	// =========================================================================
	// Draft sessions (Phase 3.6)
	// =========================================================================

	/**
	 * Schedule a draft save 500ms after the last call. Cheap to call from
	 * every keystroke / dropdown change. Drops the save silently if drafts
	 * are disabled, mid-parse, or mid-generate.
	 */
	private scheduleDraftSave(): void {
		if (!this.plugin.settings.enableDraftSessions) return;
		if (this.isParsing || this.isGenerating) return;
		if (this.draftSaveTimer) clearTimeout(this.draftSaveTimer);
		this.draftSaveTimer = setTimeout(() => {
			this.draftSaveTimer = null;
			if (this.shouldPersistDraft()) {
				void this.saveDraftNow();
			}
		}, 500);
	}

	/**
	 * Save the draft right now. Used on step advance + onClose flush.
	 */
	private async saveDraftNow(): Promise<void> {
		if (!this.plugin.settings.enableDraftSessions) return;
		if (this.isParsing || this.isGenerating) return;
		if (!this.shouldPersistDraft()) return;
		try {
			const draft = this.snapshotDraft();
			this.draftId = draft.id;
			await this.plugin.draftStore.save(draft);
		} catch (err) {
			this.plugin.debug.warn('drafts', 'save-failed', 'Wizard draft save failed', {
				error: err instanceof Error ? err.message : String(err),
			});
		}
	}

	/**
	 * Skip persistence when there's nothing meaningful to save (Step 1 with no
	 * file selected yet, generation in flight, etc.). Saving on every wizard
	 * open would create empty drafts immediately.
	 */
	private shouldPersistDraft(): boolean {
		// Past Step 1 (user has at least picked a file) OR a config has been
		// applied. Both indicate enough state worth persisting.
		const pastStep1 = this.currentStep > 1;
		const hasSource = !!this.sourceFile;
		const hasColumnConfig = this.columnConfigs.size > 0;
		return pastStep1 || (hasSource && hasColumnConfig);
	}

	/**
	 * Serialize current wizard state into a WizardDraft. Pure function (no
	 * side effects) — caller is responsible for writing to the store.
	 */
	private snapshotDraft(): WizardDraft {
		const now = new Date().toISOString();
		const id = this.draftId ?? newDraftId();
		const sourceName = this.sourceFile?.name;
		return {
			schemaVersion: 1,
			id,
			name: autoDraftName(sourceName, this.currentStep),
			createdAt: now,
			updatedAt: now,
			currentStep: this.currentStep,
			sourceFile: this.sourceFile ? { name: this.sourceFile.name, vaultPath: this.findVaultPathForSource() } : null,
			sourceType: this.sourceType,
			selectedSheet: this.selectedSheet,
			columnInfos: this.columnInfos,
			columnConfigsDict: columnConfigsToDict(this.columnConfigs),
			config: this.config,
			outputPath: this.outputPath,
			overwriteMode: this.overwriteMode,
			frameworkId: this.frameworkId,
			// Persist the shape mapping when the workbench is active so resume can
			// rehydrate the shape decisions instead of re-detecting (spec §7i).
			...(this.workbench ? { workbenchMapping: this.workbench.getMapping() } : {}),
			appliedConfigId: this.appliedConfig?.id ?? null,
		};
	}

	// =========================================================================
	// Step 3: Preview
	// =========================================================================

	renderStep3_Preview(container: HTMLElement) {
		if (this.isWorkbenchMode()) {
			this.renderStep3_WorkbenchReview(container);
			return;
		}
		container.createEl('h3', { text: 'Preview output' });

		container.createEl('p', {
			text: 'Review the folder structure and sample notes before generating.',
			cls: 'setting-item-description'
		});

		if (!this.parsedData) {
			container.createEl('p', { text: 'No data to preview.' });
			return;
		}

		// Build config from current wizard state. Pass the applied config's
		// filename block so the saved config's filename template (often
		// Mustache-style `{{X}}`) is preserved when no column is marked as
		// 'title' in the wizard. Without this the legacy-shim would default
		// to the first frontmatter column, which is often wrong.
		const config = buildConfigFromWizardState(
			this.columnConfigs,
			this.parsedData.columns,
			this.appliedConfig?.config?.mapping?.filename
		);

		// Estimate output — stat cards, not a sentence
		const estimate = estimateOutput(this.parsedData, config);
		const statRow = container.createEl('div', { cls: 'crosswalker-stats-grid crosswalker-preview-stats' });
		const stat = (icon: string, value: number, label: string) => {
			const card = statRow.createEl('div', { cls: 'crosswalker-stat-card' });
			const valueRow = card.createEl('div', { cls: 'crosswalker-stat-value' });
			const ico = valueRow.createSpan({ cls: 'crosswalker-wb-ico crosswalker-stat-ico' });
			setIcon(ico, icon);
			valueRow.createSpan({ text: value.toLocaleString() });
			card.createEl('div', { text: label, cls: 'crosswalker-stat-label' });
		};
		stat('file-text', estimate.noteCount, 'notes');
		stat('folder', estimate.folderCount, 'folders');
		stat('link', estimate.linkCount, 'links');

		// Render-report banner — per-row deviation summary (v0.1.6). Runs the
		// same render() the generation engine uses, so "match the recipe
		// pattern" here means the same thing it means at generate time.
		const renderPreview = this.computePreviewRenderNotes(config);
		if (renderPreview) {
			this.renderDeviationBanner(container, renderPreview.perRow, renderPreview.totalSourceRows);
		}

		// Vault-shaped folder tree (DOM, not ASCII) from real sample rows
		container.createEl('h4', { text: 'Folder structure' });
		const tree = container.createEl('div', { cls: 'crosswalker-vault-tree' });
		this.renderVaultTree(tree, config);

		// Sample note — rendered as a mock Obsidian note, not raw markdown
		container.createEl('h4', { text: 'Sample note' });
		this.renderSampleNoteCard(container, config);

		// Raw markdown for the detail-oriented (collapsed)
		const details = container.createEl('details', { cls: 'crosswalker-raw-preview' });
		details.createEl('summary', { text: 'Exact file contents this will write (for the curious)' });
		details.createEl('pre', { text: this.buildSampleNotePreview(config) });
	}

	/** Cap on how many rows the Step 3 deviation banner runs through render().
	 *  Matches the existing `slice(0, 200)` sampling convention used elsewhere
	 *  in this file (e.g. sampleValuesForColumn) — large sources still get an
	 *  honest, fast preview instead of rendering every row. */
	private static readonly PREVIEW_RENDER_SAMPLE_SIZE = 200;

	/**
	 * Run the same render() the generation engine uses against a sample of the
	 * previewed rows, collecting a fresh RenderReport per row. This is what
	 * lets the Step 3 banner say "matches the recipe pattern" and mean the
	 * same thing generation will actually do — not a separate, hand-rolled
	 * path-guessing heuristic.
	 *
	 * Returns null when there's nothing to preview (no eager row array, e.g.
	 * a streaming source, or zero rows).
	 */
	private computePreviewRenderNotes(config: Partial<ImportRecipe>): { perRow: PreviewRowNotes[]; totalSourceRows: number } | null {
		if (!this.parsedData || !Array.isArray(this.parsedData.rows)) return null;
		const rows = this.parsedData.rows as Record<string, unknown>[];
		if (rows.length === 0) return null;

		let recipe: ReturnType<typeof legacyConfigToRecipe>;
		try {
			recipe = legacyConfigToRecipe(config as ImportRecipe);
		} catch {
			return null;
		}

		const sampleRows = rows.slice(0, ImportFlow.PREVIEW_RENDER_SAMPLE_SIZE);
		const perRow: PreviewRowNotes[] = [];
		sampleRows.forEach((row, i) => {
			const rowNum = i + 1;
			const report: RenderReport = { notes: [] };
			try {
				const address = render(recipe, { curie: `preview:${rowNum}`, scope: row }, report);
				// Same basePath + normalizePath combination generation-engine's
				// buildNoteDataViaRender uses, so the path shown here is the
				// actual vault path the row will land at, not an approximation.
				const path = this.outputPath
					? normalizePath(`${this.outputPath}/${address.primary.path}`)
					: normalizePath(address.primary.path);
				perRow.push({ row: rowNum, notes: report.notes, path });
			} catch {
				// render() fail-fast errors (e.g. an empty filename) surface
				// elsewhere in the wizard/generation flow — skip the row here
				// rather than let one bad row break the whole preview banner.
			}
		});

		return { perRow, totalSourceRows: this.parsedData.rowCount ?? rows.length };
	}

	/** Summary banner + expandable per-row details for render() deviations. */
	private renderDeviationBanner(container: HTMLElement, perRow: PreviewRowNotes[], totalSourceRows: number) {
		if (perRow.length === 0) return;
		const summary = summarizeRenderNotes(perRow, totalSourceRows);

		const banner = container.createEl('div', { cls: `crosswalker-render-banner is-${summary.tone}` });
		setIcon(
			banner.createSpan({ cls: 'crosswalker-wb-ico crosswalker-render-banner-icon' }),
			summary.tone === 'clean' ? 'check-circle-2' : 'alert-triangle',
		);
		banner.createEl('span', { text: summary.message, cls: 'crosswalker-render-banner-text' });

		if (summary.tone === 'warning') {
			const details = container.createEl('details', { cls: 'crosswalker-render-details' });
			details.createEl('summary', {
				text: summary.deviantCount === 1
					? 'Show the row that doesn\'t match'
					: `Show all ${summary.deviantCount} rows that don't match`
			});
			for (const d of summary.details) {
				const row = details.createEl('div', { cls: 'crosswalker-render-note-row' });
				row.createEl('span', { text: `Row ${d.row}`, cls: 'crosswalker-render-note-row-num' });
				row.createEl('span', { text: d.detail, cls: 'crosswalker-render-note-row-detail' });
				row.createEl('span', { text: d.path, cls: 'crosswalker-render-note-row-path' });
			}
			if (summary.moreCount > 0) {
				details.createEl('div', {
					text: `…and ${summary.moreCount} more rows`,
					cls: 'crosswalker-render-note-row crosswalker-muted'
				});
			}
		}
	}

	/** Title-role column name (drives sample filenames), if any. */
	private titleColumn(): string | null {
		for (const [name, cfg] of this.columnConfigs) {
			if (cfg.useAs === 'title') return name;
		}
		return null;
	}

	/** Sample filename for a row — title column value, else first column value. */
	private sampleFilename(row: Record<string, unknown>): string {
		const titleCol = this.titleColumn();
		const v = titleCol ? row[titleCol] : row[this.parsedData?.columns[0] ?? ''];
		const base = String(v ?? 'note').trim() || 'note';
		return `${this.truncate(base, 40)}.md`;
	}

	/** DOM folder tree: 📁 hierarchy folders from real values, 📄 sample notes. */
	private renderVaultTree(tree: HTMLElement, config: Partial<ImportRecipe>) {
		const line = (depth: number, icon: string, text: string, muted = false) => {
			const el = tree.createEl('div', { cls: 'crosswalker-vault-tree-line' + (muted ? ' crosswalker-muted' : '') });
			el.style.paddingLeft = `${depth * 22}px`;
			el.setText(`${icon} ${text}`);
		};
		line(0, '📁', `${this.outputPath || 'output'}/`);

		const sampleRows = this.parsedData && Array.isArray(this.parsedData.rows)
			? (this.parsedData.rows as Record<string, unknown>[]).slice(0, 50)
			: [];
		const hierarchy = (config.mapping?.hierarchy ?? []).slice().sort((a, b) => a.level - b.level);

		if (hierarchy.length === 0) {
			for (const row of sampleRows.slice(0, 4)) line(1, '📄', this.sampleFilename(row));
			if (sampleRows.length > 4) line(1, '⋯', `${(this.parsedData?.rowCount ?? sampleRows.length) - 4} more notes`, true);
			if (sampleRows.length === 0) line(1, '📄', '(no rows)', true);
			return;
		}

		// Group sample rows by their top-level folder value
		const topCol = hierarchy[0].column;
		const groups = new Map<string, Record<string, unknown>[]>();
		for (const row of sampleRows) {
			const seg = String(row[topCol] ?? '').trim();
			if (!seg) continue;
			if (!groups.has(seg)) groups.set(seg, []);
			groups.get(seg)!.push(row);
		}
		let shownFolders = 0;
		for (const [seg, rows] of groups) {
			if (shownFolders >= 4) break;
			shownFolders++;
			line(1, '📁', `${seg}/`);
			// second hierarchy level, if configured
			const subCol = hierarchy[1]?.column;
			if (subCol) {
				const sub = String(rows[0][subCol] ?? '').trim();
				if (sub) {
					line(2, '📁', `${sub}/`);
					for (const row of rows.slice(0, 2)) line(3, '📄', this.sampleFilename(row));
					continue;
				}
			}
			for (const row of rows.slice(0, 2)) line(2, '📄', this.sampleFilename(row));
			if (rows.length > 2) line(2, '⋯', `${rows.length > 49 ? 'many' : rows.length - 2} more`, true);
		}
		if (groups.size > shownFolders) line(1, '⋯', `${groups.size - shownFolders} more folders`, true);
	}

	/** Mock Obsidian note: filename header + properties block + body snippet. */
	private renderSampleNoteCard(container: HTMLElement, config: Partial<ImportRecipe>) {
		const card = container.createEl('div', { cls: 'crosswalker-note-card' });
		const rows = this.parsedData && Array.isArray(this.parsedData.rows)
			? (this.parsedData.rows as Record<string, unknown>[])
			: [];
		const row = rows[0];
		if (!row) {
			card.createEl('p', { text: 'No rows to preview.', cls: 'setting-item-description' });
			return;
		}

		card.createEl('div', { text: `📄 ${this.sampleFilename(row)}`, cls: 'crosswalker-note-card-title' });

		const fmMappings = config.mapping?.frontmatter ?? [];
		if (fmMappings.length > 0) {
			const props = card.createEl('div', { cls: 'crosswalker-note-card-props' });
			props.createEl('div', { text: 'Properties', cls: 'crosswalker-note-card-props-label' });
			for (const fm of fmMappings.slice(0, 8)) {
				const pr = props.createEl('div', { cls: 'crosswalker-note-card-prop' });
				pr.createEl('span', { text: fm.key, cls: 'crosswalker-prop-key' });
				pr.createEl('span', { text: this.truncate(String(row[fm.column] ?? ''), 60), cls: 'crosswalker-prop-value' });
			}
			if (fmMappings.length > 8) {
				props.createEl('div', { text: `⋯ ${fmMappings.length - 8} more properties`, cls: 'crosswalker-note-card-prop crosswalker-muted' });
			}
		}

		const bodyMappings = config.mapping?.body ?? [];
		if (bodyMappings.length > 0) {
			const body = card.createEl('div', { cls: 'crosswalker-note-card-body' });
			body.createEl('div', { text: 'Note body', cls: 'crosswalker-note-card-props-label' });
			for (const b of bodyMappings.slice(0, 2)) {
				body.createEl('p', { text: this.truncate(String(row[b.column] ?? ''), 220) });
			}
		} else {
			card.createEl('div', { text: 'No body content mapped — notes will be properties-only.', cls: 'setting-item-description crosswalker-note-card-body' });
		}
	}

	/**
	 * Build a folder tree preview string from configuration
	 */
	buildFolderTreePreview(config: Partial<ImportRecipe>): string {
		if (!this.parsedData || !config.mapping) {
			return `${this.outputPath}/\n└── (No hierarchy configured)`;
		}

		const hierarchyColumns: HierarchyMapping[] = config.mapping.hierarchy || [];
		if (hierarchyColumns.length === 0) {
			return `${this.outputPath}/\n└── (Flat structure - all notes in root folder)`;
		}

		// Collect unique paths from data (limit to first 50 rows for performance).
		// Wizard preview only runs against eager-array ParsedData; streaming
		// imports skip this (preview is rendered from a separately-loaded sample).
		const paths = new Map<string, Set<string>>();
		const sampleRows = Array.isArray(this.parsedData.rows)
			? this.parsedData.rows.slice(0, 50)
			: [];

		for (const row of sampleRows) {
			let currentPath = '';
			for (const h of hierarchyColumns.sort((a: HierarchyMapping, b: HierarchyMapping) => a.level - b.level)) {
				const value = row[h.column];
				if (value) {
					const segment = String(value).trim();
					if (!paths.has(currentPath)) {
						paths.set(currentPath, new Set());
					}
					paths.get(currentPath)!.add(segment);
					currentPath = currentPath ? `${currentPath}/${segment}` : segment;
				}
			}
		}

		// Build tree string
		const lines: string[] = [`${this.outputPath}/`];

		// Get root level items
		const rootItems = paths.get('') || new Set();
		const rootArray = Array.from(rootItems).slice(0, 5);

		rootArray.forEach((item, i) => {
			const isLast = i === rootArray.length - 1;
			const prefix = isLast ? '└── ' : '├── ';
			lines.push(`${prefix}${item}/`);

			// Get children of this item
			const children = paths.get(item) || new Set();
			const childArray = Array.from(children).slice(0, 3);

			childArray.forEach((child, j) => {
				const childIsLast = j === childArray.length - 1;
				const childPrefix = isLast ? '    ' : '│   ';
				const connector = childIsLast ? '└── ' : '├── ';
				lines.push(`${childPrefix}${connector}${child}/`);
			});

			if (children.size > 3) {
				const childPrefix = isLast ? '    ' : '│   ';
				lines.push(`${childPrefix}    ... and ${children.size - 3} more`);
			}
		});

		if (rootItems.size > 5) {
			lines.push(`... and ${rootItems.size - 5} more folders`);
		}

		return lines.join('\n');
	}

	/**
	 * Build a sample note preview from the first row.
	 * Only runs against eager-array ParsedData (wizard preview path); streaming
	 * imports use a separately-loaded sample.
	 */
	buildSampleNotePreview(config: Partial<ImportRecipe>): string {
		if (!this.parsedData || !Array.isArray(this.parsedData.rows) || this.parsedData.rows.length === 0) {
			return '(No data to preview)';
		}

		const row = this.parsedData.rows[0];
		const lines: string[] = ['---'];

		// Add frontmatter properties
		if (config.mapping?.frontmatter) {
			for (const fm of config.mapping.frontmatter) {
				const value = row[fm.column];
				if (value !== undefined && value !== null && value !== '') {
					if (typeof value === 'string' && (value.includes(':') || value.includes('"'))) {
						lines.push(`${fm.key}: "${value.replace(/"/g, '\\"')}"`);
					} else {
						lines.push(`${fm.key}: ${value}`);
					}
				}
			}
		}

		// Add link properties
		if (config.mapping?.links) {
			for (const link of config.mapping.links) {
				const value = row[link.column];
				if (value && (link.location === 'frontmatter' || link.location === 'both')) {
					const key = link.frontmatterKey || link.column;
					lines.push(`${key}: "[[${value}]]"`);
				}
			}
		}

		// Add _crosswalker metadata preview
		lines.push('_crosswalker:');
		lines.push('  sourceId: "example-id"');
		lines.push('  schemaVersion: 1');
		lines.push(`  importedAt: "${new Date().toISOString().split('T')[0]}..."`);
		lines.push('  importedProperties:');
		const propCount = (config.mapping?.frontmatter?.length || 0) + (config.mapping?.links?.length || 0);
		lines.push(`    - ... (${propCount} properties)`);

		lines.push('---');
		lines.push('');

		// Add body content
		if (config.mapping?.body) {
			for (const body of config.mapping.body) {
				const value = row[body.column];
				if (value) {
					if (body.heading) {
						lines.push(`## ${body.heading}`);
						lines.push('');
					}
					const preview = String(value).length > 100
						? String(value).substring(0, 100) + '...'
						: String(value);
					lines.push(preview);
					lines.push('');
				}
			}
		}

		// Add link sections in body
		if (config.mapping?.links) {
			for (const link of config.mapping.links) {
				const value = row[link.column];
				if (value && (link.location === 'body' || link.location === 'both')) {
					const section = link.bodySection || 'Related';
					lines.push(`## ${section}`);
					lines.push('');
					lines.push(`- [[${value}]]`);
					lines.push('');
				}
			}
		}

		return lines.join('\n');
	}

	// =========================================================================
	// Step 4: Generate
	// =========================================================================

	renderStep4_Generate(container: HTMLElement) {
		container.createEl('h3', { text: 'Generate notes' });

		// Show generation progress if generating — a centered card that fills the
		// step instead of a tiny bar floating at the top.
		if (this.isGenerating) {
			const wrap = container.createEl('div', { cls: 'crosswalker-gen-wrap' });
			const card = wrap.createEl('div', { cls: 'crosswalker-gen-card' });
			card.createEl('div', { cls: 'crosswalker-gen-spinner' });
			card.createEl('div', { text: 'Generating notes', cls: 'crosswalker-gen-title' });

			const prog = this.generationProgress;
			const pctNum = prog && prog.total > 0 ? Math.round((prog.current / prog.total) * 100) : 0;
			const pct = card.createEl('div', { text: `${pctNum}%`, cls: 'crosswalker-gen-pct' });
			const bar = card.createEl('div', { cls: 'crosswalker-gen-bar' });
			const fill = bar.createEl('div', { cls: 'crosswalker-gen-bar-fill' });
			fill.style.width = `${pctNum}%`;
			const count = card.createEl('div', {
				text: prog ? `${prog.current.toLocaleString()} / ${prog.total.toLocaleString()} notes` : 'Starting…',
				cls: 'crosswalker-gen-count setting-item-description'
			});

			// Hand these to onProgress so it can update without a full re-render.
			this.progressEls = { pct, fill, count };
			return;
		}

		container.createEl('p', {
			text: 'Ready to generate notes. This will create folders and files in your vault.',
			cls: 'setting-item-description'
		});

		// Destination. In workbench mode it's chosen on the review screen (step 3),
		// so step 4 just confirms it read-only. Classic mode keeps its editor here.
		if (this.isWorkbenchMode()) {
			const confirm = container.createEl('div', { cls: 'crosswalker-gen-confirm' });
			confirm.createEl('span', { cls: 'crosswalker-gen-confirm-lead', text: 'Creating in: ' });
			confirm.createEl('span', { cls: 'mono', text: this.outputPath || this.plugin.settings.defaultOutputPath || '(vault root)' });
		} else {
			// Output path setting
			new Setting(container)
				.setName('Output path')
				.setDesc('Folder where notes will be created')
				.addText(text => text
					.setPlaceholder('Ontologies')
					.setValue(this.outputPath)
					.onChange(value => {
						this.outputPath = value;
						this.scheduleDraftSave();
					}));
		}

		// Framework ID setting (for _crosswalker metadata)
		new Setting(container)
			.setName('Framework identifier')
			.setDesc('Optional ID for this framework (used in metadata for cross-framework features)')
			.addText(text => text
				// eslint-disable-next-line obsidianmd/ui/sentence-case
				.setPlaceholder('e.g., nist-csf-2.0')
				.setValue(this.frameworkId)
				.onChange(value => {
					this.frameworkId = value;
					this.scheduleDraftSave();
				}));

		// Overwrite behavior
		new Setting(container)
			.setName('If files exist')
			.addDropdown(dropdown => dropdown
				.addOption('skip', 'Skip existing (safe)')
				.addOption('replace', 'Replace existing')
				.addOption('error', 'Stop on conflict')
				.setValue(this.overwriteMode)
				.onChange(value => {
					this.overwriteMode = value as 'skip' | 'replace' | 'error';
					this.scheduleDraftSave();
				}));

		// Summary with actual estimates (classic mode — workbench shows the recap instead).
		if (this.parsedData && !this.isWorkbenchMode()) {
			const config = buildConfigFromWizardState(
				this.columnConfigs,
				this.parsedData.columns,
				this.appliedConfig?.config?.mapping?.filename
			);
			const estimate = estimateOutput(this.parsedData, config);

			container.createEl('div', { cls: 'crosswalker-generate-summary' }, (div) => {
				div.createEl('p', { text: 'Will create:' });
				div.createEl('ul', {}, (ul) => {
					ul.createEl('li', { text: `~${estimate.folderCount} folders` });
					ul.createEl('li', { text: `~${estimate.noteCount} notes` });
					ul.createEl('li', { text: `~${estimate.linkCount} crosswalk links` });
				});
			});

			// Warning for large imports
			if (estimate.noteCount > 500) {
				container.createEl('p', {
					text: `⚠️ Large import detected (${estimate.noteCount} notes). This may take a minute or two.`,
					cls: 'crosswalker-warning'
				});
			}
		}
	}

	// =========================================================================
	// Footer Navigation
	// =========================================================================

	renderFooter(container: HTMLElement) {
		const footer = container.createEl('div', { cls: 'crosswalker-wizard-footer' });
		// Back lives in the sticky top nav; the footer keeps a mirrored primary CTA
		// so it's reachable after scrolling long content too (spec §7h #1).
		footer.createEl('div', { cls: 'crosswalker-footer-spacer' });
		this.createPrimaryButton(footer);
	}

	/**
	 * Build the step's primary action button (Next on steps 1–3, Generate on the
	 * last step) with its handler. Rendered in both the sticky top nav bar and the
	 * footer, so navigation is always visible whatever the content height.
	 */
	private createPrimaryButton(container: HTMLElement): void {
		if (this.currentStep < this.totalSteps) {
			const nextBtn = container.createEl('button', {
				text: this.isParsing ? 'Parsing...' : 'Next →',
				cls: 'mod-cta'
			});
			nextBtn.disabled = this.isParsing;
			nextBtn.addEventListener('click', async () => {
				if (await this.validateCurrentStep()) {
					this.currentStep++;
					await this.saveDraftNow();
					this.renderStep();
				}
			});
		} else {
			const generateBtn = container.createEl('button', {
				text: this.isGenerating ? 'Generating…' : 'Generate',
				cls: 'mod-cta'
			});
			generateBtn.disabled = this.isGenerating;
			if (!this.isGenerating) {
				generateBtn.addEventListener('click', () => {
					this.generate();
				});
			}
		}
	}

	/** "1 record" / "12 records" — pluralize the count label honestly. */
	private recordsLabel(n: number): string {
		return `${n.toLocaleString()} record${n === 1 ? '' : 's'}`;
	}

	/** Show what a record in this list ACTUALLY looks like — a concrete example
	 *  ("element_type: subcategory · element_identifier: GV.OC-01 · …"), which
	 *  communicates the content far better than a JSON path. Falls back to bare
	 *  field-name chips only when every sampled field is empty. */
	private renderSamplePreview(
		parent: HTMLElement,
		sample: Array<{ key: string; value: string }>,
		sampleKeys: string[],
		fieldCount: number,
	) {
		if (sample.length > 0) {
			const wrap = parent.createEl('div', { cls: 'crosswalker-json-sample' });
			// eslint-disable-next-line obsidianmd/ui/sentence-case -- "e.g." abbreviation
			wrap.createEl('span', { text: 'e.g. ', cls: 'crosswalker-json-sample-lead' });
			sample.forEach((f, i) => {
				if (i > 0) wrap.createEl('span', { text: ' · ', cls: 'crosswalker-json-sample-sep' });
				wrap.createEl('span', { text: `${f.key}: `, cls: 'crosswalker-json-sample-key' });
				wrap.createEl('span', { text: f.value, cls: 'crosswalker-json-sample-val' });
			});
			const more = fieldCount - sample.length;
			if (more > 0) wrap.createEl('span', { text: ` · +${more} more fields`, cls: 'crosswalker-json-sample-more' });
			return;
		}
		// All sampled fields were empty — show the field names so it's not blank.
		if (sampleKeys.length === 0) return;
		const chips = parent.createEl('div', { cls: 'crosswalker-chips' });
		for (const k of sampleKeys.slice(0, 5)) chips.createEl('span', { text: k, cls: 'crosswalker-chip' });
		const remaining = fieldCount - Math.min(5, sampleKeys.length);
		if (remaining > 0) chips.createEl('span', { text: `+${remaining} more`, cls: 'crosswalker-chip crosswalker-chip-muted' });
	}

	/** Tiny, de-emphasized "where this lives in the file" line — the raw JSON
	 *  path, available but not in the user's face (it confused GRC testers). */
	private renderPathHint(parent: HTMLElement, label: string) {
		parent.createEl('div', { text: `found in the file at: ${label}`, cls: 'crosswalker-json-pathhint' });
	}

	/**
	 * JSON Step-1 surface: a plain-language record picker so a GRC (or any-domain)
	 * user never has to know `$.objects[*]` syntax. Shows the lists Crosswalker
	 * found inside the file as selectable cards (radio + record count + field
	 * chips), a full-width "keep only matching" filter, and the raw path syntax
	 * tucked under Advanced as the escape hatch.
	 */
	private renderJsonRecordPicker(container: HTMLElement) {
		const st = this.jsonStructure;

		if (st?.parseError) {
			const warn = container.createEl('div', { cls: 'crosswalker-json-warning' });
			// eslint-disable-next-line obsidianmd/ui/sentence-case -- "JSON" is a proper-noun acronym
			warn.createEl('div', { text: "⚠️ This file isn't valid JSON", cls: 'crosswalker-json-warning-title' });
			warn.createEl('div', { text: st.parseError, cls: 'setting-item-description' });
		} else if (st && st.rootIsArray) {
			const c = st.candidates[0];
			const card = container.createEl('div', { cls: 'crosswalker-json-pick crosswalker-json-pick-selected' });
			const head = card.createEl('div', { cls: 'crosswalker-json-pick-head' });
			head.createEl('span', { text: '●', cls: 'crosswalker-json-radio' });
			const body = head.createEl('div', { cls: 'crosswalker-json-pick-body' });
			const titleLine = body.createEl('div', { cls: 'crosswalker-json-pick-title' });
			titleLine.createEl('span', { text: 'This whole file is your list of records', cls: 'crosswalker-json-pick-label' });
			titleLine.createEl('span', { text: this.recordsLabel(st.rootCount), cls: 'crosswalker-json-count' });
			if (c) this.renderSamplePreview(body, c.sample, c.sampleKeys, c.fieldCount);
		} else if (st && st.candidates.length > 0) {
			const intro = container.createEl('div', { cls: 'crosswalker-json-intro' });
			intro.createEl('div', { text: 'Where are your records?', cls: 'crosswalker-json-intro-title' });
			intro.createEl('div', {
				text: 'This file nests its records inside it. Pick the list to import — each item in it becomes one note.',
				cls: 'setting-item-description'
			});
			const pickList = container.createEl('div', { cls: 'crosswalker-json-picklist' });
			const renderPicks = () => {
				pickList.empty();
				for (const c of st.candidates.slice(0, 6)) {
					const selected = this.jsonIterator === c.iterator;
					const card = pickList.createEl('div', {
						cls: 'crosswalker-json-pick' + (selected ? ' crosswalker-json-pick-selected' : '')
					});
					const head = card.createEl('div', { cls: 'crosswalker-json-pick-head' });
					head.createEl('span', { text: selected ? '●' : '○', cls: 'crosswalker-json-radio' });
					const body = head.createEl('div', { cls: 'crosswalker-json-pick-body' });
					const titleLine = body.createEl('div', { cls: 'crosswalker-json-pick-title' });
					titleLine.createEl('span', { text: c.name, cls: 'crosswalker-json-pick-label' });
					titleLine.createEl('span', { text: this.recordsLabel(c.count), cls: 'crosswalker-json-count' });
					this.renderSamplePreview(body, c.sample, c.sampleKeys, c.fieldCount);
					if (c.label !== c.name) this.renderPathHint(body, c.label);
					card.addEventListener('click', () => {
						this.jsonIterator = c.iterator;
						renderPicks();
					});
				}
			};
			renderPicks();
		} else if (st) {
			const warn = container.createEl('div', { cls: 'crosswalker-json-warning' });
			warn.createEl('div', { text: 'No record lists found in this file', cls: 'crosswalker-json-warning-title' });
			warn.createEl('div', {
				text: 'Use the advanced path below if your records live somewhere unusual.',
				cls: 'setting-item-description'
			});
		}

		// Full-width filter — much clearer than the far-right Setting control.
		const filterBlock = container.createEl('div', { cls: 'crosswalker-field-block' });
		filterBlock.createEl('label', { text: 'Keep only matching records (optional)', cls: 'crosswalker-field-label' });
		filterBlock.createEl('div', {
			text: 'Narrow to just the records you want. Write field=value to keep matches, or field!=value to drop them; combine several rules with commas.',
			cls: 'setting-item-description'
		});
		const filterInput = filterBlock.createEl('input', { type: 'text', cls: 'crosswalker-field-input' });
		// eslint-disable-next-line obsidianmd/ui/sentence-case -- literal filter example
		filterInput.placeholder = 'e.g. status=active';
		filterInput.value = this.jsonWhere;
		filterInput.addEventListener('input', () => { this.jsonWhere = filterInput.value.trim(); });

		// Escape hatch — manual path syntax (same as recipes + the command line).
		const adv = container.createEl('details', { cls: 'crosswalker-advanced' });
		adv.createEl('summary', { text: 'Advanced — type the record path yourself' });
		const advBlock = adv.createEl('div', { cls: 'crosswalker-field-block' });
		advBlock.createEl('div', {
			text: 'The same path syntax recipes and the command line use. Leave empty when the file itself is the list.',
			cls: 'setting-item-description'
		});
		const pathInput = advBlock.createEl('input', { type: 'text', cls: 'crosswalker-field-input' });
		pathInput.placeholder = '$.objects[*]';
		pathInput.value = this.jsonIterator;
		pathInput.addEventListener('input', () => { this.jsonIterator = pathInput.value.trim(); });
	}

	/**
	 * Guided defaults — conservative, visible, overridable. On a fresh parse
	 * (no saved config matched) suggest obvious roles so a first import
	 * "unfolds" instead of demanding per-column decisions:
	 *   - a `title`/`name` column (or unique `id`-ish column) → Note title
	 *   - one low-cardinality `family`/`category`/`group`/`domain`/`function`
	 *     column → Hierarchy level (folders)
	 *   - a long-text `description`/`statement`/`text` column → Body content
	 * Suggested columns get a ✨ badge in Step 2; everything stays editable.
	 * A matched saved config always supersedes these.
	 */
	/** Sample values for a column from the parsed rows (eager array only; used
	 *  for delimiter detection in the folder-tree role). Streaming sources return
	 *  the column's pre-computed sampleValues instead. */
	private sampleValuesForColumn(name: string): string[] {
		if (this.parsedData && Array.isArray(this.parsedData.rows)) {
			return (this.parsedData.rows as Record<string, unknown>[])
				.slice(0, 200)
				.map((r) => String(r[name] ?? ''));
		}
		return (this.columnInfos.find((c) => c.name === name)?.sampleValues ?? []).map((v) => String(v ?? ''));
	}

	applySmartDefaults() {
		if (this.smartDefaultsApplied || this.appliedConfig || this.columnInfos.length === 0) return;
		this.smartDefaultsApplied = true;
		const rowCount = this.parsedData?.rowCount ?? 0;
		const lower = (n: string) => n.toLowerCase().replace(/[^a-z0-9]+/g, '_');
		const set = (name: string, useAs: string) => {
			this.columnConfigs.set(name, { useAs, outputKey: this.normalizeKey(name) });
			this.suggestedColumns.add(name);
		};

		// Note title: prefer an explicit title/name column — but only when it
		// actually carries distinct values (CPRT's subcategory rows have a `title`
		// column that is 100% EMPTY; suggesting it produced 0-note generations).
		// Fall back to a unique id-ish column.
		const usableAsTitle = (c: ColumnInfo) => c.uniqueCount >= Math.max(2, rowCount * 0.5);
		const titleCol =
			this.columnInfos.find((c) => ['title', 'name', 'control_name'].includes(lower(c.name)) && usableAsTitle(c)) ??
			this.columnInfos.find((c) => /(^|_)id(entifier)?$/.test(lower(c.name)) && c.uniqueCount >= rowCount * 0.9);
		if (titleCol) {
			// If the title/id column is a structured taxonomy id (DE.AE-02), the
			// magic move is to PARSE it into a folder tree instead of dumping flat.
			const folderTemplates = deriveIdSplitTemplates(titleCol.name, this.sampleValuesForColumn(titleCol.name));
			if (folderTemplates.length > 0) {
				this.columnConfigs.set(titleCol.name, { useAs: 'folder-tree', outputKey: this.normalizeKey(titleCol.name), folderTemplates });
				this.suggestedColumns.add(titleCol.name);
			} else {
				set(titleCol.name, 'title');
			}
		}

		// One hierarchy level: an obviously-grouping column with low cardinality.
		const hierCol = this.columnInfos
			.filter((c) => c !== titleCol)
			.filter((c) => /(family|category|group|domain|function|class)/.test(lower(c.name)))
			.filter((c) => c.uniqueCount > 1 && c.uniqueCount <= Math.max(20, rowCount * 0.1))
			.sort((a, b) => a.uniqueCount - b.uniqueCount)[0];
		if (hierCol) set(hierCol.name, 'hierarchy');

		// Body: a long-text description column.
		const bodyCol = this.columnInfos
			.filter((c) => c !== titleCol && c !== hierCol)
			.find((c) => /(description|statement|text|guidance)/.test(lower(c.name)));
		if (bodyCol) set(bodyCol.name, 'body');

		if (this.suggestedColumns.size > 0) {
			this.plugin.debug.info('wizard', 'smart-defaults', `Suggested roles for ${this.suggestedColumns.size} column(s)`, {
				suggestions: Array.from(this.suggestedColumns).map((n) => ({ column: n, useAs: this.columnConfigs.get(n)?.useAs }))
			});
		}
	}

	async validateCurrentStep(): Promise<boolean> {
		switch (this.currentStep) {
			case 1:
				if (!this.sourceFile) {
					new Notice('Please select a file first.');
					return false;
				}
				// Parse file before moving to step 2
				if (!this.parsedData) {
					const parseSuccess = await this.parseSourceFile();
					if (parseSuccess) {
						// Recognized-source fast path (spec §7m): a confident vetted-recipe
						// match holds on Step 1 to present the trust card as the lead.
						if (!this.recognizedDismissed) {
							this.computeRecognizedMatch();
							if (this.recognizedMatch) {
								// Auto-apply gate (settings § Suggestions, "Skip the recognized
								// source card on exact matches"): a 100% match skips the card
								// and lands straight on the review screen with the built-in
								// configuration applied. Review stays mandatory either way —
								// this never jumps straight to generate. Anything below 100
								// always shows the card, regardless of this setting.
								if (shouldAutoApplyRecognizedMatch(this.plugin.settings.autoApplyExactMatch, this.recognizedMatch.score)) {
									this.plugin.debug.info('wizard', 'recognized-auto-applied', `Auto-applied "${this.recognizedMatch.entry.id}" (100% match, card skipped)`, {
										recipeId: this.recognizedMatch.entry.id,
									});
									this.startRecognizedRecipe(3);
									return false;
								}
								this.renderStep();
								return false;
							}
						}
						// After successful parse, check for matching configs
						// If we have matches and suggestions are enabled, stay on Step 1 to show them
						if (this.plugin.settings.enableConfigSuggestions && !this.appliedConfig) {
							this.findMatchingConfigsForFile();
							if (this.configMatches.length > 0) {
								// Re-render to show config suggestions, don't advance yet
								this.renderStep();
								return false;
							}
						}
					}
					return parseSuccess;
				}
				return true;
			default:
				return true;
		}
	}

	async parseSourceFile(): Promise<boolean> {
		if (!this.sourceFile) return false;

		// Phase 3.5c: thread a trace_id through the parse flow so CSV-parser
		// events correlate with the wizard's parse-start/complete events.
		const traceId = this.plugin.debug.newTraceId();
		return this.plugin.debug.withTrace(traceId, () => this.doParseSourceFile());
	}

	private async doParseSourceFile(): Promise<boolean> {
		if (!this.sourceFile) return false;

		this.isParsing = true;
		this.parseError = null;
		this.renderStep(); // Show loading state

		this.plugin.debug.info('wizard', 'parse-start', `Starting file parse: ${this.sourceFile.name}`, {
			fileName: this.sourceFile.name,
			fileSize: this.sourceFile.size,
			fileType: this.sourceType
		});

		try {
			if (this.sourceType === 'csv') {
				const useStreaming = shouldUseStreaming(this.sourceFile);
				this.plugin.debug.info('csv-parser', 'config', `CSV parser config (streaming=${useStreaming})`, { useStreaming });

				if (useStreaming) {
					new Notice(`Large file detected (${(this.sourceFile.size / 1024 / 1024).toFixed(1)}MB). Using streaming parser...`);
				}

				this.parsedData = await parseCSVFile(this.sourceFile, {
					streaming: useStreaming,
					onProgress: (progress) => {
						this.parseProgress = progress;
						// Update progress display periodically
						if (progress.percentComplete !== undefined && progress.percentComplete % 10 === 0) {
							this.renderStep();
						}
					}
				});

				// Analyze columns for type detection
				this.columnInfos = analyzeColumns(this.parsedData);

				this.plugin.debug.info('csv-parser', 'parse-complete', `CSV parsed: ${this.parsedData.rowCount} rows × ${this.parsedData.columns.length} columns`, {
					rowCount: this.parsedData.rowCount,
					columnCount: this.parsedData.columns.length,
					columns: this.parsedData.columns
				});

				new Notice(`Parsed ${this.parsedData.rowCount} rows with ${this.parsedData.columns.length} columns.`);
			} else if (this.sourceType === 'xlsx') {
				this.parsedData = await parseXLSXFile(this.sourceFile, {
					sheet: this.selectedSheet ?? 0,
					headerRow: this.xlsxHeaderRow,
				});
				this.columnInfos = analyzeColumns(this.parsedData);

				this.plugin.debug.info('xlsx-parser', 'parse-complete', `XLSX parsed: ${this.parsedData.rowCount} rows × ${this.parsedData.columns.length} columns (sheet "${this.parsedData.sheetName}")`, {
					rowCount: this.parsedData.rowCount,
					columnCount: this.parsedData.columns.length,
					sheetName: this.parsedData.sheetName,
					headerRow: this.xlsxHeaderRow
				});

				new Notice(`Parsed ${this.parsedData.rowCount} rows with ${this.parsedData.columns.length} columns from sheet "${this.parsedData.sheetName}".`);
			} else if (this.sourceType === 'json') {
				const jsonResult = await parseJSONFile(this.sourceFile, {
					iterator: this.jsonIterator,
					where: this.jsonWhere,
				});
				this.parsedData = jsonResult;
				this.columnInfos = analyzeColumns(this.parsedData);

				this.plugin.debug.info('json-parser', 'parse-complete', `JSON parsed: ${jsonResult.rowCount} rows × ${jsonResult.columns.length} columns`, {
					rowCount: jsonResult.rowCount,
					columnCount: jsonResult.columns.length,
					iterator: this.jsonIterator,
					where: this.jsonWhere,
					filteredOut: jsonResult.filteredOut,
					skippedNonObjects: jsonResult.skippedNonObjects
				});

				const filtered = jsonResult.filteredOut > 0 ? ` (${jsonResult.filteredOut} filtered out)` : '';
				new Notice(`Parsed ${jsonResult.rowCount} rows with ${jsonResult.columns.length} columns${filtered}.`);
			}

			this.applySmartDefaults();
			this.isParsing = false;
			return true;
		} catch (error) {
			this.parseError = error instanceof Error ? error.message : String(error);
			this.isParsing = false;

			this.plugin.debug.error('csv-parser', 'parse-error', 'Parse error', {
				error: this.parseError,
				stack: error instanceof Error ? error.stack : undefined
			});

			new Notice(`Parse error: ${this.parseError}`);
			this.renderStep();
			return false;
		}
	}

	async generate() {
		if (!this.parsedData) {
			new Notice('No data to generate. Please go back and select a file.');
			return;
		}

		// Phase 3.5c: thread a fresh trace_id through the entire generation
		// flow. Every wizard / generation / Tier 2 / view event that fires
		// during this operation will carry the same trace_id, making the full
		// causal chain correlatable via `jq 'select(.trace_id == "<id>")'`.
		const traceId = this.plugin.debug.newTraceId();
		await this.plugin.debug.withTrace(traceId, () => this.doGenerate());
	}

	private async doGenerate(): Promise<void> {
		if (!this.parsedData) return;

		// Build config from wizard state (preserves applied saved-config filename
		// template when no column is explicitly marked as 'title'). In workbench
		// mode the config only carries the legacy body mappings + a filename stem;
		// path + frontmatter come from the workbench recipe (recipeOverride).
		const workbenchMode = this.isWorkbenchMode() && !!this.workbench;
		const config = workbenchMode
			? this.buildWorkbenchConfig()
			: buildConfigFromWizardState(
				this.columnConfigs,
				this.parsedData.columns,
				this.appliedConfig?.config?.mapping?.filename
			);

		// Prepare generation options
		const options: GenerationOptions = {
			basePath: this.outputPath || this.plugin.settings.defaultOutputPath,
			overwriteMode: this.overwriteMode,
			createFolders: true,
			frameworkId: this.frameworkId || undefined,
			configId: this.appliedConfig?.id,
			sourceFileName: this.sourceFile?.name,
			...(workbenchMode && this.workbench
				? {
					recipeOverride: this.workbench.buildRecipe(),
					// Mapping-driven facet memberships so Pass 1.5 enrichment materializes
					// facet hub notes with ORIGINAL-case names ("Access Control", not the
					// tagsafe "access-control"). Reads straight off the workbench mapping —
					// the same source the tag templates come from (spec §7k / facets.ts).
					facetsForRow: (row: Record<string, unknown>) =>
						deriveFacetMemberships(this.workbench!.getMapping(), row),
				}
				: {}),
			onProgress: (current, total, message) => {
				this.generationProgress = { current, total, message };
				// Update the progress card in place (no full re-render) when its
				// DOM exists; otherwise fall back to a render.
				if (this.progressEls) {
					const pct = total > 0 ? Math.round((current / total) * 100) : 0;
					this.progressEls.pct.setText(`${pct}%`);
					this.progressEls.fill.style.width = `${pct}%`;
					this.progressEls.count.setText(`${current.toLocaleString()} / ${total.toLocaleString()} notes`);
				} else if (current % 50 === 0 || current === total) {
					this.renderStep();
				}
			}
		};

		this.plugin.debug.info('wizard', 'generate-start', `Starting wizard generation (${this.parsedData.rowCount} rows)`, {
			basePath: options.basePath,
			overwriteMode: options.overwriteMode,
			frameworkId: options.frameworkId,
			rowCount: this.parsedData.rowCount
		});

		// Set generating state and show progress UI
		this.isGenerating = true;
		this.generationProgress = { current: 0, total: this.parsedData.rowCount, message: 'Starting...' };
		this.renderStep();

		try {
			// Run generation
			const result = await generateNotes(
				this.app,
				this.parsedData,
				config,
				options,
				this.plugin.debug
			);

			this.isGenerating = false;
			this.progressEls = null;

			this.plugin.debug.info('wizard', 'generate-complete', `Wizard generation complete (${result.created.length} created)`, {
				success: result.success,
				created: result.created.length,
				skipped: result.skipped.length,
				errors: result.errors.length,
				duration: result.duration
			});

			// Show results
			if (result.success) {
				const message = `✅ Created ${result.created.length} notes` +
					(result.skipped.length > 0 ? `, skipped ${result.skipped.length} existing` : '') +
					` in ${(result.duration / 1000).toFixed(1)}s`;
				new Notice(message, 5000);

				// "Success" with nothing created (or row-level errors) is a trap the
				// user can't see — surface the first cause instead of a silent zero.
				if (result.errors.length > 0) {
					const first = result.errors[0];
					new Notice(`⚠️ ${result.errors.length} row(s) failed — first error: ${typeof first === 'string' ? first : (first as { message?: string }).message ?? JSON.stringify(first)}`, 10000);
				}
				if (result.created.length === 0 && result.skipped.length === 0 && result.errors.length === 0) {
					// eslint-disable-next-line obsidianmd/ui/sentence-case -- "Note title" and "In the vault" quote literal UI labels
					new Notice('⚠️ Nothing was generated — check that the Note title column actually has values (Step 2 "In the vault" preview shows the filename each row would get).', 10000);
				}

				// Ask to save config if enabled and not using existing config
				if (this.plugin.settings.promptToSaveConfig && !this.appliedConfig) {
					this.plugin.debug.trace('wizard', 'config-save-prompt-deferred', 'Consider saving config for future use');
				}

				// Delete the in-progress draft — generation succeeded, user is
				// done with this wizard instance. Set the flag first so onClose
				// doesn't re-save it after delete.
				this.skipDraftDeleteOnClose = true;
				if (this.draftId) {
					try {
						await this.plugin.draftStore.delete(this.draftId);
					} catch (err) {
						this.plugin.debug.warn('drafts', 'delete-after-success-failed', 'Could not delete draft after successful generation', {
							draftId: this.draftId,
							error: err instanceof Error ? err.message : String(err),
						});
					}
					this.draftId = null;
				}

				// The workspace-view home screen (spec §7n) reads _crosswalker
				// producer frontmatter straight off Obsidian's metadataCache to
				// decide which folders are "installed frameworks" (2026-07-11
				// home-screen polish). That cache resolves asynchronously after
				// `vault.create()`, so calling host.close() immediately can render
				// the home screen BEFORE the just-generated notes are indexed —
				// the fresh import would silently vanish from its own list. Give
				// the resolve queue a bounded moment to drain when something was
				// actually created.
				if (result.created.length > 0) await this.waitForMetadataResolve();

				// Reached "done" — host decides what that means (close the
				// modal, or reset the workspace view to its launchpad).
				this.host.close();
			} else {
				// Show error summary
				const errorSummary = result.errors.slice(0, 3)
					.map(e => `Row ${e.row}: ${e.message}`)
					.join('\n');
				new Notice(`⚠️ Generation completed with errors:\n${errorSummary}`, 10000);

				// Render results in modal
				this.renderGenerationResults(result);
			}

		} catch (error) {
			this.isGenerating = false;
			const errorMessage = error instanceof Error ? error.message : String(error);

			this.plugin.debug.error('wizard', 'generate-error', 'Wizard generation error', { error: errorMessage });
			new Notice(`❌ Generation failed: ${errorMessage}`, 10000);

			this.renderStep();
		}
	}

	/**
	 * Render generation results (errors/warnings) in the modal
	 */
	renderGenerationResults(result: { success: boolean; created: string[]; skipped: string[]; errors: { row: number; message: string }[] }) {
		const contentEl = this.host.containerEl;
		contentEl.empty();

		contentEl.createEl('h2', { text: 'Generation results' });

		// Summary
		const summary = contentEl.createEl('div', { cls: 'crosswalker-results-summary' });
		summary.createEl('p', { text: `✅ Created: ${result.created.length} notes` });
		if (result.skipped.length > 0) {
			summary.createEl('p', { text: `⏭️ Skipped: ${result.skipped.length} existing notes` });
		}
		if (result.errors.length > 0) {
			summary.createEl('p', { text: `❌ Errors: ${result.errors.length}` });
		}

		// Error details
		if (result.errors.length > 0) {
			contentEl.createEl('h4', { text: 'Errors' });
			const errorList = contentEl.createEl('div', { cls: 'crosswalker-error-list' });

			for (const error of result.errors.slice(0, 20)) {
				errorList.createEl('p', {
					text: `Row ${error.row}: ${error.message}`,
					cls: 'crosswalker-error-item'
				});
			}

			if (result.errors.length > 20) {
				errorList.createEl('p', {
					text: `... and ${result.errors.length - 20} more errors`,
					cls: 'setting-item-description'
				});
			}
		}

		// Close button
		const footer = contentEl.createEl('div', { cls: 'crosswalker-wizard-footer' });
		const closeBtn = footer.createEl('button', { text: 'Close' });
		closeBtn.addEventListener('click', () => this.host.close());
	}
}

/**
 * Thin modal host for `ImportFlow` — back-compat surface for callers that
 * still want a dialog (command palette, settings launchpad; the workspace
 * view hosts the flow directly instead, spec §7n). Owns only the modal
 * chrome (width class, open/close plumbing); all wizard logic lives in
 * `ImportFlow`.
 */
export class ImportWizardModal extends Modal {
	private flow: ImportFlow;

	constructor(app: App, plugin: CrosswalkerPlugin, opts?: { presetRecipeId?: string; prefillFile?: TFile }) {
		super(app);
		this.flow = new ImportFlow(app, plugin, {
			containerEl: this.contentEl,
			close: () => this.close(),
		});
		if (opts?.presetRecipeId) this.flow.presetRecipeId = opts.presetRecipeId;
		if (opts?.prefillFile) this.flow.pendingPrefill = opts.prefillFile;
	}

	onOpen() {
		this.modalEl.addClass('crosswalker-wizard-modal');
		this.flow.onOpen();
	}

	onClose() {
		this.flow.onClose();
	}
}
