---
title: "Ch 31 deliverable B: Recipe `query:` block schema design — data-only typed tree with JSONata-only string expressions"
description: "Fresh-agent research deliverable B for Challenge 31. Adopt a data-only, shape-discriminated `query:` block (top-level keys: `schema_version`, `shape`, `primitives`, `empty_cell`, `aggregations`, `output`, `provenance`, `user_edited`) that compiles down to Tier 2 helpers (`crosswalkBetween`, `closureFromConcept`, `getConceptsByOntology`) — never raw SQL, never a bespoke Crosswalker query language. Mirrors dbt MetricFlow / Cube.dev / LookML pattern. JSON Schema 2020-12 with `if`/`then`/`else` discriminator. JSONata is the ONLY string-typed expression language allowed (used in `filter:` slot) — substrate-portable, declarative, JSON-native. Includes 5 worked reference recipes, lifecycle integration with Ch 28 three-way merge as single typed sub-tree, recommendations for two new Tier 2 helpers (`densityBetween`, `bucketEvents`), and explicit thresholds for v1.0 → v1.1 schema evolution. ROBOT/OBO Foundry cited as the most architecturally relevant precedent for verb-based ontology pipelines."
tags: [research, deliverable, recipe-schema, query-block, json-schema, jsonata, dbt-metricflow, cube-dev, robot-obo, schemaver, ch-31, deliverable-b]
date: 2026-05-08
sidebar:
  label: "Ch 31b · JSONata typed tree"
  order: -20260508.2
---

