---
title: "Ch 38 deliverable A: Query state lives in a same-name folder note (Layout B′)"
description: "Fresh-agent research deliverable A for Challenge 38. Recommends Layout B′ — a same-name folder-note variant where `_crosswalker/queries/<slug>--<id8>/<slug>--<id8>.md` is the canonical query note, `view.base` is its generated sibling, and the folder is the durable envelope for all per-query derivative artifacts. Rejects the user's literal `index.md` proposal because Obsidian resolves wikilinks by filename, not folder — `[[csf-coverage]]` does not resolve to `csf-coverage/index.md` without the LostPaul Folder Notes community plugin (violates Commitment #3 mobile parity). Slug-collision policy: opaque `query_id` is canonical identity; slug is renamable display alias; folder name is `<slug>--<id8>`. Migrate before Phase 5 via one-shot Crosswalker: Migrate queries to folder layout command. Layout B′ pre-positions Phase 5 materialization, v0.1.7 exports, v0.1.8 audit snapshots as siblings."
tags: [research, deliverable, query-state-location, folder-note-pattern, layout-b-prime, same-name-folder-note, slug-collision, ch-38, deliverable-a]
date: 2026-05-18
sidebar:
  label: "Ch 38a · Same-name folder note (B′)"
  order: -20260518
---

# Challenge 38 Deliverable — Query State Lives in a Same-Name Folder Note (Layout B′)

## TL;DR

- **Recommend Layout B′ — a *same-name* folder-note variant** where `_crosswalker/queries/<slug>--<id8>/<slug>--<id8>.md` is the canonical query note, `view.base` is its generated sibling, and the folder is the durable envelope for all per-query derivative artifacts. **Reject the user's literal `index.md` proposal**: per Obsidian Help (`help.obsidian.md/links`), Obsidian resolves wikilinks by filename only — `[[csf-coverage]]` does not resolve to `csf-coverage/index.md` in vanilla Obsidian, so the `index.md` pattern requires the LostPaul Folder Notes community plugin and breaks Commitment #3 (mobile parity, no extra plugin dependency).
- **Slug-collision policy: opaque `query_id` is canonical identity; the slug is a renamable display alias; the folder is named `<slug>--<id8>`.** This makes silent rename-on-duplicate structurally impossible, survives folder renames (the `--<id8>` suffix is the durable handle), and works with Obsidian's default "Shortest path when possible" link resolution.
- **Migrate before Phase 5 starts** via a one-shot `Crosswalker: Migrate queries to folder layout` command. The current Phase 4.5 flat layout (3 queries in test-vault) is fully regenerable from `crosswalker_query:` frontmatter, so migration is mechanical and idempotent. Layout B′ also pre-positions Phase 5 materialization, v0.1.7 exports, and v0.1.8 audit snapshots as siblings — the per-query state-growth problem the challenge exists to solve dissolves into "add new sibling writers."

## Key Findings

1. **The challenge is a genuine inflection point, not a cosmetic refactor.** Phase 5 (materialization + sparse-pivot guard), v0.1.7 (exporters), and v0.1.8 (audit trail) each generate per-query derivative artifacts. Today's flat `_crosswalker/views/q-<id>.base` dump has no answer for "where does the snapshot/export/audit go?" — every new artifact type would force a new flat folder and a new opaque-id naming scheme. Folder-note layout gives each query a stable home that scales orthogonally to artifact types.

2. **Vanilla Obsidian forces the folder-note convention to be *same-name*, not *index.md*.** Per Obsidian Help ("Internal links", `help.obsidian.md/links`): `"Wikilink: [[Three laws of motion]] or [[Three laws of motion.md]]"` — no mention of index.md or folder resolution. Obsidian resolves internal links by filename without requiring file extensions or full paths. So `[[csf-coverage]]` resolves to any `csf-coverage.md` anywhere in the vault, but does NOT resolve to `csf-coverage/index.md`. The kepano `obsidian-bases` SKILL.md documents the canonical embed as bare-basename `![[MyBase.base]]`. As of May 2026 the forum feature request "Make folder notes a core plugin" (`forum.obsidian.md/t/make-folder-notes-a-core-plugin/108760`, posted Dec 6 2025) has 21 likes and no staff response or implementation tag — so this is not changing in the v0.1 window. **Same-name (`<slug>/<slug>.md`) is the only plugin-free folder-note pattern that works in vanilla Obsidian Mobile (Capacitor).**

