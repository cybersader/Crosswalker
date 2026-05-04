---
title: "Challenge 23 — Bundle engine implementation language"
description: "Adversarial research deliverable on which language/runtime hosts Crosswalker's bundled ETL engine. Verdict: Path A (Pure TypeScript in-plugin) for v0.1, with Path C (Hybrid: optional external producer) reserved as v0.5+ extension. Rejects Path B (external Python as core), Path D (Rust→WASM), Path E (Go→WASM), Path F (JVM). Reasoning: mobile-Obsidian portability without forks + survival of a niche GRC plugin in a small-contributor OSS world are the two irreversible constraints; every other dimension is tractable engineering. Includes empirical bundle-size figures, path-by-path scoring on 8 dimensions, migration cost analysis, 5-year survival projection, adversarial self-critique, and 9 specific v0.1 commitments."
tags: [research, deliverable, import, etl, runtime, language-choice, governance, sustainability, bundle-size, mobile-portability, typescript, jsonata, ajv, papaparse, sheetjs]
date: 2026-05-04
sidebar:
  label: "Ch 23 · Bundle engine language"
  order: -20260504.1
---

# Challenge 23: Bundle Engine Implementation Language for Crosswalker

## Executive Recommendation

**Ship Path A (Pure TypeScript in-plugin) for v0.1, with Path C (Hybrid: optional external producer escape hatch) as the explicit, contractually-defined v0.5+ extension.** Reject Path B (External Python as core), Path D (Rust→WASM), Path E (Go→WASM), and Path F (JVM) as primary engines.

This is not a TypeScript-by-default conclusion. It is the conclusion forced by two irreversible constraints that no other path satisfies simultaneously: (1) **mobile-Obsidian portability without forks** and (2) **survival of a niche GRC plugin in a small-contributor OSS world**. Every other dimension — bundle size, performance, ecosystem — is a tractable engineering problem. Those two are existential.

The rest of this report defends that recommendation by steelmanning each path, attacking the easy answers, and quantifying the empirical trade-offs.

---

## 1. Constraint Validation

Before scoring paths, the five non-negotiables must be re-examined honestly. Some are softer than the framing suggests; one is harder.

**Constraint 1 (Obsidian sandbox compatibility): HARD AND VERIFIED.** Obsidian uses Electron ~v34 on desktop and Capacitor ~v5 on iOS/Android, which is the architectural reality echoed across community documentation and the Obsidian help wiki. The plugin sandbox executes `main.js` in the renderer process; on desktop the Node.js APIs (`child_process`, `fs`) are reachable, on mobile they are not. The 1.2 MB threshold for `main.js` is *not* a hard technical limit — community discussion and plugin reviewer Joethei have repeatedly noted there is no enforced cap — but it is a strong soft norm; large plugins (e.g., a recent 40+ dependency React/TanStack/Visx-based plugin manager) draw scrutiny and "third-party plugin store" patterns are explicitly rejected by the review team. Treat 1.2 MB as a defensible ceiling, not a mathematical wall.

**Constraint 2 (tree-shaped sources entirely in-plugin): HARD AND CORRECT.** OSCAL, MITRE STIX, NIST 800-53 JSON, ISO 27001 mappings, and CIS Controls all distribute as JSON or YAML. Requiring a Python install before someone can crosswalk *800-53 → ISO 27001* — a textbook GRC use case shipped as JSON by NIST — is plugin-product malpractice.

**Constraint 3 (escape hatch for messy tabular): HARD AND CORRECT.** The actual NIST 800-53 XLSX with merged cells, ATT&CK Excel matrices, and scraped HTML/Notion exports defeat in-browser tree-shakable parsers. SheetJS reads XLSX in-browser, but merged-cell normalization, multi-sheet pivot reconstruction, and OCR-adjacent cleanup are categorically Polars/pandas territory. Trying to do this purely client-side is a tar pit.

**Constraint 4 (small-OSS sustainability over 5–10 years): HARD AND UNDERAPPRECIATED.** The single biggest survival risk is not bundle size or performance; it is contributor recruitability. Obsidian's plugin contributor pool is overwhelmingly TypeScript-fluent (the official sample plugin, the Fevol/obsidian-typings community, and the topics filtered by `obsidian-plugin` topic on GitHub are almost entirely TypeScript). A Rust or JVM core will not get drive-by PRs.

