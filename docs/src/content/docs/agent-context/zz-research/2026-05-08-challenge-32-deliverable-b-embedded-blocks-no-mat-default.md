---
title: "Ch 32 deliverable B: Intuitive query UX — embedded `base` blocks default; materialization opt-in for audit-share"
description: "Fresh-agent research deliverable B for Challenge 32. Recommends Hybrid Pattern D (Metabase-shape) — recipe-picker primary + wizard for novel queries + raw YAML escape — but separates browsing from sharing. The default browsing path uses embedded `\\`\\`\\`base` code blocks inside ordinary Markdown query notes (live, in canonical user files); materialization is reserved for explicit 'share with auditor / Publish parity' use cases. Adopts no-materialization-by-default as the architectural verdict. Crosswalker SKILL.md (modeled on kepano/obsidian-skills) is v0.1.6 minimum-viable agent surface. Tightens v0.1.6 milestone scope rather than expanding it: drop full wizard / marketplace / recommendation engine / staleness watcher; ship picker + inline + opt-in materialize + 5-8 canonical recipes + cookbook + SKILL.md."
tags: [research, deliverable, query-ux, hybrid-pattern-d, embedded-base-blocks, no-materialization-default, kepano-obsidian-skills, agent-skill, ch-32, deliverable-b]
date: 2026-05-08
sidebar:
  label: "Ch 32b · Embedded blocks no-mat default"
  order: -20260508.4
---

:::tip[Origin and lifecycle]
Fresh-agent research deliverable produced 2026-05-08 in response to [Challenge 32: Intuitive query UX](/crosswalker/agent-context/zz-challenges/32-intuitive-query-ux/). One of two parallel deliverables ([A: hybrid Pattern D with materialization-folder spec](/crosswalker/agent-context/zz-research/2026-05-08-challenge-32-deliverable-a-hybrid-pattern-d-with-mat-spec/)). Both converge strongly on hybrid Pattern D + ship `crosswalker-bases` SKILL.md in v0.1.6 + adopt "no-materialization-by-default" as the right framing. This deliverable goes further on the embedded-base-block pattern (concrete YAML for query notes; explicit "browsing vs sharing" architectural split). Preserved verbatim.
:::

# Crosswalker Challenge 32: Intuitive Query UX — Research Report

## TL;DR

- **Ship v0.1.6 GA with a "Hybrid Pattern D"** centered on a recipe-picker modal as the primary entry point, falling back to an import-style wizard for first-time/novel queries and exposing the raw `.base` YAML as the power-user escape hatch — but **make materialization the first thing you defend**, not the first thing you build, by treating materialized files as a clearly-marked, generated *artifact zone* (`_crosswalker/` folder + `cssclasses: [crosswalker-generated]` + frontmatter banner + stale callout) rather than as canonical user content.
- **The contrarian "no materialization" path is partially correct and should be adopted as the default surface**: for browsing/exploration, use an embedded Bases code block (`crosswalkerPivot` view) inside a query note so the projection lives next to the recipe, not as a generated `.md` file; reserve true materialization for the explicit "share with auditor / Publish parity" use case behind a `Crosswalker: Materialize current query` command. This collapses 70% of the UX problems Challenge 32 raises.
- **AI-agent assistance should be a v0.1.6 MVP, not deferred**: ship a single `crosswalker/SKILL.md` modeled on `kepano/obsidian-skills/skills/obsidian-bases/SKILL.md` that teaches Claude/Codex/OpenCode the recipe schema, the `crosswalkerPivot` view, and the materialization frontmatter — agents become a *first-class* recipe-authoring path, which simultaneously deflates the learning-curve problem for novel recipes and validates that the schema is LLM-tractable.

---

## Key Findings

