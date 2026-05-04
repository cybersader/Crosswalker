# Transformation primitives — schemas

One JSON Schema per transformation primitive (signature, examples, gotchas). The bundled engine implements these; external producers can validate their own pipelines against the same schemas to ensure recipe portability.

## Status

**Stub.** Population begins as the bundled engine implementation lands. The full primitive catalog (~40 primitives across 9 categories) is enumerated in [ETL and import § the ~40-primitive transformation catalog](https://cybersader.github.io/crosswalker/concepts/etl-and-import/#the-40-primitive-transformation-catalog).

## Categories (planned)

| Category | Examples |
|---|---|
| Source iteration | `iterate-rows`, `iterate-records`, `iterate-tree-nodes` |
| Identity / ID synthesis | `curie-from-pattern`, `sha256-cid`, `slugify` |
| Field projection | `project`, `rename`, `coerce-type`, `parse-date` |
| String transforms | `trim`, `regex-extract`, `regex-replace` |
| Tree-from-flat | `parent-id-to-tree`, `dotted-id-to-tree`, `prefix-to-tree` |
| Joins / lookups | `inner-join`, `left-join`, `lookup-table`, `fuzzy-match` |
| Address rendering | `folder-path`, `heading-anchor`, `tag-path`, `wikilink-target` |
| Validation / guard | `require-field`, `allowed-values`, `schema-validate` |
| Provenance | `record-source-ref`, `record-version`, `record-hash` |

## Conventions (planned)

Each primitive will get its own schema file (e.g., `iterate-rows.schema.json`) with:

- `$id` matching `https://crosswalker.dev/spec/primitives/<name>.schema.json`
- Input/output type signatures
- `examples` block with valid invocations
- Cross-link to the engine implementation

See [ETL and import](https://cybersader.github.io/crosswalker/concepts/etl-and-import/) and the [2026-05-04 import-engine design log](https://cybersader.github.io/crosswalker/agent-context/zz-log/2026-05-04-import-engine-design/) for the architectural framing.
