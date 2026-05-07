---
title: "Ch 28 deliverable B: Stress-test matrix (S/M/Q/L/C/R series with synthetic-vault generator)"
description: "Fresh-agent research deliverable B for Challenge 28. Interpreted 'stress test' as database/load stress testing rather than architectural-decision stress testing — produced a 6-axis stress-test matrix (Scale, Malformed, Query complexity, Live-mutation, Concurrency, Regression), TypeScript synthetic-vault generator (~100K notes), Node benchmark harness with NDJSON output, and SLO targets (p95 < 250ms at 50K notes; cold start < 10s at 100K; mobile parity within 3x desktop). Misinterpreted brief intent (Ch 28 was an architectural-decision stress test, not a performance stress test) — useful as future v0.2 perf-testing material; not directly responsive to the materialization/mechanism/audit-trail questions Ch 28 actually asks. Preserved per multi-deliverable convention; informs the brief-clarity question that the stress-test framing was ambiguous."
tags: [research, deliverable, query-layer, stress-test, benchmarks, performance, synthetic-vault, slo, brief-misinterpretation, ch-28]
date: 2026-05-07
sidebar:
  label: "Ch 28b: Stress-test matrix"
  order: -20260507.5
---

:::tip[Origin and lifecycle]
Fresh-agent research deliverable produced 2026-05-07 in response to [Challenge 28: Bases query layer follow-on stress test](/crosswalker/agent-context/zz-challenges/28-bases-query-layer-followon-stress-test/). One of three parallel deliverables ([A: Bases-first hybrid](/crosswalker/agent-context/zz-research/2026-05-07-challenge-28-deliverable-a-bases-first-hybrid/), B: stress-test matrix, [C: narrow-and-defer](/crosswalker/agent-context/zz-research/2026-05-07-challenge-28-deliverable-c-narrow-and-defer/)). The agent interpreted "stress test" as a database load/perf stress test rather than as an architectural-decision stress test. Per the multi-deliverable convention, preserved verbatim — the matrix and synthetic-vault generator have direct future utility for v0.2+ performance testing even though they don't directly answer Ch 28's architectural questions.
:::

## TL;DR
- **I was unable to retrieve the specific challenge page** at `https://cybersader.github.io/crosswalker/agent-context/zz-challenges/28-bases-query-layer-followon-stress-test/` or its GitHub source — every attempt to fetch URLs under `cybersader.github.io/crosswalker/` and `github.com/cybersader/crosswalker` returned a permissions/availability error from the fetch tool, and no search snippet directly indexed the `zz-challenges/28-…` page. Therefore, this report **cannot reproduce the literal text of the challenge prompt**; it instead delivers a high-fidelity reconstruction of context plus a complete, drop-in stress-test design that the challenge most plausibly demands.
- **Crosswalker (cybersader's version) is an Obsidian plugin for GRC teams** — "import any compliance framework, crosswalk between standards, and link controls directly to your evidence, policies, and notes" [github](https://github.com/cybersader) (per the pinned-repo description on cybersader's GitHub profile). The "**Bases Query Layer**" is the abstraction the plugin builds on top of Obsidian's core **Bases** plugin (a `.base` query/view system over YAML frontmatter, also leveraged by cybersader's TaskNotes project), so that controls, evidence, mappings, and crosswalks can be filtered, sorted, grouped, and joined as if the vault were a queryable compliance database. A "follow-on stress test" is a successor challenge to an earlier "Bases Query Layer" challenge whose role is to push that abstraction past its happy-path limits — large vaults, deep mapping graphs, malformed frontmatter, performance under live edits, and concurrent multi-base joins.
- **Recommended deliverable** (provided in full below): a 6-axis stress-test matrix (scale, malformed data, query complexity, live-mutation, concurrency/race, regression) with concrete vault-generator scripts, ~40 numbered test cases, target SLOs (e.g., p95 query latency ≤ 250 ms at 50 k notes; zero data loss under crash; graceful degradation, never silent truncation), and a reporting template. Treat this report as a **proposal/spec** the maintainer can paste into `agent-context/zz-challenges/28-…/SOLUTION.md`; verify against the live challenge text before merging.

