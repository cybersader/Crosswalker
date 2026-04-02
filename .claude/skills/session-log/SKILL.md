---
description: Create dated session documents capturing learnings, decisions, and open questions during work sessions. Use PROACTIVELY at the end of significant research, decision-making, or problem-solving sessions.
user_invocable: true
---

# Session Log Skill

Create dated knowledge documents that capture learnings, decisions, and open questions from work sessions. These are living records that connect to the project's knowledge base.

## Trigger Phrases

- "document what we learned"
- "log this session"
- "capture today's decisions"
- "write up the findings"
- /session-log

## When to Use (Proactive)

Use this skill **proactively** when ANY of these occur during a session:

1. **Architectural decisions** were made or debated (even "pending" decisions)
2. **Research findings** changed understanding of a problem
3. **Integration patterns** were discovered (how components fit together)
4. **Tradeoffs** were analyzed with concrete pros/cons
5. **Open questions** surfaced that need future investigation
6. **Tipping points** were identified (when approach A breaks down, switch to B)

Do NOT wait for the user to ask. If a session produced learnings worth preserving, offer to log them.

## Document Format

### Filename

```
YYYY-MM-DD-<topic-slug>.md
```

Examples:
- `2026-02-14-kasm-mount-orchestration-decisions.md`
- `2026-03-01-crdt-room-granularity-findings.md`
- `2026-03-15-exdev-shim-implementation-notes.md`

### Location

Place in the project's knowledge base according to temperature:

| Temperature | When to Use | Path |
|-------------|-------------|------|
| `01-working/` | Active decisions, ongoing investigation | Most session logs start here |
| `02-learnings/` | Distilled insight that's permanently useful | Promote after session if insight is clear |
| `00-inbox/` | Quick capture, will organize later | Only if unsure where it belongs |

If the project has no `knowledge-base/` folder, create the document in the project root or a `docs/` folder with the same naming convention.

### Template

```markdown
---
date created: YYYY-MM-DD
date modified: YYYY-MM-DD
temperature: working
tags:
  - session-log
  - <topic-tags>
related:
  - "[[related-doc-1]]"
  - "[[related-doc-2]]"
---

# YYYY-MM-DD — <Descriptive Title>

## Context

What prompted this investigation? What question were we trying to answer?

## Key Discoveries

### Discovery 1: <Name>

Details, evidence, implications.

### Discovery 2: <Name>

Details, evidence, implications.

## Decisions

**DECISION-XXX: <Name>**
- **Choice:** What was decided
- **Rationale:** Why
- **Status:** Accepted / Pending / Supersedes DECISION-YYY
- **Tradeoffs:** What we gave up

## Analysis

Tables, comparisons, diagrams that support the decisions.

## Open Questions

- [ ] Question 1
- [ ] Question 2

## Next Steps

1. Concrete action 1
2. Concrete action 2

## Sources

- [Source 1](url)
- [Source 2](url)
```

## Rules

1. **Always include frontmatter** with date, temperature, tags, and related links
2. **Always include related wikilinks** — session logs should connect to existing docs
3. **Tag with `session-log`** so they're findable
4. **Use concrete examples** — not "we discussed access control" but "compound rules like legal AND executive for M&A deal rooms"
5. **Capture open questions as checkboxes** — they become the next session's starting point
6. **Reference decisions by ID** (DECISION-XXX) if the project uses a decision log
7. **Include sources** for any web research, docs, or external references consulted
8. **Date prefix is non-negotiable** — YYYY-MM-DD at front of filename, always

## Lifecycle

Session logs in `01-working/` should be reviewed periodically:

- **Decisions accepted?** → Update the project's decision log, link back to session log
- **Insight crystallized?** → Promote key findings to `02-learnings/` as a standalone doc (SCREAMING_SNAKE_CASE)
- **Superseded?** → Move to `04-archive/` with a note about what replaced it
- **Questions answered?** → Check off the checkboxes, add findings inline

## Example

```
User is researching how Kasm handles per-user Docker mounts.
Session involves web searches, reading docs, comparing approaches.
Three integration patterns are identified with tradeoffs.
A decision is made to pursue both native and custom approaches.

→ Agent creates: 01-working/2026-02-14-kasm-mount-orchestration-decisions.md
→ Contains: discoveries, decision with rationale, compound rules analysis, open questions
→ Links to: [[ARCHITECTURE_COMPONENTS]], [[mount-orchestration]]
```
