---
title: "Ch 20 deliverable B: Boundary semantics — ref / resolve / bind / seal (Backpack-style holes/fills, Nix content addressing, sheaf-theoretic gluing)"
description: "Fresh-agent research deliverable B for Challenge 20. Operates at a different layer than Runs A and C: not transformation algebra, but boundary semantics. Four primitives: ref (typed reference, Selector + ContextHints), resolve (sandboxed effectful artifact retrieval producing Provenance), bind (artifact + LocalName → VaultDelta), seal (VaultDelta + Manifest → SealedImport). Identity = content-digest; names = presentation; versions = aliases. Append-only Merkle provenance. Object-capability-style sealed manifests. Backpack mixin holes/fills as the type-theoretic model; vaults-as-sheaves over a site of contexts as the categorical model. Three-layer syntax (vault root manifest, import declaration files, materialized notes). Theoretically rigorous; ranges from production-shippable to v3+ aspirational depending on adoption depth."
tags: [research, deliverable, import, primitive, backpack, nix, content-addressing, provenance, sheaf, capability, foundation]
date: 2026-05-03
sidebar:
  label: "Ch 20b: Boundary semantics"
  order: -20260503.2
---

:::tip[Origin and lifecycle]
Fresh-agent research deliverable produced 2026-05-03 in response to [Challenge 20: Import primitive formal foundation](/crosswalker/agent-context/zz-challenges/archive/20-import-primitive-formal-foundation/). Synthesized in the [05-03 import-primitive synthesis log §5](/crosswalker/agent-context/zz-log/2026-05-03-import-primitive-formal-foundation-synthesis/) as the **boundary-semantics Layer A** — complementary to Runs A and C's *transformation-algebra* Layer B. Preserved verbatim.
:::

# The Import Primitive: A Formal Foundation for Crosswalker

## Preamble: Method, Sources, and an Honesty Note

This report responds to challenge **20-import-primitive-formal-foundation** in the Crosswalker `agent-context/zz-challenges/` series. Direct programmatic fetches against `cybersader.github.io/crosswalker/agent-context/zz-challenges/20-import-primitive-formal-foundation/` and the surrounding site, and against the underlying GitHub repo, returned permission errors in the tooling available for this task. I therefore could not crawl the specific challenge body, the full challenge index, or any internal architecture/principles documents that may exist on the site or in the repo.

What I do have, with high confidence, from public material:

