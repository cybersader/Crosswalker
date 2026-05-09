---
title: "Ch 33: Multi-modal query engine landscape audit (v0.1.7+)"
description: "Fresh-agent research deliverable for Challenge 33. Verdict: REAFFIRM @sqlite.org/sqlite-wasm. Mobile (Capacitor: no SAB, no OPFS sync handles) is the binding constraint, not scale. Engine survey of 16 candidates (DuckDB+DuckPGQ, Polars, Cozo, Oxigraph-WASM, Stardog, RDF4J, Jena/Fuseki, Materialize, Datomic, ClickHouse, LanceDB, TerminusDB, Neo4j, GraphDB, HelixDB, SurrealDB) — none simultaneously satisfy mobile + small WASM bundle + permissive license. Decoupled vector layer (sqlite-vec) survives with known static-link packaging cost. New trigger #6 added: sqlite-vec-wasm packaging stability. Tier 3 reframed: Oxigraph-CLI sidecar > Fuseki for new deployments."
tags: [research, deliverable, substrate, sqlite-wasm, cozo, duckdb, oxigraph, lancedb, mobile, capacitor, ch-33]
date: 2026-05-09
sidebar:
  label: "Ch 33 · Sqlite-wasm REAFFIRMED"
  order: -20260509.3
---

:::tip[Origin and lifecycle]
Fresh-agent research deliverable produced 2026-05-09 in response to [Challenge 33: Multi-modal query engine landscape audit](/crosswalker/agent-context/zz-challenges/33-multi-modal-query-engine-landscape-audit/). Absorbed into the [Ontology-web query engine synthesis log](/crosswalker/agent-context/zz-log/2026-05-07-bases-query-layer-architecture-synthesis/) — see Settled #16 (Tier 3 = Oxigraph + Fuseki) + #18 (mobile binding constraint). Preserved verbatim.
:::

# Crosswalker Challenge 33: Multi-Modal Query Engine Landscape Audit (v0.1.7+)

## TL;DR
- **Stay on `@sqlite.org/sqlite-wasm` for v0.1.7.** No surveyed engine simultaneously satisfies (a) the Obsidian Mobile / Capacitor constraint (no SharedArrayBuffer, no OPFS sync handles, async-only file I/O), (b) a small WASM bundle, and (c) a permissive license. The ontology-web framing changes scale aspirations but does not change the mobile-execution physics that drove the original Tier 2 commitment.
- **The decoupled vector layer (sqlite-vec) survives the re-audit, but with a known packaging cost.** sqlite-vec must be statically compiled into a custom SQLite WASM build (it cannot be dynamically loaded), which means the moment Crosswalker turns on vectors, the substrate stops being stock `@sqlite.org/sqlite-wasm`. This is the single most concrete migration trigger and it shifts *earlier*, not later, under ontology-web framing.
- **For ontology-web scale (UMLS = 3.49M concepts, 17.39M atoms in 2025AB; BioPortal = 1,549 ontologies / 15.3M classes / 100M+ mappings; OBO Foundry = hundreds of ontologies) the realistic answer is server-side / out-of-band, not in-vault.** Crosswalker's in-process query engine should target the "imported slice" (≤1M concepts, ≤500K mappings) — a vault scale at which sqlite-wasm with closure tables (not naive recursive CTEs) is competitive. Full-corpus crosswalking belongs behind an HTTP boundary (BioPortal API, Oxigraph-CLI sidecar, or Fuseki) and is out of scope for v0.1.x.

---

## Key Findings

1. **Mobile is the binding constraint, not scale.** Capacitor's WebKit/WebView on iOS and Android does not expose `SharedArrayBuffer` (Meltdown/Spectre mitigations require COOP/COEP headers that Capacitor's `capacitor://localhost` scheme cannot set). This is documented by Capacitor maintainers and reproduced by multiple Obsidian plugin authors (e.g., obsidian-typst, obsidian-note-linker). Stock `@sqlite.org/sqlite-wasm` requires SAB+OPFS for its high-performance VFS; on Obsidian Mobile it must fall back to in-memory or a non-OPFS VFS. **Every WASM-compiled candidate engine inherits the same constraint.** Therefore the substrate question is not "which engine is fastest" but "which engine degrades acceptably without SAB."

