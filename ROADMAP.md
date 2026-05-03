# Crosswalker Roadmap

Crosswalker is a meta-system for ontology lifecycle management. Architecture decisions come first, features are built on that foundation. Full docs roadmap with linked rationale: https://cybersader.github.io/crosswalker/reference/roadmap/

## Done (0.1.0 MVP)

- [x] Import wizard (CSV parsing, column config, preview, generation)
- [x] Config save/load/match system with fingerprinting
- [x] Generation engine with `_crosswalker` metadata
- [x] Documentation site
- [x] Unit tests + CI/CD

## Foundation — "Get the architecture right" (current phase)

After three research waves on 2026-05-02 + the v0.1 stack-pivot, Foundation is now organized around a concrete v0.1 build target plus the genuinely-still-open spec items.

**Architectural safety guarantee (load-bearing):** Tier 1 (canonical files) is the source of truth. Tier 2 and Tier 3 are projections — fully deletable, fully recoverable from Tier 1. Delete the .sqlite, the plugin reprojects on next vault load. Tier 1 alone is functional.

### v0.1 build target — what ships first

Concrete, shippable. ~1.2 MB total. Tier 1 + Tier 2 sqlite-wasm sidecar bundled together.

- [ ] Tier 1 storage: markdown + YAML frontmatter; STRM predicate vocabulary; junction notes (13-field schema) for evidence links
- [ ] Tier 1 in-memory JS Map index (works without Tier 2)
- [ ] Tier 2 sqlite-wasm sidecar projector (`@sqlite.org/sqlite-wasm` + sqlite-vec, ~600 KB; auto-projects from Tier 1, deletable)
- [ ] Crosswalk-render plugin (Dataview-style on Tier 1; recursive CTE on Tier 2 for transitive closure / joins / coverage matrices)
- [ ] STRM-shaped TSV exporter (NIST IR 8278A r1 OLIR template shape) + OSCAL JSON exporter + optional SSSOM-flavored TSV emission
- [ ] Audit trail T1 default (git commits + Ed25519-signed releases + on-demand FRE 902(13) PDF)
- [ ] Bundle target ~1.2 MB compressed total

### Resolved Foundation decisions

- [x] Crosswalk edge semantics — STRM (predicate vocab) + SSSOM (validation envelope), hybrid: STRM-shaped TSV is user-facing wire format
- [x] Junction notes for evidence links (Ch 07 resolution) — 13-field flat-YAML schema, isomorphic to OSCAL `by-component`
- [x] Pairwise crosswalks + optional inheritable pivot (Ch 06 resolution); SCF available as inheritable spine
- [x] Progressive Tier Architecture (confirmed v0.1) — Tier 1 + Tier 2 sqlite-wasm sidecar bundled; Tier 1 standalone path preserved
- [x] Distribution architecture research — pnpm monorepo (@crosswalker/core + plugin + CLI) via VaultAdapter interface; implementation pending
- [x] StewardshipProfile rename + meta-schema lifecycle commitment (rename ripples deferred)
- [x] Audit trail floor: git + signed commits as v0.1 default; T2/T3 audit profiles as opt-in compliance-export mode in v1.0+
- [x] Identifier strategy (Ch 09) — UUIDv7 + sha256 CIDs + CURIEs (ORCID for SSSOM authors); CWUUID is display-only
- [x] **Unified v0.1 schema spec (2026-05-03)** — the four interconnected schemas designed together: _crosswalker metadata v2, ImportRecipe (formerly FrameworkConfig), junction note 13-field schema, Tier 2 sidecar SQL. https://cybersader.github.io/crosswalker/agent-context/v0-1-schema-spec/
- [x] **FrameworkConfig → ImportRecipe rename (2026-05-03)** — type renamed for general-ontology positioning; field renames: framework_id → ontology_id, framework_version → ontology_version, config_id → recipe_id, junction-note `framework` field → `ontology`. Folder convention stays user-controlled.

### Genuinely-still-open Foundation items

**Schema implementation work (build against the v0.1 schema spec):**
- [ ] ImportRecipe v1 schema in src/types/config.ts (formerly FrameworkConfig v2); migration script for legacy v1 saved configs
- [ ] _crosswalker metadata v2 implementation in src/generation/generation-engine.ts; idempotent migration helper
- [ ] Junction note generation as new code path in generation engine; non-destructive, git-history-preserving
- [ ] Tier 2 sidecar SQL projector — new packages/core/ module; auto-runs on vault load; lazy closure cache
- [ ] Migration strategy matrix — StewardshipProfile + version delta → SCD type + handling

**Implementation infrastructure:**
- [ ] Monorepo restructure (extract ~50-60% into packages/core)
- [ ] Obsidian Bases direction research (viewing/querying layer on native capabilities)
- [ ] Transform engine (custom build, 24 transform types)
- [ ] Ontology diff primitives implementation (9 atomic operations + 4 recognized composites)

**Documentation tasks (non-blocking):**
- [ ] OSCAL ↔ Crosswalker mental-model documentation
- [ ] DB-choice architecture page (why Tier 1 + sqlite-wasm sidecar, not pure graph DB)
- [ ] Comunica honest+practical assessment (conditional confirmation pending)
- [ ] StewardshipProfile rename ripples (~24 docs files)

