/**
 * visual-grc-analysis.spec.ts — visual verification of the GRC analysis suite
 * added 2026-06-12: the CSF×CRI triangle heatmap, the AC-2 concept-360 lookup
 * (with subject_note/object_note click-through links), the CIS IG-tier slices,
 * and the SCF domain browser.
 *
 *   DISPLAY=:0 bun run e2e -- --spec tests/e2e/visual-grc-analysis.spec.ts
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

describe('Visual — GRC analysis suite (2026-06-12 additions)', function () {
  this.timeout(240_000);

  before(async () => {
    mkdirSync(OUT, { recursive: true });
    // Wait for vault indexing to actually finish (~10k notes with the SCF hub
    // edges) — a fixed pause loses the race as the corpus grows, and the pivot
    // renders its "No data" empty state pre-index. Poll resolvedLinks coverage.
    await browser.waitUntil(
      async () =>
        browser.executeObsidian(({ app }) => {
          const files = app.vault.getMarkdownFiles().length;
          const resolved = Object.keys(app.metadataCache.resolvedLinks ?? {}).length;
          return files > 0 && resolved >= files * 0.95;
        }),
      { timeout: 180_000, interval: 3_000, timeoutMsg: 'vault index did not settle' },
    );
    await browser.pause(3000);
  });

  it('4 — CSF × CRI triangle heatmap', async () => {
    const r = await openPath('GRC analysis/Crosswalk Coverage/4 - CSF function x CRI group (heatmap).base');
    console.log('[grc] ' + r);
    await browser.pause(3500);
    await browser.saveScreenshot(path.join(OUT, 'grc-4-csf-cri-heatmap.png'));
  });

  it('5 — AC-2 concept-360 lookup with click-through links', async () => {
    const r = await openPath('GRC analysis/Crosswalk Coverage/5 - Concept 360 - AC-2 across all crosswalks.base');
    console.log('[grc] ' + r);
    await browser.pause(3000);
    await browser.saveScreenshot(path.join(OUT, 'grc-5-concept-360.png'));
  });

  it('CIS safeguards by IG tier', async () => {
    const r = await openPath('GRC analysis/Framework adoption/1 - CIS safeguards by IG tier.base');
    console.log('[grc] ' + r);
    await browser.pause(3000);
    await browser.saveScreenshot(path.join(OUT, 'grc-cis-ig-tiers.png'));
  });

  it('SCF domain browser', async () => {
    const r = await openPath('GRC analysis/Framework adoption/2 - SCF domain browser.base');
    console.log('[grc] ' + r);
    await browser.pause(4000);
    await browser.saveScreenshot(path.join(OUT, 'grc-scf-domains.png'));
  });

  it('SCF hub matrix — adopt once satisfy many', async () => {
    const r = await openPath('GRC analysis/Framework adoption/3 - SCF hub - adopt once satisfy many.base');
    console.log('[grc] ' + r);
    await browser.pause(4500);
    await browser.saveScreenshot(path.join(OUT, 'grc-scf-hub-matrix.png'));
  });

  it('Framework adoption index note with embedded views', async () => {
    const r = await openPath('GRC analysis/Framework adoption/Framework adoption.md', true);
    console.log('[grc] ' + r);
    await browser.pause(4000);
    await browser.saveScreenshot(path.join(OUT, 'grc-framework-adoption-index.png'));
  });

  it('edge note body renders live wikilinks', async () => {
    const r = await openPath('_crosswalker/mappings/nist-csf-to-800-53/cw-nist-csf-2-de-ae-02--nist-800-53-au-6.md', true);
    console.log('[grc] ' + r);
    await browser.pause(2000);
    await browser.saveScreenshot(path.join(OUT, 'grc-edge-note-wikilinks.png'));
  });
});
