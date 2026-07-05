/**
 * visual-control-lens.spec.ts — visual verification of the Control-lens views.
 *
 * Opens each `.base` in `Control lens/` plus the index note and screenshots them,
 * so the heatmap / equivalences slice / reuse rollup can be checked for correctness
 * and visual distinctness without a manual Obsidian session.
 *
 *   DISPLAY=:0 bun run e2e -- --spec tests/e2e/visual-control-lens.spec.ts
 *
 * Screenshots land in `test-screenshots/`.
 */

import { browser } from '@wdio/globals';
import { mkdirSync } from 'node:fs';
import path from 'node:path';

const OUT = path.resolve('test-screenshots');

async function openPath(p: string, preview = false): Promise<string> {
  return browser.executeObsidian(async ({ app }, args) => {
    const file = app.vault.getAbstractFileByPath(args.p);
    if (!file) return 'NOT_FOUND: ' + args.p;
    const leaf = app.workspace.getLeaf(false);
    // @ts-expect-error - TFile accepted by openFile
    await leaf.openFile(file, { active: true });
    // @ts-expect-error - markdown leaves expose setState/getState
    if (args.preview && leaf.view?.getState && leaf.view?.setState) {
      // @ts-expect-error
      const st = leaf.view.getState();
      // @ts-expect-error
      await leaf.view.setState({ ...st, mode: 'preview' }, { history: false });
    }
    // @ts-expect-error
    return 'OPENED: ' + (leaf.view?.getViewType?.() ?? 'unknown');
  }, { p, preview });
}

describe('Visual — Control lens views', function () {
  this.timeout(180_000);

  before(async () => {
    mkdirSync(OUT, { recursive: true });
    // Note: Electron/CDP here rejects window/rect (Browser.getWindowForTarget),
    // so we screenshot at Obsidian's default window size — no setWindowSize.
    // Warm up: opening the cold vault triggers indexing of ~1.8k notes; the
    // crosswalker-pivot shows "No data" if it renders pre-index. Open a view to
    // kick indexing, then wait for it to settle before any screenshot.
    await browser.executeObsidian(async ({ app }) => {
      const f = app.vault.getAbstractFileByPath(
        'GRC analysis/Control lens/3 - Control reuse - 800-53 families across CSF and CRI.base',
      );
      // @ts-expect-error - TFile accepted by openFile
      if (f) await app.workspace.getLeaf(false).openFile(f);
    });
    await browser.pause(16000);
  });

  it('1 — overlap heatmap (CRI x 800-53)', async () => {
    const r = await openPath('GRC analysis/Control lens/1 - Overlap - CRI Profile x 800-53 (heatmap).base');
    console.log('[control-lens] ' + r);
    await browser.pause(3500);
    await browser.saveScreenshot(path.join(OUT, 'control-lens-1-overlap.png'));
  });

  it('2 — strongest crosswalks (equivalences)', async () => {
    const r = await openPath('GRC analysis/Control lens/2 - Strongest crosswalks - exact equivalences (CRI).base');
    console.log('[control-lens] ' + r);
    await browser.pause(3000);
    await browser.saveScreenshot(path.join(OUT, 'control-lens-2-equivalences.png'));
  });

  it('3 — control reuse rollup', async () => {
    const r = await openPath('GRC analysis/Control lens/3 - Control reuse - 800-53 families across CSF and CRI.base');
    console.log('[control-lens] ' + r);
    await browser.pause(3000);
    await browser.saveScreenshot(path.join(OUT, 'control-lens-3-reuse.png'));
  });

  it('index note with embedded views', async () => {
    const r = await openPath('GRC analysis/Control lens/Control lens.md', true);
    console.log('[control-lens] ' + r);
    await browser.pause(4000);
    await browser.saveScreenshot(path.join(OUT, 'control-lens-index.png'));
  });
});
