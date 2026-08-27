---
title: "Ch 46 deliverable B: Where transformation belongs"
description: "Pre-read research deliverable B for Challenge 46. Maps the current parse-to-render pipeline, proves that templates cannot perform cross-collection joins after ParsedData narrows the source to one iterable collection, compares template, distinct-stage, and producer-side placements, and tests each option for additive evolution, migration, mobile execution, and runtime portability."
tags: [research, deliverable, transform-engine, transformation-placement, parsed-data, streaming, schema-as-primitive, ch-46, deliverable-b]
date: 2026-08-27
sidebar:
  label: "Ch 46b · Transformation placement"
  order: -20260827.2
---

# Challenge 46 pre-read: where transformation belongs

**Scope:** placement only. This pre-read does not propose a transform language or notation.

## 30-second orientation

Crosswalker currently has no distinct transform stage. Its effective pipeline is:

```text
source bytes
  -> format parser selects one record collection
  -> ParsedData { columns, rows }
  -> per-row identity setup
  -> template resolution + filters inside render()
  -> Address { path, metadata, body regions }
  -> Tier 1 validation, merge, body assembly, write
  -> optional post-render batch enrichment
```

The decisive current boundary is `ParsedData.rows`: one iterable collection of records. By the time `render()` runs, a row can still contain nested objects and arrays, but sibling sheets/collections and source-wide relationship context are absent. This means template growth can improve transformations *within one row*, but it cannot produce a genuine cross-collection join without changing an earlier seam.

## 1. Current pipeline and file-level seams

### 1.1 Parse: source bytes become one iterable record collection

| Source | File | Current normalization | Information retained/lost |
|---|---|---|---|
| CSV | `src/import/parsers/csv-parser.ts` | Produces `Record<string, unknown>` rows; eager array or streaming `AsyncIterable` | Flat headers and cells retained. No sibling collections exist. |
| XLSX | `src/import/parsers/xlsx-parser.ts` | Reads **one selected sheet** with `raw: false`; trims and stringifies cells | Workbook and other sheets are discarded after sheet selection. A relationship sheet cannot be joined to the selected concept sheet downstream. |
| JSON | `src/import/parsers/json-parser.ts` + `src/import/parsers/json-source-core.ts` | One iterator selects one array; optional parser-side `where` filters rows; top-level scalar fields are stringified, nested objects/arrays remain as values | Nested data inside each selected record survives. Sibling arrays outside the selected iterator are no longer available to generation. |

All parsers converge on `ParsedData` in `src/types/config.ts`:

- `columns: string[]`
- `rows: Record<string, any>[] | AsyncIterable<Record<string, any>>`
- `rowCount`
- optional `sheetName`

`ParsedData` is documented as a bundled-engine implementation detail, not a persisted tier. The engine consumes both eager and streaming rows via `for await`/bounded concurrent iteration.

**Existing transform leakage before render:** JSON row predicates already exist as parser UI state (`jsonWhere`) and are executed in `json-source-core.ts`, not declared by the recipe. This proves row selection is already needed before render, but today it is format-specific and not portable with the recipe.

### 1.2 Pre-render generation: the row becomes the render scope

There are two generation entry points in `src/generation/generation-engine.ts`:

| Entry point | Role | Render seam |
|---|---|---|
| `generateNotes()` | Wizard/workbench and legacy configuration path | Converts legacy config to a recipe, then `buildNoteDataViaRender()` treats the row as `SourceScope` and calls `render()`. Legacy body/link fallback remains for unmigrated workbench mappings. |
| `generateFromRecipe()` | Native recipe path exposed as `plugin.runImportFromRecipe()` in `src/main.ts` | Per row: derives/augments scope, computes the local identity part, then calls `render(recipe, { curie, scope })`. |

Immediately before render, generation performs only narrow scope adaptation:

- Crosswalk rows gain normalized defaults for `mapping_set_id` and `predicate_modifier`.
- Native recipe rows gain the render-only `_crosswalker_curie_local_part` value.
- The local CURIE part is calculated **before** `render()`.

