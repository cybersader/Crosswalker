---
title: "Ch 20 deliverable C: 5+4 primitive set — RML/YARRRML retargeted, FNML transforms, SSSOM/T filter→action overlay (s-t tgds + MTT + functorial migration justified)"
description: "Fresh-agent research deliverable C for Challenge 20. Recommends a hybrid grounded in RML/YARRRML retargeted from RDF triples to Tier-1 Note tuples. Five import primitives (Source, Term, Map, Join, Function) producing into four output sinks (path, frontmatter, body, wikilink). Theoretical justification: RML's algebraic core matches data-exchange theory's source-to-target tuple-generating dependencies; the 5 primitives correspond to MTT operation classes; bidirectionality as opt-in lens contract on the round-trippable subset. Concrete NIST 800-53 r5 OSCAL JSON example with TypeScript schema and YAML surface. Convergent with Run A on the substantive recommendation; differs in framing (Run A names INVERT as a sixth primitive; Run C makes bidirectionality an annotation flag)."
tags: [research, deliverable, import, primitive, rml, yarrrml, fnml, sssom-transform, s-t-tgd, mtt, functorial-data-migration, foundation]
date: 2026-05-03
sidebar:
  label: "Ch 20c: 5+4 algebra"
  order: -20260503.3
---

:::tip[Origin and lifecycle]
Fresh-agent research deliverable produced 2026-05-03 in response to [Challenge 20: Import primitive formal foundation](/crosswalker/agent-context/zz-challenges/archive/20-import-primitive-formal-foundation/). Synthesized in the [05-03 import-primitive synthesis log §4](/crosswalker/agent-context/zz-log/2026-05-03-import-primitive-formal-foundation-synthesis/) as **convergent with Run A** at the transformation-algebra layer. Preserved verbatim.
:::

# Research Challenge 20 — A First-Principles Primitive for the Crosswalker Import Side

## 0. Executive verdict

**Adopt a hybrid grounded in RML / YARRRML, retargeted from RDF triples to a "Tier 1 Note tuple," with FNML-style transform functions and an SSSOM/T-style filter→action overlay.** Treat **lenses** as a *property* (a well-behavedness contract on the subset of recipes that must round-trip), not as the base formalism. Treat **schema-mapping s-t tgds, macro tree transducers, and functorial data migration** as the *theoretical justification* for why this primitive set is closed and minimal — but do not build the user-visible DSL on top of them, because the cognitive cost is incompatible with constraint #6 (recipe-author-friendliness) and the implementation cost is incompatible with constraints #7–#8 (TypeScript/Bun, ≤1.2 MB).

The deep reason this hybrid wins is that RML's algebraic core is, almost exactly, the data-exchange community's notion of a **source-to-target tuple-generating dependency (s-t tgd)** specialized to a single output schema (the Tier 1 Note). The Dimou et al. 2014 paper and the 2023 RML-Ontology redesign explicitly frame RML's machinery as "algebraic mapping operators" — `LogicalSource`, `TermMap` (constant | reference | template), `TriplesMap`, and `Join` — which is almost exactly the set of operators Fagin/Kolaitis/Popa identify as sufficient for relational data exchange. RML thus inherits a mature theoretical foundation without requiring users to ever read it. SSSOM/Transform contributes a separable "filter ⟶ action with preprocessor/generator/callback functions" layer that maps cleanly onto Crosswalker's existing 24 ChunkyCSV-style transforms.

The rest of this report works through the eight required deliverables.

---

## 1. Why the obvious-looking candidates lose

Before defending the verdict, it is worth being explicit about why each pure formalism fails one or more of the eight constraints.

