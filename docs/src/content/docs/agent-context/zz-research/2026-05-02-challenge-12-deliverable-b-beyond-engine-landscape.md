---
title: "Ch 12 deliverable B: Beyond the known engine landscape — long-horizon directions"
description: "Fresh-agent research deliverable that expanded well beyond Challenge 12's narrow Datalog-vs-SQL scope into a long-horizon architectural survey. Identifies engines absent from Challenges 10/11 (Stoolap, Minigraf, HelixDB, Comunica, sqlite-vec, cr-sqlite, Ascent, Percival, declarative-dataflow, Feldera/DBSP), proposes LinkML as canonical schema substrate (auto-generates JSON Schema, OWL, SHACL, Pydantic, TypeScript), proposes IPLD content-addressed crosswalk distribution, and proposes a Tier 1.5 compilation pipeline producing Parquet/HDT/JSON-LD/OSCAL/IPLD-CAR artifacts."
tags: [research, deliverable, architecture, linkml, ipld, datalog, sssom, long-horizon]
date: 2026-05-02
sidebar:
  label: "Ch 12b: Beyond engine landscape"
  order: -20260502.8
---

:::tip[Origin and lifecycle]
Fresh-agent research deliverable produced 2026-05-02 in response to [Challenge 12](/crosswalker/agent-context/zz-challenges/12-datalog-vs-sql-sssom-chain-rules/) but expanded far beyond the brief's narrow Datalog-vs-SQL scope into long-horizon architectural ideas. Summarized in [05-02 §2.5](/crosswalker/agent-context/zz-log/2026-05-02-direction-research-wave-and-roadmap-reshape/#25-challenge-12--datalog-vs-sql-for-sssom-chain-rules-2-deliverables); long-horizon ideas catalogued in [05-02 §10](/crosswalker/agent-context/zz-log/2026-05-02-direction-research-wave-and-roadmap-reshape/#10-long-horizon-ideas-considered-not-committed). Companion focused report at [Ch 12 deliverable A](/crosswalker/agent-context/zz-research/2026-05-02-challenge-12-deliverable-a-datalog-vs-sql/). Preserved verbatim; not edited after publication.
:::

# Challenge 12 — Beyond the Known Engine Landscape

A long-horizon, deliberately non-conservative survey for the Crosswalker project. The goal of this report is not to pick a single "best" engine, but to (a) extend the candidate set with engines and standards previous challenges missed, (b) interrogate the architectural premises of the three-tier model, and (c) propose a 5+ year direction for the project that treats crosswalks as a first-class object — versioned, federated, collaborative, and machine-reasoned — rather than as rows in a database.

I could not retrieve `https://cybersader.github.io/crosswalker/agent-context/zz-challenges/11-tier-2-3-engine-deep-survey/` directly (the platform restricts fetching arbitrary URLs not surfaced by search), so the analysis below is anchored on the framing in the task description (Tier 1 = Obsidian/Markdown + SSSOM TSV, Tier 2 = browser/WASM, Tier 3 = server) plus the previously-considered engine list (DuckDB-WASM, Oxigraph-WASM, Nemo-WASM, Apache AGE, Kuzu, Neo4j, Jena Fuseki, TypeDB, TerminusDB, Grafeo, CozoDB, SurrealDB, GraphLite, LadybugDB).

---

## 1. Newly Discovered Engines

The following engines appear absent from Challenges 10/11 and the follow-up. Each is evaluated against four Crosswalker-specific criteria: (1) WASM/browser feasibility, (2) data-model fit for SSSOM-shaped mapping triples plus rich provenance, (3) recursive/transitive-closure ("cross-walking") capability, and (4) operational complexity at Tier 1 (round-trip with TSV/Markdown).

### 1.1 Embedded Rust databases with fresh WASM stories

