---
title: "Ch 16 deliverable: Tier 3 stack reconsideration — demote Apache AGE to fallback, promote Apache Jena Fuseki / oxigraph-server as new default"
description: "Fresh-agent research deliverable for Challenge 16. Demotes Apache AGE from Tier 3 default to optional fallback (sponsor Bitnine→SKAI Worldwide pivot, PG 17.1 ABI break Nov 2024, slow release cadence, board-minute concerns). Promotes Apache Jena Fuseki as new default; documents oxigraph-server as the lighter same-API alternative (architectural symmetry: same engine as Tier 2, just `oxigraph serve`). Layered Fuseki + DuckDB-on-server as power-user upgrade path. TerminusDB v12 as opt-in vault-mirror with small-vendor (DFRNT) risk flagged. Watch but don't adopt: HelixDB (AGPL+YC stage), ArcadeDB (small contributor base), SurrealDB (BSL). Plain Postgres + JSONB + recursive CTEs documented as supported 'boring tech' minimal Tier 3."
tags: [research, deliverable, query-engine, tier-3, server, fuseki, oxigraph, terminusdb, age, foundation]
date: 2026-05-02
sidebar:
  label: "Ch 16: tier-3 reconsideration"
  order: -20260502.12
---

:::tip[Origin and lifecycle]
Fresh-agent research deliverable produced 2026-05-02 in response to [Challenge 16: Tier 3 stack reconsideration](/crosswalker/agent-context/zz-challenges/archive/16-tier-3-stack-reconsideration/). Synthesized in [05-02 third-wave log §3](/crosswalker/agent-context/zz-log/2026-05-02-direction-third-wave-architectural-shifts/#3-ch-16--tier-3-default-flipped-from-age-to-fusekioxigraph-server). Predecessors: [Ch 11 deliverable A](/crosswalker/agent-context/zz-research/2026-05-02-challenge-11-deliverable-a-engine-survey/), [Ch 11 deliverable B](/crosswalker/agent-context/zz-research/2026-05-02-challenge-11-deliverable-b-engine-survey/), [Ch 11 deliverable C](/crosswalker/agent-context/zz-research/2026-05-02-challenge-11-deliverable-c-engine-survey/). Preserved verbatim; not edited after publication.
:::

# Crosswalker Challenge 16 — Tier 3 Stack Reconsideration

**Bottom line up front.** Apache AGE should be **demoted from Tier 3 default to optional fallback** (option *b*). The recommended Tier 3 default for Crosswalker is **Apache Jena Fuseki** as the single canonical server, with **oxigraph-server as a drop-in lighter alternative** (because it is already in the Tier 2 stack and shares its codebase). The recommended **runner-up / power-user upgrade path** is a **layered Fuseki + DuckDB-on-server** deployment, with TerminusDB available as a vault-mirror for users who want git-style branch/diff semantics on the server side. AGE remains a supported back-end for shops that have standardized on Postgres, but it is no longer the recommended default — the combination of sponsor pivot (Bitnine → SKAI Worldwide), the November 2024 ABI breakage (which hit AGE alongside TimescaleDB and forced PostgreSQL 17.2 to ship as an emergency repair), the slow per-Postgres-line release cadence, and reduced upstream activity reported by AGE's own ASF board minutes is too much risk for a project whose canonical format is SSSOM (an RDF-friendly TSV) and whose first-tier abstractions are markdown-and-YAML.

The rest of this document shows the work behind that conclusion.

---

## 1. Engine evaluation matrix

I scored each candidate on the dimensions in the brief using a simple 1–5 rubric where 5 is "best for Crosswalker's specific shape of workload" and 1 is "actively bad fit." The ratings are opinionated and intended to be argued with — they encode the project's real constraints (SSSOM-canonical, files-first, small team, multi-hop traversals over tens-of-thousands to low-millions of mappings, AI-agent-readable).

### 1.1 Primary candidates

**Apache Jena Fuseki (5.6.0 in Oct 2025, releases continuing into 2026)**

| Dimension | Score | Notes |
|---|---|---|
| License | 5 | Apache 2.0 |
| Governance | 5 | Apache TLP, multi-employer PMC, no key-person risk |
| SSSOM-scale performance | 4 | TDB2 handles 1B+ triples on disk; SSSOM at 10⁵–10⁶ mappings is well within comfort zone |
| RDF fit | 5 | Native; SPARQL 1.1, RDFS/OWL inference, SHACL, GeoSPARQL, text |
| SQL fit | 1 | None — needs a sidecar |
| Graph traversal expressiveness | 4 | SPARQL 1.1 property paths handle multi-hop fine; weaker than Cypher for variable-binding traversal but adequate |
| Operational complexity | 3 | JVM (Java 21+ since Jena 6); the official ConceptKernel image is ~150MB on Alpine with jlink; Helm chart available; memory tunable via JAVA_OPTIONS |
| Multi-user concurrency | 4 | Mature multi-reader/single-writer transactional model with Jetty12 front |
| Ecosystem health | 5 | Releases roughly monthly across artifacts (Oct 2025, Jan 2026, Feb 2026 in Maven Central); active mailing list; foundational software for the entire RDF community |
| AI-agent-readiness (MCP) | 3 | No first-party MCP server, but SPARQL is the easiest-to-LLM query language (declarative, well-documented), and community MCP wrappers exist; trivial to write a thin MCP shim |
| Long-term viability | 5 | The single highest-confidence bet on this list — Apache Foundation TLP since 2012, two-decade history, broad institutional adoption |

**DuckDB-on-server + DuckPGQ extension**

| Dimension | Score | Notes |
|---|---|---|
| License | 5 | MIT |
| Governance | 4 | DuckDB Foundation (Dutch nonprofit) is well-structured; DuckPGQ governance is weaker — still labeled "research project / work in progress" by CWI |
| SSSOM-scale performance | 5 | DuckDB is the best-in-class analytical engine at this size; columnar + vectorized; the DuckDB blog post of 22 Oct 2025 explicitly demonstrates SQL/PGQ on financial graphs |
| RDF fit | 2 | None native; you'd model triples as a table — workable but loses RDF semantics |
| SQL fit | 5 | Reference-grade SQL; SQL:2023 features including PGQ |
| Graph traversal expressiveness | 4 | SQL/PGQ (`GRAPH_TABLE ... MATCH`) covers pattern matching and shortest paths; multi-hop variable-length paths are supported; standard syntax that will outlive any vendor language |
| Operational complexity | 5 (embedded) / 2 (as multi-user server) | This is the crux: DuckDB shines as a single-process engine but has weak server-grade multi-writer concurrency. "Server" deployments typically wrap it in something like MotherDuck or a custom HTTP shim |
| Multi-user concurrency | 2 | Single-writer; readers OK; long-running analytical queries can starve writers |
| Ecosystem health | 5 | Weekly releases, ~28k stars, hugely active |
| AI-agent-readiness | 4 | Strong community MCP servers; SQL is well-modeled by LLMs |
| Long-term viability | 4 (core) / 3 (DuckPGQ) | DuckDB itself is rock-solid. DuckPGQ is single-maintainer (Daniël ten Wolde, CWI) and explicitly a research project; its stability is fine, but feature additions and v1.x DuckDB compatibility cycles have created friction (issue #259 tracks the whole community-extension ecosystem moving with each release) |

**TerminusDB (v12, December 2025; v12.0.4 with auto-optimizer enabled)**

| Dimension | Score | Notes |
|---|---|---|
| License | 5 | Apache 2.0 |
| Governance | 2 | DFRNT (small Stockholm-based commercial sponsor) assumed stewardship in 2025; single-vendor structure with one or two key maintainers (Hoijnet et al.); no foundation safety net |
| SSSOM-scale performance | 3 | Adequate for 10⁵ mappings; no published benchmarks at 10⁶+; the v12.0.4 notes promise "≥10% perf increase" from SWI-Prolog 10 + memory work |
| RDF fit | 5 | Closed-world RDF + JSON-LD is exactly the SSSOM mental model |
| SQL fit | 1 | None |
| Graph traversal expressiveness | 5 | WOQL Datalog with `path()`, `dot()`, `slice()` operators; GraphQL surface; among the most expressive query stacks available |
| Operational complexity | 3 | Docker-only, no embedded mode; SWI-Prolog + Rust backend is unusual but the deployment is a single container; storage format unchanged from v11 means easy upgrades |
| Multi-user concurrency | 3 | OK for single-team workloads; not designed for high write concurrency |
| Ecosystem health | 3 | Active — v12 is a real "new chapter" release with substantive API/precision work — but ecosystem narrow, Discord-sized community |
| AI-agent-readiness | 3 | No first-party MCP server; GraphQL surface is straightforward to wrap |
| Long-term viability | 3 | The genuine wildcard. DFRNT is a competent small team with a clear commercial product (DFRNT Studio), and they shipped a substantive v12 within a year of taking over. But this is exactly the same pattern as Bitnine/AGE — a small commercial sponsor with the rest of the project depending on their continued interest. The TerminusDB hosted offering is *the* business model, which is healthier than AGE's situation, but key-person risk is real |

**HelixDB (1.0 GA late 2025/early 2026)**

| Dimension | Score | Notes |
|---|---|---|
| License | 2 | AGPL-3.0. For Crosswalker (an AGPL-incompatible Obsidian plugin? worth checking, but Obsidian plugins are generally MIT/Apache) hosting Tier 3 as a separate service is fine because the plugin only *talks to* HelixDB over HTTP. But any user running Crosswalker-on-Helix who modifies Helix would be obligated to release modifications. For most Crosswalker users this is irrelevant; for any vendor wanting to embed it, it's a hard stop |
| Governance | 1 | Two YC dropouts; closed corporate steering; ~4k stars; Helix Cloud + Helix Enterprise are the business model. Classic VC-funded single-vendor risk |
| SSSOM-scale performance | 4 | Marketing claims "1–3 orders of magnitude" over competitors; LMDB-backed; no independently reproducible benchmarks at SSSOM scale |
| RDF fit | 1 | None native; would have to model triples as graph + index |
| SQL fit | 1 | None |
| Graph traversal expressiveness | 4 | HelixQL is strongly typed and compiled — very nice property, especially for agent-generated queries — but it is a *new, proprietary, single-implementation language* with zero portability |
| Operational complexity | 4 | Single Rust binary, easy to run |
| Multi-user concurrency | 3 | LMDB single-writer, multi-reader; OK for collaborative team scale |
| Ecosystem health | 2 | Young; small contributor base; depends entirely on the company's runway |
| AI-agent-readiness (MCP) | 5 | First-party MCP support is the headline feature: agents "walk the graph" instead of generating Cypher/SPARQL strings. This is genuinely novel and valuable |
| Long-term viability | 2 | At 12 months post-YC, you don't bet a long-lived open-source project's server tier on this. Watch with interest, do not adopt |

### 1.2 Other candidates — quick triage

| Candidate | License | 2026 status | Should we consider? | Best-fit role |
|---|---|---|---|---|
| **NebulaGraph** | Apache-2.0 | Active, distributed | No — distributed-first ops burden far exceeds Crosswalker's needs | Drop |
| **JanusGraph** | Apache-2.0 | Slow; Cassandra/HBase backing | No — heaviest ops on the list | Drop |
| **ArcadeDB** | Apache-2.0 | Very active (26.3.1, 26.3.2 in late 2025/early 2026); built-in MCP server; multi-model (SQL, Cypher, Gremlin, GraphQL, MongoDB wire); Apache-2.0-forever pledge | **Yes — strongest Apache-2.0 multi-model alternative** | Promote to "consider as alternative single-engine default for users who want Cypher + multi-model" |
| **Memgraph** | BSL 1.1 | Active, in-memory Cypher | No — license is not OSS | Drop for default; user choice if they have it |
| **ArangoDB** | BSL 1.1 (since 2024) | Multi-model | No — recent license change is exactly the failure mode we want to avoid | Drop |
| **FalkorDB** | SSPL | Cypher + sparse-matrix, vector | No — SSPL is not OSS-compatible for downstream redistribution | Drop |
| **GraphDB Free** | Proprietary free tier | Best OWL 2 RL inference | No as default; **document for power users** who need OWL reasoning | Optional adapter |
| **Neo4j Community** | GPLv3 | Mature | No — Cypher lock-in plus enterprise/community split issues | Out |
| **RDFox** | Proprietary commercial | Best-in-class Datalog/OWL reasoning | No as default; **document as commercial path** for very advanced reasoning | Optional adapter |
| **Stardog** | Proprietary | Knowledge-graph platform | No — costly | Reference baseline only |
| **AnzoGraph DB** | Proprietary | Niche | No | Out |
| **Neptune / AlloyDB** | Cloud-managed | Mature | Reference only | Baseline |
| **Dgraph** | Apache-2.0 | Acquired by Hypermode; "Dgraph Lives" reaffirmed Oct 2025 but momentum thin | No — too uncertain | Watch |
| **TigerGraph** | BSL changes | Commercial pivots | No | Out |
| **kuzu** | MIT | **Archived October 2025; Apple acquisition** per The Register and Medium analysis | No — abandoned. Forks (Ladybug, BigHorn, RyuGraph) too early to bet on | Caution about *anyone* in this space — see §2 |
| **oxigraph-server** | Apache-2.0 | Very active (1.6k+ stars, releases through Apr 2026) | **Yes — important "free upgrade" path** | See §2 — the strongest "small, sane, Rust" option for SPARQL Tier 3 |
| **SurrealDB** | BSL → see note | v3.0 released; production at Tencent/Verizon | Cautious — license shifts, multi-model is alluring but RDF fit is poor | Watch |
| **EdgeDB / Gel** | Apache-2.0 | Postgres-on-top schema layer | No — wrong shape for SSSOM | Out |
| **XTDB v2** | MIT | Bitemporal SQL on object storage | Interesting but document-oriented, not graph-oriented | Watch |
| **Datomic Pro / Cloud** | Free since 2023 | Mature; Clojure-only ergonomic | No — Clojure-first ecosystem; out of scope | Out |

---

## 2. Innovative / long-term considerations

The brief asked for creative thinking beyond the listed candidates. Three observations stand out.

### 2.1 The "use the Tier 2 engine on a server" pattern

The most under-examined option in the original Challenge 10/11 surveys is the simplest one: **`oxigraph serve` is a server**. Oxigraph in 2026 ships:

- A first-class CLI (`oxigraph serve --location <dir>`) that is the Tier 2 engine running in HTTP mode on port 7878 by default
- SPARQL 1.1 Query, Update, Federated Query, and Graph Store HTTP Protocol
- RocksDB-backed durable storage with repeatable-read transactions
- Apache 2.0, 1,600+ stars, releases continuing into Q2 2026
- An official Docker image at `ghcr.io/oxigraph/oxigraph:latest`
- A dedicated YASGUI-based HTML query UI

Oxigraph's own README still says "SPARQL query evaluation has not been optimized yet" — that is honest, conservative phrasing from the maintainer (Tpt), not a bug. For SSSOM-scale workloads (hundreds of thousands to a few million triples), Oxigraph is comfortable; the unoptimized note matters at the 10⁹-triple Wikidata scale, not yours.

**The implication is significant for the architecture.** If Tier 3 is "the same Oxigraph that runs in Tier 2, just with `serve`," then:

- The query language is identical across tiers
- Migration between tiers is a `dump`/`load` of the same RocksDB store
- There is exactly *one* engine to learn, tune, secure, and upgrade
- The ops story is a single Rust binary or Docker container — substantially smaller than Fuseki's JVM footprint
- Long-term viability is bound to a single-maintainer project (Tpt / Thomas Tanon), which is the visible weakness — though the project is healthy and has corporate users (Zazuko, RelationLabs, DeciSym.AI, Data Treehouse, ACE IoT) listed in its README

This is the option that the original Challenge 10/11 process appears to have missed. **It deserves to be promoted to a co-default with Fuseki**, where Fuseki is the "Apache Foundation safety" choice and Oxigraph-server is the "minimum-ops, single-stack" choice.

### 2.2 The kuzu lesson and what it means for HelixDB / TerminusDB / DFRNT

Kuzu was archived by its sponsor Kùzu Inc. on or around 10 October 2025, with a note that "Kuzu is working on something new" — widely interpreted as Apple acquisition (Tanmay Deshpande's Medium analysis, an EU DMA filing showing 10 employees, the Waterloo team going dark). Multiple forks (Ladybug, BigHorn, RyuGraph) emerged within two weeks but none has critical mass.

**This is the prototypical sponsor-pivot failure mode**, and it is exactly the failure mode Crosswalker is trying to *avoid* with AGE. The lesson is that any single-vendor-stewarded graph database with a small contributor base is one acquisition or pivot away from death. That cohort right now includes:

- TerminusDB (DFRNT) — small, focused, healthy, but identical structural risk
- HelixDB (YC company) — early-stage, AGPL, custom DSL
- ArcadeDB (small core team, Apache 2.0 pledge but small contributor base)
- FalkorDB (Redis-spinoff, SSPL)
- Memgraph (BSL — at the mercy of the company)

The cohort that is structurally robust against this failure mode is short:
- **Apache Jena** (Apache TLP, broad institutional contributor base, 20-year history)
- **Apache AGE** (Apache TLP — *but* see board-minute concerns below)
- **DuckDB** (Foundation governance with multi-employer maintainership at CWI/MotherDuck/Voltron Data)
- **Oxigraph** (single maintainer, but Apache-2.0 and a small, durable codebase that *can* be forked productively if Tpt steps away — the "small enough to fork" property)

This durability lens reshuffles the matrix: it is the strongest argument against TerminusDB-as-default and the strongest argument for Fuseki.

### 2.3 The "boring tech" alternative

The brief asked: what if Tier 3 is just Postgres + recursive CTEs + JSONB, with no graph DB pretension at all?

**Honest answer: this is more viable than Crosswalker's Tier 3 process has acknowledged.** SSSOM is fundamentally a TSV/CSV with a controlled vocabulary; you can model it as:

```sql
CREATE TABLE mappings (
  subject_id   TEXT,
  predicate_id TEXT,
  object_id    TEXT,
  mapping_justification TEXT,
  confidence   NUMERIC,
  metadata     JSONB
);
CREATE INDEX ON mappings USING GIN (metadata jsonb_path_ops);
```

Multi-hop traversal is a `WITH RECURSIVE` query. The wired.wasql.com testimonial in the AGE evaluation literature explicitly says: "For unbounded deep traversals across the entire tree, Memgraph is still faster. But for the 90% of queries that are bounded, well-indexed, and need to JOIN back to relational data" — i.e., normal SSSOM queries — plain Postgres is fine. **What's lost** vs. AGE/Fuseki/Oxigraph: idiomatic graph syntax (Cypher/SPARQL), property paths, graph algorithm libraries, easy multi-graph composition, and native RDF semantics (which matter for SSSOM's `mapping_justification` SKOS terms).

**Recommendation: document Postgres-only as a supported "minimal Tier 3" option** in addition to Fuseki/Oxigraph. Many GRC shops already have Postgres and would prefer not to add a graph engine. This is exactly the use case for which AGE was originally chosen — and as we'll see in §6, *that's why AGE survives as a fallback rather than being dropped entirely.*

### 2.4 Embedded-server pattern

DuckDB-on-server, Oxigraph-server, HelixDB, and TerminusDB all share the "single-binary or single-container" deployment property. That is in fact the dominant 2025–2026 trend in graph database deployment: the operational complexity of a JanusGraph/NebulaGraph cluster is no longer required for sub-billion-edge workloads. Crosswalker should explicitly target this footprint — **a Tier 3 deployment should be one container**, not a stack of three. This is decisive against NebulaGraph, JanusGraph, and any clustered-by-default option.

### 2.5 Federation / polystore patterns

Federation is a real option but it's the wrong abstraction for Crosswalker. SPARQL `SERVICE` clauses (Jena, Oxigraph) handle cross-endpoint queries elegantly; DuckDB's `httpfs` handles cross-source SQL. But operating Trino/Presto for a cybersecurity GRC team of 5–20 people is overkill. **The "federation" answer for Crosswalker is the SPARQL `SERVICE` clause** — built into both Fuseki and Oxigraph for free, and sufficient for occasional cross-vault joins.

### 2.6 First-party MCP support — current state

Of the candidates, the ones with **first-class, built-in** MCP servers in 2026 are:

- **HelixDB** — the headline feature, agents walk the graph rather than generating queries
- **ArcadeDB** — built into v26.3.1+, multi-model (SQL/Cypher/Gremlin/GraphQL), permission-aware at AST level
- **SurrealDB** — native Model Context Protocol support
- **Neo4j** — official Labs MCP server (closed-core but well-supported)

Notable absences with **community-only** MCP wrappers: Apache Jena, Apache AGE, DuckDB, Oxigraph, TerminusDB. For Crosswalker, this is not as decisive as it sounds: SPARQL is by a wide margin the easiest graph query language for an LLM to produce correctly (declarative, BGP-based, well-trained-on), and a thin MCP shim around any SPARQL endpoint is a few hundred lines of code. The absence of a first-party MCP server is a small ergonomic deficit, not a strategic concern.

---

## 3. Hybrid / layered Tier 3 analysis

The hypothesis: Fuseki for RDF/SPARQL + DuckDB-on-server for SQL/tabular + optional AGE-on-Postgres for property-graph users + optional TerminusDB as vault-mirror.

### 3.1 Operational reality

Running 2–4 server processes is *not* simply 2–4× the operational cost. The compounding factors are:

- 2–4× the security-patching surface
- 2–4× the upgrade-coordination problem (the AGE/PG 17.1 incident is exactly this in microcosm)
- 2–4× the backup story
- N² authorization mappings if users want unified access
- A federation/glue layer (SPARQL `SERVICE`, DuckDB `httpfs`, or a query router) that becomes its own component

For a 5–20-person GRC team self-hosting, this is a non-trivial step up from "one Docker container."

### 3.2 Federation strategies that work

Two realistic patterns:

1. **Federated SPARQL**. Fuseki's `SERVICE` clause can pull from another Fuseki, an Oxigraph-server, or anything else speaking SPARQL Protocol. This is the cleanest cross-engine join pattern and it is a shipped feature, not glue code.
2. **DuckDB as the federation layer**. DuckDB has reader extensions for Postgres (`postgres_scanner`), SQLite, Parquet, CSV, Iceberg, JSON, and HTTP-served files. A user who wants to join SSSOM data with their own Postgres CMDB can do it from DuckDB without the GRC tool needing to know.

What does *not* work well: cross-engine joins between Cypher (AGE) and SPARQL (Fuseki). There is no idiomatic federation primitive between property-graph and triple-store query languages. SSSOM's RDF-friendliness is exactly what avoids this problem if you stay on the SPARQL side.

### 3.3 When does layering pay off?

The crossover point in my judgment:

- **< ~250k mappings, single-team, mostly SSSOM-shaped queries**: layering is pure overhead. One server.
- **~250k–2M mappings, multi-team, mixed SQL-and-traversal workloads**: Fuseki + DuckDB-on-server starts to pay off because the SQL/tabular workloads (audit reports, coverage matrices, control-mapping rollups) get materially faster on DuckDB than on SPARQL.
- **> 2M mappings or strict multi-vault federation**: layering is necessary, but at that point the user is likely to have an enterprise data team and the operational cost is absorbed.

### 3.4 The actual tradeoff

It is not "right tool per query" vs "one tool to operate" — it is **"right tool per query" vs "one operator to keep paged."** Small open-source projects almost always win by minimizing the second number. Layering should be opt-in, not default.

---

## 4. Recommended Tier 3 default

### 4.1 The recommendation

| User profile | Recommended Tier 3 | Why |
|---|---|---|
| **Default — typical Crosswalker user** (small GRC team, self-hosting, ≤500k mappings) | **Apache Jena Fuseki**, with **oxigraph-server** documented as a lighter, equivalent-API alternative | One container; SPARQL matches SSSOM perfectly; Apache TLP governance; the safest 5–10-year bet on the list |
| **Power user / enterprise tier** (multi-team, mixed SQL + graph workloads, multi-million mappings) | **Layered: Fuseki + DuckDB-on-server**, federated via SPARQL `SERVICE` and DuckDB `httpfs`/`postgres_scanner` | Each engine handles what it's best at; both have foundation governance; both are documented and well-known |
| **Postgres-standardized shop** (already runs Postgres, doesn't want a new server) | **Apache AGE** (kept as supported fallback) *or* plain Postgres + recursive CTEs + JSONB | AGE remains the only option that lives inside an existing Postgres; the boring SQL option remains viable for ≤90% of queries |
| **Git-native vault-mirror power user** | **TerminusDB v12** as an optional adjunct — *not* as the only Tier 3 | Branch/diff/merge ergonomics are unique; small-vendor risk means it should not be the only thing standing between a user and their data |

### 4.2 Decision rule

Choose differently from the default if:

- Your queries are predominantly tabular/aggregational (rollup reports, coverage matrices) — push toward DuckDB-on-server
- You need OWL 2 RL or Datalog reasoning at scale — evaluate GraphDB Free (commercial-free) or RDFox (commercial)
- You require git-style versioning of the canonical store (not just the markdown vault) — adopt TerminusDB as adjunct
- You are running an LLM-agent-heavy workflow and want zero query-string generation — evaluate ArcadeDB (Apache 2.0, built-in MCP, multi-model) as a single-engine alternative

### 4.3 Forward compatibility (5–10 year view)

- **Fuseki** — highest confidence. SPARQL is a W3C Rec, Apache governance, ~2 decades of releases. The choice that ages best.
- **Oxigraph-server** — high confidence on the standard (SPARQL is durable), medium on the implementation (single maintainer, but small enough to fork).
- **DuckDB-on-server** — high confidence on DuckDB itself; medium on DuckPGQ which CWI still labels research.
- **TerminusDB** — explicit small-vendor risk under DFRNT, mitigated by Apache 2.0 license and unchanged storage format since v11.
- **AGE** — declining confidence; sponsor pivoted, ABI risk is real, board minutes report reduced activity.
- **HelixDB / ArcadeDB / SurrealDB / FalkorDB / Memgraph** — too young, too BSL/SSPL/AGPL, or too single-vendor for a 10-year bet.

---

## 5. Migration path from Apache AGE

For early adopters who started on AGE during the Ch 10 era:

### 5.1 The good news: SSSOM is the canonical pivot

Because mappings are canonically SSSOM (markdown + YAML files in the vault), the AGE database is by definition a *projection* of the canonical files, not the source of truth. Migration is therefore not "translate AGE data to Fuseki data" but "rebuild the projection on the new engine from the same SSSOM files." This is the architectural payoff of the files-canonical decision.

### 5.2 Concrete steps

1. **Dump for safety, not for migration.** From AGE: `SELECT * FROM cypher('graph_name', $$ MATCH (n)-[r]->(m) RETURN n, r, m $$) AS (n agtype, r agtype, m agtype);` exported via `\copy` to JSONL. This is your insurance, not your migration data.
2. **Re-run Crosswalker's SSSOM-to-RDF projector** against the canonical vault into Fuseki / Oxigraph-server using the same projection code path that Tier 2 uses (since Oxigraph is shared). The projection should be idempotent.
3. **Spot-check round-trip**: pick 50 mappings, query both AGE and Fuseki, confirm semantic equivalence (this catches subtle agtype-vs-RDF-literal coercion issues).
4. **Cutover** read-traffic; keep AGE running read-only for 60–90 days as a fallback; then decommission.

### 5.3 Tooling

- **Already exists**: SSSOM's `sssom-py` library handles SSSOM ↔ RDF/OWL conversions; pyoxigraph and the Apache Jena `riot` tool both load SSSOM-derived RDF natively.
- **Needed**: a small Crosswalker-specific "AGE diff vs SSSOM vault" sanity tool — essentially a `cypher() → JSON → diff` script — to verify nothing in the AGE projection is missing from the canonical vault before cutover.
- **Not needed**: any custom AGE-to-Fuseki translator. SSSOM is the bridge.

### 5.4 Backward compatibility window

Keep AGE as a fully supported option through **at least one Crosswalker major version cycle** after the new default ships (call it ~12 months). After that, demote to "community-maintained" — documented but no longer tested in CI. Drop entirely only if/when the AGE project itself shows clear signs of unmaintenance (e.g., no PG 19 support a year after PG 19 GA).

---

## 6. Decision on AGE's role

**Recommendation: option (b) — keep as fallback for Postgres-standardized environments**, with explicit demotion from default.

The rationale, mapped to the four concerns in the brief:

1. **Sponsor health (Bitnine → SKAI Worldwide, Jan 2025)**. The pivot to AI advertising/content production is exactly the structural risk that killed kuzu. SKAI Worldwide retains the Bitnine commercial graph database products on their site, but their public direction is AI advertising, not graph databases. Apache TLP status partially mitigates this (the project cannot simply be deleted), but the loss of the primary contributing employer is a real reduction in development velocity. The AGE board minutes (Apache Whimsy) explicitly note "the project continues to have reduced activity when compared to the same period Year-over-Year" through 2025, with "no new PMC members" and "no new committers" in recent quarters.

2. **Slow release cadence**. Issue #2229 (PG 18 support) was filed October 2, 2025 by leonardo-anchino; PG 18 support landed in late 2025 / early 2026. Compared to the Postgres release cadence (PG 18 GA September 2025) this is a 3–6 month lag for a flagship Postgres extension — slower than TimescaleDB or PostGIS but acceptable. The bigger risk is that the **per-Postgres-line release model** means support backporting is bottlenecked on PMC capacity that has not grown.

3. **Postgres ABI risk**. The November 14, 2024 PG 17.1 ABI break — caused by adding a `bool ri_needLockTagTuple` field to `ResultRelInfo` — affected TimescaleDB and Apache AGE primarily. The community had to ship 17.2 as an emergency repair (Crunchy Data's coverage; EDB's post-mortem). This is a structural risk for *any* C-extension-based graph engine, not just AGE; but it means AGE inherits the Postgres ABI risk surface in a way that Fuseki/Oxigraph do not. The AGE PMC's response was correct (they reported the issue upstream), but extension users had to rebuild against 17.2.

4. **Single-vendor anchored**. True at adoption time, partially mitigated by Apache governance, not fully — board minutes show committer-to-PMC additions stalled, with the most recent additions being in early 2024.

**Why not (a) drop entirely**: AGE's killer feature — running graph queries inside an existing Postgres instance with shared transactions and indexes — has no substitute. For the user who already runs Postgres and does not want to add a graph server, AGE remains uniquely useful. Dropping it strands those users for no engineering gain.

**Why not (c) re-affirm as default**: the alternatives (Fuseki, Oxigraph-server, layered Fuseki+DuckDB) are *better matched to SSSOM's RDF-shaped reality*, have stronger governance, smaller operational footprints, and lower exposure to the Postgres ABI risk. Re-affirming AGE would be choosing comfort over correctness.

---

## 7. Concise summary

- **Demote AGE** from Tier 3 default to fallback.
- **Promote Apache Jena Fuseki** to Tier 3 default. Document **oxigraph-server** as the lighter same-API alternative — it is the same engine that Tier 2 uses, an important architectural symmetry.
- **Document layered Fuseki + DuckDB-on-server** as the power-user upgrade path, with SPARQL `SERVICE` and DuckDB `httpfs` / `postgres_scanner` as the federation primitives.
- **Document TerminusDB v12** as an opt-in vault-mirror for users who want server-side git-style branch/diff — but flag the small-vendor (DFRNT) risk explicitly.
- **Watch but do not adopt**: HelixDB, ArcadeDB, SurrealDB. Each is interesting; none is mature enough or governance-stable enough to sit under a small open-source GRC tool with a 5–10-year horizon.
- **Document the "boring tech" path**: Postgres + JSONB + recursive CTEs is a perfectly cromulent Tier 3 for shops that don't want a graph engine at all. SSSOM doesn't *require* one.
- **Migration**: the SSSOM-canonical files-first architecture turns "migrate from AGE" into "re-run the projector against the new engine," which is the architectural payoff for choosing files-first in the first place.
- **The Kuzu cautionary tale (October 2025)** should weigh on every Tier 3 decision going forward. Single-vendor stewardship with a small contributor base is the failure mode to avoid; foundation governance and "small enough to fork" are the two structural defenses.

The choice that ages best for a small open-source project that needs server-side graph capabilities for an SSSOM-canonical, files-first cybersecurity GRC crosswalking tool is, simply, **the most boring high-quality SPARQL server in the ecosystem** — Apache Jena Fuseki — with a Rust escape hatch (Oxigraph) that shares its codebase with the in-browser tier. That symmetry between Tier 2 and Tier 3 is the architectural property worth optimizing for, and it is the property that the original Challenge 10 process under-weighted.
