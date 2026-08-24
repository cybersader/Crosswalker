---
title: "Ch 44: E2E testing strategy — repair determinism, then enforce"
description: "Fresh-agent research deliverable for Challenge 44. Five verdicts: keep the Playwright/WebdriverIO split (migration would rebuild Obsidian-specific infrastructure without fixing any current failure); adopt visual regression narrowly (4 docs baselines now, 4-8 element-level plugin baselines after harness isolation, explicit maintenance budgets, agent-read screenshots retained for judgment); stay serial until vault/sidecar/metadata/UI state are isolated, then remeasure before considering shards; tiered CI (docs full suite blocking on PR/main with deploy gated behind it, plugin 5-10 minute smoke on PR/main, full serial nightly and at release, 35-55 hosted-runner minutes estimated for the full suite); and a ranked get-to-green path led by a purpose-built minimal seed vault, since 42 of 52 failing declarations are harness/environment. Includes an evidence correction: the challenge brief claimed docs Playwright ran in CI, and no workflow invoked it. Defines a quarantine contract where quarantined is never counted as passing."
tags: [research, deliverable, testing, e2e, ci, visual-regression, wdio, playwright, ch-44]
date: 2026-08-24
sidebar:
  label: "Ch 44 · E2E testing strategy"
  order: -20260824
---

# Challenge 44 deliverable: E2E testing strategy

## 30-second answer

Crosswalker should keep WebdriverIO for the plugin and Playwright for the docs, but it should stop treating local execution as enforcement. The immediate problem is not framework choice: it is a non-deterministic plugin harness and an actual docs-CI omission.

The plugin suite is 41% red: 52 of 127 declarations failed in the measured run (challenge brief, “Measured 2026-08-22”). Failure triage attributes 42 failures to harness/environment, 6 to test rot, 1 to a genuine regression, and 3 to unresolved causes (triage §2). That distribution makes a framework migration, broad screenshot diffing, or parallel execution premature. First create a small deterministic E2E vault, wait on real readiness conditions, reset the sidecar and per-spec state, repair the cheap rot, and fix the confirmed import-set idempotency defect.

The docs side has a separate, cheaper gap. The challenge brief says its 36 Playwright tests run in CI (brief §Verified current state), but the current workflows do not invoke Playwright: `.github/workflows/deploy-docs.yml` builds and deploys only, and no workflow references `test:local`, `test:deploy`, or Playwright. Docs E2E should become a blocking PR/push gate immediately.

## Five verdicts

| Question | Verdict | Decision |
|---|---|---|
| CI by surface | **Add tiered enforcement** | Docs: all 36 tests on docs PRs and main pushes; 4 deployment checks nightly against the live site (counts: brief §Verified current state; `docs/tests/deployment.spec.ts`). Plugin: a vertical smoke slice on plugin PRs and main pushes; full serial suite nightly and before release after the harness is green. |
| Visual regression | **Adopt narrowly** | Add a small canonical-Linux baseline set for deterministic docs pages first; add only element-level plugin baselines after harness isolation. Preserve agent-read screenshots for semantic and holistic review. Do not baseline every current `visual-*` journey. |
| Two frameworks | **Keep the split** | Playwright is well matched to the static site. `wdio-obsidian-service` supplies Obsidian app/installer management, sandboxing, plugin installation, vault reset/reload, helpers, and CI patterns (`node_modules/wdio-obsidian-service/README.md`). Rebuilding those around Playwright Electron would add cost without closing today’s coverage gap. |
| Serial vs parallel | **Stay serial until isolation and remeasurement** | Parallelism is technically feasible, but incoherent while every worker would inherit the polluted seed, indexing races, persistent sidecar state, and order-dependent UI state. Clean isolation may also reduce the 21-minute runtime enough that parallelism is unnecessary. |
| First priority | **Repair the test substrate** | The 42 harness/environment failures (triage §2) dominate the red suite. CI and visual diffing become credible only after the suite tests a known starting state. |

## Evidence correction: docs E2E is not currently enforced

This is the most important disagreement with the brief’s stated current state.

| Evidence | Current fact |
|---|---|
| `.github/workflows/deploy-docs.yml` | Installs dependencies, builds Astro, uploads, and deploys. It does not install Chromium or run Playwright. |
| `.github/workflows/unit-tests.yml` | Builds the plugin and runs Jest only. |
| `.github/workflows/static-checks.yml` | Runs five static checks only. |
| `.github/workflows/release.yml` | Builds and publishes the plugin on a version change. It has no E2E prerequisite. |
| `docs/package.json` | Defines `test:local`, `test:deploy`, `test:e2e`, and `test:e2e:ui`, but no workflow calls them. |

