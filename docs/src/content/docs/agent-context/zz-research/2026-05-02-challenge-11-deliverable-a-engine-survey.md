---
title: "Ch 11 deliverable A: Tier 2/3 engine deep survey — TerminusDB-as-Tier-3-default emphasis"
description: "First fresh-agent run of Challenge 11. Recommends keeping DuckDB-WASM as the Tier 2 analytical engine but DROPPING Apache AGE as the Tier 3 graph primary, replacing with TerminusDB (or DuckPGQ on DuckDB native) for git-style branch/diff/merge over the curated crosswalk graph. Emphasizes versioning as the load-bearing requirement. Includes a Grafeo follow-up (potentially game-changing pure-Rust LPG+RDF+vector engine with WASM bindings)."
tags: [research, deliverable, query-engine, tier-2, tier-3, terminusdb, duckdb-wasm, grafeo]
date: 2026-05-02
sidebar:
  label: "Ch 11a: Engine survey"
  order: -20260502.4
---

:::tip[Origin and lifecycle]
Fresh-agent research deliverable produced 2026-05-02 in response to [Challenge 11: Tier 2/3 engine deep survey](/crosswalker/agent-context/zz-challenges/11-tier-2-3-engine-deep-survey/). One of three independent runs of Ch 11 (siblings: [deliverable B](/crosswalker/agent-context/zz-research/2026-05-02-challenge-11-deliverable-b-engine-survey/), [deliverable C](/crosswalker/agent-context/zz-research/2026-05-02-challenge-11-deliverable-c-engine-survey/)). Summarized in [05-02 §2.4](/crosswalker/agent-context/zz-log/2026-05-02-direction-research-wave-and-roadmap-reshape/#24-challenge-11--tier-23-engine-deep-survey-3-deliverables). Critical read in [05-02 §3.4](/crosswalker/agent-context/zz-log/2026-05-02-direction-research-wave-and-roadmap-reshape/#34-critical-read-of-ch-11). Preserved verbatim; not edited after publication.
:::

# Crosswalker Challenge 11 — Tier 2/3 Engine + Analytical Engine Deep Survey

**Status:** Final research deliverable, May 2026
**Scope:** Re-evaluate the Tier 2 (browser/Obsidian) and Tier 3 (server) engine choice against the full design space. Challenge 10 selected DuckDB-WASM + Apache AGE from a 9-engine shortlist. This report verifies that decision against ≥15 engines spanning Datalog, RDF triple stores, versioned graph DBs, property graphs, embedded analytical engines, vector+graph hybrids, IVM systems, and federated query engines, and issues a final recommendation oriented toward multi-year durability of a curated GRC dataset.

---

## Executive summary (read this first)

1. **KEEP DuckDB-WASM as the Tier 2 *analytical* engine.** It remains the only mature, in-process, browser-native SQL engine with serious join/aggregate capability and a reputable governance home (DuckDB Foundation, Amsterdam). The ~3.2 MB compressed bundle figure remains broadly correct for the stock build; lazy extension loading and bundle selection (mvp/eh/coi) keep the warm-cache initial payload manageable.
2. **DROP Apache AGE as the *Tier 3 graph primary*; replace it with TerminusDB** (or, conditionally, with native DuckDB SQL/PGQ via DuckPGQ) for the team/server tier. AGE's PostgreSQL-extension model gives weak protection against ABI churn (the 17.1 ABI break event of late 2024 hit AGE directly), and AGE's release cadence is slow. Most decisively, AGE has **no native versioning** — and Crosswalker's whole files-canonical, derived-store-rebuildable ethos demands a graph engine whose semantics already include diff/branch/merge.
3. **Adopt TerminusDB as an *optional Tier 3 primary* for any deployment that wants Git-for-data semantics over the curated crosswalk graph.** Its data model (closed-world RDF + JSON-LD documents), WOQL Datalog query language with unification, native commit/branch/diff/merge, GraphQL surface, and Apache-2.0 license under DFRNT stewardship since 2025 line up almost perfectly with Crosswalker's "files canonical, DB rebuildable" principle. TerminusDB does **not** today offer a credible browser/Electron embedding, so it is a Tier 3 (server) candidate, not Tier 2.
4. **For SSSOM chain-rule derivation, prefer Datalog (Nemo) over recursive CTE** as the canonical derivation engine, called as a build-time pipeline step, not as the live query layer. EMBL-EBI's OxO2 sets the precedent: Nemo derives all logically sound SSSOM mappings during dataload (1.16 M input mappings → 49.5 K inferred mappings, ~17 min, ~380 MB RAM on a laptop), then ships the derived facts to a query store. Crosswalker should mirror this pattern: Nemo (or a Souffle equivalent) as the derivation oracle, DuckDB-WASM (Tier 2) and TerminusDB/AGE (Tier 3) as the query surfaces.
5. **Polars-WASM is not yet a credible alternative to DuckDB-WASM** for Tier 2. The official `@pola-rs/browser` package is still labeled experimental ("not meant for production usage", v0.0.1-alpha as of latest publish, last meaningful publish ~3 years ago), with significant startup overhead. Revisit only if Polars team upgrades the WASM target to first-class.
6. **CRDT layer for deferred team-mode live editing: Loro is the rising recommendation, with Yjs as the safe default.** Loro now offers a complete editing-history DAG (true Git-for-data semantics), is implemented in Rust → WASM, and is BSD-friendly. Yjs has the deepest production fleet but stores less history. Automerge is a viable third option but has higher overhead on individual-keystroke workloads.
7. **KuzuDB upstream is dead (archived 10 October 2025). Three forks exist (Bighorn/Kineviz, Ladybug, RyuGraph) plus a Vela-Engineering fork.** None has ≥12 months of stable governance. Crosswalker should not bet on any of them yet, but Ladybug — explicitly aiming to be a drop-in long-term replacement, with announced investor interest and external tool integrations — is the one to monitor.
8. **DuckPGQ is a watch item, not yet a replacement for AGE.** It now ships as an official DuckDB community extension implementing SQL/PGQ (SQL:2023), works in the native DuckDB CLI, and is documented in the DuckDB blog (October 2025). Its WASM availability for the in-browser DuckDB build is not yet a published, supported configuration; CWI explicitly labels DuckPGQ a research project still under active development.

The remainder of this document develops these points in detail.

---

## PART 1 — Engine evaluation matrix

(See [Ch 11 deliverable B](/crosswalker/agent-context/zz-research/2026-05-02-challenge-11-deliverable-b-engine-survey/) and [Ch 11 deliverable C](/crosswalker/agent-context/zz-research/2026-05-02-challenge-11-deliverable-c-engine-survey/) for sibling matrices with overlapping but slightly different scoring; this deliverable's matrix uses A/B/C/D/F grades on nine axes.)

The matrix scores each engine on the nine axes mandated by the challenge: (a) Graph fit, (b) Tabular fit, (c) Browser/Electron compatibility, (d) Bundle size, (e) License, (f) Project health, (g) RDF/SPARQL/OWL fit, (h) Native versioning, (i) Vector+graph hybrid. Scores: **A** (excellent fit), **B** (good fit, minor caveats), **C** (workable with effort), **D** (poor fit), **F** (unsuitable / blocking issue).

**Datalog engines:** Soufflé (C++, no WASM, server-only); Nemo (Rust, Apache-2.0, WASM-shipping, used by OxO2 — *strongest fit for SSSOM derivation*); Differential Datalog (VMware-archived); Datomic (Apache-2.0 since 2023, JVM-only); RDFox (commercial, server-only).

**RDF triple stores:** Apache Jena Fuseki (JVM, server-only); GraphDB (commercial); Virtuoso (GPL/commercial, server); RDF4J (JVM library); Stardog (commercial); AnzoGraph (commercial); Blazegraph (✗ org archived 23 March 2026, Wikimedia migrating off).

**Versioned graph DBs:** **TerminusDB** (Apache-2.0, server-only Docker image, SWI-Prolog + Rust succinct-storage backend, **native git-style branch/diff/merge — the single strongest match for Crosswalker's ethos**, DFRNT stewardship since 2025, v12 December 2025); Dolt (relational, Apache-2.0, instructive prior art).

**Property graphs:** Apache AGE (Apache-2.0, PG 11–18, but Bitnine→SKAI Worldwide pivot away from databases is a long-term concern); Memgraph (BSL/Apache-2.0); NebulaGraph (Apache-2.0); ArangoDB (BSL since 2024); Dgraph (acquired by Istari Digital late 2025); FalkorDB (SSPL, vector+graph hybrid); OrientDB (effectively unmaintained); KuzuDB and forks (✗ upstream archived).

**Embedded analytical:** **DuckDB-WASM** (MIT, ~3.2 MB compressed shell, DuckDB Foundation governance, weekly commits, EH/MVP/COI bundle variants — *the right Tier 2 choice unchanged*); Polars-WASM (alpha, not viable today); DataFusion (Apache-2.0, ~10s of MB in WASM); LanceDB; ClickHouse-local; Velox.

**Vector + graph hybrids:** Weaviate, Qdrant, Milvus (server-only); FalkorDB+vec (SSPL); KuzuDB had vss + HNSW (gone with archive).

**Streaming/IVM:** Materialize (BSL, cloud-only); Differential Dataflow (library); Snowflake Dynamic Tables (proprietary cloud); ksqlDB (Confluent CCL).

**Virtual/federated:** Ontop (Apache-2.0, JVM, SPARQL-over-relational); Trino (JVM); Dremio (JVM/commercial).

**Query unification:** GraphQL gateway (Hasura/PostGraphile compile to SQL/Cypher/SPARQL — useful as a *consumption surface*, not a substitute for the underlying engine); Substrait (cross-engine logical plan IR — long-term play, not yet a runtime).

---

## PART 2 — Architectural questions

### 2a. TerminusDB as Tier 2 or Tier 3 primary

**Verdict: Tier 3 primary for the "team/enterprise" deployment; not Tier 2.**

**Why it matches Crosswalker philosophically:**
- TerminusDB is explicitly a **Git-for-data RDF graph database**: every update is an immutable commit; databases support `clone`, `push`, `pull`, `branch`, `merge`, and time-travel queries — semantics that mirror Crosswalker's "Markdown files in an Obsidian vault are canonical, the database is a derived store" principle. Where Crosswalker's files-canonical layer treats Markdown commits as the source of truth, TerminusDB extends those same semantics down into the query/derivation layer, so a multi-vault distribution scenario can `pull` the canonical crosswalk and rebase local additions.
- Data model is closed-world RDF with JSON-LD documents and a JSON Schema interface (since v10), which matches the SSSOM/SKOS/STRM/OLIR universe Crosswalker bridges. IRIs, XSD datatypes, and named graphs are all native.
- **WOQL** is a Datalog-with-unification query language (with a fluent JS dialect and a functional dialect), and TerminusDB also exposes **GraphQL** with auto-generated schema — giving you both a logic-programming surface (good for SSSOM chain rules) and a familiar developer surface (good for the UI layer). WOQL's `path()`, `triple()`, and unification primitives map cleanly onto crosswalk patterns like "find all controls reachable from NIST 800-53 AC-2 via a chain of skos:exactMatch / skos:closeMatch edges, scored by chain length."
- **License: Apache-2.0.** Maintained by **DFRNT** since 2025 (assumed stewardship from the original Trinity College Dublin team). **TerminusDB v12 shipped December 2025** with rational arithmetic in WOQL, `slice()`/`dot()`/`idgen_random()` operators, native JSON numeric handling across all APIs, no-root Docker images, and improved error handling/security. On-disk format is unchanged from v11, so the upgrade path is smooth.

**Why not Tier 2 (browser/Obsidian):**
- TerminusDB's storage backend is a Rust succinct-data-structures library (`terminusdb-store`), but the **server itself is a Prolog (SWI-Prolog) process plus the Rust storage library**, distributed as a Docker image. There is **no first-class browser/Electron embedding**. The JavaScript and Python clients are remote API clients that talk to a TerminusDB server over HTTP at port 6363; they do not embed the engine.
- Compiling SWI-Prolog to WASM is technically possible (SWI-WASM exists for educational uses) but is not a supported TerminusDB deployment, would be a research project, and the resulting bundle would be far larger than DuckDB-WASM.
- Because of the above, TerminusDB cannot satisfy the "MUST work in Electron/browser context" Tier 2 requirement.

**Trade-offs vs. DuckDB+AGE:**

| Dimension | DuckDB-WASM + AGE (Challenge 10 pick) | DuckDB-WASM (Tier 2) + TerminusDB (Tier 3) |
|---|---|---|
| Tier 2 (browser) | ✅ DuckDB-WASM | ✅ DuckDB-WASM (unchanged) |
| Tier 3 graph traversal | ✅ AGE openCypher | ✅ TerminusDB WOQL + GraphQL + path queries |
| RDF/SSSOM/SKOS native | ❌ AGE has no RDF model | ✅ TerminusDB IS an RDF store |
| Versioning / diff / merge | ❌ AGE has none; bolt-on via Git of dump files | ✅ Native; mirrors files-canonical ethos |
| OWL reasoning / Datalog | ❌ | ⚠️ Partial via WOQL Datalog (no full OWL 2 RL) |
| Postgres ABI risk | ⚠️ AGE was hit by the 17.1 ABI break in Nov 2024 | ✅ No PG dependency |
| Operational complexity | ⚠️ Postgres + AGE extension build chain | ⚠️ Single Docker image, but Prolog/Rust stack is unusual |
| Long-term governance | Apache (AGE), single-vendor sponsor SKAI Worldwide | Apache-2.0 license, single-vendor maintainer DFRNT (2025–) |

**Does WOQL fit GRC crosswalk patterns?** Yes — WOQL's unification semantics, named-graph addressing, `path()` regex over predicate chains, and the ability to embed sub-queries make the SSSOM "if A skos:exactMatch B and B skos:exactMatch C then A skos:exactMatch C" rule trivially expressible. The fact that WOQL stores queries as JSON-LD also means crosswalk derivation rules can be themselves stored as graph documents in the vault. This is a non-trivial advantage.

**Recommendation:** Offer TerminusDB as the **default Tier 3 graph engine for the "team/enterprise" Crosswalker deployment**, with AGE retained as a fallback for environments that already standardize on Postgres and that explicitly do not need versioning. Tier 2 stays DuckDB-WASM.

---

### 2b. Polars-WASM as Tier 1.5

**Verdict: Not yet. Not a credible alternative to DuckDB-WASM as of May 2026.**

The official `@pola-rs/browser` (the `pola-rs/js-polars` repo) is published as **v0.0.1-alpha**, with the README explicitly stating: *"This package is highly experimental and is not meant for production usage. It is provided as-is and may contain bugs or incomplete features. Use at your own risk... significant startup overhead when run in the browser, due in part to the size of the WASM binary, as well as spawning of workers & threadpools."* The most recent meaningful npm publish on that channel is ~3 years old at time of writing, and contributor count is in the single digits.

**Re-evaluate Polars-WASM only if:** (i) `@pola-rs/browser` reaches a 1.0 or stable beta, (ii) the published bundle drops below ~2 MB compressed, and (iii) the JS bindings repo shows a sustained 12-month commit cadence.

---

### 2c. GraphQL as a tier-agnostic query surface

**Recommendation:** Adopt GraphQL as the **public API surface to the Tier 3 engine** (where TerminusDB gives it to you for free), but do **not** force it onto Tier 2 — for the in-Obsidian path, query DuckDB-WASM directly with parameterized SQL.

---

### 2d. CRDT layer for deferred live-edit team mode

**Recommendation:** Default to **Loro** for the deferred live-edit mode. Its event-graph model gives Crosswalker the same conceptual primitive as TerminusDB (a DAG of immutable edits). **Fall back to Yjs** if a specific Obsidian-side editor integration ships first-class Yjs bindings and not Loro. Avoid Automerge as the primary unless you are already invested in automerge-repo's sync infrastructure.

---

### 2e. WASM bundle optimization plan

**Budget target:** keep the *initial* warm-cache load of the Crosswalker plugin under ~1.5 MB compressed.

Concrete plan:
1. Bundle selection at runtime, not at install (use `duckdb.selectBundle()` to pick MVP/EH/COI based on browser caps).
2. Lazy-load DuckDB itself via async accessor; never on plugin bootstrap.
3. Static-serve WASM/worker assets from the plugin bundle, not from jsDelivr (Obsidian plugins must work offline).
4. Lean on extension lazy-loading; don't preinstall community extensions.
5. Brotli compression where supported.
6. Service Worker / Cache API pre-cache on first install.
7. Tree-shaking via ESM imports.
8. Module caching via `instantiateStreaming`.

**Net effect:** plugin bootstraps in <100 KB of JS, with the ~2.5–3 MB DuckDB engine loaded only when a user opens a crosswalk query view.

---

### 2f. LLM / Natural-Language-Query architecture

**Recommended default:** sidecar API (BYOK — bring-your-own-key) + GPT-class model + DuckDB SQL on Tier 2, GraphQL on Tier 3, with WebLLM fallback for offline mode.

**Engine binding (NL-to-Q):** Always target SQL on Tier 2 (most reliable). For Tier 3 graph queries, target the engine's GraphQL surface. Have the engine return introspection. Always show the generated query and let the user edit before execution. Validate before execution.

---

### 2g. Datalog vs recursive CTE for SSSOM chain-rule derivation (engine-context view)

**Verdict: Use Datalog for derivation, SQL for query — and treat them as different lifecycle stages.**

OxO2 pattern (1.16 M input mappings → 49.5 K inferences, ~17 min, ~380 MB RAM on a laptop): **Markdown vault → SSSOM facts → Nemo (Datalog, with chain rules) → derived facts (with provenance) → DuckDB Parquet shard / TerminusDB graph commit.** Then DuckDB-WASM (Tier 2) or TerminusDB GraphQL/WOQL (Tier 3) over the derived facts.

Reasons to prefer Datalog for derivation: termination + soundness + completeness guaranteed for SSSOM chain rules; Datalog rule sets are first-class artifacts; engines come with explanation support.

**Architectural recommendation:** Nemo as canonical derivation engine; DuckDB recursive CTE as Tier 2 fallback for ad-hoc traversals over already-derived facts.

---

## PART 3 — Verification of Challenge 10's empirical claims

### 3a. "KuzuDB archived 10 October 2025" — VERIFIED

The KuzuDB GitHub repository (`kuzudb/kuzu`) was archived on **10 October 2025**, with a notice that "Kuzu is working on something new." Confirmed by The Register (14 October 2025), the FalkorDB migration blog, the Year of the Graph annual recap, and the Kuzu repo itself. PyPI also flagged the archive.

**Fork landscape as of May 2026:**

| Fork | Sponsor / lead | Distinguishing feature | License | Stability |
|---|---|---|---|---|
| **Bighorn** (`Kineviz/bighorn`) | Kineviz (GraphXR vendor) | Embedded + standalone server modes; integrated into GraphXR; ~106 GitHub stars | MIT | Active but small contributor base |
| **Ladybug** | Arun Sharma (ex-Facebook, ex-Google) | Aims to be a *full one-to-one long-term Kuzu replacement*; explicitly committed to "Transparent Governance and Community Leadership"; investor interest reported; G.V() tooling support announced | MIT | Most credible long-term candidate, but <12 months old |
| **RyuGraph** | Akon Dey (former Dgraph CEO) | Part of a larger enterprise data system; "months in the making" before Kuzu was archived | MIT | Active; enterprise-target |
| **Vela-Engineering/kuzu** | Vela Partners | Concurrent multi-writer support added (originals are single-writer); production-tested in Vela's internal multi-agent system | MIT | Single-firm fork; not a community project |

**No fork has the 12+ months of governance stability** that Crosswalker's multi-year compliance horizon requires. **Recommendation: do not bet on KuzuDB or any fork as a Tier 2 primary.** Re-evaluate Ladybug specifically once it has 12 months of consistent releases and at least 3 unrelated commercial users.

### 3b. "DuckDB-WASM ~3.2 MB compressed" — VERIFIED (with nuance)

The 3.2 MB figure originates from the official `duckdb/duckdb-wasm` README. The MVP/EH/COI bundles distribute differently. The 3.2 MB number is for the shell *with extensions*; the lean MVP/EH `.wasm` payload alone is in the 2.5–3 MB compressed range. With deliberate bundle selection, Crosswalker can stay near the 3 MB envelope. DuckDB-WASM continues active development under the DuckDB Foundation.

### 3c. "DuckPGQ extension not yet WASM-friendly" — PARTIALLY CORRECT, EVOLVING

DuckPGQ has matured significantly in 2025: now an official DuckDB community extension since v1.0; DuckDB blog post October 22, 2025. **However**, on the WASM front: not in the list of WASM-supported core extensions; community extensions in WASM require explicit configuration. **Net:** DuckPGQ is a viable Tier 3 (native DuckDB CLI / server) graph-query option *today*, and a Tier 2 candidate *eventually*. Track for the 2026–2027 horizon.

### 3d. "Apache AGE PostgreSQL 11–18 support" — VERIFIED, with health concerns

Apache AGE supports Postgres 11–18 (PG18 added in 2025). **However:** AGE was hit by the PostgreSQL 17.1 ABI break in November 2024. Bitnine Co. (Korean parent) was acquired and renamed **SKAI Worldwide Co., Ltd.** in January 2025, pivoting toward AI advertising/content production while still maintaining graph DB products. The fact that the primary commercial sponsor pivoted away from databases is a meaningful long-term-stability red flag. **AGE is not in immediate danger, but its long-term stewardship is no longer obvious.**

---

## PART 4 — Recommendation, bundle plan, re-decision triggers

### 4c. Recommendation against Challenge 10's call

**Verdict: HYBRID — keep Tier 2 (DuckDB-WASM), replace Tier 3 (drop AGE; adopt TerminusDB as default Tier 3 with AGE as a fallback).**

Rationale, in order of weight:

1. **Versioning is the load-bearing requirement, and AGE has none.** Crosswalker's primary value proposition is durability of a curated dataset over multiple years.
2. **TerminusDB's data model matches the standards landscape natively** (RDF, IRIs, named graphs, OWL-derived JSON Schema, SKOS-friendly).
3. **Governance / commercial-backing risk:** AGE's primary sponsor pivoted away from databases; TerminusDB's stewardship transferred cleanly to DFRNT in 2025.
4. **DuckDB-WASM at Tier 2 is unchanged because nothing better has emerged.**
5. **Datalog (Nemo) lives at the build-pipeline tier, not as a query engine.**

**One-line summary:** *Tier 2 = DuckDB-WASM (unchanged). Tier 3 = TerminusDB by default, AGE as fallback for Postgres-standardized environments. Build pipeline = Nemo Datalog for SSSOM derivation.*

### 4f. Re-decision triggers

Revisit this engine choice if **any one** of the following becomes true:

1. **KuzuDB Ladybug fork ships v1.0 with ≥12 months of consistent releases**, ≥3 unrelated commercial users, and a foundation-style governance commitment.
2. **DuckPGQ becomes a stable, published WASM-loadable extension** with the autoload path documented in DuckDB's official docs.
3. **TerminusDB ships an embeddable Tier 2 build** — either a Rust-only re-implementation of the WOQL query engine that targets WASM, or an SWI-Prolog-WASM build that's small enough to be feasible.
4. **Apache AGE governance changes materially** — either re-foundation under stronger sponsorship or visible signs of decay.
5. **Polars-WASM reaches a stable 1.0** with documented bundle size <2 MB compressed.
6. **A Loro-vs-Yjs architectural divergence emerges** in the Obsidian collaborative editing ecosystem.
7. **Substrait achieves cross-engine plan portability** between DuckDB and a server-tier engine.
8. **A regulatory or compliance shift** demands stronger immutability/attestation primitives than the chosen stack offers.

The decision should otherwise be **stable for 24 months** — leaning on engines with foundation-style governance (DuckDB Foundation) or recently-renewed stewardship (TerminusDB/DFRNT) rather than chasing the bleeding edge.

---

## Appendix — Engines explicitly considered and ruled out

- **OrientDB** — effectively unmaintained; SAP let it lapse.
- **Blazegraph** — entire org archived 23 March 2026; Wikimedia migrating off after T206560 evaluation.
- **Differential Datalog (DDlog)** — VMware-archived, no commits in years.
- **Dgraph** — Dgraph Labs wound down; assets acquired by Istari Digital late 2025.
- **Datomic** — open-sourced under Apache-2.0 in 2023, but JVM-only.
- **RDFox** — technically excellent (Datalog + OWL 2 RL + SPARQL + incremental materialization, Oxford Semantic Tech / Samsung-backed), but **commercial license only**.
- **Materialize** — IVM is cool; but **cloud-only managed SaaS, BSL not OSS**, no self-host. Wrong product shape for files-canonical Crosswalker.
- **Trino / Dremio / Ontop** — virtual federation engines. Out of scope for the canonical engine choice.
- **GraphDB / Stardog / Virtuoso** — production-grade triple stores, all single-vendor-commercial or commercial-friendly licenses.

---

## Follow-up: "Engines that were not listed in the challenge that would fit better?"

After delivering the main report, I went back to hunt for engines that were completely absent from both Challenge 10 and 11's lists.

### Grafeo — The Potential Game-Changer

[Grafeo](https://github.com/grafeo) is a pure-Rust graph database that supports **both LPG and RDF data models** with all major query languages: GQL (ISO 39075), Cypher, Gremlin, GraphQL, SPARQL, and SQL/PGQ. It ships with multi-language bindings including **WebAssembly via wasm-bindgen** — meaning it runs in the browser.

**Why this is seismic for Crosswalker:** The entire rationale for the layered Tier 2 architecture (DuckDB-WASM for SQL + Oxigraph-WASM for SPARQL + Nemo-WASM for Datalog) was that no single engine handles all three workloads. Grafeo potentially collapses all three Tier 2 engines into one:
- SPARQL 1.1 for SSSOM/SKOS/STRM → replaces Oxigraph-WASM
- SQL/PGQ for tabular pivots and graph traversals → replaces DuckDB-WASM + DuckPGQ
- Cypher + GQL for property graph queries → replaces Apache AGE's role
- Vector search (HNSW, cosine/euclidean) built in → future AI features
- Change data capture → audit trail
- Apache-2.0 licensed, 582 GitHub stars, 56 releases, v0.5.41 as of April 2026

Self-published benchmarks: completed SNB Interactive workloads in 2,904ms embedded vs LadybugDB's 5,333ms, using 136 MB vs LadybugDB's 4,890 MB.

**Critical caveats:**
- Only ~6 months old with 582 stars — project health is promising but unproven at multi-year scale
- WASM bundle size unknown (needs empirical verification)
- Self-published benchmarks (not independently validated)
- RDF support is via a `rdf` feature flag — need to verify SPARQL completeness vs Oxigraph

**Verdict:** Grafeo should be added to the Challenge 11 matrix as the highest-priority new evaluation. If its WASM build is viable (~5–8 MB) and its SPARQL implementation passes the W3C test suite, it could replace the entire three-engine Tier 2 stack with a single dependency. **This is the most consequential omission.**

### CozoDB — Datalog + Graph + Vector, Already in WASM

[CozoDB](https://github.com/cozodb/cozo) is a general-purpose, transactional, relational database that uses **Datalog for query**, is embeddable, and focuses on graph data and algorithms. It supports time-travel and HNSW vector search is available on all platforms including in the browser with the WASM backend.

**Why Challenge 11 should have included it:**
- Native Datalog — the exact query paradigm Nemo uses for SSSOM chain rules
- WASM-ready today
- Graph algorithms built in (PageRank, community detection, shortest path)
- Time-travel queries — useful for framework versioning
- Vector search — HNSW integrated within Datalog
- Rust-based, MIT licensed

**Caveats:** Uses CozoScript (its own Datalog dialect); commit cadence has slowed in 2025; no RDF/SPARQL support natively; community is small.

### SurrealDB — Multi-Model with WASM, Well-Funded

SurrealDB supports relational, document, graph, time-series, vector, geospatial, and key-value data models through SurrealQL. It runs in-memory, embedded, edge, WASM, or cloud — same engine everywhere. $38M Series A, 31,000 GitHub stars, 2.3 million downloads, customers include Verizon, Walmart, ING, Nvidia.

**Caveats:** **BSL 1.1 license** — not OSI open source. No SPARQL/RDF. WASM bundle size likely large.

### GraphLite — ISO GQL, Embedded, Rust

[GraphLite](https://crates.io/crates/graphlite) has full implementation of ISO GQL query language, ACID transactions, and Sled-based embedded storage. Announced late November 2025 as "SQLite for graphs" with ISO GQL 2024 support. Very new (v0.1.0), no benchmarks, no WASM build, no RDF/SPARQL, no vector search. Too early for Crosswalker.

### LadybugDB — Kuzu Fork with Shipping WASM

LadybugDB's WASM API enables databases to run inside browsers with in-memory or persistent IDBFS filesystem. **The only Kuzu fork with a documented, shipping WASM build.** Still too young for primary adoption, but the WASM story is real.

### Revised Recommendation

**If Grafeo's WASM build proves viable** (< 8 MB, W3C SPARQL test suite passing):

| Tier | Engine | Role |
|---|---|---|
| 1 | Obsidian vault (Markdown + SSSOM TSV) | Canonical |
| 2 (browser) | **Grafeo-WASM** (single engine: SPARQL + SQL/PGQ + Cypher + GQL + vector) | Unified Tier 2 |
| 2 (derivation) | Nemo-WASM or CozoDB-WASM for SSSOM chain-rule Datalog | Deductive layer |
| 3 (server) | Grafeo-server or Apache AGE + Jena Fuseki | Full-scale |

This collapses three Tier 2 engines into one, dramatically simplifying the architecture.

**If Grafeo's WASM is not ready or fails SPARQL validation:** Fall back to the prior three-engine layered Tier 2 (DuckDB-WASM + Oxigraph-WASM + Nemo-WASM), with SurrealDB as an alternative if BSL license is acceptable.

**New migration triggers to add:**
1. Grafeo reaches v1.0 with independent SPARQL/GQL conformance validation → promote to sole Tier 2 engine
2. CozoDB resumes active development with WASM improvements → evaluate as Nemo replacement
3. SurrealDB relicenses to Apache-2.0 (BSL 4-year conversion) → reconsider as unified engine
4. LadybugDB WASM achieves 12 months of stable releases → reconsider as Tier 2 graph layer

**The bottom line:** Challenge 11's engine list was comprehensive for 2025's landscape but missed the 2026 wave of Rust-native, multi-model, WASM-embeddable engines — particularly Grafeo, which is the closest thing to a "single engine that does everything Crosswalker needs" that currently exists.

This concludes the engine deep survey.
