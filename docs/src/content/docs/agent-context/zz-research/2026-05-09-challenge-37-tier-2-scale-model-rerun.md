---
title: "Ch 37: Tier 2 scale model under ontology-web framing (rerun of Ch 18)"
description: "Fresh-agent research deliverable for Challenge 37 — rerun of Ch 18. Original ceiling was ~100K mappings sized for GRC vault; rerun asks the same scale question for ontology-web vaults. Verdict: REAFFIRM ~100K ceiling, reframed as per-query working-set, not database size. Green tier ≤50K concepts/250K edges (GO/HPO/all GRC). Red tier (Tier 3 only) >500K concepts/5M edges. Mobile = ÷5 of desktop. Hard infeasibility starts above ~500K concepts / ~5M edges per active query scope. New triggers #6 (closure cache memory budget), #7 (per-query 1M-row ceiling), #8 (Tier 3 referral UX). v0.1.7 deliverables: per-ontology partitioning + tripwire estimation + bounded LRU closure cache + mobile-mode constraints."
tags: [research, deliverable, tier-2, scale, sqlite-wasm, mobile, capacitor, opfs, electron, browser-memory, snomed, umls, bioportal, ch-18-rerun, ch-37]
date: 2026-05-09
sidebar:
  label: "Ch 37 · Scale ceiling REAFFIRMED"
  order: -20260509.6
---

:::tip[Origin and lifecycle]
Fresh-agent research deliverable produced 2026-05-09 in response to [Challenge 37: Tier 2 scale model rerun (of Ch 18)](/crosswalker/agent-context/zz-challenges/37-tier-2-scale-model-rerun/). Original Ch 18 brief (archived) sized the ~100K-mapping ceiling for GRC vaults; this rerun asks the same question for ontology-web vaults (BioPortal, UMLS, OBO Foundry scale). Absorbed into the [Ontology-web query engine synthesis log](/crosswalker/agent-context/zz-log/2026-05-07-bases-query-layer-architecture-synthesis/) — see Settled #18 (mobile binding constraint) + new triggers #7/#8. Preserved verbatim.
:::

# Challenge 37 — Tier 2 Scale Model Under Ontology-Web Framing (RERUN of Ch 18)

## TL;DR

- **The original Ch 18 ~100K-mapping ceiling for GRC vaults is REAFFIRMED, not revised** — but the meaning of "ceiling" must be reframed: it is a per-query working-set ceiling, not a database-size ceiling. Plain `sqlite-wasm` + recursive CTEs comfortably handles single-ontology imports up to roughly **GO/HPO scale (~50K nodes, ~250K edges, ~500K materialized closure rows)** on desktop, and this is the realistic everyday Crosswalker workload.
- **The use case shift to ontology-web framing does NOT justify migrating off sqlite-wasm or adding a vector layer.** It does, however, justify shipping (a) a per-ontology partition model, (b) a bounded materialized closure cache with LRU eviction, and (c) an explicit "this query is too big for Tier 2" tripwire that points users at Tier 3 (Fuseki/oxigraph-server) — instead of silently OOM-ing the Electron renderer at the V8 4 GB pointer-compression cage.
- **Hard infeasibility starts above ~500K concepts / ~5M edges per active query scope** (full multi-ontology OBO bundles, full SNOMED CT closure, any UMLS subset >~10% of Metathesaurus, any "all-pairs" pivot above ~1K × ~1K). These are Tier 3 workloads, full stop. Mobile (Obsidian iOS/Android, ~1.5–2 GB renderer ceiling) is hard-limited at roughly one-fifth of desktop scale and should be treated as a degraded read-only mode for any non-GRC ontology.

---

## Key Findings

**1. Reference dataset sizes (concrete, current as of 2024–2026 releases).**

| Source | Concepts/terms | Edges/relations | Notes |
|---|---|---|---|
| Gene Ontology (basic ed.) | ~43K terms | ~88K relations (basic) / ~134K (full) | + 7.6M annotations not relevant to crosswalk Tier 2 |
| Human Phenotype Ontology (HPO) | ~18K–20K terms (+2,239 added since prior report) | ~30K–40K relations | Small/medium |
| ChEBI | ~195K entries (full); ~14K curated metabolites | ~500K+ relations incl. role/structure | Mid-size |
| SNOMED CT (Intl.) | ~370K active concepts (+957K descriptions) | ~1.37M relationships | Materialized closure ~**6.5M rows** (per SNOMED Intl. Perl script) |
| UMLS Metathesaurus 2025AB | **3.49M concepts**, 17.4M atoms | tens of millions of MRREL relationships | 190 source vocabs; full release ~35 GB on disk |
| BioPortal (May 2025 figures) | 1,549 ontologies (1,182 public), **15.3M terms** | **>100M cross-ontology mappings** | Median individual ontology is small; the long tail is what matters |
| OBO Foundry | ~250 active ontologies passing dashboard | varies | Most are <50K classes; a handful (CL, Uberon, NCIT, SNOMED-via-Bioportal) push 100K+ |
| NIST OLIR catalog | dozens of OLIRs across ~10–15 focal documents | each typically 100–1,500 element-pair mappings | Small enough to be a non-issue; Crosswalker-native today |

