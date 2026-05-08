---
title: "Ch 32 deliverable A: Intuitive query UX — hybrid Pattern D with materialization-folder spec"
description: "Fresh-agent research deliverable A for Challenge 32. Adopt hybrid 'Recipe Picker → Wizard → YAML' pattern (Pattern D), but ship only the recipe-picker + cookbook docs in v0.1.6. Wrap Bases' native UI rather than fighting it; canonical entry point is `Crosswalker: New query from recipe…` palette command. Materialization (v0.1.6 critical path) ships as opt-in command-driven export to a clearly-marked `_crosswalker/` folder with YAML banner, cssclasses, folder README, Iconic-style folder icon, and a `Re-materialize` command. Click behavior defaults to Live Preview (read-only via `crosswalker-generated: true` frontmatter and CSS class hook). Recommends 'no-materialization' as the default for browsing — embedded `\\`\\`\\`base` code blocks in normal notes — and reserves true materialization for the explicit 'share with auditor / Publish parity' use case. Crosswalker SKILL.md modeled directly on `kepano/obsidian-skills/obsidian-bases` is the v0.1.6 minimum-viable agent surface."
tags: [research, deliverable, query-ux, hybrid-pattern-d, recipe-picker, materialization-folder, kepano-obsidian-skills, agent-skill, ch-32, deliverable-a]
date: 2026-05-08
sidebar:
  label: "Ch 32a · Hybrid + materialization-folder spec"
  order: -20260508.3
---

:::tip[Origin and lifecycle]
Fresh-agent research deliverable produced 2026-05-08 in response to [Challenge 32: Intuitive query UX](/crosswalker/agent-context/zz-challenges/32-intuitive-query-ux/). One of two parallel deliverables ([B: embedded `base` blocks no-materialization-default](/crosswalker/agent-context/zz-research/2026-05-08-challenge-32-deliverable-b-embedded-blocks-no-mat-default/)). Both converge strongly on hybrid Pattern D + ship `crosswalker-bases` SKILL.md in v0.1.6 + adopt "no-materialization-by-default" as the right framing. This deliverable is more thorough on the materialization folder convention spec (Iconic plugin, folder README, CSS class). Preserved verbatim.
:::

# Crosswalker Challenge 32 — Intuitive Query UX: From Intent to a Working `.base` File

## TL;DR

- **Adopt a hybrid "Recipe Picker → Wizard → YAML" pattern (Pattern D), but ship only the recipe-picker + cookbook docs in v0.1.6.** Wrap Obsidian Bases' native UI rather than fighting it; the canonical entry point should be a command-palette command (`Crosswalker: New query from recipe…`) that emits a `.base` file pre-populated with a YAML recipe block, then hands the user back to Bases' built-in view picker, filter editor, and source-mode toggle. Do not build a custom drag-and-drop builder.
- **Materialization (the v0.1.6 critical path) should ship as opt-in, command-driven export to a clearly-marked `_crosswalker/` folder with a YAML banner declaring the file derived/stale-detectable, a folder-level README, an Iconic-style colored folder icon, and a "Re-materialize" command.** Click behavior should default to Live Preview (read-only via a `crosswalker-generated: true` frontmatter flag and a CSS class hook), with a clear "Open source" affordance. Strongly consider that for many use cases (sharing with auditors, Publish parity), an embedded Base in a normal note is the better answer than emitting a new file — recommend "no-materialization" as the default path for everything except the Quarterly-Audit Snapshot use case.
- **For AI-agent assistance in v0.1.6, ship a single, minimal-surface deliverable: a `crosswalker-bases` Agent Skill (modeled directly on `kepano/obsidian-skills/obsidian-bases`) that documents the recipe vocabulary, the junction-edge data model, and 6–10 worked recipe examples.** Defer in-plugin LLM features (NL→`.base`, empty-recipe debugger) to v0.2+. The recipe registry, recommendation engine, and full template gallery are v0.2+ work; **v0.1.6 milestone scope should not expand** beyond (a) opt-in materialization command, (b) 5–8 canonical recipes shipped as `.base` files in a `_crosswalker/recipes/` examples folder, (c) a cookbook docs page, (d) the agent skill, and (e) a recipe-validation error surface in Bases-compatible YAML.

---

## Key Findings

