# Starter recipes

This folder contains **starter recipes** — minimal, schema-conformant Crosswalker import recipes that demonstrate each Tier 1 shape and serve as templates for authoring your own.

All recipes here validate against [`spec/recipe.schema.json`](../../spec/recipe.schema.json). Outputs validate against [`spec/tier1.schema.json`](../../spec/tier1.schema.json).

## Inventory

| Recipe | Tier 1 kind | What it imports | Source ontologies | Target ontology |
|---|---|---|---|---|
| `nist-csf-to-800-53-crosswalk.json` | `crosswalk-edge` | NIST CSF subcategory -> 800-53 control mappings | `nist-csf` | `nist` (800-53) |
| `iso27001-to-800-53-crosswalk.json` | `crosswalk-edge` | ISO 27001 control -> 800-53 control mappings | `iso27001` | `nist` (800-53) |
| `evidence-junction-notes.json` | `junction-note` | Evidence-link triples (concept, predicate, evidence_doc) | any concept ontology | any evidence path |

## How recipes generalize across frameworks

The `crosswalk-edge` recipe shape is **generic over framework pairs**. Both starter crosswalk recipes have identical layout + frontmatter shape; only the source ontology + tag path + folder name differ. To author a recipe for a new framework pair (CIS <-> 800-53, MITRE <-> 800-53, CRI Profile <-> NIST CSF, etc.):

1. Copy one of the starter crosswalk recipes
2. Update `recipe`, source `ontology`, layout `template` (folder), and tag path
3. Confirm your source CSV has columns: `subject_id`, `predicate_id`, `object_id` (and optional `match_type`, `mapping_justification`, `mapping_provider`)
4. Run via the plugin's native-recipe import path (`runImportFromRecipe`)

The `junction-note` recipe is generic over **any concept ontology**. Whether subjects are NIST controls, MITRE techniques, CIS safeguards, ISO clauses, or domain-specific concepts (biology taxa, legal statutes, product features), the same recipe shape applies — change the wikilink folder and predicate values to match your domain.

## Concept-note imports

For concept-note imports (the standard "import a framework's catalog into Obsidian as folders + notes" workflow), use the **import wizard** instead. The wizard handles column-role mapping for CSV/XLSX/JSON files; under the hood it builds a Recipe with `kind: "concept"` (the default) and runs the same render() pipeline.

| Framework | Source data | Wizard flow |
|---|---|---|
| NIST 800-53 r5 | NIST_SP-800-53_rev5_catalog.csv | Settings -> Import structured data -> select CSV -> column roles -> generate |
| NIST CSF 2.0 | NIST_CSF_2.0.csv | same |
| MITRE ATT&CK Enterprise | enterprise-attack.csv (from STIX export) | same |
| CIS Controls v8 | CIS_Controls_v8.xlsx | same (XLSX support shipping in a later milestone) |
| ISO 27001:2022 | controls.csv | same |
| CRI Profile 2.0 | CRI_Profile_2.0.xlsx | same |

Native concept-note recipes can also be authored directly (without the wizard) by writing a recipe JSON with `kind: "concept"` (or omitting `kind` since `concept` is the default) and running via `runImportFromRecipe`.

## Predicate vocabulary

Crosswalk-edge `predicate_id` is enforced against the [STRM (NIST IR 8477) closed enum](https://crosswalker.dev/reference/registry/strm/):

- `is_equivalent_to`
- `is_broader_than`
- `is_narrower_than`
- `is_approximate_to`
- `intersects_with`
- `no_relationship`

Junction-note `predicate` is open-string (no enum constraint); recipe authors pick from their workflow's vocabulary. Convention: `evidences`, `covers`, `partially_covers`, `attests`, `reviews`, etc.

## See also

- [Recipe schema reference](https://cybersader.github.io/crosswalker/agent-context/v0-1-schema-spec/)
- [Tier 1 schema reference](https://cybersader.github.io/crosswalker/agent-context/v0-1-schema-spec/)
- [STRM predicate registry](https://cybersader.github.io/crosswalker/reference/registry/strm/)
- [SSSOM envelope shape](https://cybersader.github.io/crosswalker/reference/registry/sssom/)
