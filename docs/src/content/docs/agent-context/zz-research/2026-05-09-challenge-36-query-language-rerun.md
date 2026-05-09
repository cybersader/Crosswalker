---
title: "Ch 36: Query language under ontology-web framing (rerun of Ch 12)"
description: "Fresh-agent research deliverable for Challenge 36 — rerun of Ch 12. Original asked Datalog vs SQL narrowly for SSSOM chain-rule derivation; rerun asks the broader question — what query language does the recipe author / user actually write? Verdict: REVISE Ch 12 narrowly. Adopt compositional language stack: YAML recipes (Layer C) → SQL recursive CTE (Layer A, sqlite-wasm) → JSON view-specs (Layer B) → Bases YAML for vault-scoped views. Datalog stays internal-only as a YAML rules: sub-DSL. No Crosswalker-invented DSL. Anchored by LLM-friendliness benchmarks (zero-shot: SQL ≈ 47%, Cypher ≈ 34%, MQL ≈ 22%, SPARQL ≈ 3%) and industry precedent (dbt, OpenRewrite, Argo Workflows, K8s)."
tags: [research, deliverable, query-language, sql, datalog, sparql, cypher, gql, graphql, yaml, llm-friendliness, ch-12-rerun, ch-36]
date: 2026-05-09
sidebar:
  label: "Ch 36 · Compositional stack"
  order: -20260509.5
---

:::tip[Origin and lifecycle]
Fresh-agent research deliverable produced 2026-05-09 in response to [Challenge 36: Query language rerun (of Ch 12)](/crosswalker/agent-context/zz-challenges/36-query-language-rerun/). Original Ch 12 brief (archived) asked Datalog vs SQL narrowly for SSSOM chain-rule derivation; this rerun asks the broader question — what query language does the recipe author / user actually write? Absorbed into the [Ontology-web query engine synthesis log](/crosswalker/agent-context/zz-log/2026-05-07-bases-query-layer-architecture-synthesis/) — see Settled #17 (compositional language stack). Preserved verbatim.
:::

# Challenge 36: Query Language Under Ontology-Web Framing — Crosswalker Decision Brief

## TL;DR

- **Adopt a compositional, three-tier language stack — no new Crosswalker DSL.** Recipe authors (Layer C) write **YAML** with structured `query:` blocks; the engine compiles to **SQL with recursive CTEs** running on `sqlite-wasm` (Layer A); user-facing surfaces use **Obsidian Bases YAML/expression syntax** for vault-scoped slicing and standard SQL only inside explicit "advanced" code-block escapes. This rejects the "fourth-language" anti-pattern, preserves the v0.1 substrate, and keeps every surface authorable by humans first and LLMs second.
- **Reconcile Ch 12 by partial REVISE.** Datalog is genuinely better than SQL for SSSOM chain-rule derivation (the original verdict still holds *for that one task*), but the broader ontology-web workload — closure, anti-join, pivot, cross-ontology join, aggregation — is well-served by SQL recursive CTEs alone. The right architecture is therefore: ship a **thin internal Datalog-shaped rule sub-DSL inside YAML** (predicate/head/body, no new parser surface) that **compiles to SQL recursive CTEs**, exactly as Ch 12 said, but treat it as a *recipe primitive*, not a user-facing query language. No Cozo, Nemo, or Oxigraph in v0.1.x.
- **LLM-friendliness reinforces the same answer.** Published benchmarks (SM3-Text-to-Query, Spider/BIRD, CypherBench, Spider4SPARQL) show zero-shot accuracy of roughly **SQL ≈ 47% > Cypher ≈ 34% > MQL ≈ 22% >> SPARQL ≈ 3%**, with YAML/JSON config formats higher still. SQL-on-sqlite-wasm + YAML recipes is also the most LLM-authorable surface combination available today, and it is the only stack that fully runs in the Obsidian mobile (Capacitor) environment without SharedArrayBuffer/OPFS dependencies that desktop-only stacks (Oxigraph-WASM, Nemo-WASM, Cozo-WASM) require.

---

## Key Findings

