# Claude Agent Instructions — Crosswalker

## Project context

You are working on **Crosswalker** — an Obsidian plugin for importing structured ontologies (frameworks, taxonomies, hierarchical or graph-shaped concept sets) into Obsidian as canonical Markdown with frontmatter, folders, headings, tags, and typed wikilinks. Compliance frameworks (NIST, MITRE, CIS, ISO) are the primary launch use case; the architecture is general-domain.

**GitHub**: https://github.com/cybersader/Crosswalker

## v0.1 architectural commitments (settled 2026-05-04)

The 2026-05-04 design phase concluded with five fresh-agent research challenges (Ch 20–24) resolved. **These are settled commitments**; reference the linked synthesis logs for rationale before proposing changes.

| # | Commitment | Source |
|---|---|---|
| 1 | **Schema-as-primitive** — Tier 1 schema is the load-bearing contract; engine + ETL are convenience. Anyone (plugin, external Python, agent, MCP server) emitting valid Tier 1 is a first-class producer | [ETL pillar](https://cybersader.github.io/crosswalker/concepts/etl-and-import/) |
| 2 | **Closed 5-mechanism recipe grammar** — `folder \| file \| heading \| tag \| wikilink` × ordered layout × also_emit × graph_edges. `render(Recipe, ConceptIdentity) → Address` as single coupling point | [Ch 22 synthesis](https://cybersader.github.io/crosswalker/agent-context/zz-log/2026-05-04-target-structure-synthesis/) |
| 3 | **TypeScript in-plugin engine for v0.1** — Path C (optional Python producer) reserved for v0.5+. Mobile-Obsidian portability + small-OSS contributor pool are the irreversible constraints | [Ch 23 synthesis](https://cybersader.github.io/crosswalker/agent-context/zz-log/2026-05-04-bundle-engine-language-synthesis/) |
| 4 | **Tier 2 substrate stays on `@sqlite.org/sqlite-wasm` + `sqlite-vec`** — libSQL/Turso Cloud/Limbo all rejected. Five explicit migration triggers locked | [Ch 24 synthesis](https://cybersader.github.io/crosswalker/agent-context/zz-log/2026-05-04-tier-2-substrate-synthesis/) |
| 5 | **Runtime-agnostic recipe schema** — JSON Schema + AJV + JSONata; engine implementation is swappable; vector layer (`sqlite-vec`) decoupled from substrate. The single most important modularity commitment | [Ch 23 synthesis §4](https://cybersader.github.io/crosswalker/agent-context/zz-log/2026-05-04-bundle-engine-language-synthesis/#4-the-most-important-commitment-runtime-agnostic-recipe-schema) |
| 6 | **Output query layer = Bases** (Dataview removed) | Project memory: `project_query_layer_bases_not_dataview.md` |

**Machine-readable contracts**: [`spec/tier1.schema.json`](https://github.com/cybersader/crosswalker/blob/main/spec/tier1.schema.json) + [`spec/recipe.schema.json`](https://github.com/cybersader/crosswalker/blob/main/spec/recipe.schema.json).

## `.claude/` folder structure

```
.claude/
├── CLAUDE.md              # This file — main agent instructions (committed)
├── skills/                # Reusable agent capabilities (committed)
│   ├── docs-site/         # Astro/Starlight site authoring patterns
│   ├── docs-testing/      # Playwright docs E2E testing
│   ├── edit-history/      # Parse obsidian-edit-history .edtz files
│   ├── json-canvas/       # Obsidian JSON Canvas spec
│   ├── obsidian-bases/    # Obsidian Bases query authoring
│   ├── obsidian-markdown/ # Obsidian-flavor Markdown patterns
│   ├── session-log/       # Generic dated-doc creator (workspace-shared)
│   ├── synthesis-log/     # Crosswalker zz-log discipline — architectural decisions
│   ├── delivery-log/      # Per-milestone delivery-log discipline — what shipped + integration diagram
│   ├── wikilink-crawl/    # Pre-design 2-hop crawl of linked docs (READ skill; pairs with WRITE skills)
│   └── testing-patterns/  # Test pattern library
├── agents/                # Project-specific subagent definitions (committed)
│   ├── pre-commit-reviewer.md  # Audits staged diff for alignment-with-conventions; flags CHANGELOG drift / missing logs / personal data / etc.
│   └── milestone-starter.md    # Pre-work context briefing — crawls milestone page + dependencies + cited Ch NN sections; produces 1-page briefing before code starts
├── settings.local.json    # User-specific Claude Code settings (GITIGNORED)
└── plans/                 # Plan-mode files (GITIGNORED)
```

**Commit policy**:
- ✅ `CLAUDE.md` and `skills/` are committed — active agent context
- ❌ `settings.local.json` is gitignored — user-specific paths/permissions
- ❌ `plans/` is gitignored — ephemeral plan-mode state

The `.claude/` folder is intentionally lean: just active agent instructions plus reusable skills. **Project knowledge lives in the docs site at `docs/src/content/docs/`** (published to https://cybersader.github.io/crosswalker/), not here. Earlier numbered docs (`00-INDEX` through `45-FRAMEWORK-MAINTENANCE-LANDSCAPE`) were superseded by the docs site and removed in the 2026-05-04 cleanup.

## Knowledge base — recommended reading order

The canonical project KB is the docs site. For an agent new to the project:

| Topic | Page |
|---|---|
| **Read first — system architecture overview** (3 tiers, 6 layers, component-to-tier matrix) | [concepts/system-architecture](https://cybersader.github.io/crosswalker/concepts/system-architecture/) |
| The core problem | [concepts/problem](https://cybersader.github.io/crosswalker/concepts/problem/) |
| What makes Crosswalker unique | [concepts/what-makes-crosswalker-unique](https://cybersader.github.io/crosswalker/concepts/what-makes-crosswalker-unique/) |
| Vault hierarchy primitives | [concepts/hierarchy-primitives](https://cybersader.github.io/crosswalker/concepts/hierarchy-primitives/) |
| ETL and import (the schema-as-primitive pillar) | [concepts/etl-and-import](https://cybersader.github.io/crosswalker/concepts/etl-and-import/) |
| Embedded vs server substrates | [concepts/embedded-vs-server-substrates](https://cybersader.github.io/crosswalker/concepts/embedded-vs-server-substrates/) |
| Terminology | [concepts/terminology](https://cybersader.github.io/crosswalker/concepts/terminology/) |
| Tradeoffs | [agent-context/tradeoffs](https://cybersader.github.io/crosswalker/agent-context/tradeoffs/) |
| Vision | [agent-context/vision](https://cybersader.github.io/crosswalker/agent-context/vision/) |
| v0.1 schema spec (the build target) | [agent-context/v0-1-schema-spec](https://cybersader.github.io/crosswalker/agent-context/v0-1-schema-spec/) |
| Roadmap | [reference/roadmap](https://cybersader.github.io/crosswalker/reference/roadmap/) (mirrored at `ROADMAP.md` repo root) |
| **v0.1 implementation milestones** | [reference/roadmap/milestones](https://cybersader.github.io/crosswalker/reference/roadmap/milestones/) — current active work |
| Decision log | [agent-context/zz-log](https://cybersader.github.io/crosswalker/agent-context/zz-log/) |
| Research deliverables | [agent-context/zz-research](https://cybersader.github.io/crosswalker/agent-context/zz-research/) |
| Open research challenges | [agent-context/zz-challenges](https://cybersader.github.io/crosswalker/agent-context/zz-challenges/) |
| Agent-tooling progressive-disclosure space | [agent-context/agent-tooling](https://cybersader.github.io/crosswalker/agent-context/agent-tooling/) |

## v0.1 implementation status (as of 2026-05-06)

| Milestone | Status |
|---|---|
| [v0.1.1](https://cybersader.github.io/crosswalker/reference/roadmap/milestones/v0-1-1-types-and-validation/) — Type system + validation foundation | ✅ Done (2026-05-04) |
| [v0.1.2](https://cybersader.github.io/crosswalker/reference/roadmap/milestones/v0-1-2-render/) — render() v1 | ✅ Done (2026-05-05) |
| [v0.1.3](https://cybersader.github.io/crosswalker/reference/roadmap/milestones/v0-1-3-generation-engine-integration/) — Generation engine integration | ✅ Done (2026-05-05) |
| [v0.1.4](https://cybersader.github.io/crosswalker/reference/roadmap/milestones/v0-1-4-junction-notes-and-crosswalks/) — Junction notes + crosswalk edges | ✅ Done (2026-05-05) |
| [v0.1.4.5](https://cybersader.github.io/crosswalker/reference/roadmap/milestones/v0-1-4-5-streaming-refactor/) — Streaming refactor | ✅ Done (2026-05-05) |
| [v0.1.5](https://cybersader.github.io/crosswalker/reference/roadmap/milestones/v0-1-5-tier-2-sidecar/) — Tier 2 sqlite-wasm sidecar | ✅ Done (2026-05-06) |
| **[v0.1.6](https://cybersader.github.io/crosswalker/reference/roadmap/milestones/v0-1-6-bases-query-layer/) — Bases query layer + SSSOM + recipe UX** | 🚧 Phases 1–6.4 ✅ (incl. 2026-06-12 ingestion-corpus sprint + wizard XLSX/JSON parity); v0.1.7 next |
| [v0.1.7](https://cybersader.github.io/crosswalker/reference/roadmap/milestones/v0-1-7-exporters/) — Exporters (STRM/OSCAL/SSSOM) | 📋 Planning |
| [v0.1.8](https://cybersader.github.io/crosswalker/reference/roadmap/milestones/v0-1-8-audit-trail/) — Audit trail T1 default | 📋 Planning |
| [v0.1-RC](https://cybersader.github.io/crosswalker/reference/roadmap/milestones/v0-1-rc-bundle-and-ship/) — Ship | 📋 Planning |

**Date-anchored revisit checkpoints:**
- **2026-11-06** — sqlite-vec packaging revisit (per [WASM-A pivot synthesis](https://cybersader.github.io/crosswalker/agent-context/zz-log/2026-05-06-wasm-a-pivot-synthesis/) + [Ch 24 §5 Q4](https://cybersader.github.io/crosswalker/agent-context/zz-log/2026-05-04-tier-2-substrate-synthesis/#5-migration-triggers--when-to-revisit))

## Operational rules (load-bearing for agents)

| Rule | Source / why |
|---|---|
| **Brevity + Ctrl+F-able format** — terse tables/bullets over prose; long artifacts OK but summarize briefly in chat | Memory: `feedback_brevity_and_format.md` |
| **Link everything** — every term/concept/decision in KB pages should link to its definition; every log/concept page has a `## Related` section | Memory: `feedback_link_everything.md` |
| **Log all decisions** — significant decisions get dated `zz-log/` entries; capture user's perspective and intent | Memory: `feedback_log_decisions.md` |
| **General-ontology vocabulary in docs/KB; compliance-first in user-facing surfaces** — internal vocabulary uses ontology/concept; README + settings stay GRC-first | Memories: `feedback_general_ontology_positioning.md`, `feedback_readme_user_facing_surfaces.md` |
| **Never surface internal architecture vocabulary in README** — STRM/SSSOM/Tier 2/sqlite-wasm/Polars+DuckDB/runtime-agnostic-recipe-schema alienates evaluators. Plain language only in user-facing surfaces | Memory: `feedback_readme_user_facing_surfaces.md` |
| **Bases not Dataview** — v0.1 query layer commitment; do NOT reference Dataview in user-facing surfaces or new code | Memory: `project_query_layer_bases_not_dataview.md` |
| **Pattern A test-vault structure** — repo root has src/ + docs/ + spec/ + test-vault/ as siblings; build outputs into `test-vault/.obsidian/plugins/crosswalker/` | Confirmed 2026-05-04 |
| **Plugin ships only `main.js + manifest.json + styles.css`** — `tools/`, `spec/`, KB don't bloat releases | Confirmed 2026-05-04 |
| **Manual testing entry point** — `TEST_HANDS_ON_TOUR.md` at repo root is the master surface-coverage checklist (supersedes per-phase TEST_*.md guides for full passes) | Added 2026-06-12 |
| **Screenshot Obsidian UI yourself — it IS automatable here** — real Obsidian runs via wdio + WSLg (`DISPLAY=:0 bun run e2e -- --spec tests/e2e/visual-*.spec.ts` → PNGs in `test-screenshots/`, readable by agents). Visual-verify rendering with a screenshot before claiming "can't render headlessly" or asking the user to eyeball. Never conclude Obsidian can't be screenshotted. | Memory: `reference_obsidian_screenshots_via_wdio.md`; `testing-patterns` skill |

## Model tiering & delegation (how to spend the main session)

The main session runs the strongest available model (Fable 5, or Opus 4.8 for easier problem tiers). **Spend it at the highest level of abstraction the task allows; push mechanical work down to subagents.** Added 2026-07-05 per user direction.

| Layer | Model | Work |
|---|---|---|
| **Architect** (main session) | Fable 5 / Opus 4.8 | The hard ontological/data-model problems; specs + schema deltas; pseudocode skeletons; design decisions (captured in `.workspace/` design docs → `zz-log/`); reviewing delegated diffs; deciding what to delegate |
| **Implementation** (subagents) | `sonnet` (default) or `opus` (mid-difficulty judgment work) | Mechanical implementation against a written spec; test authoring; themed commit batches; corpus/code surveys; doc sweeps |

**The loop:** architect writes the spec (dated `.workspace/` design doc: exact semantics, worked examples, acceptance cases) → subagent implements exactly to spec, **no commits** → architect reviews the diff, runs the gates, commits. (Exception: pure git-chunking tasks may commit on a side branch; nothing is ever pushed by a subagent.)

Rules:
- Always set an explicit `model` on Agent calls — never inherit the frontier model into fully-specified mechanical work.
- Hand subagents the env quirks (WSL /mnt/c: run tests via `node node_modules/jest/bin/jest.js`, never reinstall `node_modules`) and repo commit rules (no AI attribution, no personal data).
- If the main session catches itself doing >~15 min of fully-specified mechanical work, delegate it.
- Worked example of the loop: 2026-07-05 variadic folder expansion (`.workspace/2026-07-05-variadic-split-and-folder-note-design.md` → Sonnet implementation → architect review + commit).

## Roadmap conventions

The roadmap lives in two places that must stay in sync:

- **Docs**: `docs/src/content/docs/reference/roadmap/index.mdx` — the living roadmap (active + future phases only)
- **Repo root**: `ROADMAP.md` — plain-markdown mirror for GitHub

**Active milestone work** lives at `docs/src/content/docs/reference/roadmap/milestones/` (hub-and-spoke pattern adopted 2026-05-04).

**When a phase completes:**
1. Move its checklist to a new archive page: `reference/roadmap/vX-Y-name.mdx`
2. Add a "What carried forward" section noting items that moved to later phases
3. Update `ROADMAP.md` at the repo root to match
4. Flip phase status in roadmap index hub

**Every significant decision** gets a dated log entry in `docs/src/content/docs/agent-context/zz-log/` linked from the roadmap item.

## Cross-linking convention

Every page should aggressively cross-link to related concepts, decisions, and definitions.

- Link terms to their [terminology](https://cybersader.github.io/crosswalker/concepts/terminology/) definitions on first mention
- Link concepts to the pages that explore them deeper
- Every log page must have a `## Related` section
- Roadmap items should link to log entries, research pages, and concept pages
- Link to philosophical pillars where design decisions connect to them

**Goal**: any reader follows any concept from any page to its definition, rationale, and related decisions without dead ends.

## Research artifact lifecycle

- **Challenge brief** (`agent-context/zz-challenges/NN-name.mdx`) — adversarial assignment for fresh agents; includes anti-patterns and success criteria
- **Deliverable** (`agent-context/zz-research/YYYY-MM-DD-challenge-NN-slug.md`) — verbatim agent output; preserved as historical record (`.md` not `.mdx`; frontmatter only for sidebar)
- **Synthesis log** (`agent-context/zz-log/YYYY-MM-DD-name-synthesis.mdx`) — what's adopted/rejected from the deliverable; cascade-unblocks; updates the design log §6 Still-open table
- **Archived brief** — moved to `zz-challenges/archive/` with a resolution callout pointing at the deliverable + synthesis log

Workspace drafts live at `.workspace/` (gitignored). Lifecycle: working draft → decision in `zz-log/` → published deliverable in `zz-research/` (when applicable) → concept crystallizes into `concepts/` pillar.

## Build / test commands

See `docs/src/content/docs/development/setup.mdx` for the full `bun run` reference table. Most-used during development:

| Command | What it does |
|---|---|
| `bun run serve` | Interactive menu — docs dev, plugin watch, parallel both, tunnel sharing, tests |
| `bun run dev` | Plugin watch build → `test-vault/.obsidian/plugins/crosswalker/` |
| `bun run fixtures` | Regenerate Tier 1 markdown test fixtures |
| `bun run build` | Plugin production build (type-check + bundle) |
| `bun run lint` | ESLint (community-plugin rules — required for submission) |
| `cd docs && bun run build` | Docs site build (must pass before deploy) |

## Spec evolution

`spec/tier1.schema.json` and `spec/recipe.schema.json` are JSON Schema 2020-12. URIs (`https://crosswalker.dev/spec/...`) are stable; breaking changes bump major version in URI. Validate with AJV (planned for milestone v0.1.1). When schemas change, regenerate fixtures (`bun run fixtures`) and update [`v0-1-schema-spec`](https://cybersader.github.io/crosswalker/agent-context/v0-1-schema-spec/) doc page.

## When you get stuck

- Check the docs site KB first
- Search the decision log (`zz-log/`) — most architectural questions are already answered
- For research-heavy questions, check `zz-research/` deliverables
- For Obsidian API questions, check the [Obsidian Plugin API](https://docs.obsidian.md/) directly
- For Crosswalker-specific conventions, check this file's "Operational rules" + "Roadmap conventions" sections

---

**Last Updated**: 2026-07-05 (v0.1.6 mid-milestone. Added model-tiering & delegation section. In flight on `feat/render-report`: per-row deviation report + Step 3 banner, variadic folder expansion for ragged ids [Ch 42 §1–3], parent_note placement resolved as a user choice [.workspace 2026-07-05 design doc].)
**For**: Crosswalker Obsidian Plugin Development (v0.1 implementation phase)
**Agent Role**: Architect & Delegation Orchestrator (specs, decisions, reviews — implementation delegated to subagents)
