---
title: "Challenge 24 — Adversarial evaluation of Turso / libSQL for Crosswalker"
description: "Adversarial fresh-agent deliverable evaluating libSQL-WASM as Tier 2 substrate (Q1), Turso Cloud as Tier 3 documented option (Q2), and Turso Database / Limbo as long-horizon track (Q3). Verdict: REJECT all three. The deliverable distinguishes libSQL (soft fork, MIT, currently shippable) from Turso Cloud (hosted commercial) from Turso Database / Limbo (Rust rewrite, BETA, MIT). Key finding: vendor publicly de-prioritizes libSQL in favor of Limbo as of 2025; `@libsql/libsql-wasm-experimental` is at version 0.0.3; independent Bambini benchmark (Aug 2025) showed libSQL DiskANN didn't complete on 100K × 384-dim vectors while sqlite-vec scanned in ~57 ms. Deepest insight: vector-layer portability — sqlite-vec is decoupled from substrate, libSQL native vector is not. Sets explicit migration triggers for re-evaluation."
tags: [research, deliverable, tier-2, tier-3, sqlite, libsql, turso, limbo, governance, sustainability, vendor-risk, vector-search, sqlite-vec, modularity]
date: 2026-05-04
sidebar:
  label: "Ch 24 · Turso / libSQL evaluation"
  order: -20260504.3
---

# Adversarial Evaluation of Turso / libSQL for Crosswalker

## Bottom Line Up Front

| Question | Recommendation | Confidence |
|---|---|---|
| **Q1: Migrate Tier 2 to libSQL-WASM for v0.1/v0.2?** | **Reject. Stay on `@sqlite.org/sqlite-wasm` + `sqlite-vec`.** | High |
| **Q2: Document Turso Cloud as Tier 3 option?** | **Reject for v1.0 docs; revisit in v1.1+ with caveats.** | Medium-high |
| **Q3: Track Turso Database / Limbo post-v1.0?** | **Watch, do not adopt. Add to "long-horizon substrates" register.** | High |

Crosswalker's existing precedents — rejecting SurrealDB on BSL grounds, demoting AGE for vendor pivot risk, flagging Bun's single-vendor governance — apply with full force here. The Turso/libSQL story in 2025–2026 is the textbook scenario those precedents were designed to detect: an investor-backed single vendor publicly de-emphasizing the artifact in question (libSQL) in favor of a successor product (Turso Database / Limbo) that is *not* file-format compatible with SQLite.

---

## 1. Disambiguation: Three Distinct Things Sharing One Brand

This is the single most important framing to get right. Turso's own engineering leadership (Pekka Enberg) has acknowledged that "AI agents seem confused about" the naming, and the confusion is by no means limited to AI agents.

**(a) libSQL** — A ~2-year-old C-language soft fork of SQLite, MIT-licensed, maintained by Turso (the company, formerly ChiselStrike). Adds: virtual WAL hook, native replication primitives, an HTTP/WebSocket wire protocol (Hrana), a native vector column type (`F32_BLOB`) with optional DiskANN index (`libsql_vector_idx`), and minor SQL extensions (e.g., randomized rowids, `ALTER TABLE` extensions, WASM user-defined functions). Per Turso's own manifesto, libSQL "always" reads/writes the SQLite file format when libSQL-only features are not used. As of late 2025, Turso states: *"libSQL is actively maintained, but new features are being developed in Turso."* This is a strategic de-prioritization in plain language.

**(b) Turso Cloud (sqld)** — The hosted commercial offering. Currently runs on libSQL as its engine; Turso has stated it will "integrate the Turso Database engine in the future." The closed-source server runtime was explicitly relicensed from libSQL's open-source server components in January 2025 — the open-source `sqld` path remains available for self-hosting. Pricing: free tier (5 GB storage, 500M row reads/month after the March 2025 reduction), Developer plan $4.99/month, Scaler $29/month, plus Pro and Enterprise. As of mid-2025, all paid plans include unlimited active databases.

**(c) Turso Database / Limbo** — A clean-room Rust rewrite of SQLite from scratch, MIT-licensed, currently in **beta**. Explicitly **not a fork** and explicitly **not file-format-compatible with classic SQLite at every layer** (it aims for compatibility with the SQL dialect, file format, and C API as a target, but is its own implementation with its own bugs, edge cases, and feature set). Turso announced in early 2025 that it is "going all-in" on this rewrite, simultaneously laying off some libSQL-focused staff. Turso's official guidance is now: *"If you're starting a new project, we recommend Turso Database. For mission-critical workloads that need a battle-tested foundation today, libSQL is the right choice."* Translation for any conservative project: neither side of that recommendation tree maps cleanly onto Crosswalker's risk profile, because libSQL is publicly second-class within its own vendor's roadmap, and Turso Database is a beta.

