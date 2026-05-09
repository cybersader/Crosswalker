# v0.1.6 reference recipes — `query:` block examples

Five reference recipes, one per v0.1 view shape ([Ch 30 catalog](https://cybersader.github.io/crosswalker/agent-context/zz-research/2026-05-09-challenge-30-view-shape-taxonomy/)). Each recipe is a complete, schema-conformant Crosswalker recipe with both an emission `target.layout` AND an additive `query:` block ([Ch 31 schema design](https://cybersader.github.io/crosswalker/agent-context/zz-research/2026-05-08-challenge-31-deliverable-a-shape-dispatched-data-only/)).

## Inventory

| Recipe | Shape | Renderer | Status |
|---|---|---|---|
| `coverage-matrix.json` | `pivot` | `crosswalkerPivot` (custom Bases view) | v0.1.6 — first-class. Launch-market Coverage Matrix. |
| `crosswalk-density.json` | `table` | Bases-native Table view | v0.1.6 — first-class. |
| `orphan-controls.json` | `list` | Bases-native List view | v0.1.6 — first-class. Demonstrates anti-join. |
| `hierarchy-view.json` | `hierarchy` | `crosswalkerHierarchy` (custom view) | v0.1.7-v0.1.8 — schema declared in v0.1.6; renderer ships later. |
| `list-view.json` | `list` | Bases-native List view | v0.1.6 — first-class. |

## Cards / Graph / Timeline

The Cards shape is rendered Bases-natively from any `table` or `list` query (per Ch 30); no separate Crosswalker recipe needed. Graph (`crosswalkerGraph`, v0.2) and Timeline (v0.2+) are schema-declared in `spec/recipe.schema.json` `$defs.GraphPrimitives` / `TimelinePrimitives` but no reference recipes ship in v0.1.6 — author when the renderers ship.

## Recipe schema styles A vs B

Both recipes validate identically under either discriminator style (per [Ch 31 deliverables A + B](https://cybersader.github.io/crosswalker/agent-context/zz-research/2026-05-09-challenge-29-ontology-web-query-verbs-validation/)). Toggle in plugin settings → "Recipe schema → Recipe query block schema style". Default is A (`oneOf`+`const`); B (`if`/`then`/`else`) is the advanced opt-in. Differences are error-message focus + IDE autocomplete behavior, not validity verdicts.

## Authoring conventions

- The 8 query verbs ([Ch 29 Settled #14](https://cybersader.github.io/crosswalker/agent-context/zz-research/2026-05-09-challenge-29-ontology-web-query-verbs-validation/)) are the only Layer A primitives. `closure` is parameterized into `traverse(depth=*, transitive=true)`. `pivot` is a Layer B view shape, not a Layer A verb.
- JSONata is the only allowed string-expression language inside the `query:` block ([Ch 36](https://cybersader.github.io/crosswalker/agent-context/zz-research/2026-05-09-challenge-36-query-language-rerun/)). All filter strings are JSONata.
- The recipe `query.shape` field selects which renderer the embedded `\`\`\`base` block targets. v0.1.6 ships `pivot` as the only custom Crosswalker view; `table`/`list`/`cards` are Bases-native; `hierarchy`/`graph`/`timeline` are schema-declared but render-deferred.
