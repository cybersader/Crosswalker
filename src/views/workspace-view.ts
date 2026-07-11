/**
 * workspace-view.ts — the Crosswalker workspace tab (spec
 * `.workspace/2026-07-05-shape-first-wizard-spec.md` §7n).
 *
 * A dedicated Obsidian ItemView (leaf/tab) that hosts the import experience
 * outside the settings modal, following the Kanban / Excalidraw / Bases
 * precedent of a first-class workspace tab.
 *
 * Two screens, one view: a home screen (launchpad + installed ontologies)
 * and a flow screen that hosts the full `ImportFlow` — the same wizard
 * logic the modal uses, rendered into a wide in-view pane instead of a
 * dialog. `ImportWizardModal` (settings, command palette) remains a thin
 * back-compat host of the same `ImportFlow`; this view is the primary
 * "actual interface, not mockup" surface (owner direction, 2026-07-11).
 */

import { ItemView, WorkspaceLeaf, TAbstractFile, TFile, TFolder, setIcon } from 'obsidian';
import CrosswalkerPlugin from '../main';
import { ImportFlow, type ImportFlowHost } from '../import/import-wizard';
import { ConfigBrowserModal } from '../config/config-browser-modal';
import {
	deriveInstalledOntologies,
	findRecipeForOntologyName,
	type MinimalVaultNode,
} from './workspace-view-helpers';

export const VIEW_TYPE_CROSSWALKER_WORKSPACE = 'crosswalker-workspace';

/** Adapt a real vault file/folder into the Obsidian-free shape the pure helper consumes. */
function toMinimalNode(file: TAbstractFile | null): MinimalVaultNode | null {
	if (!file) return null;
	if (file instanceof TFolder) {
		return {
			path: file.path,
			name: file.name,
			children: file.children
				.map((child) => toMinimalNode(child))
				.filter((n): n is MinimalVaultNode => n !== null),
		};
	}
	return { path: file.path, name: file.name };
}

export class CrosswalkerWorkspaceView extends ItemView {
	private plugin: CrosswalkerPlugin;
	/** The flow currently mounted in this view, or null when showing the home screen. */
	private activeFlow: ImportFlow | null = null;

	constructor(leaf: WorkspaceLeaf, plugin: CrosswalkerPlugin) {
		super(leaf);
		this.plugin = plugin;
	}

	getViewType(): string {
		return VIEW_TYPE_CROSSWALKER_WORKSPACE;
	}

	getDisplayText(): string {
		return 'Crosswalker';
	}

	getIcon(): string {
		return 'network';
	}

	async onOpen(): Promise<void> {
		this.renderHome();
	}

	async onClose(): Promise<void> {
		// The flow owns its own draft-save-on-close; forward so a tab close mid-import
		// doesn't silently drop an in-progress draft (mirrors the modal's onClose).
		this.activeFlow?.onClose();
		this.activeFlow = null;
		this.contentEl.empty();
	}

	// =========================================================================
	// Home screen — launchpad + installed ontologies
	// =========================================================================

	private renderHome(): void {
		this.activeFlow = null;
		const root = this.contentEl;
		root.empty();
		root.removeClass('is-flow-active');
		root.addClass('crosswalker-workspace-view');

		this.renderHeader(root);
		this.renderLaunchpad(root);
		this.renderInstalledOntologies(root);
	}

	private renderHeader(root: HTMLElement): void {
		const header = root.createDiv({ cls: 'crosswalker-workspace-header' });
		header.createDiv({ cls: 'crosswalker-workspace-title', text: 'Crosswalker' });
		header.createDiv({
			cls: 'crosswalker-workspace-subtitle',
			text: 'Import frameworks, taxonomies, and structured data into this vault.',
		});
	}

	private renderLaunchpad(root: HTMLElement): void {
		const bar = root.createDiv({ cls: 'crosswalker-settings-launchpad' });
		bar.createDiv({ cls: 'crosswalker-settings-launchpad-eyebrow', text: 'Start here' });
		const row = bar.createDiv({ cls: 'crosswalker-settings-launchpad-row' });

		// The flow now runs in this view (spec §7n) — the launchpad's primary
		// action opens the wide in-tab experience, not the modal.
		this.launchButton(row, 'download', 'Import structured data', true, () => {
			this.startFlow();
		});

		this.launchButton(row, 'bookmark', 'Manage saved configs', false, () => {
			new ConfigBrowserModal(this.app, this.plugin, 'browse').open();
		});

		if (this.plugin.settings.enableDraftSessions) {
			this.launchButton(row, 'history', 'Resume a draft', false, () => {
				// Drafts are resumed from the flow's own step 1 picker — same
				// in-view flow, it just lands on the drafts list first.
				this.startFlow();
			});
		}
	}

	private launchButton(
		parent: HTMLElement,
		icon: string,
		label: string,
		cta: boolean,
		onClick: () => void,
	): void {
		const btn = parent.createEl('button', {
			cls: 'crosswalker-launch-btn' + (cta ? ' mod-cta' : ''),
		});
		const ico = btn.createSpan({ cls: 'crosswalker-launch-ico' });
		setIcon(ico, icon);
		btn.createSpan({ text: label });
		btn.addEventListener('click', onClick);
	}