2. **Ontology-web framing reframes scale but not the deliverable.** UMLS 2025AB is 3,488,973 concepts / 17,390,109 atoms / 190 sources. BioPortal (May 2025) hosts 1,549 ontologies (1,182 public) totalling 15,293,440 terms with 100M+ cross-ontology mappings. OBO Foundry hosts hundreds of ontologies, several with 10K+ classes. **None of this fits in browser memory** (WASM32 has a 4GB linear-memory ceiling; mobile WebViews realistically tolerate ≤256–512MB before pressure). Crosswalker's vault must host a *subset* — the user's imported ontologies — not the full ontology web.

3. **The closure-query bottleneck is real but solvable in SQLite.** Recursive CTEs in SQLite (and DuckDB) materialize intermediate routing tables and degrade super-linearly past ~500K nodes. The well-established fix is a **closure table** (every ancestor-descendant pair pre-computed) or **materialized path** column, both of which turn O(depth × fanout) recursive walks into single-index range scans. This is a recipe-schema decision, not an engine decision; it preserves engine-neutrality.

4. **Cozo is the strongest theoretical alternative — and the strongest cautionary tale.** It is the only surveyed engine that natively unifies Datalog + relational + graph + HNSW vectors in a WASM build that runs on phones, with HNSW vector search built into Datalog. But it requires `nothread` + `wasm` features (single-threaded), its WASM bundle is large (RocksDB optional, Sled discouraged), and the project tempo has slowed. Adopting Cozo would replace one vendor risk (sqlite-wasm, Mozilla-Builders-supported sqlite-vec) with another (a smaller-community Rust project).

5. **DuckDB-WASM + DuckPGQ is attractive for analytic workloads, prohibitive for v0.1 mobile.** DuckDB-WASM ships ~3.2MB of compressed WASM for the shell+core extensions, single-threaded by default (multi-threading needs SAB), and core extensions (Parquet, JSON, ICU) are autoloaded over the network. DuckPGQ remains explicitly described by its lead author as "a research project and still a work in progress." This violates the v0.1 mobile-readiness bar.

6. **Oxigraph-WASM is the cleanest "real SPARQL in browser" option but is in-memory only.** Its WASM build disables RocksDB by default; the in-memory `Store` class supports SPARQL 1.1 query/update. Reported memory pressure is severe (a Github issue documents ~60GB RAM to import a ~1GB Turtle dataset on the server build), and benchmarks suggest the WASM build is competitive with Comunica-class JS engines but well below Java triple stores on bulk loads.

7. **Decoupled vector layer (sqlite-vec) decision still holds, but the static-link requirement reframes "decoupled."** sqlite-vec author Alex Garcia explicitly states: "It's not possible to dynamically load a SQLite extension into a WASM build of SQLite. So sqlite-vec must be statically compiled into custom WASM builds." This means turning on vectors in Crosswalker requires forking off `@sqlite.org/sqlite-wasm` to a custom build (the sqlite-vec-wasm-demo NPM package, or an in-house equivalent). The decoupling is logical (separate query primitive, separate index) but **not packaging-decoupled**.

8. **No commercial-OSS engine survives the anti-pattern filter.** Stardog (proprietary; Free is 1-year renewable license, not OSS), Datomic (free since 2023 but Cognitect/Nubank-controlled, server-only, JVM-only), GraphDB (Free has 2-concurrent-query limit and is "commercial \\& free to use," not OSS), Neo4j (GPLv3 Community + commercial Enterprise, with active enforcement against AGPL-removal), HelixDB (AGPLv3 — viral for Crosswalker plugin distribution), SurrealDB (BSL with 4-year delay to Apache 2.0). All are excluded for Crosswalker's anti-patterns 4 (vendor concentration) and/or violate AGPL/license-compatibility for Obsidian plugin distribution.

---

## Details

