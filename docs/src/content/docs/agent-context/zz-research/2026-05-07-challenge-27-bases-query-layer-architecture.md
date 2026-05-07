---
title: "Ch 27 — Bases query layer architecture (research deliverables)"
description: "Two fresh-agent research deliverables for Challenge 27 (Bases query layer architecture). Both reasoned from adjacent context — neither could fetch the challenge page directly. Both converge on a hybrid Bases-as-default-view + Repository-as-escape-hatch architecture. Both validate junction-notes (edge-as-note) as the right pattern for typed relations. Both miss specific Crosswalker context (Tier 2 SQL helpers already shipped in v0.1.5 P3; closure cache; junction-note-subject-string problem). Captured 2026-05-07 for review; Ch 28 follow-on may be needed."
tags: [research, query-layer, bases, junction-notes, tier-2, hybrid-architecture, deliverable, ch-27]
date: 2026-05-07
sidebar:
  label: "05-07 · Ch 27 deliverables"
  order: -20260507.1
---

## Editorial prelude (not part of the deliverables)

Two independent research sessions were run against [Challenge 27 — Bases query layer architecture](/crosswalker/agent-context/zz-challenges/27-bases-query-layer-architecture/) on 2026-05-07. Both deliverables are preserved verbatim below. Neither could fetch the challenge page directly (both flag this in their Caveats sections), so both reasoned from **adjacent public context** — the Crosswalker README, the `cybersader/awesome-obsidian-and-cyber` repo, the `cybersader.github.io/tasknotes` documentation, and the public Obsidian Bases API surface — rather than from the specific 7 investigation areas Ch 27 asks about.

**That gap matters.** This research page documents what the deliverables converge on, what they miss, and where a follow-on challenge (Ch 28?) may be needed.

### What both deliverables converge on (high-confidence inputs to the synthesis log)

1. **Hybrid architecture is the right answer.** Bases as the default read/view path; an internal Repository (or Tier 2 SQL layer) as the escape hatch for queries Bases can't express. Both reject "Bases-only" and "custom plugin-only" as sufficient.
2. **The schema contract is more important than the engine.** A versioned Master Property Schema enforced by templates + linters is the load-bearing decision. Engine choices (Bases / Datacore / DuckDB-WASM) are interchangeable behind a stable schema.
3. **Edge-as-note (junction notes) is validated.** Both independently arrive at this pattern as the right way to model typed/attributed relationships. This **matches what Crosswalker already shipped via `kind: junction-note` + `kind: crosswalk-edge` in v0.1.4** — neither deliverable realized this.
4. **`registerBasesView` is the integration mechanism.** Custom Bases view types can be registered by plugins; they receive a `QueryController`; they render whatever data they want. **This is the most actionable insight** — and Ch 27's Pattern C ("custom plugin views") wasn't framed clearly enough in the brief; the deliverables clarify that custom views remain *Bases-native* (registered via the core Bases plugin's API), not separate panes.
5. **TaskNotes v4 is the canonical precedent.** Migrated entire view layer to Bases; deleted thousands of lines of bespoke filter UI; preserved the service layer. Both deliverables draw heavily on this. **Worth investigating directly** — the `cybersader.github.io/tasknotes` site contains the architecture documentation.
6. **CQRS for vaults.** Writes go through typed modals/commands; reads go through Bases (default) or Repository (escape hatch). Both deliverables agree.
7. **Bases' real limits are well-defined and stable.** YAML-only (no inline `::`); no joins; no recursion; no rollups across linked notes; no anti-joins; no public Bases-results API outside a registered view. Future Obsidian versions may close some gaps but not all.

### What both deliverables MISS (gaps the synthesis log must address)

1. **Tier 2 SQL helpers are already shipped.** [v0.1.5 Phase 3](/crosswalker/agent-context/zz-log/2026-05-06-v0-1-5-tier-2-sidecar-shipped/) shipped `plugin.queryConcepts` / `queryCrosswalk` / `queryClosure` plus a lazy closure cache via recursive CTE. Both deliverables propose building "an internal Repository" or "external SQLite/DuckDB sidecar" — but **we already have it.** The architecture decision becomes "how do `registerBasesView` custom views call the existing SQL helpers" — not "how do we build a Repository."
2. **The junction-note-subject-string problem is unanswered.** [Ch 27 §6](/crosswalker/agent-context/zz-challenges/27-bases-query-layer-architecture/) asks specifically how `junction_notes.subject` (a wikilink-target string) resolves to a concept's CURIE. Three options were laid out: string LIKE / `metadataCache.resolveLink` / projector pre-resolution. Neither deliverable addresses this. **This is a load-bearing implementation detail** for any "controls without evidence" or "evidence per control" query.
3. **The recipe-driven query emission API is unaddressed.** [Ch 27 §4](/crosswalker/agent-context/zz-challenges/27-bases-query-layer-architecture/) asks what fields recipe authors use to declare body queries (e.g., `also_emit.body.queries`). Neither deliverable proposes a concrete API. Deliverable 2 mentions "smoketest views" but not how recipes emit them automatically.
4. **The closure cache architecture isn't engaged.** Both deliverables treat queries as point-in-time. Neither addresses how the closure cache (Tier 2's lazy materialization) participates in Bases-rendered views — i.e., does a Bases view that wants transitive-closure data go through `plugin.queryClosure` and benefit from the cache?
5. **Performance worked examples missing.** Ch 27 §5 asks for wall-clock estimates at OLIR-scale (~1000 mappings, ~1000 junctions). Both deliverables wave at "50k notes is fine in Bases" but don't engage with the closure-query specifically.
6. **The query-routing matrix is incomplete.** Ch 27 §1 asks for ~20 user questions × tier × rationale. Deliverable 1 produces a 5-row table; Deliverable 2 produces a 5-row table. Neither is comprehensive.
7. **Scope refinement for v0.1.6 isn't proposed.** Ch 27 §7 asks for an updated v0.1.6 milestone scope based on the architecture choice. Both deliverables stop at "adopt Hybrid"; neither says what's in / out / deferred for v0.1.6 specifically.

