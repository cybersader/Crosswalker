/**
 * visual-workbench.spec.ts — the Shape workbench (beta) in wizard Step 2.
 *
 * Enables the `enableShapeWorkbench` setting via the plugin handle, drives the
 * import wizard through the REAL UI with an ATT&CK-shaped CSV (packed
 * technique ids + a repeated tactic facet + long descriptions), advances to
 * Step 2, and asserts + screenshots the three workbench zones:
 *   - source rail  (crosswalker-wb-source)   — columns + detection badges
 *   - mapping canvas (crosswalker-wb-canvas)  — preset dropdown + mapping cards + matrix
 *   - vault preview rail (crosswalker-wb-preview) — live folder tree + note
 *
 *   DISPLAY=:0 bun run e2e -- --spec tests/e2e/visual-workbench.spec.ts
 *
 * Screenshots land in test-screenshots/ (wb-01 … wb-04).
 *
 * One test drives the whole flow (the wizard modal is shared state; splitting
 * across `it`s would leak an open modal between tests). Rich diagnostics are
 * returned from the single executeObsidian block and logged for triage.
 */

import { browser } from '@wdio/globals';
import { expect } from 'expect';
import { mkdirSync } from 'node:fs';
import path from 'node:path';

const OUT = path.resolve('test-screenshots');

/** ~12-row ATT&CK-shaped CSV. 6/12 ids are sub-techniques (dotted) → ~50%
 *  coverage → a RAGGED packed hierarchy (variadic tail). 4 repeated tactics
 *  → facet candidate. Long descriptions → body candidate. */
const ATTACK_CSV = [
	'technique_id,name,tactic,description',
	'T1055,Process Injection,Defense Evasion,"Adversaries may inject code into processes in order to evade process-based defenses as well as possibly elevate privileges. Process injection is a method of executing arbitrary code in the address space of a separate live process."',
	'T1055.001,Dynamic-link Library Injection,Defense Evasion,"Adversaries may inject dynamic-link libraries (DLLs) into processes in order to evade process-based defenses as well as possibly elevate privileges. DLL injection is a method of executing arbitrary code in the address space of a separate live process."',
	'T1055.011,Extra Window Memory Injection,Defense Evasion,"Adversaries may inject malicious code into process via Extra Window Memory (EWM) in order to evade process-based defenses as well as possibly elevate privileges. EWM injection is a method of executing arbitrary code in the address space of a separate live process."',
	'T1059,Command and Scripting Interpreter,Execution,"Adversaries may abuse command and script interpreters to execute commands, scripts, or binaries. These interfaces and languages provide ways of interacting with computer systems and are a common feature across many different platforms."',
	'T1059.001,PowerShell,Execution,"Adversaries may abuse PowerShell commands and scripts for execution. PowerShell is a powerful interactive command-line interface and scripting environment included in the Windows operating system."',
	'T1059.003,Windows Command Shell,Execution,"Adversaries may abuse the Windows command shell for execution. The Windows command shell (cmd) is the primary command prompt on Windows systems and can be used to control almost any aspect of a system."',
	'T1071,Application Layer Protocol,Command and Control,"Adversaries may communicate using OSI application layer protocols to avoid detection and network filtering by blending in with existing traffic. Commands to the remote system, and often the results of those commands, will be embedded within the protocol traffic."',
	'T1071.001,Web Protocols,Command and Control,"Adversaries may communicate using application layer protocols associated with web traffic to avoid detection and network filtering by blending in with existing traffic. Commands to the remote system, and often the results of those commands, will be embedded within the protocol traffic."',
	'T1547,Boot or Logon Autostart Execution,Persistence,"Adversaries may configure system settings to automatically execute a program during system boot or logon to maintain persistence or gain higher-level privileges on compromised systems."',
	'T1547.001,Registry Run Keys / Startup Folder,Persistence,"Adversaries may achieve persistence by adding a program to a startup folder or referencing it with a Registry run key. Adding an entry to the run keys in the Registry will cause the program referenced to be executed when a user logs in."',
	'T1003,OS Credential Dumping,Defense Evasion,"Adversaries may attempt to dump credentials to obtain account login and credential material, normally in the form of a hash or a clear text password, from the operating system and software."',
	'T1486,Data Encrypted for Impact,Execution,"Adversaries may encrypt data on target systems or on large numbers of systems in a network to interrupt availability to system and network resources. They can attempt to render stored data inaccessible by encrypting files or data on local and remote drives."',
].join('\n');

