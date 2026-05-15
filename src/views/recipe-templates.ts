/**
 * recipe-templates.ts — Phase 4b reference templates per shipped recipe.
 *
 * Each shipped recipe in `recipes/v0-1/*.json` is paired with a `` ```base ``
 * codeblock template here. The Phase 4b picker uses these to translate
 * recipe + user params → the block text that gets inserted at cursor.
 *
 * Templates use `{{param_name}}` Mustache-style placeholders. The picker's
 * parameter editor's output (`Record<string, unknown>`) flows through
 * `renderRecipeTemplate(id, params)` to produce the final block text.
 *
 * NOTE: These templates are intentionally MINIMAL — they include the
 * essential `views:` block for the shape but skip the heavy comments from
 * `templates/coverage-matrix.base`. Comments live in the .base file shipped
 * by Phase 3's first-run write; the picker's inserted block is meant to be
 * concise inline content in a user's note.
 */

const TEMPLATES: Record<string, string> = {
	'nist-csf-coverage-matrix': `filters:
  and:
    - file.inFolder("_crosswalker/mappings/csf-to-800-53")
    - 'confidence >= {{confidence_threshold}}'
views:
  - type: crosswalker-pivot
    name: "NIST CSF → 800-53 coverage matrix"
    config:
      rowsBy: "subject_id"
      colsBy: "object_id"
      cellOp: "count"
      empty: "gap"
      heatmap: true`,

	'nist-csf-to-mitre-coverage': `filters:
  and:
    - file.inFolder("_crosswalker/mappings/csf-to-mitre")
    - 'confidence >= {{confidence_threshold}}'
{{#tactic_filter}}    - 'tactic == "{{tactic_filter}}"'
{{/tactic_filter}}views:
  - type: crosswalker-pivot
    name: "NIST CSF → MITRE ATT&CK coverage"
    config:
      rowsBy: "subject_id"
      colsBy: "object_id"
      cellOp: "count"
      empty: "gap"
      heatmap: true`,

	'crosswalk-density-by-framework': `filters:
  and:
    - file.inFolder("_crosswalker/mappings")
formulas:
  pair: 'source_framework + " → " + target_framework'
views:
  - type: table
    name: "Crosswalk density by framework pair"
    order:
      - formula.pair
      - file.name
    summaries:
      file.name: Count`,

	'orphan-controls-no-evidence': `filters:
  and:
    - file.inFolder("Frameworks/NIST-800-53")
    - 'length(evidence) == 0'
views:
  - type: table
    name: "Orphan controls — no evidence"
    order:
      - control_id
      - control_name
      - control_family`,

	'controls-by-family-list': `filters:
  and:
    - file.inFolder("Frameworks/CIS-Controls-v8")
{{#family_filter}}    - 'family == "{{family_filter}}"'
{{/family_filter}}views:
  - type: list
    name: "CIS Controls by family"
    order:
      - family
      - id`,

	'skos-hierarchy-narrower': `filters:
  and:
    - file.inFolder("Frameworks/MITRE-ATT&CK")
views:
  # Hierarchy renderer ships in v0.1.7-v0.1.8 — Bases falls back to
  # table view until then. The data + structure are correct; only the
  # custom visualization is "renderer coming soon".
  - type: table
    name: "MITRE ATT&CK tactic → technique hierarchy"
    order:
      - tactic
      - parent
      - id
      - title`,
};

/**
 * Get the raw template for a recipe ID, or null if no template is registered.
 */
export function getRecipeTemplate(recipeId: string): string | null {
	return TEMPLATES[recipeId] ?? null;
}

/**
 * Render a recipe template with user-supplied param values. Supports:
 *   - Simple substitution: `{{name}}` → params[name]
 *   - Section conditional: `{{#name}}...{{/name}}` → block content only if
 *     params[name] is truthy (non-empty string, non-zero number, true)
 *
 * Unknown params in the template (no value in `params`) substitute as empty
 * string — the picker's UI should ensure all params have at least their
 * default, so unknown-param case is defensive.
 */
export function renderRecipeTemplate(
	recipeId: string,
	params: Record<string, unknown>,
): string | null {
	const template = getRecipeTemplate(recipeId);
	if (template === null) return null;
	return interpolate(template, params);
}

function interpolate(template: string, params: Record<string, unknown>): string {
	let out = template;

	// 1. Section conditionals: {{#name}}...{{/name}}
	//    Block content only renders if params[name] is truthy.
	out = out.replace(/\{\{#([\w_]+)\}\}([\s\S]*?)\{\{\/\1\}\}/g, (_match, name, block) => {
		const v = params[name];
		const truthy =
			(typeof v === 'string' && v.length > 0) ||
			(typeof v === 'number' && v !== 0) ||
			(typeof v === 'boolean' && v) ||
			(Array.isArray(v) && v.length > 0);
		return truthy ? interpolatePlain(block, params) : '';
	});

	// 2. Plain substitutions: {{name}}
	out = interpolatePlain(out, params);

	return out;
}

function interpolatePlain(s: string, params: Record<string, unknown>): string {
	return s.replace(/\{\{([\w_]+)\}\}/g, (_match, name) => {
		const v = params[name];
		if (v === undefined || v === null) return '';
		return String(v);
	});
}
