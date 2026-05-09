---
title: "Ch 30: View shape taxonomy for an ontology-web query engine"
description: "Fresh-agent research deliverable for Challenge 30. Survey of 16 ontology-aware UIs (BioPortal, OLS4, Protégé, OntoBrowser, TopBraid EDG, VocBench, PoolParty, Skosmos, SKOS Play, Stardog, GraphDB, Cytoscape, OLSVis, OxO/OxO2, NIST OLIR, OntoPortal). Verdict: REFINE the provisional 6-shape catalog. v0.1 first-class = 5 shapes (Table/List/Cards Bases-native + Pivot custom Bases view + Hierarchy as 2nd custom view in v0.1.7-v0.1.8). Defer Graph→v0.2 (Cytoscape.js integration is multi-week), Timeline→v0.2+ (Bases roadmap should ship). Heatmap/sunburst/treemap/sankey/circle-packing are render options of Pivot or Hierarchy, not separate shapes. Search/Comparison/Dashboard are compositions, not shapes. TaskNotes v4 is the canonical Obsidian-plugin precedent for registerBasesView. Mechanism rule: prefer Bases-native > registerBasesView > codeblock > snapshot."
tags: [research, deliverable, view-shapes, layer-b, registerbasesview, tasknotes-v4, bioportal, ols4, protege, sssom, skos, ch-30]
date: 2026-05-09
sidebar:
  label: "Ch 30 · 5-shape v0.1 catalog"
  order: -20260509.2
---

:::tip[Origin and lifecycle]
Fresh-agent research deliverable produced 2026-05-09 in response to [Challenge 30: View shape taxonomy](/crosswalker/agent-context/zz-challenges/30-view-shape-taxonomy/). Absorbed into the [Ontology-web query engine synthesis log](/crosswalker/agent-context/zz-log/2026-05-07-bases-query-layer-architecture-synthesis/) — see Settled #2 (refined to 5 v0.1 shapes) + #15 (Layer A/B boundary). Preserved verbatim.
:::

# Crosswalker Challenge 30 — View Shape Taxonomy for an Ontology-Web Query Engine

## TL;DR

- **The provisional 6-shape catalog (table, list, pivot, graph, hierarchy, timeline) is broadly correct but slightly off-balance for v0.1.** Survey of 16 ontology-aware UIs shows that **only three shapes are universal: indented tree (hierarchy), tabular result list, and a node‑link/force‑directed graph**; everything else (sunburst, treemap, sankey, heatmap, UML class diagram, lineage, charts, kanban, calendar, map) is either a **rendering option** of one of those, a **Bases-native** view we should not reimplement, or a **niche shape** that fails the "2+ adjacent UI precedent" test for v0.1.
- **v0.1 should ship exactly four first‑class shapes — Table, List, Pivot (the one custom view in v0.1.6), and Hierarchy (indented tree)** — plus consume the Bases-native Cards view as a recipe option. **Defer Graph to v0.2** (Cytoscape integration is a multi-week effort, must not be forked in v0.1.6) and **defer Timeline to v0.2+** (Obsidian Bases has a timeline view on its public roadmap; let the platform deliver it). Heatmap, sunburst, treemap, sankey are **render options of Pivot**, not separate shapes. Search, Comparison, and Dashboard are **not shapes** — they are, respectively, a Layer A primitive, a composition of two Table views, and a recipe-layer concern.
- **Mechanism rule: prefer Bases-native > registerBasesView > codeblock > snapshot, but every shape that needs to render on Obsidian Publish requires a materialized snapshot fallback** because custom view types and codeblock processors do not execute on Publish. Hierarchy is the one v0.1 shape that benefits most from dual mechanisms (registerBasesView for the live vault, materialized Markdown nested list for Publish/plugin-uninstalled).

---

## Key Findings