1. **Every adjacent product that has solved this problem uses a *two-tier toggle*** — not a wizard, not pure inline, not a marketplace alone. Metabase (Query Builder ↔ SQL editor, with a one-way "Convert to SQL" door), Looker (Quick-Start analyses ↔ Explore field picker ↔ LookML), Power BI (drag fields ↔ DAX measure ↔ Visual Calculations), Notion/Airtable (view-type picker ↔ filter/sort UI ↔ formula editor), and Obsidian Bases itself (GUI Filters/Properties panel ↔ YAML source) all converge on the pattern: **GUI primary, source-mode escape, no wizard at all once the user is past first-run**. A wizard appears only as a *creation-time* affordance (Notion's "Get started with…", Airtable's view-type menu, Looker's Quick Start cards). This evidence directly contradicts the brief's framing of Wizard vs Recipe-picker vs Inline as competing options — they are *layers*, not alternatives.
2. **Obsidian Bases already ships the convention you must align with.** Bases supports three creation entry points (ribbon, command palette `Bases: Create new base`, right-click folder → `New base`), opens to a GUI by default, and stores the YAML in a `.base` file that users can edit directly. There is an active, upvoted feature request for an explicit "Open in Source Mode" toggle, confirming users *expect* GUI-first and source-as-fallback. Crosswalker's recipes must hook into these three entry points or it will feel foreign.
3. **The materialization concern is real and load-bearing.** Obsidian's core mental model — "every `.md` is canonical user content" (cf. Steph Ango/kepano's published vault philosophy: bottom-up, every file is a thought) — is broken by emitting derived `.md` files. The community has converged on `cssclasses` frontmatter as the standard "this note is special, style/treat it differently" mechanism (Obsidian Help; kepano/obsidian-skills `PROPERTIES.md`). This is the right primitive to lean on.
4. **kepano/obsidian-skills is the agent-assistance answer, not a research direction.** It already exists, has 19k+ stars, includes a complete `obsidian-bases` skill that teaches LLMs valid `.base` YAML (filters, formulas, views, summaries), and is officially maintained by Obsidian's CEO. Crosswalker's v0.1.6 minimum-viable agent surface is **one additional `SKILL.md` that extends this** with the recipe schema and `crosswalkerPivot` view-type — it is days of work, not weeks, and it makes the LLM-assisted recipe authoring path a free benefit rather than a custom build.
5. **NIST OLIR's catalog UI is the closest domain-specific analog** and it is mediocre — a faceted search with downloadable spreadsheets and a "Comparison Report" tool. It validates that Crosswalker's audience (auditors/GRC) accept a **catalog + filter + report** model, but also shows what *not* to do: OLIR's UI is web-only, requires understanding focal/reference document terminology before any first query, and produces XLSX downloads as the primary deliverable. Crosswalker can clearly beat this bar.
6. **Bases YAML is small, readable, and tooling-friendly.** It has five sections (filters, formulas, properties, summaries, views), supports a `formula.X` reference scheme, and has well-known gotchas (unquoted `:` in display names, mismatched quotes in formula strings, undefined-formula references, Duration arithmetic). These are the four error scenarios Crosswalker must surface — and `kepano/obsidian-skills/obsidian-bases` already documents them in agent-readable form.
7. **Mobile-vs-desktop is mostly solved by the Hybrid pattern itself.** Bases works on Obsidian mobile (1.10+); the GUI Filters/Properties panel degrades gracefully; YAML inline editing on a phone is genuinely bad and should be explicitly desktop-only. No new infrastructure needed — just don't *require* the inline path on mobile.

---

## Details

### Deliverable 1 — Cross-Reference Matrix: 11 Adjacent Products × UX Dimensions

| Product | Entry Point | Authoring Path | Discoverability | Mobile | Errors | Agent-Friendliness |
|---|---|---|---|---|---|---|
| **Looker Explore** | Click Explore in nav; Quick-Start cards on blank Explore | Field picker (dimensions black, measures gold) → drag to columns/rows; SQL tab visible read-only; LookML for devs | Explore list grouped by model; "Quick Start analyses" surface predefined queries | Browser-responsive but not really mobile-first | LookML validate button; runtime errors inline | Low — LookML is proprietary; Looker Studio MCP is nascent |
| **Tableau Pivot/Worksheet** | Open worksheet → drag fields | Drag dimensions/measures to Rows/Columns/Marks; "Show Me" suggests chart types | Data Source page first; saved Workbooks; Tableau Public | Tableau Mobile is read-only mostly | Red error chips on shelves; type mismatches surfaced | Low — XML workbooks; closed ecosystem |
| **Power BI** | Visualizations pane → pick visual → drop fields | Field picker → visual buckets (Axis/Values/Legend); New Measure (DAX); Visual Calculations editor (preview) | Datasets list; Quick Insights; AI Q&A natural-language box | Power BI Mobile read-mostly | DAX errors inline with formula bar; visual-level filter granularity quirks | Medium — Copilot generates DAX; XMLA endpoint |
| **dbt Cloud Insights** | Sidebar → Insights | Tabbed SQL editor with Catalog sidebar; Copilot natural-language prompt → SQL; Save Insight; promote to Studio IDE / Canvas | Catalog browse of models/metrics/dimensions integrated in Insights | Browser only; not mobile-optimized | SQL errors from warehouse; LSP feedback in Fusion | High — Copilot first-class; MCP server |
| **Metabase** | + New → Question or SQL/Native query | **Two-mode toggle**: graphical Query Builder (data → filter → summarize blocks, preview button per step) ↔ SQL editor; one-way "Convert to SQL"; Metabot natural-language | Collections (folders); Models; Metrics; saved Questions reusable as data sources | Responsive web; mobile app for viewing | Errors from DB shown as-is; preview-per-step catches errors early | Medium — Metabot AI; OSS code accessible to agents |
| **Notion databases** | "/Database" or new page → "Get started with…" → view-type picker | View-type menu (Table/Board/List/Calendar/Timeline/Gallery/Chart) → Filter/Sort/Group sidebars → formula editor | Sidebar tree; database mentions; templates gallery | Native iOS/Android; views work but config is desktop-easier | Inline validation on formula editor; gentle fallback | Medium — Notion AI; API |
| **Airtable views** | + next to view list → choose view type | View-type menu (Grid/Kanban/Calendar/Gallery/Timeline/Gantt/Form); each view has Filter/Sort/Group/Hide-fields toolbar | Views sidebar; templates marketplace; Interface Designer | Native apps; view types work on mobile (Kanban, Gallery added in mobile updates) | Inline; field-type mismatches surface immediately | Medium — Scripting block; AI features |
| **Obsidian Bases** | Ribbon icon, `Bases: Create new base` command, right-click folder → New base | GUI Filters panel (Property+Operator+Value), Properties panel, Views menu (Table/Cards/List/Map); `.base` YAML editable in any text editor | File-tree; embed via `\`\`\`base` in any note; share `.base` files | **Yes (Obsidian 1.10+)** — Bases works on mobile; Map view requires Maps plugin | YAML parse errors shown; missing properties show empty cells | High — `kepano/obsidian-skills/obsidian-bases` SKILL.md teaches LLMs the format |
| **BioPortal Mappings UI** | Browse ontology → Mappings tab on term, or summary tag-cloud of mappings between two ontologies | Browse-only for most; researchers upload mappings via UI or REST API; create point-to-point mappings; add notes/discussions | Mappings tag-cloud (font-size = mapping count); ontology summary; faceted search; 1500+ ontologies | Web-responsive; not optimized | Limited — submission errors via batch | Low — REST API exists, no agent skills |
| **NIST OLIR Catalog** | Catalog page on csrc.nist.gov | Faceted search by focal/reference document; "Comparison Report tool"; download XLSX | Faceted catalog; spreadsheet downloads as primary artifact | Web; no app | Submission validation against NIST IR 8278A spec | Low — XLSX-centric; programmatic access weak |
| **EBI OxO / OxO2** | Search box; enter source CURIE | OxO2: SSSOM-aware filter syntax `[field]\|[operator]\|[value]`; React frontend; REST API; Datalog inference engine | Search by ontology, term, distance; logically-sound crosswalks materialized | Web-responsive | API errors via JSON; filter validation | Medium — REST API; SSSOM is well-documented |

