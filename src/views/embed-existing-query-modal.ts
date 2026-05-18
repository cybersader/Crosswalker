/**
 * embed-existing-query-modal.ts — Phase 4.7
 *
 * Lightweight modal: "Pick an existing query to embed at the cursor."
 * Lists all canonical queries from `_crosswalker/queries/<slug>/`. Selection
 * resolves the modal with the picked slug; the calling command inserts
 * `![[<slug>/view.base]]` at the editor cursor. No template rendering, no
 * vault scan beyond the cheap frontmatter read.
 *
 * Per the synthesis log §3-command split: "embed is just a reference; no
 * heavy work happens at embed time."
 */

import { App, Modal, ButtonComponent } from 'obsidian';
import type { QueryEntry } from './query-scanner';
import { scanQueries, formatParamsSummary } from './query-scanner';

export type EmbedPickResult =
	| { action: 'embed'; slug: string; viewFile: string }
	| { action: 'cancel' };

export class EmbedExistingQueryModal extends Modal {
	private resolved = false;
	private entries: QueryEntry[] = [];

	constructor(
		app: App,
		private onResult: (result: EmbedPickResult) => void,
	) {
		super(app);
	}

	async onOpen(): Promise<void> {
		this.entries = await scanQueries(this.app);
		this.renderUI();
	}

	private renderUI(): void {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass('crosswalker-embed-picker-modal');

		contentEl.createEl('h2', { text: 'Embed an existing query' });
		contentEl.createEl('p', {
			text: 'Pick a query to insert at your cursor. Embedding is just a reference — no scan happens here.',
			cls: 'crosswalker-modal-subtitle',
		});

		if (this.entries.length === 0) {
			const empty = contentEl.createDiv({ cls: 'crosswalker-empty-state' });
			empty.createEl('p', { text: 'No queries found in this vault.' });
			empty.createEl('p', {
				text: 'Run "Crosswalker: Insert query into note" to create one.',
				cls: 'crosswalker-modal-hint',
			});
			this.renderCancelOnly(contentEl);
			return;
		}

		const list = contentEl.createDiv({ cls: 'crosswalker-query-list' });
		for (const entry of this.entries) {
			this.renderEntryCard(list, entry);
		}

		this.renderCancelOnly(contentEl);
	}

	private renderEntryCard(parent: HTMLElement, entry: QueryEntry): void {
		const card = parent.createDiv({ cls: 'crosswalker-query-card' });

		const header = card.createDiv({ cls: 'crosswalker-query-card-header' });
		const title = header.createEl('div', { cls: 'crosswalker-query-card-title' });
		title.setText(entry.slug);

		const meta = header.createEl('div', { cls: 'crosswalker-query-card-meta' });
		meta.createEl('span', {
			text: entry.recipe,
			cls: 'crosswalker-query-recipe-badge',
		});
		meta.createEl('span', {
			text: entry.shape,
			cls: 'crosswalker-query-shape-badge',
		});

		const details = card.createDiv({ cls: 'crosswalker-query-card-details' });
		details.createEl('div', {
			text: formatParamsSummary(entry.params),
			cls: 'crosswalker-query-params',
		});
		const ts = new Date(entry.generatedAt).toLocaleString();
		details.createEl('div', {
			text: `Last generated: ${ts}`,
			cls: 'crosswalker-query-timestamp',
		});

		const actions = card.createDiv({ cls: 'crosswalker-query-card-actions' });
		new ButtonComponent(actions)
			.setButtonText('Embed at cursor')
			.setCta()
			.onClick(() => {
				this.resolve({
					action: 'embed',
					slug: entry.slug,
					viewFile: entry.viewFile,
				});
			});
	}

	private renderCancelOnly(parent: HTMLElement): void {
		const footer = parent.createDiv({ cls: 'crosswalker-modal-footer' });
		new ButtonComponent(footer)
			.setButtonText('Cancel')
			.onClick(() => {
				this.resolve({ action: 'cancel' });
			});
	}

	private resolve(result: EmbedPickResult): void {
		if (this.resolved) return;
		this.resolved = true;
		this.onResult(result);
		this.close();
	}

	onClose(): void {
		if (!this.resolved) {
			this.resolved = true;
			this.onResult({ action: 'cancel' });
		}
	}
}