There is no general `row -> transformed row` contract.

### 1.3 Render: source values become note values here today

`src/render/index.ts` owns the pure, vault-independent `render(recipe, identity) -> Address` pass.

1. It walks `target.layout` and dispatches to folder/file/heading mechanisms.
2. It evaluates `target.also_emit` tags, aliases, managed frontmatter, managed links, and body projections.
3. It computes the wikilink target and guarantees `curie` frontmatter.
4. It returns an `Address`; it does not write files.

The exact value-conversion seam is `src/render/template.ts`:

```text
source row value
  -> parse template/interpolation
  -> resolve path in SourceScope
  -> apply filter chain
  -> return scalar or list
```

The resulting value reaches a note through one of two sinks:

- `renderTemplate()` requires text and is used by layout mechanisms, tags, and aliases.
- `renderTemplateValue()` preserves scalar/list values and is used by managed frontmatter, managed links, and `src/render/body.ts`.

`src/render/body.ts` then formats the already-transformed value as text/code/quote/list and returns a rendered body region. Body templates are not re-evaluated during generation.

**Therefore, a source value becomes a note value at template evaluation today, not in the parsers and not in the file writer.**

### 1.4 Generate: Address becomes validated Tier 1 Markdown

After `render()` returns, `src/generation/generation-engine.ts`:

1. combines the recipe-relative address with the output base path;
2. detects path collisions;
3. adds tags, aliases, provenance, hashes, and import-set identity;
4. validates frontmatter against `spec/tier1.schema.json`;
5. reconciles an existing note by CURIE and merges managed/user-preserved properties;
6. assembles the automatic H1 and rendered body regions;
7. writes the Markdown file;
8. optionally runs Pass 1.5 enrichment after the row stream.

Pass 1.5 is a useful precedent for a distinct batch phase, but it is **post-render**. It can derive children lists and hub notes from rendered records; it cannot decide which source rows exist, join a discarded workbook sheet, or change the identity/path that was already rendered.

### 1.5 Where a distinct transform stage could sit

There are two materially different insertion points:

| Insertion point | What it can solve | Limitation |
|---|---|---|
| **Immediately before per-row identity/render in `generation-engine.ts`** | Row-local rename, cleanup, derivation, predicate, nested-value reshaping | Too late for joins unless generation receives source-wide context. Also risks computing identity/provenance from a different scope unless the order is explicit. |
| **After format decoding but before narrowing to `ParsedData.rows`** | Row-local work plus multi-sheet/multi-collection joins, row selection, recursive expansion | Requires parsers to expose raw/named collections or a broader ephemeral source model. The stage can then emit the existing `ParsedData` shape, leaving `render()` and generation mostly intact. |

For Option B to cover all five measured gaps rather than only the row-local four, it must occupy the second, broader seam or otherwise receive equivalent multi-collection context. A `map(row)` inserted inside generation is not a complete transform stage.

If a transform changes identity-bearing values, it must execute before:

- `defaultCurieLocalPart()` / custom local-part calculation;
- `render()` path generation;
- `computeConceptCid()` and provenance;
- path collision reservation.

The architecture also has to state whether `concept_cid` hashes raw source scope, transformed concept scope, or both. Today the hash deliberately uses source/identity scope chosen by note kind; silently inserting transformed values after identity calculation would make re-import behavior incoherent.

## 2. Three concrete futures

