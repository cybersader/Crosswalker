/**
 * recipe-picker-modal.ts — Phase 4b modal UI.
 *
 * Entry point for `Crosswalker: Insert query into note`. Lists shipped + user
 * recipes; selecting one expands inline parameter controls; "Insert" calls
 * back with the final block text. Also offers a "Raw YAML escape" option for
 * power users (desktop-only — hidden on mobile per commitment #3).
 *
 * Architectural commitments respected:
 *   - #5 runtime-agnostic recipe schema: dispatch on `query.shape` STRING
 *     value from validated JSON; unknown shapes render as "Unknown shape"
 *     placeholders. New shapes never need picker code changes.
 *   - #3 mobile parity: picker modal works on mobile; raw-YAML escape is
 *     desktop-only with a "Edit on desktop" hint.
 *   - #2 closed mechanism set: `hierarchy` shape marked "Renderer coming
 *     soon" — still insertable (Bases native fallback to table view).
 *   - #6 Bases-not-Dataview: block emission is ` ```base ` only.
 *
 * Reuses Phase 3 modal CSS (.crosswalker-config-browser-modal et al) for
 * visual consistency with the saved-config browser + draft picker patterns.
 */

import { App, Modal, ButtonComponent, Notice } from 'obsidian';
import CrosswalkerPlugin from '../main';
import {
	loadAllRecipes,
	type LoadedRecipe,
	type RecipeLoadError,
} from './recipe-loader';
import {
	renderParameterEditor,
	type ParameterEditorHandle,
} from './recipe-parameter-editor';
import { renderRecipeTemplate, getRecipeTemplate } from './recipe-templates';
import { buildBaseBlock } from './insert-base-block';
import { isMobile } from './mobile-detection';

export type PickerAction =
	| { action: 'insert'; recipeId: string; baseBlock: string }
	| { action: 'cancel' };

const SHAPE_BADGES: Record<string, { label: string; cls?: string; reserved?: boolean }> = {
	pivot: { label: 'Pivot' },
	table: { label: 'Table' },
	list: { label: 'List' },
	cards: { label: 'Cards' },
	hierarchy: { label: 'Hierarchy · renderer coming soon', cls: 'crosswalker-renderer-coming-soon', reserved: true },
	graph: { label: 'Graph · renderer coming soon', cls: 'crosswalker-renderer-coming-soon', reserved: true },
	timeline: { label: 'Timeline · renderer coming soon', cls: 'crosswalker-renderer-coming-soon', reserved: true },
};

export class RecipePickerModal extends Modal {
	plugin: CrosswalkerPlugin;
	private onResolve: (result: PickerAction) => void;
	private resolved = false;
	private recipes: LoadedRecipe[] = [];
	private errors: RecipeLoadError[] = [];
	private expandedRecipeId: string | null = null;
	private currentEditor: ParameterEditorHandle | null = null;

	constructor(
		app: App,
		plugin: CrosswalkerPlugin,
		onResolve: (result: PickerAction) => void,
	) {
		super(app);
		this.plugin = plugin;
		this.onResolve = onResolve;
	}

	onOpen(): void {
		this.modalEl.addClass('crosswalker-recipe-picker-modal');
		// Reuse Phase 3 modal CSS classes for consistent width/height
		this.modalEl.addClass('crosswalker-config-browser-modal');
		void this.loadAndRender();
	}

	onClose(): void {
		if (!this.resolved) {
			this.resolved = true;
			this.onResolve({ action: 'cancel' });
		}
	}

	private resolve(result: PickerAction): void {
		if (this.resolved) return;
		this.resolved = true;
		this.onResolve(result);
		this.close();
	}

	private async loadAndRender(): Promise<void> {
		try {
			const result = await loadAllRecipes(
				this.app,
				this.plugin.settings.recipeSchemaStyle,
				this.plugin.debug,
			);
			this.recipes = result.recipes;
			this.errors = result.errors;
		} catch (err) {
			this.plugin.debug.error('view', 'recipe-load-failed', 'Recipe picker failed to load recipes', {
				error: err instanceof Error ? err.message : String(err),
			});
		}
		this.render();
	}

	private render(): void {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass('crosswalker-config-browser');

		// Header
		const header = contentEl.createEl('div', { cls: 'crosswalker-browser-header' });
		header.createEl('h2', { text: 'Insert query into note' });
		header.createEl('p', {
			text: 'Pick a recipe to insert a `base` code block at your cursor. Bases renders the result inline.',
			cls: 'setting-item-description',
		});

		// Errors (if any recipes failed to load)
		if (this.errors.length > 0) {
			const errBox = contentEl.createEl('div', { cls: 'crosswalker-recipe-load-errors' });
			errBox.createEl('p', {
				text: `${this.errors.length} recipe${this.errors.length === 1 ? '' : 's'} failed to load:`,
				cls: 'crosswalker-warning',
			});
			const list = errBox.createEl('ul');
			for (const e of this.errors.slice(0, 5)) {
				list.createEl('li', {
					text: `${e.originPath} — ${e.error}`,
					cls: 'setting-item-description',
				});
			}
		}

		// Recipe list
		const listContainer = contentEl.createEl('div', { cls: 'crosswalker-config-list crosswalker-recipe-list' });
		if (this.recipes.length === 0) {
			const empty = listContainer.createEl('div', { cls: 'crosswalker-empty-state' });
			empty.createEl('p', { text: 'No recipes available.' });
		} else {
			for (const r of this.recipes) {
				this.renderRecipeCard(listContainer, r);
			}
		}

		// Footer — Raw YAML escape (desktop only) + Cancel
		this.renderFooter(contentEl);
	}

