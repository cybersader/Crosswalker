---
title: "Ch 29: Adversarial validation of the 7-primitive Layer-A query set"
description: "Fresh-agent research deliverable for Challenge 29. Adversarial validation of the candidate 7-primitive Layer A query verb set (filter / project / traversal / closure / anti-join / pivot / aggregate). Verdict: REVISE to 8 primitives. Drops standalone `closure` (folds into parameterized `traverse(depth=*)`), demotes `pivot` to Layer B (presentation, not value-producing), adds `bind` (computed columns; required for evidence-freshness queries), `set-op` (∪/∩/⊖; required for framework-overlap), and `diff` (versioned ontology delta; uniquely Crosswalker-essential for v0.1.8 audit-trail). Anchored to SPARQL 1.1, Codd relational algebra, Datalog, OLAP cube ops, GQL ISO/IEC 39075:2024, SSSOM, SKOS, NIST OLIR/IR 8477. Out of scope: OWL-DL reasoning, full SPARQL federation, CONSTRUCT graph-output."
tags: [research, deliverable, query-primitives, layer-a, sparql, datalog, olap, sssom, skos, ch-29]
date: 2026-05-09
sidebar:
  label: "Ch 29 · 8-primitive validation"
  order: -20260509.1
---

:::tip[Origin and lifecycle]
Fresh-agent research deliverable produced 2026-05-09 in response to [Challenge 29: Ontology-web query verbs adversarial validation](/crosswalker/agent-context/zz-challenges/29-ontology-web-query-verbs-validation/). Absorbed into the [Ontology-web query engine synthesis log](/crosswalker/agent-context/zz-log/2026-05-07-bases-query-layer-architecture-synthesis/) — see Settled #14 (revised) and #15 (new Layer A/B boundary). Preserved verbatim.
:::

# Adversarial Validation of the Crosswalker 7-Primitive Layer-A Query Set

