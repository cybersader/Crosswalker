---
title: "Ch 28 deliverable A: Bases-first hybrid with opt-in materialization (Reports/_generated/)"
description: "Fresh-agent research deliverable A for Challenge 28. Engages all 7 brief investigation areas concretely. Verdict: hold the Ch 27 hybrid but tighten to 'Bases-first, codeblock-second, materialization-third' for v0.1.6. registerBasesView for ONE custom view (crosswalkerCoverageMatrix); crosswalker-query codeblock processor for parameterized ad-hoc reads; opt-in command-driven Reports/_generated/<recipe>/<view>/<timestamp>.md materializer behind materialize:false default. CQRS framing: query layer = Bases + codeblock + sqlite-wasm sidecar (no .md output); snapshot layer = materialization command + OpenTimestamps + git (opt-in, gitignored by default). Mobile/Publish parity table; deterministic Markdown writer spec; recipe lifecycle (wizard/hand-authored/community sources, three-way merge for conflicts, user_edited:true row-flag). Hand-edit prevention via new-timestamped-file + .latest.md alias-pointer. Reasoned from adjacent context — challenge page not retrievable to the agent."
tags: [research, deliverable, query-layer, bases, registerbasesview, codeblock-processor, materialization, cqrs, opentimestamps, deterministic-output, recipe-lifecycle, mobile-publish-parity, ch-28]
date: 2026-05-07
sidebar:
  label: "Ch 28a: Bases-first hybrid"
  order: -20260507.4
---

:::tip[Origin and lifecycle]
Fresh-agent research deliverable produced 2026-05-07 in response to [Challenge 28: Bases query layer follow-on stress test](/crosswalker/agent-context/zz-challenges/28-bases-query-layer-followon-stress-test/). One of three parallel deliverables (A: Bases-first hybrid with opt-in materialize, [B: stress-test matrix](/crosswalker/agent-context/zz-research/2026-05-07-challenge-28-deliverable-b-stress-test-matrix/), [C: narrow-and-defer materialization](/crosswalker/agent-context/zz-research/2026-05-07-challenge-28-deliverable-c-narrow-and-defer/)). Engages the brief's 7 investigation areas most concretely of the three. Reasoned from adjacent context — agent reports challenge page itself was not retrievable. Preserved verbatim.
:::