1. **Bases is not a general query language; it is a vault-scoped expression DSL.** The Obsidian Bases syntax (a YAML schema with `filters`, `formulas`, `views`, `summaries`) supports boolean expressions, list `.map/.filter/.reduce`, link traversal via `file.links` / `file.backlinks`, summary aggregations (Average/Min/Max/Sum/Range/Median/Stddev), and recursive *filter object structure* (and/or/not nesting). It does **not** support fix-point recursion, transitive closure, anti-join across arbitrary predicates, or pivot/crosstab. Bases is therefore the right surface for **vault filtering and presentation**, not for ontology-web reasoning.

2. **SQL recursive CTEs cover the closure/path/anti-join/pivot/aggregation surface.** SQLite's `WITH RECURSIVE` (since 3.8.3) is mature, well-documented, and supported in `sqlite-wasm`. It expresses transitive closure, breadth-first/depth-first traversal, cycle avoidance via path-string tracking or `UNION` (distinct), and has a built-in `transitive_closure` virtual-table extension. Performance is excellent up to ~100k entities with depth-≤4 traversals (the realistic ceiling for GRC framework crosswalks).

3. **SPARQL property paths are the most expressive standard for closure but cost ~3 MB WASM.** SPARQL 1.1 property paths (`p*`, `p+`, `p?`, `p1/p2`, `^p`, `!p`) cleanly express ontology-web traversal and are the natural language for SSSOM mappings. Oxigraph compiled to WASM works in browsers and Node.js but ships a ~900 KB-3 MB WASM payload plus ~470 KB of JS glue, and SPARQL evaluation in Oxigraph is "in heavy development and not yet optimized." Not a v0.1.x fit. Worth re-evaluating in v0.3+ if RDF interop becomes a deliverable.

4. **Datalog is genuinely better than SQL for *rule-based* derivations, but worse for everything else.** Soufflé outperforms SQLite/PostgreSQL/Neo4j on transitive-closure micro-benchmarks. Cozo, Nemo, Datascript/Datahike all run in the browser via WASM. **However:** (a) Cozo's WASM build is research-grade and adds another full database engine alongside sqlite-wasm; (b) Nemo is explicitly a research tool from TU Dresden; (c) Datalog lacks standard pivot/crosstab and aggregate surface area that GRC analysts expect; (d) every Datalog dialect is incompatible with every other. The correct use of Datalog in Crosswalker is **as an internal rule format, compiled to SQL CTE**, exactly as the Ch 12 verdict said — but exposed only inside YAML rule blocks, not as a user surface.

5. **GQL/Cypher is the right standard 5-10 years from now, but has no viable WASM build today.** ISO/IEC 39075:2024 (published April 2024) is the first new ISO database language standard since SQL in 1987. But: there is no production-quality Cypher/GQL WASM engine; Neo4j requires a server. Reject for v0.1.x.

6. **GraphQL is the wrong category.** GraphQL is a typed selection-set protocol for fetching nested object trees from typed APIs; it has no native transitive closure, no anti-join, and pivot/crosstab is impossible without joining-server hacks. It is appropriate as a *future export/API surface*, never as the recipe author's language.

7. **LLM authorability rankings have been measured.** The SM3-Text-to-Query benchmark reports zero-shot LLM accuracy of: **SQL 47.05%, Cypher 34.45%, MongoDB MQL 21.55%, SPARQL 3.30%**. Spider/BIRD report SQL execution accuracy of 80–86% with modern reasoning prompts. Datalog has no published benchmark of comparable size. **YAML and JSON, being structured config rather than executable code, are the most reliably LLM-authorable surfaces of all** (this is why every modern AI-tooling product uses YAML DSLs).

8. **Mobile is the binding constraint.** Obsidian Mobile uses CapacitorJS, which historically lacked `SharedArrayBuffer` and OPFS support. **Any choice that requires a non-SQLite WASM database engine breaks mobile parity**. SQL via sqlite-wasm (with a `wa-sqlite` fallback for mobile) is the only path that satisfies "don't lock engine to one substrate" while still working everywhere.

