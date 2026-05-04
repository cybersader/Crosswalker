---
title: "Challenge 22 — Target-structure expressivity in import recipes"
description: "Adversarial fresh-agent deliverable on how recipes compose Obsidian's four hierarchy primitives (folder/heading/tag/wikilink) into target vault structure. Verdict: closed grammar of FIVE mechanisms (folder/file/heading/tag/wikilink) × ordered layout × also_emit cross-cutting × optional graph_edges. The single coupling point is a pure function `render(Recipe, ConceptIdentity) → Address` modeled on RML/R2RML's rr:subjectMap + rr:template pattern. Pass 1 vault-independent (deterministic, hashable, replayable); Pass 2 optional vault-state-aware link minimizer. Content addressing computed over canonical concept-identity store BEFORE render — target structure is a view, not canonical state — directly mirroring Nix's file-system-object/store-path separation. Frontmatter split into managed (recipe-owned, projected from canonical) and user_preserve (user annotations, never overwritten on re-render). 4-phase non-breaking migration from existing hierarchy column-role. Library-science framing: the four mechanisms map onto enumerative/sequential/faceted/associative classification — they are an Obsidian-flavoured re-derivation of Ranganathan's PMEST + ISO 25964 polyhierarchy + SKOS broader/narrower."
tags: [research, deliverable, target-structure, hierarchy-primitives, recipe-schema, render-function, content-addressing, library-science, ranganathan, iso-25964, skos, r2rml, rml, dendron, foam, seacow, folder-tag-sync, modularity]
date: 2026-05-04
sidebar:
  label: "Ch 22 · Target-structure expressivity"
  order: -20260504.5
---

# Challenge 22 — Target-Structure Expressivity in Crosswalker Import Recipes

## Executive answer

Target structure should be modeled as a **deterministic, recipe-driven projection of a canonical concept-identity store onto a vault**, expressed by a **closed grammar of four primitive hierarchy mechanisms** (folder, heading, tag, wikilink-graph) composed by a **per-level mechanism map** plus four small templating slots (path, anchor, tag, wikilink). The single coupling point is a pure function `render(recipe, identity) → Address`, modeled directly on RML/R2RML's `rr:subjectMap` + `rr:template` pattern. Content addressing should be computed over the canonicalized concept-identity store **before** rendering — addresses are a presentation-layer projection, not part of canonical state, exactly as Nix separates the file-system object graph from the store path that names it.

