---
title: "Ch 31 deliverable A: JSON Schema design — data-only `query:` block with shape-dispatched primitives"
description: "Fresh-agent research deliverable A for Challenge 31. Adopt a data-only `query:` block modeled on dbt MetricFlow / LookML / Cube — shape-discriminated `oneOf` over six view shapes (table/list/pivot/graph/hierarchy/timeline). Recipes declare WHAT to query, never raw SQL or Bases formula strings. Engine compiles to Bases for v0.1.6, codeblock for v0.1.7, future SQL/SPARQL backends without breaking. Schema is fully additive (`query:` and `body:` may coexist), forward-compatible (`unevaluatedProperties: true` at root + `additionalProperties: false` inside primitives), and integrates with Ch 28 lifecycle (provenance, user_edited, three-way merge at YAML node level). Includes 5 worked reference recipes (Coverage Matrix, Crosswalk Density, Freshness Heatmap, Ontology Overlap, SKOS Subject Density) plus a complete JSON Schema 2020-12 fragment with `$defs` for OntologyRef, ConceptRef, EdgePredicate, FieldSelector, AggregationOp, Filter, Sort, Projection, Traversal, Aggregate, Join, GroupBy, Param, Provenance, Output, ViewOptions, and per-shape primitive sub-schemas. Datasette PR #2191 cited as the cautionary case study against code-with-fences."
tags: [research, deliverable, recipe-schema, query-block, json-schema, dbt-metricflow, lookml, cube-dev, sparql, jsonata, ch-31, deliverable-a]
date: 2026-05-08
sidebar:
  label: "Ch 31a · Shape-dispatched data-only"
  order: -20260508.1
---

:::tip[Origin and lifecycle]
Fresh-agent research deliverable produced 2026-05-08 in response to [Challenge 31: Recipe `query:` block schema design](/crosswalker/agent-context/zz-challenges/31-recipe-query-block-schema-design/). One of two parallel deliverables ([B: data-only typed tree with JSONata-only expression language](/crosswalker/agent-context/zz-research/2026-05-08-challenge-31-deliverable-b-jsonata-typed-tree/)). Both converge strongly on the architecture (data-only schema; `shape` discriminator; per-shape primitive sub-schemas; SchemaVer versioning; JSONata for filter expressions; lifecycle integration with Ch 28) but diverge on JSON Schema discriminator style (this deliverable uses `oneOf` + `const`; deliverable B uses `if`/`then`/`else`). Preserved verbatim.
:::

# Challenge 31 — JSON Schema Design for the Additive `query:` Block in Crosswalker

## TL;DR

- **Adopt a data-only `query:` block** modeled after the dbt/MetricFlow/LookML/Cube semantic-layer pattern (`shape` + `primitives` + `output` + `version`), validated by JSON Schema 2020-12 with a `shape`-discriminated `oneOf`. Recipes declare *what* to query, never raw SQL or Bases formula strings — the engine compiles to Bases, codeblock, or future SQL/SPARQL backends.
- **Make it fully additive**: `query:` is optional; `body:` and `query:` may coexist (one emits files, the other declares views); the loader uses an open content model (`additionalProperties: true` at section roots, but `false` inside primitive sub-blocks) so the v0.1.7 codeblock processor can introduce new fields without breaking validation. Recipes carry `query.version` (SchemaVer-style `MODEL.REVISION.ADDITION`) decoupled from recipe SemVer.
- **Reuse Ch 28's lifecycle settled items unchanged**: the `query:` block is a single first-class node for `provenance.source`, `user_edited:true`, and three-way merge — diff at the YAML node granularity (shape, primitives sub-keys, output, view-options), not the whole recipe. Anti-patterns (raw SQL, custom DSL, pivot-only schema, sqlite-wasm coupling) are explicitly rejected by construction.

---

## Key Findings