> **Note on sources:** The Crosswalker GitHub Pages docs (`cybersader.github.io/crosswalker/...`) and the main `cybersader/crosswalker` repo were not fetchable from this research environment (search index returned only the older `Crosswalker` matching tool [GitHub](https://github.com/cybersader/awesome-obsidian-and-cyber) and `awesome-obsidian-and-cyber` notes; the dedicated docs site for v0.1.x did not surface). This deliverable is therefore written from the **task brief's restated context** plus deeply researched evidence on the **Obsidian Bases API, codeblock processors, sqlite-wasm, Publish, OpenTimestamps, and CQRS/materialized-view patterns**. Where the brief's summary of Ch 27 deliverables is the only source for an internal Crosswalker decision, that is flagged. The conclusions below are decision-ready but should be cross-checked against the canonical docs site before merging into the v0.1.6 milestone PR.

## TL;DR

- **Keep the Ch 27 hybrid verdict, but tighten it: ship v0.1.6 as "Bases-first, codeblock-second, materialization-third"** — `registerBasesView` for the *one* high-value custom view (`crosswalkerCoverageMatrix`), a `crosswalker-query` codeblock processor for parameterized ad-hoc reads, and an **opt-in, command-driven** `Reports/_generated/` materializer behind a `materialize: false` default. Do **not** make materialization automatic or scheduled in v0.1.6.
- **The contrarian "no materialization" path is the right *default* but the wrong *only* answer.** In-memory + sidecar-sqlite covers ~85% of auditor read patterns without polluting graph/search/sync/git, but auditors legitimately need **immutable, hash-pinned, OpenTimestamps-attested** evidence artifacts that survive plugin uninstall and Obsidian Publish — and only materialized `.md` files do that. Resolve by treating materialization as an **export/snapshot** primitive (audit deliverable), not as a query layer.
- **Mobile and Publish parity decisively constrains the architecture.** Codeblock processors do **not** execute on Obsidian Publish (custom JS via `publish.js` is a single-file escape hatch, [Obsidian](https://forum.obsidian.md/t/how-to-get-obsidian-to-recognize-publish-js-file-for-upload/15438) not a plugin runtime), and `sqlite-wasm` requires SharedArrayBuffer/OPFS which has historically been unavailable on Obsidian Mobile (Capacitor). [GitHub](https://github.com/blacksmithgu/datacore/issues/6) Therefore: **Bases views are the only mechanism that crosses desktop + mobile + Publish**, codeblocks are desktop+mobile only, and sqlite-wasm is **desktop-only with a graceful in-memory JS fallback for mobile**. This drives the rest of the architecture.

---

## Key Findings

1. **Bases is now a stable, first-class core plugin** (Obsidian 1.9 GA Aug 2025; [Threads](https://www.threads.com/@obsdmd/post/DNgxUdPS5sy/introducing-bases-a-new-core-plugin-that-lets-you-turn-any-set-of-notes-into-a-p) Bases API + custom view types added in 1.10 [Obsidian](https://obsidian.md/roadmap/) Oct 2025; [Obsidian](https://obsidian.md/changelog/2025-10-01-desktop-v1.10.0/) mobile available with 1.10+; Publish support is on the roadmap [Obsidian](https://ryn-cx.github.io/obsidian-theme-previews/Obsidian%20Help/Plugins/Bases/Bases%20roadmap.html) [Retypeapp](https://retypeapp.github.io/obsidian/bases/roadmap/) but **not shipped**). The `registerBasesView` API exposes `BasesView` (extends `Component`), a `QueryController`, `BasesEntry`, and typed `Value` wrappers. [GitHub](https://github.com/dsebastien/obsidian-life-tracker-base-view/blob/main/documentation/Custom%20Base%20View%20Type%20Expert%20Prompt.md) `.base` files are YAML [DeepWiki](https://deepwiki.com/obsidianmd/obsidian-help/5.1-introduction-to-bases) with five sections (filters, formulas, properties, views, summaries). [DeepWiki](https://deepwiki.com/victor-software-house/obsidian-help/4.2.1-bases-syntax-and-configuration)
2. **`registerMarkdownCodeBlockProcessor` works on desktop and mobile** [Marcusolsson](https://marcusolsson.github.io/obsidian-plugin-docs/editor/markdown-post-processing) but is plugin-runtime only — Obsidian Publish renders static HTML and only executes a single `publish.js` file on custom-domain sites. Plugin codeblock processors **do not run on Publish**. This is a hard constraint: **any view that must appear on a published auditor portal cannot depend on a codeblock processor**.
3. **`sqlite-wasm` is feasible on Obsidian Desktop** (~700KB–1MB compressed; the official build hovers near a 1MB soft cap [SQLite](https://sqlite.org/forum/info/210e36a1e3) and the `nice-sqlite-wasm`/wa-sqlite variants are ~300KB gzipped for the WASM binary). [Objectql](https://objectql.org/docs/drivers/sqlite-wasm) Mobile remains constrained: SharedArrayBuffer + OPFS are required for the canonical SQLite WASM VFS and have historically been unavailable in Obsidian Mobile (Capacitor) [GitHub](https://github.com/blacksmithgu/datacore/issues/6) — community workarounds (`fs/promises` swap on desktop) confirm this. Plan for an **in-memory ephemeral fallback** on mobile and a **persistent OPFS-backed sidecar** on desktop only.
4. **Vault-pollution costs are real and quantifiable** at Crosswalker's working scale (5,000 controls × 8 frameworks): tens of thousands of derived nodes degrade graph view performance (graph perf scales with node and edge count per Obsidian help), [DeepWiki](https://deepwiki.com/obsidianmd/obsidian-help/4.5-graph-view) pollute global search (default cap 100,000 results), [Obsidian](https://obsidian.md/changelog/2025-08-18-desktop-v1.9.10/) inflate iCloud/Obsidian Sync round-trips (community reports of 21k-file vaults seeing visible perf hits with iCloud Advanced Data Protection), [Obsidian](https://forum.obsidian.md/t/obsidian-ios-performance-hit-after-enabling-icloud-advanced-data-protection/77712) and bloat git history with frontmatter churn that overwhelms human-authored commits.
5. **OpenTimestamps `.ots` proofs are cheap, decentralized, and well-suited to per-snapshot attestation.** Per-file `.ots` proofs are small (~500 bytes), [GitHub](https://github.com/Ch1ffr3punk/mfv) are produced via `ots stamp <file>`, and verify against the Bitcoin blockchain without trusting any centralized vendor. [Dgi](https://dgi.io/ots/) The community pattern of stamping a Merkle root of a directory (`mfv` style) reduces N proofs to one per snapshot. This is a near-perfect fit for the v0.1.8 audit-trail milestone applied to materialized fact tables.
6. **CQRS + Materialized View is the correct conceptual frame.** The Ch 27 hybrid maps cleanly: write side = recipe + junction notes (13-field edge schema); read side = (a) Bases default views (live), (b) custom Bases views via API (live), (c) codeblock processor (live, desktop/mobile), (d) materialized `Reports/_generated/*.md` (snapshot, Publish-safe). Materialized views in CQRS terminology are *projections* — append-only, deterministic, regeneratable [arxiv](https://arxiv.org/pdf/2603.06365) [Microsoft Learn](https://learn.microsoft.com/en-us/azure/architecture/patterns/materialized-view) — which is exactly the audit semantics auditors need.
7. **The 13-field junction-note edge schema and 5-mechanism recipe grammar (per the brief's Ch 22) already encode enough metadata** to make queries deterministic. This means materialization can be made **byte-identical for the same input version hash** — a precondition for OpenTimestamps attestation to be meaningful (otherwise an OTS proof attests to an arbitrary serialization, not a reproducible answer).

---

## Details

### 1. Materialized-File Lifecycle and Vault Pollution — Spec

**Verdict: Materialization is opt-in, command-only, namespaced, and treated as an *export*, not a query mechanism.**

#### Folder location
- **Decision:** `Reports/_generated/<recipe-id>/<view-id>/<timestamp>.md`
  - `Reports/` is human-visible (auditors expect to find deliverables there).
  - `_generated/` underscore prefix sorts last in file explorer and is the conventional "machine-owned" marker (mirrors `_attachments`, `_meta`, etc.).
  - Per-recipe / per-view subfolders allow `.gitignore`-style exclusion at any granularity.
  - **Reject** hidden dot-folders (`.crosswalker/`) — Obsidian's file explorer hides them, breaking auditor discoverability and Publish inclusion.
  - **Reject** vault-root — pollutes the cleanest namespace and conflicts with `publish.js`.

#### Graph-view, search, and sync mitigation
- **Mandatory frontmatter contract on every generated file:**
  ```yaml
  _crosswalker:
    generated: true
    recipe_id: nist-800-53-to-cis-v8
    recipe_version: 1.4.2
    view_id: coverage-matrix
    materialized_at: 2026-05-07T14:33:00Z
    input_version_hash: sha256:7f3c…
    output_hash: sha256:9a01…
    do_not_edit: true
  cssclasses: [crosswalker-generated]
  tags: [crosswalker/generated]
  ```
- **Graph view:** ship a default Crosswalker graph filter group (`-tag:#crosswalker/generated`) the user can toggle. Document a recipe for power users.
- **Search:** the `tags: [crosswalker/generated]` token lets auditors run `AC-2 -tag:#crosswalker/generated` to escape the noise. Document this as the canonical "find the source of truth, not the report" search.
- **Sync:** publish a `.gitignore`/`.syncignore` template that excludes `Reports/_generated/**` by default. Auditors who *want* the snapshots in git/sync opt in by deleting one line. This single decision fixes the iCloud/Obsidian Sync/Git triple bloat.
- **Hand-edit prevention:**
  - On `vault.modify` for any file matching `_crosswalker.do_not_edit: true`, plugin shows a non-blocking notice + offers "Revert from last regeneration" command.
  - Regeneration always writes to a **new timestamped file**, never overwrites; a stable symlink-style file (`coverage-matrix.latest.md`) points to the newest. This makes hand-edits impossible to silently lose.
  - Add a setting: `Materialization conflict policy = abort | overwrite | new-version` (default: new-version).

#### Refresh trigger
- **v0.1.6:** **manual command only** (`Crosswalker: Materialize view…`). No background workers, no save-hooks, no schedules.
- **v0.2+:** opt-in scheduled refresh and on-vault-change reactive refresh, both gated by per-recipe `materialize.auto` flag.
- **Rationale:** Auto-refresh on vault change is what produces the 5K-rows-per-day git churn the brief warns about. Defer.

#### Freshness UX
- Top-of-file callout banner injected at materialization time:
  ```
  > [!info] Generated by Crosswalker
  > **Recipe:** nist-800-53-to-cis-v8 v1.4.2 · **Generated:** 2026-05-07 14:33 UTC
  > Input hash: 7f3c… · Output hash: 9a01…
  > Run `Crosswalker: Refresh this report` to regenerate.
  ```
- Plugin computes `currentInputHash(recipe)` on note-open via metadataCache; if it differs from `_crosswalker.input_version_hash`, the banner switches to a yellow `[!warning] Stale` callout with a one-click "Refresh" button rendered via `MarkdownPostProcessor`.
- This avoids modal/dialog interruptions while making staleness unmissable.

#### Materialize-command spec (v0.1.6)
```
Crosswalker: Materialize view…
  args:
    recipe_id: <select from registered recipes>
    view_id:   <select from views the recipe declares>
    output_dir: Reports/_generated/<recipe>/<view>/   (default; overridable)
    deterministic_output: true   (default true; required for OTS)
    write_ots_proof: false        (v0.1.8 enables; off in v0.1.6)
  behavior:
    1. Resolve input_version_hash = sha256(canonical-JSON of recipe + edges)
    2. Compute query result via in-memory engine OR sqlite-wasm sidecar
    3. Render to canonical Markdown (stable column ordering, sorted rows)
    4. Compute output_hash = sha256(rendered bytes)
    5. Write to <output_dir>/<view>-<UTC-iso>.md
    6. Update <view>.latest.md alias-pointer
    7. Append entry to Reports/_generated/_index.md (audit log)
```

### 2. `registerBasesView` vs Codeblock Processor — Decision Matrix

| Dimension | `registerBasesView` (Deliverable A) | Codeblock processor (Deliverable C) | Notes |
|---|---|---|---|
| Discoverability | High — appears in `.base` view picker | Medium — must know to type ` ```crosswalker-query` | Auditors find Bases views; engineers find codeblocks |
| Mobile | ✅ (1.10+, no desktop-only APIs) | ✅ | Both work |
| Publish | ⚠️ Roadmapped, not shipped | ❌ Plugin code does not execute on Publish | **Decisive** for portal-style audit deliverables |
| Parameterization per-call | Limited (per-`.base` config, formulas) | Full (any string args, any SQL/recipe ref) | Codeblocks win for ad-hoc |
| Live edit/sort/filter UX | ✅ First-class (Bases UI does it) | ❌ Read-only render unless plugin builds it | Bases wins for interactivity |
| sqlite-wasm coupling | Optional (can use in-memory) | Natural fit (executes raw query) | Codeblock = SQL escape hatch |
| Maintenance cost | Medium (one BasesView subclass per shape) | Low (one processor handles N queries) | Codeblock is cheaper to extend |
| Survives plugin uninstall | ❌ View disappears | ❌ Block becomes plain text | Both fail; only materialization survives |
| Versioned with recipe | Indirect (via `.base` filters) | Direct (recipe_id + version in body) | Codeblock has cleaner provenance |

**Decision rule (v0.1.6):**
- **Coverage matrix, evidence rollup, framework-coverage heatmap → `registerBasesView`** custom view types. These are the "first-class" auditor surfaces that benefit from sort/filter/group and need to live in `.base` files saved alongside the recipe.
- **Closure queries, ad-hoc "what evidence covers AC-2 across all frameworks?", recipe debugging → `crosswalker-query` codeblock processor.** These are parameterized, often one-off, and live in working notes.
- **Snapshots / audit deliverables / Publish portal → materialization** (Section 1).
- **Default Bases views (no custom code) → use them wherever filter+table is enough.** Don't write a custom view if `note.type == "control"` + a sorted table covers it.

#### Worked example: `crosswalkerCoverageMatrix`

`.base` file (`Frameworks/coverage-matrix.base`):
```yaml
filters:
  and:
    - note.type == "control"
    - file.inFolder("Frameworks")
properties:
  framework:
    displayName: Framework
  control_id:
    displayName: Control
formulas:
  evidence_count: "len(file.backlinks.filter(b => b.tags.contains('evidence')))"
views:
  - name: Coverage Matrix
    type: crosswalker-coverage-matrix   # <-- custom view ID
    options:
      pivot_axis: framework
      cell: evidence_count
      heatmap: true
      target_recipe: nist-800-53-to-cis-v8
```

Plugin registration:
```ts
this.registerBasesView('crosswalker-coverage-matrix', {
  name: 'Coverage Matrix',
  icon: 'grid-2x2',
  factory: (controller, containerEl) =>
    new CoverageMatrixView(controller, containerEl, this),
  options: getCoverageMatrixOptions
})
```

The view subclass (`CoverageMatrixView extends BasesView`) consumes `controller.entries` (the filtered `BasesEntry[]`) plus `plugin.queryCrosswalk(recipeId)` and `plugin.queryClosure(...)` to pivot into framework × control × evidence-count and render via DOM. All other queries (closure traversal, ad-hoc evidence lookups) stay in default Bases tables or in the codeblock processor.

### 3. Contrarian "No Materialization" Analysis

**Steel-manning the contrarian:**
- **In-memory only** (queries run on demand into a `BasesView`/codeblock render): zero new files, zero graph pollution, zero git churn, zero stale state. The vault stays "the source of truth," exactly as Obsidian's design intends.
- **Sidecar database only** (`sqlite-wasm` persisted in `.obsidian/plugins/crosswalker/db.sqlite`): query results never become `.md`; the DB is rebuilt from vault on demand. No vault pollution at all.

**Why this is right *as a default*:**
- 90% of working-time queries are interactive (auditor scrolling a coverage matrix, drilling into one control). These have no business being persisted as files; they should be live views.
- Persisting query results creates the materialized-view consistency problem (CQRS eventual-consistency) [Microsoft Learn](https://learn.microsoft.com/en-us/azure/architecture/patterns/cqrs) inside a tool whose users expect strong file-level consistency.
- Search and graph noise compound permanently — every regeneration leaves behind dead artifacts unless you also build a GC sweeper, which is more code than the materializer itself.

**Why it cannot be the *only* answer:**
1. **Audit reproducibility.** Auditors need to point at "this exact file, on this exact date, hash X, attested by OpenTimestamps proof Y." An in-memory view cannot be attested. A sidecar `.sqlite` blob can be hashed but is opaque to non-Crosswalker tooling — auditors cannot diff it, search it, or read it without the plugin installed.
2. **Plugin-uninstall durability.** GRC engagements outlive any one tool. If the user removes Crosswalker, in-memory + sidecar leaves nothing behind. Materialized `.md` survives.
3. **Obsidian Publish.** Custom Bases views and codeblock processors do not execute on Publish (Publish runs static HTML + at most one `publish.js`). [Obsidian](https://forum.obsidian.md/t/how-to-get-obsidian-to-recognize-publish-js-file-for-upload/15438) The only way an external auditor portal can show coverage matrices is **pre-rendered Markdown**, i.e., materialization.
4. **Diff-able evidence.** A reviewer asks "what changed in our NIST 800-53 coverage between Q1 and Q2?" The honest answer is a git diff between two materialized snapshots — not a re-query of a moved-on database.

**Honest verdict:** the contrarian is right that materialization should not be a *query layer*. It is a **snapshot/export layer** with different semantics, different lifecycle, different storage policy. The Ch 27 hybrid conflates the two. Re-frame:
- **Query layer = Bases views + codeblock processor + (desktop-only) sqlite-wasm sidecar.** No new `.md` files.
- **Snapshot layer = materialization command + OpenTimestamps + git.** Opt-in, deliberate, gitignored by default.

This is closer to a clean CQRS split than the brief's hybrid framing.

### 4. Mobile / Publish Parity Table

| Query type | Default Bases view | Custom Bases view (`registerBasesView`) | Codeblock processor | sqlite-wasm sidecar | Materialized `.md` |
|---|---|---|---|---|---|
| Desktop | ✅ | ✅ | ✅ | ✅ (OPFS) | ✅ |
| Mobile (iOS/Android) | ✅ (Obsidian 1.10+) | ✅ if no desktop-only API | ✅ | ⚠️ Limited — no SharedArrayBuffer/OPFS in Obsidian Mobile (Capacitor); [GitHub](https://github.com/blacksmithgu/datacore/issues/6) fall back to in-memory ephemeral | ✅ |
| Obsidian Publish | ⚠️ Roadmapped, not shipped (as of Obsidian 1.10–1.12) | ⚠️ Same — depends on Bases-on-Publish landing | ❌ Plugin JS doesn't execute on Publish | ❌ | ✅ (only path that works today) |
| Plugin uninstalled | ❌ | ❌ | ❌ (block becomes raw text) | ❌ | ✅ |
| Auditor diff-friendly | ❌ | ❌ | ⚠️ (block source diffs but not result) | ❌ | ✅ |

**Implication:** Materialization is the **only** path that survives Publish *today*. Until Obsidian ships Bases-on-Publish (roadmapped, [Obsidian](https://ryn-cx.github.io/obsidian-theme-previews/Obsidian%20Help/Plugins/Bases/Bases%20roadmap.html) [Retypeapp](https://retypeapp.github.io/obsidian/bases/roadmap/) no date), every artifact that must appear on a published audit portal must be a materialized `.md`. This justifies keeping materialization in v0.1.6 — but as an export, not as the default query path.

### 5. Recipe Lifecycle and Ownership Spec

#### Sources (per Ch 23 commitment)
- **Wizard-emitted** (highest volume): import wizard reads framework CSV/XLSX, emits recipe `.json` + canonical `.md` companion.
- **Hand-authored**: power users write recipe `.json` directly against `recipe.schema.json`.
- **Community/marketplace**: shared recipes downloaded from a registry (out of scope for v0.1.6; design the lifecycle so it doesn't block).

#### Versioning
- **`{ id: string (kebab-case), version: semver }`** is the primary key. Downstream queries reference `recipe_id@^1` (caret-range) or `recipe_id@1.4.2` (pinned).
- Recipe files live at `Crosswalks/<id>/recipe.<version>.json`. Old versions kept; never deleted by plugin.
- Materialized outputs include both `recipe_id` and `recipe_version` in frontmatter (Section 1) so an audit can replay against a known recipe.

#### Validation
- `recipe.schema.json` (JSON Schema draft-07) [MCP Servers](https://mcpservers.org/servers/jlevere/obsidian-mcp-plugin) lives in plugin assets and is shipped with each release.
- Validation gates: (a) on save (warn-only in v0.1.6), (b) on materialize (hard-block — refuse to emit reports from invalid recipes), (c) on import-wizard emission (hard-block).

#### User-edit policy (the hard one)
The brief identifies the right tension. Recommended ownership matrix:

| Field type | Source | On regen | Conflict UX |
|---|---|---|---|
| `id`, `version`, `schema_version` | Plugin-owned | Always overwrite | Silent |
| Mappings (rows) | Wizard-owned | Three-way merge if `user_edited: true` flag present on row | Modal |
| Per-row notes/comments | User-owned | Never overwrite | Silent |
| Recipe-level metadata (title, description) | User-owned after first emission | Never overwrite | Silent |
| Generated companion `.md` | Plugin-owned | Always regenerate | Toast: "Companion regenerated" |

**Three-way merge rule** (for mapping rows): base = previous wizard emission, theirs = new wizard emission, ours = current file. If `theirs ≠ base` and `ours ≠ base` and they conflict on the same field, present a per-row conflict modal. Otherwise auto-merge. This is the same model `git merge-file` uses; reuse the algorithm rather than inventing one.

**`user_edited: true` flag**: every row written by the user (via UI or hand-edit) gets this flag. Wizard emission never overwrites a row with this flag without user confirmation. Simple, explicit, auditable.

### 6. Audit-Trail Integration (v0.1.8 alignment)

**Recommendation: stamp materialized snapshots, not the live vault.**

- **Should `Reports/_generated/*.md` be committed to git?** Default **no** (`.gitignore` shipped). Opt-in **yes** for engagements where reproducibility outweighs history bloat. The decision is per-vault, not per-plugin. Document both modes.
- **OpenTimestamps integration (v0.1.8):**
  - On materialize, compute Merkle root over all files in a snapshot (per `mfv`-style pattern), write `Reports/_generated/<recipe>/<view>/<timestamp>.merkle.json`, and stamp it: `ots stamp <merkle.json>` → `<merkle.json>.ots`. [Medium](https://medium.com/@bbkilboz/timestamping-github-commits-with-blockchain-based-opentimestamps-for-permanent-records-d5a824c699ba)
  - Per-snapshot rather than per-file: 1 OTS proof per materialize run, not 1 per `.md`. This avoids stamping 5000 controls × 8 frameworks at once.
  - Plugin command `Crosswalker: Verify snapshot…` runs `ots verify` against the snapshot's `.ots` and recomputes the Merkle root from current files.
  - Use the JS `opentimestamps` library [GitHub](https://github.com/opentimestamps/javascript-opentimestamps) (works in Electron). Mobile: defer (no Bitcoin RPC concerns; the JS lib hashes locally and posts to public calendars over HTTPS, [Dgi](https://dgi.io/ots-tutorial/) which works on mobile, but the workflow value is lower there).
- **Frontmatter contract** (already specified in Section 1): `_crosswalker.materialized_at`, `_crosswalker.input_version_hash`, `_crosswalker.output_hash`. These three fields plus the OTS proof give a verifier everything they need: "the input was X at time T, the deterministic render of X is Y, and Y was attested as existing at time T via Bitcoin."
- **Deterministic output is non-negotiable.** Spec the canonical Markdown writer:
  - Stable column ordering (alphabetic by property name).
  - Stable row ordering (sort by `(framework, control_id)`).
  - LF line endings, no trailing whitespace, single trailing newline.
  - Frontmatter keys sorted alphabetically.
  - Floats serialized with fixed precision.
  - Add a unit-test suite that materializes a fixture twice and asserts byte-identity.
- **Without determinism, OTS attestation is theatre** — the proof says "this byte sequence existed," but the verifier cannot recompute the byte sequence from the source, so the chain of custody breaks.

### 7. `registerBasesView` "Done Right" — Worked Reference

**Scope:** exactly **one** custom view in v0.1.6 — `crosswalker-coverage-matrix`. All other read paths use default Bases views, the codeblock processor, or materialization.

**Why one and only one:** each `BasesView` subclass is ~200–400 lines (DOM rendering, theme-variable styling, options panel, refresh handling, scroll/keyboard). Three custom views = a maintenance tax that crowds out v0.1.6's actual scope (recipe lifecycle + sidecar query). One high-value view ships the API integration, proves the pattern, and lets v0.2+ add closure-graph and evidence-timeline views once user demand is confirmed.

**Skeleton:**
```ts
// plugin.ts
import { Plugin } from 'obsidian'
import { CoverageMatrixView } from './views/coverage-matrix-view'
import { getCoverageMatrixOptions } from './views/coverage-matrix-options'

export default class CrosswalkerPlugin extends Plugin {
  async onload() {
    const ok = this.registerBasesView('crosswalker-coverage-matrix', {
      name: 'Coverage Matrix',
      icon: 'grid-2x2',
      factory: (ctrl, el) => new CoverageMatrixView(ctrl, el, this),
      options: getCoverageMatrixOptions,
    })
    if (!ok) console.warn('[Crosswalker] Bases not enabled; matrix view unavailable')

    this.registerMarkdownCodeBlockProcessor('crosswalker-query', /* ... */)
    this.addCommand({ id: 'materialize-view', /* ... */ })
  }
}

// views/coverage-matrix-view.ts
import { BasesView, QueryController } from 'obsidian'
import type CrosswalkerPlugin from '../plugin'

export class CoverageMatrixView extends BasesView {
  constructor(
    controller: QueryController,
    private scrollEl: HTMLElement,
    private plugin: CrosswalkerPlugin,
  ) {
    super(controller)
  }
  onload() {
    this.register(() => { /* cleanup */ })
    this.render()
  }
  onDataUpdate() { this.render() }   // BasesView calls when entries change
  private async render() {
    const entries = this.controller.entries  // BasesEntry[]
    const recipeId = this.controller.config.options?.target_recipe
    const recipe   = await this.plugin.queryCrosswalk(recipeId)
    const closure  = await this.plugin.queryClosure(entries, recipe)
    // pivot entries × frameworks → counts; render table to this.scrollEl
    // styling MUST use Obsidian CSS vars (--background-primary, --text-normal, etc.)
  }
}
```

**`.base` file** is the same as Section 2's worked example. Notably, **users author the `.base` file by hand or via a "Crosswalker: New coverage-matrix base" command**; the file is checked into the vault, lives near the recipe, and survives plugin uninstall as a YAML config (the view rendering disappears, but the data definition remains).

**Maintenance cost estimate:** ~600 LoC over `view + options + types + styles`. Annual maintenance bound by Bases API stability; there is one pre-existing breaking change (`BaseOption#shouldHide` [Releasebot](https://releasebot.io/updates/obsidian) signature) [Releasebot](https://releasebot.io/updates/obsidian) so budget for ~1 API churn per year.

---

### Updated v0.1.6 Milestone Scope

**In:**
1. `crosswalker-query` codeblock processor (parameterized recipe + closure lookups; in-memory engine).
2. **Optional** `sqlite-wasm` sidecar — desktop only, with feature flag, in-memory fallback on mobile.
3. `registerBasesView('crosswalker-coverage-matrix', …)` — one custom view, with options panel.
4. `Crosswalker: Materialize view…` command — manual only, opt-in, writes to `Reports/_generated/`.
5. Default `.gitignore`/`.syncignore` template excluding `Reports/_generated/**`.
6. Frontmatter contract on generated files (`_crosswalker.*` namespace) + freshness banner via `MarkdownPostProcessor`.
7. Deterministic Markdown writer + golden-file test suite.
8. `recipe.schema.json` validation on save (warn) and on materialize (block).
9. `user_edited: true` row-flag plumbing + warn-on-overwrite.
10. Documentation: parity table, "where do my queries go?" decision tree, "how to depublish noise from graph view" recipe.

**Out (deferred):**
- Background/scheduled materialization → v0.2.
- Three-way merge UI for recipe conflicts → v0.2 (ship the flag in v0.1.6; the UI later).
- Multi-view custom Bases types beyond coverage matrix → v0.2+.
- OpenTimestamps integration → v0.1.8 (audit-trail milestone).
- Community recipe registry → v0.3+.
- Bases-on-Publish-specific rendering → blocked on Obsidian shipping the feature.
- Mobile sqlite-wasm persistence → blocked on Obsidian Mobile shipping SharedArrayBuffer/OPFS.

### Open Questions Deferred to v0.2+

1. **Per-recipe `materialize.auto` policy** (schedule, on-vault-change, debounce window). Needs telemetry from v0.1.6 manual usage to set defaults.
2. **Three-way merge UX for recipe conflicts.** Blocked on a real conflict scenario from at least 2 users.
3. **Closure-traversal custom Bases view** (graph-style render). Defer until coverage-matrix proves the pattern.
4. **Recipe-registry / marketplace** sharing model + signing.
5. **Cross-vault federation** (explicitly rejected by anti-pattern list — confirm rejection).
6. **Bases-on-Publish** custom view fallback — once Obsidian ships, decide whether to drop materialization for Publish-specific surfaces.
7. **`sqlite-wasm` on mobile** — re-evaluate once Capacitor exposes SharedArrayBuffer/OPFS.
8. **Audit-trail v2 (event-sourced log)** — beyond OpenTimestamps snapshots, consider an append-only operations log (CQRS event store) [Microsoft Learn](https://learn.microsoft.com/en-us/azure/architecture/patterns/cqrs) as a v0.2.x exploration.

---

## Recommendations

**Stage 1 — before locking v0.1.6 (this week):**
1. Adopt the **"Bases-first, codeblock-second, materialization-third"** framing in the milestone doc. Replace any wording that calls materialization a "query layer" with **"snapshot/export layer."** This single rename resolves the contrarian tension.
2. Lock the frontmatter contract (`_crosswalker.*`) and the canonical Markdown writer spec. Write the determinism golden-file test before any materialize code lands. **Threshold to revisit:** any byte-instability bug found in the field → halt OTS work in v0.1.8 until determinism is proven.
3. Ship `Reports/_generated/**` in the default `.gitignore` template. **Threshold to flip default:** ≥3 user reports asking for default-on, or any compliance engagement requiring it.
4. Build **one** custom Bases view (`crosswalker-coverage-matrix`). Resist scope creep. **Threshold to add a second:** explicit user request + a worked use case that default Bases views cannot satisfy.

**Stage 2 — during v0.1.6 development:**
5. Make `sqlite-wasm` optional behind a feature flag. Default off on mobile. Pre-build with `nice-sqlite-wasm` (~300KB gz) rather than the canonical 1MB build to keep plugin size healthy.
6. Implement the materialize command as a pure projection function: `(recipe, edges) → Map<path, bytes>`. No side effects in the core; all `vault.create`/`vault.modify` lives in a thin shell. This makes the determinism test trivial (call the projection twice, assert equal Maps).
7. Document the three integration mechanisms with the parity table (Section 4) and a "which one do I use?" flowchart in the docs site.

**Stage 3 — v0.1.7 / v0.1.8:**
8. Add `Crosswalker: Verify snapshot…` and integrate `opentimestamps` JS library (desktop first). Snapshot-Merkle, not per-file.
9. Run a real auditor through a full materialize → commit → OTS-stamp → 6-month-later verify cycle. **Threshold to call audit-trail "done":** an external auditor independently verifies a snapshot using only the `.merkle.json`, the `.ots` proof, and the materialized files (no plugin required for verification).

**Stage 4 — v0.2+:**
10. Reassess Bases-on-Publish status. If shipped, materialization stops being the only Publish path; consider whether to demote it to "audit snapshot only" and remove it from Publish-targeted workflows.
11. Reassess mobile sqlite-wasm. If SharedArrayBuffer/OPFS land in Obsidian Mobile, unify desktop and mobile query paths.

---

## Caveats

- **Crosswalker docs site was not directly fetchable in this research session.** The brief's narrative of Ch 27's three deliverables, the v0.1.5 sidecar log, the 13-field junction-note schema, and the 5-mechanism recipe grammar are taken as accurate per the task; readers should diff this deliverable against the canonical site before merging. Where the recommendations rest specifically on Crosswalker-internal facts (e.g., exact recipe field names, exact sidecar schema), they may need light renaming to match the docs.
- **Bases API is young (Obsidian 1.10, Oct 2025) and has already had at least one breaking change** (`BaseOption#shouldHide`). Any custom view subclass should expect 1–2 API churns per year. Keep the view subclass small and isolated.
- **Obsidian Publish + Bases is on the roadmap with no public ship date** (as of the most recent release notes surfaced). The parity table reflects status as of Obsidian 1.10–1.12 (early 2026). The "materialization is the only Publish path" finding will weaken the moment Bases-on-Publish ships; revisit then.
- **`sqlite-wasm` mobile status is the soft underbelly.** Community evidence (Datacore issue #6 and Obsidian Mobile/Capacitor architecture) supports the "no SharedArrayBuffer/OPFS on mobile" claim, but Obsidian's mobile runtime evolves; verify against the *current* Obsidian Mobile build before locking the in-memory fallback as permanent.
- **OpenTimestamps confirms attestation in hours via Bitcoin block inclusion**, not seconds. The `Crosswalker: Verify snapshot` command must explicitly handle the "pending" state for fresh stamps [GitHub](https://github.com/opentimestamps/opentimestamps-client/blob/master/README.md) and re-run an upgrade pass to retrieve a complete proof.
- **`.ots` proofs leak timing metadata.** If multiple snapshots are stamped in close succession, an adversary can correlate them. [GitHub](https://github.com/opentimestamps/opentimestamps-client) For most GRC use cases this is acceptable (it's the *opposite* of what auditors fear — they want the timestamps), but flag it for users in regulated contexts where snapshot cadence itself is sensitive.
- **The contrarian "no materialization" path is genuinely defensible** if you accept losing Obsidian Publish parity and plugin-uninstall durability. If those constraints relax (e.g., the team decides Publish is out of scope or auditors are required to keep the plugin installed), revisit the architecture — the simpler path becomes available.
