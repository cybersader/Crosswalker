/**
 * tests/export/helpers.ts — mock App shared by the v0.1.7 exporter tests.
 *
 * Extends the pattern from tests/sssom-importer.test.ts's local `makeMockApp`
 * (in-memory Map<path, content> vault, minimal FileManager) with the read
 * side an exporter needs: `vault.getMarkdownFiles()` + `vault.cachedRead()`
 * + a `metadataCache.getFileCache()` that always returns undefined so
 * vault-reader.ts's cachedRead+parseYaml fallback path is what actually runs
 * (the same route real Obsidian takes right after a bulk `vault.create()`
 * batch, before the cache resolves — see vault-reader.ts's module doc
 * comment). `parseYaml` itself is provided by tests/__mocks__/obsidian.ts.
 */

import type { App } from 'obsidian';

export interface MockVaultApp {
	app: App;
	written: Map<string, string>;
	folders: Set<string>;
}

function fileObj(p: string): { path: string; basename: string; extension: string } {
	const base = p.split('/').pop() ?? p;
	const dot = base.lastIndexOf('.');
	return {
		path: p,
		basename: dot > 0 ? base.slice(0, dot) : base,
		extension: dot > 0 ? base.slice(dot + 1) : '',
	};
}

export function makeMockApp(): MockVaultApp {
	const written = new Map<string, string>();
	const folders = new Set<string>();

	const app = {
		vault: {
			adapter: {
				exists: async (p: string) => written.has(p) || folders.has(p),
				mkdir: async (p: string) => {
					folders.add(p);
				},
			},
			getAbstractFileByPath: (p: string) => {
				if (folders.has(p)) return { path: p, children: [] } as unknown;
				if (written.has(p)) return fileObj(p) as unknown;
				return null;
			},
			getMarkdownFiles: () =>
				Array.from(written.keys())
					.filter((p) => p.endsWith('.md'))
					.map((p) => fileObj(p)),
			create: async (p: string, content: string) => {
				written.set(p, content);
				return fileObj(p);
			},
			modify: async (file: { path: string }, content: string) => {
				written.set(file.path, content);
			},
			read: async (file: { path: string }) => written.get(file.path) ?? '',
			cachedRead: async (file: { path: string }) => written.get(file.path) ?? '',
			createFolder: async (p: string) => {
				folders.add(p);
			},
		},
		metadataCache: {
			getFileCache: (_file: unknown) => undefined,
		},
		fileManager: {
			processFrontMatter: async (file: { path: string }, fn: (fm: Record<string, unknown>) => void) => {
				const content = written.get(file.path) ?? '';
				const fmMatch = content.match(/^---\n([\s\S]*?)\n---/);
				const fm: Record<string, unknown> = {};
				if (fmMatch) {
					const lines = fmMatch[1].split('\n');
					for (const ln of lines) {
						const m = ln.match(/^([^:]+):\s*(.*)$/);
						if (m) fm[m[1].trim()] = m[2].trim();
					}
				}
				fn(fm);
				const fmYaml = Object.entries(fm)
					.map(([k, v]) => `${k}: ${typeof v === 'string' ? v : JSON.stringify(v)}`)
					.join('\n');
				const body = content.replace(/^---\n[\s\S]*?\n---/, '').trimStart();
				written.set(file.path, `---\n${fmYaml}\n---\n${body}`);
			},
		},
	} as unknown as App;

	return { app, written, folders };
}
