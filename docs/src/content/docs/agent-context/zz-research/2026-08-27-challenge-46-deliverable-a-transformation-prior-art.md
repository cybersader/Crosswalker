---
title: "Ch 46 deliverable A: Transformation language prior art"
description: "Pre-read research deliverable A for Challenge 46. Surveys JSONata, jq, RML/YARRRML, Morph-KGC, SPARQL-Generate, dbt, and JMESPath against five measured transformation gaps, mobile embedding cost, runtime portability, and analyst learnability. Shortlists narrow JSONata adoption, jq-WASM, and a staged producer-side model for the architect's framing decision. Includes the original recovery note because this deliverable was reconstructed from the surveying agent's final message."
tags: [research, deliverable, transform-engine, transformation-language, jsonata, jq, rml, dbt, ch-46, deliverable-a]
date: 2026-08-27
sidebar:
  label: "Ch 46a · Transformation prior art"
  order: -20260827.1
---

# Ch 46 pre-read — transformation language prior art (2026-08-27)

Produced as a pre-read for the Ch 46 architect window. **Recovery note:** the surveying agent returned this content in its final message but never wrote the file; reconstructed verbatim from that message by the orchestrator the same day. Treat the tables as the agent's findings, not the orchestrator's.

## Language × the five measured gaps

Legend: **✓** direct/clean · **△** possible but awkward, extension-dependent, or mismatched · **✗** absent

| Candidate | Literal key containing `.` | Per-item transform inside one value | Substring extraction | Row subset | Join two row collections |
|---|---|---|---|---|---|
| **JSONata 2.2.x** | ✓ `` `a.b` `` or `$lookup($, "a.b")` | ✓ `$map`, `$filter`, `$split` | ✓ `$substringAfter`, `$match`, `$replace` | ✓ `$[predicate]` or `$filter` | △ Variables plus `$$`; indexed join via `$merge`/lookup, but no dedicated join operator |
| **jq 1.8** | ✓ `.["a.b"]` | ✓ `map(...)` | ✓ slices, `split`, `capture`, `sub` | ✓ `map(select(...))` | ✓ Native `INDEX` and `JOIN` |
| **RML / YARRRML** | ✓ CSV references are column names; JSONPath can use bracket notation | △ Nested arrays fit iterators; delimited cell values need FNML functions with weak cross-engine cardinality portability | △ FNML/GREL functions, processor-dependent | △ Conditional subject maps or source-query extensions | ✓ Referencing object maps and join conditions, but primarily for linking RDF entities rather than producing enriched rows |
| **Morph-KGC** | ✓ SQL/JSON quoting | ✓ DuckDB list/JSON operations or FNML | ✓ DuckDB SQL or FNML | ✓ RML View `WHERE` | ✓ DuckDB complex joins/RML joins |
| **SPARQL-Generate** | ✓ Underlying JSONPath/CSV accessor | ✓ Nested `ITERATOR` functions | ✓ SPARQL `SUBSTR`, `STRAFTER`, regex | ✓ `FILTER` | △ Multiple sources correlate, but examples recommend staged RDF materialization for performance |
| **dbt / SQL models** | ✓ Quoted identifiers | △ Clean for database arrays/JSON only; dialect-dependent | ✓ SQL string functions | ✓ `WHERE` | ✓ SQL joins |
| **JMESPath** | ✓ Quoted identifiers | ✓ Projections and `map` | ✗ No substring, split, or regex primitives | ✓ `[?predicate]` | ✗ No cross-collection join or root lookup inside projections |

## Binding constraints

