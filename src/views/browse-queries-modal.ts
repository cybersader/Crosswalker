/**
 * browse-queries-modal.ts — Phase 4.7
 *
 * Discovery surface: lists all canonical queries with full metadata + per-row
 * actions (Open index.md / Embed here / Delete folder). Confirmation prompt
 * on Delete. Re-uses the lightweight query-scanner.
 */

import { App, Modal, Notice, TFile, ButtonComponent } from 'obsidian';
import type { Editor } from 'obsidian';
import type { QueryEntry } from './query-scanner';
import { scanQueries, formatParamsSummary } from './query-scanner';

export interface BrowseModalContext {
	/** Active editor (if any) — needed for the "Embed here" action. */
	editor: Editor | null;
	/** Active file (if any) — used to detect host notes that already embed a query. */
	activeFile: TFile | null;
	/** Callback to insert an embed at the cursor (closes the modal first). */
	insertEmbed: (slug: string, viewFile: string) => Promise<void>;
}

export class BrowseQueriesModal extends Modal {
	private entries: QueryEntry[] = [];

	constructor(app: App, private context: BrowseModalContext) {
		super(app);
	}

	async onOpen(): Promise<void> {
		this.entries = await scanQueries(this.app);
		this.renderUI();
	}

	private async refresh(): Promise<void> {
		this.entries = await scanQueries(this.app);
		this.renderUI();
	}

	private renderUI(): void {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass('crosswalker-browse-queries-modal');

		contentEl.createEl('h2', { text: 'Browse queries' });
		const subtitle = contentEl.createEl('p', { cls: 'crosswalker-modal-subtitle' });
		subtitle.setText(
			this.entries.length === 0
				? 'No queries in this vault. Run "Insert query into note" to create one.'
				: `${this.entries.length} quer${this.entries.length === 1 ? 'y' : 'ies'} in this vault. Each lives in its own folder under _crosswalker/queries/.`,
		);

		if (this.entries.length === 0) {
			this.renderFooter(contentEl);
			return;
		}

		const list = contentEl.createDiv({ cls: 'crosswalker-query-list' });
		for (const entry of this.entries) {
			this.renderEntryCard(list, entry);
		}

		this.renderFooter(contentEl);
	}

	private renderEntryCard(parent: HTMLElement, entry: QueryEntry): void {
		const card = parent.createDiv({ cls: 'crosswalker-query-card' });

		const header = card.createDiv({ cls: 'crosswalker-query-card-header' });
		header.createEl('div', { text: entry.slug, cls: 'crosswalker-query-card-title' });

		const meta = header.createEl('div', { cls: 'crosswalker-query-card-meta' });
		meta.createEl('span', { text: entry.recipe, cls: 'crosswalker-query-recipe-badge' });
		meta.createEl('span', { text: entry.shape, cls: 'crosswalker-query-shape-badge' });

		const details = card.createDiv({ cls: 'crosswalker-query-card-details' });
		details.createEl('div', { text: formatParamsSummary(entry.params), cls: 'crosswalker-query-params' });
		const ts = new Date(entry.generatedAt).toLocaleString();
		details.createEl('div', { text: `Last generated: ${ts}`, cls: 'crosswalker-query-timestamp' });
		details.createEl('div', { text: `Query ID: ${entry.queryId}`, cls: 'crosswalker-query-id' });

		const actions = card.createDiv({ cls: 'crosswalker-query-card-actions' });

		new ButtonComponent(actions)
			.setButtonText('Open canonical')
			.setTooltip(`Open ${entry.indexFile} in the active pane`)
			.onClick(async () => {
				const file = this.app.vault.getAbstractFileByPath(entry.indexFile);
				if (file && 'path' in file) {
					this.close();
					await this.app.workspace.getLeaf(false).openFile(file as TFile);
				} else {
					new Notice(`Could not open ${entry.indexFile}`, 4000);
				}
			});

		const embedBtn = new ButtonComponent(actions).setButtonText('Embed in active note');
		if (!this.context.editor || !this.context.activeFile) {
			embedBtn.setDisabled(true).setTooltip('Open a markdown note to embed into');
		} else {
			embedBtn.onClick(async () => {
				this.close();
				await this.context.insertEmbed(entry.slug, entry.viewFile);
			});
		}

		new ButtonComponent(actions)
			.setButtonText('Delete')
			.setWarning()
			.setTooltip(`Delete _crosswalker/queries/${entry.slug}/ (irreversible)`)
			.onClick(async () => {
				const confirmed = await this.confirmDelete(entry);
				if (confirmed) {
					await this.deleteQueryFolder(entry);
					await this.refresh();
				}
			});
	}

	private async confirmDelete(entry: QueryEntry): Promise<boolean> {
		return new Promise((resolve) => {
			const modal = new Modal(this.app);
			modal.contentEl.createEl('h3', { text: 'Delete query?' });
			modal.contentEl.createEl('p', {
				text: `This permanently deletes the folder _crosswalker/queries/${entry.slug}/ and everything inside it. Embeds in other notes will become broken links.`,
			});
			modal.contentEl.createEl('p', {
				text: 'This action cannot be undone.',
				cls: 'crosswalker-warning-text',
			});

			const footer = modal.contentEl.createDiv({ cls: 'crosswalker-modal-footer' });
			new ButtonComponent(footer).setButtonText('Cancel').onClick(() => {
				modal.close();
				resolve(false);
			});
			new ButtonComponent(footer)
				.setButtonText('Delete')
				.setWarning()
				.onClick(() => {
					modal.close();
					resolve(true);
				});
			modal.open();
		});
	}

	private async deleteQueryFolder(entry: QueryEntry): Promise<void> {
		const folderPath = `_crosswalker/queries/${entry.slug}`;
		const folder = this.app.vault.getAbstractFileByPath(folderPath);
		if (!folder) {
			new Notice(`Folder not found: ${folderPath}`, 4000);
			return;
		}
		try {
			await this.app.vault.delete(folder, true);
			new Notice(`Deleted ${folderPath}`, 4000);
		} catch (err) {
			const msg = err instanceof Error ? err.message : String(err);
			new Notice(`Delete failed: ${msg}`, 6000);
		}
	}

	private renderFooter(parent: HTMLElement): void {
		const footer = parent.createDiv({ cls: 'crosswalker-modal-footer' });
		new ButtonComponent(footer)
			.setButtonText('Close')
			.onClick(() => this.close());
	}
}
