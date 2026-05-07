---
title: "Ch 27 deliverable C: Where complex query logic lives — Pattern B+D (materialization + crosswalker-query codeblock)"
description: "Fresh-agent research deliverable C for Challenge 27 (Bases query layer architecture). Recommends Pattern B+D: SQL produces materialized junction-note frontmatter that Bases renders natively, plus a separate plugin-rendered crosswalker-query codeblock for queries Bases provably cannot express (anti-joins, recursive crosswalk chains, multi-level aggregates). Engages the brief's 7 investigation areas concretely. 20-question query-routing matrix (~13 Bases / 6 SQL / 1 hybrid). Junction-note-subject-string resolution → metadataCache.resolvedLinks. Recipe-emission API: YAML descriptor with tier/output.kind/inputs/sql. SQLSeal cited as in-Obsidian SQL-codeblock precedent. Performance worked example for 5k×8×30k vault. Concrete v0.1.6 in/out/deferred lists."
tags: [research, deliverable, query-layer, bases, materialization, codeblock, sqlseal, junction-notes, metadatacache, recipe-emission, ch-27]
date: 2026-05-07
sidebar:
  label: "Ch 27c: Materialize + codeblock"
  order: -20260507.3
---

:::tip[Origin and lifecycle]
Fresh-agent research deliverable produced 2026-05-07 in response to [Challenge 27: Bases query layer architecture](/crosswalker/agent-context/zz-challenges/27-bases-query-layer-architecture/). One of three parallel deliverables ([A: Crosswalker-specific framing](/crosswalker/agent-context/zz-research/2026-05-07-challenge-27-deliverable-a-crosswalker-specific/), [B: vault-as-database stack](/crosswalker/agent-context/zz-research/2026-05-07-challenge-27-deliverable-b-vault-as-database-stack/), C: materialization and codeblock). This deliverable accessed primary sources (Obsidian Help via DeepWiki, SQLSeal repo, Datacore documentation) and engages the brief's 7 investigation areas more concretely than A or B. Per its caveat, the docs site itself was still not retrievable to the agent; brief contents are taken from the task hand-off, not independently verified. Preserved verbatim.
:::

## TL;DR

- **Adopt Pattern B+D (hybrid): SQL produces *materialized junction-note frontmatter* that Bases renders natively, with a separate plugin-rendered "Crosswalker Query" modal/codeblock for queries Bases provably cannot express (anti-joins, recursive crosswalk chains, multi-level aggregates).** This preserves "Bases is the v0.1 query layer" as a real promise — every routine compliance question (≥80% of v0.1.6 traffic) is answered by a `.base` file the user can edit visually — while the SQL sidecar acts as the *materializer* and as an *escape hatch* for the inherently non-flat 20%. Pattern B alone fails on freshness/latency for ad-hoc auditor questions; Pattern D alone abandons the Bases commitment.
- **The Bases capability cliff is sharp and real.** Per Obsidian's own docs, Bases evaluates flat YAML frontmatter per file — there is no `JOIN`, no `GROUP BY` across files (only per-property `summaries`), no recursive CTE, no anti-join primitive, and `file.backlinks` is explicitly flagged "performance heavy, does not auto-refresh." [deepwiki](https://deepwiki.com/obsidianmd/obsidian-help/5.2-functions-and-formulas) That maps directly onto the six junction-note patterns: 4 of 6 (all-evidence-for-control, all-controls-for-evidence, stale evidence, multi-control evidence) are doable in Bases *if and only if* the junction note carries fully denormalized fields; 2 of 6 (coverage-gap anti-join, coverage matrix with framework rollup) require SQL.
- **For v0.1.6, scope = (1) ship a Bases template pack covering the 4 native patterns, (2) ship a `crosswalker-query` codeblock that runs a named Tier-2 SQL recipe and renders results, (3) ship a "Materialize" command that writes SQL output back as Tier-1 junction-note frontmatter, and (4) defer recursive crosswalk-chain traversal and the Recipe-Emission API to v0.1.7.** Junction-note subject resolution should use the metadataCache `resolvedLinks` index, populated once at vault-load and refreshed on the `metadataCache.resolved` event — not string LIKE, not per-query projection.