**Research items remaining (not v0.1-blocking):**
- [ ] SEACOW + folder-tag-sync prior-art integration decision
- [ ] Graph scope decision (DAGs/hypergraphs deferred)
- [ ] StewardshipProfile vs transformation recipes investigation

**Infrastructure:**
- [ ] PII scanning in CI/CD
- [ ] Expand E2E smoke tests minimally
- [ ] Fluid layout scaling (clamp() CSS replacing rigid breakpoints)

## Formats — "Import anything, transform it properly"

- [ ] Complete import wizard UI (redesigned around v2 schema)
- [ ] XLSX parser + JSON/JSONL parser
- [ ] Transform system (20+ types)
- [ ] E2E test suite (built from spec)

## Crosswalks — "Link frameworks to each other and to evidence"

- [ ] Cross-framework linking engine
- [ ] Link insertion commands with search modal
- [ ] Batch re-import with version awareness
- [ ] CLI implementation (headless operations)

## Performance — "v1.0+ companion plugins"

Performance enhancements + integration capabilities researched 2026-05-02 (third research wave). Reframed by v0.1 stack-pivot as opt-in companion plugins after v0.1 lands.

- [ ] "Crosswalker Power Query" companion plugin — DuckDB-WASM + Oxigraph + Nemo layered Tier 2 stack (~5 MB). For users who outgrow Tier 2-Lite's ~100K mapping ceiling or need recursive SHACL / multi-stratum Datalog / SPARQL property paths
- [ ] Comunica federation companion plugin — Comunica + N3 + HDT for cross-vault, cross-org, external SPARQL endpoint queries (conditional — honest assessment needed)
- [ ] Compliance-export mode — opt-in profile picker exposing T2 OpenTimestamps and T3 audit options ("US litigation", "EU regulated", "Federal ATO", "Supply-chain")
- [ ] Migration trigger UX — status-bar + modal prompts when user outgrows Tier 2-Lite
- [ ] PQC dual-sign migration (2027+) — Ed25519 → ML-DSA-44 dual-sign per NIST IR 8547 timeline

## Deployment — "v2.0+ Tier 3 server guide"

Server-tier deployment options for users who genuinely need a shared multi-team server. Documented as a deployment guide rather than bundled into the plugin.

- [ ] Default recommendation: Postgres + JSONB + recursive CTE (boring tech, broadly operable)
- [ ] Apache Jena Fuseki + oxigraph-server — same-API SPARQL alternative (architectural symmetry with v0.1 Tier 2)
- [ ] Layered Fuseki + DuckDB-on-server — power-user upgrade path
- [ ] TerminusDB v12 — opt-in vault-mirror with git-style branch/diff (small-vendor risk flagged)
- [ ] Apache AGE on Postgres — supported fallback for Postgres-standardized environments
- [ ] Migration from AGE for early adopters (re-projection, not translation)

## Evolution — "The meta-system"

- [ ] Entity-aligned migration UX — guided form → migration plan YAML → CLI
- [ ] Version registry standard — pluggable detection interface
- [ ] Per-framework decisioning format — taxonomy over taxonomies
- [ ] Progressive classification UX (community → wizard → auto-detect)
- [ ] Evolution profile registry (StewardshipProfile)
- [ ] Migration strategy engine (built on structural diff engine)
- [ ] Stale crosswalk detection

## Community — "Share and scale"

- [ ] Community config registry
- [ ] OSCAL export (deferred to Phase 2+ per 2026-05-02 user decision; document OSCAL into Crosswalker mental model first)
- [ ] Compliance dashboards
- [ ] Custom migration transforms (inline → named → custom scripts)
- [ ] AI-assisted transforms (LLM property mapping, like Obsidian web clipper AI templates)
- [ ] Extended graph support (DAGs, hypergraphs)
- [ ] Community plugin submission
- [ ] Spec publication (StewardshipProfile taxonomy + structural diff engine)

## Decision log highlights

Recent (2026-05-02 / 2026-05-03):

- v0.1 initial-stack pivot — https://cybersader.github.io/crosswalker/agent-context/zz-log/2026-05-02-v0-1-initial-stack-pivot/
- Direction third-wave architectural shifts — https://cybersader.github.io/crosswalker/agent-context/zz-log/2026-05-02-direction-third-wave-architectural-shifts/
- Direction commitments TL;DR — https://cybersader.github.io/crosswalker/agent-context/zz-log/2026-05-02-direction-commitments-tldr/
- 05-01 Foundation commitments — https://cybersader.github.io/crosswalker/agent-context/zz-log/2026-05-01-foundation-commitments-and-followon-research/
- Evidence-link edge model synthesis (junction notes) — https://cybersader.github.io/crosswalker/agent-context/zz-log/2026-04-10-evidence-link-edge-model-synthesis/
- 04-10 Foundation research synthesis — https://cybersader.github.io/crosswalker/agent-context/zz-log/2026-04-10-foundation-research-synthesis/

Full decision log: https://cybersader.github.io/crosswalker/agent-context/zz-log/

Research deliverables: https://cybersader.github.io/crosswalker/agent-context/zz-research/

Research challenges: https://cybersader.github.io/crosswalker/agent-context/zz-challenges/