### SECTION 1 — Engine Survey Matrix (16 engines × 8 dimensions)

| # | Engine | Scale ceiling | Query model | Multi-paradigm | Embedded/WASM | Streaming/OOC | License | Mobile (Capacitor) | Vendor risk |
|---|---|---|---|---|---|---|---|---|---|
| 1 | **DuckDB + DuckPGQ** | Billions of rows on disk; ~10–100M tractable in WASM with OPFS | SQL + SQL/PGQ (SQL:2023), recursive CTEs, USING KEY | Relational + columnar + property-graph extension; vector via community ext | WASM build (~3.2MB compressed shell), single-threaded by default; multi-thread needs SAB | Out-of-core spill native; vectorized push-based pipeline | MIT | **Poor** — multi-threading needs SAB; OPFS works on desktop but not mobile WebView | Low (DuckDB Foundation, broad adoption) |
| 2 | **Polars** | 100M+ rows in memory; sink_parquet for OOC | Polars expression DSL, lazy plan; SQL via context | Columnar/Arrow; not graph; no native vector | Rust+Python+JS; **no production browser WASM build** for full engine | New streaming engine (1.31+) handles >RAM via batch; sink_* writes incrementally | MIT | **Not viable** — no first-class browser/mobile target | Low (Polars team, NL VC-backed) |
| 3 | **Cozo** | OLTP ~1.6M rows at 100K QPS on Mac Mini; OLAP ~1s on similar; mobile-embedded supported | Datalog (CozoScript) | Relational + graph + HNSW vectors + time-travel | WASM build with `wasm + nothread` features; phone-embedded supported; SQLite/RocksDB/in-mem backends | RocksDB backend OOC; in-mem bounded | MPL-2.0 | **Possible** — runs in browser WASM; mobile via React-Native bindings; but COOP/COEP still needed for full perf | **Medium** — small core team, slowed tempo |
| 4 | **Oxigraph-WASM** | In-memory only in WASM (RocksDB disabled); empirically <1M quads comfortable, several M strained | SPARQL 1.1 Query/Update; Federated Query | Pure RDF triple/quad store | Apache-2.0 / MIT Rust→WASM via wasm-bindgen; NPM package; SPARQL 1.2 + RDF 1.2 in 0.5+ | None in WASM (in-memory) | Apache-2.0 / MIT | **Plausible** — pure WASM, no SAB required for in-memory mode | Low (independent maintainer Tpt, used by Wikidata-adjacent projects) |
| 5 | **Stardog** | 50B triples single-node | SPARQL + path queries + GraphQL + virtual graphs | RDF + virtualization + ML | JVM only — server | Disk-backed | **Proprietary** (Free = 1-yr renewable, not OSS) | **Not viable** | **High** — single vendor, paywall |
| 6 | **RDF4J** | Tens of billions of triples (LMDB/Native store); enterprise scale via GraphDB | SPARQL 1.1, SeRQL legacy, SHACL | RDF + SHACL + GeoSPARQL | JVM only — no WASM | Native store paged from disk | EDL 1.0 (Eclipse) | **Not viable** | Low (Eclipse Foundation) |
| 7 | **Apache Jena + Fuseki** | TDB2 to 10B+ triples; Fuseki HTTP | SPARQL 1.1 | RDF + OWL inference + Lucene text | JVM only | TDB2 disk-paged | Apache-2.0 | **Not viable in-process**; viable as sidecar | Low (Apache Foundation) |
| 8 | **Materialize** | Billions of rows; cluster-scale | PostgreSQL-dialect SQL with IVM | Streaming SQL + IVM (differential dataflow) | Server only — Rust binary, K8s | Differential dataflow native | BSL → Apache 2.0 | **Not viable** in-process | Medium (Materialize Inc., commercial-OSS) |
| 9 | **Datomic** | Multi-billion datoms (Nubank: 2.5B txns/day) | Datalog + Pull | Immutable log + indexes; entity-attribute-value | JVM peer/client; **Datomic Local** is Apache-2.0 lib (still JVM) | Disk-backed | Apache-2.0 since 2023, but **JVM-only and Nubank/Cognitect-controlled** | **Not viable** | **Medium-high** — single steward; no browser path |
| 10 | **ClickHouse** | Multi-TB+, embeddings supported via vector_similarity index (BFloat16 quantization) | SQL (ClickHouse dialect) | Columnar OLAP + vectors + text | Server-first; embedded mode emerging (clickhouse-local) but not browser WASM | Disk-backed; multi-TB embeddings | Apache-2.0 | **Not viable** in-process | Low (broad adoption, Apache 2.0) |
| 11 | **LanceDB** | 200M+ vectors in production; billion-scale targeted | Lance SQL subset + vector ops | Lance columnar format + vectors + FTS | Embedded Rust + Python/TS; **no first-class browser WASM** target documented | Disk-based indexes; cloud-native | Apache-2.0 | **Not viable today**; potential future via WASM compilation | Low (Apache 2.0; commercial cloud) |
| 12 | **TerminusDB** | "In-memory graph DBMS" on succinct datastructures + delta encoding (git-for-data); reasonable up to tens of millions of triples | WOQL Datalog + GraphQL + REST | RDF + JSON-LD documents + git-style versioning | **Server only** (Prolog + Rust); no browser WASM | In-memory layered store | Apache-2.0 (since v10); maintained by **DFRNT since 2025** | **Not viable in-process**; possible as sidecar | **Medium** — small steward (DFRNT), narrow community |
| 13 | **Neo4j** | Hundreds of billions of nodes (enterprise) | Cypher / GQL (ISO) | Native property graph | JVM server; no WASM | Disk-backed | **GPLv3** (Community) + commercial Enterprise, with PureThink lawsuit precedent | **Not viable** | **High** — license risk for plugin redistribution |
| 14 | **GraphDB** | Tens of billions of triples (Standard/Enterprise); 50–250M (DBaaS); Free has 2-concurrent-query cap | SPARQL + SHACL + RDF inference | RDF + OWL2-RL | JVM server | Disk-backed | **Commercial-free** (Free is "commercial \\& free", not OSS); SE/EE paid | **Not viable** | **High** — single vendor (Ontotext) |
| 15 | **HelixDB** | Pre-1.0; OLTP graph+vector via LMDB; uses HelixQL | Compiled HelixQL (Gremlin-influenced) | Graph + vector + KV + relational | Rust + Python/TS clients; **no browser WASM** target | LMDB-backed | **AGPLv3** (viral for Crosswalker plugin) | **Not viable** | **High** — pre-1.0, viral license, single startup |
| 16 | **SurrealDB** | Distributed scale; v3.0 includes vector + graph + document + time-series in one ACID transaction | SurrealQL | Document + graph + vector + time-series + KV | Embedded Rust + WASM possible; full feature requires server | TiKV / SurrealKV / RocksDB backends | **BSL 1.1** → Apache 2.0 after 4 years (per release) | Possible technically; **license is non-OSS during BSL window** | **Medium-high** — already rejected per Ch 24 |

