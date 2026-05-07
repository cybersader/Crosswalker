---
title: "Ch 27 deliverable A: Crosswalker-specific framing — Hybrid Bases-as-default + Repository escape hatch"
description: "Fresh-agent research deliverable A for Challenge 27 (Bases query layer architecture). Recommends Hybrid (Option 3) — Bases as default read engine + CrosswalkRepository (Repository + Query Object + Specification) as the escape hatch. Hexagonal/Ports-and-Adapters macro layout. Stage migration: lock schema → ship custom Bases view types via registerBasesView → keep internal Repository for queries Bases can't express. Crosswalk mappings as their own notes (edge-as-note). TaskNotes v4 cited as the canonical in-house precedent. Reasoned from adjacent context — challenge page not retrievable to the agent."
tags: [research, deliverable, query-layer, bases, junction-notes, repository-pattern, hexagonal, tasknotes, ch-27]
date: 2026-05-07
sidebar:
  label: "Ch 27a: Crosswalker-specific"
  order: -20260507.1
---

:::tip[Origin and lifecycle]
Fresh-agent research deliverable produced 2026-05-07 in response to [Challenge 27: Bases query layer architecture](/crosswalker/agent-context/zz-challenges/27-bases-query-layer-architecture/). One of three parallel deliverables (A: Crosswalker-specific framing, [B: vault-as-database stack](/crosswalker/agent-context/zz-research/2026-05-07-challenge-27-deliverable-b-vault-as-database-stack/), [C: materialization and codeblock](/crosswalker/agent-context/zz-research/2026-05-07-challenge-27-deliverable-c-materialization-and-codeblock/)). Reasoned from adjacent public context (Crosswalker README, TaskNotes documentation, public Bases API) — agent reports the challenge page itself was not retrievable. Preserved verbatim.
:::

## TL;DR

- **The right architectural bet is to make Obsidian's first-party Bases the canonical query layer for Crosswalker, treat each `.base` file as a "view-spec" over plain-Markdown data, and confine plugin code to (a) a thin domain service that writes/normalizes frontmatter, (b) registered custom Bases view types (`crosswalkerCrosswalkTable`, `crosswalkerCoverageMatrix`, `crosswalkerEvidenceMap`, etc.) via `registerBasesView`, and (c) a small, testable property/projection contract — exactly the pattern that TaskNotes v4 used to delete "thousands of lines of bespoke filtering logic."** The challenge page itself was not retrievable (the static site rejected fetch/search lookups), so the recommendations below are derived from the broader Crosswalker/Cybersader project context, the public Bases API surface, and proven query-layer patterns.
- **The single biggest long-term risk is *coupling the domain model to a specific query engine*.** Bases is fast, native, and visual, but it is YAML-only, table/cards-first, has no public results API for non-view consumers (an open feature request as of late 2025), and exposes only filter/sort/group/formula primitives — not joins, not many-to-many traversal, and not a stable plugin-extensible function library. Crosswalker's core problem (mapping controls across frameworks with weighted, many-to-many edges + evidence) will outgrow pure Bases unless you abstract the query layer behind a Repository/Specification boundary and treat Bases as one of two interchangeable read paths.
- **Recommendation: adopt a layered "frontmatter-as-truth, Bases-as-default-view, Repository-as-escape-hatch" architecture** — Hexagonal/Ports-and-Adapters at the macro level, Repository + Specification + Query Object at the micro level, with `.base` files acting as user-editable "saved queries" (CQRS read side) and a TypeScript domain service as the write side. Stage migration in three steps: (1) lock the YAML schema and field-mapping contract, (2) ship custom Bases view types for the crosswalk-specific layouts, (3) keep an internal `CrosswalkRepository` that can fall back to MetadataCache scans (and later Datacore or DuckDB-WASM) for queries Bases can't express.

## Key Findings

### 1. The Crosswalker project context (what this challenge sits inside)