| Axis | **A. Transformation stays in templates** | **B. Distinct transform stage before render** | **C. Hard shapes stay producer-side** |
|---|---|---|---|
| **Architectural boundary** | `ParsedData row -> renderTemplateValue() -> Address`. Templates remain both value-selection and transformation. | `decoded source -> transform -> concept rows -> render()`. Templates return to leaf projection/formatting, while a separate stage owns row selection, derivation, collection reshaping, and joins. | Bundled engine remains `iterable of sufficiently structured records + recipe -> Tier 1`. Anything requiring a harder source shape is normalized by a producer or emitted directly as Tier 1. |
| **Recipe schema** | Extend `$defs.template` semantics and its documented filter set. No new structural contract. | Add an **optional, separately versioned transform contract** to the recipe envelope, while preserving the current target/templates unchanged for recipes that omit it. The transformed-row scope and determinism/error semantics must be language-neutral. | Freeze the recipe as a projector contract; do not add a general transform contract. Clarify the capability boundary and producer assumptions in documentation/package metadata. Tier 1 remains the only load-bearing output contract. |
| **Engine changes** | Concentrated in `src/render/template.ts`, with sink adjustments in `src/render/index.ts`, `src/render/body.ts`, or mechanisms when new value types appear. Parsers and generation remain one-row streaming. | Add a transform executor before identity/render. Row-local transforms can stream. Predicates can filter. Joins/recursive expansion require parsers to retain named collections/root context or a new pre-`ParsedData` source model. `generation-engine.ts` should continue consuming transformed rows, but only after identity inputs are final. Preview, source recognition, signatures, progress, and error reporting must observe the transformed row shape. | No generic transform executor. Keep current parsers/projector. Hard-source support arrives as external cleanup, direct Tier 1 emission, a source-specific in-plugin adapter, or a prebuilt/reusable package. Generic joins and arbitrary source reshaping do not enter `render()`. |
| **Ten bundled import recipes** | The ten `recipes/import/*.json` remain the executable units. Nine framework recipes changed in `8acaf220`; `crosswalk-edge.json` did not. Future gaps are addressed by more template capability. | All ten remain valid because the new stage is optional. Only recipes that need predicates/joins/harder shapes acquire transform declarations over time. Existing target templates remain compatibility output projections. | All ten remain valid for already-clean inputs. The four recipes that currently require source pre-filtering and the recipes missing relationship joins need a companion producer, source adapter, or prebuilt Tier 1 package; recipe JSON alone no longer promises raw-source importability. |
| **Unknown user recipes** | No edits if existing filter semantics remain byte-identical. Growing filter semantics increases the conformance burden on every engine. | No edits under an omit-means-current-pipeline compatibility rule. Migration can be recipe-by-recipe. A forced rewrite from filters into the new stage would be breaking and should be avoided. | No edits. Existing templates remain supported as the frozen simple-projector surface. User recipes continue to depend on receiving the same normalized row shape. |
| **External Python producer** | To execute a recipe, it must reproduce Crosswalker's path parser, exact-key precedence, optional semantics, list lifting/elision, every filter, and every sink rule. Alternatively it bypasses recipes and emits Tier 1 directly. | A conformant Python engine must implement both the transform contract and render contract, with identical ordering/error/determinism. A Python feeder may instead execute only the transform stage and hand normalized rows to the plugin; a direct producer may still emit Tier 1. | It either emits stable normalized records for the simple projector or bypasses the engine and emits valid Tier 1. It does not need to implement a Crosswalker transform contract. This is the cleanest direct expression of schema-as-primitive. |
| **Runtime-agnostic commitment** | Formally survives if every template semantic is fully specified outside TypeScript. Practically, portability weakens as an increasingly rich language hides inside one string schema and external engines must clone implementation details. | Survives if the transform contract specifies behavior, ordering, types, errors, and determinism independently of TypeScript. It fails if the schema merely names TS callbacks or plugin-only behavior. | Strongest alignment at the Tier 1 boundary. Recipe portability also remains strong only for the simple projector; producer-specific preprocessing must be independently reproducible or packaged, or the recipe ceases to be self-sufficient. |
| **Mobile** | Best immediate fit. Everything remains pure TypeScript in `main.js`, per-row, and streaming. | Can remain mobile-portable if implemented in TypeScript without subprocesses. Row-local work is cheap; joins/aggregations need explicit memory/index/spill limits because mobile cannot rely on Python, DuckDB, or desktop filesystems. | The simple bundled path remains mobile. External Python is unavailable on mobile by design. A mobile user can import hard shapes only when a TS source adapter or prebuilt package exists; arbitrary hard spreadsheets are outside the mobile promise. |
| **Tactical fix `8acaf220`** | Direct progress toward A: literal key access and automatic list lifting enlarge the template model by capabilities rather than one-off filters. | Mixed. Literal key addressing remains necessary at the render boundary. List-preserving sinks and compatibility filters remain useful. But splitting/rejecting/cleaning collections may become duplicated logic or migration debt if B declares those operations transform-stage concerns. They should be grandfathered, not removed. | Mixed-to-debt. Literal key access is still basic addressing and belongs in the projector. Per-item cleaning is boundary erosion under a strict C: useful compatibility work that should remain supported, but not the precedent for continued transform growth. |
| **Migration cost** | Lowest code/schema migration; highest long-term semantic accumulation. Bundled and unseen recipes remain untouched. | Moderate implementation and documentation cost, but recipe migration can be zero initially. The hard part is widening the pre-render source seam without breaking streaming, preview, identity hashes, or source recognition. | Lowest engine/schema cost; highest product/UX and ecosystem cost. Known hard recipes need companion producers/adapters/packages, and unsupported raw sources need honest user-facing diagnosis. |
| **Recipe `$id` major bump** | **No**, provided old templates retain identical meaning and new filters/value forms are additive. A semantic redefinition of an existing filter would require a major bump. | **No**, if the transform contract is optional and omission preserves the exact current pipeline. **Yes** if old templates are removed/reinterpreted, transform becomes mandatory, or the default source scope changes. | **No**, if current recipes remain executable and the change is a capability-boundary decision. **Yes** only if producer declarations become mandatory or existing template capabilities are withdrawn. |

