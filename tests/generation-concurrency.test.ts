/**
 * generation-concurrency.test.ts — the bounded-concurrency write path
 * (forEachConcurrent + createFolderEnsurer), added 2026-06-13 so large imports
 * write notes in parallel instead of one-await-at-a-time.
 *
 * These pin the two correctness-critical invariants:
 *   - every item is processed exactly once, never more than `limit` at a time,
 *     and the synchronous prefix runs in item order (so path-collision
 *     reservation stays deterministic under concurrency);
 *   - a folder (and each ancestor) is created exactly once even when many
 *     concurrent rows target it — the bug that motivated the de-duplicator.
 */

import { forEachConcurrent, createFolderEnsurer, generateNotes } from '../src/generation/generation-engine';
import { TFile, TFolder } from 'obsidian';

describe('forEachConcurrent', () => {
	it('processes every item exactly once (array source)', async () => {
		const seen: number[] = [];
		await forEachConcurrent([10, 20, 30, 40, 50], 2, async (x) => { seen.push(x); });
		expect(seen.slice().sort((a, b) => a - b)).toEqual([10, 20, 30, 40, 50]);
	});

	it('processes every item exactly once (async-iterable source)', async () => {
		async function* gen() { for (let i = 0; i < 6; i++) yield i; }
		const seen: number[] = [];
		await forEachConcurrent(gen(), 3, async (x) => { seen.push(x); });
		expect(seen.slice().sort((a, b) => a - b)).toEqual([0, 1, 2, 3, 4, 5]);
	});

	it('never exceeds the concurrency limit, but does run in parallel', async () => {
		let active = 0;
		let maxActive = 0;
		await forEachConcurrent(Array.from({ length: 24 }, (_, i) => i), 4, async () => {
			active++;
			maxActive = Math.max(maxActive, active);
			await new Promise((r) => setTimeout(r, 5));
			active--;
		});
		expect(maxActive).toBeLessThanOrEqual(4);
		expect(maxActive).toBeGreaterThan(1);
	});

	it('runs synchronous prefixes in item order (deterministic reservation)', async () => {
		const prefixOrder: number[] = [];
		await forEachConcurrent([0, 1, 2, 3, 4, 5], 3, async (x) => {
			prefixOrder.push(x); // synchronous prefix — must observe item order
			await new Promise((r) => setTimeout(r, (5 - x) * 3)); // later items finish first
		});
		expect(prefixOrder).toEqual([0, 1, 2, 3, 4, 5]);
	});

	it('limit of 1 is effectively sequential', async () => {
		const order: number[] = [];
		await forEachConcurrent([1, 2, 3], 1, async (x) => {
			await new Promise((r) => setTimeout(r, 4));
			order.push(x);
		});
		expect(order).toEqual([1, 2, 3]);
	});

	it('an empty source is a no-op', async () => {
		let calls = 0;
		await forEachConcurrent([], 4, async () => { calls++; });
		expect(calls).toBe(0);
	});
});

describe('createFolderEnsurer', () => {
	function makeApp() {
		const existing = new Set<string>();
		const created: string[] = [];
		const app = {
			vault: {
				// generateNotes resolves existing notes by identity, which reads the
				// vault markdown list. This double has no pre-existing notes.
				getMarkdownFiles: () => [],
				getAbstractFileByPath: (p: string) => (existing.has(p) ? ({ path: p } as any) : null),
				createFolder: async (p: string) => {
					// Mimic Obsidian: throw if the folder already exists. The
					// de-duplicator must make sure this never actually fires twice
					// for the same path (and must swallow it if a race slips through).
					if (existing.has(p)) throw new Error(`Folder already exists: ${p}`);
					existing.add(p);
					created.push(p);
				},
			},
		};
		return { app, created };
	}

	it('creates each folder + ancestor exactly once under concurrent callers', async () => {
		const { app, created } = makeApp();
		const ensure = createFolderEnsurer(app as any);
		await Promise.all([ensure('A/B'), ensure('A/C'), ensure('A/B'), ensure('A/D/E')]);
		// A, A/B, A/C, A/D, A/D/E — each exactly once
		expect(created.slice().sort()).toEqual(['A', 'A/B', 'A/C', 'A/D', 'A/D/E']);
		expect(new Set(created).size).toBe(created.length); // no duplicates
	});

	it('caches: a second ensure of the same path does not re-create', async () => {
		const { app, created } = makeApp();
		const ensure = createFolderEnsurer(app as any);
		await ensure('X/Y');
		await ensure('X/Y');
		await ensure('X');
		expect(created.slice().sort()).toEqual(['X', 'X/Y']);
	});

	it('an empty path is a no-op', async () => {
		const { app, created } = makeApp();
		const ensure = createFolderEnsurer(app as any);
		await ensure('');
		expect(created).toEqual([]);
	});
});