### SECTION 2 — Scale × Engine Matrix

| Engine | Small (10K / 5K) | Medium (100K / 50K) | Large (1M / 500K, OLIR-scale) | Ontology-web (10M+, UMLS-scale) |
|---|---|---|---|---|
| **sqlite-wasm (current)** | <50ms/closure with index; trivial | 200–500ms naive recursive CTE; **<50ms with closure table** | 5–30s naive; **100–500ms with closure table** + materialized path; vault DB ~200–500MB | **Breaks** — closure-table size grows quadratically; OPFS quota/perf becomes binding; JS heap pressure; single-threaded |
| **DuckDB-WASM + PGQ** | Trivial; arguably overkill | 50–200ms (vectorized) | 500ms–2s with USING KEY recursive CTE; OOC spill works | Plausible at 1–10M with disk; >10M unreliable in WASM (4GB linear memory cap) |
| **Polars (Node)** | Trivial | Sub-second | Streaming engine handles 1M+ relational; **no native graph closure** — must implement iteratively | Possible for tabular crosswalk export; closure must be hand-rolled |
| **Cozo (WASM)** | Trivial; Datalog magic-set rewrites | 100–500ms | ~1–5s for transitive closure (Datalog semi-naive eval) | Plausible at 1–10M with RocksDB backend on desktop; WASM in-mem bounded |
| **Oxigraph-WASM** | Trivial | Acceptable | Strained at 1M quads in WASM in-mem; SPARQL property paths work | **Not viable** in WASM; native build viable |
| **LanceDB** | Trivial vectors | 100K vectors, no index needed (<100ms brute force per docs) | 1M+ with disk-based index | 200M+ vectors documented in production |
| **ClickHouse** | Overkill | Overkill | Multi-TB embeddings supported with `vector_similarity` index | Native fit; not browser-runnable |
| **Apache Jena/Fuseki** (sidecar) | Overkill | Easy | Easy on JVM | Easy at 100M+ triples on commodity server |
| **GraphDB Free** | Easy | Easy | Easy (Free has no triple cap, only concurrent-query cap of 2) | Tens of billions claimed; license non-OSS |
| **Materialize / Datomic / Stardog / Neo4j / TerminusDB / HelixDB / SurrealDB** | Server-only — N/A in-vault | Server-only | Server-only | Server-only |

