/**
 * apply-query-to-note.test.ts — Phase 4.6 orchestrator unit tests (Layout B+).
 *
 * Covers CREATE flow (writes _crosswalker/queries/<slug>/{index.md, view.base}
 * + inserts ![[<slug>/view.base]] at host-note cursor), UPDATE flow (re-reads
 * existing index.md frontmatter via options.existingSlug, regenerates view.base),
 * collision-mode handling (refuse vs auto-suffix), error paths.
 */

import { applyQueryToNote, buildBaseFileContent, buildIndexBody } from '../src/views/apply-query-to-note';
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
		const t = new TFile(path);
		(t as any).extension = path.split('.').pop();
		return t;
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

describe('applyQueryToNote — CREATE flow (Layout B+)', () => {
	it('writes index.md + view.base in _crosswalker/queries/<slug>/', async () => {
		const app = makeApp({});
		const file = new TFile('Host Note.md');
		const editor = makeMockEditor();
		const result = await applyQueryToNote({
			app: app as never,
			file,
			editor,
			recipeId: 'nist-csf-coverage-matrix',
			recipeName: 'NIST CSF Coverage Matrix',
			shape: 'pivot',
			params: { confidence_threshold: 0.7 },
		});

		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.action).toBe('created');
		expect(result.slug).toBe('nist-csf-coverage-matrix');
		expect(result.queryId).toMatch(/^q-\d{4}-\d{2}-\d{2}-[0-9a-f]{8}$/);
		expect(result.viewFile).toBe('_crosswalker/queries/nist-csf-coverage-matrix/view.base');
		expect(result.indexFile).toBe('_crosswalker/queries/nist-csf-coverage-matrix/index.md');

		// index.md written
		expect(app.vault.__written.has(result.indexFile)).toBe(true);
		// view.base written
		const baseContent = app.vault.__written.get(result.viewFile);
		expect(baseContent).toBeDefined();
		expect(baseContent).toContain('filters:');

		// Frontmatter written on the index.md via processFrontMatter
		const fm = app.fileManager.__frontmatter.get(result.indexFile)?.crosswalker_query as CrosswalkerQueryFrontmatter;
		expect(fm).toBeDefined();
		expect(fm.recipe).toBe('nist-csf-coverage-matrix');
		expect(fm.slug).toBe('nist-csf-coverage-matrix');
		expect(fm.schema_version).toBe(2);

		// Editor embed insert was attempted (on the host note)
		expect(editor.replaceRange).toHaveBeenCalledTimes(1);
	});

	it('fails gracefully when recipe has no template', async () => {
		const app = makeApp({});
		const result = await applyQueryToNote({
			app: app as never,
			file: new TFile('Host Note.md'),
			editor: makeMockEditor(),
			recipeId: 'no-template-recipe-id',
			recipeName: 'No template',
			shape: 'pivot',
			params: {},
		});
		expect(result.ok).toBe(false);
		if (result.ok) return;
		expect(result.reason).toBe('template-missing');
	});

	it('refuse-and-prompt collision returns slug-collision result', async () => {
		const app = makeApp({});
		// Pre-populate a folder at the canonical path → simulates existing query
		app.vault.__folders.add('_crosswalker/queries/nist-csf-coverage-matrix');
		const result = await applyQueryToNote({
			app: app as never,
			file: new TFile('Host Note.md'),
			editor: makeMockEditor(),
			recipeId: 'nist-csf-coverage-matrix',
			recipeName: 'NIST CSF Coverage Matrix',
			shape: 'pivot',
			params: {},
			collisionMode: 'refuse',
		});
		expect(result.ok).toBe(false);
		if (result.ok) return;
		expect(result.reason).toBe('slug-collision');
		expect(result.existingSlug).toBe('nist-csf-coverage-matrix');
	});

	it('auto-suffix collision creates a <slug>-<4hex> folder', async () => {
		const app = makeApp({});
		app.vault.__folders.add('_crosswalker/queries/nist-csf-coverage-matrix');
		const result = await applyQueryToNote({
			app: app as never,
			file: new TFile('Host Note.md'),
			editor: makeMockEditor(),
			recipeId: 'nist-csf-coverage-matrix',
			recipeName: 'NIST CSF Coverage Matrix',
			shape: 'pivot',
			params: {},
			collisionMode: 'auto-suffix',
		});
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.slug).toMatch(/^nist-csf-coverage-matrix-[0-9a-f]{4}$/);
	});
});

