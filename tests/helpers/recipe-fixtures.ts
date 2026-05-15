/**
 * Shared recipe fixtures loader for Jest tests (Phase 4a — testing helpers).
 *
 * Reads `recipes/v0-1/*.json` once + caches in module memory. Saves disk reads
 * across the test suite. Lifespan: any recipe-touching test (Phase 4 +
 * Phase 5 + v0.1.7 exporters).
 *
 * NOTE: Do NOT call this from production source code — it uses Node fs
 * directly. Production code should go through `src/views/recipe-loader.ts`
 * which uses the Obsidian Vault API. This helper is test-only.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const RECIPES_DIR = path.join(REPO_ROOT, 'recipes', 'v0-1');

let cache: Record<string, unknown> | null = null;

/**
 * Load all reference recipes from disk into a memoized map keyed by recipe ID.
 * Subsequent calls return the cached map.
 */
export function loadAllRecipes(): Record<string, unknown> {
	if (cache) return cache;
	const files = fs.readdirSync(RECIPES_DIR).filter((f) => f.endsWith('.json'));
	const out: Record<string, unknown> = {};
	for (const file of files) {
		const fullPath = path.join(RECIPES_DIR, file);
		const text = fs.readFileSync(fullPath, 'utf8');
		try {
			const json = JSON.parse(text) as { recipe?: string };
			const id = json.recipe ?? file.replace(/\.json$/, '');
			out[id] = json;
		} catch (err) {
			throw new Error(`Failed to parse recipe fixture ${file}: ${err instanceof Error ? err.message : String(err)}`);
		}
	}
	cache = out;
	return out;
}

/**
 * Get a single recipe fixture by recipe ID. Throws if not found.
 */
export function loadRecipe<T = unknown>(id: string): T {
	const all = loadAllRecipes();
	const found = all[id];
	if (!found) {
		throw new Error(`Recipe fixture not found: ${id}. Available: ${Object.keys(all).join(', ')}`);
	}
	return found as T;
}

/**
 * List recipe IDs (for parametrized tests that iterate every recipe).
 */
export function listRecipeIds(): string[] {
	return Object.keys(loadAllRecipes()).sort();
}

/**
 * Clear cache. Used in tests that mutate recipe data.
 */
export function clearRecipeCache(): void {
	cache = null;
}