**2. sqlite-wasm performance characteristics, current state (Nov 2025 baselines).**
- **Storage backend matters more than the engine**: `wa-sqlite` OPFSCoopSyncVFS (and the official sqlite-wasm OPFS SAHPool) sustain good performance past **1 GB** of database; the older IDBBatchAtomicVFS degrades sharply above ~100 MB.
- **Bundle size**: official `@sqlite.org/sqlite-wasm` is ~470 KB JS + ~900 KB WASM; `wa-sqlite` is ~230 KB + ~570 KB.
- **Memory ceiling**: 32-bit WASM is hard-capped at **4 GB per instance**. **Obsidian (Electron + V8 pointer compression) caps the renderer at ~4 GB per process**, shared with the rest of the Obsidian app. Realistic budget for the Crosswalker sqlite arena: **~500 MB–1 GB on desktop, ~150–300 MB on mobile.**
- **Recursive CTE behavior**: SQLite docs and SNOMED/i2b2 community evidence confirm recursive CTE is functional for closure but is the slow path. SQLite Intl. itself ships a Perl script (not a CTE) to build the SNOMED closure table because all-pairs CTE on 370K nodes is impractical.
- **Indexed lookup vs. closure**: a single `WHERE parent=?` lookup with an index on `(parent, child)` is sub-millisecond at any feasible Crosswalker scale. The "scale-breaking" primitive is always the recursive closure or the unbounded pivot, never the indexed point query.

**3. Materialized closure cache analysis.**
- Empirically, `|closure| ≈ k · |edges|` where k is roughly the average path length in the DAG. For "is-a" hierarchies, k is typically 5–15. For **GO**: ~88K direct edges → ~500K–1M closure rows (~16–32 MB at 32 B/row). For **SNOMED CT**: 1.37M direct → **~6.5M closure rows** (~200–260 MB stored).
- Cold materialization time: a JS/CTE implementation in a worker will be **minutes** for SNOMED-class graphs and **seconds** for GO-class graphs. This is acceptable as a one-time cost on import, *not* on every query.
- **Invalidation** is the real problem. A single new `is-a` edge in a high-fan-in node can invalidate tens of thousands of closure rows. The viable design is **bounded-depth + LRU + lazy recompute**.

**4. Map/partition strategies — what the comparable tools actually do.**
- **BioPortal/OLS4** keep ontologies in *separate* indices and use server-side Neo4j only for graph queries; no tool tries to load the full corpus into a single client.
- **Protégé Desktop** loads ~90K classes "in <15 seconds" but search becomes laggy at SNOMED scale (370K) even on 8 GB JVMs.
- **WebProtégé** is server-backed (Tomcat + MongoDB).
- **OxO / OxO2** uses Datalog (Nemo) on the server precisely because mapping walks across BioPortal-scale data exceed browser budgets.
- **Oxigraph-WASM** is in-memory only and explicitly notes "the WASM intrinsic memory limitations hinder the scalability of this approach" at ~725K quads.

The consistent industry pattern: **partition by ontology, query a subgraph, never materialize the world.**

**5. Tier 2 → Tier 3 thresholds.**
A practical, evidence-grounded threshold matrix (desktop, OPFS-backed sqlite-wasm, single active query):

| Tier | Concepts | Edges | Closure rows | Working-set RAM | Verdict |
|---|---|---|---|---|---|
| **Green (Tier 2 routine)** | ≤50K | ≤250K | ≤500K | `<100MB` | GO, HPO, NIST OLIR, ChEBI subsets, all GRC vaults |
| **Yellow (Tier 2 with cache+partition)** | 50K–250K | 250K–2M | 500K–3M | 100–500 MB | Federated 5–10 OBO ontologies; ChEBI full; UMLS thin domain subsets |
| **Orange (Tier 2 read-only / Tier 3 recommended)** | 250K–500K | 2M–5M | 3M–8M | 500 MB–1 GB | SNOMED CT; large multi-OBO bundles |
| **Red (Tier 3 only)** | >500K | >5M | >8M | >1 GB | Full UMLS, BioPortal-scale federation, all-pairs pivots over large axes |
| **Mobile** | divide all the above by ~5 | | | `<300MB` | Obsidian Mobile is a Yellow-only tier |

**6. Migration triggers — updated from Ch 24.**

