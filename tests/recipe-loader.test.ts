/**
 * recipe-loader.test.ts — Phase 4a unit tests.
 *
 * Verifies the recipe loader's shipped-recipes inventory + the
 * `buildLoadedRecipe` projection + `getRecipeParams` extraction. User-recipes
 * folder scan is covered by E2E in Phase 4c (needs real vault).
 *
 * NOTE: The Jest config maps `obsidian` → `tests/__mocks__/obsidian.ts`, so
 * the actual recipe-loader import + validation runs against the mocked
 * Obsidian API.
 */

import {
	buildLoadedRecipe,
	getRecipeParams,
	loadAllRecipes,
	type LoadedRecipe,
} from '../src/views/recipe-loader';
import { initValidator } from '../src/validation/validator';
import { Vault } from 'obsidian';
import { loadAllRecipes as loadFixturesFromDisk, loadRecipe } from './helpers/recipe-fixtures';

// Initialize AJV once for the whole suite
beforeAll(() => {
	initValidator();
});

// ---------------------------------------------------------------------------
// Fixtures helper — sanity check
// ---------------------------------------------------------------------------

describe('recipe-fixtures helper', () => {
	it('loads all 6 shipped recipes from disk', () => {
		const all = loadFixturesFromDisk();
		const ids = Object.keys(all).sort();
		expect(ids).toContain('nist-csf-coverage-matrix');
		expect(ids).toContain('nist-csf-to-mitre-coverage');
		expect(ids.length).toBeGreaterThanOrEqual(6);
	});

	it('loadRecipe(id) returns the right recipe', () => {
		const r = loadRecipe<{ query: { shape: string } }>('nist-csf-coverage-matrix');
		expect(r.query.shape).toBe('pivot');
	});

	it('loadRecipe throws for unknown ID with helpful message', () => {
		expect(() => loadRecipe('not-a-real-recipe')).toThrow(/Available:/);
	});
});

// ---------------------------------------------------------------------------
// buildLoadedRecipe — pure projection
// ---------------------------------------------------------------------------

describe('buildLoadedRecipe', () => {
	it('extracts title + description + shape from query block', () => {
		const json = {
			recipe: 'test-rec',
			query: {
				title: 'Test Title',
				description: 'Test description',
				shape: 'pivot',
			},
		};
		const r = buildLoadedRecipe(json, 'shipped', 'shipped:test-rec');
		expect(r.id).toBe('test-rec');
		expect(r.title).toBe('Test Title');
		expect(r.description).toBe('Test description');
		expect(r.shape).toBe('pivot');
		expect(r.source).toBe('shipped');
		expect(r.originPath).toBe('shipped:test-rec');
	});

	it('falls back to recipe ID when query.title is missing', () => {
		const json = { recipe: 'no-title-rec', query: { shape: 'list' } };
		const r = buildLoadedRecipe(json, 'shipped', 'shipped:no-title-rec');
		expect(r.title).toBe('no-title-rec');
		expect(r.description).toBe('');
	});

	it('passes through unknown shapes (commitment #5 — runtime-agnostic dispatch)', () => {
		const json = {
			recipe: 'future-shape-rec',
			query: { shape: 'cards-v2-future' as string },
		};
		const r = buildLoadedRecipe(json, 'user', '_crosswalker/recipes/future.json');
		// Loader does NOT validate shape against a closed enum — it just passes the string through.
		// The picker is responsible for rendering "unknown shape" gracefully.
		expect(r.shape).toBe('cards-v2-future');
	});

	it('reports shape="unknown" only when JSON literally has no query.shape', () => {
		const json = { recipe: 'no-shape-rec' };
		const r = buildLoadedRecipe(json, 'shipped', 'shipped:no-shape-rec');
		expect(r.shape).toBe('unknown');
	});
});

// ---------------------------------------------------------------------------
// getRecipeParams — extract picker-visible params
// ---------------------------------------------------------------------------