3. **`recipe + params` IS sufficient to regenerate every *durable* artifact — but five adjacent artifact types are NOT regenerable, and Layout A has nowhere to put them.** Non-regenerable items: (a) user prose annotations on a query, (b) frozen audit snapshots (the entire v0.1.8 commitment), (c) hand-edits to `.base` filters/views/formulas the user wants to keep across `Refresh query views`, (d) LLM-authored explanations / TODOs, (e) external export artifacts (OSCAL/SSSOM/STRM) at the path the user opens them from. Layout B′ has a sibling location for each; Layout A forces them either into the host note (conflating concerns) or nowhere.

4. **The host-note frontmatter (current Phase 4.5 model) is not canonical query state — it is an embed pointer with cached metadata.** The conceptual shift: a query is *not* "a note with `crosswalker_query:` frontmatter"; a query is "an addressable object in `_crosswalker/queries/` that a host note may embed." This unblocks the N-host-notes-embed-the-same-query case the user surfaced ("an embed is just `!` + wikilink — it shouldn't be something that gets checked"). The intuition is correct; B′ is its right implementation.

5. **The "no separate folder" steelman loses three things Crosswalker has already committed to** in the v0.1 architectural-commitments table: (a) Commitment #5, runtime-agnostic recipe schema — the JSON-Schema-validated `recipe + params` is the portable contract, not the rendered `.base`; (b) Commitment #2's single coupling point `render(Recipe, ConceptIdentity) → Address` — needs a typed recipe input, not a YAML output; (c) the upgrade path when Bases YAML evolves — regenerating from `recipe + params` is one command; reverse-engineering recipes from hand-edited `.base` files is not. **Reject the steelman**, but adopt its UX intuition (embeds are just `!`-wikilinks) into B′.

## Details

### Restatement of the challenge

The Phase 4.5 architecture (shipped 2026-05-15) places canonical query state in `crosswalker_query:` frontmatter on a user-authored "host note," generates a `.base` file at `_crosswalker/views/q-<id>.base`, and inserts an `![[...]]` embed at cursor. Challenge 38 stress-tests this against a folder-note alternative — `_crosswalker/queries/<slug>/index.md` as canonical, `view.base` as sibling, room for `snapshots/`, `exports/`, `materialized/` siblings — and asks whether to migrate before Phase 5 (which generates the first wave of per-query derivative artifacts) starts. The success criteria require resolving (1) regenerability of every state-shaped artifact, (2) UX scoring across the three layouts, (3) the slug-collision policy specifically, (4) Phase 5 / v0.1.7 / v0.1.8 state-growth mapping, and (5) a migration plan from the current flat state.

### Regenerability audit

The challenge brief's regenerability table is correct as far as it goes, but it omits five practically-important artifact types that the v0.1 commitments imply. Audited list:

| Artifact | Regenerable from `recipe + params + data`? | Layout-A home today | Layout B′ home |
|---|---|---|---|
| `.base` YAML body | ✅ Yes (deterministic via `renderRecipeTemplate()`) | `_crosswalker/views/q-<id>.base` | `<slug>--<id8>/view.base` |
| Closure cache / Tier 2 mappings table | ✅ Yes (rebuildable cache) | Tier 2 sidecar | Tier 2 sidecar (unchanged) |
| Phase 5 materialized pivot result | ✅ Yes (derivative) | **nowhere defined** | `<slug>--<id8>/materialized/<ts>.json` |
| Audit run-log (when run / against what snapshot) | ❌ No — historical event | **nowhere** | `<slug>--<id8>/audit.ndjson` |
| Bases user hand-edits to `.base` | ❌ No — `Refresh query views` overwrites | overwritten silently | `<slug>/overrides.base` sibling (never overwritten) |
| Per-query prose / TODOs / annotations | ❌ No | conflated with host-note body | `<slug>/<slug>--<id8>.md` body below frontmatter |
| Snapshots for audit retention (v0.1.8) | ❌ No — point-in-time evidence | **nowhere** | `<slug>/snapshots/<period>/` (frozen md + base + OTS) |
| External exports (OSCAL / SSSOM / STRM) v0.1.7 | ✅ Yes from data, ❌ as named artifacts | **nowhere** | `<slug>/exports/<format>.<ext>` |
| Bases view-time state (column widths, sort) | ❌ No (Bases stores in `.obsidian/workspace.json`) | unchanged | unchanged (out of scope) |
| Multiple shape renderings of same query | ✅ Yes | requires N host notes | `<slug>/view-pivot.base` + `<slug>/view-list.base` siblings |