**Constraint 5 (AI-agent recipe authoring): SOFT.** What matters is that recipes are declarative data (YAML/JSON with JSONata expressions). The *engine* language barely affects this; an agent can author YARRRML against a Rust runtime as easily as a TypeScript one. Don't let this constraint distort engine choice. It does, however, reinforce that the engine should produce excellent error messages with line/column pointers — easier in TS than in WASM-trampolined Rust.

**Reframing the mobile question.** Is mobile-Obsidian portability *really* required, or is desktop-only acceptable? An honest answer: GRC compliance work itself is overwhelmingly desktop. *But* the plugin is consumed inside Obsidian vaults that users sync across devices. If Crosswalker ships desktop-only, every recipe imported on the desktop must still produce vault primitives that don't break the user's mobile Obsidian. The *runtime* arguably does not need to run on mobile (you'd never re-import a 50 MB OSCAL bundle on a phone). The *plugin must not crash on mobile* and basic recipe inspection/validation should work. This relaxation is critical: it means Path C's external producer can be fully desktop-only with a clean "Mobile: import unavailable on this platform" notice (mirroring the official Obsidian Importer's `Platform.isDesktopApp` pattern) without violating the spirit of the constraint. The in-plugin tree-shaped engine, however, *must* work on both.

---

## 2. Bundle-Size Empirical Reality

Empirical figures (min+gzip unless noted), from npm/Bundlephobia and the SheetJS docs:

| Library | Minified | Min+gzip | Notes |
|---|---|---|---|
| `jsonata` 2.0.x | ~165 KB | ~45–55 KB | Single self-contained file; no runtime deps |
| `papaparse` 5.x | ~45 KB | ~18–20 KB | Zero deps; battle-tested CSV |
| `js-yaml` 4.x | ~40 KB | ~14 KB | YAML 1.2 |
| `ajv` 8.x | ~120 KB | ~32 KB | Plus `ajv-formats` ~10 KB gz |
| `nanoid` | under 1 KB | under 1 KB | |
| `xlsx` (SheetJS, full) | ~900 KB unminified, ~300 KB min | ~110 KB | XLS codepage tables dominate |
| `xlsx` (SheetJS, ESM read-only XLSX, tree-shaken) | ~150–200 KB min | ~55–70 KB | `writeFileXLSX` named-import path |

**Path A (Pure TS) realistic bundle estimate.** A read-focused Crosswalker engine that bundles JSONata + papaparse + js-yaml + AJV + nanoid + the engine code itself + manifest validation is approximately **240–280 KB minified, ~95–115 KB gzipped** before any XLSX support. Adding tree-shaken read-only SheetJS pushes it to **~430–480 KB minified, ~160–185 KB gzipped**. This matches the Ch 20-A 480 KB estimate and stays well under 1.2 MB. Adding `xlsx` full (with XLS legacy support) would punch through ~700 KB minified — feasible but tight. **Verdict: Path A fits comfortably with margin for the engine itself, error formatting, and the surface DSL parser.**

**Path D (Rust→WASM) realistic bundle estimate.** A `wasm-bindgen` hello-world starts at ~30 KB. Adding `serde_json` + `serde_yaml` + a JSONata-equivalent (no production-grade Rust port exists today; you would either port one or use `jaq`/`jq`-style alternatives) + `calamine` for XLSX is ~600 KB to 1.0 MB before optimization. With `opt-level = "z"`, LTO, `wasm-opt -Oz`, and `panic_immediate_abort`, real-world equivalent crates land in the **400–700 KB range minified WASM**, plus ~10–20 KB of JS glue. That fits, but it consumes the budget that XLSX support would otherwise need, and you've burned months building a JSONata-in-Rust that does not exist. **Verdict: Path D is technically achievable but you pay the entire size budget rebuilding ecosystem you already had in JS.**

**Path E (Go→WASM) realistic bundle estimate.** Standard `go build -target wasm` produces ~2 MB minimum due to runtime + GC. TinyGo cuts this dramatically — a non-trivial program lands at 200–400 KB after `-no-debug -opt=z` — but TinyGo does not support all Go language features (notably reflection-heavy YAML/JSON libraries can fail). You'd need to vet every dependency. **Verdict: Plausible only with TinyGo and aggressive library vetting; little upside over Rust→WASM and a smaller contributor pool of TinyGo experts.**

**Comparison anchors in the Obsidian ecosystem.** Smart Connections, the most prominent precedent for a "heavy in-plugin runtime," ships a transformers.js/ONNX local embedding model, demonstrating the community accepts multi-MB main.js sizes when the value is clear. The Obsidian Importer plugin (the closest functional analog to Crosswalker — converts external formats to vault primitives) is pure TypeScript, declares `isDesktopOnly: false`, and gates desktop-only formats (Apple Notes SQLite, OneNote OAuth) behind `Platform.isDesktopApp` checks. KawaNae's WebP image converter uses `@jsquash/webp` WASM and explicitly works on both desktop and mobile, proving WASM in Capacitor WebView is viable. There is also a recurring forum thread reporting `Worker is not a constructor` errors on recent Obsidian versions, which means **Web Workers are an unreliable assumption for a v0.1 plugin** — design the engine to run on the main thread and yield cooperatively.

---

## 3. Steelman of Each Path

**Path A — Pure TypeScript in-plugin.** The strongest defense: every Obsidian plugin developer can read, modify, and debug it; bundle fits; mobile works; the JSONata + AJV + js-yaml + papaparse stack has 10+ year track records and over 1M weekly downloads each; a single-language codebase is the lowest-overhead governance model for a small-OSS project; AI agents can read and emit recipes plus execute the engine inline (e.g., in a sandbox or in a headless test harness) without external tooling. Attack: it punts the messy-tabular hard case. Counterattack: Crosswalker is a vault-native plugin, not a data-engineering ETL platform; defining the messy-tabular boundary explicitly is a feature, not a bug.

**Path B — External Python with Polars + DuckDB.** The strongest defense: Polars + DuckDB demolish messy-tabular work; no JS library remotely competes for merged-cell XLSX wrangling at scale; pyyaml/pydantic ecosystem is mature; data-engineering recipe authors are Python-native. Attack: it breaks mobile entirely; install friction is documented as the #1 user complaint pattern across Pandoc plugin issues, where users repeatedly fail at "set the path to `which pandoc`" — and *those users were technical enough to install Pandoc voluntarily*. GRC analysts, the target audience, are typically not. Path B silently locks out every iPad-only Obsidian user and creates a support tax forever. **Verdict: disqualified as the primary engine.**

**Path C — Hybrid (TS in-plugin + optional external producer).** The strongest defense: it dodges the false dichotomy. Tree-shaped sources stay in-plugin; messy-tabular delegates to a separately-installed CLI (Python or Go binary) that emits clean JSON, which the in-plugin engine then ingests. The producer is opt-in, mobile users keep the easy 60 %, the marketplace community can publish producers in any language. Attack: "having cake and eating it too" — every hybrid system has a coordination tax. Specifically: (a) recipe portability suffers (a recipe that works for User X with the Python producer installed mysteriously doesn't work for User Y); (b) error messages cross a process boundary, killing debuggability; (c) you're maintaining two codebases on day 1 when the plugin has no users; (d) the "moderate complexity" framing understates the protocol-design cost (versioning, schema negotiation, streaming for large files, secret/token handling for source URLs). **Path C is the right v1.0 destination but the wrong v0.1 starting point** — building two runtimes simultaneously without users is the classic premature-optimization failure mode.

**Path D — Rust→WASM in-plugin.** The strongest defense: smallest runtime per feature, fastest execution, type-safe, mobile-compatible. Real working precedents exist (rachtsingh/obsidian-rust-template, KawaNae's WebP converter). Attack: there is no production-grade JSONata implementation in Rust; calamine for XLSX is good but not Polars; the Obsidian community's Rust contributor count is low single digits; WASM debugging is famously bad (no source maps to original Rust without significant tooling effort); and the build pipeline (`wasm-pack` + `wasm-bindgen` + `wasm-opt` + esbuild bridging) is brittle compared to plain `esbuild`. **Verdict: a future migration target if the engine becomes performance-critical, not a v0.1 choice.**

**Path E — Go→WASM in-plugin.** The strongest defense: easier contributor pool than Rust; TinyGo works. Attack: bundle bloat (over 200 KB even for trivial programs); TinyGo's incomplete language support means picking dependencies carefully; reflection-heavy YAML/JSON libraries may not compile under TinyGo; and the wasm_exec.js glue is actively maintained but has historically had compatibility regressions. **Verdict: dominated by Path D for size and Path A for contributors. No use case where E wins.**

**Path F — JVM (RMLMapper-Java).** The strongest defense: RMLMapper is the canonical, semantically-correct RML implementation, used in production by data-integration teams and aligned with the YARRRML provenance Crosswalker inherits from Ch 20. Attack: Java install friction is worse than Python; zero overlap with Obsidian-plugin developers; no in-plugin story; bad fit for the user persona. **Verdict: useful as a *reference oracle* during recipe-language design (validate that Crosswalker's surface DSL semantics agree with RMLMapper on shared subsets), but never as a runtime users install.**

---

## 4. Path-by-Path Scoring on the Eight Dimensions

Scores: ✅ strong, 🟡 acceptable, ⚠ marginal, ❌ disqualifying.

| Dimension | A: Pure TS | B: Ext. Python | C: Hybrid | D: Rust→WASM | E: Go→WASM | F: JVM |
|---|---|---|---|---|---|---|
| 1. Bundle ≤ 1.2 MB | ✅ ~480 KB realistic | ✅ shim only ~50 KB | ✅ shim + TS engine ~480 KB | 🟡 400–700 KB after `-Oz` | ⚠ TinyGo-only viable | ✅ shim only |
| 2. Mobile portability | ✅ full | ❌ no subprocess on iOS/Android | 🟡 easy case works, hard case desktop-only | ✅ WASM works in Capacitor (verified) | ✅ WASM works | ❌ |
| 3. Install friction | ✅ zero | ❌ Python + venv + path config | 🟡 zero for 60 %, high for 40 % | ✅ zero (build-time only) | ✅ zero | ❌ JRE install |
| 4. Debuggability / contributors | ✅ Chrome devtools, every Obsidian dev | ⚠ subprocess + Python | 🟡 two domains | ❌ WASM debug is poor; under 5 % of community | ⚠ TinyGo experts rare | ❌ |
| 5. Ecosystem maturity for primitives | ✅ JSONata, AJV, papaparse, js-yaml, sheetjs all 5–15 yrs old | ✅ Polars, DuckDB, pyyaml, pydantic | ✅ best of both | ⚠ no Rust JSONata; calamine ≠ Polars | ⚠ Go YAML/JSON parsers need vetting under TinyGo | ✅ RMLMapper |
| 6. Five-year drift risk | ✅ core libs over 1M wkly downloads | 🟡 Polars young but well-funded | 🟡 risk surface = sum of both | ⚠ wasm-bindgen churn; no JSONata-Rust maintainer to inherit | ⚠ TinyGo single-org-led | ✅ JVM = boring stable |
| 7. Agent ergonomics | ✅ agents fluent in TS; can run engine in Node | ✅ agents fluent in Python | ✅ agents handle both | ⚠ agents weak in Rust | ⚠ agents OK in Go but trampoline opacity | ⚠ |
| 8. Governance / sustainability | ✅ single repo | ⚠ two repos, two release cadences | ⚠ two repos, protocol versioning | ⚠ source + bindings + WASM artifacts | ⚠ same | ⚠ |

Path A is the only path with no ❌ and no ⚠ on dimensions 1–4 (the "irreversible" properties). Path C is the only credible alternative once the desktop-only producer is opt-in.

---

## 5. The Two Irreversible Properties

Of the eight dimensions, only two are effectively irreversible once shipped:

**(a) The choice of in-plugin runtime language.** Migrating from TS to Rust→WASM is a partial rewrite of every primitive (`iterate`, `reference`, `template`, `bind`, `join`, `invert`) plus the JSONata expression layer plus the surface-DSL parser. Migrating from Rust→WASM back to TS is similar in size but worse in motivation (you'd be admitting WASM was a mistake). Migrating between TS bundlers (esbuild ↔ Bun ↔ tsup) is trivial.

**(b) The recipe file format and its Obsidian-side outputs.** Once users have authored crosswalk recipes and committed vault YAML files referencing them, those files must keep working forever. This dimension does *not* depend on the engine language — JSONata-in-TS and JSONata-in-Rust evaluate the same expressions identically — *if* the engine commits to JSONata as the expression layer rather than rolling its own.

Engine language is irreversible; engine implementation is not. **Recommend the path that gets the in-plugin runtime right (Path A), and design the recipe schema to be runtime-agnostic so a future Path D port is possible without breaking user files.**

---

## 6. Migration Cost Analysis

**v0.1 ships Path A; v1.0 needs Path C (likely scenario).** Cost: small. Add an optional setting "External producer URL or path"; define a JSON-line streaming protocol on stdout; ship a reference Python producer in a separate repo with `polars` + `duckdb` + `openpyxl`; gate behind `Platform.isDesktopApp`. The in-plugin engine continues to handle the easy 60 % case and *also* ingests producer output as just-another-tree-shaped-source. Estimated effort: 1–2 contributor-months for the protocol and reference producer.

**v0.1 ships Path A; v1.0 needs Path D (less likely scenario).** Cost: substantial. Requires reimplementing JSONata semantics in Rust (no production port exists; the closest is partial). Estimated effort: 6–12 contributor-months. Unlikely to be justified unless performance becomes a user-visible problem on vaults with very large frameworks (e.g., enterprise control catalogs with tens of thousands of items), which is unusual for GRC content.

**v0.1 ships Path C; v1.0 retreats to Path A (i.e., the producer is unused).** Cost: medium-high regret. You built a protocol and producer no one needs, you carry that maintenance burden until you can deprecate it, and you've spent year-1 effort on the wrong thing. This is the failure mode Path C must earn against — and the reason Path A first is the correct sequencing.

**v0.1 ships Path B; later abandons it.** Cost: catastrophic. Mobile users have been excluded from day one; install-failure issues dominate the issue tracker; reputation is sticky.

---

## 7. Five-Year Survival Projection

What goes wrong first, by path:

- **Path A:** JSONata 2.x maintenance slows down (the project has historically had bursts of activity around major releases and quiet stretches between them). *Mitigation:* the JSONata reference implementation is small, MIT-licensed, and forkable; AJV and papaparse have multi-maintainer governance and over 10-year track records; the surface area Crosswalker depends on is stable.
- **Path B:** Polars introduces a breaking API change (it has done so repeatedly during its rapid growth phase) and the producer breaks for users on auto-updated `pip install`. *Mitigation:* pin versions, ship venv — but this just compounds install friction.
- **Path C:** Protocol drift between in-plugin and producer. As the recipe DSL evolves, keeping two implementations in lockstep becomes a coordination cost that exceeds the small contributor pool's bandwidth. *Mitigation:* declare the producer protocol stable (semver) and make breaking changes rare; the in-plugin engine is the canonical reference.
- **Path D:** The single Rust contributor leaves; nobody can land changes; WASM build pipeline rusts (literally). This is the dominant historical failure mode for Rust components in TS-majority projects.
- **Path E:** TinyGo can't compile a dependency's update; you fork the dependency; now you maintain that too.
- **Path F:** RMLMapper changes its CLI flags or distribution; users on different JVM versions hit subtle bugs.

**Surviving contributor profile by path:**
- Path A: any TS-fluent Obsidian plugin developer can take over. Bus factor: high, by far.
- Path B: requires both TS and Python expertise; smaller pool.
- Path C: requires both, plus protocol stewardship.
- Path D: requires Rust + WASM + esbuild integration. A handful of people in the entire Obsidian ecosystem.
- Path E: similar.
- Path F: essentially zero in the Obsidian community.

---

## 8. Adversarial Self-Critique

**"You're defaulting to TypeScript because Obsidian plugins are TypeScript — that's exactly the cargo-culting the task warned against."** No. The defense is empirical: of the six paths, only A and (partially) C satisfy the mobile constraint *and* have a contributor pool over 100 in the Obsidian-plugin ecosystem. If WASM had a production JSONata implementation and Capacitor had universally good debugging, Path D would be a real contender. It doesn't, and isn't. The TS recommendation falls out of the constraints, not the conventions.

**"You're dismissing Path D because Rust is hard, but performance will eventually demand it."** Crosswalker's workload is *bounded by the size of compliance frameworks*, which are measured in thousands to low tens of thousands of controls — not millions. JSONata in JavaScript happily evaluates expressions against multi-MB JSON inputs. The performance argument for WASM is largely speculative for this domain.

**"Path C is a free lunch that gets you the best of both."** It isn't free. Real edge cases that break Path C: (a) an XLSX with wide-merged headers where the producer outputs JSON but the user wants to *re-author* the recipe interactively — they need round-trip understanding of the messy source from inside the plugin, which they don't have; (b) the producer succeeds on the user's laptop but the recipe is checked into a vault Git repo that a teammate opens on iPad — recipe portability silently fails; (c) the producer's Python version conflicts with another tool's Python; (d) air-gapped enterprise GRC environments where users cannot run arbitrary subprocesses. Each of these has to be handled with explicit UX (capability detection, clear error messages, fallback paths) — that's the coordination tax.

**"You're assuming JSONata is the right expression layer. What if it isn't?"** Legitimate concern. JSONata's status as a query/transformation language is semi-standard but not deeply governed (single-org-led, intermittent activity). If JSONata becomes a liability, the migration path is to a smaller embedded expression evaluator (jq-style, or a custom subset) — and that migration is *easier* in TypeScript than in WASM-embedded Rust.

---

## 9. Final Recommendation and Concrete v0.1 Stack

**Adopt Path A for v0.1 with these specific commitments:**

1. **Engine in TypeScript**, built with esbuild (not Bun — Bun's three-year-old single-vendor governance is a 5-year risk; esbuild is widely used in the Obsidian sample plugin and across the community).
2. **Bundle composition for v0.1:** JSONata 2.x, AJV 8 + ajv-formats, js-yaml 4, papaparse 5, nanoid, plus the engine's own recipe parser/validator/template renderer. Target: under 300 KB minified, under 120 KB gzipped.
3. **Defer XLSX to v0.2.** Add SheetJS in tree-shaken read-only mode behind a lazy import. Target after addition: under 500 KB minified.
4. **Declare `isDesktopOnly: false`.** Use `Platform.isDesktopApp` to gate features that require desktop APIs (e.g., reading XLSX from arbitrary filesystem paths). Tree-shaped sources work everywhere.
5. **Run the engine on the main thread with cooperative yielding (`await new Promise(setTimeout)`).** Web Workers are documented to be unreliable in current Obsidian versions; do not depend on them.
6. **Define and version the recipe schema as runtime-agnostic.** Use JSON Schema + AJV for validation. Document semantics so that a future Rust port (Path D) or Python validator could be written without changing user files.
7. **Reserve a `producer` field in the recipe schema for v0.5+ Path C.** Don't implement it yet, but reserve the namespace so adding external producers later is non-breaking.
8. **Use RMLMapper as a semantics oracle, not a runtime.** During recipe-DSL design, validate that Crosswalker's `iterate`/`reference`/`join` semantics agree with the RML reference on shared subsets — gives you confidence the surface DSL is well-defined without paying the JVM tax.
9. **At v0.5, add Path C as opt-in:** ship a reference Python producer (Polars + DuckDB + openpyxl) in a sibling repo; define a JSON-lines streaming protocol over stdin/stdout; gate behind desktop check; document explicitly that recipes using producers are non-portable to mobile.

**Do not:**
- Ship Path B as the primary engine.
- Build Path D before there is an empirical, user-reported performance problem the in-plugin TS engine cannot solve.
- Adopt Bun as the runtime/bundler for the production build (use it for development if preferred; ship esbuild output).
- Commit to Web Workers.
- Use SheetJS in default-everything mode (the legacy XLS codepage tables alone are over 100 KB gzipped you don't need).

---

## 10. Reconciling Ch 20 and Ch 21

Ch 20-A's pure-TypeScript assumption and Ch 21's external-Python-Polars-DuckDB assumption are reconciled as **sequencing, not architecture**: Ch 20-A's TS engine *is* the v0.1 product; Ch 21's external producers *are* the v0.5+ marketplace extension. Neither chapter was wrong — they were describing different temporal slices of the same Path-C-eventually system. This challenge's contribution is forcing the explicit recognition that the in-plugin TS engine must ship and stabilize first, alone, because trying to build both simultaneously without users is the predictable way for a small-OSS project to die before v1.0.

The single most important structural decision is therefore not which engine language to pick — it's **committing to a runtime-agnostic recipe schema** so that the v0.1 TS engine, the v0.5 Python producer, and any hypothetical future Rust/WASM core all evaluate identical user-authored recipes to identical vault outputs. Get that interface right and every other choice in this challenge becomes reversible.