describe('getRecipeParams', () => {
	it('extracts params from a real shipped recipe', () => {
		const json = loadRecipe('nist-csf-coverage-matrix');
		const loaded = buildLoadedRecipe(json as Record<string, unknown>, 'shipped', 'shipped:nist-csf-coverage-matrix');
		const params = getRecipeParams(loaded);
		expect(params.length).toBeGreaterThan(0);
		const conf = params.find((p) => p.name === 'confidence_threshold');
		expect(conf).toBeDefined();
		expect(conf?.type).toBe('number');
		expect(conf?.defaultValue).toBe(0.7);
	});

	it('returns empty array when recipe has no params block', () => {
		const r: LoadedRecipe = buildLoadedRecipe(
			{ recipe: 'no-params', query: { shape: 'table' } },
			'shipped',
			'shipped:no-params',
		);
		expect(getRecipeParams(r)).toEqual([]);
	});

	it('coerces JSON Schema type names to widget types (integer → number)', () => {
		const r: LoadedRecipe = buildLoadedRecipe(
			{
				recipe: 'int-param',
				query: {
					shape: 'pivot',
					params: {
						depth: { type: 'integer', default: 3, description: 'Max depth' },
					},
				},
			},
			'shipped',
			'shipped:int-param',
		);
		const params = getRecipeParams(r);
		expect(params[0].type).toBe('number');
	});

	it('coerces unknown types to string (graceful fallback)', () => {
		const r: LoadedRecipe = buildLoadedRecipe(
			{
				recipe: 'weird-type',
				query: {
					shape: 'pivot',
					params: {
						field: { type: 'date-time-future', default: '', description: '' },
					},
				},
			},
			'shipped',
			'shipped:weird-type',
		);
		const params = getRecipeParams(r);
		expect(params[0].type).toBe('string');
	});

	it('handles boolean params correctly', () => {
		const r: LoadedRecipe = buildLoadedRecipe(
			{
				recipe: 'bool-param',
				query: {
					shape: 'pivot',
					params: {
						heatmap: { type: 'boolean', default: true, description: 'Toggle heatmap' },
					},
				},
			},
			'shipped',
			'shipped:bool-param',
		);
		const params = getRecipeParams(r);
		expect(params[0].type).toBe('boolean');
		expect(params[0].defaultValue).toBe(true);
	});
});

// ---------------------------------------------------------------------------
// loadAllRecipes — shipped catalog inventory + validation
// ---------------------------------------------------------------------------

describe('loadAllRecipes — shipped catalog', () => {
	const mockApp = {
		vault: new Vault(),
	} as never;

	it('loads all 6 shipped recipes successfully when AJV validates them', async () => {
		const result = await loadAllRecipes(mockApp, 'A');
		// All shipped recipes must validate. If they don't, the schema or
		// recipe is broken — fail loudly.
		expect(result.errors.filter((e) => e.source === 'shipped')).toEqual([]);
		expect(result.recipes.length).toBeGreaterThanOrEqual(6);
	});

	it('shipped catalog includes the new cross-domain mitre-coverage recipe (Phase 4a)', async () => {
		const result = await loadAllRecipes(mockApp, 'A');
		const ids = result.recipes.map((r) => r.id);
		expect(ids).toContain('nist-csf-to-mitre-coverage');
	});

	it('sorts shipped recipes first, then user', async () => {
		const result = await loadAllRecipes(mockApp, 'A');
		let sawUser = false;
		for (const r of result.recipes) {
			if (r.source === 'user') sawUser = true;
			else if (sawUser) {
				throw new Error('shipped recipe appeared after user — sort order broken');
			}
		}
		// passes either way (with or without user recipes; just enforces order)
	});

	it('validates against both schema styles A and B (recipes survive style switch)', async () => {
		const a = await loadAllRecipes(mockApp, 'A');
		const b = await loadAllRecipes(mockApp, 'B');
		expect(a.errors.filter((e) => e.source === 'shipped')).toEqual([]);
		expect(b.errors.filter((e) => e.source === 'shipped')).toEqual([]);
		expect(a.recipes.length).toBe(b.recipes.length);
	});
});