| # | Trigger | Original status | Ch 37 update |
|---|---|---|---|
| 1 | Vector extension packaging | Deferred per WASM-A | **Unchanged.** No ontology-web pressure to add vectors. |
| 2 | WASM bundle size | <2 MB acceptable | **Unchanged.** wa-sqlite ~800 KB total is fine. |
| 3 | Closure query latency | p95 <500 ms target | **Tightened.** Add a hard "soft budget" of 250 ms wall-clock with cancellation. |
| 4 | Mobile / low-end | "monitor" | **Elevated.** Mobile is now a first-class constraint with its own threshold tier. |
| 5 | Federation requirement | Future | **Unchanged but reframed.** Federation = Tier 3 by definition. |
| **6 (NEW)** | **Closure cache memory budget** | — | Trigger fires if materialized closure for any single imported ontology exceeds 25% of estimated renderer memory. |
| **7 (NEW)** | **Per-query working-set ceiling** | — | Trigger fires if any single query primitive materializes >1M rows in result-set memory. Force pagination or Tier 3 referral. |

**7. Scale-breaking query catalog — which primitive breaks at which scale.**

| Primitive | GO scale (50K/250K) | Multi-OBO (500K/5M) | SNOMED (370K/1.37M) | UMLS subset (1M/10M) |
|---|---|---|---|---|
| Indexed point lookup (`get by id`) | <1 ms | <1 ms | <1 ms | <1 ms |
| 1-hop neighbors (filter) | <5 ms | <10 ms | <10 ms | 10–50 ms |
| Bounded-depth closure (depth ≤3) | 5–50 ms | 50–500 ms | 100 ms–1 s | **fail without cache** |
| Full transitive closure (recursive CTE) | 100 ms–1 s | **5–60 s; OOM-risk** | **30 s+; very slow** | **infeasible** |
| Materialize closure table | 1–10 s, ~32 MB | 30 s–5 min, ~300 MB | minutes, ~250 MB | infeasible |
| Anti-join (orphans/missing) | <100 ms | seconds | seconds | minutes |
| Pivot N×M (cross-product) | OK to ~1K×1K | breaks >2K×2K | breaks >2K×2K | always break |
| All-pairs shortest path | infeasible already | infeasible | infeasible | infeasible |

**Bottom line: closure and pivot are the universal scale-breakers; everything else scales linearly with proper indexing.**

**8. Closure cache — viable strategies (4+ with tradeoffs).**

| Strategy | Mechanism | Memory | Hit rate | Invalidation cost | Best for |
|---|---|---|---|---|---|
| **Per-start-concept LRU** | Cache (concept_id, descendants[]) with LRU eviction | 20–50 MB | High for hot concepts | Cheap | **Recommended default** |
| **Bounded-depth materialized table** | Pre-compute closure to depth 3 or 4 only | 5–10× edges count | Excellent for typical UI traversal | Recompute affected subtrees | Static or rarely edited ontologies |
| **Full materialized closure** | Standard SQL closure table | k × edges (5–15×) | 100% | Catastrophic on edit | Read-only imports |
| **Lazy frontier expansion** | Compute closure on demand, memoize one BFS frontier at a time | <10 MB | Low; recomputes a lot | None | Mobile / low-end |
| **Per-ontology partition + lazy** | Each imported ontology gets its own attached sqlite db | bounded per ontology | High | Localized | **Recommended for multi-OBO use case** |

The **partition + per-start-concept LRU + bounded depth** combination is what every production ontology browser converges on, and it is what Crosswalker should adopt.

---

## Details

### Re-run of the Ch 18 model under ontology-web framing

The original Ch 18 calculation (5K controls × 8 frameworks ≈ 40K cells, ≈ 100K mappings as the "comfortable ceiling") was a *cell-count* model for GRC. Under ontology-web framing the numerics change but the conclusion holds:

- The dominant Crosswalker workload is **mappings between framework elements**, not the structure of the source ontologies themselves. A user importing GO to map their domain notes to GO terms cares about ~50 mappings *they create*, not the 88K internal relations of GO.
- The internal ontology structure becomes a **read-only dependency** queried via 1-hop expansion, label search, and bounded-depth closure — all of which scale to GO and HPO on plain sqlite-wasm without trouble.
- The 100K-mapping ceiling therefore re-applies as the ceiling on **user-authored crosswalk edges**, not the count of imported ontology axioms.

### Where ontology-web framing does add new pressure

1. **Imported source-of-truth size.** A GRC vault of 5K controls is ~5K rows in `concepts`. A single GO import is 50K. A speculative SNOMED import is 370K.
2. **Closure depth distribution.** GRC frameworks are shallow (2–4 levels). OBO ontologies are routinely 10–15 levels deep, and SNOMED CT can reach 20+. Bounded-depth caches need a configurable depth, not a hard-coded 4.
3. **Cycle handling.** ChEBI explicitly contains cyclic relationships, GO contains DAG multi-parenting. The recursive CTE must use `UNION` (not `UNION ALL`) or carry a path to terminate.

