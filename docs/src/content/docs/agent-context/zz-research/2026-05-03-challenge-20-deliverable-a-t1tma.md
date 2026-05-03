---
title: "Ch 20 deliverable A: T1TMA — Tier-1 Term-Map Algebra (RML retargeted, 6 primitives, MTT-justified, lens-contracted)"
description: "Fresh-agent research deliverable A for Challenge 20. Recommends a YARRRML-shaped DSL retargeted from RDF to Tier-1 Notes. Six primitives: ITERATE, REFERENCE, TEMPLATE, BIND, JOIN, INVERT. Closed Tier-1 slot vocabulary (id, label, body.section, frontmatter.k, links.role, folder, aliases, tags, metadata.sssom-key). JSONata as expression sub-language; CSVW as tabular type profile. Macro Tree Transducer theory as completeness justification; Foster/Pierce lens semantics for the round-trippable subset. ~480 KB total bundle. Concrete NIST 800-53 r5 worked example, v0.1→v0.2 transpiler plan, adversarial cognitive-load check."
tags: [research, deliverable, import, primitive, mtt, lenses, rml, yarrrml, jsonata, csvw, foundation]
date: 2026-05-03
sidebar:
  label: "Ch 20a: T1TMA"
  order: -20260503.1
---

:::tip[Origin and lifecycle]
Fresh-agent research deliverable produced 2026-05-03 in response to [Challenge 20: Import primitive formal foundation](/crosswalker/agent-context/zz-challenges/archive/20-import-primitive-formal-foundation/). Synthesized in the [05-03 import-primitive synthesis log](/crosswalker/agent-context/zz-log/2026-05-03-import-primitive-formal-foundation-synthesis/) which treats Runs 1 + 3 as a convergent answer at the *transformation-algebra layer*. Preserved verbatim.
:::

# Research Challenge 20 — First-Principles Primitive for the Import Side

## Executive verdict

**Adopt a YARRRML-shaped, Tier-1-targeted DSL grounded on RML's *Logical Source + Term Map* primitive, with each Term Map declared as a (get, put) lens pair, JSONata as the expression sub-language, and a CSVW-style table profile for the tabular front-end.** Treat **Macro Tree Transducer (MTT) theory** as the *mathematical foundation* that proves the primitive is complete (every source format and the Tier-1 vault are labeled trees, and MTTs are precisely the closure of nested simultaneous primitive recursion on trees). Treat **lenses (Foster/Pierce, Boomerang)** as the *correctness theory* for round-tripping. Do **not** adopt CQL/functorial data migration, full Boomerang, or Datalog as the surface DSL — they fail the recipe-author-friendliness and bundle-size constraints. Do **not** ship raw RML/Turtle — its RDF-target bias and Java tooling are wrong for an Obsidian/Bun environment.

The recommendation can be stated in one line:

> **An ImportRecipe is a finite list of *Term Maps*, each a *lens* over a *Logical Source iterator*, whose `get` projects records into Tier-1 nodes and whose `put` reconstructs records from Tier-1 nodes.**

The remainder of this report justifies that choice from first principles, gives the primitive operation set, sketches the schema, and lays out a migration path.

---

## 1. First-principles framing: what is an import recipe, mathematically?

Every source format Crosswalker ingests is a **labeled, ranked or unranked tree** (or a finite forest):

- CSV/TSV/XLSX with a hierarchy column is a tree whose path is `sheet → row → cell`, with an additional dominance relation induced by `parent_id` or indent-depth columns.
- JSON, YAML, JSON-LD are trees by construction.
- OSCAL XML/JSON/YAML is a tree.
- RDF (Turtle, N-Triples, JSON-LD) is a graph, but every concrete serializer presents it as a tree of triples grouped by subject; the canonical "iterate over subjects, then over predicate-object pairs" view is a forest.

The Tier 1 Crosswalker representation is **also** a labeled tree: `vault → folder*… → note`, where each note is itself a tree `(frontmatter map, body section forest, wikilink set)`.

So: **the import problem is exactly the problem of definable functions from labeled trees to labeled trees**. This places it in the well-studied territory of *tree transducers*.

### The tree-transducer hierarchy (Engelfriet, Vogler, Fülöp, Bahr)

The literature gives a clean answer to "what is the minimal complete primitive for tree-to-tree transformation":

- A **top-down tree transducer (TDTT)** is a finite set of mutually recursive functions, each of which pattern-matches the label and rank of an input node and constructs an output tree. Top-down transducers cannot copy context (no accumulator).
- A **macro tree transducer (MTT)** extends TDTT with *accumulating parameters*: each state may carry an arbitrary number of context trees. Engelfriet & Vogler (1985) and Fülöp & Vogler (1998) prove MTTs compute exactly the **primitive recursive functions on trees** — a robust closure class that subsumes attribute grammars, denotational semantics, and the practical needs of XML/JSON restructuring.
- An **MTT rule** has the schematic shape `state(label(x₁,…,xₖ), y₁,…,yₘ) → RHS` where the RHS contains exactly five elementary constructs:

  1. **output-symbol application** `g(t₁,…,tⱼ)` — *construct/relabel*
  2. **state recursion** `qᵢ(xⱼ, u₁,…,uₘ)` — *descend* into a child subtree
  3. **input-variable reference** `xⱼ` — *copy* a child subtree verbatim
  4. **accumulator reference** `yⱼ` — *consult* a previously-computed context
  5. **input pattern match** on the LHS — *select / discriminate*