**Tier breakpoints:**
- **Small (≤10K concepts):** Every engine works. Decision driven by mobile / packaging, not perf.
- **Medium (≤100K):** sqlite-wasm + closure table is sufficient. Vector becomes the differentiator.
- **Large (≤1M, ~OLIR-scale):** sqlite-wasm + closure table + materialized path is **still sufficient**; DuckDB or Cozo would be 2–5× faster but require migration.
- **Ontology-web (≥10M):** **All in-process WASM engines break.** This tier requires a server-side companion (Fuseki/Oxigraph-CLI/GraphDB) or cloud API (BioPortal). Not v0.1 territory.

### SECTION 3 — Vector Layer + Multi-Modal Composition

**Verdict: keep the decoupled vector layer; accept the static-link cost as a known v0.1.x packaging liability.**

- **sqlite-vec:** Pure C, no deps, 32-bit/8-bit/binary vector types, vec0 virtual table; runs in WASM but **must be statically compiled in**.
- **LanceDB:** No first-class browser WASM.
- **DuckDB + vector extensions:** Compelling but inherits DuckDB's bundle and SAB requirement.
- **ClickHouse + vector_similarity:** Server-side only.
- **Chroma/Qdrant/Faiss-WASM:** Not viable in-process.

### SECTION 4 — Migration Trigger Updates (revised)

| # | Original trigger (Ch 24) | Ontology-web reframe | Urgency |
|---|---|---|---|
| 1 | Vector extension packaging | sqlite-vec must be statically linked into WASM build | **Increased.** When vectors land, fork the WASM build. |
| 2 | WASM bundle size | Stock sqlite-wasm is fine; DuckDB-WASM is too big for v0.1.x | **Unchanged** for sqlite-wasm; **blocker** for DuckDB/Cozo path. |
| 3 | Closure query latency | At ≤1M concepts with closure-table schema, sqlite-wasm is sub-second | **Reduced** for vault-scale; **decisive** for ontology-web (forces sidecar). |
| 4 | Mobile / low-end performance | Mobile constraint hardens | **Increased.** Need explicit mobile-mode query throttle. |
| 5 | Federation requirement | Cross-ontology query at ontology-web scale forces federation | **Increased.** Plan an HTTP/SPARQL federation lane. |

**New trigger surfaced by this audit:**
- **Trigger 6 — sqlite-vec-wasm packaging stability.** Track upstream `sqlite-vec-wasm-demo` package status; if it stagnates, build in-house.

### SECTION 5 — Substrate-Neutral Architecture Verification

The three named primitives (`getConceptsByOntology`, `crosswalkBetween`, `closureFromConcept`) are conceptually substrate-neutral; their *implementations* are not.

