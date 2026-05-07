---
title: "Ch 27 deliverable B: First-principles framing — Four-layer vault-as-database stack"
description: "Fresh-agent research deliverable B for Challenge 27 (Bases query layer architecture). Recommends a four-layer vault-as-database stack: (1) versioned schema layer enforced by templates and linters, (2) atomic Markdown storage with YAML-only structured fields, (3) query/index layer with Bases as default and DuckDB/SQLite/embeddings as escape hatches, (4) views/automation with .base files + custom views + HTTP API + MCP servers + LLM agents. Edge-notes pattern for typed relations. CQRS write/read split. Three-stage rollout (Foundation, Scale & agents, Index & federate). Reasoned from adjacent context — challenge page not retrievable to the agent."
tags: [research, deliverable, query-layer, bases, four-layer, schema-as-code, cqrs, edge-notes, agents, ch-27]
date: 2026-05-07
sidebar:
  label: "Ch 27b: Vault-as-DB stack"
  order: -20260507.2
---

:::tip[Origin and lifecycle]
Fresh-agent research deliverable produced 2026-05-07 in response to [Challenge 27: Bases query layer architecture](/crosswalker/agent-context/zz-challenges/27-bases-query-layer-architecture/). One of three parallel deliverables ([A: Crosswalker-specific framing](/crosswalker/agent-context/zz-research/2026-05-07-challenge-27-deliverable-a-crosswalker-specific/), B: vault-as-database stack, [C: materialization and codeblock](/crosswalker/agent-context/zz-research/2026-05-07-challenge-27-deliverable-c-materialization-and-codeblock/)). Reasoned from adjacent public context (Crosswalker README, public Bases API, broader Obsidian/Logseq/Anytype/Notion ecosystem) — agent reports the challenge page itself was not retrievable. Preserved verbatim.
:::

**Note on KB access:** The specific challenge document at `https://cybersader.github.io/crosswalker/agent-context/zz-challenges/27-bases-query-layer-architecture/` could not be retrieved directly (the fetcher returned a permissions error and the page does not appear in any public search index — likely a private/draft Quartz or MkDocs digital garden, or a path restricted from crawlers). I therefore reconstructed the author's framing from adjacent public artifacts in the cybersader ecosystem (the `cybersader/Crosswalker`, `cybersader/cyberbase`, `cybersader/awesome-obsidian-and-cyber`, and `cybersader.github.io/tasknotes` properties), which collectively show a consistent worldview: turn an Obsidian vault into a "full-fledged GRC/PKM database" by layering structured metadata, relations-via-links, and queryable views on top of plain Markdown — with explicit interest in CRDT reconciliation, Bases, Dataview, Notion-↔-Obsidian sync, and an "agent-context" pattern where the vault is also the substrate that AI agents read and write. The challenge title — "Bases Query Layer Architecture" — fits squarely in that program. This report addresses it on those terms.

## TL;DR

- **Treat Bases as a *view/query layer*, not a *storage layer*.** The vault (Markdown + YAML frontmatter + wikilinks) is the single source of truth; Bases is a read-compute-display pipeline that materializes filtered, computed views. Architect everything else around that separation, because it is the only one that survives Obsidian, Dataview, Datacore, Logseq, Anytype, and any future tool.
- **The right long-term architecture is a four-tier "vault-as-database" stack:** (1) a disciplined **schema layer** (a versioned Master Property Schema enforced by templates and linters), (2) a **storage layer** of atomic Markdown notes with YAML-only structured fields, (3) a **query/index layer** where Bases is the default and Datacore/external indexers (DuckDB, SQLite, embeddings) are escape hatches for what Bases cannot do, and (4) a **view/automation layer** of `.base` files, custom Base view plugins, MCP servers, and HTTP/webhook integrations (the TaskNotes pattern). Read/write is split CQRS-style: humans and agents *write* atomic notes; everything else *reads* projected views.
- **Bet on Bases as the default; keep Dataview/Datacore as a fallback; and never let either become your storage format.** Bases is now a core plugin, ~10–100× faster than Dataview at vault scale, supported by the Obsidian team, extensible via the 1.10 plugin-views API, and increasingly the integration target for ecosystem tools (TaskNotes, Graph Explorer Base View, kepano/obsidian-skills). Its current limits — YAML-only (no inline `::`), no joins/rollups, no scoped sub-queries, no `.base` Publish support yet, expensive `file.backlinks`, no real persisted index — are real but tractable, and most are on the public roadmap.