Therefore both surfaces still have an enforcement gap. The docs gap is cheap to close; the plugin gap requires the get-to-green work below.

## 1. Per-surface CI recommendation

### Trigger model

| Trigger | Docs site | Obsidian plugin | Blocking? |
|---|---|---|---|
| PR | Run all 36 Playwright tests when `docs/**`, docs config, or docs workflow files change (count: brief §Verified current state). Build once, then test the built preview. | After the deterministic-harness work: run one vertical smoke slice when plugin source, styles, recipes, manifest/build config, WDIO config, or E2E fixtures change. | Yes for both selected lanes. |
| Push to `main` | Run all 36 tests before Pages deployment. The deploy job must depend on the test job. | Run the same smoke slice because a solo maintainer may push directly rather than always using PRs. | Yes. |
| Nightly | Run the 4 live deployment checks against the published URL (`docs/tests/deployment.spec.ts`). | Run the full suite on latest stable Obsidian with the primary installer pairing. Initially report failures without pretending the job is green; after quarantine reaches zero, treat any failure as an alert. | Docs: alert. Plugin: non-blocking during remediation, then alerting/required operational health. |
| Release | No separate local suite if the exact docs commit already passed and deployed; run the 4 live deployment checks after deploy when release docs change. | Full suite must pass on the release commit before `.github/workflows/release.yml` publishes. Add a small declared-minimum-version smoke lane only after verifying that `manifest.json`’s `minAppVersion` is truthful. | Plugin release: yes. |
| Manual | Full Playwright suite, headed/UI mode as needed. | Individual specs, full suite, version investigations, and agent-read screenshot sessions. | No. |

### Plugin smoke selection principle

Select contracts by failure blast radius, not by which files happen to be shortest. The PR/push slice should prove one thin vertical path through each load-bearing runtime boundary:

| Contract | Existing evidence to reuse after repair | Why it belongs |
|---|---|---|
| Harness + plugin load + command registration | `tests/e2e/smoke.spec.ts` has 4 declarations (file source). | If this fails, later plugin E2E is uninterpretable. |
| User entry surface | `tests/e2e/import-flow.spec.ts` has 4 declarations (file source). | Catches plugin UI registration and modal-mount failures. |
| Tier 1 write + provenance + immediate re-import identity | `tests/e2e/full-import-flow.spec.ts` has 3 declarations (file source). | Covers the confirmed product regression and the core generation contract. |
| Tier 2 runtime + one projection/query | Use the substrate checks from `sidecar-phase-1-smoke.spec.ts` plus one minimal projection/query, not all Phase 2–4 suites. | Catches WASM packaging, migration, projection, and query wiring without scanning a large vault. |

Prefer consolidating those checks into one purpose-built PR smoke journey or a tightly controlled explicit spec list. Launching many independent specs repeats Electron startup and indexing overhead. The smoke lane should have a target budget of **5–10 hosted-runner minutes**, then be measured and tightened. This is an engineering target, not a claim about the current polluted suite.

### Electron cost estimate

Measured facts: the current full serial run took **21 minutes 7 seconds** and peaked at **1.05 GB** (brief §Measured 2026-08-22). Those numbers establish feasibility but not clean-suite steady state: the run copied an 11,198-note vault and contained repeated 180-second timeout cascades (triage §§1 and 5.1; `visual-control-lens.spec.ts`). Harness repair should reduce both indexing work and timeout waste.

