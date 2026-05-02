---
title: "Ch 12 deliverable A: Datalog vs SQL for SSSOM chain rules — focused fork-in-the-road analysis"
description: "Fresh-agent research deliverable for Challenge 12 (focused on the SSSOM chain-rule derivation engine choice). Recommends a hybrid: rules expressed as a Datalog-shaped DSL, executed via either an embedded Datalog engine (Nemo for browser/CLI) or compiled to SQL recursive CTEs (DuckDB-WASM/SQLite-WASM). Validated against EMBL-EBI's OxO2 reference architecture (1.16M mappings derived in 17 min on a laptop)."
tags: [research, deliverable, datalog, sql, sssom, chain-rules, derivation, foundation]
date: 2026-05-02
sidebar:
  label: "Ch 12a: Datalog vs SQL"
  order: -20260502.7
---

:::tip[Origin and lifecycle]
Fresh-agent research deliverable produced 2026-05-02 in response to [Challenge 12: Datalog vs SQL for SSSOM chain rules](/crosswalker/agent-context/zz-challenges/12-datalog-vs-sql-sssom-chain-rules/). Summarized in [05-02 §2.5](/crosswalker/agent-context/zz-log/2026-05-02-direction-research-wave-and-roadmap-reshape/#25-challenge-12--datalog-vs-sql-for-sssom-chain-rules-2-deliverables). Critical read in [05-02 §3.5](/crosswalker/agent-context/zz-log/2026-05-02-direction-research-wave-and-roadmap-reshape/#35-critical-read-of-ch-12). Companion long-horizon report at [Ch 12 deliverable B](/crosswalker/agent-context/zz-research/2026-05-02-challenge-12-deliverable-b-beyond-engine-landscape/). Preserved verbatim; not edited after publication.
:::

# Datalog vs SQL for SSSOM Chain Rules: A Research Report for the Crosswalker Project

## Executive Summary

For Crosswalker — a tool that crosswalks cybersecurity frameworks (NIST CSF, ISO 27001, CIS Controls, MITRE ATT&CK, etc.) using the SSSOM standard — the choice between **Datalog** and **SQL recursive CTEs** for implementing chain/transitivity rules is the architectural fork in the road. The good news is that this is no longer a hypothetical comparison: EMBL-EBI's **OxO2** (June 2025) reimplemented their ontology mapping browser by replacing a graph-database/distance-limited approach with a **Datalog rule engine (Nemo, written in Rust)** running the full set of 22 SSSOM chain rules, and the SeMRA (Semantic Mapping Reasoning Assembler) project from Biopragmatics has independently arrived at a graph-based inference architecture in Python. Their experiences map almost one-to-one onto Crosswalker's needs.

The headline recommendation: **adopt a hybrid architecture in which SSSOM chain rules are expressed declaratively as Datalog (or a Datalog-shaped DSL), and execute them either (a) via an embedded Datalog engine for in-browser/offline use, or (b) by compiling those rules to SQL recursive CTEs (DuckDB / SQLite-WASM) for the actual fixed-point materialization.** This gives Crosswalker the expressive clarity and provable semantics of Datalog (matching how SSSOM itself defines chain rules) while leveraging the maturity, portability, and WebAssembly-readiness of SQL engines for the runtime. The remainder of this report explains why.

---

## 1. The Problem: What SSSOM Chain Rules Actually Require

SSSOM (Simple Standard for Sharing Ontological Mappings, w3id.org/sssom) represents a mapping as a tuple of `subject_id`, `predicate_id`, `object_id`, plus rich metadata including `mapping_justification`, `confidence` (a double in [0,1]), `author_id`, `mapping_set_id`, `mapping_tool`, and provenance fields. Mappings are typically distributed as TSV files with a YAML header containing a CURIE map and metadata.

The SSSOM specification defines **22 chain rules** organized into four families (documented at `mapping-commons.github.io/sssom/chaining-rules/`):

1. **Transitivity rules** — when predicate R is transitive, A−[R]→B and B−[R]→C imply A−[R]→C. Predicates SSSOM treats as transitive by default include `skos:exactMatch`, `owl:equivalentClass`, and (pragmatically) `skos:broadMatch` and `skos:narrowMatch`. Non-transitive predicates include `skos:relatedMatch`, `skos:closeMatch`, `rdfs:seeAlso`, and `oboInOwl:hasDbXref`.
2. **Role chains over exact/equivalent matches (RCE2)** — the most operationally important family. RCE2-1: A−[p]→B ∧ B−[owl:equivalentClass]→C ⊢ A−[p]→C. RCE2-2: A−[p]→B ∧ B−[skos:exactMatch]→C ⊢ A−[p]→C. These are "absorbing" rules where exact/equivalent matches act as identity bridges that preserve any incoming predicate.
3. **Inverse rules** — symmetry, e.g. exactMatch is symmetric, broadMatch and narrowMatch are inverses.
4. **Generalization rules** — weakening, e.g. `owl:equivalentClass` ⇒ `skos:exactMatch` ⇒ `skos:closeMatch`.

For Crosswalker this translates directly: an "ISO 27001 A.5.1" → "NIST CSF GV.PO-01" exact match composed with "NIST CSF GV.PO-01" → "CIS Control 14.1" broad match should yield "ISO 27001 A.5.1" → "CIS Control 14.1" as a (broad) inferred mapping — but only because the bridge predicate is exact, and only with appropriately weakened confidence and an explicit `mapping_justification = SEMAPV:MappingChaining`.

Two additional non-negotiable requirements:

- **Provenance**: every inferred mapping must record the chain rule applied and the source mappings used; SSSOM mandates `mapping_justification` for inferences (`SEMAPV:MappingChaining`), and OxO2 records "tracing"-style single-explanation provenance to prevent the exponential blowup of full why-provenance.
- **Confidence propagation**: SSSOM gives each mapping a confidence ∈ [0,1]; chained inferences must produce a derived confidence that is calibrated and reproducible.

---

## 2. SSSOM Chain Rules as Datalog

The SSSOM chain rules translate almost mechanically into Datalog. Using a relation `m(S,P,O,C)` for "subject S maps via predicate P to object O with confidence C", the core RCE2 family is:

```
% Transitivity of exactMatch
m(A, "skos:exactMatch", C, Cnew) :-
    m(A, "skos:exactMatch", B, C1),
    m(B, "skos:exactMatch", C, C2),
    Cnew = C1 * C2.

% RCE2-2: exactMatch as identity bridge for any predicate p
m(A, P, C, Cnew) :-
    m(A, P, B, C1),
    m(B, "skos:exactMatch", C, C2),
    Cnew = C1 * C2.

% Symmetry of exactMatch
m(B, "skos:exactMatch", A, C) :- m(A, "skos:exactMatch", B, C).

% Generalization: equivalentClass ⇒ exactMatch
m(A, "skos:exactMatch", B, C) :- m(A, "owl:equivalentClass", B, C).
```

Because Datalog has well-defined fixed-point semantics, the inference always **terminates** for finite ground facts (which SSSOM mappings are by construction), is **sound** and **complete** with respect to those rules, and runs in **polynomial time and space** in the size of the input (O(n^k) for some constant k determined by the rule body sizes). OxO2 explicitly leans on these four properties (termination, soundness, completeness, polynomial complexity) as the formal justification for using Datalog.

The SeMRA project arrives at the same conclusion through a different route — implementing the chain rules as graph traversals in NetworkX — but loses the declarative clarity in exchange for fine-grained Python control over evidence aggregation.

---

## 3. SSSOM Chain Rules as SQL Recursive CTEs

The same logic in PostgreSQL/SQLite/DuckDB SQL:

```sql
WITH RECURSIVE inferred(s, p, o, c, depth, justification) AS (
    -- Base case: asserted mappings
    SELECT subject_id, predicate_id, object_id, confidence, 0,
           mapping_justification
    FROM mappings

    UNION

    -- RCE2-2: exactMatch as identity bridge
    SELECT i.s, i.p, m.object_id,
           i.c * m.confidence,
           i.depth + 1,
           'semapv:MappingChaining'
    FROM inferred i
    JOIN mappings m
      ON m.subject_id = i.o
     AND m.predicate_id = 'skos:exactMatch'
    WHERE i.depth < 10  -- safeguard against pathological cycles
)
SELECT s, p, o, MAX(c) AS confidence
FROM inferred
GROUP BY s, p, o;
```

This works in **SQLite** (including the official SQLite-WASM build that runs natively in the browser via OPFS), **PostgreSQL**, and **DuckDB**. SQL's `WITH RECURSIVE` was added in SQL:1999 specifically to handle transitive closure and similar least-fixed-point problems that pure relational algebra cannot express (Aho–Ullman's classical result).