## 3. Additive-evolution test

The binding test is not whether the first change is additive. It is whether the *next unknown shape* can be added without invalidating recipes written before it.

### A. Templates remain the transform engine

**Where it is genuinely additive:**

- New row-local path addressing can be added while old path readings remain unchanged.
- New scalar/list operations can be added under unused names.
- New output sinks can accept richer values while preserving old scalar behavior.
- `8acaf220` demonstrates a good local extension pattern: automatic lifting made every existing and future item operation list-capable without rewriting each filter.

**Where the extension point runs out:**

Templates receive one `SourceScope`. A future sixth shape such as a three-way join across workbook sheets has no second collection to address. Adding more filters cannot recover data discarded by `xlsx-parser.ts` when it selected one sheet. Likewise, a recursive source expansion that needs to emit several concepts from one source node is not a value transform inside one already-chosen note.

A can still preserve old recipes when that future arrives, but only by adding a new pre-render source stage beside templates. That future change can be *backward-compatible*, yet it means A was not the durable placement for the full problem; the architecture has evolved into B or C.

**Most dangerous compatibility trap:** a richer parser/filter grammar changes how an old ambiguous string is tokenized or how an existing name resolves. `8acaf220` avoided this by centralizing tokenization and preserving exact-key precedence, but every further language expansion must repeat that discipline.

### B. A distinct transform stage

**Required additive extension point:**

- The stage is optional; absence means byte-identical current behavior.
- Transform behavior is versioned independently enough that a new capability does not reinterpret old declarations.
- Engines fail clearly on an unsupported declared capability rather than silently ignoring it.
- The output of the stage is a stable concept-row scope consumed by the existing render contract.
- Existing template filters remain supported indefinitely as compatibility/leaf-formatting behavior.

**Sixth-shape test:**

Suppose the next source is a recursive taxonomy whose nodes contain heterogeneous child collections. A new transform capability can traverse/expand it into concept rows, while every recipe without that capability continues through the old direct-row path. No old recipe needs editing.

