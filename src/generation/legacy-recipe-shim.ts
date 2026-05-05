/**
 * legacy-recipe-shim.ts — Phase-0 compatibility shim
 *
 * Translates a v0.1.0 column-role `ImportRecipe` (the legacy shape with
 * mapping.hierarchy / mapping.frontmatter / mapping.filename) into a Ch 22
 * `Recipe` shape (target.layout with folder/file mechanisms +
 * also_emit.frontmatter.managed).
 *
 * Per Ch 22 §10.7, four-phase migration plan:
 *   - Phase 0 (this shim, v0.1.3): legacy recipes still load; translated at
 *     the engine boundary
 *   - Phase 1 (v0.2): both forms accepted; new form preferred
 *   - Phase 2 (v0.5): legacy form deprecated
 *   - Phase 3 (post-v1.0): legacy form removed
 *
 * Pure function. Output is structurally identical for identical inputs.
 */

import type { ImportRecipe as LegacyImportRecipe } from '../types/config';
import type { Recipe } from '../render';

/**
 * Convert a legacy v0.1.0 ImportRecipe to a Ch 22 Recipe.
 *
 * Mapping rules:
 *   - mapping.hierarchy → ordered folder mechanisms (sorted by level)
 *     Each hierarchy entry produces `{ mechanism: 'folder', template: '{<column>}' }`
 *   - mapping.filename → leaf file mechanism using the filename's column or template
 *   - mapping.frontmatter → also_emit.frontmatter.managed entries
 *     (key → `{<column>}` template; transforms still happen via the engine's
 *     formatValue helper since render's filter set is closed)
 */
export function legacyConfigToRecipe(config: LegacyImportRecipe): Recipe {
	const layout: Recipe['target']['layout'] = [];

	// 1. Hierarchy → folder mechanisms (sorted by level)
	const hierarchy = config.mapping?.hierarchy ?? [];
	if (hierarchy.length > 0) {
		const sorted = [...hierarchy].sort((a, b) => a.level - b.level);
		for (const h of sorted) {
			layout.push({
				level: `hierarchy-${h.level}`,
				mechanism: 'folder',
				template: `{${h.column}}`,
			});
		}
	}

	// 2. Filename → file mechanism (leaf)
	// If config.mapping.filename has a template like "{title}.md", use that.
	// If just a column, use {<column>}.md
	const filenameTemplate = resolveFilenameTemplate(config);
	layout.push({
		level: 'leaf',
		mechanism: 'file',
		template: filenameTemplate,
	});

	// 3. Frontmatter mappings → also_emit.frontmatter.managed
	const managed: Record<string, string> = {};
	const fm = config.mapping?.frontmatter ?? [];
	for (const entry of fm) {
		managed[entry.key] = `{${entry.column}}`;
	}

	return {
		recipe: config.name ?? 'legacy-config',
		source: {
			ontology: config.name ?? 'unknown',
			levels: [...hierarchy.map((_, i) => `hierarchy-${i}`), 'leaf'],
		},
		target: {
			layout,
			also_emit: Object.keys(managed).length > 0
				? { frontmatter: { managed } }
				: undefined,
		},
	};
}

/**
 * Resolve the filename template for the leaf-bearing file entry.
 *
 * Falls back through several strategies (mirrors generation-engine's existing
 * `buildNoteData` filename-resolution logic):
 *   1. Explicit filename template if config.mapping.filename.template is set
 *   2. First frontmatter column as a last resort (template = `{<column>}.md`)
 *   3. `{id}.md` convention; engine will catch the missing-var error
 */
function resolveFilenameTemplate(config: LegacyImportRecipe): string {
	const filenameConfig = config.mapping?.filename;

	if (filenameConfig?.template) {
		// Existing template — pass through but ensure .md suffix
		const t = filenameConfig.template;
		return t.endsWith('.md') ? t : `${t}.md`;
	}

	// Fall back to first frontmatter column
	const fm = config.mapping?.frontmatter;
	if (fm && fm.length > 0) {
		return `{${fm[0].column}}.md`;
	}

	// Fall back to `id` column convention; engine will catch the missing-var error
	return `{id}.md`;
}
