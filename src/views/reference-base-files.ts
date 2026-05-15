/**
 * reference-base-files.ts — Phase 3 v0.1.6 (per Settled #2 + Ch 30)
 *
 * Inlined .base file templates that the plugin writes to the user's vault on
 * first run. Source-of-truth copies live at `templates/*.base` in the repo
 * for editor syntax highlighting + manual review. esbuild bundles `main.js`
 * as a single file, so we inline the strings here rather than file-read
 * at runtime.
 *
 * To update a template: edit the matching `templates/*.base` file in the repo,
 * then copy the contents to the matching constant in this file. (A future
 * codegen could automate this; v0.1.6 keeps the source-of-truth simple.)
 *
 * Idempotent first-run write: `writeReferenceBaseFiles` only creates files
 * that don't already exist — never overwrites user edits. To regenerate
 * defaults, the user deletes the file and reloads the plugin.
 */

import type { App } from 'obsidian';
import { TFile, normalizePath } from 'obsidian';
import type { DebugLog } from '../utils/debug';

/** Reference Coverage Matrix .base file content. Mirrors templates/coverage-matrix.base. */
export const REFERENCE_COVERAGE_MATRIX_BASE = `# Crosswalker Coverage Matrix — reference .base file (v0.1.6 Phase 3)
#
# Crosswalker shipped this on first plugin run. Idempotent: never
# overwrites your edits. Delete the file + reload the plugin to regenerate.
#
# Reference: SSSOM spec at https://w3id.org/sssom/

filters:
  and:
    - file.inFolder("_crosswalker/mappings")
    - 'file.ext == "md"'

formulas:
  pair: 'source_framework + " → " + target_framework'

properties:
  subject_id:
    displayName: "Subject"
  object_id:
    displayName: "Object"
  predicate_id:
    displayName: "STRM predicate"
  sssom_predicate:
    displayName: "SSSOM predicate"
  source_framework:
    displayName: "Source"
  target_framework:
    displayName: "Target"
  formula.pair:
    displayName: "Pair"

views:
  # Custom Crosswalker pivot view — registered by the plugin via
  # plugin.registerBasesView("crosswalker-pivot", ...).
  - type: crosswalker-pivot
    name: "Coverage matrix"
    config:
      rowsBy: "subject_id"
      colsBy: "object_id"
      cellOp: "count"
      empty: "gap"
      heatmap: false
      rowSort: "asc"
      colSort: "asc"

  # Bases-native fallback Table view — works even when the crosswalker-pivot
  # view is unavailable (Bases disabled, plugin uninstalled).
  - type: table
    name: "Mappings table"
    order:
      - file.name
      - subject_id
      - predicate_id
      - object_id
      - sssom_predicate
      - mapping_justification
      - confidence
    summaries:
      file.name: Filled
`;

/** Default first-run write target. */
export const COVERAGE_MATRIX_BASE_PATH = '_crosswalker/views/coverage-matrix.base';

/** Phase 4c: LLM authoring guide path. */
export const SKILL_MD_PATH = '_crosswalker/SKILL.md';

/**
 * LLM authoring guide for Crosswalker recipes — Phase 4c first-run write.
 *
 * Pattern modeled on Steph Ango's `kepano/obsidian-skills` repo: a single
 * SKILL.md per skill teaches LLMs (and humans) the syntax + conventions of
 * a specific Obsidian format. Crosswalker ships this so users can paste it
 * into Claude/ChatGPT and get back working recipe + ```base block YAML.
 *
 * Idempotent: never overwrites user edits. To regenerate, delete + reload.
 */
