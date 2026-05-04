# Changelog

All notable changes to Crosswalker will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased] — design phase complete

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