**TL;DR**
- The 7-primitive set is **roughly correct in intent but wrong in shape**: keep `filter`, `traversal` (parameterized to subsume `closure`), `aggregate`, and `anti-join`; **demote `pivot` to Layer B**, **drop standalone `closure`** (it's `traversal` with a `*` quantifier), and **add three primitives** that real Crosswalker queries cannot decompose without: `union/difference` (set-ops), `bind` (computed columns / rename / projection-with-rename), and `diff` (ontology-version delta). `project` survives but only as a thin output-shaping primitive distinct from `bind`.
- The decision-ready final set is **8 primitives**: **filter, traverse, bind, aggregate, anti-join, set-op, diff, project** — anchored to relational algebra (Codd's six minus cross-product), SPARQL 1.1 (BGP/FILTER/MINUS/property-paths/aggregates/BIND), Datalog (recursion + stratified negation), and SSSOM (mapping predicates as edge labels for `traverse`).
- **Settled-item #14 should be revised**: replace "7 primitives including pivot, closure" with the 8-primitive set above; add a Layer A/B ruling table (pivot/sort/limit/rank are all Layer B); and add an explicit non-goal statement excluding OWL-DL reasoning, full SPARQL federation, and constraint-satisfaction.

---

## 1. Primitive × Standard Cross-Reference Matrix

Cells are marked **C** (covered, native first-class operator), **A** (approximate / expressible but not primitive), **M** (missing entirely / only via composition or extension). Rationale follows.

| Primitive ↓ / Standard → | SPARQL 1.1 | Datalog (Cozo/Nemo/Soufflé) | OLAP cube ops | SKOS | OWL 2 (out-of-scope ref) | SSSOM | Cypher / Gremlin / GQL | GraphQL | Codd Rel-Alg |
|---|---|---|---|---|---|---|---|---|---|
| **filter** | C (FILTER, BGP constraints) | C (rule body literals, comparison built-ins) | A (slice = filter on 1 dim; dice = filter on N) | A (no FILTER, but filtered access by predicate) | A (class-restriction is a filter under reasoning) | C (predicate_id, confidence thresholds drive filtering) | C (WHERE in MATCH/RETURN, has() in Gremlin) | A (resolver args ≠ true relational filter) | C (σ selection) |
| **project** | C (SELECT var-list) | A (rule heads project; no rename) | A (cube → table is implicit projection) | M (SKOS has no result-shape) | M (out of scope) | A (mapping table columns) | C (RETURN var, AS in Cypher; select() in Gremlin) | C (field selection IS the language) | C (π projection) |
| **traversal** (1-hop) | C (BGP triple pattern) | C (literal in rule body) | M (cubes have no edges; drill-across is closest) | C (broader/narrower/related/Match family ARE traversal edges) | C (object property assertion) | C (predicate_id IS the traversal edge type) | C (MATCH (a)-[:R]->(b); out('R') in Gremlin) | C (nested resolver = traversal step) | A (θ-join over edge relation) |
| **closure** (transitive *) | C (property paths `r*`, `r+`) | C (recursive rules — central feature) | M (no transitive op on dimensions) | A (skos:broaderTransitive declared but not asserted; closure is application duty) | A (TransitiveObjectProperty axiom — but full reasoning out of scope) | A (declared per-predicate via `mapping_set_id` chains; not a SSSOM op) | C (variable-length `[*1..n]`; QPP) | M (not in spec; needs custom resolver) | M (not first-order; α-extension needed) |
| **anti-join** | C (MINUS, FILTER NOT EXISTS) | C (stratified negation — `not p(x)`) | M (no native; expressible via set-ops) | M (no native) | A (ComplementOf — but reasoning) | M (predicate_modifier "not" is metadata, not a query op) | A (WHERE NOT EXISTS; Cypher MATCH ... WHERE NOT (a)-[]->(b)) | M (no native) | A (derivable from − and ⨝; not primitive) |
| **pivot** | M (no native; subquery + GROUP BY composition) | M (no native; recursive aggregation patterns) | C (canonical cube op — rotate axes) | M (no native) | M (out of scope) | M (presentation concern) | M (no native; GQL has no PIVOT) | M (presentation concern) | M (not in Codd; SQL extension only) |
| **aggregate** | C (COUNT/SUM/AVG/MIN/MAX/GROUP BY/HAVING) | C (rule heads with aggregate functions; many engines) | C (roll-up = aggregate over hierarchy) | M (no aggregation in vocabulary) | M (out of scope) | A (mapping density / confidence stats are aggregates over rows) | C (count/sum/group() in Gremlin; aggregating functions in Cypher/GQL) | A (computed via resolver, not declarative) | A (not in original 8; standard extension γ) |

**Rationale highlights.**

- **SPARQL is the most complete reference standard**: every primitive except `pivot` has a first-class operator (BGP/path/FILTER/MINUS/COUNT/GROUP BY). SPARQL multiset semantics map exactly to a multiset relational algebra of \{π, σ, ⨝, ∪, \\\} per Angles & Gutierrez (2016) — i.e., 5 primitives plus property paths add `closure`. That's 6, plus aggregate = 7. SPARQL itself is the strongest external evidence that the right number is in the 6-8 range.
- **Datalog covers everything except pivot**, but folds `closure` and `traversal` into "rule body + recursion." Stratified negation gives `anti-join`; rule heads with aggregate functions (Soufflé, Cozo, Nemo) give `aggregate`. Datalog is the strongest argument that **`closure` is not a separate primitive** — recursion just happens to be allowed in `traverse`.
- **OLAP** is the *only* standard with native `pivot`. Notably, OLAP also has `slice`/`dice` (= filter), `roll-up` (= aggregate), `drill-down` (= traverse downward in a hierarchy = closure on `narrower`). OLAP's pivot is rotating axes for display — a Layer B concern when transplanted to an ontology web.
- **SKOS** contributes the *vocabulary* of edges (`broader`/`narrower`/`broadMatch`/`exactMatch`/etc.) consumed by `traverse` and `closure`. The W3C SKOS reference is explicit that `skos:broader` is **deliberately not transitive**; only `skos:broaderTransitive` is, and "by convention is not used to make assertions" — meaning closure is a *query-time* operation, not a stored fact. This validates `traverse(predicate, depth=*)` as a Layer A primitive.
- **OWL 2** is explicitly out of scope per the task's anti-patterns. Property chain axioms and class subsumption go *beyond* `closure` into reasoning. Crosswalker should not implement them; transitive-property entailment must be approximated by user-invoked `traverse(*)`.
- **SSSOM** is a *data model*, not a query language. It contributes `predicate_id`, `confidence`, `mapping_justification`, and `mapping_tool` as **filterable columns** and as **edge labels** — but it has no notion of pivot, aggregation, or anti-join. SSSOM defines the shape of the graph that the primitives operate on; STRM (NIST IR 8477) is the analogous shape for GRC crosswalks and uses set-theoretic relationships (subset-of, intersects-with, equal, superset-of, no-relationship) — these are *predicate values* for `traverse`, not new primitives.
- **Cypher / Gremlin / GQL**: all three center on traversal patterns + filter + return-projection. None has native pivot; GQL (ISO/IEC 39075:2024) deliberately matches MATCH/FILTER/LET/ORDER BY/LIMIT/RETURN as core. Gremlin's ~30 steps reduce to map / flatMap / filter / sideEffect / branch — which is essentially `traverse + filter + bind + aggregate`.
- **GraphQL** is a *resolver protocol*, not a query algebra. Field selection ≈ `project`; nested resolvers ≈ `traverse`; field arguments ≈ weak `filter`. It cannot do anti-join, closure, pivot, or aggregate declaratively. It is best treated as a *Layer C* output protocol, not a primitive source.
- **Codd's relational algebra**: the canonical primitive set is \{σ, π, ρ, ×, ∪, −\} (5 + rename); ⨝, ∩, ÷ are derived. Notably **anti-join is derivable** from − and ⨝, but real engines treat it as primitive for performance; SPARQL elevates it to MINUS / FILTER NOT EXISTS for the same reason. This is the precedent for Crosswalker keeping `anti-join` as Layer A.

---

## 2. Missing-Primitive Evaluation

Decision rule used throughout: a primitive enters Layer A iff (a) at least one real Crosswalker query needs it, (b) it cannot be expressed as a short, natural composition of the other primitives, and (c) at least two of \{SPARQL, Datalog, OLAP, Codd, GQL, SSSOM\} treat it as first-class.

| Candidate | Verdict | Rationale |
|---|---|---|
| **diff** (ontology v1 vs v2) | **YES — add** | Real query #7 ("terms removed between OBO 2024-Q1 and 2024-Q2") cannot be expressed as `anti-join` alone because the operands live in *different ontology versions*, not different relations within one graph. Naïvely composing as `traverse(v1) anti-join traverse(v2)` requires snapshot semantics that the rest of the algebra does not provide. The OWL-Manchester `ecco`, CODEX, and DynDiff tools all treat ontology-diff as a first-class operation, generating typed change records (added/removed/strengthened/weakened class, axiom, mapping). For Crosswalker's audit-trail use case (v0.1.8) this is a primitive. Anchor: Unix `diff`, `git diff`, OWL-ecco. |
| **rank** (relevance / similarity scoring) | **NO — reject for Layer A** | Vector / embedding ranking is a *value-producing* operation (each row gets a score), which is the same shape as `bind` (computed column). Once you have scores you can `filter score > τ` and `sort/limit` (Layer B). Cozo's HNSW vector search is reachable from inside Datalog as just-another-relation. Treating ranking as `bind` keeps the algebra mechanism-neutral; treating it as a primitive bakes embeddings into Layer A and conflicts with the "engine-neutral" requirement. |
| **constraint-satisfy** (OWL-DL "concepts satisfying class def") | **NO — reject (out of scope)** | Explicit anti-pattern in the task brief. Crosswalker is a markdown vault with crosswalk tables, not a reasoner. If a user wants this, they invoke an external reasoner that produces additional `skos:exactMatch` triples; those triples then become input data for `traverse`. |
| **temporal primitives** (snapshot / point-in-time / change-feed) | **PARTIAL — fold into `diff`** | "Snapshot at time t" is a parameter to every primitive (read-vault-as-of), not a separate operator. "Change feed" is the stream of `diff(t, t+1)` outputs. Audit-trail does not require new primitives; it requires (a) `diff` as a primitive and (b) versioned input addressing as a query parameter. Reject as standalone. |
| **set operations** (∪, ∩, ⊖) | **YES — add as one primitive `set-op`** | Codd has them; SPARQL has UNION; SSSOM mapping merging requires them; the framework-overlap query ("controls in both NIST and CIS") and quality-assurance comparisons need union/intersection of result-sets. They are *not* compositional — you cannot get ∪ from \{filter, traverse, aggregate, anti-join\} because anti-join is one-sided. Combine ∪/∩/⊖ into a single parameterized `set-op(left, right, mode)` to keep the count down; symmetric difference is `(A ∪ B) − (A ∩ B)`, so it can stay derived. |
| **projection-with-rename** | **NO — fold into `bind`** | A projection with rename is `bind(new_name = old_name); project(new_name)`. SPARQL spells this `(?old AS ?new)` inside SELECT, which is exactly the algebra `Extend(P, ?new, ?old)`. No reason for a separate primitive. |
| **window functions** | **NO — reject for Layer A; expose at Layer B** | "Running totals", "rank within partition" are presentation/analytics concerns over a result set. SQL added them as syntactic sugar; SPARQL still does not have them. Adding them invites scope creep toward analytics. The single legitimate use case in Crosswalker (mapping density per framework) is already an `aggregate(group=framework)`. |
| **constraint propagation** | **NO — reject (out of scope)** | This is reasoning, not querying. Same fate as `constraint-satisfy`. |
| **OPTIONAL / left-join** | **NO — fold into `traverse(optional=true)`** | SPARQL's OPTIONAL is left-outer-join. In an ontology-web context, "give me each control plus its evidence if any" decomposes to `traverse(:hasEvidence, optional=true)`. Making OPTIONAL a separate primitive doubles the surface area of `traverse`. Parameterize instead. |
| **CONSTRUCT / graph-output** | **NO — Layer B (or Layer C: serialization)** | Producing an RDF graph or a markdown rollup from a result set is an output-shape concern. Same role as OLAP `pivot` for tabular display. The query algebra produces relations; what the UI/exporter does with them is downstream. Crosswalker explicitly is "not a triple store," so CONSTRUCT semantics are non-goals. |
| **BIND / computed-column** | **YES — add** | Required for: confidence-threshold computations, predicate normalization (mapping `oboInOwl:hasDbXref` → `skos:closeMatch`), evidence-age calculations ("controls with evidence older than 1 year"). SPARQL elevates BIND to a primitive (`Extend` in the algebra); Datalog gets it via head-expressions; SQL has computed columns and AS. Without `bind`, evidence-freshness queries are inexpressible. |
| **subquery / nesting** | **NO — meta-property of the algebra, not a primitive** | The algebra is closed under composition by definition. Subquery support means "any primitive can take a primitive's output as input" — that is a property of the system, not a Layer A operator. Document it as such, do not add an operator. |
| **federation / SERVICE** | **NO — out of scope** | Crosswalker is a single-vault tool. Cross-vault or cross-endpoint federation is a deployment concern. Reject. |

**Net add list**: `diff`, `set-op`, `bind`. Net remove list: `closure` (subsumed by parameterized `traverse`), and `pivot` (demoted to Layer B).

---

## 3. Redundant or Wrong-Abstraction Evaluation

### `project` — Layer A or Layer B?

**Verdict: keep at Layer A, but minimally.** The argument for demoting it: Codd's π and SPARQL's SELECT are both relation-shaping, and a "view shape" (Layer B) plausibly subsumes them. But three things keep `project` in Layer A: (1) projection changes *cardinality* under set semantics (deduplication after column drop), which is observable in subsequent operators, not just in display; (2) every external standard has it; (3) it is the natural counterpart of `bind` (one adds columns, the other removes/selects). What is *not* Layer A is "render this column as a chip with this color" — that's Layer B. Final framing for Layer A: `project(cols) := output-relation has exactly these columns`.

### `aggregate` — Layer A or Layer B?

**Verdict: Layer A.** Aggregation produces rows that did not exist as input rows; it is value-producing, not display-shaping. Pushing aggregation into Layer B would force every UI-shape to re-derive group counts, breaking compositionality (you cannot then `filter count > 5` after the aggregate). SPARQL's choice (GROUP BY/HAVING in the language) and Codd-extended algebra's γ-operator both confirm. Keep.

### `traversal` vs `closure` — one parameterized primitive?

**Verdict: one primitive `traverse(predicate, depth=k|*)`.** Strong evidence: (a) Cypher and GQL collapse them into a single MATCH with a `*1..n` quantifier; (b) SPARQL property paths use a single grammar with `r`, `r+`, `r*`, `r?` as parameters; (c) Datalog treats them identically (a recursive rule is just a non-recursive rule in the limit); (d) the only standards that *do* separate them are pedagogical (textbook closure-vs-edge). Two primitives where one suffices is exactly the Layer-A bloat the task warned against. Collapse.

### `pivot` — primitive or composition?

**Verdict: not Layer A. Demote to Layer B (view-shape).** Three independent arguments converge:
1. **Compositional**: Pivot decomposes into `aggregate(group=row_dim, group=col_dim, fn=agg) → reshape rows-to-columns`. The reshape step is purely display.
2. **No analog in graph standards**: Cypher, Gremlin, GQL, SPARQL, SSSOM all lack pivot. Only OLAP and SQL extensions have it, and both treat it as report-shaping.
3. **Wrong domain**: Crosswalker queries a graph of crosswalk mappings, not a multidimensional cube. The few queries that "need pivot" (e.g., NIST-vs-CIS coverage matrix) actually want a Layer B *table view* over the result of an `aggregate(group=control, group=framework)`. The pivot is the renderer, not the query.

### `anti-join` — primitive or compositional?

**Verdict: keep as Layer A primitive even though theoretically derivable.** Codd's algebra derives anti-join from `−` plus `⨝`. But:
- SPARQL elevates it (MINUS, FILTER NOT EXISTS) because optimizers handle it specially.
- Datalog cannot encode anti-join *at all* without stratified negation as a first-class concept.
- Real Crosswalker queries (#1, #5, #7) are dominated by anti-join — coverage gaps, missing mappings, removed terms. Forcing users to write `set-op(left, ⊖, traverse(...))` is awkward and the optimizer cannot push the negation as efficiently.
- The hidden cost of "deriving" anti-join: NULL-handling semantics differ (see Oracle's null-aware anti-join patent). Making it explicit pins down semantics.

Keep.

### Goal: smallest *complete* set

The minimum complete set we are converging on is **8 primitives**:
**filter, traverse, bind, project, aggregate, anti-join, set-op, diff**.
(7-primitive options that drop `set-op` or `diff` fail real queries; 9+-primitive options add `closure` or `pivot` redundantly.)

---

## 4. Layer A / Layer B Boundary Ruling

Layer A operators change the **value or cardinality** of the result. Layer B operators change the **presentation** of an already-determined result and are reversible / referentially transparent w.r.t. value.

| Operator | Ruling | Why | Awkwardness if misplaced |
|---|---|---|---|
| **pivot** | **Layer B** | Reorients axes for display; same underlying tuples. Aggregation already happened. | If Layer A: forces every downstream consumer to re-flatten before further filter/traverse. SPARQL/Cypher/GQL deliberately omit pivot — following them is correct. |
| **sort / order-by** | **Layer B** | Set semantics make ordering invisible; only matters when paired with `limit` (and even then, "top-k" is a Layer B view, not a query value). | If Layer A: forces optimizer to preserve order across joins, producing pessimistic plans. |
| **limit / pagination** | **Layer B** | Same value-set, different prefix shown. Even SPARQL classifies LIMIT/OFFSET as "solution modifiers," not query operators. | If Layer A: composing two queries where one has LIMIT becomes semantically chaotic. |
| **search relevance ranking** | **Split: scoring is `bind` (Layer A); top-k display is Layer B** | Scoring assigns a value to each row (legitimate `bind`); presenting "top 10 most similar" is Layer B (sort+limit). | If you treat ranking as one Layer A primitive: you re-introduce `pivot`-style category confusion (value-producing AND view-shaping in one op). Splitting keeps the algebra clean. |

**Examples of awkwardness when boundary is wrong**:
- *Pivot in Layer A*: a user writes `pivot → traverse`. What does it mean to follow a `:hasEvidence` edge from a 2D pivot table? Nonsense. Layer B containment prevents this.
- *Sort in Layer A*: composing `sort(by=date) ⨝ filter(framework=NIST)` cannot be reordered, because the sort operator sees a different cardinality on each side. Optimizer breakage.
- *Rank in Layer A as one op*: you cannot then `filter rank < 0.7`, because you'd need to project the rank value out first — meaning rank-as-primitive secretly is a `bind`+`sort` already.

---

## 5. Re-Audit Against Real Crosswalker Queries

Each row below decomposes the canonical query into the proposed 8-primitive set. ❗ flags awkwardness; ✅ flags clean fit.

| Query | Decomposition | Verdict |
|---|---|---|
| 1. Coverage gaps: NIST 800-53 controls without evidence | `traverse(rdf:type=Control, framework=NIST-800-53) anti-join traverse(:hasEvidence, optional=false)` | ✅ Native fit; anti-join is essential. |
| 2. Crosswalk chain NIST CSF → 800-53 → ISO 27001 (transitive) | `traverse(:mapsTo \| skos:exactMatch, depth=*, start=CSF, frameworks=\{CSF,800-53,ISO27001\})` | ✅ Closure-as-parameterized-traverse fits cleanly. STRM/SSSOM predicate restricts edge type. |
| 3. MITRE ATT&CK techniques mitigated by NIST AC-family controls | `filter(family=AC) → traverse(:mitigates, target_framework=ATT&CK)` then `project(technique_id, control_id)` | ✅ Filter-then-traverse is the canonical pattern. |
| 4. SKOS broader/narrower closure from a top-level heading | `traverse(skos:narrower, depth=*, start=TopHeading)` | ✅ Clean. Note: must NOT use SKOS reasoning entailment; just walk the asserted edges. |
| 5. OBO Foundry GO terms with no MONDO mapping | `traverse(rdf:type=GOTerm) anti-join traverse(skos:exactMatch \| skos:closeMatch \| oboInOwl:hasDbXref, target=MONDO)` | ✅ Anti-join with predicate-set parameter. SSSOM lets us specify the predicate set explicitly. |
| 6. OLIR crosswalks with inconsistent confidence values | `traverse(:hasMapping) → bind(disagreement = max(conf) - min(conf) per (subject,object)) → filter(disagreement > τ)` | ❗ Uses `bind` essentially. Without `bind` this is *not expressible*. Strongest evidence for adding `bind`. |
| 7. Ontology version diff: terms removed between OBO 2024-Q1 and 2024-Q2 | `diff(v1=2024-Q1, v2=2024-Q2, kind=removed_terms)` | ❗❗ Without `diff` primitive, this becomes `set-op(traverse(v1) ⊖ traverse(v2))` which requires versioned snapshot semantics outside the algebra. Strongest evidence for adding `diff`. |
| 8. Framework overlap: controls in both NIST and CIS | `set-op(traverse(framework=NIST), ∩, traverse(framework=CIS))` keyed on `skos:exactMatch` co-membership | ❗ Without `set-op`, you'd write a contrived double-anti-join. Strongest evidence for adding `set-op`. |
| 9. Mapping density (avg mappings per control per framework) | `traverse(:hasMapping) → aggregate(group=control, group=framework, fn=count) → aggregate(group=framework, fn=avg)` | ✅ Two-stage aggregate. Note: a UI may *display* this as a pivot; the query itself does not pivot. |
| 10. Evidence freshness (controls w/ evidence > 1 year old) | `traverse(:hasEvidence) → bind(age = now − evidence.date) → filter(age > 365d)` | ❗ Requires `bind`. |

**Vestigial primitives**: in this audit, `pivot` is never used in any query — confirming Layer-B demotion. `closure` as separate primitive is also never used — `traverse(*)` covers all cases.

**Primitives that real queries demand and that the original 7-set lacks**: `bind` (queries 6, 10), `set-op` (queries 8 and any union of result sets), `diff` (query 7).

---

## 6. Worked Composition Examples

Notation: `T(p, depth=k)` = traverse predicate `p` to depth `k` (`*` = transitive); `F(cond)` = filter; `B(name=expr)` = bind; `P(cols)` = project; `G(group, fn)` = aggregate; `\\` = anti-join; `∪/∩` via `set-op`; `D(v1, v2, kind)` = diff.

**Q1. Coverage gaps (NIST 800-53 controls without evidence)**
```
F(framework="800-53" ∧ type=Control)
  \\ T(:hasEvidence, depth=1)
  → P(control_id, control_name)
```

**Q2. Crosswalk chain CSF → 800-53 → ISO 27001 (transitive)**
```
F(framework="NIST-CSF")
  → T(:mapsTo | skos:exactMatch | skos:closeMatch, depth=*,
       restrict_path={CSF→800-53, 800-53→ISO27001})
  → P(csf_id, control_800_53_id, iso_27001_id, hops, confidence_min)
```

**Q3. MITRE ATT&CK techniques mitigated by NIST AC-family controls**
```
F(framework="800-53" ∧ family="AC")
  → T(:mitigates, depth=1, target_framework="ATT&CK")
  → P(control_id, technique_id, technique_name)
```

**Q4. SKOS broader/narrower closure from a top-level subject heading**
```
F(uri = TopHeading)
  → T(skos:narrower, depth=*)
  → P(concept_id, prefLabel, depth_from_root)
```
Note: depth as a derived column requires `B(depth_from_root = path_length)`; this is the second small piece of evidence that `bind` is unavoidable.

**Q5. OBO/GO terms with no MONDO disease mapping**
```
F(ontology=GO)
  \\ T(skos:exactMatch | skos:closeMatch | oboInOwl:hasDbXref,
        depth=1, target_ontology=MONDO)
  → P(go_id, go_label)
```

**Q6. OLIR crosswalks with inconsistent confidence values**
```
T(:hasMapping)
  → G(group=(subject, object),
      fn={n=count(), conf_max=max(confidence), conf_min=min(confidence),
          predicates=collect(predicate_id)})
  → B(disagreement = conf_max - conf_min)
  → F(n > 1 ∧ (disagreement > 0.3 ∨ size(distinct(predicates)) > 1))
  → P(subject, object, n, disagreement, predicates)
```
Without `bind`, the `disagreement` column cannot exist. Without aggregate, neither can `n` and the min/max. **This query alone justifies adding `bind` as Layer A.**

**Q7. Ontology version diff: terms removed between OBO 2024-Q1 and 2024-Q2**
```
D(v1="OBO-2024-Q1", v2="OBO-2024-Q2", kind=removed_terms)
  → P(term_id, prefLabel_at_v1, last_seen_version)
```
The composition-without-`diff` alternative is:
```
T(rdf:type=Term, source=v1) \\ T(rdf:type=Term, source=v2)
```
which **silently fails** because:
(a) it requires the algebra to address two versioned worlds simultaneously — semantically novel;
(b) it cannot distinguish "removed" from "renamed" or "merged into another concept" — distinctions DynDiff/CODEX/ecco treat as primitive change types;
(c) it cannot produce the change *characterization* (effectual vs. ineffectual, strengthening vs. weakening axiom changes) that audit-trail consumers need.
**This query alone justifies adding `diff` as Layer A.**

**(Bonus) Q8. Framework overlap (NIST and CIS)**
```
set-op(
  T(framework=NIST, type=Control) → T(skos:exactMatch, depth=1, target=CIS),
  ∩,
  T(framework=CIS,  type=Control) → T(skos:exactMatch, depth=1, target=NIST)
) → P(nist_id, cis_id, confidence)
```
Without `set-op`, you would have to express ∩ via two anti-joins, which is contrived. **This query justifies adding `set-op`.**

---

## 7. Final Deliverables

### 7.1 Final Primitive Set (8)

| # | Primitive | Plain-language framing | Cross-domain anchor |
|---|---|---|---|
| 1 | **filter** | "Keep only the rows that satisfy this condition." | σ (Codd); FILTER (SPARQL); WHERE (SQL/Cypher/GQL); rule-body literal (Datalog); slice/dice (OLAP). |
| 2 | **traverse** *(parameterized: predicate-set, depth=`k`\|`*`, optional)* | "Walk these edges, possibly transitively, possibly leaving rows that have no neighbor." | BGP + property paths (SPARQL); MATCH + var-length (Cypher/GQL); out()/in() steps (Gremlin); recursive rule (Datalog); broader/narrower/match (SKOS); SSSOM `predicate_id`; STRM relationship. |
| 3 | **bind** *(computed column / rename)* | "Add a new column whose value is computed from existing columns." | BIND/Extend (SPARQL); rule head expression (Datalog); SELECT … AS / computed columns (SQL); LET (GQL). |
| 4 | **project** | "Keep only these columns; drop the rest." | π (Codd); SELECT var-list (SPARQL); RETURN (Cypher/GQL); field selection (GraphQL). |
| 5 | **aggregate** *(group-by + reduction)* | "Group rows by these keys; reduce each group with this function." | γ (extended algebra); GROUP BY / aggregates (SPARQL/SQL); aggregation rule heads (Datalog); roll-up (OLAP). |
| 6 | **anti-join** | "Keep rows from the left that have no match on the right." | MINUS / FILTER NOT EXISTS (SPARQL); stratified negation (Datalog); WHERE NOT EXISTS (SQL/Cypher); − ⨯ ⨝ pattern (Codd, derived). |
| 7 | **set-op** *(∪, ∩, ⊖)* | "Combine two compatible result-sets by union, intersection, or symmetric difference." | UNION / + difference (SPARQL/Codd); UNION/INTERSECT/EXCEPT (SQL); set ops (Datalog, GQL). |
| 8 | **diff** *(versioned ontology delta)* | "Compare two snapshots of the ontology and emit typed changes (added/removed/strengthened/weakened/renamed)." | OWL ecco; CODEX; DynDiffOnto; PROMPTDIFF; `git diff`. *Note: this is uniquely Crosswalker-essential and has no exact analog in pure query languages — that's the point.* |

Removed from candidate list: `closure` (now `traverse(depth=*)`), `pivot` (Layer B).

### 7.2 Layer A / Layer B Ruling

| Concern | Layer | One-sentence justification |
|---|---|---|
| filter, traverse, bind, project, aggregate, anti-join, set-op, diff | **A** | Value- or cardinality-changing operations on the ontology web. |
| pivot, sort, limit/pagination, top-k presentation | **B** | Reshaping or windowing of an already-determined result for display. |
| relevance scoring | **A as `bind`**; **top-k as B** | Score is a value (Layer A); selecting top-N for display is Layer B. |
| graph output (CONSTRUCT-style) / table view / pivot table / kanban | **B** (or Layer C if serialization-specific) | Renderer responsibility. |
| OWL-DL reasoning, constraint satisfaction, federation | **out of scope** | Explicit non-goals; consume reasoner output as input data instead. |

### 7.3 Recommended Changes to Synthesis-Log Settled-Item #14

**Before (per task brief, item #14 is the prior 7-primitive Settled item):**
> Layer A query primitives = \{filter, project, traversal, closure, anti-join, pivot, aggregate\}.

**After (recommended replacement text):**

> **#14 (revised).** Layer A query primitives = **\{filter, traverse, bind, project, aggregate, anti-join, set-op, diff\}** (8 mechanism-neutral operators).
>
> *Notes attached to the item:*
> 1. `traverse(predicate, depth=k|*, optional=true|false)` is one parameterized primitive that subsumes both single-hop edge-following and transitive-closure walks (depth=`*`). The previous separate `closure` primitive is removed; SPARQL property paths, Cypher variable-length patterns, and Datalog recursion all confirm the unification.
> 2. `pivot` is **Layer B** (visual presentation), not Layer A. Likewise `sort`, `limit`, top-k display, and CONSTRUCT-style graph output.
> 3. `bind` (computed columns / rename) is added because evidence-freshness, confidence-disagreement, and depth-annotation queries are inexpressible without it.
> 4. `set-op` (∪ / ∩ / ⊖) is added because framework-overlap and result-set merging cannot be reduced to anti-join.
> 5. `diff` is added as a Crosswalker-specific primitive for ontology version comparison (audit-trail v0.1.8 use case). It is parameterized by `(v1, v2, kind ∈ \{added, removed, strengthened, weakened, renamed\})`.
> 6. `rank`, `window`, `OPTIONAL`, `subquery`, `federation`, `constraint-satisfy`, `temporal-snapshot` are **rejected** as separate primitives. They are either compositional (`rank` = `bind` + sort/limit; `OPTIONAL` = parameter on `traverse`), out-of-scope (federation, OWL-DL), or properties of the algebra rather than operators (subquery / nesting / closure-under-composition).
> 7. The set is **not** engine-specific. Implementations may use Datalog (Cozo, Nemo), SPARQL (Oxigraph), DataFusion + DuckPGQ, or pure JS over markdown frontmatter — the primitives translate to each.
> 8. Anchored standards: SPARQL 1.1 (W3C), SKOS (W3C), SSSOM, NIST OLIR / IR 8477 STRM, Codd relational algebra, OLAP cube ops, GQL ISO/IEC 39075:2024. Out of scope: OWL 2 DL reasoning, full SPARQL federation/SERVICE, full SPARQL CONSTRUCT semantics.

---

## Recommendations (Staged)

**Stage 1 — Adopt the 8-primitive set in the synthesis log this revision.**
- Update Settled-item #14 with the text above.
- Add a one-line non-goals statement: "OWL-DL reasoning, constraint propagation, full federation, and CONSTRUCT graph-output are out of scope."
- Trigger to revisit: if any new representative query is found that none of the 8 primitives can express in ≤4 composed steps.

**Stage 2 — Build the test harness around the 10 representative queries in §5.**
- Each query should be expressible as a primitive composition tree of depth ≤ 4.
- Threshold to add a new primitive: ≥2 distinct real queries require the same workaround pattern of length ≥ 4 — and that pattern has cross-domain precedent.

**Stage 3 — Implement Layer A on a Datalog backend (Cozo or Nemo) first, not SPARQL.**
- Datalog gives recursion, stratified negation, and aggregation in a single coherent semantics.
- Cozo additionally gives transactional embedded operation (matches Obsidian's vault model) and HNSW vector indices reachable from the same query (covers the future `bind(score=cosine(…))` case without adding primitives).
- Oxigraph remains an option if SSSOM/RDF round-tripping becomes the dominant use case; revisit if >50% of vault content arrives as RDF rather than markdown frontmatter.

**Stage 4 — Implement Layer B as a thin renderer over Layer A.**
- pivot, sort, limit, top-k, and the graph/table/kanban views consume Layer A results.
- Trigger to reconsider boundary: if a Layer B feature requires re-issuing the Layer A query with different parameters more than once per render, that feature is secretly Layer A and needs to be examined.

**Stage 5 — Defer `diff` until v0.1.8 (audit trail) work begins.**
- Until then, scaffolding-only (interface defined, implementation = unimplemented). The cost of leaving it on the primitive list now is zero; the cost of discovering it should have been Layer A *after* shipping is high.

---

## Caveats

- **"Smallest complete" is empirical, not provable.** Codd showed his 5 primitives are minimal for first-order relational queries; Crosswalker's 8 are *minimal-against-the-10-representative-queries-we-listed*. New queries may move the boundary. The 5-vs-8 gap reflects that Crosswalker's data model is a graph (needs `traverse`), is multi-versioned (needs `diff`), and serves analytics use cases (needs `aggregate` + `bind`).
- **`diff` is the most contestable inclusion.** A reasonable alternative architecture treats versioned snapshots as a *parameter dimension* applied to every primitive (read-as-of-version), making `diff` derivable as `set-op(read(v1) ⊖ read(v2))`. The argument for keeping `diff` Layer A is pragmatic (audit-trail consumers need typed change records, not raw set differences) rather than theoretically forced. If the audit-trail consumer is happy with raw deltas, demote `diff` and the set shrinks to 7.
- **SKOS, SSSOM, STRM contribute predicate vocabularies, not primitives.** Make sure Layer A is parameterized over a *configurable* predicate set rather than hardcoded SKOS terms — otherwise users with bespoke OLIR or STRM relationship vocabularies are second-class citizens.
- **OWL 2 transitive properties remain a tempting trap.** `skos:broaderTransitive` is technically reasoning, not closure-walking; the W3C SKOS spec deliberately blurs this. Crosswalker should commit to the asserted-graph-only interpretation: `traverse(skos:broader, depth=*)` walks asserted edges and does *not* invoke an OWL reasoner. Document this loudly.
- **`bind` opens a small door to expression-language scope creep.** Restrict it to: arithmetic, string ops, date arithmetic, and a small whitelist of similarity functions. Resist adding general user-defined functions until a real query forces it.
- **The proposed set is engine-neutral but not implementation-neutral.** A markdown-vault tool will not have native graph indices, so `traverse(depth=*)` over a 50k-node ontology web will need careful materialization or pruning strategies. This is an engineering concern, not a primitive-design concern, but it should not be hidden.
- **External standards used in the matrix evolve.** SPARQL 1.2 work (RDF-star, etc.), GQL revisions, and SSSOM minor versions could change the "covered/approximate/missing" cells over time. Re-audit when any of those publish a new edition.
