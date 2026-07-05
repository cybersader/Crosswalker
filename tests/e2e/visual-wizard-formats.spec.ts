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

/** Open the wizard, inject a file, optionally tweak Step-1 controls, click Next. */
async function driveWizard(args: {
  b64?: string;
  text?: string;
  fileName: string;
  sheet?: string;
  iterator?: string;
  where?: string;
}): Promise<string> {
  return browser.executeObsidian(async ({ app }, a) => {
    // @ts-expect-error - commands is untyped on App
    app.commands.executeCommandById('crosswalker:import-structured-data');
    await new Promise((r) => setTimeout(r, 400));

    const modal = document.querySelector('.modal');
    if (!modal) return 'NO_MODAL';
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
    await new Promise((r) => setTimeout(r, 600)); // sheet-list load + re-render

    if (a.sheet) {
      const dd = modal.querySelector('select') as HTMLSelectElement | null;
      if (!dd) return 'NO_SHEET_DROPDOWN';
      dd.value = a.sheet;
      dd.dispatchEvent(new Event('change'));
    }
    if (a.iterator !== undefined || a.where !== undefined) {
      const texts = Array.from(modal.querySelectorAll('input[type=text]')) as HTMLInputElement[];
      if (texts.length < 2) return 'NO_JSON_INPUTS(' + texts.length + ')';
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
    await new Promise((r) => setTimeout(r, 1500)); // parse + step-2 render

    const heading = modal.querySelector('h2, h3')?.textContent ?? '';
    return 'STEP: ' + heading;
  }, args);
}

async function closeModal(): Promise<void> {
  await browser.executeObsidian(async () => {
    document.querySelector<HTMLElement>('.modal-close-button')?.click();
    await new Promise((r) => setTimeout(r, 300));
  });
}

/** After driveWizard() lands on Step 2: advance to Step 4, set the output
 *  path, click Generate, and report what landed in the vault. */
async function finishWizard(outputPath: string): Promise<string> {
  return browser.executeObsidian(async ({ app }, a) => {
    const modal = document.querySelector('.modal');
    if (!modal) return 'NO_MODAL';
    const clickNext = async () => {
      const next = Array.from(modal.querySelectorAll('button')).find((b) => b.textContent?.includes('Next'));
      if (!next) return false;
      (next as HTMLButtonElement).click();
      await new Promise((r) => setTimeout(r, 600));
      return true;
    };
    // Step 2 → 3 → 4
    if (!(await clickNext())) return 'NO_NEXT_ON_STEP2';
    if (!(await clickNext())) return 'NO_NEXT_ON_STEP3';

    // Step 4: first text input is the output path
    const pathInput = modal.querySelector('input[type=text]') as HTMLInputElement | null;
    if (!pathInput) return 'NO_OUTPUT_PATH_INPUT';
    pathInput.value = a.outputPath;
    pathInput.dispatchEvent(new Event('input'));

    const gen = Array.from(modal.querySelectorAll('button')).find((b) => b.textContent?.includes('Generate'));
    if (!gen) return 'NO_GENERATE_BUTTON';
    (gen as HTMLButtonElement).click();
    await new Promise((r) => setTimeout(r, 2500));

    // Count what landed — recursively, since smart defaults may nest notes
    // into hierarchy folders (e.g. the sample workbook's family column).
    const names: string[] = [];
    const walk = (f: unknown) => {
      // @ts-expect-error - TFolder/TFile shape probing
      for (const c of f?.children ?? []) {
        if (c.children) walk(c);
        else if (c.name?.endsWith('.md')) names.push(c.path.slice(a.outputPath.length + 1));
      }
    };
    walk(app.vault.getAbstractFileByPath(a.outputPath));
    names.sort();
    return 'CREATED ' + names.length + ': ' + names.join(', ');
  }, { outputPath });
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
    await browser.pause(3000);
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
    const r = await browser.executeObsidian(async ({ app }, json) => {
      // @ts-expect-error untyped commands
      app.commands.executeCommandById('crosswalker:import-structured-data');
      await new Promise((res) => setTimeout(res, 400));
      const modal = document.querySelector('.modal');
      if (!modal) return 'NO_MODAL';
      const input = modal.querySelector('input[type=file]') as HTMLInputElement;
      const dt = new DataTransfer();
      dt.items.add(new File([json], 'cprt.json'));
      input.files = dt.files;
      input.dispatchEvent(new Event('change'));
      await new Promise((res) => setTimeout(res, 700)); // structure detect + re-render
      const selected = modal.querySelector('.crosswalker-json-pick-selected .crosswalker-json-pick-label')?.textContent ?? '';
      const cards = modal.querySelectorAll('.crosswalker-json-pick').length;
      return `cards=${cards} selected=${selected.trim()}`;
    }, cprt);
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
