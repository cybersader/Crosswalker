/**
 * visual-wizard-formats.spec.ts — the import wizard's XLSX + JSON paths,
 * driven through the REAL UI (2026-06-12, UI-parity gap #1).
 *
 * Each test opens the wizard command, injects a File into the actual
 * <input type=file> via DataTransfer, exercises the new Step-1 controls
 * (sheet picker / iterator + filter inputs), clicks "Next →" so the real
 * parseFile() runs, and screenshots Step 2 showing detected columns.
 *
 *   DISPLAY=:0 bun run e2e -- --spec tests/e2e/visual-wizard-formats.spec.ts
 */

import { browser } from '@wdio/globals';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import * as XLSX from 'xlsx';
import { closeImportWizard, requireImportWizard, clearAllDrafts } from './helpers/wizard-modal';
import { waitForVaultIndexed } from './helpers/vault-readiness';

/**
 * Selector for the live wizard. Every query below is scoped to this element
 * rather than to the first generic `.modal` in the document — three of this
 * spec's declarations failed because that first modal was a stale leftover from
 * an earlier open/close cycle (triage 2026-08-24 §4 B3–B5). `requireImportWizard()`
 * guarantees at most one connected wizard before each declaration, so a bare
 * `querySelector` on this class is unambiguous.
 */
const WIZARD = '.crosswalker-wizard-modal';

const OUT = path.resolve('test-screenshots');

/** Small two-sheet workbook (banner sheet first → exercises the picker). */
function makeWorkbookB64(): string {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['About this workbook']]), 'Intro');
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.aoa_to_sheet([
      ['id', 'title', 'family'],
      ['AC-1', 'Policy and procedures', 'AC'],
      ['AC-2', 'Account management', 'AC'],
      ['AU-1', 'Audit policy', 'AU'],
    ]),
    'Controls',
  );
  return XLSX.write(wb, { type: 'base64', bookType: 'xlsx' }) as string;
}

const STIX_JSON = JSON.stringify({
  objects: [
    { type: 'attack-pattern', name: 'Process Injection', x_mitre_is_subtechnique: false },
    { type: 'attack-pattern', name: 'Old Technique', revoked: true },
    { type: 'relationship', source_ref: 'x', target_ref: 'y' },
  ],
});

/** Open a FRESH wizard, inject a file, tweak Step-1 controls, advance to Step 2.
 *
 *  Every wait here is on a condition rather than a fixed sleep:
 *    - the wizard modal + its file input (handled by `requireImportWizard`);
 *    - the sheet `<select>` / the two JSON text inputs, which only exist after
 *      the change handler has re-rendered Step 1;
 *    - the step indicator reading "Step 2", which is how the wizard reports
 *      that parse + Step-2 render finished. The old code slept 1500ms and then
 *      read whatever heading happened to be there.
 */