**Why this matters for Crosswalker:** Adopting libSQL for Tier 2 today is adopting an artifact that the artifact's vendor has publicly downgraded. That is a worse vendor-trajectory signal than anything that has appeared in the SurrealDB, AGE, or Bun assessments.

---

## 2. Q1 — Tier 2 Substrate: `@sqlite.org/sqlite-wasm` vs. libSQL-WASM

### 2.1 What "libSQL-WASM" actually is

Two artifacts exist:

- **`@libsql/libsql-wasm-experimental`** — Per its own repo README: *"This project wraps the code of SQLite Wasm with no changes, apart from added TypeScript types."* The current published version is **0.0.3**. The package name literally contains "experimental." It is forked from `@sqlite.org/sqlite-wasm` and re-exposes additional symbols, and is maintained by republishing whatever falls out of the libSQL upstream's `ext/wasm/make dist` build. Weekly downloads on npm sit around 5,000.
- **`@libsql/client-wasm`** — A higher-level libSQL client built on top of the experimental WASM package, providing the libSQL Promise-based client API. Pekka Enberg's announcement was explicit that this builds on "the existing SQLite WebAssembly support and the awesome [`@sqlite.org/sqlite-wasm`] package … with minor modifications to export some more symbols."

In other words: **the WASM build of libSQL is, in 2026, essentially the canonical SQLite WASM build with a few extra exported symbols and the libSQL-specific C source compiled in.** It is not a parallel, well-funded engineering investment by Turso; it is an ancillary artifact whose own README directs SQLite-related issues to the upstream SQLite project. There is no public roadmap separating libSQL-WASM from canonical sqlite-wasm in any of the dimensions Crosswalker cares about (size, OPFS, FTS5, threading model).

### 2.2 Bundle size

There is no published, head-to-head benchmark of `@libsql/libsql-wasm-experimental` against `@sqlite.org/sqlite-wasm` at OPFS-backed read/write/vector parity, because the libSQL build is essentially the SQLite WASM build with libSQL's C deltas folded in. Empirically:

- `@sqlite.org/sqlite-wasm` ships at roughly the well-known ~600 KB OPFS-backed WASM (community measurements at ~300 KB gzip for the WASM binary alone in the OPFS-SAH-pool variant).
- libSQL's C source contains net additions (vector type, virtual WAL, Hrana protocol C support, ALTER TABLE extensions). At equivalent compile flags, the libSQL WASM is therefore expected to be **at least as large, and likely modestly larger** (single-digit-percent to ~10–20% bigger), depending on which features are compiled in.
- If Crosswalker were to compile sqlite-vec into a custom canonical SQLite WASM build (the standard pattern, since WASM cannot dynamically `sqlite3_load_extension`), that adds ~150 KB compressed for sqlite-vec. The libSQL native vector path avoids this delta — but only by replacing it with libSQL's own statically compiled vector C code, which is not meaningfully smaller.

**Verdict on size:** Effectively a wash. There is no bundle-size case for migrating.

### 2.3 Browser / Capacitor / Electron compatibility

