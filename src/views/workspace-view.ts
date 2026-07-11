/**
 * workspace-view.ts — the Crosswalker workspace tab (spec
 * `.workspace/2026-07-05-shape-first-wizard-spec.md` §7n).
 *
 * A dedicated Obsidian ItemView (leaf/tab) that hosts the import experience
 * outside the settings modal, following the Kanban / Excalidraw / Bases
 * precedent of a first-class workspace tab. This first pass is a minimal
 * shell: the same launchpad actions as the settings hub, plus a placeholder
 * "Installed ontologies" section. The import action still opens the
 * existing wizard modal — migrating the workbench itself into this view is
 * a later round.
 */

import { ItemView, WorkspaceLeaf, TAbstractFile, TFolder, setIcon } from 'obsidian';
import CrosswalkerPlugin from '../main';
import { ImportWizardModal } from '../import/import-wizard';
import { ConfigBrowserModal } from '../config/config-browser-modal';
import { deriveInstalledOntologies, type MinimalVaultNode } from './workspace-view-helpers';

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
		this.render();
	}

	async onClose(): Promise<void> {
		this.contentEl.empty();
	}

	private render(): void {
		const root = this.contentEl;
		root.empty();
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

		this.launchButton(row, 'download', 'Import structured data', true, () => {
			new ImportWizardModal(this.app, this.plugin).open();
		});

		this.launchButton(row, 'bookmark', 'Manage saved configs', false, () => {
			new ConfigBrowserModal(this.app, this.plugin, 'browse').open();
		});

		if (this.plugin.settings.enableDraftSessions) {
			this.launchButton(row, 'history', 'Resume a draft', false, () => {
				// Drafts are resumed from the wizard's step 1 picker.
				new ImportWizardModal(this.app, this.plugin).open();
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
		section.createDiv({ cls: 'crosswalker-workspace-installed-heading', text: 'Installed ontologies' });

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
			body.createDiv({
				cls: 'crosswalker-workspace-ontology-count',
				text: `${summary.noteCount} note${summary.noteCount === 1 ? '' : 's'}`,
			});
		}
	}
}
