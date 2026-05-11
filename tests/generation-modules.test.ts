/**
 * generation-modules.test.ts — Jest unit tests for v0.1.3 modules
 *
 * Covers:
 *   - legacy-recipe-shim — translates v0.1.0 ImportRecipe → Ch 22 Recipe
 *   - frontmatter-merge — managed/user_preserve merge semantics
 *   - provenance — _crosswalker block conforms to spec/tier1.schema.json
 *
 * Each module is a pure function; tests assert correct mapping rules,
 * idempotency, edge cases, and round-trip determinism.
 */

import { legacyConfigToRecipe } from '../src/generation/legacy-recipe-shim';
import { mergeFrontmatter, computeManagedKeys } from '../src/generation/frontmatter-merge';
import { buildProvenance } from '../src/generation/provenance';
import { buildConfigFromWizardState } from '../src/generation/generation-engine';
import type { ImportRecipe as LegacyImportRecipe } from '../src/types/config';

// ---------------------------------------------------------------------------
// legacy-recipe-shim
// ---------------------------------------------------------------------------

describe('legacyConfigToRecipe', () => {
	const sampleLegacy: LegacyImportRecipe = {
		name: 'nist-test',
		version: '1.0',
		source: { type: 'csv' },
		transforms: {},
		mapping: {
			hierarchy: [
				{ column: 'family', level: 1 },
				{ column: 'control_id', level: 2 },
			],
			frontmatter: [
				{ column: 'control_name', key: 'title' },
				{ column: 'family', key: 'family_id' },
			],
			body: [],
			links: [],
			filename: { template: '{control_id}', sanitize: true },
		},
		output: { basePath: 'Frameworks/NIST', overwriteMode: 'skip', createFolders: true },
	};

	it('produces a Ch 22 Recipe shape', () => {
		const r = legacyConfigToRecipe(sampleLegacy);
		expect(r.recipe).toBe('nist-test');
		expect(r.source?.ontology).toBe('nist-test');
		expect(r.target.layout.length).toBe(3); // 2 hierarchy + 1 file leaf
	});

	it('translates hierarchy levels to ordered folder mechanisms', () => {
		const r = legacyConfigToRecipe(sampleLegacy);
		expect(r.target.layout[0]).toMatchObject({
			mechanism: 'folder',
			template: '{family}',
		});
		expect(r.target.layout[1]).toMatchObject({
			mechanism: 'folder',
			template: '{control_id}',
		});
	});

	it('sorts hierarchy by level even when input is out of order', () => {
		const config = {
			...sampleLegacy,
			mapping: {
				...sampleLegacy.mapping!,
				hierarchy: [
					{ column: 'control_id', level: 5 },
					{ column: 'family', level: 1 },
					{ column: 'subfamily', level: 3 },
				],
			},
		};
		const r = legacyConfigToRecipe(config);
		const folderTemplates = r.target.layout
			.filter((e) => e.mechanism === 'folder')
			.map((e) => e.template);
		expect(folderTemplates).toEqual(['{family}', '{subfamily}', '{control_id}']);
	});

	it('appends a file mechanism using the filename column', () => {
		const r = legacyConfigToRecipe(sampleLegacy);
		const leaf = r.target.layout[r.target.layout.length - 1];
		expect(leaf.mechanism).toBe('file');
		expect(leaf.template).toBe('{control_id}.md');
	});

	it('translates frontmatter mappings into also_emit.frontmatter.managed', () => {
		const r = legacyConfigToRecipe(sampleLegacy);
		expect(r.target.also_emit?.frontmatter?.managed).toEqual({
			title: '{control_name}',
			family_id: '{family}',
		});
	});

	it('handles configs without hierarchy (flat output)', () => {
		const config = { ...sampleLegacy, mapping: { ...sampleLegacy.mapping!, hierarchy: [] } };
		const r = legacyConfigToRecipe(config);
		expect(r.target.layout.length).toBe(1); // just the leaf
		expect(r.target.layout[0].mechanism).toBe('file');
	});

	it('falls back to first frontmatter column when filename config is absent', () => {
		const config = {
			...sampleLegacy,
			mapping: { ...sampleLegacy.mapping!, filename: undefined as any },
		};
		const r = legacyConfigToRecipe(config);
		const leaf = r.target.layout[r.target.layout.length - 1];
		expect(leaf.template).toBe('{control_name}.md');
	});

	it('respects an explicit filename template, ensuring .md suffix', () => {
		const config = {
			...sampleLegacy,
			mapping: {
				...sampleLegacy.mapping!,
				filename: { template: '{control_id}-{family}', sanitize: true },
			},
		};
		const r = legacyConfigToRecipe(config);
		const leaf = r.target.layout[r.target.layout.length - 1];
		expect(leaf.template).toBe('{control_id}-{family}.md');
	});

	it('produces structurally-identical output for identical input (purity)', () => {
		const a = JSON.stringify(legacyConfigToRecipe(sampleLegacy));
		const b = JSON.stringify(legacyConfigToRecipe(sampleLegacy));
		expect(a).toBe(b);
	});
});

