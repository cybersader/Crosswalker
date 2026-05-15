/**
 * draft-picker-modal.ts — Phase 3.6c.
 *
 * Resume-or-start-fresh picker shown when the import wizard opens AND there
 * are existing drafts. Modeled on ConfigBrowserModal — card list + per-card
 * actions + footer. Reuses the same Phase 3 modal CSS classes for visual
 * consistency.
 *
 * The wizard's onOpen() checks draftStore.list(); if it returns non-empty,
 * this modal opens FIRST. User picks one of:
 *   - Resume a draft → callback fires with { action: 'resume', draft }
 *   - Delete a draft → store.delete(id); re-render the list
 *   - Start fresh → callback fires with { action: 'fresh' }
 *   - Cancel → callback fires with { action: 'cancel' }
 *
 * If the user deletes the LAST draft, the picker auto-closes with
 * action='fresh' (no drafts left, nothing to resume).
 */

import { App, Modal, Notice, ButtonComponent } from 'obsidian';
import CrosswalkerPlugin from '../main';
import type { WizardDraft } from './draft-store';

export type DraftPickerAction = 'resume' | 'fresh' | 'cancel';

export interface DraftPickerResult {
	action: DraftPickerAction;
	draft?: WizardDraft;
}

export class DraftPickerModal extends Modal {
	plugin: CrosswalkerPlugin;
	private drafts: WizardDraft[] = [];
	private onResolve: (result: DraftPickerResult) => void;
	private resolved: boolean = false;

	constructor(
		app: App,
		plugin: CrosswalkerPlugin,
		drafts: WizardDraft[],
		onResolve: (result: DraftPickerResult) => void,
	) {
		super(app);
		this.plugin = plugin;
		this.drafts = drafts;
		this.onResolve = onResolve;
	}

	onOpen() {
		this.render();
	}

	onClose() {
		// If the user dismissed the modal (Escape, click outside, X) without
		// picking, treat as 'cancel'. Avoid double-resolve when an action
		// button already fired.
		if (!this.resolved) {
			this.resolved = true;
			this.onResolve({ action: 'cancel' });
		}
	}

	private resolve(result: DraftPickerResult): void {
		if (this.resolved) return;
		this.resolved = true;
		this.onResolve(result);
		this.close();
	}

	private render(): void {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass('crosswalker-config-browser');
		this.modalEl.addClass('crosswalker-config-browser-modal');

		// Header
		const header = contentEl.createEl('div', { cls: 'crosswalker-browser-header' });
		header.createEl('h2', { text: 'Resume an in-progress import?' });
		header.createEl('p', {
			text: `You have ${this.drafts.length} draft import${this.drafts.length === 1 ? '' : 's'} from a previous session. Pick one to continue, delete drafts you don't need, or start a fresh import.`,
			cls: 'setting-item-description'
		});

		// Draft list
		const listContainer = contentEl.createEl('div', { cls: 'crosswalker-config-list' });
		if (this.drafts.length === 0) {
			const empty = listContainer.createEl('div', { cls: 'crosswalker-empty-state' });
			empty.createEl('p', { text: 'No drafts to show.' });
			this.renderFooter(contentEl);
			return;
		}

		for (const draft of this.drafts) {
			this.renderDraftCard(listContainer, draft);
		}

		this.renderFooter(contentEl);
	}

	private renderDraftCard(container: HTMLElement, draft: WizardDraft): void {
		const card = container.createEl('div', { cls: 'crosswalker-config-card' });

		// Card header — title + meta
		const head = card.createEl('div', { cls: 'crosswalker-card-header' });
		const titleArea = head.createEl('div', { cls: 'crosswalker-card-title-area' });
		titleArea.createEl('h3', { text: draft.name, cls: 'crosswalker-card-title' });

		const meta = titleArea.createEl('div', { cls: 'crosswalker-card-meta' });
		meta.createEl('span', {
			text: draft.sourceFile?.name ?? '(no source file)',
		});
		meta.createEl('span', { text: '·', cls: 'crosswalker-meta-sep' });
		meta.createEl('span', {
			text: `Step ${draft.currentStep} of 4`,
		});
		meta.createEl('span', { text: '·', cls: 'crosswalker-meta-sep' });
		meta.createEl('span', {
			text: relativeTime(draft.updatedAt),
		});
		if (draft.appliedConfigId) {
			const appliedName = this.plugin.settings.savedConfigs.find(c => c.id === draft.appliedConfigId)?.name;
			if (appliedName) {
				meta.createEl('span', { text: '·', cls: 'crosswalker-meta-sep' });
				meta.createEl('span', { text: `Config: ${appliedName}` });
			}
		}

		// Per-card action buttons
		const actions = card.createEl('div', { cls: 'crosswalker-card-actions' });

		new ButtonComponent(actions)
			.setButtonText('Resume')
			.setCta()
			.onClick(() => {
				this.resolve({ action: 'resume', draft });
			});

		new ButtonComponent(actions)
			.setButtonText('Delete')
			.setWarning()
			.onClick(async () => {
				try {
					await this.plugin.draftStore.delete(draft.id);
					new Notice(`Draft "${draft.name}" deleted.`);
				} catch (err) {
					const msg = err instanceof Error ? err.message : String(err);
					new Notice(`Failed to delete draft: ${msg}`);
					return;
				}
				// Remove from local list + re-render. If empty, auto-fresh.
				this.drafts = this.drafts.filter(d => d.id !== draft.id);
				if (this.drafts.length === 0) {
					this.resolve({ action: 'fresh' });
					return;
				}
				this.render();
			});
	}

	private renderFooter(container: HTMLElement): void {
		const footer = container.createEl('div', { cls: 'crosswalker-browser-footer' });
		const cancelBtn = footer.createEl('button', { text: 'Cancel' });
		cancelBtn.addEventListener('click', () => {
			this.resolve({ action: 'cancel' });
		});
		const freshBtn = footer.createEl('button', {
			text: 'Start fresh import',
			cls: 'mod-cta',
		});
		freshBtn.addEventListener('click', () => {
			this.resolve({ action: 'fresh' });
		});
	}
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Format an ISO-8601 timestamp as a friendly relative-time string.
 * Coarse-grained — good enough for "when did I last touch this draft" UX.
 */
function relativeTime(iso: string): string {
	const then = new Date(iso).getTime();
	if (!Number.isFinite(then)) return 'unknown';
	const deltaMs = Date.now() - then;
	const deltaSec = Math.floor(deltaMs / 1000);
	if (deltaSec < 60) return 'just now';
	const deltaMin = Math.floor(deltaSec / 60);
	if (deltaMin < 60) return `${deltaMin} minute${deltaMin === 1 ? '' : 's'} ago`;
	const deltaHr = Math.floor(deltaMin / 60);
	if (deltaHr < 24) return `${deltaHr} hour${deltaHr === 1 ? '' : 's'} ago`;
	const deltaDay = Math.floor(deltaHr / 24);
	if (deltaDay === 1) return 'yesterday';
	if (deltaDay < 7) return `${deltaDay} days ago`;
	if (deltaDay < 30) return `${Math.floor(deltaDay / 7)} week${Math.floor(deltaDay / 7) === 1 ? '' : 's'} ago`;
	return `${Math.floor(deltaDay / 30)} month${Math.floor(deltaDay / 30) === 1 ? '' : 's'} ago`;
}