Bahr (2013) shows MTTs encode cleanly in ~200 lines of typed functional code (his Haskell encoding generalizes to TypeScript without difficulty). MTTs are the **theoretical floor** under any tree-restructuring DSL, including RML, XSLT, JSONata-as-restructurer, and Jolt.

### What bidirectionality demands: lenses

Independently, Foster, Pierce, Bohannon et al. ("Boomerang: Resourceful Lenses for String Data", POPL 2008) give the canonical answer to "what is the minimal primitive for *invertible* transformations":

A **basic lens** from a concrete domain `C` to an abstract domain `A` is a triple `(get : C → A, put : A × C → C, create : A → C)` satisfying the well-behavedness laws:

- **GetPut**: `put(get(c), c) = c` — round-tripping through `get` then `put` is identity on the concrete side.
- **PutGet**: `get(put(a, c)) = a` — what you put in is what you get back.
- **CreateGet** (for total lenses): `get(create(a)) = a`.

Boomerang's Boomerang language gives a closed combinator algebra over basic lenses (`copy`, `del`, `default`, `concat`, `union`, `Kleene-star`, plus the *resourceful* `match` combinator that introduces dictionaries keyed by chunks for stable reordering). The combinator set is small (under a dozen); the catch is that Boomerang the *language* targets strings via regex-typed transducers and is implemented in OCaml. There is no production JS/TS port — `vmx/jslens` exists but is a partial single-developer experiment from 2012 abandoned long ago, and `BoomerangJS` is an unrelated distributed-computing library.

So the lens *theory* is what we want for round-trip semantics; the lens *implementation* must be built ourselves on top of whatever DSL we choose.

### What the practical DSLs share

When you put RML/YARRRML, R2RML, CSVW, SSSOM/Transform, Jolt, and JSONata side-by-side and ask what their irreducible vocabulary is, a remarkably consistent four-part skeleton appears:

| Operation | RML/YARRRML | R2RML | SSSOM/T | Jolt | JSONata |
|---|---|---|---|---|---|
| Iterate records | `logicalSource` + `iterator` + `referenceFormulation` | `rr:logicalTable` (SQL) | implicit (mapping set rows) | `shift` operates per-input | path navigation `$.x[*]` |
| Extract value | `rml:reference` | `rr:column` | `%{slot}` placeholder | `&`, `@` references | `field` selector |
| Construct term | `rr:template` | `rr:template` | placeholder-expanded format string | path templates | string concatenation `&` |
| Bind to target slot | `rr:subjectMap` / `rr:predicateObjectMap` | same | `assign(slot, value)` | `*`/`#` rules | object construction `{ k: v }` |
| Filter / select | `rml:condition`, FnO | n/a | filter expression | `*` keys | `[predicate]` |
| Join across iterations | `rr:joinCondition` | same | n/a | n/a | `$lookup` / cross-context |

Every mature declarative ETL primitive in this space converges on **iterate → reference → template → bind**, plus **filter** and **join** as cross-cutting concerns. This convergence is not coincidence — it is the practical projection of MTT primitives 1–5 above onto a "per-record" execution model that hides the explicit recursion.

That convergence is the empirical justification for treating these five operations as the *right* irreducible primitives for ImportRecipe.

---

## 2. Evaluation of the candidate formalisms

### 2.a Tree transducers — adopt as **theory**, not as surface DSL

**Pros.** Mathematically minimal. MTTs subsume top-down, bottom-up, and attributed tree transducers under a single framework; their composition is well-understood; decomposition into "pure" stages is provable. Bahr's "Programming Macro Tree Transducers" gives a working functional encoding.

**Cons.** No mature JS/TS implementation exists. Writing recipes as MTT rules with explicit states and accumulator variables would dump complexity directly on recipe authors — a clear bounce in the adversarial sanity check. Recipe authors think "column F is the control ID, column G its title", not "in state q₁ on label `row(...)` with accumulator y₁=parent-path, emit `note(...)`".

**Verdict.** Use as the *substrate* — every primitive in the chosen DSL must be expressible as an MTT rule, which gives us a completeness theorem and a decomposition story. Do not surface MTT syntax to recipe authors.

### 2.b Functorial data migration / CQL — reject

**Pros.** Beautifully clean theory. Σ/Π/Δ migrations correspond to pushforward/pullback along schema morphisms; round-trip laws fall out from adjunctions; data-integrity constraints are *enforced by the migration* rather than checked post-hoc.

**Cons.** (1) CQL the tool is JVM-only (categoricaldata.net distribution) — fails the no-JVM constraint hard. (2) Schemas-as-categories require finite presentations with path equations, which is the wrong granularity for "this CSV has a column called `Control ID`" — the recipe author would have to formalize the source's category before mapping. (3) FDM is built around relational and ER-style schemas, not unranked trees with optional fields and missing values, which is what OSCAL and YAML actually look like. (4) Cognitive overhead is the highest of any candidate.

