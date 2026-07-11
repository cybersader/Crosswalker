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
		// Enable the beta workbench on the live plugin. Also disable the config
		// suggestion + draft features so the step-1 → step-2 advance is deterministic:
		// a vault with saved configs would otherwise show a suggestion banner after
		// parse and hold the wizard on step 1 (unrelated to what this spec verifies).
		await browser.executeObsidian(async ({ app }) => {
			// @ts-expect-error — internal plugins API
			const plugin = app.plugins.plugins['crosswalker'];
			plugin.settings.enableShapeWorkbench = true;
			plugin.settings.enableConfigSuggestions = false;
			plugin.settings.enableDraftSessions = false;
			await plugin.saveSettings();
		});
	});

	after(async () => {
		// Close modal + restore the changed settings to their defaults.
		await browser.executeObsidian(async ({ app }) => {
			document.querySelector<HTMLElement>('.modal-close-button')?.click();
			// @ts-expect-error — internal plugins API
			const plugin = app.plugins.plugins['crosswalker'];
			if (plugin) {
				plugin.settings.enableShapeWorkbench = false;
				plugin.settings.enableConfigSuggestions = true;
				plugin.settings.enableDraftSessions = true;
				await plugin.saveSettings();
			}
		});
	});

	it('recognizes a bundled-recipe source and leads with the trust card (spec §7m)', async () => {
		// A NIST CSF 2.0 CPRT-shaped CSV — its columns match the bundled
		// nist-csf-2-cprt-hierarchical recipe, so the wizard should hold on Step 1
		// and lead with the recognized-source card.
		const CPRT_CSV = [
			'element_identifier,title,element_type,text',
			'GV,Govern,function,"The organizations cybersecurity risk management strategy, expectations, and policy are established, communicated, and monitored."',
			'GV.OC,Organizational Context,category,"The circumstances that surround the organizations cybersecurity risk management decisions are understood."',
			'GV.OC-01,,subcategory,"The organizational mission is understood and informs cybersecurity risk management."',
			'ID,Identify,function,"The organizations current cybersecurity risks are understood."',
			'ID.AM,Asset Management,category,"Assets are identified and managed consistent with their relative importance."',
			'ID.AM-01,,subcategory,"Inventories of hardware managed by the organization are maintained."',
			'PR,Protect,function,"Safeguards to manage the organizations cybersecurity risks are used."',
			'PR.AA,Identity Management,category,"Access to physical and logical assets is limited to authorized users."',
		].join('\n');

		const info = await browser.executeObsidian(async ({ app }, csv) => {
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
			// Close any leftover modal first.
			document.querySelector<HTMLElement>('.modal-close-button')?.click();
			await sleep(300);

			// @ts-expect-error — commands API is untyped
			app.commands.executeCommandById('crosswalker:import-structured-data');
			const modal = await waitFor('.modal', 8000);
			if (!modal) return { ok: false as const, reason: 'NO_MODAL' };
			const input = (await waitFor('.modal input[type=file]', 8000)) as HTMLInputElement | null;
			if (!input) return { ok: false as const, reason: 'NO_FILE_INPUT' };
			const dt = new DataTransfer();
			dt.items.add(new File([csv], 'nist-csf-2-cprt.csv'));
			input.files = dt.files;
			input.dispatchEvent(new Event('change'));
			await sleep(700);

			// Click Next → parse → the wizard should HOLD on Step 1 with the card.
			const next = Array.from(modal.querySelectorAll('button')).find((b) => b.textContent?.includes('Next'));
			if (!next) return { ok: false as const, reason: 'NO_NEXT' };
			(next as HTMLButtonElement).click();

			const card = await waitFor('.crosswalker-recognized-card', 8000);
			const primary = Array.from(modal.querySelectorAll('.crosswalker-recognized-actions button')).find(
				(b) => b.textContent?.includes('Import with this configuration'),
			);
			return {
				ok: !!card,
				reason: card ? 'OK' : 'NO_CARD',
				title: modal.querySelector('.crosswalker-recognized-title')?.textContent ?? '',
				badge: modal.querySelector('.crosswalker-recognized-card .crosswalker-prov-badge')?.textContent ?? '',
				hasPrimary: !!primary,
				hasCustomize: Array.from(modal.querySelectorAll('.crosswalker-recognized-actions button')).some(
					(b) => b.textContent?.trim() === 'Customize',
				),
				hasScratch: Array.from(modal.querySelectorAll('.crosswalker-recognized-actions button')).some(
					(b) => b.textContent?.includes('Start from scratch'),
				),
				summary: modal.querySelector('.crosswalker-recognized-summary')?.textContent ?? '',
			};
		}, CPRT_CSV);
		console.log('[recognized] card → ' + JSON.stringify(info));
		await browser.saveScreenshot(path.join(OUT, 'wb-08-recognized.png'));
		expect(info.ok).toBe(true);
		if (info.ok) {
			expect(info.title).toContain('NIST CSF');
			expect(info.badge).toContain('Built-in');
			expect(info.hasPrimary).toBe(true);
			expect(info.hasCustomize).toBe(true);
			expect(info.hasScratch).toBe(true);
		}

		// "Import with this configuration" jumps STRAIGHT to the review screen (spec §7m),
		// loaded via fromRecipe (round-trip law). The review provenance must read as
		// VETTED "Built-in" — NOT the workbench's preset-drift "Custom".
		const review = await browser.executeObsidian(async () => {
			const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
			const modal = document.querySelector('.modal');
			if (!modal) return { ok: false as const };
			const primary = Array.from(modal.querySelectorAll('.crosswalker-recognized-actions button')).find(
				(b) => b.textContent?.includes('Import with this configuration'),
			) as HTMLButtonElement | undefined;
			if (!primary) return { ok: false as const, reason: 'NO_PRIMARY' };
			primary.click();
			const dest = await (async () => {
				const t0 = Date.now();
				while (Date.now() - t0 < 8000) {
					const el = document.querySelector('.crosswalker-dest-block');
					if (el) return el;
					await sleep(100);
				}
				return null;
			})();
			const prov = modal.querySelector('.crosswalker-provenance');
			return {
				ok: !!dest,
				h3: modal.querySelector('h3')?.textContent ?? '',
				provText: prov?.textContent ?? '',
				badge: prov?.querySelector('.crosswalker-prov-badge')?.textContent ?? '',
				hasRecap: !!modal.querySelector('.crosswalker-shape-map'),
				// The review screen must NOT re-render the live workbench (spec §7j #1).
				workbenchPresent: !!modal.querySelector('.crosswalker-workbench'),
			};
		});
		console.log('[recognized] review → ' + JSON.stringify(review));
		await browser.saveScreenshot(path.join(OUT, 'wb-09-recognized-review.png'));
		expect(review.ok).toBe(true);
		if (review.ok) {
			expect(review.h3).toContain('Review');
			expect(review.hasRecap).toBe(true);
			expect(review.badge).toContain('Built-in');
			expect(review.provText.toLowerCase()).toContain('built-in configuration');
			expect(review.workbenchPresent).toBe(false);
		}

		// Close the modal so the next spec opens a clean wizard.
		await browser.executeObsidian(async () => {
			document.querySelector<HTMLElement>('.modal-close-button')?.click();
		});
		await browser.pause(400);
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

		// -- Stage B2: force dark theme + screenshot the same overview, then
		//    restore. Confirms the design reads deliberately in BOTH color schemes
		//    (all workbench colors resolve to Obsidian theme vars).
		const prevTheme = await browser.executeObsidian(() => {
			const b = document.body;
			const wasDark = b.classList.contains('theme-dark');
			b.classList.remove('theme-light');
			b.classList.add('theme-dark');
			return wasDark ? 'dark' : 'light';
		});
		await browser.pause(300);
		await browser.saveScreenshot(path.join(OUT, 'wb-01-dark.png'));
		await browser.executeObsidian((_a, wasDark: unknown) => {
			const b = document.body;
			if (wasDark === 'light') { b.classList.remove('theme-dark'); b.classList.add('theme-light'); }
		}, prevTheme);
		await browser.pause(200);

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

		// -- Stage F: advance to Step 3 → the new review screen (spec §7j #1).
		//    Destination block + shape-map recap + stat chips + provenance line;
		//    NO workbench re-render.
		const review = await browser.executeObsidian(async () => {
			const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
			const modal = document.querySelector('.modal');
			if (!modal) return { ok: false as const };
			const next = Array.from(modal.querySelectorAll('button')).find((b) => b.textContent?.includes('Next'));
			if (!next) return { ok: false as const, reason: 'NO_NEXT' };
			(next as HTMLButtonElement).click();
			await sleep(800);
			const prov = modal.querySelector('.crosswalker-provenance');
			return {
				ok: true as const,
				h3: modal.querySelector('h3')?.textContent ?? '',
				hasDest: !!modal.querySelector('.crosswalker-dest-block'),
				hasReveal: !!modal.querySelector('.crosswalker-dest-reveal'),
				destPath: modal.querySelector('.crosswalker-dest-crumb')?.textContent ?? '',
				hasRecap: !!modal.querySelector('.crosswalker-shape-map'),
				hasProvenance: !!prov,
				provText: prov?.textContent ?? '',
				hasBadge: !!modal.querySelector('.crosswalker-prov-badge'),
				// The review screen must NOT re-render the live workbench (spec §7j #1).
				workbenchPresent: !!modal.querySelector('.crosswalker-workbench'),
			};
		});
		console.log('[workbench] review → ' + JSON.stringify(review));
		await browser.saveScreenshot(path.join(OUT, 'wb-05-review.png'));
		expect(review.ok).toBe(true);
		if (review.ok) {
			expect(review.hasDest).toBe(true);
			expect(review.hasReveal).toBe(true);
			expect(review.hasRecap).toBe(true);
			expect(review.hasProvenance).toBe(true);
			expect(review.hasBadge).toBe(true);
			expect(review.workbenchPresent).toBe(false);
		}

		// -- Stage G (L4): generate, then screenshot the localized GRAPH VIEW and
		//    one generated note in READING VIEW. The wizard closes on success.
		const destPath = review.ok ? (review.destPath || '').trim() : '';

		const genInfo = await browser.executeObsidian(async ({ app }) => {
			const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
			const modal = document.querySelector('.modal');
			if (!modal) return { ok: false as const, reason: 'NO_MODAL' };
			// Step 3 → Step 4 (Generate screen).
			const next = Array.from(modal.querySelectorAll('button')).find((b) => b.textContent?.includes('Next'));
			if (next) { (next as HTMLButtonElement).click(); await sleep(600); }
			// Click Generate.
			const gen = Array.from(document.querySelectorAll('.modal button')).find((b) => b.textContent?.trim() === 'Generate');
			if (!gen) return { ok: false as const, reason: 'NO_GENERATE' };
			(gen as HTMLButtonElement).click();
			// Wait for generation to finish (modal closes on success).
			const t0 = Date.now();
			while (Date.now() - t0 < 20000) {
				if (!document.querySelector('.crosswalker-wizard-modal')) break;
				await sleep(200);
			}
			await sleep(800);
			// @ts-expect-error — internal API
			const created = app.vault.getMarkdownFiles().filter((f: { path: string }) => f.path.startsWith('Frameworks/')).length;
			return { ok: true as const, modalClosed: !document.querySelector('.crosswalker-wizard-modal'), created };
		});
		console.log('[workbench] generate → ' + JSON.stringify(genInfo));
		expect(genInfo.ok).toBe(true);

		// -- Stage H: open one generated note in READING (preview) view.
		const noteInfo = await browser.executeObsidian(async ({ app }, dest: unknown) => {
			const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
			const prefix = (typeof dest === 'string' && dest.length ? dest : 'Frameworks').split('/')[0];
			// @ts-expect-error — internal API
			const files = app.vault.getMarkdownFiles().filter((f: { path: string }) => f.path.startsWith(prefix + '/'));
			if (!files.length) return { ok: false as const, reason: 'NO_FILES', prefix };
			files.sort((a: { stat: { mtime: number } }, b: { stat: { mtime: number } }) => b.stat.mtime - a.stat.mtime);
			// Prefer a leaf technique note (has body + frontmatter) over a folder note.
			const file = files.find((f: { path: string }) => /T\d{4}(\.\d{3})?\.md$/.test(f.path)) ?? files[0];
			// @ts-expect-error — internal API
			const leaf = app.workspace.getLeaf(true);
			await leaf.openFile(file, { state: { mode: 'preview' } });
			await sleep(1200);
			return { ok: true as const, path: file.path };
		}, destPath);
		console.log('[workbench] note → ' + JSON.stringify(noteInfo));
		await browser.saveScreenshot(path.join(OUT, 'wb-07-note.png'));

		// -- Stage I: open GRAPH VIEW and localize it to the output folder. Graph
		//    automation is best-effort; the screenshot is captured regardless so a
		//    partial result is still inspectable.
		const graphInfo = await browser.executeObsidian(async ({ app }, dest: unknown) => {
			const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
			const prefix = (typeof dest === 'string' && dest.length ? dest : 'Frameworks').split('/')[0];
			// @ts-expect-error — commands API is untyped
			app.commands.executeCommandById('graph:open');
			let graphLeaf: HTMLElement | null = null;
			const t0 = Date.now();
			while (Date.now() - t0 < 8000) {
				graphLeaf = document.querySelector('.workspace-leaf-content[data-type="graph"]');
				if (graphLeaf) break;
				await sleep(150);
			}
			if (!graphLeaf) return { ok: false as const, reason: 'NO_GRAPH_LEAF' };
			// Type a path filter into the graph search box so only the import shows.
			const search = graphLeaf.querySelector('input[type="search"], .search-input-container input') as HTMLInputElement | null;
			let filtered = false;
			if (search) {
				search.focus();
				search.value = `path:"${prefix}"`;
				search.dispatchEvent(new Event('input', { bubbles: true }));
				filtered = true;
				await sleep(2500); // let the force layout settle
			} else {
				await sleep(2000);
			}
			return { ok: true as const, filtered, query: `path:"${prefix}"` };
		}, destPath);
		console.log('[workbench] graph → ' + JSON.stringify(graphInfo));
		await browser.saveScreenshot(path.join(OUT, 'wb-06-graph.png'));
	});
});
