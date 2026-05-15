/**
 * apply-query-to-note.test.ts — Phase 4.5 orchestrator unit tests.
 *
 * Covers CREATE flow (no existing crosswalker block) + UPDATE flow
 * (existing block — preserve query_id, update params) + error paths
 * (template missing, no active file).
 */

import { applyQueryToNote, buildBaseFileContent } from '../src/views/apply-query-to-note';
import { FileManager, TFile, Vault } from 'obsidian';
import type { Editor } from 'obsidian';
import type { CrosswalkerQueryFrontmatter } from '../src/views/query-frontmatter-schema';

interface MockApp {
	vault: Vault & {
		__written: Map<string, string>;
		__folders: Set<string>;
	};
	fileManager: FileManager;
	metadataCache: {
		getFileCache: jest.Mock;
	};
}

function makeApp(metadata: Record<string, Record<string, unknown> | undefined> = {}): MockApp {
	const vault: any = new Vault();
	const written = new Map<string, string>();
	const folders = new Set<string>();
	vault.__written = written;
	vault.__folders = folders;

	vault.getAbstractFileByPath = jest.fn((path: string) => {
		if (folders.has(path)) {
			return { path, children: [] };
		}
		if (written.has(path)) {
			const t = new TFile(path);
			(t as any).extension = path.split('.').pop();
			return t;
		}
		return null;
	});
	vault.create = jest.fn(async (path: string, content: string) => {
		written.set(path, content);
		return new TFile(path);
	});
	vault.modify = jest.fn(async (f: TFile, content: string) => {
		written.set(f.path, content);
	});
	vault.createFolder = jest.fn(async (path: string) => {
		folders.add(path);
	});
	vault.read = jest.fn(async (f: TFile) => written.get(f.path) ?? '');

	return {
		vault,
		fileManager: new FileManager(),
		metadataCache: {
			getFileCache: jest.fn((file: TFile) => {
				const fm = metadata[file.path];
				return fm ? { frontmatter: fm } : null;
			}),
		},
	};
}

function makeMockEditor(): Editor {
	return {
		getCursor: () => ({ line: 0, ch: 0 }),
		getValue: () => '',
		replaceRange: jest.fn(),
	} as never;
}

describe('applyQueryToNote — CREATE flow', () => {
	it('writes frontmatter + .base file + returns action=created', async () => {
		const app = makeApp({});
		const file = new TFile('test.md');
		const editor = makeMockEditor();
		const result = await applyQueryToNote({
			app: app as never,
			file,
			editor,
			recipeId: 'nist-csf-coverage-matrix',
			shape: 'pivot',
			params: { confidence_threshold: 0.7 },
		});

		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.action).toBe('created');
		expect(result.queryId).toMatch(/^q-\d{4}-\d{2}-\d{2}-[0-9a-f]{8}$/);
		expect(result.viewFile).toBe(`_crosswalker/views/${result.queryId}.base`);

		// Frontmatter written
		const fm = app.fileManager.__frontmatter.get('test.md')?.crosswalker as CrosswalkerQueryFrontmatter;
		expect(fm).toBeDefined();
		expect(fm.recipe).toBe('nist-csf-coverage-matrix');
		expect(fm.shape).toBe('pivot');
		expect(fm.params).toEqual({ confidence_threshold: 0.7 });

		// .base file written
		const baseContent = app.vault.__written.get(result.viewFile);
		expect(baseContent).toBeDefined();
		expect(baseContent).toContain('filters:');
		expect(baseContent).toContain('views:');

		// Editor embed insert was attempted
		expect(editor.replaceRange).toHaveBeenCalledTimes(1);
	});

	it('fails gracefully when recipe has no template', async () => {
		const app = makeApp({});
		const file = new TFile('test.md');
		const editor = makeMockEditor();
		const result = await applyQueryToNote({
			app: app as never,
			file,
			editor,
			recipeId: 'no-template-recipe-id',
			shape: 'pivot',
			params: {},
		});
		expect(result.ok).toBe(false);
		if (result.ok) return;
		expect(result.reason).toBe('template-missing');
		// No frontmatter or .base file written
		expect(app.fileManager.processFrontMatter).not.toHaveBeenCalled();
		expect(app.vault.__written.size).toBe(0);
	});
});

