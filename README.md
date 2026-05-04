<p align="center">
  <img src="docs/public/logo.png" alt="Crosswalker" width="200" />
</p>

<h1 align="center">Crosswalker</h1>

<p align="center">
  <strong>Turn your Obsidian vault into an operational GRC knowledge graph.</strong>
</p>

<p align="center">
  <a href="https://github.com/cybersader/crosswalker/blob/main/LICENSE"><img src="https://img.shields.io/github/license/cybersader/Crosswalker?style=flat-square" alt="License" /></a>
  <a href="https://cybersader.github.io/crosswalker/"><img src="https://img.shields.io/badge/docs-live-00d4aa?style=flat-square" alt="Docs" /></a>
  <a href="https://github.com/cybersader/crosswalker/releases"><img src="https://img.shields.io/github/v/release/cybersader/crosswalker?style=flat-square&include_prereleases&label=version" alt="Version" /></a>
  <a href="https://obsidian.md"><img src="https://img.shields.io/badge/Obsidian-plugin-7c3aed?style=flat-square" alt="Obsidian" /></a>
</p>

---

Import structured ontologies — compliance frameworks, taxonomies, any hierarchical data — into [Obsidian](https://obsidian.md) with folder hierarchies, typed links, and queryable metadata. Link evidence to controls, crosswalk between frameworks, and manage the full ontology lifecycle in plain markdown.

> Crosswalker is a **meta-system for ontology lifecycle management**, not just a framework importer. [Read why.](https://cybersader.github.io/crosswalker/concepts/ontology-evolution/)

## How it works

```
Spreadsheet (CSV/XLSX)          Your Obsidian Vault
┌──────────────────────┐        ┌──────────────────────────────┐
│ Family │ ID   │ Name │   CW   │ Ontologies/                  │
│ AC     │ AC-1 │ ...  │ ─────► │   NIST-800-53/               │
│ AC     │ AC-2 │ ...  │        │     Access Control/           │
│ AU     │ AU-1 │ ...  │        │       AC-1.md  ← frontmatter │
└──────────────────────┘        │       AC-2.md  ← [[links]]   │
                                │     Audit/                    │
                                │       AU-1.md                 │
                                └──────────────────────────────┘
```

**1.** Open the import wizard &nbsp;**2.** Map columns to hierarchy, metadata, and links &nbsp;**3.** Preview &nbsp;**4.** Generate

Each note gets full YAML frontmatter with `_crosswalker` provenance metadata, WikiLinks for cross-references, and a folder tree matching your data's hierarchy. Recipes can mix folders, headings, tags, and wikilinks however you want, so the same framework can land as a deep folder tree, a single document with nested headings, or any combination.

## Features

| | Feature | Details |
|---|---|---|
| :zap: | **Import wizard** | 4-step modal: select file, configure columns, preview tree, generate |
| :bar_chart: | **Smart parsing** | CSV streaming (PapaParse) for files over 5 MB, column type auto-detection |
| :file_folder: | **Flexible layouts** | Compose folders, headings, tags, and wikilinks in one recipe — the same source can produce a deep folder tree, a flat tag-indexed pile, or a hybrid |
| :link: | **Typed links** | WikiLinks with metadata for crosswalk relationships and evidence links — capture not just "AC-2 maps to ISO A.9.2.1" but how, by whom, and how complete |
| :gear: | **Config system** | Save, load, and auto-match configurations via fingerprinting |
| :mag: | **Queryable output** | Works with [Obsidian Bases](https://cybersader.github.io/crosswalker/concepts/metadata-ecosystem/) or plain search — plain-text frontmatter means no lock-in |
| :test_tube: | **Debug logging** | Toggle logging to a vault file for troubleshooting |

## Quick start

### Install (manual — community plugins coming soon)

1. Download `main.js`, `manifest.json`, and `styles.css` from the [latest release](https://github.com/cybersader/crosswalker/releases)
2. Create `your-vault/.obsidian/plugins/crosswalker/`
3. Copy the three files in
4. Enable in **Settings > Community plugins**

### Import a framework

1. `Ctrl/Cmd + P` > **Crosswalker: Import structured data**
2. Select your CSV (XLSX support coming in v0.2)
3. Map columns: hierarchy levels, frontmatter properties, links, body
4. Preview the folder tree and sample notes
5. Generate

### What you get

A note like `AC-2.md`:

```yaml
---
control_id: AC-2
control_name: Account Management
control_family: Access Control
related_controls:
  - "[[AC-2]]"
  - "[[AC-3]]"
_crosswalker:
  source_file: nist-800-53.csv
  import_date: 2026-04-02
  config_id: abc123
---
```

All configuration (output path, key naming, array handling, link syntax, matching sensitivity) lives in **Settings > Crosswalker**.

## Roadmap

Architecture decisions come first, features are built on that foundation. Full roadmap with linked rationale: **[docs/roadmap](https://cybersader.github.io/crosswalker/reference/roadmap/)**

| Phase | Focus | Status |
|---|---|---|
| **v0.1** | Import wizard, config system, generation engine, fast embedded-SQLite query cache, docs site | 🚧 In progress |
| **v0.2** | XLSX and JSON parsers, additional starter recipes, tag-based and wikilink-based layouts | Planned |
| **v0.5** | Optional external Python helper for messy spreadsheets and large datasets (desktop only) | Planned |
| **v1.0** | Shareable framework registry, OSCAL export, crosswalk dashboards, framework version tracking | Planned |

## Python tool

The original Python CLI (`frameworks_to_obsidian.py`) is also included for batch-importing cybersecurity frameworks (NIST 800-53, CSF v2, CIS v8, MITRE ATT&CK/D3FEND/ENGAGE, CRI Profile) with crosswalk linking.

```bash
pip install -r requirements.txt
python frameworks_to_obsidian.py
```

## Documentation

**https://cybersader.github.io/crosswalker/** — 100+ pages covering concepts, architecture, the ontology evolution problem, an entity registry, and development logs.

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