export const REFERENCE_SKILL_MD = `---
name: crosswalker-bases
description: Author Crosswalker queries via frontmatter-driven query notes. The plugin generates .base files and embeds them via Obsidian-native ![[file.base]] syntax. Use when working in Obsidian with the Crosswalker plugin and the Obsidian Bases plugin enabled, especially when inserting query views into notes for ontology / framework data (NIST, ISO, MITRE, CIS, SOC 2, etc.).
---

# Crosswalker — query authoring skill (Phase 4.5)

This skill teaches you how Crosswalker queries live in Obsidian. The query is **canonical frontmatter** on a user note; Crosswalker generates a \`.base\` file in \`_crosswalker/views/\`; the user note embeds the rendering via Obsidian-native \`![[<view_file>]]\` syntax (per [Obsidian Bases docs](https://help.obsidian.md/Plugins/Bases)).

## The three artifacts that make up a Crosswalker query

\`\`\`markdown
USER NOTE: My Coverage Analysis.md
─────────────────────────────────
---
crosswalker:                                          ← canonical truth (frontmatter)
  query_id: q-2026-05-15-a1b2c3d4
  recipe: nist-csf-coverage-matrix
  shape: pivot
  params:
    confidence_threshold: 0.7
  view_file: "_crosswalker/views/q-2026-05-15-a1b2c3d4.base"
  generated_at: 2026-05-15T20:55:00.000Z
  schema_version: 1
---

# My coverage analysis

Some prose...

![[_crosswalker/views/q-2026-05-15-a1b2c3d4.base]]   ← Bases-native embed (renders inline)
\`\`\`

The \`.base\` file at \`_crosswalker/views/q-2026-05-15-a1b2c3d4.base\` is **plugin-generated**. Don't hand-edit it — your changes will be overwritten on the next \`Crosswalker: Refresh query views\` (or plugin reload). Edit the **frontmatter** instead; the plugin regenerates the \`.base\` file.

## How to author a new query

1. **Open a note** where you want the query rendered (any markdown note with no \`crosswalker:\` block yet).
2. **Run \`Crosswalker: Insert query into note\`** from the command palette.
3. **Pick a recipe** from the modal (e.g. NIST CSF → 800-53 coverage matrix). Adjust exposed parameters inline if you want.
4. **Click Apply.** The picker writes the \`crosswalker:\` frontmatter, generates the \`.base\` file at \`_crosswalker/views/\`, and inserts the embed at your cursor. Done.

## How to edit an existing query

Two options:

- **Re-run the picker** on a note that already has \`crosswalker:\` frontmatter → the picker opens in UPDATE mode with current values pre-filled.
- **Hand-edit the \`crosswalker:\` frontmatter** directly. Run \`Crosswalker: Refresh query views\` to regenerate the \`.base\` file from the new params.

The frontmatter is the source of truth. The \`.base\` file is generated.

## Why this design

| Property | Why it matters |
|---|---|
| Frontmatter is queryable by Bases itself | "Show me every query I've ever made" is one Bases query over \`crosswalker.shape == "pivot"\` |
| Single source of truth | Edit frontmatter (or use the picker again); \`.base\` file regenerates. No drift. |
| Reusable across notes | Multiple notes can embed the same \`.base\` file via \`![[...]]\` |
| Survives plugin uninstall | Frontmatter + \`.base\` file are both plain text, readable without Crosswalker |
| Bases-native | \`![[file.base]]\` is the canonical Obsidian Bases embed syntax (not inline codeblocks) |

## Quick reference: the two things to know about the .base file syntax

1. **A \`.base\` file is YAML** (or an inline ` + '`' + `` + '`' + '`' + `base codeblock for backward compat), parsed by Obsidian's Bases plugin at render time. It declares \`filters\` (which files to query), optional \`formulas\` (computed columns), optional \`properties\` (display overrides), and \`views\` (how to render).
2. **Crosswalker adds new view types** via \`registerBasesView\`. The most useful is \`crosswalker-pivot\` (rows × cols × cells matrix). Bases-native view types (\`table\`, \`list\`, \`cards\`, \`calendar\`) work as documented in the Bases plugin.

## Minimal example — a pivot view of NIST CSF → 800-53 coverage

\`\`\`base
filters:
  and:
    - file.inFolder("_crosswalker/mappings/csf-to-800-53")
    - 'confidence >= 0.7'
views:
  - type: crosswalker-pivot
    name: "NIST CSF → 800-53 coverage matrix"
    config:
      rowsBy: "subject_id"
      colsBy: "object_id"
      cellOp: "count"
      empty: "gap"
      heatmap: true
\`\`\`

## Cross-domain example — NIST CSF (defensive) → MITRE ATT&CK (offensive)

\`\`\`base
filters:
  and:
    - file.inFolder("_crosswalker/mappings/csf-to-mitre")
    - 'confidence >= 0.7'
views:
  - type: crosswalker-pivot
    name: "NIST CSF → MITRE ATT&CK coverage"
    config:
      rowsBy: "subject_id"
      colsBy: "object_id"
      cellOp: "count"
      empty: "gap"
      heatmap: true
\`\`\`

## Bases-native table example — CIS Controls by family

\`\`\`base
filters:
  and:
    - file.inFolder("Frameworks/CIS-Controls-v8")
views:
  - type: table
    name: "CIS Controls by family"
    order:
      - family
      - id
      - title
\`\`\`

## Crosswalker view types — \`crosswalker-pivot\`

The \`crosswalker-pivot\` view renders a rows × cols × cells matrix from filtered Bases entries.

\`config\` fields:

| Field | Type | Purpose |
|---|---|---|
| \`rowsBy\` | property name | Frontmatter property used as the row axis |
| \`colsBy\` | property name | Frontmatter property used as the col axis |
| \`cellOp\` | string | Aggregation: \`count\` / \`count_distinct\` / \`sum\` / \`avg\` / \`min\` / \`max\` / \`first\` / \`last\` |
| \`cellOf\` | property name | Source field for non-count ops (e.g. for \`sum\`, the field to sum) |
| \`empty\` | string | Empty-cell mode: \`gap\` (blank) / \`blank\` (empty string) / \`zero\` |
| \`heatmap\` | boolean | Whether to color-shade cells by value |
| \`rowSort\` | string | \`asc\` / \`desc\` / \`none\` |
| \`colSort\` | string | \`asc\` / \`desc\` / \`none\` |

## Reserved view types (coming soon)

| Type | Status | Workaround |
|---|---|---|
| \`crosswalker-hierarchy\` | Reserved (renderer ships v0.1.7-v0.1.8). | Use \`type: table\` with \`order: [parent, id, title]\` for now — Bases native fallback. |
| \`crosswalker-graph\` | v0.2+ | Use Bases-native or \`type: cards\`. |
| \`crosswalker-timeline\` | v0.2+ | Use Bases-native \`type: calendar\` or \`type: table\` with date \`order\`. |

## Common gotchas

1. **YAML quoting**: predicates like \`is_equivalent_to\` are bare strings and don't need quotes. But values with colons, hyphens at the start, or special chars DO need quotes (\`":0.7"\`, \`"AC-2(1)"\`).
2. **Folder filters**: \`file.inFolder(...)\` accepts a vault-relative folder path. To filter by file path pattern instead, use \`file.path.startsWith(...)\`.
3. **Anti-join "orphan" queries**: use \`length(<linked_property>) == 0\` to find notes with no incoming references in that property.
4. **Custom view rendering when Crosswalker is disabled**: declare a fallback Bases-native view (e.g. \`type: table\`) AFTER the \`crosswalker-pivot\` view — Bases shows both in the view picker; users can switch.

## Where Crosswalker writes its data in your vault

| Path | What's there |
|---|---|
| \`Frameworks/NIST-800-53/\` (and similar) | Concept notes — one per control/technique/etc., imported from your CSV |
| \`_crosswalker/mappings/<source>-to-<target>/\` | Junction notes — one per crosswalk relationship, imported from SSSOM TSV |
| \`_crosswalker/views/\` | Plugin-emitted reference .base files (idempotent first-run) |
| \`_crosswalker/recipes/\` | User-authored recipe JSONs (picker reads these) |
| \`_crosswalker/SKILL.md\` | This file |
| \`crosswalker-debug.log\` | Wide-event NDJSON debug stream (\`cat | jq\` to read) |

## When to use Crosswalker views vs Bases-native

| Use case | View type |
|---|---|
| Cross-framework coverage matrix | \`crosswalker-pivot\` (count/count_distinct/sum) |
| Density heatmap | \`crosswalker-pivot\` with \`heatmap: true\` |
| Flat list of controls by family | Bases \`type: list\` or \`type: table\` |
| Per-control evidence cards | Bases \`type: cards\` |
| Mapping detail browser | Bases \`type: table\` with \`order:\` cols |
| Hierarchy navigation (renderer v0.1.7+) | Bases \`type: table\` ordered by \`parent, id\` for now |

## Recipe schema (for plugin-authored recipes in \`_crosswalker/recipes/*.json\`)

The Crosswalker plugin's recipe picker reads JSON recipes that include a \`query:\` block. The block declares the abstract view shape; the picker translates it to ` + '`' + `` + '`' + '`' + `base codeblock YAML. The schema lives at [\`spec/recipe.schema.json\`](https://github.com/cybersader/Crosswalker/blob/main/spec/recipe.schema.json).

Key fields per the v0.1.6 schema:

- \`recipe\` — stable ID
- \`source.ontology\` — the data source (matches what the import wizard wrote)
- \`target.layout\` — how generation lays out Tier 1 markdown (folder/file/heading/tag/wikilink mechanisms)
- \`query.shape\` — \`pivot\` / \`table\` / \`list\` / \`hierarchy\` / \`cards\`
- \`query.primitives\` — the abstract WHERE/ROW/COL/CELL — schema-only, not user-editable inline
- \`query.params\` — user-editable parameters (these ARE what the picker exposes inline)

## Reference

- [Obsidian Bases plugin docs](https://help.obsidian.md/Plugins/Bases)
- [Crosswalker repo](https://github.com/cybersader/Crosswalker)
- [Crosswalker docs](https://cybersader.github.io/crosswalker/)
- [SSSOM (Simple Standard for Sharing Ontological Mappings)](https://w3id.org/sssom/)
`;