However, that result is additive only if the stage was placed before the current one-collection narrowing or its input contract already preserves named collections/source context. If B v1 is designed only as `map/filter` over `ParsedData.rows`, then a later join forces the stage's input model to change. Old recipes can still be preserved, but engines and producer implementations must now support two source models. The architectural shift-left requirement therefore applies most strongly to the **stage input**, not to its first operation list.

**Most dangerous compatibility trap:** transformed and raw fields collide. If a stage silently overwrites a source column that an old template references, omission is not enough to preserve behavior. Raw/transformed scope ownership and identity-hash inputs need an explicit rule from the first version.

### C. Producer-side hard shapes

**Where it is genuinely additive:**

A new source shape does not change the recipe or engine at all. A producer learns the shape and emits either:

- the same stable record shape an existing recipe expects; or
- valid Tier 1 Markdown directly.

A sixth, tenth, or hundredth shape expands the producer ecosystem rather than the recipe schema. Earlier recipes and Tier 1 consumers remain valid.

**What can still break:**

The normalized row shape becomes an implicit dependency. If producer v2 renames, nests, or retypes fields, the unchanged recipe fails even though the recipe schema did not change. Additive evolution therefore requires the producer/package to preserve its emitted row contract or version it independently. Otherwise C avoids schema migration by moving the breaking surface somewhere less visible.

**Most dangerous compatibility trap:** a bundled recipe appears portable but depends on undocumented manual preprocessing. Another conformant engine receives the authoritative raw source, executes the recipe faithfully, and cannot reproduce the vault because the actual producer step was not part of the portable artifact.

## 4. What Option C owes a spreadsheet-only user

If hard shapes are declared the producer's problem, the product boundary must be explicit rather than implied.

The bundled engine can credibly owe a user with only a spreadsheet:

1. **One-record-per-row imports without leaving Obsidian:** CSV and one XLSX sheet, stable headers, ordinary scalar/list cells, layout/frontmatter/body projection, output validation, preview, and re-import safety.
2. **Basic no-code cleanup already inside the projector:** literal header addressing, missing-value handling, trim, safe naming, and the shipped list behavior. Removing these would break existing recipes and make ordinary spreadsheets needlessly hostile.
3. **Clear shape diagnosis:** distinguish “this sheet is directly importable” from “this workbook needs row filtering,” “this workbook needs a cross-sheet join,” or “this JSON needs multiple collections.” Do not let generation silently produce empty/stub notes.
4. **A no-Python path for vetted public sources:** either a bundled TypeScript source adapter or a reusable prebuilt/verified Tier 1 package. This is source support, not a promise of a universal transform language.
5. **An honest unsupported case:** for an arbitrary private workbook requiring joins or reconstruction, the user must use a spreadsheet-native tool such as Power Query/OpenRefine, obtain a prepared package, or ask someone to build a producer. The plugin does not generically solve it.

Without item 4, C means that several bundled recipes cannot deliver a one-click import from the very official source they describe. Without item 5, C is not a boundary; it is hidden roadmap debt.

## 5. Migration accounting

### Corpus facts

- `recipes/import/` contains **ten** bundled import recipes.
- Commit `8acaf220` changed **nine framework recipes**; `crosswalk-edge.json` was unchanged.
- `src/import/recipe-registry.ts` also registers `recipes/starter/evidence-junction-notes.json`, so the recognized-source registry has eleven entries even though the import-recipe directory has ten.
- User-authored recipes may exist in vaults that cannot be enumerated or migrated centrally.
- `spec/recipe.schema.json` states that the current URI is stable and breaking changes bump to `/v2/`; current additive history is SchemaVer 1.8.0 under the same `$id`.

### Migration by option

