# tools/ — dev / test infrastructure

Scripts and utilities used during development and testing. **Not shipped** with the plugin (the release bundle is just `main.js` + `manifest.json` + `styles.css`); these live in the repo to keep the development workflow reproducible.

## Contents

| Path | Purpose |
|---|---|
| `generate-fixtures.ts` | CLI: produce Tier 1 markdown fixtures from a CSV source. Bootstraps test data into `test-vault/` so the plugin has something to work against during dev |
| `fixtures/synthetic/` | Small hand-authored sample CSVs (NIST-like, ISO-like). Deterministic; committed |
| `fixtures/seeds/` | (Future) Deterministic seeds for parameterized generation (perf-test scenarios with N synthetic concepts) |

## Usage

```bash
# Generate fixtures from a sample CSV into test-vault
bun run fixtures

# Or with explicit args
bun tools/generate-fixtures.ts \
  --source tools/fixtures/synthetic/nist-mini.csv \
  --target test-vault/Frameworks/NIST-mini \
  --ontology nist-mini \
  --clean
```

## Why this exists

Crosswalker testing needs reproducible Tier 1 vaults to exercise the import + crosswalk + render flow. Three options were on the table:

1. **Commit pre-generated markdown fixtures** — fragile when the schema evolves
2. **Write a fixtures-generating Obsidian plugin** — over-engineered; test infra shouldn't itself need to be a plugin
3. **TS generator script in `tools/`** ← *what this is*

Option 3 keeps fixtures deterministic (committed CSV → committed expected markdown via a versioned script), reproducible (regenerate any time), and easy to extend.

## Future shape

Once the marketplace pattern lands, this script gains a `--from-bundle <id>` mode that pulls a published Tier 1 bundle and drops it into the target vault. That makes marketplace bundles a real fixture source — your tests run against the same bytes a user would download.

See [ETL and import § the community marketplace](https://cybersader.github.io/crosswalker/concepts/etl-and-import/#4-the-community-marketplace-transform-once-share-forever) for the marketplace pattern.

## Why not a plugin

A fixtures-generating *plugin* would only be justified if fixtures must be generated *inside* a running Obsidian — e.g., to test "user clicks button → fixture appears in current vault." Crosswalker's testing doesn't need that. CSV-in / Markdown-out works fine outside Obsidian; the plugin reads the result the same way it would read any imported framework.