9. **OxO2 is the closest production analog and validates the layered approach.** EBI's OxO2 (2025) implements SSSOM crosswalks using **Nemo (Datalog) materialized at release time**, with the Datalog purely internal to the data-load process; the user-facing API exposes search and SSSOM metadata, not Datalog. This is direct precedent for Crosswalker's recommended layering.

---

## Details

### 1. Language survey

| Language | Strengths | Weaknesses | Substrate binding | Closure | Anti-join | Pivot | Cross-ontology join | Aggregation | Path queries |
|---|---|---|---|---|---|---|---|---|---|
| **SQL (recursive CTE)** | Universal, ISO standard, ubiquitous LLM training, mature in sqlite-wasm | Verbose for path queries; cycle handling is manual; pivot needs `CASE WHEN` or `crosstab` extension | Any RDBMS | ✅ via `WITH RECURSIVE` | ✅ via `LEFT JOIN … WHERE … IS NULL` or `NOT EXISTS` | ✅ (manual `CASE` or PIVOT) | ✅ via plain JOIN | ✅ first-class | ✅ but verbose |
| **SPARQL 1.1** | W3C standard, RDF-native, property paths are the cleanest closure syntax in any language | Smaller community; LLM accuracy ~3% zero-shot; aggregate semantics are subtle | Any triple store | ✅ native (`p*`, `p+`) | Limited (`MINUS`, `FILTER NOT EXISTS`) | Awkward | ✅ federated query | ✅ | ✅ first-class |
| **Datalog (Cozo/Nemo/Soufflé/Datomic)** | Recursion is natural, declarative; outperforms SQLite/Postgres/Neo4j on closure | No standard dialect; LLM authorability poor | Engine-specific | ✅ native | ✅ via stratified negation | Manual | ✅ | ✅ (varies by dialect) | ✅ |
| **Cypher / openCypher / GQL** | ASCII-art pattern matching; ISO 39075:2024; LLM accuracy ~34% | No production WASM engine; Neo4j is a server; GQL is so new that adoption tail is minimal | Neo4j, Memgraph, AGE on Postgres | ✅ via `*` quantifier | ✅ | Limited | ✅ | ✅ | ✅ first-class |
| **GraphQL** | Typed selection sets; great for serving APIs; LLMs author it well | Not a query language for unknown-shape graphs; no closure, no anti-join across types, no pivot | Any HTTP server | ❌ | ❌ (vendor extensions only) | ❌ | ✅ via @link directives | ✅ via type-aggregation | Limited |
| **Bases DSL (Obsidian)** | Native to Obsidian; YAML-based; expression syntax familiar to spreadsheet users | Vault-scoped only (no joins between non-vault data); no transitive closure; aggregations limited to summary functions | Obsidian only | ❌ (filed feature request open) | Limited | ❌ | ❌ (single-vault) | Limited (summaries) | ❌ |
| **Custom/unified Crosswalker DSL** | Maximum domain fit | Anti-pattern: yet-another-language to learn, parse, document, debug; LLMs cannot author it without examples; ecosystem cost is permanent | None (would have to build) | depends | depends | depends | depends | depends | depends |

### 2. Surface × Language matrix (recommendation)