**Functorial data migration (Spivak/Wisnesky).** Schemas are categories, instances are set-valued functors, and any morphism `F : S → T` induces three adjoint data-migration functors `Σ_F`, `Π_F`, `Δ_F` (Spivak 2010; Spivak & Wisnesky DBPL 2015). This is the most mathematically beautiful answer to "what is data migration?" — `Δ` is projection/copy, `Σ` is union/join, `Π` is product. It is provably closed under composition and FQL/CQL implements `Σ∘Π∘Δ` rewrites. But (a) the production tooling (CQL, AQL) is JVM/Haskell-based, (b) authoring schemas-as-categories with path equations is a PhD-level skill, and (c) the round-trip story for *messy* sources (XLSX merged cells, OSCAL with multiple serializations) requires modeling each source as its own category before any migration can be expressed. It violates constraints #6 and #7 hard. Useful as **post-hoc justification** that our chosen primitive set is algebraically closed, not as the surface DSL.

**Boomerang lenses / bidirectional transformations (Foster, Pierce, Bohannon).** Lenses give paired (`get`, `put`) functions with `GetPut`, `PutGet`, and `PutPut` round-trip laws. Boomerang's combinators — concatenation, union, Kleene-star, copy, reorderable-chunks-with-keys — are, as the authors themselves note, modeled on regular transducers, and are essentially a string-level theory. The 2008 quotient-lenses extension exists precisely because raw lenses are too rigid for "ad-hoc data" that needs canonicalization. There is no production-grade TypeScript lens library that handles ordered, hierarchical, multi-source data with the kind of completeness an OSCAL or NIST 800-53 importer needs; the most active JS ecosystems (Ramda lenses, Optics-ts) implement the *functional-record* fragment only, not Boomerang's resourceful string lenses. Lenses also forbid information-creating transforms by default — which Crosswalker's import side needs (e.g. minting wikilink targets that did not exist in the source). Lenses are best treated as a **conformance label** on individual recipes ("this recipe is well-behaved and round-trippable"), not the universal substrate.

**Tree transducers (Engelfriet; Maneth; macro/multi-bottom-up TTs).** Theoretically ideal: every input format we care about (CSV-with-hierarchy, JSON, XML, OSCAL, YAML, XLSX-as-tree) and every output (folder + frontmatter + wikilinks) is a labeled ranked tree, and macro tree transducers (MTTs) compose, decide shape preservation, support regular look-ahead, and capture MSO-definable tree-to-tree translations. The primitive operations are very crisp: **relabel, project, copy, restructure, fold (state-passing accumulation), and look-ahead**. But the production toolset (TTT, Treebag, the Tum MTT-checker) is academic; there is no maintained TS/Bun implementation, and writing MTT rules is markedly less ergonomic than writing YARRRML. We will **borrow the MTT vocabulary** to name our primitives (because it is the right vocabulary), but we will not require users to author MTT rules.

**Datalog (Soufflé / Nemo / DDLog / Datafun).** Already in Crosswalker's stack via Nemo for SSSOM derivation. Datalog is excellent at *derivation over already-loaded facts* but poor at *ingest*: parsing XLSX with merged-cell offsets, JSONata-style template expansion, and prose-aware body extraction are not natural Datalog. The OxO2 paper (Harmse et al. 2025/2506.04286) confirms this de facto split: Nemo runs *after* facts have been loaded into the canonical EDB. The right architectural conclusion is that Datalog handles the *derivation* tier (which Crosswalker already uses for SSSOM chain rules) and a different formalism handles the *import* tier — i.e. they sit at different layers of the same stack, not in competition.

**JSONata / JQ / Jolt.** All three are excellent JSON-to-JSON declarative transformers, but none of them have a first-class notion of a "source" abstraction, a "logical iterator" with a reference formulation per format (so XLSX, OSCAL XML, and CSV all look uniform), or a notion of "this term is a *subject*, that term is a *property*, that term is a *body*." JSONata in particular is what we want for the *expression* layer (the right-hand side of a TermMap), but it is not the *recipe* layer. JSONata is therefore retained as a built-in function in the Function primitive — exactly the role it already plays in v0.1's escape hatch.

