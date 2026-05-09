---
title: "Ch 35: Graph→tabular bridging rerun (Ch 10) at ontology-web scale"
description: "Fresh-agent research deliverable for Challenge 35 — rerun of Ch 10 under the broader ontology-web framing. Verdict: REAFFIRM Tier 1 + Tier 2; REVISE Tier 3 from Apache AGE (already demoted in Ch 16) to Oxigraph (embedded/sidecar) + Apache Jena Fuseki. Every production ontology-web system materializes precomputed pairwise crosswalk tables — UMLS RRF subsets, BioPortal's 100M-mapping table, OxO/OxO2 SSSOM crosswalks, NIST OLIR DRM. None compute N×N at query time. Crosswalker should not either. RECOMMENDS moving SSSOM TSV import + materialized closure-table from v0.1.8 to v0.1.6."
tags: [research, deliverable, tier-1, tier-2, tier-3, oxigraph, fuseki, sssom, bioportal, oxo, materialization, ch-10-rerun, ch-35]
date: 2026-05-09
sidebar:
  label: "Ch 35 · Graph-to-tabular rerun"
  order: -20260509.4
---

:::tip[Origin and lifecycle]
Fresh-agent research deliverable produced 2026-05-09 in response to [Challenge 35: Graph→tabular bridging rerun (of Ch 10)](/crosswalker/agent-context/zz-challenges/35-graph-to-tabular-bridging-rerun/). Original Ch 10 brief (archived) asked for SSSOM/GRC mapping; this rerun asks the same question for arbitrary ontology webs (BioPortal, OBO Foundry, OLS, UMLS scale). Absorbed into the [Ontology-web query engine synthesis log](/crosswalker/agent-context/zz-log/2026-05-07-bases-query-layer-architecture-synthesis/) — see Settled #16 (Tier 3 reframe) + D1 Ch 35 nuance callout (locked 2026-05-09: SSSOM TSV import + materialized closure-table moves to v0.1.6). Preserved verbatim.
:::

# Crosswalker Challenge 35: Graph→Tabular Bridging at Ontology-Web Scale

**TL;DR**

- **All three tiers are REAFFIRMED under the ontology-web framing, with one substitution and one rename.** Tier 1 (materialized folders) and Tier 2 (sqlite-wasm + recursive CTE) hold without change for vault-native, single-user ontology-web work; Tier 3 should be re-scoped from "Apache AGE" (already demoted in Ch 16) to **Oxigraph (embedded, WASM-capable) + Apache Jena Fuseki (sidecar) as a SPARQL/RDF stack**, because the ontology web is natively SPARQL/SSSOM-shaped.
- **The pragmatic graph→tabular bridge at BioPortal scale is materialization, not query-time projection.** Every serious cross-ontology system in the wild — UMLS Metathesaurus (precomputed RRF subsets), BioPortal (precomputed 100M+ mapping table), OxO/OxO2 (precomputed SSSOM crosswalks), NIST OLIR (precomputed Derived Relationship Mappings) — ships precomputed, sparse, pairwise crosswalk tables and lets the user pick the ontology pair. Full N×N pivot is universally rejected.
- **Materialization should move earlier in the roadmap (target v0.1.6 rather than v0.1.8)**, gated to user-selected ontology pairs and built on top of SSSOM TSV as the canonical interchange format. sqlite-wasm + recursive CTE remains the right Tier 2 substrate; the current `crosswalkBetween` and `closureFromConcept` helpers are substrate-neutral *if* they are kept narrow (lookup, k-hop closure, pairwise pivot) and SSSOM-shaped, which lets a future swap to Oxigraph/Cozo/DuckPGQ happen without API churn.

---

## Key Findings