**Conclusion**: the original challenge-brief claim ("`recipe + params` regenerates everything durable") is true of *rendered* artifacts but understates the durable envelope. The non-regenerable items must live somewhere; the flat layout has no answer; B′ has a sibling-folder answer for every one.

### Three-layout UX scorecard

| Scenario | A — Flat (current) | B — `index.md` (user proposal) | **B′ — same-name folder note (recommended)** | C — Hybrid back-pointer |
|---|---|---|---|---|
| Create new query | ✅ picker writes 2 files | ✅ writes folder + 2 files | ✅ writes folder + 2 files | ⚠️ 3 writes + back-pointer |
| Embed in N other notes | ⚠️ N frontmatter blocks drift | ✅ N `![[slug]]` embeds | ✅ N `![[slug--id8]]` embeds | ✅ but back-pointer drifts |
| Bare `[[slug]]` works in vanilla Obsidian (mobile) | n/a | ❌ **fails — needs Folder Notes plugin** | ✅ same-name resolves natively | ✅ |
| Browse all queries | ⚠️ Bases scan for frontmatter | ✅ single folder | ✅ single folder | ⚠️ split |
| Rename a query | ⚠️ touches host frontmatter + `.base` | ⚠️ folder renames; `index.md` doesn't | ✅ folder + `<slug>.md` rename atomically; Obsidian auto-updates links | ❌ drift |
| Delete a query | ⚠️ orphans `.base` + frontmatter | ✅ rm folder | ✅ rm folder | ❌ orphans back-pointers |
| Copy a query to another vault | ⚠️ two files, different paths | ✅ folder copy | ✅ folder copy | ❌ multi-location |
| Per-query annotations / TODOs | ❌ conflated with host note | ✅ `index.md` body | ✅ `<slug>.md` body below frontmatter | ⚠️ split |
| Backlinks "where embedded?" | ⚠️ via Bases on frontmatter | ✅ Obsidian backlinks pane | ✅ Obsidian backlinks pane | ⚠️ split |
| Re-run / UPDATE picker | ✅ rewrites frontmatter in-place | ✅ rewrites `index.md` | ✅ rewrites `<slug>.md` | ⚠️ which source-of-truth? |
| Diff two queries (params over time) | ⚠️ host-note git history pollutes diff | ✅ folder git diff | ✅ folder git diff | ⚠️ split |
| Phase 5 materialization home | ❌ **undefined** | ✅ sibling | ✅ sibling | ⚠️ split |
| v0.1.7 exports home | ❌ undefined | ✅ sibling | ✅ sibling | ⚠️ split |
| v0.1.8 audit-snapshot home | ❌ undefined | ✅ sibling | ✅ sibling | ⚠️ split |
| Mobile parity (Obsidian Mobile Capacitor) | ✅ | ❌ **plugin-dependent** | ✅ vanilla Obsidian | ✅ |

**B′ wins on every row that A loses, ties B on the rows where B wins, and avoids B's plugin dependency.** C adds drift risk for no UX benefit and is rejected.

### Slug-collision policy

**Recommendation: opaque `query_id` as canonical identity; slug as renamable display alias; folder name = `<slug>--<id8>`.**

Alternative policies, scored:

1. **Auto-suffix (`coverage`, `coverage-2`, `coverage-3`)** — surfaces the exact concern the user flagged in the challenge brief ("user creates 'Coverage' twice, second silently becomes 'Coverage-2', user can't find it"). **Rejected.**
2. **Refuse-and-prompt** — friction-heavy; the common case (user re-running the picker against an existing query) hits the prompt every time. **Rejected.**
3. **Opaque ID with display slug (recommended)** — folder is `csf-coverage--a1b2c3d4`. Slug is a rename-safe nickname; `<id8>` is the durable identity. The picker, on duplicate slug, detects the collision via the `query_id` index and shows "Open existing" or "Create new (new id)". Embeds use `![[csf-coverage--a1b2c3d4]]`; users typing the bare slug get Obsidian autocomplete to the qualified form. Phase 4.5 already generates `query_id` as `q-<date>-<8hex>`; B′ just promotes that ID to the folder name suffix.

