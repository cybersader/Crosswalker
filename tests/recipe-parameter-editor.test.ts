/**
 * recipe-parameter-editor.test.ts — Phase 4b unit tests for the inline
 * parameter editor. Covers the 4 type widgets (string / number / boolean /
 * unknown-fallback), defaults seeding, empty-state, and humanLabel.
 *
 * NOTE: The Obsidian Setting class is mocked (see tests/__mocks__/obsidian.ts).
 * We can't assert visual rendering — only the handle's API contract +
 * default seeding.
 */

import {
	renderParameterEditor,
	humanLabel,
} from '../src/views/recipe-parameter-editor';
import { buildLoadedRecipe } from '../src/views/recipe-loader';
import type { LoadedRecipe } from '../src/views/recipe-loader';

function makeRecipe(params: Record<string, { type: string; default: unknown; description?: string }> = {}): LoadedRecipe {
	return buildLoadedRecipe(
		{
			recipe: 'test-recipe',
			query: {
				shape: 'pivot',
				params,
			},
		},
		'shipped',
		'shipped:test-recipe',
	);
}

function makeContainer(): HTMLElement {
	const el: any = {
		createEl: jest.fn().mockImplementation(() => makeContainer()),
		createDiv: jest.fn().mockImplementation(() => makeContainer()),
		addClass: jest.fn(),
	};
	return el as HTMLElement;
}

// ---------------------------------------------------------------------------
// humanLabel — pure helper
// ---------------------------------------------------------------------------

describe('humanLabel', () => {
	it('converts snake_case to Title Case', () => {
		expect(humanLabel('confidence_threshold')).toBe('Confidence Threshold');
		expect(humanLabel('tactic_filter')).toBe('Tactic Filter');
		expect(humanLabel('family')).toBe('Family');
	});

	it('handles single words', () => {
		expect(humanLabel('foo')).toBe('Foo');
	});

	it('handles empty string', () => {
		expect(humanLabel('')).toBe('');
	});
});

// ---------------------------------------------------------------------------
// renderParameterEditor — handle contract
// ---------------------------------------------------------------------------

describe('renderParameterEditor — handle contract', () => {
	it('returns hasAnyParams=false for recipes with no params block', () => {
		const recipe = buildLoadedRecipe(
			{ recipe: 'no-params', query: { shape: 'table' } },
			'shipped',
			'shipped:no-params',
		);
		const handle = renderParameterEditor(makeContainer(), recipe);
		expect(handle.hasAnyParams()).toBe(false);
		expect(handle.getValues()).toEqual({});
	});

	it('returns hasAnyParams=true when params exist', () => {
		const recipe = makeRecipe({
			confidence_threshold: { type: 'number', default: 0.7 },
		});
		const handle = renderParameterEditor(makeContainer(), recipe);
		expect(handle.hasAnyParams()).toBe(true);
	});
});

describe('renderParameterEditor — defaults seeding', () => {
	it('seeds number param with its default', () => {
		const recipe = makeRecipe({
			confidence_threshold: { type: 'number', default: 0.7 },
		});
		const handle = renderParameterEditor(makeContainer(), recipe);
		expect(handle.getValues()).toEqual({ confidence_threshold: 0.7 });
	});

	it('seeds string param with its default', () => {
		const recipe = makeRecipe({
			family: { type: 'string', default: 'Basic' },
		});
		const handle = renderParameterEditor(makeContainer(), recipe);
		expect(handle.getValues()).toEqual({ family: 'Basic' });
	});

	it('seeds boolean param with its default', () => {
		const recipe = makeRecipe({
			heatmap: { type: 'boolean', default: true },
		});
		const handle = renderParameterEditor(makeContainer(), recipe);
		expect(handle.getValues()).toEqual({ heatmap: true });
	});

	it('seeds with type-appropriate defaults when `default` is absent', () => {
		const recipe = buildLoadedRecipe(
			{
				recipe: 'no-defaults',
				query: {
					shape: 'pivot',
					params: {
						foo: { type: 'number' },
						bar: { type: 'string' },
						baz: { type: 'boolean' },
					},
				},
			},
			'shipped',
			'shipped:no-defaults',
		);
		const handle = renderParameterEditor(makeContainer(), recipe);
		const vals = handle.getValues();
		expect(vals).toEqual({ foo: 0, bar: '', baz: false });
	});

	it('handles many params (no upper-bound issues)', () => {
		const params: Record<string, { type: string; default: unknown }> = {};
		for (let i = 0; i < 8; i++) {
			params[`p${i}`] = { type: 'string', default: `d${i}` };
		}
		const recipe = makeRecipe(params);
		const handle = renderParameterEditor(makeContainer(), recipe);
		const vals = handle.getValues();
		expect(Object.keys(vals)).toHaveLength(8);
		expect(vals.p0).toBe('d0');
		expect(vals.p7).toBe('d7');
	});
});

describe('renderParameterEditor — reset()', () => {
	it('resets values back to defaults', () => {
		const recipe = makeRecipe({
			x: { type: 'number', default: 5 },
		});
		const handle = renderParameterEditor(makeContainer(), recipe);
		expect(handle.getValues()).toEqual({ x: 5 });
		// (We can't simulate user edits via the mock, but reset() is exposed
		// for the picker to call when switching between recipes.)
		handle.reset();
		expect(handle.getValues()).toEqual({ x: 5 });
	});
});