| Runner option | Feasibility | Planning cost | Recommendation |
|---|---|---|---|
| GitHub-hosted Linux | Feasible in principle. A standard runner has ample memory for the measured 1.05 GB serial process. Electron can run under Xvfb/headless display plumbing; the service advertises CI support and a sample workflow (`wdio-obsidian-service` README §§Platform support, GitHub CI workflows). Cache `.obsidian-cache/` by OS, app version, installer version, and lockfile so Obsidian is not downloaded every run. | Budget **35–55 Linux runner minutes** for the current full-suite shape: 21 minutes local multiplied by roughly 1.5–2.5 for a likely slower shared CPU/software-rendered display, plus setup/cache variance. A daily full run is roughly **1,050–1,650 runner minutes per 30 days**. The repository is public, so standard hosted-runner cash cost is normally not the main constraint; latency, flake triage, and queue time are. | Default choice for PR smoke, nightly full, and release. Validate one hosted run before hardening timeouts. |
| Dedicated self-hosted Linux | Technically easiest way to reproduce a stable Electron/font/display environment and retain the Obsidian cache. | Lower marginal runner-minute cost but real machine maintenance, security, availability, and queue ownership. A shared development workstation is a poor CI runner because local work and CI contend for the same display and resources. | Do not start here. Use a dedicated runner only if clean-vault GitHub-hosted runs remain materially flaky or exceed the acceptable release window. |
| Nightly-only Electron | Avoids PR latency but allows broken plugin integration to merge and remain undiscovered for up to a day. | One full run per day; no per-PR cost. | Insufficient alone. Pair nightly full with a short blocking PR/push smoke slice. |
| Full Electron on every push | Maximum automatic coverage, but duplicates work on PR merge and turns a 30–50-minute lane into routine feedback. | Potentially hundreds to thousands of runner minutes per active week. | Not worth doing for a solo, batched-agent workflow. |

### Version matrix

Current `wdio.conf.mts` runs `browserVersion: 'latest'` with `installerVersion: 'earliest'`. That tests the latest Obsidian app bundle on an old compatible Electron installer. It does **not** test the declared minimum app version. The nearby comment saying the installer choice “matches manifest.json minAppVersion” conflates app and installer versions.

Recommended matrix:

| Cadence | App version | Installer version | Purpose |
|---|---|---|---|
| PR/push smoke | Latest stable | Earliest compatible, matching the current conservative pairing | Fast default compatibility signal. |
| Nightly full | Latest stable | Earliest compatible | Primary regression lane. |
| Release smoke | Declared `minAppVersion` | Earliest compatible | Validate the manifest promise. First audit whether `minAppVersion: 1.0.0` remains supportable; bump it rather than preserving a false promise. |
| Optional release smoke | Latest stable | Latest compatible | Detect installer/Electron-specific behavior missed by the conservative primary pairing. Add only if the first two lanes expose a real installer split. |
| Beta/mobile matrix | None for now | None for now | Beta credentials and real mobile add disproportionate setup and diagnosis cost before v0.1 release readiness. |

## 2. Visual regression verdict: adopt narrowly

### Detection boundary

| Technique | Catches well | Does not reliably catch | Crosswalker example |
|---|---|---|---|
| Pixel/image diff | Small spacing shifts, missing borders/icons, unintended color/token changes, clipping, font fallback, and stable element geometry. | Whether the captured state is semantically correct, whether copy is useful, whether the wrong modal was selected, or whether data shown is believable. | A soft-light page turning stark white; a 3 px workbench column shift; a dark-theme card losing its border. |
| Agent-read screenshot | Wrong-looking hierarchy, confusing labels, implausible data, “No data” states, wrong wizard step, poor information density, and holistic usability issues. | Repeatable sub-pixel comparison, objective historical deltas, unattended enforcement, and subtle changes an agent does not notice. | Recognizing that a coverage report is empty or that the visible modal is stale even though the DOM still contains expected selectors. |
| DOM/computed-style assertions | Structural invariants, visibility, focus, overflow, exact control counts, selected state, and breakpoint logic. | Typography, color harmony, visual balance, icon quality, and unanticipated appearance changes outside asserted properties. | `visual-layout-widths.spec.ts` already checks pane overflow, grid tracks, focus, and source visibility across 11 widths (count: file source). |

Agent-read screenshots are valuable but not an automated regression gate. A screenshot only protects the product if the relevant visual spec runs, produces the intended state, and someone actually inspects the PNG. No current mechanism proves the final step happened. Image diffing complements that practice by making a small, known set continuously enforceable.

### Why broad plugin baselines would fail now

Several current visual failures did not reveal rendering defects:

- 4 `visual-control-lens` declarations cascaded from an oversized vault and renderer timeout (triage summary rows 41–44).
- `visual-recipe-picker` never invoked the product command because the helper failed to serialize `commandId` (triage row 45).
- 3 wizard-format failures and 1 workbench failure targeted stale generic modals (triage rows 47–49 and 51).
- 3 visual declarations remain unclear and need clean instrumented runs (triage rows 46, 50, and 52).

A baseline system would not correct those failures. It would either never receive an image or compare the wrong/blank state. Deterministic state selection is a prerequisite to image comparison.

### Narrow adoption plan

