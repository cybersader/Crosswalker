# Source-expression conformance suite

**This file is the contract. The runners are implementations.**

`source-expressions.json` pins the exact behaviour of the expression subset used at
Crosswalker's source-shaping declaration sites (today `source.where`; `source.joins`
key expressions when they land). It exists because [architectural commitment
5](https://cybersader.github.io/crosswalker/agent-context/zz-log/2026-05-04-bundle-engine-language-synthesis/#4-the-most-important-commitment-runtime-agnostic-recipe-schema)
says the recipe schema is runtime-agnostic: anyone emitting valid Tier 1 is a
first-class producer, and a producer written in Python must be able to evaluate the
same predicate and get the same answer, row for row.

A prose spec cannot carry that guarantee. A data file both runtimes execute can.

## Format

```jsonc
{
  "inputs": { "<name>": { /* one source row */ } },
  "cases": [
    { "id": "...", "expression": "...", "input": "<name>", "expect": { "kind": "..." } }
  ]
}
```

`expect.kind` is one of:

| kind | meaning | who decides |
|---|---|---|
| `value` | evaluates to exactly `expect.value` | the ENGINE |
| `undefined` | evaluates to nothing | the ENGINE |
| `parse_error` | does not parse; `expect.code` names the engine error code where one is pinned | the ENGINE |
| `eval_error` | parses, throws at evaluation | the ENGINE |
| `rejected_by_subset` | parses fine, but the permitted subset refuses it before any evaluation | SITE POLICY |

The split matters. The first four describe what JSONata itself does and must hold in
any port. The last describes what Crosswalker *allows*, and a port must refuse the same
constructs for the same reason: an expression a Python producer can evaluate but the
plugin rejects (or the reverse) is a silent divergence in which notes get written.

## The single most valuable case

`missing-name-compares-false`. A typo'd column name in `Typo != ''` does **not** yield
`undefined` — JSONata's comparison operators absorb an undefined operand and return a
perfectly good boolean `false`, for every row. A predicate that returns `false` for
every row admits nothing, writes nothing, and reports nothing.

That measured fact is why the loudness contract is implemented with three guards
(strict-boolean result, reference preflight against the collection's key universe,
zero-admitted-rows error) rather than the single return-type check the Ch 46 verdict
assumed would suffice.

**If a port returns `undefined` for that case instead, its silence behaviour differs
and the reference-preflight design must be re-derived for it before it is trusted to
run a recipe.**

## Running it

- TypeScript / bundled engine: `bun run test` (see `tests/source-expression-conformance.test.ts`)
- Any other runtime: read the JSON, evaluate each case, compare. There is deliberately
  no TypeScript, no test-framework matcher, and no import in the data file.

## Adding a case

Add one whenever you add a permitted construct, reject a new one, or discover a
cross-runtime disagreement. Coverage floor (contract §10 D4): at least one case per
permitted construct, and one `rejected_by_subset` case per named rejection.
