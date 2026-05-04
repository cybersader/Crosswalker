<p align="center">
  <img src="docs/public/logo.png" alt="Crosswalker" width="200" />
</p>

<h1 align="center">Crosswalker</h1>

<p align="center">
  <strong>An Obsidian-native ingestion target for structured ontologies.</strong>
</p>

<p align="center">
  <a href="https://github.com/cybersader/crosswalker/blob/main/LICENSE"><img src="https://img.shields.io/github/license/cybersader/Crosswalker?style=flat-square" alt="License" /></a>
  <a href="https://cybersader.github.io/crosswalker/"><img src="https://img.shields.io/badge/docs-live-00d4aa?style=flat-square" alt="Docs" /></a>
  <a href="https://github.com/cybersader/crosswalker/releases"><img src="https://img.shields.io/github/v/release/cybersader/crosswalker?style=flat-square&include_prereleases&label=version" alt="Version" /></a>
  <a href="https://obsidian.md"><img src="https://img.shields.io/badge/Obsidian-plugin-7c3aed?style=flat-square" alt="Obsidian" /></a>
  <a href="https://cybersader.github.io/crosswalker/agent-context/zz-log/2026-05-04-import-engine-design/"><img src="https://img.shields.io/badge/v0.1-design%20phase%20complete-2563eb?style=flat-square" alt="v0.1 design phase complete" /></a>
</p>

---