async function driveWizard(args: {
  b64?: string;
  text?: string;
  fileName: string;
  sheet?: string;
  iterator?: string;
  where?: string;
}): Promise<string> {
  await requireImportWizard();
  return browser.executeObsidian(async (_obs, a) => {
    const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
    const modal = document.querySelector(a.wizard);
    if (!modal) return 'NO_MODAL';
    const until = async <T>(probe: () => T | null | undefined, ms: number): Promise<T | null> => {
      const t0 = Date.now();
      for (;;) {
        const value = probe();
        if (value) return value;
        if (Date.now() - t0 >= ms) return null;
        await sleep(100);
      }
    };
    const stepNumber = (): number => {
      const text = modal.querySelector('.crosswalker-step-indicator')?.textContent ?? '';
      return Number(/^Step (\d+)/.exec(text.trim())?.[1] ?? -1);
    };

    const input = modal.querySelector('input[type=file]') as HTMLInputElement | null;
    if (!input) return 'NO_FILE_INPUT';

    let file: File;
    if (a.b64) {
      const bin = atob(a.b64);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      file = new File([bytes], a.fileName);
    } else {
      file = new File([a.text ?? ''], a.fileName);
    }
    const dt = new DataTransfer();
    dt.items.add(file);
    input.files = dt.files;
    input.dispatchEvent(new Event('change'));

    if (a.sheet) {
      // CONDITION: the sheet list has loaded and Step 1 re-rendered its picker.
      const dd = await until(() => modal.querySelector('select') as HTMLSelectElement | null, 8000);
      if (!dd) return 'NO_SHEET_DROPDOWN';
      dd.value = a.sheet;
      dd.dispatchEvent(new Event('change'));
    }
    if (a.iterator !== undefined || a.where !== undefined) {
      // CONDITION: both JSON controls (iterator + filter) exist.
      const texts = await until(() => {
        const found = Array.from(modal.querySelectorAll('input[type=text]')) as HTMLInputElement[];
        return found.length >= 2 ? found : null;
      }, 8000);
      if (!texts) {
        const seen = modal.querySelectorAll('input[type=text]').length;
        return 'NO_JSON_INPUTS(' + seen + ')';
      }
      if (a.iterator !== undefined) {
        texts[0].value = a.iterator;
        texts[0].dispatchEvent(new Event('input'));
      }
      if (a.where !== undefined) {
        texts[1].value = a.where;
        texts[1].dispatchEvent(new Event('input'));
      }
    }

    const next = Array.from(modal.querySelectorAll('button')).find((b) => b.textContent?.includes('Next'));
    if (!next) return 'NO_NEXT_BUTTON';
    (next as HTMLButtonElement).click();

    // CONDITION: the wizard reports Step 2 (parse finished, columns rendered).
    const reached = await until(() => (stepNumber() >= 2 ? stepNumber() : null), 15_000);
    if (!reached) {
      return 'STUCK_ON_STEP_' + stepNumber() + ': ' + (modal.querySelector('h3')?.textContent ?? '').trim();
    }
    return 'STEP ' + reached + ': ' + (modal.querySelector('h3')?.textContent ?? '').trim();
  }, { ...args, wizard: WIZARD });
}

/** Close the wizard and prove it left the DOM before the next declaration opens one. */
async function closeModal(): Promise<void> {
  const result = await closeImportWizard();
  if (!result.closed) {
    throw new Error(`wizard modal did not close: ${result.remaining} still connected after ${result.waitedMs}ms`);
  }
}

/** After driveWizard() lands on Step 2: advance to Step 4, set the output
 *  path, click Generate, and report what landed in the vault.
 *
 *  Waits on the step indicator between clicks and on the wizard actually
 *  closing after Generate (its success path), instead of 600/2500ms sleeps. */
