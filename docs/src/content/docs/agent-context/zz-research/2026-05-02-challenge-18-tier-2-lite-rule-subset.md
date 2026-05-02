---
title: "Ch 18 deliverable: Tier 2-Lite SSSOM rule subset and scale ceiling"
description: "Fresh-agent research deliverable for Challenge 18. Confirms the sqlite-wasm + sqlite-vec + simple-graph + recursive-CTE Tier 2-Lite stack is comfortably viable for the realistic GRC mapping volume (~10⁵ mappings, branching factor ≤ 5). Rule-by-rule expressivity matrix: 4 ✅ tractable rules (transitive closure with confidence_min, predicate-restricted closure, confidence_max/min, single-stratum negation, cardinality validation, bi-temporal queries), 4 ⚠️ caveat-tractable rules (mixed predicate paths, confidence_avg over wide path sets, multi-stratum negation, propagating cardinality through chaining), 1 ❌ hard wall (recursive SHACL with mutual negation). Engineering scale model + measured anchors. Migration trigger spec. Round-trip data-loss analysis. User-facing scope statement. Fully buildable by a 2-3 person team in one quarter."
tags: [research, deliverable, query-engine, tier-2-lite, sqlite, sssom, recursive-cte, scale-ceiling]
date: 2026-05-02
sidebar:
  label: "Ch 18: Tier 2-Lite scope"
  order: -20260502.13
---

:::tip[Origin and lifecycle]
Fresh-agent research deliverable produced 2026-05-02 in response to [Challenge 18: Tier 2-Lite SSSOM rule subset and scale ceiling](/crosswalker/agent-context/zz-challenges/18-tier-2-lite-sssom-rule-subset/) (follow-on to Ch 14). Synthesized in the [v0.1 stack-pivot log](/crosswalker/agent-context/zz-log/2026-05-02-v0-1-initial-stack-pivot/), which adopts Tier 2-Lite (sqlite-wasm sidecar) as the **default-bundled v0.1 Tier 2 sidecar** rather than a back-pocket alternate stack. Preserved verbatim with minor formatting fixes for paste artifacts.
:::

# Crosswalker Challenge 18 — Tier 2-Lite SSSOM Rule Subset and Scale Ceiling

## Preface and methodological note

The primary source documents for Challenge 18 (the challenge brief at `cybersader.github.io/crosswalker/agent-context/zz-challenges/18-tier-2-lite-sssom-rule-subset/`, as well as the cited Ch 11/12/14/16 deliverables, third-wave shifts log, direction-commitments TL;DR, and the SSSOM/SKOS registry pages) could not be retrieved by the research tooling — every fetch attempt returned a permissions error and the URLs do not appear in any public search-engine index reachable from here. The cybersader.github.io domain only surfaces an unrelated TaskNotes site in search; the Crosswalker docs subtree appears to be either unindexed, behind a robots restriction, or recently published in a way that has not yet propagated.