describe('applyQueryToNote — UPDATE flow (Layout B+)', () => {
	it('preserves query_id + slug; updates params + generated_at', async () => {
		const existingFm: CrosswalkerQueryFrontmatter = {
			query_id: 'q-2026-05-15-aaaaaaaa',
			slug: 'csf-coverage',
			recipe: 'nist-csf-coverage-matrix',
			shape: 'pivot',
			params: { confidence_threshold: 0.5 },
			view_file: '_crosswalker/queries/csf-coverage/view.base',
			generated_at: '2026-05-15T10:00:00.000Z',
			schema_version: 2,
		};
		const app = makeApp({
			'_crosswalker/queries/csf-coverage/index.md': { crosswalker_query: existingFm },
		});
		app.vault.__written.set('_crosswalker/queries/csf-coverage/index.md', 'placeholder');

		const result = await applyQueryToNote({
			app: app as never,
			file: new TFile('Host Note.md'),
			editor: makeMockEditor(),
			recipeId: 'nist-csf-coverage-matrix',
			recipeName: 'NIST CSF Coverage Matrix',
			shape: 'pivot',
			params: { confidence_threshold: 0.9 },
			existingSlug: 'csf-coverage',
		});

		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.action).toBe('updated');
		expect(result.queryId).toBe('q-2026-05-15-aaaaaaaa');
		expect(result.slug).toBe('csf-coverage');

		const newFm = app.fileManager.__frontmatter.get('_crosswalker/queries/csf-coverage/index.md')?.crosswalker_query as CrosswalkerQueryFrontmatter;
		expect(newFm.params).toEqual({ confidence_threshold: 0.9 });
		expect(newFm.query_id).toBe('q-2026-05-15-aaaaaaaa');
	});
});

describe('buildBaseFileContent — header includes slug + queryId', () => {
	it('prepends a comment header with slug + recipe + query_id', () => {
		const content = buildBaseFileContent('filters: []\nviews: []', {
			recipeId: 'r',
			queryId: 'q-2026-05-15-deadbeef',
			slug: 'csf-coverage',
			sourceNotePath: 'My Note.md',
		});
		expect(content).toMatch(/^# Auto-generated by Crosswalker/);
		expect(content).toContain('# Source note (where embed was inserted): My Note.md');
		expect(content).toContain('# Recipe: r');
		expect(content).toContain('# Query ID: q-2026-05-15-deadbeef');
		expect(content).toContain('# Slug: csf-coverage');
		expect(content).toContain('filters: []');
	});

	it('ends with a trailing newline', () => {
		const content = buildBaseFileContent('filters: []', {
			recipeId: 'r',
			queryId: 'q-2026-05-15-deadbeef',
			slug: 's',
			sourceNotePath: 'n.md',
		});
		expect(content.endsWith('\n')).toBe(true);
	});
});

describe('buildIndexBody — initial index.md body', () => {
	it('includes a transclusion of the view.base sibling', () => {
		const fm: CrosswalkerQueryFrontmatter = {
			query_id: 'q-2026-05-15-deadbeef',
			slug: 'csf-coverage',
			recipe: 'r',
			shape: 'pivot',
			params: {},
			view_file: '_crosswalker/queries/csf-coverage/view.base',
			generated_at: '2026-05-15T20:55:00.000Z',
			schema_version: 2,
		};
		const body = buildIndexBody(fm, 'csf-coverage');
		expect(body).toContain('![[csf-coverage/view.base]]');
		expect(body).toContain('# csf-coverage');
	});
});