Crosswalker is part of @cybersader's broader "Obsidian-as-GRC-database" thesis. The public artifacts paint a consistent picture:

- **Crosswalker (the tool)**: described in `cybersader/awesome-obsidian-and-cyber` as "*a tool for crosswalking cybersecurity frameworks and translating them into an Obsidian vault*" with alternate names *LavaLinker* and *Frameworker* — explicitly framed as "*step 1 of turning Obsidian into a full-fledged GRC database*."
- **The data model is link-with-metadata**: the README example proposes evidence-to-control links of the form `framework_here:: [CIS 1.1](../CIS 1.1.md) {"reviewer": "Person", "status":"covered"}`. That is, the project's primary entity is *not* a note — it is a **typed, attributed edge between notes**, with controls, evidence, frameworks, and reviewers as the nodes.
- **Sibling projects converge on the same pattern**: `cybersader/tasknotes` (a fork/companion of `callumalpass/tasknotes`) and `cybersader/obsidian-folder-tag-sync` show the author's preferred architecture: plain-Markdown + YAML frontmatter as the source of truth, declarative configuration, and AI-assisted refactoring. The TaskNotes v4 release (which migrated *every* view to Bases and is documented at `cybersader.github.io/tasknotes/`) is the most relevant in-house precedent.
- **The agent-context site (`cybersader.github.io/crosswalker/agent-context/`) and challenge page #27 were not directly retrievable** from public search/fetch endpoints during this research session — the URL is reachable in a browser but is not in any search index reachable to the agent, so the challenge text itself could not be quoted. The analysis below reasons from the surrounding artifacts and from how a "Bases query layer architecture" challenge inevitably manifests in this stack.

### 2. What "Bases" actually is, technically

From Obsidian's official docs and the v1.10+ TypeScript API:

- A `.base` file is a YAML document with five top-level sections: `filters`, `formulas`, `properties`, `views`, and `summaries`. Filters are recursive `and` / `or` / `not` trees over property comparisons (`==`, `!=`, `<`, `>`, `contains()`).
- Properties come in three flavors: `note.*` (frontmatter), `file.*` (built-in metadata: `name`, `path`, `mtime`, `tags`), and `formula.*` (computed). **Inline Dataview-style fields are not indexed by Bases** — only YAML frontmatter is.
- Plugins extend Bases through **`registerBasesView(viewId, { name, icon, factory, options })`**, where `factory(controller, containerEl)` returns a subclass of `BasesView` (extends `Component`). The view receives a `QueryController` and reacts to `onDataUpdated()` with `this.data.data` (an array of `BasesEntry`) and `this.data.groupedData`.
- **Bases has no public read API outside of a registered view.** A standing forum request ("Provide API access to the results of Bases view," #110660) explicitly asks for this; until it lands, *anything that needs the result set must be implemented as a Bases view*.
- A second forum request ("Bases: API for plugins to add custom functions," #109612) confirms the formula/function library is *not* yet plugin-extensible.
- Bases supports **virtual scrolling** in custom views (TaskNotes demonstrates 30,000+ rows) and **embeds** in markdown/canvas with a `this.file` context for sidebar/backlink-style queries.

### 3. The TaskNotes v4 precedent — the most important data point

TaskNotes v4 (releases through 4.0.1) is, in effect, a successful real-world experiment of "delete the bespoke query layer; let Bases own it":

- *"Moving everything to Bases allowed us to delete thousands of lines of bespoke filtering logic, state management, and widget code."*
- Every view (Task List, Kanban, Calendar, Mini Calendar, Agenda, Relationships widget) is a `.base` file in `TaskNotes/Views/`. The plugin **registers four custom Bases view types**: `tasknotesTaskList`, `tasknotesKanban`, `tasknotesCalendar`, `tasknotesMiniCalendar`.
- Configuration moved out of plugin settings JSON and into vault-versioned YAML; the v3 `FilterBar` UI was removed entirely.
- Sorting semantics changed (numeric weights → alphabetical), which forced *workarounds* like prefixing values (`1-urgent`, `2-high`). This is the canonical example of what you give up when you hand semantics to the engine.
- An internal `FilterService` shrank dramatically; the architecture guidelines repo still describes a layered split — `views/` (ItemView), `ui/` (dumb components), `services/` (TaskService, FilterService, PomodoroService), `editor/`, `utils/` — which is a clean Hexagonal/DDD layout that *survived* the Bases migration. The lesson: **the service layer and write path stayed intact; only the read/render path was outsourced to Bases.**

### 4. Industry analogues for the architectural choice

- **Airtable / Notion model**: data + view config tightly coupled, but views are first-class, persistable, shareable. Bases mirrors this — `.base` files are the equivalent of an Airtable saved view, except the underlying "table" is not a container but a query over the whole vault. Kabir Chugh's "Architect's Guide to Obsidian Bases" frames this well: *"the entire vault is the database; a `.base` file is not a database but a 'vault views container'."* This is the **inverted-silo** model.
- **PostgREST / Hasura / Supabase**: expose a stable schema-driven query layer (REST/GraphQL) over a relational store. Their lesson for Crosswalker is the **schema contract**: every consumer should depend on a versioned, documented property schema, not on ad-hoc field names.
- **CockroachDB SQL layer**: parser → AST → cost-based optimizer → physical planner → executor. Bases occupies the "executor + physical planner" slot only; Crosswalker must own the "schema + semantic" slot.
- **Repository pattern (Fowler PoEAA)**: encapsulates query logic behind a domain interface. Modern critique (Steven Giesel, Jimmy Bogard, CodeOpinion) argues Repositories often duplicate ORM functionality and should be replaced — or augmented — by **Query Objects** (one class per named query) and the **Specification pattern** (composable predicates). For Crosswalker this maps cleanly: the Bases YAML *is* a serialized Specification; a Crosswalker `CrosswalkRepository` should expose **named queries** (`getCoverageMatrix(framework_a, framework_b)`, `getEvidenceForControl(controlId)`) rather than a generic `findAll(filter)`.
- **CQRS**: the read model and write model diverge. In Crosswalker, *writes* are atomic frontmatter edits to controls/evidence/edge notes; *reads* are aggregated coverage matrices, gap reports, and reviewer queues. Bases is a perfect CQRS read side; it is a poor write side.
- **FoundationDB Record Layer FAQ** is instructive on what query layers *don't* give you cheaply: arbitrary aggregation, sorting that requires spilling, and joins. Bases inherits these limits.

### 5. The first-principles problem statement (what Crosswalker really needs)

Reduced to fundamentals, Crosswalker must answer:

1. **Is *X* covered by my evidence under framework *Y*?** (control × framework × evidence-status pivot)
2. **Where do controls in framework *A* map to controls in framework *B*?** (many-to-many edge query, weighted)
3. **What evidence is stale / missing / contested?** (status + reviewer filter, due-date logic)
4. **What changed between two framework versions?** (schema evolution, diff)
5. **Show me everything traceable from this evidence note** (graph traversal, n-hop)

Bases handles #1 and #3 well, partially handles #2 (single-hop only, no native edge entity), and is weak at #4 (no diff primitive) and #5 (no graph traversal — `file.hasLink(this.file)` is single-hop).

## Details

### A. Three viable architectures, evaluated

**Option 1 — Bases-only (TaskNotes v4 style).** Every view is a `.base` file; Crosswalker registers 3–6 custom view types via `registerBasesView`; the plugin is mostly a write-service plus a UI shell.

| Pros | Cons |
|---|---|
| Native performance, zero startup cost | No way to query Bases results from outside a view (today) |
| User-editable configuration in vault | Sort/filter semantics are Obsidian's, not yours |
| Deletes huge amounts of bespoke code (TaskNotes proved this) | Many-to-many edges (control↔control mappings) require flattening into per-edge notes |
| Rides the upgrade wave of Bases improvements | Plugin can't add custom *functions* yet (open API request) |
| Inspectable, version-controllable views | Inline Dataview fields not indexed |

**Option 2 — Custom in-plugin engine (TaskNotes v3 style).** Build a `FilterService` over `MetadataCache`, render with a bespoke `FilterBar`, persist views in plugin settings.

| Pros | Cons |
|---|---|
| Full control over semantics, joins, traversal | TaskNotes literally deleted this in v4 because it was unsustainable |
| Can support many-to-many natively | Reinvents wheels Obsidian now ships |
| Independent of Bases roadmap | Settings JSON is not user-editable in the vault |

**Option 3 — Hybrid (RECOMMENDED).** Bases owns the default read path; an internal `CrosswalkRepository` (Repository + Query Object) owns the *domain* read path used by anything Bases can't express today (graph traversal, diffs, exports, the future HTTP API). Both read from the same MetadataCache; both depend on the same versioned property schema; the write path is unified.

### B. Concrete component blueprint (Hexagonal layout)

```
src/
  domain/                      # framework-agnostic
    entities/                  # Control, Framework, Evidence, Crosswalk, Reviewer
    schema/                    # Master Property Schema (versioned)
    specifications/            # Composable predicates: ByFramework, Covered, Stale...
    queries/                   # Named query objects: CoverageMatrix, GapReport, EdgeTraversal
  ports/
    QueryPort.ts               # interface CrosswalkRepository
    WritePort.ts               # interface CrosswalkWriter
    NotificationPort.ts
  adapters/
    bases/                     # Bases custom views + .base template generators
      CrosswalkTableView.ts    # registerBasesView('crosswalkerCrosswalkTable', ...)
      CoverageMatrixView.ts
      EvidenceMapView.ts
      MappingsRelationshipView.ts
      defaultBaseFiles.ts      # creates Crosswalker/Views/*.base on first run
    obsidian/
      MetadataCacheAdapter.ts  # implements QueryPort for non-Bases consumers
      FrontmatterWriter.ts     # implements WritePort via fileManager.processFrontMatter
    http/                      # future REST API (mirror TaskNotes' optional HTTP layer)
  services/
    CrosswalkService.ts        # CRUD for edges + evidence
    FieldMapper.ts             # user-renamable property keys (deadline vs due, etc.)
    SchemaMigrator.ts
  plugin/
    main.ts                    # onload: registerBasesView * N, register commands, ensure default .base files
```

This mirrors the TaskNotes guideline doc nearly verbatim (Views / UI / Services / Editor / Utils) but adds an explicit **Ports** layer so the query side is not hard-bound to Bases.

### C. Schema contract — the single most important long-term decision

Both the Crosswalker README and the Cybersader Obsidian-bases blog post point to the same conclusion: **the value of the system is the discipline of the YAML schema**, not the engine. Specific decisions to lock down now:

- **Entity discriminator**: every note carries `type: control | framework | evidence | crosswalk | person`. Bases filters become trivial (`note.type == "control"`).
- **Controls** carry `framework`, `control_id`, `version`, `family`, `weight`, `tags`.
- **Crosswalk edges as their own notes** (recommended over inline link metadata): `type: crosswalk`, `source_control: [[NIST 800-53 AC-1]]`, `target_control: [[ISO 27001 A.5.1]]`, `relation: equivalent|partial|superset`, `confidence: 0.0–1.0`, `reviewer`, `status`. This makes many-to-many natively queryable in Bases (each edge is a row) and avoids the "links carry metadata" trap that the Crosswalker README itself flags as awkward.
- **Evidence** carries `covers: [[control1]], [[control2]], ...`, `status`, `last_reviewed`, `expires`, `owner`.
- **Field mapping**: copy TaskNotes' pattern — let users rename property keys without forking the plugin. The `FieldMapper` is the only place in code that knows the user's actual keys.
- **Schema versioning**: `schema_version: 1` on every note + a `SchemaMigrator` that can rewrite frontmatter in batch. Bases queries should never reference fields that aren't in the schema doc.

### D. What each canonical query looks like in this design

| Question | Implementation |
|---|---|
| "Coverage of NIST 800-53 by my evidence" | `crosswalker-coverage.base` filtering `note.type == "control" and note.framework == "NIST 800-53"`, with a `covered` formula counting backlinks from evidence notes |
| "Map NIST → ISO 27001" | `note.type == "crosswalk" and note.source_framework == "NIST 800-53" and note.target_framework == "ISO 27001"`; rendered via custom `crosswalkerCoverageMatrix` view |
| "Gaps + stale evidence" | `note.type == "evidence" and (note.status == "missing" or note.last_reviewed < date(today) - days(180))` |
| "Show me everything reachable from this evidence (n-hop)" | **Not a Bases query.** Goes through `CrosswalkRepository.traverse(noteId, depth)` over MetadataCache resolved-links; returned to a custom Obsidian ItemView (not a Bases view) |
| "Diff frameworks v1 vs v2" | Domain service over Git history + schema migrator; not a query at all |

### E. Migration path

**Stage 0 (lock the contract).** Publish the Master Property Schema as a `SCHEMA.md` in the vault template. Add a JSON Schema for editor validation. No code changes yet — this is the highest-leverage step.

**Stage 1 (Bases-first views).** Implement `registerBasesView` for `crosswalkerCrosswalkTable`, `crosswalkerCoverageMatrix`, and `crosswalkerEvidenceMap`. Ship default `.base` files via a "Create default files" command (TaskNotes pattern). Move existing UI behind those views.

**Stage 2 (Repository escape hatch).** Implement `CrosswalkRepository` over MetadataCache for the queries Bases can't express (traversal, diffs, exports). All commands and the future HTTP API consume the Repository, never raw MetadataCache. Bases views may also call into the Repository for domain-specific buttons (e.g., "promote to covered").

**Stage 3 (extensibility).** Once the Bases plugin API ships custom functions (forum #109612), register Crosswalker-specific functions (`crosswalker.coverage(framework)`). Once the results-API ships (#110660), allow other plugins to consume Crosswalker bases.

**Stage 4 (scale).** If vaults grow past Bases' comfortable working set (TaskNotes hits 30k via virtual scrolling), evaluate Datacore or DuckDB-WASM behind the same Repository port. The domain layer doesn't change.

### F. Tradeoffs to accept consciously

- **You give up custom sort weights** (TaskNotes' `1-urgent` workaround proves this). Bake the workaround into your default schema (`P1-Critical`, `P2-High`).
- **You give up inline Dataview fields**. Frontmatter only. Document it.
- **You give up rendering images in the default Bases table** (per practicalpkm.com review). Custom view types can render whatever you like; default views cannot.
- **Bases is still beta-adjacent and changes**. Your `BasesView` subclass will need maintenance. Pin to `apiVersion`, run a smoke-test view registration on `onload`, and degrade gracefully (`if (!this.registerBasesView(...)) showBasesNotEnabledNotice()`).
- **No public results API today** means no Bases-driven HTTP export. Either wait, or render the view + scrape the QueryController inside your view subclass and re-emit (TaskNotes does this for its HTTP API).

## Recommendations

1. **Adopt the Hybrid (Option 3) architecture immediately.** Treat Bases as the default read engine and a `CrosswalkRepository` (Repository + Query Object + Specification) as the abstraction Crosswalker code depends on. *Trigger to revisit:* if Bases ships a public results API and a plugin function API, collapse the Repository into a thin wrapper.

2. **Publish and freeze a v1 Master Property Schema before writing more view code.** Include the entity discriminator (`type:`), versioned `schema_version`, and the crosswalk-edge-as-note convention. *Trigger to revisit:* major framework additions (e.g., adopting OSCAL) — bump to `schema_version: 2` and ship a `SchemaMigrator`.

3. **Model crosswalk mappings as their own notes, not as link-attached metadata.** This is a reversal of the original Crosswalker README sketch, but it is the only way to get many-to-many edges into a Bases-native query model and aligns with how TaskNotes models task↔project relationships. *Trigger to revisit:* if Obsidian ever ships first-class typed links with queryable attributes (long-standing forum #6994), reconsider.

4. **Register 3–5 custom Bases view types**, not one. Start with `crosswalkerCrosswalkTable`, `crosswalkerCoverageMatrix`, `crosswalkerEvidenceMap`. Ship default `.base` files via a "Create default Crosswalker views" command, and let users edit them.

5. **Mirror TaskNotes' v3→v4 reduction discipline.** Every time you find yourself implementing a filter UI, ask: "could this be a `.base` file the user edits?" Default to yes. Preserve the write-path service layer (`CrosswalkService`, `FieldMapper`) — that is *not* what Bases replaces.

6. **Stand up an HTTP API + webhook surface early** (TaskNotes pattern), even if minimal. This forces the Repository abstraction to be real and unblocks AI-agent / external-GRC-tool integration — directly aligned with the Cybersader project's "Obsidian as full GRC database" thesis.

7. **Document escape hatches.** A `docs/queries-bases-cant-do.md` that lists the queries the Repository handles instead. This both manages user expectations and serves as the spec for the inevitable Datacore/DuckDB-WASM evaluation.

8. **Set explicit performance budgets**: views <200 ms first paint up to 5k entries; virtual-scroll above that; treat any vault with >50k notes as the threshold to test alternative backends. (TaskNotes proved 30k is fine on Bases with virtual scrolling.)

## Caveats

- **The primary source URL (`cybersader.github.io/crosswalker/agent-context/zz-challenges/27-bases-query-layer-architecture/`) was not retrievable** during this research — the static-site host returned permission errors to both `web_fetch` and was absent from search indexes. The challenge's exact prompt, constraints, and any acceptance criteria the author specified are therefore *not quoted*. The analysis is reconstructed from: (a) the Crosswalker project description in `cybersader/awesome-obsidian-and-cyber`, (b) the closely related `cybersader.github.io/tasknotes/` documentation site (which the author maintains), (c) the TaskNotes v3→v4 architecture migration as an in-house precedent, and (d) the public Obsidian Bases API surface.
- **Bases is a moving target.** Statements about its API (no public results API, no plugin-extensible functions) reflect the state as of late 2025 / Obsidian 1.10–1.12. The two Obsidian-forum feature requests cited (#109612, #110660) are open, not shipped — treat any architecture that *depends* on them as speculative.
- **TaskNotes' "delete thousands of lines" claim is the developer's own framing** in the 4.0.1 release notes; it is consistent with the visible diff (FilterBar removed, FilterService shrunk) but is a self-report, not an independent measurement.
- **"Crosswalker" is a name shared by at least three projects** (Cybersader's Obsidian tool, Washington Post's text-join utility, and Crosswalkersam's RF hardware repo). Sources here have been filtered to the Cybersader project; do not conflate with the WaPo tool, which is a single-purpose CSV-matcher and architecturally unrelated.
- **The recommendation to model crosswalks as edge-notes contradicts the original Crosswalker README sketch** (which proposed link-attached metadata like `framework_here:: [CIS 1.1](...) {...}`). This is a deliberate, opinionated reversal grounded in what Bases can actually query; reasonable people could disagree, especially if Obsidian ships typed-link metadata.
- **No code from the Crosswalker repository itself was inspected** in this research — only its README descriptions in adjacent repos. If the codebase already commits to a different architecture (e.g., a Datacore-style engine), Stage 0–1 of the migration plan should be re-scoped to "absorb existing services into the Repository port" rather than greenfield.