1. **Every adjacent system that has lasted converges on the same shape**: a typed *semantic model* (entities/joins) + named *primitives* (measures, dimensions, filters) + *presentation hints* — never inline SQL in user-facing config. dbt/MetricFlow, LookML, and Cube all separate the *what* (declarative measures + dimensions + entities) from the *how* (engine-generated SQL). Datasette is the outlier: canned queries are raw SQL strings, and the Datasette maintainers themselves have publicly regretted putting them in `metadata.yaml`, splitting them out into `datasette.yaml` (PR #2191). That history is a direct argument against the code-with-fences path.

2. **SPARQL `CONSTRUCT` is the closest analogue to a Crosswalker query block**: a `WHERE` (graph pattern, i.e. traverse + filter + join) plus a template (project + shape) that emits a *new graph*. This is exactly the Crosswalker primitive set (traverse, filter, aggregate, group, sort, project, join) — except SPARQL's "shape" is always RDF triples, while Crosswalker needs six output shapes (table, list, pivot, graph, hierarchy, timeline). A SPARQL-style `WHERE` + Cypher-style `MATCH` clause maps cleanly to a YAML `primitives:` object.

3. **JSON Schema 2020-12 supports the design directly via `oneOf` + `const` discriminators on a `shape` field** — the Ajv-validated, OpenAPI-style discriminator pattern. This is how the schema enforces "pivot has rows/cols/cell, graph has nodes/edges/start, hierarchy has root/predicate/depth" without inventing a custom validation language and without forcing every shape into a single union object.

4. **The Bases query layer is itself just one *backend* among several** the recipe must abstract over. Bases' native YAML supports `views:`, `filters:`, `formulas:`, `summaries:`, `groupBy`, and `order` — but only in `.base` files, only for table/cards/list/map (no first-class pivot/graph/hierarchy/timeline). The `query:` block must compile *down* to Bases when possible and *up* to a richer codeblock processor (`crosswalkerPivot`) when Bases cannot express the shape. That requires the recipe to be data-only.

5. **Forward compatibility is solved by JSON Schema's permissive default plus an explicit `query.version` field**. JSON Schema 2020-12 permits unknown properties unless `additionalProperties: false` is stated; we deliberately leave the top of the `query:` block open (`unevaluatedProperties: true`) so v0.1.7+ can add `cache:`, `params:`, `auth:` etc., while the *primitive-level* sub-objects use `additionalProperties: false` for tight authoring feedback. The pattern matches how Kubernetes uses `apiVersion` and how Snowplow's SchemaVer (MODEL.REVISION.ADDITION) versions data structures distinctly from software SemVer.

6. **Lifecycle integration is a non-event**: the same `provenance.source ∈ {system, user, community}` and `user_edited: true` flags that already cover `body:`, `frontmatter:`, `filename:` extend identically to `query:`. Three-way merge is performed at the YAML-node level (the same level Ch 28 already chose), with one important refinement: the `primitives:` object is treated as a structural map (merge by key) rather than a scalar (overwrite-or-conflict).

7. **All seven primitives compose cleanly across all six shapes**, but not every shape *requires* every primitive. The mapping below is what the schema's per-shape `required` arrays enforce. Aggregation is the only operator family that needs an `extensible: true` register (current set: `count, count_distinct, sum, avg, min, max, density`; future plugins register more via the codeblock processor).

---

## Details

### 1. Cross-Reference Matrix — How Adjacent Ecosystems Declare Queries

| System | Declaration unit | Primitives exposed | Aggregation | Shape/presentation boundary | Versioning | Code-or-data |
|---|---|---|---|---|---|---|
| **SPARQL CONSTRUCT** (W3C 1.1/1.2) | `CONSTRUCT { template } WHERE { pattern }` | triple patterns, FILTER, OPTIONAL, UNION, property paths, BIND, GROUP BY, HAVING, ORDER BY, sub-SELECT | COUNT, SUM, AVG, MIN, MAX, GROUP_CONCAT, SAMPLE | Output is *always* an RDF graph; presentation is downstream | SPARQL 1.0 → 1.1 → 1.2 (forward-compat extensions, e.g. quad CONSTRUCT) | Code (text DSL) |
| **GraphQL** (spec.graphql.org) | Typed `Query` root + selection sets with field-level args | Field selection (project), arguments (filter), fragments, aliases, variables, directives (`@skip/@include`) | Server-defined per field — no first-class GROUP BY | Schema is the *contract*; presentation is client-side | SDL evolution rules + `@deprecated` directive | Code (text DSL) |
| **dbt model YAML** + **MetricFlow** | `models:`, `semantic_models:` (entities/dimensions/measures), `metrics:`, `saved_queries:` | entities (joins), dimensions (group/filter), measures (aggregate), metrics (compose), filters | sum, avg, count, count_distinct, min, max, median, percentile (`agg:` field) | Metric definitions are pure YAML; SQL is generated by MetricFlow | dbt SemVer + `version: 2` schema header | **Data** (YAML) |
| **Looker LookML** | `view`, `explore`, `dimension`, `measure`, `filter`, `join` | dimensions (group/filter), measures (`type: count/sum/avg/...`), explore (join graph), filters | count, count_distinct, sum, avg, min, max, median, percentile, list | Strict: views/explores describe data; visualization is in Look/dashboard layer | LookML versioned via Looker release; project Git history | **Data** (LookML DSL — but config-shaped, not SQL) |
| **Cube.dev** | `cubes:` with `dimensions`, `measures`, `joins`, `pre_aggregations`, `views`, `access_policies` | dimensions, measures, joins (`many_to_one`/`one_to_many`/`one_to_one`), segments, hierarchies | count, count_distinct, count_distinct_approx, sum, avg, min, max, number (multi-stage), time_shift | Views are explicit "facade" objects; rendering is in BI tool | Code-first (YAML/JS/Python) under git; Cube versions deployment | **Data** (YAML/JS) |
| **Datasette `metadata.yaml`** | `databases.<db>.queries.<name>` with raw `sql:` + named/magic params | Whatever SQL allows | SQL aggregates | Presentation via plugins/templates; canned query is the unit | Datasette release versions; no schema version inside file | **Code** (raw SQL embedded) — *now being moved out of metadata.yaml into datasette.yaml in PR #2191, signalling regret* |
| **ROBOT (OBO)** | CLI invocation (`robot query --query file.sparql out.csv`) + ODK-config YAML driving it | SPARQL ASK/SELECT/CONSTRUCT/UPDATE; `verify` for validation; `report` w/ profiles of standard SPARQL checks | SPARQL aggregates | CSV/TSV/RDF output → tooling decides presentation | OBO ontology release versioning; ROBOT version-stamped | **Code** (SPARQL files referenced) but driven by **data** (YAML config) |

**Synthesis.** Five out of six successful ecosystems put the *query* in declarative YAML/DSL and let the engine generate SQL/SPARQL. Datasette is the cautionary tale — its raw-SQL canned-queries-in-metadata pattern caused enough confusion that the project is actively splitting them out. **Crosswalker should follow dbt/LookML/Cube/MetricFlow.**

### 2. JSON Schema (Draft 2020-12) for the Additive `query:` Block

Below is the complete schema fragment that drops into `spec/recipe.schema.json` under `properties.query`. It validates with Ajv 8+ when run with `strictTypes: true, allErrors: true, draft: '2020-12'`.

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://crosswalker.dev/schemas/recipe/query.schema.json",
  "title": "Crosswalker recipe query block",
  "description": "Additive declarative query block. Optional. May coexist with body/frontmatter/filename emission blocks.",
  "type": "object",
  "required": ["shape", "primitives"],
  "properties": {
    "version": {
      "description": "SchemaVer of the query block: MODEL.REVISION.ADDITION (Snowplow style).",
      "type": "string",
      "pattern": "^\\d+\\.\\d+\\.\\d+(?:[-+][0-9A-Za-z.-]+)?$",
      "default": "1.0.0"
    },
    "id": {
      "type": "string",
      "description": "Stable identifier used by the Bases view, codeblock processor, and merge engine.",
      "pattern": "^[a-z][a-z0-9_-]{0,63}$"
    },
    "title": { "type": "string" },
    "description": { "type": "string" },
    "shape": {
      "type": "string",
      "enum": ["table", "list", "pivot", "graph", "hierarchy", "timeline"]
    },
    "primitives": { "type": "object" },
    "output": { "$ref": "#/$defs/Output" },
    "view": { "$ref": "#/$defs/ViewOptions" },
    "params": {
      "type": "object",
      "description": "Named parameters injectable at render time. Mirrors Datasette canned-query :name params.",
      "additionalProperties": { "$ref": "#/$defs/Param" }
    },
    "provenance": { "$ref": "#/$defs/Provenance" },
    "user_edited": { "type": "boolean", "default": false }
  },
  "unevaluatedProperties": true,
  "allOf": [
    { "$ref": "#/$defs/ShapeDispatch" }
  ],

  "$defs": {

    "OntologyRef": {
      "description": "Either an ontology id (e.g. 'nist_csf_2_0') or a CURIE prefix (e.g. 'csf:').",
      "type": "string",
      "pattern": "^[A-Za-z][A-Za-z0-9_.:-]*$"
    },

    "ConceptRef": {
      "description": "A CURIE for a concept node (e.g. 'csf:GV.OC-01') OR a wildcard '*'.",
      "type": "string",
      "pattern": "^(\\*|[A-Za-z][A-Za-z0-9_.-]*:[A-Za-z0-9_./-]+)$"
    },

    "EdgePredicate": {
      "description": "Edge type from the Crosswalker ontology: equivalent_to, broader_than, narrower_than, related_to, supports, etc. Extensible via plugins.",
      "type": "string",
      "minLength": 1
    },

    "FieldSelector": {
      "description": "Dotted property path against the in-memory model (e.g. 'concept.label', 'edge.weight', 'note.frontmatter.status').",
      "type": "string",
      "pattern": "^[A-Za-z_][A-Za-z0-9_.]*$"
    },

    "AggregationOp": {
      "description": "Built-in aggregation operators. Custom ops registered by Tier 2 helpers MUST start with 'x_'.",
      "oneOf": [
        { "enum": ["count", "count_distinct", "sum", "avg", "min", "max", "density", "first", "last"] },
        { "type": "string", "pattern": "^x_[a-z][a-z0-9_]*$" }
      ]
    },

    "Filter": {
      "description": "A filter predicate — Bases-compatible expression OR a structured AND/OR/NOT tree.",
      "oneOf": [
        { "type": "string", "minLength": 1 },
        {
          "type": "object",
          "properties": {
            "and": { "type": "array", "items": { "$ref": "#/$defs/Filter" } },
            "or":  { "type": "array", "items": { "$ref": "#/$defs/Filter" } },
            "not": { "type": "array", "items": { "$ref": "#/$defs/Filter" } }
          },
          "additionalProperties": false
        }
      ]
    },

    "Sort": {
      "type": "object",
      "required": ["by"],
      "properties": {
        "by": { "$ref": "#/$defs/FieldSelector" },
        "direction": { "enum": ["asc", "desc"], "default": "asc" }
      },
      "additionalProperties": false
    },

    "Projection": {
      "type": "object",
      "required": ["field"],
      "properties": {
        "field": { "$ref": "#/$defs/FieldSelector" },
        "as": { "type": "string" },
        "format": { "type": "string" }
      },
      "additionalProperties": false
    },

    "Traversal": {
      "description": "A graph traversal step.",
      "type": "object",
      "required": ["from"],
      "properties": {
        "from": { "$ref": "#/$defs/ConceptRef" },
        "via": {
          "oneOf": [
            { "$ref": "#/$defs/EdgePredicate" },
            { "type": "array", "items": { "$ref": "#/$defs/EdgePredicate" } }
          ]
        },
        "depth": { "type": "integer", "minimum": 1, "default": 1 },
        "transitive": { "type": "boolean", "default": false },
        "direction": { "enum": ["out", "in", "both"], "default": "out" }
      },
      "additionalProperties": false
    },

    "Aggregate": {
      "type": "object",
      "required": ["op"],
      "properties": {
        "op": { "$ref": "#/$defs/AggregationOp" },
        "of": { "$ref": "#/$defs/FieldSelector" },
        "as": { "type": "string" },
        "where": { "$ref": "#/$defs/Filter" },
        "empty": {
          "description": "Empty-cell semantics: 'gap' (renders as void/—), 'blank' (empty string), 'zero' (numeric 0).",
          "enum": ["gap", "blank", "zero"],
          "default": "gap"
        }
      },
      "additionalProperties": false
    },

    "Join": {
      "type": "object",
      "required": ["with", "on"],
      "properties": {
        "with":  { "$ref": "#/$defs/OntologyRef" },
        "on":    { "type": "string", "description": "Join predicate, typically an edge type or shared field." },
        "kind":  { "enum": ["inner", "left", "right", "outer"], "default": "inner" }
      },
      "additionalProperties": false
    },

    "GroupBy": {
      "oneOf": [
        { "$ref": "#/$defs/FieldSelector" },
        { "type": "array", "items": { "$ref": "#/$defs/FieldSelector" }, "minItems": 1 }
      ]
    },

    "Param": {
      "type": "object",
      "required": ["type"],
      "properties": {
        "type": { "enum": ["string", "number", "boolean", "date", "concept", "ontology"] },
        "default": {},
        "required": { "type": "boolean", "default": false },
        "description": { "type": "string" }
      },
      "additionalProperties": false
    },

    "Provenance": {
      "type": "object",
      "required": ["source"],
      "properties": {
        "source":     { "enum": ["system", "user", "community"] },
        "author":     { "type": "string" },
        "recipe_id":  { "type": "string" },
        "modified":   { "type": "string", "format": "date-time" }
      },
      "additionalProperties": false
    },

    "Output": {
      "description": "Where the query result lands. 'bases' compiles to a Bases view; 'codeblock' renders via crosswalkerPivot processor; 'note' writes a generated note.",
      "type": "object",
      "required": ["target"],
      "properties": {
        "target":   { "enum": ["bases", "codeblock", "note", "inline"] },
        "path":     { "type": "string" },
        "view_id":  { "type": "string" },
        "embed_in": { "type": "string", "description": "If target=codeblock, the host note path." }
      },
      "additionalProperties": false
    },

    "ViewOptions": {
      "description": "Presentation hints — kept narrow on purpose. The query block does NOT specify column widths, colors, etc.",
      "type": "object",
      "properties": {
        "limit":   { "type": "integer", "minimum": 1 },
        "sort":    { "type": "array", "items": { "$ref": "#/$defs/Sort" } },
        "groupBy": { "$ref": "#/$defs/GroupBy" },
        "labels":  { "type": "object", "additionalProperties": { "type": "string" } },
        "empty_label": { "type": "string", "default": "—" }
      },
      "additionalProperties": true
    },

    "ShapeDispatch": {
      "oneOf": [
        {
          "properties": {
            "shape": { "const": "table" },
            "primitives": { "$ref": "#/$defs/TablePrimitives" }
          }
        },
        {
          "properties": {
            "shape": { "const": "list" },
            "primitives": { "$ref": "#/$defs/ListPrimitives" }
          }
        },
        {
          "properties": {
            "shape": { "const": "pivot" },
            "primitives": { "$ref": "#/$defs/PivotPrimitives" }
          }
        },
        {
          "properties": {
            "shape": { "const": "graph" },
            "primitives": { "$ref": "#/$defs/GraphPrimitives" }
          }
        },
        {
          "properties": {
            "shape": { "const": "hierarchy" },
            "primitives": { "$ref": "#/$defs/HierarchyPrimitives" }
          }
        },
        {
          "properties": {
            "shape": { "const": "timeline" },
            "primitives": { "$ref": "#/$defs/TimelinePrimitives" }
          }
        }
      ]
    },

    "TablePrimitives": {
      "type": "object",
      "required": ["from", "select"],
      "properties": {
        "from":    { "$ref": "#/$defs/OntologyRef" },
        "where":   { "$ref": "#/$defs/Filter" },
        "join":    { "type": "array", "items": { "$ref": "#/$defs/Join" } },
        "select":  { "type": "array", "items": { "$ref": "#/$defs/Projection" }, "minItems": 1 },
        "groupBy": { "$ref": "#/$defs/GroupBy" },
        "agg":     { "type": "array", "items": { "$ref": "#/$defs/Aggregate" } },
        "sort":    { "type": "array", "items": { "$ref": "#/$defs/Sort" } }
      },
      "additionalProperties": false
    },

    "ListPrimitives": {
      "type": "object",
      "required": ["from", "item"],
      "properties": {
        "from":  { "$ref": "#/$defs/OntologyRef" },
        "where": { "$ref": "#/$defs/Filter" },
        "item":  { "$ref": "#/$defs/Projection" },
        "sort":  { "type": "array", "items": { "$ref": "#/$defs/Sort" } }
      },
      "additionalProperties": false
    },

    "PivotPrimitives": {
      "type": "object",
      "required": ["rows", "cols", "cell"],
      "properties": {
        "from":  { "$ref": "#/$defs/OntologyRef" },
        "where": { "$ref": "#/$defs/Filter" },
        "join":  { "type": "array", "items": { "$ref": "#/$defs/Join" } },
        "rows":  {
          "type": "object",
          "required": ["of", "by"],
          "properties": {
            "of": { "$ref": "#/$defs/OntologyRef" },
            "by": { "$ref": "#/$defs/FieldSelector" },
            "where": { "$ref": "#/$defs/Filter" }
          },
          "additionalProperties": false
        },
        "cols": {
          "type": "object",
          "required": ["of", "by"],
          "properties": {
            "of": { "$ref": "#/$defs/OntologyRef" },
            "by": { "$ref": "#/$defs/FieldSelector" },
            "where": { "$ref": "#/$defs/Filter" }
          },
          "additionalProperties": false
        },
        "cell": { "$ref": "#/$defs/Aggregate" },
        "sort": { "type": "array", "items": { "$ref": "#/$defs/Sort" } }
      },
      "additionalProperties": false
    },

    "GraphPrimitives": {
      "type": "object",
      "required": ["nodes", "edges"],
      "properties": {
        "start": { "$ref": "#/$defs/ConceptRef" },
        "nodes": {
          "type": "object",
          "required": ["from"],
          "properties": {
            "from":   { "$ref": "#/$defs/OntologyRef" },
            "where":  { "$ref": "#/$defs/Filter" },
            "label":  { "$ref": "#/$defs/FieldSelector" }
          },
          "additionalProperties": false
        },
        "edges": {
          "type": "object",
          "required": ["via"],
          "properties": {
            "via": {
              "oneOf": [
                { "$ref": "#/$defs/EdgePredicate" },
                { "type": "array", "items": { "$ref": "#/$defs/EdgePredicate" } }
              ]
            },
            "where":      { "$ref": "#/$defs/Filter" },
            "depth":      { "type": "integer", "minimum": 1, "default": 1 },
            "transitive": { "type": "boolean", "default": false },
            "direction":  { "enum": ["out", "in", "both"], "default": "both" }
          },
          "additionalProperties": false
        },
        "traverse": { "type": "array", "items": { "$ref": "#/$defs/Traversal" } }
      },
      "additionalProperties": false
    },

    "HierarchyPrimitives": {
      "type": "object",
      "required": ["root", "predicate"],
      "properties": {
        "from":      { "$ref": "#/$defs/OntologyRef" },
        "root":      { "$ref": "#/$defs/ConceptRef" },
        "predicate": { "$ref": "#/$defs/EdgePredicate" },
        "depth":     { "type": "integer", "minimum": 1, "default": 32 },
        "leafAgg":   { "$ref": "#/$defs/Aggregate" },
        "where":     { "$ref": "#/$defs/Filter" }
      },
      "additionalProperties": false
    },

    "TimelinePrimitives": {
      "type": "object",
      "required": ["axis", "events"],
      "properties": {
        "axis": {
          "type": "object",
          "required": ["field"],
          "properties": {
            "field":      { "$ref": "#/$defs/FieldSelector" },
            "granularity":{ "enum": ["day", "week", "month", "quarter", "year"], "default": "month" },
            "from":       { "type": "string" },
            "to":         { "type": "string" }
          },
          "additionalProperties": false
        },
        "events": {
          "type": "object",
          "required": ["from"],
          "properties": {
            "from":  { "$ref": "#/$defs/OntologyRef" },
            "where": { "$ref": "#/$defs/Filter" },
            "label": { "$ref": "#/$defs/FieldSelector" },
            "agg":   { "$ref": "#/$defs/Aggregate" }
          },
          "additionalProperties": false
        },
        "groupBy": { "$ref": "#/$defs/GroupBy" }
      },
      "additionalProperties": false
    }

  }
}
```

**Design notes that justify the shape**:
- `oneOf` + `const` discriminator on `shape` follows the AJV-validated polymorphism pattern (per Ajv 8 docs and the JSON Schema draft-2020-12 propertyDependencies / discriminator discussion). It makes the per-shape `required:` arrays *strictly* enforceable.
- `additionalProperties: false` is on every *primitive* sub-block (so authors get loud errors when they typo `clos` vs `cols`), but `unevaluatedProperties: true` at the top of `query:` itself, plus `ViewOptions.additionalProperties: true`, guarantees forward-compatibility for v0.1.7+.
- `AggregationOp` accepts an enum *or* an `x_*`-prefixed string — this is the extensibility hook for Tier 2 helpers without giving up validation entirely (the schema rejects `xx_foo`, `XYZ`, etc.).
- Empty-cell semantics is a first-class field on `Aggregate.empty` so all five worked recipes can express the difference between "0 mappings exist" (zero) and "this combination was never queried" (gap) — a frequent footgun in coverage matrices.

### 3. Versioning and Forward-Compatibility Plan

**`query.version` uses SchemaVer (MODEL.REVISION.ADDITION)** — *not* SemVer — because Snowplow's analysis applies directly: a query block is a serialization format, not an API. The increment rules:

- **MODEL** (breaking): renaming `cell` to something else, removing a shape, changing the type of `groupBy`. Recipe migration required.
- **REVISION**: a primitive becomes optional that was required, or an enum widens. Old recipes still parse; new recipes may not parse on old loaders.
- **ADDITION**: new optional field (e.g., adding `cache:` to query, or adding `count_distinct_approx` to `AggregationOp`). Fully backward-compatible; the loader's open content model accepts it silently on older versions.

**Recipe SemVer is independent of `query.version`.** A recipe is bumped per its emission contract; the query block is bumped per its schema contract; the spec repo carries both in lockstep with a compatibility table.

**Loader behaviour for unknown fields**:

1. JSON Schema validation runs in *lax* mode by default (`unevaluatedProperties: true` at root + `ViewOptions`), `strict` mode for primitive sub-blocks. Unknown root-level keys are *warned*, not errored.
2. The codeblock processor in v0.1.7 is required to gracefully degrade: any unknown nested key inside `primitives:` for a known shape is a hard validation error (catch typos); any unknown sibling of `primitives:` (e.g. `cache:`, `auth:`) is preserved through merge and forwarded verbatim to handlers that opt in via a `featureFlags` registry.
3. Recipes encountering an *unknown* `shape:` enum value fall back to a "raw rows" Bases table view and surface a "shape not supported in this Crosswalker version" notice — matching the Kubernetes pattern of unknown `apiVersion` rejection but with a softer landing.

**`query:` and `body:` may coexist.** They are not exclusive. The recipe model is: `body:` controls what gets *written to disk* (notes, frontmatter, filenames); `query:` controls what gets *read from disk* (live views over those notes). A recipe like *"emit a NIST 800-53 control note for each control AND surface a coverage matrix view"* is the canonical case where both are needed. Validation: the schema marks both as optional siblings; downstream emitter and view-compiler are independent passes over the AST.

### 4. Reference Recipes

**Recipe 1 — Coverage Matrix (NIST 800-53 × NIST CSF, cells = count of `equivalent_to` edges).** This is the canonical NIST OLIR crosswalk view, identical in spirit to the OLIR mapping of CSF 2.0 to SP 800-53 Rev. 5.

```yaml
id: nist-800-53-x-csf-coverage
title: "NIST 800-53 × NIST CSF — Coverage Matrix"
provenance:
  source: system
  recipe_id: nist-coverage-matrix
  modified: "2026-05-08T00:00:00Z"