| Surface | Recommended language | Why |
|---|---|---|
| **(a) User types in `.base` file** | **Bases YAML/expression syntax** | Native to Obsidian; only sane choice; users already know it |
| **(b) User writes in code-block body** (advanced escape) | **SQL** (against materialized SQLite tables) inside a fenced ` ```crosswalker-sql ` block | Universal, LLM-authorable, escape hatch when Bases is insufficient |
| **(c) Recipe author writes in YAML `query:` block** | **Structured YAML** (declarative recipe schema) with optional Datalog-shaped `rules:` sub-blocks for derivations | YAML is the highest-LLM-authorability config format; rules sub-block is internal Datalog *shape*, not a Datalog *language* |
| **(d) Engine compiles to internally** | **SQL recursive CTEs against sqlite-wasm** | Single substrate, mobile-compatible, mature, fast at GRC scales |
| **(e) Inter-tier protocol** (Layer A↔B↔C) | **JSON** (relations, columns, rows) for data; **YAML** for declarations | Standard, language-neutral, debuggable; do not invent a binary format |

### 3. The "unified Crosswalker DSL" question — verdict: COMPOSITIONAL

The correct answer is the third option: **different surfaces use different languages, and the recipe YAML hides the underlying choice from users**.

- **Reject YES (build a Crosswalker DSL).** This is the explicit Ch 27/28 anti-pattern. Every team that builds a custom query DSL spends years on parser/IDE/error-message/LLM-prompt tooling that SQL/SPARQL/Cypher already have for free.
- **Reject NO-pick-ONE.** No single existing language fits every Crosswalker surface.
- **Accept COMPOSITIONAL.** Each surface uses the language native to its layer. This is exactly the architecture of dbt, OpenRewrite, Argo Workflows, and Kubernetes.

### 4. Mobile / WASM constraints — bundle and parity table

| Engine | WASM size | Mobile (Obsidian Capacitor) | Recursive closure | Maturity |
|---|---|---|---|---|
| `@sqlite.org/sqlite-wasm` (OPFS) | ~900 KB WASM + ~470 KB JS | Partial (needs SharedArrayBuffer + OPFS, currently desktop-only) | ✅ | Production |
| `wa-sqlite` (AccessHandle/IDB) | ~570 KB WASM + ~230 KB JS | ✅ | ✅ | Production-ish |
| `subframe7536/sqlite-wasm` | ~300 KB gz | ✅ (IDB fallback) | ✅ | Active community |
| Oxigraph-WASM | ~3 MB total bundle | ❌ (large; SPARQL evaluation unoptimized) | ✅ (property paths) | Beta |
| Cozo-WASM | ~2 MB+ | ❌ (research-grade) | ✅ native Datalog | Pre-1.0 |
| Nemo-WASM | ~1–2 MB (in-memory only) | ❌ (research artifact) | ✅ | Research |
| Cypher/GQL WASM | n/a | ❌ no production build | ✅ | Nonexistent |

**Verdict:** Use `wa-sqlite` (or `subframe7536/sqlite-wasm`) on mobile, official `@sqlite.org/sqlite-wasm` on desktop where OPFS is available, behind a single VFS abstraction.

### 5. LLM-friendliness ranking (with citations)

Authoritative numbers from the SM3-Text-to-Query benchmark (zero-shot, no schema):

1. **SQL ≈ 47%** execution accuracy (modern reasoning models on Spider hit 80–86%)
2. **Cypher ≈ 34%** (CypherBench reports GPT-4o at ~60% with schema)
3. **MongoDB MQL ≈ 22%**
4. **SPARQL ≈ 3%** zero-shot
5. **Datalog** — no published large-scale benchmark
6. **Bases DSL** — newer than most training cutoffs
7. **YAML recipes** — highest of all

**Implication:** SQL underneath + YAML on top is the LLM-optimal stack.

### 6. Original Ch 12 reconciliation — verdict: REVISE (narrowly)

The Ch 12 verdict ("Datalog DSL compiled to SQL recursive CTEs for SSSOM chain rules") was **correct for SSSOM specifically and the right shape generally, but should not be promoted to Crosswalker's primary query model.**

- **AFFIRM (partially):** For SSSOM chain-rule derivation, OxO2 itself uses Datalog (Nemo) for exactly this reason.
- **REVISE (mostly):** The bulk of Crosswalker queries are **closure + anti-join + pivot + aggregation**, all of which SQL recursive CTEs handle natively at GRC scale.
- **DEFER:** Treat SSSOM as the special case it is. The "Datalog rule sub-DSL" is exposed only inside YAML `rules:` blocks within recipes that explicitly declare SSSOM-style derivations.

### 7. Recommended layering (the architecture)

| Layer | Surface | Language | Why |
|---|---|---|---|
| **Layer A — Primitives** (closure, anti-join, pivot, group-by, path) | Internal API; not user-visible | **SQL recursive CTEs** parameterized by predicate name, depth limit, cycle policy | Mature substrate; sqlite-wasm runs everywhere; LLM-authorable |
| **Layer B — View shapes** | Plugin renderers | **JSON view-spec** (rows, columns, group keys, drill-down links) | Decouples query result from rendering |
| **Layer C — Recipes** (declarative authored crosswalk procedures) | `.crosswalker.yaml` files committed to the vault | **YAML schema** with `sources`, `query`, `derivations` (Datalog-shaped sub-DSL), `views`, `exports` | Highest LLM-authorability; humans can hand-edit; version-controlled |

### 8. Concrete implementation guidance

**v0.1.6 — Bases queries (the user-visible surface)**
- Ship a Bases-compatible `.base` file generator
- Bases formulas: provide a small library of helper expressions
- Publish a YAML recipe schema (JSON-Schema-validated) with `query:` as a structured object
- LLM prompt templates: ship example recipe YAML files

**v0.1.7 — Exporters (the protocol/escape-hatch surface)**
- Add an "advanced SQL" code-fence: ` ```crosswalker-sql ` blocks
- Add CSV/TSV/SSSOM-TSV/JSON-LD exporters
- Add a `crosswalker-sparql` code-fence behind a feature flag