1. **Every adjacent BI/database tool that "works" for non-technical users converges on the same UX pattern**: a curated **starting object** (Looker Explore, Metabase Question, Tableau Worksheet, Notion/Airtable View, Power BI Visual) plus a **type/layout picker** plus a **field-level configurator**, with an escape hatch to source code (SQL, LookML, YAML) for power users. None of them ship a "wizard." All of them ship "view-type pickers."
2. **Obsidian Bases already ships exactly this pattern natively**: `Bases: Create new base` → table view by default → `+ New view` to add table/cards/list/map → Filters/Properties/Formulas configurators → and an in-flight feature request for a "Source mode" YAML toggle. **Crosswalker should ride this rail, not replace it.** Anything Crosswalker builds that fights or duplicates Bases' UI will (a) confuse users, (b) break when Bases evolves, and (c) violate Obsidian's "every file is a file" philosophy.
3. **Ontology-mapping tools (BioPortal, NIST OLIR, OxO/OxO2) are search-first, not authoring-first.** Users arrive with intent ("find mappings between MeSH and MONDO" / "find SCF↔NIST CSF mapping") and use a faceted search box + filter sidebar. They do not author queries. This means Crosswalker's "intent" surface for the *consumer* persona (auditor browsing existing crosswalks) should be a **search-and-browse view over the recipe registry**, not a query builder. The query-authoring surface is for the *curator* persona only.
4. **SSSOM is the de facto serialization standard** for cross-ontology mappings (TSV with embedded YAML header), and it is the right interop format for Crosswalker exports. The materialization story should anticipate SSSOM-TSV as a first-class export target alongside Markdown.
5. **Bases YAML is small, readable, and tooling-friendly.** It has five sections (filters, formulas, properties, summaries, views), supports a `formula.X` reference scheme, and has well-known gotchas (unquoted `:` in display names, mismatched quotes in formula strings, undefined-formula references, Duration arithmetic). These are the four error scenarios Crosswalker must surface — and `kepano/obsidian-skills/obsidian-bases` already documents them in agent-readable form.
6. **kepano/obsidian-skills sets a precedent: the official answer to "how should AI write Obsidian files" is portable Markdown skill files, not in-app LLM features.** Crosswalker should publish a `crosswalker-bases` skill rather than embedding an LLM in the plugin. This aligns with Obsidian's CEO's stated direction (Steph Ango / kepano), reduces v0.1.6 scope, and is what serious agent users (Claude Code, Codex, Cursor, OpenCode) already expect.
7. **Mobile Bases works, but the YAML-edit path does not degrade gracefully.** Bases' GUI (filters, view picker, table) is usable on phone-sized Obsidian; raw YAML editing of a `.base` file is technically possible but painful on a 6" screen. The v0.1.6 mobile story is "consume materialized files and pre-built recipe `.base` files; don't author new ones." This is fine — most GRC users author on desktop and review on mobile.
8. **The "no materialization" alternative is genuinely viable for most projections.** Embedded Bases (`base` code blocks inside ordinary Markdown notes) give you (a) a stable canonical file the auditor can see, (b) live data, (c) Publish parity, and (d) zero staleness. Materialization should be reserved for the narrow "I need a frozen Q1-2026 snapshot for the 7-year audit retention" case.

---

## Details

### 1. Cross-Reference Matrix: How Adjacent Products Get a User from Intent to Query