### Where Ch 28 (follow-on) might be needed

The deliverables collectively answer **"what's the architectural posture?"** (hybrid, schema-first, junction-notes-as-edges, registerBasesView). They do NOT answer **"what's the v0.1.6 implementation plan?"** Specifically:

| Open question | Whether to defer to v0.1.6 implementation OR write Ch 28 |
|---|---|
| How do `registerBasesView` custom views call `plugin.queryClosure` and pass results to Bases' rendering pipeline? | Worked example needed; could be Ch 28 OR an implementation prototype |
| Junction-note-subject-string resolution decision | Could be resolved in synthesis log; or Ch 28 if we want adversarial review |
| Recipe-emission API for body queries (`also_emit.body.queries` shape) | Worth Ch 28 — this is a recipe schema change |
| OLIR-scale performance worked examples | Could be a v0.1.6 implementation milestone task; or Ch 28 stress test |
| Should the projector pre-resolve wikilinks to CURIEs (schema bump to `tier2-sqlite-v2`)? | Probably worth Ch 28 — schema-version bump implications cascade |

**My read**: Ch 28 is warranted IF you want adversarial review on the recipe-emission API + junction-note-subject-string resolution + closure-cache integration with `registerBasesView`. These three are tightly coupled and a Ch 28 would force the deliverable to engage with them concretely. ALTERNATIVELY: write the synthesis log resolving what's clear (hybrid architecture; registerBasesView pattern; TaskNotes precedent; schema contract priority) and defer the implementation-specific questions to v0.1.6 milestone tasks.

User decision tomorrow: write synthesis log now (Ch 27 partially resolved) + run Ch 28 for the unanswered questions OR defer Ch 28 to surface during v0.1.6 implementation.

---

## Deliverable A — Crosswalker-specific framing

*(Verbatim research output, 2026-05-07. Preserved as historical record.)*

### TL;DR

- **The right architectural bet is to make Obsidian's first-party Bases the canonical query layer for Crosswalker, treat each `.base` file as a "view-spec" over plain-Markdown data, and confine plugin code to (a) a thin domain service that writes/normalizes frontmatter, (b) registered custom Bases view types (`crosswalkerCrosswalkTable`, `crosswalkerCoverageMatrix`, `crosswalkerEvidenceMap`, etc.) via `registerBasesView`, and (c) a small, testable property/projection contract — exactly the pattern that TaskNotes v4 used to delete "thousands of lines of bespoke filtering logic."** The challenge page itself was not retrievable (the static site rejected fetch/search lookups), so the recommendations below are derived from the broader Crosswalker/Cybersader project context, the public Bases API surface, and proven query-layer patterns.
- **The single biggest long-term risk is *coupling the domain model to a specific query engine*.** Bases is fast, native, and visual, but it is YAML-only, table/cards-first, has no public results API for non-view consumers (an open feature request as of late 2025), and exposes only filter/sort/group/formula primitives — not joins, not many-to-many traversal, and not a stable plugin-extensible function library. Crosswalker's core problem (mapping controls across frameworks with weighted, many-to-many edges + evidence) will outgrow pure Bases unless you abstract the query layer behind a Repository/Specification boundary and treat Bases as one of two interchangeable read paths.
- **Recommendation: adopt a layered "frontmatter-as-truth, Bases-as-default-view, Repository-as-escape-hatch" architecture** — Hexagonal/Ports-and-Adapters at the macro level, Repository + Specification + Query Object at the micro level, with `.base` files acting as user-editable "saved queries" (CQRS read side) and a TypeScript domain service as the write side. Stage migration in three steps: (1) lock the YAML schema and field-mapping contract, (2) ship custom Bases view types for the crosswalk-specific layouts, (3) keep an internal `CrosswalkRepository` that can fall back to MetadataCache scans (and later Datacore or DuckDB-WASM) for queries Bases can't express.

### Key Findings

#### 1. The Crosswalker project context (what this challenge sits inside)

Crosswalker is part of @cybersader's broader "Obsidian-as-GRC-database" thesis. The public artifacts paint a consistent picture:

- **Crosswalker (the tool)**: described in `cybersader/awesome-obsidian-and-cyber` as "*a tool for crosswalking cybersecurity frameworks and translating them into an Obsidian vault*" with alternate names *LavaLinker* and *Frameworker* — explicitly framed as "*step 1 of turning Obsidian into a full-fledged GRC database*."
- **The data model is link-with-metadata**: the README example proposes evidence-to-control links of the form `framework_here:: [CIS 1.1](../CIS 1.1.md) {"reviewer": "Person", "status":"covered"}`. That is, the project's primary entity is *not* a note — it is a **typed, attributed edge between notes**, with controls, evidence, frameworks, and reviewers as the nodes.
- **Sibling projects converge on the same pattern**: `cybersader/tasknotes` (a fork/companion of `callumalpass/tasknotes`) and `cybersader/obsidian-folder-tag-sync` show the author's preferred architecture: plain-Markdown + YAML frontmatter as the source of truth, declarative configuration, and AI-assisted refactoring. The TaskNotes v4 release (which migrated *every* view to Bases and is documented at `cybersader.github.io/tasknotes/`) is the most relevant in-house precedent.
- **The agent-context site (`cybersader.github.io/crosswalker/agent-context/`) and challenge page #27 were not directly retrievable** from public search/fetch endpoints during this research session — the URL is reachable in a browser but is not in any search index reachable to the agent, so the challenge text itself could not be quoted. The analysis below reasons from the surrounding artifacts and from how a "Bases query layer architecture" challenge inevitably manifests in this stack.