// ---------------------------------------------------------------------------
// frontmatter-merge
// ---------------------------------------------------------------------------

describe('mergeFrontmatter + computeManagedKeys', () => {
	it('overwrites managed keys', () => {
		const existing = { title: 'Old Title', family_id: 'old' };
		const managed = { title: 'New Title', family_id: 'new' };
		const result = mergeFrontmatter(existing, managed, computeManagedKeys(managed));
		expect(result.title).toBe('New Title');
		expect(result.family_id).toBe('new');
	});

	it('preserves user keys NOT in the managed set', () => {
		const existing = { title: 'Old', reviewer: 'alice', status: 'approved' };
		const managed = { title: 'New' };
		const result = mergeFrontmatter(existing, managed, computeManagedKeys(managed));
		expect(result.reviewer).toBe('alice');
		expect(result.status).toBe('approved');
		expect(result.title).toBe('New');
	});

	it('always overwrites _crosswalker provenance + curie', () => {
		const existing = {
			curie: 'old:CURIE',
			_crosswalker: { spec_version: 'old' },
			user_field: 'preserved',
		};
		const managed = {
			curie: 'new:CURIE',
			_crosswalker: { spec_version: 'new' },
		};
		const result = mergeFrontmatter(existing, managed, computeManagedKeys(managed));
		expect(result.curie).toBe('new:CURIE');
		expect((result._crosswalker as Record<string, unknown>).spec_version).toBe('new');
		expect(result.user_field).toBe('preserved');
	});

	it('honors user_preserve patterns (exact match)', () => {
		const existing = { reviewer: 'alice' };
		const managed = { reviewer: 'recipe-default' };
		const keys = computeManagedKeys(managed, ['reviewer']);
		const result = mergeFrontmatter(existing, managed, keys);
		// reviewer is user_preserve → existing value wins
		expect(result.reviewer).toBe('alice');
	});

	it('honors user_preserve patterns (glob)', () => {
		const existing = { user_notes: 'hand-written', user_status: 'in-review' };
		const managed = { user_notes: 'recipe-default', user_status: 'pending' };
		const keys = computeManagedKeys(managed, ['user_*']);
		const result = mergeFrontmatter(existing, managed, keys);
		expect(result.user_notes).toBe('hand-written');
		expect(result.user_status).toBe('in-review');
	});

	it('produces identical output for identical input (purity)', () => {
		const existing = { title: 'X' };
		const managed = { title: 'Y', family: 'AC' };
		const a = JSON.stringify(mergeFrontmatter(existing, managed, computeManagedKeys(managed)));
		const b = JSON.stringify(mergeFrontmatter(existing, managed, computeManagedKeys(managed)));
		expect(a).toBe(b);
	});

	it('idempotent: merge(merge(x, y)) === merge(x, y) for the same managed set', () => {
		const existing = { reviewer: 'alice' };
		const managed = { title: 'AC-2' };
		const keys = computeManagedKeys(managed);

		const once = mergeFrontmatter(existing, managed, keys);
		const twice = mergeFrontmatter(once, managed, keys);
		expect(twice).toEqual(once);
	});
});

// ---------------------------------------------------------------------------
// provenance
// ---------------------------------------------------------------------------

