---
title: "Ch 14 deliverable: Missed engines evaluation — keep Ch 11 stack, add Tier 2-Lite (sqlite-wasm) and Comunica federation; track Grafeo/Minigraf"
description: "Fresh-agent research deliverable for Challenge 14 (Phase 2 follow-on to Ch 11). Keeps the layered Tier 2 stack (DuckDB-WASM + Oxigraph + Nemo) as production. Adds Tier 2-Lite (sqlite-wasm + sqlite-vec + simple-graph + recursive-CTE) for Obsidian Mobile / low-end / restricted-CSP environments. Adds Comunica + N3 + HDT as opt-in federation layer. Tracks Grafeo and Minigraf with falsifiable migration triggers (§7). Rejects SurrealDB (BSL + 12.6 MB bundle), cr-sqlite (stalled Oct 2024), CozoDB (no release since v0.7 in 2023)."
tags: [research, deliverable, query-engine, tier-2, wasm, sqlite, comunica, federation, grafeo, minigraf]
date: 2026-05-02
sidebar:
  label: "Ch 14: missed engines"
  order: -20260502.10
---

:::tip[Origin and lifecycle]
Fresh-agent research deliverable produced 2026-05-02 in response to [Challenge 14: Missed engines evaluation](/crosswalker/agent-context/zz-challenges/archive/14-missed-engines-evaluation/) (Phase 2 follow-on to Challenge 11). Synthesized in [05-02 third-wave log §2](/crosswalker/agent-context/zz-log/2026-05-02-direction-third-wave-architectural-shifts/#2-ch-14--tier-2-stack-confirmed-and-extended). Preserved verbatim; not edited after publication.
:::

# Crosswalker Challenge 14 — Missed Engines Evaluation

*A long-horizon, evidence-driven architectural review of seven candidate WASM engines against the current Tier 2 stack (DuckDB-WASM + Oxigraph-WASM + Nemo-WASM)*

---

## 1. Executive Summary

The hypothesis driving Challenge 14 is that one of seven recently-surfaced engines might collapse, replace, or augment the layered Tier 2 stack chosen in Challenge 11. After investigating each candidate primarily against project health, in-browser bundle size, SSSOM-fit, W3C SPARQL conformance, and multi-year survival risk, the bottom-line verdict is:

> **Keep the Challenge 11 layered stack as the production Tier 2 today, but begin a parallel "Tier 2-Lite" track based on `wa-sqlite/sqlite-wasm` + `sqlite-vec` + recursive-CTE SSSOM reasoning for low-end deployments and Obsidian Mobile.** Track Grafeo and Minigraf as serious "potential collapse" candidates with named, falsifiable triggers (Section 7), but do not adopt either yet — both are pre-1.0, single-maintainer, and unproven at the SSSOM scales Crosswalker needs.

### Per-engine verdicts

| # | Engine | Verdict | One-line reasoning |
|---|---|---|---|
| 1 | **Grafeo** (GrafeoDB/grafeo) | **(c) Track in long-horizon list** | Genuinely impressive surface area (LPG+RDF+six query languages+HNSW+CDC+WASM+IndexedDB persistence), but only ~6 months old, v0.5.x, ~582 stars, 2 watchers, 17 forks, vendor-only benchmarks, single-sponsor signal, and unverified W3C SPARQL conformance. Adoption risk currently outweighs the consolidation benefit. |
| 2 | **Minigraf 1.0** (project-minigraf/minigraf) | **(c) Track in long-horizon list** | Bi-temporal Datalog is an excellent semantic match for SSSOM mapping_date / replaces / predicate_modifier; but project is single-maintainer (Aditya Mukho), 1.0 just released, no third-party adopters, and prior project (RecallGraph) was abandoned. Pilot in a sandbox skill, not production. |
| 3 | **CozoDB** | **(d) Reject for new adoption; (c) keep on watchlist for revival** | Excellent design (Datalog + HNSW + time-travel) but development has clearly slowed; Issue #213 (browser persistence) is unresolved since 2023; community IndexedDB PR (#185) never merged. Maintainer focus has shifted. Not safe for a 3-year horizon. |
| 4 | **SurrealDB-WASM** | **(d) Reject for Tier 2** | License (BSL 1.1, OSI-non-conformant for 4 years per release) is a hard blocker for federal/GRC audiences; **`@surrealdb/wasm` v1.4.1 is 12.6 MB unpacked** — already exceeding the entire 10–12 MB Tier 2 budget by itself, before adding Datalog/SPARQL. Mismatch is structural, not fixable. |
| 5 | **Comunica + N3 + HDT** | **(b) Adopt as Tier 2 add-on for federation only** | Don't replace Oxigraph for local SPARQL (research shows Oxigraph-WASM dominates on raw query performance), but Comunica's federated query over heterogeneous sources (SPARQL endpoints, TPF, Solid pods, local files, HDT) is a strategic capability Oxigraph does not have. Add for Crosswalker federation/external-mapping pull workflows. |
| 6 | **cr-sqlite** | **(d) Reject** | Repo last meaningful commit Oct 2024; maintainer (Matt Wonlaw / tantaman) has visibly moved to Materialite / TreeSQL / typed-sql. Yjs (which Obsidian Sync already integrates with) covers the same collaborative-edit ground with a larger, healthier ecosystem. |
| 7 | **sqlite-vec + simple-graph + wa-sqlite/sqlite-wasm** | **(b) Adopt as Tier 2-Lite alternate stack** | Realistically <2 MB compressed, mature components, recursive-CTE chain rules are workable up to ~hundreds of thousands of mappings, OPFS persistence is now first-class in the official `@sqlite.org/sqlite-wasm`. Tradeoff: lose native Datalog/SPARQL — but for the long tail of users (Obsidian Mobile, low-end laptops, restricted-CSP environments) this is the right answer. |

### Recommended Tier 2 architecture (12-month horizon)

```
Crosswalker Tier 2 (recommended)
├── PRIMARY (default)
│   ├── DuckDB-WASM            (~6.4 MB / 18 MB EH bundle — analytics, SQL, joins, Parquet)
│   ├── Oxigraph-WASM          (~3 MB — local SPARQL 1.1, RDF I/O, canonicalization)
│   └── Nemo-WASM              (Datalog for SSSOM chain rules, stratified negation)
│
├── ADD-ON (new, opt-in)
│   └── Comunica SPARQL        (~250–300 KB gz core — federated query meta-engine,
│                                Linked-Data-Fragments client, GraphQL-LD)
│
└── ALTERNATE (new, low-end / mobile)
    └── sqlite-wasm (OPFS) + sqlite-vec + simple-graph recipe + recursive-CTE SSSOM
        (≈1.5–2 MB compressed, no Datalog/SPARQL, suitable up to ~10⁵ mappings)
```

This is more nuanced than "one engine wins": it accepts that the Challenge 11 stack already occupies a Pareto-optimal point for ≥10⁶-mapping in-browser GRC analysis, while extending the architecture in two directions (federation up, footprint down) that the existing stack cannot reach without help.

---

## 2. Per-Engine Deep Evaluation

### 2.1 Grafeo (GrafeoDB/grafeo)

**Project status.** Confirmed correct repo: `github.com/GrafeoDB/grafeo` (NOT a hypothetical "grafeo" org — there is no disambiguation issue at the GitHub level, but be aware that the unrelated user `github.com/grafeo` exists and is unrelated). At time of investigation: 582 stars, 17 forks, 2 watchers, 1,512 commits, latest release v0.5.41 (Apr 24 2026), 56 releases overall, MSRV Rust 1.91.1, Apache-2.0 license. Code is 90.2% Rust. Sponsors page lists exactly one named sponsor (Thibaut Mélen / Supernovae) — this is a concrete single-corporate-backer signal. The README explicitly acknowledges DuckDB and Kuzu as architectural inspirations.

**License.** Apache-2.0, with `LICENSE` and `NOTICE` files present and `CONTRIBUTING.md` and `CODE_OF_CONDUCT.md` published. Repo does not surface an explicit CLA at the README level; contributions per Apache-2.0 default DCO-style inbound=outbound. This is OSI-clean and federal-friendly.

**WASM bundle size.** Two relevant artifacts ship: `@grafeo-db/wasm` (low-level wasm-bindgen package) and `@grafeo-db/web` (browser convenience wrapper with IndexedDB persistence and Web Worker execution). **Actual measured bundle sizes are not published in the README, on npm package detail pages I could reach, or in the issue tracker** at the time of investigation, so any size figure here is an estimate. Given that the engine implements six query language frontends (GQL, Cypher, Gremlin, GraphQL, SPARQL, SQL/PGQ), a vectorized push-based executor with morsel parallelism, dual storage backends (LPG + RDF triple SPO/POS/OSP), HNSW with multiple quantizations, BM25 full-text, MVCC, Block-STM, SHACL, and Bolt/gRPC servers, an honest engineering estimate is **8–15 MB for `@grafeo-db/wasm` and 12–20 MB for `@grafeo-db/web` (uncompressed) when all features are enabled**, which would already be at or beyond Crosswalker's 10–12 MB total budget. The Cargo feature flags (`--features rdf`, `--no-default-features --features gql`, `--features edge`) suggest meaningful tree-shaking is possible — the `edge` profile is explicitly described as "WASM, resource-constrained" — but no actual size table for `edge` builds is published. **This is a critical missing data point.** Any serious Grafeo evaluation must begin with: build `@grafeo-db/wasm` with the `edge` profile, the `rdf` profile, and the full LPG+RDF profile, and weigh the compressed and uncompressed `.wasm` artifacts.

**W3C SPARQL conformance.** The README claims "SPARQL (W3C 1.1) with SHACL validation and Ring Index WCOJ planner". I could find **no public W3C SPARQL 1.1 test suite results** for Grafeo, no comparison to Oxigraph's near-100% conformance, and no SPARQL CSV/TSV/JSON results-format conformance statements. SPARQL is also restricted to the RDF backend only (per the language/data-model matrix in the README); LPG queries cannot use SPARQL, and the RDF backend appears to be the less-mature half of the dual storage. **Assume under-Oxigraph-level conformance until proven otherwise.**

**SSSOM-fit analysis.** Grafeo's RDF triple store with SPO/POS/OSP can express SSSOM mappings natively. The HNSW vector index could power semantic similarity over mapping `subject_label`/`object_label`. CDC ("before/after property snapshots for audit trails and history tracking") is a genuinely interesting fit for Crosswalker's git-based audit workflow — though "epoch-bounded retention" needs to be checked against the requirement that Crosswalker keep history forever. **However**, Grafeo offers **no native Datalog engine** (it has Cypher recursion and SQL/PGQ but not stratified Datalog). For Crosswalker's chain-rule derivation step (`mapping a→b ∧ mapping b→c ⊢ derived a→c with confidence_min`), this means recursive Cypher / SPARQL property paths / SQL recursive CTEs would have to substitute for what Nemo does today. That's a meaningful expressivity downgrade for SSSOM-specific reasoning.

**Benchmark verification.** The vendor-published numbers (SF0.1 SNB Interactive: Grafeo 2,904 ms vs LadybugDB(Kuzu) 5,333 ms; Memory: Grafeo 136 MB vs LadybugDB 4,890 MB) come from the project's own `graph-bench` repo and are explicitly disclaimed: "These are not official LDBC Benchmark results". The 4,890 MB figure for Kuzu at SF0.1 (which is a tiny scale factor — the LDBC SNB SF0.1 dataset is ~100 MB on disk) is unusual enough that it warrants independent reproduction before being cited. **I found no independent reproductions of Grafeo's SNB results.** The fact that LadybugDB is renamed to "(Kuzu)" in the table — given that Apple acquired Kuzu in October 2025 and archived the upstream repo — also raises a methodological concern: it isn't clear which version of Kuzu is being benchmarked, nor whether Kuzu's own configuration was tuned. **Treat all Grafeo benchmark claims as vendor-published-and-unreproduced.**

**Project health checklist.**

| Criterion | Result |
|---|---|
| License | Apache-2.0 (clean, OSI) ✅ |
| Governance | Not formally documented; appears to be founder-led BDFL-style |
| Commit cadence | Very high: 1,512 commits, 56 releases in ~6 months |
| Contributor count | Not visible from README; CONTRIBUTORS.md exists but contributor count appears small (<10 from GitHub Insights inference; codebase is 90% Rust authored under one project) |
| Issue close rate | Only 3 open issues at survey time — either very healthy or very low community engagement; given 2 watchers, the latter is more likely |
| Multi-year commitment | Single sponsor (Supernovae); no foundation or multi-org backing |
| Watchers | 2 (very low — concerning) |
| Forks | 17 |
| Stars | 582 |

**Multi-year-horizon risk.** Pre-1.0, single-vendor, no foundation, no W3C conformance proof, vendor-only benchmarks, and a feature surface area so wide that maintenance burden is enormous. The closest historical analogues are RethinkDB (acquired/abandoned), Couchbase Lite, and EdgeDB — all of which had wider initial adoption than Grafeo currently does. A 3-year survival probability of 50–60% is a reasonable subjective estimate. The codebase's quality (CodeCov badge, CodSpeed perf regression CI, SHACL-conformance work, MVCC + Block-STM) is unusually high for the maturity, which slightly improves that estimate; the vendor-only benchmarks slightly hurt it.

**Recommendation.** **(c) Track in long-horizon list. Do not adopt as Tier 2 yet.** Concrete migration triggers in §7.

---

### 2.2 Minigraf 1.0 (project-minigraf/minigraf)

**Project status.** Confirmed: `github.com/project-minigraf/minigraf`. 1.0 announced via DEV.to post by Aditya Mukho ("adityamukho") in late April 2026. Author is also the creator of CivicGraph (formerly RecallGraph) — a previous bi-temporal graph project from 2019 that was effectively shelved. The author's transparency about this lineage in the announcement post is admirable but is also the largest single-maintainer signal you can get.

**License.** Not explicitly verified during this survey; the announcement post and GitHub link were reachable but the LICENSE file content was not retrieved. The DEV.to post uses "open source" framing without naming the license. **A license review is a hard gate before any pilot.**

**Bi-temporal semantics.** This is Minigraf's headline feature and is an excellent semantic match for SSSOM. Every fact carries both *transaction time* (when it was recorded — "git commit time") and *valid time* (when it was true in the world — SSSOM `mapping_date`, plus `replaces`/`replaced_by` predicate modifiers). Compared to the canonical bi-temporal databases:

- **vs Datomic**: Datomic is JVM-only and not embeddable in WASM. Minigraf claims to be a Datomic-style model in a single .graph file with native + WASM + iOS + Android. If the implementation is correct, this is genuinely novel.
- **vs XTDB**: XTDB also offers bi-temporal semantics but is a JVM/Clojure system; XTDB v2 has Datalog and SQL but is not browser-runnable.
- **vs CozoDB**: Cozo offers `@`-suffixed time-travel queries against ordinary (non-bi-temporal) relations — i.e., transaction time only, retroactively-attached. Minigraf's two-axis model is strictly more expressive.

For SSSOM, the bi-temporal model maps cleanly to questions like: "What was Crosswalker's mapping between NIST CSF 2.0 and ISO 27002 as known to us at our 2025-Q3 audit cut-off, but valid for a 2024-Q4 control instance?" This is exactly the kind of question that current Tier 2 stacks answer awkwardly via git checkouts.

**Datalog dialect.** Announcement claims Datalog query. **No published spec was retrievable** as to whether stratified negation, aggregation, recursion safety, or magic-set rewriting are supported. Comparison vs Nemo (which supports stratified negation, existential rules, and is W3C-tested via the OBDA community) cannot be made without that spec.

**WASM bundle size.** Not published. Single-file .graph footprint and Rust+wasm-bindgen architecture suggest a likely range of 2–5 MB uncompressed for the WASM bundle, but this is purely an inference from comparable single-file embedded engines.

**Project health checklist.** Single visible maintainer (Aditya Mukho); 1.0 is fresh (<1 month old at survey); no third-party production users beyond the author's own `temporal_reasoning` skill demo; no governance model documented; no foundation backing. Author's previous identical-thesis project (RecallGraph) was discontinued — this is the dominant risk factor.

**Multi-year-horizon risk.** **High.** A bi-temporal Datalog database in Rust is a multi-decade project that mature companies struggle with (XTDB has been worked on since 2018; Datomic since 2012). One person delivering 1.0 in this space is impressive but fragile.

**Recommendation.** **(c) Track in long-horizon list.** Pilot in a non-production "temporal SSSOM history" skill; *do not* let it become a load-bearing Tier 2 component until: (a) a second committed maintainer joins, (b) license is verified Apache-2.0 or MIT, (c) at least one independent production deployment is documented, and (d) 12 months of sustained commits past 1.0.

---

### 2.3 CozoDB (cozodb/cozo)

**Project status.** MPL-2.0 (file-level copyleft, fine for an Obsidian plugin since the plugin code does not statically link Cozo source files). Latest tagged release is v0.7 (October 2023 timeframe based on changelog). The discussions tab shows community questions through 2024–2025 still receiving responses, but **no major releases have shipped in the 18+ months preceding survey**. Maintainer (Ziyang Hu / "ziyang") appears to have shifted attention.

**Issue #213 (in-browser WASM persistence).** Status: **still open and unresolved** at survey time. Community member `dasein108` filed a working PoC (PR `#185` linked in the issue) for IndexedDB persistence, but it was never merged. The official position remains: WASM build supports in-memory only; for persistence, users must `export_relations` to JSON and reload manually. For Crosswalker, which needs durable SSSOM tables, this is a non-trivial integration burden — solvable but ongoing.

**CozoScript Datalog vs Nemo.** CozoScript is a strong Datalog dialect with stratified negation, aggregation, magic-set rewriting, recursion (including non-stratified via fixpoint), built-in graph algorithms (PageRank, Dijkstra, Yen-K, A*), and HNSW vector queries integrated as first-class joins. **For SSSOM chain rules, CozoScript would be at least as expressive as Nemo** — possibly more, given the integrated graph algorithms (Crosswalker could express transitive-closure mapping detection as a single Cozo program). However, in browser/WASM mode the `graph-algo` features are disabled by default; only the `Constant` fixed rule is available, which removes a large chunk of what makes CozoScript attractive.

**Vector + Datalog integration.** Best-in-class. HNSW indexes are exposed as proximity-graph relations in Datalog, enabling community detection and other algorithms over the index itself. This is more elegant than any other engine surveyed.

**License (MPL-2.0).** MPL-2.0 is OSI-approved, file-level copyleft. Dynamically linking Cozo into Crosswalker (as a WASM module loaded at runtime) does not trigger copyleft on Crosswalker's own files. This is fine for an Obsidian plugin distributed under MIT/Apache-2.0.

**Multi-year-horizon risk.** **Medium-high.** The technical design is excellent and the codebase is ~95% complete for what it claims, but the *maintenance signal* is weakening. Without a pipeline of releases, the WASM persistence gap in #213 will not close, and the project will gradually drift behind newer Datalog engines (Nemo, Datalevin, Minigraf). A revival is possible — Hu has shown long-term commitment in the past.

**Recommendation.** **(d) Reject for new adoption** as a primary Tier 2 component. **(c) Keep on watchlist** — if v0.8 ships with first-class browser persistence, re-evaluate.

---

### 2.4 SurrealDB-WASM

**Project status.** SurrealDB Inc. raised an additional $23M in Feb 2026, bringing Series A to $38M and total funding to $44M. 31,000 GitHub stars, 2.3M downloads. Customers cited include Verizon, Walmart, ING, Nvidia, Samsung, Tencent. SurrealDB 3.0 GA shipped Feb 2026. The `surrealdb.wasm` repo has been merged into `surrealdb.js`; the package is now `@surrealdb/wasm`.

**License analysis (BSL 1.1).** Per `surrealdb.com/license` and the LICENSE file in `surrealdb/license`: BSL 1.1 with an Additional Use Grant that permits any usage **except** offering SurrealDB as a commercial DBaaS. Each release converts to Apache-2.0 four years after its release date. Crosswalker's use case (embedded WASM in an Obsidian plugin distributed to end users, not as a managed service) is explicitly within the Additional Use Grant. **Functionally, you can use it.**

**However**, the Open Source Initiative does **not** consider BSL an open-source license. For Crosswalker's GRC audience — which includes federal contractors operating under FAR 52.227-19 and DoD CIO memos that mandate OSI-OSS approval for software-in-products — an embedded BSL component is a procurement-blocker for a meaningful slice of the addressable user base. Moreover, the conversion-to-Apache clause is per-release: if SurrealDB ships v3.5 in 2027, the plugin shipped against that version doesn't become Apache-2.0 until 2031. The historical pattern for BSL/SSPL/AGPL-converted projects (MongoDB SSPL, Elastic→AGPL→Elastic, HashiCorp→BSL, Redis→RSAL+SSPL) is that vendors **do not relax** these licenses once adopted; they ratchet tighter. SurrealDB's "we're permissive BSL" framing today does not bind future board decisions.

**WASM bundle size.** **`@surrealdb/wasm` v1.4.1: 12.6 MB unpacked** (per npm). v1.0.0-beta.15 was 13.6 MB. This is the entire Tier 2 bundle budget consumed by a single dependency, before any Datalog or SPARQL is added. SurrealDB's strategy is "one engine for everything," but for Crosswalker which already has DuckDB-WASM (~6.4 MB EH bundle) playing the analytics role, swapping to SurrealDB does not collapse the stack — it *replaces* it, and at a higher bundle cost than DuckDB+Oxigraph+Nemo combined.

**SurrealQL ↔ SSSOM/SKOS translation.** SurrealQL is a custom query language combining SQL-like SELECT with graph traversal and embedded JS scripting. It does not natively speak SPARQL or SSSOM SKOS. Mapping the SSSOM TSV/JSON-LD spec into SurrealQL records is straightforward (records with `subject_id`, `predicate_id`, `object_id`, `mapping_justification`, `confidence`), but you would lose: SPARQL federation, SKOS broader/narrower native interpretation, SHACL validation, RDF canonicalization, and the entire downstream OBO / OAK / Bioregistry tooling that consumes SSSOM via RDF.

**Bi-temporal feature confirmation.** SurrealDB 3.0 markets "agent memory and context graphs" but I could not confirm a true bi-temporal (transaction-time × valid-time) model in the docs at survey. The platform supports temporal queries via timestamps and history fields but not the Datomic/XTDB/Minigraf two-axis model.

**Funding/runway.** $44M total, SaaS revenue model via Surreal Cloud. Healthy for at least 2–3 years at typical Series A burn. Not a near-term mortality risk.

**Multi-year-horizon risk.** Low company risk, **high architectural risk** for Crosswalker due to license + bundle size mismatch.

**Recommendation.** **(d) Reject.** Even granting a generous reading of the BSL, the 12.6 MB bundle alone disqualifies it for a "collapse to one engine" strategy. The federal/OSI-OSS sensitivity is the second strike.

---

### 2.5 Comunica + N3.js + HDT

**Project status.** Comunica is maintained by Ruben Taelman and the IDLab Ghent / RDFJS community group, distributed under MIT, and stewarded by the Comunica Association (a community foundation with sponsor/member tiers). It is a *modular SPARQL meta-engine* — query algebra implementation as an actor system, with each module replaceable. Currently in the v4 line, with v5 query-sparql-solid at 5.0.1.

**Bundle size verification.** Comunica is published as ~80 npm packages; size depends on which engine you bundle. Reference points from npm:
- `@comunica/query-sparql-solid` v5.0.1 unpacked size: **258 KB** (this includes Solid auth, federation actors, and the SPARQL evaluator).
- `@comunica/query-sparql-rdfjs-lite` is the dedicated small-bundle variant.
- Pre-built browser bundles are hosted at `rdf.js.org/comunica-browser/versions/v4/engines/query-sparql/comunica-browser.js`.
- Comunica's roadmap explicitly lists "lowering browser bundle size" as an active focus area, and quadstore-reported numbers (a Comunica-powered RDF DB) are in the **~200–300 KB gzipped** range per the project's own blog ("Release 1.18.0: Smaller Web bundles").

This is **roughly 10× smaller than Oxigraph-WASM's ~3 MB**, but at a real performance cost: the WasmTree paper (Bruyat et al., openreview.net/pdf?id=CXLmXMb2TJ) found Oxigraph-WASM to be the fastest SPARQL engine on a 725K-quad benchmark, beating both pure-JS and WasmTree+Comunica configurations.

**SPARQL conformance.** Comunica targets SPARQL 1.2 (per the `@comunica/query-sparql` README) and is the reference implementation testbed for several SPARQL 1.2 features. It has near-full SPARQL 1.1 coverage and is W3C-conformance-tested.

**HDT viability in browser.** HDT (Header-Dictionary-Triples) is a binary RDF format giving ~10–20× compression vs Turtle. The `@comunica/actor-rdfjs-source-hdt` package and `hdt-js` library exist; query-sparql-hdt is published and works in browsers, though larger HDT files (over 100 MB) hit the typical browser memory ceilings. For Crosswalker's 10M-mapping target, an HDT artifact would be roughly 30–80 MB on the wire — feasible to ship as a one-time download, but you would not load it into RAM all at once; you'd serve it from OPFS or from a CDN-fronted Range-request endpoint via TPF.

**Federation — the strategic value.** This is what Oxigraph cannot do and Comunica was built for. With Comunica, Crosswalker could:
- Query a local Oxigraph store **AND** the public NCI Thesaurus SPARQL endpoint **AND** a Bioregistry-served SSSOM ontology pack **AND** an external organization's Solid pod hosting their own crosswalk extensions — all as a single SPARQL query, with federation, deduplication, and provenance handled automatically.
- Subscribe to a Triple Pattern Fragments (TPF) interface for low-cost incremental crosswalk updates.
- Serve Crosswalker's own crosswalk back as a TPF fragment endpoint.

This is a multi-year strategic capability the current stack cannot reach. It does **not** replace Oxigraph (which is faster locally) or Nemo (Comunica is not Datalog) — it is genuinely additive.

**Project health.** Mature (since 2018), MIT, large module ecosystem (79+ modules), actively published roadmap, IDLab Ghent / Solid project alignment. Multi-year sustainability is high.

**Recommendation.** **(b) Adopt as Tier 2 add-on for federation only.** Do not replace Oxigraph for local SPARQL queries.

---

### 2.6 cr-sqlite

**Project status.** vlcn-io organization. The `cr-sqlite` repo: 3,514 stars, 104 forks, **last commit Oct 25 2024** at survey time (~18 months stale). Other vlcn-io repos (`vlcn-orm` last update Oct 2024, `materialite` Jun 2024, `wa-sqlite` fork stale) tell the same story. Maintainer Matt Wonlaw / "tantaman" has shifted focus to TreeSQL, typed-sql, and Materialite (incremental view maintenance) — and has hinted that "fully generic reactivity will be a paid feature."

**Conflict semantics.** CRRs (Conflict-Free Replication Relations) extend ordinary SQLite tables to LWW (last-writer-wins) by default, with optional counter, fractional-index, and peritext CRDT types. For SSSOM tables keyed on `(subject_id, predicate_id, object_id)`, two concurrent edits to the `confidence` column would resolve via column-version + clock comparison — deterministic but unprincipled (the higher-numbered version wins, regardless of which is semantically correct). Compared to Yjs over a structured doc, this is **less expressive**: Yjs gives intent-preserving merge for ordered lists and strings; cr-sqlite gives correct merge for typed columns but doesn't give intent-preservation for, say, the *ordering* of mapping_provenance entries.

**Yjs interop.** cr-sqlite and Yjs are not adversarial; Crosswalker could combine them (cr-sqlite for SSSOM rows, Yjs for note text and ordered metadata). But Yjs already integrates with Obsidian Sync and the broader Obsidian ecosystem, while cr-sqlite would be net-new infra with a dormant maintainer.

**Bundle size.** Not measured at survey, but historical issue trackers and benchmarks place WASM build at ~1–1.5 MB plus the underlying `wa-sqlite` (~600 KB compressed). Inserts are 2.5× slower than vanilla SQLite per the README.

**License.** MIT — clean.

**Production users.** A handful in the Vulcan ecosystem (Reflect, Fleet Device Management, Expo); none are larger than mid-stage startups. No federal, no GRC.

**Recommendation.** **(d) Reject.** A stalled project for a problem (conflict resolution on collaborative SSSOM edits) that Yjs already solves with a much healthier ecosystem.

---

### 2.7 sqlite-vec + simple-graph + sql.js / wa-sqlite / sqlite-wasm

**Project status (per component).**
- **sqlite-vec** (asg017): MIT, pure-C, very active, sponsored by Mozilla Builders. v0.1.x stable. Works in browser via WASM. Brute-force vector + emerging IVF/HNSW. Healthy single-maintainer (Alex Garcia) with corporate sponsorship.
- **simple-graph** (dpapathanasiou): MIT, "thin recipe rather than a project" — it is JSON nodes + ID-pair edges + SQL view templates + a few recursive CTE patterns. Last update sporadic. **You should treat it as a 200-line pattern to vendor into Crosswalker, not as a dependency to track.**
- **wa-sqlite** (rhashimoto): MIT (since Feb 2023), actively maintained by Roy Hashimoto. Provides multiple VFSes (IDBBatchAtomicVFS, OPFSAdaptiveVFS, OPFSCoopSyncVFS, OPFSAnyContextVFS) with documented tradeoffs. Hashimoto himself notes (in discussion #63) that the official `@sqlite.org/sqlite-wasm` is now the "recommended" path for users who only need persistent SQL and can tolerate COOP/COEP requirements.
- **`@sqlite.org/sqlite-wasm`** (official): SQLite team's own WASM build with a first-class OPFS VFS (using FileSystemSyncAccessHandle from a Web Worker). Documented persistence semantics in `sqlite.org/wasm/doc/trunk/persistence.md`. As of Mar 2026 testing, supports 8–10 concurrent worker connections per OPFS file with `SQLITE_BUSY` handling.

**Total bundle size.** SQLite WASM compiled byte code is **~939 KB** uncompressed (per RxDB benchmarks), plus the JS glue layer (~50–100 KB), plus sqlite-vec extension (~200–400 KB compiled to WASM-loadable). Total Tier 2-Lite stack realistically lands at **~1.2–1.5 MB compressed, ~2 MB uncompressed**. Compared to Oxigraph (~3 MB) + DuckDB-WASM (~6.4 MB) + Nemo, this is ~5–8× smaller.

**Recursive-CTE feasibility for SSSOM chain rules.**

The SSSOM chain rule "if A→B and B→C then A→C with `confidence_min(c1, c2)`" expressed in SQLite recursive CTE:

```sql
WITH RECURSIVE chains(subject, object, conf, depth) AS (
  SELECT subject_id, object_id, confidence, 1
    FROM sssom_mappings
    WHERE predicate_id = 'skos:exactMatch'
  UNION ALL
  SELECT c.subject, m.object_id, MIN(c.conf, m.confidence), c.depth + 1
    FROM chains c
    JOIN sssom_mappings m ON c.object = m.subject_id
    WHERE m.predicate_id = 'skos:exactMatch'
      AND c.depth < 6  -- bound recursion
)
SELECT DISTINCT subject, object, conf FROM chains;
```

At ~tens of thousands of mappings this runs comfortably in tens of milliseconds. At 1M mappings with branching factor over 5, the CTE materializes the full transitive frontier and slows substantially. At **10M mappings the recursive CTE approach is not viable** without (a) precomputed closure indices, (b) bounded-depth queries, or (c) graph-store-style index structures on the join keys. This is the structural reason Crosswalker chose Nemo Datalog in the first place.

**Tradeoffs of giving up Datalog and SPARQL.** SSSOM rules can be hand-translated to recursive SQL **if you accept**: (1) loss of stratified negation expressivity, (2) loss of magic-set rewriting (Nemo and Cozo automatically optimize chain queries that recursive CTEs cannot), (3) loss of W3C SPARQL conformance for the SKOS-broader-than/SHACL-validation paths, (4) loss of Triple Pattern Fragments / SPARQL Federation for external mappings. For the **mid-range tier of users** (≤10⁵ mappings, mostly single-organization crosswalks), the tradeoffs are acceptable. For the **upper tier** (10⁶–10⁷ mappings, federated mappings, ontology-store integration), they are not.

**wa-sqlite vs sql.js vs sqlite-wasm — recommendation.** Use the official `@sqlite.org/sqlite-wasm` for any new Crosswalker work where you control the COOP/COEP headers (i.e., the Obsidian plugin loads from the Obsidian process, which can set them). Use `wa-sqlite` only if you need to support environments where COOP/COEP cannot be set or you want IndexedDB-backed VFS with batch-atomic writes. Do **not** use sql.js for new work; it's older, slower, and uses Asyncify with no OPFS option.

**Production users.** sqlite-vec is shipping in numerous ML/RAG products (Datasette, langchain, dozens of indie tools). The official sqlite-wasm is the SQLite team's primary WASM path. Stack-level health is excellent.

**Recommendation.** **(b) Adopt as the Tier 2-Lite alternate stack** for low-end deployments, Obsidian Mobile, and any environment where bundle size is the dominant constraint. Document the SSSOM rule subset that is supported under recursive-CTE evaluation and the scale ceiling.

---

## 3. WASM Bundle Size Comparison Table

All numbers are best available; flagged uncertainties noted.

| Engine / stack | Component | Measured size | Compressed (gzip est.) | Source |
|---|---|---|---|---|
| **Current Tier 2** | DuckDB-WASM (eh bundle) | ~6.4 MB | ~3 MB | duckdb.org docs / Observable issue #1260 |
| | DuckDB-WASM (full incl. JSDelivr eh.wasm) | ~18 MB | ~7 MB | Observable Framework #1260 |
| | Oxigraph-WASM (`oxigraph` npm) | ~3 MB est. | ~1.2 MB est. | community references; not definitively published |
| | Nemo-WASM | ~2 MB est. | ~800 KB est. | not retrieved during this survey |
| | **Total Tier 2 (eh bundle, compressed)** | **~10–12 MB** | **~5 MB** | sum of above |
| **Grafeo** | `@grafeo-db/wasm` (full features) | not published | est. 4–8 MB | inferred from feature set |
| | `@grafeo-db/wasm` (`edge` profile) | not published | est. 1.5–3 MB | inferred from profile description |
| | `@grafeo-db/web` (browser w/ IndexedDB) | not published | est. 5–10 MB | wraps wasm + worker glue |
| **Minigraf** | wasm bundle | not published | est. 1.5–4 MB | typical wasm-bindgen Rust embedded DB |
| **CozoDB** | cozo wasm | ~3 MB | ~1.2 MB | `cozodb.org/wasm-demo/` |
| **SurrealDB** | `@surrealdb/wasm` v1.4.1 | **12.6 MB unpacked** | ~5–6 MB | npmjs.com/package/@surrealdb/wasm |
| | `@surrealdb/wasm` v1.0.0-beta.15 | 13.6 MB unpacked | ~6 MB | npm historical |
| | `@surrealdb/ql-wasm` (parser only) | 2.36 MB unpacked | ~1 MB | npm |
| **Comunica** | `@comunica/query-sparql-solid` v5.0.1 | 258 KB unpacked | ~100 KB | npm |
| | `query-sparql-rdfjs-lite` (small) | <200 KB unpacked | <80 KB | comunica.dev blog |
| **N3.js** | `n3` npm | ~150 KB unpacked | ~50 KB | npm typical |
| **HDT** | `hdt` npm + .hdt file | lib ~300 KB; data scales w/ N | data is the size | rdfhdt.org |
| **cr-sqlite** | crsqlite.wasm | ~1.2 MB | ~500 KB | vlcn.io build |
| | + wa-sqlite | ~900 KB | ~400 KB | wa-sqlite |
| **sqlite-wasm stack** | `@sqlite.org/sqlite-wasm` | ~939 KB | ~400 KB | RxDB benchmarks |
| | sqlite-vec extension | ~250 KB est. | ~120 KB | github releases |
| | simple-graph SQL recipe | ~5 KB JS | <5 KB | dpapathanasiou repo |
| | **Total Tier 2-Lite** | **~1.2–1.5 MB** | **~600 KB** | sum |

**Observation.** The ~5 MB compressed budget for the current Tier 2 is **already small** for what it delivers. The "collapse to one engine" candidates (Grafeo, SurrealDB, CozoDB) do not collapse the budget — SurrealDB exceeds it; Grafeo is uncertain but plausibly equals it; CozoDB is in the same ballpark. **Only the sqlite-wasm Tier 2-Lite stack genuinely shrinks the budget** (by ~8×), at the price of features.

---

## 4. W3C SPARQL Test Suite Results Table

| Engine | SPARQL version targeted | Conformance suite status | Independent verification |
|---|---|---|---|
| **Oxigraph (current)** | SPARQL 1.1 (full), 1.2 draft (preview behind `rdf-12` feature) | "Nearly fully conformant with the latest recommendations" per upstream README; Oxigraph runs the W3C test suite in CI. Federated query supported. | Yes — referenced in BioHackJP 2023 evaluation, WasmTree paper |
| **Grafeo** | Claims "SPARQL (W3C 1.1) with SHACL validation" | **No public W3C test suite results found** at survey | None |
| **Minigraf** | None claimed (uses Datalog) | N/A | N/A |
| **CozoDB** | None claimed (uses Datalog/CozoScript) | N/A | N/A |
| **SurrealDB** | None claimed (uses SurrealQL) | N/A | N/A |
| **Comunica** | SPARQL 1.2 + 1.1 | Continuous W3C conformance testing in CI; reference testbed for SPARQL 1.2 features | Yes — reference impl |
| **cr-sqlite / sqlite-wasm** | None (SQL) | N/A | N/A |

**Bottom line.** Of the seven candidates, only Comunica matches Oxigraph for SPARQL conformance, and Comunica is slower locally. Grafeo's SPARQL claim is unproven and should be tested against the W3C SPARQL 1.1 test suite (`https://www.w3.org/2009/sparql/docs/tests/`) before any Tier 2 adoption.

---

## 5. Project-Health Scoring Matrix

Rubric per dimension: 1 (poor) to 5 (excellent).

| Engine | License clarity | Governance | Commit cadence (12 mo) | Contributor count | Issue close rate | Multi-year commitment signal | Browser feature completeness | **Total /35** |
|---|---|---|---|---|---|---|---|---|
| Grafeo | 5 (Apache-2.0) | 2 (single-sponsor BDFL) | 5 (1,512 commits, 56 releases) | 2 (small, mostly one author) | 4 (3 open issues — likely low engagement) | 2 (1 sponsor, no foundation) | 4 (IndexedDB, Web Worker, six languages) | **24** |
| Minigraf | 2 (license unconfirmed) | 1 (single maintainer, prior abandoned project) | 4 (active, but only ~1 month past 1.0) | 1 (single) | n/a | 1 (single, history of discontinuation) | 3 (WASM/iOS/Android) | **12** |
| CozoDB | 5 (MPL-2.0) | 3 (BDFL Hu) | 1 (~no releases since v0.7 in 2023) | 2 | 2 (issues open since 2023) | 2 (slowing) | 3 (WASM works, persistence requires manual export) | **18** |
| SurrealDB | 1 (BSL — federal blocker, OSI non-OSS) | 4 (well-funded company, board) | 5 (very active) | 5 (large team + community) | 4 | 5 ($44M funding, 4-yr Apache reversion) | 4 (12.6 MB bundle is the main weakness) | **28** |
| Comunica + N3 | 5 (MIT) | 4 (Comunica Association, IDLab Ghent) | 4 (steady) | 5 (large RDFJS community) | 4 | 5 (academic + industry) | 4 (federation, modular, browser-native) | **31** |
| cr-sqlite | 5 (MIT) | 2 (single maintainer; effectively stalled) | 1 (last commit Oct 2024) | 3 historic, 1 current | 2 | 1 (maintainer focus shifted) | 3 | **17** |
| sqlite-wasm + sqlite-vec | 5 (public domain / MIT) | 5 (SQLite team + Mozilla Builders) | 5 (very active) | 5 | 5 | 5 (SQLite is forever) | 4 (OPFS first-class) | **34** |

The scoring corroborates the recommendations: the highest-health stack on this dimension is the **sqlite-wasm family + Comunica**, both of which are *additive* to the current Tier 2 rather than replacements.

---

## 6. Vendor-Benchmark Verification

### 6.1 Grafeo SNB Interactive (LDBC-inspired)

**Vendor claim** (`github.com/GrafeoDB/grafeo`, README, Embedded SF0.1):
- Grafeo 2,904 ms vs LadybugDB(Kuzu) 5,333 ms vs FalkorDB Lite 7,454 ms
- Memory: Grafeo 136 MB vs LadybugDB(Kuzu) 4,890 MB vs FalkorDB Lite 156 MB

**Methodology footnotes from the disclaimer:**
- Workloads are "inspired by" LDBC SNB but explicitly **not official LDBC results** — meaning no audit, no recognized methodology committee, no guarantees that the queries map 1:1 to the LDBC reference.
- SF0.1 is the smallest LDBC scale factor (~100 MB on disk). Differences this large at this scale strongly suggest configuration/build differences for the competing engines, not architectural advantages of Grafeo.
- The Kuzu memory figure (4,890 MB) is anomalous: in the Kuzu team's own published benchmarks, SF0.1 fits in <500 MB. A 10× discrepancy between vendor and self-reported numbers should be reproduced before being cited.

**Verdict.** **Not independently reproduced — flag for caution.** Treat all Grafeo benchmark numbers as marketing until reproduced by a third party using a public, audited methodology.

### 6.2 SurrealDB benchmarks

The vendor's own marketing and the various press releases ($44M raise) cite "fastest-growing database of all time" (2.3M downloads, 31K stars). These are adoption claims, not performance claims. SurrealDB 3.0 has not published independent benchmark comparisons against Postgres/Mongo/Neo4j at survey time.

**Verdict.** Adoption claims plausible (download counts are auditable via npm/dockerhub). Performance claims absent or unverified.

### 6.3 Datalevin / Datascript / Datomic comparisons

These are not in the seven-engine list but appeared during research. Datalevin's published benchmarks ("13× faster than Datascript on 3-way join") use the Datascript benchmark suite at 100K datoms — this is a well-known, reproducible suite. **These numbers are credible.** Relevant for Crosswalker only as context for what a mature Datalog engine looks like (Datalevin is Clojure/JVM, not WASM, so not a candidate).

### 6.4 Comunica vs Oxigraph (independent)

The WasmTree paper (Bruyat et al., openreview.net/pdf?id=CXLmXMb2TJ) measured 100 executions of SPARQL queries on a 725K-quad dataset and found Oxigraph-WASM to be the fastest, beating Comunica with WasmTree backend and pure-JS implementations by a wide margin. **This is independent, peer-reviewed corroboration that Oxigraph is the right local-SPARQL engine** and Comunica should be added for federation rather than substituted for Oxigraph.

---

## 7. Updated Migration Triggers

Concrete, falsifiable conditions under which Crosswalker would migrate from the current Ch 11 layered stack:

### Trigger A — "Grafeo collapses Tier 2"
Migrate Tier 2 to a single Grafeo runtime if **all** of the following are true simultaneously:
1. Grafeo reaches v1.0.0 with a stable API commitment (semver-major-rev guarantees published).
2. W3C SPARQL 1.1 conformance ≥ 95% on the public test suite, with results published to a public CI dashboard.
3. The `edge` Cargo profile produces a `.wasm` artifact ≤ 4 MB compressed (gzip), measured on a published reproducible build.
4. Grafeo gains ≥ 10 distinct contributors with ≥ 5 commits each over 12 consecutive months, OR is adopted by a foundation (Apache, Eclipse, NumFOCUS, OSGeo, etc.).
5. At least three independent organizations (not the founder/sponsor) publish production deployment case studies.
6. Independent reproduction of the SNB benchmark numbers within 50% of vendor claim.

### Trigger B — "Minigraf earns SSSOM bi-temporal niche"
Adopt Minigraf as a **Tier 2 add-on** (alongside, not replacing, current stack) for SSSOM history queries if **all**:
1. License confirmed Apache-2.0 or MIT.
2. Datalog spec published with stratified negation, aggregation, recursion safety semantics.
3. A second committed maintainer joins, sustaining commits past 1.0 for 12 months.
4. At least one other production deployment exists.

### Trigger C — "CozoDB revival"
Reconsider CozoDB if v0.8 ships with first-class OPFS or IndexedDB persistence in the WASM build, AND release cadence resumes with at least one release per quarter for 12 months.

### Trigger D — "Tier 2-Lite ships now"
**Already triggered.** Build the sqlite-wasm + sqlite-vec + simple-graph + recursive-CTE Tier 2-Lite alternate stack in parallel with the current Tier 2. Document SSSOM rule subset and scale ceiling.

### Trigger E — "Comunica federation"
**Already triggered.** Add `@comunica/query-sparql` as an opt-in federation layer for cross-vault, cross-org, and external SPARQL endpoint queries.

### Trigger F — "SurrealDB conversion"
Reconsider SurrealDB only if the company drops BSL for Apache-2.0 across all releases (not the 4-year-rolling reversion), AND publishes a stripped-down WASM build <4 MB.

---

## 8. Long-Horizon Outlook (3 and 5 Year)

### 3-year outlook (2026–2029)

**Likely to thrive:**
- **DuckDB-WASM** — DuckDB Labs is well-funded, the project has academic + industrial momentum, 1.5+ ships, MotherDuck commercializes it.
- **Oxigraph-WASM** — Apache-2.0, sponsored by Zazuko and RelationLabs, primary RDF engine for the Solid project, no realistic competitor in the WASM SPARQL space.
- **Comunica** — IDLab Ghent + Comunica Association, integral to Solid/SPARQL 1.2/Linked Data Fragments research, clearly a 5+ year project.
- **`@sqlite.org/sqlite-wasm`** — SQLite is going to be in browsers in 30 years. This is the safest dependency you can pick.
- **sqlite-vec** — Mozilla Builders sponsorship, widespread adoption, healthy single-maintainer who has shipped multiple stable releases.
- **SurrealDB (the company)** — well-funded, will exist; whether it remains an OSS-friendly choice is the question.

**Likely to stall or pivot:**
- **cr-sqlite** — already stalled. Project will probably be archived or absorbed into a paid Vulcan platform.
- **CozoDB** — without a release in 18 months, the most likely path is community fork or quiet abandonment.

**Wildcards:**
- **Grafeo** — could either be a category-defining project at v1.0 in 2027, or could lose its single sponsor and stall. The wide feature surface combined with single-vendor backing is a high-variance bet.
- **Minigraf** — see Grafeo, but at smaller scale.
- **Kuzu (post-Apple)** — Apple acquired and archived Kuzu in October 2025. Some functionality continues via the bundled extensions (algo, fts, json, vector) and the `unswdb/kuzu-wasm` fork at UNSW, but the upstream project is effectively frozen. Treat any Kuzu adoption today as "fork it and own it forever."

**Watch list (engines not in the seven-candidate brief but worth tracking):**
- **Datalevin** (juji-io, JVM/LMDB, Eclipse Public License) — best-in-class Datalog query optimizer; not WASM today; but a hypothetical port would be killer. Currently JVM-only.
- **HelixDB** — claims native graph+vector in Rust for RAG. Early stage; track but not a Tier 2 candidate yet.
- **Samyama** (arxiv 2603.08036) — RocksDB-backed Rust graph+vector w/ RDF/SPARQL. Pre-print; not for adoption.
- **Apple-acquired Kuzu via `unswdb/kuzu-wasm`** — the WASM fork is functional but archived; not a forward path.

### 5-year outlook (2026–2031)

WASM ecosystem evolution that affects this evaluation:
- **WASM Components / Component Model** (post-2.0) will let Crosswalker compose Oxigraph + Nemo + DuckDB **without each carrying its own glue**, potentially shaving 30–40% off the combined bundle even with no engine changes.
- **WASI Preview 2** standardization opens the door to running these engines outside the browser (as `wasmtime` / Wasmer modules) using **the same artifacts** — meaning the Crosswalker server and the Crosswalker browser plugin could share binaries.
- **WASM SIMD / threading / GC** are now broadly available; engines that exploit them (DuckDB-WASM, Grafeo) will widen the perf gap over engines that don't.
- **WebGPU** for vector search (cosine/dot product on the GPU) is a 2027–2028 feature; Grafeo and SurrealDB are positioned for it; sqlite-vec less so.
- **WASM 64-bit memory** removes the 2 GB browser memory ceiling, making 10M-mapping in-browser SSSOM workloads materially easier — DuckDB-WASM has issues tracking this.

### License-risk historical pattern (BSL/SSPL/AGPL conversions)

Documented timeline of major OSS-to-source-available conversions:
- **MongoDB**: AGPL → SSPL (2018). OSI rejected SSPL. AWS forked into DocumentDB; Linux distros removed Mongo from main repos.
- **Elastic**: Apache-2.0 → SSPL/Elastic License (2021). AWS forked into OpenSearch. Three years later, Elastic re-added AGPL as an option (2024), partially walking back.
- **HashiCorp Terraform**: MPL-2.0 → BSL (2023). Linux Foundation forked into OpenTofu within months.
- **Redis**: BSD-3 → RSALv2/SSPL (2024). Linux Foundation forked into Valkey.
- **MariaDB BSL** (the parent license SurrealDB uses): The 4-year reversion has actually held. This is the single positive precedent. But MariaDB Foundation backstops it.

The pattern: BSL is the "least hostile" of the source-available licenses, and its reversion clauses have generally held. **However**, every single one of the projects above tightened their license under commercial pressure. SurrealDB has $44M of investor pressure and a DBaaS competitor strategy. The probability that the BSL terms tighten further (e.g., adding "embedded in commercial products" to the restricted-uses list at version N+1) over a 5-year horizon is non-trivial. **Federal/GRC users should not bet on BSL holding.**

### IndexedDB vs OPFS vs file-based persistence at 10M-triple scale

Per PowerSync's November 2025 review and the SQLite team's official wasm docs:
- **IndexedDB**: works everywhere, no COOP/COEP requirement, 10–50× slower than OPFS at sustained writes, no sync API. Practical ceiling for SSSOM ~1–3M mappings.
- **OPFS (FileSystemSyncAccessHandle)**: requires Web Worker + COOP/COEP, near-native performance, exclusive lock per file. Practical ceiling: GB-scale, supports 10M+ mappings with appropriate page sizes. **This is the right answer for Crosswalker's upper-tier deployments.**
- **OPFS-async (readwrite-unsafe, Chrome 121+)**: enables some concurrency but not WAL; experimental.
- **File-based (Electron / Obsidian native filesystem)**: best of all — full SQLite native — but only available outside the browser. The Obsidian Desktop plugin can use this; Obsidian Mobile can't.

**Recommendation.** Use OPFS for Crosswalker Desktop in the browser/Electron Obsidian environment. Use IndexedDB as fallback. Document the COOP/COEP requirement as a deployment prerequisite for the high-performance path.

---

## 9. Innovative Architecture Proposals

Two alternatives the user may not have considered, with explicit tradeoff analysis.

### Proposal A — "HDT-as-distribution + Comunica-as-query + cr-sqlite alternate (Yjs-actual) for collaborative edits + DuckDB-WASM for analytics"

The idea: **decouple the read-optimized distribution format from the read-write hot store**.

**Architecture:**
- **Ship-once distribution**: Crosswalker bundles the canonical SSSOM crosswalk (NIST CSF ↔ ISO 27002 ↔ MITRE ATT&CK ↔ etc.) as a single **HDT file** (~30–80 MB at 10M triples), served from the plugin or from a CDN, downloaded once and cached in OPFS.
- **Query layer**: **Comunica** with the HDT actor reads the canonical mappings; for user-extended mappings, Comunica federates over the user's local Oxigraph store (or a TPF endpoint hosted at the user's organization).
- **Collaborative edit layer**: **Yjs** (not cr-sqlite — see §2.6) over Obsidian Sync or a self-hosted y-websocket, providing real-time collaborative editing of user-authored mapping extensions. Yjs documents are projected into RDF on commit.
- **Analytics**: **DuckDB-WASM** kept for crosswalk coverage analytics, gap reports, predicate distribution.

**Bundle math:** Comunica ~300 KB + N3 ~150 KB + HDT lib ~300 KB + Yjs ~100 KB + DuckDB-WASM ~6.4 MB = **~7.3 MB compressed**, **plus** the HDT data file (cached, not part of the plugin bundle). Drops Oxigraph and Nemo entirely, replacing with Comunica+HDT+JS-side rule evaluation.

**Tradeoffs:**
- ✅ Federation is now a first-class capability.
- ✅ Bundle decreases ~30%.
- ✅ Distribution becomes a single immutable HDT file — git-friendly, reproducible audit.
- ✅ Yjs solves collaborative editing definitively.
- ❌ Lose native Datalog (Nemo) — chain-rule derivation moves to Comunica's SPARQL property paths (less expressive) or to in-memory JS rule evaluation (slower).
- ❌ Lose Oxigraph's W3C-conformance lead for local SPARQL (Comunica is comparable but slower per WasmTree paper).
- ❌ Adds three new core dependencies (Comunica, HDT, Yjs) to maintain.

**Verdict.** Architecturally appealing for a federated GRC future. **Recommend exploration as a Tier 2-Pro variant** for organizations doing federated crosswalking, but not as the default Tier 2.

### Proposal B — "Oxigraph-only Tier 2 with Datalog-via-SPARQL-property-paths + DuckDB-as-add-on"

The idea: **collapse Datalog into SPARQL** by recognizing that the SSSOM chain rules (transitive `skos:exactMatch`, etc.) are expressible as SPARQL 1.1 property paths.

**Architecture:**
- **Single primary engine**: Oxigraph-WASM, handling RDF + SPARQL + property-path-based recursion.
- **DuckDB-WASM** retained as opt-in for analytics workflows (gap reports, coverage counts).
- **No Nemo** — chain rules are rewritten as SPARQL property paths:
  ```sparql
  SELECT ?subject ?object WHERE {
    ?subject (skos:exactMatch|skos:closeMatch)+ ?object .
  }
  ```

**Bundle math:** Oxigraph ~3 MB + DuckDB ~6.4 MB = **~9.4 MB**, dropping Nemo (~2 MB). A ~17% reduction.

**Tradeoffs:**
- ✅ Single SPARQL/RDF engine. Conceptual simplicity. Stable W3C-conformant foundation.
- ✅ Removes one dependency.
- ❌ SPARQL property paths are **not equivalent to Datalog**: no aggregation inside recursion, no stratified negation in path semantics, no rule-level confidence-min computation. For SSSOM's `confidence_min(c1, c2)` chain semantics, you'd need to implement post-processing in JS.
- ❌ Property paths are notoriously slow on engines without specific optimizations; Oxigraph's optimizer for paths is improving but not best-in-class.

**Verdict.** Worth piloting **only** if Crosswalker can prove the rule subset it actually needs is expressible in SPARQL property paths. The risk is that "almost-but-not-quite" gaps force back-translation later. **Recommend a 2-week spike**: hand-translate the canonical SSSOM rule set to SPARQL and measure expressivity coverage. If ≥90%, this is viable.

---

## 10. Out-of-Scope Confirmation

Per the brief, the following are explicitly out of scope and have not been re-evaluated here:
- **Tier 3 server stack** — TerminusDB, Apache AGE, Apache Jena Fuseki, Blazegraph, Virtuoso. Crosswalker's server-side considerations remain governed by Challenge 12.
- **Commercial/closed-source engines** — RDFox (Oxford), Stardog, GraphDB (Ontotext), AnzoGraph, Neptune. These would solve some technical problems (RDFox in particular has the strongest Datalog+SPARQL story commercially) but are not OSS-eligible for Crosswalker's distribution model.
- **Full Challenge 11 matrix rebuild** — this report does not re-litigate the original DuckDB-WASM + Oxigraph + Nemo selection on the original criteria; it asks only the narrower question, "do these seven engines change that selection?"

---

## 11. Closing Reasoning — Why "Boring Wins" Here

The instinct behind Challenge 14 is sound: a layered three-engine stack is architecturally suspect, and the field of WASM databases has exploded since Challenge 11. The investigation, though, returns a result that is more interesting than "swap out an engine":

1. The **bundle-size collapse story** is real but only deliverable by sqlite-wasm+sqlite-vec, which has a different (smaller) feature ceiling.
2. The **single-engine collapse story** (Grafeo, SurrealDB, CozoDB) does not collapse the bundle — at best it equals it, at worst (SurrealDB) it busts it — *and* introduces single-vendor risk in exchange for marginal architectural simplification.
3. The **strategic-capability expansion story** (federation via Comunica, bi-temporal via Minigraf, CRDT via cr-sqlite-or-Yjs) points additively — these are *Tier 2 add-ons*, not replacements.
4. Several of the most-hyped candidates (CozoDB, cr-sqlite) have stalled in the 18 months since Challenge 11; the right move is to *not* adopt them now even though they're well-architected.
5. The most-hyped 2026 entrants (Grafeo, Minigraf) are pre-1.0 and single-vendor — the right move is to *track*, not adopt.

**The honest architectural recommendation:** the Challenge 11 stack is well-chosen. The corrective action is not to replace it but to extend it sideways (Comunica for federation, sqlite-wasm Tier 2-Lite for low-end), set explicit migration triggers (§7) for the genuinely promising candidates, and revisit in 12 months when Grafeo, Minigraf, and CozoDB have either earned production trust or fallen off the map.

The cost of being wrong on a "collapse to one engine" decision is high — a 2-year rebuild — and the evidence simply does not support that decision today. The cost of adding Comunica and a Tier 2-Lite alternate is low and both expansions deliver real capability today. Prefer the high-EV-low-variance moves.
