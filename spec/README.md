# Crosswalker spec — machine-readable Schema Contracts

This directory holds Crosswalker's **governing machine-readable Schema Contracts**. The plugin is one implementation. Any producer or editor that conforms to the applicable contract can participate without adopting the bundled engine.

## Governing contracts

| File | Governs | Artifact/representation role | Audience |
|---|---|---|---|
| `tier1.schema.json` | Valid Tier 1 record representations | The canonical Crosswalker-managed Markdown representation of concepts and assertions from one or more Knowledge Sets | External producers; validators; plugin generation/projector code |
| `recipe.schema.json` | Valid ImportRecipe specifications | An intensional Recipe subtype declaring deterministic source-to-Tier-1 behavior | Recipe authors; workbench/editor code; bundled or external engines |
| `primitives/` (TODO) | Reusable transformation primitive shapes | Potential shared vocabulary for engine implementations; not a new root artifact family | Engine implementers; Recipe validators |

## Contract and artifact boundaries

```text
Recipe Schema Contract ──governs──► ImportRecipe
                                         │
structured source ────────────────────────┤ render / generate
                                         ▼
Tier 1 Schema Contract ──governs──► Tier 1 member records
                                      representing Knowledge Sets
                                         │
                                         ▼ qualified Tier 1 → Tier 2 projection
                                      derived SQLite cache
```

| Boundary | Rule |
|---|---|
| **Schema Contract** | Governs what representations are valid. It is not domain knowledge. |
| **Knowledge Set** | Extensional conceptual family: what concepts or assertions exist. `MappingSet` is a subtype; `MappingAssertion` is a member. No generalized `KnowledgeSet` schema or file format is claimed here. |
| **Recipe** | Intensional specification family: what should be done. `ImportRecipe` is the concrete v0.1 subtype governed by `recipe.schema.json`. |
| **Tier 1** | Canonical representation/authority tier for Crosswalker-managed local knowledge, not a root artifact class and not the home of ImportRecipe. |
| **Tier 2** | Deletable, reproducible Tier 1 → Tier 2 projection/cache. Never independently authoritative. |
| **Execution Record / Package Manifest** | Later separate administrative envelopes. Neither contract is defined in this directory yet. |

Implementation-only objects such as `ImportMapping`, `RecipeDocument`, `SavedConfig`, `ParsedData`, `ConceptIdentity`, `Address`, `GeneratedNote`, and render/generation diagnostics do not become governing domain artifacts merely because runtime code uses or persists them.

## Representation and carrier rules

- JSON, YAML, Markdown, TSV, OSCAL JSON, and SQLite are **serializations or representations**, not semantic artifact classes by themselves.
- A zip, directory, or git repository is a **physical carrier**, not a semantic Package.
- A future Package becomes a governed distribution object only when a Package Manifest resolves selected artifacts, dependencies, integrity, license, and installation meaning.
- Use **projection** only with a qualifier, such as field projection, read/view projection, Tier 1 → Tier 2 projection, or editable UI projection.

## Conventions

- **JSON Schema 2020-12.** Use `$schema`, `$id`, and `$defs`. Prefer `$ref` over inlining for reusable shapes.
- **Stable URIs.** Every `$id` is `https://crosswalker.dev/spec/<name>.json`. These URLs are canonical identifiers used by validation and provenance.
- **Versioning.** Breaking changes bump the major version in the URI. Additive optional fields do not require a URI bump.
- **Examples.** Every Schema Contract includes valid examples.
- **Separate authority.** Recipe validity never substitutes for Tier 1 record validity, and Tier 1 validity never reconstructs or authorizes a Recipe.

## Why these live at the repository root

These files are the governing contracts, not prose about them. External producers, editors, and validators need stable paths and raw-file URLs. The documentation site explains the model; the canonical machine-readable contracts live here.

## Related

- [Artifact roles and authority](https://cybersader.github.io/crosswalker/concepts/artifact-roles-and-authority/) — governing artifact-role and authority model
- [Terminology](https://cybersader.github.io/crosswalker/concepts/terminology/) — Schema Contract, Knowledge Set, Recipe, MappingSet, Tier, projection, package, and carrier definitions
- [v0.1 schema spec](https://cybersader.github.io/crosswalker/agent-context/v0-1-schema-spec/) — human-readable contract and representation reference
- [System architecture](https://cybersader.github.io/crosswalker/concepts/system-architecture/) — artifact roles versus representation tiers and logical layers
- [Ontology lifecycle](https://cybersader.github.io/crosswalker/concepts/ontology-lifecycle/) — Acquire, Shape, Connect, Understand, Share, Maintain
- [ETL and import](https://cybersader.github.io/crosswalker/concepts/etl-and-import/) — schema-as-primitive and Recipe-driven generation
- [Ch 22 synthesis log](https://cybersader.github.io/crosswalker/agent-context/zz-log/2026-05-04-target-structure-synthesis/) — Recipe grammar lineage
- [Ch 23 synthesis log](https://cybersader.github.io/crosswalker/agent-context/zz-log/2026-05-04-bundle-engine-language-synthesis/) — runtime-agnostic Recipe Schema commitment
