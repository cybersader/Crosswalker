---
description: Crosswalker per-milestone delivery-log discipline — write a dated log when a milestone (vX.Y.Z) ships ✅. Captures what shipped, system-design integration diagram showing where the milestone plugs into the pipeline, design decisions made during implementation, and what the milestone unblocks. Different from synthesis-log (architectural decisions) and session-log (generic learnings).
user_invocable: true
---

# Delivery Log Skill

Per-milestone delivery-log discipline. Write a dated log entry when a v0.X.Y milestone ships ✅. Different from `synthesis-log` (architectural decisions) and `session-log` (generic learnings).

## Trigger phrases

- "write the delivery log for v0.1.X"
- "milestone shipped — delivery log"
- "v0.1.X is done; log it"
- "/delivery-log"

## When to use (proactive)

Trigger when ALL of these are true:

1. A milestone (`v0.1.X` per the [milestones hub](https://cybersader.github.io/crosswalker/reference/roadmap/milestones/)) is being flipped from in-progress to ✅ Done
2. Concrete tasks are checked off (not just partial work)
3. Tests are green (unit + E2E + manual where required) — per [`feedback_test_thoroughly.md`](../../../memory/feedback_test_thoroughly.md), milestone is NOT Done until E2E passes
4. The milestone delivers user-visible or architecture-visible behavior worth documenting

Do NOT use for:
- Mid-milestone phases (use phase-status updates in the milestone page itself; full delivery log waits for milestone completion)
- Architectural decisions that don't ship a milestone (use `synthesis-log`)
- Generic session learnings (use `session-log`)

## How it differs from `synthesis-log`

| Skill | When | Captures |
|---|---|---|
| **`delivery-log`** (this) | Milestone ships ✅ | What shipped + system-design diagram + decisions DURING implementation + what this unblocks downstream |
| **`synthesis-log`** | Architectural decision committed | Verdict on a design question + what's adopted/rejected/deferred + cascade-unblocks elsewhere in the architecture |
| **`session-log`** (workspace-shared) | Any session worth preserving | Generic learnings + open questions (free-form) |

Delivery logs report; synthesis logs decide. A single session can produce both — e.g., 2026-05-06 had a synthesis log (WASM-A pivot decision) AND a delivery log will be written for v0.1.5 when its remaining phases complete.

## File naming + location

```
docs/src/content/docs/agent-context/zz-log/YYYY-MM-DD-vX-Y-Z-<short-name>-shipped.mdx
```

Examples (real entries):
- `2026-05-05-v0-1-2-render-shipped.mdx`
- `2026-05-05-v0-1-3-engine-integration-shipped.mdx`
- `2026-05-05-v0-1-4-junction-and-crosswalks-shipped.mdx`
- `2026-05-05-v0-1-4-5-streaming-shipped.mdx`

## Frontmatter template

```yaml
---
title: "vX.Y.Z shipped — <short milestone name>"
description: "<2-3 sentences: what shipped + key delivery + test counts. Lead with the user-visible/architecture-visible outcome.>"
tags: [milestone-shipped, vX-Y-Z, <topic-specific tags>]
date: YYYY-MM-DD
sidebar:
  label: "MM-DD · vX.Y.Z shipped"
  order: -YYYYMMDD.N   # negative date-encoded; lower N = appears earlier in sidebar within same date
---

import { Aside } from '@astrojs/starlight/components';
```

## Required sections

Each section has a clear job. Don't skip; don't bloat.

### 1. What shipped

- Open with the milestone name + a 1-paragraph headline ("Milestone vX.Y.Z [name]. Status flipped to ✅ in the milestone hub.")
- Lead with the user-visible or architecture-visible outcome (not a list of files)
- A table of surface-area changes — `Surface | Delivered`

### 2. Tests

- Unit + E2E counts (before / after if applicable)
- Highlight the milestone-gate E2E spec (the one that proves the feature)
- Stay terse: a table of suites + counts is enough

### 3. Notable design decisions made during implementation

Numbered list of decisions made during implementation that aren't already captured in a synthesis log. Examples:

- Phase-0 compat instead of breaking change
- Body and link content stay in legacy logic for now
- Existing frontmatter merge uses Obsidian's metadataCache (not a hand-rolled YAML parser)
- Frontmatter-merge errors are non-fatal
- Path collision is a hard error
- CURIE generation is `<ontology>:<filename-stem>`

These small decisions accumulate; the delivery log is where they live so future-us can find them without reading commit history.

### 4. **System-design integration diagram** (the load-bearing visual)

Show where this milestone plugs into the broader Crosswalker pipeline. Standard ASCII-diagram pattern:

```
                Crosswalker import pipeline (vX.Y.Z view)
                ════════════════════════════════════════

  ┌─ INPUT (UNCHANGED) ───────────────────────────────────────┐
  │   what came before this milestone (briefly)                │
  └───────────┬────────────────────────────────────────────────┘
              │
              ▼
  ┌─ NEW IN vX.Y.Z — <milestone description> ─────────────────┐
  │                                                            │
  │   <new components introduced>                              │
  │       │                                                    │
  │       ▼                                                    │
  │   <data flow showing the new behavior>                     │
  │       │                                                    │
  │       ▼                                                    │
  │   <where this lands in the pipeline>                       │
  │                                                            │
  └─────────────┬──────────────────────────────────────────────┘
                │
                ▼  (later milestones)
  ┌─ DOWNSTREAM ──────────────────────────────────────────────┐
  │  what later milestones will build on this                  │
  └────────────────────────────────────────────────────────────┘
```

This diagram is the single most valuable artifact in the delivery log — it makes the milestone's place in the system instantly graspable. Cross-reference the [system architecture](https://cybersader.github.io/crosswalker/concepts/system-architecture/) page (Layer 1-6) where appropriate.

### 5. Interfaces this milestone introduces / changes

A table of interfaces (TS types, function signatures, plugin instance handles, palette commands, schema fields) introduced or changed:

| Interface | Status |
|---|---|
| `someFunction()` in `src/foo.ts` | ✅ Live |
| `plugin.someHandle` exposed | ✅ Live; primarily for E2E + future commands |
| `kind` field in `spec/recipe.schema.json` | ✅ Added; default `concept`; backwards-compatible |

### 6. What did NOT change in this milestone

Explicit non-changes prevent scope creep:
- "Recipe schema unchanged"
- "Tier 1 schema unchanged"
- "Validator wiring unchanged from vX.Y.Z"

### 7. Memory rules followed this session

Reference the `feedback_*.md` and `project_*.md` memory entries that influenced this work:
- ✅ Always test thoroughly — milestone gate is …
- ✅ No personal data in commits/logs (sweep clean)
- ✅ Brevity preference — terse table-heavy delivery log

### 8. What this unblocks for the next milestone

Concrete enumeration of what cascade-unblocks downstream:
- Specific tasks in the next milestone that can now begin
- Architectural pieces that depend on what just shipped

### 9. Related (comprehensive cross-links)

Group by category — concept pages / agent context / synthesis logs / research challenges / external producer ecosystem / other milestones / spec files / next milestone.

This section is what makes the delivery log discoverable from any direction.

## Cascade updates (the multi-document update)

A delivery log triggers updates elsewhere. When written:

| File | What to update |
|---|---|
| `reference/roadmap/milestones/vX-Y-Z-name.mdx` | Status flipped from 🚧 / 📋 to ✅ Done with date |
| `reference/roadmap/milestones/index.mdx` | Status snapshot table row updated |
| `CHANGELOG.md` `[Unreleased]` | New entry for the milestone (per the path-keyed reminder in root `CLAUDE.md`) |
| `ROADMAP.md` (repo root) | Mirror update |
| `.claude/CLAUDE.md` | "v0.1 implementation status" table updated; "Last Updated" date bumped if substantial |

The PR template + path-keyed `CLAUDE.md` reminders cover this list.

## Writing-style discipline

- **Brevity preference** (`feedback_brevity_and_format.md`) — terse, table-heavy, Ctrl+F-able
- **Cross-link aggressively** (`feedback_link_everything.md`) — every term to definition; every related decision linked
- **System-design diagram is non-optional** — the integration-into-pipeline view is what makes the log valuable beyond a commit message
- **Capture decisions made during implementation** (`feedback_log_decisions.md`) — the small ones that add up

## Verification

After landing a delivery log:

1. `cd docs && bun run build` passes
2. Milestone page status flipped to ✅
3. CHANGELOG `[Unreleased]` has a new entry
4. The "Recent updates" stream on the home page shows the log
5. Cross-links from the next milestone's "Dependencies" resolve back to this log
6. Memory file refresh if any new architectural commitment surfaced

## Related skills

- `synthesis-log` — for architectural decisions (what's adopted/rejected, not "what shipped")
- `session-log` — generic dated-doc creator
- `docs-site` — Astro/Starlight authoring patterns
- `obsidian-markdown` — Markdown + frontmatter conventions

## Reference: delivery logs to study

Read in order to internalize the pattern:

1. [v0.1.2 — render() shipped](https://cybersader.github.io/crosswalker/agent-context/zz-log/2026-05-05-v0-1-2-render-shipped/) — pure-function delivery; small, focused
2. [v0.1.3 — Generation engine integration shipped](https://cybersader.github.io/crosswalker/agent-context/zz-log/2026-05-05-v0-1-3-engine-integration-shipped/) — multi-component integration; system-design diagram bridges multiple layers
3. [v0.1.4 — Junction notes + crosswalks shipped](https://cybersader.github.io/crosswalker/agent-context/zz-log/2026-05-05-v0-1-4-junction-and-crosswalks-shipped/) — kind dispatch + STRM enforcement; multi-framework recipe-pattern story
4. [v0.1.4.5 — Streaming refactor shipped](https://cybersader.github.io/crosswalker/agent-context/zz-log/2026-05-05-v0-1-4-5-streaming-shipped/) — patch-milestone delivery; demonstrates how a small refactor still benefits from full-form delivery log
