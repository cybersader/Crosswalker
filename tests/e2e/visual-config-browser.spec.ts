/**
 * visual-config-browser.spec.ts — visual verification for the config browser modal.
 *
 * Captures screenshots of the modal in three states (collapsed list, expanded card,
 * empty search). Used to verify width/wrap/vertical-space CSS fixes without manual
 * Obsidian sessions. Not part of routine CI — run on demand:
 *
 *   bun run e2e -- --spec tests/e2e/visual-config-browser.spec.ts
 *
 * Screenshots land in `test-screenshots/`.
 */

import { browser } from '@wdio/globals';
import { mkdirSync } from 'node:fs';
import path from 'node:path';

const OUT_DIR = path.resolve('test-screenshots');

describe('Visual — config browser modal', function () {
  this.timeout(90_000);

  before(() => {
    mkdirSync(OUT_DIR, { recursive: true });
  });

  it('opens the modal and screenshots collapsed list', async () => {
    await browser.executeObsidian(({ app }) => {
      // @ts-expect-error — internal commands API
      app.commands.executeCommandById('crosswalker:browse-saved-configs');
    });

    await browser.pause(800);
    await browser.saveScreenshot(path.join(OUT_DIR, 'config-browser-collapsed.png'));
  });

  it('expands the first card and screenshots', async () => {
    const expandBtn = await browser.$('.crosswalker-card-header button');
    if (await expandBtn.isExisting()) {
      await expandBtn.click();
      await browser.pause(400);
      await browser.saveScreenshot(path.join(OUT_DIR, 'config-browser-expanded.png'));
    }
  });

  it('closes the modal', async () => {
    await browser.keys(['Escape']);
    await browser.pause(300);
  });
});
