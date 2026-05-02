---
title: "Ch 11 deliverable B: Tier 2/3 engine deep survey — layered Tier 2 stack (DuckDB + Oxigraph + Nemo)"
description: "Second fresh-agent run of Challenge 11. Recommends LAYERING (not replacing) Challenge 10's choices: keep DuckDB-WASM as the Tier 2 tabular engine, but pair with Oxigraph (Rust/WASM) for in-browser RDF/SPARQL and Nemo (Rust/WASM Datalog) for SSSOM chain-rule derivation. Apache AGE remains a credible Tier 3 server option. TerminusDB is the best optional Tier 3 versioned backend but cannot serve Tier 2."
tags: [research, deliverable, query-engine, tier-2, tier-3, oxigraph, nemo, duckdb-wasm]
date: 2026-05-02
sidebar:
  label: "Ch 11b: Engine survey"
  order: -20260502.5
---

:::tip[Origin and lifecycle]
Fresh-agent research deliverable produced 2026-05-02 in response to [Challenge 11: Tier 2/3 engine deep survey](/crosswalker/agent-context/zz-challenges/11-tier-2-3-engine-deep-survey/). One of three independent runs (siblings: [deliverable A](/crosswalker/agent-context/zz-research/2026-05-02-challenge-11-deliverable-a-engine-survey/), [deliverable C](/crosswalker/agent-context/zz-research/2026-05-02-challenge-11-deliverable-c-engine-survey/)). Summarized in [05-02 §2.4](/crosswalker/agent-context/zz-log/2026-05-02-direction-research-wave-and-roadmap-reshape/#24-challenge-11--tier-23-engine-deep-survey-3-deliverables). Critical read in [05-02 §3.4](/crosswalker/agent-context/zz-log/2026-05-02-direction-research-wave-and-roadmap-reshape/#34-critical-read-of-ch-11). Preserved verbatim; not edited after publication.
:::

# Crosswalker Challenge 11 — Tier 2/3 Graph + Analytical Engine Deep Survey

## 1. Executive Summary

After surveying 25+ engines spanning Datalog, RDF triple stores, versioned graph DBs, property graphs, embedded analytical engines, vector‑graph hybrids, IVM/streaming systems, and federated/virtual layers, the recommendation is to **layer rather than replace** the Challenge 10 selection: keep **DuckDB‑WASM as the Tier‑2 tabular engine**, but pair it with **Oxigraph (Rust/WASM) for in‑browser RDF/SPARQL/SSSOM/SKOS semantics** and use **Nemo (Rust/WASM Datalog) for SSSOM chain‑rule derivation** — exactly the combination already proven by EMBL‑EBI's OxO2. **Apache AGE** remains a credible optional Tier‑3 server option (it now supports Postgres 11–18). **TerminusDB does not deserve to be Tier 2** because it has no embedded/in‑browser story — it ships only as a Docker server with HTTP clients — but it remains the best **optional Tier‑3 versioned backend** for users who want git‑style branch/diff/merge over the curated crosswalks. Drop the idea of a single monolithic engine; Crosswalker's tier model is naturally suited to a small specialist‑per‑role stack ("DuckDB for tables, Oxigraph for triples, Nemo for rules, optional AGE/TerminusDB for Tier 3"), all of which are Apache‑2.0/MIT and Wasm‑capable today. Defer Polars‑WASM, FalkorDB, TerminusDB‑embedded, and KuzuDB forks to "watch list" status; none meets Crosswalker's stability bar in 2026.

---

## 2. Verification of Challenge 10's Empirical Claims

| Claim | Verdict | Evidence |
|---|---|---|
| **KuzuDB archived 10 Oct 2025** | ✅ Confirmed | The KuzuDB GitHub repo (`kuzudb/kuzu`) was archived on 10 October 2025 with a "Kuzu is working on something new" notice. Reported by *The Register* (14 Oct 2025), Vela Partners, FalkorDB blog, and gdotv year‑in‑review. PyPI page now flags the archive. |
| **"bighorn" community fork (Kineviz)** | ✅ Exists, but small | `Kineviz/bighorn` exists, ~106 stars and 5 forks at time of survey, focused on GraphXR visualization workloads. **Not the only fork:** Vela‑Engineering/kuzu (adds concurrent multi‑writer for AI agents), **LadybugDB** by Arun Sharma, and **RyuGraph** by Akon Dey emerged within a month. None has yet demonstrated 12+ months of stable maintenance, and *The Register* quoted community members noting only ~6 people understand the codebase deeply. **Conclusion: no production‑grade fork has yet stabilized.** |
| **DuckDB‑WASM ~3.2 MB compressed** | ⚠️ Partially correct, depends on build | The duckdb‑wasm README itself states "≈3.2 MB of compressed Wasm files" for the shell demo *with extensions loaded*. Stand‑alone the eh build is ≈6.4 MB unminified; real production payloads run 6–10 MB compressed. **Bottom line: 3.2 MB is a reasonable lower‑bound estimate for a feature‑lean configuration**. Current stable is **DuckDB‑Wasm v1.5.2**. |
| **DuckPGQ extension not yet WASM‑friendly** | ⚠️ Mostly still true (Dec 2025) | DuckPGQ is now a "community extension" loadable via `INSTALL duckpgq FROM community;` since DuckDB v1.0. DuckDB‑WASM gained dynamic extension loading in late 2023. However, the DuckPGQ repo and DuckDB community‑extensions repo have **no documented Wasm build** of `duckpgq`. SQL/PGQ in DuckDB‑WASM remains effectively unavailable in production. |
| **Apache AGE supports Postgres 11–18** | ✅ Confirmed (and current) | Apache AGE README and Quickstart now state "AGE supports Postgres 11, 12, 13, 14, 15, 16, 17 & 18". Bitnine Co. (Korean parent) was acquired in Dec 2024 and renamed SKAI Worldwide; Azure Database for PostgreSQL now ships AGE as a managed extension. |

---

## 3. Engine Evaluation Matrix

Scoring scale: ✓ = strong / native, ◑ = partial / via adapter, ✗ = none, ? = unverified.

(Full matrix evaluates 46 engines across nine axes — Datalog engines, RDF triple stores, versioned graph DBs, property graphs, embedded analytical, vector+graph hybrids, IVM/streaming, virtual/federated, query unification. Highlights:)

- **DuckDB‑WASM (1.5.2)** — ✓ tabular, ✓ browser, ~3–10 MB, MIT — ★ **Tier 2 primary**
- **Oxigraph (0.4+)** — ◑ RDF graph, ✓ SPARQL 1.1/1.2, ✓ npm + WASM, ~3–4 MB est., Apache‑2.0/MIT — ★ **Tier 2 RDF surface**
- **Nemo** (knowsys) — ◑ Datalog over RDF, ✓ official wasm, ~few MB, Apache‑2.0 — ★ **Tier 2 Datalog/derivation**
- **Apache AGE** (PG 11–18) — ✓ openCypher, ✓ Postgres SQL, ✗ server, Apache‑2.0 — credible Tier 3 server option
- **Apache Jena Fuseki** — ✓ RDF, ✓ SPARQL+RDFS/OWL, ✗ JVM server, Apache‑2.0 — Tier 3 SPARQL endpoint
- **TerminusDB v12** — ✓ JSON+RDF graph, ✗ Docker server only, Apache‑2.0, ✓✓ git‑style versioning — **best optional Tier‑3 versioned backend**
- **Soufflé** — ◑ logic, ✗ C++→native — server-only Tier 3 option
- **Datomic Pro** — ✓ EAV/Datalog, ✗ JVM, Apache‑2.0 free since 2023 — JVM-only, Tier 3 candidate
- **CozoDB** — ✓ Datalog graph, ✓ relational, ✓ WASM (no persistence in browser), MPL‑2.0 — slow lately
- **KuzuDB (archived)** — ✓ embedded property graph, ✓ had wasm — **archived 10 Oct 2025**; forks immature
- **Memgraph** — ✓ openCypher — **BSL 1.1**, not OSI‑OSS, disqualifying for some users
- **NebulaGraph** — ✓ distributed, Apache‑2.0 — server-only, no browser story
- **ArangoDB** — ✓ multi‑model, Apache‑2.0 community → **BUSL since 2024**
- **Dgraph** — Apache‑2.0, **acquired by Istari Digital, Oct 2025** — uncertain direction
- **FalkorDB** (RedisGraph fork) — ✓ openCypher, ✓ HNSW vector, **SSPL‑1.0** — active, GraphRAG focus
- **OrientDB** — Apache‑2.0 but **effectively dormant** (SAP)
- **Polars‑WASM** — ✓ joins/groupby/pivots via Pyodide, ◑ Pyodide only, MIT — *highly experimental*, not viable today
- **Materialize** — ✓ SQL IVM, ✗ cloud-only SaaS, **BUSL** — wrong product shape
- **Feldera (DBSP)** — ✓ SQL IVM, ✗ self-hostable, MIT — incremental view maintenance
- **Blazegraph** — ✗ **maintenance only since 2018**, Wikidata migrating off

---

## 4. Per‑Category Narrative Analysis

### 4.1 Datalog engines (high priority for SSSOM chain rules)

**Nemo is the standout** for Crosswalker. It's a Rust‑native, Apache‑2.0 Datalog engine from TU Dresden's Knowledge‑Based Systems group, ships an official browser/wasm build, supports the SPARQL data model natively (RDF/Turtle/N‑Triples/N‑Quads/TriG, plus xsd datatypes, language tags, and SPARQL‑style functions), and has explicit, *verified* termination/soundness/completeness guarantees for plain Datalog. Crucially, Nemo is the engine **EMBL‑EBI selected for OxO2** to derive logically sound SSSOM crosswalks: 1.16 M imported mappings → 49 K inferences in ~17 minutes / ~380 MB on a laptop. **For Crosswalker's SSSOM chain‑rule derivation specifically, Nemo is the right answer.**

**Cozo** is the most appealing single‑engine alternative: a transactional relational/graph/vector store with Datalog as its query language and runs in WASM. Downside: WASM backend is in‑memory only; project has slowed in 2024–2025. **Soufflé** is industry‑grade for static analysis but C++→native only. **Differential Datalog** archived after VMware shed Tala team. **Datomic Pro/Local is now Apache‑2.0 free since 2023** but JVM‑only. **RDFox** is highest‑quality commercial Datalog/OWL‑RL reasoner but proprietary.

### 4.2 Production triple stores (relevant for SSSOM/SKOS/STRM/OLIR)

**Oxigraph is the only realistic in‑browser RDF/SPARQL engine.** Rust + wasm‑bindgen, Apache‑2.0/MIT, ships official `oxigraph` npm package with browser `web.js` entrypoint, supports SPARQL 1.1 Query/Update/Federated Query, parses Turtle/TriG/N‑Triples/N‑Quads/RDF/XML/JSON‑LD, latest releases include preliminary RDF 1.2 / SPARQL 1.2. The WASM build dispenses with RocksDB and uses in‑memory backend. **Limitation: Oxigraph does not implement OWL or SKOS reasoning.**

Among the JVM/server triple stores, **Apache Jena Fuseki** is the obvious Tier‑3 default (Apache‑2.0, mature, supports SPARQL+RDFS/OWL inference). **GraphDB Free** has best OWL reasoning but commercial. **Virtuoso** most powerful but bifurcated licensing. **Blazegraph is in maintenance‑only mode.**

### 4.3 TerminusDB deep dive (answered up front)

**TerminusDB is conceptually the closest match to Crosswalker's "multi‑year curation + branch/diff/merge" ethos**, but its current architecture rules it out as Tier 2. Implemented in **SWI‑Prolog + a Rust storage layer**, distributed only as a Docker server, accessed through HTTP clients. The client library does *not* embed the engine; it merely talks WOQL/GraphQL/REST to a running server on port 6363. **No WASM build of the TerminusDB server itself**, no plan announced.

For Tier 3, TerminusDB is meaningfully better than a year ago: **Apache‑2.0** (relicensed in v4.0 / Dec 2020), **TerminusDB v12 shipped December 2025**, **DFRNT (dfrnt.com) assumed maintenance during 2025**.

### 4.4 KuzuDB and successors

**KuzuDB is archived**; the four community forks (Kineviz/bighorn, Vela‑Engineering/kuzu, LadybugDB, RyuGraph) collectively show the scale of the loss but none has 12+ months of stable governance. *The Register*'s reporting noted the codebase requires deep expertise that few people outside the original team possess.

### 4.5 Embedded analytical engines

**Polars‑WASM is not a viable Tier‑1.5 today.** Pyodide‑only path; new streaming engine doesn't compile; wasm wheel only began building reliably in late 2025. Pyodide+Polars footprint is tens of MB.

**DataFusion has an experimental WASM playground** but no published, supported wasm distribution. **LanceDB** is library/Node bindings. **ClickHouse‑local has no Wasm port**. **Velox is a runtime, not a deployable engine.**

### 4.6 Vector + graph hybrids

For Crosswalker, vector search is a **future enhancement**, not a core requirement. **FalkorDB** has cleanest in‑process story (HNSW, openCypher, GraphBLAS sparse‑matrix engine), published explicit "KuzuDB → FalkorDB" migration guide. **Cozo** is only embeddable Datalog+graph+vector trio with wasm path. **The pg_vector + AGE combo** gives single Tier‑3 service with graph + vector + SQL.

### 4.7 Streaming / IVM

Crosswalker's workload is curated multi‑year crosswalks, **not streaming**. Materialize (BUSL), Feldera/DBSP (MIT, mathematically verified IVM) — both require self‑hosted server processes. **The right takeaway:** "files canonical, derived stores rebuildable" already provides coarse incrementalism. Adopt Datalog (Nemo) for derivation now; revisit IVM only if rebuild times become unbearable.

### 4.8 Virtual / Federated

**Ontop (SPARQL‑over‑relational)** is genuinely interesting — would let Crosswalker expose DuckDB tables as virtual SPARQL endpoint via R2RML/OBDA mappings — but it's a JVM server. Trino/Dremio too heavy.

---

## 5. TerminusDB Deep Dive (dedicated)

| Dimension | Status (Dec 2025–Apr 2026) |
|---|---|
| **Project health** | Apache‑2.0; v12 shipped Dec 2025; **DFRNT (dfrnt.com) took over maintenance during 2025**. Original TerminusDB Inc.'s commercial product (TerminusCMS) appears subsumed by DFRNT Studio. Commit cadence on `terminusdb/terminusdb` and `terminusdb-client-js` is live; community Discord active. Not abandoned, but no longer the well‑funded Irish startup it was in 2020–2022. |
| **Embedded / WASM availability** | **None.** TerminusDB is implemented in SWI‑Prolog + Rust storage, distributed as a Docker image, accessed over HTTP. The `@terminusdb/terminusdb-client` npm package and CDN bundle are *thin REST clients*, not embedded engines. **Cannot run inside an Obsidian plugin.** |
| **WOQL** | A Datalog‑variant query language with native unification, path queries, and dictionary/document templates. v12 hardened it: high‑precision rationals, normalized `xsd:decimal`, new `slice()`, `xdd:json` typecasting, `idgen_random()`. WOQL is more expressive than SPARQL for graph traversals and competitive with Cypher. GraphQL provided as friendlier surface. |
| **Diff/merge semantics** | TerminusDB's strongest feature: succinct‑data‑structure delta encoding gives true commit DAGs, three‑way merge, push/pull/clone, time‑travel queries on any commit. Versioning at the *fact* level. Robust for small/medium teams. |
| **License** | **Apache‑2.0** since v4.0 (Dec 2020). |
| **Performance ceiling** | In‑memory + succinct on‑disk; tens of millions of triples comfortably; billions possible with sufficient RAM. |

**Verdict:** TerminusDB **does not deserve to be Tier 2** because there is no embedded path. It is the **best optional Tier‑3 versioned backend** for users who want git‑style branch/diff/merge over crosswalks. Document as recommended Tier‑3 option alongside Apache AGE/Postgres.

---

## 6. Architectural Pattern Analysis

### 6.1 TerminusDB‑as‑Tier‑2 vs Tier‑3 primary
Tier 2 impossible (no Wasm, SWI‑Prolog server). Tier 3 excellent but optional. Bake **Apache AGE** in as default Tier 3; document **TerminusDB as alternative Tier 3**.

### 6.2 Polars‑WASM as Tier 1.5
**Defer.** Pyodide‑only path, streaming engine doesn't compile, footprint tens of MB. Re‑evaluate when Polars publishes first‑class `wasm32‑unknown‑unknown` build with streaming engine.

### 6.3 GraphQL gateway as tier‑agnostic query surface
**Promising for Tier 3, optional for Tier 2.** Most valuable as uniform Tier‑3 API abstracting whether backend is AGE‑on‑Postgres or TerminusDB.

### 6.4 CRDT layer for live‑edit team mode
| Library | Bundle (gzipped) | Conflict model | Notes |
|---|---|---|---|
| **Yjs** | ~10–30 KB | RGA+YATA, CRDT shared types | Smallest, fastest, mature ecosystem |
| **Automerge** | ~150–300 KB+ | JSON‑model CRDT, full DAG history | Larger, more general |
| **Loro** | ~200–400 KB | Replayable Event Graph; Fugue for text | Authors warn against production use |

**Yjs is the right default.**

### 6.5 WASM bundle optimization strategies
1. Pick the EH build (single‑threaded), not threaded build
2. Lazy‑load by tier
3. Brotli pre‑compression + Cache‑Control: immutable
4. Lazy extension loading for DuckDB
5. Disable RocksDB in Oxigraph (default)
6. Tree‑shake Nemo's wasm
7. Compress on disk
8. Defer worker spawn
9. Code‑splitting at route level
10. Monitor bundle size in CI (5 MB initial / 25 MB total budget)

### 6.6 LLM / NL‑query architecture
Sidecar API (Tier 3 or sidecar process). Validates SQL/SPARQL/Cypher against engine before execution. **Don't unify around GraphQL for the LLM** — empirical evidence: LLMs best at most popular language (SQL).

### 6.7 Datalog vs recursive CTE for SSSOM chain‑rule derivation
**OxO2 numbers prove the answer:** 1.16 M mappings → 49 K inferences in 17 min on a laptop, 380 MB RAM. **Datalog (Nemo) wins**: termination/soundness/completeness mathematically guaranteed; polynomial time/space; expressiveness; provenance via tracing. **Ship Nemo. Use DuckDB recursive CTEs only for ad‑hoc transitive closures.**

---

## 7. Final Recommendation: **(c) layer + (d) hybrid**

**Tier 1 (canonical):** Markdown + frontmatter on disk. Unchanged.

**Tier 2 (in‑Obsidian Wasm engines, run in‑process):**
- **DuckDB‑WASM** for tabular SQL — *keep from Challenge 10*.
- **Oxigraph (Wasm)** for RDF / SPARQL 1.1 / SKOS / SSSOM / OLIR — *new in Challenge 11*. ~3–4 MB Wasm.
- **Nemo (Wasm)** for SSSOM chain‑rule derivation — *new in Challenge 11*. Apache‑2.0, proven by OxO2.
- *Defer*: Apache AGE (server‑only), DuckPGQ (no Wasm yet), Cozo (no in‑browser persistence), KuzuDB and forks (stability unproven), Polars‑WASM (Pyodide path immature).

**Tier 3 (optional self‑hosted server, OSS only):**
- **Default: Apache AGE on Postgres 11–18** with **pgvector**.
- **Alternative: TerminusDB v12** for git‑style branch/diff/merge.
- **Optional sidecar: Apache Jena Fuseki** if SPARQL endpoint with RDFS/OWL inference required.

**Reasoning for layered/hybrid choice:** Pure (a) "keep DuckDB+AGE" leaves SSSOM/SKOS/RDF unaddressed in Tier 2. Pure (b) "replace" throws away DuckDB's mature ecosystem. (c+d) layer + hybrid Tier 3 addresses every workload Crosswalker actually has, uses only Apache‑2.0/MIT components, costs <15 MB total Wasm.

---

## 8. Bundle Size Strategy

**Total budget target: ≤ 12 MB compressed shipped on first‑run; ≤ 4 MB minimum to load the plugin shell.**

| Component | Compressed |
|---|---|
| Plugin shell | 100–200 KB |
| **DuckDB‑WASM core** (lazy) | ~3 MB |
| DuckDB extensions (lazy) | 0.3–1 MB each, on demand |
| **Oxigraph WASM** (lazy) | ~3 MB est. |
| **Nemo WASM** (lazy) | ~3–4 MB est. |
| Yjs (optional) | ~30 KB |
| **Total cold start** | ~200 KB |
| **Total typical use** | ~3.2 MB |
| **Total worst case** | ~10–12 MB |

---

## 9. Re‑Decision Triggers (When to Revisit)

Schedule a Challenge 11.1 review when *any* of:

1. A KuzuDB fork demonstrates 12+ months of stable governance (LadybugDB or Vela‑Engineering/kuzu most likely)
2. TerminusDB lands a wasm32 build of the server (extremely unlikely)
3. Oxigraph adds OWL RL or SHACL inference (currently a stated non‑goal)
4. DuckPGQ ships a WASM build
5. Polars publishes non‑Pyodide `wasm32‑unknown‑unknown` build with streaming engine
6. Loro or Automerge production‑grade Wasm build hits 1.0 with bundle size ≤ Yjs
7. RDFox or Stardog Wasm port (very unlikely commercially)
8. Apache AGE drops Postgres 11–13 support or governance changes materially
9. NIST or SCF officially adopts SSSOM/OLIR with reference implementation different from Nemo
10. Browser bundle budgets shift

---

## 10. Open Questions / Further Work

1. Confirm Nemo's RDF I/O is byte‑compatible with Oxigraph's
2. Empirically test Wasm threading in Obsidian (COOP/COEP)
3. Investigate persistent Oxigraph in browser (OPFS/IndexedDB)
4. Build actual `nemo-wasm` artifact with required feature flags and measure compressed payload
5. Document AGE↔TerminusDB migration path
6. GraphQL schema design for federated Tier 3
7. Provenance representation: does Nemo's trace JSON map to SSSOM `mapping_justification`?
8. Substrait adoption tracking
9. Verify "≈3.2 MB" claim against Crosswalker‑specific feature subset
10. Engage with DFRNT on TerminusDB roadmap
