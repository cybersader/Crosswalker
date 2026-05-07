---
title: "Ch 28 deliverable C: Narrow v0.1.6 hard — Bases-only default; defer materialization to v0.1.8"
description: "Fresh-agent research deliverable C for Challenge 28. Most conservative of the three. Verdict: hold Ch 27 hybrid but narrow v0.1.6 to a single registerBasesView (crosswalkerCoverageMatrix) as the only default surface; defer materialization-to-Markdown entirely to v0.1.8 so the audit-trail milestone owns lifecycle and reproducibility rules. _crosswalker/views/ folder convention (underscore not dot — Obsidian doesn't index dot-folders). Mobile + Publish parity as binding constraint (sqlite-wasm + OPFS unavailable on Obsidian Mobile via Capacitor; codeblock processors never execute on Publish). Manifest-first audit model (one OpenTimestamps proof per snapshot manifest, not per row). Junctions are the only audit truth; matrices are caches. Adversarial-by-design framing — more conservative than Ch 27's three convergent deliverables suggested."
tags: [research, deliverable, query-layer, bases, narrow-and-defer, no-materialization-v0-1-6, mobile-publish-parity, opentimestamps, manifest-first-audit, junctions-as-truth, dbt-recipe-pattern, ch-28]
date: 2026-05-07
sidebar:
  label: "Ch 28c: Narrow and defer"
  order: -20260507.6
---

:::tip[Origin and lifecycle]
Fresh-agent research deliverable produced 2026-05-07 in response to [Challenge 28: Bases query layer follow-on stress test](/crosswalker/agent-context/zz-challenges/28-bases-query-layer-followon-stress-test/). One of three parallel deliverables ([A: Bases-first hybrid](/crosswalker/agent-context/zz-research/2026-05-07-challenge-28-deliverable-a-bases-first-hybrid/), [B: stress-test matrix](/crosswalker/agent-context/zz-research/2026-05-07-challenge-28-deliverable-b-stress-test-matrix/), C: narrow-and-defer materialization). The most conservative of the three; explicitly more conservative than Ch 27's three convergent deliverables suggested. Reasoned from adjacent context — agent reports the docs site itself was not retrievable. Preserved verbatim.
:::

