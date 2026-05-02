---
title: "Ch 11 deliverable C: Tier 2/3 engine deep survey — layered Tier 2 + OSCAL/FedRAMP angle"
description: "Third fresh-agent run of Challenge 11. Independently arrives at the same layered Tier 2 stack (DuckDB-WASM + Oxigraph + Nemo) as deliverable B, plus identifies a unique strategic insight: FedRAMP RFC-0024 mandates machine-readable authorisation packages by September 2026, making OSCAL native support a 10× value-multiplier for the federal market. Adds explicit innovative directions (LinkML schema substrate, IPLD content-addressed releases, Apache Arrow for cross-tier RPC)."
tags: [research, deliverable, query-engine, tier-2, tier-3, oscal, fedramp, oxigraph, nemo]
date: 2026-05-02
sidebar:
  label: "Ch 11c: Engine survey"
  order: -20260502.6
---

:::tip[Origin and lifecycle]
Fresh-agent research deliverable produced 2026-05-02 in response to [Challenge 11: Tier 2/3 engine deep survey](/crosswalker/agent-context/zz-challenges/11-tier-2-3-engine-deep-survey/). One of three independent runs (siblings: [deliverable A](/crosswalker/agent-context/zz-research/2026-05-02-challenge-11-deliverable-a-engine-survey/), [deliverable B](/crosswalker/agent-context/zz-research/2026-05-02-challenge-11-deliverable-b-engine-survey/)). This deliverable independently converges on the layered Tier 2 stack (matching deliverable B) and adds the FedRAMP RFC-0024 / OSCAL angle as a unique strategic finding. Summarized in [05-02 §2.4](/crosswalker/agent-context/zz-log/2026-05-02-direction-research-wave-and-roadmap-reshape/#24-challenge-11--tier-23-engine-deep-survey-3-deliverables). Critical read in [05-02 §3.4](/crosswalker/agent-context/zz-log/2026-05-02-direction-research-wave-and-roadmap-reshape/#34-critical-read-of-ch-11). Preserved verbatim; not edited after publication.
:::

# Challenge 11 — Tier 2/3 Graph + Analytical Engine Deep Survey for the Crosswalker Project

## Executive Summary

Challenge 10 chose **DuckDB-WASM (Tier 2) + Apache AGE on PostgreSQL (Tier 3)** from a 9-engine shortlist. After surveying ~25 candidates across seven categories, this report concludes that the call **was directionally correct but incomplete**, and proposes a refined four-part recommendation:

1. **Keep DuckDB-WASM as the Tier 2 default analytical engine**, but treat it as one of three peers in a *layered* Tier 2 (DuckDB-WASM for tabular/aggregations, **Oxigraph-WASM** for SPARQL/SKOS, **Nemo-WASM** for SSSOM chain-rule derivation). This is the single biggest gap in Challenge 10: it picked one Tier 2 engine when the Crosswalker semantics genuinely span three engine *kinds* (analytical, RDF, deductive).
2. **Replace Apache AGE with Apache AGE *plus* Oxigraph or Apache Jena Fuseki** at Tier 3, because Apache AGE is a property-graph engine and SSSOM/SKOS/STRM are intrinsically RDF. AGE's PostgreSQL umbrella remains the right host for the relational/operational view, but it is the wrong primary for the canonical semantic graph.
3. **Adopt TerminusDB as an *optional* Tier 3 "vault-mirror" deployment**, not the primary. Its git-style branch/diff/merge is uncannily well-aligned with the files-canonical ethos, but it is not embeddable, is built on SWI-Prolog with non-trivial RAM overhead, has no WASM target, and stores its own data as many small files — which makes it a parallel governance database, not a replacement for the Obsidian vault.
4. **Pre-commit to migration triggers** so the engine choice is revisitable in 12–18 months without architectural rewrites: (a) Ladybug/Bighorn fork stability ≥12 months of releases, (b) DuckPGQ promoted to a WASM-signed core extension, (c) any production-grade WASM-native multi-model graph DB (graph + RDF + vector) appearing.

The remainder of this report supplies the evidence, an evaluation matrix on unified axes, deep dives on TerminusDB and the seven architectural questions Challenge 10 didn't ask, verification of empirical claims, and innovative directions.

---

## SECTION 1 — Engine Evaluation Matrix

Scoring rubric: **A** (excellent fit), **B** (workable), **C** (significant friction), **D** (unsuitable), **N/A**. Crosswalker fit is a holistic 0–10 score for the project's specific files-canonical, multi-year, durability-first profile.

### Datalog / Rule Engines (HIGH PRIORITY for SSSOM chain rules)

| Engine | Crosswalker fit | Highlights |
|---|---|---|
| **Nemo** (knowsys, TU Dresden) | **9/10** | A (RDF-native datalog), Apache-2.0, **`nemo-wasm` shipping**, **already used by EBI's OxO2 to derive SSSOM crosswalks** |
| Soufflé | 4/10 | A datalog, but C++→native, no WASM |
| Differential Datalog | 3/10 | VMware archived 2022 |
| Datomic Pro/Cloud | 5/10 | Apache-2.0 since 2023, but JVM-only |
| RDFox | 2/10 (reference only) | Commercial; A-grade Datalog/OWL-RL |

### Production Triple Stores

| Engine | Crosswalker fit | Highlights |
|---|---|---|
| **Apache Jena Fuseki** | **8/10 (Tier 3)** | Apache-2.0, mature, supports RDFS/OWL inference, JVM server |
| **Oxigraph** (0.4+) | **9/10 (Tier 2)** | A SPARQL 1.1, **Rust→Wasm npm `oxigraph` package**, ~3–4 MB |
| GraphDB (Ontotext) | 4/10 | Free + Commercial tiers, A SKOS/OWL reasoning |
| Virtuoso | 5/10 | GPL-2/Commercial, hybrid SQL+SPARQL |
| RDF4J | 6/10 | EDL, JVM library, not server |
| Stardog | 3/10 | Commercial |
| AnzoGraph | 2/10 | Commercial, MPP |
| Blazegraph | 1/10 | **Effectively abandoned**; Wikidata migrating off |

### Versioned Graph DBs

| Engine | Crosswalker fit | Highlights |
|---|---|---|
| **TerminusDB** | **7/10 as optional Tier 3** | Apache-2.0, **A native git-style branch/clone/push/pull/diff/merge**, **D for browser** (server-only Docker), DFRNT Studio active, v12 Dec 2025 |
| Dolt | 4/10 (instructive only) | Apache-2.0, relational, DoltHub |

### Property Graph Databases

| Engine | Crosswalker fit | Highlights |
|---|---|---|
| **Apache AGE** | **7/10 (Tier 3 partial)** | Apache-2.0, **PG 11–18 supported as of 2025**, true SQL+Cypher hybrid |
| Memgraph | 3/10 | **BSL 1.1 — not OSI open source** |
| NebulaGraph | 4/10 | Apache-2.0, distributed, server |
| ArangoDB | 3/10 | **BSL 1.1 since 2024** |
| Dgraph | 3/10 | Apache-2.0, **acquired by Istari Digital, Oct 2025** |
| FalkorDB | 4/10 | **Source-available (SSPL-adjacent)**, A vector index, GraphRAG focus |
| OrientDB | 3/10 | Slow |
| **KuzuDB** (upstream) | **0/10 (do not adopt)** | **Archived 10 Oct 2025** |
| LadybugDB (Kuzu fork) | 4/10 (re-evaluate 12 months) | C — fork <6 months old; investor interest but unproven |
| Bighorn (Kineviz Kuzu fork) | 3/10 | C — fork <6 months old |
| RyuGraph (Akon Dey Kuzu fork) | 3/10 | Newer than Ladybug |
| Vela-Engineering/kuzu | 3/10 | Concurrent multi-writer, single-firm fork |
| ArcadeDB | 5/10 | Apache-2.0, multi-model, MCP server |
| HugeGraph (Apache) | 4/10 | Apache-2.0 TLP |

### Embedded Analytical Engines

| Engine | Crosswalker fit | Highlights |
|---|---|---|
| **DuckDB-WASM** | **9/10 (Tier 2 default)** | MIT, **~3.2 MB Brotli** for full shell with autoloaded extensions, DuckDB Foundation governance, weekly releases (v1.4.3 LTS Dec 2025) |
| **DataFusion** (Apache Arrow) | 5/10 | Apache-2.0, Rust→Wasm possible, several community demos, ~5 MB Wasm est. |
| **Polars-WASM** | **3/10 — NOT viable as Tier 1.5 today** | **"highly experimental, not meant for production usage…significant startup overhead, large WASM binary"**, alpha (3+ years at 0.0.1-alpha) |
| LanceDB | 5/10 | Apache-2.0, A versioning at file level, A vector |
| ClickHouse-local | 3/10 | Apache-2.0, no maintained WASM build |
| Velox | 2/10 | Apache-2.0, Meta-led, no WASM |

### Vector + Graph Hybrids

Mostly server-only (Weaviate, Qdrant, Milvus, FalkorDB+vec). pgvector + AGE combo is cleanest "single Tier 3 service that does graph + vector + SQL".

### Streaming / IVM Systems

Crosswalker workload is curated multi-year crosswalks, not streaming. Materialize (BSL/cloud), Differential Dataflow (library), Snowflake Dynamic Tables (proprietary), ksqlDB (Confluent-licensed). All wrong shape.

### Virtual / Federated

Ontop (SPARQL-over-relational, JVM, server-only) — could expose AGE/PG tables as virtual SPARQL endpoint via R2RML/OBDA. **Worth a Tier 3 prototype.**

### Query Unification

GraphQL gateway useful as *read API* of Tier 3, not unifier across tiers. Substrait — adopt as inter-tier IR.

---

## SECTION 2 — Architectural Questions Challenge 10 Didn't Ask

### 2.1 TerminusDB as Tier 2 or Tier 3 Primary

**The temptation is real.** TerminusDB offers commits/branches/push/pull/clone/diff/patch/time-travel; for a Crosswalker whose first principle is "files canonical, derived stores rebuildable," and whose users want to *review* a proposed mapping change like a PR, this is an almost-too-good fit.

**The blocking realities:**
1. **No WASM, no embedded mode.** Maintainer states explicitly that embedding requires SWI-Prolog, would carry "tens of megabytes of RAM overhead," is *not* on the roadmap, and storage layout (many small files) is hostile to single-file embedded use.
2. **Storage format is many small files** — Crosswalker's vault is *already* many small files; stacking another many-small-files store is duplication and operational risk.
3. **Server-only deployment** via Docker Compose, plus external "DFRNT Studio" hosted UI.
4. **Branch model semantics are not git-equivalent** — branches are namespaces in single store; do not map onto `git checkout` over file system.
5. **License & community.** Apache-2.0 (since v4), but small company; commits in 2025 moderate.

**Recommended role:** **Optional Tier 3 "vault-mirror" deployment for teams that want a queryable diff history of the SSSOM dataset itself.** Nightly job materialises vault into TerminusDB branch; gives reviewers git-style diff view; never becomes system of record. **It is not the Tier 2 or Tier 3 primary.**

### 2.2 Polars-WASM as Tier 1.5

`pola-rs/js-polars` README: "highly experimental and is not meant for production usage…significant startup overhead." `@pola-rs/browser` at 0.0.1-alpha since 2022. **Reject Polars-WASM as Tier 1.5.** Re-evaluate in 12 months.

### 2.3 GraphQL as Tier-Agnostic Query Surface

**Concept:** Single GraphQL schema with resolvers routing to whichever engine is local. **TerminusDB already speaks GraphQL natively. Hasura** (PG → GraphQL) gives instant GraphQL over AGE's host PG. **Custom router resolvers** can compile single `crosswalk(controlId, depth)` query into AGE Cypher path query or DuckDB recursive CTE.

**Verdict:** Adopt **GraphQL as read API of Tier 3, not as unifier across tiers.** Tier 2 should expose thin TypeScript `CrosswalkerClient` wrapping DuckDB-WASM/Oxigraph/Nemo directly.

### 2.4 CRDT Layer for Deferred Live-Edit Team Mode

| Library | Status | Encoding | Strengths | Weaknesses |
|---|---|---|---|---|
| **Yjs** | Production (JupyterLab, Serenity Notes) | Compact binary updates | Mature, large ecosystem | No DAG of full history |
| **Automerge** | Production-suitable (Rust core + automerge-repo) | Columnar | JSON-shaped data; full DAG history; multi-language | Slower in micro-benchmarks; needs automerge-repo |
| **Loro** | **Pre-1.0; authors recommend against production use** | Binary, replayable event graph | Best raw performance in 2024 benchmarks; excellent rich text | Stability risk; small ecosystem |

**Pragmatic pattern:** Authoritative state in files (Markdown + SSSOM TSV) under git; Yjs document mirrors open file during live-edit session; on session close, Yjs state serialised back to canonical file and committed. **Defer CRDT integration; when needed, choose Yjs.**

### 2.5 WASM Bundle Optimisation

DuckDB-WASM ships **~3.2 MB Brotli-compressed** for full shell. Concrete levers:

1. **MVP/EH split with feature detection.** `getJsDelivrBundles()` serves either based on browser exception-handling support.
2. **Defer all extension loading.** Crosswalker should *never* load `parquet`, `httpfs`, `spatial`, `tpcds`, `tpch`, `vss`, or `substrait` at startup.
3. **Self-hosted custom extension repository on Obsidian-served origin** (`SET custom_extension_repository = '/duckdb-ext/'`).
4. **Build `WASM_MIN_SIZE=1` Release variant** for fully tree-shaken core. Estimated saving: 15–25%.
5. **Service-Worker cache Wasm binaries** with long-lived `Cache-Control: immutable` keyed by version hash.
6. **Lazy-load Oxigraph and Nemo only when invoked**, not at app boot.

**Estimated total savings:** First-visit transfer drops from ~10 MB (all eager) to ~3 MB (DuckDB minimum + everything else lazy).

### 2.6 LLM / NL-Query Architecture

Three placements; pick per use-case:

| Placement | Pros | Cons |
|---|---|---|
| **In-browser via WebLLM** | Fully offline, no data egress | 1–2 GB initial download; quality limited at this size |
| **Local sidecar** (Ollama, llama.cpp, LM Studio) | High quality, large context, no egress | Requires user to install |
| **Cloud API** (OpenAI, Anthropic, Azure) | Best quality, no install | Data leaves vault; compliance risk |

**Architecture for all three:** LLM never issues raw SQL/Cypher. (1) LLM produces structured intent (JSON Schema-constrained). (2) Deterministic compiler translates intent → DuckDB SQL or Oxigraph SPARQL or Nemo program. (3) Results returned to LLM for natural-language formatting.

Pattern survives engine changes (intents stable; compilers swappable) and prevents prompt-injection-driven destructive queries.

### 2.7 Datalog vs Recursive CTE for SSSOM Chain Rules (coordinates with Challenge 12)

- Recursive CTEs in DuckDB can express SSSOM chain composition but require manual upper bounds
- Datalog (Nemo) expresses OxO2 chain rules in 5–10 lines, supports stratified negation, existential rules, tracing
- Soufflé faster but compiles to native C++, no WASM target

**Recommendation:** Use Nemo-WASM for SSSOM derivation; use DuckDB recursive CTEs only for ad-hoc analyst exploration. Materialise Nemo's derived mappings into DuckDB tables for fast pivot/aggregation queries. **This is Crosswalker's natural specialisation of OxO2's architecture.**

---

## SECTION 3 — Verification of Challenge 10's Empirical Claims

### 3.1 KuzuDB archived 10 Oct 2025 — VERIFIED

GitHub repo archived; *"Kuzu is working on something new!"*. Confirmed by The Register (14 Oct 2025), Hacker News thread #45560036, FalkorDB/ArcadeDB migration blogs.

**Fork status:**
- **Bighorn** (Kineviz, GraphXR product as embedded + standalone server)
- **LadybugDB** (Arun Sharma, ex-Facebook/Google) — most credible long-term candidate
- **RyuGraph** (Akon Dey, former Dgraph CEO) — late October 2025
- **Vela-Engineering/kuzu** — concurrent multi-writer for AI agents

**Important caveat:** Some secondary sources (Vela Partners' blog, ArcadeDB) state KuzuDB acquired by Apple. **Treat as unverified speculation.**

**Recommendation:** Do not adopt any Kuzu fork as Tier 2 primary in 2026.

### 3.2 DuckDB-WASM ~3.2 MB compressed — VERIFIED, STABLE

Repository README: *"about 3.2 MB of compressed Wasm files to be transfered over the network (on first visit, caching might help)."* Has not grown materially through 2025. Latest stable v1.5.2; DuckDB 1.4.3 LTS (December 2025) is current LTS.

### 3.3 DuckPGQ extension not yet WASM-friendly — PARTIALLY OUT OF DATE; STILL CORRECT IN PRACTICE

DuckPGQ promoted to **DuckDB community extension** (since DuckDB 1.0.0+). DuckDB blog ran October 2025 post on graph queries with DuckPGQ. **However:**
- DuckDB-WASM extensions must be served from official path with signed `duckdb_signature` custom Wasm section
- DuckPGQ **not in the list of WASM-supported core extensions**

**Migration trigger:** DuckPGQ promoted to WASM-signed core extension. Until then, recursive CTEs are the in-browser graph mechanism.

### 3.4 Apache AGE PG version compatibility — VERIFIED AND UPDATED

`apache/age` README states: *"AGE supports Postgres 11, 12, 13, 14, 15, 16, 17 & 18."* PG 18 support added in 2025. **However, PostgreSQL 17.1 ABI break in November 2024 affected AGE and TimescaleDB** — pin both PG minor version and AGE build, rebuild AGE after any minor PG upgrade.

---

## SECTION 4 — Innovative Directions and Crosswalk Exploration

### 4.1 Challenging the DuckDB-WASM + AGE Premise

**Risks Challenge 10 understated:**

1. **DuckDB is property-table-shaped, not RDF-shaped.** SSSOM, SKOS and STRM are RDF-native. Forcing them through SQL recursive CTEs *works*, but is foreign to the standard.
2. **Apache AGE is a property graph.** SSSOM mappings are inherently triple-shaped. AGE forces property-graph rewrite that loses RDF semantics.
3. **One Tier 2 engine cannot serve three workloads.** Tabular pivots, ontology alignment, and chain-rule derivation are different mathematics.

**The improved stack:**

| Tier | Component | Role |
|---|---|---|
| **1** | Obsidian vault: Markdown + SSSOM TSV + LinkML schema | Canonical |
| **1.5** | sssom-py (validation, format conversion) | Format integrity |
| **2 (browser)** | **DuckDB-WASM** (tabular) **+ Oxigraph-WASM** (SPARQL/SKOS) **+ Nemo-WASM** (SSSOM chain-rule derivation) | Layered Tier 2 |
| **3 (server, optional)** | **Apache AGE on PostgreSQL** (operational property graph) **+ Apache Jena Fuseki** (canonical SPARQL endpoint) **+ TerminusDB** (optional vault-mirror) | Layered Tier 3 |

### 4.2 Engine Crosswalk / Interoperability

Productive cross-engine pipeline:
1. Vault → SSSOM-py validates TSV format
2. SSSOM TSV → Nemo program loads mapping facts plus chain rules
3. Nemo materialises derived mappings as additional TSV/RDF artefacts
4. Derived TSV → DuckDB-WASM for analyst pivots
5. Same TSV (via R2RML) → Oxigraph for SPARQL exploration
6. Server-tier mirror via Substrait IR

### 4.3 Existing SSSOM/SKOS Tooling Ecosystem

| Tool | Role | Relevance |
|---|---|---|
| **sssom-py / sssom-CLI** | Python: parse, validate, merge, diff, convert | **Direct dependency** |
| **OxO2 (EBI)** | Web mapping browser, **uses Nemo for chain-rule derivation** | **Architectural template** |
| **LinkML** | Schema language used by SSSOM itself | **Adopt** for Crosswalker schema layer |
| **Bioregistry / curies-py** | CURIE prefix management | Embed for reliable IRI resolution |

**Strategic insight:** **OxO2's architecture (SSSOM TSV → Nemo Datalog → materialised closure → web UI) is the closest existing analogue to Crosswalker.** Adopting Nemo for derivation isn't novel — it's standing on EBI's shoulders, with peer-reviewed validation (arXiv:2506.04286).

### 4.4 OSCAL Ecosystem — How They Bridge Graph and Tabular

Lessons from NIST OSCAL tooling:

- **Trestle (IBM, CNCF/OSCAL Compass)** — *file-canonical, git-CI/CD oriented*. Splits big OSCAL JSON/YAML into directory trees, treats them as code, runs validation in CI. **This is exactly the Tier 1 pattern Crosswalker is committing to.**
- **`oscal4neo4j`** — loads OSCAL catalogs into Neo4j Cypher.
- **OSCAL Static Site Playground** — Gatsby + JSON to serve OSCAL data as browser app.
- **NIST's December 2025 draft *"Charting the Course for NIST OSCAL"*** explicitly anticipates "future integration with emerging technologies (digital twins, agentic AI) for autonomous risk reasoning." **FedRAMP RFC-0024 mandates machine-readable authorisation packages by September 2026.**

**Concrete recommendation:** Add `crosswalker import oscal` and `crosswalker export oscal` commands. OSCAL `Profile`, `Catalog`, and `Component-Definition` models map directly onto Crosswalker's framework/control/mapping abstractions.

### 4.5 Emerging Standards Worth Tracking

| Standard | Status (late 2025) | Crosswalker relevance |
|---|---|---|
| **RDF 1.2** | W3C draft, near-recommendation; Oxigraph already has rdf-12 feature flag | First-class triple terms make SSSOM provenance cleaner |
| **SPARQL 1.2** | Tracking RDF 1.2 | Future Oxigraph upgrade |
| **GQL (ISO/IEC 39075:2024)** | Published ISO standard | AGE roadmap mentions tracking |
| **SQL/PGQ (SQL:2023)** | Published; DuckPGQ leading implementation | Already in DuckDB community ext |
| **Substrait** | Active; DuckDB+DataFusion+Velox aligned | Inter-tier IR |
| **OSCAL 1.2.x** | Active NIST development | Direct import/export target |
| **FedRAMP RFC-0024** | Mandate effective Sept 2026 | **Demand-side validation for Crosswalker** |
| **W3C RDF-star / SPARQL-star** | Folded into RDF/SPARQL 1.2 | SSSOM provenance metadata |

### 4.6 Migration / Re-decision Triggers

Each engine choice re-evaluated when **any** of:

1. **Kuzu fork** publishes 12 consecutive monthly releases without breaking on-disk format
2. **DuckPGQ** promoted to WASM-signed core extension
3. **New WASM-native multi-model store** (graph + RDF + vector + analytical) reaches β
4. **TerminusDB ships an embedded mode or WASM build**
5. **OSCAL adoption hits federal critical mass post-FedRAMP RFC-0024 deadline (Sept 2026)** → Promote OSCAL import/export from feature to tier-1 architectural concern
6. **Apache AGE goes inactive or fails to track new PG major** (lag > 18 months)
7. **A reproducible SSSOM compliance benchmark** emerges
8. **Browser WebAssembly Component Model + WASI 0.2** reach baseline support across major browsers

---

## SECTION 5 — Final Recommendations

### 5.1 Recommendation Against Challenge 10's Call

**Layer, don't replace.** Challenge 10's DuckDB-WASM + AGE call is sound for *analytical* and *operational property-graph* dimensions but missed *RDF/ontology* and *deductive* dimensions.

- **Tier 1 (canonical):** Obsidian vault with Markdown + SSSOM TSV + LinkML schema
- **Tier 2 (browser, layered):** DuckDB-WASM (default) + Oxigraph-WASM (lazy-loaded) + Nemo-WASM (lazy-loaded). All MIT/Apache, all browser builds today.
- **Tier 3 (server, layered, all optional):** Apache AGE on PostgreSQL + Apache Jena Fuseki (canonical SPARQL endpoint) + TerminusDB (optional vault-mirror) + Ontop (optional, virtual SPARQL over AGE/PG)

### 5.2 Bundle-size Strategy

Progressive disclosure stack: load only DuckDB-WASM at boot (~3 MB Brotli), pull Oxigraph (+~3 MB) only when SPARQL/SKOS feature invoked, Nemo (+~5 MB) only when derivation requested. Use `WASM_MIN_SIZE=1` build, self-hosted custom extension repository, disable autoload of every extension except `json`, `icu`, `fts`.

### 5.3 Migration / Re-decision Triggers (concise)

Decision revisitable if any one becomes true: (1) Kuzu fork hits 12 months stable, (2) DuckPGQ ships as signed core WASM extension, (3) new WASM-native multi-model store reaches β, (4) TerminusDB adds embedded mode, (5) OSCAL adoption hits federal critical mass post-Sept-2026, (6) AGE lags PG by >18 months, (7) WASM Component Model lands cross-browser.

### 5.4 What Challenge 10 Missed Most

In one sentence: **Challenge 10 picked a single Tier 2 engine for what is a three-mathematics problem (analytical, ontological, deductive), and chose a Tier 3 graph engine that doesn't speak RDF in a project whose semantics are RDF-native.** Fix: not throw out Challenge 10 choices but add the second and third Tier 2 engines (Oxigraph-WASM, Nemo-WASM) and second Tier 3 engine (Jena Fuseki).

### 5.5 Five-Year Outlook

Three plausible scenarios by 2030:

- **Scenario A (best, ~40%):** Kuzu fork stabilises; DuckPGQ becomes signed WASM extension; SQL/PGQ becomes dominant in-browser graph syntax; Crosswalker quietly drops Oxigraph in favour of DuckDB+DuckPGQ for graph layer, keeps Nemo for derivation. Stack converges, footprint shrinks.
- **Scenario B (likely, ~40%):** Current layered stack persists; OSCAL becomes federally mandatory; Crosswalker's value comes from being the bridge between informal Markdown-vault editing and OSCAL machine-readable export. TerminusDB's vault-mirror role grows.
- **Scenario C (downside, ~20%):** AGE stagnates; DuckDB-WASM remains stable but unable to absorb graph/RDF; Crosswalker has to migrate Tier 3 to Jena/Fuseki entirely.

In all three scenarios, the **files-canonical, derived-stores-rebuildable** principle is the asset. **The engine choices are tactics; the file format is the strategy.** Challenge 10 was right about the most important thing.
