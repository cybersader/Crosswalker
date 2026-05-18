---
title: "Ch 38 deliverable B: Query-pack folder (Layout B+) — explicit base embed, refuse-and-prompt slug collision"
description: "Fresh-agent research deliverable B for Challenge 38. Recommends Layout B+, a 'query-pack folder' — one folder per query under `_crosswalker/queries/<slug>/` containing `index.md` (canonical `crosswalker_query:` frontmatter) plus a sibling `view.base` and reserved subfolders for `snapshots/`, `materialized/`, `exports/`. Embed via `![[<slug>/view.base]]` (NOT `![[<slug>]]`) — folder-note magic is not core Obsidian behavior. `recipe + params` is sufficient to regenerate every load-bearing artifact, but five artifacts are NOT regenerable and need a home Layout A cannot provide. Slug-collision policy: refuse-and-prompt on user create, opaque hex suffix on agent/programmatic create. Slugs are display-affecting but the durable identifier is the existing `query_id`."
tags: [research, deliverable, query-state-location, folder-pack, layout-b-plus, explicit-base-embed, refuse-and-prompt, ch-38, deliverable-b]
date: 2026-05-18
sidebar:
  label: "Ch 38b · Query-pack folder (B+)"
  order: -20260518
---

# Challenge 38 — Where Crosswalker Query State Should Live: Recommendation

## TL;DR
- **Adopt Layout B+, a "query-pack folder" — one folder per query under `_crosswalker/queries/<slug>/` containing `index.md` (canonical `crosswalker_query:` frontmatter) plus a sibling `view.base` and reserved subfolders for `snapshots/`, `materialized/`, and `exports/` — but explicitly embed via `![[<slug>/view.base]]`, NOT `![[<slug>]]`.** Folder-note magic is not core Obsidian behavior, so the layout commits to a folder *container* without relying on plugin-dependent folder-note resolution.
- **`recipe + params` is sufficient to regenerate every load-bearing artifact of a query**, but five artifacts are NOT regenerable and need a home the current flat layout cannot provide: user annotations, audit snapshots (v0.1.8), exporter outputs (v0.1.7), Phase 5 materialized pivots, and any Bases hand-edits to the `.base`. Layout B+ gives each a natural sibling slot; Layouts A and C do not.
- **Slug-collision policy: refuse-and-prompt on user create, opaque-hex suffix on agent/programmatic create.** Slugs are display-affecting but the durable identifier is `query_id` (the existing `q-YYYY-MM-DD-<8hex>` ID). That decoupling is what makes the folder-pack pattern survive renames.

## Key Findings

**The challenge is an architecture inflection point, not a UX polish task.** Challenge 38 was filed on 2026-05-18, three days after Phase 4.5 shipped the current flat model and immediately before Phase 5 (materialization + sparse-pivot guard) was set to start. v0.1.7 (exporters) and v0.1.8 (audit trail) each add per-query derivative artifacts. The question is which container shape lets those artifacts land naturally vs. forcing a refactor mid-milestone. The brief itself frames this as gating Phase 5 ("Run before Phase 5 starts").