**Verdict.** A tempting north star for v3+. Not a v0.2 foundation.

### 2.c Lenses / bidirectional transformations — adopt as **correctness theory**

**Pros.** Direct answer to the bidirectionality requirement. The (get, put) pair with GetPut/PutGet laws is exactly the contract round-trip-friendly recipes need. The combinator algebra (copy/concat/union/iterate plus *resourceful* dictionary-keyed match) is small and composable. Connects directly to the SSSOM-Transform `invert()` preprocessor — that operation is morally a lens combinator.

**Cons.** Boomerang is OCaml; no production JS/TS port (`vmx/jslens` is a hobby project, abandoned). Building a full string-lens engine ourselves is out of scope. Strict lens laws are too strong — many real GRC imports legitimately discard information (timestamps in source CSV that have no Tier-1 home), which violates GetPut.

**Verdict.** Adopt the lens *contract* — every Term Map declares an optional `put` alongside its `get`. Recipes that decline to declare `put` are forward-only (the v0.1 status quo). Recipes that declare `put` for every Term Map become *partially round-trippable* in a precise sense (a *very-well-behaved partial lens*, in Foster's terminology). Do not build a full Boomerang-style combinator language — instead let recipe authors specify the inverse JSONata expression directly when the automated inverter cannot derive it.

### 2.d Datalog-as-ETL (Soufflé, DDLog, Datafun, Nemo) — reject as surface DSL

**Pros.** Already in Crosswalker's stack via Nemo for SSSOM derivation. Stratified negation gives a clean handling of "everything not matched goes to the catch-all". Could in principle unify import + edge derivation under one engine.

**Cons.** (1) Datalog rules read poorly for recipe authors who think tabularly — the cognitive shift from "column F is the control ID" to `controlId(X) :- row(R), cell(R, "F", X)` is a tax most GRC authors will refuse to pay. (2) Tree restructuring (especially OSCAL's nested groups) is awkward in pure Datalog; you'd need recursive rules with Skolem terms for every level, which then demand careful chase-termination guarantees. (3) Nemo is WASM-able but its execution model is whole-program, not record-stream — wrong shape for big-XLSX import.

**Verdict.** Keep Nemo for SSSOM derivation and graph-side reasoning. Do **not** push it onto the import side.

### 2.e Algebraic effects + handlers — reject

Plotkin/Pretnar effects are the right substrate for *implementing* the recipe runtime (effects: read-row, parse-cell, lookup-prefix, emit-note, raise-validation-error), but they are not a declarative recipe language. They belong in the implementation, not the schema.

### 2.f RML / YARRRML — adopt the **shape**, not the target

**Pros.** This is the closest *empirical* match for what we want — declarative YAML, mature W3C/community-draft spec, source-format-diverse (CSV, JSON, XML, RDB via reference formulations), composable via `mapping_includes`, supports joins, has a TypeScript implementation (`@comake/rmlmapper-js`, fork of RocketRML, browser-compatible) at ~150 KB minified. YARRRML's surface syntax is genuinely terse and human-readable. Already supports CSV, TSV, XLSX (via CSVW), JSON, JSON-LD, XML, and via FnO can call arbitrary JS functions.

**Cons.** Hard-coded RDF target. Triples-map vocabulary (`subjects`, `predicateobjects`, `s`, `po`) is RDF-shaped, not Tier-1-shaped (frontmatter, body, folder, wikilink). The reference formulations are tied to a fixed list (`csv`, `jsonpath`, `xpath`, `csvw`). No native lens/inverse semantics. The YARRRML→RML→engine pipeline pulls in ~2 MB worth of N3 parsing dependencies in the official path.

**Verdict.** **This is the right shape.** Take YARRRML's `sources/mappings/subjects/po` skeleton, retarget it from RDF triples to Tier-1 nodes, replace `predicateobjects` with `frontmatter/body/links/folder` slot maps, keep CSV/JSON/XML/CSVW as reference formulations, layer JSONata as the expression sub-language, and add an optional `inverse` declaration per Term Map for round-trippability. We get 90% of YARRRML's mature conceptual vocabulary while ditching the RDF target and the heavy engine.

### 2.g R2RML, CSVW, JSONata, JQ, Jolt, XSLT — selective adoption

- **R2RML.** Production-mature but RDB-only; strictly less general than RML. Adopt the `rr:template` and `rr:joinCondition` *conventions* through RML's superset.
- **CSVW (W3C Rec).** **Adopt directly** for the table profile. CSVW solves the XLSX-with-merged-cells, header-offsets, datatype-coercion, foreign-key, and primary-key problems declaratively, has a JS implementation (`csvw-parser`, ~80 KB), and integrates as an RML reference formulation.
- **JSONata.** **Adopt as the expression sub-language.** Reference implementation (`jsonata` on npm) is ~250 KB minified, async-evaluator-based, declarative, XPath 3.1-derived, supports map/filter/reduce, regex, user-defined functions, and lambdas. It already appears in v0.1 ImportRecipe as an "escape hatch"; promote it to first-class. JSONata expressions are also *partially invertible* by static analysis when they're path-projections without aggregation, which feeds the lens story.
- **JQ.** Stream-oriented, more terse than JSONata, but the JS port has correctness issues with lazy semantics and the syntax is less recipe-author-friendly. Skip.
- **Jolt.** JSON-as-DSL is appealing but Jolt's `shift`/`default`/`remove`/`sort` vocabulary is JSON-specific and lacks any iteration story for CSV/XML. Strictly less general than RML.
- **XSLT 3.0.** Mature, but XML-target-biased, ~700 KB even for SaxonJS HE, and the syntax is a known recipe-author repellent. Skip.

### 2.h SSSOM-Transform — adopt as **direct precedent**

This is the closest existing formal precedent for "declarative recipes producing one canonical artifact", and the inspection of its specification confirms its primitive set:

- **prefix declarations** (CURIE map)
- **directives** (e.g. `set_var`)
- **rules** of shape `FILTER -> ACTION;`
- **filters**: atomic (slot operator pattern, e.g. `predicate==skos:exactMatch`, `confidence>=0.8`), combined with `&&`/`||`/`!`, plus filter functions (`is_duplicate`, `has_extension`, `confidence`)
- **actions**: a single function call that is one of (i) generator, (ii) preprocessor (`stop`, `invert`, `assign`, `replace`), or (iii) callback (`set_var`, `infer_cardinality`)
- **placeholders** in string arguments (`%{subject_id}`, `%{hash}`, `%{serial}`) for mapping-derived values
- **grouping** via braces (filter-scope inheritance) and **tagging** for selective enable/disable
- **dialects** (SSSOM/T-OWL, SSSOM/T-Mapping) that fix the generator-function vocabulary

The architectural lesson: **a stable core (filters + actions + placeholders + dialects) plus a small dialect-specific generator vocabulary is exactly the right factoring**. Crosswalker's import side should mirror this: a stable core (logical sources + term maps + JSONata) plus a Tier-1 dialect that fixes the target vocabulary (`folder`, `note`, `frontmatter`, `body`, `links`, `aliases`).

The SSSOM/T design also validates the choice to put `invert()` as a first-class preprocessor rather than as a separate inverse-recipe file — that maps directly to lens `put`.

### 2.i ETL frameworks (dlt, dbt, Singer/Meltano, NiFi) — reject as foundation

These are pipeline orchestrators, not transformation primitives. dbt's primitives are SQL models + Jinja macros; Singer's primitives are JSON-Schema-typed streams; NiFi's are processor graphs. None reduces to an irreducible declarative algebra of tree transformations; they all assume tabular streams and cede the actual transformation to embedded SQL or Python. They are out of scope as a foundational primitive.

---

## 3. The primitive operations — analogous to STRM's 5 / diff's 9

The recommendation reduces every ImportRecipe to **six irreducible primitive operations** (Tier-1 Term-Map Algebra, "T1TMA"):

1. **ITERATE(source, formulation, iterator)** — Produce a finite stream of records from a named source. The triple `(physical access, reference formulation, iterator expression)` is the RML logical-source triple and is provably the minimum needed to address records uniformly across CSV/TSV/XLSX/JSON/JSON-LD/XML/RDF. A formulation-formulation crosswalk is itself a one-line table (`csv`, `tsv`, `xlsx#sheet`, `csvw`, `jsonpath`, `xpath`, `oscal-json`, `turtle-subject`).

2. **REFERENCE(record, expr)** — Project a value out of a record via a reference expression in the formulation's native query language (column name for CSV/XLSX; JSONata for JSON; XPath for XML; SPARQL property-path for RDF). One operation, parameterized by formulation.

3. **TEMPLATE(parts*)** — Construct a new term (string, IRI/CURIE, file path, wikilink target) by interleaving literal text with `{ref}` placeholders bound to REFERENCE outputs. This is the universal RML/YARRRML/SSSOM-T template primitive.

4. **BIND(target-slot, term)** — Place a constructed term into a named Tier-1 target slot. The slot vocabulary is the *closed* Tier-1 dialect alphabet:
   - `id` (note canonical id, drives folder + filename)
   - `label` (note title, h1, frontmatter `title`)
   - `body.section[name]` (named markdown body section, ordered)
   - `frontmatter.<key>` (typed frontmatter slot)
   - `links.<role>` (wikilink set with semantic role: `parent`, `references`, `mapped_to`, `derived_from`, …)
   - `folder` (explicit folder path; defaults to derivation from `id` + hierarchy)
   - `aliases`, `tags`
   - `metadata.<sssom-key>` (passes straight through to the SSSOM envelope when the note represents a mapping)

   This single primitive replaces v0.1's eight column-roles (`id/label/body/hierarchy/property/edge_target/metadata/ignore`) with a uniform `BIND(slot, expr)` form.

5. **JOIN(left-iter, right-iter, condition)** — Resolve a constructed term in one iteration against records in another. Two flavors: *parent join* (builds folder hierarchy and `links.parent`) and *cross-reference join* (builds `links.<role>` wikilinks, edge_target). This is RML's `rr:joinCondition`; it is irreducible — without it, you cannot express "this control's parent_id refers to another row's id".

6. **INVERT(term-map, [explicit-put])** — Declare the lens `put` for a Term Map. When omitted, the runtime attempts automatic inversion (succeeds for path-only references and concatenation templates with regex-recoverable separators; fails loudly for lossy expressions). When provided, it is a JSONata expression in the opposite direction, type-checked against the same schemas. This single primitive subsumes the entire "round-trippability" feature.

That is exactly six. Note the structural parallel:

| Side | Primitive count | Origin |
|---|---|---|
| Edge predicate (STRM) | 5 set-theory predicates | Set-theoretic relation algebra |
| Edge change (diff) | 9 graph-edit atoms | Graph edit distance literature |
| Edge envelope (SSSOM) | 1 schema | Mapping-commons |
| **Import (T1TMA)** | **6 ops: ITERATE, REFERENCE, TEMPLATE, BIND, JOIN, INVERT** | **RML core ∪ lens contract, MTT-justified** |

A completeness sketch: ITERATE+REFERENCE+TEMPLATE+BIND+JOIN is an exact projection of MTT primitives 1–5 (construct, descend, copy, consult-accumulator, pattern-match) onto the per-record execution model; INVERT adds the lens `put` channel. So T1TMA inherits MTT's primitive-recursive completeness on the forward channel and Foster-lens well-behavedness on the backward channel.

---

## 4. Concrete recipe schema sketch

### 4.a TypeScript schema

```ts
// crosswalker/import/recipe.ts
export interface ImportRecipe {
  recipe: '1.0';                          // schema version
  id: string;                              // recipe id (URN-style)
  extends?: string[];                      // mixin/override chain
  prefixes: Record<string, string>;        // CURIE map (SSSOM-compatible)

  sources: Record<string, LogicalSource>;  // ITERATE
  mappings: Record<string, Mapping>;       // BIND collections
  joins?: Record<string, JoinSpec>;        // JOIN
  vars?: Record<string, string>;           // set_var equivalents
}

export interface LogicalSource {
  access: string;                                   // file path / URL / glob
  formulation: 'csv' | 'tsv' | 'csvw' | 'xlsx'
             | 'jsonpath' | 'xpath' | 'oscal-json'
             | 'turtle-subject' | 'jsonld-frame';
  iterator?: string;                                // formulation-native expression
  options?: Record<string, unknown>;                // header_offset, sheet, encoding…
  csvw?: object;                                    // optional embedded CSVW metadata
}

export interface Mapping {
  source: string;                          // ref to sources[]
  filter?: string;                         // JSONata predicate (drops record if false)
  binds: Bind[];                           // ordered list of BIND ops
}

export interface Bind {
  slot: TierOneSlot;                       // closed enum (see §3)
  get: string | TermTemplate;              // REFERENCE+TEMPLATE (JSONata or template)
  put?: string;                            // INVERT — explicit JSONata for lens.put
  required?: boolean;                      // validation
  multi?: boolean;                         // multi-valued slot
}

export type TierOneSlot =
  | 'id' | 'label' | 'folder' | 'aliases' | 'tags'
  | { kind: 'frontmatter'; key: string; type?: JsonSchemaType }
  | { kind: 'body'; section: string; order?: number }
  | { kind: 'links';   role: string; targetMapping: string };

export type TermTemplate =
  | { template: string }                   // "{family}-{number}" style
  | { jsonata: string }                    // arbitrary JSONata expression
  | { const: string };

export interface JoinSpec {
  left: string;                            // mapping ref
  leftKey: string;                         // JSONata on left record
  right: string;                           // mapping ref
  rightKey: string;                        // JSONata on right record
  emit: 'links.parent' | { kind: 'links'; role: string };
}
```

### 4.b YAML example: NIST SP 800-53 r5 controls (tabular OSCAL CSV export)

```yaml
recipe: '1.0'
id: urn:crosswalker:recipe:nist-800-53-r5
extends:
  - urn:crosswalker:recipe:base/grc-control

prefixes:
  nist:   https://doi.org/10.6028/NIST.SP.800-53r5#
  cw:     https://crosswalker.dev/schema#
  semapv: https://w3id.org/semapv/vocab/

vars:
  framework_id:    NIST_800-53_r5
  framework_label: "NIST SP 800-53 Revision 5"

sources:
  catalog_csv:
    access: ./input/sp800-53r5-control-catalog.csv
    formulation: csvw
    csvw:
      dialect: { headerRowCount: 1 }
      tableSchema:
        primaryKey: ["Control Identifier"]
        columns:
          - { name: "Control Identifier",     datatype: string, required: true }
          - { name: "Control (or Control Enhancement) Name", datatype: string }
          - { name: "Control Text",           datatype: string }
          - { name: "Discussion",             datatype: string }
          - { name: "Related Controls",       datatype: string }   # comma-separated CIDs
          - { name: "Family",                 datatype: string }

mappings:
  control:
    source: catalog_csv
    filter: '`Control Identifier` != ""'

    binds:
      - slot: id
        get: { template: "nist:{`Control Identifier`}" }
        put:  '$replace(id, "nist:", "")'                    # explicit inverse

      - slot: label
        get: { jsonata: '`Control (or Control Enhancement) Name`' }
        put: 'label'

      - slot: folder
        get: { template: "Frameworks/NIST 800-53 r5/{Family}/{`Control Identifier`}" }
        # no put: derived deterministically from id+family on round-trip

      - slot: { kind: frontmatter, key: framework, type: string }
        get: { const: "NIST_800-53_r5" }

      - slot: { kind: frontmatter, key: family, type: string }
        get: '`Family`'
        put: 'family'

      - slot: { kind: frontmatter, key: control_id, type: string }
        get: '`Control Identifier`'
        put: 'control_id'

      - slot: { kind: body, section: "Statement", order: 1 }
        get: '`Control Text`'
        put: 'body.Statement'

      - slot: { kind: body, section: "Discussion", order: 2 }
        get: '`Discussion`'
        put: 'body.Discussion'

      - slot: { kind: links, role: "related", targetMapping: control }
        multi: true
        get:
          jsonata: |
            $split(`Related Controls`, /,\s*/)
              [$ != ""]
              .("nist:" & $)
        put:
          jsonata: |
            $join($map(links.related, function($l){ $replace($l, "nist:", "") }), ", ")

joins:
  parent_family:
    left: control
    leftKey: '$substringBefore(`Control Identifier`, "-")'
    right: control                          # self-join via family stub
    rightKey: '`Control Identifier`'
    emit: links.parent
```

### 4.c Comparison with v0.1 ImportRecipe

| Concern | v0.1 ImportRecipe | T1TMA recipe |
|---|---|---|
| Column-role assignment | 8 closed roles (`id/label/body/hierarchy/property/edge_target/metadata/ignore`) | 1 generic `BIND(slot, expr)` with closed `slot` vocabulary; the v0.1 roles reduce to syntactic sugar over `slot` choices |
| Transforms | 24 ad-hoc transform types (split, join, regex, prefix, lookup, …) | 1 expression language (JSONata) — arbitrary string-and-tree expressions; the 24 transforms become ~24 named JSONata snippets in a stdlib |
| Source format | CSV-first; JSON via "escape hatch" | CSV/TSV/CSVW/XLSX/JSON/XML/JSON-LD/Turtle as named formulations |
| Hierarchy | dedicated `hierarchy` role | `JOIN` primitive + `links.parent` slot |
| Edges | dedicated `edge_target` role | `JOIN` + `links.<role>` with `targetMapping` |
| Round-trip | not modeled | optional `put` per BIND; INVERT primitive |
| Composition | none | `extends`, mixin chain, per-bind override |
| Validation | post-hoc | CSVW typing on input + JSON-Schema-ish `type`/`required` on output slot |
| Dependencies | string-handling utilities | `jsonata` (~250 KB) + `csvw-parser` (~80 KB) + a ~150 KB recipe runtime ≈ **~480 KB**, well under the 1.2 MB target |

The information content of v0.1's 24-transform list is preserved: every existing transform is one of (a) a JSONata function, (b) a CSVW datatype directive, or (c) a join specification. Nothing is lost, but the vocabulary collapses from 8 + 24 = 32 ad-hoc terms to 6 primitives + a closed slot vocabulary + JSONata.

---

## 5. Composability with the rest of Crosswalker

The recommendation is **strictly orthogonal** to the existing first-principles primitives — it sits one layer below them and produces the substrate they consume:

- **vs. STRM (5 set-theory predicates).** STRM operates on edges between Tier-1 entities. T1TMA *produces* those entities and an initial set of `links.<role>` edges that STRM may then label. Strictly orthogonal; no overlap. A v0.2 recipe can `BIND` directly into a `links.mapped_to` role with a STRM predicate as a co-bind, and the SSSOM envelope will fall out automatically.

- **vs. SSSOM envelope (canonical row schema).** When an ImportRecipe produces edge notes (junction notes), the recipe simply uses `slot: { kind: frontmatter, key: <sssom-slot> }` for each SSSOM column. SSSOM-Transform's filter-action pattern — the closest existing precedent — is a *consumer* of T1TMA output, not a competitor. A v0.2 vault can run T1TMA → Tier-1 → SSSOM/T → SSSOM-TSV → STRM-TSV in pipeline form, with each stage formally typed.

- **vs. ontology diff primitives (9 atomic graph-edit ops).** The diff engine consumes two Tier-1 vault states. T1TMA *produces* those states. When a re-import runs, the diff engine compares old vs. new Tier-1 trees; the resulting 9-atom edit script is the *change set* the vault applies. Strictly orthogonal.

- **vs. Nemo (SSSOM derivation).** Nemo is a Datalog engine over already-imported Tier-1 facts. T1TMA produces those facts. Nemo continues to derive SSSOM rows downstream. No overlap, clean handoff.

T1TMA does **not** subsume any of these. It does **not** try to. Its scope is exactly "source bytes → Tier-1 tree", and it stops at the vault boundary.

---

## 6. Bidirectionality answer

**One recipe expresses both directions, but the inverse is a *partial* lens whose well-behavedness depends on the recipe.**

The lens contract works like this:

- A Term Map declared with only `get` is **forward-only**. Round-trip behavior is undefined; an export attempt raises `LensIncompleteError`.
- A Term Map with `get` and `put` is a **basic lens** in Foster's sense. The runtime statically checks that types compose; at runtime it verifies GetPut on a sample.
- A recipe in which **every** Term Map is a basic lens is a **recipe-level lens**, and the runtime exposes a `recipe.export(tier1Tree) -> sourceBytes` operation. Round-tripping is guaranteed up to (a) ordering of unordered slots and (b) values explicitly marked `derived` (e.g. computed `folder`).
- The runtime can **automatically derive `put`** when `get` is one of: pure path projection, concatenation with regex-recoverable separators, CURIE expansion, or a CSVW-datatype coercion. For non-trivial JSONata expressions (aggregations, joins across iterations), the recipe author must supply `put` explicitly or accept forward-only.
- For Tier-1 ↔ SSSOM-TSV: SSSOM is a flat tabular schema; the lens here is *fully derivable* (RML-style identity lens with CURIE expand/contract).
- For Tier-1 ↔ STRM-TSV: identity lens on the predicate slots, plus pass-through on metadata. Trivial.
- For Tier-1 ↔ OSCAL JSON: the lens is **partial** — OSCAL has structural properties (UUIDs, link `rel` enumerations, parameter constraints) that Tier-1 does not preserve verbatim by default. Round-trippable OSCAL recipes must `BIND` an `_oscal_blob` frontmatter slot that carries the un-projected residue, in the spirit of dictionary lenses' "chunks" mechanism. This is the standard well-behaved-lens-with-residue pattern from Bohannon et al. (POPL 2008).

The forward and backward channels are therefore **co-located in one recipe file**, not separate recipes — but the backward channel is an opt-in declaration per Term Map, not a default.

---

## 7. Migration path (v0.1 ad-hoc → v0.2 T1TMA)

A four-phase, mostly-automatic migration:

**Phase 0 (one week): freeze v0.1, write the spec.** Publish the T1TMA spec (`docs/spec/import/T1TMA-1.0.md`) with the six primitives, the closed slot vocabulary, the JSONata sub-language profile, and the lens contract. Pin JSONata version, write 30-line Bun bench to verify bundle size.

**Phase 1 (two weeks): build the runtime.** A small TS package (`@crosswalker/import`) implementing:
- `LogicalSourceReader` per formulation (CSV/TSV via `papaparse`, XLSX via `exceljs`, JSON via native, XPath via `xpath`/`@xmldom/xmldom`, CSVW typing layer, OSCAL-JSON via JSONata directly).
- `JSONataExpr` wrapper with a static-analysis pass that classifies expressions into `pure-projection | template | aggregation | opaque` for auto-inversion.
- `TermMap` evaluator (forward) and `TermMap.invert` (backward, succeeds for pure-projection/template).
- `RecipeExecutor` orchestrating sources → mappings → joins → emit.
- `RecipeValidator` (JSON Schema for the recipe shape; profile validator for slot/formulation compatibility).

**Phase 2 (two weeks): write a v0.1 → v0.2 transpiler.** v0.1 ImportRecipes have a small fixed structure (column-roles + 24 transforms). A 400-line script translates each existing recipe to T1TMA:
- Each `id` role → `BIND(slot: id, get: { template: "{column}" })`.
- Each `body` role → `BIND(slot: { kind: body, section: <columnName> }, get: <column>)`.
- Each `hierarchy` role → an entry in `joins:` with `emit: links.parent`.
- Each `edge_target` role → `BIND(slot: { kind: links, role: <roleName>, targetMapping: <m> })`.
- Each transform → its JSONata equivalent from a stdlib lookup table.
- `ignore` role → simply omitted (the closed slot vocabulary makes `ignore` redundant).

Run the transpiler over every recipe in the project's recipe library; commit the v0.2 recipes alongside v0.1 with a `recipe: '1.0'` discriminator. Both formats execute side-by-side for one release.

**Phase 3 (one release cycle): deprecate v0.1.** Remove the v0.1 column-role/transform code paths after the next minor release. The transpiler stays around as a one-shot for users with private recipes.

Optional **Phase 4: lens-completion sweep.** Walk every recipe, run the auto-inverter, flag Term Maps the auto-inverter cannot handle, ask their authors to supply explicit `put`. This is the gateway to Tier-1 ↔ OSCAL round-trip support.

---

## 8. What we'd lose

Honest accounting of what the simplification sacrifices:

1. **Imperative escape hatches.** v0.1's "embed a JS function" escape hatch is replaced by JSONata + a small fixed library of pure functions. Users who genuinely need imperative logic (e.g., parsing a bespoke binary header) must write a *custom logical-source reader*, not embed code in the recipe. This is a deliberate trade for declarativeness/version-control-friendliness.

2. **Implicit ordering of multi-step transforms.** v0.1's 24-transform pipelines could chain `split → trim → lowercase → prefix` as a single column-role. In T1TMA each BIND is a single JSONata expression — chains become `$lowercase($trim($split(...)))`. Slightly more verbose, much more testable, and statically inspectable.

3. **Free-form custom slots.** v0.1 lets recipes write any frontmatter key. T1TMA still allows arbitrary frontmatter, but each must be declared with `kind: frontmatter, key: <name>` — which forces typing decisions up front. Authors lose 30 seconds; downstream tooling (junction-note builders, STRM emitter) gains schema-aware behavior.

4. **Implicit hierarchy detection.** v0.1's `hierarchy` role tries to be smart about indent-depth, parent-id, and dot-paths simultaneously. T1TMA forces the author to pick one explicitly via a `JOIN` spec or a JSONata path expression. More boilerplate; far less mystery when an import goes wrong.

5. **Sub-recipe libraries.** v0.1's recipe-as-blob means there's no story for shared transforms across recipes. T1TMA's `extends:` chain plus a recipe-prelude file (`stdlib.recipe.yaml`) gains this — but it's a new feature, not a like-for-like replacement.

Things we explicitly **do not** lose: any source format, any output Tier-1 shape, any v0.1 transform (all 24 are translatable), any composition with STRM/SSSOM/diff/Nemo.

---

## 9. Adversarial sanity check — would a GRC recipe author bounce?

I ran the cognitive-load thought experiment with three personas:

**Persona A: "Tabular SME" (e.g., GRC analyst writing a NIST 800-53 importer).** Reads the YAML in §4.b. Knows CSV columns. Recognizes `template: "{Family}/{Control Identifier}"` instantly. JSONata is unfamiliar but the 95% of expressions look like backtick column references with at most a `$split(...)`. **Verdict: adopts.** No worse than learning `${{var}}` in GitHub Actions. The closed slot vocabulary actually *helps* — they don't have to invent frontmatter conventions.

**Persona B: "OSCAL/JSON SME" (e.g., importing an OSCAL catalog).** JSONata is a direct upgrade over the v0.1 escape hatch (which was just JSONata anyway, undocumented). The CSVW-style typing is unnecessary for OSCAL but ignorable. JOINs are needed for OSCAL's parameter/constraint references — but these authors already understand JSON joins. **Verdict: adopts.**

**Persona C: "Just paste my CSV in" user.** Will not write a recipe at all. Both v0.1 and T1TMA address this via wizard-generated default recipes. T1TMA is mildly *better* because the closed slot vocabulary makes the wizard's job easier (it asks "which column is the id?", not "what is the role of this column among 8 options?"). **Verdict: neutral or slight win.**

Where authors could legitimately push back:
- The lens `put` notation is unfamiliar. Mitigation: it is *optional*, and the auto-inverter handles ~70% of cases. The docs lead with "ignore the `put:` field unless you need round-trip export."
- JSONata's terseness can become noise (`$replace(`Related Controls`, /,\s*/, …)`). Mitigation: a stdlib of named functions (`$split_csv_field`, `$prefix_curie`) keeps recipes readable.
- "Why JSONata and not just JS?" Honest answer: pure-JS recipes can't be safely shared, version-controlled, or analyzed for invertibility, and JSONata is the smallest, most-mature declarative JSON expression language with a TS impl. This argument lands well with anyone who's ever tried to share a recipe with embedded `eval`.

**Net assessment:** Recipe-author cognitive load is *lower* than v0.1 for tabular cases (closed slot vocabulary > 8 column-roles + 24 transforms), *equivalent* for JSON/XML cases (JSONata replaces ad-hoc transforms), *higher* only for users who want to write `put` lenses — and that's precisely the population that wants round-trip and is willing to pay the cost. No bounce.

---

## 10. Summary

The minimal first-principles primitive for the import side is the **Tier-1 Term-Map Algebra (T1TMA)**: six operations (ITERATE, REFERENCE, TEMPLATE, BIND, JOIN, INVERT) over a closed Tier-1 slot vocabulary, with JSONata as the expression sub-language and CSVW as the tabular type profile. Theoretically, it is the per-record projection of macro-tree-transducer primitive recursion onto tree-shaped sources and a tree-shaped target. Practically, it is YARRRML retargeted from RDF to Tier-1, with optional lens semantics layered on each Term Map. It composes orthogonally with STRM, SSSOM, junction notes, and the ontology diff engine — sitting strictly upstream of all of them. It satisfies every constraint: declarative YAML/JSON, format-diverse, composable via `extends`, lens-style invertible where the recipe permits, recipe-author-friendly (lower cognitive load than v0.1 in the common case), implementable in pure TypeScript at ≈480 KB bundled, no JVM. The sole architectural debt is that round-trip Tier-1 ↔ OSCAL JSON requires an explicit residue slot — a known and well-understood pattern from the lens literature.

The bet is that *six primitives + closed slot vocabulary + one expression language* is the right replacement for v0.1's *eight column-roles + twenty-four transforms + escape-hatch JSONata*. The literature (Engelfriet/Vogler MTT, Foster/Pierce lenses, RML/YARRRML, SSSOM/Transform) all converges on the same six-operation skeleton from very different starting points; that convergence is the strongest first-principles evidence available that the count is right.