async function finishWizard(outputPath: string): Promise<string> {
  return browser.executeObsidian(async ({ app }, a) => {
    const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
    const modal = document.querySelector(a.wizard);
    if (!modal) return 'NO_MODAL';
    const stepNumber = (): number => {
      const text = modal.querySelector('.crosswalker-step-indicator')?.textContent ?? '';
      return Number(/^Step (\d+)/.exec(text.trim())?.[1] ?? -1);
    };
    const advanceTo = async (target: number): Promise<boolean> => {
      const next = Array.from(modal.querySelectorAll('button')).find((b) => b.textContent?.includes('Next'));
      if (!next) return false;
      (next as HTMLButtonElement).click();
      const deadline = Date.now() + 15_000;
      while (stepNumber() < target && Date.now() < deadline) await sleep(100);
      return stepNumber() >= target;
    };

    // Step 2 → 3 → 4, each confirmed by the wizard's own step indicator.
    if (!(await advanceTo(3))) return 'NO_NEXT_ON_STEP2(at step ' + stepNumber() + ')';
    if (!(await advanceTo(4))) return 'NO_NEXT_ON_STEP3(at step ' + stepNumber() + ')';

    // Step 4: first text input is the output path
    const pathInput = modal.querySelector('input[type=text]') as HTMLInputElement | null;
    if (!pathInput) return 'NO_OUTPUT_PATH_INPUT';
    pathInput.value = a.outputPath;
    pathInput.dispatchEvent(new Event('input'));

    const gen = Array.from(modal.querySelectorAll('button')).find((b) => b.textContent?.includes('Generate'));
    if (!gen) return 'NO_GENERATE_BUTTON';
    (gen as HTMLButtonElement).click();

    // CONDITION: generation finished. The wizard closes itself on success, so
    // "no connected wizard modal" is the product's own completion signal.
    const closedBy = Date.now() + 30_000;
    while (document.querySelector(a.wizard) && Date.now() < closedBy) await sleep(200);

    // Count what landed — recursively, since smart defaults may nest notes
    // into hierarchy folders (e.g. the sample workbook's family column).
    const collect = (): string[] => {
      const names: string[] = [];
      const walk = (f: unknown) => {
        // @ts-expect-error - TFolder/TFile shape probing
        for (const c of f?.children ?? []) {
          if (c.children) walk(c);
          else if (c.name?.endsWith('.md')) names.push(c.path.slice(a.outputPath.length + 1));
        }
      };
      walk(app.vault.getAbstractFileByPath(a.outputPath));
      return names.sort();
    };
    // CONDITION: the destination folder is present in the vault index with at
    // least one note. Vault-index visibility lags the write by a tick.
    const listedBy = Date.now() + 10_000;
    let names = collect();
    while (names.length === 0 && Date.now() < listedBy) {
      await sleep(150);
      names = collect();
    }
    return 'CREATED ' + names.length + ': ' + names.join(', ');
  }, { outputPath, wizard: WIZARD });
}

async function cleanupFolder(outputPath: string): Promise<void> {
  await browser.executeObsidian(async ({ app }, a) => {
    const folder = app.vault.getAbstractFileByPath(a.outputPath);
    if (folder) {
      // @ts-expect-error - delete accepts TAbstractFile
      await app.vault.delete(folder, true);
    }
  }, { outputPath });
}