**Verdict from the matrix**: The dominant pattern in mature analytical tools (Metabase, Looker, Power BI, dbt) is **GUI primary + source-mode escape + AI-natural-language ramp**. The dominant pattern in Obsidian-native tools (Bases, Notion, Airtable) is **type-picker creation + sidebar-based filter UI + format file as portable artifact**. Crosswalker should pick the *intersection* of both: type/recipe picker on creation, GUI-equivalent (the recipe's structured form) for editing, raw YAML as escape, and an `obsidian-skills`-style SKILL.md for agent-mediated authoring.

---

### Deliverable 2 — Pattern Verdict: Hybrid (Pattern D), with refinement

The brief frames four patterns as competing. Evidence from adjacent products says they are not competing — they are layered. The argued recommendation:

- **Reject Wizard-only (Pattern A)**: every product that *forces* a wizard for repeat tasks has eventually added a "skip" or shifted the wizard to first-run only. Confirmed by Notion's "Get started with…" (which only appears on empty pages), Airtable's view picker (one click, not multi-step), and Looker's Quick-Start (a single card in the field picker, not a modal flow). A multi-step modal blocking power users is a known anti-pattern.
- **Reject Recipe-picker-only (Pattern B)**: the brief's own concern is correct — a marketplace alone forces users into a "find similar, fork, customize" workflow that doesn't exist for novel queries. Plus, a marketplace is v0.3+ work and the brief explicitly forbids "pre-generating thousands of canonical recipes" as v0.1.6 scope.
- **Reject Inline-only (Pattern C)**: this is what v0.1.6 ships *today* and is the very reason Challenge 32 exists.
- **Recommend Hybrid (Pattern D), but specifically the Metabase-shape, not the marketing-pages-shape**:

```
[Crosswalker: New query] command (only entry point you must own)
   │
   ├─ Modal Step 1: "What do you want to see?"
   │      Options:
   │         • Pick from recipes (the small set of canonical recipes you ship)
   │         • Build from scratch (→ wizard sub-flow for first-timers)
   │         • Edit YAML directly (→ inline editor, desktop-only, marked "advanced")
   │
   ├─ After selection: drop user into the *embedded base block* in a query note
   │   (NOT into a generated .md file — see materialization decision below)
   │
   └─ Always show "View YAML" toggle (alignment with Bases user request for Source Mode)
```

This pattern aligns with Bases' own create-base affordances (ribbon/palette/right-click) and with Metabase's two-mode design (which the docs explicitly call out as serving "even SQL experts" who use the GUI for speed). Crosswalker's user mix — a few power-user GRC analysts willing to learn YAML, plus many one-time auditors who will use Crosswalker once a quarter — *requires* both surfaces. The Hybrid is not optional.

**Pushback on the brief's "Pattern D pros/cons"**: the brief lists Pattern D's only con as "more complex to build" — true but understated. The actual cost is in *consistency between modes*: when a user authors a recipe in the wizard then opens the YAML, the YAML must round-trip identically. Plan to write a single recipe-schema parser/serializer; do not let the wizard generate a different YAML shape than the inline editor produces.

---

### Deliverable 3 — Mobile vs Desktop UX Matrix

| Surface | Desktop | Tablet | Mobile (phone) | Recommendation |
|---|---|---|---|---|
| Recipe picker modal | Full grid layout, 3-col cards | Full, 2-col | List, 1-col | Ship for all; degrade column count |
| Wizard ("Build from scratch") | Multi-step modal | Same | Single-column, vertical stepper | Ship for all; mobile-friendly |
| Inline YAML editor | Monaco-style editor, autocomplete from schema | Plaintext editor with schema hints | **Hide / show "Edit on desktop" callout** | Desktop-only; document the restriction |
| Embedded `crosswalkerPivot` view in a note | Full pivot table, filters in sidebar | Full | Horizontal scroll table; collapsible filter sheet | Ship for all (Bases already supports mobile per 1.10) |
| Materialized file viewing | Live Preview default; Source toggle in 3-dot menu | Same | Live Preview default | Ship for all |
| Recipe schema validation errors | Inline squiggles + footer panel | Inline + footer | Footer toast only (avoid blocking screen) | Differentiate by viewport |
| Agent-assist ("Ask LLM to write recipe") | Command palette opens chat panel | Same | Same | Mobile fine; agent runs externally anyway |

The Hybrid pattern degrades gracefully because the inline-YAML escape is the *only* desktop-required surface, and it is also the surface power users explicitly want — they aren't editing YAML on a phone. This is the same constraint Notion and Airtable accept (formula editors are technically usable on mobile but rarely used there). No engineering budget is needed for "mobile-only inline editor"; explicit "advanced editing requires desktop" copy is sufficient.

---

### Deliverable 4 — Recipe Discoverability: v0.1 Minimum + v0.2+ Roadmap

**v0.1.6 (feasible bar)**:
1. **A small canonical recipe set shipped with the plugin** — 5–8 recipes, hand-authored, covering: NIST × ISO coverage matrix, NIST × NIST OLIR-shape Set Theory mapping, "Gaps in coverage" pivot, evidence-by-control, control-by-evidence, junction-by-status, framework-summary, and one library-science taxonomy example. Each lives in `<plugin>/recipes/*.yaml` and is loaded into the recipe picker.
2. **Categorized recipe registry** — categories hard-coded for v0.1.6: Compliance, Threat Intel, Biomedical, Library/Taxonomy. Use Notion's view-type-menu shape: cards with icon + name + 1-line description.
3. **File-system browse fallback** — recipes resolved from both `<plugin>/recipes/` and a vault folder `_crosswalker/recipes/` so users can drop in their own. This mirrors Obsidian Templates' pattern.
4. **Search-by-keyword in the picker** — fuzzy match on name + tags + description using `FuzzySuggestModal` (built into Obsidian API). Free.

**v0.2+ (deferred, with explicit triggers)**:
- **Community recipe marketplace** — only triggered when (a) ≥3 third-party recipes appear in the wild on GitHub, or (b) user requests cross 50. Pattern: Obsidian's existing community-plugins list, not a custom server.
- **Recommendation engine** — "you have NIST and ISO ontologies in your vault; recipes A and B are most useful." Triggered by vault-scanning (which Crosswalker already does for import). Low engineering cost once vault-scan exists.
- **Agent-driven recipe synthesis** — "I have CIS Controls and PCI; can you propose a recipe?" delivered via the SKILL.md path (see Deliverable 8). Triggered when LLM-assisted authoring is validated by ≥10 successful agent-authored recipes in the wild.

The v0.2+ items each have a concrete trigger; do not build them speculatively.

---

### Deliverable 5 — Learning-Curve Scaffolding Plan

The target ("non-technical user → novel-but-correct recipe in <1 hr") is achievable but requires layered scaffolding. Drawing on what Looker, Notion, and Bases-via-`obsidian-skills` already do:

| Layer | Artifact | Cost | When |
|---|---|---|---|
| L1 — Concepts | A single `concepts/recipes.md` page with "what is a recipe, what is a `.base` file, how do they relate, what is `crosswalkerPivot`" — 1 page, with diagram | 1 day | v0.1.6 GA |
| L2 — Cookbook | Each shipped recipe has a sibling `.md` describing intent, when to use it, what the result looks like, and how to modify it | 2 days for 8 recipes | v0.1.6 GA |
| L3 — Template gallery | The recipe picker itself, with screenshots of expected output | Free if (4) is done | v0.1.6 GA |
| L4 — Tutorial | One end-to-end walkthrough: "Build a NIST × ISO coverage matrix in 10 minutes" — text + screenshots | 1 day | v0.1.6 GA |
| L5 — LLM-assisted authoring | `crosswalker/SKILL.md` extending kepano/obsidian-skills/obsidian-bases — teaches the recipe schema and `crosswalkerPivot` | 2–3 days | v0.1.6 GA (see Deliverable 8) |
| L6 — Guided wizard | The "Build from scratch" path in the Hybrid modal (Deliverable 2) | ~1 week | v0.1.6 GA |
| L7 — Interactive playground | An in-vault sandbox vault-template with sample data and pre-built recipes | 3 days | v0.2 |
| L8 — Video walkthroughs | YouTube/Loom | 2 days each | v0.2+ |

**Argued prediction**: with L1–L6 shipped at GA, the median new user will get to a *canonical* recipe in <10 minutes and a *novel* recipe in <60 minutes via the LLM path, because the SKILL.md effectively makes the LLM act as a guided wizard with full schema knowledge. Without L5, the <1 hr target for novel recipes is unrealistic.

---

### Deliverable 6 — Error-Handling and Feedback-Loop Design

Use Obsidian's native `[!callout]` system (built-in, themable, well-known to users) plus inline validation. All four scenarios:

**Scenario A — Recipe references an ontology ID not in the vault**:
- *What user sees*: A `[!warning] Missing ontology` callout at the top of the embedded base block: `Recipe expects 'NIST.SP.800-53' but no notes found with this ontology ID. Did you import it via the Crosswalker import wizard?`
- *Recovery path*: Callout includes a clickable link → opens import wizard scoped to that ontology. (This already exists per the Crosswalker brief.)

**Scenario B — Recipe specifies a primitive composition with no result**:
- *What user sees*: An `[!info] No matches` callout *inside* the empty Bases view (not above it, so users don't confuse it with a missing-data error). Text: `Found 0 junctions matching this recipe. Try: relaxing filter X, checking that junction status is set to 'covered', or running 'Crosswalker: Diagnose recipe' from the command palette.`
- *Recovery path*: Diagnose command runs the recipe with progressively-relaxed filters and reports which clause eliminated all results. Modeled on Looker's "filter-debug" pattern and Metabase's per-step preview.

**Scenario C — `.base` file is malformed**:
- *What user sees*: Bases' native YAML error (already in 1.10+); Crosswalker adds a wrapper `[!error] Recipe YAML invalid` with the schema field that failed and a "Restore from last working version" button.
- *Recovery path*: Crosswalker silently writes a `.base.bak` shadow on every save (only when YAML parses); the error callout's button restores. This is a 1-day feature; copy the pattern from Templater's safety nets.

**Scenario D — Custom view fails to register (Bases plugin disabled)**:
- *What user sees*: The materialized file or embedded block shows `[!error] Crosswalker requires the Bases core plugin. Enable: Settings → Core plugins → Bases.` with a button that *opens* that settings page (Obsidian API exposes `app.setting.open()`).
- *Recovery path*: One click. Don't fall back to a degraded table; this is a hard prerequisite.

**General principle**: every error callout includes (1) what went wrong, (2) the most likely cause in plain English, (3) a recovery action that is one click. This is Looker's "graceful failure" pattern and is the inverse of NIST OLIR's spreadsheet-validation-failure UX, which is opaque.

---

### Deliverable 7 — Materialization UX Design (the v0.1.6 load-bearing decision)

**The contrarian "no materialization" argument is mostly right, and the recommended design adopts it as the default.** Here is the argued position:

#### The core claim: *separate browsing from sharing*

Today's design conflates two needs into one mechanism (materialized `.md` files):
1. **Browsing/exploring** — "show me NIST × ISO right now"
2. **Sharing/publishing** — "send this view to an auditor as evidence; appears identically in Obsidian Publish"

These are different needs with different conventions. Bases already solves #1 with embedded code blocks. Materialization is only required for #2. Conflating them broke Obsidian's "every file is canonical user content" convention for users who only need #1, who are the majority.

#### Recommended architecture

**Default (browsing) path — no materialization at all**:
- User runs `Crosswalker: New query` → Hybrid modal (Deliverable 2) → drops them into a *new query note* `_crosswalker/queries/2026-Q1-nist-iso-coverage.md` containing:
  ```markdown
  ---
  crosswalker_recipe: nist-iso-coverage
  crosswalker_version: 0.1.6
  ---
  # NIST × ISO Coverage
  
  \`\`\`base
  # auto-generated from recipe; edit via Crosswalker: Edit query
  views:
    - type: crosswalkerPivot
      ...
  \`\`\`
  ```
- The note is a *real* user file (canonical), but the *projection* is a Bases code block (re-evaluated live). Users edit the recipe via the picker; the YAML in the code block updates. There is no derived `.md` file for the pivot rows.

**Explicit materialization path — only when user asks**:
- Command: `Crosswalker: Materialize current query for sharing` (or button in the embedded view)
- Writes `_crosswalker/materialized/2026-Q1/coverage-matrix.md` with:
  - Frontmatter banner properties (`crosswalker.materialized: true`, `crosswalker.recipe`, `crosswalker.materialized_at`, `crosswalker.source_query`, `cssclasses: [crosswalker-generated]`)
  - First-line callout: `> [!warning] Generated artifact. Do not edit by hand. Regenerate via Crosswalker.`
  - The pivot table as Markdown (so it survives outside Obsidian)
  - At bottom: `> [!note] Source: [[2026-Q1-nist-iso-coverage]] — recipe: nist-iso-coverage`

This **collapses the contrarian critique into a feature flag**: users who only browse never see a materialized file; users who need auditor-shareable artifacts get them with explicit consent.

#### Click behavior, vault-coexistence, and convention coherence

When a user clicks a materialized file:
- **Default view**: Live Preview (not Source). This matches Obsidian's default for `.md`. The frontmatter banner is rendered visibly via Obsidian's properties panel + the `[!warning]` callout sits on line 1 of the body so it's always above the fold.
- **Visual treatment**: `cssclasses: [crosswalker-generated]` injects a CSS class; ship a default snippet that applies a subtle left-border in editor view and a "Generated" pill in the inline title. Themes can override. (This is exactly the kepano/obsidian-skills documented `cssclasses` pattern.)
- **Folder treatment**: `_crosswalker/materialized/` — the leading underscore matches kepano's convention (his `Daily/`, `Attachments/` etc. — he hides them with leading numeric prefixes; we use `_` for "system-generated"). Document the convention precisely as: **"This folder contains generated files. Treat them as read-only outputs of recipes. Edit the source recipe instead."**
- **Bases-convention coherence**: the user's first-impression worry — "clicking on them and operating in obsidian is gonna be a little bit confusing" — is real, and is mitigated by (a) the visible callout, (b) the cssclass styling, (c) the "_crosswalker" folder name, and (d) every materialized file links *back* to its source query note. After 30 seconds of exposure the convention is learned.

#### Discovery of materialized files

Three layers, all supported simultaneously:
1. **Folder browse** — `_crosswalker/materialized/` is a vanilla folder
2. **Bases meta-view** — ship a `_crosswalker/materialized.base` that lists all files where `crosswalker.materialized == true`, sorted by date, grouped by quarter
3. **Command palette** — `Crosswalker: Show materialized artifacts` opens that base in a tab

This matches Obsidian's "three entry points" convention (ribbon/palette/right-click) for discoverability.

#### Staleness signaling

- On every Crosswalker-managed write to junction notes, scan materialized files; for each whose source recipe overlaps the changed junction, set frontmatter `crosswalker.stale_since: <ISO timestamp>`.
- The materialized file's own first-line callout is a Bases-style formula: if `stale_since` is set, the callout switches to `> [!warning] STALE since {{stale_since}}. Underlying junctions changed. Run "Crosswalker: Refresh materialized" to update.`
- The `_crosswalker/materialized.base` view shows a "stale" column (red badge) and lets the user bulk-refresh.

This is the exact pattern dbt uses for source-freshness checks (the dbt Discovery API exposes `freshness.freshnessStatus` as a queryable property), adapted to Obsidian's frontmatter idiom.

#### Verdict on the "no materialization at all" path

**Adopt it as the default; keep materialization as an opt-in command.** The arguments for keeping some materialization:
- Auditor evidence handoff genuinely benefits from a stable `.md` file with timestamp
- Obsidian Publish parity requires the projection to be a published file; embedded `\`\`\`base` blocks render on Publish but with limitations (per the dg-docs Obsidian Bases Publish plugin docs)
- Some users will *want* to checkpoint a quarter's coverage as a frozen artifact

The arguments against materializing-by-default:
- Breaks Obsidian convention for the 70% case
- Click confusion ("is this a real note?")
- Staleness becomes a maintenance burden
- Derived projections are not first-class evidence-link entities (junction notes are; pivots are projections of them — this is the brief's own framing)

**Conclusion**: the contrarian "no materialization" critique is correct *for browsing*, and the brief's instinct to materialize is correct *for sharing*. Split the two. This is the load-bearing v0.1.6 decision.

---

### Deliverable 8 — AI-Agent Surface Decision

**Ship in v0.1.6**: a single `crosswalker/SKILL.md` published in the Crosswalker repo, structured as an extension of `kepano/obsidian-skills`. This is ~3 days of work and unlocks all three agent use cases the brief lists.

#### What the SKILL.md contains (concrete v0.1.6 surface)

Following the `kepano/obsidian-skills/skills/obsidian-bases/SKILL.md` structure (which is the established standard):

```yaml
---
name: crosswalker-recipes
description: Author Crosswalker recipes (.base files using crosswalkerPivot view) for ontology/framework crosswalking in Obsidian. Use when working with .base files in a vault that has the Crosswalker plugin, or when the user mentions crosswalking, NIST x ISO, junction notes, coverage matrices, or recipe authoring.
---

# Crosswalker Recipes

Crosswalker is an Obsidian plugin for ontology crosswalking. Recipes are .base files
that use the custom `crosswalkerPivot` view to project junction notes into
coverage matrices, gap analyses, and similar views.

## When to use this skill
- User asks to write a recipe for crosswalking two frameworks
- User wants to debug why a recipe returns empty
- User wants to translate "show me NIST gaps" into a working .base file

## Vault prerequisites (inspect first)
- Confirm Crosswalker plugin is enabled: read .obsidian/plugins/crosswalker/manifest.json
- Confirm Bases is enabled: required core plugin
- Find available ontologies: search for files with property `ontology_id`
- Find existing junctions: search for files with property `junction_type`

## Recipe schema (extends Bases YAML)
[full schema with examples]

## crosswalkerPivot view config
[fields, allowed values]

## Common patterns (cookbook excerpts)
[5-8 worked examples]

## Debugging an empty recipe
1. Run with all filters relaxed; if still empty, the source ontology IDs are wrong
2. Check junction status values...
[diagnostic ladder]

## Materialization
[when and how to write to _crosswalker/materialized/]
```

This unlocks:
1. **"Agent inspects vault → writes custom recipe"** — Claude/Codex with Crosswalker SKILL + obsidian-cli SKILL can read the vault, identify imported ontologies, propose recipes
2. **"Agent translates natural-language intent"** — direct prompt → recipe YAML, validated against schema
3. **"Agent debugs why a recipe returned empty"** — the diagnostic ladder is in the SKILL itself

#### What is *not* in v0.1.6

- A custom in-Obsidian agent UI (the brief's anti-pattern #1: "no custom agent UI"). Crosswalker assumes the user uses Claude Code, Codex, or OpenCode externally; the SKILL.md is the integration surface, no plugin code required.
- An MCP server (v0.2+ if there's demand)
- Auto-recipe-generation on import (v0.3+; needs validated schema first)

#### Argued rationale for shipping v0.1.6

The kepano/obsidian-skills repo has 19k+ stars, is officially maintained by Obsidian's CEO, and proves the SKILL.md format is the right level of abstraction for plugin-specific agent capability. Crosswalker not shipping a SKILL.md while *also* claiming the recipe schema is "expert-friendly, not intuitive" is a contradiction: the LLM-assisted path is the cheapest and fastest way to make the schema intuitive *to the right interlocutor* (the LLM that the user is already chatting with). Three days of work; minimum viable; no risk of scope creep.

---

### Deliverable 9 — Recommended Changes to v0.1.6 Milestone Scope

The Crosswalker brief frames Part 1 (materialization UX) as load-bearing for v0.1.6 GA and Part 2 (broader query UX) as v0.2+ deferrable. The research confirms this split is correct *with three modifications*:

**Add to v0.1.6 GA scope**:
1. **The "no-materialization-by-default" architecture (Deliverable 7)** — this is *more* important than the originally-scoped materialization-with-banner work because it eliminates the click-confusion class of problems entirely. Estimated cost: same or less than the originally-scoped path because you're not building two file-emission code paths.
2. **The crosswalker SKILL.md (Deliverable 8)** — 3 days; massively deflates the "expert-friendly, not intuitive" criticism for novel recipes. This was scoped as v0.2+ in the brief; promote it.
3. **The shipped recipe set + cookbook (Deliverable 5 L1–L4)** — the brief's L1–L4 are not optional for "intuitive" claims to hold; without them, even the recipe picker is empty.

**Defer to v0.2+ explicitly**:
1. The full Hybrid modal wizard sub-flow (Deliverable 2's wizard branch) — the picker + inline path covers 80% of cases at GA; the wizard can ship in v0.2 without breaking anyone.
2. Marketplace, recommendation engine, agent-driven recipe synthesis, recipe-fork-and-customize flow.
3. Mobile-specific Bases improvements (let Obsidian core handle them).

**Keep as-scoped for v0.1.6**:
1. Materialization frontmatter banner + cssclasses + folder convention (Deliverable 7's *opt-in* path)
2. Staleness signaling
3. Error-handling callouts (Deliverable 6)
4. The `crosswalkerPivot` custom view itself

**Net effect on v0.1.6 GA shipping decision**: the milestone gets *narrower* (no full wizard, no marketplace) but *deeper* (the materialization path is rebuilt around no-materialization-by-default; agent surface is added). Total scope is roughly equivalent; risk is lower because the load-bearing decision (when to emit files) is now explicit.

---

## Recommendations

**Stage 1 — Before v0.1.6 GA (next 2 weeks)**:
1. Lock the no-materialization-by-default architecture. Move the originally-scoped click-time UX work to the *opt-in* materialization command path.
2. Author the crosswalker SKILL.md and validate it with one round of Claude Code authoring 3 novel recipes against a sample vault. **Threshold to ship**: ≥2 of 3 agent-authored recipes parse and execute correctly without manual fixup.
3. Author the 5–8 canonical recipes + their cookbook docs. **Threshold to ship**: a non-developer auditor (recruit from GRC community) can identify the right recipe for "show me NIST × ISO coverage gaps" in <2 minutes from the picker.
4. Implement error callouts for all 4 scenarios in Deliverable 6. **Threshold to ship**: simulated-failure tests pass for each.

**Stage 2 — v0.1.6 GA (ship)**:
1. Recipe picker (Hybrid Pattern D, but only the picker + inline-YAML branches; no full wizard).
2. Embedded `crosswalkerPivot` block in query notes; no materialization unless explicitly requested.
3. Materialization opt-in with cssclasses, banner, callout, folder convention, staleness.
4. SKILL.md published in repo; documented in onboarding.

**Stage 3 — v0.2 (next quarter)**:
1. Add the wizard branch to the Hybrid modal. **Trigger**: ≥3 user reports of "I didn't know how to start from scratch."
2. Recommendation engine surfacing recipes based on imported ontologies. **Trigger**: ≥10 recipes shipped or contributed.
3. Diagnose-recipe command (Deliverable 6 Scenario B's recovery action — useful but not load-bearing).

**Stage 4 — v0.3+ (defer)**:
1. Community recipe marketplace. **Trigger**: ≥3 third-party recipes circulating organically; or user requests cross 50.
2. MCP server / agent-action support. **Trigger**: SKILL.md alone proves insufficient — i.e., users complain that their agent can read but not *act*.

**Benchmarks that would change the recommendations**:
- If user testing shows the embedded `\`\`\`base` block confuses users *more* than a materialized file: revert to materialize-by-default with banner. (Unlikely given Bases adoption data, but the testable claim.)
- If kepano/obsidian-skills loses traction or Obsidian deprecates the SKILL format: switch to MCP-server first. (Currently extremely unlikely given 19k stars and CEO authorship.)
- If non-technical users still can't ship a novel recipe in <1 hour even with the SKILL.md: invest in the full wizard *first*, before marketplace. (Highest-leverage failure mode to plan for.)

---

## Caveats

1. **The Crosswalker challenge page itself, the v0.1.6 milestone page, and synthesis logs were not directly fetchable** from the user-supplied URLs at research time (permissions error). Recommendations are based on the comprehensive context in the user's task brief and on independently-verified evidence about Obsidian Bases, kepano/obsidian-skills, and the named adjacent products. If the on-page brief contains constraints not reflected here (e.g., specific recipe schema commitments from Ch 31, or the precise materialization lifecycle from Ch 28a), recheck the no-materialization-by-default recommendation against those — but the architectural argument should hold even if details differ.
2. **kepano/obsidian-skills/obsidian-bases SKILL.md is current as of late 2025/early 2026 and actively evolving.** Pin to a commit SHA when extending it for Crosswalker; expect breaking changes if Bases YAML schema changes (it is still being iterated by Obsidian core).
3. **OxO2 is in active development (per the 2025 paper)** and the API/UX referenced may shift. Use it as a directional reference for SSSOM-aware mapping browsers, not as a stable UX target.
4. **Several adjacent products (Power BI Visual Calculations, dbt Insights Copilot, dbt Fusion LSP)** are recent additions still being rolled out; their UX patterns are validated for direction but not yet proven at scale. The Hybrid Pattern recommendation does not depend on any of these — it is supported by the older, more proven patterns in Metabase, Looker, and Notion.
5. **The "<1 hr to novel recipe" target depends critically on the SKILL.md path working.** If the user's organization restricts external LLM use (common in compliance/GRC contexts — a primary Crosswalker audience), L1–L4 of the scaffolding plan must be sufficient on their own. Plan accordingly: invest enough in the cookbook and recipe documentation that an air-gapped GRC analyst can succeed without LLM assistance, just slower.
6. **Obsidian Publish parity with embedded base blocks is partial** (per dg-docs Obsidian Bases plugin documentation: published bases query only `dg-publish: true` notes; some Bases features unsupported). If "Publish parity" is a hard v0.1.6 requirement, the materialization opt-in becomes more important than this report frames it. Verify with the actual v0.1.6 milestone commitments before locking architecture.
7. **The Hybrid Pattern's biggest hidden cost is round-trip consistency** between the recipe picker, the inline YAML, and any future wizard. If the recipe schema (Ch 31) is not yet stable, do not commit to round-tripping — defer the wizard until the schema is frozen.