describe('Visual — Shape workbench (beta) in wizard Step 2', function () {
	this.timeout(180_000);

	before(async () => {
		mkdirSync(OUT, { recursive: true });
		// Let the (heavy) test vault finish its initial index before driving UI.
		await browser.pause(6000);
		// Enable the beta workbench on the live plugin.
		await browser.executeObsidian(async ({ app }) => {
			// @ts-expect-error — internal plugins API
			const plugin = app.plugins.plugins['crosswalker'];
			plugin.settings.enableShapeWorkbench = true;
			await plugin.saveSettings();
		});
	});

	after(async () => {
		// Close modal + restore the setting to its default (off).
		await browser.executeObsidian(async ({ app }) => {
			document.querySelector<HTMLElement>('.modal-close-button')?.click();
			// @ts-expect-error — internal plugins API
			const plugin = app.plugins.plugins['crosswalker'];
			if (plugin) {
				plugin.settings.enableShapeWorkbench = false;
				await plugin.saveSettings();
			}
		});
	});

	it('drives the CSV to the workbench Step 2 and screenshots the three zones', async () => {
		// -- Stage A: open wizard → inject CSV → advance to the workbench.
		const openInfo = await browser.executeObsidian(async ({ app }, csv) => {
			const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
			const waitFor = async (sel: string, ms: number) => {
				const t0 = Date.now();
				while (Date.now() - t0 < ms) {
					const el = document.querySelector(sel);
					if (el) return el;
					await sleep(100);
				}
				return null;
			};

			// @ts-expect-error — commands API is untyped
			const cmdExists = !!app.commands.commands['crosswalker:import-structured-data'];
			// @ts-expect-error — commands API is untyped
			app.commands.executeCommandById('crosswalker:import-structured-data');

			const modal = await waitFor('.modal', 8000);
			if (!modal) return { stage: 'open', ok: false, cmdExists, reason: 'NO_MODAL' };

			// Step 1 content renders after loadAvailableDrafts() resolves, so the
			// file input appears a beat after the modal shell — poll for it.
			const input = (await waitFor('.modal input[type=file]', 8000)) as HTMLInputElement | null;
			if (!input) return { stage: 'open', ok: false, cmdExists, reason: 'NO_FILE_INPUT' };
			const dt = new DataTransfer();
			dt.items.add(new File([csv], 'attack-mini.csv'));
			input.files = dt.files;
			input.dispatchEvent(new Event('change'));
			await sleep(700);

			const next = Array.from(modal.querySelectorAll('button')).find((b) => b.textContent?.includes('Next'));
			if (!next) return { stage: 'open', ok: false, cmdExists, reason: 'NO_NEXT_BUTTON' };
			(next as HTMLButtonElement).click();

			const wb = await waitFor('.crosswalker-workbench', 8000);
			return {
				stage: 'open',
				ok: !!wb,
				cmdExists,
				reason: wb ? 'OK' : 'NO_WORKBENCH',
				h3: modal.querySelector('h3')?.textContent ?? '',
			};
		}, ATTACK_CSV);
		console.log('[workbench] open → ' + JSON.stringify(openInfo));
		await browser.saveScreenshot(path.join(OUT, 'wb-01-step2-overview.png'));
		expect(openInfo.ok).toBe(true);

		// -- Stage B: overview assertions (three zones + technique_id badge).
		const overview = await browser.executeObsidian(() => {
			const modal = document.querySelector('.modal');
			if (!modal) return { ok: false as const };
			const source = modal.querySelector('.crosswalker-wb-source');
			let techIdHasBadge = false;
			for (const el of Array.from(source?.querySelectorAll('.crosswalker-wb-colname') ?? [])) {
				if (el.textContent?.trim() === 'technique_id') {
					if (el.closest('.crosswalker-wb-colrow')?.querySelector('.crosswalker-wb-badge')) techIdHasBadge = true;
				}
			}
			return {
				ok: true as const,
				hasSource: !!source,
				hasCanvas: !!modal.querySelector('.crosswalker-wb-canvas'),
				hasPreview: !!modal.querySelector('.crosswalker-wb-preview'),
				techIdHasBadge,
				presetSelects: modal.querySelectorAll('.crosswalker-wb-presetbar select').length,
				mapCards: modal.querySelectorAll('.crosswalker-wb-mapcard').length,
				totalBadges: modal.querySelectorAll('.crosswalker-wb-badge').length,
			};
		});
		console.log('[workbench] overview → ' + JSON.stringify(overview));
		expect(overview.ok).toBe(true);
		if (overview.ok) {
			expect(overview.hasSource).toBe(true);
			expect(overview.hasCanvas).toBe(true);
			expect(overview.hasPreview).toBe(true);
			expect(overview.techIdHasBadge).toBe(true);
			expect(overview.presetSelects).toBeGreaterThanOrEqual(1);
			expect(overview.mapCards).toBeGreaterThanOrEqual(1);
		}

		// -- Stage C: click the technique_id detection badge → evidence card.
		const evidence = await browser.executeObsidian(async () => {
			const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
			const modal = document.querySelector('.modal');
			if (!modal) return { ok: false as const };
			let badge: HTMLButtonElement | null = null;
			for (const el of Array.from(modal.querySelectorAll('.crosswalker-wb-colname'))) {
				if (el.textContent?.trim() === 'technique_id') {
					badge = el.closest('.crosswalker-wb-colrow')?.querySelector('.crosswalker-wb-badge') ?? null;
				}
			}
			if (!badge) badge = modal.querySelector('.crosswalker-wb-badge');
			if (!badge) return { ok: false as const };
			badge.click();
			await sleep(500);
			const card = modal.querySelector('.crosswalker-wb-evidence');
			return {
				ok: true as const,
				hasEvidence: !!card,
				title: card?.querySelector('.crosswalker-wb-evidence-title')?.textContent ?? '',
			};
		});
		console.log('[workbench] evidence → ' + JSON.stringify(evidence));
		await browser.saveScreenshot(path.join(OUT, 'wb-02-evidence-card.png'));
		expect(evidence.ok).toBe(true);
		if (evidence.ok) expect(evidence.hasEvidence).toBe(true);

		// -- Stage D: expand a mapping + "Arrange levels" → matrix w/ tail row.
		const matrix = await browser.executeObsidian(async () => {
			const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
			const modal = document.querySelector('.modal');
			if (!modal) return { ok: false as const };
			const toggle = modal.querySelector('.crosswalker-wb-mapcard-toggle') as HTMLButtonElement | null;
			if (!toggle) return { ok: false as const, reason: 'NO_TOGGLE' };
			toggle.click();
			await sleep(500);
			const arrange = Array.from(modal.querySelectorAll('.crosswalker-wb-arrange')).find(
				(b) => b.textContent?.includes('Arrange levels'),
			) as HTMLButtonElement | undefined;
			if (!arrange) return { ok: false as const, reason: 'NO_ARRANGE' };
			arrange.click();
			await sleep(500);
			const tailRow = modal.querySelector('.crosswalker-wb-tailrow');
			// Bring the matrix into the modal viewport so the screenshot shows it.
			(modal.querySelector('.crosswalker-wb-matrix') ?? tailRow)?.scrollIntoView({ block: 'center' });
			await sleep(300);
			return {
				ok: true as const,
				hasMatrix: !!modal.querySelector('.crosswalker-wb-matrix'),
				hasTailRow: !!tailRow,
				tailText: tailRow?.textContent ?? '',
			};
		});
		console.log('[workbench] matrix → ' + JSON.stringify(matrix));
		await browser.saveScreenshot(path.join(OUT, 'wb-03-matrix-expanded.png'));
		expect(matrix.ok).toBe(true);
		if (matrix.ok) {
			expect(matrix.hasMatrix).toBe(true);
			expect(matrix.hasTailRow).toBe(true);
			expect(matrix.tailText).toContain('Any deeper');
		}

		// -- Stage E: live preview rail → folder tree containing T1055.
		const preview = await browser.executeObsidian(async () => {
			const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
			const modal = document.querySelector('.modal');
			if (!modal) return { ok: false as const };
			const rail = modal.querySelector('.crosswalker-wb-preview');
			rail?.scrollIntoView({ block: 'start' });
			await sleep(300);
			const tree = rail?.querySelector('.crosswalker-wb-tree');
			return {
				ok: true as const,
				hasTree: !!tree,
				treeText: tree?.textContent ?? '',
				hasNote: !!rail?.querySelector('.crosswalker-wb-note'),
			};
		});
		console.log('[workbench] preview → ' + JSON.stringify(preview).slice(0, 500));
		await browser.saveScreenshot(path.join(OUT, 'wb-04-preview-rail.png'));
		expect(preview.ok).toBe(true);
		if (preview.ok) {
			expect(preview.hasTree).toBe(true);
			expect(preview.treeText).toContain('T1055');
		}
	});
});