| Candidate | Credible runtimes | Embedded/mobile cost | GRC-analyst learnability | What it gets right about shapes |
|---|---|---|---|---|
| **JSONata** | Reference JavaScript plus current C++, Go, Java, .NET, and Python ports; conformance still needs Crosswalker-owned fixtures | **79,757 B minified / ~24 KB gzip** for 2.2.2; pure JS and mobile-friendly | Medium. Concise paths resemble spreadsheet formulas, but sequence flattening, singleton equivalence, silent missing paths, lambdas, and joins are non-obvious | Treats paths as sequence pipelines: nested collections, predicates, construction, and scalar functions belong to one expression model |
| **jq** | Reference C, Go `gojq`, Rust `jaq`, Python/native bindings, WebAssembly; implementations intentionally diverge at edges | `jq-wasm`: **928,824 B WASM + ~130 KB glue**; npm package ~4.08 MB unpacked. Mobile-capable but materially heavier, and adds WASM asset/loading complexity | Medium-hard. Excellent compact vocabulary, but streams, cardinality, variables, and pipeline precedence are programmer-oriented | Best vocabulary for all five gaps, especially explicit `INDEX`/`JOIN` and predictable `map(select(...))` composition |
| **RML/YARRRML** | Multiple Java, JavaScript, Python processors; core mappings portable, functions substantially less so | No small conformant browser runtime identified. RocketRML is Node-first; RMLMapper is JVM | Hard. YAML surface helps, but triples maps, term maps, function IRIs, and RDF terminology remain specialist concepts | Correctly separates source access, iterator scope, reference formulation, and cross-source identity joins. Nested versus tabular is explicit rather than inferred |
| **Morph-KGC** | Python only as an engine; mappings are RML/YARRRML | Not viable inside Capacitor: Python plus pandas/DuckDB and optional native dependencies | Hard for direct recipe authors; reasonable as an external producer maintained by engineers or agents | Shows a practical hybrid: declarative RML envelope, then SQL views for filtering, complex joins, mixed content, and shape normalization |
| **SPARQL-Generate** | Apache Jena/JVM implementation | Not mobile-viable; multi-module JVM stack | Very hard unless the author already knows SPARQL | Makes source iteration first-class and distinguishes scalar binding functions from multi-result iterator functions |
| **dbt** | SQL across warehouse adapters; runtime not embeddable in Obsidian | Not an embedded/mobile engine | Medium for SQL-literate analysts, otherwise hard | Strongest precedent for **where transformation belongs**: source-preserving staging, then explicit intermediate models for joins, fan-out, aggregation, pivoting, grain changes |
| **JMESPath** | Broad, mature multi-runtime family | Small pure-JS implementations; excellent mobile fit | Medium-low | Demonstrates the ceiling of a deliberately limited query language: excellent projection/filter portability, but failure on substring and joins would recreate Crosswalker's current problem |

## Shortlist put to the architect

| Option | Strongest argument | Strongest objection |
|---|---|---|
| **1. Embed JSONata as the transform expression language** | Cheapest coherent answer. Already the schema's declared expression language, ~24 KB gzip, runs on mobile, credible non-JS ports, expresses all five gaps without adding a Crosswalker language. | Cross-runtime parity is not automatic; joins are idiomatic rather than first-class and can become quadratic; silent-missing and sequence-flattening semantics are dangerous for imports. User-authored expressions need 2.2.1+ security fixes, resource guardrails, and conformance fixtures. |
| **2. Adopt jq semantics, embed `jq-wasm`** | Cleanest five-gap vocabulary including genuine `INDEX`/`JOIN`; mature implementations beyond C. Strongest if expressiveness outweighs bundle cost. | ~1.06 MB WASM plus glue, separate asset loading, mobile memory overhead, implementation divergence. Duplicates the already-declared JSONata slot; least approachable for GRC analysts. |
| **3. Decline a general embedded language; adopt RML/dbt's staged model** | Preserves a small mobile engine: explicit source iteration plus a separate transform stage, complex joins delegated to an external producer. RML supplies semantics; dbt supplies the stage boundary. | A structured Crosswalker transform block risks becoming the "fourth language" Ch 36 rejected. Leaves spreadsheet-only mobile users unable to perform the hardest joins unless the engine later grows equivalent capability. |

## Sources

JSONata: [paths and predicates](https://docs.jsonata.org/simple) · [higher-order functions](https://docs.jsonata.org/higher-order-functions) · [string functions](https://docs.jsonata.org/string-functions) · [programming](https://docs.jsonata.org/programming) · [implementations](https://github.com/jsonata-js/jsonata/blob/master/docs/overview.md) · [releases and security fixes](https://github.com/jsonata-js/jsonata/releases)

jq: [1.8 manual](https://jqlang.org/manual/) · [`jq-wasm`](https://github.com/owenthereal/jq-wasm) · [`gojq` compatibility](https://github.com/itchyny/gojq) · [`jaq`](https://github.com/01mf02/jaq)

RML family: [RML spec](https://rml.io/specs/rml/) · [YARRRML spec](https://rml.io/yarrrml/spec/) · [RML-FNML draft](https://kg-construct.github.io/rml-fnml/spec/docs/) · [RML Logical Views draft](https://kg-construct.github.io/rml-lv/spec/docs/) · [Morph-KGC](https://morph-kgc.readthedocs.io/en/latest/documentation/) · [SPARQL-Generate](https://ci.mines-stetienne.fr/sparql-generate/)

Other: [dbt SQL models](https://docs.getdbt.com/docs/build/sql-models) · [dbt staging](https://docs.getdbt.com/best-practices/how-we-structure/2-staging) · [dbt intermediate models](https://docs.getdbt.com/best-practices/how-we-structure/3-intermediate) · [JMESPath spec](https://jmespath.org/specification.html)