#### 2. What "Bases" actually is, technically

From Obsidian's official docs and the v1.10+ TypeScript API:

- A `.base` file is a YAML document with five top-level sections: `filters`, `formulas`, `properties`, `views`, and `summaries`. Filters are recursive `and` / `or` / `not` trees over property comparisons (`==`, `!=`, `<`, `>`, `contains()`).
- Properties come in three flavors: `note.*` (frontmatter), `file.*` (built-in metadata: `name`, `path`, `mtime`, `tags`), and `formula.*` (computed). **Inline Dataview-style fields are not indexed by Bases** — only YAML frontmatter is.
- Plugins extend Bases through **`registerBasesView(viewId, { name, icon, factory, options })`**, where `factory(controller, containerEl)` returns a subclass of `BasesView` (extends `Component`). The view receives a `QueryController` and reacts to `onDataUpdated()` with `this.data.data` (an array of `BasesEntry`) and `this.data.groupedData`.
- **Bases has no public read API outside of a registered view.** A standing forum request ("Provide API access to the results of Bases view," #110660) explicitly asks for this; until it lands, *anything that needs the result set must be implemented as a Bases view*.
- A second forum request ("Bases: API for plugins to add custom functions," #109612) confirms the formula/function library is *not* yet plugin-extensible.
- Bases supports **virtual scrolling** in custom views (TaskNotes demonstrates 30,000+ rows) and **embeds** in markdown/canvas with a `this.file` context for sidebar/backlink-style queries.

#### 3. The TaskNotes v4 precedent — the most important data point

TaskNotes v4 (releases through 4.0.1) is, in effect, a successful real-world experiment of "delete the bespoke query layer; let Bases own it":

- *"Moving everything to Bases allowed us to delete thousands of lines of bespoke filtering logic, state management, and widget code."*
- Every view (Task List, Kanban, Calendar, Mini Calendar, Agenda, Relationships widget) is a `.base` file in `TaskNotes/Views/`. The plugin **registers four custom Bases view types**: `tasknotesTaskList`, `tasknotesKanban`, `tasknotesCalendar`, `tasknotesMiniCalendar`.
- Configuration moved out of plugin settings JSON and into vault-versioned YAML; the v3 `FilterBar` UI was removed entirely.
- Sorting semantics changed (numeric weights → alphabetical), which forced *workarounds* like prefixing values (`1-urgent`, `2-high`). This is the canonical example of what you give up when you hand semantics to the engine.
- An internal `FilterService` shrank dramatically; the architecture guidelines repo still describes a layered split — `views/` (ItemView), `ui/` (dumb components), `services/` (TaskService, FilterService, PomodoroService), `editor/`, `utils/` — which is a clean Hexagonal/DDD layout that *survived* the Bases migration. The lesson: **the service layer and write path stayed intact; only the read/render path was outsourced to Bases.**

#### 4. Industry analogues for the architectural choice

- **Airtable / Notion model**: data + view config tightly coupled, but views are first-class, persistable, shareable. Bases mirrors this — `.base` files are the equivalent of an Airtable saved view, except the underlying "table" is not a container but a query over the whole vault. Kabir Chugh's "Architect's Guide to Obsidian Bases" frames this well: *"the entire vault is the database; a `.base` file is not a database but a 'vault views container'."* This is the **inverted-silo** model.
- **PostgREST / Hasura / Supabase**: expose a stable schema-driven query layer (REST/GraphQL) over a relational store. Their lesson for Crosswalker is the **schema contract**: every consumer should depend on a versioned, documented property schema, not on ad-hoc field names.
- **CockroachDB SQL layer**: parser → AST → cost-based optimizer → physical planner → executor. Bases occupies the "executor + physical planner" slot only; Crosswalker must own the "schema + semantic" slot.
- **Repository pattern (Fowler PoEAA)**: encapsulates query logic behind a domain interface. Modern critique (Steven Giesel, Jimmy Bogard, CodeOpinion) argues Repositories often duplicate ORM functionality and should be replaced — or augmented — by **Query Objects** (one class per named query) and the **Specification pattern** (composable predicates). For Crosswalker this maps cleanly: the Bases YAML *is* a serialized Specification; a Crosswalker `CrosswalkRepository` should expose **named queries** (`getCoverageMatrix(framework_a, framework_b)`, `getEvidenceForControl(controlId)`) rather than a generic `findAll(filter)`.
- **CQRS**: the read model and write model diverge. In Crosswalker, *writes* are atomic frontmatter edits to controls/evidence/edge notes; *reads* are aggregated coverage matrices, gap reports, and reviewer queues. Bases is a perfect CQRS read side; it is a poor write side.
- **FoundationDB Record Layer FAQ** is instructive on what query layers *don't* give you cheaply: arbitrary aggregation, sorting that requires spilling, and joins. Bases inherits these limits.

#### 5. The first-principles problem statement (what Crosswalker really needs)

Reduced to fundamentals, Crosswalker must answer:

1. **Is *X* covered by my evidence under framework *Y*?** (control × framework × evidence-status pivot)
2. **Where do controls in framework *A* map to controls in framework *B*?** (many-to-many edge query, weighted)
3. **What evidence is stale / missing / contested?** (status + reviewer filter, due-date logic)
4. **What changed between two framework versions?** (schema evolution, diff)
5. **Show me everything traceable from this evidence note** (graph traversal, n-hop)

Bases handles #1 and #3 well, partially handles #2 (single-hop only, no native edge entity), and is weak at #4 (no diff primitive) and #5 (no graph traversal — `file.hasLink(this.file)` is single-hop).

### Details

#### A. Three viable architectures, evaluated

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

#### B. Concrete component blueprint (Hexagonal layout)

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

#### C. Schema contract — the single most important long-term decision

Both the Crosswalker README and the Cybersader Obsidian-bases blog post point to the same conclusion: **the value of the system is the discipline of the YAML schema**, not the engine. Specific decisions to lock down now:

- **Entity discriminator**: every note carries `type: control | framework | evidence | crosswalk | person`. Bases filters become trivial (`note.type == "control"`).
- **Controls** carry `framework`, `control_id`, `version`, `family`, `weight`, `tags`.
- **Crosswalk edges as their own notes** (recommended over inline link metadata): `type: crosswalk`, `source_control: [[NIST 800-53 AC-1]]`, `target_control: [[ISO 27001 A.5.1]]`, `relation: equivalent|partial|superset`, `confidence: 0.0–1.0`, `reviewer`, `status`. This makes many-to-many natively queryable in Bases (each edge is a row) and avoids the "links carry metadata" trap that the Crosswalker README itself flags as awkward.
- **Evidence** carries `covers: [[control1]], [[control2]], ...`, `status`, `last_reviewed`, `expires`, `owner`.
- **Field mapping**: copy TaskNotes' pattern — let users rename property keys without forking the plugin. The `FieldMapper` is the only place in code that knows the user's actual keys.
- **Schema versioning**: `schema_version: 1` on every note + a `SchemaMigrator` that can rewrite frontmatter in batch. Bases queries should never reference fields that aren't in the schema doc.

#### D. What each canonical query looks like in this design

| Question | Implementation |
|---|---|
| "Coverage of NIST 800-53 by my evidence" | `crosswalker-coverage.base` filtering `note.type == "control" and note.framework == "NIST 800-53"`, with a `covered` formula counting backlinks from evidence notes |
| "Map NIST → ISO 27001" | `note.type == "crosswalk" and note.source_framework == "NIST 800-53" and note.target_framework == "ISO 27001"`; rendered via custom `crosswalkerCoverageMatrix` view |
| "Gaps + stale evidence" | `note.type == "evidence" and (note.status == "missing" or note.last_reviewed < date(today) - days(180))` |
| "Show me everything reachable from this evidence (n-hop)" | **Not a Bases query.** Goes through `CrosswalkRepository.traverse(noteId, depth)` over MetadataCache resolved-links; returned to a custom Obsidian ItemView (not a Bases view) |
| "Diff frameworks v1 vs v2" | Domain service over Git history + schema migrator; not a query at all |

#### E. Migration path

**Stage 0 (lock the contract).** Publish the Master Property Schema as a `SCHEMA.md` in the vault template. Add a JSON Schema for editor validation. No code changes yet — this is the highest-leverage step.

**Stage 1 (Bases-first views).** Implement `registerBasesView` for `crosswalkerCrosswalkTable`, `crosswalkerCoverageMatrix`, and `crosswalkerEvidenceMap`. Ship default `.base` files via a "Create default files" command (TaskNotes pattern). Move existing UI behind those views.

**Stage 2 (Repository escape hatch).** Implement `CrosswalkRepository` over MetadataCache for the queries Bases can't express (traversal, diffs, exports). All commands and the future HTTP API consume the Repository, never raw MetadataCache. Bases views may also call into the Repository for domain-specific buttons (e.g., "promote to covered").

**Stage 3 (extensibility).** Once the Bases plugin API ships custom functions (forum #109612), register Crosswalker-specific functions (`crosswalker.coverage(framework)`). Once the results-API ships (#110660), allow other plugins to consume Crosswalker bases.

**Stage 4 (scale).** If vaults grow past Bases' comfortable working set (TaskNotes hits 30k via virtual scrolling), evaluate Datacore or DuckDB-WASM behind the same Repository port. The domain layer doesn't change.

#### F. Tradeoffs to accept consciously

- **You give up custom sort weights** (TaskNotes' `1-urgent` workaround proves this). Bake the workaround into your default schema (`P1-Critical`, `P2-High`).
- **You give up inline Dataview fields**. Frontmatter only. Document it.
- **You give up rendering images in the default Bases table** (per practicalpkm.com review). Custom view types can render whatever you like; default views cannot.
- **Bases is still beta-adjacent and changes**. Your `BasesView` subclass will need maintenance. Pin to `apiVersion`, run a smoke-test view registration on `onload`, and degrade gracefully (`if (!this.registerBasesView(...)) showBasesNotEnabledNotice()`).
- **No public results API today** means no Bases-driven HTTP export. Either wait, or render the view + scrape the QueryController inside your view subclass and re-emit (TaskNotes does this for its HTTP API).

### Recommendations

1. **Adopt the Hybrid (Option 3) architecture immediately.** Treat Bases as the default read engine and a `CrosswalkRepository` (Repository + Query Object + Specification) as the abstraction Crosswalker code depends on. *Trigger to revisit:* if Bases ships a public results API and a plugin function API, collapse the Repository into a thin wrapper.

2. **Publish and freeze a v1 Master Property Schema before writing more view code.** Include the entity discriminator (`type:`), versioned `schema_version`, and the crosswalk-edge-as-note convention. *Trigger to revisit:* major framework additions (e.g., adopting OSCAL) — bump to `schema_version: 2` and ship a `SchemaMigrator`.

3. **Model crosswalk mappings as their own notes, not as link-attached metadata.** This is a reversal of the original Crosswalker README sketch, but it is the only way to get many-to-many edges into a Bases-native query model and aligns with how TaskNotes models task↔project relationships. *Trigger to revisit:* if Obsidian ever ships first-class typed links with queryable attributes (long-standing forum #6994), reconsider.

4. **Register 3–5 custom Bases view types**, not one. Start with `crosswalkerCrosswalkTable`, `crosswalkerCoverageMatrix`, `crosswalkerEvidenceMap`. Ship default `.base` files via a "Create default Crosswalker views" command, and let users edit them.

5. **Mirror TaskNotes' v3→v4 reduction discipline.** Every time you find yourself implementing a filter UI, ask: "could this be a `.base` file the user edits?" Default to yes. Preserve the write-path service layer (`CrosswalkService`, `FieldMapper`) — that is *not* what Bases replaces.

6. **Stand up an HTTP API + webhook surface early** (TaskNotes pattern), even if minimal. This forces the Repository abstraction to be real and unblocks AI-agent / external-GRC-tool integration — directly aligned with the Cybersader project's "Obsidian as full GRC database" thesis.

7. **Document escape hatches.** A `docs/queries-bases-cant-do.md` that lists the queries the Repository handles instead. This both manages user expectations and serves as the spec for the inevitable Datacore/DuckDB-WASM evaluation.

8. **Set explicit performance budgets**: views <200 ms first paint up to 5k entries; virtual-scroll above that; treat any vault with >50k notes as the threshold to test alternative backends. (TaskNotes proved 30k is fine on Bases with virtual scrolling.)

### Caveats

- **The primary source URL (`cybersader.github.io/crosswalker/agent-context/zz-challenges/27-bases-query-layer-architecture/`) was not retrievable** during this research — the static-site host returned permission errors to both `web_fetch` and was absent from search indexes. The challenge's exact prompt, constraints, and any acceptance criteria the author specified are therefore *not quoted*. The analysis is reconstructed from: (a) the Crosswalker project description in `cybersader/awesome-obsidian-and-cyber`, (b) the closely related `cybersader.github.io/tasknotes/` documentation site (which the author maintains), (c) the TaskNotes v3→v4 architecture migration as an in-house precedent, and (d) the public Obsidian Bases API surface.
- **Bases is a moving target.** Statements about its API (no public results API, no plugin-extensible functions) reflect the state as of late 2025 / Obsidian 1.10–1.12. The two Obsidian-forum feature requests cited (#109612, #110660) are open, not shipped — treat any architecture that *depends* on them as speculative.
- **TaskNotes' "delete thousands of lines" claim is the developer's own framing** in the 4.0.1 release notes; it is consistent with the visible diff (FilterBar removed, FilterService shrunk) but is a self-report, not an independent measurement.
- **"Crosswalker" is a name shared by at least three projects** (Cybersader's Obsidian tool, Washington Post's text-join utility, and Crosswalkersam's RF hardware repo). Sources here have been filtered to the Cybersader project; do not conflate with the WaPo tool, which is a single-purpose CSV-matcher and architecturally unrelated.
- **The recommendation to model crosswalks as edge-notes contradicts the original Crosswalker README sketch** (which proposed link-attached metadata like `framework_here:: [CIS 1.1](...) {...}`). This is a deliberate, opinionated reversal grounded in what Bases can actually query; reasonable people could disagree, especially if Obsidian ships typed-link metadata.
- **No code from the Crosswalker repository itself was inspected** in this research — only its README descriptions in adjacent repos. If the codebase already commits to a different architecture (e.g., a Datacore-style engine), Stage 0–1 of the migration plan should be re-scoped to "absorb existing services into the Repository port" rather than greenfield.

---

## Deliverable B — First-principles broader framing

*(Verbatim research output, 2026-05-07. Preserved as historical record.)*

**Note on KB access:** The specific challenge document at `https://cybersader.github.io/crosswalker/agent-context/zz-challenges/27-bases-query-layer-architecture/` could not be retrieved directly (the fetcher returned a permissions error and the page does not appear in any public search index — likely a private/draft Quartz or MkDocs digital garden, or a path restricted from crawlers). I therefore reconstructed the author's framing from adjacent public artifacts in the cybersader ecosystem (the `cybersader/Crosswalker`, `cybersader/cyberbase`, `cybersader/awesome-obsidian-and-cyber`, and `cybersader.github.io/tasknotes` properties), which collectively show a consistent worldview: turn an Obsidian vault into a "full-fledged GRC/PKM database" by layering structured metadata, relations-via-links, and queryable views on top of plain Markdown — with explicit interest in CRDT reconciliation, Bases, Dataview, Notion-↔-Obsidian sync, and an "agent-context" pattern where the vault is also the substrate that AI agents read and write. The challenge title — "Bases Query Layer Architecture" — fits squarely in that program. This report addresses it on those terms.

### TL;DR

- **Treat Bases as a *view/query layer*, not a *storage layer*.** The vault (Markdown + YAML frontmatter + wikilinks) is the single source of truth; Bases is a read-compute-display pipeline that materializes filtered, computed views. Architect everything else around that separation, because it is the only one that survives Obsidian, Dataview, Datacore, Logseq, Anytype, and any future tool.
- **The right long-term architecture is a four-tier "vault-as-database" stack:** (1) a disciplined **schema layer** (a versioned Master Property Schema enforced by templates and linters), (2) a **storage layer** of atomic Markdown notes with YAML-only structured fields, (3) a **query/index layer** where Bases is the default and Datacore/external indexers (DuckDB, SQLite, embeddings) are escape hatches for what Bases cannot do, and (4) a **view/automation layer** of `.base` files, custom Base view plugins, MCP servers, and HTTP/webhook integrations (the TaskNotes pattern). Read/write is split CQRS-style: humans and agents *write* atomic notes; everything else *reads* projected views.
- **Bet on Bases as the default; keep Dataview/Datacore as a fallback; and never let either become your storage format.** Bases is now a core plugin, ~10–100× faster than Dataview at vault scale, supported by the Obsidian team, extensible via the 1.10 plugin-views API, and increasingly the integration target for ecosystem tools (TaskNotes, Graph Explorer Base View, kepano/obsidian-skills). Its current limits — YAML-only (no inline `::`), no joins/rollups, no scoped sub-queries, no `.base` Publish support yet, expensive `file.backlinks`, no real persisted index — are real but tractable, and most are on the public roadmap.

### Key Findings

1. **Bases is architecturally a query engine over a vault, not a database.** Per Obsidian's own docs and the DeepWiki structural analysis, a `.base` file is a stored YAML query configuration with five sections (filters, formulas, properties, views, source). At runtime it executes a *read → compute → display* pipeline against three property namespaces — note properties (frontmatter), file properties (`file.name`, `file.mtime`, `file.size`, `file.backlinks`, `file.hasLink`), and formula properties (computed in the base). There is **no separate datastore**; the vault *is* the table.

2. **The ecosystem is consolidating around Bases.** Bases shipped as a core plugin in Obsidian 1.9 (2025), gained group-by, map view, list view, summary aggregations, and a plugin-defined view API in 1.10, and the public roadmap lists CSV-to-Markdown conversion, in-base search, and Obsidian Publish support for `.base` files. Steph Ango (Obsidian's CEO) has personally shipped `kepano/obsidian-skills`, an Agent Skills package that teaches AI agents Markdown + Bases + JSON Canvas — a strong signal that Bases is the strategic API for both humans and agents. TaskNotes (a major Obsidian task-management plugin) now *requires* the Bases core plugin and ships every view as a `.base` file.

3. **Dataview is in maintenance; Datacore is its slow successor; Bases is winning on performance and UX.** Practitioners report Bases rendering "nearly instantly" on 50,000-note vaults where Dataview seriously degrades performance, especially on mobile. Datacore promises an interactive, indexed successor but has been "in development for years" and introduces yet another syntax. The pragmatic call: migrate Dataview tables to Bases, keep DataviewJS only for queries that genuinely need code, and treat Datacore as optional.

4. **Bases' real architectural limits are well-defined.** From Obsidian Help, DeepWiki, and community write-ups: (a) **YAML-only** — does not parse Dataview-style inline `key:: value`; (b) **no joins or rollups** — relations are simulated by wikilinks in List properties, with no automated lookups; (c) **no scoped sub-queries** — you cannot say "graph the result of *this* base"; (d) **`file.backlinks` is a full-vault scan** — reverse the query and use `file.hasLink()`; (e) **`file.properties` doesn't auto-refresh** — access named properties directly; (f) **complex formulas evaluate per visible row** — use `limit` and prefer cheap predicates; (g) **table-centric** at first, with list/cards/map/calendar/kanban arriving via 1.10 and plugin-contributed view types; (h) **no Publish support yet** (planned); (i) **no persisted index** — every query re-scans, which is fine at 50k notes but a ceiling for 500k+.

5. **The "vault is the database" mental model is the load-bearing insight.** As articulated in *The Architect's Guide to Obsidian Bases* (Chugh) and echoed across the Obsidian forum, Bases inverts the Notion/Airtable model: there are no containers, only views over the entire vault. This is *not* a limitation — it's why cross-context dashboards like "everything I'm currently consuming" or "every CIS control with at least one piece of evidence" are native rather than requiring relation tables.

6. **The cybersader/Crosswalker context implies a GRC/compliance-grade requirement set.** Public README excerpts make the goals explicit: turn Obsidian into "a full-fledged GRC database," support evidence ↔ control mappings with metadata-on-the-link (e.g., `framework_here:: [CIS 1.1](...) {"reviewer":"Person","status":"covered"}`), and even speculate about a CRDT-based reconciler for filesystem sync issues. This is materially harder than personal PKM: it implies referential integrity, audit trails, multi-user concurrency, and machine-readable relations — exactly the places Bases is weakest today and where an **architecture** (rather than just "use Bases") is needed.

### Details

#### 1. Restating the challenge from first principles

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

#### 2. First-principles design space

Borrowing standard data-architecture patterns and applying them to a vault:

- **Separation of storage from query (the most important principle).** Markdown files are storage; `.base` files are queries; views are projections. Never let a query format become storage. This is why the Dataview *inline* `::` syntax is a long-term liability — it conflates them — and why Bases' YAML-only stance, although annoying for Dataview migrants, is architecturally correct.
- **Schema-as-code, not schema-by-convention.** A "Master Property Schema" — a single note (or `.json`/`.yaml` file) that lists every legal property, its type, allowed values, and required-vs-optional status — should be the contract that templates, linters, and AI agents enforce. Without it, frontmatter drifts within months and Bases queries silently break.
- **CQRS for vaults.** Treat *writes* (templates, modal forms, AI agents creating notes, the Obsidian editor) and *reads* (Bases views, dashboards, exports, MCP queries) as different surfaces with different ergonomics. TaskNotes already does this: a creation modal writes the file, a `.base` view reads many.
- **Materialized views vs. live views.** Bases evaluates live on every render. For very large vaults, expensive aggregations, or cross-vault reporting, you need an out-of-band materialization step — a nightly script that produces a `_index/` folder of pre-aggregated Markdown notes (or a SQLite/DuckDB sidecar). The principle: keep the canonical data in `.md`; treat the index as a cache that can be rebuilt from scratch.
- **Indexing strategy.** Bases today re-scans on demand with no persisted index. Three escape hatches exist: (a) Datacore's incremental index (still beta), (b) external indexers like the unofficial DuckDB-over-frontmatter or SQLite-over-vault scripts that some power users run, (c) embedding stores for semantic search (the `bitsofchris/augi` pattern). Architecturally, *the index is allowed to be stale and rebuildable*; the vault is not.
- **Relations without joins.** Since Bases has no joins, model relations the way the filesystem already does: as wikilinks in List-typed properties, plus inverse lookups via `file.hasLink(this.file)` filters. For richer relations (link metadata like `{reviewer, status}` from the cybersader Crosswalker example), the cleanest pattern is an **edge note** — a tiny Markdown file per relationship, with frontmatter `from`, `to`, and any edge attributes. This converts every relation into a queryable Base row, gives you audit history via Git, and is portable to any graph DB.
- **Frontmatter as schema, body as content.** Anything you want to query goes in YAML; anything narrative stays in the body. Bases explicitly does not parse note bodies, and that's a feature: it forces you to commit fields you actually care about to a structured place.
- **Query language tradeoffs.** Bases' syntax is a small, declarative DSL (boolean logic, function calls, dot-paths) — closer to a spreadsheet formula than to SQL. This is the right floor: low learning curve, no Turing completeness in the hot path, easy for both novices and AI agents to generate. Dataview's DQL and DataviewJS sit at higher rungs and should be reserved for genuine compute.

#### 3. Current state of the art (as of May 2026)

- **Bases (Obsidian core, since 1.9, May 2025).** Now the default. Plugin-defined view types (since 1.10) let community plugins like Graph Explorer Base View, Cards View, and TaskNotes' Kanban/Calendar/Agenda all render any base. CSV-to-Markdown conversion, summary formulas, and group-by are shipped; in-base search, Publish integration, and a CLI surface are on the public roadmap.
- **Dataview** remains the most powerful community query plugin but is in slow decline; the author has signaled Datacore as successor.
- **Datacore** (beta, multi-year development) offers an indexed JSX-driven view system. Useful as an escape hatch, not yet a default.
- **External integrations.** The Obsidian CLI (1.12 roadmap) will let you query views from the terminal. TaskNotes ships an HTTP API and webhooks. The community has converged on MCP servers that expose vault metadata to AI agents (`kepano/obsidian-skills`, augi, billmongan). Bases is the structured surface those agents read.
- **Adjacent ecosystems.** Logseq uses a block-grain DB approach with a built-in query language; Anytype uses an object-typed local-first DB; Notion is fully proprietary. Each trades portability for relational richness. Obsidian + Bases is uniquely "files first, queries second" — which is why it scales to tools and agents the others don't reach.

#### 4. Recommended architecture

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

#### 5. Long-term considerations

- **Portability dominates feature richness over a 10-year horizon.** Markdown + YAML has outlived a half-dozen note-app generations; Notion blocks and Roam blocks have not. Any architecture that compromises file-grain storage to gain Bases features is the wrong trade.
- **Schema evolution is the silent killer.** Plan for property renames (`status` → `task/status`), type changes (string → enum), and deprecations. Treat the Master Property Schema like a database migration log; keep an `_archive/` of deprecated names.
- **Scale ceiling.** Bases handles 50k notes briskly today; expect a soft ceiling around 100–500k notes per vault before you must split vaults or move to an external index. The architectural answer is *vault federation* (multiple vaults indexed together by an out-of-band tool), not a bigger Bases.
- **Plugin-ecosystem dependency risk is now lower for Bases than for Dataview** — Bases is core, Dataview is a single-maintainer community plugin. But your architecture should still survive losing any one plugin. Test by asking: *"If Obsidian disappeared tomorrow, what would I still have?"* If the answer is "all my notes plus a schema doc," you're safe.
- **Concurrency and collaboration.** The cybersader notes flag CRDT reconciliation for SMB-shared vaults; Obsidian Sync handles the single-user multi-device case but not real-time multi-user. Long-term, expect the CRDT path (or `git`-style merge tooling) to be the right answer; design relations so that two users editing the *same* edge note is rare (prefer per-relation edge notes over big List properties).
- **AI agents are now first-class clients.** The right architecture treats them symmetrically with humans: same schema, same write API, same view layer. The `kepano/obsidian-skills` + MCP pattern is the leading indicator.
- **Interoperability.** Frontmatter is the universal lingua franca: Logseq reads it, Quartz/digital gardens publish it, GitHub renders it. `.base` files don't travel; designs that treat them as views (re-derivable) rather than data (canonical) avoid the trap.

#### 6. Open questions and risks

- **No persisted Bases index.** Re-scan-per-render is fine today but caps vault size and view density. Likely fixed in future Obsidian versions; until then, lean on `limit`, cheap predicates, and avoid `file.backlinks`.
- **No joins / rollups.** Edge notes mitigate but require discipline. A future Bases or Datacore feature may make this native; design relations so they can be promoted later.
- **`.base` file portability.** Today, only Obsidian reads them. If portability of *views* (not just data) matters, keep a sibling description in plain Markdown so the queries can be re-implemented anywhere.
- **Schema drift in multi-author vaults.** Without enforced templates and a linter, properties decay. Invest early in tooling here — it pays back forever.
- **AI agents over-writing frontmatter.** Without guardrails (an HTTP API that validates against the schema), agents will invent properties and break Bases. Treat AI writes as untrusted input; validate at the door.
- **Bases beta velocity.** The plugin is changing fast (1.9 → 1.10 had breaking formula changes). Pin views, write smoketests, and expect to migrate again at least once before Bases stabilizes.

### Recommendations

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

### Caveats

- **The original challenge document was not retrievable.** I could not directly read `/agent-context/zz-challenges/27-bases-query-layer-architecture/`; the URL was rejected by the fetcher and returned no search hits, suggesting it is unindexed, unpublished, or behind access controls. The framing above is reconstructed from public cybersader artifacts (Crosswalker README, cyberbase, awesome-obsidian-and-cyber, TaskNotes docs) and may not match every constraint or deliverable the author specified. If a specific output format (e.g., ADR, RFC, decision log) is required by the challenge, this report should be reformatted accordingly.
- **Bases is a moving target.** Specific version numbers, syntax, and limits cited (1.9, 1.10, 1.12 roadmap items, breaking formula changes in 1.9.2) reflect publicly indexed material as of May 2026 and will continue to change.
- **Performance numbers (50k notes "near-instant", Dataview "10–100×" slower) are reported by practitioners**, not benchmarked here. Treat them as directional, not authoritative.
- **The "edge notes" pattern for typed relations is a design recommendation**, not an established Obsidian convention; it is mechanically equivalent to how Crosswalker proposes to encode `{reviewer, status}` on links, but you will not find it in the official Bases docs.
- **Long-term predictions about Datacore, Bases joins, and Publish integration are roadmap-derived**, not promises. Decisions that depend on them should be staged behind the "benchmarks that change the recommendation" triggers above.
- **For cybersecurity GRC use cases specifically** (the apparent driving workload behind cybersader's Obsidian work), a pure-Bases architecture will likely *not* be sufficient for evidence integrity, audit trails, and multi-reviewer concurrency at enterprise scale; plan for the external-index and edge-note tiers from day one rather than retrofitting them.

---

## Editorial postlude — recommended next steps

Two paths forward (user decision tomorrow):

### Path A: synthesis log now + defer remaining gaps to v0.1.6 implementation

Write `2026-05-08-bases-query-layer-architecture-synthesis.mdx` capturing:

- **Adopted**: Hybrid architecture (Bases as default; Tier 2 SQL helpers as escape hatch — already shipped in v0.1.5 P3); `registerBasesView` for custom view types; TaskNotes precedent; schema contract priority; junction-notes-as-edges (already shipped in v0.1.4); CQRS write/read split
- **Rejected**: Bases-only (insufficient for closure / coverage gaps); custom in-plugin engine (TaskNotes proved this fails at scale); reintroducing Dataview/DataviewJS (project memory)
- **Deferred to v0.1.6 implementation as concrete tasks**: junction-note-subject-string resolution; `also_emit.body.queries` recipe API; closure-cache integration with `registerBasesView`; specific `crosswalker*` view-type names

Refine v0.1.6 milestone scope based on what's adopted; begin implementation.

**Pros**: faster to v0.1.6 implementation (~1 week saved).
**Cons**: 5 specific architectural questions get resolved during implementation rather than upfront; some rework risk.

### Path B: Ch 28 — Bases query layer **implementation** (follow-on)

Write a tightly-scoped Ch 28 that engages with the 5 specific gaps the deliverables miss:

1. Junction-note-subject-string resolution: string LIKE vs metadataCache.resolveLink vs projector pre-resolution (with schema-bump implications)
2. `also_emit.body.queries` recipe schema API design
3. `registerBasesView` integration pattern: how custom view subclass calls `plugin.queryClosure()` and renders results in Bases pipeline (worked example)
4. OLIR-scale performance worked examples (1000 mappings × closure depth 3)
5. Recipe-shape decisions for the 6 junction-note query patterns (catalog from Ch 27 §2)

Hand to a fresh agent. Deliverable lands in `zz-research/2026-05-NN-challenge-28-*.md`. Synthesis log captures both Ch 27 + Ch 28 verdicts. THEN v0.1.6 implementation.

**Pros**: all 5 gaps resolved upfront; v0.1.6 implementation is mechanical execution.
**Cons**: ~3-7 day delay before implementation begins.

### My read

- Ch 28 is **probably worth running** because gap #1 (junction-note-subject-string resolution) has cascading schema-version implications (potential `tier2-sqlite-v2` bump) that are expensive to discover mid-implementation.
- BUT if you've reviewed both Ch 27 deliverables and want to move forward, Path A is defensible — the milestone-starter agent + pre-commit-reviewer agent now in place provide review-time safety nets the earlier milestones didn't have.

User decision: review tomorrow + pick path.

## Related

- [Ch 27 challenge brief](/crosswalker/agent-context/zz-challenges/27-bases-query-layer-architecture/)
- [v0.1.6 Bases query layer milestone](/crosswalker/reference/roadmap/milestones/v0-1-6-bases-query-layer/)
- [Ch 07 evidence-link edge model synthesis](/crosswalker/agent-context/zz-log/2026-04-10-evidence-link-edge-model-synthesis/) — junction notes as the "5th architecture"; 13-field schema
- [v0.1.5 Tier 2 sidecar shipped](/crosswalker/agent-context/zz-log/2026-05-06-v0-1-5-tier-2-sidecar-shipped/) — SQL helpers + closure cache available
- [v0.1.5 Phase 3 (query API)](/crosswalker/agent-context/zz-log/2026-05-06-v0-1-5-tier-2-sidecar-shipped/) — `plugin.queryConcepts/Crosswalk/Closure` shipped
- [System architecture Layer 4 (Query)](/crosswalker/concepts/system-architecture/#layer-4--query-t1--t2--user)
- [`metadata-ecosystem` concept page](/crosswalker/concepts/metadata-ecosystem/) — Bases capabilities + limits comparison
- [`obsidian-bases` skill](https://github.com/cybersader/crosswalker/tree/main/.claude/skills/obsidian-bases)