| Option | Required migration now | Safe compatibility policy | Major `$id` trigger |
|---|---|---|---|
| **A** | None for existing recipes. Rewrite only recipes choosing new filters. | Never reinterpret existing templates; add names/value forms and preserve old output bytes. | Existing filter/path/template text changes meaning or previously valid recipes stop executing. |
| **B** | None if the stage is optional. Migrate only recipes needing its capabilities. | Omitted stage follows the exact current direct-row/render path. Keep old filters as permanent compatibility behavior. | Stage becomes required, old templates are removed, or default source/identity scope semantics change. |
| **C** | No recipe migration. Operational migration may be substantial: publish/maintain companion producers, adapters, or packages for hard bundled sources. | Keep current simple-projector recipe semantics indefinitely; version producer outputs separately. | Recipe schema begins requiring a producer declaration or withdraws current template semantics. |

**Bottom line on schema versioning:** none of A, B, or C inherently requires a major `$id` bump. B can be structurally larger and still additive. C can be architecturally narrower and still non-breaking. The major-bump question is controlled by compatibility behavior, not by how many files change.

## 6. Tactical fix `8acaf220`: progress or debt

| Tactical capability | A | B | C |
|---|---|---|---|
| Literal key segments + exact-key compatibility | Strategic foundation. | Strategic at the render boundary; transformed rows still need unambiguous field addressing. | Strategic basic projector capability, not transform overreach. |
| Lists as values; all filters lift automatically | Strategic foundation for row-local collection handling. | Useful compatibility and leaf formatting; some source cleanup may later be better expressed in the distinct stage. | Grandfathered boundary debt under a strict producer-side policy, but cheap and useful enough to retain. It should not justify adding joins/predicates to templates. |
| `split`/`reject`/`join`/per-item cleanup | Directly advances A. | May be duplicated by the transform stage; do not unwind existing recipes, but decide which layer owns future data shaping. | Debt in placement, not wasted work: it fixed real outputs and remains part of the frozen simple projector. |
| Central tokenizer and fail-loud list sinks | Reduces the main language-growth risk. | Remains valuable because templates still exist after the transform stage. | Remains valuable because the simple projector still executes portable recipes. |

The commit message says the tactical fix was scoped as a step toward the design. That is fully true only under A. Under B it is partly foundation and partly compatibility surface. Under C, literal addressing is foundation while per-item transformation is honest debt to freeze rather than unwind.

## 7. Strongest case and strongest threat for each option

| Option | Strongest argument **for** | Objection that most threatens it |
|---|---|---|
| **A. Templates** | It preserves the pure, deterministic, streaming, mobile render core and requires the least migration. The tactical list algebra proves that capability-level extensions can close several real gaps without rewriting old recipes. | The input to templates is already one row from one collection. No template refinement can join data the parser discarded. Treating templates as the universal transform stage confuses output interpolation with source-shape reconstruction and eventually forces a second stage anyway. |
| **B. Distinct stage** | It creates an explicit seam where row selection, derivation, expansion, and joins can happen before identity and rendering, while leaving all existing recipes on a byte-identical compatibility path. It also gives preview/error/provenance a named place to observe transformations. | To solve joins honestly it must widen the source-side runtime model beyond `ParsedData.rows`, complicating streaming, mobile memory, the wizard, producer conformance, identity hashing, and the “no Tier 0.5 contract” discipline. It can become the transform IDE previously rejected under a cleaner name. |
| **C. Producer-side** | It is the strongest application of schema-as-primitive: arbitrary shapes expand the producer ecosystem, not the plugin or recipe language. Tier 1 and the simple projector remain stable, runtime-neutral, mobile-friendly, and insulated from the endless tail of source complexity. | The measured failures are in mainstream official framework sources, not exotic power-user inputs. Without no-code adapters or packages, C tells spreadsheet-only users that bundled recipes cannot import their own sources, and it makes recipes non-self-contained if their required preprocessing is undocumented. |

## 8. Single fact most likely to decide placement

`ParsedData` carries one iterable collection, and `generateFromRecipe()` renders and discards one row at a time. Therefore the join gap is not a missing template capability: the required second collection is absent before template evaluation begins. The architect's choice is whether to widen that pre-render boundary (B) or declare that widening a producer responsibility (C); A alone cannot close the full measured problem.
