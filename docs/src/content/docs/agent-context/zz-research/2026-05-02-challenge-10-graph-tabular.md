---
title: "Ch 10 deliverable: Graph→tabular bridging engine for the web-of-webs"
description: "Fresh-agent research deliverable for Challenge 10. Recommends a hybrid 3-tier strategy: Tier 1 materialized-folder generator (build), Tier 2 DuckDB-WASM (integrate), Tier 3 PostgreSQL + Apache AGE with optional Oxigraph RDF sidecar. Rejects KuzuDB-WASM citing 10 Oct 2025 archival. Includes full engine evaluation matrix, 3-tier design specs, 5-invariant data-flow contract, and worked multi-hop spine render in Cypher / DuckDB recursive CTE / SPARQL."
tags: [research, deliverable, query-engine, tier-2, tier-3, duckdb, age, foundation]
date: 2026-05-02
sidebar:
  label: "Ch 10: Graph→tabular bridging"
  order: -20260502.3
---

:::tip[Origin and lifecycle]
This is a fresh-agent research deliverable produced 2026-05-02 in response to [Challenge 10: Graph→tabular bridging engine](/crosswalker/agent-context/zz-challenges/10-graph-to-tabular-bridging-engine/). It was summarized in [05-02 §2.3](/crosswalker/agent-context/zz-log/2026-05-02-direction-research-wave-and-roadmap-reshape/#23-challenge-10--graphtabular-bridging-engine-for-the-web-of-webs); a [critical assessment in 05-02 §3.1](/crosswalker/agent-context/zz-log/2026-05-02-direction-research-wave-and-roadmap-reshape/#31-challenge-10-has-substantive-gaps) identified substantive gaps in the engine shortlist (no Datalog engines, no production triple stores, no TerminusDB, no vector+graph hybrids, etc.), so this deliverable's engine choice is **deferred** pending [Challenge 11 — Tier 2/3 engine deep survey](/crosswalker/agent-context/zz-challenges/11-tier-2-3-engine-deep-survey/) and [Challenge 12 — Datalog vs SQL for SSSOM chain rules](/crosswalker/agent-context/zz-challenges/12-datalog-vs-sql-sssom-chain-rules/). Preserved verbatim; not edited after publication.
:::

# Challenge 10 — Graph → Tabular Bridging Engine for the Web-of-Webs
## A Design Specification for Crosswalker's 3-Tier Architecture

---

## 0. Executive Summary

Crosswalker's data is fundamentally a **labeled property graph with RDF-flavored crosswalk semantics** (STRM, SSSOM), but virtually every consumer-facing artifact — compliance matrices, gap dashboards, OSCAL by-component exports, multi-hop spine renders — is a **flat, tabular cross-tab**. Challenge 10 is therefore the structural seam of the entire platform: a graph→tabular bridge that must work in three progressively heavier deployment shapes while keeping markdown files as the immutable source of truth.

**Headline recommendation: Hybrid strategy.**

- **Tier 1 (build):** A *materialized-folder* generator inside the plugin that flattens graph queries into Bases-compatible YAML notes. Files-only, no engine dependencies, works in any Obsidian install. Treat each materialized folder as a classical materialized view with explicit dependency tracking and staleness markers.
- **Tier 2 (integrate):** **DuckDB-WASM** as the embedded analytical engine. Recursive CTEs handle multi-hop spine queries; columnar OLAP is a natural fit for cross-tabs; ~6–10 MB compressed bundle; MIT-licensed; mature. **Reject KuzuDB-WASM** despite its Cypher elegance because the upstream project was archived on 10 October 2025 (see The Register, "KuzuDB graph database abandoned, community mulls options"), creating an unacceptable supply-chain risk for a long-lived compliance tool.
- **Tier 3 (integrate):** **Apache AGE on PostgreSQL** for openCypher graph traversal plus full SQL, with optional Oxigraph alongside for RDF-native SPARQL workloads (SSSOM/SKOS reasoning, OWL-style closure). The server tier is a *secondary cache* layered over the same file canon, never a primary store.
- **Universal data-flow contract:** Files are the only writable surface. All derived stores (materialized folders, DuckDB-WASM database, server graph DB) are content-addressed, deterministically rebuildable from files, and surface staleness explicitly to the user.

---

## 1. Engine Evaluation Matrix

Scoring scale: 5 = excellent fit, 3 = workable, 1 = poor fit, ✗ = disqualifying.

| Engine | Graph fit | Tabular fit | Browser/Obsidian | Bundle (compressed) | License | Project health (May 2026) | Verdict for Crosswalker |
|---|---|---|---|---|---|---|---|
| **DuckDB-WASM** | 3 (recursive CTE, no native graph types; community DuckPGQ extension exists) | **5** (columnar OLAP, PIVOT, window funcs, Arrow zero-copy) | **5** (Chrome/FF/Safari/Node, OPFS persistence, web workers) | ~3.2 MB compressed shell; ~6.4 MB EH .wasm | **MIT** | Active, MotherDuck-backed, large ecosystem | ★ **Tier 2 primary** |
| **KuzuDB-WASM** | **5** (native property graph, Cypher, vector index, FTS) | 4 (vectorized columnar, joins fast) | 4 (works in browser, multiple build variants, IDBFS persistence) | Larger than DuckDB; Wasm modules ship default + multithreaded + sync variants | **MIT** | ✗ **Archived 10 Oct 2025**; v0.11.3 final bundled release; no upstream maintenance commitment | ✗ **Reject** — supply-chain risk too high for a multi-year GRC tool |
| **sql.js** | 2 (recursive CTE only; no graph types) | 4 (full SQLite, but row-oriented, slower joins than DuckDB) | **5** (1.5 MB .wasm, ~897 KB official; works everywhere; long history) | **~1.5 MB** total, ~897 KB .wasm | **MIT** (SQLite is public domain) | Active but slower-moving | 3 — viable fallback if DuckDB-WASM is too heavy for a given user; usable as Tier 1.5 |
| **Apache AGE** | **5** (openCypher on Postgres, true property graph) | **5** (full SQL, materialized views, partitioning) | 1 (server-only) | N/A (server) | **Apache 2.0** | Active ASF project | ★ **Tier 3 primary** |
| **Neo4j Community** | **5** (the reference graph DB, full Cypher) | 3 (Cypher returns tabular but no SQL; awkward for cross-tabs) | 1 (server-only; AuraDB cloud) | N/A | **GPLv3** (community); commercial for enterprise | Active | 2 — license + non-tabular query language make it awkward as a Tier 3 default |
| **Oxigraph (WASM)** | 4 (RDF triple/quad store, SPARQL 1.1, property paths) | 2 (SPARQL projects but no PIVOT, weak for cross-tabs) | 4 (in-memory only in WASM — RocksDB backend disabled; works in browsers w/ WeakRef) | Small Rust+wasm-bindgen build; not officially benchmarked but ~2–4 MB class | **MIT/Apache 2.0 dual** | Active (single primary maintainer, slow but steady) | 3 — **excellent secondary** for SSSOM/SKOS/STRM RDF semantics; not a primary engine |
| **Datacore** | 2 (in-memory page index, sections/blocks queryable) | 4 (React/JSX query API, WYSIWYG tables, edits write-back) | **5** (native Obsidian plugin) | Negligible (plugin only) | **MIT** | Active beta, same author as Dataview | 4 — **adopt at Tier 1** for live JS-based table rendering where Bases is too restrictive |
| **Obsidian Bases** | 1 (no joins, no pivots, no inline-field reading) | 3 (filter/sort/group/format on flat YAML; tables/cards) | **5** (core feature since v1.9.10) | 0 (built-in) | Obsidian EULA (proprietary core, but `.base` is plain YAML) | Shipped, actively developed by Obsidian team | ★ **Tier 1 surface** — committed |
| **Apache Arrow JS / Polars-JS** | 1 (no graph) | 4 (Arrow as zero-copy IPC; Polars-JS for joins/pivots in browser) | 4 (modern browsers; Polars-JS is ~5 MB wasm) | Polars-JS ~5 MB; Arrow JS ~600 KB core | **Apache 2.0** / **MIT** | Active | 3 — **adopt as the in-browser join/pivot layer** that sits between DuckDB-WASM and the renderer |

**Notes on key facts:**
- DuckDB-WASM bundle sizes vary widely depending on which variant (`mvp`, `eh`, `coi`) is shipped and whether extensions are autoloaded. The maintainers cite "about 3.2 MB of compressed Wasm files transferred over the network" for the shell with extensions, while a single `duckdb-eh.wasm` file is around 6.4 MB raw and reportedly ~18 MB before compression in some bundler configurations (Observable Framework issue #1260). For a plugin, a tree-shaken EH-only bundle is the right target.
- The KuzuDB archival is recent (October 10, 2025) and unambiguous: the GitHub repo is read-only, PyPI shows "This project has been archived." A community fork (Kineviz "bighorn") exists but is unproven. For a knowledge tool whose primary value is *durability of a curated dataset*, this is disqualifying as a default.
- Oxigraph's WASM build deliberately drops the RocksDB backend and runs entirely in-memory. That is acceptable as a secondary RDF reasoner over already-loaded SSSOM mappings, but unsuitable as a primary persistent store.
- sql.js's WASM has a single-allocation ceiling (the SQLite forum thread on `SQLITE_NOMEM` documents users hitting limits in the 500 MB range); for vault-scale GRC data this is rarely a problem but it is a hard ceiling.

---

## 2. Tier 1 Design — Materialized-Folder Generator

### 2.1 Core idea

Bases is committed as the Tier 1 query surface. Bases consumes flat YAML frontmatter and offers no joins, no pivots, no relational projection. Therefore the only way to give a Bases user a multi-hop spine render or a controls × evidence cross-tab is to *pre-compute it as a folder of pre-joined notes* whose frontmatter already contains every column the Base will display. This is a classical **materialized view** problem expressed in the file system.

### 2.2 File format for a materialized folder

A materialized folder is stored under `_views/<view-id>/` and contains:

```
_views/
  ac2-spine-cis/
    .view.yaml                  # view definition (single source of truth)
    .view.lock.json             # dependency manifest + content hash
    .view.stale                 # presence = view is stale (touched on dirty event)
    rows/
      0001-AC-2--IAC-15--6.1.md
      0002-AC-2--IAC-16--6.2.md
      ...
    summary.base                # auto-generated Bases file pointing at rows/
```

`.view.yaml` (the human-editable definition):

```yaml
id: ac2-spine-cis
title: NIST 800-53 AC-2 → SCF → CIS Controls 6.x
materializer: spine-render
version: 1
inputs:
  subject_filter: "framework:nist-800-53 AND family:AC"
  spine_filter:   "ontology:scf"
  object_filter:  "framework:cis-controls-v8 AND family:'6'"
  hop_predicates: [strm:equivalent, sssom:closeMatch]
projection:
  columns:
    - subject.id
    - subject.title
    - spine.id
    - spine.title
    - object.id
    - object.title
    - edge_chain.confidence_min
    - edge_chain.confidence_avg
    - evidence.count
trigger:
  rebuild_on:
    - vault_load
    - manual
    - upstream_change   # via dependency manifest
debounce_seconds: 5
ceiling:
  max_rows: 5000
  on_overflow: warn_and_truncate
```

Each `rows/*.md` is a **leaf materialized note** whose entire YAML frontmatter encodes one already-flattened row, plus a body that lists provenance:

```markdown
---
view: ac2-spine-cis
row_index: 17
subject_id: NIST-800-53/AC-2
subject_title: Account Management
spine_id: SCF/IAC-15
spine_title: Identity Lifecycle
object_id: CIS-Controls-v8/6.1
object_title: Establish an Access Granting Process
hop_count: 2
edge_chain_confidence_min: 0.78
edge_chain_confidence_avg: 0.86
evidence_count: 3
provenance_hash: sha256:7c1f...
materialized_at: 2026-05-02T14:22:11Z
generator: spine-render@1
---

# Provenance
- Subject: [[NIST-800-53/AC-2]]
- Hop 1: STRM equivalent → [[SCF/IAC-15]] (conf 0.92)
- Hop 2: SSSOM closeMatch → [[CIS-Controls-v8/6.1]] (conf 0.78)
- Evidence: [[evidence/iam-quarterly-review-2026q1]] (and 2 others)
```

The associated `summary.base` is itself just YAML and points Bases at the row folder:

```yaml
filters:
  and:
    - file.folder == "_views/ac2-spine-cis/rows"
properties:
  - file.name
  - subject_id
  - subject_title
  - spine_id
  - object_id
  - edge_chain_confidence_avg
  - evidence_count
views:
  - type: table
    name: AC-2 spine to CIS 6.x
    order:
      - subject_id
      - spine_id
      - object_id
      - edge_chain_confidence_avg
```

This makes the user-visible artifact a regular Bases table, even though the rows themselves were synthesized by graph traversal.

### 2.3 Trigger model

Three plausible triggers, in order of increasing reactivity:

1. **Manual / on-demand** — user clicks "Materialize this view." Default; safest.
2. **On vault load** (at plugin init) for views marked `auto: on_load`.
3. **On dependency change** — the materializer subscribes to Obsidian's `vault.on('modify' | 'create' | 'delete' | 'rename')` and consults the `.view.lock.json` manifest. Any source path that participated in the last build is a dependency. When a dependency mutates, mark the view stale (`touch .view.stale`); rebuild on next open or on a debounced timer.

**Recommendation:** ship (1) and (3). Avoid making rebuilds happen during typing (Datacore's roadmap explicitly notes that synchronous rebuilds are how Dataview "lags"). Debounce ≥ 5 s; queue rebuilds in a worker; never block the main thread.

### 2.4 Staleness handling

This is the same problem PostgreSQL, BigQuery, Redshift, and Databricks all solve for materialized views; we should adopt their vocabulary explicitly. The literature breaks down as:

- **Full refresh** vs **incremental refresh**: Postgres `REFRESH MATERIALIZED VIEW` is full; BigQuery, Redshift, and Databricks Delta Live Tables can do incremental when the source supports change feeds.
- **Staleness markers / `max_staleness`**: BigQuery exposes `max_staleness` so callers can tolerate slightly old data. Redshift documents which constructs (SELECT/JOIN/WHERE/GROUP BY/aggregates) are eligible for incremental refresh.
- **Refresh-on-read vs refresh-on-write**: Tacnode's analysis distinguishes "view that's current" from "view that's perpetually catching up" under high write throughput; for a knowledge vault, write throughput is low, so refresh-on-write is fine.
- **Dependency manifests / MV logs**: Oracle requires explicit MV logs on base tables; Databricks Enzyme automatically computes deltas (Spark Declarative Pipelines, "Enzyme: Incremental View Maintenance for Data Engineering," arXiv 2603.27775).

For Crosswalker the right Tier 1 staleness model is:

- Always do **full rebuild** at Tier 1 (incremental refresh of merged spine rows is too easy to get subtly wrong on edge changes; correctness matters more than refresh latency for compliance reporting).
- Maintain a `.view.lock.json` with one entry per source file: `{path, mtime, content_hash}`. After build, compare on every `vault.modify` event in the watched dependency set; mark stale on first divergence.
- A stale view shows a banner in its `summary.base` view: "This view was generated 2026-04-21; 3 dependencies have changed since then. [Rebuild]."
- A view is **never silently rebuilt** while the user is editing. Auto-rebuild only happens on idle or on explicit open.

### 2.5 File-proliferation / cost ceiling

This is the dominant Tier 1 risk. A naive design — one materialized note per row, every view full — explodes badly: a controls × evidence matrix on NIST 800-53 (~1,200 controls) crossed with a 5,000-evidence corpus could easily generate hundreds of thousands of files, breaking Obsidian's index.

Mitigations, all of which should be enforced:

1. **Hard row ceiling per view** (default 5,000; warn at 2,500). Exceeding it produces a truncated view with a banner.
2. **Single-file materialization mode** for high-cardinality views: write one fat YAML file (or one `.csv` sibling) instead of N notes. Bases can read this single file as one base; the user loses per-row clickability but gains scale.
3. **Vault-wide ceiling** (default 50k materialized notes total). Plugin refuses to build new views beyond this; suggests Tier 2 migration.
4. **`.gitignore`-style exclusion**: `_views/` should be excluded from sync defaults (Syncthing/iCloud) since it is rebuildable. The plugin documents this.
5. **Eviction**: views not opened in N days can be auto-collapsed back to a stub (`.view.yaml` only, no `rows/`) to keep file count down.

### 2.6 Comparison to classical SQL views

| Property | SQL VIEW | SQL MATERIALIZED VIEW | Crosswalker Tier 1 folder |
|---|---|---|---|
| Storage | none (virtual) | dedicated relation | folder of files |
| Latency | re-execute every read | read precomputed | read precomputed |
| Freshness | always current | snapshot at last refresh | snapshot at last build |
| Invalidation | n/a | manual or auto refresh | dependency manifest + `.view.stale` |
| Write-back | sometimes (updatable views) | usually no | **no** (read-only by contract) |

The Tier 1 folder is *strictly* a materialized view: it is read-only, it is regenerable, and it is not part of the source-of-truth contract.

---

## 3. Tier 2 Design — DuckDB-WASM Sidecar

### 3.1 Engine choice rationale

DuckDB-WASM is recommended over the alternatives for these specific Crosswalker characteristics:

- **Cross-tab and pivot are first-class**: DuckDB has `PIVOT`/`UNPIVOT`, `GROUPING SETS`, window functions, and Arrow zero-copy. Compliance matrices map directly onto these.
- **Recursive CTEs cover multi-hop traversal** sufficiently for spine renders (depth typically ≤ 4). DuckDB's recursive CTE support is well exercised; community examples push it to absurd extremes (the "DuckDB Doom" project uses recursive CTEs for raycasting).
- **Bundle is acceptable**: ~3.2 MB compressed shell; for a power-user GRC plugin this is tolerable. By comparison sql.js is ~1.5 MB but materially weaker on joins/pivots.
- **License is permissive (MIT)** and unencumbered.
- **Persistence options**: OPFS in modern browsers, IndexedDB fallback, or simply ephemeral (rebuild from files on plugin load — recommended default given files-are-truth).
- **Active maintenance**: backed by MotherDuck and a large community, in stark contrast to KuzuDB's October 2025 archival.
- **Already aligns with Crosswalker's foundation commitment** to sql.js *or* DuckDB-WASM at Tier 2; DuckDB is the stronger of the two for the analytical workload.

DuckDB does not have a native property-graph type. The community DuckPGQ extension adds SQL/PGQ-style pattern matching, but it is not yet WASM-friendly and is not stable enough to commit to. Modeling the graph as edge tables and using recursive CTEs is the pragmatic path.

### 3.2 Schema sketch

The schema is a thin **property-graph normal form** over the file canon. UUIDs are owned by Challenge 09; here we just consume them.

```sql
-- ============ NODES ============
CREATE TABLE node (
    uuid          TEXT PRIMARY KEY,        -- from Challenge 09
    kind          TEXT NOT NULL,           -- 'control' | 'evidence' | 'spine' | 'junction'
    ontology      TEXT,                    -- 'nist-800-53' | 'scf' | 'cis-v8' | ...
    framework_id  TEXT,                    -- e.g. 'AC-2'
    title         TEXT,
    file_path     TEXT NOT NULL,           -- absolute vault path; round-trip key
    file_hash     TEXT NOT NULL,           -- sha256 of full file content
    frontmatter   JSON NOT NULL,           -- entire YAML frontmatter
    last_seen_at  TIMESTAMP NOT NULL
);

CREATE INDEX node_kind_ontology ON node(kind, ontology);
CREATE INDEX node_framework_id  ON node(framework_id);

-- ============ EDGES ============
-- Crosswalk edges (STRM/SSSOM-flavored)
CREATE TABLE edge_crosswalk (
    edge_uuid     TEXT PRIMARY KEY,
    src_uuid      TEXT NOT NULL REFERENCES node(uuid),
    dst_uuid      TEXT NOT NULL REFERENCES node(uuid),
    predicate     TEXT NOT NULL,           -- 'strm:equivalent' | 'sssom:closeMatch' | ...
    confidence    DOUBLE,
    direction     TEXT,                    -- 'sub_obj' | 'obj_sub' | 'symmetric'
    junction_path TEXT,                    -- file path of evidence-link junction note (if any)
    properties    JSON
);

-- Hierarchy edges (folder containment, framework parent-child)
CREATE TABLE edge_hierarchy (
    parent_uuid   TEXT NOT NULL REFERENCES node(uuid),
    child_uuid    TEXT NOT NULL REFERENCES node(uuid),
    rel           TEXT NOT NULL,           -- 'folder' | 'family' | 'control_enhancement'
    PRIMARY KEY (parent_uuid, child_uuid, rel)
);

-- Evidence-link edges (the 13-field junction notes)
CREATE TABLE edge_evidence (
    junction_uuid TEXT PRIMARY KEY,
    evidence_uuid TEXT NOT NULL REFERENCES node(uuid),
    control_uuid  TEXT NOT NULL REFERENCES node(uuid),
    fields        JSON NOT NULL,           -- 13-field schema, owned by Challenge 09
    file_path     TEXT NOT NULL,
    file_hash     TEXT NOT NULL
);

-- Lifecycle change atoms (versions)
CREATE TABLE change_atom (
    atom_id       TEXT PRIMARY KEY,
    target_uuid   TEXT NOT NULL,
    op            TEXT NOT NULL,           -- 'add'|'remove'|'modify_field'
    field         TEXT,
    old_value     JSON,
    new_value     JSON,
    version       TEXT NOT NULL,
    committed_at  TIMESTAMP NOT NULL
);

-- ============ DERIVED PIVOT VIEWS ============
-- Optional pre-pivoted compliance matrix (rebuilt on schema change)
CREATE VIEW v_compliance_matrix AS
PIVOT (
    SELECT c.framework_id AS control,
           e.evidence_uuid AS evidence,
           1 AS covered
    FROM edge_evidence ev
    JOIN node c ON c.uuid = ev.control_uuid
    JOIN node e ON e.uuid = ev.evidence_uuid
)
ON evidence
USING SUM(covered)
GROUP BY control;
```

### 3.3 Round-trip semantics

The unidirectional contract is firm: **Tier 2 is a derived store; writes never originate at Tier 2.**

- **Files → Tier 2**: a `VaultIndexer` walks the vault on plugin load (and incrementally on `vault.on('modify')`), parses frontmatter with `gray-matter` or equivalent, and `INSERT OR REPLACE`s into `node` / `edge_*` tables. Each row carries `file_path` and `file_hash`; rebuild is content-addressed.
- **Tier 2 → Files**: forbidden in normal operation. The only "write-back" path is via a *file-emitter* component that, given a Tier 2 query result, writes a *new* materialized note (a Tier 1 folder, a CSV export, an OSCAL JSON, etc.) and never modifies an existing source file.
- **User edits in DuckDB UI?** If the plugin offers a "table edit" UX (e.g., editing a confidence value), the edit is captured as a *file mutation*: the plugin opens the source markdown, modifies the relevant frontmatter field, saves, and the file-watcher round-trips that change back into Tier 2. This is identical in spirit to how Datacore's WYSIWYG table editor "writes back to the YAML frontmatter."
- **Indexing is incremental**. On `modify`, only the affected file is reparsed; on `delete`, the row is removed; on `rename`, `file_path` is updated. Edges incident on a deleted node are deleted by `ON DELETE CASCADE`-equivalent application logic (DuckDB-WASM doesn't enforce FK cascades reliably enough to lean on).

### 3.4 Query language exposure

Three layers, all available:

1. **Pre-built dashboards** (default UI). Compliance matrix, gap dashboard, coverage report, OSCAL export — each is a parametric DuckDB query bound to a view component. Most users never write SQL.
2. **Query builder UI** for dimension/measure/filter selection (covered by Challenge 12; out of scope here).
3. **Raw SQL escape hatch** for power users, behind a "Show SQL" toggle and a sandboxed editor. Read-only by default.

Cypher-style traversal is **not** exposed at Tier 2; the recursive CTE covers our needs and avoiding a second query language reduces user-facing complexity. Cypher reappears at Tier 3 via Apache AGE.

### 3.5 Pivot / cross-tabulation

DuckDB has native `PIVOT`. For the controls × evidence matrix:

```sql
PIVOT (
  SELECT c.framework_id AS control,
         CASE WHEN ev.evidence_uuid IS NOT NULL THEN 1 ELSE 0 END AS covered,
         e.framework_id AS evidence
  FROM node c
  LEFT JOIN edge_evidence ev ON ev.control_uuid = c.uuid
  LEFT JOIN node e ON e.uuid = ev.evidence_uuid
  WHERE c.kind = 'control' AND c.ontology = 'nist-800-53'
)
ON evidence
USING MAX(covered)
GROUP BY control;
```

For larger pivots or live re-faceting, intermediate results can be passed via Apache Arrow IPC into a thin **Polars-JS or Arquero** layer in the renderer. That keeps DuckDB-WASM doing what it's best at (heavy joins, recursion) and the renderer doing fast UI re-facets without a SQL round-trip.

### 3.6 File-watcher pattern (lessons from Dataview / Datacore / Bases)

- **Dataview** indexes everything in memory at plugin start, then patches incrementally on `vault.modify`. Performance issues come from synchronous re-render on the main thread.
- **Datacore** explicitly designed to fix this: indexer runs in a Web Worker, uses immutable index snapshots, React re-renders are flicker-free, and a multi-file persistence backend is on the roadmap (the existing IndexedDB cache hits hard limits on large vaults).
- **Bases** (core feature since 1.9.10) is the fastest of the three because it consumes only frontmatter, with no inline-field parsing.

Crosswalker's Tier 2 indexer should adopt the **Datacore worker pattern**: parse markdown in a Web Worker, push deltas into DuckDB-WASM via prepared statements, never block main thread. Maintain an in-memory `Map<file_path, file_hash>` to skip unchanged files on full reindex.

---

## 4. Tier 3 Design — Server-Backed

### 4.1 What changes when a server budget exists

Three things become possible that are not feasible in-browser:

1. **True multi-tenant collaboration** with row-level access control, audit logging, and SSO — material for enterprise GRC.
2. **Native graph traversal at scale** with proper graph indexes, beyond what recursive CTEs can offer for vaults exceeding ~10⁶ nodes / 10⁷ edges.
3. **Full RDF reasoning** for SSSOM/SKOS/OWL semantics — closure under transitive properties, equivalence classes, etc. — for which a SPARQL engine is the appropriate tool.

### 4.2 Recommended stack

- **Primary: PostgreSQL + Apache AGE.** Single Postgres instance gives you full SQL (so all Tier 2 queries port directly), `MATERIALIZED VIEW` with `REFRESH ... CONCURRENTLY`, partitioning for large evidence tables, and Cypher via AGE for graph traversal. AGE's openCypher is mature; there is recent ecosystem activity (Microsoft documents combining AGE with pgvector for graph + semantic retrieval). Apache 2.0 license, ASF governance, no commercial lock-in.
- **Secondary: Oxigraph (server build with RocksDB).** Optional sidecar for SSSOM/SKOS/STRM workloads where SPARQL property paths and RDF reasoning are the right tool. Run as a SPARQL endpoint behind the same gateway. Apache 2.0/MIT dual license.
- **Reject: Neo4j Community.** GPLv3 license complicates redistribution; Cypher-only model duplicates AGE; commercial-edition pricing is incompatible with a local-first ethos.

### 4.3 Synchronization model

The server is **another derived store**, not a replacement for files. Three deployment modes:

1. **Single-user upgrade**: user pushes a button; plugin uploads files (or a snapshot) to a personal server; server rebuilds AGE/Postgres from files; queries can route to either Tier 2 (in-browser) or Tier 3 (server).
2. **Team sync**: a Git-backed vault is the canonical store; a CI job rebuilds the server-side database from every push; users still edit files locally, see the server only for read-heavy queries.
3. **Live-edit team mode**: not recommended initially; would require resolving the "who-writes-the-file" question and breaks file canonicity.

Tier 3 must respect the universal contract: **server-side writes must be projected back to files.** The mechanism is an `editor` API that opens a PR / commit against the source repo, never an in-place row update.

### 4.4 Cost-of-server ceiling

Tier 3 is justified roughly when:
- Vault size > 200 MB of markdown, or
- Concurrent editors > 5, or
- Audit/SSO/RBAC is mandated, or
- Cross-vault federation (multi-tenant crosswalk catalog) is required.

Below those thresholds, Tier 2 is sufficient and Tier 3 is overkill.

---

## 5. Data-Flow Contract (Formal)

The architecture is governed by five invariants. All components must observe them.

### Invariant 1 — File canonicity

> The vault (a set of markdown files with YAML frontmatter, plus folders implying hierarchy) is the **only persistent source of truth**. All other stores are caches.

Corollary: deleting any non-file store must be a no-op for correctness. A user can `rm -rf` the DuckDB-WASM database and the server, and reconstruct everything from `git checkout`.

### Invariant 2 — Determinism / idempotency

> Given the same set of files at the same content hashes, every derived store must rebuild to a byte-identical (or at minimum row-equivalent) result.

Implementation requirement: every derived row records `(source_file_path, source_file_hash, generator_version)`. A rebuild that skips unchanged inputs and produces the same outputs is mandatory.

### Invariant 3 — Staleness is explicit, never silent

> Whenever a derived store reflects a file state older than the current file state, the user-visible artifact must show that fact.

Mechanisms: `.view.stale` flag at Tier 1; "Index is N seconds behind" indicator at Tier 2; "Last sync: ..." label at Tier 3.

### Invariant 4 — Writes always land in files

> No user action that mutates Crosswalker data may write only to a derived store. Every mutation flows: UI → file edit → file-watcher → derived store update.

Concretely: a "set confidence = 0.9" action in a Tier 2 table editor edits the source markdown, saves it, and lets the watcher round-trip. The DuckDB row update happens *because* the file changed, not directly.

### Invariant 5 — Cross-tier query routing is transparent

> A query may target Tier 1, Tier 2, or Tier 3, and the query language at each tier is allowed to differ, but the answer must be the same modulo staleness disclosed by Invariant 3.

This implies a **query planner thin shim**: given a request like "compliance matrix for NIST AC family × evidence corpus," the shim picks Tier 1 if a fresh materialized folder exists, falls back to Tier 2 if DuckDB is loaded, and uses Tier 3 only when the user requested it or vault size exceeds Tier 2 ceiling. A user always sees one logical answer, with provenance.

### Error handling

- **Parse error in a markdown file**: the file is skipped at Tier 2 with a row in an `index_errors` table; UI surfaces the error. Other files remain queryable.
- **Schema drift** (new ontology field shows up): Tier 2 stores it in the `frontmatter` JSON column; queries continue to work; a separate "schema audit" view flags new fields for the user to formalize.
- **Hash collision / mtime regression** (clock skew, git checkouts): always trust content hash over mtime.
- **Tier 2 corruption**: drop and rebuild from files. Always safe under Invariant 1.

---

## 6. Multi-Hop Spine Render — Worked Example

**The query:** "For every NIST 800-53 AC-family control, find every two-hop path through any spine ontology to a CIS Controls v8 control, and emit one merged row with metadata from all three legs."

### 6.1 In Cypher (illustrative — Tier 3 / Apache AGE)

```cypher
MATCH (subj:Control {ontology:'nist-800-53'})-
      [r1:CROSSWALK]->
      (sp:SpineConcept)-
      [r2:CROSSWALK]->
      (obj:Control {ontology:'cis-v8'})
WHERE subj.framework_id STARTS WITH 'AC-'
  AND r1.confidence >= 0.5
  AND r2.confidence >= 0.5
RETURN subj.framework_id   AS subject_id,
       subj.title          AS subject_title,
       sp.framework_id     AS spine_id,
       sp.title            AS spine_title,
       obj.framework_id    AS object_id,
       obj.title           AS object_title,
       least(r1.confidence, r2.confidence) AS chain_conf_min,
       (r1.confidence + r2.confidence)/2.0 AS chain_conf_avg
ORDER BY subject_id, spine_id, object_id;
```

In Apache AGE this is wrapped in `SELECT * FROM cypher('crosswalker_graph', $$ ... $$) AS (subject_id agtype, ...);`.

### 6.2 In DuckDB-WASM (Tier 2 — recommended primary)

A two-hop traversal does not strictly need a recursive CTE; it is a join chain. But we write it as a recursive CTE anyway to demonstrate the pattern, since real spine renders may be 3–4 hops:

```sql
WITH RECURSIVE
-- Anchor: starting NIST AC-family controls
anchor AS (
    SELECT n.uuid          AS subject_uuid,
           n.framework_id  AS subject_id,
           n.title         AS subject_title
    FROM node n
    WHERE n.kind = 'control'
      AND n.ontology = 'nist-800-53'
      AND n.framework_id LIKE 'AC-%'
),
-- Recursive walk: extend the path one edge at a time, capturing
-- the running confidence chain and visited set.
walk(subject_uuid, subject_id, subject_title,
     current_uuid, current_kind, current_ontology, current_id, current_title,
     hop_count, conf_chain, visited) AS (
    -- Base case: zero-hop; we're sitting on the anchor itself
    SELECT a.subject_uuid, a.subject_id, a.subject_title,
           a.subject_uuid, 'control', 'nist-800-53',
           a.subject_id, a.subject_title,
           0, ARRAY[]::DOUBLE[], ARRAY[a.subject_uuid]
    FROM anchor a
    UNION ALL
    -- Inductive: take any outgoing crosswalk edge from current_uuid
    SELECT w.subject_uuid, w.subject_id, w.subject_title,
           n2.uuid, n2.kind, n2.ontology,
           n2.framework_id, n2.title,
           w.hop_count + 1,
           list_append(w.conf_chain, e.confidence),
           list_append(w.visited, n2.uuid)
    FROM walk w
    JOIN edge_crosswalk e ON e.src_uuid = w.current_uuid
    JOIN node n2          ON n2.uuid   = e.dst_uuid
    WHERE w.hop_count < 2                                 -- depth limit
      AND e.confidence >= 0.5
      AND NOT list_contains(w.visited, n2.uuid)            -- no cycles
),
-- Filter: keep only walks that landed on a CIS v8 control after exactly 2 hops
final AS (
    SELECT subject_id,
           subject_title,
           visited[2]   AS spine_uuid,
           current_id   AS object_id,
           current_title AS object_title,
           conf_chain,
           list_min(conf_chain) AS chain_conf_min,
           list_avg(conf_chain) AS chain_conf_avg
    FROM walk
    WHERE hop_count   = 2
      AND current_kind = 'control'
      AND current_ontology = 'cis-v8'
)
SELECT f.subject_id,
       f.subject_title,
       sp.framework_id AS spine_id,
       sp.title        AS spine_title,
       f.object_id,
       f.object_title,
       f.chain_conf_min,
       f.chain_conf_avg,
       (
         SELECT COUNT(*)
         FROM edge_evidence ev
         WHERE ev.control_uuid IN (
             SELECT n.uuid FROM node n
             WHERE n.framework_id IN (f.subject_id, f.object_id)
         )
       ) AS evidence_count
FROM final f
JOIN node sp ON sp.uuid = f.spine_uuid
ORDER BY f.subject_id, spine_id, f.object_id;
```

This single query produces exactly the row schema that the Tier 1 materialized notes encode in their YAML frontmatter; the Tier 1 generator is essentially this query plus a "for each row, emit a `.md` file" step.

### 6.3 In SPARQL (Oxigraph — illustrative, RDF case)

```sparql
PREFIX sssom:  <https://w3id.org/sssom/>
PREFIX strm:   <https://csrc.nist.gov/projects/olir/strm#>
PREFIX cw:     <urn:crosswalker:>

SELECT ?subject_id ?subject_title ?spine_id ?spine_title ?object_id ?object_title
WHERE {
  ?subj a cw:Control ;
        cw:ontology "nist-800-53" ;
        cw:frameworkId ?subject_id ;
        cw:title ?subject_title .
  FILTER(STRSTARTS(?subject_id, "AC-"))

  ?subj (strm:equivalent|sssom:closeMatch)/(strm:equivalent|sssom:closeMatch) ?obj .

  ?subj (strm:equivalent|sssom:closeMatch) ?spine .
  ?spine cw:frameworkId ?spine_id ;
         cw:title ?spine_title .

  ?obj a cw:Control ;
       cw:ontology "cis-v8" ;
       cw:frameworkId ?object_id ;
       cw:title ?object_title .
}
ORDER BY ?subject_id ?spine_id ?object_id
```

SPARQL property paths (`a/b` for sequence, `a|b` for alternative, `a*` for transitive closure) are the most concise expression, but Oxigraph in WASM is in-memory only and slower than DuckDB at large joins; this is the right tool only when the question genuinely needs RDF semantics.

### 6.4 Comparative remarks

| Feature | Cypher (AGE) | Recursive CTE (DuckDB) | SPARQL property paths (Oxigraph) |
|---|---|---|---|
| Conciseness for fixed-depth paths | best | medium | best |
| Conciseness for variable-depth | good (`*1..5`) | medium | best (`*`) |
| Support for tabular pivots / aggregates | weak | best | weak |
| Support for confidence-chain math | medium | best | weak |
| Performance on >10⁶ edges | best (graph indexes) | good (vectorized joins) | poor (in-WASM) |
| Available in browser (May 2026) | no | **yes** | yes (in-memory only) |
| Used as Crosswalker default | Tier 3 only | **Tier 2 default** | Tier 3 optional |

The recursive-CTE version is verbose but it is the version that runs in the user's browser without a server, and it produces *exactly* the columns we ship to Tier 1 materialization.

---

## 7. Cost Ceilings and Migration Triggers

These are design-time targets, not benchmarks (per the challenge's out-of-scope clause). They should be revisited once Challenge 02 supplies real numbers.

| Metric | Tier 1 (Bases + materialized folders) | Tier 2 (DuckDB-WASM) | Tier 3 (Postgres + AGE) |
|---|---|---|---|
| Total notes in vault | up to ~10,000 | up to ~250,000 | effectively unbounded |
| Total crosswalk edges | up to ~30,000 (single-folder ceiling 5,000 rows × ~6 views typical) | up to ~5M | unbounded |
| Materialized rows visible in one Bases view | ~5,000 (Bases tested limits) | n/a | n/a |
| Cold-load time (plugin startup) | <1 s (pure file-read) | 5–30 s for full reindex of 50k notes | server-side, unaffected |
| Query latency, simple filter | <100 ms (Bases) | <100 ms (DuckDB) | 10–50 ms (server) |
| Query latency, 2-hop spine render, 1k anchors | unsupported (no joins) | seconds | sub-second |
| Query latency, 4-hop transitive closure, 10k anchors | unsupported | tens of seconds → unusable | sub-second |
| Concurrent editors | 1 | 1 | many |
| Persistence model | files | files + OPFS DB cache | files + server DB |
| Migration trigger UP | Bases user hits "no joins" wall, or wants a multi-hop view | Indexer cold load > 60 s, or query latency > 5 s, or vault > ~250k notes | n/a (top tier) |
| Migration trigger DOWN | always usable as a fallback | available alongside Tier 1 | optional add-on |

Migration is **non-destructive in both directions** because of Invariant 1: moving from Tier 2 down to Tier 1 just means "stop loading DuckDB"; moving from Tier 3 down means "stop syncing to server." Files keep working at every level.

---

## 8. Build vs Integrate vs Hybrid — Recommendation

**Recommendation: Hybrid, as enumerated below.**

| Tier | Strategy | What gets built in-house | What gets integrated |
|---|---|---|---|
| Tier 1 | **Build** | Materialized-folder generator: view-spec parser, dependency manifest, file emitter, staleness-marker watcher, hard ceilings | Bases (consumes the YAML); optional Datacore for cases where Bases is too restrictive |
| Tier 2 | **Integrate** | Vault indexer (markdown→DuckDB) in a Web Worker; query-builder UI; Tier-1-emitter that converts query results to materialized folders | **DuckDB-WASM** (engine + WASM bundle); Apache Arrow JS (IPC); optionally Polars-JS or Arquero for in-renderer pivots |
| Tier 3 | **Integrate** | Sync agent (file-canon ↔ server); auth layer; web UI shell | **PostgreSQL + Apache AGE**; optionally **Oxigraph server** for RDF/SPARQL workloads |

### Rationale against the alternatives

- **Pure integrate** (e.g., DuckDB-WASM at Tier 2 + a single big Bases view at Tier 1) fails because Bases cannot do joins or pivots; a graph user *needs* multi-hop spine renders, and Bases will not learn that capability on a useful timescale. The only honest way to give Bases such a view is to pre-compute it. So Tier 1 must include build work.
- **Pure build** (Crosswalker-internal markdown→graph→table engine, all bespoke) underestimates the cost of reimplementing a query optimizer, recursive CTE evaluator, columnar storage, OPFS persistence, etc. DuckDB-WASM gives all of that for the price of a 6 MB binary and an MIT license. There is no advantage to reinventing it. Do not build at Tier 2.
- **The KuzuDB temptation**: Kuzu is technically the cleanest fit (Cypher for the graph, columnar for tables, WASM for browser) and we should be honest that, had Kuzu remained healthy, it would arguably be the *primary* Tier 2 engine. Its archival on 10 October 2025 closes that door for a multi-year-horizon project. Revisit if a fork (Kineviz "bighorn" or similar) demonstrates 12 months of stable releases.

### Sequencing

1. **Phase 1** — Tier 1 materialized-folder generator with the Spine Render and Compliance Matrix view types. Ships first because it works on every Obsidian install and produces immediately useful artifacts.
2. **Phase 2** — Tier 2 DuckDB-WASM sidecar with the same view types, now interactive and joinable. Tier 1 generator is rewritten to emit by *running a Tier 2 query and serializing*, eliminating duplicate logic.
3. **Phase 3** — Tier 3 server option, gated behind enterprise/team mode. Optional Oxigraph for RDF reasoning workloads.

---

## 9. Risks and Open Questions

- **DuckDB-WASM bundle size in a plugin context.** A 6+ MB initial download is large for an Obsidian community plugin. Lazy-load on first analytical query rather than at plugin startup, and offer a "Tier 1 only" mode for users who decline the download.
- **OPFS availability inside Obsidian's Electron context** is not guaranteed across mobile/desktop variants. Fallback to in-memory rebuild from files on every plugin start, which is acceptable for vaults under ~50k notes.
- **Pivot tables on very wide axes** (e.g., evidence × all 1,200 NIST controls) produce sparse results that DuckDB pivots correctly but the renderer must virtualize. This is a UI concern (out of scope) but the Tier 2 query must `LIMIT` or `WHERE` aggressively.
- **Round-tripping user edits**: editing a confidence value via a DuckDB-rendered table requires the plugin to know which markdown file owns the row and which YAML field maps to which column. This is straightforward when the indexer keeps `(file_path, frontmatter_path)` provenance per cell; it is fiddly in the implementation.
- **Cycle detection in recursive CTEs**: the worked example uses `list_contains(visited, n2.uuid)`, which is O(n) per step. For deeper traversals (>4 hops on dense graphs) this becomes the bottleneck; promote to Tier 3 (AGE) where graph indexes natively prevent revisits.
- **Kuzu fork emergence.** If "bighorn" or another Kuzu fork demonstrates production stability and active maintenance for ~12 months, revisit this design — Cypher-on-WASM with a real graph DB would simplify Tier 2 substantially.
- **Apache AGE PostgreSQL version coupling.** AGE supports PostgreSQL 11–18; deployers must pin compatible versions. Plan for upstream lag when new Postgres majors release.

---

## 10. Concrete Deliverables Checklist (mapped to success criteria)

| # | Success criterion | Where in this document |
|---|---|---|
| 1 | Engine evaluation matrix | §1 |
| 2 | Tier 1 design (spec, format, trigger, staleness, ceiling) | §2.1–§2.6 |
| 3 | Tier 2 design (engine, schema, round-trip) | §3.1–§3.6 |
| 4 | Tier 3 design (server budget) | §4.1–§4.4 |
| 5 | Data-flow contract with invariants | §5 (Invariants 1–5 + error handling) |
| 6 | Multi-hop spine render worked example | §6.1–§6.4 (Cypher, recursive CTE, SPARQL) |
| 7 | Cost ceilings per tier | §7 |
| Bonus | Build/integrate/hybrid recommendation with rationale | §0 + §8 |

This document is intended to be implementable as-is: the SQL schema in §3.2 is concrete, the recursive-CTE in §6.2 runs in DuckDB-WASM, the Tier 1 file format in §2.2 is exact, and the invariants in §5 give every implementer a single decision rule for ambiguous cases ("does this violate Invariant 1?").
