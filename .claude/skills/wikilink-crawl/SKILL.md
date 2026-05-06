---
description: Crosswalker wikilink-crawl discipline — when arriving at a doc page (concept, spec, synthesis log, milestone, deliverable), proactively follow inline links 1-2 hops deep to gather full context BEFORE writing code or making decisions. Prevents missing load-bearing context buried in linked pages. Use PROACTIVELY at the start of any architecturally-significant work and at any "design moment" where a wrong assumption would cost rework.
user_invocable: true
---

# Wikilink Crawl Skill

The Crosswalker docs site is **densely cross-linked by design** ([cross-linking convention](https://cybersader.github.io/crosswalker/concepts/system-architecture/)). Every concept page has a `## Related` section; every synthesis log has §9 Related; every milestone page has Dependencies + Related sections; the schema spec links to challenges and synthesis logs; etc.

This linking density is **load-bearing context** — when reading any single page in isolation, you're missing decisions, constraints, and patterns documented in linked pages. **Failing to crawl those links produces design errors.**

This skill codifies the crawl discipline so it's explicit and consistent.

## Trigger phrases

- "what does the spec say about X" — crawl the spec + its linked challenges + synthesis logs
- "I'm going to design Y" — crawl all pages relevant to Y before writing code
- "/wikilink-crawl"

Most uses are **proactive** — invoke before the user mentions it.

## When to use (proactive)

Trigger when ANY of these apply:

1. **Starting a new milestone phase** — read the milestone page + its dependencies + related synthesis logs + related concept pages BEFORE writing code
2. **Designing anything that touches the schema** — read `spec/*.schema.json` + the schema spec page + relevant Ch NN deliverables that informed the schema
3. **Writing a synthesis log or delivery log** — crawl forward (related pages) AND backward (cited research deliverables) so the log has correct cascade-unblocks
4. **Before committing an architectural decision** — verify the decision aligns with all 6 architectural commitments + all 5 active migration triggers + concept-page rationales
5. **Confused about a term** — terminology page + first-mention link in a concept page
6. **Implementing something the docs reference (e.g., "per Ch 18 §2.5")** — actually read Ch 18 §2.5

Do NOT crawl when:
- The work is mechanical (lint fix; type guard fix; obvious typo)
- The page being read is fully self-contained (e.g., a small focused doc with no `## Related`)
- Token budget is tight and the linked pages are clearly outside scope

## How to crawl (the actual technique)

**Two-hop default**, with judgment-driven extension:

```
HOP 0: The page you arrived at
       │
       ▼
HOP 1: Read every link in §1 / §Related / §Dependencies
       (the most-relevant linked context)
       │
       ▼
HOP 2: From HOP-1 pages, read the linked Ch NN deliverables OR
       linked concept pages OR linked spec sections that are most
       relevant to the work at hand
       │
       ▼
DECIDE: For each HOP-2 page, do I need to crawl it further?
        Usually no — HOP 2 is usually enough. Crawl deeper only
        if the page raises a specific question relevant to the work.
```

### Common crawl paths

When the work is X, the high-value crawl is roughly:

| Work | HOP 0 | HOP 1 | HOP 2 (if relevant) |
|---|---|---|---|
| Implementing a milestone | Milestone page | Dependencies' pages + synthesis logs | Ch NN deliverables that informed those decisions |
| Writing a synthesis log | The deliverable + the challenge brief | Earlier synthesis logs that established the framework | Concept pillars affected |
| Writing a delivery log | Milestone page + delivered-code commits | The synthesis logs that informed the milestone | Related concept pages |
| Designing a schema change | spec/*.schema.json + schema spec page | Ch NN deliverables that informed the schema | Concept pillars (terminology + the affected layer) |
| Implementing a query | Tier 2 schema spec §7 + relevant Ch NN | Bases concept page + system-architecture Layer 4 | Earlier closure-cache or query patterns |
| Resolving a research challenge | Challenge brief + deliverable | Earlier challenges in the same arc + relevant concept pillars | Synthesis logs that resolved adjacent challenges |

### What to actually do at each hop

For each linked page reached:

1. **Read the page's intro + table of contents (or the section the source link pointed at)** — don't necessarily read top-to-bottom
2. **Look for relevant subsections** by section titles + keyword scan
3. **Note any `## Related` section + linked Ch NN references** — these are the next-hop candidates
4. **Capture insights as you go** — don't read 5 pages and lose what you learned by page 5; write a few bullets to a scratch buffer

## Failure modes this prevents

Real cases from the Crosswalker codebase:

| Failure | What was missed | Cost |
|---|---|---|
| Closure-cache schema design (v0.1.5 Phase 3) | Ch 18 §2.5 closure-cache patterns weren't read; I designed cache rows as per-edge, not per-(start, target). Caught on review. | ~30 min rework |
| WASM-B path (initial choice 2026-05-05) | Did not crawl deeply into emscripten Electron-renderer compatibility before committing to the path | Multi-day pivot to WASM-A |
| Initial misframing of "ParsedData" as a tier | Didn't crawl the schema-as-primitive section of etl-and-import before introducing the term in chat | Required ETL pipeline clarification log + concept page rewrite |

In each case, an upfront 5-15 minute crawl would have surfaced the relevant constraint.

## Token-budget judgment

Crawling has a cost. Don't crawl every link blindly. Apply this filter:

| Link type | Crawl rule |
|---|---|
| **Forward → next-milestone page** (e.g., from v0.1.5 to v0.1.6) | YES if the work depends on understanding what comes next |
| **Backward → synthesis log** (e.g., "per Ch 24 §5") | ALWAYS — synthesis logs are decision-anchored |
| **Backward → research deliverable** | YES if a question-of-interpretation arises; NO if the synthesis log captures the relevant verdict |
| **Lateral → concept page** | YES on first mention of a term I'm unsure about; NO on terms I already know |
| **Spec section → CTE pattern / DDL** | ALWAYS when implementing the section |
| **External link (npm package, GitHub repo)** | Only when the npm/GitHub state is part of the decision (e.g., "is this package maintained?") |

## Verification

After a crawl session, before writing code:

1. Did the crawl surface any constraint I would have missed?
2. Did I read at least Ch NN sections explicitly cited in the page-of-interest?
3. Did I update my plan based on what I found, or did I forge ahead with the original plan? (If the latter, did I justify it?)
4. Are there `## Related` sections at HOP 1 I haven't followed yet? Are any of them load-bearing?

## How this skill differs from others

| Skill | Job |
|---|---|
| `synthesis-log` | WRITE a decision-shaped log entry |
| `delivery-log` | WRITE a milestone-shaped log entry |
| `session-log` | WRITE a generic session log |
| **`wikilink-crawl`** (this) | **READ context before writing — across multiple linked pages** |
| `docs-site` | Authoring patterns for the Astro/Starlight site itself |
| `docs-testing` | Playwright tests against the docs site |

Wikilink-crawl is a READ skill. It pairs with the WRITE skills.

## Example crawl sessions to study

1. **System-architecture concept page (well-crawled)** — when I wrote `concepts/system-architecture.mdx`, I crawled `etl-and-import.mdx`, `embedded-vs-server-substrates.mdx`, `file-based-graph-database.mdx`, `terminology.mdx`, `v0-1-schema-spec.mdx`, all 9 milestone pages, `2026-05-04-import-engine-design.mdx`, Ch 22/23/24 synthesis logs. The result: the page is comprehensive, accurate, and hooks into the existing doc graph correctly. ~15 minutes of crawling; saved 30+ minutes of rework downstream.

2. **Phase 3 closure-cache (poorly-crawled)** — I read schema spec §7 but didn't crawl the cited Ch 18 §2.5 closure-cache patterns. Result: cache row semantics were wrong; caught on self-review; ~30 minutes of rework. Lesson: when the spec cites Ch NN section, READ that section.

## Related skills

- `synthesis-log` — for capturing decisions reached after crawling
- `delivery-log` — for capturing milestone deliveries with full context
- `docs-site` — Astro/Starlight authoring (after the crawl is done and writing begins)