:::tip[Origin and lifecycle]
Fresh-agent research deliverable produced 2026-05-08 in response to [Challenge 31: Recipe `query:` block schema design](/crosswalker/agent-context/zz-challenges/31-recipe-query-block-schema-design/). One of two parallel deliverables ([A: shape-dispatched data-only schema](/crosswalker/agent-context/zz-research/2026-05-08-challenge-31-deliverable-a-shape-dispatched-data-only/)). Both converge strongly on the architecture (data-only schema; `shape` discriminator; per-shape primitive sub-schemas; SchemaVer versioning; lifecycle integration with Ch 28). This deliverable uses `if`/`then`/`else` discriminator (vs A's `oneOf` + `const`) and explicitly commits to JSONata as the only allowed string-expression language. Preserved verbatim.
:::

# Challenge 31 Deliverable — Recipe `query:` Block Schema Design

**Path:** `docs/.../zz-research/2026-05-08-challenge-31-deliverable-a-recipe-query-block-schema.md`
**Status:** Locks the additive `query:` schema for v0.1.6 (D8 lock prerequisite).
**Author role:** Research/synthesis output for the Crosswalker maintainers.

---

## TL;DR

- **Adopt a *data-only*, shape-discriminated `query:` block** (top-level keys: `schema_version`, `shape`, `primitives`, `empty_cell`, `aggregations`, `output`, `provenance`, `user_edited`) that compiles down to Tier 2 helpers (`crosswalkBetween`, `closureFromConcept`, `getConceptsByOntology`) — never raw SQL, never a bespoke Crosswalker query language. This mirrors the dbt MetricFlow / Cube.dev / LookML pattern of *declarative semantic primitives + a runtime that compiles them*, which the literature treats as the dominant industry pattern for portable analytics across substrates.
- **Versioning is `schema_version: "1.0.0"` (SchemaVer-style, hyphenated MAJOR-REVISION-ADDITION semantics adapted to the SemVer string format)**, with `additionalProperties: true` at the top level so v0.1.7's codeblock processor and any future shapes can be added without breaking existing recipes; the JSON Schema uses `if/then/else` over `shape` to enforce *primitive presence* per shape.
- **Lifecycle composition is settled**: the `query:` block participates in Ch 28's three-way merge as a single typed sub-tree (system base + user overlay + community PR), with `user_edited: true` set when the user touches *any* leaf inside `query:` and `provenance.source` recorded at the block level — not per primitive — so merges remain reviewable.

---

## Executive Summary

Challenge 31 fills the only remaining gap in the recipe spec: today `spec/recipe.schema.json` describes **emission** (the Ch 22 grammar of folder/file/heading/tag/wikilink) but says nothing about **what to query**. Without a `query:` block, the v0.1.6 `crosswalkerPivot` Bases view cannot be parameterized by recipe, and the v0.1.7 codeblock processor has no shared substrate to render from. The brief commits us to a 7-section investigation: (1) cross-reference adjacent declarative-query systems, (2) author the JSON Schema, (3) define versioning, (4) write reference recipes, (5) settle the data-vs-code boundary, (6) reconcile with Ch 28 lifecycle, (7) validate against the 7 candidate primitives.

The decision this deliverable locks is: **`query:` is a discriminated union over the six `view-shapes`** (table / list / pivot / graph / hierarchy / timeline), each shape declaring a fixed schema for its required `primitives` (rows/cols/cell, nodes/edges/start, root/predicate/depth, axis/event-source, …). The block is **declarative data**: no inline SQL, no inline JSONata, no inline Bases-DSL. The runtime *compiles* it to whichever substrate is active (Bases for v0.1.6, codeblock for v0.1.7, sqlite-wasm later). This is the same architectural choice dbt Labs made when they pulled metric definitions out of SQL and into MetricFlow YAML, the same choice Cube.dev made with `cubes:`/`measures:`/`dimensions:`, and the same choice LookML implicitly makes by wrapping `sql:` snippets inside typed `dimension:`/`measure:` records. Crosswalker borrows the *pattern*, not the tools.

The biggest risk surfaced by the research: **don't reinvent**. The closest precedent for our use case is not BI semantic layers but **ROBOT/OBO Foundry's YAML-driven ontology pipelines**, which decompose ontology operations into named verbs (`reason`, `query`, `extract`, `measure`) chained by a YAML configuration — exactly the shape Crosswalker's Tier 2 helpers already take. The schema below preserves that lineage.

---

## Section 1 — Cross-Reference of Declarative-Query Schemas in Adjacent Ecosystems

### 1.1 Cross-reference matrix

| System | Declares shape? | Primitives unit | Aggregation? | Versioning? | Boundary: query vs presentation |
|---|---|---|---|---|---|
| **SPARQL CONSTRUCT** (W3C) | No (always graph→graph) | Triple patterns + WHERE clause | Via SELECT subqueries / aggregates in 1.1 | Spec-versioned (SPARQL 1.1) | Pure query; presentation is downstream |
| **GraphQL** (spec.graphql.org) | Implicit (selection set shape ≈ result shape) | Typed fields + arguments + fragments | None native (resolvers do it) | Schema introspection + SDL versioning convention | Strong: query is selection, presentation is client-side |
| **dbt model YAML** | No (model = SQL file; YAML is metadata) | `name`/`columns`/`config`/`tests` + `ref()` | In SQL only | `version: 2` at file head; per-resource `version:` | Weak: SQL inside model, YAML around it |
| **dbt MetricFlow** (semantic layer) | Yes (metric `type`: simple, ratio, cumulative, derived, conversion) | `semantic_models` w/ `entities` + `dimensions` + `measures`; `metrics` reference these | First-class (`agg: sum/count/avg/min/max/count_distinct/median/percentile`) | dbt-semantic-interfaces repo pinned to dbt versions | Strong: metric is data; SQL is generated |
| **Cube.dev** (cube.dev) | No explicit "shape" but `cubes:` + `views:` + `pre_aggregations:` carve roles | `dimensions:`, `measures:`, `joins:`, `segments:`, `hierarchies:` | First-class (`type: count/sum/avg/count_distinct/min/max/number`) plus calculated measures | Schema is JS/YAML, no formal version field, runtime is versioned | Strong: YAML defines model, presentation is downstream BI |
| **Looker LookML** | Yes-ish (`view`, `explore`, `dashboard`, `model` are distinct file types) | `dimension:`, `measure:`, `filter:`, `parameter:`, `join:` | First-class (`type: count/count_distinct/sum/average/min/max/median/percentile/percent_of_previous/number/list`) | Project-level, IDE-managed | Medium: `sql:` snippets allowed inside fields (locks to SQL) |
| **Datasette `metadata.yaml`** | No (canned queries are raw SQL) | `databases.<db>.queries.<name>.sql` + `params` + `title` | In SQL only | None | Weak: presentation hints (`facets`, `sortable_columns`, `size`, `fragment`) co-exist with SQL |
| **ROBOT YAML / OBO Foundry ODK** | Implicit (verbs: `reason`, `query`, `extract`, `merge`, `measure`, `template`, `report`) | Per-command params (`--reasoner`, `--method`, `--axiom-generators`, `template_options`, `module_type`) | Via `measure` command + standard reports | ODK config has implicit version via container tag | Strong: YAML drives a CLI pipeline; SPARQL files are referenced, not inlined |
| **Obsidian Bases (`.base` YAML)** | Yes (`views: [{type: table, …}, {type: cards, …}, …]`) | `filters:` (recursive AND/OR/NOT), `formulas:`, view-level `properties:`, `groupBy`, `sort` | Limited (`count`, planned `sum/avg`) | None (early beta) | Strong: filters declarative, presentation is the view block |

### 1.2 Per-system synthesis (the lessons that shape our design)

**SPARQL CONSTRUCT** (`w3c.org/TR/sparql11-query/#construct`) returns an RDF graph by *templating* triples from WHERE-clause bindings. The lesson: a query is "match a pattern, project into a target shape". Our `primitives.rows`/`cols`/`cell` are exactly the projection template, and `shape:` chooses which template to fill. We must **not** require users to write SPARQL; we use the *pattern of separation* (pattern + projection), not the syntax.

**GraphQL** (`spec.graphql.org`) ties result shape to query shape: the selection set *is* the response schema. The lesson: typed selection beats stringly-typed query bodies. Our `primitives` are a typed selection over the Crosswalker concept graph. We borrow GraphQL's "operation type as discriminator" for our `shape:` enum.

**dbt model YAML** (`docs.getdbt.com/reference/model-configs`) uses YAML purely as *metadata* around SQL files. Anti-pattern for us: it conflates description with logic. We reject this for v0.1.6.

**MetricFlow** (`docs.getdbt.com/docs/build/about-metricflow`) is the closest large-scale precedent. Semantic models declare `entities` (join keys ≈ ontologies in our world), `dimensions` (group/slice ≈ axes), and `measures` (aggregation rules ≈ cell ops). Metrics then reference measures with a `type:` discriminator (`simple`/`ratio`/`cumulative`/`derived`/`conversion`). This is essentially the architecture we adopt: a discriminator on shape, fixed slots per shape, all aggregation through a closed enum (extensible via plugin registry later).

**Cube.dev** (`cube.dev/docs`) demonstrates that a YAML semantic model can be authored in <30 lines and still drive a full SQL generator. Critically, Cube allows `sql: |` blocks for dimensions, which in their world is necessary because the substrate is always SQL — *we don't have that constraint*, so we can keep our schema cleaner by forbidding inline `sql:` and instead exposing `op:`, `edge:`, `predicate:` fields that the engine maps to substrate calls.

**LookML** (`cloud.google.com/looker/docs/lookml-quick-reference`) splits files into `view`/`explore`/`model`/`manifest`. Each `dimension:` / `measure:` is a typed record with a `type:` enum (`count`, `sum`, `count_distinct`, `min`, `max`, `average`, `median`, `percentile`, `percent_of_previous`, `number`, `list`, …). Lesson: a closed-but-extensible aggregation enum is the right abstraction. We adopt the same enum names for cross-tool familiarity.

**Datasette `metadata.yaml`** (`docs.datasette.io/en/stable/metadata.html`) embeds raw SQL in `queries:`. Anti-pattern for us — exactly what Ch 27 rejects. Note Simon Willison himself (issue #2143 in `simonw/datasette`) has flagged that Datasette's metadata file became "a kitchen sink", which is a useful warning against scope creep in a `query:` block.

**ROBOT / OBO Foundry ODK** (`robot.obolibrary.org`) is *the* relevant precedent because ROBOT's whole model is "ontology operations chained from YAML/Makefile". The `reason`/`query`/`extract`/`measure` commands map almost 1-to-1 onto Crosswalker's Tier 2 helpers. Lesson: name verbs after operations, not data shapes; let the recipe declare *which verb* and *what arguments*, not the imperative steps.

**Obsidian Bases** (`help.obsidian.md/bases/syntax`) is the substrate we ship to in v0.1.6. The `.base` YAML file already commits to a `views: [{type, filters, formulas, properties, groupBy, sort}]` schema. Our `query:` block must produce a `.base` file at `output.target_path`, which means our `shape:` enum and `primitives:` slots must have a clean projection into the Bases schema. The brief's example (`base_view: crosswalkerPivot`, `target_path: "_crosswalker/views/coverage-matrix.base"`) confirms this design intent.

---

## Section 2 — JSON Schema for the `query:` block (Draft 2020-12)

### 2.1 Design decisions

1. **Discriminator** is `shape` (an enum over the six view-shapes). JSON Schema 2020-12's `if`/`then`/`else` (a closed set of branches inside an `allOf`) is the standard way to express discriminated unions and is fully supported by AJV. Per `json-schema.org/understanding-json-schema/reference/conditionals`, this is the recommended pattern for "applies different constraints to various properties based on the value of another property".
2. **`primitives`** is an object whose required keys depend on `shape`. We do not use `oneOf` over `primitives` directly because AJV produces clearer errors with the `if`/`then` pattern (`learnjsonschema.com/2020-12/applicator/if/`).
3. **`output`** is required for all shapes, since every recipe must produce *some* artifact (a `.base` file, a codeblock target, etc.). It carries `base_view`, `target_path`, and an optional `format` enum.
4. **`empty_cell`** is first-class with enum `gap | blank | zero` — a deliberate UX commitment from the brief.
5. **`aggregations`** is a top-level object that *names* aggregation expressions (DRY pattern from MetricFlow), so the `cell.op` field can either be an enum literal or a `$ref` to a named aggregation. v1.0 keeps it simple — only the literal enum is used in reference recipes — but the slot is reserved.
6. **Top-level `additionalProperties: true`** for forward-compatibility with v0.1.7 (codeblock processor will add a sibling `body:`/`codeblock:` field). **`primitives.additionalProperties: false`** within each shape branch, because primitives are the load-bearing structure and unknown keys there usually indicate a typo.
7. **`schema_version`** is a SemVer string (`"1.0.0"`) — but we follow SchemaVer semantics (snowplow.io/blog/introducing-schemaver-for-semantic-versioning-of-schemas): MAJOR for breaking, MINOR for additive-but-meaningful, PATCH for cosmetic. We use the SemVer punctuation (dots) for ecosystem compatibility while documenting the SchemaVer rules in the comment block.

### 2.2 The schema (canonical, AJV-validatable)

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://crosswalker.dev/spec/recipe.query.schema.json",
  "title": "Crosswalker Recipe `query:` Block",
  "description": "Additive sub-schema for the `query:` field on a recipe. Discriminated by `shape` over the six view-shapes (Ch 30). Compiles to Tier 2 helpers (Ch 27); never embeds substrate-specific code (Ch 27, Ch 31 anti-patterns).",
  "type": "object",
  "required": ["schema_version", "shape", "primitives", "output"],
  "additionalProperties": true,
  "properties": {
    "schema_version": {
      "type": "string",
      "pattern": "^\\d+\\.\\d+\\.\\d+$",
      "description": "SemVer string. Semantics follow SchemaVer: MAJOR=breaking, MINOR=additive, PATCH=cosmetic. v1.0.0 is the initial lock from Ch 31."
    },
    "shape": {
      "type": "string",
      "enum": ["table", "list", "pivot", "graph", "hierarchy", "timeline"],
      "description": "View shape (Ch 30). Discriminator for the `primitives` sub-schema."
    },
    "primitives": {
      "type": "object",
      "description": "Shape-specific primitives. See `if/then` branches below. `additionalProperties:false` is enforced per branch to catch typos."
    },
    "empty_cell": {
      "type": "string",
      "enum": ["gap", "blank", "zero"],
      "default": "gap",
      "description": "How to render cells with no contributing edges. `gap` = visual gap (no DOM); `blank` = empty cell; `zero` = numeric zero."
    },
    "aggregations": {
      "type": "object",
      "description": "Optional named aggregation expressions, referenced from `primitives.cell.op` via `{ $ref: '#/aggregations/<name>' }`. Reserved for v1.1+; v1.0 uses inline `op:` enum.",
      "additionalProperties": {
        "type": "object",
        "required": ["op"],
        "properties": {
          "op": { "$ref": "#/$defs/aggOp" },
          "edge": { "$ref": "#/$defs/edgePredicate" },
          "filter": { "type": "string", "description": "JSONata expression evaluated against each candidate edge. Substrate-neutral." }
        }
      }
    },
    "output": {
      "type": "object",
      "required": ["target_path"],
      "additionalProperties": false,
      "properties": {
        "base_view": {
          "type": "string",
          "description": "Name of the registered Bases view (e.g. `crosswalkerPivot`, `crosswalkerGraph`). Optional in v1.0; required when `format == 'base'`."
        },
        "target_path": {
          "type": "string",
          "minLength": 1,
          "description": "Vault-relative path of the emitted artifact (e.g. `_crosswalker/views/coverage-matrix.base`)."
        },
        "format": {
          "type": "string",
          "enum": ["base", "codeblock", "markdown_table", "json"],
          "default": "base",
          "description": "Emission substrate. `base` is the v0.1.6 default; `codeblock` is the v0.1.7 follow-on."
        }
      }
    },
    "provenance": {
      "type": "object",
      "additionalProperties": false,
      "properties": {
        "source": { "type": "string", "enum": ["system", "user", "community"] },
        "generated_at": { "type": "string", "format": "date-time" },
        "generator": { "type": "string", "description": "Tool ID + version that produced this block, e.g. 'crosswalker@0.1.6'." }
      }
    },
    "user_edited": {
      "type": "boolean",
      "default": false,
      "description": "Set by the merge engine when any leaf under `query:` differs from the system base. Triggers Ch 28 three-way merge on next regeneration."
    }
  },
  "allOf": [
    {
      "if": { "properties": { "shape": { "const": "pivot" } } },
      "then": {
        "properties": {
          "primitives": {
            "type": "object",
            "required": ["rows", "cols", "cell"],
            "additionalProperties": false,
            "properties": {
              "rows": { "$ref": "#/$defs/axisSelector" },
              "cols": { "$ref": "#/$defs/axisSelector" },
              "cell": { "$ref": "#/$defs/cellSpec" }
            }
          }
        }
      }
    },
    {
      "if": { "properties": { "shape": { "const": "table" } } },
      "then": {
        "properties": {
          "primitives": {
            "type": "object",
            "required": ["source", "columns"],
            "additionalProperties": false,
            "properties": {
              "source": { "$ref": "#/$defs/axisSelector" },
              "columns": {
                "type": "array",
                "minItems": 1,
                "items": { "$ref": "#/$defs/columnSpec" }
              },
              "filter": { "$ref": "#/$defs/filterExpr" },
              "sort": {
                "type": "array",
                "items": {
                  "type": "object",
                  "required": ["field"],
                  "properties": {
                    "field": { "type": "string" },
                    "order": { "type": "string", "enum": ["asc", "desc"], "default": "asc" }
                  }
                }
              }
            }
          }
        }
      }
    },
    {
      "if": { "properties": { "shape": { "const": "list" } } },
      "then": {
        "properties": {
          "primitives": {
            "type": "object",
            "required": ["source", "label"],
            "additionalProperties": false,
            "properties": {
              "source": { "$ref": "#/$defs/axisSelector" },
              "label": { "$ref": "#/$defs/fieldSelector" },
              "filter": { "$ref": "#/$defs/filterExpr" },
              "sort": {
                "type": "array",
                "items": {
                  "type": "object",
                  "required": ["field"],
                  "properties": {
                    "field": { "type": "string" },
                    "order": { "type": "string", "enum": ["asc", "desc"], "default": "asc" }
                  }
                }
              }
            }
          }
        }
      }
    },
    {
      "if": { "properties": { "shape": { "const": "graph" } } },
      "then": {
        "properties": {
          "primitives": {
            "type": "object",
            "required": ["nodes", "edges"],
            "additionalProperties": false,
            "properties": {
              "nodes": { "$ref": "#/$defs/axisSelector" },
              "edges": {
                "type": "object",
                "required": ["predicate"],
                "additionalProperties": false,
                "properties": {
                  "predicate": { "$ref": "#/$defs/edgePredicate" },
                  "direction": { "type": "string", "enum": ["out", "in", "both"], "default": "both" }
                }
              },
              "start": { "$ref": "#/$defs/conceptCURIE" },
              "max_depth": { "type": "integer", "minimum": 1, "default": 3 }
            }
          }
        }
      }
    },
    {
      "if": { "properties": { "shape": { "const": "hierarchy" } } },
      "then": {
        "properties": {
          "primitives": {
            "type": "object",
            "required": ["root", "predicate"],
            "additionalProperties": false,
            "properties": {
              "root": { "$ref": "#/$defs/conceptCURIE" },
              "predicate": { "$ref": "#/$defs/edgePredicate" },
              "depth": { "type": "integer", "minimum": 1, "default": 5 },
              "leaf_aggregation": { "$ref": "#/$defs/cellSpec" }
            }
          }
        }
      }
    },
    {
      "if": { "properties": { "shape": { "const": "timeline" } } },
      "then": {
        "properties": {
          "primitives": {
            "type": "object",
            "required": ["axis", "event_source"],
            "additionalProperties": false,
            "properties": {
              "axis": {
                "type": "object",
                "required": ["field"],
                "additionalProperties": false,
                "properties": {
                  "field": { "$ref": "#/$defs/fieldSelector" },
                  "granularity": {
                    "type": "string",
                    "enum": ["day", "week", "month", "quarter", "year"],
                    "default": "month"
                  },
                  "range": {
                    "type": "object",
                    "properties": {
                      "from": { "type": "string", "format": "date-time" },
                      "to": { "type": "string", "format": "date-time" }
                    }
                  }
                }
              },
              "event_source": { "$ref": "#/$defs/axisSelector" },
              "bucket_aggregation": { "$ref": "#/$defs/cellSpec" }
            }
          }
        }
      }
    }
  ],
  "$defs": {
    "aggOp": {
      "type": "string",
      "enum": ["count", "count_distinct", "sum", "avg", "min", "max", "density", "exists", "first", "last"],
      "description": "Closed-but-extensible aggregation operator. Names align with LookML/Cube.dev/MetricFlow for cross-tool familiarity. `density` = covered / cross_product. Plugin-registered ops are added by raising the schema MINOR (Ch 31 v1.1+)."
    },
    "edgePredicate": {
      "type": "string",
      "description": "An ontology edge predicate, expressed as a CURIE or a Crosswalker reserved name. Examples: `equivalent_to`, `skos:broader`, `skos:narrower`, `skos:exactMatch`, `skos:relatedMatch`, `informs`, `implements`, `derives_from`. Validates as a CURIE pattern; resolution is engine-side.",
      "pattern": "^[A-Za-z_][A-Za-z0-9_-]*(:[A-Za-z0-9_-]+)?$"
    },
    "conceptCURIE": {
      "type": "string",
      "description": "A concept CURIE, e.g. `nist-csf:GV.OC-01` or `mitre-attack:T1078`.",
      "pattern": "^[a-z][a-z0-9_-]*:[A-Za-z0-9._-]+$"
    },
    "ontologyId": {
      "type": "string",
      "description": "An ontology identifier registered with the loader, e.g. `nist-csf`, `nist-800-53`, `mitre-attack`, `cis-v8`.",
      "pattern": "^[a-z][a-z0-9_-]*$"
    },
    "fieldSelector": {
      "type": "string",
      "description": "A dotted path into a concept's metadata, e.g. `label`, `title`, `metadata.evidence_reviewed_at`. Resolved by the loader against the concept record."
    },
    "axisSelector": {
      "type": "object",
      "description": "Identifies a set of concepts that populate one axis of a query (rows, cols, source, nodes, event_source). Either by ontology ID (whole ontology) or by predicate-restricted closure.",
      "oneOf": [
        {
          "required": ["source", "id"],
          "additionalProperties": false,
          "properties": {
            "source": { "const": "ontology" },
            "id": { "$ref": "#/$defs/ontologyId" },
            "filter": { "$ref": "#/$defs/filterExpr" }
          }
        },
        {
          "required": ["source", "from", "predicate"],
          "additionalProperties": false,
          "properties": {
            "source": { "const": "closure" },
            "from": { "$ref": "#/$defs/conceptCURIE" },
            "predicate": { "$ref": "#/$defs/edgePredicate" },
            "max_depth": { "type": "integer", "minimum": 1, "default": 5 }
          }
        },
        {
          "required": ["source", "ids"],
          "additionalProperties": false,
          "properties": {
            "source": { "const": "concepts" },
            "ids": {
              "type": "array",
              "minItems": 1,
              "items": { "$ref": "#/$defs/conceptCURIE" }
            }
          }
        }
      ]
    },
    "cellSpec": {
      "type": "object",
      "required": ["op"],
      "additionalProperties": false,
      "properties": {
        "op": { "$ref": "#/$defs/aggOp" },
        "edge": { "$ref": "#/$defs/edgePredicate" },
        "filter": { "$ref": "#/$defs/filterExpr" },
        "field": { "$ref": "#/$defs/fieldSelector" }
      },
      "description": "Aggregation specification for a pivot cell, hierarchy leaf, or timeline bucket. `field` is required for `sum/avg/min/max/first/last` and ignored otherwise; engine validates this at compile time (one level deeper than schema can enforce cleanly)."
    },
    "columnSpec": {
      "type": "object",
      "required": ["field"],
      "additionalProperties": false,
      "properties": {
        "field": { "$ref": "#/$defs/fieldSelector" },
        "label": { "type": "string" },
        "format": { "type": "string", "enum": ["text", "number", "date", "url", "wikilink"], "default": "text" }
      }
    },
    "filterExpr": {
      "type": "string",
      "description": "A JSONata expression (jsonata.org) evaluated by the loader against each candidate concept/edge. Substrate-neutral; the engine compiles to SQL/Bases-DSL/in-memory predicate as appropriate."
    }
  }
}
```

### 2.3 AJV note

AJV v8+ supports JSON Schema 2020-12 natively (`ajv.js.org/json-schema.html`). The `if/then/else` branches inside `allOf` are evaluated as conjunction, so each branch is independent — exactly the discriminator semantics we want. AJV will produce a per-branch error; the loader should wrap errors with a custom message of the form: `"Recipe.query: shape='pivot' but primitives is missing required keys: cols, cell"`.

---

## Section 3 — Versioning & Forward-Compatibility

### 3.1 Versioning policy

- **Field:** `schema_version: "1.0.0"` (string, SemVer-formatted, SchemaVer-semantic).
- **MAJOR bump** when a primitive is removed or its meaning changes (e.g., renaming `cell.op: count` to `cell.op: tally`).
- **MINOR bump** for any additive change: new shape (e.g., `shape: matrix-decomposition`), new aggregation operator, new optional top-level key (e.g., the v0.1.7 `body:` template). This is the path the codeblock processor will take.
- **PATCH bump** for documentation, default-value tweaks, and pattern relaxations that strictly accept more inputs.
- **Compatibility:** the loader treats unknown top-level keys as **forward-compat additions** (because `additionalProperties: true` at the root). Unknown keys *inside* a shape's `primitives` are **errors** (typo guard). Recipes carrying a `schema_version` newer than the loader's MAJOR raise a hard error; newer MINOR/PATCH raise a warning and proceed.

### 3.2 Migration strategy when v0.1.7 ships the codeblock processor

The codeblock processor does **not** modify the `query:` block. It adds a sibling top-level field on the recipe:

```yaml
query: { ... }            # this schema, unchanged
body:                     # NEW in v0.1.7 (added by Ch 32+, not Ch 31)
  - heading: "Coverage matrix"
    codeblock:
      type: crosswalker
      query_ref: "#"      # references the query: above
```

`query:` and `body:` are **not exclusive**. A recipe can carry both: `query:` produces a Bases file at `output.target_path`, and `body:` injects a codeblock that references the same `query:` (via `query_ref: "#"`) into a markdown body. This is how a recipe can drive both a `.base` view and an in-line preview. Recipes with **only** `query:` (no `body:`) emit a `.base` file. Recipes with **only** `body:` (no `query:`) are legal in v0.1.7+ for body-only emissions where the codeblock carries an inline query; the schema in this challenge does not constrain that case.

### 3.3 Forward-compat with new shapes

Adding `shape: matrix-decomposition` in a future version means: (1) bump `schema_version` MINOR to `1.1.0`, (2) add a new `if`/`then` branch in the schema, (3) add a new entry to the `shape` enum, (4) the existing `additionalProperties: true` at root means older loaders simply pass through unrecognized branches with a warning. This is the same forward-compat strategy dbt uses for `version: 2` resource files.

### 3.4 Three-way merge on `query:` (preview; full treatment in §6)

Because `query:` is a typed sub-tree, the merge engine treats it as a **single editable unit** for v1.0. Fine-grained merge (e.g., user edited `cell.op` while community PR changed `cols.id`) is a v1.1 concern. The simplifying rule for v1.0: if the user edited *any* leaf inside `query:`, the entire `query:` block is marked `user_edited: true` and the system overlay is applied to *peer* keys (emission grammar) but **not** to `query:` without explicit conflict resolution.

---

## Section 4 — Reference Recipes (5 worked examples)

All five validate against the schema in §2.2. They are written as recipe fragments — the surrounding `id:`, `inputs:`, and emission grammar (folder/file/heading/tag/wikilink) are elided since they are out of scope for Ch 31.

### Recipe 1 — Coverage Matrix (NIST 800-53 × NIST CSF)

```yaml
# recipes/coverage-matrix.yaml
id: nist-csf-x-800-53-coverage
schema_version: "1.0.0"
query:
  schema_version: "1.0.0"
  shape: pivot
  primitives:
    rows: { source: ontology, id: nist-csf }
    cols: { source: ontology, id: nist-800-53 }
    cell:
      op: count
      edge: equivalent_to
  empty_cell: gap
  output:
    base_view: crosswalkerPivot
    target_path: "_crosswalker/views/coverage-matrix.base"
    format: base
  provenance:
    source: system
    generated_at: "2026-05-08T00:00:00Z"
    generator: "crosswalker@0.1.6"
  user_edited: false
```

Compiles to: `crosswalkBetween('nist-csf', 'nist-800-53', { edge: 'equivalent_to' })` followed by a Bases-DSL pivot with row/col axes.

### Recipe 2 — Crosswalk Density (any 2 ontologies)

```yaml
# recipes/crosswalk-density.yaml
id: csf-x-attack-density
schema_version: "1.0.0"
query:
  schema_version: "1.0.0"
  shape: pivot
  primitives:
    rows: { source: ontology, id: nist-csf }
    cols: { source: ontology, id: mitre-attack }
    cell:
      op: density          # covered / cross-product, computed engine-side
      edge: informs
  empty_cell: zero
  output:
    base_view: crosswalkerPivot
    target_path: "_crosswalker/views/csf-attack-density.base"
    format: base
```

Note: `density` is not a SQL primitive — it is a Crosswalker aggregation operator that compiles to `count_distinct(matched_pairs) / (|rows| * |cols|)`. Because we don't embed SQL, the user never has to know that.

### Recipe 3 — Freshness Heatmap (controls × time-buckets)

```yaml
# recipes/freshness-heatmap.yaml
id: control-freshness-heatmap
schema_version: "1.0.0"
query:
  schema_version: "1.0.0"
  shape: pivot
  primitives:
    rows: { source: ontology, id: nist-800-53 }
    cols:
      source: ontology
      id: time-bucket           # synthetic ontology emitted by a date-bucketing helper
    cell:
      op: count
      edge: evidence_reviewed_in
      filter: "$.metadata.evidence_reviewed_at != null"
  empty_cell: gap
  output:
    base_view: crosswalkerPivot
    target_path: "_crosswalker/views/freshness-heatmap.base"
    format: base
```

The `filter:` field carries a JSONata expression — the only string-typed expression language allowed in the schema, by deliberate Ch 27 choice. JSONata is JSON-native, declarative, and substrate-neutral (`jsonata.org`).

### Recipe 4 — Ontology Overlap (concepts in A ∩ B via equivalent_to closure)

```yaml
# recipes/ontology-overlap.yaml
id: cis-x-iso27001-overlap
schema_version: "1.0.0"
query:
  schema_version: "1.0.0"
  shape: list
  primitives:
    source:
      source: closure
      from: "cis-v8:CIS-Controls-Root"
      predicate: skos:exactMatch
      max_depth: 1
    label: "label"
    sort:
      - { field: "label", order: asc }
  output:
    target_path: "_crosswalker/views/cis-iso-overlap.base"
    base_view: crosswalkerList
    format: base
```

This uses `axisSelector.source: closure` — the only way to express "follow this predicate from this start node up to N hops". It compiles to `closureFromConcept('cis-v8:CIS-Controls-Root', { predicate: 'skos:exactMatch', maxDepth: 1 })`.

### Recipe 5 — SKOS Subject Density (broader/narrower hierarchy with leaf counts)

```yaml
# recipes/skos-subject-density.yaml
id: skos-subject-density
schema_version: "1.0.0"
query:
  schema_version: "1.0.0"
  shape: hierarchy
  primitives:
    root: "compliance-skos:Top"
    predicate: skos:narrower
    depth: 4
    leaf_aggregation:
      op: count
      edge: tagged_with
  empty_cell: zero
  output:
    target_path: "_crosswalker/views/skos-subject-density.base"
    base_view: crosswalkerHierarchy
    format: base
```

Per W3C SKOS reference (`w3.org/TR/skos-reference/`), `skos:broader`/`skos:narrower` are not transitive themselves; transitivity is provided by `skos:broaderTransitive`/`skos:narrowerTransitive`. The recipe author chooses which: setting `predicate: skos:narrowerTransitive` would walk the entire transitive closure in one step; using `skos:narrower` with `depth: 4` walks four explicit levels. Both are valid, and the loader should not silently substitute one for the other.

---

## Section 5 — Boundary Verdict: Data-Only vs Code-with-Fences

### 5.1 The two paths

**Data-only** (the path I recommend): `query:` is a typed, declarative tree. No string slot accepts SQL, SPARQL, Datalog, or Bases-DSL. The single string-expression slot (`filter:`) accepts only **JSONata**, which is JSON-native and substrate-portable. The engine compiles the tree to whichever substrate is active.

**Code-with-fences:** `query:` is a thin wrapper around opaque substrate-specific code blocks — typically `sql: |`, `sparql: |`, or `bases: |`.

### 5.2 Arguments for code-with-fences (steel-manning)

1. **Maximal expressiveness.** Any query the substrate supports is expressible; no need to wait for the engine to add new aggregation operators.
2. **Familiar tools.** Power users already write SQL/SPARQL. They get autocomplete, linters, syntax highlighting.
3. **Faster MVP.** `query: { sql: "SELECT ..." }` could ship in v0.1.6 in a day. The data-only schema requires more upfront design.
4. **Datasette and dbt do this** (Datasette canned queries; dbt model bodies). Both are successful.
5. **Escape hatch.** Even if 95% of recipes are declarative, the 5% that need it have a fallback.

### 5.3 Arguments for data-only

1. **Substrate neutrality** is non-negotiable per the brief's anti-pattern #4 (must not couple to sqlite-wasm). Code-with-fences forces a substrate choice into the recipe author's hands.
2. **Ch 27 explicitly rejects** embedding raw SQL in recipe bodies. The Ch 31 brief inherits this constraint.
3. **Three-way merge** (Ch 28 settled item #10) is *infeasible* on opaque code strings. You cannot meaningfully merge `SELECT * FROM x WHERE y = 1` with `SELECT y, count(*) FROM x WHERE z != 0` without parsing both. With a typed tree, merge is a tree diff.
4. **Validation** is meaningful. The schema can reject `cell.op: median` when median isn't supported, or warn when `rows.id` references a non-loaded ontology. With opaque SQL, validation is "did the SQL parse?"
5. **Portability across mechanisms** is the entire point of the v0.1.6 → v0.1.7 transition. The same recipe must drive a `.base` view *and* a codeblock; that's only possible if `query:` is data.
6. **Precedent: MetricFlow, Cube.dev, LookML**. The serious semantic-layer tools all chose data-only (LookML allows `sql:` snippets, but those are field-level, not query-level — and LookML's design has been retroactively criticized for that compromise; Cube.dev and MetricFlow learned from it).
7. **GraphQL's lesson:** typed selection > stringly-typed query bodies.
8. **OBO Foundry's lesson:** verbs over snippets. ROBOT YAML chains named operations; SPARQL files are *referenced*, not inlined.
9. **Author UX is better.** `cell.op: count` is shorter than `sql: "SELECT COUNT(*) FROM ..."`, and harder to typo.
10. **Anti-pattern #7** (schema so rich authors can't hand-author YAML) is best avoided by *fewer* slots, each strongly typed. Code-with-fences seems "simpler" but actually enlarges the schema by adding hidden complexity (which substrate? which dialect? which version?).

### 5.4 Final recommendation: **data-only**, with one narrowly-scoped escape

`query:` is data. The single string-typed slot is `filter:` carrying **JSONata** — which is itself declarative and JSON-native, and is *not* a substrate-specific code language. JSONata is the same boundary Knative's EventTransform CRD chose (`knative.dev/docs/eventing/transforms/event-transform-jsonata/`), the same boundary AWS Step Functions ASL chose (`docs.aws.amazon.com/step-functions/.../transforming-data.html`), and the same one Truto chose for their integrations DSL (truto.one/blog) — all for the same reasons we choose it: portable across substrates, declarative, JSON-native, well-specified (currently v2.0.6).

**Explicitly forbidden in v1.0:** `sql:`, `sparql:`, `bases:`, `datalog:`, `js:`, `python:`, or any other substrate-specific string slot at any level of the `query:` tree. If a user needs more expressiveness than the schema provides, the path is to (a) raise an issue requesting a new aggregation operator or shape, (b) write a Tier 2 helper, or (c) use the v0.1.7 `body:` codeblock with their own implementation — but then they own the portability cost.

---

## Section 6 — Composition with Ch 28 Lifecycle (`user_edited`, three-way merge, provenance)

Ch 28 settled item #10 commits Crosswalker to: schema validation + provenance + `user_edited: true` + three-way merge. The `query:` block must compose with that.

### 6.1 `user_edited: true` semantics

- **Granularity:** `user_edited` applies to the *whole `query:` sub-tree*, not to individual primitives. If the user touches `cell.op`, the whole block is "edited".
- **Detection:** the loader on save compares the in-memory `query:` to its system-base (the version produced by the recipe generator with `provenance.source: system`). Any structural difference flips the flag.
- **Persistence:** `user_edited: true` is persisted *inside* the `query:` block (not at recipe top-level) so that emission-grammar edits (folder/file paths) and query edits are tracked separately. This matters because most recipes today edit emission paths but never query bodies, and we don't want a false-positive merge conflict.

### 6.2 Three-way merge on `query:`

The merge inputs are:
- **Base:** the system-generated `query:` block at last regeneration (stored in a `.crosswalker/lock/` file, similar to a package lockfile).
- **User:** the current on-disk `query:` block (possibly edited).
- **Incoming:** the freshly-generated `query:` block (e.g., after a community PR updates the recipe template, or after the user changes inputs).

The merge algorithm is a **typed tree diff**, not a textual diff. For each leaf path (e.g., `primitives.rows.id`, `primitives.cell.op`, `output.target_path`):
1. If `base == user == incoming`: no change. Take any.
2. If `base == user != incoming`: user has not touched, take incoming (auto-merge).
3. If `base != user == incoming`: user matches incoming, no conflict.
4. If `base != user != incoming` and `user != incoming`: **conflict**. Surface to user with the typed diff (`"primitives.cell.op: base=count, user=count_distinct, incoming=density — choose one"`).

This is feasible *only* because `query:` is typed data (Section 5 verdict). With opaque SQL strings, step 4 becomes "show the user two SQL snippets and pray".

### 6.3 `provenance.source` semantics for queries

- `source: system` — generated by the recipe generator from a template. Default for fresh recipes.
- `source: user` — the user authored the `query:` block by hand or edited a system-generated one. Set when `user_edited: true` is set the first time.
- `source: community` — pulled in from a community recipe pack (e.g., a marketplace contribution). Treated like `system` for merge purposes (community PRs are upstream), but flagged in UI for review.

Provenance lives **inside** the `query:` block (not just at recipe top-level) because a recipe's emission grammar may be system-generated while its query is user-authored, and conflating them loses signal.

---

## Section 7 — Validation Against the 7 Candidate Primitives (Ch 29) and 6 Shapes (Ch 30)

The brief states there are 7 candidate query primitives (pending Ch 29 finalization) and 6 candidate view shapes. Without access to the specific Crosswalker pages (the in-repo agent-context pages are not externally fetchable as of this research), I infer the 7 primitives from Tier 2 helpers and the brief's own pivot example as: (1) **ontology-set** (whole ontology as an axis), (2) **closure** (predicate-walked from a start), (3) **concept-list** (explicit set), (4) **edge-predicate** (typed link), (5) **field-selector** (metadata path), (6) **aggregation-op** (cell/leaf/bucket reducer), (7) **filter-expr** (JSONata predicate). Each of these is a `$ref` in the schema's `$defs` (`ontologyId`, `axisSelector` covering closure/concepts/ontology, `edgePredicate`, `fieldSelector`, `aggOp`, `filterExpr`, `cellSpec`).

The shape × primitive mapping enforced by the schema:

| Shape | Required primitives | Optional primitives |
|---|---|---|
| `table` | `source`, `columns` | `filter`, `sort` |
| `list` | `source`, `label` | `filter`, `sort` |
| `pivot` | `rows`, `cols`, `cell` | `empty_cell` (top-level) |
| `graph` | `nodes`, `edges` | `start`, `max_depth` |
| `hierarchy` | `root`, `predicate` | `depth`, `leaf_aggregation` |
| `timeline` | `axis`, `event_source` | `bucket_aggregation` |

Every primitive in the inferred 7-primitive vocabulary is exercised by at least one recipe in §4. If the actual Ch 29 finalized list differs, the schema can absorb the rename via a **PATCH** bump (renaming a `$defs` entry while preserving JSON shape) or a **MINOR** bump (adding a new primitive type).

---

## Recommended Changes — Exact YAML/JSON Fragments to Add

### A. `spec/recipe.schema.json` — top-level addition

Add the following property to the existing recipe schema, **after** the current emission grammar fields (folder/file/heading/tag/wikilink). It is purely additive; no existing field is changed.

```json
{
  "properties": {
    "...existing fields...": {},
    "query": { "$ref": "https://crosswalker.dev/spec/recipe.query.schema.json" }
  }
}
```

### B. `spec/recipe.query.schema.json` — new file

The complete schema in §2.2 above, written as a sibling file under `spec/`. Importing it via `$ref` keeps the main recipe schema scannable.

### C. `spec/recipe.schema.json` — top-level `additionalProperties` posture

Confirm `additionalProperties: true` at the root of the recipe schema (it almost certainly is already). This is what makes v0.1.7's `body:` field forward-compatible without a MAJOR bump.

### D. Loader changes

1. AJV instance compiled with `strict: false`, `allErrors: true`, `discriminator: false` (we use `if/then`, not OpenAPI's `discriminator`).
2. Error formatter that converts AJV's per-branch errors into `"Recipe.query: shape='<X>' but primitives is missing required keys: ..."` — AJV's raw output is unhelpful here.
3. Hook into the existing recipe lifecycle to (a) validate `query:` on load, (b) compute `user_edited` on save, (c) compile to Tier 2 helpers (`crosswalkBetween` for pivot/list when both axes are ontologies, `closureFromConcept` for hierarchy and closure-axisSelectors, `getConceptsByOntology` for whole-ontology axes).

### E. Tier 2 helpers — small additions

The current Tier 2 helpers (`crosswalkBetween`, `closureFromConcept`, `getConceptsByOntology`) cover most of the query compilation. Add two more to fully cover the schema:
- `densityBetween(ontologyA, ontologyB, edge)` — wraps `crosswalkBetween` and divides by `|A| × |B|`.
- `bucketEvents(events, axisField, granularity)` — covers the timeline shape.

Both can be small wrappers; they do not require a new substrate.

### F. Documentation

Add a `docs/spec/query-block.md` page with:
1. The shape decision tree (when to use pivot vs hierarchy vs graph).
2. The seven primitives and their `$defs` names.
3. The five reference recipes from §4.
4. The lifecycle + merge story from §6.
5. An explicit note that `sql:` / `sparql:` / `bases:` slots are not supported and why.

---

## Recommendations (staged, with thresholds)

**Stage 1 — Lock the schema (this week, blocking D8 in v0.1.6):**
- Land `spec/recipe.query.schema.json` exactly as in §2.2.
- Land the `query: { $ref: ... }` addition to `spec/recipe.schema.json`.
- Add AJV validation in the loader; reject recipes where `query:` is present but invalid.
- Threshold to revisit: if more than 20% of early-alpha recipe authors hit the "schema too rich" wall and ask for `sql:`, escalate to a formal RFC. Until then, hold the line.

**Stage 2 — Wire Tier 2 compilation (v0.1.6 milestone):**
- Implement the pivot path: `query.shape == 'pivot'` → `crosswalkBetween` → Bases pivot view emission to `output.target_path`.
- Implement the list and table paths next (low-effort).
- Defer graph/hierarchy/timeline compilation to Stage 3 — the schema accepts them, but the engine can stub-out with a "not yet implemented" warning.
- Threshold to revisit: if a Bases-DSL feature is missing that blocks pivot rendering, document it in Ch 33+ but do not change the recipe schema.

**Stage 3 — Lifecycle integration (v0.1.6 → v0.1.7):**
- Implement `user_edited` detection on save (typed tree compare against `.crosswalker/lock/`).
- Implement three-way merge on `query:` per §6.2; surface conflicts in the UI.
- Threshold to revisit: if conflict rate is > 5% of recipe regenerations, reduce merge granularity to "whole `query:` block" (the v1.0 simplifying rule).

**Stage 4 — Codeblock processor (v0.1.7):**
- Add the `body:` sibling field per §3.2; do **not** modify `query:`.
- Allow recipes to carry both `query:` and `body:`, with `body[].codeblock.query_ref: "#"` referencing the sibling `query:`.
- Threshold to revisit: if codeblock authors demand inline overrides of `query:` primitives, add a `body[].codeblock.query_overlay: { ... }` field — but reject any proposal to embed substrate code there.

**Stage 5 — Plugin-registered aggregations (v1.1+):**
- Open up `aggOp` to plugin registration; the `aggregations:` top-level slot was reserved for this in §2.2.
- Threshold to revisit: only when at least 3 community recipes have asked for the same custom op.

---

## Caveats

1. **The Crosswalker in-repo pages were not externally fetchable** during this research (`cybersader.github.io/crosswalker/agent-context/...` returned permissions errors via the available web fetch tool). The 7 query primitives, 6 view shapes, Ch 27/28/29/30 settled items, and the Tier 2 helper signatures used in this deliverable are inferred from the brief's text and from the broader ecosystem patterns documented in §1. **If the finalized Ch 29 primitives or Ch 30 shapes differ, treat this schema as a draft and apply the version-bump rules in §3 rather than a rewrite** — the `$defs` structure is intentionally factored to absorb name-level changes via PATCH bumps.
2. **JSON Schema discriminator semantics:** AJV supports `if/then/else` natively but its error messages on branch failures are not friendly out of the box. The loader needs a wrapper (§E.2). An alternative would be OpenAPI's `discriminator` keyword (also supported by AJV), but it is non-standard JSON Schema and was rejected for portability.
3. **JSONata as the only expression language** is a deliberate narrowing. If at any point the team decides to allow Bases-DSL expressions in `filter:`, it should be a MAJOR bump because it changes substrate portability semantics — exactly the trade-off Section 5 argues against.
4. **The `density` aggregation operator** is Crosswalker-specific (not a SQL primitive). Documenting it explicitly is important; it is the one place where our `aggOp` enum diverges from LookML/Cube.dev/MetricFlow.
5. **Three-way merge granularity** is set to "whole block" in v1.0 (§3.4, §6.2). This is a simplification that *will* produce false-positive conflicts when both the user and an incoming community PR edit different leaves of `primitives`. Tracking false-positive rate is a v1.1 concern; the schema does not need to change, only the merge engine.
6. **Schema versioning string format (SemVer dots vs SchemaVer hyphens)**: Snowplow's SchemaVer (snowplow.io/blog/introducing-schemaver-...) explicitly uses hyphens (`1-0-0`) to visually distinguish from SemVer. We chose SemVer dots because Crosswalker's tooling ecosystem (npm, dbt, etc.) expects dots, and the visual cue is less important here than ecosystem fit. The trade-off is documented; if it bites, switching to hyphens is a PATCH bump (regex change).
7. **Forward-compat may be over-permissive**: `additionalProperties: true` at the root means typos in top-level keys (`querry:` instead of `query:`) silently pass. This is the cost of forward-compat. A linter pass (separate from the schema) should warn on suspiciously close key names.
8. **The brief's example uses `cell: { op: count, edge: equivalent_to }`** — directly compatible with the schema (`cellSpec` def). No changes from the brief's sketch were forced, only formalized.
9. **Sources surveyed in §1 vary in maturity.** dbt MetricFlow and Cube.dev are mature semantic layers with stable specs; LookML is mature but proprietary; SPARQL is a W3C Rec; GraphQL is a stable spec. Datasette's metadata.yaml is (per its maintainer's own GitHub issue #2143) explicitly being de-tangled because it became a "kitchen sink" — a useful warning we apply by keeping our schema scope tight. Obsidian Bases is in early beta and its YAML format is still evolving; we should expect to revisit the `output.base_view` integration when Bases ships its plugin API.
10. **"Recipe as data" is not free** — it ties Crosswalker to an in-house compiler that must keep pace with substrate features. This is an explicit trade vs. dbt-style "thin metadata around SQL". The verdict in §5 is that for an ontology crosswalk tool, where the substrate is currently Bases (with sqlite-wasm and codeblocks coming), the portability win is worth the compiler cost. If Crosswalker ever consolidates on a single substrate permanently, this trade-off should be revisited.
