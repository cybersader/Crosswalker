/**
 * visual-layout-widths.spec.ts — the no-horizontal-overflow invariant, at
 * EVERY pane width.
 *
 * Why this exists: the harness window is fixed (~1024px, `setWindowSize`
 * rejected), so for weeks every screenshot rendered ONE width and the wide
 * layout branch never rendered in any automated run — the owner's split-screen
 * test then found overflow twice (viewport-vs-pane breakpoints, then a wide
 * breakpoint below the grid's own minimum). Container queries make width
 * testable WITHOUT window resizing: we set the flow container's width directly
 * and assert the pane never overflows horizontally.
 *
 *   DISPLAY=:0 bun run e2e -- --spec tests/e2e/visual-layout-widths.spec.ts
 */

import { browser } from '@wdio/globals';
import { expect } from 'expect';
import { mkdirSync } from 'node:fs';
import path from 'node:path';

const OUT = path.resolve('test-screenshots');

const CPRT_CSV = [
	'element_identifier,title,element_type,text',
	'GV,Govern,function,"Strategy expectations and policy are established."',
	'GV.OC,Organizational Context,category,"Circumstances are understood."',
	'GV.OC-01,,subcategory,"The organizational mission is understood."',
	'ID,Identify,function,"Current cybersecurity risks are understood."',
	'ID.AM,Asset Management,category,"Assets are identified and managed."',
	'ID.AM-01,,subcategory,"Inventories of hardware are maintained."',
].join('\n');

/** Pane widths spanning every layout branch: stacked (<760), compact three-
 *  column (760–1280), collapsed-wide eligibility (1080+), wide (1280+), and
 *  the side-by-side preview branch (1350+). */
const WIDTHS = [520, 700, 800, 1000, 1200, 1300, 1450];

describe('Visual — no pane-level horizontal overflow at any width', function () {
	this.timeout(180_000);

	before(async () => {
		mkdirSync(OUT, { recursive: true });
		await browser.pause(6000);
	});

	it('workbench fits its pane at every width branch', async () => {
		// Mount the workspace view and jump straight to step 2 via the prefill
		// path (same journey as the file context menu).
		await browser.executeObsidian(async ({ app }) => {
			// @ts-expect-error internal plugins API
			const plugin = app.plugins.plugins['crosswalker'];
			plugin.settings.enableConfigSuggestions = false;
			plugin.settings.enableDraftSessions = false;
			const PATH = 'GraphTest-widths.csv';
			const existing = app.vault.getAbstractFileByPath(PATH);
			if (existing) await app.vault.delete(existing);
			await app.vault.create(PATH, (window as unknown as { __CW_CSV__: string }).__CW_CSV__ ?? '');
		});
		await browser.execute((csv: string) => {
			(window as unknown as { __CW_CSV__: string }).__CW_CSV__ = csv;
		}, CPRT_CSV);
		await browser.executeObsidian(async ({ app }) => {
			const PATH = 'GraphTest-widths.csv';
			const existing = app.vault.getAbstractFileByPath(PATH);
			if (existing) await app.vault.delete(existing);
			await app.vault.create(PATH, (window as unknown as { __CW_CSV__: string }).__CW_CSV__);
			const leaves = app.workspace.getLeavesOfType('crosswalker-workspace');
			const leaf = leaves[0] ?? app.workspace.getLeaf('tab');
			await leaf.setViewState({ type: 'crosswalker-workspace', active: true });
			app.workspace.revealLeaf(leaf);
			// @ts-expect-error view API
			const view = leaf.view;
			const file = app.vault.getAbstractFileByPath(PATH);
			await view.startImportWithFile(file);
		});
		await browser.waitUntil(
			async () => (await browser.$$('.crosswalker-workbench')).length > 0,
			{ timeout: 30_000, timeoutMsg: 'workbench did not mount' },
		);

		const failures: string[] = [];
		for (const width of WIDTHS) {
			const result = await browser.execute((w: number) => {
				const flow = document.querySelector('.crosswalker-workspace-flow') as HTMLElement | null;
				if (!flow) return { error: 'no flow element' };
				flow.style.width = `${w}px`;
				flow.style.maxWidth = `${w}px`;
				return { ok: true };
			}, width);
			expect(result).toEqual({ ok: true });
			await browser.pause(250);
			const measure = await browser.execute(() => {
				const flow = document.querySelector('.crosswalker-workspace-flow') as HTMLElement;
				const grid = document.querySelector('.crosswalker-workbench') as HTMLElement | null;
				return {
					flowScroll: flow.scrollWidth,
					flowClient: flow.clientWidth,
					gridScroll: grid?.scrollWidth ?? 0,
					gridClient: grid?.clientWidth ?? 0,
					cols: grid ? getComputedStyle(grid).gridTemplateColumns : '',
				};
			});
			// The invariant: content never exceeds the pane (2px rounding grace).
			if (measure.flowScroll > measure.flowClient + 2) {
				failures.push(
					`width ${width}: flow overflows (scroll ${measure.flowScroll} > client ${measure.flowClient}); columns [${measure.cols}]`,
				);
			}
			if (width === 800 || width === 1450) {
				await browser.saveScreenshot(path.join(OUT, `layout-${width}.png`));
			}
			console.log(`[layout-widths] ${width}px → scroll ${measure.flowScroll} client ${measure.flowClient} cols ${measure.cols}`);
		}

		// Reset the forced width.
		await browser.execute(() => {
			const flow = document.querySelector('.crosswalker-workspace-flow') as HTMLElement | null;
			if (flow) {
				flow.style.width = '';
				flow.style.maxWidth = '';
			}
		});

		expect(failures).toEqual([]);
	});
});