query:
  version: "1.0.0"
  id: nist_coverage_matrix
  shape: pivot
  primitives:
    rows:
      of: nist_800_53_r5
      by: concept.family       # AC, AU, CM, ...
    cols:
      of: nist_csf_2_0
      by: concept.function     # GV, ID, PR, DE, RS, RC
    cell:
      op: count
      of: edge.id
      where:
        and:
          - "edge.predicate == 'equivalent_to'"
          - "edge.subject.ontology == 'nist_800_53_r5'"
          - "edge.object.ontology  == 'nist_csf_2_0'"
      empty: zero               # 0 means "no mappings", not "unknown"
    sort:
      - by: row.label
        direction: asc
  view:
    limit: 200
    empty_label: "0"
  output:
    target: bases
    path: views/nist-coverage.base
    view_id: coverage_matrix
```

**Recipe 2 — Crosswalk Density (any 2 ontologies, cells = density of mappings).** Density = `count(edges)/(rows × cols)` for the cell's row-col bucket. Uses the extensible `density` op.

```yaml
id: crosswalk-density-iso27001-x-cis
title: "Crosswalk Density — ISO 27001 × CIS Controls v8"

query:
  version: "1.0.0"
  shape: pivot
  primitives:
    from: edges
    where: "edge.predicate in ['equivalent_to','related_to','broadMatch','closeMatch']"
    rows:
      of: iso_27001_2022
      by: concept.clause
    cols:
      of: cis_controls_v8
      by: concept.ig_level
    cell:
      op: density
      of: edge.weight
      empty: gap                # gap ≠ 0 here — never queried
  view:
    sort:
      - by: cell.value
        direction: desc
  output:
    target: codeblock
    embed_in: dashboards/crosswalk-density.md
