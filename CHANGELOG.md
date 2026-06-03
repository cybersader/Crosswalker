# Changelog

All notable changes to Crosswalker will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased] — v0.1 implementation in progress (2026-05-04 → present)

The 0.1 design phase concluded 2026-05-04. Implementation phase began the same day. As of 2026-05-18, milestones v0.1.1 / v0.1.2 / v0.1.3 / v0.1.4 / v0.1.4.5 / v0.1.5 are ✅ shipped; v0.1.6 (Bases query layer + SSSOM import + recipe UX) is mid-milestone (Phases 1 + 1.5 + 2 + 3 + 3.5a + 3.5b + 3.5c + 3.6 + 4 + 4.5 + 4.6 + 4.7 + 5 + **6** ✅ done; v0.1.7 next).

### Ingestion harness — recipe `split` / `regex` / `trim` template filters + zz-log label guard (2026-06-03)

Running the real GRC framework corpus through the headless ingestion harness (`tools/generate-fixtures.ts` → real `render()` + a `Recipe`) surfaced the first field-shape requirement and turned it into a first-class construct instead of harness glue.

- **Three new template filters** in the closed set (`src/render/template.ts`), usable from any recipe's `{var|filter}` expressions:
  - `split(<delim>,<index>)` — nth (0-based) delimiter segment, trimmed (e.g. CSF's `"DE.AE-01: Adverse events…"` → `split(:,0)` → `DE.AE-01`; `split(:,1)|trim` → the name)
  - `regex(<pattern>)` — first match, or first capture group if present
  - `trim` — strip surrounding whitespace
- **First per-framework import recipe using them:** `recipes/import/nist-csf-2.json` — NIST CSF 2.0 → 185 subcategory concepts with clean `DE.AE-01.md` ids + split-out titles, all through the production engine.
- **Regression test** pinning `fs-safe`'s hyphen/paren preservation (guards the latent control-byte bug fixed in the prior commit).
- **New guard** `bun run check:log-labels` — every `zz-log/*.mdx` must carry a `sidebar.label` prefixed with its filename's `MM-DD ·` date, so dev/decision logs can't drift undated in the sidebar again. Fixed 4 previously-undated labels (streaming-refactor, phase-5-scope, logging-infra, query-state).
- **Tests:** 34 suites / 545 tests / all pass (+3 filter tests).
- **Header-key normalization** in the XLSX reader — collapses the embedded `\r\n` that NIST/CRI workbooks bake into header cells (`Profile\r\nId`, `Focal Document\r\nElement`), so recipes reference clean single-space column names. CSV path unaffected (no fixture drift).
- **Depth-first end-to-end slice started** — drive a small set (NIST CSF 2.0 ↔ 800-53 ↔ CRI Profile v2.2, the FI-sector hub) all the way to a rendered Bases coverage pivot, rather than accumulating import recipes that stop at Tier 1. Stage A done: all three frameworks render to Tier 1 concept notes (1,189 + 185 + 472) through the production engine. New recipe `recipes/import/cri-profile-v2-2.json`. CRI's copyrighted source + output stay gitignored; only the recipe (no copyrighted text) is committed.

### v0.1.6 Phase 6.3 — Benchmark + bundled-fixture import (testable surface) (2026-05-19, ✅ Done)

User direction (2026-05-19): "keep moving forward to the point where I'll be able to start testing myself again. But also wire things into logging so we can test for speed, optimization, hardware usage." Two new commands give end-to-end visibility into the new primitive substrate without needing existing vault data.

**New modules:**
- `src/views/benchmark-primitives.ts` — synthesizes data at varying scales (default 100/1k/10k rows), times every primitive (array + streaming) with `performance.now()`, emits NDJSON `perf` events into the existing debug log. Functions: `runBenchmark(opts) → BenchmarkSummary`, `generateConcepts(n)`, `generateMappings(n, conceptCount)`, `formatBenchmarkSummary(summary)`. Deterministic synthetic data — reproducible numbers across runs.
- `src/views/bundled-fixtures.ts` — 2 realistic SSSOM crosswalks (ISO 27001→SOC 2 with 10 mappings; NIST CSF→MITRE ATT&CK with 13 mappings) bundled inline as TSV strings (~6KB total). One-click import via the new command below — no manual file copying.

**New commands:**
- `Crosswalker: Run primitives benchmark (perf)` — calls `runBenchmark()`, logs ~26 per-primitive timing events (category=`perf`, op=`<primitive>-<mode>`), copies formatted summary to clipboard, surfaces a Notice with total duration + result count. Runs in ~1-2s on typical desktop hardware.
- `Crosswalker: Import bundled test fixture (dev)` — modal lists the 2 bundled SSSOM crosswalks, user picks one, plugin runs `importSssom()` directly → junction notes land in `_crosswalker/mappings/<source>-to-<target>/`. Pivot views can now render with real data.

**Tests:** 33 suites / 530 tests / all pass (+6 from 524 baseline).
- `tests/benchmark-primitives.test.ts` (6 tests) — generator determinism, mapping coverage ~70%, benchmark produces results at every scale, array vs stream variants both run for streamable primitives, diff is array-only, formatBenchmarkSummary produces multi-line output.

**What this unblocks for user testing:**
- Run the benchmark → see speed numbers + per-primitive timings in `crosswalker-debug.log` (filter `category=='perf'`)
- Import the bundled crosswalk → pivot view renders with real junction notes instead of the diagnostic empty state
- Both commands work offline / without prior vault data → zero-config testing

**Sample benchmark log shape** (NDJSON, one event per timing):
```json
{"ts":"2026-05-19T...","level":"info","category":"perf","op":"inner-join-stream","msg":"inner-join (stream) over 10000 rows","trace_id":"a1b2c3d4","primitive":"inner-join","mode":"stream","inputSize":10000,"outputSize":4200,"durationMs":12.4,"rowsPerSec":806451}
```

### v0.1.6 Phase 6.2 — Streaming Layer A primitives (iterable-first) (2026-05-19, ✅ Done)

User direction (2026-05-19): "make sure the join logic on the back end is all optimized from the beginning... streaming approach... certain operations aren't optimized yet across tooling." Phase 5+6 shipped Layer A primitives as `Array → Array`, which would have locked every recipe-runtime consumer to materialized intermediate results. Decision: refactor to **iterable-first** shape NOW, before wiring the recipe-runtime composer. See [Streaming primitive refactor log](https://cybersader.github.io/crosswalker/agent-context/zz-log/2026-05-19-streaming-primitive-refactor/) for full reasoning + streamability matrix.

**Pattern**: hash-build the smaller (right) side; stream the larger (left). DuckDB / Polars / ChunkyCSV pattern. Memory bounded by smaller side.

**New module**:
- `src/views/filter-primitive.ts` — explicit Layer A filter (was previously implicit Bases-native). `filter()` array form + `filterStream()` generator + `filterStreamAsync()` for I/O-bound sources.

**New streaming variants** (alongside existing array forms — backward compat preserved):
- `bind-primitive.ts`: `bindStream()` + `bindManyStream()` — pure generators, single-pass, lazy
- `join-primitives.ts`: `innerJoinStream()` / `leftOuterJoinStream()` / `antiJoinStream()` (hash-build right; stream left). `rightOuterJoinStream` / `fullOuterJoinStream` materialize then delegate (callers should swap sides for true streaming when right side is large). `executeJoinStream()` dispatcher.
- `set-op-primitive.ts`: `intersectionStream()` / `differenceStream()` / `unionStream()` (right hashed; left streamed). `setOpStream()` dispatcher. Union with `right`/`merge` conflict strategies is documented as not pure single-pass (caller can dedup downstream).

**Streamability matrix** (locked):

| Primitive | Single-pass streamable? | Memory |
|---|---|---|
| filter / bind / project | ✅ Trivially (generators) | O(1) per row |
| aggregate (count/sum/min/max) | ✅ Accumulator | O(1) per group |
| aggregate (median/percentile) | ⚠️ Defer to Tier 2 SQL | — |
| inner / left-outer / anti-join | ✅ Hash right; stream left | O(right) |
| right-outer / full-outer join | ⚠️ Both sides indexed | Materialized |
| set-op (union/inter/diff) | ✅ Hash one; stream other | O(hashed-side) |
| diff | ❌ Both sides indexed (inherent) | Materialized — documented in module header |
| traverse(depth=*) / closure | ❌ Iterative fixpoint | Stays Tier 2 SQL |

**ChunkyCSV alignment**: same shape as user's prior chunked-iterable + hash-build-join pattern. IMPORT-side already aligned via v0.1.4.5 (PapaParse → `AsyncIterable<Row>` → generation engine); QUERY-side now matches. We don't write new *core* logic — borrowed standard CS (hash-build join, accumulator aggregate, generator filter). The novel piece deferred to v0.1.7+ is the spill-to-disk integration with Tier 2 sqlite-wasm when in-memory hash exceeds budget.

**Ch 34 — Streaming query execution** ([brief](https://cybersader.github.io/crosswalker/agent-context/zz-challenges/34-streaming-chunked-query-execution/)) — filed 2026-05-08, deliverable not yet run. Queued in parallel with this refactor for fresh-agent research session on DuckDB out-of-core / Polars streaming / DataFusion chunked execution patterns to inform the v0.1.7+ spill-to-disk work.

**Tests:** 32 suites / 524 tests / all pass (+15 from 509 baseline).
- `tests/integration/streaming-primitives.test.ts` (15 tests):
  - Array/stream parity per primitive over realistic fixtures (CSF, 800-53, ISO 27001, SOC 2, CIS v8, ATT&CK, 3 crosswalks)
  - Lazy evaluation probe (generator doesn't consume input until iteration)
  - "Hash-build is on the right side" memory-shape probe (right fully consumed before left starts producing matches)
  - Pipelined composition: `filterStream → bindStream → antiJoinStream` end-to-end

Backward-compat: every existing test continues to pass against the array overloads. No public API broken.

### v0.1.6 Phase 6.1 — Integration tests over realistic fixtures (2026-05-19, ✅ Done)

User audit (2026-05-19): "Did the tests actually use real data, or example files?" Honest answer was no — all unit tests through Phase 6 used hand-crafted toy data; the realistic fixtures under `tools/fixtures/realistic/` were sitting unused (zero `grep` hits across `tests/`). This phase closes that gap.

**New test helper**: `tests/helpers/fixture-loader.ts` — pure-function loaders for the 9 realistic fixtures:
- `loadConceptFixture(name)` returns typed concept rows (CSF, 800-53 AC, ISO 27001, SOC 2, CIS v8, MITRE ATT&CK Persistence subsets)
- `loadCrosswalkFixture(name)` returns typed crosswalk rows; coerces `confidence` to number; auto-strips SSSOM TSV header comments
- `REALISTIC_FIXTURES` const lists every fixture by category for parameterized "every fixture parses" sanity tests

**New integration suite**: `tests/integration/primitives-on-realistic-data.test.ts` — 30 tests in 8 describe blocks:
- Loader sanity (9 tests) — every fixture parses + has expected row shape
- `filter` over CSF function = "GOVERN" + 800-53 top-level controls
- `bind` derived CURIEs, title-length metrics, confidence-threshold flags over real SSSOM rows
- `aggregate` group-by-count over CSF concepts + crosswalk predicates
- `anti-join` "CSF concepts with NO mapping to ATT&CK" + "ISO concepts unmapped to SOC 2"
- Join modes — `innerJoin` CSF × 800-53 crosswalk (overlapping fixture data), `leftOuterJoin` preserves all CSF concepts, cross-fixture traversal back to AC controls
- `set-op` realistic comparisons — CIS ∩ SOC 2 empty (different id naming); CIS ∪ SOC 2 = sum (no key collisions); CSF concepts NOT subjects of CSF→800-53 mappings
- `diff` synthesized v1→v2 deltas over real concept rows: renamed title detection, audit-timestamp noise ignored via `ignoreFields`, fuzzy `confidence` comparison via custom `equalsFn`
- Cross-fixture composition — pipeline `filter → bind → executeJoin` for "AC controls referenced by high-strength CSF mappings"; framework-overlap-by-id query

**Realistic-data findings that the tests document via passing assertions**:
- CSF concepts fixture covers GOVERN+IDENTIFY; CSF→ATT&CK mapping targets PROTECT+DETECT — `inner-join over non-overlapping fixture subsets returns empty (realistic data shape)` test explicitly captures this
- Join field-merging: right-side `id` becomes `r_id` when both sides have `id` (default `rightPrefix='r_'`)
- Match-type → strength mapping (`exact: 1.0, close: 0.85, broad: 0.7`) used for confidence-style filters when source crosswalks use enum match_type instead of numeric confidence

**Tests:** 31 suites / 509 tests / all pass (+30 from 479 baseline). Build + lint clean.

This is the integration-test foundation v0.1.7+ work builds on — same loader powers future exporter tests, recipe-runtime tests, and Tier 2 SQL helper tests.

### v0.1.6 Phase 6 — Layer A primitive expansion (bind / set-op / diff) (2026-05-18, ✅ Done)

Closes the [Ch 29 8-primitive set](https://cybersader.github.io/crosswalker/agent-context/zz-research/2026-05-09-challenge-29-ontology-web-query-verbs-validation/). The locked Layer A vocabulary is now complete: `filter / traverse / bind / project / aggregate / anti-join / set-op / diff`. Ships the three additions from Ch 29's revision in pure-function form, engine-neutral, no Obsidian dependency.

**Concept page brought in sync**: [`query-primitives.mdx`](https://cybersader.github.io/crosswalker/concepts/query-primitives/) was stale (still showed the old 7-primitive candidate set with a "pending Ch 29 validation" callout). Rewritten to lock the 8-primitive set with: (a) the "Locked — Ch 29 outcome" tip, (b) the 8-primitive table, (c) net-changes list (drop closure, demote pivot, add bind/set-op/diff), (d) worked examples for the three additions ("Concepts in both NIST CSF and CIS" → set-op; "What changed in CSF v1.1 → v2.0?" → diff; "Evidence older than 1 year" → bind), (e) "What's NOT a primitive" table expanded with Ch 29's explicit rejects (rank, window functions, constraint-satisfy, federation), (f) algebraic-closure section, (g) engine-neutrality cross-link to Commitment #5.

**New modules** (pure-function Layer A primitives):
- `src/views/bind-primitive.ts` — `bind(rows, name, fn)` adds a derived column from a formula. `bindMany(rows, [...bindings])` chains them. Same shape as SPARQL `BIND`, SQL `AS`, pandas `assign`.
- `src/views/set-op-primitive.ts` — `setOp(left, right, {keyOf, mode, conflictStrategy?})` for union / intersection / difference. `conflictStrategy: 'left' | 'right' | 'merge'` controls field-merging on key collisions. Inexpressible without this primitive: "controls in BOTH NIST and CIS" (intersection) and any framework-overlap query.
- `src/views/diff-primitive.ts` — `diff(before, after, {keyOf, equalsFn?, ignoreFields?})` returns `{added, removed, changed}`. Each `changed` record includes `before`, `after`, and a per-field `changedFields` list. `ignoreFields` for audit-noise (e.g. `last_reviewed`, `generated_at`). Custom `equalsFn` for fuzzy comparison. The primitive required for v0.1.8 audit-trail attestations.

**Tests:** +47 net new (30 suites / 479 tests / all pass; 432 baseline).
- `tests/bind-primitive.test.ts` (12 tests) — numeric/string/boolean derivations, no-mutation, name-collision overwrite, empty input, chained bindMany.
- `tests/set-op-primitive.test.ts` (15 tests) — union/intersection/difference + 3 conflict strategies + function key extractors + empty inputs + dispatcher routing.
- `tests/diff-primitive.test.ts` (20 tests) — added/removed/changed detection, unchanged-on-request, ignoreFields, custom equalsFn, nested object + array comparison, function keyOf, worked example ("CSF v1.1 → v2.0").

**Algebraic shape (the 8 Layer A primitives — locked):**

| # | Primitive | Status |
|---|---|---|
| 1 | filter | Bases-native (since v0.1.1) |
| 2 | traverse (subsumes closure via depth=*) | Tier 2 SQL (v0.1.5) |
| 3 | bind | **Pure function (Phase 6)** |
| 4 | project | Bases-native (since v0.1.1) |
| 5 | aggregate | Bases summaries + Tier 2 SQL (v0.1.5) |
| 6 | anti-join | Pure function (Phase 5) + Tier 2 SQL |
| 7 | set-op | **Pure function (Phase 6)** |
| 8 | diff | **Pure function (Phase 6)** |

**What this unblocks:**
- v0.1.7 recipe schema can declare `bind` formulas + `set-op` mode + `diff` snapshot pairs at the recipe level
- v0.1.7 exporters consume diff output (delta logs between vault snapshots)
- v0.1.8 audit-trail uses `diff` as the load-bearing primitive for attesting "what changed since the last signed release"

**Deferred** (out of Phase 6 scope by design):
- Recipe-level YAML compilation of bind formulas (today the formula is a TS function; v0.1.7 adds string-formula → function compilation at recipe load time)
- Wiring set-op and diff into the recipe runtime (Phase 5's join-primitives integrated into the pivot view; Phase 6's three primitives are available as the substrate but not yet referenced by any shipped recipe)
- Tier 2 SQL implementations of set-op and diff (today they run in-memory over row-sets; for ontology-scale snapshots v0.1.7+ may move them to sidecar queries)



### v0.1.6 Phase 5 — Join primitive substrate + materialization + sparse-pivot HARD guard (2026-05-18, ✅ Done)

Reframed per [Phase 5 scope log](https://cybersader.github.io/crosswalker/agent-context/zz-log/2026-05-18-phase-5-scope-join-primitive-substrate/) from "outer-join pivot retrofit" to "Layer A join primitive substrate that powers all view shapes." Pivot is one consumer; table / list / hierarchy / timeline shapes (v0.1.7+) compose against the same primitives.

**New modules:**
- `src/views/join-primitives.ts` — 5 pure-function Layer A primitives matching the [query-primitives concept](https://cybersader.github.io/crosswalker/concepts/query-primitives/):
  - `innerJoin` — rows where both sides match (current default)
  - `leftOuterJoin` — preserve all left rows; null-pad right ("controls without evidence" gap analysis)
  - `rightOuterJoin` — mirror
  - `fullOuterJoin` — preserve both sides
  - `antiJoin` — Layer A primitive #5: LEFT rows with NO match in right ("X without Y")
  - `executeJoin(left, right, {mode})` dispatcher
- `src/views/materialize.ts` — shape-agnostic snapshot writer. Writes `<slug>/materialized/result.json` per Layout B+. Stable JSON key order (git-diff friendly). `lookupQuery(app, slug)` + `markStale(app, slug)` helpers. Reusable for v0.1.7 (table/list) + v0.1.8 (audit snapshots) without modification.

**Schema:** `spec/recipe.schema.json` `Join.kind` enum extended `["inner", "left", "right", "outer", "anti"]` with description aligned to runtime semantics.

**Pivot view updates** (`src/views/crosswalker-pivot-view.ts`):
- HARD guard at 250K cells — blocks render with explicit message instead of locking the UI
- Replaced silent empty grid with `renderDiagnosticEmpty()` — explains likely causes (missing SSSOM imports, filter scope, confidence threshold) and how to fix
- Sparse-pivot SOFT warning preserved (renders the table with a banner above)

**Commands added:**
- `Crosswalker: Materialize this query (snapshot)` — opt-in; runs on the active query's `index.md`; writes the JSON snapshot at `<slug>/materialized/`. Default browse remains live.

**Tests:** +28 net new (27 suites / 432 tests / all pass; 404 baseline). New files: `tests/join-primitives.test.ts` (20 tests covering all 5 modes + edge cases + dispatcher + function extractors), `tests/materialize.test.ts` (8 tests covering stable JSON serialization + idempotent overwrite + metadata + stale.flag + lookup).

**What this unblocks:**
- v0.1.7 table / list / hierarchy view shapes compose against the join primitives directly
- v0.1.7 exporters (OSCAL / SSSOM / STRM) consume materialized result.json
- v0.1.8 per-query audit snapshots use the same writer

**Deferred to v0.1.7+** (out of Phase 5 scope by design):
- Pivot view actually RENDERING outer-join axes from source ontology concepts (needs recipe-level `axis_sources` config — adds complexity to filter resolution; Phase 5.5 or v0.1.7)
- `bind` / `set-op` / `diff` Layer A primitives from Ch 29 revision
- Full SPARQL property-path traversal in Tier 2 sidecar



### v0.1.6 Phase 4.7 — 3-command UX split: Embed existing + Browse queries (2026-05-18, ✅ Done)

Completes the synthesis-log §3 "create / embed / browse" command split that Phase 4.6 deferred. Now the user has three distinct surfaces matching three distinct mental models:

| Command | Cost | Mental model |
|---|---|---|
| `Insert query into note` (existing, Phase 4.6) | Heavy — modal + params + folder write | "Create a new analysis" |
| **`Embed existing query into note`** (NEW) | Lightweight — pick from list, insert reference | "Show this query here" |
| **`Browse my queries`** (NEW) | Discovery surface | "What queries exist in my vault?" |

**New modules:**
- `src/views/query-scanner.ts` — pure read function. `scanQueries(app)` walks `_crosswalker/queries/**/index.md`, returns validated entries sorted by `generatedAt` DESC. `formatParamsSummary()` for display. Used by both pickers.
- `src/views/embed-existing-query-modal.ts` — minimal modal: cards listing each query with slug + recipe + shape badges + params summary + "Embed at cursor" button. Resolves with `{slug, viewFile}`.
- `src/views/browse-queries-modal.ts` — full discovery surface. Per-row actions: **Open canonical** (opens `index.md`), **Embed in active note** (only enabled when an editor is active), **Delete** (with confirmation prompt covering "embeds will become broken links").

**Tests:** +12 new (25 suites / 404 tests / all pass; 392 Phase 4.6 baseline). New file: `tests/query-scanner.test.ts`. Covers: empty vault, canonical-path filtering (ignores stray host-note frontmatter), sort order (DESC), malformed-frontmatter skip, full metadata roundtrip.

### v0.1.6 Phase 4.6 — Query-state-location refactor (Layout B+) (2026-05-18, ✅ Done)

Implementation of the Ch 38 synthesis decision. Re-homes the Phase 4.5 architecture from "frontmatter on host note + flat `.base` in views/" to "per-query folder under `_crosswalker/queries/<slug>/` with `index.md` as canonical state + `view.base` as generated sibling + reserved derivative subfolders."

**Schema bump 1 → 2:**
- New required `slug` field (kebab-case ASCII, max 48 chars)
- New `view_file` path pattern: `_crosswalker/queries/<slug>/view.base` (replaces flat `_crosswalker/views/<query_id>.base`)
- v1 backward-compat reader (`validateQueryFrontmatterV1`) preserved for one minor version; migration command converts on user trigger

**New modules:**
- `src/views/query-frontmatter-schema.ts` v2: + `slugify()` (kebab-case + reserved-names + max-length + fallback-to-`query-<id8>`); + `addCollisionSuffix()` (`-<4hex>` for programmatic); + `queryFolderFor()` / `indexFileFor()` / `viewFileFor()` / `legacyViewFileFor()` path helpers
- `src/views/migrate-query-layout.ts` (NEW): one-shot idempotent migration. For each host note with v1 `crosswalker_query:` frontmatter, creates `_crosswalker/queries/<slug>/{index.md, view.base}`, rewrites embeds in the host, optionally renames host frontmatter to `crosswalker_query_legacy:` (default) or strips it
- `src/views/apply-query-to-note.ts` rewritten: writes to canonical folder; supports `existingSlug` (UPDATE flow) + `collisionMode` (`refuse` / `auto-suffix` / `force-new`); host note gets only the embed at cursor — NO frontmatter

**Updated modules:**
- `src/views/regenerate-query-views.ts`: walks `_crosswalker/queries/**/index.md` only; counts legacy v1 host-note frontmatter for migration prompting via `legacyDetected`
- `src/views/insert-base-block.ts`: `buildEmbed()` strips `_crosswalker/queries/` prefix → emits short `![[<slug>/view.base]]` form; `noteContainsEmbed()` recognizes both forms
- `src/views/recipe-picker-modal.ts`: PickerAction includes `recipeName` (for slug derivation)
- `src/views/reference-base-files.ts`: SKILL.md rewritten to teach Layout B+
- `src/main.ts`: new `crosswalker:migrate-query-layout` command; `insert-query-into-note` checks for legacy v1 frontmatter on host and blocks with Notice "Migrate first"

**Commands added/changed:**
- NEW: `Crosswalker: Migrate queries to folder layout` — one-shot idempotent migration
- CHANGED: `Crosswalker: Insert query into note` — Layout B+ CREATE flow with `auto-suffix` collision mode (default in picker)

**Tests:** +33 net new (24 suites / 392 tests / all pass). New file: `tests/slug-derivation.test.ts` (21 tests). Updated: `tests/query-frontmatter-schema.test.ts`, `tests/query-frontmatter-io.test.ts`, `tests/apply-query-to-note.test.ts`, `tests/regenerate-query-views.test.ts`.

**Edge cases handled** (per synthesis log §4): slug derivation (kebab-case, reserved names, length, fallback), CREATE collision (refuse/auto-suffix), UPDATE preserves `query_id` + `slug`, idempotent regenerator, legacy v1 detection, malformed frontmatter graceful error.

### Ch 38 resolution + Phase 4.6 planning — Query state location synthesis (2026-05-18, ✅ Resolved)

Two convergent fresh-agent deliverables resolved [Challenge 38](https://cybersader.github.io/crosswalker/agent-context/zz-challenges/archive/38-query-state-location-and-folder-note-pattern/) (filed 2026-05-18, gating Phase 5). Both deliverables rejected the literal folder-note `index.md` magic-embed pattern (would require LostPaul Folder Notes community plugin, violating Commitment #3 mobile parity).

**Locked: Layout B+** (per [synthesis log 2026-05-18](https://cybersader.github.io/crosswalker/agent-context/zz-log/2026-05-18-query-state-location-synthesis/)):
- Per-query folders at `_crosswalker/queries/<slug>/` with `index.md` as canonical state + `view.base` as generated sibling
- Reserved derivative subfolders: `materialized/` (Phase 5), `exports/` (v0.1.7), `snapshots/` (v0.1.8)
- Embed format: explicit `![[<slug>/view.base]]` (no folder-note magic; vanilla Obsidian + Mobile)
- Slug-collision: refuse-and-prompt (interactive picker) + `-<4hex>` (programmatic)
- `query_id` is durable identity; slug is rename-safe (via Obsidian's auto-update-links)
- Schema bump 1 → 2 records the canonical-location change
- ~20-case edge-case policy table in synthesis log §4

**Phase 4.6 (next sub-phase, ~½–1 day)** ships:
- New `src/views/migrate-query-layout.ts` + `Crosswalker: Migrate queries to folder layout` command
- Edits to 5 source files (frontmatter-schema, apply-query, regenerate, insert-embed, reference-base-files)
- ~+40 new tests (slug derivation, collision policy, migration idempotency)
- Re-homes Phase 4.5 architecture (canonical state moves; not reverted)

This unblocks Phase 5 (materialization writes to `<slug>/materialized/`).

### v0.1.6 Phase 4.5 — Frontmatter-driven query notes + `.base` file generation + `![[embed]]` (2026-05-15, ✅ Done; re-homed by Phase 4.6)

User architecture call surfaced that Phase 4's inline ` ```base ` codeblock flow used the wrong embed syntax — Obsidian Bases' canonical embed is `![[file.base]]` (per [Bases docs](https://help.obsidian.md/Plugins/Bases)), and the query itself should live in **note frontmatter** (canonical, queryable by Bases itself, regenerable, plugin-uninstall-safe) rather than in an opaque inline codeblock. Phase 4.5 ships the corrected architecture. Phase 4's codeblock-only flow stays in git history; codeblocks already in user vaults keep working (Bases supports both syntaxes — no migration command).

**The corrected design** (3 artifacts make up a query):

1. **`crosswalker_query:` frontmatter on the user's note** — canonical query definition (recipe ID + shape + user-edited params). AJV-validated. Indexable by Bases itself. Survives plugin uninstall. Renamed from `crosswalker:` → `crosswalker_query:` on 2026-05-16 to distinguish from the existing `_crosswalker:` provenance block on imported concept/junction notes and to make the block's purpose explicit (it's a QUERY definition, not generic plugin metadata).
2. **`.base` file at `_crosswalker/views/q-<YYYY-MM-DD>-<8-hex>.base`** — plugin-generated rendering artifact. Regenerable from frontmatter. Stable filename keyed by `query_id`.
3. **`![[<view_file>]]` embed in the user's note** — Obsidian-native Bases embed syntax. Renders inline when the note is viewed.

**Flow** (single `Crosswalker: Insert query into note` command):
- Picker opens. Auto-detects existing `crosswalker_query:` frontmatter → UPDATE mode (preserves `query_id` + `view_file`; updates params only) OR CREATE mode (fresh `query_id`).
- On confirm: write `.base` file → write/update frontmatter via `app.fileManager.processFrontMatter()` → insert `![[<view_file>]]` at cursor (skipped if embed already present — idempotent).

**New modules** (all under `src/views/`):
- `query-frontmatter-schema.ts` — JSON Schema (draft 2020-12) + AJV validator + `newQueryId()` + `viewFileFor()`. Validates the `crosswalker:` block at every read + write boundary. Schema is forward-compat (`schema_version: 1`).
- `query-frontmatter-io.ts` — `readQueryFrontmatter()` / `writeQueryFrontmatter()` / `hasQueryFrontmatter()` helpers + pure builders (`buildFrontmatter`, `updateFrontmatterParams`). Uses Obsidian's canonical `app.fileManager.processFrontMatter(file, cb)` API — safer than manual YAML manipulation.
- `apply-query-to-note.ts` — single orchestrator: `applyQueryToNote({app, file, editor, recipeId, shape, params})`. Decides CREATE vs UPDATE; writes `.base` file (with comment header); writes/updates frontmatter; inserts embed at cursor; returns structured `ApplyResult` for caller.
- `regenerate-query-views.ts` — vault scanner. `regenerateAll(app)` walks all markdown files; for each one with `crosswalker_query:` frontmatter, regenerates the `.base` file. Idempotent — skips when YAML body matches (compares stripped of header timestamp comments).

**`insert-base-block.ts` extended**:
- `buildBaseBlock()` deprecated (kept for backward compat with Phase 4 codeblocks)
- New `buildEmbed(vaultPath)` builds canonical `![[path.base]]` syntax
- New `insertEmbedAtCursor(editor, viewPath)` uses Phase 4 cursor-position policy (after-frontmatter / after-codeblock / after-line); idempotent — skips when embed already present (UPDATE flow safety)
- New `noteContainsEmbed(content, vaultPath)` detection helper

**Picker modal updated** (`recipe-picker-modal.ts`):
- Resolves with `{recipeId, shape, params}` instead of pre-built block text (orchestrator handles writes)
- Apply button (was "Insert") — semantically more accurate
- Raw-YAML escape removed (users hand-edit the `.base` file at `_crosswalker/views/` directly OR write a JSON recipe — both documented in `SKILL.md`)
- Picker UI surface unchanged; only the resolve contract changed

**Commands**:
- `Crosswalker: Insert query into note` — REPURPOSED to call `applyQueryToNote()` orchestrator (was: insert raw codeblock). Auto-detects UPDATE vs CREATE mode.
- `Crosswalker: Refresh query views` — NEW. Scans all notes with `crosswalker_query:` frontmatter; regenerates their `.base` files. Idempotent. Surfaces a Notice with `N refreshed, M up-to-date, K errors`. Also runs on `onLayoutReady` for stale-state recovery (same pattern as Phase 3 reference file write + Phase 1.5 fixture drift check).

**Obsidian mock extended** (`tests/__mocks__/obsidian.ts`):
- `Platform` (mobile/desktop detection — already added in Phase 4a)
- `ButtonComponent` (already added in Phase 4a)
- `FileManager` class with `processFrontMatter` that captures writes to an in-memory store (`__frontmatter`) keyed by file path — tests can assert on resulting frontmatter without parsing YAML

**SKILL.md rewritten**: now teaches the frontmatter + `.base` + embed pattern as the primary workflow. Explains the 3 artifacts, how to author / edit queries, why the design honors the v0.1 architectural commitments. Existing codeblock examples preserved as backward-compat reference for users still on Phase 4 syntax.

**Tests**: 359/359 pass (was 310 before Phase 4.5; +49 new):
- `tests/query-frontmatter-schema.test.ts` — 15 tests (validation accept/reject + ID generation + view file naming)
- `tests/query-frontmatter-io.test.ts` — 13 tests (read/write + has/build/update; mocked `processFrontMatter`)
- `tests/apply-query-to-note.test.ts` — 7 tests (CREATE + UPDATE flows + `buildBaseFileContent`)
- `tests/regenerate-query-views.test.ts` — 14 tests (idempotency, scan-all aggregation, malformed handling, missing template, `yamlBodyMatches` purity)

**Files changed**: ~15 new/modified (4 new modules + 4 new test files + updates to recipe-picker-modal / insert-base-block / main / reference-base-files / obsidian mock / briefing log / milestone hub / CHANGELOG).

**Effort**: ~5h. Build clean. Manual smoke pending.

See [briefing log Phase 4.5 section](https://cybersader.github.io/crosswalker/agent-context/zz-log/2026-05-15-context-briefing/#phase-45--frontmatter-driven-query-notes-the-architectural-pivot) for the architecture diagrams + decision-chain cross-links to the 2026-05-04 / 2026-05-07 / 2026-05-08 / 2026-05-11 prior synthesis logs.

### v0.1.6 Phase 4 — Recipe-picker UX + SKILL.md + framework fixture expansion (2026-05-15, ✅ Done)

User-facing query authoring surface. New command `Crosswalker: Insert query into note` opens a modal listing 6 shipped recipes + any user-authored recipes from `_crosswalker/recipes/`; user picks one, optionally edits exposed parameters inline, and a `` ```base `` codeblock lands at the editor cursor with cursor-position-aware insertion (after-frontmatter / after-code-block / after-line policies). Phase 3 first-run writer extended to also ship `_crosswalker/SKILL.md` — an LLM authoring guide modeled on Steph Ango's `kepano/obsidian-skills` pattern.

Shipped in 3 sub-phases (4a foundation, 4b UI, 4c wire-up).

**New code (Phase 4a):**
- `src/views/recipe-loader.ts` — Static imports of 6 shipped recipes + runtime scan of `_crosswalker/recipes/` for user-authored. AJV validation on both. Dispatches on `query.shape` STRING value (architectural commitment #5 — runtime-agnostic recipe schema). New shapes (e.g. v0.2's `cards`) don't need loader code changes.
- `src/views/insert-base-block.ts` — Cursor-aware codeblock insertion helper. Policy: cursor inside frontmatter → insert after closing `---`; cursor inside another code block → insert after closing ```; otherwise insert after current line. Pure (chooseInsertionPoint exported separately for direct testing).
- `src/views/mobile-detection.ts` — Single source of truth for `Platform.isMobile` gate (commitment #3 mobile parity). Used by the picker to hide raw-YAML editor with "Edit on desktop" hint.

**New code (Phase 4b):**
- `src/views/recipe-picker-modal.ts` — Modal subclass. Reuses Phase 3 modal CSS for visual consistency. Card layout per recipe; "Configure" expands inline parameter editor; "Insert" CTA. `hierarchy` shape shows "renderer coming soon" badge; can still insert YAML (Bases falls back to native table view). Raw-YAML escape button at footer (desktop-only).
- `src/views/recipe-parameter-editor.ts` — Pure helper. Type-dispatched widgets: string → text input, number → number input with step inferred from default's precision, boolean → toggle, unknown → string fallback. Returns a handle (getValues / hasAnyParams / reset) the picker uses at Insert time.
- `src/views/recipe-templates.ts` — Inline `` ```base `` templates for the 6 shipped recipes. Each maps recipe ID to a Bases YAML template with Mustache-style placeholders + section conditionals (`{{#name}}...{{/name}}` drops when param is falsy).

**New code (Phase 4c):**
- `src/main.ts` — New command `crosswalker:insert-query-into-note` with `editorCallback` for cursor access. Creates a fresh `trace_id` per invocation; downstream picker-open / block-inserted / block-insert-failed events correlate via the Phase 3.5c logger.
- `src/views/reference-base-files.ts` — Extended to also write `_crosswalker/SKILL.md` on first run (idempotent — never overwrites user edits). The SKILL.md content (LLM authoring guide for Crosswalker recipes + ```base codeblocks) is inlined as a TS constant; pattern modeled on Steph Ango's `kepano/obsidian-skills`.

**Reference recipe additions (Phase 4a):**
- `recipes/v0-1/mitre-coverage.json` — NEW 6th recipe. NIST CSF (defensive) → MITRE ATT&CK (offensive) pivot. The cross-domain showcase — Crosswalker's distinguishing capability beyond what compliance-only tools can do.

**Framework fixture expansion (Phase 4a, tools/fixtures/realistic/):**
- `cis-controls-v8-subset.csv` — ~12 rows, Basic safeguards, 2-level hierarchy
- `soc2-trust-services-subset.csv` — ~10 rows, Common + Availability criteria
- `nist-csf-to-mitre-attack.sssom.tsv` — ~12 mappings, cross-domain defensive→offensive
- `iso27001-to-soc2.sssom.tsv` — ~10 mappings, mixed match types
- `README.md` — Updated with lifecycle coverage matrix (which fixture exercises which pipeline stage)

**Testing infrastructure (Phase 4a):**
- `tests/__mocks__/editor.ts` — Reusable mocked Obsidian Editor with captured-call assertions. Outlasts Phase 4; Phase 5 + v0.1.7 will reuse.
- `tests/__mocks__/obsidian.ts` — Extended with `Platform` (mobile gate) + `ButtonComponent`.
- `tests/helpers/recipe-fixtures.ts` — Shared memoized loader for `recipes/v0-1/*.json`. Tests don't re-read disk.
- `tests/helpers/visual-spec-runner.ts` — Boilerplate-elimination wrapper for the wdio screenshot pattern. Future visual specs become 5 lines instead of 40.

**CSS additions to `styles.css`:**
- `.crosswalker-recipe-picker-modal`, `.crosswalker-recipe-card`, `.crosswalker-recipe-description`, `.crosswalker-renderer-coming-soon` (orange/italic badge for reserved shapes), `.crosswalker-card-details`, `.crosswalker-param-editor`, `.crosswalker-insert-row`, `.crosswalker-recipe-load-errors`.

**Tests:** 310/310 pass (was 241 before Phase 4; +69 new across 5 new test files):
- `tests/recipe-loader.test.ts` — 19 tests (load+validate, buildLoadedRecipe, getRecipeParams)
- `tests/insert-base-block.test.ts` — 18 tests (cursor policy + full integration)
- `tests/recipe-templates.test.ts` — 14 tests (shipped catalog coverage + interpolation)
- `tests/recipe-parameter-editor.test.ts` — 14 tests (handle contract + type widgets + defaults)
- `tests/reference-base-files.test.ts` — extended with 4 new SKILL.md tests

**New E2E:**
- `tests/e2e/recipe-picker-flow.spec.ts` — verifies SKILL.md first-run write + command registration
- `tests/e2e/visual-recipe-picker.spec.ts` — 3 screenshots (picker open / configuring / closed)

Build clean. Tests clean. Manual smoke (`Crosswalker: Insert query into note` → picker → insert) is pending.

### v0.1.6 Phase 3.5c — Call-site sweep + trace correlation (2026-05-15, ✅ Done)

Pure-refactor completion of the Phase 3.5 observability layer. The Phase 3.5a backward-compat shim is removed; all 30+ remaining `.log(msg, data)` and `.error(msg, err)` call sites across the import / generation / SSSOM / Tier 2 / view subsystems migrated to the categorized severity API (`info / warn / error / trace` with `category + op` fields). Top-level entry points now create fresh `trace_id`s and wrap their work in `withTrace()` — so every downstream event for one operation carries the same trace_id, correlatable via a single `jq` filter.

**API removal (breaking, internal-only)**:
- `DebugLog.log(msg, data?)` — removed. All callers now use `debug.info('<category>', '<op>', msg, data?)`.
- `DebugLog.error(msg, err)` (2-arg form) — removed. The canonical signature is now `debug.error('<category>', '<op>', msg, data?)`.

**Trace correlation entry points** (the 4 places where a fresh trace_id is created):
- `wizard.parseSourceFile()` — wraps the CSV parse flow
- `wizard.generate()` — wraps the entire generation flow
- `importSssom()` — wraps the SSSOM TSV → junction-note pipeline (re-uses an active caller trace if present)
- `plugin.autoProjectOnLayoutReady()` — wraps the Tier 2 projection on vault load

**Categories now used** (all 9, after `legacy` removal):
- `wizard` — wizard state transitions, applied-config, generate-start/complete
- `csv-parser` — file parse config / progress / complete / error
- `generation` — per-row events (file-created / file-replaced / skipped / merge-failed / row-error), generation start/complete
- `sssom-import` — parse-aborted / pair-detected / projection-start / closure-precomputed / etc.
- `tier2` — projection-start / projection-row-error / projection-complete / closure-cache-invalidate-failed / clear-failed
- `config` — saved-config deleted / duplicated / exported / imported / import-failed
- `view` — Bases view register failures / reference .base file written
- `drafts` — wizard draft sessions (Phase 3.6: saved / deleted / cleared-all / purged-expired / cap-enforced / resumed)
- `lifecycle` — plugin loaded / unloaded

**Diagnostic payoff** (the real reason for 3.5c):
- Before: bug → read source → guess at code paths → grep log for fragments → reconstruct timeline → identify root cause (~20-30 min)
- After: bug → identify operation → `cat crosswalker-debug.log | jq 'select(.trace_id == "<id>")'` → causal chain returned in order → root cause obvious (~3-8 min)

**Files changed** (12 files, ~30+ call sites + shim removal + 3 shim tests removed + 1 new test):
- `src/utils/debug.ts` — shim removed
- `src/main.ts`, `src/import/import-wizard.ts`, `src/import/sssom-importer.ts`, `src/import/sssom-import-modal.ts`, `src/generation/generation-engine.ts`, `src/tier2/projector.ts`, `src/config/config-browser-modal.ts`, `src/views/reference-base-files.ts` — call sites migrated
- `src/settings/settings-tab.ts` — `legacy` category dropped, `drafts` added
- `tests/debug-log.test.ts` — 3 shim tests removed, 1 canonical `error()` signature test added

**Test coverage**: 241/241 unit tests pass (was 243; net -2 after shim-test cleanup). Build clean.

See `docs/.../zz-log/2026-05-15-v0-1-6-phase-3-5c-shipped.mdx` for the full delivery log with system-design integration diagrams.

### v0.1.6 Phase 3.6 — Import wizard draft sessions (2026-05-15, ✅ Done)

User-feedback-driven addition: the import wizard now auto-saves in-progress state so users can close the modal mid-flow (to check another note, refer to another framework, get a phone call) and resume exactly where they left off. Originally captured in `.workspace/2026-05-11-ux-feature-requests.md` as a deferred feature request; the user reaffirmed it after a 5/11 manual test session ("If you're going through an import process and you're configuring a bunch of columns, there might be times where you have to X out and go look for something..."). Built in three sub-phases over 2026-05-15.

**New surfaces:**
- Wizard Step 1 always shows a "Drafts from previous sessions" section (revised UX after initial stacked-modal approach proved undiscoverable for first-time users — see commit `1cbc4f6`). Empty state explains the feature: *"No drafts yet. As you configure your import, the wizard will auto-save your progress — close the modal anytime and your work will appear here so you can resume."*
- Per-draft card shows: name (auto-generated, e.g. "sample-nist-controls (Step 2)"), source file, step indicator (Step N/4), relative time ("just now" / "5 minutes ago" / "yesterday"), applied config name (looked up from settings)
- Per-card actions: Resume (CTA) + Delete (warning style)
- 3 new commands: `Crosswalker: Resume draft import`, `Crosswalker: Clear all import drafts`, `Crosswalker: Purge expired import drafts`
- 3 new settings (Wizard Behavior section): Auto-save toggle, Draft expiry slider (0-90 days, default 30; 0 = never), Max drafts slider (0-50, default 20; 0 = no cap)

**New code:**
- `src/import/draft-store.ts` — DraftStore class + serializer helpers (~250 lines + 17 unit tests). API: `list()` / `load(id)` / `save(draft)` / `delete(id)` / `clearAll()` / `purgeExpired()`. Auto-creates `_crosswalker/drafts/` folder (already gitignored). Schema-versioned WizardDraft type with first-class Map ↔ Record conversion helpers (JSON.stringify silently drops Map entries — tested + asserted).
- `src/import/import-wizard.ts` integration:
  - `loadAvailableDrafts()` on onOpen() — single fetch per wizard session
  - `renderDraftsSection(container)` + `renderDraftRow(list, draft)` — always-visible UI in Step 1
  - `scheduleDraftSave()` (500ms debounce) + `saveDraftNow()` (immediate, used on step advance + onClose flush)
  - `shouldPersistDraft()` gate — skip empty drafts (Step 1 with no file selected)
  - `snapshotDraft()` — pure serializer producing a WizardDraft from current wizard state
  - `hydrateFromDraft(draft)` — restores state on Resume; re-attaches applied config from settings; gracefully handles deleted applied config (Notice) + missing source file (forces Step 1 re-pick, preserves column configs)
  - Auto-delete on successful generation (`skipDraftDeleteOnClose` flag avoids the onClose-saves-deleted-file race)
- `styles.css` — `.crosswalker-drafts-section` + `-list` + `-row` + `-info` + `-name` + `-meta` + `-actions` classes. Theme-aware via Obsidian CSS variables. Responsive `flex-wrap: wrap` for narrow modals.

**Auto-save triggers:**
- 500ms debounce after column 'Use as' dropdown change in Step 2
- 500ms debounce after output-key text input in Step 2
- 500ms debounce after Output path / Framework ID / Overwrite mode edits in Step 4
- Immediate save on Next button click (before re-render)
- Final flush on modal onClose (X out, Escape key, click outside)
- Skipped when isParsing or isGenerating is true (no mid-operation writes)
- Skipped when feature disabled in settings

**Observability**: all DraftStore mutations emit wide events via DebugLog (`drafts` category — already in the Phase 3.5b filterable list). Visible operations: `drafts/saved`, `drafts/deleted`, `drafts/cleared-all`, `drafts/purged-expired`, `drafts/cap-enforced`, `drafts/resumed`, `drafts/schema-version-mismatch`, `drafts/parse-failed`.

**Test coverage**: 17 new unit tests in `tests/draft-store.test.ts` (round-trip, idempotent overwrite, sort order, expiry filter, purge count, max-drafts cap, schema version skip, corrupt JSON skip, Map↔Record helpers, ID format). 1 visual E2E test in `tests/e2e/visual-wizard-step1-drafts.spec.ts` (screenshots both empty + populated states). **243/243 unit tests pass.**

**Manual verification 2026-05-15**: full end-to-end flow walked — save state in Step 2, X out, reopen wizard (drafts section shows the saved draft), Resume → wizard hydrates with column configs preserved → re-pick file → continue through Steps 3+4 → Generate → draft auto-deleted on success → reopen wizard shows empty state again.

See `docs/.../zz-log/2026-05-15-v0-1-6-test-status-update.mdx` for the broader v0.1.6 test-status accounting.

### v0.1.6 Phase 3.5b — Debug log settings UI + 3 commands (2026-05-11, ✅ Done)

Wires the Phase 3.5a wide-event logger into the settings tab + command palette. Pure additions — no behavioral change to imports, generation, or query layer.

**New surfaces:**
- Settings → Debug → Category filters section with 9 known categories (wizard, csv-parser, generation, sssom-import, tier2, config, view, lifecycle, legacy). Each toggle opts that category OUT (default all on, sparse storage)
- Settings → Debug → Log file actions row: Open / Export to clipboard / Clear (warning) buttons
- 3 new commands: `Crosswalker: Open debug log` (opens in new pane), `Crosswalker: Export debug log to clipboard (last 1 MB, secrets redacted)`, `Crosswalker: Clear debug log`
- `verboseLogging` toggle now actually does something (was previously orphaned — defined in settings, surfaced in UI, but never read by DebugLog)

**New settings field**: `debugLogCategoryFilters: Record<string, boolean>` (default `{}`; sparse — only suppressed categories persist).

### v0.1.6 Phase 3.5a — Wide-event NDJSON logger + trace correlation (2026-05-11, ✅ Done)

User-feedback-driven observability upgrade. The 2026-05-11 wizard "0 pages generated" bug took 5 minutes to diagnose *because* there was a debug log; without it, ~30+ minutes of code reading. User invoked the loggingsucks.com framing (Charity Majors-style wide structured events with trace correlation) for the next-level upgrade. Slots in before Phase 4 so all subsequent UX phases ship against a debuggable substrate.

**Design lock**: pure NDJSON storage (one event per line); primary consumer is **agents** (Claude Code sessions reading the log via `cat | jq` to diagnose user-reported bugs), not humans squinting at Obsidian text-mode files. No in-app log viewer — agents read structured JSON natively; humans use shell or any editor.

**New API surface** (`src/utils/debug.ts` — 80% rewritten):
- Severity methods: `info(category, op, msg, data?)` / `warn(...)` / `error(...)` / `trace(...)`
- Span helper: `span(category, op, fn, data?)` auto-emits start + end events with `duration_ms`; nested spans propagate `parent_span_id`; thrown errors auto-recorded at error level
- Trace context: `newTraceId()` + `withTrace(id, fn)` for explicit propagation through async chains (no AsyncLocalStorage magic — Crosswalker has no concurrent imports)
- Category filters: per-subsystem opt-out via settings
- Verbose gate: `trace()` events only written when `setVerbose(true)`
- `readForExport(maxBytes)` — tail with secret redaction (regex sweep for `sk-` / `ghp_` / `AIza` / `AKIA` prefixes + long opaque tokens)
- Backward-compat shim: existing `.log()` and `.error()` 2-arg calls keep working (emit with `category: 'legacy'`) until Phase 3.5c sweeps the call sites

**Event schema** (every NDJSON line):
```ts
{ ts, level, category, op, msg, trace_id?, span_id?, parent_span_id?, duration_ms?, ...freeform context }
```

**Storage**: pure NDJSON at `crosswalker-debug.log` (vault root). Rotation at 5 MB cap with 3 keep-archives (`.1`, `.2`, `.3` = 20 MB max disk). Append via `vault.adapter.append()` for O(1) writes (previous read-modify pattern was O(n) per write — would have made the log unusable past ~100 KB).

**Test coverage**: 18 new tests in `tests/debug-log.test.ts`. **243/243 total pass.**

### v0.1.6 wizard fixes (2026-05-11, ✅ Done)

Three wizard UX/correctness fixes shipped 2026-05-11 alongside Phase 3.5a/3.5b:

- **`build: fix tsconfig.json TS 6+ deprecation errors`** (commit `5d458d7`) — removed unused `baseUrl` + `paths` (no `@/*` aliases imported anywhere); changed `moduleResolution: "node"` → `"bundler"` (semantically correct for esbuild). Unblocked `bun run build` under TypeScript 6+.
- **`fix(ui): config browser modal width and vertical space`** (commit `383d94f`) — applied width class to `modalEl` (not `contentEl` — the source of the bug); flex-wrap on toolbar + card-actions + footer; flex-column layout in `modal-content` so the list area grows. Visual test added at `tests/e2e/visual-config-browser.spec.ts`.
- **`fix(ui): wider import wizard modal + stat-card column statistics grid`** (commit `7dda997`) — same `modalEl` vs `contentEl` fix; column statistics rewritten as a responsive stat-card grid (label + numeric value + '% of rows' meta + 'has blanks' warning) instead of a flat grey paragraph box.
- **`fix(generation): wizard fallback no longer breaks every row with '{{row}}' template`** (commit `ceffb6a`) — the "0 notes generated" bug. Stale Mustache-syntax fallback in `buildConfigFromWizardState` (`template: '{{row}}'`) referenced a non-existent template variable. Render engine threw on every row. Fix: omit `filename` when no title column is picked → legacy-shim falls back to first frontmatter column. Made `MappingConfig.filename` optional (matches actual contract — all existing callers used `mapping.filename?.template`). 3 regression tests added.
- **`fix(wizard): 3-notes import bug + Phase 1 polish`** (commit `5dbdaf1`, 2026-05-11) — second-order wizard bug surfaced during Phase 1 manual testing. `buildColumnMappingLookup` unconditionally overrode hierarchy with frontmatter when a column appeared in both (common in seeded NIST 800-53 saved config). Fix: reordered loops by structural primacy (hierarchy first, then title-from-template, then links/body, then frontmatter LAST) with "first-write wins" `.has()` check. Plus: `buildConfigFromWizardState` now accepts the applied config's filename template + translates legacy Mustache `{{X}}` → single-brace `{X}` at the boundary. 4 new edge-case tests added. Settings copy de-jargoned (removed "per Ch 31"). TEST_PHASE1_QUERY_SCHEMA.md Scenario 3 corrected (recipes/v0-1/ is at REPO root, not vault root — ENOENT confusion explained).

Also 2026-05-11: **`dev: install Hot Reload in test-vault`** (commit `3133060`) — installed pjeby/hot-reload v0.3.0 into test-vault so future `bun run build` rebuilds auto-reload Crosswalker in Obsidian without manual toggle-off/on. Added a `Pre-flight — reload after every rebuild` section to all 3 TEST_PHASE*.md guides. Re-synced guides to `test-vault/_test-guides/`.

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

### Phase 2 + 3 E2E backfill (2026-05-10, post-Phase 3, ✅ Done)

After shipping Phases 2 + 3, backfilled real WebdriverIO + wdio-obsidian-service E2E coverage that exercises the full path through the plugin runtime (not just unit-test mock-vault round-trips). Closes the "E2E pending — env-fragile" caveat from both phase logs:

- `tests/e2e/sssom-import.spec.ts` — 7 tests verifying SSSOM import end-to-end against real Obsidian + real SQLite + real metadataCache (command registration, plugin.precomputeClosure handle, TSV → 5 junction notes round-trip, STRM normalization in frontmatter, Tier 2 mappings table population, closure_cache eager-precompute).
- `tests/e2e/crosswalker-pivot-view.spec.ts` — 6 tests verifying `plugin.registerBasesView` API exposure, `crosswalker-pivot` view-type registration in Bases registrations map, reference `.base` file auto-creation on first run, content shape, and **idempotent first-run write preserves user edits across plugin disable/re-enable cycle** (the test that actually exercises Settled #3's user-edit-safety property).

`bun run e2e` confirms **17/17 spec files pass** in 18:04 (full sequential run; `maxInstances: 1`).



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