## Key Findings

1. **Bases is architecturally a query engine over a vault, not a database.** Per Obsidian's own docs and the DeepWiki structural analysis, a `.base` file is a stored YAML query configuration with five sections (filters, formulas, properties, views, source). At runtime it executes a *read → compute → display* pipeline against three property namespaces — note properties (frontmatter), file properties (`file.name`, `file.mtime`, `file.size`, `file.backlinks`, `file.hasLink`), and formula properties (computed in the base). There is **no separate datastore**; the vault *is* the table.

2. **The ecosystem is consolidating around Bases.** Bases shipped as a core plugin in Obsidian 1.9 (2025), gained group-by, map view, list view, summary aggregations, and a plugin-defined view API in 1.10, and the public roadmap lists CSV-to-Markdown conversion, in-base search, and Obsidian Publish support for `.base` files. Steph Ango (Obsidian's CEO) has personally shipped `kepano/obsidian-skills`, an Agent Skills package that teaches AI agents Markdown + Bases + JSON Canvas — a strong signal that Bases is the strategic API for both humans and agents. TaskNotes (a major Obsidian task-management plugin) now *requires* the Bases core plugin and ships every view as a `.base` file.

3. **Dataview is in maintenance; Datacore is its slow successor; Bases is winning on performance and UX.** Practitioners report Bases rendering "nearly instantly" on 50,000-note vaults where Dataview seriously degrades performance, especially on mobile. Datacore promises an interactive, indexed successor but has been "in development for years" and introduces yet another syntax. The pragmatic call: migrate Dataview tables to Bases, keep DataviewJS only for queries that genuinely need code, and treat Datacore as optional.

4. **Bases' real architectural limits are well-defined.** From Obsidian Help, DeepWiki, and community write-ups: (a) **YAML-only** — does not parse Dataview-style inline `key:: value`; (b) **no joins or rollups** — relations are simulated by wikilinks in List properties, with no automated lookups; (c) **no scoped sub-queries** — you cannot say "graph the result of *this* base"; (d) **`file.backlinks` is a full-vault scan** — reverse the query and use `file.hasLink()`; (e) **`file.properties` doesn't auto-refresh** — access named properties directly; (f) **complex formulas evaluate per visible row** — use `limit` and prefer cheap predicates; (g) **table-centric** at first, with list/cards/map/calendar/kanban arriving via 1.10 and plugin-contributed view types; (h) **no Publish support yet** (planned); (i) **no persisted index** — every query re-scans, which is fine at 50k notes but a ceiling for 500k+.

5. **The "vault is the database" mental model is the load-bearing insight.** As articulated in *The Architect's Guide to Obsidian Bases* (Chugh) and echoed across the Obsidian forum, Bases inverts the Notion/Airtable model: there are no containers, only views over the entire vault. This is *not* a limitation — it's why cross-context dashboards like "everything I'm currently consuming" or "every CIS control with at least one piece of evidence" are native rather than requiring relation tables.

6. **The cybersader/Crosswalker context implies a GRC/compliance-grade requirement set.** Public README excerpts make the goals explicit: turn Obsidian into "a full-fledged GRC database," support evidence ↔ control mappings with metadata-on-the-link (e.g., `framework_here:: [CIS 1.1](...) {"reviewer":"Person","status":"covered"}`), and even speculate about a CRDT-based reconciler for filesystem sync issues. This is materially harder than personal PKM: it implies referential integrity, audit trails, multi-user concurrency, and machine-readable relations — exactly the places Bases is weakest today and where an **architecture** (rather than just "use Bases") is needed.

## Details

### 1. Restating the challenge from first principles

A "query layer architecture" answers four questions for a notes-as-database system:

1. **What is the storage substrate, and what is its grain?** (Files? Blocks? Rows?)
2. **What is the schema, and where does it live?** (Out-of-band? In-line? Inferred?)
3. **What is the query model, and how is it evaluated?** (Pull? Push? Indexed? Scanned?)
4. **What is the view/write contract?** (Read-only? Editable? Eventually consistent?)

Obsidian's answers, with Bases as the query layer, are:

| Concern | Obsidian answer | Architectural consequence |
|---|---|---|
| Storage grain | One Markdown file per record | Files are diffable, syncable, portable, and survive every tool change. Blocks-as-records (Logseq, Anytype) lose this. |
| Schema | YAML frontmatter, optionally typed via the Properties core plugin | Schema is *implicit* and *per-note*. Drift is the #1 risk. |
| Query model | Bases `.base` files with filter/formula/property/view sections, evaluated on every render against in-memory metadata cache | Cheap reads, no joins, no persisted index, no transactional writes |
| Write contract | The note file is the write target; Bases edits properties in place | Bases is *partially* a write surface (editable cells), but the source of truth is still the `.md` file |

This frames the architecture problem: **how do you build durable, scalable, agent-friendly knowledge systems on a substrate that has no joins, no real index, and no schema enforcement?**

### 2. First-principles design space

Borrowing standard data-architecture patterns and applying them to a vault:

- **Separation of storage from query (the most important principle).** Markdown files are storage; `.base` files are queries; views are projections. Never let a query format become storage. This is why the Dataview *inline* `::` syntax is a long-term liability — it conflates them — and why Bases' YAML-only stance, although annoying for Dataview migrants, is architecturally correct.
- **Schema-as-code, not schema-by-convention.** A "Master Property Schema" — a single note (or `.json`/`.yaml` file) that lists every legal property, its type, allowed values, and required-vs-optional status — should be the contract that templates, linters, and AI agents enforce. Without it, frontmatter drifts within months and Bases queries silently break.
- **CQRS for vaults.** Treat *writes* (templates, modal forms, AI agents creating notes, the Obsidian editor) and *reads* (Bases views, dashboards, exports, MCP queries) as different surfaces with different ergonomics. TaskNotes already does this: a creation modal writes the file, a `.base` view reads many.
- **Materialized views vs. live views.** Bases evaluates live on every render. For very large vaults, expensive aggregations, or cross-vault reporting, you need an out-of-band materialization step — a nightly script that produces a `_index/` folder of pre-aggregated Markdown notes (or a SQLite/DuckDB sidecar). The principle: keep the canonical data in `.md`; treat the index as a cache that can be rebuilt from scratch.
- **Indexing strategy.** Bases today re-scans on demand with no persisted index. Three escape hatches exist: (a) Datacore's incremental index (still beta), (b) external indexers like the unofficial DuckDB-over-frontmatter or SQLite-over-vault scripts that some power users run, (c) embedding stores for semantic search (the `bitsofchris/augi` pattern). Architecturally, *the index is allowed to be stale and rebuildable*; the vault is not.
- **Relations without joins.** Since Bases has no joins, model relations the way the filesystem already does: as wikilinks in List-typed properties, plus inverse lookups via `file.hasLink(this.file)` filters. For richer relations (link metadata like `{reviewer, status}` from the cybersader Crosswalker example), the cleanest pattern is an **edge note** — a tiny Markdown file per relationship, with frontmatter `from`, `to`, and any edge attributes. This converts every relation into a queryable Base row, gives you audit history via Git, and is portable to any graph DB.
- **Frontmatter as schema, body as content.** Anything you want to query goes in YAML; anything narrative stays in the body. Bases explicitly does not parse note bodies, and that's a feature: it forces you to commit fields you actually care about to a structured place.
- **Query language tradeoffs.** Bases' syntax is a small, declarative DSL (boolean logic, function calls, dot-paths) — closer to a spreadsheet formula than to SQL. This is the right floor: low learning curve, no Turing completeness in the hot path, easy for both novices and AI agents to generate. Dataview's DQL and DataviewJS sit at higher rungs and should be reserved for genuine compute.

### 3. Current state of the art (as of May 2026)

- **Bases (Obsidian core, since 1.9, May 2025).** Now the default. Plugin-defined view types (since 1.10) let community plugins like Graph Explorer Base View, Cards View, and TaskNotes' Kanban/Calendar/Agenda all render any base. CSV-to-Markdown conversion, summary formulas, and group-by are shipped; in-base search, Publish integration, and a CLI surface are on the public roadmap.
- **Dataview** remains the most powerful community query plugin but is in slow decline; the author has signaled Datacore as successor.
- **Datacore** (beta, multi-year development) offers an indexed JSX-driven view system. Useful as an escape hatch, not yet a default.
- **External integrations.** The Obsidian CLI (1.12 roadmap) will let you query views from the terminal. TaskNotes ships an HTTP API and webhooks. The community has converged on MCP servers that expose vault metadata to AI agents (`kepano/obsidian-skills`, augi, billmongan). Bases is the structured surface those agents read.
- **Adjacent ecosystems.** Logseq uses a block-grain DB approach with a built-in query language; Anytype uses an object-typed local-first DB; Notion is fully proprietary. Each trades portability for relational richness. Obsidian + Bases is uniquely "files first, queries second" — which is why it scales to tools and agents the others don't reach.

### 4. Recommended architecture

A **four-layer "vault-as-database" stack** that uses Bases as the default query layer while leaving room to grow:

```
┌─────────────────────────────────────────────────────────────┐
│ LAYER 4 — Views & Automation                                │
│ .base files · plugin views (Kanban/Calendar/Map/Graph) ·    │
│ HTTP API · webhooks · MCP servers · CLI · LLM agents        │
├─────────────────────────────────────────────────────────────┤
│ LAYER 3 — Query / Index                                     │
│ Bases (default) · DataviewJS (escape hatch) · Datacore      │
│ (optional) · external SQLite/DuckDB sidecar (scale) ·       │
│ embeddings store (semantic)                                 │
├─────────────────────────────────────────────────────────────┤
│ LAYER 2 — Storage                                           │
│ One Markdown file per record · YAML frontmatter for fields  │
│ · wikilinks for relations · "edge notes" for typed/         │
│ attributed relations · Git for history · CRDT/SMB for sync  │
├─────────────────────────────────────────────────────────────┤
│ LAYER 1 — Schema (versioned, enforced)                      │
│ Master Property Schema note · Templater templates · linter  │
│ (frontmatter-linter, MetaEdit) · AGENTS.md spec for AI      │
└─────────────────────────────────────────────────────────────┘
```

**Concrete design rules:**

1. **Promote every queryable field to YAML.** No inline `::`, no body parsing, no Dataview-only syntax in canonical notes. If a fact matters for a view, it is a property.
2. **Use canonical, namespaced property names** (`task/status`, `evidence/reviewer`, `control/framework`) defined in the Master Property Schema, so collisions across domains are impossible.
3. **Model relations three ways, with a clear hierarchy.** (a) Plain wikilink in the body for narrative cross-references; (b) wikilink in a List-typed YAML property for queryable relations (e.g., `related_controls: ["[[CIS 1.1]]"]`); (c) **edge notes** when the relation itself has attributes (the Crosswalker `{reviewer, status}` case). Edge notes are tiny `.md` files in `_edges/` with frontmatter like `{type: covers, from: "[[Evidence-123]]", to: "[[CIS 1.1]]", reviewer: "...", status: covered}`. They are queryable from Bases, diffable in Git, and portable to any graph DB.
4. **Make `.base` files first-class artifacts** — version-controlled, named, documented, and treated like SQL views in a database project. Group them under `_views/` (or `Views/` per TaskNotes convention).
5. **Keep an out-of-band index for scale and analytics.** A scheduled script that walks the vault and writes a SQLite or DuckDB file, plus an optional embedding store, gives you joins, full-text search, semantic search, and cross-vault queries — without making the vault depend on them. The vault is canonical; the index is rebuildable.
6. **CQRS the writes.** Use Templater + a property-aware modal (TaskNotes-style) for human writes; expose a small HTTP/MCP write API for agents that *only* knows how to create well-formed notes from a schema; never let agents free-write frontmatter.
7. **Pin Bases to its strengths and route around weaknesses.** Use Bases for filtered tables, kanban, calendar, simple aggregations; reach for DataviewJS only when you need imperative compute (rollups, complex joins); reach for an external index only when you genuinely cross the 100k-note or multi-vault boundary.
8. **Design for agents from day one.** Ship an `AGENTS.md` and a `SCHEMA.md` so any LLM (Claude, ChatGPT, local) can read the contract and emit valid notes and `.base` queries. Bases' small, declarative DSL is the right surface for LLMs to generate — much safer than free-form code.
9. **Plan migrations, not lock-in.** Because everything lives in `.md` + YAML, migration to Logseq, Anytype, or a future tool is mostly a property-rename problem. `.base` files are Obsidian-specific *but cheap to rewrite*; they encode views, not data.
10. **Test queries.** A `_views/_smoketests/` folder with representative bases that should always return non-empty results catches schema drift the moment it happens.

### 5. Long-term considerations

- **Portability dominates feature richness over a 10-year horizon.** Markdown + YAML has outlived a half-dozen note-app generations; Notion blocks and Roam blocks have not. Any architecture that compromises file-grain storage to gain Bases features is the wrong trade.
- **Schema evolution is the silent killer.** Plan for property renames (`status` → `task/status`), type changes (string → enum), and deprecations. Treat the Master Property Schema like a database migration log; keep an `_archive/` of deprecated names.
- **Scale ceiling.** Bases handles 50k notes briskly today; expect a soft ceiling around 100–500k notes per vault before you must split vaults or move to an external index. The architectural answer is *vault federation* (multiple vaults indexed together by an out-of-band tool), not a bigger Bases.
- **Plugin-ecosystem dependency risk is now lower for Bases than for Dataview** — Bases is core, Dataview is a single-maintainer community plugin. But your architecture should still survive losing any one plugin. Test by asking: *"If Obsidian disappeared tomorrow, what would I still have?"* If the answer is "all my notes plus a schema doc," you're safe.
- **Concurrency and collaboration.** The cybersader notes flag CRDT reconciliation for SMB-shared vaults; Obsidian Sync handles the single-user multi-device case but not real-time multi-user. Long-term, expect the CRDT path (or `git`-style merge tooling) to be the right answer; design relations so that two users editing the *same* edge note is rare (prefer per-relation edge notes over big List properties).
- **AI agents are now first-class clients.** The right architecture treats them symmetrically with humans: same schema, same write API, same view layer. The `kepano/obsidian-skills` + MCP pattern is the leading indicator.
- **Interoperability.** Frontmatter is the universal lingua franca: Logseq reads it, Quartz/digital gardens publish it, GitHub renders it. `.base` files don't travel; designs that treat them as views (re-derivable) rather than data (canonical) avoid the trap.

### 6. Open questions and risks

- **No persisted Bases index.** Re-scan-per-render is fine today but caps vault size and view density. Likely fixed in future Obsidian versions; until then, lean on `limit`, cheap predicates, and avoid `file.backlinks`.
- **No joins / rollups.** Edge notes mitigate but require discipline. A future Bases or Datacore feature may make this native; design relations so they can be promoted later.
- **`.base` file portability.** Today, only Obsidian reads them. If portability of *views* (not just data) matters, keep a sibling description in plain Markdown so the queries can be re-implemented anywhere.
- **Schema drift in multi-author vaults.** Without enforced templates and a linter, properties decay. Invest early in tooling here — it pays back forever.
- **AI agents over-writing frontmatter.** Without guardrails (an HTTP API that validates against the schema), agents will invent properties and break Bases. Treat AI writes as untrusted input; validate at the door.
- **Bases beta velocity.** The plugin is changing fast (1.9 → 1.10 had breaking formula changes). Pin views, write smoketests, and expect to migrate again at least once before Bases stabilizes.

## Recommendations

**Stage 1 — Foundation (do now, weeks 1–2):**

- Enable Bases (core), Properties (core), and Templater (community).
- Author `SCHEMA.md` (Master Property Schema) and `AGENTS.md` (agent contract).
- Convert all queryable inline `::` fields to YAML; commit to YAML-only for new notes.
- Move existing Dataview tables to `.base` files; keep DataviewJS only where genuinely needed.
- Stand up `_views/` for `.base` files and `_edges/` for typed relations.

**Stage 2 — Scale & agents (weeks 3–8):**

- Add a frontmatter linter to CI (e.g., `obsidian-linter` or a custom pre-commit hook).
- Adopt the TaskNotes pattern for any task-shaped data: every view is a `.base`, every write goes through a typed modal.
- Stand up an MCP server (or use `kepano/obsidian-skills`) so agents query the vault through Bases rather than free-reading files.
- Add `_views/_smoketests/` with bases that must always return rows; fail loudly when schema drifts.

**Stage 3 — Index & federate (only if you cross the threshold):**

- If your vault crosses ~50k notes *and* you feel Bases lag, add an out-of-band SQLite/DuckDB indexer that runs nightly and exposes joins/full-text/analytics.
- If you cross ~100k notes or need cross-vault reporting, federate vaults and query the external index, not Bases.
- Add embeddings only if semantic search is a real workflow, not a buzzword.

**Benchmarks that should change the recommendation:**

- *Bases ships joins / rollups / persisted index* → drop the external SQLite tier; promote Bases to the analytics layer.
- *Datacore reaches stable, with a clear migration story* → re-evaluate as the default for compute-heavy views; keep Bases for simple ones.
- *Vault crosses 100k notes with daily Bases lag > 1s on hot dashboards* → external index becomes mandatory, not optional.
- *Multi-user real-time collaboration becomes a hard requirement* → reconsider Anytype / a CRDT-native substrate; Obsidian's file-grain model is not the right tool for that workload.
- *Obsidian Publish ships `.base` support* → publishable dashboards become viable; reorganize public-facing views accordingly.

## Caveats

- **The original challenge document was not retrievable.** I could not directly read `/agent-context/zz-challenges/27-bases-query-layer-architecture/`; the URL was rejected by the fetcher and returned no search hits, suggesting it is unindexed, unpublished, or behind access controls. The framing above is reconstructed from public cybersader artifacts (Crosswalker README, cyberbase, awesome-obsidian-and-cyber, TaskNotes docs) and may not match every constraint or deliverable the author specified. If a specific output format (e.g., ADR, RFC, decision log) is required by the challenge, this report should be reformatted accordingly.
- **Bases is a moving target.** Specific version numbers, syntax, and limits cited (1.9, 1.10, 1.12 roadmap items, breaking formula changes in 1.9.2) reflect publicly indexed material as of May 2026 and will continue to change.
- **Performance numbers (50k notes "near-instant", Dataview "10–100×" slower) are reported by practitioners**, not benchmarked here. Treat them as directional, not authoritative.
- **The "edge notes" pattern for typed relations is a design recommendation**, not an established Obsidian convention; it is mechanically equivalent to how Crosswalker proposes to encode `{reviewer, status}` on links, but you will not find it in the official Bases docs.
- **Long-term predictions about Datacore, Bases joins, and Publish integration are roadmap-derived**, not promises. Decisions that depend on them should be staged behind the "benchmarks that change the recommendation" triggers above.
- **For cybersecurity GRC use cases specifically** (the apparent driving workload behind cybersader's Obsidian work), a pure-Bases architecture will likely *not* be sufficient for evidence integrity, audit trails, and multi-reviewer concurrency at enterprise scale; plan for the external-index and edge-note tiers from day one rather than retrofitting them.