| Stage | Baselines | Environment | Maintenance budget |
|---|---|---|---|
| Docs now | Start with 4 canonical images: homepage/hero in light and dark, plus one dense content page in light and dark. Fixed Chromium, viewport, fonts, data, animations disabled. Use Playwright `toHaveScreenshot()`. | Canonical GitHub-hosted Linux only. Contributors may inspect locally, but baseline acceptance happens against the canonical runner. | Expect 10–30 minutes of review/update for an intentional theme/layout change. Four images keep churn visible and reviewable. |
| Plugin after harness green | Add 4–8 **element-level** images, not whole-window captures: settings hub light/dark and one stable workbench state at selected pane boundaries/themes. Use `@wdio/visual-service` only if its element capture is stable in the canonical Linux lane. | One pinned Obsidian app/installer pairing, fixed seed, fixed pane width, animations/caret disabled. | Expect 15–45 minutes per intentional affected UI change, plus occasional renderer/font triage. If this exceeds that budget repeatedly, reduce baselines rather than normalizing blind updates. |
| Agent review | Keep the existing on-demand journeys and PNG inspection for full flows, reports, and copy judgment. | Local real Obsidian, both themes where relevant. | Human/agent attention per changed surface; no baseline churn. |

Do not baseline every roughly 13 visual specs identified in the brief (§Verified current state). Some single journeys already emit many screenshots: `visual-workspace-flow.spec.ts` captures a long multi-stage flow. Broad adoption would multiply baseline files, intentional-update review, and false-diff triage until the suite is likely ignored.

### Cheaper intermediate controls

Adopt these before expanding pixel coverage:

1. Replace fixed sleeps with condition-based waits.
2. Scope selectors to the visible Crosswalker root, not the first generic `.modal`.
3. Read generated Markdown directly for writer-contract assertions; reserve metadata-cache checks for behavior that specifically depends on cache integration (triage §5.2).
4. Continue computed-style and geometry assertions for overflow, focus, hidden elements, and theme tokens.
5. Assert key text/data states before taking any screenshot so image comparison cannot bless the wrong screen.

## 3. Two-framework split verdict: keep it

### Coverage and cost comparison

| Dimension | Playwright docs | WebdriverIO plugin |
|---|---|---|
| Target | Static HTTP/Astro site in Chromium. | Real Obsidian/Electron with plugin installation, vault, app APIs, filesystem, and WASM sidecar. |
| Current useful specialization | Built-in web server lifecycle, browser assertions, traces, fast parallel browser tests, `toHaveScreenshot()`. | Obsidian app/installer download and cache, sandboxed app state, plugin deployment, vault reset/reload, `executeObsidian`, Obsidian commands, multi-version capabilities, CI sample (`wdio-obsidian-service` README). |
| Main current failure | Not invoked by CI despite having 36 tests (count: brief §Verified current state; workflow evidence above). | Non-deterministic seed and state make 42 of 52 failures harness/environment failures (triage §2). |
| Framework-related? | No. Adding a workflow closes the gap. | Mostly no. Changing frameworks preserves the polluted vault, cache races, sidecar leakage, and stale selectors. |

### Migration cost if the plugin moved to Playwright Electron

A migration would touch 31 plugin spec files and 127 declarations (counts: brief §Measured 2026-08-22), `wdio.conf.mts`, custom process/vault hygiene, Obsidian execution helpers, command helpers, screenshot hooks, WASM artifact deployment, and CI. More importantly, Crosswalker would have to build or adopt replacements for:

- separate Obsidian app and installer version acquisition;
- repo-local download caching;
- isolated Obsidian user data and vault sandboxing;
- plugin installation into the temporary vault;
- `executeObsidian`/command integration;
- vault reset/reload semantics;
- cross-version capabilities and reporting.

That is at least **1–3 focused engineering weeks plus stabilization**, not a mechanical test syntax conversion. Because the existing suite is red, migration would also destroy the ability to distinguish translated-test defects from product defects and existing harness defects.

The two-framework maintenance cost is real but bounded: two configs, assertion APIs, dependency trees, and CI setup. There is little reusable page-object code between a static docs site and Obsidian’s internal app APIs, so unifying runners would not unify much product-facing test code.

### Third option

Keep the frameworks but unify the **test operating contract**:

- one CI summary format;
- one quarantine manifest with reason, evidence, date, and removal condition;
- common naming for smoke/full/visual lanes;
- condition-based waits and stable root selectors;
- canonical artifact names for traces, failure screenshots, and logs;
- one release prerequisite that consumes both framework results.