describe('Visual — import wizard XLSX + JSON paths', function () {
  this.timeout(180_000);

  before(async () => {
    mkdirSync(OUT, { recursive: true });
    // Deterministic starting state instead of a 3s "let it settle" sleep:
    // no leftover wizard, no drafts from another spec, and Obsidian's metadata
    // cache actually resolved for every note in the seed vault.
    await closeImportWizard();
    await clearAllDrafts();
    const indexed = await waitForVaultIndexed();
    if (!indexed.ready) {
      console.warn(`[wizard-formats] vault index incomplete: ${indexed.pending}/${indexed.total} pending after ${indexed.waitedMs}ms`);
    }
  });

  afterEach(async () => {
    // Never hand the next declaration an open modal — that is exactly how the
    // first-generic-`.modal` failures compounded down the file.
    await closeImportWizard();
  });

  it('JSON record picker — nested lists render as cards, primary list ranked first', async () => {
    // CPRT-shaped: `relationships` is LARGER but reads like edges; `elements`
    // (the concept records) must rank first + be pre-selected.
    const cprt = JSON.stringify({
      response: { elements: {
        elements: Array.from({ length: 12 }, (_, i) => ({ element_type: 'subcategory', element_identifier: `GV.OC-0${i}`, title: '', text: 'Some descriptive text here', doc_identifier: 'CSF' })),
        relationships: Array.from({ length: 40 }, (_, i) => ({ source_element_identifier: `s${i}`, dest_element_identifier: `d${i}`, relationship_identifier: 'maps_to' })),
        documents: [{ doc_identifier: 'CSF', name: 'CSF 2.0', version: '2.0', website: 'x' }],
      } },
    });
    await requireImportWizard();
    const r = await browser.executeObsidian(async (_obs, a) => {
      const sleep = (ms: number) => new Promise((res) => setTimeout(res, ms));
      const modal = document.querySelector(a.wizard);
      if (!modal) return 'NO_MODAL';
      const input = modal.querySelector('input[type=file]') as HTMLInputElement | null;
      if (!input) return 'NO_FILE_INPUT';
      const dt = new DataTransfer();
      dt.items.add(new File([a.json], 'cprt.json'));
      input.files = dt.files;
      input.dispatchEvent(new Event('change'));
      // CONDITION: structure detection ran and Step 1 re-rendered its picker
      // cards. Replaces a fixed 700ms sleep.
      const deadline = Date.now() + 10_000;
      while (modal.querySelectorAll('.crosswalker-json-pick').length === 0 && Date.now() < deadline) {
        await sleep(100);
      }
      const selected = modal.querySelector('.crosswalker-json-pick-selected .crosswalker-json-pick-label')?.textContent ?? '';
      const cards = modal.querySelectorAll('.crosswalker-json-pick').length;
      return `cards=${cards} selected=${selected.trim()}`;
    }, { json: cprt, wizard: WIZARD });
    console.log('[wizard] json-picker → ' + r);
    await browser.saveScreenshot(path.join(OUT, 'wizard-json-picker.png'));
    await closeModal();
    if (!/cards=[34]/.test(r) || !/selected=elements/.test(r)) {
      throw new Error('Picker did not render/rank as expected: ' + r);
    }
  });

  it('XLSX: sheet picker + parse → Step 2 columns', async () => {
    const r = await driveWizard({ b64: makeWorkbookB64(), fileName: 'controls.xlsx', sheet: 'Controls' });
    console.log('[wizard] xlsx → ' + r);
    await browser.saveScreenshot(path.join(OUT, 'wizard-xlsx-step2.png'));
    await closeModal();
    if (!r.startsWith('STEP')) throw new Error('XLSX drive failed: ' + r);
  });

  it('JSON: iterator + filter + parse → Step 2 columns', async () => {
    const r = await driveWizard({
      text: STIX_JSON,
      fileName: 'stix.json',
      iterator: '$.objects[*]',
      where: 'type=attack-pattern,revoked!=true',
    });
    console.log('[wizard] json → ' + r);
    await browser.saveScreenshot(path.join(OUT, 'wizard-json-step2.png'));
    await closeModal();
    if (!r.startsWith('STEP')) throw new Error('JSON drive failed: ' + r);
  });

  it('XLSX full loop: parse → configure → preview → GENERATE notes', async () => {
    const target = 'E2E-Wizard-Test/From-XLSX';
    const r = await driveWizard({ b64: makeWorkbookB64(), fileName: 'controls.xlsx', sheet: 'Controls' });
    if (!r.startsWith('STEP')) throw new Error('XLSX drive failed: ' + r);
    const g = await finishWizard(target);
    console.log('[wizard] xlsx generate → ' + g);
    await browser.saveScreenshot(path.join(OUT, 'wizard-xlsx-generated.png'));
    await closeModal();
    await cleanupFolder('E2E-Wizard-Test');
    if (!g.startsWith('CREATED 3')) throw new Error('XLSX generation failed: ' + g);
  });

  it('JSON full loop: parse → configure → preview → GENERATE notes', async () => {
    const target = 'E2E-Wizard-Test/From-JSON';
    const r = await driveWizard({
      text: STIX_JSON,
      fileName: 'stix.json',
      iterator: '$.objects[*]',
      where: 'type=attack-pattern,revoked!=true',
    });
    if (!r.startsWith('STEP')) throw new Error('JSON drive failed: ' + r);
    const g = await finishWizard(target);
    console.log('[wizard] json generate → ' + g);
    await browser.saveScreenshot(path.join(OUT, 'wizard-json-generated.png'));
    await closeModal();
    await cleanupFolder('E2E-Wizard-Test');
    if (!g.startsWith('CREATED 1')) throw new Error('JSON generation failed: ' + g);
  });
});