### Browser memory limits — concrete numbers

- **Chrome wasm32**: theoretical 4 GB per WASM instance; practical fragmentation ceiling ~2–3 GB.
- **Firefox/Safari**: similar 4 GB ceiling.
- **Electron 14+**: ~8 GB hard cap per process.
- **Obsidian**: V8 pointer compression / "memory cage" caps **the entire renderer at ~4 GB**, shared across the editor, all plugins, the file cache, the graph view, etc.
- **OPFS quotas**: per origin; Chrome typically grants gigabytes but Windows storage-cleanup heuristics have been observed to silently delete OPFS data when free disk is low.

### Why we are not adding sqlite-vec, libSQL, Turso, or Limbo

- **sqlite-vec**: ontology-web crosswalks are graph-and-label workloads, not embedding workloads.
- **libSQL/Turso/Limbo**: rejected in Ch 24 for ecosystem-maturity and Obsidian-distribution reasons.

### Tier 3 offload UX (for when users hit the wall)

When triggers #6 or #7 fire, the user experience must be:

1. A clear "this query exceeds your local budget" message naming the offending primitive.
2. A choice to either (a) bound the query, (b) switch the affected ontology to a server-side endpoint, or (c) leave it in browser and accept a long-running cancellable job in a worker.
3. **No silent crash.** Tripwire detection (estimated row counts before execution; abort with friendly error) is mandatory.

### Verdict on the original Ch 18 ~100K ceiling: REAFFIRMED

- For *user-authored* crosswalk mappings: ~100K is the correct desktop comfort ceiling and ~20–30K is the correct mobile ceiling.
- For *imported ontology source data*: the ceiling is better expressed as ~250K concepts / ~2M edges / ~3M closure rows in a single active query scope (the "Yellow" tier above).
- The ceiling is therefore *reaffirmed in spirit*, *re-expressed in scope-appropriate units*, and **not revised downward or deferred.**

---

## Recommendations

### Immediate (v0.1.7)
1. **Ship per-ontology partitioning.** Each imported ontology becomes its own logical namespace.
2. **Add tripwire estimation before any closure or pivot query.** Cheap `COUNT(*)` against the relevant edge subset; if exceeds threshold (default 250K), abort with friendly error.
3. **Default recursive CTE depth limit to 6** with a user-overridable per-ontology setting.
4. **Add a per-ontology "closure cache" table** (materialized, bounded depth) populated on import for ontologies under the Yellow threshold.

### Near-term (v0.1.8–v0.2)
5. **Add an LRU bounded closure cache** keyed on `(start_concept_id, depth)` with a configurable memory budget.
6. **Implement an explicit "Tier 3 referral" mechanism**.
7. **Mobile mode**: detect Obsidian Mobile, halve all memory budgets.

### Trigger thresholds (when to revisit this decision)
- **Add Tier 3 referral now** if any user reports OOM with an OBO-bundle import larger than 250K concepts.
- **Re-evaluate vector layer** only if SSSOM-style label-similarity mapping suggestions become a top-3 user request *and* sqlite-vec ships a stable WASM build.
- **Re-evaluate Memory64 path** when Obsidian's Electron embeds it by default.
- **Force partition-default** if any user reports query-cancellation frustration on multi-OBO bundles.

### Anti-recommendations (to lock in)
- Do not preemptively migrate off sqlite-wasm.
- Do not load full BioPortal or full UMLS.
- Do not add a vector layer in v0.1.x — it is a different product.
- Do not assume desktop budgets on mobile.

---

## Caveats

- **Closure latency benchmarks above are estimates extrapolated from native-SQLite benchmarks and the SNOMED Intl. community reports** (which are based on Postgres/MySQL/Oracle, not sqlite-wasm). Browser-side numbers will be 2–5× slower than native sqlite.
- **The "Yellow" and "Orange" thresholds are budgets, not measurements.**
- **Mobile numbers (the ÷5 rule of thumb)** are the softest figures here.
- **NIST OLIR scale figures** were not available as a precise count from NIST itself.
- **The SNOMED CT closure size of 6.5M rows** scales with SNOMED's growth and would need updating per release.
- **OPFS durability**: there is an open Chromium issue (chromium #443206423) about Windows storage-cleanup deleting OPFS data.
- **Recursive CTE in a Web Worker is essential** but introduces postMessage serialization cost on result return.
- **The Obsidian "memory cage" 4 GB renderer cap** is shared with everything else in Obsidian. Real Crosswalker budget on a vault with 15+ plugins is closer to 1–1.5 GB, not 4 GB.