**RML / YARRRML.** Declarative; has an open W3C-track specification; has multiple JS/TS implementations (`@comake/rmlmapper-js`, `@qaecy/rmlmapper-js`, `rocketrml`, `yarrrml-parser`); supports CSV, TSV, XLSX (via Morph-KGC's tabular extension), JSON (JSONPath), XML (XPath), JSON-LD, RDB, and via FNML can call arbitrary user-defined transformation functions. The "right ontology" for RML's primitives — `LogicalSource`, `ReferenceFormulation`, `Iterator`, `SubjectMap`, `PredicateObjectMap`, `TermMap{constant | reference | template}`, `Join`, `GraphMap` — is essentially the minimal vocabulary the data-exchange and KG-construction communities have converged on after 12 years of revision. The only thing we need to do is **retarget the output**: instead of generating RDF triples, we generate Tier 1 Note tuples.

**SSSOM/Transform (SSSOM/T).** The Incenp.org documentation makes clear that SSSOM/T is intentionally a *backbone* that requires "dialects" — the language defines `FILTER → ACTION` rules with three function categories (generator, preprocessor, callback) but says nothing about what `ACTION` produces. SSSOM/T-OWL produces OWL axioms; we would define **SSSOM/T-Note** (or **Crosswalker/T**) producing Tier 1 Note slots. This gives us a clean separation: RML decides *what is a record*, SSSOM/T decides *which records get rules applied to them*, and the rule body emits Note slots.

---

## 2. The primitive operations — the irreducible set

Crosswalker already has its first-principles primitives stated as small numbered sets (STRM = 5 predicates; ontology diff = 9 atoms). The import side admits an analogous decomposition into **5 import primitives** + **4 output sinks**. Everything in the v0.1 ImportRecipe (column-role assignments, 24 transform types, output config) is expressible as combinations of these.

### 2.1 The five import primitives (analogous to STRM's 5 predicates)

| # | Primitive | What it is, formally | RML name | MTT/data-exchange analog |
|---|-----------|---------------------|----------|--------------------------|
| **I1** | **Source** | A *logical source* `(URI, format, reference-formulation, iterator)` that yields a stream of records. The iterator picks a *substructure* of the input tree (a row of a CSV, a node matched by JSONPath/XPath, a sheet+range of an XLSX, an OSCAL `control` element). | `rml:LogicalSource` | The input tree + a regular look-ahead that selects substructures (Engelfriet's TOP-with-look-ahead). |
| **I2** | **Term** | An expression `Term ::= Constant(c) \| Reference(path) \| Template(string-with-${refs}) \| Function(name, args)` evaluated against the current record to yield a single string/typed value. Templates are MTT relabel-and-copy primitives in disguise; references are MTT projection. | `rml:TermMap` (with `rml:constant`, `rml:reference`, `rml:template`); `fnml:FunctionExecution` | s-t tgd term construction; MTT rule right-hand side. |
| **I3** | **Map** | A rule `Source × Filter ⟶ {Sink ↦ Term}` that, for each iterator hit that satisfies a Filter, emits a set of `(sink-slot, term-value)` bindings into the **same** output Note. This is exactly an RML `TriplesMap` retargeted: instead of emitting `(s, p, o)` triples, it emits `(note-path, slot, value)` tuples where `slot ∈ {path, frontmatter[k], body[region], wikilink[role]}`. | `rml:TriplesMap` retargeted | A single source-to-target tgd `∀x⃗ ϕ(x⃗) → ∃y⃗ ψ(x⃗,y⃗)` whose head is restricted to the four Tier 1 sinks. |
| **I4** | **Join** | A binary operator `Map ⋈_{child=parent} Map` resolving cross-source references. Used for "wikilink target lives in another sheet/file" and for hierarchy resolution. | `rml:RefObjectMap` + `rr:joinCondition` | Equi-join in relational algebra; the `Σ` migration functor in functorial data migration. |
| **I5** | **Function** | A named, declarative transformation `Function = (name, arity, body)` where `body` is one of {GREL function, JSONata expression, JS arrow function declared in a sandboxed `functions:` block, registered built-in}. This is the **single home** for v0.1's 24 transform types. | `fnml:FunctionExecution` (FNML / `rml-fnml`) | MTT state-passing folds + arbitrary string functions; the "function symbols" of second-order tgds (Fagin et al. 2005). |

These five are closed under composition (RML + FNML is closed; SSSOM/T extends with filter+action that does not break closure), and they are the **smallest** set that simultaneously expresses (a) the tabular case, (b) the hierarchical case, (c) cross-source reference resolution, and (d) format-specific lift functions.

### 2.2 The four output sinks (the canonical Tier 1 schema)

The reason RML is *retargetable* is that the output side is itself a small, fixed vocabulary — the Tier 1 representation. There are exactly four sinks, and every Map binding lands in one of them:

| Sink | Tier 1 meaning | Cardinality per Note |
|------|----------------|----------------------|
| **`path`** | The folder + filename of the markdown note (the "subject" in RML terms). | Exactly 1 (it is the note's identity). |
| **`frontmatter[k]`** | A YAML key→value (or key→list) in the note's frontmatter block. | 0..N keys; each key 0..N values. |
| **`body[region]`** | Markdown prose, optionally addressed by a named region (heading, callout, line range) for stable round-tripping. | 0..N regions. |
| **`wikilink[role]`** | An outgoing `[[target]]` link with a role label that records *why* the link exists (e.g. `parent`, `relates_to`, `derived_from`, `crosswalk_edge_target`). | 0..N. |

These four sinks are themselves the **complete output algebra** — anything an Obsidian vault can express at Tier 1 is a multiset of `(path, frontmatter, body, wikilink)` tuples, which is exactly what RML produces if you read a `TriplesMap` as a `NoteMap`.

### 2.3 Why this is the right number

- It matches RML's own minimal core (the 2023 RML-Ontology paper explicitly identified `LogicalSource`, `TermMap`, `TriplesMap`, and `Join` as the irreducible modules).
- Each primitive corresponds to exactly one MTT operation class (Source = input alphabet + look-ahead; Term = relabel/project/copy; Map = rule production; Join = state communication; Function = parameter passing).
- Each primitive corresponds to exactly one data-exchange-theory concept (Source = source schema instance; Term = term construction; Map = an s-t tgd; Join = body conjunct linking; Function = Skolemization / second-order tgd).
- Removing any of the five strictly loses expressiveness for at least one of the formats in constraint #3 (CSV, TSV, XLSX, JSON, JSON-LD, RDF, OSCAL XML/JSON/YAML).
- The four sinks are forced by the Tier 1 grammar; they cannot be reduced further without giving up either folder hierarchy, frontmatter, prose, or graph edges.

---

## 3. Concrete recipe schema sketch — NIST 800-53 r5

### 3.1 TypeScript surface (the in-memory recipe AST)

```typescript
// Crosswalker ImportRecipe v0.2 — primitive-grounded
type ImportRecipe = {
  apiVersion: "crosswalker.recipe/v0.2";
  extends?: string[];                       // composability (mixin/override)
  prefixes?: Record<string, string>;
  functions?: Record<string, FunctionDef>;  // user-defined, sandboxed
  sources: Record<string, Source>;          // I1
  maps:    Record<string, NoteMap>;         // I3 (each is one s-t tgd)
};

type Source = {                              // I1: LogicalSource
  access: string;                            // file path / URL / glob
  format: "csv" | "tsv" | "xlsx" | "json" | "xml"
        | "yaml" | "jsonld" | "ttl" | "oscal-json" | "oscal-xml";
  referenceFormulation?: "csv" | "jsonpath" | "xpath" | "linkml";
  iterator?: string;                         // e.g. "$.controls[*]" or sheet!range
  options?: {                                // CSVW + XLSX + OSCAL knobs
    delimiter?: string;
    encoding?: string;
    headerOffset?: number;                   // XLSX header row
    mergedCellPolicy?: "fill-down" | "ignore" | "error";
    sheet?: string;
    range?: string;
  };
};

type Term =                                  // I2
  | { constant: string | number | boolean }
  | { reference: string }                    // column / JSONPath / XPath
  | { template: string }                     // "${ref} - ${ref2}"
  | { function: string; args: Term[] };      // I5 invocation

type NoteMap = {                             // I3 + I4 + filter
  source: string;                            // ref to a Source
  filter?: Term;                             // boolean Term (SSSOM/T-style)
  path: Term;                                // sink: path
  frontmatter?: Record<string, Term | Term[] | { each: Term; in: string }>;
  body?: { region: string; from: Term }[];   // sink: body
  wikilinks?: {                              // sink: wikilink
    role: string;                            // "parent" | "relates_to" | ...
    target: Term;                            // a path Term, possibly via Join
    join?: Join;                             // I4
  }[];
};

type Join = {                                // I4
  parentSource: string;
  on: { child: Term; parent: Term }[];
  cardinality?: "1" | "n";
};

type FunctionDef =                           // I5: declarative, sandboxed
  | { kind: "grel"; expr: string }           // GREL (FNML built-in set)
  | { kind: "jsonata"; expr: string }        // JSONata escape hatch
  | { kind: "regex"; pattern: string; replace?: string }
  | { kind: "split"; on: string; index?: number }
  | { kind: "lookup"; table: string; key: string }
  | { kind: "js"; arrow: string };           // sandboxed JS arrow fn
```

### 3.2 YAML surface (what authors actually write) — NIST 800-53 r5

This is the same recipe expressed in a YARRRML-flavored YAML. The shape is intentionally close to YARRRML so that Matey-style editors and the existing `yarrrml-parser` toolchain can be reused with a thin "Note" target dialect.

```yaml
apiVersion: crosswalker.recipe/v0.2
extends:
  - crosswalker:base/oscal-catalog          # mixin for OSCAL conventions

prefixes:
  nist:   "https://csrc.nist.gov/ns/oscal/1.0/"
  ctrl:   "vault://Frameworks/NIST-800-53-r5/"

functions:
  cleanCtl:  { kind: grel,    expr: "value.replace('(', ' ').replace(')','').trim()" }
  splitFam:  { kind: regex,   pattern: "^([A-Z]{2})-.*", replace: "$1" }
  bodyFromOscal:
                { kind: jsonata, expr: "$join(parts[name='statement'].prose, '\\n\\n')" }

sources:
  catalog:                                  # I1 — the OSCAL JSON catalog
    access: "./input/NIST_SP-800-53_rev5_catalog.json"
    format: oscal-json
    referenceFormulation: jsonpath
    iterator: "$..controls[*]"              # walks every nesting level

  families:                                 # I1 — companion families CSV
    access: "./input/families.csv"
    format: csv
    options: { delimiter: ',' }

maps:
  # ── NoteMap for every control ──────────────────────────────────────
  Control:                                  # I3 — one s-t tgd
    source: catalog
    filter: { function: "isControl", args: [ { reference: "class" } ] }

    path:
      template: "Frameworks/NIST-800-53-r5/${id}.md"

    frontmatter:
      id:        { reference: "id" }
      title:     { function: cleanCtl, args: [ { reference: "title" } ] }
      family:    { function: splitFam,  args: [ { reference: "id"    } ] }
      class:     { reference: "class" }
      framework: { constant: "NIST 800-53 r5" }
      params:                                # multi-valued frontmatter
        each:  { reference: "name" }
        in:    "params[*]"
      tags:
        - { template: "framework/nist-800-53-r5" }
        - { template: "family/${family}" }    # lexical reuse of frontmatter slot

    body:
      - region: "## Statement"
        from:   { function: bodyFromOscal, args: [ { reference: "." } ] }
      - region: "## Guidance"
        from:   { function: jsonata,
                  args: [ { constant: "$join(parts[name='guidance'].prose,'\\n')" },
                          { reference: "." } ] }

    wikilinks:
      # parent control via OSCAL hierarchy
      - role:   parent
        target: { template: "Frameworks/NIST-800-53-r5/${parent_id}.md" }
        join:                                # I4 — self-join on the catalog
          parentSource: catalog
          on:
            - child:  { reference: "parent" }
              parent: { reference: "id" }
      # family page via CSV side-table
      - role:   family
        target: { template: "Frameworks/NIST-800-53-r5/_families/${family_label}.md" }
        join:
          parentSource: families
          on:
            - child:  { reference: "family" }
              parent: { reference: "code" }

  # ── NoteMap for each family page (driven by the families CSV) ─────
  Family:
    source: families
    path:
      template: "Frameworks/NIST-800-53-r5/_families/${label}.md"
    frontmatter:
      code:  { reference: "code" }
      label: { reference: "label" }
    body:
      - region: "## Description"
        from:   { reference: "description" }
```

The whole NIST 800-53 r5 importer is two `NoteMap`s, one `Join` per cross-source wikilink, and four declared functions — every one of which is data, not code.

---

## 4. Composability story

### 4.1 With STRM (the 5 predicates)

STRM operates on **edges between two already-imported graphs**. The Import primitive produces the Tier 1 representation; STRM then runs over the `wikilink[role=crosswalk_edge_target]` sink's outputs (or over a SSSOM-TSV produced by a *different* NoteMap whose path sink is `Crosswalks/${set}.sssom.tsv`). The composition is:

```
Source ──I1──▶ Iterator records ──I2/I5──▶ Term values ──I3──▶ NoteMap bindings
                                                                       │
                                                                       ▼
                                                             Tier 1 Note tuples
                                                          (path, frontmatter, body, wikilinks)
                                                                       │
                                                                       ▼
                                                            STRM predicate evaluator
                                                          (Equal / Subset / Superset /
                                                           Intersects / NoRelationship)
```

STRM's 5 predicates are **labels** on `wikilink[role=crosswalk_*]` instances; they are not part of the Import primitive itself. The Import primitive guarantees only that the wikilink lands in the right note with the right role; STRM then *interprets* that role.

### 4.2 With SSSOM (the canonical row-schema envelope)

SSSOM is just one possible *output schema* for a NoteMap whose `path` sink lands in a `.sssom.tsv` file. Because the four output sinks are uniform, an SSSOM mapping set is expressible as a single NoteMap whose frontmatter slots are the SSSOM columns (`subject_id`, `predicate_id`, `object_id`, `mapping_justification`, `confidence`, …) and whose path is the canonical TSV file. The 22 SSSOM chain rules continue to live in Nemo/Datalog and run **after** import — exactly as in OxO2.

### 4.3 With ontology diff (the 9 atomic graph-edit operations)

Two snapshots of a Tier 1 vault produced by the same recipe at different times yield two `(path, frontmatter, body, wikilinks)` multisets. The ontology-diff engine consumes the *symmetric difference* of these multisets and decomposes it into the 9 atoms (add-node, remove-node, relabel, add-edge, remove-edge, …). Because the import primitive is referentially transparent given the same source files (I1–I5 are pure), diffs of vault state correspond cleanly to diffs of source state plus diffs of recipe — a property that ad-hoc imperative importers cannot offer.

### 4.4 With the existing Nemo Datalog derivation tier

Crosswalker already uses Nemo for SSSOM chain-rule derivation (the OxO2 pattern). The Import primitive sits *upstream* of Nemo: I1–I5 produce Tier 1 facts; Nemo derives further facts (inferred mappings, transitive closures). This is the same architectural split that OxO2 uses — declarative ingest, then Datalog inference — and both halves remain pure data.

---

## 5. Bidirectionality answer

**Round-trip Tier 1 ⇄ (STRM-TSV / SSSOM-TSV / OSCAL JSON) is *partially* expressible as a single recipe — exactly the lens-law-respecting subset.** This is the honest answer; anything stronger over-promises.

A NoteMap is round-trippable (i.e. obeys Foster–Pierce `GetPut`/`PutGet` modulo a quotient on whitespace and ordering) iff every output sink is fed by exactly one of:

- a `constant` Term (trivially invertible);
- a `reference` Term (invertible by lookup);
- a `template` Term whose constants are unambiguous delimiters (invertible by parse — this is exactly the dictionary-lens / quasi-oblivious-lens criterion in Foster et al. 2008);
- a `function` Term whose function is annotated `bidirectional: true` and ships a registered inverse.

For SSSOM-TSV ⇄ Tier 1: yes, fully round-trippable, because SSSOM rows are pure tuples and the NoteMap is template-only.

For OSCAL-JSON ⇄ Tier 1: round-trippable for the structural skeleton (id, title, family, links). The prose `body` regions round-trip iff the recipe pins them to named OSCAL `parts[name=...]` (which `bodyFromOscal` does). Free-form prose edits in the vault are reflected back into the right `parts[name=...]` slot. Edits that change the *set* of parts require a `put`-direction policy decision (lens approach: refuse; quotient-lens approach: canonicalize).

For STRM-TSV ⇄ Tier 1 wikilinks: round-trippable by construction, because the `wikilink[role=crosswalk_*]` sink is an injection.

**Architectural recommendation:** add an optional `bidirectional: true` flag at the NoteMap level. When set, the recipe compiler statically rejects Term forms that do not have a registered inverse, and emits a synthesized `put` direction. This is implementable in pure TypeScript with no Boomerang dependency, because we only need the *fragment* of lens theory that covers template + reference + registered-inverse — a few hundred lines, well within the 1.2 MB budget. We get the lens guarantee where it matters (SSSOM, OSCAL skeletons, STRM edges) without committing to lens combinators as the surface DSL.

---

## 6. Migration path from v0.1 ad-hoc ImportRecipe

The migration is mechanical because every v0.1 concept has a v0.2 home:

| v0.1 concept | v0.2 primitive |
|--------------|----------------|
| Column-role `id` | `path: { template: "...${reference:idCol}..." }` |
| Column-role `label` | `frontmatter: { title: { reference: "labelCol" } }` |
| Column-role `body` | `body: [{ region: "## Body", from: { reference: "bodyCol" } }]` |
| Column-role `hierarchy` | `wikilinks: [{ role: parent, target: ..., join: { ... } }]` |
| Column-role `property` | `frontmatter: { propName: { reference: "propCol" } }` |
| Column-role `edge_target` | `wikilinks: [{ role: "crosswalk_edge_target", target: ... }]` |
| Column-role `metadata` | `frontmatter: { _meta: { ... } }` (reserved namespace) |
| Column-role `ignore` | omitted from any Term reference |
| Each of 24 transform types | one entry in the top-level `functions:` block, with `kind: grel`/`regex`/`split`/`lookup`/etc. |
| JSONata escape hatch | `function: { kind: jsonata, expr: ... }` (unchanged semantics) |
| Output config | absorbed into the four sinks |

A v0.1 → v0.2 transpiler is straightforward — perhaps 600 lines of TypeScript — because the v0.1 model is already a structurally-poorer subset of v0.2. Existing v0.1 recipes can be auto-upgraded; v0.2 recipes can target v0.1 runtimes for one or two minor versions via a compatibility downgrader that rejects features outside the v0.1 envelope (`Join`, multi-source recipes, `bidirectional`, `extends`).

The plugin's bundle picks up:

- The recipe parser/validator: pure TS, ~150 KB.
- A minimal RML/YARRRML interpreter retargeted to NoteMap (we *don't* embed `@comake/rmlmapper-js` because it produces RDF triples and pulls in N3/JSON-LD libs; instead we implement only the I1–I5 fragment we need): ~250 KB.
- JSONata as a lazy-loaded peer dep (`jsonata` minified is ~140 KB and loaded only when a recipe uses it).
- A small set of FNML/GREL built-ins reimplemented in TS: ~80 KB.

Total well under the 1.2 MB target and no JVM/WASM dependency.

---

## 7. What we'd lose

Honestly: very little, but not nothing.

1. **Imperative escape hatches.** v0.1 effectively allowed an "anything goes" JS function as a transform. v0.2 still allows JS arrows in the `functions:` block but forces them to be sandboxed, declared up-front, and named. Recipes that depended on side-effectful JS (e.g. fetching live data mid-import) lose that capability — which is the *correct* loss, because such recipes are not reproducible and not version-controllable, violating constraint #1.

2. **Fully unconstrained transform composition.** v0.1 transforms could chain in any order at any column. v0.2 enforces that composition is explicit (`function: { kind: ..., args: [{ function: ..., args: [...] }]}`) which is more verbose for deep chains. The mitigation: a JSONata function is one declaration that handles arbitrarily deep chains in a single string.

3. **Implicit hierarchy inference.** v0.1's `hierarchy` column-role auto-built parent links from a delimiter convention. v0.2 makes the join explicit. This is more verbose for the simple case but vastly clearer when sources disagree about hierarchy or when hierarchy comes from a side-table — which is the normal case for OSCAL and for any framework with a separate families list.

4. **No first-class lens algebra.** We deliberately do not adopt Boomerang combinators. Recipes that wanted Boomerang's `Kleene-star` and reorderable-chunks-with-keys for deep ordered-list bidirectional edits will not get them. We expose round-tripping only as a `bidirectional: true` contract on supported Term shapes. For Crosswalker's GRC use cases this appears to be a non-issue; if it becomes an issue, a future v0.3 can add a `lens:` block as an optional, opt-in deep-bidirectional mode.

---

## 8. Adversarial sanity check — cognitive-load tradeoff, honestly

The strongest adversarial case against this verdict runs as follows: *"You are forcing every recipe author to learn an RML/YARRRML-flavored mental model when a flat list of column-role assignments worked fine for 80% of cases. You have replaced 'ImportRecipe is a config file' with 'ImportRecipe is a tiny declarative programming language.'"* This is a real cost and worth being explicit about.

**Where the cost lands.** The 90% case — a single CSV with id/label/body/property columns, no hierarchy, no joins, no functions — is now ~15 lines of YAML instead of ~10. That's a real but small regression. The 10% case — multi-source, hierarchical, transforms — is now *dramatically* simpler and verifiable instead of ad-hoc.

**Mitigations.**
1. Ship a "starter dialect" that auto-fills `referenceFormulation`, omits `iterator` for CSVs, and lets authors write column-role-style top-level keys (`id:`, `label:`, `body:`, `properties:`) which the loader desugars into the canonical `path`/`frontmatter`/`body` sinks. The 90% case stays ~10 lines.
2. Reuse the YARRRML toolchain. Matey, `yarrrml-parser`, and `gen-yarrrml` already exist and have a community; an author who learns Crosswalker recipes has transferable skills.
3. Provide `gen-recipe-from-csv` (the inverse-mapping problem; the 2025 ReMap paper at CEUR-WS Vol-3999 demonstrates this is automatable for CSV→RML and gives us an algorithm to crib).

**Where the cost is unavoidable.** Joins are joins. If your import has cross-source references, you need to write them down somewhere; YARRRML/RML's syntax is the simplest declarative form for them in the literature. There is no formalism that makes joins free.

**Net assessment.** The cognitive load goes up by perhaps 20% on simple recipes and goes *down* substantially on complex recipes, while the foundation goes from ad-hoc to having three independent theoretical justifications (s-t tgds, MTTs, and functorial migration all licensing the same primitive set). This is a good trade.

---

## 9. Summary in one sentence

The first-principles primitive for the import side is a **`(Source, Term, Map, Join, Function)` 5-tuple producing into a `(path, frontmatter, body, wikilink)` 4-sink output algebra** — which is RML/YARRRML's algebraic core retargeted from RDF triples to Tier 1 Notes, justified by data-exchange theory's s-t tgds, expressible in TypeScript/Bun under the bundle budget, composable with STRM/SSSOM/Nemo/diff exactly as Crosswalker's existing primitives compose, and carrying optional lens-law guarantees on the round-trippable subset.