- **Electron desktop (Obsidian Desktop):** Both work. The renderer process can load WASM and use OPFS (subject to COOP/COEP, which Obsidian does not by default deliver — but Obsidian plugins typically run in a renderer with appropriate isolation, and the `opfs-sahpool` VFS works without SharedArrayBuffer/COOP-COEP, which is the relevant escape hatch). Either substrate should work; neither has a special advantage.
- **Capacitor WebView (Obsidian Mobile):** This is the harder environment. The canonical SQLite Wasm OPFS VFS requires SharedArrayBuffer (COOP/COEP), which Capacitor does not natively send (open ionic-team/capacitor issue #7813 confirms this is unresolved). The `opfs-sahpool` variant from upstream sqlite-wasm avoids that requirement and is the pragmatic mobile path. **libSQL-WASM, being a thin re-package of sqlite-wasm, inherits exactly the same constraints — neither better nor worse.** There is no reported Capacitor-specific advantage to libSQL-WASM, and there is also no community body of mobile production reports for it (a function of its 5K weekly download tail).

**Verdict on portability:** No advantage to libSQL. Both depend on the same `opfs-sahpool` engineering done by SQLite upstream.

### 2.4 Extension compatibility (sqlite-vec, FTS5, recursive CTEs)

This is where the real asymmetry lies, and it cuts *against* libSQL.

- **FTS5 and recursive CTEs:** Both substrates compile FTS5 in by default in their official WASM artifacts (FTS5 has been default-on in canonical SQLite for years; libSQL inherits this). Recursive CTEs are core SQL; both support them identically.
- **sqlite-vec:** Per `asg017/sqlite-vec`'s own architecture documentation, **WASM does not support dynamic extension loading** (no `sqlite3_load_extension` over a host filesystem from a WASM sandbox). Therefore, using sqlite-vec from any WASM SQLite — canonical or libSQL — requires **statically compiling sqlite-vec into a custom WASM build** (the `sqlite-vec-wasm-demo` pattern, or a parallel custom build). This is the same workflow on both substrates. Neither package as-shipped on npm includes sqlite-vec.
- **libSQL native vector as a sqlite-vec replacement:** Marketing claims feature parity. Reality (from independent benchmark by Marco Bambini of SQLite AI, August 2025): *"We couldn't complete the libsql test, as index creation ran for hours without finishing"* on a 100K × 384-dim FLOAT32 dataset. That is a single benchmark, but it points to a real maturity gap in libSQL's DiskANN implementation circa mid-2025. sqlite-vec at the same workload performed brute-force scan in ~57 ms with strong recall. **libSQL's native vector is not a drop-in replacement for sqlite-vec for any production-shaped workload today.**

The vector compatibility question can also be put this way: sqlite-vec uses a vec0 virtual table; libSQL uses a column type plus `libsql_vector_idx`. **A schema written for one cannot be read by the other.** Files written by libSQL using `F32_BLOB` columns + `libsql_vector_idx` will open in vanilla `sqlite3` CLI (the bytes are regular tables and BLOBs — libSQL keeps the file format), but the index becomes a regular table the CLI doesn't know how to query, and any vector query will fail. Conversely, sqlite-vec data files require the `vec0` extension to be loaded to query — and libSQL has no built-in `vec0` virtual table. Migration in either direction requires a re-embed/re-index step. Neither schema is portable to "vanilla SQLite + commodity tooling" without the matching extension.

**Verdict on extensions:** Even-or-worse for libSQL. sqlite-vec is a single, MIT-licensed, multi-sponsor (Mozilla Builders + Fly.io + Turso + SQLite Cloud + Shinkai) artifact that is small enough to fork. libSQL native vector entangles vector search governance with substrate governance into one vendor.

### 2.5 File format compatibility

- libSQL's manifesto explicitly commits to: *"libSQL will always be able to ingest and write the SQLite file format. … We commit to always doing so in a way that generates standard SQLite files if those features are not used."* This commitment is durable and enforced by the project's own self-positioning as a fork.
- A libSQL `.db` file using only standard SQL features will open in the vanilla `sqlite3` CLI, the official SQLite browser, `better-sqlite3`, etc.
- **Edge cases that break the round-trip:** virtual WAL state (libSQL's WAL has been re-architected for replication; the `-wal` and `-shm` are still recognizable but used differently — recommendation is to checkpoint and remove WAL files before handing to vanilla SQLite); native vector indexes (`libsql_vector_idx`) materialize as opaque shadow tables vanilla SQLite cannot interpret as indexes; any future libSQL-only features (encryption-at-rest, CRC) would also break vanilla compatibility once enabled.
- sqlite-vec data: **portable file**, but only queryable from a runtime that has loaded sqlite-vec. The portability of the bytes is identical between substrates.

**Verdict on file format:** Effectively neutral. Both make the same Faustian bargain (use the special features, lose the round-trip; stay on the lowest common denominator, keep portability). No advantage to libSQL.

### 2.6 Concurrency model and main-thread yielding

- `@sqlite.org/sqlite-wasm` exposes both a synchronous OO API (worker-thread only when using OPFS) and a Promise-based Worker1 promiser API. Cooperative main-thread yielding is achieved by hosting the DB in a dedicated Worker and message-passing.
- libSQL's higher-level client API (`@libsql/client`) is async/Promise-based by design. Inside the WASM, the underlying engine is still SQLite's synchronous core; the async surface is a wrapper.
- **Practical implication for Crosswalker:** Tier 2's cooperative yielding is achieved at the *plugin* layer (chunking work, yielding to the event loop between batches). This is the same on both substrates. The libSQL async API is a developer-ergonomics convenience on top of the same synchronous engine; it does not give you cheaper yielding.

**Verdict on concurrency:** Even. The libSQL async API is nicer if you are *only* using libSQL, but Crosswalker has already designed for SQLite's sync semantics.

### 2.7 OPFS persistence

Identical. The libSQL-wasm-experimental package literally re-uses the canonical SQLite OPFS VFS (`sqlite3-opfs-async-proxy.js`) and the `opfs-sahpool` VFS. There is no advantage either way.

### 2.8 Steelmanning the migration case (and why it still fails)

**Steelman 1: "Newer is better — libSQL has features SQLite refuses to add."** Crosswalker uses none of the features that justify libSQL's existence. Crosswalker does not need: virtual WAL hooks, sqld remote access, embedded replicas with primary-replica sync, BEGIN CONCURRENT MVCC writes, WASM UDFs, randomized rowids, or a Postgres wire protocol. The only feature on the list that maps onto a Crosswalker need is native vector — and that is currently slower and less mature than sqlite-vec.

**Steelman 2: "Substrate alignment with Tier 3."** This argument requires Tier 3 to be Turso Cloud — see Q2. Even if Tier 3 added Turso Cloud as a *documented option*, Crosswalker's Tier 1 (markdown) is substrate-irrelevant, and Tier 2-to-Tier-3 substrate alignment is not a hard requirement: every Tier 3 option already requires a translation layer (Postgres, Fuseki, oxigraph-server, TerminusDB, AGE all have different SQL/SPARQL/Cypher dialects). Adding one more SQL-dialect-compatible Tier 3 does not make Tier 2 substrate choice load-bearing.

**Steelman 3: "Edge replication is the future."** This conflates the artifacts. Turso Cloud's edge replication operates over libSQL's HTTP/Hrana protocol against a server. It does **not** materialize as a benefit inside an Obsidian plugin running on a single user's device. Crosswalker is an embedded query cache, not a multi-region deployment.

**Steelman 4: "Single-vendor risk is overblown for MIT-licensed code."** It would be — except the vendor has *itself* publicly de-prioritized libSQL in favor of a non-fork, file-format-divergent rewrite. The MIT license guarantees you can keep what you have; it does not guarantee anyone will continue maintaining or building Wasm artifacts of the C fork. The `@libsql/libsql-wasm-experimental` package was last published at version 0.0.3 — **the package version itself signals "not a release product."**

**Steelman 5: "Canonical SQLite is just conservative cargo-culting."** No: it is justified by hard constraints. (a) SQLite Consortium funding model: Hwaci/D. Richard Hipp's project, with paying sponsors including Mozilla, Bloomberg, Adobe, Nintendo, and Bentley, plus public-domain dedication. (b) Twenty-plus-year backwards/forwards file format stability commitment. (c) Multi-stakeholder bus factor: even if Hipp stopped working tomorrow, the format is documented and frozen, and dozens of independent re-implementations exist. (d) Obsidian's own ecosystem largely uses canonical SQLite (better-sqlite3 on desktop; OS-bundled SQLite on mobile via Capacitor). Choosing the substrate the host application's ecosystem uses is not cargo-culting; it is integration discipline.

### 2.9 Q1 Recommendation: REJECT migration. STAY on `@sqlite.org/sqlite-wasm` + `sqlite-vec`.

The case for migration is unsupported on every dimension Crosswalker actually weighs:
- No bundle size benefit
- No portability benefit
- Vector parity claim contradicted by independent benchmark
- Extension story is at best equal, more likely worse (one fewer fork-target if sqlite-vec disappears)
- Governance trajectory is actively negative (vendor publicly downgraded the artifact)
- Concurrency model is the same engine with a different wrapper
- File format trade-offs are symmetric

The libSQL native vector angle alone — the strongest single argument — is **not** strong enough to justify the substrate switch, especially given that (a) sqlite-vec is currently more mature for the workloads Crosswalker actually runs, (b) libSQL's vector indexing has shown unbounded build-time pathologies on third-party benchmarks, and (c) accepting libSQL for vector means tying both substrate AND vector into one vendor's roadmap, just as that vendor is publicly de-prioritizing the artifact.

### 2.10 Migration triggers (when to re-evaluate)

Re-open the Q1 question if **any two** of the following occur:

1. **sqlite-vec maintenance lapse:** No release for 12+ months AND no community fork has gained traction. (Note: as of issue #226 in mid-2025, the project had a half-year hiatus, then resumed with renewed Mozilla support and shipped DiskANN ANN indexes in alpha. Maintenance is currently sustainable. Tracking signal: the `asg017/sqlite-vec` release cadence and the project's stated long-term plan to enter "stable maintenance mode" after v1.0.)
2. **libSQL becomes the de facto standard:** One of the following: (a) the SQLite project upstreams libSQL's vector type; (b) `@libsql/libsql-wasm` (without the "-experimental" suffix) reaches 1.0 with stability commitments; (c) libSQL's vector index outperforms sqlite-vec on a published, reproducible benchmark.
3. **Obsidian itself adopts libSQL:** If Obsidian Sync, Obsidian Bases, or Obsidian core swaps in libSQL, plugin ecosystem alignment becomes a real factor.
4. **Turso governance stabilizes around libSQL:** Public, dated commitment from Turso to maintain libSQL as a peer to Turso Database, with separate dedicated engineering. (The current public statement does the opposite.)
5. **A non-Turso fork of libSQL emerges with multi-stakeholder governance.** Equivalent to a "Valkey moment" for libSQL.

---

## 3. Q2 — Tier 3 Documentation: Should Turso Cloud Be Listed Alongside Postgres/Fuseki/oxigraph-server/TerminusDB/AGE?

### 3.1 What Tier 3 actually is

Per the brief: opt-in server deployment, documentation question, low stakes. The existing list is heterogeneous: Postgres (relational, OSS, multi-stakeholder), Fuseki (Apache, RDF/SPARQL), oxigraph-server (Rust, RDF), TerminusDB (commercial-OSS hybrid, document-graph), AGE (Postgres extension, Bitnine pivot risk already noted). Tier 3 already documents trade-offs — it is not an endorsement list, it is an options register.

### 3.2 The dependency on Q1

If Q1 had recommended migration to libSQL, Turso Cloud would be the obvious Tier 3 entry: same dialect, same vector type, same WAL semantics, embedded-replica story. Since Q1 rejects migration, **Turso Cloud as a Tier 3 option produces a substrate mismatch:** Tier 2 is canonical SQLite + sqlite-vec, Tier 3 (if Turso) is libSQL + libSQL-native-vector. Schemas would not be portable across the boundary without a vector-re-embedding migration step.

### 3.3 Does Turso Cloud bring something the existing list does not?

- **Edge replication:** Genuine differentiator. Postgres has logical replication and Citus; Fuseki/oxigraph have no native edge story; AGE inherits Postgres replication. None of them offer "single-binary embedded replica syncing to a primary at the edge" the way Turso does.
- **SQLite-dialect SQL:** Differentiator vs. Postgres (different dialect) and the RDF stores (different paradigm entirely). Aligns *somewhat* with Tier 2 even if Tier 2 is canonical SQLite — SQL is largely portable as long as Crosswalker avoids libSQL-only syntax.
- **Vector + SQL in one box:** Postgres+pgvector already does this. Not unique.
- **Pricing:** Free tier (5 GB), $4.99/month Developer plan with unlimited databases. Notably permissive for a hobbyist or small-org deployment.

### 3.4 Vendor-risk applied to Tier 3 specifically

The Tier 3 governance bar is lower than Tier 2 (it's an option, not the substrate), but the existing list is full of multi-stakeholder or stable-vendor projects. Adding Turso Cloud means documenting:

- A single-vendor commercial offering (Turso, the company)
- Whose engine is currently libSQL but is *publicly slated to migrate to Turso Database / Limbo*
- Where the server runtime closed-source path was relicensed in January 2025 (`sqld` open-source remains, but is not the path Turso is investing in)
- Where the company has had layoffs concurrent with the Limbo pivot

This is structurally similar to the AGE/Bitnine concern that already led Crosswalker to demote AGE — and arguably worse, because AGE at least has a Postgres-extension architecture independent of Bitnine.

### 3.5 Q2 Recommendation: Reject for v1.0 docs; add a *future-watch* note.

**For v1.0 documentation, do not list Turso Cloud as a Tier 3 option.** Rationale:

1. Substrate mismatch with Tier 2 (Q1 stays on canonical SQLite).
2. Vendor governance trajectory is in flux (Limbo pivot).
3. The "edge-replicated SQLite" use case is genuinely interesting but not a Crosswalker user need today (Crosswalker users are Obsidian-vault-scale single-user or small-team).
4. Postgres already covers the "I want a real server" axis.

**Do** add a single-paragraph note in a "Substrates considered and not adopted" or "Future watch" section, explaining that Turso Cloud was evaluated, the substrate-mismatch and governance reasons it is not currently listed, and the conditions under which it would be re-evaluated (which mirror the Q1 migration triggers, plus: Turso publicly commits Turso Cloud to long-term libSQL backend support, OR Crosswalker's Tier 2 changes for Q1-trigger reasons).

This is consistent with how Crosswalker has handled SurrealDB, AGE, and Bun: explicit, dated, reasoned non-adoption is itself documentation.

---

## 4. Q3 — Track Turso Database / Limbo as Long-Horizon Post-v1.0?

### 4.1 What it is, restated

A clean-room Rust rewrite of SQLite. MIT-licensed. Currently in beta. Async-first I/O (io_uring on Linux). Targets MVCC concurrent writes (`BEGIN CONCURRENT`), native vector search (similar to libSQL), browser/WASM/OPFS support out of the box, encrypted storage at rest as an experimental feature. Glauber Costa (Turso CEO): the project resonated where libSQL did not, and Turso has committed company resources to it. The project hit ~19K stars and ~237 contributors per turso.tech as of late 2025.

### 4.2 Why this matters even if you reject it today

If Limbo succeeds — meaning it reaches stability, achieves real SQLite file-format compatibility under fuzz/DST, and earns enough community trust to be an alternative implementation of SQLite rather than a vendor product — it would change the embedded-DB landscape. Async-native, memory-safe SQLite with concurrent writes is genuinely attractive for the Obsidian-plugin environment, *eventually*. A WASM build of Limbo with native OPFS would be a clean substrate for Tier 2.

If Limbo fails — meaning it stalls, retains too many subtle SQLite-incompatibilities, or Turso's strategic priorities shift again — Crosswalker has lost nothing by watching.

### 4.3 What disqualifies it for v1.0 adoption

1. **Pre-1.0, beta-grade.** Turso's own README warns: *"This software is in BETA. It may still contain bugs and unexpected behavior."*
2. **Not file-format-compatible at every level today.** The project *targets* SQLite file-format compatibility, but compatibility is verified by deterministic simulation testing (DST) and fuzz on bytecode generation — these methods are excellent for finding bugs, not for proving completeness. There will be subtle behavioral divergences from canonical SQLite for years. The compatibility document (`COMPAT.md`) is itself a moving target.
3. **No multi-stakeholder governance.** Single-vendor project; the community contributor count is impressive but the vendor steers it.
4. **Dialect-equivalence tax.** Every query Crosswalker writes for canonical SQLite must be re-validated against Limbo's bytecode generation. This is a real engineering cost.

### 4.4 Q3 Recommendation: WATCH, do not adopt. Add to long-horizon substrate register.

Concretely:

- Add Limbo to a "Long-horizon substrates under observation" appendix, alongside any other future-watch entries.
- Set a re-evaluation review at v1.0 + 12 months, OR upon any of these public signals:
  - Limbo reaches a versioned 1.0 with documented file-format compatibility test pass against the SQLite test corpus (note: SQLite's own TH3 test suite is closed, but the open-source TCL suite is passable as a partial proxy).
  - A non-Turso fork or alternative steward emerges (governance diversification).
  - A canonical Obsidian-ecosystem tool (the Obsidian core, a major plugin like Dataview, or Obsidian Bases) adopts Limbo.
  - Limbo's WASM build ships a stable, versioned npm package with a feature-set matrix matching Crosswalker's Tier 2 needs (FTS5, recursive CTEs, vector, OPFS, SAH-pool fallback for Capacitor).
- Do **not** track Limbo as a near-term Tier 2 candidate. It is long-horizon. The single largest signal that would force re-evaluation early is *if SQLite the project itself does anything that affects format stability* — and SQLite has shown no such tendency in twenty years.

---

## 5. Vector Search Deep-Dive: Does The Vector Angle Alone Justify a Substrate Switch?

This is the one question worth re-examining as a standalone, because it is the strongest argument for libSQL.

| Dimension | `@sqlite.org/sqlite-wasm` + sqlite-vec | libSQL-WASM + native vector |
|---|---|---|
| License | Public domain (SQLite) + MIT (sqlite-vec) | MIT |
| Maintainer of vector layer | Alex Garcia (single primary) + Mozilla Builders + Fly.io + Turso + SQLite Cloud + Shinkai sponsorship | Turso (single vendor) |
| Vector layer license/forkability | MIT, ~5 KLOC pure C, no deps — trivially forkable | MIT, embedded in libSQL — fork requires forking libSQL |
| Vector storage | `vec0` virtual table | `F32_BLOB` column type + shadow tables |
| Index | Brute force + DiskANN (alpha), binary/scalar quantization | DiskANN |
| Independent benchmark (Bambini, 100K × 384 FP32) | ~57 ms scan, ~17 ms quantized | "Index creation ran for hours without finishing" |
| Maintenance signal (2025–2026) | Six-month hiatus then revival w/ Mozilla; 0.1.9 published Q1 2026; ANN release in alpha | Active in libSQL repo, but libSQL itself is publicly de-prioritized |
| WASM packaging | Custom static-link build required (no dynamic load) | Custom static-link build required (no dynamic load) |
| File portability of vector data | Bytes portable, queries require sqlite-vec loaded | Bytes portable, queries require libSQL loaded |
| Decoupling from substrate | **Yes** — works on canonical SQLite, libSQL, Turso DB, Postgres-compat with adapter | **No** — tied to libSQL specifically |

The decoupling row is the deciding line. **sqlite-vec is portable across SQLite forks and rewrites; libSQL native vector is not.** If Limbo ships a working WASM build in 2027 and Crosswalker decides to migrate, sqlite-vec moves with it (Limbo targets SQLite extension ABI compatibility per its compatibility doc); libSQL native vector does not. Vector is the *one* place where vendor-coupling concerns matter most, because vector data is expensive to recompute (embeddings cost) and the schema is opaque (`F32_BLOB` columns and DiskANN shadow tables aren't humanly inspectable).

**The vector angle is therefore an argument *against* libSQL adoption**, once you account for substrate-portability of the vector layer itself.

---

## 6. Summary of Commit/Reject Decisions

1. **Q1 — Tier 2 substrate migration to libSQL-WASM:** **REJECT.** Stay on `@sqlite.org/sqlite-wasm` + `sqlite-vec` for v0.1 and v0.2. Document the decision and triggers.
2. **Q2 — Turso Cloud as a documented Tier 3 option:** **REJECT for v1.0 docs.** Add a brief "considered and not adopted" note. Re-evaluate when Q1 triggers fire OR when Turso publicly recommits to libSQL as a long-term peer to Turso Database.
3. **Q3 — Track Turso Database / Limbo:** **WATCH, DO NOT ADOPT.** Add to long-horizon substrate register; review at v1.0 + 12 months or on the listed public signals.

---

## 7. What This Recommendation is *Not* Saying

- It is not saying libSQL is bad software. By all evidence, the libSQL fork is competently engineered, the Turso team is technically excellent, and the MIT license guarantees Crosswalker can still adopt it later if conditions change. The recommendation is about *fit, governance trajectory, and risk allocation*, not technical merit.
- It is not saying Turso Cloud users are making a mistake. Turso Cloud is a reasonable choice for projects whose primary axis is edge-replicated SQLite-in-the-cloud, which is not Crosswalker's axis.
- It is not saying Limbo will fail. Limbo might well become "the future of SQLite." Crosswalker's job is not to bet against that future; it is to avoid betting *on* a beta product as a v1.0 substrate.
- It is not saying canonical SQLite will be best forever. The migration triggers section is the explicit pre-commitment to revisit. Cargo-culting would be refusing to revisit; conservatism with explicit triggers is engineering discipline.

The decision in all three questions follows directly from the same heuristic Crosswalker has applied to SurrealDB, AGE, and Bun: **prefer multi-stakeholder substrates with stable governance and decoupled vector layers; treat single-vendor pivots as predictive of further pivots; document non-adoption with conditions for revisit.** Turso/libSQL/Limbo, in 2026, is the cleanest test case yet for that heuristic — and the heuristic's answer is consistent.