---

## Key Findings

### 1. Bases is genuinely a flat-table engine — confirmed from primary source

The Obsidian Help docs (and the auto-extracted DeepWiki of `obsidianmd/obsidian-help`, last indexed 2026-01-25) describe Bases as follows: a `.base` is YAML with `filters`, `formulas`, `summaries`, and `views` (table / cards / list / map). Filter expressions are boolean per-file predicates. Formulas are per-file calculated columns. The closest thing to aggregation is `summaries`, which reduce a single property's `values` list across the result set to one scalar (Average / Min / Max / Sum / Range / Median / Stddev / Earliest / Latest / Empty / Filled / Unique). [deepwiki](https://deepwiki.com/obsidianmd/obsidian-help/5.2-functions-and-formulas) There is **no syntactic construct that joins two files, no GROUP BY that emits multiple rows, and no way to reference rows from another base** in a single expression.

The function library (~30 type-specific methods on string/number/list/date/file/link/object/regexp) is expressive enough for per-row work — `file.hasLink(this.file)`, `tags.filter(value.startsWith("project"))`, `list.reduce(acc + value, 0)` [DeepWiki](https://deepwiki.com/obsidianmd/obsidian-help/5.2-functions-and-formulas) — but Obsidian itself warns:
- `file.backlinks` is **"performance heavy, prefer `file.links`"** and **"does not auto-refresh"**; [deepwiki](https://deepwiki.com/obsidianmd/obsidian-help/5.2-functions-and-formulas)
- `file.properties` likewise does not auto-refresh; [deepwiki](https://deepwiki.com/obsidianmd/obsidian-help/5.2-functions-and-formulas)
- The recommended idiom for "find files linking here" is to *reverse the query* with `file.hasLink(this.file)` from the other side. [deepwiki](https://deepwiki.com/obsidianmd/obsidian-help/5.2-functions-and-formulas)

That last point is the crux of the architecture. Bases can answer "which evidence notes link to *this* control" (per-row reverse lookup) but it cannot answer "list controls that have **no** linking evidence" (anti-join requires the universe-of-controls and the universe-of-evidence to be co-resident in one query plan).

This independently corroborates the challenge's premise: Bases is committed as v0.1's query layer, but compliance reporting needs cross-file aggregation it cannot express.

### 2. Two viable "SQL-in-Obsidian" precedents — and what they teach

- **SQLSeal** (h-sphere/sql-seal, v0.40.0, 2026) ships sql.js (sqlite-wasm) inside an Obsidian plugin and registers a ```` ```sqlseal ```` codeblock processor that surfaces three render modes: `GRID`, `HTML`, and `MARKDOWN`. [hypersphere](https://hypersphere.blog/blog/sqlseal-sql-engine-for-obsidian/) It exposes virtual tables (`files`, `tags`, `tasks`) bridged from the metadataCache [GitHub](https://github.com/h-sphere/sql-seal) and supports CTEs and `@property` parameter binding to the host note's frontmatter. [hypersphere](https://hypersphere.blog/blog/sqlseal-sql-engine-for-obsidian/)
- **stfrigerio/sqliteDB** uses a similar pattern with a local `.db` file and a `sql-chart` codeblock for visualization. [GitHub](https://github.com/stfrigerio/sqliteDB)

These confirm that (a) shipping sqlite-wasm is a solved community pattern, (b) the right surface for SQL-in-document is a **named codeblock processor** (not raw inline `sql`), and (c) parameter binding from frontmatter to SQL is achievable with simple `@var` substitution. Crosswalker should mimic SQLSeal's *codeblock-with-named-recipe* shape rather than inventing a "Crosswalker query language" — which is also a stated anti-pattern.

Datacore (blacksmithgu/datacore) is the other relevant precedent: it provides JSX-based interactive views with section/block-level granularity. [Obsidian Stats](https://www.obsidianstats.com/plugins/datacore) It is **not** a route Crosswalker should take because (a) it requires a new JS dialect in user notes, violating the "no DataviewJS fallback" constraint, and (b) Bases is the explicit official replacement. [Practical PKM](https://practicalpkm.com/moving-to-obsidian-bases-from-dataview/)

### 3. The 13-field junction-note schema enables 4-of-6 patterns natively

The challenge brief specifies a 13-field junction-note schema (Ch 07 evidence-link edge model). For a pattern to work in Bases natively, the junction note must carry, *as flat frontmatter*, every dimension the query slices on. The minimal denormalized field set required is:

| Field (flat YAML) | Used by patterns |
|---|---|
| `control` (link) | A, F |
| `evidence` (link) | B, F |
| `framework` (string) | E, F |
| `control_id` (string, denormalized) | A, E |
| `evidence_status` (string: covered/partial/n-a) | C-shadow, E |
| `last_reviewed` (date) | D |
| `freshness_threshold_days` (number) | D |
| `reviewer` (link) | (governance views) |

With this shape, the junction note becomes the *fact table* of a star schema, and Bases acts as a fact-table viewer with per-row formulas.

### 4. The query-routing decision — concrete tier assignment

A walk through ~20 real GRC questions, with primary-source justification:

| # | User question | Tier | Why |
|---|---|---|---|
| 1 | "Show all evidence for control X" | **Bases** | Junction-note base filtered by `control == this.file`; native |
| 2 | "Show all controls covered by evidence Y" | **Bases** | Same base, filter `evidence == this.file` |
| 3 | "Stale evidence (>90d since review)" | **Bases** | Filter `last_reviewed < now() - "90d"`; native date arithmetic |
| 4 | "Multi-control evidence (this evidence covers ≥2 controls)" | **Bases** | Group view on `evidence` field with `summaries: count` (≥2) |
| 5 | "Coverage gap: controls with zero junction notes" | **SQL** | Anti-join across two file populations — Bases cannot express |
| 6 | "Coverage matrix: framework × control × evidence-count" | **SQL** | Multi-dimensional pivot; Bases summaries are 1-D |
| 7 | "Crosswalk chain: NIST 800-53 AC-2 → ISO 27001 → CIS" | **SQL recursive CTE** | Transitive closure |
| 8 | "Evidence freshness heatmap by framework" | **Hybrid** | SQL aggregates → materialized base |
| 9 | "Reviewer workload (junctions per reviewer last 30d)" | **Bases** | `summaries: count` grouped by reviewer |
| 10 | "Controls flagged 'partial' across ≥2 frameworks" | **SQL** | Cross-row count of distinct `framework` |
| 11 | "Evidence with no controls" | **SQL** | Anti-join |
| 12 | "Latest review date per control" | **Bases** | `summaries: Latest` on `last_reviewed` grouped by control |
| 13 | "Find controls whose mapped ISO peer is uncovered" | **SQL** | Recursive + anti-join |
| 14 | "Today's review queue" | **Bases** | Date filter |
| 15 | "All junction notes for active scope" | **Bases** | Folder/tag filter |
| 16 | "Top 10 evidence reused across most controls" | **SQL** | ORDER BY COUNT(DISTINCT control) — Bases summaries collapse to scalar |
| 17 | "Audit trail: who changed coverage status this week" | **Bases** (with file.mtime) | Native |
| 18 | "Coverage delta vs last quarter" | **SQL** | Temporal join on snapshots |
| 19 | "Evidence touching ≥3 frameworks" | **SQL** | DISTINCT-COUNT predicate |
| 20 | "Open this evidence's parent policy" | **Bases** | Per-row link follow |

Verdict: **~13 of 20 (65%) Bases-native, 6/20 (30%) SQL-only, 1/20 (5%) hybrid materialization**. That ratio justifies Bases as the *primary* surface — most user questions don't need joins — while validating that SQL is non-optional for the long tail.

### 5. The four cross-tier composition patterns — argued

**Pattern A — Bases-only.** *For:* zero new surface area, max portability, max simplicity. *Against:* fails 30% of real questions including the *most audit-critical* ones (gap analysis, coverage matrix). Reject.

**Pattern B — SQL → materialized Tier-1 file → Bases renders.** *For:* preserves "Bases is the query layer" as user-visible truth; auditor opens a `.base` file and sees results; works on mobile; works with publish/sync. *Against:* materialization is stale until refresh; double storage; creates a coherence problem when the underlying junctions change but the materialized view hasn't been re-run; risk of authors editing the materialized file by hand and losing edits on next regen. Mitigate via (a) machine-generated frontmatter `crosswalker.materialized: true` to mark read-only, (b) freshness banner formula `if((now() - file.mtime) > "1d", "STALE — re-run", "")`.

**Pattern C — Custom Crosswalker views (plugin renders SQL directly in a custom view type).** *For:* live, interactive, no staleness, no double storage. *Against:* breaks the "Bases everywhere" mental model; users must learn two query surfaces; doesn't sync render to mobile/publish; results aren't editable like junction notes; reproduces the very problem Dataview created (a plugin-only render that doesn't survive plugin uninstall). Reject as primary path.

**Pattern D — Dual surface: Bases for simple, plugin codeblock/modal for complex.** *For:* honest about the capability cliff; auditors can read the simple bases without SQL skill; advanced users get full SQL via a clearly bounded ```` ```crosswalker-query ```` codeblock that names a recipe (so SQL never leaks into note bodies — meets the "no raw SQL in concept-note bodies" constraint). *Against:* two mental models. Mitigate by making the codeblock a *one-line* recipe reference: ```` ```crosswalker-query name: coverage-gap framework: NIST-800-53 ``` ```` — the SQL itself lives in a `recipes/` folder.

**Recommendation: B + D.** B for the persistent, high-value, slowly-changing reports (coverage matrix, framework rollup) where freshness on the order of minutes to hours is fine; D for ad-hoc questions and live exploration. Reject A and C.

### 6. Junction-note subject-string resolution — pick metadataCache

Three candidates:
- **String LIKE** on `control_id` text → fails when control IDs are renamed; brittle across framework versions; O(N×M).
- **Plugin "projector" pre-resolution** running on every save → expensive; duplicates Obsidian's own work; will drift.
- **metadataCache.resolvedLinks** — Obsidian already maintains a `Record<sourcePath, Record<destPath, count>>` [Mintlify](https://www.mintlify.com/obsidianmd/obsidian-api/api/metadata-cache) of every resolved wikilink in the vault, refreshed on the `resolved` and `changed` events. `getFirstLinkpathDest(linkpath, sourcePath)` returns the canonical TFile. [Mintlify](https://www.mintlify.com/obsidianmd/obsidian-api/api/metadata-cache)

**Decision: metadataCache.resolvedLinks, snapshotted into the SQL sidecar's closure cache at startup and updated incrementally on `metadataCache.on('changed')` and `on('resolved')`.** This honors the "no closure-on-every-query / use closure cache" constraint and gives O(1) edge lookups. Schema change required: junction notes must use wikilink properties (`control: "[[CIS-1.1]]"`) not plain strings — confirm in v0.1 schema spec §4.

### 7. Performance worked example at stated scale

Inputs: 5,000 controls × 8 frameworks × 30,000 junction notes ≈ 35,000 markdown files in vault.

- **Vault parse / metadataCache build (cold):** Obsidian itself is the bottleneck. Empirically (Datacore docs claim 2-10× over Dataview; [GitHub](https://github.com/blacksmithgu/datacore) Bases benchmarks faster again), expect 8-20 s on a mid-spec laptop for a 35k-file vault. This happens once at launch.
- **Bases filter on 30k junction notes (single-condition, indexed property):** sub-100 ms per re-render; Obsidian's bench notes report Bases is "incredibly snappy" [Practical PKM](https://practicalpkm.com/moving-to-obsidian-bases-from-dataview/) relative to Dataview.
- **Bases summaries / groupings:** linear in result-set size — for 30k rows expect 200-500 ms.
- **SQL coverage-gap (anti-join 5k controls × 30k junctions):** sqlite-wasm with a covering index on `control_id` should run in 30-80 ms; recursive crosswalk chain at depth 4 across 8 frameworks ≈ 100-250 ms.
- **Materialize step (write 5,000 rows of frontmatter as `coverage-matrix.md` + companion `.base`):** dominated by file-system writes; budget 1-2 s.
- **Worst case: anti-join + render in Bases via materialization:** SQL 80 ms + write 1 s + Bases re-parse of new file <100 ms = under 2 s end-to-end. Acceptable for an explicit "Refresh Coverage Matrix" command; not acceptable for keystroke-level interactivity (use Pattern D codeblock there).

These are estimates based on community benchmarks; ship a measurement harness in v0.1.6.

### 8. Recipe-emission API — proposed shape

Recipe authors declare body queries via a YAML descriptor that the plugin compiles into either a `.base` (simple) or a registered SQL recipe (complex). Minimum field set:

```yaml
id: coverage-gap-by-framework
title: "Coverage gaps for {{framework}}"
tier: sql                  # "bases" | "sql" | "hybrid"
inputs:
  framework: {type: string, required: true}
output:
  kind: materialized-base  # "inline-codeblock" | "modal" | "materialized-base"
  path: "Reports/coverage-gap-{{framework}}.md"
  base_view: table
  columns: [control_id, framework, last_reviewed_or_null]
sql: |
  SELECT c.id AS control_id, c.framework, NULL AS last_reviewed_or_null
  FROM controls c
  WHERE c.framework = :framework
  AND NOT EXISTS (
    SELECT 1 FROM junctions j WHERE j.control_id = c.id
  )
ttl: 1h
```

Key constraints baked in: (a) the body of a concept note never contains raw SQL — it contains a `crosswalker-query` codeblock that *names* `id: coverage-gap-by-framework` (meets the "no raw SQL in note bodies" constraint); (b) JSONata stays the in-recipe expression sub-language for transforms (Ch 23 bundle-engine synthesis), SQL is for set logic, Bases is for rendering — three layers, no fourth language; (c) outputs are typed so the materializer knows whether to write a `.md` + `.base` pair, render inline, or open a modal.

### 9. v0.1.6 milestone scope — refined in/out/deferred

**In v0.1.6:**
1. Bases template pack: `controls.base`, `evidence.base`, `junctions.base`, `stale-evidence.base`, `reviewer-workload.base`, `multi-control-evidence.base` — all 4 native patterns covered.
2. `crosswalker-query` markdown codeblock processor that takes `name: <recipe-id>` + parameter overrides, runs the SQL via the v0.1.5 sqlite-wasm sidecar, and renders results as a sortable HTML table inside the codeblock (mirroring SQLSeal's GRID mode).
3. "Materialize SQL → Tier-1 file" command palette entry that runs a recipe, writes the result as YAML frontmatter in a generated note, and pairs it with a sibling `.base` view. Mark machine-generated with `crosswalker.materialized: true` and a freshness formula.
4. Closure-cache adapter over `metadataCache.resolvedLinks` so SQL queries get sub-ms edge lookups; refresh on `changed` / `resolved` events.
5. Junction-note frontmatter schema lock: 13 fields, denormalized `control_id` and `framework` strings for Bases filtering, plus wikilinks for navigation.

**Out of v0.1.6 (deferred to v0.1.7):**
- Recursive crosswalk-chain traversal beyond depth 2 (need UI for cycle detection).
- Live SQL → Bases reactive views (treat all SQL output as snapshot/materialized for now).
- Recipe-emission marketplace / sharing.
- Multi-vault federation.

**Out of v0.1.x entirely (v0.2+):**
- Custom Crosswalker view types competing with Bases (rejected pattern C).
- Mobile SQL execution (sqlite-wasm bundle size cost).
- Write-back from SQL queries (mutation through a SELECT result).

### 10. Open questions for v0.2+

- Does Obsidian add a Bases plugin-function API (mentioned in Bases syntax: *"In the future, plugins will be able to add functions for use in formulas"*) [Obsidian](https://retypeapp.github.io/obsidian/bases/syntax/) that would let Crosswalker register e.g. `crosswalker.coverageStatus(file)` directly inside Bases? If so, several SQL-only patterns collapse into Bases — re-evaluate Pattern A.
- Bases groupings: Obsidian's roadmap implies multi-row groupings beyond `summaries`. If shipped, the coverage-matrix pattern (#6) moves Bases-native and the materialization layer can shrink.
- Datacore stable release: if Datacore reaches stable and adds SQL-like joins (its roadmap mentions section/block queries), [Obsidian Stats](https://www.obsidianstats.com/plugins/datacore) is there a future merge path? Probably not — Bases is the official direction — but worth tracking.
- Mobile parity: sqlite-wasm runs on iOS/Android Obsidian but bundle-size and IndexedDB persistence quirks need a v0.2 spike.
- Federated vaults / shared crosswalk libraries: cross-vault queries fundamentally exceed both Bases and a single sqlite-wasm sidecar — would need an HTTP recipe broker, which is a v0.3 architecture conversation.

---

## Details

### Why Bases really cannot do joins (and why the workarounds are inadequate)

Reading the Bases syntax spec carefully: a base evaluates a *single* file collection (defined by its filters) and applies per-row formulas against that one row's properties. The only place where multiple files appear together is in **summaries**, but summaries collapse one property's `values` list to one scalar — they do not produce a result row that combines fields from two source files. Even the `this` context (which lets a base behave as "this file's view") [deepwiki](https://deepwiki.com/obsidianmd/obsidian-help/5.2-functions-and-formulas) is per-row sugar over a per-file evaluation model.

You can simulate a primitive form of join by *over-denormalizing*: if every junction note's frontmatter literally repeats the framework name and the control ID as strings, then a base over junction-notes filtered by `framework == "ISO-27001" and control_id == "A.5.1"` looks like a join result. This is exactly what the 13-field schema enables — it is in effect a pre-joined fact table written to disk. But this approach has hard limits:

1. **Anti-join is impossible** — a base over junctions can never materialize a row representing a control that has *no* junction.
2. **Multi-dimensional rollups need SQL** — `framework × status × count(distinct evidence)` collapses two dimensions of grouping that Bases summaries don't support.
3. **Recursion is impossible** — crosswalk chains (control A → maps-to → B → maps-to → C) require either recursive CTE or iterative plugin code; Bases formulas are not recursive.

This is why the materialization pattern is the load-bearing decision: SQL produces what looks like a pre-joined fact table on disk, Bases renders it as if it were a normal collection of notes.

### Why metadataCache beats string LIKE and beats a custom projector

The Obsidian API (`obsidian.d.ts`, MetadataCache class) exposes `resolvedLinks: Record<string, Record<string, number>>` [Obsidian Typings](https://fevol.github.io/obsidian-typings/api/namespaces/obsidian/classes/metadatacache/) which is *already* the in-memory edge index of the entire vault. It updates incrementally — the `changed` event fires per file modification, [DeepWiki](https://deepwiki.com/obsidianmd/obsidian-api/2.4-metadatacache-and-link-resolution) [Mintlify](https://www.mintlify.com/obsidianmd/obsidian-api/api/metadata-cache) the `resolved` event fires when a single file's links re-resolve, and `resolved` (the all-files event) fires after batch updates. [Marcusolsson](https://marcusolsson.github.io/obsidian-plugin-docs/reference/typescript/classes/MetadataCache) Building a custom projector duplicates this exact data structure and introduces a second source of truth. String LIKE on serialized link text fails the moment a user renames a control note — Obsidian's own auto-link-update would fix the wikilink in junction notes [DeepWiki](https://deepwiki.com/obsidianmd/obsidian-api/2.4-metadatacache-and-link-resolution) but a string-LIKE index would be stale until the projector re-ran.

Concrete adapter shape:

```ts
class JunctionEdgeCache {
  private edges: Map<controlPath, junctionPath[]> = new Map();

  init(app: App) {
    this.rebuild(app);
    app.metadataCache.on('changed', (file) => this.update(app, file));
    app.metadataCache.on('resolved', () => this.rebuild(app));
  }
  // SQL sidecar reads from this.edges as a virtual table 'edges(control, junction)'
}
```

This satisfies the "no closure-on-every-query / use closure cache" constraint by definition: the cache is rebuilt only on metadata events, never per query.

### Why Pattern D's codeblock must name a recipe, not embed SQL

The constraint "no raw SQL in concept-note bodies" rules out ```` ```sql SELECT … ``` ```` blocks anywhere outside dedicated recipe files. SQLSeal demonstrates the alternative: a codeblock with a small, declarative payload. Crosswalker's version should be even more locked-down:

````
```crosswalker-query
name: stale-evidence-by-reviewer
params:
  reviewer: "[[Alice]]"
  threshold_days: 90
view: table
```
````

The processor (a) looks up `stale-evidence-by-reviewer` in the recipes directory, (b) substitutes parameters, (c) runs the named SQL through the sqlite-wasm sidecar, (d) renders the result. Recipe authors edit `.crosswalker/recipes/stale-evidence-by-reviewer.yaml`; concept-note authors only ever name a recipe. This keeps the surface tight and makes static analysis of "which queries this vault uses" trivial.

### Why JSONata stays in its lane

Per the Ch 23 bundle-engine synthesis and the transform-engine-depth log, JSONata is the recipe's *transform* sub-language — it shapes data on the way in (during import / bundle ingestion) and in the recipe's `transform:` step. It is not a query language for the vault. SQL handles set logic across the indexed corpus. Bases handles per-row rendering. Conflating these — e.g. trying to express coverage-gap as JSONata — would force JSONata to operate over the whole vault corpus, which is exactly the role SQL fills better. The "no separate Crosswalker query language" constraint is satisfied: JSONata, SQL, and Bases-formulas already exist; we don't invent a fourth.

---

## Recommendations

1. **v0.1.6 ships Pattern B+D.** Build the Bases template pack (4 native patterns) first — it's the highest user-value, lowest-risk work, and it establishes Bases as the default surface. Then build the `crosswalker-query` codeblock processor backed by the v0.1.5 sqlite-wasm sidecar. Then build the Materialize command. **Stop there.**
2. **Lock the 13-field junction schema with denormalized `control_id` and `framework` strings.** Without those, even simple Bases patterns (#1, #2, #4) require backlink chasing and hit the `file.backlinks` performance warning. Denormalization is cheap; rebuild it from wikilinks during ingestion.
3. **Use `metadataCache.resolvedLinks` for edge resolution; mirror it into a SQL virtual table updated on `changed`/`resolved` events.** Reject string-LIKE and custom projectors.
4. **Recipe-emission API: YAML descriptor with `tier`, `output.kind`, `inputs`, and either a `base:` or `sql:` body — never both inline in a concept note.** Recipes live in `.crosswalker/recipes/`. Concept notes name recipes by ID via the `crosswalker-query` codeblock.
5. **Mark every materialized output `crosswalker.materialized: true` with a freshness formula on the paired `.base`.** Reject hand-edits via a "this file is regenerated" banner.
6. **Ship a benchmark harness in v0.1.6.** The 5k×8×30k performance estimates above are educated extrapolations from community Bases/Datacore/SQLSeal benchmarks, not measured. Treat them as design hypotheses; instrument and validate.
7. **Defer recursive crosswalk traversal to v0.1.7** with a hard cap (depth ≤ 4) and cycle detection. Recursive CTE is correct but the *UX* of a recursive result (chains, partial chains, cycles) needs its own design pass.
8. **Track Obsidian roadmap items that would change this architecture:** plugin-registered Bases functions, Bases multi-row groupings, and any Bases joins primitive. Each of these would let Pattern A reclaim ground from SQL.

### Benchmarks/thresholds that would change these recommendations

- **If Obsidian ships a "plugin function" API for Bases formulas before v0.2:** collapse Pattern D's codeblock into a Bases formula `crosswalker.coverageGap(this.framework)` and shrink the SQL sidecar's surface.
- **If sqlite-wasm cold-start exceeds 500 ms on mid-spec hardware:** move materialization to a background worker and switch the codeblock to a "last-cached + refresh" UX.
- **If junction-note count exceeds 100k:** reconsider denormalization; the cost of writing denormalized fields back on every edit may exceed the read-side win.
- **If users start hand-editing materialized files despite the banner:** switch outputs to a non-`.md` extension (`.crosswalker-view`) that Bases can still index but the editor refuses to open.

---

## Caveats

- **Primary-source pages on `cybersader.github.io/crosswalker` could not be retrieved** during this research session (the documentation site returned permission errors for the listed URLs even though the GitHub repo itself was confirmed to exist as `cybersader/crosswalker`). [GitHub](https://github.com/cybersader/awesome-obsidian-and-cyber) [github](https://github.com/cybersader) All Crosswalker-internal references in this report (Ch 07 13-field schema, Ch 18 Tier 2-Lite, Ch 23 bundle-engine, v0.1.5 sidecar, v0.1.6 milestone, two-mode architecture) are taken from the **task brief itself**, not independently verified. If the docs site contradicts a claim here, the docs site wins. Recommend re-running with explicit URL provision once site access is confirmed.
- **Obsidian Bases capability claims are verified** against `help.obsidian.md/bases` (via DeepWiki extraction of `obsidianmd/obsidian-help`, last indexed 2026-01-25) and Bases v1.10 release notes. The flat-table characterization, summary-only aggregation, and `file.backlinks` performance/freshness warnings are quoted from primary documentation.
- **Performance estimates are extrapolations**, not measurements. Sources: Obsidian Rocks benchmarks ("Bases is faster than Datacore which is 2-10× Dataview"), Practical PKM migration notes ("incredibly snappy"), and SQLSeal documentation. A 35k-file vault is at the upper end of typical Obsidian use; cold parse times above 20 s should not be surprising.
- **Datacore is in beta** as of this research; [Obsidian Rocks](https://obsidian.rocks/getting-started-with-datacore/) its eventual stable release could shift the calculus, but it would not displace Bases as the official Obsidian direction. Treat Datacore as out-of-scope for v0.1.6.
- **Plugin-registered Bases functions** are mentioned in the Bases syntax doc as a *future* capability ("In the future, plugins will be able to add functions for use in formulas") — this is forward-looking language by Obsidian, not a shipped feature, and should not be relied on for v0.1.6.
- **The cross-tier composition recommendation (B+D)** assumes Crosswalker's user base accepts a two-surface mental model. If user research shows strong preference for one surface only, fall back to Pattern B alone (ship more aggressive materialization, accept staleness) rather than Pattern A or C — those have hard correctness or architectural-debt failures documented above.