For v0.1, Crosswalker should ship a **two-mechanism** subset (folder + heading) with the full address-rendering function in place but only those two mechanisms wired up. Tag and wikilink-graph mechanisms slot in later as additional render strategies *without* schema-breaking migration, because the recipe schema reserves the level-to-mechanism mapping from day one. The current `hierarchy` column-role becomes a special case (`mechanism: folder`) of the new schema. This is neither over-engineered (the four mechanisms are forced by Obsidian's actual primitives, not invented) nor under-engineered (the canonical store / view split prevents recipes from ever painting the user into a corner).

---

## 1. The four hierarchy mechanisms — first-principles characterization

Obsidian gives a recipe author exactly four primitives by which a concept can be located. They are not interchangeable; each has a distinct ergonomic, scaling, and tooling profile.

### 1.1 Folder (filesystem path)
**Mechanics.** A concept becomes `Frameworks/NIST 800-53 r5/AC/AC-2.md`. Hierarchy is encoded by directory nesting; each level is a folder, the leaf is a file.

**Pros.** Native to every OS and tool; survives outside Obsidian; the file explorer renders it for free; trivially compatible with `git`, `rsync`, sync clients; cleanest `Dataview.list` queries (`FROM "Frameworks/NIST 800-53 r5/AC"`).

**Cons / hard limits.**
- **Windows MAX_PATH = 260 characters** for the full absolute path including drive letter. NIST 800-53 r5 with long control names can blow this when nested inside a OneDrive/SharePoint sync folder (`C:\Users\firstname.lastname\OneDrive - Org\Vaults\Compliance\…`). Long-Path support requires the user to opt in via Group Policy or registry, plus app manifest support, and even then many Obsidian plugins and underlying sync clients (OneDrive in particular) misbehave above 256 bytes. This is the *single biggest practical risk* for an all-folders recipe targeting government compliance vaults that live on managed Windows fleets.
- **Renames cascade.** Moving a folder rewrites every absolute wikilink that referenced its children. Obsidian rewrites short-form links automatically, but plugins that store paths (Templater, Dataview view scripts) do not.
- **Mono-hierarchy.** A file lives in exactly one folder. Polyhierarchy (the SCF "one control, many frameworks" use case) cannot be expressed.
- **Folder names must be filesystem-safe.** Reserved characters (less-than, greater-than, colon, double-quote, slash, backslash, pipe, question, asterisk on Windows; slash and NUL on POSIX), trailing dot/space on Windows, case-insensitive collisions on macOS APFS by default.

**Right choice when.** Each concept has exactly one canonical home; the user wants the file explorer as primary navigation; the framework has shallow nesting (4 levels or fewer) and short identifiers.

### 1.2 Heading (intra-file anchor)
**Mechanics.** A whole subtree lives in a single file, e.g. `NIST 800-53 r5.md` containing `## AC — Access Control` → `### AC-2 Account Management` → `#### AC-2(1) Automated System Account Management`. Addressing uses Obsidian's heading anchors: `[[NIST 800-53 r5#AC-2]]`, and Obsidian also supports the extended `[[Note#H1#H2]]` heading-range form.

**Pros.** Compact: one file holds the entire framework; reading flow is preserved (you can scroll the catalog like a document); export to PDF/HTML produces a single document; no MAX_PATH risk.

**Cons / limits.**
- Heading anchors are **resolved by literal text match after Obsidian's slugifier**. Two siblings with identical visible text (`### Description` under different controls) collide in the anchor namespace within a file unless disambiguated.
- **Backlinks land at file granularity by default** — Obsidian's backlink pane shows the whole containing file, not the heading. This degrades the "what evidence covers AC-2?" use case unless the user has Better Search Views or Strange New Worlds installed.
- Single-file vaults stress Obsidian's editor with very large frameworks (NIST 800-53 r5 is ~1100 controls — manageable in a single .md, but graph-view nodes for individual controls disappear because there *are* no per-control nodes).
- Headings are not first-class concepts in Dataview (you can query them with `dv.pages().file.headings` but not as primary entities).

**Right choice when.** The framework is read primarily as prose (a published standard text); the user wants a "single source-of-truth document" feel; control-level evidence linking is rare.

### 1.3 Tag (frontmatter and inline `#tag/sub/leaf`)
**Mechanics.** Files are flat (or organized for some other reason); hierarchy lives in nested tags `#framework/nist-80053r5/ac/ac-2`. Tags appear inline in body or as YAML list under `tags:` in frontmatter.

**Pros.** **Polyhierarchy for free** — a single file can carry `#framework/nist/ac-2` and `#framework/iso27001/A.9.2.1` and `#scf/IAC-21`. This is the *only* mechanism of the four that natively supports multiple parents, which directly mirrors ISO 25964 polyhierarchy. Excellent for tag-pane navigation and search filters.

**Cons / limits.**
- **No documented hard nesting depth**, but performance and UX both degrade past ~5 levels. Obsidian's tag pane truncates display, and tag autocompletion gets unwieldy.
- **Reserved characters.** Tags may not contain spaces; only letters, digits, `_`, `-`, `/`, and emoji. NIST control IDs containing parentheses (`AC-2(1)`) must be normalized — typically `AC-2-1` or `AC-2_1` — which means the *tag form* of an identifier is a derivable but not identical projection of the canonical CURIE.
- The Bases query system (`tags.contains("recipe")`) does not natively recognise nested-tag prefix semantics; one must use `file.hasTag()`. Plugin authors routinely trip on this.
- Tags are **labels, not addressable nodes** — a tag does not have a file body. To attach prose ("what is AC-2?") you still need a file, so a pure tag-driven recipe always degenerates into "flat files + hierarchy-in-tags".

**Right choice when.** Polyhierarchy is required (the GRC-crosswalk core case); the user wants Obsidian's tag pane and search filters as primary navigation; the framework is wide and shallow more than deep.

### 1.4 Wikilink-graph (hierarchy as parent/child links)
**Mechanics.** Files are flat; hierarchy is represented by frontmatter or body wikilinks: `parent:: [[AC]]` on `AC-2.md`, `enhancement-of:: [[AC-2]]` on `AC-2(1).md`. The Breadcrumbs plugin and Juggl render this as a navigable tree; Dataview can recurse with `dv.pages().where(p => p.parent == this.file.link)`.

**Pros.** Maps cleanly onto SKOS `broader`/`narrower` and ISO 25964's `BTG`/`BTP`/`BTI`. **Multi-parent natively.** Hierarchy becomes data, queryable and refactorable. Survives mass folder reorganisation. Closest fit to RDF and to the conceptual model Crosswalker is actually translating between.

**Cons / limits.**
- **Wikilink resolution rules.** Obsidian uses "shortest path when possible" by default: `[[AC-2]]` resolves if no other file shares that name. With duplicate basenames (`AC-2` exists in multiple framework versions), the recipe **must** emit full-path or aliased links (`[[Frameworks/NIST 800-53 r5/AC-2|AC-2]]`). The author of a wikilink-graph recipe has to *know* whether the target vault has duplicate names — this is the one place where the address-rendering function has a legitimate dependency on vault state.
- Hierarchy is invisible in the file explorer; users without Breadcrumbs/Juggl/Dataview see only an undifferentiated flat folder.
- Frontmatter wikilinks have an Obsidian-specific quirk: bare `[[AC]]` in YAML produces a nested array layer in some properties (`parent: [[[AC]]]`). The recipe must emit them as quoted strings or the modern `links:` property.

**Right choice when.** Polyhierarchy is required AND the user wants the hierarchy to be queryable / refactorable AND has installed the supporting plugins. Best fit when Crosswalker is generating a true crosswalk graph rather than a single framework.

### 1.5 The four mechanisms are forced, not chosen

These four are not a designer's catalogue — they are **all four of the ways Obsidian can encode a parent-child relationship**. Anything else (canvases, base files, dataview index notes) is a *view* over one of these four. The grammar must therefore admit all four; ranking or pruning to fewer is a v0.1 scope decision, not an architectural one.

---

## 2. Composition rules — the minimum-expressive recipe schema

### 2.1 The closed grammar

The minimum-expressive schema needs three things:

1. **An ordered sequence of hierarchy *levels*** corresponding to the source ontology's depth (e.g. for NIST 800-53 r5: `[catalog, family, control, enhancement]`).
2. **For each level, a *mechanism* assignment** ∈ `{folder, heading, tag, wikilink}` plus a **template** that produces the segment for that level.
3. **A leaf rule** that says where the concept's *content* lives — which mechanism owns the file body.

Here is the proposed YAML:

```yaml
recipe: nist-80053r5-allfolders
source:
  ontology: nist-80053r5
  levels: [catalog, family, control, enhancement]

target:
  # ordered, one entry per source level + one terminal "leaf"
  layout:
    - level: catalog
      mechanism: folder
      template: "Frameworks/{catalog.name}"
    - level: family
      mechanism: folder
      template: "{family.id}"      # AC, AU, AT, …
    - level: control
      mechanism: file              # the leaf-bearing primitive
      template: "{control.id}.md"
    - level: enhancement
      mechanism: heading
      level_depth: 2               # ## under control file
      template: "{enhancement.id} {enhancement.title}"

  # cross-cutting, repeatable on every level if desired
  also_emit:
    tags:
      - "framework/nist-80053r5/{family.id|lower}/{control.id|slug}"
    aliases:
      - "{control.id}"
      - "{control.title}"
    frontmatter:
      framework: nist-80053r5
      family: "{family.id}"
      control_id: "{control.id}"

  # optional view-layer hierarchy via wikilinks
  graph_edges:
    - from: "{control.id}"
      via: "parent"                # frontmatter property name
      to: "{family.id}"
```

The schema is closed in two senses. First, `mechanism` is a closed enum of five values: `folder`, `file`, `heading`, `tag`, `wikilink` (file is the leaf-bearing case of folder; some frameworks encode the leaf as a heading inside an enclosing file, in which case `mechanism: heading` appears as the leaf). Second, the levels are an ordered list — there is no nesting of layouts, no recursion, no Turing-completeness escape hatch. Anything more elaborate is a recipe-author footgun.

### 2.2 Composition by example — same source, four layouts

**(a) All-folders (the strict-hierarchy v0.1 default).**
```yaml
layout:
  - {level: catalog,     mechanism: folder, template: "Frameworks/{catalog.name}"}
  - {level: family,      mechanism: folder, template: "{family.id}"}
  - {level: control,     mechanism: file,   template: "{control.id}.md"}
  - {level: enhancement, mechanism: file,   template: "{enhancement.id}.md"}
```
Produces `Frameworks/NIST 800-53 r5/AC/AC-2.md` and `Frameworks/NIST 800-53 r5/AC/AC-2(1).md`.

**(b) Mostly-headings (single-document feel).**
```yaml
layout:
  - {level: catalog,     mechanism: file,    template: "Frameworks/{catalog.name}.md"}
  - {level: family,      mechanism: heading, level_depth: 2, template: "{family.id} — {family.title}"}
  - {level: control,     mechanism: heading, level_depth: 3, template: "{control.id} {control.title}"}
  - {level: enhancement, mechanism: heading, level_depth: 4, template: "{enhancement.id} {enhancement.title}"}
```
Produces `Frameworks/NIST 800-53 r5.md` with `## AC — Access Control` → `### AC-2 …` → `#### AC-2(1) …`.

**(c) Tag-driven flat.**
```yaml
layout:
  - {level: catalog,     mechanism: folder, template: "Frameworks"}
  - {level: family,      mechanism: tag,    template: "framework/nist/{family.id|lower}"}
  - {level: control,     mechanism: file,   template: "{control.id}.md"}
  - {level: enhancement, mechanism: file,   template: "{enhancement.id|slug}.md"}
also_emit:
  tags:
    - "framework/nist/{family.id|lower}/{control.id|slug}"
```
Produces flat `Frameworks/AC-2.md` files carrying nested `#framework/nist/ac/ac-2`.

**(d) Wikilink-graph.**
```yaml
layout:
  - {level: catalog,     mechanism: folder,   template: "Frameworks"}
  - {level: family,      mechanism: wikilink, template: "{family.id}"}    # produces a {family.id}.md hub
  - {level: control,     mechanism: file,     template: "{control.id}.md"}
  - {level: enhancement, mechanism: file,     template: "{enhancement.id|slug}.md"}
graph_edges:
  - {from: "{control.id}",     via: "parent", to: "{family.id}"}
  - {from: "{enhancement.id}", via: "parent", to: "{control.id}"}
```

**(e) Hybrid (the realistic case).**
```yaml
layout:
  - {level: catalog,     mechanism: folder,  template: "Frameworks/{catalog.name}"}
  - {level: family,      mechanism: folder,  template: "{family.id}"}
  - {level: control,     mechanism: file,    template: "{control.id}.md"}
  - {level: enhancement, mechanism: heading, level_depth: 2, template: "{enhancement.id} {enhancement.title}"}
```

### 2.3 Prior art justifying this shape

- **Dendron's `*.schema.yml`** uses an ordered tree of `id`/`pattern`/`children` with a `namespace: true` flag. Crosswalker's per-level mechanism is the natural extension: Dendron schemas only describe *path-segment* shape because Dendron is path-only. A Crosswalker recipe is a Dendron schema generalised to *which mechanism owns each level*.
- **YARRRML / RML mapping documents** are explicit precedent for "compact recipe → graph of subject/predicate/object maps with templates". Crosswalker's `template` field is intentionally `rr:template` syntax (`"{var}"` interpolation), keeping the cognitive overhead low for users who already know R2RML.
- **Configuration DSL precedent.** The schema deliberately avoids a recursive grammar (no `mechanism: composite` nesting). That decision follows the dbt / dlt / Singer / Airbyte heuristic that ETL configs win by being declarative + flat: anything more must escape into code (a `function` plugin), never into nested config.

---

## 3. The address-rendering function — the one coupling point

### 3.1 Formal signature

```
render : (Recipe, ConceptIdentity, VaultIndex?) → Address

where
  ConceptIdentity = CURIE                       // e.g. nist:AC-2(1)
  VaultIndex      = { basenames: Set<string>,
                      headings: Map<Path, Set<HeadingPath>>,
                      tagspace: Set<string> }   // OPTIONAL
  Address = {
    primary:        { path: Path, anchor: HeadingPath? },
    wikilinkTarget: string,                     // exactly what goes inside [[…]]
    tags:           Set<string>,
    aliases:        Set<string>,
    frontmatter:    Map<string, JsonValue>
  }
```

### 3.2 Determinism — the right answer

`render` should be **deterministic given (Recipe, Identity) only**, with `VaultIndex` consumed *only* by an optional second-pass *link minimizer*. This split is the core architectural call:

- **Pass 1 (canonical, vault-independent).** Compute the *full-path* address. `wikilinkTarget` is always the unambiguous `Folder/Sub/AC-2` form. Tags and aliases have no vault dependency. This pass is pure, replayable, hashable.
- **Pass 2 (vault-dependent, optional).** A `linkStyle: shortest|absolute` recipe option triggers a second pass that consults `VaultIndex` and downgrades unambiguous `Folder/Sub/AC-2` to bare `AC-2` where the basename is unique. This is the *only* place vault state enters.

Why this split is the right answer:

1. **Reproducibility.** Two users with identical recipes on identical source data produce byte-identical pass-1 output, regardless of what other notes happen to live in their vaults. This makes `git diff` of generated files meaningful.
2. **Idempotency under re-import.** A recipe re-run does not rewrite links just because an unrelated note got renamed. Pass-2 minimisation can be opt-in or even deferred to Obsidian's own "Update internal links" pass.
3. **It mirrors RML and JSON-LD precisely.** RML's `rr:subjectMap` with `rr:template "http://example.org/{id}"` is pure: an IRI is a function of the row, not of the target dataset. JSON-LD `@id` minting is the same. Letting vault state leak into pass 1 would be the unique innovation, and there is no compelling use case that requires it.
4. **It mirrors Obsidian's own model.** Obsidian itself stores links in their authored form and resolves to files at read time. The recipe is the author; the vault is the resolver. Conflating these has been the source of every "my links broke after import" forum thread in the corpus.

### 3.3 Template grammar

`{var}` interpolation, with a closed pipe-filter set borrowed from Liquid/Jinja for sanitisation:
- `{var|lower}`, `{var|upper}`, `{var|title}`
- `{var|slug}` — `[A-Za-z0-9-]`-only, NIST `AC-2(1)` → `ac-2-1`
- `{var|tagsafe}` — slug minus `/` collisions
- `{var|fs-safe}` — strip Windows-reserved chars
- `{var|truncate(N)}` — for MAX_PATH defence

The filter set is closed. Computation beyond filters is a `Function` primitive from Ch 20 (see §7).

---

## 4. Prior art — SEACOW and folder-tag-sync

### 4.1 SEACOW

`cybersader/cyberbase` describes SEACOW as "a meta framework for organizing knowledge platforms" and lists it alongside PARA and Zettelkasten as "example taxonomies that can be used or modified to organize knowledge or information around particular subjects." The public material is light on a formal vocabulary, but the operative pattern observable across cyberbase is a **separation between top-level domain folders (numbered "📁 01 - Projects", "📁 05 - Organizational Cyber", "📁 10 - My Obsidian Stack") and orthogonal cross-cutting tags (`curations/development/auth`, `risk-management`, `GRC`)**. Folders carry the dominant *administrative* hierarchy; tags carry *thematic* hierarchies that crosscut.

This is exactly the **faceted classification** pattern from Ranganathan (see §9) and is exactly what Crosswalker's `layout` + `also_emit.tags` split formalises. SEACOW's lived practice is the empirical justification for keeping the tag mechanism as a co-equal, parallel-emit channel rather than as an alternative-to-folder mechanism. **Recipes should normally emit both**, with the tag template being a per-level concern parallel to the folder template.

Vocabulary alignment: SEACOW's "platform" = Crosswalker's "vault"; SEACOW's domain folders correspond to a recipe's outer `layout` levels; SEACOW's curation tags correspond to a recipe's `also_emit.tags`.

### 4.2 folder-tag-sync

The plugin (`cybersader/obsidian-folder-tag-sync`, v0.1.0 beta as of recent commits) operates as a **rule engine** with this pipeline:

```
File Event → Rule Matcher → Transformation Pipeline → Sync Executor
```

A rule is shaped:
```json
{
  "name": "User Projects",
  "folderPattern": "^👤 Alice/📁 Projects/(.*)",
  "tagPattern": "^--alice/projects/",
  "direction": "bidirectional",
  "folderEntryPoint": "👤 Alice",
  "tagEntryPoint": "--alice",
  "tagTransforms": {
    "caseTransform": "snake_case",
    "emojiHandling": "strip"
  }
}
```

Crosswalker should treat folder-tag-sync as **the runtime** that keeps the dual-emit (folder + tag) recipes consistent over the long run, because users *will* refactor folders by hand. Crosswalker's contribution is to **emit a folder-tag-sync rule alongside each generated framework** so that subsequent vault edits stay in sync. Concretely, when a recipe declares both a folder layout and `also_emit.tags`, Crosswalker should write a folder-tag-sync rule whose `folderPattern` and `tagPattern` are the regex-compiled versions of the folder and tag templates.

This is a clean, low-coupling integration: Crosswalker writes recipes that *generate* folder-tag-sync rules; the two plugins compose without sharing state. The `tagTransforms` block in folder-tag-sync (`caseTransform: snake_case`, `emojiHandling: strip`, strip-number-prefix) is the **canonical reference vocabulary** for Crosswalker's template-filter set — Crosswalker should reuse those transformation names verbatim.

---

## 5. Prior art — JSONaut and ChunkyCSV

These tools are not visible on the public web in a form recoverable through search (no GitHub repository under `cybersader` for either tool surfaced), so the analysis here is structural rather than document-grounded. Conceptually, both are "depth-crossing" transformers: they take rows that have hierarchy *encoded in some columns or paths* and decide which level of nesting becomes which output construct.

The primitive these tools must carry is exactly Crosswalker's `level → mechanism` map, even if it is implicit in their config. Where JSONaut/ChunkyCSV decide "this nesting depth becomes a path segment vs. an object key", Crosswalker decides "this source level becomes a folder vs. a heading vs. a tag vs. a wikilink edge". The address-rendering function is the same idea, generalised over four target mechanisms instead of two.

The practical recommendation: **the `template` filter set should be designed as a strict subset of whatever expressivity JSONaut/ChunkyCSV already give the user**, so that authors who already think in those tools can transfer their mental model. If JSONaut uses `$.field` JSONPath, Crosswalker's `{var}` should align (or explicitly translate) rather than introducing a third syntax. If the user's prior tools do not in fact share a syntax, Crosswalker should pick R2RML's `{var}` because of (3) below.

---

## 6. Survey of existing import / vault-template tooling

### 6.1 Obsidian Importer plugin
The official Importer (`obsidianmd/obsidian-importer`) takes a target source (Notion, Apple Notes, Bear, Roam, Google Keep) and emits a folder-and-file vault. **It is hardcoded to one target structure per source.** The recent Notion-via-API PR adds *some* configurability — output folder, attachment folder, Bases-file generation — but offers no recipe-author surface for choosing folder-vs-heading-vs-tag layout. Open issues show users routinely fighting the Importer when it loses folder structure or dumps 500+ images at the vault root. **Crosswalker's contribution is precisely the layer Importer is missing**: a declarative target-structure recipe.

### 6.2 Notion-to-MD / Notion-to-Obsidian converters
Similar story. The community PR for the Importer (`jmanhype` walkthrough) demonstrates that a Notion database becomes a folder with a `.base` file plus per-row `.md` files — one fixed shape. Database-with-relations becomes folder-with-frontmatter-links. There is no schema-driven "express this as headings instead".

### 6.3 Dendron
Dendron is the closest prior art for a *structure-defining* schema, but it operates on only one mechanism (path), encoded as dot-delimited filenames (`project1.tasks.task1.md`). Dendron's schema YAML (`id`/`parent`/`children`/`pattern`/`namespace`) is the right *shape* for a level definition; what Dendron lacks (and Crosswalker needs) is the per-level mechanism choice. Dendron's `namespace: true` flag — meaning "this level may have arbitrary children matching a pattern" — translates directly to Crosswalker's `template: "{family.id}"` semantic.

### 6.4 Logseq
Logseq's hierarchy is dual: pages (path-like) and blocks (UUID-addressed). Block transclusion (`((uuid))`) and namespace pages (`Project/Sub/Page`) give Logseq its own version of the four-mechanism problem, but it only exposes two of them. Not directly applicable as a target, but instructive: Logseq's choice to make blocks first-class means it never had to wrestle with heading-anchor brittleness the way Obsidian does.

### 6.5 Foam
Foam is link-centric (the "wikilink-graph" mechanism) with folders as a secondary concern. It is the natural reference for `mechanism: wikilink` recipes. Foam recipes for ontology import would be exactly the (d) example above.

### 6.6 obsidian-vault-template-template, obsidian-secops-vault-template
The user's own templates are static scaffolds — folder-and-file shapes shipped as starter vaults. They are the "output" of a recipe, not a recipe themselves. The Crosswalker schema should be capable of producing such a template: that is, **a vault template is a recipe with empty data**, and a populated vault is the recipe applied to a real source. This unifies what is currently two separate user-facing concepts (templates and importers) under one grammar.

### 6.7 W3C R2RML / RML
The most important reference. R2RML's `rr:subjectMap` with `rr:template "http://trans.example.com/stop/{@id}"` is *literally* an address-rendering function from a row to an IRI. RML generalises this to non-relational sources (CSV, JSON, XML) — exactly Crosswalker's situation. The decomposition into `LogicalSource → SubjectMap → PredicateObjectMap` directly parallels Crosswalker's `Source → Render(primary) → Render(also_emit)`. **Crosswalker's `template` field syntax should be R2RML-compatible** (the `{var}` form), so a future translator from a Crosswalker recipe to a YARRRML mapping is mechanical.

The `rr:termType` axis in R2RML (IRI vs BlankNode vs Literal) is the conceptual ancestor of Crosswalker's `mechanism` (folder vs heading vs tag vs wikilink) — both are saying "what kind of identifier shape does this term take?".

### 6.8 JSON-LD framing and `@id`
JSON-LD's `@id` minting policy ("relative IRIs are resolved against `@base`") is the precedent for Crosswalker's vault-relative paths — paths in a recipe are vault-relative, the vault root is the implicit `@base`. JSON-LD framing also confirms the canonical/view distinction: the same RDF graph can be framed multiple ways without changing what it *is*.

### 6.9 SPARQL CONSTRUCT
SPARQL's `CONSTRUCT { ?s ?p ?o } WHERE { … }` is the same template-substitution model as RML at query time instead of mapping time. Useful as a mental model for "what comes out is a function of the template and the bindings", but not a direct architectural input.

### 6.10 Off-the-shelf ETL (dbt, dlt, Singer, Airbyte)
None of these address target *structure*. dbt produces SQL tables; dlt and Singer normalize data into tables; Airbyte routes into databases. They are upstream of the question. The lesson is *what they don't do*: they universally separate transformation logic from output shape, with output shape being a thin "destination" config. Crosswalker's `target.layout` is the analogue of an Airbyte destination config — it should be small, declarative, and not the place where business logic lives.

---

## 7. Composition with Ch 20's primitive set

Ch 20 establishes Source / Term / Map / Join / Function as the transformation primitives, with `path` / `frontmatter` / `body` / `wikilink` as the sinks.

**Target structure plugs in as a parameterization layer over the existing sinks; it is *not* a new primitive.** Specifically:

- `path` sink today takes a string. After Ch 22, it takes either a string (literal) or a *layout-resolved expression* — the output of `render(recipe, identity).primary.path`.
- `wikilink` sink today takes a target string. After Ch 22, it takes either a string or `render(recipe, identity).wikilinkTarget`.
- A new sink — `tag` — appears as a peer to the existing four, because tags are not addresses-of-files but addresses-of-concept-membership. `tag` consumes `render(recipe, identity).tags`. (Strictly speaking, tags can be modeled as a frontmatter sink writing the `tags:` key, in which case no new sink is needed; this is a minor implementation choice.)
- The *body* sink is unchanged. Heading-mechanism levels emit body content prefixed with `#` characters; the *layout* is what decides the prefix count.

So the post-Ch 22 picture is:

```
Source → Term → Map → Join → Function
                                  ↓
                        [render(recipe, identity)]
                                  ↓
        ┌─────────┬──────────┬──────────┬─────────┐
        ↓         ↓          ↓          ↓         ↓
       path  frontmatter   body     wikilink     tag
```

The render function is the **single new component**. The sinks gain a new *input source* (the render output) but their interface is unchanged. This matches the RML separation of concerns: `LogicalSource` (Crosswalker's Source) and `TermMap` (Crosswalker's render) are independent; together they parameterise the `TriplesMap` (Crosswalker's full sink set).

This is the right answer because the alternative — a `target_structure` primitive — would conflate output shape with computation, force every recipe author to wire the same plumbing, and obscure the fact that target structure is parametric over all four sinks simultaneously, not a peer of them.

---

## 8. Content-addressing implications — "target structure is a view"

### 8.1 The claim, restated

The claim is: **content digests should be computed over the canonicalized concept-identity store, before address rendering**. Two recipes producing different on-disk vault layouts from the same source produce *the same* canonical-state digest. The render output is reproducible from `(canonical state, recipe)` but is not part of canonical state.

### 8.2 Confirmation from prior art

This is the right architectural choice and it has direct precedent:

- **Nix** computes the file-system-object content address from the *file system object graph* (the root and its children), then derives the store path from that hash plus a name. The path `/nix/store/zx9qxw749wmla1fad93al7yw2mg1jvzf-my-hello-0.1.0` is *named by* the canonical content but is itself a presentation. Crucially, Nix uses **placeholders** for self-references during build because the path is not known until after content is finalised — the same problem Crosswalker has when a wikilink in body text needs to point at a render output that is itself being computed.
- **Git tree objects** hash directories by their entries (mode + name + child hash), independent of filesystem details (inode, mtime, owner). The hash is a function of *content + structure*, not of how the user happens to have checked it out. A `git checkout` that produces different working-tree paths (e.g. case-folding on macOS) does not change the tree hash.
- **IPFS CIDs** are computed from the DAG of blocks; a CID names content, not a path. Multiple gateways can serve the same CID at different URLs.
- **JSON-LD canonicalization (URDNA2015)** explicitly distinguishes the canonical form of an RDF graph from any particular serialization. Two JSON-LD documents that frame the same triples differently produce identical canonical N-Quads.

In every one of these systems, the architectural invariant is the same: **content has a canonical form; presentation is a (recipe, content) → bytes function; hashes are taken over canonical content, not over presentation.**

### 8.3 What "canonical concept-identity store" should contain for Crosswalker

The canonical state for hashing is:
- The set of `ConceptIdentity` CURIEs (`nist:AC-2`, `nist:AC-2(1)`, …).
- For each identity, its canonical attribute set (title, description, family, …).
- The set of relations `(subject_curie, predicate, object_curie)` — `parent`, `enhances`, `crosswalksTo`.
- An ordering canonicalisation (sort identities lexically; sort relations by `(s, p, o)`).

What is *not* in canonical state: the recipe, the layout choice, the resulting paths, the resulting wikilink syntax, the link style (shortest vs absolute), tag formatting choices, alias choices.

### 8.4 Pushback / where to be careful

There is one nuance worth flagging: **frontmatter content** straddles the line. Some frontmatter (e.g. `framework: nist-80053r5`, `control_id: AC-2`) is a *projection of canonical state* and should be reproducible from the canonical store. Other frontmatter that the user later edits by hand (`reviewer: alice`, `status: covered`) is *new canonical state contributed by the user* and must be merged back in, not overwritten on re-import. This is the standard "destination has user data" problem in ETL, and the answer is the same as Airbyte / dbt: Crosswalker recipes must declare which frontmatter keys are *managed* (recipe-owned) vs *user* (preserved on re-render). This declaration belongs in the recipe schema:

```yaml
target:
  frontmatter:
    managed: [framework, control_id, family]   # Crosswalker overwrites
    user_preserve: ["*"]                       # everything else: leave alone
```

With this in place, the "target structure is a view" claim holds rigorously: managed-frontmatter is a function of canonical state; user-frontmatter is canonical state of a different domain (the user's annotations) that must itself be hashed and version-controlled.

### 8.5 Verdict

Confirm the claim, with the managed/user split as the necessary refinement. The render function is deterministic and reproducible; its output is *not* part of canonical state; canonical content addresses are computed before render.

---

## 9. Information-science framing

### 9.1 The four-mechanism model maps onto established theory

| Crosswalker mechanism | Information-science analogue |
|---|---|
| Folder | Enumerative classification (Dewey, LCC) — single rigid hierarchy, one place per item |
| Heading | Document structure / table of contents — Dublin Core `dcterms:tableOfContents`; presentation order within a textual work |
| Tag | Faceted classification (Ranganathan) + polyhierarchical thesaurus (ISO 25964) — multiple parallel descriptive axes |
| Wikilink-graph | SKOS `broader`/`narrower` + ISO 25964 BTG/BTP/BTI relations — explicit semantic relations between concepts |

This is not a coincidence; the four mechanisms are an Obsidian-flavoured re-derivation of the four ways library science has classified knowledge for a century:

- **Enumerative** (folder): assign each item exactly one place in a tree. Maximally constrained, maximally legible, minimally expressive.
- **Sequential / structural** (heading): preserve the document's own internal order. Necessary when the source *is* a document (which NIST 800-53 r5, ISO 27001, etc. literally are — they are published standards texts).
- **Faceted** (tag): describe along multiple independent axes simultaneously. Ranganathan's PMEST (Personality / Matter / Energy / Space / Time) is the canonical example; for GRC the analogous facets are Framework / Family / Control-type / Region / Maturity-level.
- **Associative / relational** (wikilink-graph): express semantic relations as first-class data. SKOS `broader`/`narrower` for hierarchy; `related` for non-hierarchical association; ISO 25964's BTG (genus-species), BTP (whole-part), BTI (instance) for specifying *kind* of hierarchy.

### 9.2 What this teaches the Crosswalker design

- **Polyhierarchy is real and pervasive in GRC.** ISO 25964 explicitly supports multi-parent concepts because real thesauri need it. SCF crosswalk data is a polyhierarchy: a single SCF control is *broader* than multiple specific framework controls. A Crosswalker that ships only the folder mechanism is, in library-science terms, asserting that GRC knowledge fits in an enumerative classification — which it provably does not. **Therefore tag and/or wikilink-graph must be in the design from v0.1, even if not implemented immediately.**

- **The presentation/classification distinction is canonical.** Library science has always separated *classification* (the analytic structure of knowledge) from *shelving* (the presentation choice — and a book lives on exactly one shelf even if it belongs to many classes). The Nix/Git/IPFS lesson and the library-science lesson are the same lesson: the canonical structure is one thing, the chosen presentation is another, and the function from one to the other is a recipe.

- **Faceted classification justifies SEACOW's parallel-emit.** When SEACOW emits both a folder structure (enumerative shelving) and orthogonal tags (faceted description), it is reproducing exactly what Ranganathan recommended: a primary shelf order plus auxiliary facet labels. Crosswalker's recipe schema must support this directly, which it does via `layout` + `also_emit.tags`.

- **Naming the relations matters.** ISO 25964's BTG/BTP/BTI distinction is more expressive than SKOS `broader` alone. For Crosswalker, the practical implication is that `graph_edges` should support a `via` field naming the relation type (`parent`, `enhances`, `partOf`, `instanceOf`, `crosswalksTo`), not just an undifferentiated edge. This is cheap to add in v0.1 (it's just a string in the recipe and a frontmatter key in the output) and pays dividends as the user installs Breadcrumbs / Juggl / Dataview.

---

## Success criteria — point-by-point

### 10.1 Closed grammar for target-structure recipes

Provided in §2.1. Five-mechanism enum (`folder | file | heading | tag | wikilink`), ordered `layout` list with one entry per source level, plus `also_emit` (cross-cutting tags/aliases/frontmatter) and optional `graph_edges`. TypeScript surface:

```typescript
type Mechanism = "folder" | "file" | "heading" | "tag" | "wikilink";

interface LayoutEntry {
  level: string;            // matches a source-level identifier
  mechanism: Mechanism;
  template: string;         // R2RML-style {var} interpolation
  level_depth?: number;     // heading depth 1..6
}

interface GraphEdge {
  from: string;     // template
  via: string;      // frontmatter property (parent, enhances, partOf, …)
  to: string;       // template
}

interface ImportRecipe {
  recipe: string;                        // recipe id
  source: { ontology: string; levels: string[] };
  target: {
    layout: LayoutEntry[];
    also_emit?: {
      tags?: string[];
      aliases?: string[];
      frontmatter?: {
        managed?: Record<string, string>;  // template values
        user_preserve?: string[];          // patterns
      };
    };
    graph_edges?: GraphEdge[];
    linkStyle?: "absolute" | "shortest";   // default absolute
  };
}
```

### 10.2 Address-rendering function specification

Provided in §3. Pure function `render(Recipe, ConceptIdentity) → Address`. Vault index consulted only by an optional pass-2 link minimiser. Determinism required for canonical-state hashing.

### 10.3 Concrete worked examples

NIST 800-53 r5 rendered five ways given in §2.2 (a–e). Each is fully expressible in the schema above.

### 10.4 SEACOW + folder-tag-sync integration plan

- Crosswalker recipes default to dual-emit (folder layout + parallel tags), matching SEACOW's lived practice.
- For each recipe that dual-emits, Crosswalker writes a folder-tag-sync rule (regex-compiled from the templates) so that subsequent user edits stay synchronized.
- Crosswalker's template-filter set reuses folder-tag-sync's transformation vocabulary (`snake_case`, `strip emoji`, `strip number prefix`) verbatim.
- The recipes produced by the all-folders, mostly-headings, hybrid examples should be packaged as starter recipes alongside `obsidian-secops-vault-template`.

### 10.5 Composition with Ch 20 primitives

§7. Target structure is a parameterization layer over the `path`, `wikilink`, `body`, `frontmatter` sinks via the new `render` function. A `tag` sink is added (or implemented as a frontmatter-keyed write). No existing primitive changes its interface. Cleanly mirrors RML's `LogicalSource × TermMap → TriplesMap`.

### 10.6 Content-addressing answer

§8. Confirmed: target structure is a view. Canonical-state hash is computed over the concept-identity store before render. Caveat: split frontmatter into `managed` (recipe-owned, projected from canonical state) and `user_preserve` (canonical state of the user-annotation domain, never overwritten). With this split, the architectural invariant is identical to Nix's file-system-object → store-path relationship and Git's tree-object → working-tree relationship.

### 10.7 Migration path from current `hierarchy` column-role

The current ImportRecipe has a `hierarchy` column-role that effectively says "this column drives the folder path". Migration:

1. **Phase 0 (no-op compatibility).** Treat any recipe with a `hierarchy` column-role as syntactic sugar for:
   ```yaml
   target:
     layout:
       - {level: hierarchy_level_1, mechanism: folder, template: "{col}"}
       - {level: hierarchy_level_2, mechanism: folder, template: "{col}"}
       - ...
       - {level: leaf, mechanism: file, template: "{title}.md"}
   ```
   Old recipes import without modification.

2. **Phase 1 (additive).** Allow recipes to use the new `target.layout` form. When present, it overrides `hierarchy`. Recipes can mix during transition.

3. **Phase 2 (deprecation).** Document `hierarchy` column-role as legacy; provide a one-shot migration command in the plugin that rewrites old recipes into the new form.

4. **Phase 3 (removal, post-v1.0).** `hierarchy` removed from the schema. Migration tool retained for old saved recipes.

This path is non-breaking through phase 2 and gives users an indefinite window to migrate.

### 10.8 Adversarial sanity check — is this over-engineered?

**Honest answer: no, but v0.1 should still ship a subset.**

Arguments that it *is* over-engineered:
- Most users will use folder-only and never touch the other three mechanisms.
- The render function is non-trivial code to maintain; pure folder concatenation is ten lines.
- Polyhierarchy is real but most v0.1 users will be importing one framework at a time, so the use case is theoretical.
- "Vault state as optional pass-2 input" is a complication that 95% of users will never trigger.

Arguments it is *not* over-engineered:
- The grammar is *closed and small* — five mechanisms, one render function, one schema. It is not Turing-complete and does not accumulate complexity.
- The four mechanisms are forced by Obsidian's actual primitives, not invented.
- Dropping mechanisms now would mean schema-breaking migrations later — exactly the failure mode the user explicitly asked to avoid.
- The library-science framing (§9) shows that "folder-only" is asserting a false claim about the structure of GRC knowledge, and SCF crosswalks will break it within months.
- The render function is small (one pure function, ~200 lines including filters); the cost is one-time. The *recipe schema* is the long-lived artifact, and the schema is what would be expensive to change later.

**Recommended v0.1 scope:**
1. Ship the **full recipe schema** with all five mechanisms allowed.
2. Implement `mechanism: folder` and `mechanism: file` and `mechanism: heading` (the three lowest-risk).
3. Implement `also_emit.tags` and `also_emit.aliases` and `also_emit.frontmatter` (cheap, high value).
4. Defer `mechanism: tag` (as a layout level) and `mechanism: wikilink` (as a layout level) and `graph_edges` to v0.2.
5. Ship `linkStyle: absolute` only; defer `shortest` (and the pass-2 minimiser) to v0.3.
6. Ship managed/user_preserve frontmatter split from day one; this is the most expensive thing to retrofit.
7. Ship the content-addressing canonical-state hash from day one for the same reason.

The grammar is paid-for at v0.1; the implementation is incremental. This is the opposite of painting into a corner — it is renting an oversized apartment and only furnishing two rooms initially.

---

## Recommendations summary

1. **Adopt the closed grammar of §2.1** (five mechanisms × ordered `layout` × `also_emit` × `graph_edges`) as the v0.1 schema, even if only three mechanisms are wired up.
2. **Implement `render` as a pure function of `(Recipe, ConceptIdentity)`** with vault state consulted only by a downstream optional pass-2 link minimiser. Borrow R2RML's `{var}` template syntax verbatim.
3. **Compute canonical content addresses over the concept-identity store** before render. Split frontmatter into `managed` and `user_preserve`. This is non-negotiable infrastructure that is cheap now and very expensive later.
4. **Treat target structure as a view, not as canonical state.** Two recipes producing different vault layouts from the same source must produce identical canonical hashes.
5. **Default recipes to dual-emit (folder layout + parallel tags)**, matching SEACOW practice and Ranganathan's faceted-classification rationale.
6. **Auto-generate folder-tag-sync rules** from dual-emit recipes so that user edits remain synchronized over the vault's lifetime.
7. **Retain backward compatibility** with the existing `hierarchy` column-role via the four-phase migration plan in §10.7.
8. **Reuse vocabulary from prior art**: `mechanism` enum mirrors RML `rr:termType`; template syntax mirrors `rr:template`; `graph_edges.via` mirrors SKOS / ISO 25964 relation types; transform filters mirror folder-tag-sync's `tagTransforms`. Every new term in the schema should be justified against an existing standard.
9. **Ship v0.1 with folder + file + heading mechanisms only.** Tag and wikilink as layout levels are v0.2; pass-2 link minimiser is v0.3. The full grammar is reserved at v0.1 to avoid migration pain later.
10. **Pin NIST 800-53 r5 as the canonical regression test corpus** and verify that all five worked examples in §2.2 import losslessly to the same canonical-state hash regardless of layout choice.
