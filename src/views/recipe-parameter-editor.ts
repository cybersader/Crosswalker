/**
 * recipe-parameter-editor.ts — Phase 4b inline param editor.
 *
 * Renders the user-editable parameters of a LoadedRecipe inline (one widget
 * per param). Per Ch 32 deliverable B + the v0.1.6 milestone plan: ONLY
 * `query.params` fields are surfaced. `query.primitives` is never user-
 * editable from the inline UI — that breaks the wizard round-trip invariant.
 *
 * Type dispatch (commitment #5 — runtime-agnostic):
 *   - 'string'  → text input
 *   - 'number'  → number input (with step inferred from default)
 *   - 'boolean' → toggle
 *   - anything else (future shapes) → text input (fallback)
 *
 * Returns a `getValues()` accessor so the picker modal can grab the final
 * params dict at "Insert" time.
 */

import { Setting } from 'obsidian';
import type { LoadedRecipe, RecipeParam } from './recipe-loader';
import { getRecipeParams } from './recipe-loader';

export interface ParameterEditorHandle {
	getValues(): Record<string, unknown>;
	hasAnyParams(): boolean;
	reset(): void;
}

/**
 * Render the parameter editor for a recipe into `container`. Returns a
 * handle the caller (the picker modal) can use to retrieve the current
 * values at insert time.
 */
export function renderParameterEditor(
	container: HTMLElement,
	recipe: LoadedRecipe,
): ParameterEditorHandle {
	const params = getRecipeParams(recipe);
	const values: Record<string, unknown> = {};

	// Seed defaults
	for (const p of params) {
		values[p.name] = p.defaultValue ?? defaultForType(p.type);
	}

	if (params.length === 0) {
		container.createEl('p', {
			text: 'This recipe has no exposed parameters to edit. Click Insert to add the block as-is.',
			cls: 'setting-item-description crosswalker-param-editor-empty',
		});
		return {
			getValues: () => ({}),
			hasAnyParams: () => false,
			reset: () => {},
		};
	}

	const section = container.createEl('div', { cls: 'crosswalker-param-editor' });
	section.createEl('h4', { text: 'Parameters' });

	for (const p of params) {
		renderParamRow(section, p, values);
	}

	return {
		getValues: () => ({ ...values }),
		hasAnyParams: () => params.length > 0,
		reset: () => {
			for (const p of params) {
				values[p.name] = p.defaultValue ?? defaultForType(p.type);
			}
		},
	};
}

function renderParamRow(
	container: HTMLElement,
	param: RecipeParam,
	values: Record<string, unknown>,
): void {
	const setting = new Setting(container).setName(humanLabel(param.name));
	if (param.description) {
		setting.setDesc(param.description);
	}

	switch (param.type) {
		case 'boolean':
			setting.addToggle((t) =>
				t
					.setValue(Boolean(values[param.name]))
					.onChange((v: boolean) => {
						values[param.name] = v;
					}),
			);
			break;

		case 'number':
			setting.addText((t) => {
				t.inputEl.type = 'number';
				const cur = values[param.name];
				t.setValue(cur === undefined || cur === null ? '' : String(cur));
				// Choose a step that respects the default's precision.
				// Integers → step=1; decimals → step=0.05 (good enough for
				// confidence thresholds, depth limits, percentile cutoffs).
				const defaultVal = param.defaultValue;
				if (typeof defaultVal === 'number' && Number.isInteger(defaultVal)) {
					t.inputEl.step = '1';
				} else {
					t.inputEl.step = '0.05';
				}
				t.onChange((raw: string) => {
					const parsed = Number(raw);
					if (Number.isFinite(parsed)) {
						values[param.name] = parsed;
					} else if (raw === '') {
						values[param.name] = param.defaultValue ?? 0;
					}
				});
			});
			break;

		case 'string':
		default:
			setting.addText((t) => {
				const cur = values[param.name];
				t.setValue(cur === undefined || cur === null ? '' : String(cur));
				t.onChange((raw: string) => {
					values[param.name] = raw;
				});
			});
			break;
	}
}

/**
 * Best-effort transformation of a `snake_case_param` name into a human
 * label for the Setting.setName slot.
 */
export function humanLabel(name: string): string {
	if (!name) return '';
	return name
		.replace(/_/g, ' ')
		.replace(/\b\w/g, (c) => c.toUpperCase());
}

function defaultForType(type: 'string' | 'number' | 'boolean'): unknown {
	switch (type) {
		case 'number':
			return 0;
		case 'boolean':
			return false;
		case 'string':
		default:
			return '';
	}
}