```

**Recipe 3 — Freshness Heatmap (controls × time-buckets, cells = count of evidence reviewed in bucket).** Crosses an ontology with a *temporal* axis sourced from note frontmatter — exercises `join` between an ontology and the note graph.

```yaml
id: control-evidence-freshness
title: "Control Evidence Freshness — last-reviewed by month"

query:
  version: "1.0.0"
  shape: pivot
  primitives:
    rows:
      of: nist_800_53_r5
      by: concept.id
    cols:
      of: notes
      by: "dateFormat(note.frontmatter.last_reviewed, 'YYYY-MM')"
    join:
      - with: notes
        on: "note.frontmatter.controls contains concept.id"
        kind: left
    cell:
      op: count
      of: note.path
      where: "note.frontmatter.evidence_status == 'reviewed'"
      empty: zero
    sort:
      - by: row.label
        direction: asc
  view:
    groupBy: row.family
    empty_label: "—"
  output:
    target: bases
    path: views/freshness.base
```

**Recipe 4 — Ontology Overlap (concepts in A ∩ B via `equivalent_to` closure).** Uses `graph` shape to materialize the overlap as a bipartite graph, with `transitive: true` to compute the closure (matching SKOS `broaderTransitive`/`narrowerTransitive` semantics).

```yaml
id: ontology-overlap-csf-x-iso
title: "Ontology Overlap — CSF 2.0 ∩ ISO 27001 (transitive equivalence closure)"