This captures most of the contributor/onboarding benefit without rebuilding Obsidian automation.

## 4. Serial vs parallel plugin E2E

### Current verdict

Parallelism is feasible in the abstract: `wdio-obsidian-service` documents multiple instances and sandboxing, with a sample `maxInstances: 4` configuration (service README §Installation and setup). It is not coherent for Crosswalker **before isolation work**.

The current serial suite shares or inherits:

- a source vault with 11,198 Markdown files and 19 duplicate CURIE claims across 38 paths (triage §Scope and evidence);
- a whole-vault identity scan whose unrelated collisions mark imports unsuccessful (triage §Scope and evidence);
- a persistent `.crosswalker.sqlite` that hooks close without necessarily deleting (triage §5.3);
- metadata indexing races after 200–500 ms sleeps (triage §Scope and evidence);
- wizard settings, draft state, modal lifecycle, and selectors that depend on prior declarations (triage §4);
- screenshot filenames and output directories that are not worker-qualified.

More workers would reproduce those defects faster, increase indexing/display contention, and make ordering failures harder to diagnose.

### Isolation required before any parallel experiment

| Isolation boundary | Required change |
|---|---|
| Vault | Immutable minimal seed copied to a unique worker/spec vault. No accumulated generated frameworks. No source-vault cleanup as the primary reset mechanism. |
| Obsidian profile | Unique user-data/profile directory per worker so Electron single-instance routing cannot attach to another run. Verify the service provides this for concurrent instances. |
| Tier 2 | Delete/recreate the sidecar for exact-count specs, or use a unique sidecar per vault/spec and query only fixture namespaces. |
| Fixtures | Unique output prefixes per spec or full vault reset. No dependence on global counts unless the seed defines them. |
| Metadata | Wait until the exact files needed have readable cache/frontmatter, or read the files directly where cache behavior is not under test. |
| UI | Reset plugin settings, drafts, open leaves, modals, and theme per spec. Scope selectors to the active Crosswalker root. |
| Artifacts | Worker-qualified screenshot, log, and failure paths. |
| Scheduling | No spec-order dependencies. Separate heavy visual/report specs from fast contract specs. |

### Expected wall-clock decision

Do not project speedup from the current 21-minute run. It includes indexing an oversized seed and timeout cascades (brief §Measured 2026-08-22; triage §§1 and 5). After isolation:

1. Run the full suite serially and record clean wall time and memory.
2. If serial is at or below roughly 15–20 minutes hosted, keep `maxInstances: 1`; simplicity is worth more than a modest win.
3. If it remains above roughly 25–30 minutes, test **two balanced shards on separate GitHub-hosted jobs**, each with `maxInstances: 1`, before running two Electron instances on one runner. Separate jobs provide cleaner CPU, display, vault, profile, and sidecar isolation.
4. Only then consider `maxInstances: 2` on one runner. The measured 1.05 GB suggests memory could fit two instances, but CPU/software-rendering contention may erase the gain.

## 5. Ranked, sequenced changes

### P0 — fastest credible path to green

| Rank | Change | Why this order | Exit condition |
|---:|---|---|---|
| 1 | **Replace the copied development vault with a purpose-built minimal E2E seed.** Keep only fixtures required by tests; eliminate duplicate identities and accumulated generated outputs. | Addresses the dominant 42 harness/environment failures (triage §2) and removes the 11,198-note indexing burden (triage §Scope and evidence). Sanitizing folders is acceptable only as a short-lived bridge. | Fresh sandbox starts with a documented small file set, zero duplicate canonical identities, and no previous sidecar/output. |
| 2 | **Add deterministic readiness and state reset.** Wait for exact metadata/frontmatter conditions; read files directly for writer assertions; delete/recreate Tier 2 when exact counts matter; reset drafts/settings/modals/leaves/theme per spec. | Makes failures attributable. Fixed sleeps and closed-but-persistent sidecars currently invalidate generation, projection, and query evidence (triage §§5.2–5.3). | Two consecutive clean runs of the generation/frontmatter and Tier 2 setup slices produce identical results. |
| 3 | **Repair the cheap infrastructure/test rot and the confirmed product defect.** Pass `commandId` into `executeObsidian`; assert current schema version; parse pivot YAML semantically; scope modal selectors; make import-set discovery robust to metadata-cache lag. | Clears 6 rot failures, the visual helper defect, and the 1 confirmed product regression without changing required behavior (triage §§3–5). | All A/B findings are resolved by focused specs; no assertion relies on YAML quote style or generic first-modal selection. |
| 4 | **Run the 3 unclear visual specs singly on the clean seed, instrumented.** Settings, workbench recognition, then workspace refresh (triage §6). | Prevents ambiguous failures from being mislabeled as product regressions or silently skipped. | Each D verdict is promoted to product, test, or harness with a minimal reproducer. |
| 5 | **Rerun by dependency order, then full serial.** Generation/frontmatter → streaming/crosswalk/SSSOM → projection → query/closure → realistic fixtures → control-lens visuals (triage §7). | A full run is confirmation, not diagnosis. Upstream state failure currently causes dozens of downstream query failures. | Full serial suite green, or every remaining quarantine has an explicit non-release-critical rationale and expiry. |