### 1. The "ontology web" is bigger than the original Ch 10 framing assumed
BioPortal (the canonical reference) now houses **1,549 biomedical ontologies (1,182 public) with 15,293,440 terms and over 100 million cross-ontology mappings** as of the 2025 *Nucleic Acids Research* update — not "700 ontologies" as the brief estimated. The full BioPortal RDF dump from earlier (300-ontology era) was already ~190M triples with 9.8M mappings, of which 3.1M came from UMLS CUI joins as `skos:closeMatch`. UMLS Metathesaurus itself is on the order of **15.5 million atoms across 214 source vocabularies grouped into ~4.28 million concepts**, with ~5M hierarchical edges. A naïve N×N pairwise pivot at this scale is 1.5M² ≈ 2.25 trillion ontology pairs — completely infeasible. **No production system attempts it.**

### 2. Real systems are SSSOM-shaped and crosswalk-table-shaped, not graph-engine-shaped
The dominant pattern across BioPortal, OxO/OxO2 (EBI), Biomappings, OBO Foundry, and NIST OLIR is that mappings are **published, exchanged, and queried as flat TSV tables** conforming to the **Simple Standard for Sharing Ontological Mappings (SSSOM)**. SSSOM is explicitly "flat… suitable for describing data primarily exchanged in tabular form such as TSV or CSV, as opposed to JSON". OxO2, the current EBI cross-reference service, uses Nemo (a Datalog rule engine) over SSSOM TSV. NIST OLIR distinguishes three template types — *concept crosswalk*, *set theory relationship mapping*, *supportive relationship mapping* — and stores all three as flat element-pair tables, then computes a "Derived Relationship Mapping" (DRM) on demand by joining two reference documents through a focal document. This is **graph→tabular bridging done by precomputed pairwise edge tables, not by traversal at query time**.

### 3. sqlite-wasm + recursive CTE is fit for purpose at the relevant working-set size
A vault-local Crosswalker user typically loads a *handful* of frameworks (NIST CSF, ISO 27001, SOC 2, NIST 800-53) or a *handful* of OBO ontologies, not all 1,549. At that scale (single-digit-millions of triples), sqlite-wasm with OPFS provides near-native speed and GB-scale persistence, and recursive CTEs handle hierarchy traversal acceptably (SQLite forum benchmark: ~7.7 s for full closure over a 1M-row tree, ~3.9 s with a manual join — both order-of-magnitude faster than what users are willing to wait only on pathological full-graph closure, which is not the use case). The known SQLite quirks (query-planner regressions in 3.44–3.46, the rowMode='object' WASM penalty, the Asyncify-vs-SAB OPFS tradeoff) have documented mitigations and do not constitute a migration trigger.

### 4. DuckDB-WASM and Oxigraph-WASM are real but have ceilings that match SQLite's
DuckDB-WASM beats sql.js by 10–100× on TPC-H but is **bounded by the same ~4 GB browser tab memory cap** and only recently gained partial out-of-core spilling. Oxigraph compiles to WASM but, per its own docs, **disables the RocksDB backend and falls back to in-memory storage when targeting WASM**. There is no in-browser SPARQL engine that scales beyond what sqlite-wasm+OPFS scales to. The native Oxigraph server (or Jena Fuseki) is the right Tier 3 escape hatch precisely *because* it leaves the browser sandbox.

### 5. Six graph→tabular projection patterns, scored

| Pattern | Native shape | Pivot expressivity | Dev-friendliness | Scale ceiling (browser) | Verdict for Crosswalker |
|---|---|---|---|---|---|
| **SPARQL SELECT** (W3C) | RDF triples → variable bindings table | Good (BIND + GROUP_CONCAT for pivot, or post-process) | Steep curve, but standard | ~few M triples (Oxigraph-WASM, in-memory) | **Tier 3 export**, not Tier 2 |
| **SPARQL CONSTRUCT** | RDF → reshaped RDF (then SELECT or serialize) | Excellent for graph reshaping; weak for true pivot (no rotation) | Same as SELECT | Same | Useful for normalizing imports |
| **Cypher RETURN** (Neo4j/openCypher) | Property graph → table | Good (`RETURN ... AS`, `collect`, `apoc.create.row`) | Friendly, visual ASCII-art syntax | Not in-browser without server | Out of scope; vault-native excludes server |
| **SQL/PGQ MATCH … RETURN** (DuckPGQ, ISO SQL:2023) | Property graph view over relational tables → table | Excellent — composes natively with `PIVOT`, `CASE WHEN`, `GROUP BY` | Mature SQL ergonomics + Cypher-like patterns | DuckDB-WASM ~4 GB cap; DuckPGQ still community-extension status | **Future Tier 2 candidate if SQLite hits a wall** |
| **Datalog rule heads** (Cozo, Datomic, Nemo) | EDB facts → IDB rule projection | Excellent for closure & joins; pivot via post-aggregation | Powerful but unfamiliar to most plugin users | Cozo handles 1.6M vertices / 32M edges in ~30s for PageRank; embeddable | **Reserved for materialization pipelines (OxO2-style)** |
| **TinkerPop / Gremlin traversal** | Property graph → step-pipeline → projection | Verbose pivot via `valueMap().select(...)` | Imperative-feeling, harder to debug | No browser story | Out of scope |