- **What Crosswalker is.** It is `cybersader/Crosswalker`, a tool for crosswalking cybersecurity frameworks (CIS Controls, NIST CSF, ISO 27001, CMMC, FedRAMP, etc.) and translating them into an Obsidian vault. The README explicitly describes it as "step 1 of turning Obsidian into a full-fledged GRC database," with notes-as-controls (`CIS 1.1.md`), evidence notes that link to controls, and inline metadata on the link itself (`framework_here:: [CIS 1.1](../CIS 1.1.md) {"reviewer":"Person","status":"covered"}`). It also references CRDT-based reconciliation for filesystem sync. The author also maintains adjacent projects (`cyberbase`, `obsidian-vault-template-template`, `obsidian-secops-vault-template`, `notion-to-obsidian-github-sync`) that share the Obsidian-as-knowledge-graph worldview.
- **What the `agent-context/zz-challenges/` folder almost certainly is.** A numbered set of structured problems written for AI coding agents to tackle, in the style now common across the field (`AGENTS.md`, `CLAUDE.md`, GitHub's "agentic primitives," Anthropic Skills, Letta Context Repositories, ICM workspaces). `zz-` is a conventional prefix to sink a folder to the bottom of an alphabetical listing while keeping it discoverable.
- **What "import primitive" almost certainly denotes.** In a Crosswalker that ingests external framework catalogs, mapping tables, evidence dossiers, and other people's vaults, the *import* is the act by which something from the outside world becomes a first-class citizen inside the Crosswalker knowledge graph. "Formal foundation" is a request to stop treating import as ad-hoc plumbing and instead define it as a primitive with a precise semantics, identity model, composition algebra, and failure surface.

Where I cite Crosswalker specifics I have evidence for, I do. Where I reason from first principles, prior art, and what the system *must* need to function, I say so. The report is organized around the five phases of the brief, with substantive sections on each.

---

## Phase 1 — Crosswalker, Reconstructed

### 1.1 Purpose, Domain, Users

Crosswalker sits at the confluence of three worlds that historically have not talked to each other:

1. **Governance, Risk, and Compliance (GRC) frameworks.** Catalogs of controls (NIST SP 800-53, NIST CSF, ISO/IEC 27001 Annex A, CIS Controls v8, CMMC 2.0, FedRAMP, SOC 2, PCI-DSS, HIPAA Security Rule, etc.). These are themselves textual standards documents with hierarchical identifiers and human-language requirement statements.
2. **Crosswalks between those frameworks.** Tables that say, for example, "ISO 27001 A.5.1 ↔ NIST SP 800-53 PL-1, AC-1." The most rigorous current example is the SCF (Secure Controls Framework) using Set Theory Relationship Mapping (STRM); NIST publishes its own crosswalk spreadsheets. Each crosswalk is, formally, a binary relation between two control catalogs, often weighted, often asymmetric ("subset of," "intersects with," "equivalent to").
3. **Personal/organizational knowledge graphs in Obsidian.** A vault is a tree of Markdown files plus a mesh of `[[wiki-links]]`, plus YAML frontmatter, plus Dataview-style inline metadata, plus folder structure. It is a substrate, not a schema.

Crosswalker's job is to take (1) and (2) and project them into (3) so the resulting vault is *queryable as a GRC database* while remaining a plain Markdown directory that any human or any AI agent can read with `cat` and `grep`. The README's `Evidence_containing_note.md → CIS 1.1.md` example with attached metadata is the central pattern: a control is a note, evidence is a note, and the *typed link with metadata* is the unit of compliance assertion.

The users are GRC practitioners, internal auditors, security architects, and the AI agents that increasingly assist them. The agents need this material in shapes they can reason about under context-window constraints.

### 1.2 The Implicit Set of Primitives

From the public README and the surrounding ecosystem, Crosswalker appears to be built (or is being built) on a small set of primitive concepts. I will name them so that the import primitive can be defined in relation to them:

- **Note.** A Markdown file with optional frontmatter. The atomic content unit.
- **Control.** A Note that represents one normative statement from a framework, identified by a framework code (e.g., `CIS 1.1`, `AC-2(3)`).
- **Framework.** A named, versioned collection of Controls with an internal hierarchy (function/category/subcategory or family/control/enhancement).
- **Crosswalk Edge.** A typed, directed (or symmetric) relationship between two Controls, possibly across frameworks, with metadata (relationship type, strength, rationale, source).
- **Evidence.** A Note that asserts that one or more Controls are satisfied, with metadata (reviewer, status, date, scope).
- **Vault.** The container; a filesystem directory with conventions.
- **Link.** Obsidian's wiki-link (`[[Target]]`) or Markdown link, optionally with inline-metadata key (`framework::`) and a JSON tail.
- **Crosswalker Tool.** The text-matching/joining layer that proposes Crosswalk Edges from imperfect string match data.

Adjacent challenges in such a system — the ones "import" must coexist with — almost certainly include identity and deduplication of controls, schema/frontmatter conventions, framework versioning, crosswalk provenance, evidence lifecycle, vault sync (CRDT for SMB, mentioned in the README), and agent-context delivery (how a coding/reasoning agent gets the right slice of vault into its context window). The import primitive sits upstream of all of these: it is how outside-world artifacts cross the boundary into the Crosswalker world in the first place.

### 1.3 What "Import" Currently Looks Like (Inferred)

Based on the way the original Washington Post Crosswalker works (CSV/JSON ingestion with column-level join configuration) and the cybersader fork's stated goal (translate frameworks into an Obsidian vault), today's "import" is presumably a pipeline that:

1. Ingests a CSV or JSON describing a framework's controls (or a crosswalk table).
2. Optionally fuzzy-matches values to existing notes (the Washington Post heritage).
3. Generates or updates Markdown notes — one per control — with a chosen frontmatter schema and link conventions.
4. May write inline-metadata-bearing links into evidence notes.

This pipeline is fragile in the ways every ad-hoc import pipeline is fragile: re-imports duplicate or stomp; updates to the source framework do not propagate cleanly; provenance is lost as soon as the data hits the vault; two users importing the same framework get notes that diverge; agents have no way to ask "where did this note come from and is it stale?"

The challenge is to give this primitive a foundation that survives.

---

## Phase 2 — First-Principles Decomposition of Import

Strip "import" of all language and tooling baggage and ask: across every system that has ever called something `import`, `include`, `require`, `use`, `open`, `from … import`, `link`, `with`, `owl:imports`, `extends`, `inherit`, `mount`, or `load`, what is the invariant skeleton?

I claim there are exactly **three** logically necessary operations and **seven** orthogonal properties any concrete import system must take a position on. Everything else is convenience.

### 2.1 The Three Necessary Operations

1. **Reference (`ref`).** Construct a token that *denotes* a thing in some external world without yet committing to having it. A reference has a *namespace* (where the lookup happens) and a *selector* (what to look up). `python -c "import os"` constructs a reference whose namespace is `sys.path` and selector is `os`. `<script src="https://cdn/x.js">` constructs a reference whose namespace is HTTP/DNS and selector is the URL.
2. **Resolve (`resolve`).** Turn a reference into a concrete artifact in a given environment, by some procedure that may consult caches, registries, networks, or the local filesystem. Resolution is partial (it can fail) and effectful (it can read the world). It returns either an artifact or an error.
3. **Bind (`bind`).** Take a resolved artifact and make it visible inside the importer's context under some local name and shape. Bindings can shadow, can be sealed, can be re-exported, can carry capabilities.

`import` in any language is some sequence and choice of these three. ML's `structure S = struct ... end` plus `open S` separates resolution-time binding from use-time exposure; Python's `import os as o` fuses resolve and bind; HTML's `<link rel="stylesheet">` does ref/resolve but the bind is into a global mutable style cascade. Hash-locked imports in Nix and Dhall make `resolve` deterministic by overconstraining the reference. Content-addressed code in Unison eliminates the reference entirely by making the artifact its own name — `bind` becomes the only operation, because `ref` is identity.

### 2.2 The Seven Orthogonal Properties

Any import primitive must take a position on each. The taxonomy below is what a designer is implicitly choosing among, whether they admit it or not.

1. **Identity.** Is two things the same import: by name, by path, by content hash, by structural shape, by behavior? Module systems range from name-equality (Python, Java) to type-equality plus sharing constraints (ML signatures with `where type`) to byte-identity (Nix store paths) to AST-hash identity (Unison).
2. **Resolution determinism.** Given the same reference, is `resolve` guaranteed to return the same artifact? `npm install` is famously non-deterministic without a lockfile; `nix-build` with a flake input pinned to a `narHash` is deterministic by construction; `pip install foo` is non-deterministic; `pip install foo==1.2.3 --hash=sha256:…` is.
3. **Trust.** What evidence does the importer require that the artifact is what it asked for? Maven Central GPG signatures, Sigstore, Subresource Integrity (`integrity="sha384-…"`), TUF metadata, RDF named-graph signatures. The space goes from "none" (CommonJS in 2014) to "must verify chain to a known root" (NixOS substituters with trusted public keys).
4. **Versioning.** How is change over time expressed and reconciled? SemVer ranges (npm, Cargo), exact pins (Go modules with `go.sum`, Bundler `Gemfile.lock`), content addressing (no version concept; new content is a new artifact, period — Unison, IPFS, Git blobs).
5. **Effects and capabilities.** What does a successful import grant? A pure value (Dhall — guaranteed to be a normal form of a typed term, no side effects, no Turing completeness)? An IO monad–suspended computation (Haskell)? Ambient authority (Python, where `import os` immediately gives you `os.system`)? Object capability — only what was passed in (E, Joe-E, Goblins, the WebAssembly Component Model with explicit imports/exports)?
6. **Transparency.** Does the importer see the structure of what was imported, and is it allowed to depend on internals? Sealed signatures in ML hide internals (`opaque`/`abstract`). C `#include` is fully transparent (the preprocessor pastes the bytes). Java packages have package-private. Backpack's holes/fills (Yang & Peyton Jones) are a particularly clean account: a unit imports a *signature* and gets filled with any *implementation* satisfying it.
7. **Composition.** What algebra do imports form? Can you compose imports (functor application, ML/OCaml)? Are imports commutative when independent (most systems yes, with caveats)? Idempotent (importing twice equals importing once — necessary for sane build graphs)? Are they associative? Many real systems break these laws and the breakage is the source of most pain.

### 2.3 The Boundary Question

A subtler decomposition: **what crosses the boundary at import time vs. use time?** This is the single deepest question and I will return to it. ML's generative functors *create* fresh types at application time; applicative ones *don't*. Python's `import` is "execute the module top-level code and bind the result"; ES Modules are "fetch, parse, link, evaluate, and bind." Rust's `use` is purely a renaming; the actual code is monomorphized later. RDF's `owl:imports` is a *closure operation* on the reasoning context — the imported graph is conceptually merged with the importer.

For Crosswalker the question is: when I import the NIST CSF, do I get *frozen note text*, *a parameterized recipe that produces note text*, or *a live binding* that re-resolves on each query? The right answer is "all three, in different layers," and I will argue this concretely below.

---

## Phase 3 — Survey of Prior Art

A foundation is only as deep as the literature it stands on. I cover programming-language module systems, build/package systems, hypermedia and ontology imports, OS/capability imports, and the agent-context layer that Crosswalker actually lives in. The point is not encyclopedia coverage but extracting the moves that matter for our problem.

### 3.1 Programming Language Module Systems

**ML modules and the Harper–Leroy line.** The ML module system (Harper, Lillibridge, MacQueen, Leroy in the 1990s) is the canonical formal account of importing as a structured operation. *Signatures* are interfaces (records of types and value bindings); *structures* are implementations; *functors* are functions from structures to structures. *Sealing* (`structure S :> SIG`) makes type identity opaque. *Sharing constraints* (`where type t = …`) re-establish identity selectively. Leroy's "Manifest types, modules, and separate compilation" (POPL 1994) and "Applicative functors and fully transparent higher-order modules" (POPL 1995) settled the applicative-vs-generative debate by giving each its own use case. Rossberg's **1ML** (ICFP 2015) showed modules can be reduced to ordinary System Fω terms — modules are first-class values and the apparatus of the ML module system falls out of dependent-ish typing. **Backpack** (Kilpatrick, Dreyer, Peyton Jones, Yang) is the most relevant to Crosswalker: it adds *signatures and mixin linking* to Haskell, so a unit of code declares what it needs (a `signature`) and a `unit` instantiates the signature with a concrete module. This separation of *what is needed* from *what is provided* is the right shape for importing GRC frameworks.

**Other PL module systems.** Racket's units (Flatt & Findler) generalize modules to first-class linkable components. Scala's path-dependent types let modules be values whose types track them. Rust crates use a path-based namespace plus a resolver that turns Cargo dependency declarations into a deterministic dependency graph (with `Cargo.lock` providing reproducibility). Go modules pin versions via `go.sum` cryptographic hashes.

**Python `import`.** PEP 328 (absolute/relative), PEP 451 (loaders/finders), and `sys.meta_path` give Python its three-level resolution (finder → loader → module). It is a useful negative example: ambient authority, side-effecting top-level code, no deterministic resolution guarantee, and the dual-package hazard between CPython, Conda, and various venvs.

**Node CommonJS vs ES modules.** The dual-package hazard — same package loaded twice with different module systems gives non-`===` instances — is the canonical "two imports denoting the same thing" failure when identity is by URL/path rather than content.

**JPMS, OSGi.** Java's module system (JEP 261, Project Jigsaw) attempted to solve the classpath's inverse problem (every public class is in scope). It introduced `requires`, `exports`, and `opens`, plus *strong encapsulation*. OSGi went further with dynamic versioned bundles. Both are object lessons in how to add module structure to an existing system without breaking everything.

**C/C++.** `#include` is the world's worst import primitive (textual substitution; no identity beyond the file path; ODR-violation risk; preprocessor-driven combinatorial explosions). C++20 modules (`import std;`) finally offer a real semantic boundary.

### 3.2 Build Systems and Package Managers

**Nix and the Dolstra thesis.** Eelco Dolstra's "The Purely Functional Software Deployment Model" (PhD thesis, 2006) is the most rigorous formalization of "what is an import" in production use today. A Nix derivation has a hash that is a function of every input — sources, build script, dependencies. The hash *is* the identity. Build a thing twice with the same inputs, get the same store path, and any consumer of that store path has cryptographic evidence of provenance. This is the gold standard for *deterministic resolution with hash-based identity*.

**Guix** is Nix in Scheme with a strong reproducibility ethic.

**Bazel/Buck.** Action graphs with content-addressed remote execution; `WORKSPACE`/`MODULE.bazel` declare external dependencies with integrity hashes. Same essential model.

**Dhall (Gabriel Gonzalez).** This is the prior art most directly relevant to Crosswalker's import primitive. Dhall is a non-Turing-complete configuration language whose import system has these exact properties: (1) imports are URLs or paths, (2) imports are resolved at parse time and replaced by the imported expression, (3) imports can be hash-pinned (`./config sha256:abc…`) which causes Dhall to refuse the import unless the bytes hash to the pin, (4) imports are typed and type-checked, (5) imports are *acyclic by syntactic restriction*, (6) imports can specify an "as Text" coercion or stay as Dhall, and (7) since the language has no IO, imports are pure values. Dhall's "absurdly long-term thinking" stance — your config will outlive the language — is the right mood for Crosswalker.

**Unison.** Code is content-addressed: every term/type has a hash that is a function of its AST modulo names. Names are presentation, not identity. There are no import statements in the traditional sense; you just refer to a hash (or a name that resolves to one). Renaming is a metadata operation; it never changes program behavior. Refactoring is monotonic addition. This is the most radical departure and it solves the "two imports denoting the same thing" question definitively.

**npm, cargo, maven, gradle.** Mainstream lessons: lockfiles, transitive resolution, version conflict ("diamond dependency"), and registry trust. Sigstore/SLSA/in-toto give us provenance attestations.

### 3.3 Hypermedia, Web, Knowledge Representation

**HTML/HTTP.** `<link>`, `<script src>`, the URL as universal identifier. *Subresource Integrity* (`integrity="sha384-…"`) is the modern answer to "what did I just import?" Browsers also ship sophisticated cache-key semantics (origin, credentialed, opaque) which are an implicit import-identity model.

**RDF, OWL, and `owl:imports`.** This is the most directly relevant prior art for the *semantic* side of Crosswalker. An `owl:imports` triple in an ontology says "for the purposes of reasoning, the import closure includes everything in that other ontology." Identity is by IRI, but the IRI is dereferenced to a graph, and the *closure operation* is set union with possible alignment via `owl:sameAs` and `rdfs:subClassOf`. The known pain: IRI dereference is brittle, versioning is hand-rolled (`owl:versionIRI`, `owl:priorVersion`), and reasoners can produce different closures on different days. Crosswalker should learn from these mistakes.

**JSON-LD `@context`.** A `@context` is a small dictionary that maps short keys to IRIs, importable by URL. It is the closest mainstream analog to what Crosswalker probably needs for framework metadata: a portable, embeddable, optionally-hash-locked recipe for how to interpret a JSON document as graph data.

**Schema.org.** A standing example of a *living vocabulary* that other vocabularies import or extend by reference. It demonstrates that IRIs as identity work *if* a community commits to URI persistence.

### 3.4 OS, Linkers, Capability Systems

**Dynamic linking (`ld.so`).** Symbol resolution as the original "import primitive" of Unix. `RTLD_LAZY` vs `RTLD_NOW`; symbol versioning in glibc; `LD_PRELOAD` as a security disaster. The lesson: late binding is powerful and dangerous; symbol identity by name + version is brittle.

**Plan 9 namespaces.** Per-process mount tables. Each process imports the world it sees; `bind` (the Plan 9 syscall, not an unrelated thing despite the lexical clash) attaches a name to a resource at a path. Imports are first-class, scoped, and revocable.

**Object-capability languages.** E (Mark Miller), Joe-E, Pict, Spritely Goblins. The principle: *importing should grant only what the import is*. Ambient authority is a bug. The Genode OS Framework realizes this for whole operating systems; seL4 proves it formally. The **WebAssembly Component Model** is the production bearer of these ideas now: a `.wit` (WebAssembly Interface Type) file declares typed imports and exports; a component instance can only do what its imports allow. This is the closest mainstream realization of the right model and Crosswalker should look at it carefully.

### 3.5 Theoretical Frameworks

- **Lambda calculus and substitution** is the most primitive import: $(\lambda x.\, e)\, v \to e[v/x]$ is "import $v$ as $x$ in $e$."
- **Dependent type theory.** Modules-as-records with sigma types; 1ML; Rossberg's account.
- **Category theory.** Modules as objects; signatures as objects; structures as morphisms; functors as functors; sharing as pullback. **Sheaves** are *exactly* the right abstraction for "compatible local imports glue into a global context": a presheaf over a site of contexts, with imports as restriction maps, satisfies the sheaf condition iff local data agrees on overlaps. I will use this in the formal model.
- **π-calculus and name passing.** Imports as channels; capabilities as restricted names; scope extrusion as "what happens when you pass an import out."
- **Content addressing and Merkle DAGs.** Git's blob/tree/commit structure; IPFS CIDs; the IPLD data model. The deepest property: *content-addressed identity is the only identity that survives mirroring, caching, and renaming*.
- **Information flow control.** Noninterference (Goguen–Meseguer); DCC (Abadi); Jif/Flow Caml. Imports as labeled values; the importer's clearance must dominate the importee's label. Relevant for compliance: an "evidence" import bound under "Confidential" must propagate that label.

### 3.6 The Agent-Context Layer

This is what `agent-context/zz-challenges/` *is* and where Crosswalker actually lives.

- **Model Context Protocol (MCP).** Anthropic's standard for connecting LLMs to external context. MCP defines *resources* (URI-addressed, listable, readable, optionally subscribable for change notifications), *tools* (callable functions), and *prompts* (parameterized templates). Resource URIs are the import primitive of MCP. Resources can be enumerated (`resources/list`) and read (`resources/read`); the protocol is built around the assumption that the model needs to *reference* things it does not have in context yet.
- **Anthropic Agent Skills / Claude Skills.** A `SKILL.md` plus auxiliary files; the skill is loaded by *progressive disclosure* — the model sees only the YAML frontmatter at startup and reads the body only when triggered. Skills are essentially filesystem-resident modules with a discovery protocol. Importing a skill is `read SKILL.md`.
- **GitHub's "agentic primitives."** `.prompt.md`, `.context.md`, AGENTS.md hierarchies. Universal portability across Copilot/Cursor/Codex. The composition rule is roughly "nearest AGENTS.md wins, with optional inheritance."
- **Letta Context Repositories.** Memory as a git repo; the agent can clone, branch, merge. Imports are git operations.
- **Voyager (Wang et al.) skill libraries; CoALA cognitive architecture; muratcankoylan's BDI skills.** Skills as first-class memory. The "skill is the primitive" thesis.
- **Retrieval as import.** RAG, vector indexes, hybrid retrievers — at heart, all of these are "name → artifact" resolvers with various identity, ranking, and provenance properties. The "context firewalls" critique (Mr. Decentralize substack) is exactly the trust/capability problem of import without provenance.
- **Knowledge Activation / AKU.** Recent work proposes a "skill primitive" with topology and activation policy as the institutional knowledge primitive for agentic software development.

The key shared insight across this layer: **context is finite, attention degrades with length ("context rot"), and so the import primitive must support *progressive disclosure* — a header/manifest is fetched first, the body only on demand**. Any formal foundation that does not bake progressive disclosure into the primitive will be unusable for Crosswalker's actual deployment target (LLM agents).

---

## Phase 4 — A Formal Foundation for Crosswalker's Import Primitive

I now propose a foundation. It draws most heavily from Dhall (hash-pinned typed imports), Backpack (signatures and fills), Nix (deterministic build with content-addressed identity), JSON-LD `@context` (portable interpretation recipes), MCP (URI-addressed resources with progressive disclosure), and the sheaf-theoretic view of contextual gluing.

### 4.1 Conceptual Essence (1–2 sentences, then unpacked)

> **An import in Crosswalker is the act of crossing a typed reference into the vault, producing a deterministic, provenance-bearing, locally-named binding to a content-identified artifact, such that two imports of the same content are observationally indistinguishable and re-imports across time are explicit, total, and revocable.**

Unpacked:

- **Typed reference** — an import is not a string URL; it is a value of type `Ref(τ)` for some τ describing what is expected (a Framework, a Crosswalk, an Evidence Pack, a Vocabulary).
- **Crossing the vault boundary** — the vault is the closed world; the network, filesystem outside the vault, and other people's vaults are the open world. Import is the *only* operation that crosses the boundary.
- **Deterministic** — given the same `Ref` (specifically, a `Ref` with a fully realized hash), `resolve` returns the same bytes or refuses.
- **Provenance-bearing** — every imported artifact records what it was imported from, when, by whom, with what verification status.
- **Locally-named binding** — the import lands in the vault under a chosen name (a path or a URI), separately from its content identity.
- **Content-identified artifact** — identity is a hash of normalized content, not a URL.
- **Observational indistinguishability** — if two imports have the same hash, every Crosswalker query returns the same answer for them.
- **Re-imports are explicit, total, revocable** — re-importing is `update`, not silent overwrite; the operation is total (it always defines the resulting vault state); and any imported subgraph can be retracted.

### 4.2 The Minimal Primitive(s)

I claim the foundation needs exactly **four** operations. Three are the universal `ref/resolve/bind` from Phase 2. The fourth — `seal` — is what makes the primitive *formal* rather than merely engineering.

```
ref     : Selector × ContextHints  → Ref τ
resolve : Ref τ × Env               → Either Error (Artifact τ × Provenance)
bind    : Artifact τ × LocalName    → VaultDelta
seal    : VaultDelta × Manifest     → SealedImport
```

with derived operations `import = bind ∘ resolve ∘ ref` (when types align) and `update : SealedImport × Ref τ → SealedImport` (an idempotent delta-application).

Why each is necessary:

- `ref` separates *intent* from *realization*. Without it, you have no language to talk about imports that have not happened yet. This is the operation Dhall and Nix get right and `#include` gets wrong. It is what lets agents *plan* imports in a search before committing.
- `resolve` is the only operation allowed to perform IO. Quarantining effects here is the single most important architectural decision; it is exactly what lets Dhall claim "configs are values."
- `bind` separates *what was imported* from *what it is called locally*. This is the move that fixes namespace collisions and the Python "rename and pray" problem. Local names are mutable; content identity is not.
- `seal` is the sealing/abstraction operation from ML. After sealing, the vault depends only on the `Manifest` (the exposed interface) of the import, not on its internals. Without `seal`, the vault becomes structurally coupled to the source's accidental shape and refactoring is impossible.

Why **only** these four: any other operation can be derived. `unimport` is the bind of an empty artifact under the same `LocalName`. `re-import` is `update`. `verify` reads the `Provenance`. `trust` is a property of the `Env`. `compose` is built from sequential `import`s under sheaf gluing.

### 4.3 A Formal Model

I give two compatible models. Together they form the foundation.

#### 4.3.1 A Type-Theoretic Account: Imports as Backpack-Style Fills with Hash-Pinned Identity

Let Crosswalker have a kind hierarchy:

```
Sort  :: { Framework, Control, Crosswalk, Evidence, Vocabulary, Vault }
Ref τ :: { uri : URI, version : VersionConstraint, integrity : Maybe Digest, expects : Sig τ }
Sig τ :: a structural signature describing the obligations the artifact must satisfy
Artifact τ :: a value matching Sig τ, plus a Digest computed by the canonicalization rule for τ
```

A **Vault** is, formally, a record of *holes* (signatures it expects to be filled) and *fills* (artifacts already supplied):

```
Vault = ⟨ Holes : Map LocalName (Sig τ),
          Fills : Map LocalName (Artifact τ × Provenance),
          Seals : Map LocalName (Manifest τ) ⟩
```

The typing rule for `import`:

```
Γ ⊢ r : Ref τ      Sig τ <: Hole(n)      resolve(r, Env) = (a, p)
                         a : Sig τ      digest(a) = integrity(r)  (if pinned)
─────────────────────────────────────────────────────────────────
            Γ, Vault ⊢ import r as n  ⇒  Vault[n ↦ (a, p)]
```

Reading: an import requires (1) a typed reference, (2) the artifact's signature is a subtype of the local hole's expectation, (3) resolution succeeds, and (4) if the reference was hash-pinned, the actual digest matches.

The sealing rule:

```
Vault.Fills(n) = (a, p)        Manifest τ ⊑ Sig(a)
─────────────────────────────────────────────────
   Vault ⊢ seal n with Manifest τ  ⇒  Vault[Seals(n) ↦ Manifest τ]
```

After sealing, the rest of the vault sees only `Manifest τ` for `n`, not the full structure of `a`. This is what makes the vault stable across upgrades that preserve the manifest.

This is the Backpack idea, lightly adapted: **a Crosswalker vault is a unit with holes for the frameworks and crosswalks it depends on, each filled by an import**. Different filings produce different vaults that are nevertheless linked by their shared manifest interface.

#### 4.3.2 A Categorical / Sheaf-Theoretic Account: Vaults as Sheaves Over a Site of Contexts

Define a category **Ctx** whose objects are *contexts* (vaults, sub-vaults, individual notes) and whose morphisms are *inclusions* (one context is a sub-context of another). A *covering* is a family of inclusions whose union is the target.

Define a presheaf $F : \mathbf{Ctx}^{op} \to \mathbf{Set}$ where $F(C)$ is the set of well-formed Crosswalker assertions in context $C$ (controls present, links resolved, evidence dated, etc.).

A vault is a *sheaf*: for any covering $\{C_i \to C\}$, the assertions in $C$ are exactly the families of assertions in each $C_i$ that agree on overlaps. Equivalently:

$$F(C) = \mathrm{eq}\!\left( \prod_i F(C_i) \rightrightarrows \prod_{i,j} F(C_i \cap C_j) \right)$$

Imports are then morphisms in the *site* — restriction/extension maps between contexts. To `import` a framework into a vault is to give a morphism from the context "vault before import" to "vault after import" that is *covering* (it actually adds the framework's content) and *coherent* (it agrees with all other imports on overlaps).

This view makes three things precise:

- **Identity of imports.** Two imports are equal iff the morphisms they induce are equal, which by content-addressing means iff their digests are equal.
- **Composition.** Imports compose by composition of morphisms; they are associative and have identities (the trivial import).
- **Conflict.** Two imports conflict iff their pushout fails to be a sheaf — i.e., they assert contradictory things on a shared sub-context. This is the formal account of "I imported NIST CSF v1.1 and NIST CSF v2.0 and they disagree about CC.ID.AM-1."

#### 4.3.3 Algebraic Laws

The primitive must satisfy:

- **Determinism (under pinning).** If `r₁` and `r₂` are pinned references with `integrity(r₁) = integrity(r₂)`, then `resolve(r₁) ≡ resolve(r₂)` modulo provenance metadata.
- **Idempotence.** `import r ; import r ≡ import r`. Re-importing the same reference does not change the vault.
- **Commutativity of independent imports.** If `r₁` and `r₂` have disjoint local names and disjoint downstream effects (no shared hole), then `import r₁ ; import r₂ ≡ import r₂ ; import r₁`.
- **Associativity of composite imports.** If a framework is itself composed of sub-imports, the parenthesization does not matter.
- **Functoriality of seal.** Sealing commutes with import: sealing-then-importing-into-a-larger-vault is the same as importing-then-sealing locally.
- **Provenance monotonicity.** Provenance is append-only. An import never erases provenance.

### 4.4 Identity, Equivalence, and Provenance

**Identity** is a triple:

$$\mathrm{Identity} = \langle \mathrm{ContentDigest},\ \mathrm{TypeSig},\ \mathrm{Canonicalization}\rangle$$

Two artifacts are *equal* iff they share all three. The `Canonicalization` field is essential and is the part most systems get wrong: it is the chosen normalization rule that takes the artifact's surface syntax to a canonical form before hashing. For Markdown notes, a canonicalization rule must specify line-ending policy, frontmatter key ordering, link normalization, whitespace. JSON Canonicalization (RFC 8785) is the relevant prior art; Crosswalker should adopt it for JSON inputs and define an equivalent for the Markdown+frontmatter pair.

**Equivalence** weaker than equality is also useful: two controls are *crosswalk-equivalent* if there is a chain of equivalence-typed crosswalk edges between them. Two frameworks are *manifest-equivalent* if they expose the same `Manifest` even if their internals differ.

**Provenance** is a record:

```
Provenance = { source_uri    : URI,
               retrieved_at  : ISO8601,
               retriever     : AgentId,
               digest        : Digest,
               signatures    : [Signature],          -- SLSA / Sigstore / GPG
               attestations  : [Attestation],        -- in-toto, SCITT
               parents       : [Provenance] }
```

`parents` makes provenance a Merkle DAG: every import knows what it was derived from, transitively. This is the analog of a Git commit graph and lets any future query say "where did this assertion ultimately come from?"

### 4.5 Versioning, Evolution, Compatibility

The right model is the **content-addressed-with-aliases** approach:

- Content addresses (digests) are immutable. They are the *true names*.
- Versions are *aliases*: human-readable mutable pointers from `(framework, semver-or-date)` to a digest.
- `Ref` can be expressed in three flavors: by alias (`nist:csf@2.0`), by alias-with-pin (`nist:csf@2.0 sha256:abc…`), or by digest alone (`sha256:abc…`).
- Resolution policy is configurable per vault: strict (digest-only), conservative (alias-with-pin required), permissive (alias-only allowed; warning logged).

Evolution of a framework upstream produces a *new* artifact with a new digest. The vault holds all imported versions; old assertions referencing the old digest remain valid. A migration from old to new is itself a first-class artifact: a *Migration Crosswalk* between the two digests.

Backward compatibility is recovered via the `Manifest`: as long as upstream changes preserve the Manifest exposed to Crosswalker, vaults built against the old version continue to type-check against the new one. This is exactly the SemVer-major / SemVer-minor distinction, but anchored in a precise interface rather than a number on a wrapper.

### 4.6 Trust, Capability, and Effect

The capability model: an import grants only what its `Manifest` exposes. The vault never sees ambient information from the import process.

Concretely:

- **Read-only by default.** Imports yield read-only artifacts in the vault. Mutations to imported content are forbidden; instead, the vault overlays *patches* (typed deltas) on top of the immutable artifact.
- **Effect labels.** Each artifact carries a label drawn from a lattice (e.g., `Public ⊑ Internal ⊑ Confidential ⊑ Restricted`). Joins propagate to any derived assertion. This is information-flow-control applied to compliance data, and it is non-negotiable for GRC.
- **Trust roots.** The vault declares a set of trusted signers (per-source-organization). Imports without a chain to a trusted root require explicit human override (a "manual trust" attestation that is itself a provenance entry).
- **Sandboxed resolution.** `resolve` runs in a process or container with no filesystem access outside a temp directory and no network access except to declared sources. WebAssembly Component Model–style imports are the implementation analog.

### 4.7 Composition Algebra

Given the operations and laws above, **imports form a commutative monoid up to isomorphism**, with the identity element being the empty import and the operation being parallel composition (independent imports). Sequential composition is associative. The vault as a whole is the colimit (in a categorical sense) of all sealed imports.

Two key derived operations:

- **Mixin-style filling.** A vault declares a hole `nist_csf : FrameworkSig` and the vault user supplies any artifact whose Manifest is a subtype of `FrameworkSig`. This is Backpack and it is exactly what GRC consumers need: I can develop my evidence model against an *abstract* Framework signature and fill in CIS, NIST, ISO, or my own private framework as needed.
- **Crosswalk-as-functor.** A crosswalk between Framework `A` and Framework `B` is, formally, a (partial) functor `A → B` in the category of controls. Composition of crosswalks is functor composition. Cycles are allowed and produce equivalence classes; sheafification computes their fixed points.

### 4.8 Failure Modes the Foundation Rules Out

The negative space matters. By construction, the formal foundation prevents:

- **Phantom drift.** Two practitioners running the same import script at different times getting different note bodies — impossible if the digest matches; refused if it does not.
- **Silent supply-chain compromise.** A compromised upstream serving different bytes — caught by digest mismatch.
- **Ambient authority leakage.** An import surreptitiously executing code or pulling in side dependencies — impossible because `resolve` is sandboxed and the artifact is a typed value.
- **Identity confusion across renames.** Renaming an upstream control file does not change identity — content-addressing is immune.
- **Two-imports-one-thing.** Two imports of the same framework via different aliases do not duplicate notes; the digest collapses them.
- **Cyclical imports causing nontermination.** Acyclic by syntactic restriction (Dhall's discipline) or detected and rejected.
- **Stale crosswalks against new framework versions.** Crosswalks reference digests; an old crosswalk explicitly applies to a specific version, and using it against a new digest is a *typed error* requiring an explicit migration crosswalk.
- **Provenance laundering.** Provenance is append-only and Merkle-linked.

What the foundation explicitly does *not* prevent and considers out-of-scope:

- Semantic correctness of crosswalk mappings (an "ISO 27001 A.5.1 ≡ NIST AC-1" assertion can still be wrong; the system can only ensure it is *attributed*, *signed*, and *versioned*).
- Adequacy of the Manifest's expressivity for any given framework — that is a vocabulary-design problem.
- Trust in the source organization itself — that is governance, not formal foundation.

---

## Phase 5 — A Practical Design Crosswalker Could Ship

Translating the foundation into something concrete. I propose: an **`Import` primitive expressed as a hash-pinned, Manifest-typed, sealed import statement living in vault-level configuration files**, with a deterministic resolution algorithm, integration with Obsidian-native conventions, and a migration path from current ad-hoc imports.

### 5.1 Syntax (Three Coupled Layers)

The trick is recognizing that Crosswalker has three audiences — humans, the Crosswalker tool, and AI agents — and the import primitive must be readable to all three. I propose a layered format that is pure Markdown plus YAML, no new file types.

**Layer 1 — vault root manifest (`crosswalker.yaml`).** Declares the holes the vault expects.

```yaml
crosswalker_version: 1
vault_id: "acme-grc-vault-prod"
signature_roots:
  - name: nist
    keys: [ "ed25519:..." ]
  - name: cis
    keys: [ "ed25519:..." ]
holes:
  primary_framework:
    sort: Framework
    manifest: "manifests/framework.v1.dhall"
  evidence_classifier:
    sort: Vocabulary
    manifest: "manifests/evidence-classifier.v1.dhall"
```

**Layer 2 — import declaration file (`imports/*.import.md`).** One file per import. It is itself a Markdown note (so Obsidian renders it) with structured frontmatter.

```markdown
---
crosswalker_import: 1
local_name: primary_framework
ref:
  uri: "https://www.nist.gov/cyberframework/v2.0/csf-2.0.json"
  version: "2.0"
  integrity: "sha256-3fX9...c2"
expects: "manifests/framework.v1.dhall"
seal_with: "manifests/framework.v1.dhall"
trust:
  signers: ["nist"]
  attestations: ["sigstore:..."]
provenance:
  retrieved_at: "2026-04-12T10:33:01Z"
  retriever: "agent:local-cli@1.4.2"
labels:
  classification: Public
canonicalization: rfc8785+md-canon-v1
---
# NIST CSF 2.0 import

This import binds the NIST Cybersecurity Framework v2.0 as the vault's
`primary_framework`. See provenance above. The materialized notes live
under `frameworks/nist-csf-2.0/`.
```

**Layer 3 — materialized notes (the actual `frameworks/nist-csf-2.0/AC-1.md` etc.).** These are *generated* artifacts of the bind step. Each has frontmatter that points back to its parent import:

```yaml
---
crosswalker_kind: Control
import: "imports/nist-csf-2.0.import.md"
content_digest: "sha256-..."
control_id: "GV.OC-01"
framework: "nist-csf"
framework_version: "2.0"
---
```

This three-layer split is essential. Layer 1 says "here is the shape my vault expects." Layer 2 says "here is the specific reference filling that shape." Layer 3 is the materialized content that humans browse and link to. Editing Layer 3 by hand is a vault-managed *patch* that overlays the immutable artifact (recorded in Layer 2's provenance for a future refresh).

An alternative, more compact, syntax — for power users — is a Dhall-style inline import expressed in a single file. The verbose multi-file form is, however, the right default for Obsidian: every layer is a Markdown file an agent can `cat`.

### 5.2 Data Model

```
Sort       ::= Framework | Crosswalk | Evidence | Vocabulary | Patch
Digest     ::= "sha256-" base64url(32)
URI        ::= absolute URI
Version    ::= semver | iso-date | "git:" sha
Manifest   ::= Dhall expression (typed) defining required interface
Provenance ::= append-only DAG of provenance records
Label      ::= element of classification lattice
Import     ::= { local_name, ref, expects, seal_with,
                 trust, provenance, labels, canonicalization }
```

Invariants:
1. Every materialized note has exactly one `import` ancestor.
2. Every import has exactly one Manifest it is sealed against.
3. `content_digest` of any artifact is reproducible from canonicalized bytes.
4. Provenance is acyclic and append-only.
5. Imports are acyclic.

### 5.3 Resolution Algorithm

```
resolve(ref, env):
  1. validate(ref): well-formed URI, version, optional integrity
  2. consult_cache(ref):
       if ref.integrity present and cache hit by digest → return cached
       if alias-only and cache hit and alias→digest mapping fresh → return
  3. fetch(ref.uri, env.network_policy):
       in sandbox, with HTTP semantics, respecting redirects only within
       trust scope
  4. canonicalize(bytes, ref.canonicalization)
  5. compute digest := hash(canonicalized_bytes)
  6. if ref.integrity present and digest ≠ ref.integrity → ABORT, error
  7. parse(canonicalized_bytes, expects type) → artifact or type-error
  8. verify(artifact, ref.trust):
       check signatures against env.signature_roots
       collect attestations
  9. record_provenance(ref, digest, signatures, retrieved_at, retriever)
 10. return (artifact, provenance)
```

`bind` then writes Layer 3 materialized notes deterministically from `artifact`. `seal` records the chosen Manifest. The vault delta is committed to the vault's git history with a standardized commit message.

### 5.4 Interaction with Adjacent Challenges

Without the specific challenge index, I infer adjacent challenges from the project's needs and the conventions of agent-context repositories. The import primitive interacts with at least:

- **Identity / deduplication of controls.** Solved at the foundation level by content addressing of imported artifacts; surface-level uniqueness of `Control` notes is enforced by `(framework, framework_version, control_id)` triples derived from the artifact, not invented locally.
- **Schema / frontmatter conventions.** The `Manifest` for `Framework`, `Crosswalk`, `Evidence`, and `Vocabulary` *is* the schema. Frontmatter shapes are derived from Manifests, not authored separately.
- **Vault sync / CRDT reconciliation** (mentioned in the README). Imports cooperate with CRDTs because Layer 3 notes are deterministic functions of Layer 2 declarations: conflicts only arise on user-authored patches, which the CRDT layer already handles. The import declarations themselves can be treated as last-writer-wins keyed by digest.
- **Agent-context delivery.** The Manifest of any sealed import doubles as an agent-context summary: an agent loading the vault's `crosswalker.yaml` and the manifest files knows the *shape* of the vault's data without reading any framework body. Progressive disclosure is automatic.
- **Crosswalk authoring.** A new crosswalk is itself an import, sourced from a crosswalk file (SCF STRM, NIST mappings, internal). Its Manifest declares which frameworks it relates and its rows must type-check against the digests of those frameworks.
- **Evidence import.** Evidence dossiers (vendor SOC 2 reports, pen-test attestations) are imports of `Sort = Evidence` with appropriate trust roots and labels.

### 5.5 Migration Path

I assume current Crosswalker importers are scripts that read a CSV/JSON and emit notes. The migration is staged:

1. **Wrap, do not replace.** Existing import scripts are wrapped to emit a Layer 2 `*.import.md` declaration with provenance derived from the script's invocation. Layer 3 notes are written exactly as today, plus the back-pointer `import:` frontmatter.
2. **Introduce Manifests.** For each currently supported framework, write a Manifest in Dhall (or, more practically for Obsidian, a JSON Schema). Run sealing in *advisory* mode: type errors are warnings, not errors.
3. **Introduce hash pins.** Lockfile (`crosswalker.lock`) records digests after first successful import. Re-imports check pins; mismatches surface a diff for review.
4. **Introduce trust roots.** Start with self-signed; integrate Sigstore/SLSA when upstreams provide them.
5. **Switch sealing to enforcing mode.** After a transition period, type errors abort. Existing vaults are grandfathered with explicit unsealed regions.
6. **Deprecate ad-hoc imports.** Any path into the vault that does not go through the primitive is removed.

The migration is monotonic: at no point does an existing vault stop working.

### 5.6 Worked Examples

**Example A — Importing NIST CSF 2.0 as the vault's primary framework.** As shown in 5.1. The user runs `crosswalker import nist-csf@2.0 --as primary_framework`. The tool fetches the JSON from NIST, canonicalizes it (RFC-8785), computes the digest, materializes one note per Function/Category/Subcategory, writes the Layer 2 declaration with provenance, and seals against the `Framework` manifest. A year later NIST publishes 2.1; the user runs `crosswalker update nist-csf`; a new digest, a new Layer 2 file, a *Migration Crosswalk* (auto-generated where IDs match, manual where they differ) is proposed, and the user reviews the diff.

**Example B — Importing a third-party crosswalk SCF STRM.** The SCF publishes an STRM mapping NIST CSF to ISO 27001. It is imported as `Sort = Crosswalk`, with its Manifest declaring source/target framework manifests. Sealing fails if the source/target manifests in the import do not match the digests of the frameworks already in the vault. The fix is either to import a different SCF version or to declare an explicit version-bridging migration.

**Example C — Importing evidence from a vendor SOC 2 report PDF bundle.** Sort is `Evidence` with classification label `Confidential`. Trust root is the auditor's signing key. The bind step generates evidence notes whose links to controls (`covers:: [[...]]`) carry the inline metadata Crosswalker already uses. The classification label propagates: any vault export that includes this evidence inherits the `Confidential` label and the export tool refuses to publish it without a label declassification step.

**Example D — Sharing a vault skeleton.** Another organization wants the same shape of vault. They do not import the parent vault's *content* (which may be confidential) — they import the parent vault's `crosswalker.yaml` and Manifest files only. The resulting vault has the same holes; it can be filled with their own evidence. This is exactly the Backpack pattern: the *interface* is sharable, the *implementation* is private.

**Example E — An AI agent reasoning over the vault.** The agent loads `crosswalker.yaml` plus the manifest files (a few KB total) and now knows what the vault contains structurally. It can run a query like "find all controls where evidence is older than 90 days and the framework is NIST CSF 2.0" by reading materialized note frontmatter, with no need to load body text. If it needs a body, it reads exactly one note. Progressive disclosure is in the foundation.

### 5.7 Open Questions and Non-Goals

**Open questions worth stating explicitly:**

1. **Choice of Manifest language.** Dhall is the principled choice (typed, total, importable, hash-pinnable). JSON Schema is the pragmatic choice (huge ecosystem, but no native imports, weaker types). CUE sits between. I lean Dhall but acknowledge tooling cost.
2. **Markdown canonicalization.** RFC 8785 covers JSON; there is no equivalent standard for Markdown+frontmatter+wikilinks. Crosswalker may need to specify one. This is a small but real piece of standards work.
3. **Crosswalk identity at the *edge* level vs. the *table* level.** Is each `(source, target, type)` triple its own artifact, or is a Crosswalk a single artifact whose body is a list of edges? I lean toward the latter for ergonomics with a derived edge view for queries.
4. **How aggressively to sandbox `resolve`.** Pure HTTP fetch is easy. What about imports from a Git repo at a tag (which requires `git`)? What about imports from an MCP server (which requires the agent's environment)? A capability-passing model where `Env` carries explicit fetchers is the right answer; the implementation cost is real.
5. **Granularity of provenance.** Is provenance per-import or per-control? I argue per-import for storage practicality, per-control derivable on demand from the import's manifest plus the artifact.
6. **Patches over imports.** When a human edits a materialized note, the edit must be a patch on an immutable substrate. Storing patches as separate files is clean but doubles file count; storing them as overlay frontmatter is compact but blurs identity. Needs a decision.

**Explicit non-goals:**

- Import does **not** make assertions about the *truth* of imported claims. NIST published these controls; that is what we record. Whether the controls *should* be the controls is governance.
- Import does **not** solve framework alignment. A crosswalk is a separate artifact that the import primitive happens to import.
- Import does **not** subsume export. Export is a different boundary; while the design here would generalize, exporting requires a separate analysis (especially around classification labels).
- Import does **not** require Crosswalker to become a programming language. The Manifest layer is small and domain-specific; we reuse Dhall or JSON Schema rather than invent a language.

---

## Closing Position

The temptation, when faced with an `agent-context/zz-challenges/20-import-primitive-formal-foundation/`, is to draft a JSON schema for an import record and call it foundational. That is engineering, not foundation. A formal foundation, in the sense the challenge title implies, is a *theory* under which the engineering is forced.

The theory I propose is simple and uncompromising:

1. **Imports are typed references that resolve, deterministically, to content-identified artifacts and bind to local names under sealed manifests.** This is `ref/resolve/bind/seal` from Phase 4.2.
2. **Identity is content. Names are presentation. Versions are aliases.** This is the Unison/Nix/Dhall lesson.
3. **Provenance is append-only and Merkle-linked.** Every assertion in the vault knows where it came from, transitively, forever.
4. **Capabilities are explicit. Effects are sandboxed. Trust is rooted in declared signers.** This is the WebAssembly Component Model / object-capability lesson, applied to a knowledge graph.
5. **Sheaf gluing is the right model for combining imports.** Composition is associative; conflicts are precisely failures of the sheaf condition.
6. **Progressive disclosure is built in.** Manifests are the agent-context summary; bodies are loaded on demand.

Where Crosswalker today probably has CSV-to-Markdown scripts, the foundation says: every such script is an instance of `bind ∘ resolve ∘ ref` against an implicit Manifest, and all the system needs is to make those four operations explicit, typed, hash-pinned, signed, sealed, and append-only-provenanced.

Where Crosswalker today probably treats a re-import as a destructive overwrite, the foundation says: every re-import is a typed delta against an immutable substrate, and the substrate is named by its content, so two practitioners on different machines at different times computing the same delta can see they got the same answer without trusting each other.

Where Crosswalker today probably loses provenance the moment a control note hits the vault, the foundation says: provenance is part of the note's identity, and the note that lacks it is malformed.

The biggest risk is that this looks heavyweight for a tool that started as "match precinct names." It is not. The runtime cost is one more frontmatter section per generated note, one extra file per import, and a lockfile. The intellectual cost is naming four operations and committing to them. The benefit is that Crosswalker becomes a system that GRC practitioners can actually *trust* — and, just as importantly, that AI agents can reason over without making things up. In a world where compliance is increasingly performed under the gaze of regulators who want to see provenance and increasingly drafted by agents who need to see structure, that is the only foundation worth building on.
