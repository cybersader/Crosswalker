# Changelog

All notable changes to Crosswalker will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased] — v0.1 implementation in progress (2026-05-04 → present)

The 0.1 design phase concluded 2026-05-04. Implementation phase began the same day. As of 2026-05-06, milestones v0.1.1 / v0.1.2 / v0.1.3 / v0.1.4 / v0.1.4.5 are ✅ shipped; v0.1.5 (Tier 2 sidecar) is mid-milestone (Phase 1+2 done, Phase 3 next).

### v0.1.5 — Tier 2 sqlite-wasm sidecar projector (2026-05-06, mid-milestone — Phase 1+2 done)

Phase 1 (substrate scaffolding) + Phase 2 (projector) complete. WASM-A path: plain `@sqlite.org/sqlite-wasm` (sqlite-vec deferred — see [WASM-A pivot synthesis](https://cybersader.github.io/crosswalker/agent-context/zz-log/2026-05-06-wasm-a-pivot-synthesis/)).

- `src/tier2/sidecar.ts` — sqlite-wasm lifecycle via Blob URL load (Obsidian app:// URL workaround); OPFS sahpool VFS
- `src/tier2/migrations.ts` — schema_version + drop-and-recreate migration (correct because Tier 2 is purely a Tier 1 projection)
- `src/tier2/schema.sql` — full DDL per [v0.1 schema spec §7](https://cybersader.github.io/crosswalker/agent-context/v0-1-schema-spec/#7-tier-2-sidecar-sql-schema-sqlite-wasm-projection): schema_meta, ontologies, concepts, mappings, junction_notes, closure_cache + indexes + junction_notes_with_freshness view
- `src/tier2/projector.ts` — kind-aware Tier 1 → Tier 2 projection. Walks `app.vault.getMarkdownFiles()` lazily; reads frontmatter via `app.metadataCache.getFileCache`; dispatches by `kind` (default → concepts; junction-note → junction_notes; crosswalk-edge → mappings); cooperative yielding every 50 files; idempotent INSERT OR REPLACE. Closure cache invalidated after mappings writes
- `plugin.openTier2()` + `plugin.runProjection()` exposed as instance handles
- Palette command: "Crosswalker: Clear Tier 2 sidecar (reproject from canonical Tier 1 on next open)"
- Esbuild target bumped ES2018 → ES2020 (sqlite-wasm uses BigInt literals)
- esbuild.config.mjs copies sqlite-wasm artifacts (`sqlite3.wasm` + `sqlite3.mjs`) into plugin distribution at build time
- wdio.conf.mts `before` hook copies tier-2 artifacts into the test vault's plugin dir (obsidian-launcher only copies main.js + manifest.json + styles.css by default)
- E2E: `tests/e2e/sidecar-phase-1-smoke.spec.ts` (6/6 pass — substrate scaffolding) + `tests/e2e/sidecar-phase-2-projection.spec.ts` (7/7 pass — projector + idempotency)

**WASM-A pivot (2026-05-06)**: Originally chose WASM-B (vendor `sqlite-vec-wasm-demo` to ship vec from day 1). Integration hit a 5-issue emscripten env-detection chain in Obsidian's Electron renderer (the demo artifact is for plain web browsers, not Electron's hybrid `window`+`process` environment). Reverted to WASM-A (plain sqlite-wasm) with sqlite-vec deferred. Calendar-anchored revisit: 2026-11-06. See [WASM-A pivot synthesis](https://cybersader.github.io/crosswalker/agent-context/zz-log/2026-05-06-wasm-a-pivot-synthesis/) + [Ch 24 §5 Q4](https://cybersader.github.io/crosswalker/agent-context/zz-log/2026-05-04-tier-2-substrate-synthesis/#5-migration-triggers--when-to-revisit).

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