The only two patterns that are credibly *both* in-browser and able to express the canonical Crosswalker pivot ("crosstab framework A controls × framework B controls") are **SPARQL SELECT (Oxigraph-WASM, ceiling: low millions of triples in memory)** and **SQL recursive CTE + pivot via `CASE WHEN…GROUP BY` (sqlite-wasm-OPFS, ceiling: GBs on disk)**. Recursive-CTE pivot is what v0.1.5 already ships and what the substrate is best at; SPARQL SELECT is the right Tier 3 export format because it is what every ontology-web system speaks natively.

### 6. The pivot operation does not scale in any substrate at full ontology-web N×N
Modern pivot-table research explicitly identifies **density** as a primary interpretability criterion: "excessive nulls hinder interpretability… humans struggle to draw insights from sparse tables." A full BioPortal cross-product would be ~99.999% empty cells. Every production system handles this by **forcing the user to pick the pair**: BioPortal Mappings UI is pair-scoped; OxO/OxO2 takes a source list and a target list; NIST OLIR's DRM tool requires you to "select Template Type… select one Focal Document at a time" before any cross-reference is generated. **The right Crosswalker UX is identical: the user picks two (or three) frameworks/ontologies, and the substrate materializes only that slice.**

### 7. Five non-GRC ontology-web query archetypes — all reduce to the same primitives

| Query | Decomposition | Primitive ops | Realistic scale |
|---|---|---|---|
| **OBO 3-hop**: GO term → MONDO disease → ChEBI compound | `mappings(GO,MONDO) ⨝ mappings(MONDO,ChEBI)` plus optional closure on each side | `crosswalkBetween` ×2, `closureFromConcept` ×0–2 | Tens of K rows after filtering by user's gene set |
| **SKOS deep traversal**: top concept → narrowerTransitive* | Single recursive walk over `skos:narrower` | `closureFromConcept` (k unbounded) | Few K to tens of K nodes per scheme |
| **MITRE ATT&CK technique → mitigation → 800-53 control** | `attack.technique_to_mitigation ⨝ ctid.mitigation_to_control` | `crosswalkBetween` ×2 | ~600 techniques × ~40 mitigations × ~300 controls — fully materializable |
| **NIST OLIR DRM**: doc A element → focal doc → doc B element | OLIR catalog provides both halves; join through focal | `crosswalkBetween` ×2 | Hundreds to low thousands of mappings per OLIR pair |
| **Library science**: LCSH ↔ MeSH ↔ DDC | Northwestern's curated MARC 7XX linking file joined to OCLC DDC/LCSH co-occurrence | `crosswalkBetween` ×2 | Hundreds of K rows; trivially fits in sqlite-wasm |

Every one of these is expressible as **two existing helpers** (`crosswalkBetween` for join through a mapping table; `closureFromConcept` for transitive narrower/broader/`isa` walk). No new primitive is required for ontology-web framing; only new *data sources*.

### 8. Substrate-neutrality is achievable if the helper API stays narrow and SSSOM-shaped
The current Tier 2 helpers `crosswalkBetween(A, B, opts?)` and `closureFromConcept(c, predicate, opts?)` are inherently substrate-neutral provided three discipline rules hold:

1. **Inputs and outputs are SSSOM-shaped rows** (`subject_id`, `predicate_id`, `object_id`, `mapping_justification`, `confidence`), not SQLite-specific cursor objects.
2. **`closureFromConcept` accepts a depth bound and a predicate URI**, not a hard-coded "parent_id" column.
3. **Recursive CTE is an implementation detail** behind the helper, not part of the contract; a Cozo Datalog rule, an Oxigraph SPARQL property-path query (`?x skos:broaderTransitive ?y`), or a DuckPGQ `MATCH … REPEAT` clause are all drop-in replacements at the helper boundary.

**Audit recommendation: every helper's TypeScript signature should be expressible against an interface that has no SQLite type leakage.**

### 9. Materialization is the universal escape hatch
- **UMLS** ships *precomputed subsets* (Full, Level 0).
- **BioPortal** publishes the 100M+ mapping table as bulk RDF and via REST.
- **OxO2** runs Nemo Datalog ahead of time over imported SSSOM and serves the materialized result.
- **NIST OLIR** *defines* the DRM as a derived artifact computed from two stored OLIRs.

The pattern is unanimous: **at ontology-web scale, the substrate's job is to serve a precomputed crosswalk table efficiently, not to derive it at query time.**

---

## Details

### Per-tier verdict

**Tier 1 — Materialized folders: REAFFIRMED.** No system materializes 100M mappings as files; Crosswalker should not either. Tier 1 stays exactly as designed: user-driven, lazy, per-pair.

**Tier 2 — sqlite-wasm + recursive CTE: REAFFIRMED.** Concrete reasons not to migrate now:
- DuckDB-WASM has the same 4 GB tab memory cap as sqlite-wasm
- Oxigraph-WASM has no on-disk backend at all
- Cozo's Datalog is more expressive but Rust/RocksDB-native form is a server
- Recursive CTE performance issues are bypassable with `PRAGMA automatic_index=OFF`

**Migration trigger to adopt before considering a swap:** a single query of any of the five canonical archetypes takes >1 s on a representative dataset on a mid-range laptop after indices are built. Until that trigger fires, sqlite-wasm stays.

**Tier 3 — RDF/SPARQL stack (Oxigraph-server / Jena Fuseki): REVISED (rename + re-scope).** The original Ch 10 considered Apache AGE, demoted in Ch 16. The right Tier 3 for an *ontology web* is unambiguously the SPARQL/RDF stack.

Recommended: **Oxigraph (embedded Rust binary or sidecar HTTP server) for single-user power use; Apache Jena Fuseki ("Fuseki Main") as the alternative for users already in a Java ecosystem**.

### Pivot scale analysis

| Pivot scope | Cell count | Density | Substrate that handles it cleanly |
|---|---|---|---|
| Small (single GRC pair, e.g. CSF×800-53) | ~10K | ~5–20% | sqlite-wasm `CASE WHEN…GROUP BY` |
| Medium (3-way GRC) | ~10⁵–10⁶ | ~1–10% | sqlite-wasm with index |
| Large (one OBO triple) | ~10⁵–10⁶ after filter | sparse | sqlite-wasm; pre-filter before pivot |
| Ontology-web (BioPortal N×N) | ~10¹² potential cells | `<0.001%` | **Infeasible in any substrate; do not attempt** |

The honest design rule: **the user picks the pair (or triple); the substrate computes only that slice; cells beyond a few hundred thousand should stream rather than materialize all at once.**

### Substrate-neutrality audit checklist (apply to v0.1.5 codebase)

1. Does `crosswalkBetween` return rows shaped like SSSOM?
2. Does `closureFromConcept` take a predicate URI argument or hard-code `parent_id`?
3. Are recursive-CTE strings inlined at call sites, or hidden behind a helper?
4. Are SQLite-specific binding objects, `Database` instances, or prepared statements visible in any public type signature?
5. Is there a single `QueryEngine` interface that an Oxigraph/Cozo/DuckDB implementation could satisfy without touching call sites?