describe('generateNotes — concurrency parity + folder de-dup (end-to-end)', () => {
	/** Map-backed mock vault; folders return TFolder, files return TFile so the
	 *  engine's instanceof checks behave. Fresh vault (no pre-existing files). */
	function makeVaultApp() {
		const files = new Map<string, string>();
		const folders = new Set<string>();
		const createFolderCalls: string[] = [];
		const app = {
			vault: {
				// generateNotes resolves existing notes by identity, which reads the
				// vault markdown list. Mirror the files this double already tracks.
				getMarkdownFiles: () => [...files.keys()].map((k) => new TFile(k)),
				getAbstractFileByPath: (p: string) =>
					folders.has(p) ? new TFolder(p) : files.has(p) ? new TFile(p) : null,
				create: async (p: string, c: string) => { files.set(p, c); return new TFile(p); },
				modify: async (f: any, c: string) => { files.set(f.path, c); },
				read: async (f: any) => files.get(f.path) ?? '',
				createFolder: async (p: string) => {
					if (folders.has(p)) throw new Error(`Folder already exists: ${p}`);
					folders.add(p);
					createFolderCalls.push(p);
				},
			},
		};
		return { app, files, folders, createFolderCalls };
	}

	// Legacy config: family → folder level, id → filename. Many rows share a
	// family (forces concurrent folder de-dup).
	const config: any = {
		name: 'concurrency-fixture',
		version: '1.0',
		source: { type: 'csv' },
		transforms: {},
		mapping: {
			hierarchy: [{ column: 'family', level: 1 }],
			frontmatter: [{ column: 'name', key: 'title' }],
			body: [],
			links: [],
			filename: { template: '{id}', sanitize: true },
		},
		output: { basePath: 'Out', overwriteMode: 'skip', createFolders: true },
	};

	const rows = [
		{ id: 'AC-1', family: 'AC', name: 'Policy' },
		{ id: 'AC-2', family: 'AC', name: 'Accounts' },
		{ id: 'AC-3', family: 'AC', name: 'Flow' },
		{ id: 'AU-1', family: 'AU', name: 'Audit policy' },
		{ id: 'AU-2', family: 'AU', name: 'Audit events' },
		{ id: 'CM-1', family: 'CM', name: 'Config policy' },
	];
	const parsed: any = { columns: ['id', 'family', 'name'], rows, rowCount: rows.length };
	const opts = (concurrency: number): any => ({
		basePath: 'Out', overwriteMode: 'skip', createFolders: true, concurrency,
	});

	it('concurrent run produces the same files as sequential', async () => {
		const seq = makeVaultApp();
		const conc = makeVaultApp();
		const rSeq = await generateNotes(seq.app as any, parsed, config, opts(1));
		const rConc = await generateNotes(conc.app as any, parsed, config, opts(8));

		expect(rSeq.created.length).toBe(6);
		expect(rConc.created.length).toBe(6);
		// Same set of file paths created, regardless of order (contents are
		// identical modulo the provenance timestamp, which differs per run).
		const seqPaths = [...seq.files.keys()].sort();
		const concPaths = [...conc.files.keys()].sort();
		expect(concPaths).toEqual(seqPaths);
		// Files nest under their family folder (hierarchy level 1).
		expect(concPaths).toEqual(
			['Out/AC/AC-1', 'Out/AC/AC-2', 'Out/AC/AC-3', 'Out/AU/AU-1', 'Out/AU/AU-2', 'Out/CM/CM-1'].map((p) => `${p}.md`).sort(),
		);
		// Bodies match once the timestamp line is stripped.
		const strip = (c: string) => c.replace(/produced_at:.*$/m, '');
		for (const path of concPaths) {
			expect(strip(conc.files.get(path)!)).toBe(strip(seq.files.get(path)!));
		}
		expect(rConc.errors).toEqual([]);
	});

	it('shared folders are created exactly once under concurrency (no races)', async () => {
		const { app, createFolderCalls } = makeVaultApp();
		const r = await generateNotes(app as any, parsed, config, opts(8));
		expect(r.errors).toEqual([]);
		// Out, Out/AC, Out/AU, Out/CM — each created once despite 3 AC rows etc.
		expect(createFolderCalls.slice().sort()).toEqual(['Out', 'Out/AC', 'Out/AU', 'Out/CM']);
		expect(new Set(createFolderCalls).size).toBe(createFolderCalls.length);
	});
});