**Stoolap** (https://stoolap.io/, https://github.com/stoolap/stoolap). Pure-Rust embedded SQL engine with MVCC, HNSW vector indexes, time-travel (`AS OF`), `WITH RECURSIVE`, and a first-party WebAssembly target with an in-browser playground (~6 MB). It is one of the few embedded engines that bundles vector search + recursive CTEs + WASM + Apache-2.0 in a single binary. *Fit:* Very strong Tier-2 candidate if the project standardizes on a relational+vector view of SSSOM rows; recursive CTEs cover the most common "walk N hops across mappings" query. *Caveats:* Not a triple/graph store; you encode the LPG manually, like simple-graph.

**HelixDB** (https://www.helix-db.com/, https://github.com/HelixDB/helix-db). Native graph + vector database written in Rust on LMDB, with a strongly-typed compiled query language **HelixQL** and built-in MCP support so LLM agents can traverse the graph. Y Combinator-funded, AGPL. Marketing claims billions of queries executed and benchmarks beating "industry leading competitors" — treat the comparative claims as vendor-reported. *Fit:* Interesting Tier-3 option for AI-assisted crosswalk generation because of the integrated vector + graph + MCP triad, which collapses three layers Crosswalker would otherwise stitch together. WASM is not a first-class target today; LMDB-on-WASM is non-trivial.

**Minigraf 1.0** (https://github.com/project-minigraf/minigraf, https://dev.to/adityamukho/minigraf-10-an-embedded-bi-temporal-datalog-database-in-rust-4bg5). Released as a single-file embedded graph DB in Rust, Datalog query language, and **bi-temporal semantics** (transaction time + valid time) inspired by Datomic/XTDB. Ships native + browser WASM (`wasm32-unknown-unknown`) + WASI (`wasm32-wasip1`) + UniFFI for Kotlin/Swift. *Fit:* This is the single most interesting find for Crosswalker. SSSOM mappings are inherently temporal (mapping_date, predicate_modifier, replaces) and bi-temporal Datalog is exactly the missing ingredient for "what was our mapping between NIST CSF 2.0 and ISO 27002 on 2025-Q3 audit cut-off?" queries. Recommend serious evaluation as Tier-2 default. Note the project is new (1.0); long-term maintenance risk should be weighed.

**SurrealDB WASM** (https://github.com/surrealdb/surrealdb.wasm, https://surrealdb.com/docs/sdk/javascript/engines/wasm, https://surrealdb.com/features). The full SurrealDB engine compiles to WASM and runs in the browser with IndexedDB persistence (`indxdb://`) or in-memory (`mem://`); the same SurrealQL works embedded, on edge, or in cluster. Recent feature work explicitly markets bi-temporal queries (`VERSION` clause, `VALID ALL`, `OVERLAPS`, change feeds, fork-by-metadata branching). *Fit:* Strong multi-model option (graph + document + relational + vector) with the same query language across tiers, which directly attacks the Tier-2/Tier-3 impedance mismatch. Operational footprint is heavier than Minigraf or simple-graph.

**IndraDB** (https://github.com/indradb/indradb). TAO-inspired Rust graph DB with pluggable datastores (in-memory, RocksDB, Sled, Postgres) and gRPC server. Not a WASM target today. *Fit:* Tier-3 only; mostly subsumed by Kuzu and HelixDB for our purposes.

**Stoolap, Minigraf, HelixDB, SurrealDB** all converged on a single observation: in 2026 the embedded-Rust-DB-with-WASM market is genuinely crowded, and most of them now ship their own vector index. That is a meaningful change since the original Crosswalker engine survey.

### 1.2 Datalog engines beyond Nemo and CozoDB

**Soufflé** (https://souffle-lang.github.io/, https://github.com/souffle-lang/souffle). The reference high-performance Datalog engine, compiles Datalog to parallel C++. No first-class WASM target — its compile-to-C++ model is incompatible with browser deployment, though Soufflé-as-CLI behind a server is a viable Tier-3 option. Strong subsumption + algebraic data types make it the best engine for *static-analysis-style* crosswalk reasoning if you ever need to compile rules into a deployable artifact.

**Ascent** (https://github.com/s-arash/ascent, discussion: https://github.com/s-arash/ascent/discussions/72). Datalog as a Rust *macro* — `ascent! { … }` produces a compiled Rust struct. Because the output is plain Rust, it compiles to `wasm32-unknown-unknown` for free. Ergonomics for ADTs and indexes are reportedly better than Soufflé. *Fit:* Excellent Tier-2 option if your crosswalk rules are largely static (ship a precompiled WASM blob with the app); the limitation is that rules are Rust source, not data.

**Crepe** (https://github.com/ekzhang/crepe). Similar idea to Ascent (Datalog as Rust macros), authored by Eric Zhang. Same WASM portability story.

**Percival** (https://github.com/ekzhang/percival, https://percival.ink/). Web-based reactive Datalog notebook. The Percival compiler is Rust→WebAssembly via wasm-bindgen, and it transpiles Datalog code-cells into JS executed in sandboxed Web Workers. *Fit:* Direct prior art for "Datalog in the browser, reactive, multi-cell" — exactly the model a live crosswalk editor would want. Worth forking/inspiring rather than adopting wholesale.

**Differential Dataflow + DDlog** (https://github.com/TimelyDataflow/differential-dataflow, https://github.com/vmware-archive/differential-datalog, archived). The gold-standard for *incremental* Datalog: rules are compiled once, then react to streaming input deltas. DDlog itself is archived, but a community port to wasm exists (https://gitlab.com/ddlog/differential-datalog-kixiron/-/tree/wasm-works). The newer **declarative-dataflow** (https://github.com/comnik/declarative-dataflow) provides a runtime Datalog→differential-dataflow compiler with WebSocket support. *Fit:* The right substrate if Crosswalker treats crosswalks as a *live materialized view* over Markdown notes — every save in Obsidian triggers a delta, and downstream views (coverage matrices, gap reports, Sankey diagrams) update in O(change), not O(graph).

**FlowLog** (https://arxiv.org/html/2511.00865, Nov 2025). New academic incremental Datalog engine extending Soufflé's optimizations with first-class incrementality. No WASM yet, but worth tracking as a future Tier-3.

**egglog** (https://github.com/egraphs-good/egglog). Datalog + e-graph rewriting. Not directly relevant for crosswalks but interesting for *crosswalk normalization* — if two analysts encode the same equivalence in different ways, egglog can canonicalize them.

### 1.3 RDF / SPARQL engines beyond Oxigraph

**Comunica** (https://comunica.dev/, https://github.com/comunica/comunica, npm: `@comunica/query-sparql`, `@comunica/query-sparql-rdfjs`). Modular SPARQL meta-engine in TypeScript, runs in browser, Deno, and Node, queries any RDF/JS Source (in-memory, federated, Linked Data Fragments). *Fit:* The single biggest gap in the previous survey. Comunica + an RDF/JS in-memory store delivers full SPARQL 1.1 in the browser without WASM and without compiling Oxigraph, with a much smaller bundle. This is arguably a better Tier-2 default than Oxigraph-WASM for read-heavy SPARQL.

**N3.js** (https://github.com/rdfjs/N3.js, npm: `n3`). The de-facto in-memory RDF store and Turtle/N-Triples/N-Quads parser for JavaScript. No SPARQL on its own, but pairs with Comunica to provide it.

**Quadstore** (https://github.com/quadstorejs/quadstore, npm: `quadstore`). LevelDB-backed RDF/JS store for Node, Deno, and browsers. Implements RDF/JS Source/Sink/Store. SPARQL via `quadstore-comunica`. *Fit:* Useful when the in-memory N3 store overflows browser RAM; LevelDB-on-IndexedDB persistence works in the browser today.

**Sophia** (https://github.com/pchampin/sophia_rs, https://crates.io/crates/sophia). Rust toolkit for RDF and Linked Data, modular like Comunica but in Rust. Has an experimental SPARQL engine. Compiles cleanly to WASM. *Fit:* If Crosswalker wants a single-language Rust+WASM stack, Sophia is the natural alternative to Oxigraph for the "library, not database" pattern.

**rdf-ext** (https://github.com/rdf-ext) and **graphy.js** (https://graphy.link/). RDF/JS ecosystem libraries for parsing, serialization, and dataset operations. Useful at Tier-2 for ETL between SSSOM TSV and RDF.

### 1.4 SQLite-based graph and CRDT extensions

**simple-graph** (https://github.com/dpapathanasiou/simple-graph). The original "SQLite as a graph DB" — JSON nodes, ID-pair edges, recursive CTE traversal templates. Trivially runs under sql.js or `wa-sqlite` in the browser. *Fit:* The pragmatic counter-design to a full graph engine; pairs naturally with SSSOM TSV import.

**sqlite-graph** (https://github.com/agentflare-ai/sqlite-graph). SQLite extension implementing actual Cypher (`cypher_execute`) on a virtual table. Loaded via `enable_load_extension`. C extensions are harder to ship to WASM than pure SQL templates but it is feasible (sqlite-vec has done it).

**sqlite-vec** (https://github.com/asg017/sqlite-vec). Pure-C, runs in the browser via wa-sqlite. Adds vector search to SQLite. *Fit:* Critical if Crosswalker wants embedding-based mapping suggestions at Tier-2 without a separate vector DB.

**cr-sqlite** (https://github.com/vlcn-io/cr-sqlite, https://www.vlcn.io/docs/cr-sqlite/intro). "Convergent, Replicated SQLite": a runtime-loadable extension and Rust crate that turns ordinary SQLite tables into CRDTs (LWW, counter, fractional-index, peritext). Has a WASM build for the browser (https://github.com/vlcn-io/js). *Fit:* Direct path to **multi-analyst collaborative crosswalk editing** without a server. Two Obsidian vaults editing the same SSSOM table can converge automatically.

**sqlite-crdt** (https://github.com/awmuncy/sqlite-crdt) and James Long's CRDT example. Lighter-weight, browser-only, depends on `@jlongster/sql.js`.

### 1.5 JS/TS-native graph and RDF stores

**LevelGraph** (legacy, https://github.com/levelgraph/levelgraph). Hexastore over LevelDB. Largely superseded by Quadstore for new work, but the navigation-style API is still pleasant.

**GUN** (https://github.com/amark/gun). Graph CRDT in JavaScript with WebRTC peer-to-peer networking; explicitly listed alongside Yjs/Automerge as a mature CRDT implementation (https://crdt.tech/implementations). *Fit:* If Crosswalker ever wants federated crosswalks without any central server, GUN is the most battle-tested P2P graph DB in JS. The trade-off is GUN's data model is opinionated (recursive JSON, soul IDs) and it does not natively speak SPARQL or Cypher.

**OrbitDB** (https://github.com/orbitdb/orbitdb). IPFS-backed peer-to-peer database with multiple log/key-value/document stores. *Fit:* If you want crosswalks to be content-addressed (see §3) and natively distributed, OrbitDB is the off-the-shelf option.

### 1.6 CRDT/local-first frameworks (not databases per se, but architectural primitives)

**Yjs** (https://yjs.dev, https://github.com/yjs/yjs, https://docs.yjs.dev/) — the most-deployed CRDT framework on the web (~900k weekly downloads, used by Proton Docs, Evernote, JupyterLab). Y.Map and Y.Array shared types are an obvious fit for SSSOM rows; an AT-Protocol provider exists for Bluesky-style federated sync.

**Automerge** (https://automerge.org, https://github.com/automerge/automerge, plus `automerge-repo`). JSON CRDT in Rust with WASM JS bindings. Better than Yjs for *structured* documents; Yjs is better for collaborative *text*.

**Diamond Types** (https://github.com/josephg/diamond-types). Plain-text CRDT, fastest in benchmarks. Useful inside Markdown notes themselves.

### 1.7 Other notable adjacent engines

- **Apache Arrow / Parquet** (https://arrow.apache.org/, https://parquet.apache.org/) for columnar storage of crosswalk fact tables. DuckDB-WASM already reads Parquet directly; pairing SSSOM-as-Parquet with DuckDB-WASM is a practical Tier-2 option.
- **Apache Datafusion** (https://datafusion.apache.org/) — Rust SQL query engine that reads Arrow/Parquet, compiles to WASM. Lighter than DuckDB for read-only crosswalk views.
- **Polars** (https://pola.rs/) — Rust dataframe library; not a database, but its lazy query engine on Parquet is competitive with DuckDB for crosswalk-shaped joins. WASM build exists (https://github.com/pola-rs/polars/issues/8482).
- **Stardog** (https://www.stardog.com/) and **GraphDB** (https://graphdb.ontotext.com/) — commercial Tier-3 RDF+OWL reasoners. Worth listing because they implement OWL 2 RL and SHACL natively, which Oxigraph and Jena Fuseki community editions partially miss.
- **RDFox** (https://www.oxfordsemantic.tech/product) — high-performance proprietary RDF + Datalog reasoner. Best-in-class for materialization at scale; closed source.

---

## 2. Challenging the Architectural Premises

The previous challenges adopted a three-tier file → browser → server model. The following are concrete alternatives worth weighing.

### 2.1 Do you even need a database at Tier 2?

**Likely no, for Crosswalker's actual workload.** SSSOM mapping sets are small: even a pessimistic estimate of every NIST CSF 2.0, ISO 27001/2, CIS v8, MITRE ATT&CK, NIST 800-53r5, PCI DSS v4, HIPAA, SOC 2, CMMC 2.0, GDPR, and FedRAMP control mapped to SCF (1,400 controls × 200 frameworks × ~5 predicates per pair) is on the order of 10⁶ rows — tens of MB uncompressed, single-digit MB Parquet/Zstd. That fits in browser memory.

A leaner Tier-2 stack would therefore be:

1. **In-memory store**: N3.Store (RDF view) *or* an Arrow/Parquet table loaded once.
2. **Query/reason layer**: Comunica (SPARQL), or Ascent/Crepe-compiled-to-WASM (Datalog), or DuckDB-WASM (SQL with `WITH RECURSIVE`).
3. **Index layer**: a small TypeScript hexastore + sqlite-vec for embeddings.

This eliminates the impedance mismatch of "embed a database in WASM that re-implements an OS storage layer in IndexedDB." It also gets *much* faster cold-start times (Comunica + N3 is ~200 KB gzipped vs. 6+ MB for Oxigraph-WASM or DuckDB-WASM).

### 2.2 Is three tiers optimal? — argue for **two-and-a-half**

A defensible alternative architecture:

- **Tier 1 (Authoring)**: Obsidian vault with Markdown + SSSOM TSV; cr-sqlite or Yjs for collaborative edit sessions; Git for permanent history.
- **Tier 1.5 (Compile)**: a *crosswalk compiler* (a Rust CLI) that turns SSSOM TSV + Markdown frontmatter into pre-indexed artifacts: Parquet for SQL, N-Quads + HDT for SPARQL, IPLD/CAR for content-addressed export, an Ascent-compiled Datalog WASM blob for derived rules.
- **Tier 2 (Read/query)**: Browser loads only the artifact it needs. Editing happens locally; sync happens via Yjs/cr-sqlite/Git, not via a database server.
- **Tier 3 (optional)**: Only required for *cross-organization federation* — querying across multiple repositories of crosswalks belonging to different vendors/agencies. This is best implemented as Comunica federated SPARQL or Linked Data Fragments, not a centralized server.

The pivot here is: the canonical tier is not a database, it's a *compiler pipeline* that produces multiple consumable artifacts.

### 2.3 Should crosswalks be stored as RDF at all?

The original SSSOM authors made a deliberate trade-off: *TSV first, RDF as one of several views*. The SSSOM schema is managed in **LinkML** (https://linkml.io, https://github.com/linkml/linkml), and LinkML auto-generates JSON Schema, ShEx, SHACL, OWL, Python dataclasses, and Pydantic models from a single YAML source (https://academic.oup.com/database/article/doi/10.1093/database/baac035/6591806). This is the correct precedent: **LinkML, not RDF, is the source of truth** — RDF, JSON-LD, and property graphs are projections.

Concretely:
- The native projection for SQL/Parquet/DuckDB consumers is the SSSOM TSV with curie_map.
- The native projection for SPARQL/Oxigraph consumers is RDF Turtle.
- The native projection for Cypher/Kuzu/HelixDB consumers is a property graph with `subject_id`, `predicate_id`, `object_id` as edge labels and the rest as edge properties.
- The native projection for FHIR-flavored health systems is `ConceptMap` (https://www.hl7.org/fhir/conceptmap.html).

LinkML lets all four projections come from one schema. Crosswalker should commit to LinkML as the meta-format and treat every engine choice as a serializer/deserializer plugin.

### 2.4 Reactive/incremental computation

This is one of the clearest wins. Live crosswalk editing is naturally a streaming workload: an analyst adds one mapping in Obsidian, and seventeen downstream artifacts (coverage matrix for SOC 2, gap report against NIS2, MITRE ATT&CK Navigator JSON layer, HITRUST harmonization spreadsheet) need to update *partially*, not be rebuilt from scratch.

**Recommendation**: Adopt a Differential-Dataflow / Materialize-style execution model for derived views. The realistic substrate is **declarative-dataflow** (https://github.com/comnik/declarative-dataflow), the Materialize OSS engine's `materialized` (https://materialize.com/), or **Feldera** (https://www.feldera.com/, https://github.com/feldera/feldera) — Feldera is the spiritual successor to DDlog from many of the same authors and ships incremental SQL today. None of these run in the browser yet, but Feldera's underlying DBSP is a Rust crate (https://crates.io/crates/dbsp) that *should* compile to WASM with effort.

### 2.5 LLM-native components

Crosswalk generation is now demonstrably an LLM-tractable task. State-of-the-art ontology-alignment systems on the **OAEI 2025 Bio-ML track** combine LogMap + LLM-Oracle (https://arxiv.org/pdf/2508.08500, accepted EACL 2026) and **GenOM** (https://arxiv.org/html/2508.10703) — using LLMs for definition generation, embedding-based retrieval, and equivalence judgment — to outperform pure symbolic baselines by 5–16% F1 on biomedical alignments. The same pattern transfers to GRC frameworks (NIST CSF ↔ ISO 27001 ↔ CIS) where control statements are short, semantically rich English.

A concrete LLM-native architectural slot for Crosswalker:

- **Online "suggest next mapping"**: at edit time, vector-search nearest unmapped controls (sqlite-vec + a small embedding model) and render top-K candidates with confidence + rationale. The output is *suggestions* with `mapping_justification` and `confidence` fields, *committed by humans* into SSSOM rows.
- **Offline harmonization**: nightly batch run that uses the LogMap-LLM pattern to find missing mappings transitively (if A→B and B→C are exact and the LLM agrees, propose A→C).
- **MCP integration**: HelixDB's native MCP support (https://github.com/HelixDB/helix-db) lets an LLM agent walk the crosswalk graph itself rather than write SPARQL/Cypher — relevant because most security analysts will not learn SPARQL.

LLMs explicitly *do not* replace the database — they replace the missing rows, and they generate query plans on demand.

### 2.6 Graph-native file formats

- **HDT** (Header-Dictionary-Triples, https://www.rdfhdt.org/) — compact RDF binary, indexed for SPARQL. Comunica reads HDT directly. A 10M-triple SSSOM dataset is ~50 MB HDT; ideal for browser ship-once.
- **Apache Arrow Flight** for cross-tier RPC between Tier-2 (DuckDB-WASM) and Tier-3 (DataFusion).
- **Parquet** for the SSSOM table itself — gives compression, predicate pushdown, and direct DuckDB/Polars/Datafusion consumption.
- **IPLD CAR** (Content-Addressable aRchive, https://ipld.io/specs/transport/car/) for content-addressed crosswalk distribution.

---

## 3. The Crosswalk Ecosystem — Wider Map

### 3.1 Standards beyond SSSOM

| Standard | Purpose | Link |
|---|---|---|
| **SSSOM** | TSV + LinkML mapping format with provenance | https://mapping-commons.github.io/sssom/, https://github.com/mapping-commons/sssom |
| **SKOS** | W3C Simple Knowledge Organization System; `skos:exactMatch`, `narrowMatch`, `broadMatch`, `closeMatch`, `relatedMatch` | https://www.w3.org/TR/skos-reference/ |
| **OWL 2** | `owl:equivalentClass`, `owl:sameAs`, full DL semantics | https://www.w3.org/TR/owl2-overview/ |
| **LinkML** | Schema language SSSOM is built on; codegens to OWL/SHACL/JSON-Schema | https://linkml.io/ |
| **HL7 FHIR ConceptMap** | Healthcare's mapping standard with `equivalence` codes (relatedto/equivalent/equal/wider/subsumes/narrower/specializes/inexact/unmatched/disjoint) | https://www.hl7.org/fhir/conceptmap.html |
| **NIST IR 8477 STRM** | Set Theory Relationship Mapping (subset/superset/intersection/equal/no-relationship) — the US government "gold standard" used by SCF | https://csrc.nist.gov/pubs/ir/8477/final, https://securecontrolsframework.com/set-theory-relationship-mapping-strm/ |
| **NIST OLIR** | Online Informative References program — registry of machine-readable crosswalks | https://csrc.nist.gov/Projects/olir |
| **NIST OSCAL** | Open Security Controls Assessment Language; JSON/XML/YAML schema for control catalogs and mappings | https://pages.nist.gov/OSCAL/, https://github.com/usnistgov/OSCAL |
| **STIX / TAXII** | OASIS standards for threat intel relationships (`relationship-type`) | https://oasis-open.github.io/cti-documentation/ |
| **XBRL Taxonomy mapping** | financial reporting concept mapping; not directly applicable but the dimensional model is informative | https://www.xbrl.org/ |
| **STRM vs SSSOM** | STRM uses set-theoretic semantics; SSSOM uses SKOS predicates. They are convertible but not identical — SSSOM has richer provenance (orcid, mapping_date, mapping_tool, confidence), STRM has stricter semantics. |

The strategically correct posture for Crosswalker is to treat **SSSOM as the wire format and LinkML as the schema language**, while supporting *bidirectional* conversion to NIST IR 8477 STRM (the format SCF, NIST OLIR, and most US-government GRC tooling actually consume) and OSCAL (the format federal agencies will eventually require).

### 3.2 Existing crosswalk databases and APIs

- **Secure Controls Framework (SCF)** — 1,400+ controls × 200+ frameworks, free CC license, downloadable as Excel/CSV and **NIST OSCAL JSON**, mapped via NIST IR 8477 STRM. https://securecontrolsframework.com/, https://securecontrolsframework.com/free-content/scf-download
- **Unified Compliance Framework (UCF)** — commercial, ~10,000 Common Controls, ~1,000 Authority Documents, used inside IBM/McAfee/HP/RSA Archer. Per-mapper licensing (~$2,295 cert). https://www.unifiedcompliance.com/
- **NIST Cybersecurity Framework Crosswalks** — official XLSX crosswalks between CSF and Privacy Framework, 800-53, ISO 27001. https://www.nist.gov/privacy-framework/resource-repository/browse/crosswalks/cybersecurity-framework-crosswalk
- **NIST OLIR Catalog** — the official registry of submitted informative references. https://csrc.nist.gov/Projects/olir/informative-reference-catalog
- **CISA Cross-Sector Cybersecurity Performance Goals (CPGs)** mapping to NIST CSF. https://www.cisa.gov/cross-sector-cybersecurity-performance-goals
- **MITRE ATT&CK Navigator** — JSON layer files for ATT&CK overlays. https://mitre-attack.github.io/attack-navigator/, https://github.com/mitre-attack/attack-navigator
- **MITRE Center for Threat-Informed Defense — Mappings Explorer** — ATT&CK → NIST 800-53 / CIS / Azure / AWS / GCP. https://center-for-threat-informed-defense.github.io/mappings-explorer/
- **OpenControl** (mostly archival, 2017-era) — YAML-based controls/components/standards. https://github.com/opencontrol
- **HITRUST CSF** — proprietary, with own crosswalk database; commercial license required.
- **OxO** (EBI Ontology Xref Service, https://www.ebi.ac.uk/spot/oxo/) — life-sciences crosswalk hub; the architectural template most relevant to Crosswalker. Mondo Disease Ontology (https://mondo.monarchinitiative.org/) ships SSSOM tables in its release pipeline as exemplar.

### 3.3 State of the art in ontology alignment (relevant tooling)

- **OAEI** (annual evaluation), https://oaei.ontologymatching.org/
- **LogMap** (Java, scalable to 100k-class ontologies) — https://github.com/ernestojimenezruiz/logmap-matcher
- **AgreementMakerLight (AML)** — https://github.com/AgreementMakerLight/AML-Project
- **BERTMap** (transformer-based) — https://github.com/KRR-Oxford/BERTMap
- **GenOM** (LLM-based, 2025/2026) — https://arxiv.org/html/2508.10703
- **LogMap-LLM** (2025–EACL 2026 result) — https://arxiv.org/pdf/2508.08500
- **MELT** (matching evaluation toolkit) — https://github.com/dwslab/melt
- **PROMPT / AnchorPROMPT, ALCOMO, Falcon-AO** — older but foundational
- **Boomer / k-BOOM** — Bayesian ontology merging used by Mondo, consumes SSSOM probability scores. https://github.com/INCATools/boomer

The trajectory is unambiguous: by 2026 SOTA alignment is hybrid — **symbolic skeleton (LogMap/AML) + embedding retrieval + LLM oracle**. Crosswalker should design Tier-3 to plug in any of these as a "mapping suggester" service.

---

## 4. Innovative Architectural Ideas (Long-Horizon)

### 4.1 CRDT-based collaborative crosswalks

Practical recipe: store SSSOM rows as a Yjs `Y.Array<Y.Map>` or, more durably, in a cr-sqlite table with `crsql_as_crr`. Provide a Y-IndexedDB persistence so each analyst's browser is local-first; sync via y-websocket to a small relay or even peer-to-peer via y-webrtc. Conflict semantics: predicate columns (`subject_id`, `predicate_id`, `object_id`) are LWW but additionally guarded by a Datalog rule that disallows logically inconsistent mappings (e.g., simultaneous `exactMatch` and `disjointWith` for the same pair); the rule rejection becomes an editor warning. Library links: https://github.com/yjs/y-indexeddb, https://github.com/yjs/y-webrtc, https://github.com/vlcn-io/cr-sqlite.

### 4.2 Content-addressable crosswalks (IPLD/Merkle-DAG)

Every SSSOM row, bundle, and mapping-set hashes to a CID (Content Identifier). Crosswalk releases become **immutable Merkle DAGs** — a "v2026.04 NIST CSF 2.0 ↔ ISO 27002:2022" set is a CID, and an audit can verify "we used exactly these mappings on the assessment date" by checking one hash. Tools: IPLD spec (https://ipld.io/), `js-ipld` (https://github.com/ipld/js-ipld), `iroh` (Rust IPFS-class system, WASM-friendly, https://www.iroh.computer/), CAR file format for portable Merkle bundles (https://ipld.io/specs/transport/car/). This solves provenance permanently — the SSSOM `mapping_source` field becomes a CID, and `creator_id` is the ORCID + signature.

### 4.3 Crosswalk compilation (DSL → multi-target)

Treat crosswalk *rules* as a small DSL. Example: "if A is `exactMatch` to B and B is `narrowMatch` to C, derive A `narrowMatch` C with confidence ≥ min(c_AB, c_BC) × 0.9." This is exactly Datalog. Compile the DSL once with **Ascent** (→ WASM for Tier-2) and **Soufflé** (→ native binary for Tier-3 batch). The user authors rules in a single `.crosswalk.dl` file; the compiler generates browser, server, and CLI artifacts.

### 4.4 Plugin architecture

Borrow Obsidian's plugin model directly: each plugin declares a `manifest.json` with capability scopes (`read:mappings`, `write:mappings`, `query:sparql`, `embed:vectors`). Communication via Web Workers + structured-clone messages keeps the trust boundary tight. WASM Component Model (Rust 2026 roadmap, https://rust-lang.github.io/rust-project-goals/2026/wasm-components.html) is the long-term target for *language-agnostic* plugins — a Rust analyzer, a Python embedding generator, and a Go SARIF exporter could all coexist in-browser.

### 4.5 Crosswalk visualization

- **Force-directed**: Cytoscape.js (https://js.cytoscape.org/) or Sigma.js (https://www.sigmajs.org/) for exploring the framework graph.
- **Sankey / chord**: D3-sankey (https://github.com/d3/d3-sankey), apache ECharts chord diagrams — best for *coverage* of one framework by another.
- **Matrix heatmap**: a 200×200 framework heatmap colored by mapping density, click-to-drill.
- **MITRE ATT&CK Navigator-style layered overlays**: directly importable JSON layer files; a Crosswalker plugin to export to Navigator format is low-effort, high-leverage.

### 4.6 AI-assisted crosswalk generation

Architecture:
1. Generate sentence embeddings for every control (e.g., `bge-m3`, `nomic-embed-text-v2`, or for in-browser `Xenova/all-MiniLM-L6-v2` via Transformers.js — https://github.com/xenova/transformers.js).
2. Index in sqlite-vec or LanceDB-WASM (https://github.com/lancedb/lancedb).
3. For each unmapped control, retrieve top-K from target framework, prompt an LLM "are these equivalent under STRM?" with chain-of-thought.
4. Emit an SSSOM row with `mapping_tool: "crosswalker-llm-v1"`, `confidence` set from LLM logprob, `mapping_justification` set to LLM rationale, **and a `predicate_modifier: "candidate"`** so it appears in a review queue, not the canonical set.

The OAEI 2025/2026 results (LogMap-LLM, GenOM) validate this loop empirically.

### 4.7 Federated crosswalks

Use Linked Data Fragments (https://linkeddatafragments.org/) — every Crosswalker installation publishes a TPF endpoint (https://github.com/LinkedDataFragments/Server.js); Comunica federates queries across them client-side. No central registry needed. For higher-trust scenarios add **W3C Verifiable Credentials** (https://www.w3.org/TR/vc-data-model-2.0/) on the mapping_set so consumers can verify "this mapping was signed by the official NIST OLIR submitter."

---

## 5. Revised Tiered Recommendation

The recommendation below is a **single coherent stack**, but each layer is replaceable.

**Tier 0 — Schema (new).**
- LinkML schema as canonical source of truth for SSSOM extensions specific to GRC (e.g., `strm_relationship`, `oscal_id`, `attack_technique`, `framework_version`, `audit_evidence_uri`).
- Auto-generate JSON Schema, OWL, SHACL, Pydantic, TypeScript types.

**Tier 1 — Authoring (Markdown + SSSOM TSV in Obsidian).**
- Keep Obsidian + Markdown frontmatter as the human-edit surface.
- Add **cr-sqlite** as the optional "live shared session" layer for multi-analyst editing with conflict-free merge.
- Use **Yjs** for the Obsidian Live cursors / comments overlay.
- Git remains the durable history.

**Tier 1.5 — Compilation (new).**
- A Rust CLI (`crosswalker compile`) ingests the vault and emits, in one pass:
  - `mappings.parquet` (DuckDB / Polars / Datafusion),
  - `mappings.hdt` and `mappings.ttl` (Comunica / Oxigraph / Sophia),
  - `mappings.json-ld` (web consumers),
  - `oscal.json` and `sssom.tsv` (regulator-facing exports),
  - `mappings.car` (IPLD content-addressed bundle, signed),
  - `rules.wasm` (Ascent-compiled Datalog rules for browser inference).

**Tier 2 — Browser query.** Three coordinated engines, picked by query shape, not user choice:
- **DuckDB-WASM** (https://duckdb.org/docs/api/wasm/overview) for SQL + Parquet + recursive CTE crosswalking. Default engine for tabular reports.
- **Comunica + N3 store + HDT** for SPARQL when the user wants graph patterns. Far smaller bundle than Oxigraph-WASM.
- **Ascent-compiled WASM rules** for the recursive Datalog inference layer that derives transitive mappings (with provenance preserved).
- **sqlite-vec** in `wa-sqlite` for embedding similarity (mapping suggestion).

**Tier 2 alternative for a single-engine deployment:** **Minigraf** (Rust embedded bi-temporal Datalog DB with WASM target) is the cleanest single-engine answer if the maintainers can tolerate a young dependency.

**Tier 3 — Server (only when needed).**
- **Feldera** or **Materialize** for incremental view maintenance over the canonical Parquet, exposing materialized SQL views.
- **Oxigraph** or **Jena Fuseki** server for federated SPARQL over multiple Crosswalker repositories.
- **HelixDB** (or **Kuzu**) for AI-agent-driven traversal via MCP, paired with a vector index, when Crosswalker is deployed alongside an LLM analyst assistant.
- **Soufflé** (compiled C++ binary) for batch large-scale Datalog rule application — only if rule sets exceed Ascent/WASM capacity.

**Cross-cutting (any tier):**
- **IPLD CAR** for releases — every public Crosswalker mapping bundle is content-addressed, signed, and resolvable via CID.
- **Linked Data Fragments / TPF endpoint** on the server for federation.
- **W3C VCs / DIDs** to sign mapping_sets so downstream tooling can prove provenance.

This stack is intentionally heterogeneous because a *crosswalk is not a database problem* — it is a documentation, version-control, and inference problem that happens to need queries. The right architecture treats databases as caches over the canonical Markdown + SSSOM in Git.

---

## 6. Consolidated Link Index

(See the original chat-pasted deliverable for the full link index — same structure as the per-section URLs above, organized into "Newly-surveyed engines / Crosswalk standards / Crosswalk databases & tooling / Ontology alignment SOTA / WASM ecosystem".)

---

## 7. Closing Synthesis

The most consequential conclusion is not "use engine X." It is that Crosswalker is operating at a moment when (a) the embedded-Rust-DB-with-WASM ecosystem has matured enough that no single engine choice is irreversible, (b) LinkML has become the de-facto schema substrate for FAIR mapping standards including SSSOM, and (c) ontology alignment has crossed into the LLM-hybrid era empirically — not speculatively — as of OAEI 2025.

The architectural bet that *will* age well over five years is: **schema in LinkML, source of truth in Markdown + SSSOM TSV in Git, distribution as content-addressed IPLD CARs signed with verifiable credentials, browser-side queries via a multi-engine compile pipeline (Comunica/DuckDB-WASM/Ascent-WASM), reactive incrementality via DBSP/Feldera-class engines, and LLM-driven mapping suggestions backed by sqlite-vec embeddings.** The bet that will age poorly is committing the canonical layer to any one query engine — every database in the previous survey will be rewritten or supplanted within five years, but LinkML schemas and content-addressed bundles will still be readable.

The least conventional but probably most defensible single-engine pick for a near-term Tier-2 prototype is **Minigraf** (embedded bi-temporal Datalog with native WASM), precisely because its bi-temporal model is the right semantics for the audit-evidence problem GRC crosswalks actually live in. The most conventional reliable pick is **DuckDB-WASM + Comunica + sqlite-vec** running over Parquet/HDT compiled from the vault. Either path is consistent with the larger architecture above; the architecture itself is the long-term bet, not the engine.