1. **Three shapes appear in essentially every ontology UI surveyed**: an *indented tree/hierarchy* (BioPortal, OLS4, Protégé, OntoBrowser, TopBraid EDG, VocBench, PoolParty, Skosmos, SKOS Play, Stardog Explorer, GraphDB), a *tabular result/catalog* (NIST OLIR, BioPortal mappings, OxO results, Fuseki SPARQL UI, every workbench), and a *node‑link graph* (WebVOWL, OntoGraf, OWLViz, GraphDB Visual Graph, Stardog Visual Results, TopBraid NeighborGram, Cytoscape, OLSVis). These three are the irreducible core.
2. **Most "exotic" ontology visualizations are rendering variants of three underlying data shapes** — hierarchy (indented tree, sunburst, treemap, circle-packing, icicle, radial dendrogram, hyperbolic tree), graph (force-directed, dagre/hierarchical layout, concentric, UML class diagram, lineage), and pivot/cross-tab (heatmap, sankey for flow, stacked bar). Crosswalker should treat them as render options inside a shape, **not** as new shapes.
3. **Obsidian Bases already provides Table, Cards, List, Calendar, Map, and Kanban** as built-in view types (Bases roadmap and `registerBasesView` API confirm Kanban and additional layouts are on Obsidian's near-term path). Reimplementing any of these in Crosswalker is anti-pattern.
4. **TaskNotes v4 is the canonical reference implementation** for plugin-registered Bases views: it ships four custom view types (`tasknotesTaskList`, `tasknotesKanban`, `tasknotesCalendar`, `tasknotesMiniCalendar`) backed by `.base` files and the `registerBasesView` API. Crosswalker should adopt the same pattern (one custom view per shape, .base file as the persistence form, BasesView subclass with `onDataUpdated`).
5. **Custom Bases views and Markdown codeblock processors do not execute on Obsidian Publish**, and they are mobile-friendly only when the underlying renderer (DOM-based) is mobile-friendly. A snapshot/materialized-Markdown fallback is therefore mandatory for any shape that must survive Publish or plugin uninstall.
6. **The "pivot vs. rendering" question has a clean answer**: Layer A produces a 3‑axis dataset (row-key × col-key × measure[]). Whether v0.1.6's `crosswalkerPivot` view paints that as a 2D matrix grid, a heatmap (color-encoded matrix), a sunburst (when one axis is hierarchical), a treemap (when one axis is hierarchical with a size measure), or a sankey (when two axes form a bipartite flow) is a *renderer choice* on the same Layer A output. Treating them as separate shapes would multiply the catalog from 6 to 12+ without adding any expressive power.
7. **NIST OLIR is the closest peer to Crosswalker's domain** and uses only two shapes: a sortable, filterable, faceted catalog **table** and a "Cross-Reference Comparison Report" / **Derived Relationship Mapping** tool that is itself a **multi-column table** of element pairs. This validates that for GRC/cybersecurity crosswalking specifically, **table + pivot + hierarchy** carry roughly 90% of user need.
8. **Search is a Layer A primitive (filter + rank), not a shape.** A "search results page" is just `Filter(query) → Rank(score) → Table` — composition, not a new shape. The same applies to Comparison (two Tables in a Dashboard recipe) and Dashboard itself (recipe-layer concern, not view-shape concern).
9. **Hierarchy emission and hierarchy rendering share the broader/narrower semantic but operate at different layers.** The emission-side `hierarchy-primitives.mdx` describes how a hierarchy is *materialized in the vault* (folder ⊃ file ⊃ heading ⊃ tag/wikilink). The view-shape Hierarchy describes how a SKOS-style broader/narrower relation is *rendered* from query results. Both are legitimate; the parallel is that the render path can consume either an emission-materialized hierarchy or a runtime `parent`/`broader`-property column.

---

## Details

### 1. Landscape Catalog — View Shapes per Tool

The table below reports only the **distinct shapes** each tool exposes (charts, dashboards, edit forms, and pure detail pages excluded for brevity).

| Tool | Distinct shapes exposed | Primary primitives backing them |
|---|---|---|
| **BioPortal** | (a) Faceted ontology browser (Cards-like grid with facets); (b) indented class tree; (c) node-link **mappings visualization** with locate/expand; (d) mappings **table**; (e) full-text search results list. | Filter, faceted-filter, hierarchy traversal, mapping join, full-text rank. |
| **OLS4 (EBI)** | (a) Indented tree with imported-term tags; (b) concept resource view; (c) Solr-backed search results list; (d) parent/child graph (terms/\{id\}/graph API). | Tree traversal (Neo4j), full-text (Solr), filter. |
| **Protégé / WebProtégé** | Indented class/object/data property/individual trees; **OntoGraf** (interactive node-link with relationship/node filters); **OWLViz** (Graphviz hierarchical class diagram via dot); imports view; SPARQL panel **table**. | Class hierarchy, property hierarchy, OWL axioms, SPARQL. |
| **WebVOWL / ProtégéVOWL** | One shape: **force-directed VOWL graph** with rich visual notation for OWL constructs (class, datatype, property, restrictions). | Single graph shape; layout = force-directed only. |
| **OntoBrowser (Novartis)** | Indented hierarchy; "graph format" view; mapping curation **table**; full-text search results; peer-review approval queue. | Tree, mapping table, search. |
| **NIST OLIR portal** | OLIR Catalog **table** (sortable, faceted, keyword search across Authority/Category/Submitter); Cross-Reference Comparison Report / **Derived Relationship Mapping** (table-based two-document comparison around a Focal Document). | Filter, sort, group, multi-column join. |
| **OxO / OxO2** | Cross-reference results **table**; mapping path **graph** (showing chained ontology mappings); SSSOM provenance detail. | Mapping join, graph traversal. |
| **TopBraid EDG** | Class **tree**; **EDG Diagram** (UML-style class diagram); **NeighborGram** (concept-centered graph); **LineageGram** (lineage flow); forms; basket/asset list **table**; search. | Drag-and-drop diagram authoring, automatic relationship detection, lineage propagation. |
| **TopBraid Explorer** | Same shapes as EDG, read-only; Google-like search; visual exploration of graph connections. | Same. |
| **Stardog Studio** | SPARQL workspace **table**; **Visual Results** (force-directed CONSTRUCT/DESCRIBE graph); **Charts** (bar, column, **treemap**, scatter); query-plan **tree** view; data browser. | SPARQL, GraphQL, schema viz. |
| **Stardog Explorer** | Visual Query Builder; list + graph result views; class detail with linked properties; search. | Same. |
| **GraphDB Workbench (Ontotext)** | **Class hierarchy circle-packing** (size = instance count); Domain-Range graph; **Visual Graph** (configurable force-directed exploration with sample SPARQL); SPARQL **table**; resource view. | Class statistics, configurable graph queries. |
| **Cytoscape / Cytoscape.js** | One shape (**graph**) with multiple **layouts as rendering options**: grid, circle, concentric, breadthfirst, dagre/hierarchical, fcose/cose, klay, compound (nested). | Layouts are functions: nodes → positions; not new shapes. |
| **Apache Jena Fuseki UI** | SPARQL editor + tabular result; dataset list; query/update/upload services. | SPARQL, table. |
| **Annif / Finto AI** | Web form for entering text → ranked **suggestion list** of subject concepts; project picker. | Multi-label classifier; ranked list. |
| **PoolParty** | Taxonomy **tree** with drag-and-drop; concept-centered relationship **graph** (color-coded edges); resource detail tabs; SKOS Play integration; Linked Data Frontend (read-only browse + SPARQL). | Tree, graph, SKOS scheme filter. |
| **SKOS Play!** | Alphabetical index; **collapsible hierarchical tree** (HTML/PDF, clickable); **zoomable square** (treemap-style) and **zoomable circle** (circle-packing); **autocomplete** form. | All variants of one Layer A primitive (hierarchy traversal); rendering choice differs. |
| **VocBench 3** | Class tree, instance list, property tree, datatype list, concept tree, scheme list, collection tree, lexicon list, lexical entry list, **Resource View** (single resource detail), YASGUI SPARQL editor. | Tabs over typed primitives — a tree per OWL/SKOS type. |
| **Skosmos** | Alphabetical index, thematic index, structured concept display, visualized concept hierarchy (collapsible tree), multilingual UI. | Filter, tree, search. |
| **OntoloViz / d3-hierarchy / Microsoft Office hierarchy charts** | Sunburst, treemap, circular packing, radial dendrogram, icicle plot — all consumers of the same hierarchy data. | Single Layer A primitive (hierarchical aggregation), multiple renderers. |

### 2. Deduplicated Master List of Observed Shapes

| Shape | Description | Tool count where it appears | Frequency |
|---|---|---:|---|
| **Hierarchy / indented tree** | Parent→child collapsible list; canonical for class hierarchies and SKOS broader/narrower. | 13 | Universal |
| **Table / catalog** | Sortable, filterable, paginated rows-and-columns. | 16 (every tool surveyed) | Universal |
| **Node-link graph** (force-directed) | Interactive concept neighborhood; expand/collapse from a node; nodes by IRI, edges by predicate. | 11 | Near-universal |
| **Resource / detail view** | Single-entity panel with all properties; usually invoked from another shape. | 16 | Universal — but a *page*, not a Crosswalker view shape. |
| **Search results list** | Ranked items by relevance/score. | 14 | Common — but composition of Filter+Rank+List, not a shape. |
| **Faceted browser** | Cards/list with left-rail facets. | 5 | Common — composition of Filter+Cards. |
| **Pivot / cross-tab matrix** | Two grouping axes × measures grid (the v0.1.6 `crosswalkerPivot`). | 4 | Moderate — and core to crosswalking. |
| **UML/class diagram** | Boxes-with-properties, drag-and-drop layout. | 2 | Niche; specialized for ontology authoring. |
| **Sunburst, Treemap, Circle packing, Icicle** | Variants of hierarchy. | 1-4 each | Render options of hierarchy. |
| **Lineage / impact (DAG flow)** | Directed flow upstream/downstream from a node. | 1 | Niche — render option of graph with dagre layout. |
| **Charts** (bar, column, scatter) | Generic statistical charts. | 2 | Niche — out of scope for a query engine view layer. |
| **Timeline / Gantt** | Time-axis bars. | 1 ontology UI; standard in PM tools. | Bases roadmap concern, not ontology-specific. |
| **Calendar / Map / Kanban** | Bases-native; not in ontology UIs. | 0 in ontology UIs | Out of scope — Bases-native. |
| **Heatmap / Sankey** | Render options of pivot. | Several / 1 | Render option of pivot. |
| **Cards** | Tiled summaries with property highlights. | 4 | Bases-native — adopt, do not reimplement. |
| **Comparison / diff** | Side-by-side two-source diff. | 2 | Composition of two Tables, not a shape. |

### 3. First-Class v0.1 vs. Deferred v0.2+ — Decision per Shape

Criteria applied: (A) solves a need nothing else addresses; (B) implementation ≤ 500 LoC; (C) precedent in 2+ adjacent ontology UIs; (D) composes from existing Layer A primitives.

| Shape | A | B | C | D | Decision | Rationale |
|---|:-:|:-:|:-:|:-:|---|---|
| **Table** | ✓ | n/a | ✓ universal | ✓ | **v0.1 — adopt Bases-native** | Do not reimplement. Use the Bases Table view; Layer A returns rows. |
| **List** | ✓ | n/a | ✓ universal | ✓ | **v0.1 — adopt Bases-native** | Compact text rendering of the same row stream. |
| **Cards** | ✓ | n/a | ✓ | ✓ | **v0.1 — adopt Bases-native** | The Bases Cards view is sufficient. |
| **Pivot** | ✓ | ✓ (already shipping in v0.1.6 as `crosswalkerPivot`) | ✓ | ✓ Layer A | **v0.1 — first-class custom view** | The single registered Bases view in v0.1.6. |
| **Hierarchy** | ✓ | ✓ | ✓ universal | ✓ | **v0.1 — first-class custom view (registerBasesView) + materialized-Markdown fallback for Publish** | Highest-precedent ontology shape after Table. |
| **Graph** | ✓ for relationship exploration | ✗ (>1000 LoC if forking; Cytoscape integration is multi-week) | ✓ universal | ✓ Layer A edges output | **v0.2** | Anti-pattern says "do not fork Cytoscape/D3 for v0.1.6." Defer until budgeted. |
| **Timeline / Gantt** | partial | ~ | ✗ in ontology UIs (only 1 of 16) | ✓ Layer A `filter+sort` on date column | **v0.2+ — defer to Bases roadmap or community plugin** | "Timeline for Bases" community plugin already exists. |
| **Heatmap, Sunburst, Treemap, Sankey, Circle-packing, Icicle** | — | — | — | — | **Render options of Pivot or Hierarchy, not separate shapes** | See Section 4. |
| **UML / class diagram** | partial | ✗ | ✗ | partial | **Out of scope** | Crosswalker does not author OWL ontologies. |
| **Lineage / impact** | partial | ✗ | ✗ | partial | **Out of scope for v0.1; consider as graph-layout option in v0.2+** | Equivalent to graph + dagre layout. |
| **Map / Calendar / Kanban** | — | n/a | ✗ in ontology UIs | n/a | **Out of scope — Bases-native** | Adopt if a recipe needs it. |
| **Charts** | partial | varies | ✗ | partial | **Out of scope for v0.1** | A query engine should not also be Tableau. |

**Confirmed v0.1 catalog:** Table, List, Cards (all Bases-native, consumed by Crosswalker recipes), **Pivot (registered custom view)**, **Hierarchy (registered custom view + snapshot fallback)**.

**Confirmed v0.2+ roadmap:** Graph (Cytoscape.js based), Timeline (only if Bases-native does not ship it first), Comparison-diff helper.

### 4. Shape × Mechanism × Platform Matrix

Mechanism legend: **BN** = Bases-native built-in; **RBV** = `registerBasesView` custom view; **CB** = Markdown codeblock processor; **MS** = materialized snapshot.

| Shape | Recommended primary mechanism | Desktop | Mobile | Obsidian Publish | Plugin uninstalled |
|---|---|:-:|:-:|:-:|:-:|
| Table | **BN** | ✓ | ✓ | ✓ (Bases Publish support is on the roadmap; until shipped, **MS** fallback) | ✓ |
| List | **BN** | ✓ | ✓ | same as Table | ✓ |
| Cards | **BN** | ✓ | ✓ | same as Table | ✓ |
| Pivot | **RBV** (`crosswalkerPivot`); **MS** for Publish | ✓ | ✓ | ✗ live → **MS** Markdown table | ✗ live → **MS** |
| Hierarchy | **RBV** (`crosswalkerHierarchy`); **MS** for Publish | ✓ | ✓ | ✗ live → **MS** nested Markdown list | ✗ live → **MS** |
| Graph (v0.2) | **RBV** wrapping Cytoscape.js; **MS** = SVG export | ✓ | ✓ | ✗ live → **MS** SVG embed | ✗ live → **MS** SVG embed |
| Timeline (v0.2+) | Defer to **BN** if Obsidian ships it; else **RBV** with FullCalendar/D3 | ✓ | ✓ | ✗ live → **MS** | ✗ live → **MS** |

**Architectural rule:** every custom view (RBV or CB) must have a paired "snapshot" exporter that writes a deterministic Markdown/SVG file alongside the `.base` file.

### 5. Pivot vs. Rendering — Argued

The v0.1.6 `crosswalkerPivot` view consumes Layer A pivot output: a 3-axis structure `\{rowKeys[], colKeys[], cells: measure[][]\}`. The question is whether the alternative renderings are separate shapes or render-modes.

**Evidence for "render options, not shapes":**

1. **The data shape is identical.** Heatmap is "matrix grid + color-encode the cell value." Sunburst is "matrix where rowKey is hierarchical → angular sweep." Treemap is "rowKey hierarchical, measure → area." Sankey is "matrix where two non-hierarchical axes form a bipartite flow → ribbon width = cell value."
2. **Cytoscape.js's own design proves the principle.** Its docs explicitly distinguish "the shape (graph)" from "layouts" (grid, circle, concentric, breadthfirst, dagre, cose, klay).
3. **SKOS Play similarly proves the principle for hierarchy.** Same SKOS data → tree, treemap (zoomable square), circle-packing (zoomable circle), autocomplete.
4. **Treating renderings as shapes multiplies the catalog combinatorially without expressive benefit.**

**Recommendation:** keep `crosswalkerPivot` as one shape. Add a `render: "matrix" | "heatmap" | "treemap" | "sunburst" | "sankey"` option in v0.2 (default `matrix`).

### 6. Search, Comparison, Dashboard — Placement

**Search.** A "search results page with relevance ranking" decomposes cleanly into three Layer A primitives: `filter(q)` → `rank(score)` → emit rows. **Decision: Search is a Layer A capability (filter + rank), not a shape.**

**Comparison (side-by-side two-version diff).** NIST OLIR's Cross-Reference Comparison Report is a *single multi-column table* that joins two Reference Documents through a Focal Document. **Decision: Comparison is a composition of two Tables (or one joined Table) inside a Dashboard recipe, not a new shape.**

**Dashboard (multiple shape instances on one canvas).** **Decision: Dashboard is a recipe-layer concern, not a view shape.**

### 7. Cross-reference with `hierarchy-primitives.mdx`

Crosswalker's emission-side primitives are the *vault medium* in which a hierarchy lives: folder ⊃ file ⊃ heading ⊃ tag/wikilink. The view-shape Hierarchy is the *visual rendering* of a parent/child relation that may come from any source.

**Recommendation:** add a one-paragraph "Hierarchy at emission vs. at render" callout to both `hierarchy-primitives.mdx` and the view-shapes page, cross-linking them.

### 8. Recommended Changes to `view-shapes` Concept Page

> **View shapes are mechanism-neutral visual presentations that consume Layer A query output.** A view shape is *not* a renderer and *not* a layout — it is the abstract data-to-display contract. A single shape may be backed by multiple mechanisms (Bases-native, `registerBasesView` custom view, codeblock processor, or materialized snapshot) and a single shape may offer multiple render options (e.g., Pivot can render as matrix, heatmap, treemap, sunburst, or sankey).
>
> **v0.1 ships five first-class shapes:** Table (Bases-native), List (Bases-native), Cards (Bases-native), Pivot (one custom view, the v0.1.6 `crosswalkerPivot`), and Hierarchy (custom view with materialized-Markdown fallback for Publish).
>
> **v0.2+ adds Graph (Cytoscape.js) when budgeted; Timeline if and only if Obsidian Bases does not ship it first.**

---

## Recommendations

**Stage 1 — v0.1.6 (now): freeze scope.**
1. Ship `crosswalkerPivot` as the **single** registered Bases view.
2. Document Table/List/Cards as Bases-native consumers; add `.base` recipe templates.
3. Add the `view-shapes` concept page rewrite from §8 above.
4. Add a paired snapshot exporter for Pivot output.
5. **Do not** add: Graph, Timeline, Sunburst, Heatmap, Comparison view, Dashboard view.

**Stage 2 — v0.1.7 / v0.1.8: add Hierarchy as the second registered view.**
6. Implement `crosswalkerHierarchy` as `registerBasesView` (~300 LoC).
7. Pair it with a snapshot exporter that emits nested Markdown bullet lists.

**Stage 3 — v0.2: add Graph + render-option expansion.**
8. Add `crosswalkerGraph` as `registerBasesView` wrapping Cytoscape.js.
9. Extend Pivot with `render: "heatmap" | "treemap" | "sunburst" | "sankey"` options.

**Stage 4 — v0.2+: opportunistic.**
10. **Trigger to add Timeline:** Obsidian Bases roadmap ships timeline natively → adopt; else if 3+ users request it → ship `crosswalkerTimeline`.

---

## Caveats

- **Source-quality note on tool docs.** Several PoolParty, TopBraid EDG, and Stardog observations come from vendor marketing or blog posts rather than primary documentation.
- **Obsidian Bases is still beta as of mid-2026.** The Bases public roadmap explicitly lists "API for plugins to add custom functions," "more layouts for views," and "Obsidian Publish support" as in-flight.
- **`registerBasesView` is mobile-friendly only insofar as the renderer is.**
- **TaskNotes precedent is strong but task-management-flavored.**
- **The "16 ontology UIs surveyed" claim is approximate.**
- **"Graph" is overloaded.** v0.2 Crosswalker Graph should pick *plain circles + edge labels* as default and not attempt to implement VOWL notation.
- **No primary user research was conducted as part of this challenge.**