**Conclusion:** The primitives are abstractable. The risk is recipe authors writing engine-specific SQL inside recipes. **Recommendation:** lock recipes to a small declarative subset (named primitive calls + JSON-shaped predicates).

### SECTION 6 — Re-audit of Prior Commitments

| Chapter | Original verdict | Ontology-web re-audit | Status |
|---|---|---|---|
| **Ch 10** (graph→tabular bridging) | Junction-table model with closure table | At ontology-web scale, native RDF retains advantages; at vault scale (≤1M), tabular wins on mobile | **REAFFIRMED** for vault scale; **DEFERRED** for ontology-web sidecar |
| **Ch 11** (Tier 2/3 engine survey) | sqlite-wasm Tier 2; Fuseki Tier 3 | Oxigraph-CLI is now stronger as Tier-3 default than Fuseki | **REVISED** |
| **Ch 12** (Datalog vs SQL) | SQL chosen for recipe surface | SQL+CTE good enough at vault scale | **REAFFIRMED** |
| **Ch 14** (missed engines) | (Various adds) | DuckPGQ research; HelixDB AGPL/pre-1.0; Materialize server-only; LanceDB no browser WASM | **REAFFIRMED** |
| **Ch 16** (Tier 3 reconsideration) | Fuseki default | Oxigraph-CLI sidecar is now a peer option | **REVISED** |
| **Ch 18** (Tier 2-lite scope) | Bounded primitives | Strengthens the case for bounded primitives | **REAFFIRMED** |
| **Ch 24** (Turso/libSQL evaluation) | Rejected | Anti-pattern 3 holds | **REAFFIRMED** |

---

## Recommendations (v0.1.7+)

**Stage 1 — v0.1.7 (commit now):**
1. **Stay on `@sqlite.org/sqlite-wasm`.** No substrate change.
2. **Adopt closure-table + materialized-path schema** for the `concept_closure` relation.
3. **Codify the three query primitives** as the only sanctioned recipe entry points.
4. **Defer sqlite-vec to v0.1.8 or v0.1.9.**
5. **Document the mobile constraint explicitly.**

**Stage 2 — v0.1.8 (when triggered):**
6. **When vectors turn on**, fork the WASM build.
7. **Add an Oxigraph-CLI sidecar profile** as an alternative Tier-3 alongside Fuseki.

**Stage 3 — v0.2 (when triggered):**
8. **Add a federation lane** for cross-ontology queries that exceed vault scale.
9. **Re-evaluate Cozo annually.**

**Concrete next actions for v0.1.7 milestone:**
- [ ] Land closure-table migration in `concept_closure` schema; update all three primitives.
- [ ] Add a `MobileMode: \{ maxClosureDepth, maxRowsPerQuery, asyncOnly: true \}` config and enforce in `plugin.queryClosure()`.
- [ ] Add an architecture-decision-record (ADR) titled **"ADR-33: Substrate stays sqlite-wasm; vectors deferred; mobile is the binding constraint."**
- [ ] Add a recipe-lint rule: reject recipes containing raw SQL outside primitive parameters.
- [ ] Add CI step: micro-benchmark `closureFromConcept` on a 100K-concept synthetic vault.

---

## Caveats

- **Mobile constraint sources:** Multiple Obsidian plugin authors and Capacitor maintainers report SharedArrayBuffer unavailable on Capacitor.
- **DuckPGQ status:** Research project / community extension; "the SQL/PGQ syntax requires a `-` at the start of the query when building from source, otherwise you will experience a segmentation fault."
- **Oxigraph WASM memory profile:** The 60GB-RAM-for-1GB-Turtle bug report is for the *server* build with RocksDB.
- **BioPortal/UMLS/OBO scale numbers** are 2025 figures.
- **License risk for plugin redistribution:** Linking AGPL code (HelixDB, some Neo4j components) into a redistributed plugin triggers AGPL obligations.
- **DuckDB recursive CTE performance evidence is mixed.**
- **Datomic Local under Apache 2.0** is interesting but JVM-only.
- **Anti-pattern compliance was strictly applied.**