Take any structured ontology — a compliance framework, a biology taxonomy, a library classification, any hierarchical or graph-shaped concept set — and land it in [Obsidian](https://obsidian.md) as canonical Markdown with frontmatter, folders, headings, tags, and typed wikilinks. Cross-reference between ontologies, attach evidence, and manage the full ontology lifecycle in plain text.

Compliance frameworks (NIST, MITRE, CIS, ISO) are the primary launch use case — but the architecture is general-domain.

> Crosswalker is a **meta-system for ontology lifecycle management**, not just a framework importer. [Read why.](https://cybersader.github.io/crosswalker/concepts/ontology-evolution/)

## How it works

```
Any structured source              Tier 1 — canonical Obsidian vault
┌──────────────────────┐           ┌────────────────────────────────┐
│ CSV │ XLSX │ JSON    │           │ Ontologies/                    │
│ YAML │ OSCAL │ MCP   │   ─────►  │   NIST 800-53 r5/              │
│ scraped HTML         │ producer  │     AC - Access Control/       │
│ custom Python (etc.) │           │       AC-2.md ← frontmatter    │
└──────────────────────┘           │       AC-2.md ← [[wikilinks]]  │
                                   │       AC-2.md ← tags           │
                                   │   ISO 27002/                   │
                                   │     A.5 - Information Sec/     │
                                   └────────────────────────────────┘
```

**The contract is the schema, not the engine.** Anything that emits valid Tier 1 — the bundled engine, an external Python script, a custom scraper, an MCP server, an AI agent — is a first-class producer.

**1.** Open the import wizard &nbsp;**2.** Map columns to hierarchy / metadata / links / body &nbsp;**3.** Preview &nbsp;**4.** Generate

Each note gets full YAML frontmatter with `_crosswalker` provenance, wikilinks for cross-references, and a folder + tag layout matching your data's hierarchy.

## The design

Crosswalker's architecture committed to four pieces during the design phase ending 2026-05-04:

1. **The Tier 1 schema** is the load-bearing primitive. Machine-readable JSON Schema. Anyone or anything that emits conforming output is a producer.
2. **A bundled TypeScript engine** ships in-plugin (mobile-portable, no install friction, ~480 KB) for the common case — tree-shaped sources land cleanly without leaving Obsidian.
3. **External producers are first-class** — when the bundled engine isn't enough (messy XLSX, scraping, AI extraction), users emit Tier 1 from any toolchain that can write Markdown + frontmatter.
4. **A community marketplace** of pre-transformed Tier 1 bundles closes the loop — one user transforms NIST 800-53 once; everyone else clones.

Underneath that, Crosswalker provides four orthogonal **vault hierarchy primitives** (folder / heading / tag / wikilink-graph) that recipes compose, so the same source can land as a deep folder tree, a flat tag-indexed pile, a wikilink graph, or any composition.

📚 **For the full architecture story, read:**
- [ETL and import](https://cybersader.github.io/crosswalker/concepts/etl-and-import/) — schema as primitive, the four pieces, five-axis recipe selection, ~40-primitive transformation catalog, YARRRML explained simply
- [Hierarchy primitives](https://cybersader.github.io/crosswalker/concepts/hierarchy-primitives/) — folder, heading, tag, wikilink-graph and how recipes compose them
- [What makes Crosswalker unique](https://cybersader.github.io/crosswalker/concepts/what-makes-crosswalker-unique/) — Spec / Library / Integrations three-layer commitment
- [Agent tooling](https://cybersader.github.io/crosswalker/agent-context/agent-tooling/) — progressive-disclosure space for AI agents helping users transform data into Tier 1
- [2026-05-04 design phase log](https://cybersader.github.io/crosswalker/agent-context/zz-log/2026-05-04-import-engine-design/) — canonical state of all architectural commitments

## Status

**v0.1 design phase: complete.** Architecture is committed; implementation work begins from this commit forward. The KB documents every settled decision, every open question, and every research deliverable that fed in. v0.1 ships:

1. The Tier 1 target schema as machine-readable JSON Schema
2. The bundled reference TypeScript engine (handles tree-shaped sources cleanly)
3. A starter recipe library for canonical sources
4. A schema validator (any external producer's output can be validated against the spec)

## Features

| | Feature | Details |
|---|---|---|
| :zap: | **Import wizard** | 4-step modal: select file, configure columns, preview tree, generate |
| :bar_chart: | **Smart parsing** | CSV streaming (PapaParse) for files over 5 MB, column type auto-detection |
| :file_folder: | **Four hierarchy primitives** | Compose folder + heading + tag + wikilink-graph layouts. Same source can land as different vault shapes |
| :link: | **Typed links** | WikiLinks and Markdown links with edge metadata for crosswalks (STRM predicate vocabulary, SSSOM envelope, junction notes for evidence) |
| :gear: | **Config system** | Save, load, and auto-match configurations via fingerprinting |
| :mag: | **Queryable output** | Works with [Obsidian Bases](https://cybersader.github.io/crosswalker/concepts/metadata-ecosystem/) or plain search — plain-text frontmatter means no lock-in |
| :test_tube: | **Debug logging** | Toggle logging to a vault file for troubleshooting |

## Quick start

### Install (manual — community plugins coming soon)

1. Download `main.js`, `manifest.json`, and `styles.css` from the [latest release](https://github.com/cybersader/crosswalker/releases)
2. Create `your-vault/.obsidian/plugins/crosswalker/`
3. Copy the three files in
4. Enable in **Settings > Community plugins**

### Import a structured ontology

1. `Ctrl/Cmd + P` > **Crosswalker: Import structured data**
2. Select your CSV (or XLSX — coming in v0.2)
3. Map columns: hierarchy levels, frontmatter properties, links, body
4. Preview the folder tree and sample notes
5. Generate

### What you get (compliance example)

A note like `AC-2.md`:

```yaml
---
control_id: AC-2
control_name: Account Management
control_family: Access Control
related_controls:
  - "[[AC-3]]"
  - "[[AC-5]]"
tags:
  - framework/nist-800-53-r5/ac-access-control
  - cross-cutting/identity-management
_crosswalker:
  source_file: nist-800-53.csv
  import_date: 2026-05-04
  config_id: abc123
---
```

### What you get (general-domain example)

The same architecture applied to a biology taxonomy concept:

```yaml
---
taxon_id: NCBI:9606
taxon_name: Homo sapiens
rank: species
parent: "[[Homininae]]"
tags:
  - taxonomy/ncbi/eukaryota/animalia/chordata/mammalia/primates
_crosswalker:
  source_file: ncbi-taxonomy.json
  import_date: 2026-05-04
  config_id: ncbi42
---
```

The frontmatter shape, the wikilinks, the tags, the provenance — all the same machinery, no compliance-specific assumptions.

All configuration (output path, key naming, array handling, link syntax, matching sensitivity) lives in **Settings > Crosswalker**.

## Roadmap

Architecture decisions come first; features build on that foundation. Full roadmap with linked rationale: **[docs/roadmap](https://cybersader.github.io/crosswalker/reference/roadmap/)**

| Phase | Focus | Status |
|---|---|---|
| **v0.1 design** | Schema-as-primitive reframe, hierarchy primitives, ETL/import architecture, ~40-primitive transform catalog, runtime-agnostic recipe schema | ✅ Complete ([2026-05-04 design log](https://cybersader.github.io/crosswalker/agent-context/zz-log/2026-05-04-import-engine-design/)) |
| **v0.1 implementation** | Tier 1 JSON Schema, bundled TS reference engine, recipe schema, starter recipe library, schema validator | 🚧 In progress |
| **v0.2** | XLSX support (SheetJS tree-shaken), JSON parser, additional starter recipes | Planned |
| **v0.5** | Path C — opt-in external Python producer (Polars + DuckDB + openpyxl); JSON-lines streaming protocol; desktop-only by design | Planned |
| **v1.0** | Marketplace registry, OSCAL export, cross-framework crosswalk dashboards, ontology evolution patterns | Planned |

## External producer example

The original Python CLI (`frameworks_to_obsidian.py`) is the **first reference example** of an external producer — purpose-built batch import for cybersecurity frameworks (NIST 800-53, CSF v2, CIS v8, MITRE ATT&CK/D3FEND/ENGAGE, CRI Profile) with crosswalk linking. It emits Tier 1 directly without going through the plugin.

```bash
pip install -r requirements.txt
python frameworks_to_obsidian.py
```

This is exactly the pattern v0.5 generalizes: any toolchain that can produce Tier 1 is welcome. The plugin is the convenient default; the schema is the contract.

## Documentation

**https://cybersader.github.io/crosswalker/** — 100+ pages covering concepts, architecture, the ontology evolution problem, an entity registry, research challenges, decision logs, and the full design-phase reasoning.

Found an error? Click **Edit page** on any docs page, or see the [contributing guide](https://cybersader.github.io/crosswalker/development/contributing/).

```bash
# Run docs locally
cd docs && bun install && bun run dev
```

## Development

From the repo root, use the **local dev orchestrator** — an interactive menu wrapping every workflow (docs dev, plugin watch, Tailscale/Cloudflare sharing, Playwright tests):

```bash
bun install              # Install plugin dependencies
bun run serve            # Interactive menu (docs dev, plugin watch, etc.)
bun run serve:docs       # Docs dev server on :4321
bun run serve:plugin     # Plugin watch build → test-vault
bun run serve:both       # Both in parallel
```

Or raw commands:

```bash
bun run dev              # Plugin watch mode (outputs to test-vault)
bun run build            # Plugin production build (type-check + bundle)
bun run test             # Plugin unit tests
bun run lint             # Plugin lint (required for community plugin submission)

cd docs && bun run test:local   # Docs Playwright E2E tests
```

See [CONTRIBUTING.md](CONTRIBUTING.md) for conventions (including the MDX inline-SVG kebab-case gotcha) and the [docs contributing page](https://cybersader.github.io/crosswalker/development/contributing/) for the log / challenge / roadmap / decision lifecycle that new research follows.

## License

MIT — see [LICENSE](LICENSE) for details.