/**
 * Write reference .base files to the vault on first plugin run. Idempotent —
 * skips files that already exist. Returns the list of paths actually created.
 *
 * Per Settled #3 ("_crosswalker/ underscore folder convention"): output
 * folder uses underscore prefix so Obsidian indexes it (dot-prefix folders
 * would be hidden). Per Settled #2: ships exactly one reference .base in
 * v0.1.6 (Coverage Matrix); v0.2+ adds siblings.
 */
export async function writeReferenceBaseFiles(app: App, debug?: DebugLog): Promise<string[]> {
	const created: string[] = [];
	const writes: Array<{ path: string; content: string }> = [
		{ path: COVERAGE_MATRIX_BASE_PATH, content: REFERENCE_COVERAGE_MATRIX_BASE },
		// Phase 4c: LLM authoring guide — `_crosswalker/SKILL.md`
		{ path: SKILL_MD_PATH, content: REFERENCE_SKILL_MD },
	];

	for (const { path, content } of writes) {
		const normalized = normalizePath(path);
		const existing = app.vault.getAbstractFileByPath(normalized);
		if (existing instanceof TFile) {
			// File exists; do not overwrite (preserves user edits).
			continue;
		}

		try {
			// Ensure parent folder exists.
			const parentPath = normalized.split('/').slice(0, -1).join('/');
			if (parentPath && !app.vault.getAbstractFileByPath(parentPath)) {
				await app.vault.createFolder(parentPath);
			}
			await app.vault.create(normalized, content);
			created.push(normalized);
			debug?.info('view', 'reference-base-written', `Reference .base file written: ${normalized}`, { path: normalized });
		} catch (err) {
			const msg = err instanceof Error ? err.message : String(err);
			debug?.warn('view', 'reference-base-write-failed', `Failed to write reference .base file ${normalized}: ${msg}`, { path: normalized, error: msg });
			// Continue with the rest; one failure shouldn't block other writes.
		}
	}

	return created;
}