| Product | Entry point | Authoring path | Discoverability of patterns | Mobile | Errors / feedback | Agent-friendly? |
|---|---|---|---|---|---|---|
| **Looker Explore** | "Explore" menu lists curated Explores grouped by model. | Field picker (dimensions/measures) → click → auto-run; Pivot via field gear icon; Filters tab. LookML/SQL is hidden but accessible via "SQL" tab. | "Quick Start" modeled analyses on blank Explore; Looks (saved queries); Boards. | Limited; mostly read dashboards. | Inline error banner ("Measures may not reference other measures"); SQL tab for debugging. | LookML is text/git-versioned → high. |
| **Tableau** | New Worksheet → Data pane on left. | Drag fields to **Rows / Columns / Marks / Filters / Pages** shelves; Show Me suggests chart type; double-click for auto-place. | "Show Me" panel; sample workbooks. | Tableau Mobile is consume-only. | Visual immediate; no syntax errors because no code surface. | Low — proprietary `.twb` XML. |
| **Power BI Desktop** | New Report → Visualizations pane (icons) + Fields pane. | Click visual icon → drag fields into Axis/Legend/Values wells; "Personalize this visual" lets readers re-pick visualization. Power BI Report Builder is the paginated/print path. | AppSource visual marketplace; Quick Insights. | Personalize works on iOS/Android tablets, not phones. | Visual placeholder shows "drag a field here"; DAX errors inline. | Medium — DAX text but proprietary. |
| **dbt Cloud Insights** | Insights pane in dbt UI. | SQL editor with autocomplete + dbt metadata + Catalog cross-link; saved Insights; Copilot codegen. | Catalog browse → "query this model"; saved/shared insights. | Web-based; tablet-OK. | Live SQL errors; query history. | Very high — text+metadata, Copilot built in. |
| **Metabase** | + New → Question. | **Two modes**: graphical Query Builder (Data → Filter → Summarize blocks, preview each step) **or** Native SQL editor (Metabot for NL→SQL). One-way "Convert to SQL" toggle. | Browse Collections; Models; Metrics; saved Questions. | Mobile dashboards; question authoring is desktop-class. | Step-level preview button; SQL errors surfaced verbatim. | High — Metabot does NL→SQL natively. |
| **Notion databases** | `/database` slash command, or click `+` next to view tabs. | "+ New view" opens a small modal with a **type picker** (Table / Board / Timeline / Calendar / List / Gallery), name field, then a Filter/Sort/Group panel. | Template gallery; linked databases. | Works on phone; type picker is touch-friendly. | Inline filter widgets; no code so no syntax errors. | Medium — public API, no native LLM. |
| **Airtable views** | View sidebar `+` button. | Layout picker (Grid / Form / Calendar / Gallery / Kanban / Timeline / Gantt / Section), name + collaboration scope (Collaborative / Personal / Locked), then per-view config panel. **Interface Designer** adds a separate dashboard-style page builder with "table layouts" vs "blank/element" choice. | Marketplace, template gallery. | Mobile app supports views well. | Field-level validation; Interface preview toggle. | Medium — REST API, no native LLM. |
| **BioPortal Mappings** | "Mappings" tab inside an ontology page; cross-ontology Search. | Faceted browse: pick source ontology → term → see mappings tab. **No authoring UI for end users**; mappings are submitted via REST API or LOOM-generated. | "Recommender" suggests ontologies for a given dataset. | Web-responsive. | API errors; UI is read-mostly. | High — REST + RDF + SPARQL endpoint. |
| **NIST OLIR portal** | Informative Reference Catalog page → search box + status filter. | **Pure read/search**; authoring happens via spreadsheet template submission, reviewed by NIST. **DRM Analysis Tool** lets users do cross-reference comparison reports between two OLIRs. | Status field (Initial / Final), Owner Authority filter, Focal Document filter. | Web-only. | None for end users. | Low — output is PDF/CSV. |
| **OxO / OxO2 (EBI)** | Search box; "explore" with hop-distance slider. | Enter source IDs and target ontology; results render as a network graph + table. OxO2 (2025) adds SSSOM provenance, author/reviewer, and logical soundness. | Distance-controller "neighbourhood" exploration. | Web-responsive. | Missing-label warnings; "may not be true equivalence" caveat. | High — REST API, SSSOM TSV. |
| **Obsidian Bases (native)** | Right-click folder → New base, or `Bases: Create new base` palette command. | Default Table view → Filters / Properties / Formulas buttons in toolbar → `+ New view` for additional layouts (table / cards / list / map). YAML lives at `.base` file but **no built-in source-mode toggle yet** (open feature request #103196). | Bases of bases (a Base whose source is `*.base` files); embed in note via ` ```base ` code block; sidebar drag-drop. | Yes — works on Obsidian 1.10+ phone/tablet; GUI degrades cleanly to single-column. | YAML errors render inline ("Cannot edit formula box"); undefined-formula references silently produce empty columns; quoting bugs are common. | High — text YAML, kepano ships an official agent skill (`obsidian-bases`). |

**Pattern that works across the board**: *Curated starting object → type/layout picker → field-level configurator → optional code escape hatch.* Every successful tool ships exactly this. Wizards are conspicuously absent. Pre-generated thousand-recipe marketplaces are also absent — Notion and Airtable expose 6–8 layout types, period; Looker Explores and Metabase Models are *modeled by data engineers*, not pre-shipped. **Crosswalker should mirror Bases' existing pattern, not invent a new one.**

### 2. Pattern Verdict: Wizard vs Recipe-Picker vs Inline vs Hybrid

**Recommendation: Pattern D (Hybrid), staged. Ship the Recipe Picker layer in v0.1.6; defer wizards.**

**Argument:**

- **Pattern A (Wizard)** is the wrong default. Wizards work for *one-shot installer flows* (set up sync, configure your vault), not for repeat authoring. Compliance auditors and ontology curators will author dozens of recipes per audit cycle; a 4-step modal becomes hostile after the third use. No adjacent product (Looker, Tableau, Power BI, Metabase, Notion, Airtable, dbt) ships a wizard for query authoring. **Reject as primary entry point.** Acceptable only as a one-time onboarding nudge or a "Build from scratch" deep menu.
- **Pattern B (Recipe Picker)** matches what works. It mirrors Notion/Airtable's view-type picker, Tableau's "Show Me," and Looker's modeled-analysis Quick Start. Crosswalker's user base is small enough (compliance auditors, GRC analysts, ontology researchers, taxonomy editors — all curators, not consumers) that **8–15 canonical recipes** ("Coverage Matrix," "Crosswalk Density," "Freshness Heatmap," "Junction Provenance," "Orphan Concepts," "Bidirectional Conflict") covers ~80% of intent. Anti-pattern: **do not pre-generate thousands**. Ship 8 well-curated recipes in v0.1.6, learn from telemetry/feedback, grow to ~20 in v0.2.
- **Pattern C (Inline editor)** is necessary but not sufficient. Power users (the ontology-researcher persona) will edit YAML directly; the Obsidian forum already has open feature requests for a Bases "Source mode" toggle. Crosswalker should not build its own YAML editor — it should rely on Obsidian's native code-block editor when users open a `.base` file in source mode, and it should ship YAML schema + autocomplete via the agent skill. **Accept as power-user surface; do not invest UI here.**
- **Pattern D (Hybrid)** is what every successful adjacent product actually is. Metabase: query builder + SQL editor toggle. Looker: Explore field picker + LookML. Power BI: visual personalization + DAX. Tableau: shelves + calculated fields. **Recipe picker is primary; wizard is optional fallback for "Build from scratch"; YAML edit is power escape hatch.**

**Concrete v0.1.6 entry point**:
1. Command palette: `Crosswalker: New query from recipe…` → opens a fuzzy-search modal listing canonical recipes with one-line descriptions.
2. User selects a recipe → small parameter form (which junction set? which two ontologies? scope folder?) → emits a `.base` file at the user's chosen path, **opens it in Obsidian Bases' native UI**, hands off.
3. Power users skip the modal: they copy a recipe `.base` file from `_crosswalker/recipes/` and edit YAML directly.
4. **No custom drag-and-drop, no custom view picker, no custom modal that fights Bases.** Crosswalker's added value is the recipe vocabulary (the YAML keys inside a `crosswalkerPivot:` block), not new UI chrome.

### 3. Mobile vs Desktop UX Matrix

| Surface | Desktop | Tablet (iPad) | Phone | Verdict |
|---|---|---|---|---|
| Recipe-picker modal (v0.1.6) | ✅ Full | ✅ Full | ✅ Works (Obsidian modals are mobile-friendly) | Ship for all platforms |
| Bases native filter / view picker | ✅ | ✅ | ✅ (degrades to single column) | Riding Obsidian's rail = free mobile support |
| YAML source-mode editing | ✅ | ⚠️ Painful | ❌ Don't | Desktop-only, in practice |
| Materialized-file consumption | ✅ | ✅ | ✅ | This is the *primary* mobile use case for auditors |
| Wizard (deferred) | ✅ | ⚠️ | ❌ | If ever built, desktop-first |
| LLM agent assist | N/A in plugin | N/A | N/A | Lives outside Obsidian (Claude Code, Cursor, etc.) |

**Mobile-degradation principle**: The recipe-picker modal and materialized-file viewing degrade gracefully. Authoring novel YAML does not. **Tell users on mobile: "open and use; author on desktop."**

### 4. Recipe Discoverability — v0.1.6 Minimum + v0.2+ Roadmap

**v0.1.6 (ship now):**
- A `_crosswalker/recipes/` folder containing 5–8 canonical `.base` files (Coverage Matrix, Crosswalk Density, Freshness Heatmap, Orphan Concepts, Bidirectional Conflict, Junction Provenance, Mapping Recall, Audit Snapshot).
- A `Crosswalker: New query from recipe…` command-palette command using a Fuzzy-Suggest modal (Obsidian API native — same component the Quick Switcher uses).
- A single `recipes.md` cookbook file with a list of recipes, intents, and YAML excerpts.
- An Obsidian "Bookmarks" group seeded with the recipe folder so users can pin it to the sidebar.

**v0.2+:**
- Categorized registry (one folder per category: `coverage/`, `freshness/`, `provenance/`, `conflict/`, `meta/`).
- Search-by-intent (the user types "find concepts only mapped one direction" → fuzzy match recipe descriptions, not just titles).
- Community-contributed recipe sharing (GitHub-hosted `crosswalker-recipes` repo; install via `npx skills add` analog).
- Per-recipe usage telemetry (opt-in) → simple "most used in this vault" sort.
- **No** recommendation engine, **no** marketplace storefront, **no** ratings — the community is too small for any of those to work; they will look empty and embarrassing.

### 5. Learning-Curve Scaffolding Plan

| Layer | Audience | v0.1.6? | Format |
|---|---|---|---|
| **Concept docs** ("What is a junction? What is an edge predicate?") | All | ✅ | 1 page in plugin README; 1 page in vault `_crosswalker/docs/concepts.md` |
| **Cookbook** (recipe → YAML → screenshot) | GRC analyst, taxonomy editor | ✅ | `_crosswalker/docs/cookbook.md`, ≤ 8 recipes |
| **Tutorial** (NIST CSF ↔ ISO 27001 worked example end-to-end) | New user | ✅ | One walkthrough page; example vault folder |
| **Template gallery** (browseable in-app) | All | ⚠️ Lite — file-system folder only | v0.2+: dedicated picker UI |
| **Agent Skill** (`crosswalker-bases`) | LLM + power user | ✅ | `kepano/obsidian-skills`-style SKILL.md |
| **Guided wizard** | First-time user | ❌ Defer | v0.2+ |
| **LLM-assisted authoring inside plugin** | All | ❌ Defer | v0.3+ if at all; agent skill covers external case already |

**Principle**: lean hard on docs in v0.1.6. Don't build UI scaffolding when a Markdown file in `_crosswalker/docs/` solves the same problem at 1% the engineering cost. Obsidian users *read Markdown* — that's the entire product premise.

### 6. Error-Handling Design — Feedback Loops for 4+ Scenarios

| Scenario | What user sees today (Bases default) | What Crosswalker should add |
|---|---|---|
| **Recipe references nonexistent ontology ID** (e.g., `NIST_CSF_2.0:GV.OC-99` where -99 doesn't exist) | Empty rows; silent miss. | Add a `formula.junction_validity` formula that flags missing IDs; render a colored "?" with tooltip "Not found in vocabulary `nist_csf_2.0`". Surface in a dedicated "Validation" view inside each canonical recipe. |
| **Recipe primitive composition has no result** (filter is over-restrictive) | Bases shows "0 results" with no hint why. | Inject a "Why empty?" formula column that explains which filter removed all rows (e.g., "All 47 junctions filtered out by `freshness > 90d`"). Provide a `Crosswalker: Diagnose empty base` command-palette action that runs each filter clause individually and reports counts. |
| **Malformed `.base` file** (unquoted `:` in displayName, mismatched quotes in formula) | Bases throws a generic YAML error toast; in some Obsidian builds the formula editor "stops you from editing" (forum bug 112534). | Pre-commit: Crosswalker validates emitted `.base` files against the Bases schema before writing. Post-edit: a `Crosswalker: Validate this base` command runs and shows file-line-precise errors with fix suggestions copied from the agent skill's "Common issues" list. |
| **Custom view (`crosswalkerPivot`) fails to register** | Bases falls back to default table; user thinks recipe is "broken." | If a custom view type is referenced but not registered (e.g., user disabled Crosswalker but kept the `.base` file), render a placeholder card in the Bases area: "View type `crosswalkerPivot` not loaded — enable Crosswalker plugin or switch to Table view." Provide a "Convert to standard table" button. |
| **Stale materialization** (covered separately below) | Nothing — file looks fresh. | Frontmatter `crosswalker.staleSince: 2026-04-12T…` + CSS class on the file in the explorer + a "Re-materialize" callout at the top of the file. |

### 7. Materialization UX Design (CRITICAL for v0.1.6)

**Headline recommendation: ship materialization in v0.1.6 as opt-in, command-driven, narrowly-scoped, and prominently signaled — but make embedded Bases the *default* recommendation in docs.**

#### 7.1 The contrarian question: should derived projections be vault files at all?

**Mostly no.** Three of the four use cases for materialization have a better answer than emitting a file:

| Stated use case | Better non-materialization answer |
|---|---|
| "Share with auditor" | Embed a `base` code block in a normal Markdown note, share the note. Auditor sees live data, no staleness. |
| "Publish parity" | Same — embedded base in a published note works on Obsidian Publish. |
| "Hover-preview / quick glance" | Bases sidebar drag-drop already works. Add a `Crosswalker: Show coverage for current note` command that opens a side-panel `.base` view scoped to `this`. |
| **"Frozen audit snapshot for 7-year retention"** | **This is the one real materialization case.** A point-in-time evidence artifact must be a frozen file. |

**Therefore**: keep materialization in v0.1.6 (the audit-snapshot case is real and time-sensitive), but the cookbook should *lead* with embedded-base patterns and present materialization as the special case for retention/snapshots.

#### 7.2 Click behavior

When user clicks `_crosswalker/audit/2026-Q1/coverage-matrix.md`:
- **Default: Live Preview**, scrolled to the top, where a callout banner shows: `> [!info] Materialized snapshot — generated 2026-04-09T14:22Z from 47 junctions. [Re-materialize] [View source recipe]`.
- The body of the file is rendered Markdown (the materialized table) — read-only feel.
- Frontmatter includes `crosswalker.generated: true`, `crosswalker.recipe: coverage-matrix`, `crosswalker.generatedAt`, `crosswalker.sourceHash` (hash of the underlying junction set at generation time).
- A CSS class hook (`.crosswalker-generated`) is added to the leaf via the plugin's view-load hook. Theme/snippet authors can dim, badge, or color these. Default snippet ships with the plugin: file-explorer entries get a small `⊕` prefix glyph and a muted color.

#### 7.3 Coexistence with canonical user content

Obsidian's convention is "every file is canonical user content," and materialization breaks that. Mitigations, in order of strength:

1. **Folder convention**: everything materialized lives under `_crosswalker/` (leading underscore sorts last; many users already use `_attachments`, `_templates` patterns).
2. **Folder-level `README.md`** at `_crosswalker/README.md` explaining: "This folder is generated by the Crosswalker plugin. Files here are overwritten on re-materialize. Do not edit by hand."
3. **Folder icon** via either the `Iconic` plugin's rule system or a CSS snippet shipped with Crosswalker, giving the folder a distinctive color/icon (e.g., a recycle/refresh glyph).
4. **Per-file frontmatter** flag (`crosswalker.generated: true`) — machine-readable, queryable, and the basis for the CSS class.
5. **Edit-guard (optional, v0.2+)**: hook the file-modify event; if a user edits a generated file, show a one-time toast: "This file is regenerated by Crosswalker. Your edits will be lost on next materialize. [Got it] [Convert to canonical]."
6. **Do NOT** use `.gitignore`-style hiding by default — auditors need to see these files. Hiding breaks the entire reason for materializing.

#### 7.4 Bases-convention coherence

The mental model Crosswalker should teach: **"`_crosswalker/` is generated; it's normal Markdown but treat as read-only. Edit the recipe `.base` file, not the materialized output."** This mirrors how dbt users think about their `target/` folder, how Hugo users think about `public/`, and how Sphinx users think about `_build/`. The leading-underscore + README pattern is widely understood.

#### 7.5 Discovery

- **Folder browse**: bookmarked sidebar entry (Crosswalker auto-bookmarks `_crosswalker/audit/` on first materialize).
- **Bases view**: a recipe in `_crosswalker/recipes/all-snapshots.base` filters `where crosswalker.generated == true` and groups by `crosswalker.recipe` — discoverability without a custom UI.
- **Command palette**: `Crosswalker: Open materialized snapshots` jumps to the folder.
- **Dataview-style index page** auto-maintained at `_crosswalker/index.md`.

#### 7.6 Staleness signaling

- On materialize, store `crosswalker.sourceHash` (hash of input junction set) in frontmatter.
- A background watcher (debounced, opt-in) recomputes the input hash on junction changes; when mismatch, sets `crosswalker.staleSince`.
- File-explorer CSS class `.crosswalker-stale` adds a yellow dot.
- Inside the file, the header callout flips from `[!info] Materialized snapshot…` to `[!warning] Stale — underlying junctions changed at 2026-04-12T08:11Z. [Re-materialize]`.
- A `Crosswalker: List stale snapshots` command surfaces all stale files at once.
- **Do not auto-rematerialize.** Auditors *want* the frozen artifact.

#### 7.7 Materialization decision rule (recommended cookbook framing)

Tell users:
> **Default to embedded Bases.** Use `_crosswalker/` materialization only when you need: (a) a point-in-time frozen artifact for audit retention, (b) export to a system that can't render Bases, or (c) SSSOM-TSV interop. Otherwise, embed a `base` code block in a regular note.

### 8. AI-Agent Surface Decision

**v0.1.6 ships a single deliverable: a `crosswalker-bases` Agent Skill** modeled directly on `kepano/obsidian-skills/obsidian-bases`. It is a Markdown file (plus a `references/` folder) committed to a public GitHub repo and installable via:

```
npx skills add github:[org]/crosswalker-skills
```

Its contents:
- The Crosswalker recipe vocabulary (every YAML key under `crosswalkerPivot:`, with allowed values).
- The junction edge data model (predicates: `equivalent`, `narrower`, `broader`, `related`, etc., per OLIR/SSSOM conventions).
- 6–10 worked examples (NL intent → `.base` YAML).
- The Bases gotchas list (quoting, formula scoping, Duration arithmetic).
- An "empty results debugging" protocol the agent runs before declaring a recipe broken.

Why this and not in-plugin LLM features:
- Aligns with kepano's stated Obsidian direction ("toolchain, not bolted-in AI").
- Zero net-new dependencies (no API keys to manage, no inference billing).
- Works with whatever model the user already pays for (Claude, GPT, Gemini, Codex, OpenCode).
- Composable with `kepano/obsidian-skills` (same skill spec, same install path).
- v0.1.6 ships in days, not months.

**Deferred (v0.2+ or never):**
- In-plugin "ask Crosswalker" chat panel — high implementation cost, low marginal value over external agents.
- NL→`.base` modal inside the plugin — same reasoning.
- Auto-debug-empty-recipe inside plugin — partially covered by the "Diagnose empty base" command in §6; full LLM debugging is v0.2+ via the skill.

### 9. Recommended Changes to v0.1.6 Milestone Scope

**Net effect: scope is tightened, not expanded.** Specifically:

**In v0.1.6:**
1. ✅ Opt-in materialization command (`Crosswalker: Materialize this recipe`) — already planned; add the frontmatter flags, callout banner, CSS class, and folder README described in §7.
2. ✅ 5–8 canonical recipes shipped as `.base` files in `_crosswalker/recipes/`.
3. ✅ `Crosswalker: New query from recipe…` command (Fuzzy-Suggest modal — ~1 day of work using Obsidian's `FuzzySuggestModal` API).
4. ✅ Cookbook + concept-docs Markdown pages.
5. ✅ `crosswalker-bases` Agent Skill repo.
6. ✅ Recipe-validation: `Crosswalker: Validate this base` command using existing YAML-parse + a hand-written check list from §6.
7. ✅ Custom-view registration fallback ("View type not loaded" placeholder).

**Cut from v0.1.6 (move to v0.2+):**
- Wizard / multi-step modal (Pattern A).
- Categorized recipe registry / marketplace UI.
- Recommendation engine, telemetry-driven sort.
- Edit-guard on materialized files.
- "Diagnose empty base" full LLM-driven analysis (ship the simple per-clause counter version in v0.1.6; LLM in v0.2+).
- Background staleness watcher (manual `Re-materialize` only in v0.1.6; ship watcher in v0.2).
- In-plugin LLM chat or NL→`.base` modal.
- SSSOM-TSV materialization target (Markdown only in v0.1.6; SSSOM in v0.2).

**Anti-patterns explicitly rejected:**
- Custom drag-and-drop query builder. ❌
- Replacing or duplicating Bases' built-in view picker. ❌
- Forking Looker/Tableau/Power BI UX. ❌
- Pre-generating thousands of canonical recipes. ❌
- Forcing all users through a wizard. ❌
- A web-based query builder outside Obsidian. ❌
- Modal UI that fights Bases. ❌

---

## Recommendations (Staged, Concrete, Reversible)

### Stage 1 — v0.1.6 (ship now, ~2–3 weeks of focused work)
1. **Build the Recipe Picker command** (`FuzzySuggestModal` over `_crosswalker/recipes/*.base`). Each pick copies the file to a user-chosen target path, then opens it in Bases. ~1 day.
2. **Author 5–8 canonical recipes** as actual `.base` files. Test each on a real NIST CSF ↔ ISO 27001 vault. ~3–5 days.
3. **Materialization command + frontmatter banner + CSS class + folder README**. ~3–4 days.
4. **Cookbook docs** (`recipes.md`, `concepts.md`, `materialization.md`, `embedded-vs-materialized.md`). ~2 days.
5. **Publish `crosswalker-bases` skill repo**, modeled on `kepano/obsidian-skills/skills/obsidian-bases/SKILL.md`. ~2–3 days.
6. **Validate-this-base command** with the four error scenarios from §6. ~1 day.
7. **Custom-view fallback placeholder**. ~½ day.

**Threshold to revisit**: if after 30 days of v0.1.6 release, the top three GitHub issues are about authoring novel recipes (not consuming canonical ones), accelerate the v0.2+ template gallery and the in-plugin diagnostic LLM helper. If the top issues are about staleness, prioritize the background watcher.

### Stage 2 — v0.2 (3–6 months out)
1. Categorized recipe registry with browse/search UI (still inside Obsidian, still using native components).
2. Background staleness watcher.
3. SSSOM-TSV export target.
4. "Build from scratch" wizard — only if user research shows demand.
5. Edit-guard on materialized files.
6. LLM-driven diagnose-empty-base (called via the skill, not bundled).

### Stage 3 — v0.3+ (open-ended)
- Community recipe-sharing repo.
- Optional in-plugin chat surface (only if external skill UX is consistently failing for users).
- Recommendation/telemetry layer (only if recipe count exceeds ~30).

### Benchmarks that would change these recommendations
- **If Bases ships official source-mode YAML toggle**: revisit §2 — the inline-editor case becomes free; nothing for Crosswalker to build. Likely; an Obsidian forum feature request is open.
- **If Bases ships a public View API for plugins to register custom view types**: prioritize `crosswalkerPivot` view registration in v0.1.6 instead of relying on Markdown materialization for non-table layouts.
- **If kepano/obsidian-skills extends to vault-content skills (not just file-format skills)**: align the Crosswalker skill with that convention, or contribute upstream.
- **If telemetry shows the typical user authors >10 recipes per audit cycle**: invest in v0.2 template gallery sooner.
- **If telemetry shows >30% of materialized files become stale within 7 days**: ship the background watcher in a v0.1.7 patch rather than v0.2.

---

## Caveats

- **Bases is still evolving.** As of Obsidian 1.10, Bases has Table / Cards / List / Map views, with a public roadmap commitment to more layouts. Source-mode YAML toggle is a community-requested feature, not yet shipped. Designs in this report assume the current API surface and may need to flex if the Bases team ships an official "Source mode" toggle, a plugin-registrable view-type API, or a built-in YAML autocomplete. None of those would invalidate the recommendations; most would simplify them.
- **The Bases formula editor has an active bug** (forum thread 112534, "can't edit formula in large vaults") — Crosswalker's validation tooling should not assume the editor works; YAML-level validation via direct file parse is more reliable.
- **OxO2 (June 2025) is the future of OxO** but the production EBI deployment may still be OxO v1 at the time of writing; SSSOM provenance fields are stable, so SSSOM-TSV export plans are safe regardless.
- **NIST OLIR's "DRM Analysis Tool"** is the closest external analog to Crosswalker's coverage-matrix recipe; it's not a UX model to copy (it's a static report tool), but it's a useful reference for which output formats auditors expect (CSV, PDF).
- **The `kepano/obsidian-skills` repo is recent and actively evolving.** The skill spec it implements (Anthropic's Agent Skills) is a 2024–2025 spec; if it changes, the `crosswalker-bases` skill must follow. This is low-cost to track.
- **"Compliance auditor" is not a monolithic persona.** Internal IT-audit analysts, external Big-4 auditors, ISO certification auditors, and FedRAMP 3PAOs have *very* different tolerance for in-app YAML. The recommendations here optimize for the analyst-side curator (vault owner) and the consumer-side reviewer (auditor reading materialized output). They do not optimize for an auditor authoring recipes — that's an explicit non-goal.
- **Mobile authoring is genuinely impractical** and this report does not try to solve it. The mobile story is "consume; don't author." This is a deliberate scope choice, not an oversight.
- **The agent-skill recommendation depends on the user already having an LLM agent installed** (Claude Code, Cursor, Codex, OpenCode, Windsurf, etc.). For users without one, the cookbook + canonical recipes still cover ~80% of intent without any AI surface. No user is forced into the AI path.
- **Some claims about adjacent products' UX evolve quickly** (Metabot/dbt Copilot/Power BI Copilot are all 2024–2026 features that are still maturing). The pattern conclusion — "everyone ships a hybrid graphical + text-source escape hatch" — is robust across time, but specific feature names may drift.