This policy also resolves the **rename case**: renaming the folder from `csf-coverage--a1b2c3d4` to `csf-to-800-53--a1b2c3d4` preserves identity (the `--id8` is invariant) and Obsidian's "automatically update internal links" feature (per `help.obsidian.md/links`) rewrites every `![[csf-coverage--a1b2c3d4]]` in the vault to the new path.

### Anti-pattern coverage

| Anti-pattern from §5 | B′ resolution |
|---|---|
| "Smart" folder auto-creation when not asked | Picker writes folder only on explicit recipe selection; no daemon |
| Slug collisions silently renamed | Opaque `--<id8>` suffix; collisions surface as "Open existing?" prompt |
| Folder embeds broken on mobile / Publish | Not relied on — embed targets `<slug>--<id8>/view.base` directly; folder-name embed `![[<slug>--<id8>]]` resolves to the same-name `.md`, which works in vanilla Obsidian + Mobile + Publish |
| Renames orphan embeds | Obsidian native link-update handles this; folder rename triggers `<slug>--<id8>.md` rename atomically |
| Hybrid back-pointer drift | B′ has no back-pointers |
| Vault pollution | 10 queries × ~5 mature artifacts = 50 files under `_crosswalker/queries/`; same count as the flat layout, but organized into per-query folders. Net wash on count; large win on legibility. |

### Engaging the "no separate folder" steelman seriously

The steelman: `.base` file at user-chosen path. No frontmatter, no folder, no `_crosswalker/queries/`, no recipe storage. Edit = open `.base`, hand-edit, save.

**What it loses:**