describe('buildProvenance', () => {
	const VERSION = '0.1.0';

	it('produces spec/tier1.schema.json provenance_block shape', () => {
		const result = buildProvenance(
			{ sourceFile: 'NIST.csv', recipeId: 'nist-all-folders' },
			VERSION,
		);
		expect(result.spec_version).toBe('https://crosswalker.dev/spec/tier1.schema.json');
		expect((result.source_ref as Record<string, unknown>).file).toBe('NIST.csv');
		expect(typeof result.produced_at).toBe('string');
		expect((result.producer as Record<string, unknown>).kind).toBe('plugin-engine');
		expect((result.producer as Record<string, unknown>).version).toBe(VERSION);
		expect((result.recipe as Record<string, unknown>).id).toBe('nist-all-folders');
	});

	it('falls back to curie:unknown when no source_ref keys provided', () => {
		const result = buildProvenance({}, VERSION);
		expect((result.source_ref as Record<string, unknown>).curie).toBe('unknown:_');
	});

	it('omits recipe block when no recipeId provided', () => {
		const result = buildProvenance({ sourceFile: 'X.csv' }, VERSION);
		expect(result.recipe).toBeUndefined();
	});

	it('includes optional fields when provided', () => {
		const result = buildProvenance(
			{
				sourceFile: 'NIST.csv',
				sourceVersion: 'rev 5',
				sourceHash: 'sha256-abc',
				recipeId: 'r1',
				recipeHash: 'sha256-def',
				conceptCid: 'sha256-xyz',
			},
			VERSION,
		);
		expect((result.source_ref as Record<string, unknown>).version).toBe('rev 5');
		expect((result.source_ref as Record<string, unknown>).source_hash).toBe('sha256-abc');
		expect((result.recipe as Record<string, unknown>).hash).toBe('sha256-def');
		expect(result.concept_cid).toBe('sha256-xyz');
	});

	it('produces a valid ISO 8601 timestamp', () => {
		const result = buildProvenance({}, VERSION);
		const ts = result.produced_at as string;
		expect(ts).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
		// Round-trip: parsing the ISO string yields a valid Date
		expect(Number.isFinite(new Date(ts).getTime())).toBe(true);
	});
});

// ---------------------------------------------------------------------------
// buildConfigFromWizardState — wizard → ImportRecipe partial
// ---------------------------------------------------------------------------

describe('buildConfigFromWizardState', () => {
	it('emits no filename template when no column is marked as title', () => {
		// Regression for the 2026-05-11 wizard "0 pages generated" bug:
		// Previous fallback set template: "{{row}}" which was a stale Mustache
		// syntax leftover. The template engine threw on every row because `row`
		// isn't a column. Now: omit `filename` so the legacy-recipe-shim falls
		// through to first-frontmatter-column.
		const columnConfigs = new Map([
			['Control ID', { useAs: 'frontmatter', outputKey: 'control_id' }],
			['Control Family', { useAs: 'hierarchy', outputKey: 'control_family' }],
		]);
		const result = buildConfigFromWizardState(columnConfigs, ['Control Family', 'Control ID']);
		expect(result.mapping?.filename).toBeUndefined();
	});

	it('uses the title column with single-brace syntax when one is picked', () => {
		const columnConfigs = new Map([
			['Control ID', { useAs: 'title', outputKey: 'control_id' }],
			['Description', { useAs: 'body', outputKey: 'description' }],
		]);
		const result = buildConfigFromWizardState(columnConfigs, ['Control ID', 'Description']);
		expect(result.mapping?.filename?.template).toBe('{Control ID}');
		expect(result.mapping?.filename?.sanitize).toBe(true);
	});

	it('legacy-recipe-shim filename fallback chain resolves when no title column is picked', () => {
		// End-to-end: wizard state with no title → shim resolves to first
		// frontmatter column → render() will succeed for any row that has
		// that column populated.
		const columnConfigs = new Map([
			['Control ID', { useAs: 'frontmatter', outputKey: 'control_id' }],
		]);
		const partial = buildConfigFromWizardState(columnConfigs, ['Control ID']);
		const recipe = legacyConfigToRecipe({
			name: 'test',
			version: '1.0',
			source: { type: 'csv', path: 'x.csv' },
			...partial,
		} as LegacyImportRecipe);
		// The leaf file entry should have a non-empty template
		const fileEntries = recipe.target.layout.filter((e) => e.mechanism === 'file');
		expect(fileEntries.length).toBeGreaterThan(0);
		expect(fileEntries[0].template).toBe('{Control ID}.md');
	});
});