	private renderRecipeCard(container: HTMLElement, recipe: LoadedRecipe): void {
		const expanded = this.expandedRecipeId === recipe.id;
		const card = container.createEl('div', {
			cls: 'crosswalker-config-card crosswalker-recipe-card',
		});

		// Header row — title + shape badge + source pill
		const head = card.createEl('div', { cls: 'crosswalker-card-header' });
		const titleArea = head.createEl('div', { cls: 'crosswalker-card-title-area' });
		titleArea.createEl('h3', { text: recipe.title, cls: 'crosswalker-card-title' });

		const meta = titleArea.createEl('div', { cls: 'crosswalker-card-meta' });
		const badge = SHAPE_BADGES[recipe.shape] ?? { label: `Unknown shape (${recipe.shape})`, cls: 'crosswalker-renderer-coming-soon' };
		const badgeEl = meta.createEl('span', { text: badge.label });
		if (badge.cls) badgeEl.addClass(badge.cls);
		meta.createEl('span', { text: '·', cls: 'crosswalker-meta-sep' });
		meta.createEl('span', { text: recipe.source === 'shipped' ? 'Shipped' : 'User' });
		if (recipe.description) {
			titleArea.createEl('p', {
				text: recipe.description,
				cls: 'setting-item-description crosswalker-recipe-description',
			});
		}

		// Configure / Collapse button
		const actions = head.createEl('div', { cls: 'crosswalker-card-actions' });
		new ButtonComponent(actions)
			.setButtonText(expanded ? 'Collapse' : 'Configure')
			.onClick(() => {
				this.expandedRecipeId = expanded ? null : recipe.id;
				this.currentEditor = null;
				this.render();
			});

		// Expanded view — parameter editor + Insert button
		if (expanded) {
			const details = card.createEl('div', { cls: 'crosswalker-card-details' });
			this.currentEditor = renderParameterEditor(details, recipe);

			const insertRow = details.createEl('div', { cls: 'crosswalker-card-actions crosswalker-insert-row' });
			new ButtonComponent(insertRow)
				.setButtonText('Insert')
				.setCta()
				.onClick(() => {
					const params = this.currentEditor?.getValues() ?? {};
					const block = this.buildBlock(recipe, params);
					if (block === null) {
						new Notice(`No template registered for recipe ${recipe.id} — falling back to raw block.`, 5000);
						this.resolve({ action: 'insert', recipeId: recipe.id, baseBlock: buildBaseBlock('# Recipe template missing for ' + recipe.id) });
						return;
					}
					this.resolve({ action: 'insert', recipeId: recipe.id, baseBlock: block });
				});
		}
	}

	private buildBlock(recipe: LoadedRecipe, params: Record<string, unknown>): string | null {
		const body = renderRecipeTemplate(recipe.id, params);
		if (body === null) {
			// No template — for shipped recipes this is a bug; for user recipes
			// this might be expected (they haven't supplied a template, just the
			// JSON). Use a placeholder. Production picker for v0.2 may surface
			// "raw" insertion for user recipes.
			if (getRecipeTemplate(recipe.id) !== null) {
				return null; // bug; surface via Notice
			}
			return buildBaseBlock(
				`# User recipe ${recipe.id} has no template binding.\n# Edit this block to author your query manually.`,
			);
		}
		return buildBaseBlock(body);
	}

	private renderFooter(container: HTMLElement): void {
		const footer = container.createEl('div', { cls: 'crosswalker-browser-footer' });

		if (!isMobile()) {
			const rawBtn = footer.createEl('button', { text: 'Insert blank `base` block' });
			rawBtn.addEventListener('click', () => {
				const block = buildBaseBlock(
					'# Write your own Bases filters + views here.\n# See _crosswalker/SKILL.md for the recipe schema.\nfilters:\n  and:\n    - true\nviews:\n  - type: table\n    name: "Untitled"',
				);
				this.resolve({ action: 'insert', recipeId: '__raw__', baseBlock: block });
			});
		} else {
			footer.createEl('span', {
				text: 'Raw YAML editing is desktop-only.',
				cls: 'setting-item-description',
			});
		}

		const cancelBtn = footer.createEl('button', { text: 'Cancel' });
		cancelBtn.addEventListener('click', () => {
			this.resolve({ action: 'cancel' });
		});
	}
}