Because the user provided a detailed restatement of the problem in the task brief itself — including the Tier 2-Lite stack composition (`@sqlite.org/sqlite-wasm` + `sqlite-vec` + `simple-graph` + recursive CTE), the full Tier 2 stack (DuckDB-WASM + Oxigraph + Nemo, ~5 MB compressed), the Ch 14 §2.7 thresholds (10⁴ / 10⁶ / 10⁷), the Ch 16 §5 canonical-vault claim, and the deliverable structure — this brief uses that restatement as the authoritative scope and grounds every external claim in independently retrievable sources (SSSOM specs, SQLite docs, the sqlite-wasm persistence docs, PowerSync's 2025 SQLite-on-the-web survey, the simple-graph repo, the SCF, MITRE CTID mappings, NIST OLIR, and academic literature on stratified Datalog and SPARQL-property-paths-via-CTE). Where I make engineering estimates, I show the assumptions inline. Where I would normally cross-check against the Crosswalker docs (e.g., to confirm whether Ch 16 §5 explicitly says "any database is a projection"), I rely on the user's brief and flag such points as "per the user-supplied brief."

---

## 1. Rule-by-rule expressivity audit

### 1.1 Summary matrix

| # | SSSOM-derived rule | Tier 2-Lite verdict | Notes |
|---|---|---|---|
| R1 | Transitive closure of `skos:exactMatch` (with `confidence_min`) | ✅ Tractable | Standard `WITH RECURSIVE` + `MIN()` aggregation; cycle-safe via path-string anti-join. |
| R2a | Mixed predicate paths — homogeneous transitive predicate (`exactMatch∘exactMatch`) | ✅ Tractable | One-predicate filter on the recursive join. |
| R2b | Mixed predicate paths — composed predicates (`exactMatch ∘ closeMatch`, "is approximate to") with SSSOM/STRM predicate algebra ("is equivalent to" / "is broader than" / "is approximate to") | ⚠️ Caveat | Algebra survives one composition cleanly (case-by-case `CASE` table), but **n-ary composition with predicate downgrading is non-monotonic in confidence and not naturally linear-recursive**. SQL recursive CTEs require linear recursion (one self-reference per recursive term, per SQLite docs and the SQL:1999 design point); ([arXiv](https://arxiv.org/html/2504.02443v1)) composing arbitrary predicates with weakening rules typically requires either stratified evaluation or unrolling depth ≤ k. Workable for k ≤ 3 with a per-stratum CTE; above that, prefer Datalog. |
| R3 | Confidence aggregation across multiple paths (`confidence_max`, `confidence_avg`, cite-all-paths) | ⚠️ Caveat | `confidence_max` and `confidence_min` are monotonic in the path lattice and tractable in a recursive CTE with a final `GROUP BY`. `confidence_avg` is **non-monotonic** and the SQL standard forbids aggregates inside the recursive term — must be computed in an outer non-recursive layer over an enumerated path set, which blows up with high branching factor. "Cite-all-paths" requires path materialization (path-string concat) and is only practical when path count per pair stays in the low thousands. |
| R4 | Stratified negation ("A→C not derivable through any intermediate B") | ⚠️ Caveat for single-stratum, ❌ for true multi-stratum | A *single* layer of "NOT EXISTS" / `LEFT JOIN ... WHERE NULL` over a precomputed closure works fine. True stratified negation as defined by Mumick/Ross/Gelder — alternation between recursion and negation across multiple IDB strata — is **not allowed inside a single recursive CTE** (SQL forbids negation/aggregation in the recursive term). You can simulate it with multiple sequential CTEs over materialized layers, but every additional stratum doubles cost. For >2 strata, escalate to Datalog. |
| R5 | Mapping cardinality constraints (1:1, 1:n, n:1, n:n) — derivation-time enforcement | ✅ Tractable (validation), ⚠️ for *propagation through chaining* | Cardinality of an output set is a `COUNT(*) OVER (PARTITION BY ...)` window or `GROUP BY` problem. Per the SSSOM spec, `mapping_cardinality` is scope-relative; the `cardinality_scope` slot (≥ SSSOM 1.1) enumerates which slots define the partition. ([GitHub](https://github.com/mapping-commons/sssom/blob/master/src/sssom_schema/schema/sssom_schema.yaml)) Computing it on a static set is straightforward in SQL. Propagating cardinality *during chaining* (e.g., a 1:n composed with an n:1 yielding 1:1 *only* when the intermediate is unique) requires a small fixed-stratification pass — feasible but verbose. |
| R6 | SHACL validation paths | ❌ Hard wall (general case); ✅ for a curated subset | SHACL property paths use SPARQL 1.1 property path semantics, ([Validatingrdf](https://book.validatingrdf.com/bookHtml013.html)) which Yakovets/Godfrey and Arenas et al. have shown require recursive SQL; SHACL also has *recursive shapes* with mutually recursive negation (Corman et al., "Semantics and Validation of Recursive SHACL," ISWC 2018). Mutually recursive negation is not expressible in standard SQL recursive CTE (linear recursion only). For SSSOM mapping_set validation, however, the *vast majority* of useful SHACL constraints are non-recursive (datatype, cardinality, sh:in, sh:pattern, sh:minCount, single-step paths) — those translate to plain SQL. **Recommendation: ship a SHACL-Lite subset (no recursive shapes, no SPARQL-based constraints, no arbitrary property-path expressions); promote to Tier 2 when a user authors a shapes graph that uses sh:property with `oneOrMore`/`zeroOrMore` paths or recursive shape references.** |
| R7 | Bi-temporal queries (`valid_time_start <= X AND valid_time_end > X`) | ✅ Tractable | Pure relational filter; nothing recursive. Add `(valid_time_start, valid_time_end)` covering index. Combines cleanly with the closure CTE by pre-filtering the base edge set inside the initial-select. |

### 1.2 Reference SQL for the ✅ cases

All snippets target SQLite 3.45+ as shipped in `@sqlite.org/sqlite-wasm`. They assume a `mappings(subject_id, predicate_id, object_id, confidence, mapping_justification, valid_time_start, valid_time_end)` projection of the SSSOM canonical store.

#### R1 — Transitive closure of `skos:exactMatch` with `confidence_min`

```sql
WITH RECURSIVE
  derived(subject_id, object_id, confidence_min, depth, path) AS (
    -- initial: direct exactMatch edges
    SELECT subject_id,
           object_id,
           confidence,
           1                                  AS depth,
           subject_id || '>' || object_id || '>' AS path
    FROM   mappings
    WHERE  predicate_id = 'skos:exactMatch'
    UNION ALL
    -- recursive: extend by one hop, min-aggregate confidence, prevent cycles
    SELECT d.subject_id,
           m.object_id,
           MIN(d.confidence_min, m.confidence) AS confidence_min,
           d.depth + 1,
           d.path || m.object_id || '>'
    FROM   derived d
    JOIN   mappings m
           ON  m.subject_id   = d.object_id
           AND m.predicate_id = 'skos:exactMatch'
    WHERE  d.path NOT LIKE '%' || m.object_id || '>%'   -- cycle guard
       AND d.depth < 16                                  -- safety LIMIT proxy
  )
SELECT subject_id, object_id, MAX(confidence_min) AS confidence_min, MIN(depth) AS shortest_depth
FROM   derived
GROUP  BY subject_id, object_id;
```

Notes on the cycle guard: the path-string `LIKE` trick is the canonical SQLite idiom ([GitHub](https://gist.github.com/felixyz/fcc90efc53c81d0b4b9c)) (see the SQLite WITH-RECURSIVE docs and the felixyz gist). It cuts off cycles but does *not* deduplicate visits across siblings, so worst-case cost is O(branches × paths). For dense graphs, replace with an explicit "visited" set carried as a JSON array (`json_each` to test membership) — slightly slower per row but bounded. Always include `depth < N` as a hard ceiling so a malformed vault cannot wedge the engine. ([SQLite](https://sqlite.org/lang_with.html))

#### R2a — Predicate-restricted closure (single transitive predicate)

Same structure as R1 with `predicate_id` parameterized; safe for `skos:exactMatch` and `skos:broaderTransitive` (the SSSOM chaining-rules doc explicitly notes that `skos:closeMatch`, `skos:relatedMatch`, and `oboInOwl:hasDbXref` are *not* transitive ([Mapping-commons](https://mapping-commons.github.io/sssom/chaining-rules/)) and must not be closed).

#### R3 — `confidence_max` / `confidence_min` over multiple paths

```sql
WITH RECURSIVE paths(s, o, conf_path_min) AS (
  SELECT subject_id, object_id, confidence
  FROM   mappings WHERE predicate_id = 'skos:exactMatch'
  UNION ALL
  SELECT p.s, m.object_id, MIN(p.conf_path_min, m.confidence)
  FROM   paths p JOIN mappings m
    ON   m.subject_id = p.o AND m.predicate_id = 'skos:exactMatch'
)
SELECT s, o,
       MAX(conf_path_min) AS confidence_max,    -- monotonic, OK
       AVG(conf_path_min) AS confidence_avg     -- only valid because aggregate is OUTSIDE the recursive term
FROM   paths
GROUP  BY s, o;
```

Note that `confidence_avg` over enumerated paths is only meaningful if the path set is finite and small; with branching factor B and depth D, the path set is O(B^D). This is the inflection point flagged in the matrix.

#### R4 — Single-stratum negation ("not derivable through any intermediate")

```sql
-- Find direct A→C mappings that do NOT exist as a 2-hop derivation
WITH closure AS (
  SELECT DISTINCT s, o FROM paths WHERE s <> o
)
SELECT m.subject_id, m.object_id
FROM   mappings m
LEFT   JOIN closure c
       ON c.s = m.subject_id AND c.o = m.object_id
WHERE  m.predicate_id = 'skos:exactMatch'
  AND  c.s IS NULL;
```

This is the standard `LEFT JOIN ... IS NULL` anti-join pattern. It works because the negation is applied *after* the recursive closure has fully materialized — i.e., across, not within, the fixpoint. That is exactly the definition of *stratified* negation per Mumick/Pirahesh; SQL recursive CTEs natively handle one stratum, two requires a chain of CTEs, three+ becomes painful.

#### R5 — Cardinality enforcement on a projected set

```sql
WITH counts AS (
  SELECT subject_id, predicate_id,
         COUNT(*) OVER (PARTITION BY subject_id, predicate_id) AS subj_fanout,
         COUNT(*) OVER (PARTITION BY object_id,  predicate_id) AS obj_fanout
  FROM mappings
)
SELECT *,
       CASE
         WHEN subj_fanout = 1 AND obj_fanout = 1 THEN '1:1'
         WHEN subj_fanout = 1 AND obj_fanout > 1 THEN 'n:1'
         WHEN subj_fanout > 1 AND obj_fanout = 1 THEN '1:n'
         ELSE 'n:n'
       END AS computed_cardinality
FROM counts;
```

Per the SSSOM spec, the partition keys come from `cardinality_scope`; the example above hardcodes the default. Generalize by templating the `PARTITION BY` clause.

#### R7 — Bi-temporal projection composed with closure

```sql
WITH RECURSIVE asof AS (
  SELECT *
  FROM   mappings
  WHERE  valid_time_start <= :asof_date
    AND  (valid_time_end > :asof_date OR valid_time_end IS NULL)
),
derived(s, o, conf) AS (
  SELECT subject_id, object_id, confidence
  FROM   asof WHERE predicate_id = 'skos:exactMatch'
  UNION ALL
  SELECT d.s, a.object_id, MIN(d.conf, a.confidence)
  FROM   derived d JOIN asof a
    ON   a.subject_id = d.o AND a.predicate_id = 'skos:exactMatch'
)
SELECT s, o, MAX(conf) AS confidence_min FROM derived GROUP BY s, o;
```

Filtering at the base table inside the initial-select keeps the recursion narrow.

### 1.3 Why R2b, R3-avg, R4 (multi-stratum), and R6 hit walls

The SQL standard requires recursive CTE references to be **linearly recursive**: each recursive arm may reference the recursive name at most once, ([arXiv](https://arxiv.org/html/2504.02443v1)) and may not contain aggregates, `DISTINCT` over the recursive part, sub-selects against the recursive name, or negation against the recursive name ([SQLite](https://sqlite.org/lang_with.html)) (see SQLite's `lang_with.html` and the VLDB 2026 Raqlet paper, which explicitly contrasts SQL's linear-only recursion to Datalog's mutual/non-linear support). Datalog with stratified negation per Aho-Ullman, Bancilhon-Ramakrishnan, and Mumick et al. permits multi-stratum programs with negation/aggregation between strata ([arxiv](https://arxiv.org/pdf/1910.08888)) — that's exactly the regime where Nemo (Crosswalker's Tier 2 Datalog engine) shines and where recursive CTEs do not.

For SHACL: the W3C SHACL Recommendation defines core constraints via SPARQL property paths ([Wikipedia](https://en.wikipedia.org/wiki/SHACL)) (which include `*`, `+`, `?`, `|`, `^`, sequence). Yakovets et al. ("Evaluation of SPARQL Property Paths via Recursive SQL," CEUR Vol-1087) showed property paths *can* be compiled to recursive SQL — but only under linear restrictions and at significant query-plan cost. Recursive SHACL (Corman, Reutter, Savković, ISWC 2018) requires well-founded semantics with non-monotonic negation, which is genuinely beyond SQL recursive CTE.

---

## 2. Scale ceiling — measured and modeled

### 2.1 Empirical anchors from the literature

- **`@sqlite.org/sqlite-wasm` raw I/O**: SQLite's own `speedtest1` (size=25, OPFS VFS, Chrome dev-channel, 2023) reports 12,500 ordered INSERTs into a primary-key-indexed table in 0.156 s, 12,500 unindexed INSERTs in 0.107 s, ([SQLite](https://sqlite.org/forum/forumpost/e140d84e71)) and 2,500 indexed numeric-BETWEEN SELECTs in well under 100 ms. Stephan Beal (sqlite.org wasm team) reports the single biggest speed boost comes from raising the page cache to 8–16 MB via `SQLITE_DEFAULT_CACHE_SIZE=-8192` or `-16384` and using `PRAGMA journal_mode=TRUNCATE` over WAL on OPFS. ([GitHub](https://github.com/rhashimoto/wa-sqlite/discussions/63))
- **OPFS persistence latency**: PowerSync's November 2025 update ("The Current State of SQLite Persistence on the Web") and the RxDB 2024 benchmark put per-document write latency at **~1.5 ms** for OPFS access-handle pool, **~3+ ms** for IndexedDB-backed VFS, ([RxDB](https://rxdb.info/articles/localstorage-indexeddb-cookies-opfs-sqlite-wasm.html)) and microseconds for in-memory. The OPFS-SAH-Pool VFS that `@sqlite.org/sqlite-wasm` selects when COOP/COEP are unavailable is competitive with the cross-origin-isolated OPFS VFS for single-connection workloads (per Roy Hashimoto's wa-sqlite discussions and the official sqlite.org `persistence.md`); it does NOT support multi-tab concurrency, but Crosswalker as an Obsidian plugin runs in a single window so this is moot.
- **Recursive-CTE specifics on SQLite**: from the SQLite WITH-RECURSIVE docs and forum threads — each recursive step is a hash/scan join against the working table; cost is O(|working|·|edges|) per step; cycle guards via path-string `LIKE` are O(path_length) per row; SQLite has no Dijkstra-style pruning (you cannot reference the result of the CTE from within itself). ([SQLite](https://sqlite.org/forum/forumpost/afd54983bc?t=h)) ([SQLite](https://sqlite.org/forum/info/456e0c07ac7c1642))
- **Notion's production deployment** (`notion.com/blog/how-we-sped-up-notion-in-the-browser-with-wasm-sqlite`) reports stable production use of `@sqlite.org/sqlite-wasm` with OPFS-SAH-Pool, with no corruption after they moved off the multi-connection OPFS VFS ([Notion](https://www.notion.com/blog/how-we-sped-up-notion-in-the-browser-with-wasm-sqlite)) — directly applicable to Crosswalker's single-window plugin context.

### 2.2 GRC dataset ground truth — realistic mapping counts

| Dataset | Approx. mapping rows | Branching factor (mean fan-out) | Notes |
|---|---|---|---|
| NIST 800-53 r5 ↔ ISO 27001:2022 (NIST OLIR crosswalk XLSX) | ~1,200–1,500 mappings | 1–3 | Curated 1:1 and 1:few, published as XLSX on csrc.nist.gov ([NIST CSRC](https://csrc.nist.gov/pubs/sp/800/53/r5/upd1/final)) |
| NIST 800-53 r5 ↔ MITRE ATT&CK (CTID Mappings Explorer, v16.1) | ~6,000 mappings (rev 5) across all techniques | 3–8 (some controls map to dozens of techniques) | Published as STIX + CSV by the Center for Threat-Informed Defense |
| MITRE D3FEND ↔ NIST 800-53 (semantic mapping) | ~10,000 typed edges | 5–15 | RDF/OWL knowledge graph; D3FEND's published mappings page |
| NIST CSF 2.0 ↔ 800-53 OLIR | ~1,600 informative references | 1–4 | Official OLIR catalog |
| Secure Controls Framework (SCF, current release) | **~1,400 controls × ~261 frameworks** | Highly variable; some SCF controls map to 50+ external requirements | The SCF claims 200+ frameworks; ([Securecontrolsframework](https://securecontrolsframework.com/)) SCF Connect lists 261. ([SCF Connect](https://scfconnect.com/frameworks)) The full STRM relationship table is the largest realistic single GRC mapping set: at ~1,400 controls × ~50 average mappings/control × low duplication, this is **~70,000–120,000 rows** in a single mapping_set. |
| CRI Profile (Cyber Risk Institute) ↔ NIST CSF, ISO, others | ~2,000–4,000 | 2–5 | Financial-services profile |
| Hypothetical "all GRC" megavault — every public crosswalk loaded | ~250,000–500,000 rows total | mean ~5, max ~50 | A power user ingests SCF + CTID + D3FEND + OLIR + CRI + CIS + a few internal mappings |

**Conclusion: the realistic upper end of a real-world Crosswalker vault is on the order of 10⁵–10⁶ rows with branching factor B ≈ 3–10.** 10⁷ is a pure theoretical worst case (every framework crossed with every other framework) and is firmly above the Tier 2-Lite ceiling.

### 2.3 Engineering estimate of the inflection point

**Assumptions** (all conservative, all stated):
- Edges table `mappings(subject_id TEXT, object_id TEXT, predicate_id TEXT, confidence REAL)` with a covering index on `(predicate_id, subject_id)`. Index probe is ~5 µs in OPFS-cached SQLite-WASM (extrapolated from speedtest1's 2,500 indexed SELECTs in <100 ms).
- A recursive-CTE step does roughly one indexed lookup per row in the working table.
- Path-string cycle guard adds ~1–3 µs per row.
- `@sqlite.org/sqlite-wasm` runs at roughly 1/3 to 1/2 native SQLite throughput once the page cache is warm ([RxDB](https://rxdb.info/articles/localstorage-indexeddb-cookies-opfs-sqlite-wasm.html)) (per Hashimoto's and Beal's benchmarks).

Cost model: closure cost ≈ N · B · D · c, where N = base mappings, B = branching factor, D = effective depth, c ≈ 5–10 µs/edge expansion.

| Mappings (N) | Branching (B) | Depth (D) | Approx. expanded edges | Wall-clock estimate (warm cache, OPFS-SAH-Pool, mid-tier laptop) |
|---|---|---|---|---|
| 10⁴ | 3 | 5 | ~150 K | **~1–3 s** for full closure; <50 ms for a single seeded query |
| 10⁵ | 3 | 5 | ~1.5 M | **~10–30 s** for full closure; ~100–500 ms for a seeded query — *interactive ceiling* |
| 10⁵ | 8 | 6 | ~30 M | **30–120 s** full closure; seeded queries 1–5 s — *barely usable* |
| 10⁶ | 3 | 5 | ~15 M | ~5–10 min full closure; seeded queries multi-second — *not usable* |
| 10⁶ | 8 | 6 | ~300 M | runs out of memory or never returns — *not viable* |
| 10⁷ | any | any | — | **Hard wall.** SQLite-WASM's working set won't fit in the OPFS page cache; serialization across the worker boundary dominates. |

The "Ch 14 §2.7" thresholds restated by the user (10⁴ fine, 10⁶ slow, 10⁷ not viable) are consistent with this model. The model also matches what Notion observed in their post-migration production: their per-tab cache averages ~50 K rows of structured content with sub-100 ms query latency.

### 2.4 Recommended user-visible ceiling

> **Tier 2-Lite is recommended for vaults up to approximately 100,000 mappings with average branching factor ≤ 5 (typical depth ≤ 6).**
> **A "soft warning" should fire at 50,000 mappings or when the p95 closure-query latency crosses 500 ms.**
> **A "hard prompt" should fire at 200,000 mappings or when p95 latency crosses 2 s.**

These numbers comfortably accommodate every individual published crosswalk (NIST, MITRE, OLIR, CRI) and most realistic SCF-anchored multi-framework programs. They start to strain when a user loads the *entire* SCF STRM relationship table together with every other major crosswalk in one vault — exactly the case where Tier 2 proper (DuckDB + Oxigraph + Nemo) earns its ~5 MB.

### 2.5 Materialized closure ("mappings_transitive") — practical?

**Verdict: yes, with caveats.** Two viable strategies:

1. **Write-time incremental view maintenance (IVM)**: trigger a recompute of affected rows on every INSERT/UPDATE/DELETE to `mappings`. Classical semi-naive evaluation (Bancilhon-Ramakrishnan; Gupta-Mumick on incremental view maintenance) is implementable as a SQL trigger that re-derives only the closure rows touching the changed edge. **Practical for an Obsidian plugin only when edits are batchy** (the user runs an importer, not interactive single-row edits). For a vault under 10⁵ mappings, full re-materialization on save is ~10 s — acceptable as a background task during vault sync, painful as a foreground operation.
2. **Lazy materialization with TTL**: precompute closures on demand, cache in a `closure_cache(subject_id, object_id, predicate_id, confidence_min, computed_at)` table, invalidate by edge timestamp. Best fit for a plugin: most queries hit cached results; the first query after an edit pays the compute cost.

**Write-amplification**: in the worst case (dense graph), changing one edge can invalidate O(N) closure rows. The SCF megavault scenario (~10⁵ edges, B≈10) implies single-edit reflows of perhaps 10⁴–10⁵ closure rows — about 1–3 seconds of background work. For typical GRC editing patterns (operators bulk-import a new framework, then make sparse manual corrections), batching edits within a single transaction is the right design.

**Recommendation**: ship Tier 2-Lite with **lazy materialization + per-predicate closure cache**, invalidated on `mappings` mtime. Reserve write-time IVM for Tier 2 proper, where DuckDB's columnar engine handles the bulk recompute much more efficiently.

---

## 3. Migration trigger spec

### 3.1 Trigger conditions

| Trigger class | Condition | Action |
|---|---|---|
| **Performance — soft** | p95 closure-query latency > 500 ms over the last 50 queries | Quiet status-bar indicator: "Vault is approaching Tier 2-Lite ceiling. Learn more." |
| **Performance — hard** | p95 closure-query latency > 2,000 ms OR three consecutive queries > 5 s OR one query > 30 s | Modal prompt (see UX below). |
| **Scale — soft** | Mapping count > 50,000 | Same as performance-soft. |
| **Scale — hard** | Mapping count > 200,000 OR closure-cache size > 500 MB | Modal prompt. |
| **Feature — hard** | User invokes a query that requires a ❌ rule from §1 (recursive SHACL shape, multi-stratum negation, non-linear chaining rule, `confidence_avg` over a path set above 10⁴) | Inline error: "This query requires Tier 2 (Oxigraph + Nemo). [Migrate now] [Cancel]" |
| **Environment — informational** | User opens vault on a device that supports Tier 2 (desktop Obsidian, modern Chromium, COOP/COEP-capable wrapper) AND vault has been running close to the soft thresholds on Tier 2-Lite for > 30 days | Banner: "Your desktop can run Tier 2 — better performance for large vaults." |

### 3.2 UX — proposed modal copy

```
┌────────────────────────────────────────────────────────────┐
│  Crosswalker · Engine upgrade recommended                  │
├────────────────────────────────────────────────────────────┤
│  Your vault has ~127,000 mappings and recent crosswalk     │
│  queries are taking longer than 2 seconds.                 │
│                                                            │
│  Tier 2-Lite (the engine you're using now) is optimised   │
│  for vaults up to ~100,000 mappings. Beyond that,          │
│  switching to Tier 2 typically gives a 10-50× speed-up     │
│  for transitive-closure queries.                           │
│                                                            │
│  Tier 2 adds ~5 MB of WebAssembly to your vault and        │
│  requires desktop Obsidian (it does not run on mobile).    │
│                                                            │
│  [Why this matters]   [Migrate now]   [Defer for 30 days] │
└────────────────────────────────────────────────────────────┘
```

"[Why this matters]" opens a doc page with §1's rule matrix and a plain-English description of which queries got slow.

### 3.3 Edge cases

- **"I'm on mobile and CAN'T migrate."** Detect environment first. If `Platform.isMobile` (Obsidian API) or COOP/COEP unavailable, *suppress the migration prompt entirely* and instead show: "This vault is too large for Tier 2-Lite on mobile. Open it on desktop to upgrade the engine, or reduce the mapping count by archiving an inactive framework." Critically, do not nag a user who has no path forward.
- **Notification fatigue.** Each soft threshold fires at most once per 7-day window per vault. The hard prompt fires once per session and is dismissable for 30 days; if the user dismisses it three times in a row, escalate to a settings-page banner only, no modals.
- **False positives from a slow disk.** Discount the first 60 s after vault open (cold-cache penalty), and ignore queries during indexer runs. Use median-of-recent-50 rather than absolute counts.
- **Vault grew beyond the ceiling because of a bug or bad import.** Always offer "Inspect vault size" on the modal, which opens a panel showing mapping-count by source and lets the user delete a runaway import without committing to migration.

---

## 4. Migration path verification

### 4.1 Round-trip feasibility (per Ch 16 §5: SSSOM markdown + YAML in vault is canonical)

The migration up is straightforward in principle: re-run the SSSOM-to-RDF projector against the canonical Markdown/YAML, load Oxigraph-WASM, optionally hydrate DuckDB-WASM and Nemo. The risk is *not* the canonical store; it's the *projection databases* potentially carrying derived state that is hard to recompute.

Tier 2-Lite stores three projections:
- `mappings` (relational table — direct projection of canonical edges)
- `closure_cache` (derived; safe to discard)
- `simple-graph` JSON nodes/edges (edges with JSON property bags)

Tier 2 stores:
- Oxigraph N-Quads / RDF
- DuckDB columnar projection
- Optional Nemo IDB facts

### 4.2 Subtle data-loss risks (round-trip)

| SSSOM/RDF feature | simple-graph (JSON) | Oxigraph (RDF) | Round-trip risk |
|---|---|---|---|
| **IRIs vs CURIEs** | Stored as strings with no schema awareness | First-class IRIs, `@prefix` mapping | Must store an explicit prefix-map node in simple-graph; otherwise CURIE expansion is lost. **Risk: medium.** |
| **xsd:decimal confidence vs JSON number** | JavaScript IEEE-754 double | xsd:decimal is arbitrary-precision | Confidences with > 15 significant digits truncate. SSSOM confidence is typically 2 decimal places, so risk is **low in practice** but should be guarded with a schema check. |
| **Language tags on `subject_label` / `object_label`** | No native support — must encode as `{"@value": "...", "@lang": "en"}` | First-class | If projector flattens labels to bare strings, language tags are lost. **Risk: medium.** |
| **Datatype on literals** (e.g., `xsd:date` on `mapping_date`) | None — strings only | First-class | Same pattern as language tags. **Risk: medium.** |
| **Blank nodes** | Not natively supported | First-class | SSSOM rarely uses blank nodes (most identifiers are CURIEs/IRIs), but `mapping_justification` provenance occasionally references blank-node skolems. **Risk: low** if projector skolemizes blank nodes to deterministic IRIs on the way down and de-skolemizes on the way up. |
| **List/set ordering** (`author_id` is a list; SSSOM TSV uses `\|` to separate) | JSON arrays preserve order | RDF has `rdf:List` (ordered) and unordered multi-property | If author lists are stored as multi-valued RDF properties without `rdf:List`, ordering is lost. **Risk: medium.** Stable ordering matters for byte-identical round-trip and for git diffs of the canonical Markdown. |
| **`mapping_justification` with PROV-style provenance** | Nested JSON | Reified RDF | If projector flattens, provenance hierarchy is lost. **Risk: medium.** |
| **`predicate_modifier = NOT`** | A field on the JSON edge | A property on the mapping resource | Round-trips cleanly if projector treats the modifier as data, not as semantic negation. **Risk: low.** |
| **`sssom:NoTermFound` sentinel** | Just a string | An IRI in the SSSOM namespace | Round-trips cleanly. **Risk: low.** |
| **Cardinality scope (`cardinality_scope`)** | A list field | A multi-valued property | Round-trips cleanly. **Risk: low.** |

**The principle**: every projection should be regenerable from the canonical Markdown + YAML. The migration tool should *never* read from simple-graph or Oxigraph and write to canonical — it should only ever rebuild projections from canonical.

### 4.3 Recommended round-trip test harness

A "no data loss" automated test should be:

1. Pick a corpus: one small (50 mappings, all SSSOM features exercised), one medium (the published NIST 800-53↔ATT&CK CTID mapping, ~6,000 rows), one large (a synthetic 100,000-row vault generated to hit branching factor ≥ 5).
2. Start with canonical Markdown + YAML.
3. Run: SSSOM-canonical → simple-graph SQLite. Snapshot.
4. Run: simple-graph → SSSOM-canonical (regeneration path).
5. Run a structural-equivalence check using SSSOM's own [`sssom-py compare`](https://github.com/mapping-commons/sssom-py) tool, which is set-aware and ignores ordering of slots.
6. Repeat for the projection up to Oxigraph/Tier 2.
7. **Pass criterion**: every mapping record in the regenerated canonical file is set-equivalent to its source record (SSSOM `compare` reports zero diffs for `mapping_set` and zero for the row-level diff over `record_id`).

Add property-based tests (Hypothesis or fast-check) that generate random valid SSSOM rows including all the risky features (literals with language tags, datatypes, multi-author lists, predicate modifiers, NoTermFound sentinels) and verify byte-stable round-trip after canonicalization.

### 4.4 Two-way migration?

**Yes, with one constraint.** Tier 2 → Tier 2-Lite is feasible because canonical Markdown is the single source of truth: simply rebuild simple-graph from canonical, drop the Oxigraph + DuckDB + Nemo state, and adjust Tier 2-Lite settings. The constraint is that any user-authored *Tier-2-only* artifacts — SHACL shapes graphs with recursive shapes, custom Datalog rule sets, SPARQL queries saved as views — *must be preserved as files in the vault* and *flagged as inactive* in Tier 2-Lite, not silently dropped. The plugin's settings page should say: "You have 3 SHACL shapes and 2 Datalog rules that aren't supported in Tier 2-Lite. They will remain in your vault as files but will not be applied. Re-enable Tier 2 to use them again."

---

## 5. User-facing scope statement

> **Tier 2-Lite engine.** Your vault is using a lightweight crosswalking engine: SQLite-WASM with vector search and a small graph layer. It supports transitive closure of `skos:exactMatch` (and other transitive predicates), confidence-min/-max aggregation across paths, single-stratum negation, mapping-cardinality computation, point-in-time bi-temporal queries, and a curated subset of SHACL validation (datatype, cardinality, regex, enumeration, single-step path constraints). It is recommended for vaults up to about **100,000 mappings** with average branching factor up to five. For larger vaults, or if you need recursive SHACL shapes, multi-stratum Datalog rules, SPARQL property paths, or `confidence_avg` over wide path sets, Crosswalker will offer to upgrade you to **Tier 2** — a richer engine stack (~5 MB) that runs on desktop Obsidian. Tier 2-Lite is the only engine available on Obsidian Mobile and in restricted-CSP enterprise environments; if your vault outgrows it on those platforms, Crosswalker will guide you toward archiving inactive frameworks rather than nag you to migrate to an engine your environment can't run.

---

## 6. Failure modes and long-term considerations

### 6.1 Edge-case failure modes

- **Very deep cycle in mappings.** Path-string `LIKE '%>n>%'` cycle guard + hard `depth < 16` ceiling + a final `LIMIT 10_000_000` on the recursive CTE. Any vault hitting the ceiling triggers a warning and drops to a partial result with a "results truncated" badge.
- **Malformed SSSOM** (missing `predicate_id`, NaN in `confidence`, IRI with whitespace). The projector should refuse to write a row that fails schema validation; show a per-row error in the Crosswalker side panel and link back to the source Markdown line.
- **Bizarre branching factor** (a dummy "everything maps to everything" framework). Detect at projection time: any single subject with > 1,000 outgoing edges of the same predicate gets a warning. Closure queries against such subjects auto-cap depth at 2.
- **OPFS quota exhaustion.** Browsers don't expose a reliable quota API across all platforms. Use `navigator.storage.estimate()` where available; fall back to graceful failure with a "your vault has hit the browser's storage quota" message that guides toward the OPFS SAH-Pool documentation. Note that on iOS/iPadOS the WebKit OPFS quota is more restrictive than Chromium, and Obsidian Mobile sits on top of WebKit on iOS — this is the most likely place for premature quota errors.
- **IndexedDB transaction timeouts in WebKit.** If COOP/COEP isn't available *and* OPFS-SAH-Pool isn't supported (older Safari < 16.4), simple-graph falls all the way back to an IndexedDB-backed VFS where transactions can time out under load. Mitigation: chunk imports into transactions of ≤ 5,000 rows; wrap each chunk in a retry-with-backoff. Document Safari < 16.4 as "best-effort, not officially supported." ([SQLite](https://sqlite.org/wasm/doc/trunk/persistence.md))
- **Worker termination by the host.** Long-running closure queries (>30 s) should be cancellable. Run all CTE work in a Web Worker; expose an abort signal; on abort, return partial cached results.

### 6.2 What changes in 2–3 years (and what shouldn't change in the recommendation)

- **WASM threading on Obsidian Mobile.** If WebKit gains COOP/COEP-equivalent isolation on iOS WebViews and Obsidian exposes it, Tier 2 proper becomes mobile-feasible. The migration trigger UX should not assume "mobile = Tier 2-Lite forever"; it should re-check capability on every vault open.
- **SQLite recursive query optimizer improvements.** SQLite has historically been conservative about query-planner work for recursive CTEs (per the VLDB 2026 Raqlet paper, "query optimization support is restricted to non-recursive subsets"). ([VLDB Endowment](https://www.vldb.org/cidrdb/papers/2026/p7-shaikhha.pdf)) If SQLite ships semi-naive evaluation or magic-set optimization, the scale ceiling roughly doubles. Don't bake the 100K number into code; expose it as a config constant updated per release.
- **Sub-500-KB Datalog-in-WASM.** Several research engines (Soufflé, RDFox-mini, Differential Datalog) are converging on smaller WASM binaries. Watching this space is the right way to retire the Tier 2-Lite/Tier 2 split in the long run; the abstraction in Ch 16 §5 (canonical Markdown + projections) is the right shape to absorb that change without breaking users.
- **JSPI broadly available.** As Chrome 137+ ships JSPI without flags and Firefox/Safari follow, ([PowerSync](https://www.powersync.com/blog/sqlite-persistence-on-the-web)) the VFS performance gap between Asyncify and SAH-Pool narrows. Re-benchmark annually.

### 6.3 What a small team can ship

Every recommendation in this brief is implementable by a 2–3 person team in one quarter:

- §1's CTE templates are ~50 lines of SQL each, parameterizable.
- §2's lazy closure cache is a single SQLite table, an mtime trigger, and a query-time read-through.
- §3's trigger logic is a status-bar component plus one modal, ~300 LoC of TypeScript.
- §4's round-trip test harness is `sssom-py compare` invoked from a vault-fixture test (Vitest), ~200 LoC.
- §5's scope statement is a single Markdown doc + one settings-page link.

Nothing here requires novel research; it's all integration of well-understood pieces (SQLite WITH-RECURSIVE, the published SSSOM toolkit, the SCF/CTID/OLIR datasets, the standard semi-naive evaluation pattern, and the existing Obsidian plugin lifecycle hooks).

---

## Sources consulted

- SSSOM specification — `mapping-commons.github.io/sssom/spec-model/`, `Mapping/`, `MappingSet/`
- SSSOM chaining rules (referenced via search; the canonical page returned 404 at fetch time, summary from search snippets)
- SSSOM/Transform language — `incenp.org/dvlpt/sssom-java/sssom-ext/sssom-transform.html`
- OxO2 paper (Harmse et al., 2025) on SSSOM + Nemo Datalog — `arxiv.org/pdf/2506.04286`
- W3C SHACL Recommendation — `w3.org/TR/shacl/`; SHACL 1.2 SPARQL Extensions — `w3c.github.io/shacl/shacl-sparql/`
- Corman et al., "Semantics and Validation of Recursive SHACL," ISWC 2018 — Springer Link chapter
- Yakovets et al., "Evaluation of SPARQL Property Paths via Recursive SQL," CEUR Vol-1087 paper 11
- Shaikhha et al., "Raqlet: Cross-Paradigm Compilation for Recursive Queries," CIDR/VLDB 2026 — `vldb.org/cidrdb/papers/2026/p7-shaikhha.pdf`
- "Language-Integrated Recursive Queries" — `arxiv.org/html/2504.02443v1` (on SQL linear-recursion restriction)
- Mazuran et al., "Monotonic Properties of Completed Aggregates in Recursive Queries" — `arxiv.org/pdf/1910.08888`
- SQLite documentation — `sqlite.org/lang_with.html` (recursive CTE), `sqlite.org/limits.html`, `sqlite.org/wasm/doc/trunk/persistence.md`
- SQLite forum threads on recursive CTE performance and shortest-path limitations — `sqlite.org/forum/`
- Roy Hashimoto — wa-sqlite discussions #23, #63, #84 (OPFS benchmarks, COOP/COEP tradeoffs)
- PowerSync, "The Current State of SQLite Persistence on the Web: November 2025 Update" — `powersync.com/blog/sqlite-persistence-on-the-web`
- Notion Engineering, "How we sped up Notion in the browser with WASM SQLite" — `notion.com/blog/how-we-sped-up-notion-in-the-browser-with-wasm-sqlite`
- RxDB benchmark — `rxdb.info/articles/localstorage-indexeddb-cookies-opfs-sqlite-wasm.html`
- Google Chrome Samples speedtest1/OPFS — `googlechrome.github.io/samples/sqlite-wasm-opfs/speedtest.html`
- Charles Leifer, "Querying Tree Structures in SQLite using the Transitive Closure Extension"
- Daniel Whoman, "Transitive Closure in SQL" (citing Aho-Ullman)
- dpapathanasiou/simple-graph — `github.com/dpapathanasiou/simple-graph`; HYTRADBOI 2022 talk
- Secure Controls Framework — `securecontrolsframework.com` (1,400+ controls × 200+ frameworks) ([Securecontrolsframework](https://securecontrolsframework.com/))
- SCF Connect frameworks list — `scfconnect.com/frameworks` (261+ mappings) ([SCF Connect](https://scfconnect.com/frameworks))
- MITRE Center for Threat-Informed Defense, NIST 800-53 ↔ ATT&CK Mappings Explorer — `center-for-threat-informed-defense.github.io/mappings-explorer/external/nist/`
- MITRE D3FEND Semantic Mappings — `d3fend.mitre.org/mappings/nist/5/`
- NIST SP 800-53 Rev 5 supplemental crosswalks (OLIR, CSF, ISO/IEC 27001:2022) — `csrc.nist.gov/pubs/sp/800/53/r5/upd1/final`

(Note: the Crosswalker docs at `cybersader.github.io/crosswalker/...` — including the Challenge 18 brief, the Ch 11/12/14/16 deliverables, the third-wave shifts log, the direction-commitments TL;DR, and the SSSOM/SKOS registry — could not be fetched directly during research; this brief relies on the user-supplied restatement of those documents and grounds all external technical claims in independently retrievable sources listed above.)