### Materialization-timing recommendation

**Move materialization from v0.1.8 to v0.1.6.** Rationale:
- It is the *one* technique every ontology-web system in the wild uses to make graph→tabular tractable.
- It plays directly to sqlite-wasm's strengths (storing pre-joined SSSOM tables and closure tables; serving them via simple SELECTs).
- It de-risks the Tier 2 substrate decision: with materialization, sqlite-wasm is rarely doing >2-hop recursion at query time, which removes the recursive-CTE-performance class of risk from the Tier 2 dependency.
- It enables SSSOM import/export in v0.1.6, which is the lingua franca for interoperating with OxO2, BioPortal, Biomappings, OBO Foundry, and the EBI tooling.
- It defers Tier 3 (Oxigraph/Fuseki) to v0.1.8 or later, where it belongs.

**Suggested v0.1.6 deliverables:**
1. SSSOM TSV import (canonical mapping table format).
2. Materialized `crosswalk_index` table per user-selected ontology pair, with `(subject_id, object_id, predicate_id, confidence)` columns and `(subject_id, object_id)` index.
3. Materialized closure table per concept scheme the user opts in (ancestor, descendant, depth) — the standard closure-table pattern.
4. Incremental refresh: rebuild only the affected pair on SSSOM file change.
5. Sparse-pivot rendering helper (suppresses empty rows/columns; warns at >100K cells).

### Updated migration triggers

Move off sqlite-wasm only if **all three** are true simultaneously:
1. A canonical query takes >1 s after materialization and indexing.
2. The user is loading a working set that approaches OPFS quotas.
3. The required query primitive is not expressible as SQL.

If only (1) is true, optimize indexes/materialization first. If only (3) is true, route that one query to Tier 3.

---

## Recommendations

1. **Ship v0.1.6 with materialization + SSSOM I/O as the headline feature.** Highest-leverage move.
2. **Hold Tier 2 at sqlite-wasm + recursive CTE.** Do not migrate.
3. **Audit the `crosswalkBetween` / `closureFromConcept` signatures** for SSSOM-shape and substrate-neutrality before writing any new code in v0.1.6.
4. **Re-scope Tier 3 from "graph database" to "SPARQL endpoint (embedded Oxigraph or sidecar Fuseki)" and defer to v0.1.8+.**
5. **In the UI, force pair-selection (or triple-selection) before any pivot is rendered.** Borrow the BioPortal Mappings / OxO / OLIR DRM-tool pattern.
6. **Add a sparse-pivot guard.** If a requested pivot would exceed ~100K cells or ~1% density, warn and offer a streamed CSV export.
7. **Document Cozo and DuckPGQ as known-future-options** in the architecture doc, but explicitly mark them out-of-scope for v0.1.6–v0.1.8.

**Benchmarks that should change these recommendations:**
- If an in-browser Oxigraph build gets a persistent OPFS-backed store, Tier 3 becomes much more attractive and could move earlier.
- If DuckDB-WASM gets stable out-of-core spilling *and* DuckPGQ stabilizes, DuckPGQ becomes a credible Tier 2 alternative.
- If a single canonical query exceeds 1 s post-materialization on representative hardware, escalate that specific query to Tier 3.

---

## Caveats

- **The "700 ontologies / 3.5M UMLS concepts" framing in the brief is undercounting.** Current BioPortal is ~1,549 ontologies / ~15.3M terms / ~100M mappings; UMLS is ~15.5M atoms / ~4.28M concepts.
- **OPFS is not yet available on Obsidian Mobile** at parity with desktop.
- **Recursive CTE has a documented SQLite query-planner regression** (3.44 through ≥3.46).
- **Cypher RETURN, Gremlin valueMap, and Datomic rule heads are technically capable** but have no in-browser story.
- **The "is sqlite-wasm substrate-neutral?" question depends on facts I cannot verify from outside the codebase.**
- **OxO2's choice of Nemo Datalog rather than SPARQL** is recent (2025) and worth tracking.
- **Cross-vault federation is explicitly out of scope.**
