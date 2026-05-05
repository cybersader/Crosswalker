/**
 * re-import.spec.ts — End-to-end test for v0.1.3 (generation engine integration)
 *
 * Verifies the full v0.1.3 surface against real Obsidian:
 *   1. legacyConfigToRecipe — translates v0.1.0 ImportRecipe → Ch 22 Recipe
 *   2. render() consumes the translated recipe correctly
 *   3. mergeFrontmatter preserves user-edited keys on re-import
 *   4. _crosswalker provenance block conforms to spec/tier1.schema.json
 *
 * For now, exercises the modules through the plugin-instance handles. Full
 * generation-engine integration with file I/O is the engine refactor itself —
 * still in progress at this milestone; this spec proves the modules WORK
 * end-to-end so the engine can wire them confidently.
 *
 * Per milestone v0.1.3 success criteria.
 *
 * Run: `bun run e2e`
 */

import { browser } from '@wdio/globals';
import { expect } from 'expect';

const sampleLegacyConfig = {
	name: 'nist-mini',
	version: '1.0',
	source: { type: 'csv' as const },
	transforms: {},
	mapping: {
		hierarchy: [
			{ column: 'family', level: 1 },
		],
		frontmatter: [
			{ column: 'name', key: 'title' },
			{ column: 'family', key: 'family_id' },
		],
		body: [],
		links: [],
		filename: { template: '{id}', sanitize: true },
	},
	output: { basePath: 'Frameworks/NIST-mini', overwriteMode: 'replace' as const, createFolders: true },
	frameworkId: 'nist-800-53-r5',
};

describe('Crosswalker plugin — generation modules (v0.1.3)', function () {
	it('legacyConfigToRecipe + render produce expected vault path for a v0.1.0 config', async () => {
		const result = await browser.executeObsidian(({ app }, legacy) => {
			// @ts-expect-error — internal API
			const plugin = app.plugins.plugins['crosswalker'];
			const recipe = plugin.legacyConfigToRecipe(legacy);
			const identity = {
				curie: 'nist:AC-2',
				scope: { family: 'AC', id: 'AC-2', name: 'Account Management' },
			};
			const address = plugin.render(recipe, identity);
			return {
				path: address.primary.path,
				curie: address.frontmatter.curie,
				title: address.frontmatter.title,
				familyId: address.frontmatter.family_id,
			};
		}, sampleLegacyConfig);

		expect(result.path).toBe('AC/AC-2.md');
		expect(result.curie).toBe('nist:AC-2');
		expect(result.title).toBe('Account Management');
		expect(result.familyId).toBe('AC');
	});

	it('mergeFrontmatter preserves user-edited keys on re-import', async () => {
		const result = await browser.executeObsidian(({ app }) => {
			// @ts-expect-error — internal API
			const plugin = app.plugins.plugins['crosswalker'];

			// Simulate: file already exists with user-added `reviewer` field
			const existing = {
				title: 'Stale Title',
				family_id: 'AC',
				reviewer: 'alice', // user-added
				status: 'approved', // user-added
			};

			// Re-import would render new managed values
			const managed = {
				title: 'Account Management',
				family_id: 'AC',
				curie: 'nist:AC-2',
			};

			const keys = plugin.computeManagedKeys(managed);
			return plugin.mergeFrontmatter(existing, managed, keys);
		});

		expect(result.title).toBe('Account Management'); // managed → overwritten
		expect(result.family_id).toBe('AC'); // managed → overwritten
		expect(result.reviewer).toBe('alice'); // user → preserved
		expect(result.status).toBe('approved'); // user → preserved
		expect(result.curie).toBe('nist:AC-2'); // always-managed
	});

	it('mergeFrontmatter is idempotent — running twice produces the same result', async () => {
		const result = await browser.executeObsidian(({ app }) => {
			// @ts-expect-error — internal API
			const plugin = app.plugins.plugins['crosswalker'];
			const existing = { reviewer: 'alice' };
			const managed = { title: 'AC-2', curie: 'nist:AC-2' };
			const keys = plugin.computeManagedKeys(managed);

			const once = plugin.mergeFrontmatter(existing, managed, keys);
			const twice = plugin.mergeFrontmatter(once, managed, keys);
			return { once, twice };
		});

		expect(JSON.stringify(result.twice)).toBe(JSON.stringify(result.once));
	});

	it('buildProvenance produces a spec-conformant _crosswalker block', async () => {
		const result = await browser.executeObsidian(({ app }) => {
			// @ts-expect-error — internal API
			const plugin = app.plugins.plugins['crosswalker'];
			const block = plugin.buildProvenance(
				{
					sourceFile: 'NIST.csv',
					recipeId: 'nist-test',
					sourceVersion: 'rev 5',
				},
				'0.1.3',
			);
			return {
				specVersion: block.spec_version,
				sourceFile: block.source_ref?.file,
				sourceVersion: block.source_ref?.version,
				producerKind: block.producer?.kind,
				producerVersion: block.producer?.version,
				recipeId: block.recipe?.id,
				hasProducedAt: typeof block.produced_at === 'string',
			};
		});

		expect(result.specVersion).toBe('https://crosswalker.dev/spec/tier1.schema.json');
		expect(result.sourceFile).toBe('NIST.csv');
		expect(result.sourceVersion).toBe('rev 5');
		expect(result.producerKind).toBe('plugin-engine');
		expect(result.producerVersion).toBe('0.1.3');
		expect(result.recipeId).toBe('nist-test');
		expect(result.hasProducedAt).toBe(true);
	});

	it('full pipeline: legacyConfig → recipe → render → frontmatter merge → provenance', async () => {
		const result = await browser.executeObsidian(({ app }, legacy) => {
			// @ts-expect-error — internal API
			const plugin = app.plugins.plugins['crosswalker'];

			// 1. Translate legacy config to Ch 22 Recipe
			const recipe = plugin.legacyConfigToRecipe(legacy);

			// 2. Render for one row
			const identity = {
				curie: 'nist:AC-2',
				scope: { family: 'AC', id: 'AC-2', name: 'Account Management' },
			};
			const address = plugin.render(recipe, identity);

			// 3. Build provenance and inject into frontmatter
			const provenance = plugin.buildProvenance({ sourceFile: 'NIST.csv', recipeId: legacy.name }, '0.1.3');
			address.frontmatter._crosswalker = provenance;

			// 4. Merge with hypothetical existing frontmatter that has user fields
			const existing = { reviewer: 'alice', status: 'approved' };
			const keys = plugin.computeManagedKeys(address.frontmatter);
			const merged = plugin.mergeFrontmatter(existing, address.frontmatter, keys);

			return {
				path: address.primary.path,
				merged_curie: merged.curie,
				merged_title: merged.title,
				merged_reviewer: merged.reviewer, // preserved
				merged_status: merged.status, // preserved
				has_provenance: !!merged._crosswalker,
				provenance_spec_version: (merged._crosswalker as Record<string, unknown>)?.spec_version,
			};
		}, sampleLegacyConfig);

		expect(result.path).toBe('AC/AC-2.md');
		expect(result.merged_curie).toBe('nist:AC-2');
		expect(result.merged_title).toBe('Account Management');
		expect(result.merged_reviewer).toBe('alice');
		expect(result.merged_status).toBe('approved');
		expect(result.has_provenance).toBe(true);
		expect(result.provenance_spec_version).toBe('https://crosswalker.dev/spec/tier1.schema.json');
	});
});