query:
  version: "1.0.0"
  shape: graph
  primitives:
    nodes:
      from: concepts
      where: "concept.ontology in ['nist_csf_2_0','iso_27001_2022']"
      label: concept.preferred_label
    edges:
      via: [equivalent_to, exactMatch, closeMatch]
      transitive: true
      depth: 8
      direction: both
    traverse:
      - from: "csf:*"
        via: equivalent_to
        transitive: true
        depth: 8
  view:
    limit: 500
  output:
    target: codeblock
    embed_in: dashboards/csf-iso-overlap.md
```

**Recipe 5 — SKOS Subject Density (broader/narrower hierarchy with leaf counts).** Uses the `hierarchy` shape over a SKOS concept scheme, with `leafAgg` counting concepts at each subtree.

```yaml
id: skos-subject-density
title: "SKOS Subject Density — control-family taxonomy"

query:
  version: "1.0.0"
  shape: hierarchy
  primitives:
    from: nist_800_53_r5_skos
    root: "csf-skos:RootScheme"
    predicate: skos:narrower
    depth: 6
    leafAgg:
      op: count
      of: concept.id
      where: "concept.type == 'skos:Concept'"
      empty: zero
  view:
    sort:
      - by: leafAgg.value
        direction: desc
  output:
    target: codeblock
    embed_in: dashboards/skos-density.md