	private renderInstalledOntologies(root: HTMLElement): void {
		const section = root.createDiv({ cls: 'crosswalker-workspace-installed' });
		section.createDiv({ cls: 'crosswalker-workspace-installed-heading', text: 'Installed frameworks' });

		const outputRoot = this.app.vault.getAbstractFileByPath(this.plugin.settings.defaultOutputPath);
		const summaries = deriveInstalledOntologies(toMinimalNode(outputRoot));

		if (summaries.length === 0) {
			const empty = section.createDiv({ cls: 'crosswalker-workspace-empty' });
			const ico = empty.createSpan({ cls: 'crosswalker-workspace-empty-ico' });
			setIcon(ico, 'folder-plus');
			empty.createDiv({
				cls: 'crosswalker-workspace-empty-text',
				text: 'Nothing imported yet. Run "Import structured data" to bring in your first framework.',
			});
			return;
		}

		const list = section.createDiv({ cls: 'crosswalker-workspace-ontology-list' });
		for (const summary of summaries) {
			const item = list.createDiv({ cls: 'crosswalker-workspace-ontology-item' });
			const ico = item.createSpan({ cls: 'crosswalker-workspace-ontology-ico' });
			setIcon(ico, 'folder');

			const body = item.createDiv({ cls: 'crosswalker-workspace-ontology-body' });
			body.createDiv({ cls: 'crosswalker-workspace-ontology-name', text: summary.name });
			const edgeCount = this.countLiveEdges(summary.path);
			body.createDiv({
				cls: 'crosswalker-workspace-ontology-count',
				text: `${summary.noteCount} note${summary.noteCount === 1 ? '' : 's'} · `
					+ `${edgeCount} link${edgeCount === 1 ? '' : 's'}`,
			});

			const actions = item.createDiv({ cls: 'crosswalker-workspace-ontology-actions' });
			const match = findRecipeForOntologyName(summary.name);
			if (match) {
				const btn = actions.createEl('button', {
					cls: 'crosswalker-workspace-ontology-reimport',
					attr: { title: `Import again using the ${match.label} configuration` },
				});
				const btnIco = btn.createSpan({ cls: 'crosswalker-wb-ico' });
				setIcon(btnIco, 'refresh-cw');
				btn.createSpan({ text: 'Import again' });
				btn.addEventListener('click', () => this.startFlow({ presetRecipeId: match.id }));
			}
		}
	}

	/**
	 * Live count of frontmatter wikilinks under an installed ontology's folder —
	 * the connectedness signal for the installed-ontologies list (spec §7n item 3;
	 * "note/edge counts stay live"). Recomputed on every return to the home screen,
	 * so a generate-in-view (or any vault edit) is reflected immediately.
	 */
	private countLiveEdges(folderPath: string): number {
		let edges = 0;
		const prefix = folderPath + '/';
		for (const file of this.app.vault.getMarkdownFiles()) {
			if (file.path !== folderPath && !file.path.startsWith(prefix)) continue;
			const cache = this.app.metadataCache.getFileCache(file);
			edges += cache?.frontmatterLinks?.length ?? 0;
		}
		return edges;
	}

	// =========================================================================
	// Flow screen — the full import experience, hosted in the wide pane
	// =========================================================================

	/**
	 * Mount an `ImportFlow` into this view's content area. `presetRecipeId`
	 * (spec §7n item 3, "Import again") seeds the flow to lead with a specific
	 * recognized recipe instead of running fingerprint detection from scratch.
	 * `prefillFile` (the file-explorer context-menu entry point) seeds the flow
	 * with a vault file already selected, skipping straight to Step 2.
	 */
	private startFlow(opts?: { presetRecipeId?: string; prefillFile?: TFile }): void {
		const root = this.contentEl;
		root.empty();
		root.addClass('crosswalker-workspace-view', 'is-flow-active');

		const flowRoot = root.createDiv({ cls: 'crosswalker-workspace-flow' });

		const host: ImportFlowHost = {
			containerEl: flowRoot,
			close: () => {
				// The flow reached a terminal "done" action — return to the home
				// screen (not literally close the tab), with fresh counts.
				this.renderHome();
			},
		};

		const flow = new ImportFlow(this.app, this.plugin, host);
		if (opts?.presetRecipeId) flow.presetRecipeId = opts.presetRecipeId;
		if (opts?.prefillFile) flow.pendingPrefill = opts.prefillFile;
		this.activeFlow = flow;
		flow.onOpen();
	}

	/**
	 * Public entry point for the file-explorer context menu ("Import into vault
	 * with Crosswalker") — mounts the flow in this view with the clicked file
	 * already selected. `main.ts` prefers this over the modal whenever the
	 * workspace view leaf is available.
	 */
	startImportWithFile(file: TFile): void {
		this.startFlow({ prefillFile: file });
	}
}