1. **Commitment #5 (runtime-agnostic recipe schema)** — the recipe is the durable, AJV-validated portable contract; the rendered `.base` is one of N renderings. Throwing away the recipe means throwing away the multi-runtime story (Python producer v0.5+, MCP server, agent emitters).
2. **The `render(Recipe, ConceptIdentity) → Address` single coupling point (Commitment #2)** — requires a typed recipe input. Without it, every Bases YAML schema change requires manual `.base` edits across the vault.
3. **Phase 5 / v0.1.7 / v0.1.8 derivatives have nowhere per-query to live.** They'd be flat-bagged in `_crosswalker/materialized/`, `_crosswalker/exports/`, `_crosswalker/audit/` — exactly the failure mode Layout A already has.
4. **Re-render after upstream change is impossible.** When the `crosswalker-pivot` view evolves (new `cellOp` values, new `empty` modes), the plugin needs to regenerate YAML bodies. Without a recipe + params source-of-truth, the only path is "ask the user to re-author."
5. **The user's "an embed is just `!` + wikilink" intuition is fully served by B′**, which is why B′ is the right interpretation of that intuition, not the steelman.

The steelman is correct that the *current Layout A* is over-engineered for what it delivers (host-note frontmatter conflates roles, no answer for derivatives). The fix is to move canonical state into a proper home (B′), not to strip the recipe layer.

### Phase 5+ state-growth map onto Layout B′

```
_crosswalker/queries/csf-coverage--a1b2c3d4/
├── csf-coverage--a1b2c3d4.md     ← CANONICAL: crosswalker_query: frontmatter
│                                     + user prose / annotations in body
│                                     + transcludes ![[<slug>--<id8>/view.base]]
├── view.base                       ← generated from frontmatter (Phase 4.5 carryover)
├── view-list.base                  ← optional alt-shape sibling (v0.2+)
├── overrides.base                  ← user hand-edits (never overwritten; v0.2)
├── materialized/                   ← Phase 5
│   ├── 2026-05-20-result.json
│   └── stale.flag
├── exports/                        ← v0.1.7
│   ├── coverage.oscal.json
│   ├── coverage.sssom.tsv
│   └── coverage.strm.json
├── snapshots/                      ← v0.1.8 audit trail
│   ├── 2026-Q1/
│   │   ├── snapshot.md            ← frozen materialization
│   │   ├── source-hash.txt
│   │   └── ots-receipt.ots        ← OpenTimestamps proof
│   └── 2026-Q2/...
└── audit.ndjson                    ← v0.1.8: append-only run-log
```

Every Phase 5+ artifact has a stable home that didn't exist in Layout A. Future v0.3 (multi-vault federation), v1.0 (companion plugins, marketplace) needs all fit as additional siblings without architectural change.

### Migration plan (Phase 4.6 sub-phase, ~1 day before Phase 5)

The current Phase 4.5 state is fully regenerable from `crosswalker_query:` frontmatter — the entire design point of Phase 4.5. Migration is therefore mechanical:

1. **Add command** `Crosswalker: Migrate queries to folder layout`.
2. **Scan** the vault for notes with `crosswalker_query:` frontmatter (reuse `regenerate-query-views.ts`'s walker; 359 existing tests guard this code path).
3. **For each**: derive `<slug>` (kebab-case, ASCII, max 48 chars, from the recipe `name` field with a fallback to `query-<id8>`); create `_crosswalker/queries/<slug>--<id8>/`; write `<slug>--<id8>.md` with the existing frontmatter copied verbatim (preserve any user prose body if the host note was Crosswalker-authored, else create a fresh `.md` with a transclusion line `![[<slug>--<id8>/view.base]]`); regenerate `view.base` at the new sibling.
4. **Rewrite embeds**: scan each source host note for the matching `![[_crosswalker/views/q-<id>.base]]` embed and replace with `![[<slug>--<id8>]]` (resolves to the canonical `.md`, which in turn transcludes `view.base`).
5. **Backward-compat read for one minor version**: the picker's UPDATE flow checks the new location first, falls back to the old host-note frontmatter, and auto-migrates that query on next save. Old `.base` files in `_crosswalker/views/` stay during transition; a v0.2 cleanup command removes them after explicit confirmation.
6. **Schema bump**: `crosswalker_query.schema_version: 1 → 2` records the canonical-location change.

**Test-vault impact**: 3 queries already exist. Migration is one command, idempotent, runs in <1s. No user-facing scripts.

**Acceptance criteria** (reviewer sign-off):

- After migration, `Crosswalker: Refresh query views` is a no-op on second run (idempotent).
- `![[<slug>--<id8>]]` renders the folder note, which transcludes `view.base`; `![[<slug>--<id8>/view.base]]` renders the base directly. Both work on Obsidian Mobile (Capacitor) with no Folder Notes plugin installed (this is the critical mobile-parity check).
- Slug collision: creating two queries that would slug to `coverage` produces two folders `coverage--<id-a>` and `coverage--<id-b>`. Picker on the second attempt offers "Open existing" with a preview.
- All 359 existing Phase 4.5 tests pass with the new write target; new tests added for slug derivation, collision handling, and migration idempotency (target: +30 tests).
- Phase 3.5c trace-IDs thread through the migration command, so a failed migration is diagnosable from `crosswalker-debug.log` per the observability commitment.

## Recommendations

**Stage 1 — Before Phase 5 starts (Phase 4.6, ~1 day work)**

1. Implement Layout B′ + migration command per the plan above.
2. Add to `query-frontmatter-schema.ts`: `query_id` formatter (`q-<YYYY-MM-DD>-<8hex>`, already exists), slug derivation rule (kebab-case ASCII ≤48 chars), folder-name composer (`<slug>--<id8>`).
3. Update `apply-query-to-note.ts` to write `_crosswalker/queries/<slug>--<id8>/<slug>--<id8>.md` instead of host-note frontmatter; insert `![[<slug>--<id8>]]` embed at cursor.
4. Update `regenerate-query-views.ts` to walk `_crosswalker/queries/**/*.md` for canonical sources.
5. Update SKILL.md to teach the convention: "create a query → embed the resulting `![[<slug>--<id8>]]` link wherever you want it shown."
6. Add CSS hook `.crosswalker-generated` to `view.base` (not to the canonical `.md` — users can freely edit its body).

**Stage 2 — During Phase 5**

7. Define `<slug>/materialized/` write target in the materialize command (per Ch 32a's materialization-folder spec, scoped down to per-query).
8. Add `crosswalker.staleSince` to the canonical `<slug>--<id8>.md` frontmatter (computed from `sourceHash` of the input junction set).

**Stage 3 — v0.1.7 / v0.1.8**

9. Wire `<slug>/exports/` (v0.1.7) and `<slug>/snapshots/` + `<slug>/audit.ndjson` (v0.1.8) into Layout B′ — new sibling writers, no architectural change.

**Benchmarks that would change these recommendations**

- **If Obsidian ships built-in folder-note semantics** (currently the forum feature request `forum.obsidian.md/t/make-folder-notes-a-core-plugin/108760`, posted Dec 6 2025, 21 likes, no staff response as of May 2026): switch to the cleaner literal `<slug>/index.md` since `[[<slug>]]` would resolve natively; the `--<id8>` suffix on the folder becomes optional aesthetic. Low-priority watch item.
- **If user testing surfaces that the `<slug>--<id8>` suffix is too ugly in the file explorer**: ship a CSS snippet that hides everything after `--` in `.nav-file-title-content`. Identity stays in the filesystem; display is cosmetic. ~5 lines of CSS.
- **If project later relaxes Commitment #3** to allow a community-plugin dependency, the LostPaul Folder Notes plugin (325,963 total downloads, 677 GitHub stars, v1.8.19, per `obsidianstats.com/plugins/folder-notes`, retrieved May 2026) becomes the path of least resistance and lets us switch to `index.md`. Don't relax #3 just for this.
- **If Phase 5 materialization volume per query exceeds ~100 snapshots**: introduce `<slug>/snapshots/YYYY/` year-grouping. Not needed at v0.1.

## Caveats

- **The same-name convention's correctness depends entirely on Obsidian's wikilink resolver.** Per Obsidian Help "Internal links" (`help.obsidian.md/links`), Obsidian resolves wikilinks by filename without requiring extensions or full paths: `"Wikilink: [[Three laws of motion]] or [[Three laws of motion.md]]"`. The `--<id8>` suffix on every Crosswalker-generated note makes duplicate-basename collisions structurally impossible; if a user does manually create a collision, Obsidian's default "Shortest path when possible" setting handles disambiguation, and the plugin's recipe-picker uses the path-qualified form in autocomplete.
- **Bases folder-embed semantics are filename-based, not folder-based.** `![[<slug>--<id8>]]` does not embed the folder; it embeds the same-name `.md` file. The generated `.md` template therefore must contain a transclusion line `![[<slug>--<id8>/view.base]]` if the user wants the rendered Bases view inline when they embed the folder note. This is one extra line in the template.
- **Phase 4.5 was "the right design" per the project's commitment table.** This deliverable argues that interpretation was correct on the *frontmatter-canonical* axis but wrong on the *host-note-is-the-home* axis. The frontmatter stays canonical; it just lives on a query-owned note (`<slug>--<id8>.md`), not a user-authored host note. Phase 4.5 is not reverted; it is *re-homed*.
- **Bases view-time state (column widths, per-view sort/filter)** is stored by Obsidian Bases in `.obsidian/workspace.json`, not in the `.base` file. This is out of Crosswalker's control and out of scope for this deliverable; it does not affect the recommendation.
- **The challenge brief flags Phase 4.5 as "current state being stress-tested, not locked-in."** This deliverable explicitly recommends re-homing it. The recommendation should be re-confirmed with the user before the Phase 4.6 migration ships, per the brief's own "How to use the deliverable" workflow (read → decide → synthesis log → refactor before Phase 5).
- **The user's literal `index.md` proposal is not wrong — it is plugin-dependent.** If the project later relaxes Commitment #3 to allow a community-plugin dependency (LostPaul Folder Notes is stable and widely-adopted at 325,963 downloads per Obsidian Stats), `index.md` becomes viable and slightly cleaner. Until then, same-name (`<slug>.md`) is the only mobile-safe path.
- **One concession**: B′ adds a per-query folder where Layout A had two flat files. For users with very few queries (≤3), the folder structure feels heavier. Mitigation: the v0.1.6 default folder location is `_crosswalker/queries/` (already gated behind the `_crosswalker/` excluded-files prompt), so the perceived footprint is the same as today.

## Completion table

| Plan item | Covered |
|---|---|
| Fetch primary challenge page | ✅ |
| Project root / agent-context section | ✅ |
| Adjacent challenges & research (Ch 32a) | ✅ |
| Phase 4.5 briefing as current state | ✅ |
| "Query state" definition (crosswalker_query frontmatter + .base) | ✅ |
| "Folder note pattern" — vanilla Obsidian resolver limits (subagent) | ✅ |
| Architectural commitments (mobile parity, runtime-agnostic recipe) | ✅ |
| Regenerability audit with 5 added artifact types | ✅ |
| 3-layout scorecard + B′ refinement + steelman engagement | ✅ |
| Slug-collision policy (3 options scored, recommendation made) | ✅ |
| Phase 5 / v0.1.7 / v0.1.8 state-growth mapping | ✅ |
| Migration plan with acceptance criteria | ✅ |
| Staged recommendations + benchmarks to revisit | ✅ |
| Caveats including Phase 4.5 lock-in status | ✅ |