### P0 — CI enforcement, staged honestly

| Rank | Change | Timing |
|---:|---|---|
| 6 | **Add real docs Playwright CI.** PR/main full suite; deploy depends on it; nightly live deployment checks. | Can be done immediately because it is independent of plugin harness repair. |
| 7 | **Add plugin smoke CI and full nightly telemetry.** Smoke becomes blocking after ranks 1–3. Full nightly runs all declarations but is allowed to report known red only during the bounded remediation window. | Begin once a GitHub-hosted Xvfb run proves the clean seed launches reliably. |
| 8 | **Make full plugin E2E a release prerequisite.** | Only after the full suite is green or release-critical quarantine is zero. Do not let “continue-on-error” reach the release job. |

### Quarantine contract

A 41%-red suite cannot become credible by deleting assertions or setting the whole job to `continue-on-error` indefinitely. Temporary quarantine should be declaration-specific and carry:

- verdict: product, test rot, harness, or unclear;
- evidence link to the triage row;
- date added;
- exact removal condition;
- whether it blocks release;
- expiry/review date.

The nightly report must show passing, failing, and quarantined separately. Quarantined is not passing. All core generation, re-import, projection, and query contracts are release-critical and may not remain quarantined at release.

### P1 — detection hardening

| Rank | Change | Exit condition |
|---:|---|---|
| 9 | Add 4 docs baselines on canonical Linux; retain structural assertions. | Intentional updates are reviewed, not blindly regenerated. |
| 10 | After plugin harness stability, trial 4–8 element-level plugin baselines. | Flake/update burden stays within the stated 15–45-minute budget per affected UI change. |
| 11 | Remeasure full serial time; test two CI shards only if needed. | Parallelism is justified by measured clean-suite time, not the polluted 21-minute run. |

## Explicitly not worth doing now

| Do not do | Reason |
|---|---|
| Migrate plugin E2E to Playwright Electron | Rebuilds Obsidian-specific infrastructure and translates 31 files/127 declarations (brief §Measured 2026-08-22) without fixing seed contamination, cache races, or selector rot. |
| Move docs E2E to WebdriverIO | Adds a heavier runner to a static-site problem Playwright already solves cheaply. |
| Run the full Electron suite on every push | Poor feedback economics for a solo batched workflow; use blocking smoke plus nightly/release full. |
| Enable `maxInstances > 1` now | Parallelizes non-determinism and shared-state contamination. |
| Baseline every `visual-*` screenshot | Broad baseline churn, platform variance, and wrong-state captures would cause abandonment. |
| Use an external visual-regression SaaS now | Adds service cost and workflow complexity before a small in-repo baseline set proves value. |
| Add beta, Android, or a broad app/installer matrix before v0.1 release | High setup and diagnosis cost; first make latest stable and the declared minimum honest. |
| Put CI on a shared development workstation | Couples release confidence to local availability, display state, and resource contention. Use GitHub-hosted first or a dedicated self-hosted runner later. |
| Preserve `minAppVersion: 1.0.0` without testing it | A compatibility claim is not a historical artifact. Test it or raise it. |

## Final strategy

Crosswalker needs three distinct confidence loops:

1. **Continuous structural confidence:** Jest/static gates plus all docs Playwright tests and a short plugin vertical smoke on PR/main.
2. **Broad integration confidence:** full serial plugin E2E nightly and release, on a deterministic seed and canonical hosted Linux environment.
3. **Visual judgment:** a small image-diff baseline for unattended drift plus agent-read screenshots for semantic, holistic, and copy review.

The two frameworks can support those loops. The current harness and workflow configuration cannot. Repairing determinism, not choosing a new runner, is the change that converts the existing test inventory into release evidence.
