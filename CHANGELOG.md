# Changelog

All notable changes to Crosswalker will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased] — v0.1 implementation in progress (2026-05-04 → present)

The 0.1 design phase concluded 2026-05-04. Implementation phase began the same day. As of 2026-05-10, milestones v0.1.1 / v0.1.2 / v0.1.3 / v0.1.4 / v0.1.4.5 / v0.1.5 are ✅ shipped; v0.1.6 (Bases query layer + SSSOM import + recipe UX) is mid-milestone (Phases 1 + 1.5 + 2 + 3 done; Phases 4-5 pending).

### v0.1.6 Phase 3 — `crosswalkerPivot` registered Bases view (2026-05-10, ✅ Done)

Per Settled #2 + Ch 30. The single `registerBasesView` registration v0.1.6 ships. Custom Bases view that renders pivot grids (rows × cols × cells) from Bases-filtered entries; pairs with the launch-market Coverage Matrix recipe. Reads filtered `controller.entries` directly; calls Phase 2's plugin handles for Tier 2 enrichment when needed.

**New surfaces:**
- Custom Bases view: `crosswalker-pivot` (registered via Obsidian 1.10.0+ public `registerBasesView` API)
- Reference `.base` file: `_crosswalker/views/coverage-matrix.base` (shipped on first plugin run; idempotent — never overwrites user edits per Settled #3)
- Bases-disabled fallback Notice with helpful text

**New code:**
- `src/views/bases-api.ts` — `registerCrosswalkerBasesView(plugin, viewId, registration)` wrapper. Gates on `requireApiVersion('1.10.0')`. Handles "already exists" errors as success (idempotent re-register). Returns structured `RegistrationResult` with `reason: 'no-public-api' | 'bases-disabled' | 'already-registered' | 'error'` so call sites can surface meaningful Notices. Adapted from the [TaskNotes v4 Bases pattern](https://github.com/callumalpass/tasknotes/tree/main/src/bases) (Settled #11 precedent).
- `src/views/pivot-grid.ts` — pure data-shaping helper. `computePivotGrid(entries, config)` consumes flat `PivotEntry[]` + axes/op/empty config; produces `{ rowKeys, colKeys, cells, totalEntries, sparsePivotWarning, range }`. Supports all 8 v0.1 aggregation ops (per Ch 29 vocabulary), 3 empty-cell modes (`gap`/`blank`/`zero`), sort directions, sparse-pivot threshold detection. Heatmap intensity normalization helper. **31 unit tests.**
- `src/views/crosswalker-pivot-view.ts` — `Component` subclass with `onDataUpdated` lifecycle. Reads `controller.entries`, calls `computePivotGrid`, renders DOM table. 100ms debounce on Bases data updates. Empty-state + error-state + sparse-warning rendering. `buildCrosswalkerPivotViewFactory` closure captures plugin handle for Tier 2 access.
- `src/views/reference-base-files.ts` — `writeReferenceBaseFiles(app, debug)` idempotent first-run writer. Skips files that already exist (preserves user edits per Settled #3). Reference content inlined as TS string (esbuild bundles cleanly). **6 unit tests.**
- `templates/coverage-matrix.base` — source-of-truth reference template (mirrored in `REFERENCE_COVERAGE_MATRIX_BASE` constant). Filters by `_crosswalker/mappings/`; declares 2 views (`crosswalker-pivot` custom + Bases-native `table` fallback).

**View options panel** (8 controls, per `CrosswalkerBasesViewOption[]`):

| Key | Type | Purpose |
|---|---|---|
| `rowsBy` | property | Row-axis property name |
| `colsBy` | property | Col-axis property name |
| `cellOp` | dropdown | Aggregation op (count/count_distinct/sum/avg/min/max/first/last) |
| `cellOf` | property | Cell-value source for non-count ops |
| `empty` | dropdown | Empty-cell mode (gap/blank/zero) |
| `heatmap` | toggle | Color shading proportional to value |
| `rowSort` | dropdown | asc/desc/none |
| `colSort` | dropdown | asc/desc/none |

**CSS** (`styles.css`): `.crosswalker-pivot-grid` + `-table` + `-cell` + `-empty` + `-error` + `-warning` + `-footer` classes. Heatmap variant uses `--crosswalker-pivot-cell-intensity` CSS custom property (0.0 → 1.0). Theme-aware via Obsidian CSS variables.

**Test coverage**: 37 new tests (31 pivot-grid + 6 reference-base-files). **201/201 tests pass.** Build clean. E2E suite at `tests/e2e/crosswalker-pivot-view.spec.ts` is a documentation scaffold — view DOM rendering covered manually via `TEST_PHASE3_PIVOT_VIEW.md` 7 scenarios.

**Phase 3 deferrals** (Phases 4-5 of v0.1.6 — pending):
- Phase 4: recipe-picker UX + embedded `\`\`\`base` block insertion + `crosswalker-bases` SKILL.md (per Ch 32)
- Phase 5: opt-in materialization command + sparse-pivot HARD guard with `COUNT(*)` pre-estimate + first-run `_crosswalker/views/` Excluded Files prompt

See `TEST_PHASE3_PIVOT_VIEW.md` for manual test scenarios.


### v0.1.6 Phase 2 — SSSOM TSV import + materialized closure (2026-05-10, ✅ Done)

Per [Ch 35 (graph→tabular bridging)](https://cybersader.github.io/crosswalker/agent-context/zz-research/2026-05-09-challenge-35-graph-to-tabular-bridging-rerun/) + the locked D1 "Ch 35 nuance" scope expansion. SSSOM (Simple Standard for Sharing Ontological Mappings) is the canonical TSV interchange format used by BioPortal, OxO, OBO Foundry, and Biomappings. Phase 2 gives Crosswalker first-class on-ramp to that ecosystem.

**New surfaces:**
- Command: `Crosswalker: Import SSSOM mapping file`
- Modal flow: file picker (vault `.tsv` / `.sssom.tsv` files OR paste TSV content) → parse + preview (row count, detected ontology pair, warnings) → confirm → execute
- Output folder convention: `_crosswalker/mappings/<source>-to-<target>/` (one junction-edge `.md` per mapping)

**New code:**
- `src/import/sssom-parser.ts` — TSV parser per SSSOM 0.15+ spec. Handles `# `-prefixed YAML-shaped headers (curie_map, mapping_set_id, license, etc.), required columns (subject_id, predicate_id, object_id), optional columns (subject_label, object_label, mapping_justification, confidence, mapping_provider, mapping_set_id), CURIE-prefix-based ontology-pair detection.
- `src/import/sssom-importer.ts` — orchestrator: parse → SKOS→STRM predicate normalization → synthetic crosswalk-edge recipe → `generateFromRecipe` → Tier 2 projection → eager closure precompute. Idempotent re-imports.
- `src/import/sssom-import-modal.ts` — modal UX (file picker, paste editor, preview, progress notice).
- `src/tier2/queries.ts`: new `precomputeClosureForOntologyPair(db, source, target, predicate?)` — eagerly populates `closure_cache` for the imported pair (per Ch 35: "every production ontology-web system materializes precomputed pairwise crosswalks").
- `plugin.precomputeClosure(source, target, predicate?)` — exposed plugin handle for the eager precompute.

**SKOS → STRM predicate normalization** (preserves SSSOM original as `sssom_predicate` frontmatter):
| SSSOM/SKOS predicate | STRM `predicate_id` |
|---|---|
| `skos:exactMatch` | `is_equivalent_to` |
| `skos:closeMatch` | `is_approximate_to` |
| `skos:broadMatch` | `is_broader_than` |
| `skos:narrowMatch` | `is_narrower_than` |
| `skos:relatedMatch` | `intersects_with` |
| (unknown) | `intersects_with` (with warning) |

**Test fixture**: `tools/fixtures/synthetic/nist-csf-to-iso27001.sssom.tsv` (11 mappings; covers all 5 SKOS predicates + curie_map header + mapping_set_id).

**Test coverage**: 25 new tests (19 parser unit + 6 importer integration). **164/164 tests pass.**

**Phase 2 deferrals** (Phases 3-5 of v0.1.6 — pending):
- Phase 3: `crosswalkerPivot` registered Bases view (per Settled #2 + Ch 30)
- Phase 4: Recipe-picker UX + embedded `\`\`\`base` block insertion + `crosswalker-bases` SKILL.md (per Ch 32)
- Phase 5: Opt-in materialization command + `_crosswalker/` folder convention finalization

**Phase 2 known limitations** (tracked for follow-up):
- `match_confidence` (numeric per Tier 1 schema) is preserved as the SSSOM `sssom_confidence` frontmatter field (string) instead of `match_confidence` (number). Cause: render() template engine emits all values as strings; numeric coercion in templates is a v0.1.7+ concern.
- E2E suite for SSSOM import is scaffolded (`tests/e2e/sssom-import.spec.ts`) but pending — WebdriverIO env unavailable in current dev env.

See `TEST_PHASE2_SSSOM_IMPORT.md` for manual test scenarios.

### v0.1.6 Phase 1.5 — Test infrastructure (2026-05-09, ✅ Done)

Foundation pass before Phase 2. Three changes:
- **Deterministic fixtures**: `tools/generate-fixtures.ts` gains `--deterministic` flag (also `CROSSWALKER_FIXTURES_DETERMINISTIC=1` env var). When set, `produced_at` uses the stable `2026-05-04T00:00:00.000Z` timestamp instead of `Date.now()`. `bun run fixtures` now passes `--deterministic` so committed fixtures are byte-identical across regenerations.
- **Fixture-drift CI gate**: new `bun run check:fixtures-drift` script. Stashes existing fixtures, regenerates from canonical source, diffs against committed HEAD, fails if drift detected. Catches schema/recipe/source-CSV changes that silently invalidate test data.
- **Phase 2-5 E2E test scaffolds**: `tests/e2e/{sssom-import,crosswalker-pivot-view,recipe-picker-flow,materialize-command}.spec.ts` with Mocha pending-test patterns. Makes test-infra expectations visible to the implementation phases.



### v0.1.6 Phase 1 — recipe `query:` block schema (2026-05-09, ✅ Done)

Foundation phase of the v0.1.6 milestone: adds an optional `query:` block to `spec/recipe.schema.json` so recipes can declare what to query (axes, edges, aggregation) using the 8-verb Layer A vocabulary. Per [Ch 29 (8-primitive validation)](https://cybersader.github.io/crosswalker/agent-context/zz-research/2026-05-09-challenge-29-ontology-web-query-verbs-validation/) + [Ch 30 (5 v0.1 view shapes)](https://cybersader.github.io/crosswalker/agent-context/zz-research/2026-05-09-challenge-30-view-shape-taxonomy/) + [Ch 31 (schema design)](https://cybersader.github.io/crosswalker/agent-context/zz-research/2026-05-08-challenge-31-deliverable-a-shape-dispatched-data-only/) + [Ch 36 (compositional language stack)](https://cybersader.github.io/crosswalker/agent-context/zz-research/2026-05-09-challenge-36-query-language-rerun/).

**Schema bump (additive; SchemaVer 1.1.0)** — `spec/recipe.schema.json`:
- New top-level `query:` property; optional. Recipes WITHOUT `query:` continue to validate (additive, backward-compatible).
- 31 new `$defs`: `query_block`, `ShapeDispatchA`, `ShapeDispatchB`, six `*Primitives` (Table/List/Pivot/Graph/Hierarchy/Timeline), helper types (OntologyRef, ConceptRef, EdgePredicate, FieldSelector, AggregationOp, QueryFilter, QuerySort, Projection, Traversal, Aggregate, Join, GroupBy, QueryParam, QueryProvenance, QueryOutput, QueryViewOptions).
- `$schema` and `$comment` allowed at recipe top-level (editor autocomplete hint + free-text comment).
- 8 query verbs locked per Ch 29: `filter / traverse / bind / project / aggregate / anti-join / set-op / diff`. Closure folded into parameterized `traverse(depth=*, transitive=true)`; pivot demoted from Layer A to Layer B (presentation, not value-producing).

**Both schema discriminator styles ship** (per Ch 31a + Ch 31b). Settings `recipeSchemaStyle: 'A' | 'B'` selects which:
- Style A (default): `oneOf`+`const` discriminator. "Must match exactly one schema" errors.
- Style B (advanced): `if`/`then`/`else` cascading. Focused per-shape errors. Better IDE autocomplete.
- Both produce identical validity verdicts; differ in error-message UX. Settings toggle under "Recipe schema" section.

**Validator changes** (`src/validation/validator.ts`):
- New `RecipeSchemaStyle = 'A' | 'B'` type export.
- `validateRecipe(recipe, style?)` accepts optional style param; default `'A'`.
- Both validators compiled at init via `buildStyleBSchema()` which deep-clones the schema and patches `query_block.allOf[0]` to reference `ShapeDispatchB` (strips `$id` so AJV compiles as anonymous variant).
- `main.ts` wraps `validateRecipe` to inject the active style from settings — callers stay style-agnostic.

**5 reference recipes shipped** to `recipes/v0-1/`:
- `coverage-matrix.json` (pivot shape — launch-market Coverage Matrix; NIST CSF × ISO 27001)
- `crosswalk-density.json` (table shape — aggregates per framework pair)
- `orphan-controls.json` (list shape — demonstrates anti-join verb; controls without evidence)
- `hierarchy-view.json` (hierarchy shape — schema-declared; `crosswalkerHierarchy` renderer ships v0.1.7-v0.1.8 per Ch 30)
- `list-view.json` (list shape — minimal; Bases-native rendering)

**Test coverage**: 23 new unit tests in `tests/recipe-query-block.test.ts` cover backward-compat, all 5 reference recipes in both styles, schema enforcement (missing required fields, unknown shapes, additionalProperties:false, aggregate op validation), and A/B verdict equivalence. **139/139 tests pass.**

**Phase 1 deferrals** (Phases 2-5 of v0.1.6 — pending):
- Phase 1.5: deterministic fixtures + fixture-drift CI gate + property-based schema tests + E2E env diagnosis + Phase 2-5 test scaffolds (test infrastructure pass before Phase 2)
- Phase 2: SSSOM TSV import + materialized closure-table + sparse-pivot guard (per Ch 35)
- Phase 3: `crosswalkerPivot` registered Bases view (per Settled #2 + Ch 30)
- Phase 4: Recipe-picker UX + embedded `\`\`\`base` block insertion + `crosswalker-bases` SKILL.md (per Ch 32)
- Phase 5: Opt-in materialization command + `_crosswalker/` folder convention finalization

See `TEST_PHASE1_QUERY_SCHEMA.md` for manual test scenarios. See [v0.1.6 milestone](https://cybersader.github.io/crosswalker/reference/roadmap/milestones/v0-1-6-bases-query-layer/) for the full milestone scope and Phases 2-5 plan.


### v0.1.5 — Tier 2 sqlite-wasm sidecar projector (2026-05-06, ✅ Done — all 6 phases)

SQL projection layer of the Crosswalker pipeline now live: deletable-recoverable `.crosswalker.sqlite` sidecar, projector populates `concepts`/`mappings`/`junction_notes`/`ontologies` tables from canonical Tier 1, three typed query helpers + lazy closure cache via recursive CTE per Ch 18 §2, settings-toggleable auto-projection on vault load. WASM-A path (plain `@sqlite.org/sqlite-wasm`); sqlite-vec deferred with calendar-anchored 2026-11-06 revisit. Realistic-framework integration tests (NIST 800-53 / NIST CSF / ISO 27001 / MITRE ATT&CK) pass. See [delivery log](https://cybersader.github.io/crosswalker/agent-context/zz-log/2026-05-06-v0-1-5-tier-2-sidecar-shipped/).

**Phase 1 — substrate scaffolding** (`src/tier2/sidecar.ts` + `migrations.ts` + `schema.sql`)

- sqlite-wasm via Blob URL load (Obsidian app:// URL workaround)
- OPFS sahpool VFS (mobile-portable; no COOP/COEP)
- `tier2-sqlite-v1` schema; drop-and-recreate migration on version mismatch
- DDL per [v0.1 schema spec §7](https://cybersader.github.io/crosswalker/agent-context/v0-1-schema-spec/#7-tier-2-sidecar-sql-schema-sqlite-wasm-projection)
- `plugin.openTier2()` instance handle exposed
- esbuild target ES2018 → ES2020 (sqlite-wasm uses BigInt literals)
- wdio.conf.mts `before` hook copies tier-2 artifacts into temp test vault (obsidian-launcher only copies main.js + manifest.json + styles.css)

**Phase 2 — projector** (`src/tier2/projector.ts`)

- Walks `app.vault.getMarkdownFiles()` lazily via [streaming foundation](https://cybersader.github.io/crosswalker/reference/roadmap/milestones/v0-1-4-5-streaming-refactor/)
- Kind-aware dispatch: concept → concepts; junction-note → junction_notes; crosswalk-edge → mappings
- Idempotent INSERT OR REPLACE keyed on `vault_path` / `source_path UNIQUE`
- Cooperative yielding every 50 files
- Closure cache invalidation after any mappings change (`DELETE FROM closure_cache`)
- FNV-1a content hashing for change detection
- `plugin.runProjection()` exposed as instance handle

**Phase 3 — query API + closure cache** (`src/tier2/queries.ts`)

- `getConceptsByOntology(db, ontologyId)` — flat list ordered by curie
- `crosswalkBetween(db, subjOnt, objOnt, predicateId?)` — direct edges (CURIE-prefix LIKE on subject/object)
- `closureFromConcept(db, startCurie, predicateId?, maxDepth=10)` — transitive closure via recursive CTE per [Ch 18 §2 R2a](https://cybersader.github.io/crosswalker/agent-context/zz-research/2026-05-02-challenge-18-tier-2-lite-rule-subset/) patterns: path-string anti-join cycle detection (`instr(path, '|' || target || '|') = 0`); `MIN(depth)` aggregation; predicate filter in BOTH base + recursive arms
- Lazy closure-cache materialization: cache keyed on `(start_curie, predicate_filter, target_curie, shortest_depth)`; first call computes + populates; subsequent calls hit cache
- `plugin.queryConcepts/Crosswalk/Closure()` exposed
- Closure-cache row-shape bug caught on self-review (initial design had per-edge rows requiring recursive cache walks; fixed before shipping by reinterpreting cache columns as start/predicate-filter/target/shortest-depth)

**Phase 4 — plugin integration**

- `app.workspace.onLayoutReady()` triggers `autoProjectOnLayoutReady()` per Ch 24 §2 recovery property
- Settings: `enableTier2Projection` toggle (default true) + `tier2SidecarPath` text input (default `.crosswalker.sqlite`)
- Settings UI: new "Tier 2 sidecar" section in settings tab
- Palette command `crosswalker:clear-tier-2-sidecar` — closes handle, deletes file, next access reprojects
- `openSidecar` + `clearSidecar` respect `settings.tier2SidecarPath`

**WASM-A pivot (2026-05-05 → 2026-05-06)**

Originally chose WASM-B (vendor `sqlite-vec-wasm-demo` to ship vec from day 1). Integration hit a 5-issue emscripten env-detection chain in Obsidian's Electron renderer — the demo artifact is for plain web browsers, not Electron's hybrid `window`+`process` environment. Reverted to WASM-A (plain sqlite-wasm) with sqlite-vec deferred. Calendar-anchored revisit: **2026-11-06**. See [WASM-A pivot synthesis](https://cybersader.github.io/crosswalker/agent-context/zz-log/2026-05-06-wasm-a-pivot-synthesis/) + [Ch 24 §5 Q4](https://cybersader.github.io/crosswalker/agent-context/zz-log/2026-05-04-tier-2-substrate-synthesis/#5-migration-triggers--when-to-revisit).

**Realistic-framework integration tests** (`tests/e2e/realistic-frameworks.spec.ts` — 9 tests)

5 synthetic-but-structurally-correct fixtures modeled on real frameworks: NIST 800-53 r5 AC family (22 controls; parens in CURIEs); NIST CSF 2.0 GOVERN+IDENTIFY (25 entries; dotted IDs); ISO 27001:2022 subset (15 clauses; em-dashes; UTF-8); MITRE ATT&CK Persistence subset (19 techniques; dotted sub-technique IDs); CSF→800-53+ISO OLIR-shaped crosswalk (30 edges). Verifies multi-framework vault state + cross-ontology projection + cross-framework crosswalk queries + closure across the graph. See `tools/fixtures/realistic/README.md`.

**Workflow ecosystem** (built during this milestone)

- 3 new skills: `synthesis-log`, `delivery-log`, `wikilink-crawl`
- 2 new agents: `pre-commit-reviewer`, `milestone-starter`
- 4 CI gates ⏸ Calendar revisit 2026-08-06
- 5-agent + 3-skill + 4-CI-gate ecosystem designed in [workflow audit log](https://cybersader.github.io/crosswalker/agent-context/zz-log/2026-05-06-workflow-audit-and-agent-design/)

**Test counts**: 116 unit + ~64 E2E across 13 spec files = ~180 tests total, all green.

**v0.1-RC blockers carried forward** (per delivery log §"Realistic-fixture testing — gap audit"): full-catalog scale tests; real-source CSV stress; mobile sanity; OLIR-scale crosswalk; closure scale verification; `fs-safe` filter investigation; bundle size verification.

### v0.1.4.5 — Streaming refactor (2026-05-05, ✅ Done)

Bundled engine is now streaming-by-design. `ParsedData.rows` accepts either an eager array OR `AsyncIterable<Row>`. End-to-end streaming pipeline so multi-GB inputs work without OOM.

- `src/types/config.ts` — `ParsedData.rows: Row[] | AsyncIterable<Row>` union; `isEagerRows()` type guard; `rowCount: -1` signals streaming/unknown
- `src/import/parsers/csv-parser.ts` — new `parseCSVFileStream()` returns AsyncIterable rows directly via PapaParse step callback with backpressure (HIGH_WATER=100, LOW_WATER=10)
- `src/generation/generation-engine.ts` — `generateNotes` + `generateFromRecipe` per-row loops refactored to `for await ... of`; type-guarded callsites in `analyzeColumns`, `estimateOutput`, wizard preview
- E2E: `tests/e2e/streaming.spec.ts` (4/4 pass — AsyncIterable consumption + eager-array backwards-compat)

### v0.1.4 — Junction notes + crosswalk edges (2026-05-05, ✅ Done)

All 3 Tier 1 frontmatter shapes (concept-note / junction-note / crosswalk-edge) producible via the bundled engine. STRM predicate vocabulary enforced at pre-write validation.

- `spec/recipe.schema.json` — `layout_entry.kind: concept | junction-note | crosswalk-edge` discriminator, default `concept` (backwards-compat)
- `src/render/index.ts` — kind dispatch in render(); `Tier1Kind` type
- `src/generation/generation-engine.ts` — new `generateFromRecipe()` native Ch 22 entry point; bypasses v0.1.0 column-role legacy logic
- `plugin.runImportFromRecipe()` exposed for native-recipe imports
- Pre-write Tier 1 validation (`validateTier1Frontmatter`) wired with strictValidation default true
- 3 starter recipes shipped in `recipes/starter/`: `nist-csf-to-800-53-crosswalk.json`, `iso27001-to-800-53-crosswalk.json`, `evidence-junction-notes.json` — generic over framework pairs (CIS↔800-53, MITRE↔800-53, etc., all use the same template)
- E2E: `tests/e2e/crosswalks.spec.ts` (5/5 pass — milestone gate)

### v0.1.3 — Generation engine integration (2026-05-05, ✅ Done)

Generation engine refactored to call `render()` per row via Phase-0 legacy-recipe-shim. managed/user_preserve frontmatter merge wired into 'replace' mode. `_crosswalker` provenance block emitted per spec/tier1.schema.json. Path collision detection.

- `src/generation/legacy-recipe-shim.ts` — translates v0.1.0 column-role configs → Ch 22 layout Recipe (per Ch 22 §10.7 4-phase migration)
- `src/generation/frontmatter-merge.ts` — managed (recipe-owned) vs user_preserve (recipe-untouched) semantics; user_preserve glob support; always-overwrite specials (`_crosswalker`, `curie`)
- `src/generation/provenance.ts` — `_crosswalker` block writer per Tier 1 schema $defs/provenance_block
- `src/generation/generation-engine.ts` — `buildNoteDataViaRender()` + `readExistingFrontmatter()` via metadataCache + path collision detection
- `plugin.runImport()` exposed as E2E entry point
- E2E: `tests/e2e/full-import-flow.spec.ts` (4/4 pass — milestone gate; verifies real file I/O + re-import idempotency + user_preserve survival)

### v0.1.2 — render() v1 (2026-05-05, ✅ Done)

Pure `render(Recipe, ConceptIdentity) → Address` shipped — the single coupling point per Ch 22 §3. Folder/file/heading mechanisms wired; tag/wikilink reserved for v0.2.

- `src/render/{index,types,template}.ts` — pure function pipeline; closed 7-filter set (`lower`, `upper`, `title`, `slug`, `tagsafe`, `fs-safe`, `truncate(N)`)
- `src/render/mechanisms/{folder,file,heading,tag,wikilink}.ts` — folder/file/heading wired; tag/wikilink throw informative "deferred to v0.2" errors
- Determinism verified: 100 unit + 50 E2E iterations, byte-identical output

### v0.1.1 — Type system + validation foundation (2026-05-04, ✅ Done)

AJV (Ajv2020) + ajv-formats wired into plugin startup; `spec/*.schema.json` compiled at load with fail-fast on schema malformation; `CrosswalkerConfig` interface renamed to `ImportRecipe` across the codebase.

- `src/validation/validator.ts` — `validateRecipe(obj)` + `validateTier1Frontmatter(obj)` exposed
- Validator handles attached to plugin instance for E2E reachability
- Tier 1 schema discriminator switched from `oneOf` to `allOf` + `if/then` on `kind` field (better AJV error messages)
- TS types generated from `spec/*.schema.json` to `src/types/generated/`

### Major architectural decisions during implementation phase

- **WASM-A pivot (2026-05-06)** — sqlite-vec deferred after WASM-B integration revealed sqlite-vec-wasm-demo is incompatible with Obsidian's Electron renderer ([synthesis log](https://cybersader.github.io/crosswalker/agent-context/zz-log/2026-05-06-wasm-a-pivot-synthesis/))
- **Two-mode import architecture (2026-05-05)** — Mode 1 (bundled projector) + Mode 2 (direct Tier 1 emission) both first-class; ChunkyCSV/JSONaut compose naturally as Mode 1 feeders ([log](https://cybersader.github.io/crosswalker/agent-context/zz-log/2026-05-05-two-mode-architecture/))
- **Transform-engine depth + GUI line + input formats (2026-05-05)** — stop in-plugin transform engine at v0.3 (closed 7-filter set + JSONata sub-language); JSONL ships as v0.2 input format midway ([log](https://cybersader.github.io/crosswalker/agent-context/zz-log/2026-05-05-transform-engine-depth-and-input-formats/))
- **ETL pipeline clarification (2026-05-05)** — ParsedData is in-memory implementation detail of Mode 1; not a tier; not a persisted format ([log](https://cybersader.github.io/crosswalker/agent-context/zz-log/2026-05-05-etl-pipeline-clarification/))

### Added (concept pages during implementation phase)

- [System architecture](https://cybersader.github.io/crosswalker/concepts/system-architecture/) — single canonical view of 3 storage tiers + 6 logical layers + component-to-tier matrix + read/write data flow + codebase map. New entry-point page for fresh agents/contributors

### Added (research challenges resolved during implementation phase)

- Ch 25 — Two-mode architecture and streaming (resolved 2026-05-05)
- Ch 26 — Transform engine depth + input formats (resolved 2026-05-05)

---

## [Design phase complete] — 2026-05-04

The 0.1 design phase concluded 2026-05-04 with all named architectural questions resolved. Concrete implementation work begins next. Five fresh-agent research challenges (Ch 20–24) settled the import primitive's shape, build-vs-buy posture, target-structure grammar, engine implementation language, and Tier 2 substrate.

### Decided (architectural commitments)

- **Schema-as-primitive reframe** — Tier 1 schema is the load-bearing contract; engine + ETL are convenience. Anyone (plugin, external Python, AI agent, MCP server) emitting valid Tier 1 is a first-class producer. ([ETL pillar](https://cybersader.github.io/crosswalker/concepts/etl-and-import/))
- **Closed 5-mechanism recipe grammar** for target structure — `folder | file | heading | tag | wikilink` × ordered layout × also_emit cross-cutting × graph_edges. Single coupling point: `render(Recipe, ConceptIdentity) → Address` modeled on RML/R2RML. ([Ch 22 synthesis](https://cybersader.github.io/crosswalker/agent-context/zz-log/2026-05-04-target-structure-synthesis/))
- **TypeScript in-plugin engine for v0.1**, hybrid (optional Python producer) reserved for v0.5+. Path B (Python-as-core), Path D (Rust→WASM), Path E (Go→WASM), Path F (JVM) rejected. Mobile-Obsidian portability + small-OSS contributor pool are the two irreversible constraints. ([Ch 23 synthesis](https://cybersader.github.io/crosswalker/agent-context/zz-log/2026-05-04-bundle-engine-language-synthesis/))
- **Tier 2 substrate stays on `@sqlite.org/sqlite-wasm` + `sqlite-vec`.** libSQL-WASM, Turso Cloud Tier 3 listing, and Limbo near-term adoption all rejected after adversarial evaluation. Vendor-trajectory signal — Turso publicly de-prioritized libSQL. Five explicit migration triggers locked. ([Ch 24 synthesis](https://cybersader.github.io/crosswalker/agent-context/zz-log/2026-05-04-tier-2-substrate-synthesis/))
- **Runtime-agnostic recipe schema** as load-bearing modularity commitment — recipe contract is JSON Schema + AJV + JSONata; engine implementation is swappable; vector layer (`sqlite-vec`) is decoupled from substrate. Per Ch 23 §4 + Ch 24 §5.
- **Output query layer**: Bases (Dataview removed from the v0.1 commitment).

### Added (machine-readable contracts + dev infrastructure)

- `spec/tier1.schema.json` — canonical Tier 1 vault frontmatter shapes (concept_note, junction_note, crosswalk_edge) with provenance block; CURIE/CID/wikilink/tag-path defs. JSON Schema 2020-12. `$id`: `https://crosswalker.dev/spec/tier1.schema.json`
- `spec/recipe.schema.json` — full Ch 22 grammar as JSON Schema; 3 worked NIST 800-53 examples (all-folders, mostly-headings, hybrid). `$id`: `https://crosswalker.dev/spec/recipe.schema.json`
- `spec/primitives/` — stub for per-primitive schemas; populates as engine ships
- `tools/generate-fixtures.ts` — CSV → Tier 1 markdown fixture generator. Bootstraps reproducible test data without waiting for the full `render()` engine. `bun run fixtures` regenerates from `tools/fixtures/synthetic/nist-mini.csv`
- `tools/fixtures/synthetic/nist-mini.csv` — 8-control sample fixture (AC + AU families, including parent-wikilink hierarchy)

### Added (concept pillars)

- [ETL and import](https://cybersader.github.io/crosswalker/concepts/etl-and-import/) — schema-as-primitive framing; 4 architectural pieces; 5-axis recipe selection; ~40-primitive transformation catalog; YARRRML explained simply
- [Vault hierarchy primitives](https://cybersader.github.io/crosswalker/concepts/hierarchy-primitives/) — folder/heading/tag/wikilink-graph; identity-vs-address separation
- [Embedded vs server substrates](https://cybersader.github.io/crosswalker/concepts/embedded-vs-server-substrates/) — file-IS-the-database pattern; embedded landscape across 8 data models; long-horizon watch register
- [Agent tooling](https://cybersader.github.io/crosswalker/agent-context/agent-tooling/) — progressive-disclosure space for AI agents helping users transform data into Tier 1

### Added (synthesis logs and research deliverables)

- 5 dated synthesis logs (`zz-log/2026-05-03-import-primitive-formal-foundation-synthesis`, `2026-05-04-import-engine-design`, `2026-05-04-bundle-engine-language-synthesis`, `2026-05-04-tier-2-substrate-synthesis`, `2026-05-04-target-structure-synthesis`)
- 6 verbatim research deliverables in `zz-research/` (Ch 20a/20b/20c/22/23/24)
- 4 research challenges archived with resolution callouts (Ch 20/22/23/24)

### Changed

- README polished — internal-architecture vocabulary stripped from user-facing surface (STRM/SSSOM/Tier 2/sqlite-wasm/Polars+DuckDB no longer in README). Plain-language descriptions throughout. New 3-step IMPORT → VAULT → USE ASCII diagram. Related projects section (SEACOW, folder-tag-sync). Pattern-A directory structure (embedded test-vault/) confirmed
- KB development docs updated with `tools/` + `spec/` + fixtures workflow

### Deprecated

- The `hierarchy` column-role in `ImportRecipe` is now legacy (4-phase non-breaking migration plan documented in Ch 22 synthesis §9). Old recipes import via Phase-0 syntactic-sugar compatibility through v0.5; Phase-3 removal post-v1.0.

### Long-horizon watch register established

Substrates and adjacent file-based tools evaluated and not adopted today, with falsifiable re-evaluation triggers per entry: Limbo / Turso Database, libSQL-WASM (rejected Q1), Turso Cloud (rejected Q2), kuzu, LanceDB, DuckDB-PGQ, Stoolap, Datalevin, PouchDB/RxDB; adjacent VCS — jj/jujutsu, Pijul, Sapling; content-addressed — IPLD, Unison.

---

## [0.1.0] - 2026-04-02

Initial MVP release — the import wizard ships.

### Added
- Import wizard with 4-step workflow (file select, column config, preview, generate)
- CSV parsing with PapaParse streaming for large files (over 5 MB)
- Column type detection and analysis (hierarchy, ID, text, numeric, date, tags, URL)
- Config save/load/match/browse system with fingerprint-based matching
- Generation engine creating folders and notes with `_crosswalker` metadata
- Real folder tree and sample note preview in Step 3
- Comprehensive settings tab (output path, key naming, array handling, link syntax)
- Debug logging system (toggle in settings, outputs to crosswalker-debug.log)
- ESLint setup with obsidian-plugin community rules
- Embedded test vault for development