**The "folder-note" framing in the challenge is partially a misnomer that has to be cleared up before recommending.** A targeted research pass confirmed that folder-note semantics (clicking a folder opens an attached note; `![[FolderName]]` resolves to the in-folder index) are **not core Obsidian behavior**. Bases shipped as a core plugin in Obsidian 1.9.0 Desktop (May 21, 2025), but folder-note semantics remain absent from all core plugin lists through the 1.12.x release line current as of May 2026. The open forum request "Have each folder be automatically associated with a note (like the 'Folder Notes' Plugin)" (forum.obsidian.md/t/108760, opened by user Kaleo1 on December 6, 2025, last reply March 15, 2026) confirms this is still a feature *request*, with user Marionette (post #8, March 9, 2026) writing verbatim: *"No, thanks. A folder is a folder, not a document. If you want to put notes on a folder itself, there's a plugin that already adds a note to a folder: Folder Notes. Please don't muck up folders for the rest of us."* Folder-note behavior is supplied only by community plugins (`LostPaul/obsidian-folder-notes`, `xpgo/obsidian-folder-note-plugin`, `aidenlx/folder-note-core`, `make.md`). The official Bases embed syntax per help.obsidian.md/bases/create-base is explicit: **"You can embed base files in any other file using the `![[File.base]]` syntax. To specify the default view use `![[File.base#View]]`"** — no folder-shortcut form is documented.

That single fact eliminates one variant of Layout B (`![[csf-to-800-53-coverage]]` as a folder-embed) from consideration. Adopting it would require a community-plugin dependency, violating Crosswalker's Commitment #3 (mobile-Capacitor portability — Bases on mobile is now documented, with the 1.9.6 Mobile changelog of July 18, 2025 explicitly listing "Bases: Fixed external links not working in Cards view. Bases: Fixed result count not appearing on smaller devices," confirming first-class mobile parity) and the implicit "no extra plugin dependencies" hygiene principle of Commitment #6 (Bases-not-Dataview).

**Layout B is salvageable without folder-note magic — that is the recommendation.** The folder still gives Crosswalker every benefit the challenge enumerates (state co-location, snapshot/export slots, clean rename, scoped backlinks, marketplace shape) *as long as the embed remains explicit*: `![[csf-to-800-53-coverage/view.base]]`. The folder is for organization and durability; the embed contract uses the same Obsidian-native syntax already shipped in Phase 4.5.

**Regenerability stress test.** The Phase 4.5 briefing's claim that `recipe + params` regenerates everything durable holds for the YAML body, the Tier 2 closure cache, the materialized result, and the rendered Bases cells. It does NOT hold for: (a) user hand-edits to the `.base` file (the existing Phase 4.5 idempotent regenerator already overwrites these — the right behavior, but it argues for keeping the `.base` clearly inside a plugin-owned folder so users don't expect their edits to persist); (b) user prose annotations about *why* this query exists; (c) per-snapshot lineage records (v0.1.8); (d) point-in-time exporter outputs (v0.1.7); (e) optional column-width / sort-order overrides that Bases stores in the `.base` file directly. (a)–(e) all need a per-query home; only (a) survives in Layout A by overwrite, and (b)–(e) have no place in Layout A at all.

**Layout C (hybrid back-pointer) is a trap.** It's the "have your cake and eat it" option, and the two-source-drift cost (every code path that touches `crosswalker_query:` frontmatter must handle the case where the canonical state has moved) is real. The only UX benefit — "this note authored this query" backlinks — is recoverable through Obsidian's native backlinks pane against the `view.base` embed link, with zero schema duplication.

**The "no separate folder" steelman (Section 6 of the brief) loses on Phase 5+.** Reducing the query to just a `.base` file works for v0.1.6 but breaks the moment v0.1.7 ships exporters (where does `csf-to-800-53.oscal.json` live?) and breaks again at v0.1.8 (where do timestamped audit snapshots live?). Forcing each downstream artifact to invent its own location is the over-engineering trap inverted: it pushes complexity from the plugin into the user's vault layout decisions. The folder is doing real work the moment derivative artifacts exist.

## Details

### Recommended layout (Layout B+)

```
_crosswalker/queries/<slug>/
├── index.md                 # canonical crosswalker_query: frontmatter; ID-of-record
├── view.base                # generated by renderRecipeTemplate(); idempotent
├── README.md                # optional, user-authored prose/annotations (NEVER touched by plugin)
├── snapshots/               # v0.1.8: timestamped audit copies of (index.md + view.base + run metadata)
│   └── 2026-05-18T12-00-00Z/
│       ├── index.md
│       ├── view.base
│       └── run.json         # sqlite-wasm closure-cache hash, trace_id, OpenTimestamps receipt
├── materialized/            # Phase 5: pivot result JSON + staleness marker
│   ├── result.json
│   └── stale.flag           # presence = recompute needed; absence = fresh
└── exports/                 # v0.1.7: per-format exporter outputs
    ├── 2026-05-18.oscal.json
    ├── 2026-05-18.sssom.tsv
    └── 2026-05-18.strm.json
```

