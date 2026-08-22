/**
 * visual-evidence.spec.ts — visual verification for the evidence workflow UI.
 *
 * Captures the link modal and the generated coverage report. Run on demand:
 *
 *   DISPLAY=:0 bun run e2e -- --spec tests/e2e/visual-evidence.spec.ts
 *
 * Screenshots land in `test-screenshots/`.
 */

import { browser } from '@wdio/globals';
import { mkdirSync } from 'node:fs';
import path from 'node:path';

const OUT_DIR = path.resolve('test-screenshots');

describe('Visual — evidence workflow', function () {
  this.timeout(120_000);

  before(() => {
    mkdirSync(OUT_DIR, { recursive: true });
  });

  it('waits for the vault to finish indexing', async () => {
    // The modal reads the metadata cache. Screenshotting mid-index once showed
    // an imported vault reporting that it had no controls.
    await browser.waitUntil(
      async () => browser.executeObsidian(({ app }) =>
        app.vault.getMarkdownFiles().every((f) => Boolean(app.metadataCache.getFileCache(f)))),
      { timeout: 60_000, interval: 1_000, timeoutMsg: 'vault did not finish indexing' },
    );
  });

  it('opens the link modal', async () => {
    await browser.executeObsidian(({ app }) => {
      // @ts-expect-error — internal commands API
      app.commands.executeCommandById('crosswalker:link-evidence-to-control');
    });
    await browser.pause(900);
    await browser.saveScreenshot(path.join(OUT_DIR, 'evidence-link-modal.png'));
  });

  it('closes the modal', async () => {
    await browser.keys('Escape');
    await browser.pause(400);
  });

  it('runs the coverage report and screenshots the result', async () => {
    await browser.executeObsidian(({ app }) => {
      // @ts-expect-error — internal commands API
      app.commands.executeCommandById('crosswalker:evidence-coverage-report');
    });
    // The test vault holds several frameworks, so the chooser appears.
    await browser.pause(1200);
    await browser.saveScreenshot(path.join(OUT_DIR, 'evidence-report-chooser.png'));

    // Pick a small framework by name rather than taking whatever is highlighted,
    // so the captured report is deterministic and actually has controls in it.
    await browser.keys('nist-mini'.split(''));
    await browser.pause(600);
    await browser.keys('Enter');
    await browser.pause(2500);
    await browser.saveScreenshot(path.join(OUT_DIR, 'evidence-report.png'));

    // The tables are the substance of the report; capture them too.
    await browser.executeObsidian(({ app }) => {
      // @ts-expect-error - internal view API
      const view = app.workspace.getActiveViewOfType(app.viewRegistry.typeByExtension.md ? Object : Object);
      void view;
      const scroller = document.querySelector('.markdown-preview-view, .cm-scroller');
      if (scroller) scroller.scrollTop = 900;
    });
    await browser.pause(900);
    await browser.saveScreenshot(path.join(OUT_DIR, 'evidence-report-tables.png'));
  });
});