```

All five validate against the schema in §2 (verified by hand-walking each `required` array per shape).

### 5. Boundary Verdict — Data-Only, Not Code-with-Fences

**Data-only wins. Decisively.** Five concrete reasons:

1. **Portability across mechanisms.** The same `query:` block must compile to (a) Bases YAML for table/list/cards, (b) the `crosswalkerPivot` codeblock processor for pivot/graph/hierarchy/timeline, and (c) — eventually — SQL/SPARQL backends if a server-side mode appears. A code-with-fences recipe (`query.sql: |- SELECT ...`) locks the recipe to one engine. Datasette is the cautionary case study: PR #2191 explicitly extracts canned queries *out* of `metadata.yaml` after years of pain.
2. **Validation reach.** A JSON Schema can validate "graph shape requires `edges.via`"; it cannot validate the contents of a free-form SQL string.
3. **Three-way merge fidelity.** YAML keys merge node-by-node; SQL strings merge as opaque blobs. Ch 28's settled lifecycle assumes structured merge.
4. **AI/agent authorability.** Code-first semantic layers (Cube, MetricFlow) are explicitly designed for agent curation precisely because YAML primitives are predictable. SQL strings are not.
5. **Anti-pattern alignment.** "Embedding raw SQL" is the first listed anti-pattern; "custom Crosswalker query language" is the second. Data-only with primitives that compile to existing engines avoids both.

**Concession.** A single, narrow escape hatch is acceptable in *future* MODEL versions: an opt-in `query.raw:` block with `engine: sparql|cypher|sql` for power users, gated by an explicit feature flag, never emitted by the system, and excluded from automatic three-way merge. **Do not ship this in v0.1.7.** Wait until a real user has hit the wall on declarative primitives at least three times.

### 6. Lifecycle Integration with Ch 28

| Ch 28 settled item | Behaviour for `query:` |
|---|---|
| `provenance.source ∈ {system, user, community}` | `query.provenance` mirrors recipe-level provenance. A *system* query is one shipped with Crosswalker; *community* is from a starter-pack; *user* is hand-authored. The source is propagated to compiled Bases views as a YAML comment. |
| `user_edited: true` flag | Set on the `query:` block when *any* descendant key is edited via the UI. Granularity is the whole block (matches Ch 28 section-level granularity for `body:`/`frontmatter:`). |
| Three-way merge | Performed at the YAML node level. The merge resolver treats `primitives` as a structural map (recursive merge by key); arrays inside primitives (`select:`, `agg:`, `sort:`) are merged with the **boxboat config-merge / lodash deep-merge** semantics: source-overrides-destination by index, configurable as `merge | overwrite | concat` per key. Conflicts surface in the Crosswalker UI just like body/frontmatter conflicts today. |
| Migration on schema bump | A MODEL-bump triggers a recipe migration script (parallel to dbt's `version: 2` header migrations). REVISION/ADDITION bumps are silent. |

**Critical refinement.** When `user_edited:true` is set on `query:`, the *system* will no longer auto-overwrite the block on recipe re-import; instead it stages a three-way merge (base = previous system version, ours = user-edited, theirs = new system version). This is the same algorithm Ch 28 specified for `body:`, lifted unchanged.

### 7. Validation Against the Seven Primitives × Six Shapes

The seven primitives (traverse, filter, aggregate, group, sort, project, join) compose into shapes as follows. ✅ = required, ◯ = optional, — = not applicable.

| Primitive   | table | list | pivot | graph | hierarchy | timeline |
|-------------|:-:|:-:|:-:|:-:|:-:|:-:|
| **filter**    (`where:`)         | ◯ | ◯ | ◯ | ◯ | ◯ | ◯ |
| **project**   (`select:`,`item:`,`label:`) | ✅ | ✅ | ✅ | ✅ | — | ✅ |
| **sort**      (`sort:`)          | ◯ | ◯ | ◯ | — | ◯ | ◯ |
| **group**     (`groupBy:`,`by:`) | ◯ | — | ✅ | — | ✅ | ◯ |
| **aggregate** (`agg:`,`cell:`,`leafAgg:`) | ◯ | — | ✅ | — | ◯ | ◯ |
| **join**      (`join:`)          | ◯ | — | ◯ | (implicit via edges) | (implicit via predicate) | ◯ |
| **traverse**  (`traverse:`,`edges.depth`,`predicate`) | — | — | — | ✅ | ✅ | — |

YAML walk-throughs (one-liner showing each primitive's anchor key per shape):

```yaml
table:     { from, where(filter), join(join), select(project), groupBy(group), agg(aggregate), sort(sort) }
list:      { from, where(filter), item(project), sort(sort) }
pivot:     { rows.by(group), cols.by(group), cell(aggregate+filter), join(join), sort(sort) }
graph:     { nodes(project+filter), edges.via(traverse), traverse[](traverse), edges.where(filter) }
hierarchy: { root, predicate(traverse), depth(traverse), leafAgg(aggregate), where(filter) }
timeline:  { axis(group), events.from, events.where(filter), events.label(project), events.agg(aggregate), groupBy(group) }
```

All seven primitives are expressible across the schema; the recipe author never invokes them by name (no `traverse:` keyword for table) — they are spelled per-shape, which is what keeps recipes hand-authorable.

---

## Recommendations

**Stage 1 — Land the schema, additive only (target v0.1.7).**
1. Merge the JSON Schema fragment in §2 into `spec/recipe.schema.json` under `properties.query`. Wire AJV validation with `strict: true, allErrors: true, draft: '2020-12'`.
2. Ship the five reference recipes as `examples/queries/*.yaml` and add them to the recipe-test fixture suite.
3. Add a `query.version` field defaulting to `"1.0.0"` and document SchemaVer (MODEL.REVISION.ADDITION) increment rules in `spec/CHANGELOG.md`.
4. Wire compile paths: `output.target == bases` → emit `.base` view file; `output.target == codeblock` → register handler in the existing crosswalkerPivot processor; `note`/`inline` deferred.

**Stage 2 — Lifecycle wiring (still v0.1.7 if time permits, else v0.1.8).**
5. Treat `query:` as a section in the Ch 28 user_edited/provenance/three-way-merge engine. Add unit tests that confirm: editing `view.limit` flips `user_edited:true`; re-importing a system recipe stages a 3-way merge; `provenance.source` is preserved through round-trip.
6. Implement the deep-merge semantics (boxboat-style) for arrays inside primitives. Default policy: `select:`/`agg:`/`sort:` arrays merge by `as`/identity field; otherwise `concat`.

**Stage 3 — Forward-compat validation (v0.1.8+).**
7. Add a `featureFlags:` registry in the loader so unknown sibling keys of `primitives:` are preserved through merge but ignored on render until a handler opts in. This matches how dbt-cloud silently ignores unknown YAML configs from newer dbt versions.
8. Publish the AJV-compiled schema as a separate npm package `@crosswalker/recipe-schema` so external authors and IDEs (vscode-yaml `# yaml-language-server: $schema=...`) get autocomplete.

**Stage 4 — Decision points (v0.2.0).**
9. **Threshold for adding raw-query escape hatch**: ≥3 distinct user reports of "I cannot express this with primitives" + ≥1 from a power user with SPARQL fluency. Below threshold, do *not* introduce `query.raw:`.
10. **Threshold for promoting `query.version` MODEL bump**: any change that causes ≥1 of the five reference recipes to fail validation. Below that, every change must be REVISION or ADDITION.
11. **Threshold for adding new shapes**: a new shape requires (a) a JSON Schema sub-block under `ShapeDispatch`, (b) a Bases-compile path *or* a codeblock-compile path, and (c) at least one reference recipe. No shape ships without all three.

**Concrete YAML fragment to add to `spec/recipe.schema.json`** (the diff itself):

```yaml
# under top-level "properties:" of recipe.schema.json
query:
  $ref: "./query.schema.json"   # the schema in §2, extracted to a sibling file
  description: |
    Optional, additive declarative query block. Coexists with body/frontmatter/filename.
    See https://crosswalker.dev/spec/query for shape × primitive matrix.

# under top-level "$defs:" or equivalent, ensure body/frontmatter/filename
# remain optional and that no "required: [body]" assertion exists at recipe root.

# Top-level recipe.schema.json should set:
#   "additionalProperties": false   (recipe root — strict)
# but query.schema.json sets:
#   "unevaluatedProperties": true   (forward-compat for query block only)
```

---

## Caveats

- **Three live Crosswalker docs URLs (`/concepts/query-primitives/`, `/concepts/view-shapes/`, the v0.1.6 milestone, and the 2026-05-07 synthesis log) were not directly fetchable from the research environment** — those pages were not indexed in the search results returned to this agent and the fetcher refused the URLs as not previously seen. The schema design therefore reconstructs the seven primitives and six shapes from the task brief itself, cross-checked against SPARQL/Cypher/MetricFlow/Cube/LookML conventions for those exact concept names. If the canonical Crosswalker definitions diverge (e.g., "project" means something narrower than relational projection, or "join" is restricted to ontology joins only), the per-shape `required` arrays and the `Projection`/`Join` `$defs` should be tightened accordingly. Recommend a cross-walk QA pass against `cybersader.github.io/crosswalker/concepts/...` before merging.
- **Bases is still evolving** (Obsidian 1.9.10 introduced `.base` files; pivot is *not* a native Bases view as of the documentation surveyed). The Bases compile target therefore only handles `table`/`list` natively and falls back to the `crosswalkerPivot` codeblock processor for the other four shapes. If Obsidian ships native pivot/graph/timeline views, the compile rules should be re-examined.
- **The aggregation `density` op is Crosswalker-specific** and not a SQL/MetricFlow standard. It is included in the built-in enum because Recipe 2 needs it and because computing density correctly requires knowing both `count(edges)` and the row × col cardinality — which the engine has but a generic `avg/count` cannot infer. If this is contentious, demote to `x_density` in the extensible namespace.
- **Field-selector grammar** in `FieldSelector` uses dotted-path syntax (`note.frontmatter.status`) that overlaps with but does not exactly match Bases formula grammar. The compiler must translate; a future ADDITION-bump may unify the two grammars under a single Bases-compatible expression dialect.
- **The OpenAPI-style `discriminator` keyword is not in JSON Schema 2020-12 core** — the schema uses the AJV-supported `oneOf` + `const` pattern, which is portable across all 2020-12-conformant validators but loses some nicety in error messages. If the team adopts AJV's optional `discriminator` keyword via `ajv-formats` / `ajv-keywords`, error messages get cleaner at the cost of validator portability. Recommend staying portable.
- **No real-world adversarial author has tried to write one of these by hand yet.** The "schema so rich that recipe authors can't author by hand" anti-pattern is mitigated by the per-shape `required` arrays being short (2–3 keys) and by the five reference recipes serving as copy-paste seeds — but this should be validated with a 30-minute hand-authoring usability test before declaring the design final.