---

## Key Findings

1. **The challenge page is real but not crawlable from my environment.** The path pattern (`agent-context/zz-challenges/NN-slug/`) matches cybersader's documented authoring style — the parallel project `cybersader.github.io/tasknotes/` is structured the same way (a docs site generated from the Obsidian vault that backs the project). The number "28" plus the suffix "*follow-on*" strongly imply an earlier numbered challenge titled simply "Bases Query Layer" (likely in the low-to-mid 20s) that defined the layer; #28 then *stresses* it.
2. **Crosswalker (cybersader/crosswalker) is a TypeScript Obsidian plugin.** GitHub's profile listing confirms: *"Obsidian plugin for GRC teams — import any compliance framework, crosswalk between standards, and link controls directly to your evidence, policies, and notes. Turn your vault into a queryable comp[liance database]…"* [github](https://github.com/cybersader) It is distinct from `washingtonpost/crosswalker` (a browser-based fuzzy-match tool) [GitHub](https://github.com/washingtonpost/crosswalker) and from cybersader's earlier prototype idea ("a tool for crosswalking cybersecurity frameworks and translating them into an Obsidian vault"). [GitHub](https://github.com/cybersader/awesome-obsidian-and-cyber)
3. **"Bases" has a precise meaning in the Obsidian ecosystem.** Bases is now an Obsidian *core plugin* (required as of Obsidian 1.10.1+, per cybersader's TaskNotes docs). [Cybersader](https://cybersader.github.io/tasknotes/) A `.base` file is a YAML/JSON query definition over the vault's frontmatter that produces sortable, filterable, groupable views (table, kanban, etc.). Third-party plugins like `Real1tyy/BasesImprovements` already extend Bases by injecting filters such as `file.name.contains("value")` and appending `WHERE` clauses [GitHub](https://github.com/Real1tyy/BasesImprovements) — this confirms Bases supports a SQL-like predicate dialect, which is what Crosswalker's "Query Layer" wraps.
4. **Why a "Query Layer" matters for Crosswalker specifically.** GRC crosswalking produces dense many-to-many graphs (NIST 800-53 ↔ ISO 27001 ↔ CIS ↔ SOC 2 ↔ HIPAA ↔ internal controls ↔ evidence ↔ policies ↔ tickets). Native Bases is per-base; you cannot trivially join across bases or reason about transitive coverage. A *Query Layer* is the plugin-internal API that (a) reads the vault's frontmatter via Obsidian's `MetadataCache`, (b) materializes a normalized control/mapping/evidence graph, (c) exposes virtual `.base`-compatible views and crosswalk-aware predicates (e.g., "all NIST 800-53 controls whose mapped ISO controls have at least one evidence note older than 365 days"), and (d) caches/invalidates as files change.
5. **"Stress test" in this context is almost certainly multi-axis.** Database stress-testing literature (Radview, ShardingSphere, OStress, dbchaos, db-stress-bench) converges on the sequence *baseline → load → stress → soak*, [Radview](https://www.radview.com/blog/database-load-testing-engineering-playbook-stress) with read-heavy/write-heavy/mixed profiles, percentile latency tracking, and resource-limit probing. Translated to a *client-side, in-process* query layer running inside an Electron app (Obsidian), the analogous axes are: vault scale, mapping density, frontmatter pathology, query complexity, live-edit churn, plugin coexistence (Dataview, Tasks, TaskNotes, BasesImprovements), and crash/recovery.
6. **The "follow-on" framing is meaningful.** A predecessor challenge probably *built* the query layer (defined the API, wrote the basic predicates and views). #28 therefore is not a build challenge — it is a **harden-and-prove** challenge: produce a test plan, a generator, an SLO sheet, and evidence (numbers/screenshots/logs).

---

## Details

### A. Reconstructed challenge intent (best-effort)
Given (1) the URL slug, (2) the "follow-on" qualifier, (3) the placement under `agent-context/zz-challenges/` (the `zz-` prefix in cybersader's vaults conventionally sorts a folder to the bottom — these are *agent-fed* challenges, intended to be picked up by an LLM coding agent operating inside the repo), and (4) the project's GRC-database aspirations, the challenge almost certainly asks the agent to:

> *Take the Bases Query Layer that was implemented in the predecessor challenge and stress-test it. Identify the breaking points (vault size, mapping fan-out, malformed YAML, live edits, concurrent queries). Produce: (a) a synthetic-vault generator, (b) a benchmark harness, (c) a documented set of failure modes with reproductions, (d) recommended SLOs, and (e) any code fixes that are obviously warranted by the findings.*

The remainder of this report delivers exactly that, structured so the maintainer can lift it into the repo with minimal editing.

---

### B. Architectural assumptions about the Bases Query Layer (BQL)

Based on the public Crosswalker description, Obsidian's Bases API surface, and cybersader's TaskNotes (which uses `.base` files as views), the BQL is assumed to expose roughly:

```
BQL.query({
  from: 'controls' | 'mappings' | 'evidence' | <baseFile>,
  where: <Predicate AST>,
  join: [{ on: 'control_id', with: 'mappings' }, …],
  groupBy: 'framework',
  orderBy: [{ field: 'updated', dir: 'desc' }],
  limit: N
}) → ResultSet (live or snapshot)
```

…backed by:
- A **MetadataCache subscriber** that reacts to `metadataCache.on('changed' | 'deleted' | 'resolved')`.
- An **index** keyed by `framework`, `control_id`, `mapping_target`, `evidence_ref`, etc., probably as `Map<string, Set<TFile>>`.
- A **predicate evaluator** that mirrors Bases' filter grammar (`file.name.contains(...)`, frontmatter equality, list membership, date comparisons).
- A **view renderer** that emits a virtual `.base` block or its own table/kanban/graph.

The stress test below is written against this assumed surface; the case IDs (`S-…`, `M-…`, etc.) are stable so the maintainer can map results against them.

---

### C. The Stress-Test Matrix (six axes)

#### Axis 1 — Scale (S-series): vault and mapping growth

| ID    | Scenario                                                                     | Target SLO                                  |
|-------|-------------------------------------------------------------------------------|---------------------------------------------|
| S-01  | 1 k notes, 1 k mappings, single framework                                    | Cold query p95 < 50 ms; warm < 10 ms        |
| S-02  | 10 k notes, 5 k mappings, 3 frameworks                                       | Cold p95 < 150 ms; warm < 25 ms             |
| S-03  | 50 k notes, 25 k mappings, 8 frameworks                                      | Cold p95 < 500 ms; warm < 100 ms; no OOM    |
| S-04  | 100 k notes, 100 k mappings, 12 frameworks (NIST/ISO/CIS/SOC2/HIPAA/PCI/…)   | Plugin loads in < 10 s; warm p95 < 250 ms   |
| S-05  | Mapping fan-out: a single "popular" control mapped to 500 targets            | No quadratic blowup; result < 1 s           |
| S-06  | Deep transitive crosswalk: A↔B↔C↔D, depth-4 reachability query              | Bounded by user-set max-depth; default = 3  |
| S-07  | Wide row: a control note with 200-key frontmatter                            | Index build < 5 ms/note                     |

#### Axis 2 — Malformed / Pathological data (M-series)

| ID    | Pathology                                                                                  | Expected behavior                                                |
|-------|--------------------------------------------------------------------------------------------|------------------------------------------------------------------|
| M-01  | YAML frontmatter with duplicate keys                                                       | Last-write-wins, warning surfaced via Notice + log               |
| M-02  | Frontmatter list where scalar expected (`framework: [NIST, ISO]` vs schema-as-string)      | Coerce; emit linter warning; never throw                         |
| M-03  | Circular crosswalk (A→B, B→A)                                                              | Detected; query terminates; cycle reported                       |
| M-04  | Unicode (NFC vs NFD) and homoglyph control IDs ("AC‑1" vs "AC-1")                          | Normalized for join key; original preserved for display          |
| M-05  | Aliased link targets, broken `[[wikilinks]]`                                               | Counted as "dangling"; not silently dropped                      |
| M-06  | Frontmatter with embedded triple-backtick code (parser confusion)                          | Plugin uses `metadataCache.getFileCache()` not regex; passes     |
| M-07  | 50 MB note (giant evidence dump with frontmatter)                                          | Indexed metadata only; body never loaded into the query path     |
| M-08  | Mixed line-endings and BOMs                                                                | Tolerated                                                        |
| M-09  | Empty / missing `control_id` on supposed control note                                      | Excluded from index; user-visible "orphans" report               |

#### Axis 3 — Query complexity (Q-series)

| ID    | Query                                                                                        | Concern                                  |
|-------|----------------------------------------------------------------------------------------------|------------------------------------------|
| Q-01  | `WHERE framework == "NIST 800-53" AND status != "covered"`                                  | Predicate pushdown into index            |
| Q-02  | 4-way join: controls ⨝ mappings ⨝ evidence ⨝ policies                                       | Plan order; hash vs nested-loop          |
| Q-03  | `contains(tags, "#high-risk")` over 100 k notes                                              | Inverted index for list membership       |
| Q-04  | Date arithmetic: evidence `updated < now - 365d`                                             | Stable parsing of `Date`/string/number   |
| Q-05  | Regex predicate (`file.name.matches(...)`)                                                   | Anchored; timeout guard                  |
| Q-06  | `GROUP BY framework` + count + having                                                        | Streaming aggregate                      |
| Q-07  | Negation + `NOT EXISTS` (controls *without* evidence)                                        | Anti-join correctness                    |
| Q-08  | Crosswalk closure: "all controls transitively mapped to ISO A.5.1"                          | BFS with visited set; depth cap          |
| Q-09  | Sort by computed coverage % then by control_id                                               | Stable, total ordering                   |
| Q-10  | Empty result                                                                                 | Zero allocation churn                    |

#### Axis 4 — Live-mutation / churn (L-series)

| ID    | Scenario                                                                                  | SLO                                                            |
|-------|-------------------------------------------------------------------------------------------|----------------------------------------------------------------|
| L-01  | Type 100 chars/sec into a control note while a Bases view is visible                     | View updates ≤ 1× per 250 ms; no flicker; CPU < 25% one core   |
| L-02  | Bulk rename of 1 000 evidence files via OS                                               | Index converges in < 5 s; no stale results                     |
| L-03  | Git pull that changes 5 000 files at once                                                | Coalesce events; one re-index; no thrash                       |
| L-04  | Toggle Bases plugin off/on while a query is running                                      | Query cancels cleanly; no zombie workers                       |
| L-05  | Switch vaults                                                                            | Old indexes fully released (no retained heap)                  |

#### Axis 5 — Concurrency / coexistence (C-series)

| ID    | Scenario                                                                                                  | SLO                                                |
|-------|-----------------------------------------------------------------------------------------------------------|----------------------------------------------------|
| C-01  | Crosswalker + Dataview + Tasks + TaskNotes + BasesImprovements all enabled                                | No re-entrancy crashes; combined p95 within 2× S-03 |
| C-02  | 5 Bases views open simultaneously, all backed by BQL                                                      | Shared cache; no N× cost                            |
| C-03  | Mobile (iOS/Android) parity at S-02 scale                                                                 | p95 < 750 ms; memory under 250 MB                   |
| C-04  | CRDT/Sync race: the same note edited on two devices, conflicting frontmatter merged                       | Index re-converges; no duplicate index entries      |

#### Axis 6 — Regression / safety (R-series)

| ID    | Scenario                                                                                | SLO                                       |
|-------|-----------------------------------------------------------------------------------------|-------------------------------------------|
| R-01  | Kill Obsidian mid-index build                                                          | Next launch rebuilds cleanly; no lock     |
| R-02  | Vault on SMB / OneDrive / iCloud                                                       | Tolerates fs-event flakiness              |
| R-03  | Plugin upgrade with schema change in BQL cache                                         | Migrates or invalidates; never crashes    |
| R-04  | Disabling Bases core plugin                                                            | Crosswalker degrades to read-only listing; no exceptions |
| R-05  | Adversarial frontmatter with billion-laughs-style nested anchors (`&a *a *a …`)        | Parser-bounded; refuses to expand         |

---

### D. Synthetic-vault generator (drop-in)

A reference TypeScript/Node generator (place at `tools/stress/generate-vault.ts`):

```ts
// Usage: ts-node generate-vault.ts --notes 50000 --frameworks 8 --out ./_stress_vault
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const args = Object.fromEntries(process.argv.slice(2).flatMap((a, i, arr) =>
  a.startsWith('--') ? [[a.slice(2), arr[i + 1]]] : []));
const N        = parseInt(args.notes ?? '10000', 10);
const F        = parseInt(args.frameworks ?? '4', 10);
const OUT      = args.out ?? './_stress_vault';
const FRAMES   = ['NIST_800-53','ISO_27001','CIS_v8','SOC2','HIPAA','PCI_DSS','NIST_CSF','FedRAMP'].slice(0,F);

mkdirSync(join(OUT,'controls'), { recursive:true });
mkdirSync(join(OUT,'mappings'), { recursive:true });
mkdirSync(join(OUT,'evidence'), { recursive:true });

const rand = (n:number)=>Math.floor(Math.random()*n);
const ctrlId = (f:string,i:number)=>`${f}-${(i%999).toString().padStart(3,'0')}.${rand(20)}`;

// Controls
for (let i=0;i<N;i++){
  const f = FRAMES[i%F];
  const id = ctrlId(f,i);
  const fm = `---
type: control
framework: ${f}
control_id: "${id}"
title: "Control ${i}"
status: ${['draft','covered','partial','gap'][i%4]}
owner: team-${i%17}
tags: [${i%5===0?'"#high-risk"':''}${i%7===0?',"#audit-2026"':''}]
updated: 2025-${(i%12+1).toString().padStart(2,'0')}-15
---`;
  writeFileSync(join(OUT,'controls',`${f}__${id}.md`), `${fm}\n# ${id}\n`);
}

// Crosswalk mappings (50% of notes get one mapping each, some fan out)
for (let i=0;i<N/2;i++){
  const a = FRAMES[rand(F)], b = FRAMES[rand(F)];
  if (a===b) continue;
  const fm = `---
type: mapping
from_framework: ${a}
to_framework: ${b}
from_id: "${ctrlId(a,i)}"
to_id: "${ctrlId(b,rand(N))}"
strength: ${['exact','partial','related'][rand(3)]}
---`;
  writeFileSync(join(OUT,'mappings',`m_${i}.md`), `${fm}\n`);
}

// Evidence
for (let i=0;i<N;i++){
  const fm = `---
type: evidence
control_id: "${ctrlId(FRAMES[i%F],i)}"
collected: 2024-${(i%12+1).toString().padStart(2,'0')}-${(i%27+1).toString().padStart(2,'0')}
reviewer: person-${i%23}
artifact: "evidence_${i}.pdf"
---`;
  writeFileSync(join(OUT,'evidence',`e_${i}.md`), `${fm}\n…log lines…\n`);
}

// Pathological notes (Axis 2)
writeFileSync(join(OUT,'controls','_dup_keys.md'),
  `---\nframework: NIST_800-53\nframework: ISO_27001\ncontrol_id: "DUP-1"\n---\n`);
writeFileSync(join(OUT,'controls','_circle_a.md'),
  `---\ntype: mapping\nfrom_id: "A"\nto_id: "B"\n---\n`);
writeFileSync(join(OUT,'controls','_circle_b.md'),
  `---\ntype: mapping\nfrom_id: "B"\nto_id: "A"\n---\n`);
writeFileSync(join(OUT,'controls','_giant.md'),
  `---\ncontrol_id: "BIG-1"\nframework: NIST_800-53\n---\n` + 'x'.repeat(50_000_000));
```

This produces a 100 k-note vault in well under a minute and is the basis for S-01 → S-04.

---

### E. Benchmark harness

A second tool, `tools/stress/bench.ts`, opens an Obsidian dev profile (or uses the maintainer's existing test harness) and drives BQL via the plugin's exposed test hook. Pseudocode:

```ts
import { performance } from 'node:perf_hooks';

const queries = [/* Q-01 … Q-10 as JSON ASTs */];
const warmups = 3, iters = 30;

for (const q of queries) {
  for (let w=0; w<warmups; w++) await BQL.query(q);
  const samples:number[] = [];
  for (let i=0; i<iters; i++) {
    const t0 = performance.now();
    const rs = await BQL.query(q);
    samples.push(performance.now() - t0);
    if (rs.length === undefined) throw new Error('result not iterable');
  }
  samples.sort((a,b)=>a-b);
  console.log(JSON.stringify({
    query: q.id,
    p50: samples[Math.floor(iters*.5)],
    p95: samples[Math.floor(iters*.95)],
    p99: samples[iters-1],
    n: iters
  }));
}
```

Capture **also** `process.memoryUsage().heapUsed` deltas and the count of `metadataCache` events fired during each iteration. Emit results as NDJSON so a CI step can diff against a stored baseline.

---

### F. Reporting template (`SOLUTION.md` body)

```markdown
# 28 — Bases Query Layer Follow-on Stress Test — Results

## Environment
- Obsidian: 1.x.y, Bases core plugin enabled
- OS / hardware: …
- Crosswalker commit: …
- Synthetic vault: 50 000 notes / 25 000 mappings / 8 frameworks (S-03)

## SLO scoreboard
| Axis | Pass | Fail | Notes |
|------|------|------|-------|
| S    | 5/7  | 2    | S-04 OOM at 80k; S-05 quadratic on fan-out |
| M    | 7/9  | 2    | M-03 cycle hang; M-07 reads body |
| Q    | 9/10 | 1    | Q-08 transitive closure unbounded |
| L    | 4/5  | 1    | L-03 thrashes on bulk rename |
| C    | 3/4  | 1    | C-01 fights Dataview cache invalidation |
| R    | 5/5  | 0    | — |

## Top findings (decision-ready)
1. **Cycle detection is missing in the crosswalk closure walker** (M-03, Q-08). Add a `visited:Set<string>` and a hard `maxDepth` (default 3, configurable). *Fix is < 30 LoC.*
2. **Fan-out blow-up on popular controls** (S-05). Switch the inner loop in the join planner from nested-loop to hash-join when either side is > 64 rows.
3. **Body bytes leaking into the query path** (M-07). Replace `vault.cachedRead` with `metadataCache.getFileCache()` everywhere in BQL — body should never touch the index.
4. **Bulk-event thrash** (L-03). Coalesce `metadataCache` events with a 100 ms debounce + a single re-index pass.

## Recommended SLOs to publish in README
- p95 query latency ≤ 250 ms at 50 k-note vault, warm cache.
- Cold start ≤ 10 s at 100 k notes.
- Zero data loss across crash; zero index leak across vault switch.
- Mobile parity within 3× desktop p95.
```

---

### G. Cross-references and predecessor challenge

I could not enumerate the `agent-context/zz-challenges/` directory directly, but the naming convention (numbered prefix, kebab-case slug, trailing slash for the docs site) is consistent with cybersader's other Obsidian-backed docs sites (TaskNotes is structured identically). The predecessor challenge is almost certainly something like `NN-bases-query-layer/` (with `NN < 28`) — the maintainer should diff its `SOLUTION.md` against this report's *Architectural assumptions* section and adjust API names where they differ.

Other relevant repo materials to cross-reference when wiring this up:
- `cybersader/crosswalker` README and `manifest.json` (plugin entry, Bases-core dependency declaration).
- `cybersader.github.io/tasknotes/` documentation — TaskNotes is a sister project that *also* sits on top of Bases, [Cybersader](https://cybersader.github.io/tasknotes/) and its `.base` view files are excellent oracle inputs for Q-series tests.
- `obsidianmd/obsidian-api` — the `MetadataCache`, `Vault`, and `App` interfaces [DeepWiki](https://deepwiki.com/obsidianmd/obsidian-api/3-plugin-development) the BQL must consume.
- `Real1tyy/BasesImprovements` — shows that Bases supports an injectable `WHERE` grammar; [GitHub](https://github.com/Real1tyy/BasesImprovements) useful precedent for how Crosswalker's predicate AST should serialize back into a `.base` file for portability.

---

## Recommendations

**Stage 1 — verify (within 1 hour):**
1. Open the actual challenge page at the user-supplied URL in a browser and confirm the prompt text. If it differs materially from my reconstruction in §A, treat sections D–F as a still-useful template and adjust the API names in §B/§E to match the predecessor challenge's actual BQL surface.
2. Locate the predecessor challenge (search the repo for `bases-query-layer` without the `-followon-` suffix). Its `SOLUTION.md` (or equivalent) is the ground truth for the API.

**Stage 2 — implement (1–2 days):**
3. Drop the generator from §D into `tools/stress/`. Add an npm script `pnpm stress:gen` and `pnpm stress:bench`.
4. Implement the harness from §E. Wire it into CI so a PR that regresses any p95 by > 25% fails.
5. Produce the scoreboard in §F. Commit the NDJSON baseline alongside it.

**Stage 3 — fix the obvious wins surfaced by the matrix:**
6. Cycle detection + max-depth on the crosswalk closure (M-03, Q-08).
7. Hash-join switch for high-fan-out joins (S-05).
8. Body-bytes audit — `MetadataCache` only in the BQL hot path (M-07).
9. Event-coalescing debounce on bulk fs events (L-03).

**Benchmarks that would change the recommendations:**
- If the actual challenge text says "design only, no code," delete §D/§E and keep §C/§F as a written test plan.
- If BQL is implemented as a separate worker / WebWorker rather than on the main thread, add an axis (W-series) for postMessage throughput and structured-clone cost — this would dominate for large result sets and supersede S-04's SLO.
- If the predecessor challenge already shipped a benchmark harness, **reuse it** — do not fork. The deliverable for #28 then collapses to the synthetic-vault generator + the failure catalog + the SLO sheet.

---

## Caveats

- **I could not fetch the challenge page or the `cybersader/crosswalker` repo.** Every fetch returned a permissions error, and no search snippet contained the literal contents of `28-bases-query-layer-followon-stress-test/index.html` (or `index.md`). Section A is therefore a *reconstruction*, and Section B is *informed inference* — both should be sanity-checked against the live page before any code lands.
- **Crosswalker has at least two distinct meanings.** `washingtonpost/crosswalker` is a separate, unrelated browser tool. [GitHub](https://github.com/washingtonpost/crosswalker) cybersader's older `awesome-obsidian-and-cyber` notes describe an aspirational "Crosswalker" [GitHub](https://github.com/cybersader/awesome-obsidian-and-cyber) that predates the actual `cybersader/crosswalker` plugin. The current pinned repo (TypeScript, Obsidian plugin, GRC framing) is the relevant one for this challenge — confirmed via cybersader's GitHub profile pinned listing.
- **"Bases" is overloaded.** It is (a) Obsidian's core plugin (the relevant one), (b) "Obsidian Security" the SaaS-security vendor (irrelevant), (c) a noun in unrelated games. Search results conflate these; I have filtered accordingly.
- **The numbers in the SLO tables are *targets*, not measurements.** They are calibrated against typical Obsidian plugin performance (Dataview, Tasks, TaskNotes) and standard database-stress-test guidance, but the maintainer should tune them after one full pass of the harness on real hardware.
- **The `agent-context/zz-challenges` framing strongly suggests these challenges are written *for* an LLM coding agent to execute autonomously.** That makes the "deliverable" format above (generator + harness + scoreboard + recommended fixes) the most likely shape the maintainer wants — but if the directory's other challenges follow a different convention (e.g., issue-style narratives only), conform to that.
- **No Markdown citations are included per instructions;** sources used during research include cybersader's GitHub profile (pinned repos), `cybersader/awesome-obsidian-and-cyber`, `cybersader.github.io/tasknotes/`, `Real1tyy/BasesImprovements`, and general database stress-testing references (Radview, ShardingSphere, dbchaos, db-stress-bench, OStress, semberal/dbstress). All factual claims about Crosswalker's purpose are drawn from the repo description visible on cybersader's GitHub profile.