However, SQL recursive CTEs come with practical pitfalls that matter for Crosswalker:

- **Default recursion limits.** MySQL caps `cte_max_recursion_depth` at 1000 by default. SQLite and DuckDB are looser, but a mapping graph with cycles (e.g. `skos:exactMatch` is symmetric, so unguarded queries cycle immediately) will explode.
- **Union-table semantics.** Standard `WITH RECURSIVE` accumulates *every* intermediate row in a "union table", which causes both performance and memory problems on large graphs. DuckDB benchmarks (Bamberg, Hirn & Grust, SIGMOD 2025) show graphs with ~424 nodes and 1,446 edges generate nearly **1 billion rows** under naive recursive CTE evaluation. DuckDB's new **`USING KEY`** extension (May 2025) reduces this to under 20,000 rows by treating intermediate state as an upsertable keyed dictionary — a huge win for shortest-path and transitive-closure queries, but still DuckDB-specific.
- **Single-row iteration overhead.** A GitHub issue (duckdb/duckdb#5568) showed that a 100,000-iteration single-row recursive CTE took ~38s in DuckDB v0.6 vs. <1s in PostgreSQL, because DuckDB's columnar engine is poorly suited to the row-at-a-time pattern. SSSOM chain inference is set-based, not single-row, so this is rarely the dominant cost — but it is a reminder that recursive CTEs are not a silver bullet.
- **Need for explicit cycle detection.** Unlike Datalog engines, which automatically deduplicate facts and stop when no new tuples are produced, SQL CTEs require the developer to either use `UNION` (deduplicates, but expensive) or `UNION ALL` plus an explicit visited-path check.

---

## 4. Side-by-Side Comparison

| Dimension | Datalog | SQL Recursive CTE |
|---|---|---|
| **Fit to SSSOM rules** | One rule = one Datalog clause. The 22 SSSOM chain rules are a near-verbatim translation. | Each rule must be hand-coded into a UNION arm; combining all 22 in one CTE is verbose and error-prone. |
| **Termination** | Guaranteed for pure (range-restricted) Datalog; engine handles fixed point. | Developer must add depth limits or visited-set tracking; unguarded queries cycle infinitely on symmetric predicates. |
| **Deduplication** | Built into seminaive evaluation — facts are stored in sets. | `UNION` deduplicates but is expensive; `UNION ALL` is fast but requires manual path-history tracking. |
| **Performance on large mapping sets** | Modern engines (Soufflé, Nemo, RDFox, VLog) use seminaive evaluation, columnar materialization, and delta tables. OxO2 processes 1.16M mappings in 17 min on a laptop. | DuckDB and PostgreSQL are highly tuned; DuckDB's new `USING KEY` (2025) closes much of the gap. SQLite is slower but workable for tens of thousands of mappings. |
| **Recursion depth** | Unlimited (engine iterates to fixed point). | Engine-imposed caps (MySQL: 1000; others: configurable). |
| **Expressiveness for SSSOM features** | Naturally handles role chains, inverse rules, generalization rules in one paradigm. Aggregation (for confidence) varies by engine. | Recursive CTEs handle transitivity well; role chains require extra joins; semilattice aggregation in recursion is awkward. |
| **Confidence propagation** | Engines like Nemo, Soufflé, and Flix support arithmetic and (stratified) aggregates inside rules; aggregation inside recursion is supported via lattices in some engines. | Easy to multiply confidences in the recursive arm; combining alternative paths requires a final `GROUP BY ... MAX/AGGREGATE` outside the CTE. |
| **Provenance / explanation** | First-class: engines like Nemo emit per-fact derivations ("tracing"); RDFox supports why-provenance. | Must be built manually (e.g. carry an array of source mapping IDs through the recursion). |
| **In-browser deployment** | DataScript (JS), Datahike (JVM/JS), CozoDB (WASM build), Logica-via-DuckDB-WASM, Nemo (Rust → WASM) all run in the browser. | SQLite-WASM and DuckDB-WASM are extremely mature; both are first-class browser citizens. |
| **Ecosystem maturity & hiring** | Niche; learning curve is real for SQL-trained engineers. | SQL skills are universal; debugging and tooling are everywhere. |
| **Portability of rules** | Rule files are portable across Datalog engines (with dialect adjustments). | CTE syntax differs subtly across SQLite/Postgres/DuckDB. |
| **Reference implementation for SSSOM** | **OxO2 (EMBL-EBI, 2025) uses Nemo/Datalog for all 22 chain rules.** | No major SSSOM tool uses pure SQL CTEs as the inference engine. |

---

## 5. Datalog Engines Practical for Embedding

The Datalog landscape in 2026 has consolidated around a handful of credible options. The most relevant for Crosswalker:

**Nemo (knowsys/nemo, TU Dresden).** Written in Rust. In-memory, command-line tool that loads facts and rules and writes inferences. Implements seminaive evaluation, column-oriented storage with delta tables, and "tracing" provenance for explanations. Supports pure Datalog plus stratified negation, datatypes, aggregates, and existential rules. **Demonstrated at scale on SSSOM in OxO2**: 1,160,020 input mappings → 49,536 inferred mappings in ~17 min using ~380 MB on a laptop. Has CLI clients for major platforms, a public web app with a built-in rule editor, a VSCode extension, and **a WebAssembly build** that runs in browsers. This is the strongest match for Crosswalker's exact use case.

**Soufflé (souffle-lang.github.io).** C++. State-of-the-art Datalog, originally built for static program analysis at Oracle. Compiles rules to native C++ for speed. Excellent on large datasets (billions of tuples) but heavy to embed; not a natural browser fit.

**CozoDB (cozodb/cozo).** Rust. Embeddable transactional graph database with Datalog as its query language. Has a WASM build, supports HNSW vector indices, and is explicitly positioned as "SQLite for graphs". A strong choice if Crosswalker also wants to do similarity search against control text — chain rules and embedding-based candidate generation in the same engine.

**Datahike (replikativ/datahike).** Clojure/ClojureScript. Datomic-compatible APIs, runs on JVM, Node.js, and **in the browser** via ClojureScript. Persistent, time-travel queries. Best when you want a durable, transactional Datalog DB (overkill for Crosswalker if mappings are loaded fresh each session, but compelling if mappings are curated continuously).

**DataScript (tonsky/datascript).** Pure ClojureScript/JS, in-memory only. Designed explicitly to run in the browser; extremely lightweight. The natural choice for an ephemeral browser-side Datalog store. Not as fast as Nemo or Soufflé but ideal for under ~100k facts.

**XTDB (xtdb.com).** Bi-temporal Datalog database. Powerful but server-oriented; not the right shape for a lightweight in-browser tool.

**Datomic.** Commercial, JVM-based, server-oriented. Wrong shape for Crosswalker.

**Logica (Google, EvgSkv/logica).** Datalog-family logic language that **compiles to SQL** (BigQuery, PostgreSQL, SQLite, DuckDB). Particularly interesting for Crosswalker because it lets you write SSSOM chain rules in a Datalog dialect *and* execute them as SQL recursive CTEs in DuckDB-WASM — getting the best of both worlds at a syntax-translation level. The trade-off is that Logica is a research project from a very small team, and its production polish is well below Nemo's or Soufflé's.

**Minigraf (project-minigraf).** A newer single-file embedded Datalog database in Rust with bi-temporal semantics, runs natively and in WebAssembly. Worth tracking but young.

**Honourable mentions for completeness:** RDFox (commercial, very fast OWL 2 RL), VLog, Vadalog, Flix, Ascent (Rust EDSL), Naga.

---

## 6. SSSOM Tooling in the Wild

Three reference projects bracket the design space:

- **sssom-py** (mapping-commons/sssom-py): the canonical Python toolkit. Reads/writes SSSOM TSVs, validates, transforms. Chain-rule materialization is not its primary purpose.
- **sssom-java**: independent Java implementation; supports rule-based arbitrary transformations and an experimental ROBOT plugin.
- **OxO2** (EBISPOT/oxo2): EMBL-EBI's mapping browser, 2025. The reference architecture for SSSOM-with-chain-rules: ingest SSSOM, run Nemo to materialize all 22 chain rules at data-load time, store the materialized mappings + explanations in Solr, expose a Java/Spring backend and React/TypeScript frontend. Removes the "distance-3" limit of the original OxO and provides logically sound crosswalks of unbounded length.
- **SeMRA** (biopragmatics/semra): Python-based "Semantic Mapping Reasoning Assembler". Decomposes mappings from evidence (unlike SSSOM, which packages them together), implements SSSOM chain rules as graph algorithms (NetworkX-based), and has produced an aggregated database of 43.4 million mappings from 127 sources. Confidence model is inspired by Bachman et al. (2023).
- **OAK (Ontology Access Kit)**: provides SSSOM I/O and various operations.
- **Biomappings** (biopragmatics/biomappings): community-curated repository of negative and positive predicted mappings; integrates with SeMRA.
- **ROBOT** (OBO tool): historically OWL-reasoner-driven; has experimental SSSOM-Java plugin support.

For cybersecurity specifically, the public crosswalk landscape is dominated by **NIST's official mappings** (NIST 800-53 ↔ ISO 27001:2022, NIST 800-53 ↔ NIST CSF 2.0), the **CIS Controls v8 → NIST CSF 2.0** crosswalk published by the Center for Internet Security, and commercial tools like **CyberSaint CyberStrong** (NLP-driven), **Secureframe**, **Censinet**, and **SaltyCloud Isora GRC**, plus a handful of free browser-based tools like **InventiveHQ's NIST CSF Mapper**. None of these public cybersecurity crosswalk tools currently uses SSSOM as their interchange format or chain-rule reasoning over the mappings — which is precisely the gap Crosswalker can fill.

---

## 7. Confidence Propagation Through Chains

SSSOM defines `confidence` as a score in [0,1] indicating "the confidence or probability that the match is correct, where 1 denotes total confidence" (sssom:confidence). When mappings are chained, the inferred mapping needs a derived confidence. The literature offers several approaches; the leading practical options for Crosswalker are:

**(a) Independent-probability product (most common heuristic).** Treat each mapping's confidence as an independent probability of correctness, so for a chain A→B→C: `conf(A→C) = conf(A→B) × conf(B→C)`. Easy to implement in both Datalog (`Cnew = C1 * C2`) and SQL (`i.c * m.confidence`). Conservative — confidence decays monotonically with chain length, which is usually desirable. Used implicitly by SeMRA and recommended in Hoyt's Biopragmatics blog post on SeMRA inference. Theoretically wrong when mappings are not independent, but the bias is on the safe side.

**(b) Hierarchical / evidence-aggregated confidence (SeMRA, after Bachman et al. 2023).** Each mapping has multiple evidence objects; the confidence of a mapping is computed hierarchically over evidence. For a chain inference (a "complex evidence"), confidence is derived from the confidences of the mappings used to construct it, multiplied by an optional consumer confidence factor for the reasoning approach itself. This is the most principled approach when mappings have multiple supporting sources, and it directly addresses the SSSOM gap that the standard does not yet model multi-evidence confidence.

**(c) Min / weakest link.** `conf(A→C) = min(conf(A→B), conf(B→C))`. Used in fuzzy-logic systems (Gödel t-norm). Less aggressive than the product but does not penalize long chains as strongly. Useful when you want chain length to be ignored.

**(d) Imprecise probability / coherent intervals (Gilio, Pfeifer, Sanfilippo).** Maintain a [lower, upper] interval per mapping; propagate via coherent probability rules. Theoretically rigorous but requires interval arithmetic and adds significant complexity. Probably overkill for v1 of Crosswalker.

**(e) Predicate-aware decay.** The strength of the inference also depends on the predicates being chained. An exact-match bridge should preserve confidence almost perfectly; a `skos:closeMatch` bridge should attenuate more aggressively. A practical formula: `conf(A→C) = conf(A→B) × conf(B→C) × κ(p1, p2)`, where κ is a predicate-pair attenuation factor (κ = 1 for exact↔exact, κ ≈ 0.9 for exact↔broad, κ ≈ 0.7 for broad↔broad, etc.).

**Recommendation for Crosswalker.** Start with the independent-probability product (option a) plus a per-rule attenuation factor κ recorded in the chain-rule definition (option e). This is implementable in 5 lines of Datalog or SQL, easy to explain to users, and sets up cleanly for upgrading to SeMRA-style hierarchical confidence later. Always store both the asserted and the inferred confidence, never overwriting.

---

## 8. Architectural Recommendation for Crosswalker

Crosswalker's stated requirements are:

1. Process thousands of mappings across multiple frameworks (NIST CSF, ISO 27001, CIS, MITRE ATT&CK, etc.) — that is a **small-to-medium** workload, well under OxO2's 1.16M-mapping demonstration.
2. Support user-defined chain rules — rules need to be *data*, not code.
3. Run in-browser or as a lightweight application — eliminates server-only options.
4. Handle confidence propagation — needs arithmetic in the rule body.
5. Support SSSOM import/export — text-format friendly.

Given these constraints, the right architectural pattern is a **two-layer split between rule representation and rule execution**:

**Layer 1 — Rule representation: a Datalog-shaped DSL.**
Encode the 22 SSSOM chain rules (plus user-defined extensions) as Datalog rules in a small TSV/YAML/JSON file or embedded in the application. This keeps the rules declarative, auditable, and identical to the OxO2 reference. A user adding a custom rule like "any ISO 27001 control mapped to a NIST 800-53 control via skos:exactMatch should also map to the corresponding CSF subcategory via skos:broadMatch" writes one rule, not a stored procedure.

**Layer 2 — Execution: pick based on deployment mode.**

| Deployment | Recommended engine | Why |
|---|---|---|
| **Pure browser (SPA, GitHub Pages, no server)** | **DuckDB-WASM** with rules compiled from the DSL to recursive CTEs (Logica-style) | Mature, fast, runs entirely client-side, can read SSSOM TSV directly, has `USING KEY` for graph queries, ships in ~30 MB |
| **Browser, but rule semantics are the priority** | **CozoDB** (WASM build) or **Datahike** (ClojureScript), with native Datalog | Native SSSOM-rule fidelity; CozoDB also gives free vector search for control-text similarity |
| **CLI/desktop/Electron** | **Nemo** (Rust binary or library) | Same engine OxO2 uses; best provenance/tracing; easy to bundle |
| **Server-side batch (data-release pipeline)** | **Nemo** or **Soufflé** | Highest throughput; produces materialized SSSOM TSVs for downstream tools |

**The hybrid sweet spot.** For Crosswalker specifically, my strongest recommendation is to **author the rules in a small Datalog dialect and ship two interchangeable backends**: (1) a **DuckDB-WASM** backend that compiles the rules to `WITH RECURSIVE` CTEs for fast in-browser execution and SQL interop, and (2) a **Nemo** (or CozoDB) backend for users who want to run a CLI batch reasoner. Logica already does the Datalog-to-SQL compilation step; you can either depend on it or implement a small bespoke compiler for the ~22 SSSOM rule shapes (which are very regular). This pattern delivers:

- Rules are written once and live in version control as data.
- The browser experience is instant (DuckDB-WASM is a few hundred milliseconds to load and queries 100k mappings in milliseconds).
- The CLI experience uses a real Datalog engine with proper provenance.
- SSSOM TSV import/export is trivial in both DuckDB (`read_csv`) and Nemo.

**What I would not do:**

- *Do not* hand-code the 22 SSSOM rules as 22 distinct SQL queries in application code. That is the opposite of declarative; you will be debugging them forever.
- *Do not* build on Datomic or XTDB if browser execution is in scope; they are server-shaped.
- *Do not* rely solely on OWL reasoners (HermiT, ELK, Pellet). They are powerful but heavy, JVM-bound, and they implement *OWL* semantics, which is stricter than SSSOM's deliberately pragmatic chain rules — you would lose the very flexibility SSSOM was designed to provide.

---

## 9. Long-Term Considerations

**Maintainability.** Datalog rule files are dramatically easier to review, diff, and extend than equivalent SQL. The OxO2 paper makes this point explicitly: "Since Datalog is declarative, one can state the rules that are applicable, without having to state how the inferences are determined." Each new SSSOM chain rule is one line of Datalog versus a UNION arm + a join + a depth guard in SQL. Over a 5-year horizon, the rules *will* evolve (SSSOM is at an active community spec, with new chain rules being proposed), and rule-as-data is the only sane way to absorb that.

**Extensibility for cybersecurity-specific rules.** Cybersecurity crosswalking has domain-specific rules that are not in stock SSSOM — e.g., "ATT&CK technique → mitigates → CSF subcategory" is a non-mapping relation that should not chain through `skos:exactMatch` like a regular bridge. Datalog handles this elegantly: define new predicates, write rules, done. SQL can do it too but the verbosity scales linearly with rule count.

**Performance.** For Crosswalker's expected scale (tens of thousands of mappings across all major cybersecurity frameworks combined), both approaches are well within the engine's comfort zone. The performance question only becomes interesting above ~10⁶ mappings, at which point Nemo and DuckDB are both demonstrated to work; SQLite recursive CTEs start showing strain. The OxO2 numbers (1.16M facts, 17 min, 380 MB) bracket the worst case.

**Provenance and explanation.** This is where Datalog has a structural advantage. SSSOM mandates `mapping_justification = SEMAPV:MappingChaining` for inferred mappings, and increasingly users want to know *which* asserted mappings produced an inference. Nemo and RDFox provide this natively (one-explanation tracing in Nemo; full why-provenance in RDFox). In SQL you carry provenance manually as an array column through every recursive step. Workable but tedious.

**Risk of vendor lock-in.** Datalog dialects differ; SQL CTE syntax also differs. A small abstraction layer in Crosswalker (the rule DSL above) insulates against either.

---

## 10. Concrete Next Steps for Crosswalker

1. **Write down the 22 SSSOM chain rules as a single rule file** in your DSL of choice (suggest a TSV or YAML where each row is `name`, `head`, `body`, `confidence_combinator`, `predicate_attenuation`).
2. **Prototype with DuckDB-WASM in the browser.** Load a small SSSOM TSV (e.g. NIST CSF 2.0 ↔ CIS v8) and a hand-written `WITH RECURSIVE` query implementing RCE2-2 + transitivity of exactMatch. Measure on a realistic mapping set (a few thousand rows). This will be fast.
3. **In parallel, prototype with Nemo as a CLI.** This gives you an immediate sanity check that the rules are correct (compare materialized inferences across the two backends — they must agree).
4. **Implement the rule compiler** (Datalog→SQL recursive CTE) for the rule shapes you need, or adopt Logica if its dialect suits you.
5. **Adopt the independent-probability confidence model** with per-predicate-pair attenuation factors κ as a starting point, and store inferred confidences alongside asserted ones.
6. **Watch SeMRA and OxO2.** Both are actively developed and will set the practical standards for SSSOM chain-rule tooling over the next 12–24 months. Aligning Crosswalker's data model with SeMRA's evidence/mapping decomposition is likely worth doing early — SSSOM itself is moving in that direction.
7. **Publish your cybersecurity SSSOM mapping set** (NIST CSF ↔ ISO 27001 ↔ CIS ↔ ATT&CK) as TSVs in a public mapping commons. This is a community gap; the bioinformatics world has dozens of SSSOM mapping sets but cybersecurity has none, and it would make Crosswalker a natural reference implementation.

## 11. Conclusion

Datalog is the right *semantic model* for SSSOM chain rules — this is no longer in serious dispute since OxO2's 2025 implementation. SQL recursive CTEs are the right *runtime* in many practical deployments, especially in-browser via DuckDB-WASM or SQLite-WASM. For Crosswalker, the optimal architecture treats SSSOM chain rules as declarative Datalog data, compiles them to whichever backend (Datalog engine or SQL CTE engine) the deployment context demands, propagates confidence multiplicatively with predicate-aware attenuation, and persists provenance per inferred mapping. This pattern is already validated by the most advanced SSSOM tools in production today, and it gives Crosswalker the rare property of being both rigorously correct and practically deployable as a lightweight application.
