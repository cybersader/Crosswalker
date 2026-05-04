---
description: Crosswalker zz-log discipline — write dated synthesis logs that resolve research challenges, capture architectural decisions, and update the design log § Still-open table. Use PROACTIVELY when a research deliverable is processed, an architectural decision is made, or a Ch NN challenge is being closed.
user_invocable: true
---

# Synthesis Log Skill

Crosswalker-specific log discipline that turns research deliverables and architectural decisions into durable, cross-linked entries in `docs/src/content/docs/agent-context/zz-log/`.

This is the **decision-capture mechanism** that makes architectural decisions reachable across sessions, contributors, and future agents.

## Trigger phrases

- "write a synthesis log for..."
- "this resolves Ch NN..."
- "synthesis log for..."
- "we just decided X — log it"
- "/synthesis-log"

## When to use (proactive)

Trigger when ANY of these occur:

1. A research challenge (`zz-challenges/NN-name`) is being resolved by a deliverable
2. An architectural decision is committed (e.g., "stay on canonical SQLite", "render() pure-function signature")
3. The design log §6 "Still-open" table has an item that's just been closed
4. A pattern emerges that future-us will want explicit (e.g., a new modularity axis, a new constraint discovered)

Do NOT use this for:
- Ephemeral session notes (those go in `.workspace/` if anywhere)
- Generic learnings unrelated to project decisions (use `session-log` instead)
- Status reports on in-flight implementation (those are commit messages)

## How it differs from `session-log`

| Skill | Audience | Format | When |
|---|---|---|---|
| `session-log` (workspace-shared, generic) | Any project | Free-form learnings + open questions | End of any work session worth preserving |
| **`synthesis-log`** (this skill, Crosswalker-specific) | Crosswalker contributors + future agents | Decision-shaped: verdict, what's adopted, what's rejected, what cascade-unblocks | Architectural decision or research-challenge resolution |

If the entry would resolve a Ch NN challenge or change something settled in the design log, use `synthesis-log`. Otherwise, `session-log` is fine.

## File naming + location

```
docs/src/content/docs/agent-context/zz-log/YYYY-MM-DD-<name>-synthesis.mdx
```

Examples (real entries):
- `2026-05-04-target-structure-synthesis.mdx` — resolves Ch 22
- `2026-05-04-bundle-engine-language-synthesis.mdx` — resolves Ch 23
- `2026-05-04-tier-2-substrate-synthesis.mdx` — resolves Ch 24
- `2026-05-04-import-engine-design.mdx` — broader design phase closing log
- `2026-05-03-import-primitive-formal-foundation-synthesis.mdx` — resolves Ch 20

## Frontmatter template

```yaml
---
title: "<Topic> — synthesis (<verdict in one phrase>)"
description: "<2-3 sentences: what this log resolves; key insight; what's adopted; what's rejected.>"
tags: [foundation, design, <topic-specific tags>, ch-NN-resolution, ready-for-implementation]
date: YYYY-MM-DD
sidebar:
  label: "MM-DD · <short label>"
  order: -YYYYMMDD.N   # negative date-encoded; lower N = appears earlier in sidebar within same date
---

import { Aside } from '@astrojs/starlight/components';
```

## Required sections (the discipline)

1. **`:::tip` callout at top** — "This log resolves Challenge NN" with link to brief + deliverable
2. **§1 The verdict** — one-paragraph headline + verdict table (adopted / rejected / deferred)
3. **§2 Why each rejection / adoption is correct** — one breath each; defends against future second-guessing
4. **§3 The deepest insight elevated to load-bearing principle** (if any) — the one-sentence architectural lesson worth preserving above implementation details
5. **§4 What's locked in** (concrete v0.1 commitments) — table of "Aspect | v0.1 lock"
6. **§5 Migration triggers** (if applicable) — falsifiable conditions to revisit the decision; "re-open if any TWO of: [list]"
7. **§6 Reconciliation with prior decisions** — explicit table showing how this synthesis fits into the broader architecture (no contradiction; cascade implications)
8. **§7 What this does NOT do** — explicit non-commitments to prevent scope creep ("does not foreclose X forever; does not deprecate Y")
9. **§8 What this unblocks** — items in design log §6 / §8 that cascade-unblock now
10. **§9 Related** — links to deliverable, archived brief, broader design log, related concept pillars, philosophical pillars

Not every synthesis log uses every section — but the **verdict + what's adopted + what's rejected + related** are minimums.

## Cascade-unblocks (the multi-document update)

A synthesis log rarely lives alone. When written, it triggers updates to:

| File | What to update |
|---|---|
| `zz-challenges/NN-name.mdx` | Move to `archive/`; add `:::tip[Resolved YYYY-MM-DD — archived]` callout linking to deliverable + this synthesis log |
| `zz-challenges/index.mdx` | Move challenge from "Active" to "Archived (resolved)" list |
| `zz-research/index.md` | Add row for the deliverable with synthesis-log link in "Decision log it fed" column |
| `zz-log/<broader-design-log>.mdx` | Update §6 "Still open" table — mark item ✅ RESOLVED; update §8 "Concrete next steps" to flip cascade-unblocked items from TODO to UNBLOCKED |
| Concept pillars referencing the now-resolved item | Update "Open design questions" tables; flip status from Open to Settled with link to this synthesis log |
| `v0-1-schema-spec.mdx` (if relevant) | Add or update `:::tip` / `:::note` callout pointing at this synthesis log |

The PR template + `CLAUDE.md` "Documentation update reminders" both remind authors to do this multi-document update.

## Writing-style discipline

- **Brevity preference** (memory: `feedback_brevity_and_format.md`) — terse, table-heavy, Ctrl+F-able
- **Cross-link aggressively** (memory: `feedback_link_everything.md`) — every term to definition; every related decision linked
- **Capture user perspective** (memory: `feedback_log_decisions.md`) — when adopting/rejecting against a deliverable's recommendation, document *why* (often a specific user direction)
- **Modularity-axis discoveries earn elevation** — if the synthesis surfaces a new orthogonal modularity axis (e.g., "vector layer is decoupled from substrate"), call it out as the deepest insight

## Verification

After landing a synthesis log:

1. `cd docs && bun run build` passes
2. The "Recent updates" stream on the home page shows it
3. The relevant challenge brief is archived with resolution callout
4. The broader design log §6 / §8 are updated
5. Cross-links from related concept pillars resolve

## Related skills

- `session-log` — generic dated-doc creator for non-decision learnings
- `docs-site` — Astro/Starlight authoring patterns
- `obsidian-markdown` — Markdown + frontmatter conventions

## Reference: synthesis logs to study

To understand the pattern in practice, read these in order:

1. [2026-05-04 import engine design](https://cybersader.github.io/crosswalker/agent-context/zz-log/2026-05-04-import-engine-design/) — broad design-phase synthesis with §6 Still-open + §8 Next-steps tables
2. [2026-05-04 target-structure synthesis](https://cybersader.github.io/crosswalker/agent-context/zz-log/2026-05-04-target-structure-synthesis/) — single-challenge resolution (Ch 22)
3. [2026-05-04 tier-2 substrate synthesis](https://cybersader.github.io/crosswalker/agent-context/zz-log/2026-05-04-tier-2-substrate-synthesis/) — adversarial-rejection synthesis (Ch 24)
4. [2026-05-04 bundle engine language synthesis](https://cybersader.github.io/crosswalker/agent-context/zz-log/2026-05-04-bundle-engine-language-synthesis/) — partial-disagreement synthesis (Ch 23, 8 of 9 commitments adopted)