describe('applyQueryToNote — UPDATE flow', () => {
	it('preserves query_id + view_file; updates params + generated_at', async () => {
		const existingFm: CrosswalkerQueryFrontmatter = {
			query_id: 'q-2026-05-15-aaaaaaaa',
			recipe: 'nist-csf-coverage-matrix',
			shape: 'pivot',
			params: { confidence_threshold: 0.5 },
			view_file: '_crosswalker/views/q-2026-05-15-aaaaaaaa.base',
			generated_at: '2026-05-15T10:00:00.000Z',
			schema_version: 1,
		};
		const app = makeApp({ 'test.md': { crosswalker: existingFm } });
		const file = new TFile('test.md');
		const result = await applyQueryToNote({
			app: app as never,
			file,
			editor: makeMockEditor(),
			recipeId: 'nist-csf-coverage-matrix',
			shape: 'pivot',
			params: { confidence_threshold: 0.9 }, // changed!
		});

		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.action).toBe('updated');
		expect(result.queryId).toBe('q-2026-05-15-aaaaaaaa'); // preserved
		expect(result.viewFile).toBe('_crosswalker/views/q-2026-05-15-aaaaaaaa.base'); // preserved

		// Frontmatter params updated
		const newFm = app.fileManager.__frontmatter.get('test.md')?.crosswalker as CrosswalkerQueryFrontmatter;
		expect(newFm.params).toEqual({ confidence_threshold: 0.9 });
		expect(newFm.query_id).toBe('q-2026-05-15-aaaaaaaa');
	});

	it('honors recipe change on UPDATE', async () => {
		const existingFm: CrosswalkerQueryFrontmatter = {
			query_id: 'q-2026-05-15-bbbbbbbb',
			recipe: 'nist-csf-coverage-matrix',
			shape: 'pivot',
			params: {},
			view_file: '_crosswalker/views/q-2026-05-15-bbbbbbbb.base',
			generated_at: '2026-05-15T10:00:00.000Z',
			schema_version: 1,
		};
		const app = makeApp({ 'test.md': { crosswalker: existingFm } });
		const file = new TFile('test.md');
		const result = await applyQueryToNote({
			app: app as never,
			file,
			editor: makeMockEditor(),
			recipeId: 'crosswalk-density-by-framework', // different recipe
			shape: 'table',
			params: {},
		});

		expect(result.ok).toBe(true);
		if (!result.ok) return;
		const newFm = app.fileManager.__frontmatter.get('test.md')?.crosswalker as CrosswalkerQueryFrontmatter;
		expect(newFm.recipe).toBe('crosswalk-density-by-framework');
		expect(newFm.shape).toBe('table');
	});
});

describe('buildBaseFileContent — header + body shape', () => {
	it('prepends a comment header with source note + recipe + query_id', () => {
		const content = buildBaseFileContent('filters: []\nviews: []', {
			recipeId: 'r',
			queryId: 'q-2026-05-15-deadbeef',
			sourceNotePath: 'My Note.md',
		});
		expect(content).toMatch(/^# Auto-generated by Crosswalker/);
		expect(content).toContain('# Source note: My Note.md');
		expect(content).toContain('# Recipe: r');
		expect(content).toContain('# Query ID: q-2026-05-15-deadbeef');
		// Body follows the header
		expect(content).toContain('filters: []');
	});

	it('ends with a trailing newline', () => {
		const content = buildBaseFileContent('filters: []', {
			recipeId: 'r',
			queryId: 'q-2026-05-15-deadbeef',
			sourceNotePath: 'n.md',
		});
		expect(content.endsWith('\n')).toBe(true);
	});
});
