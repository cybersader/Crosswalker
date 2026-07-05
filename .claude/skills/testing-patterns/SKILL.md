---
description: Crosswalker testing patterns — Jest unit tests for logic, WebdriverIO + wdio-obsidian-service for E2E plugin behavior, Playwright for docs site, and obsidian-cli for headless scripted operations. Use when writing new tests, deciding which surface fits a behavior, or troubleshooting test infra.
user_invocable: true
---

# Crosswalker testing patterns

Four testing surfaces. Each has a specific shape of behavior it validates well; using the wrong one creates either flaky tests or coverage gaps.

## Trigger phrases

- "write a test for..."
- "how should I test this?"
- "the wdio harness is failing"
- "screenshot it" / "does it render?" / "what does it look like?" / "visually verify"
- "can you see it on your end?" / "verify the view/modal/heatmap renders"
- "/test-pattern"

> **Obsidian UI IS screenshottable here — do not claim otherwise.** Real Obsidian runs via wdio + WSLg. When you need to confirm a view/modal/pivot *renders correctly* (not just that the data is right), take a screenshot yourself — see [Visual verification](#visual-verification-screenshots) below. Never ask the user to eyeball something you can screenshot.

## The four surfaces

| Surface | What it validates | Speed | Fidelity | When to reach for it |
|---|---|---|---|---|
| **Jest unit tests** (`tests/*.test.ts`) | Pure logic — parsers, transforms, schema validation, render() determinism | Fast (ms) | Low (mocked) | Default — always start here for any pure-function code |
| **WebdriverIO + wdio-obsidian-service** (`tests/e2e/*.spec.ts`) | Real plugin behavior in real Obsidian — command registration, modal flows, vault state changes | Slow (seconds per test) | High (real Obsidian) | Every milestone has at least one E2E spec proving "the feature works in Obsidian"; integration smoke tests |
| **Playwright** (`docs/tests/*.spec.ts`) | Docs site rendering — pages return 200, console-clean, sidebar links resolve, theme classes present | Medium | High (real browser) | Docs-side changes — components, theme, content additions that must render |
| **obsidian-cli** (planned, not yet wired) | Headless scripted Obsidian operations — "open vault, run command, capture output, exit" | Medium | High (real Obsidian, no UI) | When you want to script a behavior without driving the UI; CI fixture validation |

## When to use each

### Jest unit (`bun run test`)

- Parsers (`csv-parser.test.ts`)
- Settings shapes (`settings-data.test.ts`)
- Render() determinism (planned, milestone v0.1.2)
- Frontmatter merge semantics (planned, milestone v0.1.3)
- Schema validation (planned, milestone v0.1.1)

Convention: mirror `src/<module>.ts` → `tests/<module>.test.ts`.

### WebdriverIO E2E (`bun run e2e`)

- Smoke: plugin loads + commands registered (`tests/e2e/smoke.spec.ts`)
- Import wizard flow: open command, select file, configure, generate (planned)
- Settings UI: open settings, change a value, persist (planned)
- Re-import idempotency: import twice, no duplicates (planned, milestone v0.1.3)
- Cross-framework crosswalk linking: import two frameworks, verify wikilinks resolve (planned, milestone v0.1.4)

Convention: `tests/e2e/<feature>.spec.ts`. **Every v0.1 milestone gets at least one E2E spec.**

### Visual verification (screenshots) — `visual-*.spec.ts`

**This is how you confirm something *renders correctly* (a pivot heatmap, a modal, a Bases view, an embed) — by looking at it yourself, not by asking the user.** Real Obsidian runs here via WSLg.

```bash
DISPLAY=:0 bun run e2e -- --spec tests/e2e/visual-<name>.spec.ts
# → PNGs in test-screenshots/ ; Read them directly to inspect rendering
```

Spec shape (copy `tests/e2e/visual-control-lens.spec.ts` or `visual-config-browser.spec.ts`):

```typescript
import { browser } from '@wdio/globals';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
const OUT = path.resolve('test-screenshots');
// open a file/leaf, wait for render, capture:
await browser.executeObsidian(async ({ app }, p) => {
  const f = app.vault.getAbstractFileByPath(p);
  await app.workspace.getLeaf(false).openFile(f);   // .base → Bases view; .md → note
}, 'Control lens/1 - Overlap ... .base');
await browser.pause(3000);                            // let Bases/the view render
await browser.saveScreenshot(path.join(OUT, 'name.png'));
```

Gotchas:
- Prefix the run with `DISPLAY=:0` (WSLg X socket at `/tmp/.X11-unix/X0`); a fresh shell shows `DISPLAY` unset but the display is live.
- **Do not call `browser.setWindowSize()` / `maximizeWindow()`** — this Electron/CDP rejects `window/rect` (`Browser.getWindowForTarget wasn't found`) and fails the hook. Screenshot at default size.
- For a Markdown note's embeds (`![[x.base]]`), switch the leaf to preview mode via `leaf.view.setState({...st, mode:'preview'})` before the screenshot.
- A fast *data-only* sanity check (are the numbers right / are two views different data?) is to compute the grid from `test-vault/_crosswalker/mappings/<pair>/*.md` frontmatter — but that does **not** replace a screenshot for "does it look right."

### Playwright (`cd docs && bun run test:local`)

- Smoke (10 tests): homepage loads, nav, sidebar, search, content pages
- Deployment (4 tests): HTTP 200, no console errors, no failed assets, meta tags

Convention: `docs/tests/*.spec.ts`. Don't add unless docs UX changes.

### obsidian-cli (planned)

For headless scripted operations where you don't need to drive the UI:
- CI fixture validation: open test-vault, run "Crosswalker: Import structured data" against a known CSV, dump generated frontmatter to stdout, diff against expected
- Bulk operations: open multiple vaults, run a command on each, exit
- Reproducibility checks: assert that running the import command produces byte-identical output across two runs

Setup deferred until first concrete use case (likely CI fixture validation in Wave 2). When activated, will live alongside `bun run e2e` as a parallel testing surface — same plugin, different harness.

## WebdriverIO E2E pattern (live, working)

`wdio.conf.mts` configuration:

- Spec discovery: `tests/e2e/**/*.spec.ts`
- Vault: `test-vault/` (sandboxed by service — copied to `test-vault-XXXXXX/` per run; don't assert exact name)
- Plugin: auto-loaded via `plugins: ['.']`
- Pre-build: `onPrepare` runs `bun run build` before tests
- Cache: `.obsidian-cache/` (gitignored) — downloaded Obsidian builds
- Failure screenshots: `test-results/failure-<timestamp>.png` (gitignored)

Standard test shape:

```typescript
import { browser } from '@wdio/globals';
import { expect } from 'expect';

describe('feature name', function () {
  it('does the thing', async () => {
    const info = await browser.executeObsidian(({ app }) => {
      // Code runs in Obsidian's renderer process; `app` is the Obsidian app instance
      return {
        someState: app.vault.getName(),
        // ... whatever you need to assert
      };
    });
    expect(info.someState).toBeTruthy();
  });
});
```

**Triggering plugin commands**:

```typescript
await browser.executeObsidianCommand('crosswalker:import-structured-data');
```

**Asserting on UI elements**:

```typescript
const modal = browser.$('.modal-container');
await expect(modal).toExist();
```

## Common gotchas

| Symptom | Cause | Fix |
|---|---|---|
| `Expected: "test-vault"` `Received: "test-vault-skBTQt"` | wdio-obsidian-service sandboxes the vault with random suffix | Match by prefix: `expect(name).toMatch(/^test-vault/)` |
| `bun run e2e` hangs forever | Obsidian binary download in progress | First run downloads ~150 MB; subsequent runs use cache |
| `app.plugins.plugins` TypeScript error | Internal Obsidian API not in `@types/obsidian` | Use `// @ts-expect-error` comment; documented in `obsidian-typings` |
| `bun run e2e` fails with a display error on WSL | `DISPLAY` unset in the shell | **WSLg provides the display — just prefix `DISPLAY=:0`** (socket at `/tmp/.X11-unix/X0`). Do NOT conclude "can't run Obsidian here." CI-only headless via `xvfb-run` is a separate, later concern. |
| `window/rect` / `Browser.getWindowForTarget wasn't found` | `setWindowSize`/`maximizeWindow` unsupported by this Electron/CDP | Remove the resize call; screenshot at default window size |
| Plugin changes not reflected in test | `onPrepare` ran build before edits | Either re-run `bun run e2e` or save+restart watch with `bun run dev` |

## Per-milestone E2E requirement

Each v0.1 milestone (v0.1.1 → v0.1-RC) carries an E2E success criterion:

| Milestone | E2E spec adds |
|---|---|
| v0.1.1 (types + AJV) | `validation.spec.ts` — load a malformed recipe, expect AJV error surfaces in user-facing notice |
| v0.1.2 (render() v1) | `render.spec.ts` — import a recipe with folder+heading mechanisms, assert correct vault structure |
| v0.1.3 (engine integration) | `re-import.spec.ts` — import twice; verify managed frontmatter overwritten + user_preserve preserved |
| v0.1.4 (junction notes + crosswalks) | `crosswalks.spec.ts` — import NIST CSF + 800-53; assert junction notes generated; assert STRM predicate enforced |
| v0.1.5 (Tier 2 sidecar) | `sidecar.spec.ts` — import; verify `.crosswalker.sqlite` exists; delete it; reload vault; verify reprojection |
| v0.1.6 (Bases query layer) | `bases-queries.spec.ts` — open a generated note; verify embedded query renders |
| v0.1.7 (exporters) | `export.spec.ts` — generate; export STRM TSV; verify columns; export OSCAL JSON; verify schema |
| v0.1.8 (audit trail) | `audit.spec.ts` — generate; verify git commit produced; verify signed manifest if signing enabled |
| v0.1-RC | full smoke against the bundled plugin to confirm community-plugin-submission readiness |

## Skills cross-references

- `synthesis-log` — when E2E uncovers an architectural decision worth logging
- `docs-testing` — Playwright docs-site testing
- `docs-site` — Astro/Starlight authoring (relevant if E2E test breaks because docs structure changed)

## Related

- `wdio.conf.mts` — WebDriver config
- `tests/e2e/smoke.spec.ts` — baseline smoke spec; reference shape for new specs
- [wdio-obsidian-service docs](https://github.com/jesse-r-s-hines/wdio-obsidian-service)
- [WebdriverIO docs](https://webdriver.io/)