## TL;DR
- **Hold the Ch 27 hybrid verdict, but narrow it hard for v0.1.6:** ship Bases as the *only* default query surface (using a single registered custom view, `crosswalkerCoverageMatrix`), keep the SQL/sqlite-wasm sidecar strictly as an opt-in, in-memory escape hatch, and **defer materialization-to-Markdown entirely to v0.1.8** so the audit-trail milestone — not the query milestone — owns the lifecycle and reproducibility rules.
- **The single biggest risk is materialized-file pollution**, not API choice. A 5,000-control × 8-framework matrix written as YAML-frontmatter notes would balloon the vault, the graph, search, sync (iCloud/Obsidian Sync) and Git history, and Obsidian explicitly does *not* render dot-prefixed folders. [Obsidian](https://forum.obsidian.md/t/enable-use-of-hidden-files-and-folders-starting-with-a-dot-dotfiles-dotfolders-within-obsidian/26908/55) The only safe convention is a top-level `_crosswalker/views/` folder (underscore, not dot) that users add to Files & Links → Excluded files, with hand-edit prevention via a content hash in frontmatter.
- **Mobile + Publish parity is the binding constraint**, not desktop performance. Bases ships on mobile in 1.10 but **Publish support is on the roadmap, not shipped**, custom `registerBasesView` views are not Publish-rendered, codeblock processors are *never* executed by Publish, and `sqlite-wasm` with OPFS does **not** work in Obsidian Mobile (Capacitor lacks the required SharedArrayBuffer/OPFS APIs). v0.1.6 must therefore ship a Bases-native default that degrades to a static table on Publish and to a no-SQL fallback on mobile.

## Key Findings

### 1. The Ch 27 hybrid is right, but Ch 27 deliverable A is more right than C for v0.1.6
The `registerBasesView` API is real, stable in Obsidian 1.10+, and is exactly the pattern TaskNotes v4 has now standardized on (`tasknotesTaskList`, `tasknotesKanban`, `tasknotesCalendar`, `tasknotesMiniCalendar`). It is the *only* path that gives Crosswalker:
- A native `.base` file the user can open, embed in a note, and parameterize via Bases filters.
- Plugin-rendered cells (coverage badges, framework swatches, junction-edge tooltips) without forking Bases internals.
- A graceful fallback: when Bases is disabled or on a Publish site, the underlying `.base` file degrades to plain frontmatter that Publish can at least display as a list.

The `crosswalker-query` codeblock processor (Ch 27 deliverable C) should ship later, **not as the default surface**, because codeblock processors are explicitly not executed by Obsidian Publish — they render as raw fenced code, exactly as Dataview does. Building the v0.1.6 default on a non-Publish-renderable mechanism is a strategic mistake when Publish parity is on Bases' own roadmap.

### 2. Materialization is the real architectural risk, not query mechanics
Three concrete pollution vectors are confirmed by the Obsidian platform itself:

- **Graph view**: Obsidian's only documented exclusion mechanism is *Settings → Files & Links → Excluded files* (path-prefix filter, applied to graph + search + quick switcher). Dot-prefixed folders (`.crosswalker/`) are *not* indexed by Obsidian at all [Obsidian](https://forum.obsidian.md/t/enable-use-of-hidden-files-and-folders-starting-with-a-dot-dotfiles-dotfolders-within-obsidian/26908/55) (a long-standing complaint on the forum, partially worked around by show-hidden-files plugins) [GitHub](https://github.com/chenqing0106/obsidian-show-dotfiles) — which means putting materializations in `.crosswalker/views/` makes them invisible to Bases too. This rules out the dot-folder option for *materialized output that Bases must read*.
- **Sync**: iCloud and Obsidian Sync sync every Markdown file by default; a `Reports/coverage-gap-NIST-800-53.md` carrying ~5K rows of frontmatter at every refresh is a sync-storm anti-pattern.
- **Git history**: a single regen of an 8-framework × 5K-control matrix is a multi-megabyte diff. With `--rebase`-friendly auditors that's tolerable; with squash-merge GRC workflows it inflates blame and makes timeline diffing painful.

The only viable convention is a **single top-level `_crosswalker/views/` folder** (underscore, not dot) so Bases can read it but users can one-click exclude it. Hand-edit prevention requires the generator to embed a `crosswalker.contentHash` field in frontmatter and re-hash on regen; if the hash mismatches the body, the regen aborts and surfaces a "user-edited materialization" warning rather than silently overwriting auditor edits.

### 3. The contrarian "no materialization" path is the safest v0.1.6 default
Precedents support pure in-memory rendering: SQLSeal renders SQL-over-CSV results in codeblocks without writing artifacts; Dataview renders queries entirely in-memory; Bases itself is a pure read-side projection over frontmatter. The arguments *against* no-materialization (not portable, not Publish-visible, not editable, not Git-versioned) are real but every one of them is **already paid for by junction notes** (which *are* materialized, *are* in Git, and *are* the canonical evidence). The coverage matrix is a *projection* of junctions, not a separate truth. Materializing it is a cache, and treating a cache as audit evidence is a category error.

**Verdict:** v0.1.6 should default to no-materialization (Bases view + optional codeblock for SQL queries). v0.1.8 introduces opt-in "snapshot" materialization explicitly tied to the audit-trail timestamp model.

### 4. Mobile + Publish parity matrix — the binding constraints
| Mechanism | Desktop | Mobile (1.10+) | Obsidian Publish |
|---|---|---|---|
| Bases core (`.base` file, table view) | ✅ | ✅ (1.10) | 🟡 On roadmap, *not shipped* |
| `registerBasesView` (custom view, e.g. coverage matrix) | ✅ | ✅ when API is enabled | ❌ Plugin code does not run on Publish |
| Codeblock processor (`crosswalker-query`) | ✅ | ✅ | ❌ Never executes (Dataview, sqlseal also do not render) |
| `sqlite-wasm` (OPFS-backed) | ✅ Desktop Electron | ❌ Capacitor lacks SharedArrayBuffer/OPFS — confirmed by Obsidian forum + datacore Issue #6 | ❌ |
| `sql.js` (in-memory wasm, ~700 KB) | ✅ | ⚠️ Works but RAM pressure on iOS, no persistence across reloads | ❌ |
| Plain frontmatter projected by Bases | ✅ | ✅ | 🟡 (when Publish ships Bases) |

Operational implication: the **default coverage view must work on a vault where sqlite-wasm is unavailable**, i.e. it must be a Bases view over junction-note frontmatter, with SQL as enrichment-only on desktop.

### 5. Recipe lifecycle — apply dbt's "model" mental model, not "config file"
Recipes (`.crosswalker/recipes/coverage-gap-by-framework.yaml`) need the same lifecycle controls dbt's model files have:
- **Provenance field** in every recipe: `source: system | user | community` plus `crosswalker_version` and a SHA256 of the canonical body.
- **Conflict resolution**: a wizard-emitted recipe carries `system: true`; if a user edits it, the next plugin upgrade detects hash drift and writes the new system version to `coverage-gap-by-framework.system.yaml` while preserving the user's file as authoritative — same pattern Templater uses for shipped templates and dbt uses for `dbt_project.yml` overrides.
- **Validation**: a JSON Schema in `.crosswalker/schema/recipe.schema.json` validated at load-time, with errors surfaced as Obsidian Notices (not silent failures — auditors must see broken queries).
- **Versioning**: SemVer in the recipe header (`schema_version: 1.0.0`); plugin refuses to execute recipes with major version mismatches.
- **Community sharing**: recipes are plain YAML so they're shareable as gists; the Crosswalker repo should ship a `recipes/` directory of reference recipes (coverage gap, control overlap, framework crosswalk delta) treated as canonical examples.

### 6. Audit-trail integration — defer to v0.1.8, design now
GRC industry guidance (Sprinto, Hyperproof, Diligent, anecdotes.ai) all converge on the same pattern: audits need **point-in-time evidence** that is *reproducible* and *tamper-evident*. The Ch 15 non-git audit-trail decision plus OpenTimestamps' real cryptographic guarantees give a clean v0.1.8 design:

- **Don't commit materializations to Git for audit reproducibility.** Materializations are projections; commit the *junctions* (already done in v0.1.4) plus the *recipe* plus a *manifest* that records the input hashes and the plugin version. Reproducibility = "rerun this recipe at this Crosswalker version against these junction hashes." That gives byte-identical output without storing the output.
- **Determinism requirement**: recipes must produce stable row ordering (canonical sort by `control_id, framework, junction_id`) and stable JSON/YAML key ordering. This is non-negotiable for audit replay (cf. IBM's DFAH determinism harness on arXiv [arxiv](https://arxiv.org/pdf/2601.15322) — agents that aren't deterministic aren't auditable).
- **OpenTimestamps**: stamping per-materialization is overkill. Stamp the *manifest* (a small JSON file listing junction-hashes + recipe-hash + plugin-version + timestamp) once per audit-snapshot event. One `.ots` per snapshot, not one per fact-table row. This matches how OpenTimestamps is used in CI (per-commit, not per-file) and how compliance teams currently use it for ISO 27001 / SOC 2 evidence anchoring.
- **Storage**: snapshots live in `_crosswalker/audit/<iso-date>/` with `manifest.json`, `manifest.json.ots`, and *optionally* the materialized matrices. The manifest alone is sufficient for replay; the matrices are convenience.

### 7. registerBasesView for ONE query (worked example: coverage matrix)
The minimum viable shape, modeled on TaskNotes v4 and the published `dsebastien/obsidian-life-tracker-base-view` reference:

```ts
// In Plugin.onload()
const ok = this.registerBasesView('crosswalkerCoverageMatrix', {
  name: 'Coverage Matrix',
  icon: 'grid-3x3',
  factory: (controller, containerEl) =>
    new CoverageMatrixView(controller, containerEl, this),
  options: getCoverageMatrixOptions, // pivot framework, group-by, hide-covered toggle
});
if (!ok) console.warn('Bases is not enabled in this vault');
```

`CoverageMatrixView extends BasesView` (the abstract class from the obsidian-api `.d.ts`). The `controller` (`QueryController`) supplies the filtered `BasesEntry[]` — each entry is one junction note. [GitHub](https://github.com/dsebastien/obsidian-life-tracker-base-view/blob/main/documentation/Custom%20Base%20View%20Type%20Expert%20Prompt.md) The view pivots them into a control × framework matrix, painting cells using the junction's `relation_type` and `confidence` fields (already in the v0.1.4 13-field schema). Configuration (which framework is the row axis, which is the column axis, whether to show only gaps) is persisted via `controller.config.set()` so it survives across sessions in the `.base` file itself. Maintenance cost is bounded: a single class, ~300–500 LOC by TaskNotes' analogous classes, with test surface = the BasesEntry → cell-render projection.

A user creates `Coverage NIST↔ISO.base` with `views: [{ type: crosswalkerCoverageMatrix, name: 'NIST × ISO', filters: { and: [ note.kind == "junction", note.framework_a == "NIST 800-53", note.framework_b == "ISO 27001" ] } }]`. That single `.base` file is portable, version-controlled, Publish-friendly when Bases ships there, and gracefully degrades to Bases' built-in table view if the plugin is uninstalled.

## Details

### Updated v0.1.6 milestone scope

**In scope (v0.1.6):**
1. Single `registerBasesView('crosswalkerCoverageMatrix', …)` registration with one custom view.
2. One reference `.base` file shipped to `_crosswalker/views/coverage-matrix.base` on first plugin run (idempotent — never overwrites user edits).
3. Bases-only default reads — no SQL, no codeblock processor in v0.1.6's hot path.
4. Recipe loader (`.crosswalker/recipes/*.yaml`) with JSON-Schema validation, but recipes only drive the wizard that *emits* `.base` files — they do not execute SQL yet.
5. `_crosswalker/` folder convention with first-run prompt: "Add `_crosswalker/views/` to Excluded Files? [Yes/No]".
6. Graceful Bases-disabled fallback: detect `registerBasesView` returning `false` and show a Notice with one-click enable for the core Bases plugin.

**Out of scope (deferred to v0.1.7):**
- `crosswalker-query` codeblock processor.
- sqlite-wasm-backed recipe execution.
- Recipe wizard UI (in v0.1.6, recipes are hand-authored YAML).
- A second/third custom Bases view (e.g. `crosswalkerOverlapMatrix`).

**Out of scope (deferred to v0.1.8 — audit-trail milestone):**
- Materialized-file lifecycle.
- OpenTimestamps integration.
- Audit-snapshot manifests.
- Deterministic-output guarantees and replay tooling.

### Decision matrix — which queries get which mechanism

| Query | Default mechanism | Why |
|---|---|---|
| Coverage matrix (control × framework) | `registerBasesView` | Pivoting is structural; Bases' table view can't pivot; one custom view is justifiable. |
| List junctions by control | Built-in Bases table view | No pivot, no aggregation; native Bases is sufficient. |
| List junctions by framework | Built-in Bases table view | Same. |
| Coverage gap report (which controls have <N junctions) | Built-in Bases table with formula | Bases supports computed properties + filters. |
| Cross-framework path (transitive junctions, e.g. NIST→SCF→ISO) | `crosswalker-query` codeblock (v0.1.7+) | Requires recursive SQL; Bases cannot express it. |
| Junction freshness / staleness | Built-in Bases | Date filter on `last_reviewed`. |
| Multi-vault federation | **Out of scope, ever (anti-pattern #7).** | — |

### Materialization lifecycle spec (v0.1.8 design, drafted now)

- **Location**: `_crosswalker/audit/<YYYY-MM-DD-HHMMSS-Z>/` (one folder per snapshot event).
- **Contents per snapshot**: `manifest.json` (recipe-hash + junction-hashes + plugin-version + ISO timestamp), `manifest.json.ots` (OpenTimestamps proof, upgrades async over ~1–6 hours), and optionally `matrices/<recipe-name>.md` if user opted into materialization.
- **Refresh trigger**: explicit user command "Crosswalker: Snapshot for audit" only. Never automatic, never on-vault-change. Auditor-driven snapshots match GRC point-in-time semantics.
- **Freshness UX**: every materialized matrix carries `crosswalker.snapshot_at` and `crosswalker.junctions_hash` in frontmatter; the custom Bases view displays a "stale by N days vs current junctions" badge in its header when the live junction set has drifted.
- **Hand-edit prevention**: `crosswalker.contentHash` field stores SHA256 of the body. On regen, mismatch aborts and writes a `.user-edited.md` sibling so the auditor's annotations are never lost.
- **Sync/Git**: `_crosswalker/audit/` is recommended for Git but excluded from iCloud/Obsidian Sync via a default `.syncignore` that the plugin offers to write on first snapshot. Git-LFS recommended for vaults with >1000 controls.

### Open questions deferred to v0.2+

1. **Multi-vault federation** — explicitly out of scope, but re-evaluate if a community user submits a pattern that does not require cross-vault joins (re-evaluation trigger: ≥3 user requests for cross-organization crosswalk reuse).
2. **Bases formula language coverage** — re-evaluate when Obsidian ships grouping + aggregation (already on Bases roadmap). Trigger: Obsidian release notes announce GA of Bases group-by/aggregations.
3. **Publish support for custom Bases views** — re-evaluate when Obsidian ships Publish-Bases (on roadmap, not shipped). Trigger: Obsidian Publish release notes.
4. **sqlite-wasm on mobile** — re-evaluate when Capacitor exposes SharedArrayBuffer/OPFS in iOS WebView. Trigger: Obsidian mobile changelog mentions WebAssembly threading.
5. **Recipe community marketplace** — defer until ≥10 recipes ship in the reference repo and ≥3 community PRs land.
6. **Bases formula API for plugins** (custom functions) — Obsidian forum thread #109612 indicates this is on the roadmap; Crosswalker should *not* design around it until shipped.

## Recommendations

**Immediate (lock before v0.1.6 PR):**
1. Adopt `registerBasesView` as the single integration mechanism for v0.1.6. Reject codeblock processor as the default; defer to v0.1.7.
2. Standardize the folder convention as `_crosswalker/` (underscore prefix, not dot) — and ship a first-run flow that asks the user to add `_crosswalker/views/` and `_crosswalker/audit/` to Files & Links → Excluded files.
3. Move materialization out of v0.1.6 entirely. v0.1.6 ships *no* generated Markdown files except the seed `.base` file (which is idempotent and one file).
4. Write the JSON Schema for recipes now (validate at load-time, surface errors as Notices).

**Before v0.1.8 (audit-trail milestone):**
5. Build the manifest-first audit model: hash junctions + recipe + plugin version → one `.ots`. Materializations are an *option* on top of the manifest, not a *requirement* of audit.
6. Implement deterministic recipe execution: stable row ordering, stable key ordering, deterministic JSON/YAML serialization. Add a CI test that runs a recipe twice on a fixed junction set and asserts byte-identical output.
7. Embed `crosswalker.contentHash` in any generated frontmatter so user edits are detectable and never silently clobbered.

**Architectural guardrails (don't relitigate):**
8. Treat junctions as the only audit truth; matrices are caches.
9. Never embed raw SQL in concept-note bodies.
10. Don't reintroduce Dataview, Datacore, or a custom query language. The hybrid (Bases default + sidecar SQL) verdict stands.

**Trip-wires that would force re-evaluation:**
- If Obsidian ships Bases-on-Publish *before* Crosswalker v0.1.7, accelerate codeblock-processor work because the Publish constraint relaxes.
- If TaskNotes v4 deprecates `registerBasesView` (signal of API instability), revisit whether to maintain the custom view or fall back to the native table view + a sidecar matrix-rendering codeblock.
- If sqlite-wasm becomes available on Obsidian Mobile, the SQL escape hatch becomes mobile-viable and Tier 2 can be promoted from "desktop-only enrichment" to "first-class on all platforms."

## Caveats

- **The Crosswalker project documentation pages on `cybersader.github.io/crosswalker` could not be fetched directly during this research** (the fetch infrastructure refused the URLs as not-yet-seen). \[web_fetch\] This report relies on the task brief's own summary of Ch 27 deliverables A/B/C plus independently verified facts about Obsidian's Bases API, Publish limitations, sqlite-wasm constraints, OpenTimestamps semantics, and TaskNotes v4 patterns. Any divergence between the brief's summary of Ch 27 and the actual deliverable text should be reconciled by the maintainer before locking v0.1.6.
- **Bases is still labeled an early beta in Obsidian's own changelog (1.9 release notes)**; the API surface (`registerBasesView`, `BasesView`, `BasesEntry`, `Value` hierarchy) is documented but Obsidian explicitly warns of breaking changes. v0.1.6 should pin a `minAppVersion` in `manifest.json` and use `requireApiVersion()` at runtime.
- **The "1.10 Bases API" timeline cited in the task brief checks out** against Obsidian's October 2025 announcement and the public roadmap, [Obsidian](https://obsidian.md/blog/2025-obsidian-october/) but Publish-for-Bases is on the roadmap with no shipped date as of May 2026 — treat all Publish-parity claims as forward-looking until Obsidian's release notes confirm GA.
- **Vault-size estimates (5K controls × 8 frameworks)** are extrapolated from typical large-enterprise GRC scopes (NIST 800-53 rev 5 has ~1,000 controls; 8 frameworks at full junction density is the plausible upper bound). Smaller vaults (~500 controls × 3 frameworks) make many of the pollution concerns moot; the recommendations still hold but their urgency scales with vault size.
- **OpenTimestamps stamping latency is 1–6 hours** for Bitcoin-block confirmation. Audit workflows that need synchronous attestation (e.g. a SOC 2 auditor on-site) should pair OTS with a synchronous RFC 3161 timestamp authority as a v0.2 enhancement; v0.1.8 OTS-only is sufficient for after-the-fact reproducibility but not for live attestation.
- This report is **adversarial-by-design** per the task: the recommendation to defer materialization and narrow v0.1.6 to a single Bases view is more conservative than Ch 27's three convergent deliverables suggested. Ship the conservative path; expand in v0.1.7+ once the Bases API has another release cycle of stability.