The host note (the user-authored note that *displays* the query) gets nothing but an embed: `![[csf-to-800-53-coverage/view.base]]`. No `crosswalker_query_refs:` back-pointer; no `crosswalker_query:` frontmatter on the host. Backlinks from `view.base` show every host. The user is free to add prose freely.

**File-identity vs. display-identity.** The slug is for humans; the durable ID is the existing Phase 4.5 `query_id` (`q-2026-05-15-a1b2c3d4`). Store `query_id` in `index.md` frontmatter; treat slug renames as folder renames; Obsidian's "Automatically update internal links" setting handles `![[<old>/view.base]] → ![[<new>/view.base]]` for free. The Phase 4.5 `regenerate-query-views.ts` scanner becomes slug-rename safe by keying on `query_id`, not folder path.

### Slug-collision policy (decisively, per challenge §5)

Three policies were on the table; the right answer is **mixed by entry-point**:

1. **Interactive picker (user via Phase 4 modal): refuse-and-prompt.** When the user creates "Coverage Matrix" twice, the picker surfaces "A query named `coverage-matrix` already exists — Open existing / Pick new name / Create as `coverage-matrix-2`". Default focus on Open existing. This catches the 90% case (user re-creates a query they forgot about).
2. **Programmatic / agent / wizard-draft (no human in loop): opaque suffix `-<4hex>`.** `coverage-matrix-a1b2`. Never silently `-2`/`-3` (the brief's stated anti-pattern of "silently renamed and user can't find it"). The suffix is informative enough to spot and short enough not to dominate the slug.
3. **Reserved/uniqueness invariant: `query_id` is the durable key.** Two folders with `coverage-matrix` and `coverage-matrix-a1b2` are distinct entities; refactor `regenerate-query-views.ts` to key on `query_id`, never on folder name. This is the single change that makes Layouts B and B+ collision-safe.

### How each non-regenerable artifact maps onto the recommendation

| Artifact (lifecycle phase) | Regenerable? | Layout B+ home |
|---|---|---|
| `.base` YAML body | ✅ from `recipe + params` | `view.base` (overwritten by `Refresh query views`) |
| Closure cache (Tier 2) | ✅ from Tier 1 junction notes | `.crosswalker/sqlite/*.db` — out of band, not per-query |
| Materialized pivot (Phase 5) | ✅ from `recipe + params + data + closure` | `materialized/result.json` + `stale.flag` |
| Per-format exports (v0.1.7) | ⚠️ point-in-time | `exports/<date>.{oscal.json,sssom.tsv,strm.json}` |
| Audit snapshot (v0.1.8) | ❌ point-in-time, not regenerable | `snapshots/<iso8601>/` (immutable; OpenTimestamps signed) |
| User annotations | ❌ user-authored | `README.md` (plugin never writes/reads) |
| Bases hand-edits to `.base` | ❌ destroyed by regen | Intentionally not preserved — design choice; `view.base` is plugin-owned |

### UX scenario scorecard (the brief's §3 matrix, filled in)

| Scenario | A (Flat) | B+ (Folder-pack) | C (Hybrid) |
|---|---|---|---|
| Create new query | ✅ one note touched | ✅ one folder created | ⚠️ two writes, two-source drift risk |
| Embed in new note | ⚠️ regenerate or hand-copy embed | ✅ `![[slug/view.base]]` | ✅ same as B+ |
| Browse all queries | ⚠️ scan vault for frontmatter | ✅ `_crosswalker/queries/` is the index | ⚠️ ambiguous (host or canonical?) |
| Rename a query | ❌ rename ID + base file + embed in every host | ✅ folder rename; Obsidian auto-updates embeds | ❌ back-pointer drifts |
| Delete a query | ⚠️ orphan `.base` in `views/`, dangling embeds | ✅ folder delete; embeds visibly broken | ⚠️ orphan back-pointer |
| Copy to another vault | ⚠️ must copy `.base` + edit frontmatter | ✅ copy one folder | ❌ requires copying two unrelated files |
| Author annotations | ❌ nowhere | ✅ `README.md` sibling | ⚠️ host note (mixes concerns) |
| Backlinks ("where embedded?") | ✅ Bases-on-frontmatter | ✅ standard Obsidian backlinks on `view.base` | ✅ either |
| Re-run picker (UPDATE) | ✅ existing Phase 4.5 flow | ✅ same flow, scoped to `index.md` | ⚠️ which is canonical? |
| Diff two queries | ⚠️ diff frontmatter blocks | ✅ `git diff queries/<a>/index.md queries/<b>/index.md` | ⚠️ same as B+ but with drift risk |
| Pin to graph view | ✅ host note | ✅ folder | ⚠️ same as B+ |

Layout B+ wins or ties on every row.

### Migration plan (Phase 4.5 → Phase 4.6 → Phase 5)

The existing test-vault has ~3 queries today (per the brief's own scale note). Migration is cheap and ordered:

1. **Phase 4.6 (new sub-phase, ~half-day):** Ship `Crosswalker: Migrate queries to folder layout`. Scans vault for `crosswalker_query:` frontmatter (the Phase 4.5 canonical signal); for each, creates `_crosswalker/queries/<slug>/`, moves `view.base` from `_crosswalker/views/` into it, copies frontmatter into a new `index.md`, rewrites the embed in the host note from `![[_crosswalker/views/q-...]]` to `![[<slug>/view.base]]`, strips `crosswalker_query:` from the host note's frontmatter (or leaves it as a deprecated `crosswalker_query_legacy:` for one minor version).
2. **Update `regenerate-query-views.ts` and `apply-query-to-note.ts`:** target paths become `_crosswalker/queries/<slug>/{index.md,view.base}`; both functions key on `query_id`, not paths.
3. **Phase 5 starts against the new layout.** `materialized/`, `snapshots/`, and `exports/` slots are introduced on demand by each downstream milestone — Layout B+ reserves them but does not preemptively create empty folders.
4. **Backward compat:** Phase 4.5 codeblock-only queries (the deprecated Phase 4 flow) continue to render; no auto-migration, same policy as the Phase 4→4.5 transition.

### Anti-patterns the recommendation explicitly avoids

- **No folder-note plugin dependency.** Embed is always explicit `![[slug/view.base]]`. Mobile + core-only works.
- **No silent `-2` slug rename.** Interactive prompts; agents get opaque hex.
- **No two-source-of-truth.** `index.md` is sole canonical; back-pointers banned.
- **No auto-creating empty subfolders.** `snapshots/`, `materialized/`, `exports/` exist when populated, not before.
- **No conflation of state location with UX command surface.** The Phase 4 recipe picker, Phase 4.5 orchestrator, and `Refresh query views` command are unchanged in shape; only their target paths change.

## Recommendations

**Stage 1 (now, before Phase 5):** Ship the folder-pack layout as Phase 4.6 in a single commit. Five files change in `src/views/`: `query-frontmatter-schema.ts` adds `slug` derivation from `query_id`, `apply-query-to-note.ts` writes to `_crosswalker/queries/<slug>/`, `regenerate-query-views.ts` walks the new path, `insert-base-block.ts`'s `buildEmbed()` emits `<slug>/view.base`, plus a new `migrate-to-folder-layout.ts` one-shot command. Estimated effort: half-day to a day; reuses the Phase 4.5 idempotent-write infrastructure. Test impact: ~40 new tests (path resolution, slug collision, migration idempotency), `bun run test` baseline at 359 stays green.

**Stage 2 (Phase 5):** Materialization writes to `materialized/result.json` with a `stale.flag` sibling. The sparse-pivot HARD guard checks `materialized/` size before computing.

**Stage 3 (v0.1.7):** Exporters write to `exports/<iso-date>.<ext>`. The `_crosswalker/queries/<slug>/` folder is the natural mount point for the OSCAL/SSSOM/STRM emitters from Challenge 13 + Ch 20c.

**Stage 4 (v0.1.8):** Audit snapshots write to `snapshots/<iso8601>/`. OpenTimestamps receipts sit alongside. The audit-trail design from the logging-infra-slotted-into-v0.1.8 log becomes per-query rather than global, which is what Crosswalker actually needs for compliance use cases.

**Benchmarks that would change the recommendation:**

- If Obsidian core ships folder-note semantics natively (forum.obsidian.md/t/108760 closes as implemented), revisit Layout B's "magic embed" form `![[slug]]` for additional UX brevity. Until then, hold to explicit `view.base`.
- If users frequently want to embed multiple shapes of the same query (table + pivot + chart), promote `view.base` to a `views/` subfolder with `pivot.base`, `table.base` siblings. Defer until a user reports this; YAGNI now.
- If average vault footprint exceeds ~50 queries × 5 artifacts each, revisit whether `_crosswalker/queries/` needs sharding (`queries/c/csf-to-800-53-coverage/`).

## Caveats

- **The folder-note framing in the original brief is slightly misleading**: the user's lean toward "folder note pattern B" implies an Obsidian feature that does not exist in core (confirmed by the still-open forum request opened Dec 6, 2025 and active through March 15, 2026). The recommendation honors the intent (folder-as-container, growth room for derivatives) without inheriting the unstated dependency on a community plugin. Confirm this re-framing with the user before locking; if the intent was specifically the folder-note plugin family, Commitment #3 (mobile parity, no extra plugin dependencies) has to be revisited explicitly.
- **`.base` hand-edit preservation is intentionally not solved.** Phase 4.5 already overwrites manual edits, and Layout B+ doesn't change that. If the v0.2+ Pattern C "inline YAML editor" UX from Ch 32a ever ships, this becomes a real tension and a per-query `view.user.base` override slot may need to be designed.
- **Migration is reversible but not free.** The Phase 4.6 commit should ship behind an `experimental.query_folder_layout` setting for one minor version (v0.1.6 RC) so early users can roll back if a sharp edge surfaces. After v0.1.7, the setting goes away.
- **The recommendation does not address the deeper "should plugins emit files at all?" critique** that the Ch 32 deliverable A entertained. Crosswalker has already committed to file-emission via the Phase 4.5 architecture and the v0.1.8 audit trail; that meta-question is out of scope here. If revisited at v0.3+, the folder-pack layout actually makes the "no-files" pivot *easier* (everything per-query is in one place to opt-out of).
- **Slug-collision policy assumes the picker is always the entry point.** If a future MCP/agent surface bypasses the picker, the "opaque-suffix on programmatic create" branch must be enforced at the `applyQueryToNote()` orchestrator level, not the UI level. Spec this in `apply-query-to-note.ts` rather than the picker modal.
- **Mobile-Bases parity is recent but real.** Bases on mobile rolled out alongside Desktop 1.9.x in Catalyst (May 2025); the first mobile changelog to *name* Bases explicitly is 1.9.6 Mobile (July 18, 2025). If supporting Obsidian Mobile versions earlier than 1.9.6, `.base` embeds may render inconsistently; this is independent of layout choice and equally affects Layouts A, B+, and C.

### Completion checklist for the brief's success criteria
§1 regenerability resolved (yes, with five non-regenerable exceptions mapped) ✅ · §2 layouts scored (table above) ✅ · §3 UX scenarios filled (table above) ✅ · §4 Phase 5/v0.1.7/v0.1.8 mapped (table above) ✅ · §5 anti-patterns addressed (each enumerated and avoided) ✅ · §6 steelman engaged (rejected on Phase 5+ scaling grounds) ✅ · §7 recommendation made (Layout B+, defended against the strongest objection — "you're depending on folder-note magic" — by showing the explicit-embed form needs no plugin) ✅ · §8 migration plan provided (Phase 4.6, one commit, ~half day, behind a setting for one version) ✅.
