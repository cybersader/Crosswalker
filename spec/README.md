# Crosswalker spec — machine-readable contracts

This directory holds the **load-bearing artifacts** that define what Crosswalker is. The plugin is one possible implementation; these schemas are the contract that *anything* speaking Crosswalker must conform to. External producers (Python tools, custom scripts, AI agents, MCP servers) target these schemas; the plugin validates against them.

## What lives here

| File | Purpose | Audience |
|---|---|---|
| `tier1.schema.json` | The canonical shape of a Crosswalker vault — Markdown + YAML frontmatter, folder layout, wikilink conventions, provenance block | External producers; validators; plugin engine |
| `recipe.schema.json` | The shape of an import recipe — source declaration, target layout (folder/file/heading/tag/wikilink mechanisms), cross-cutting also-emit, graph edges | Recipe authors; the bundled engine; AI agents authoring recipes |
| `primitives/` (TODO) | One JSON Schema per transformation primitive (iterate, project, parent-id-to-tree, etc.) | Engine implementations; recipe validators |

## Conventions

- **JSON Schema 2020-12**. Use `$schema`, `$id`, `$defs`. Prefer `$ref` over inlining for reusable shapes.
- **Stable URIs**. Every `$id` is `https://crosswalker.dev/spec/<name>.json` — these URLs are reserved and will be served from the docs site once published. They double as canonical IDs in `_crosswalker.spec_version` fields.
- **Versioning**. Breaking changes bump the major version in the URI (`v1`, `v2`). Additive changes (new optional fields) don't require a version bump.
- **Examples**. Every schema has at least one `examples` block showing valid usage.

## Why these are at the repo root, not in `docs/`

These files are *the contract*, not documentation about the contract. External producers and validators need stable, predictable paths. Repo root + GitHub raw URLs is the lowest-friction distribution. The docs site references and explains them; the canonical artifacts live here.

## Related

- [v0.1 schema spec (KB)](https://cybersader.github.io/crosswalker/agent-context/v0-1-schema-spec/) — human-readable spec; this directory is its machine-readable form
- [ETL and import (concept pillar)](https://cybersader.github.io/crosswalker/concepts/etl-and-import/) — schema-as-primitive architecture
- [Ch 22 synthesis log](https://cybersader.github.io/crosswalker/agent-context/zz-log/2026-05-04-target-structure-synthesis/) — recipe schema lineage
- [Ch 23 synthesis log](https://cybersader.github.io/crosswalker/agent-context/zz-log/2026-05-04-bundle-engine-language-synthesis/) — runtime-agnostic recipe schema commitment
- [Agent tooling](https://cybersader.github.io/crosswalker/agent-context/agent-tooling/) — orientation for agents helping users author recipes against this spec