**v0.1.8 — Audit trail (the provenance surface, where Datalog earns its keep)**
- Implement the Datalog-shaped `derivations:` sub-DSL inside recipe YAML
- Materialize a `crosswalker-derivations` table mirroring the SSSOM provenance vocabulary
- Audit-trail viewer

---

## Recommendations

**Do this now (v0.1.6–v0.1.8):**

1. **Adopt the compositional stack.** YAML recipes (Layer C) → SQL recursive CTEs (Layer A) → JSON view-specs (Layer B) → Bases YAML for vault-scoped views.
2. **Keep sqlite-wasm as the single substrate.**
3. **Build the Datalog-shaped rule sub-DSL inside YAML, compiled to SQL CTE.** Do not expose Datalog text syntax to users.
4. **Ship a `crosswalker-sql` code-fence as the advanced escape hatch.**
5. **Reject every anti-pattern explicitly listed:** no Crosswalker DSL, no Dataview, no engine lock-in, no SPARQL/Cypher fork, no LLM-only authoring, no SQL drop, no recipe-YAML replacement.

**Defer / re-evaluate at these thresholds:**

- **If Crosswalker grows past ~500k entities or depth-≥6 traversals become common:** re-evaluate Cozo or a native graph store as a *secondary* substrate.
- **If RDF/SSSOM round-trip interop becomes a release-gate deliverable:** add Oxigraph-WASM as an *optional* exporter/importer (lazy-loaded), not a query engine.
- **If GQL/ISO 39075 gets a production WASM implementation (~2027–2028 estimate):** revisit Cypher as a Layer C alternate authoring surface.
- **If LLM training cutoffs shift to include Bases (2026+ models):** drop schema-injection prompt overhead.

**Do not do:**

- Do not introduce a `.crosswalker-query` file extension or a custom parser. Use YAML.
- Do not require Oxigraph, Cozo, or Nemo as a runtime dependency in v0.1.x.
- Do not expose Datalog text syntax in user-facing surfaces.
- Do not couple Layer A to a single substrate via direct API calls.

---

## Caveats

- **Bases is a moving target.** The Obsidian Bases API (introduced 1.9, expanded 1.10 with custom view types) is recent and has had breaking changes.
- **Mobile parity is fragile.**
- **The Ch 27/28 "anti-pattern" framing is internal.**
- **LLM benchmarks have known biases.**
- **OxO2 chose Nemo + Datalog for SSSOM.** OxO2 is a *server* materializing once at release time and serving search, whereas Crosswalker is an *embedded plugin*.
- **GQL/ISO 39075 may move faster than projected.**
- **Some SQL recursive CTE features are dialect-specific.** SQLite supports basic `WITH RECURSIVE` cleanly but does not implement the SQL:1999 `CYCLE` clause.
