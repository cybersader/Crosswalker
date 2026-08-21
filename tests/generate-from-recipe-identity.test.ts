/**
 * Identity reconciliation on the native recipe path. Crosswalk notes are
 * generated through generateFromRecipe(), so layout changes must relocate the
 * canonical note rather than strand it at the old address or duplicate it.
 */

import { TFile, TFolder } from 'obsidian';
import { buildNoteContent, generateFromRecipe } from '../src/generation/generation-engine';
import type { Recipe } from '../src/render';
import type { ParsedData } from '../src/types/config';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const yaml = require('js-yaml') as { load: (text: string) => unknown };

const CURIE = 'xwalk:edge-1';
const OLD_PATH = 'Mappings/legacy/edge-1.md';
const NEW_PATH = 'Mappings/set-new/edge-1.md';

const RECIPE: Recipe = {
	recipe: 'crosswalk-edge-identity-test',
	source: { ontology: 'xwalk', levels: ['edge'] },
	target: {
		layout: [{
			level: 'edge',
			mechanism: 'file',
			template: 'set-new/{edge_id}.md',
			kind: 'crosswalk-edge',
		}],
		also_emit: {
			frontmatter: {
				managed: {
					subject_id: '{subject_id}',
					predicate_id: '{predicate_id}',
					object_id: '{object_id}',
				},
			},
		},
	},
};

const ROW = {
	edge_id: 'edge-1',
	subject_id: 'nist:AC-2',
	predicate_id: 'is_equivalent_to',
	object_id: 'iso27001:A.9.2.1',
};

function parsed(): ParsedData {
	return { columns: Object.keys(ROW), rows: [{ ...ROW }], rowCount: 1 };
}

function generatedCrosswalkContent(): string {
	return buildNoteContent({
		curie: CURIE,
		kind: 'crosswalk-edge',
		subject_id: ROW.subject_id,
		predicate_id: ROW.predicate_id,
		object_id: ROW.object_id,
		_crosswalker: {
			spec_version: 'https://crosswalker.dev/spec/tier1.schema.json',
			source_ref: { curie: 'unknown:_' },
			produced_at: '2026-08-21T00:00:00.000Z',
			recipe: { id: RECIPE.recipe },
		},
	}, '# Existing crosswalk\n');
}

function makeApp(seedPaths: string[]) {
	const files = new Map<string, string>();
	const folders = new Set<string>(['', 'Mappings', 'Mappings/legacy']);
	for (const path of seedPaths) files.set(path, generatedCrosswalkContent());
	const renameFile = jest.fn(async (file: TFile, newPath: string) => {
		const content = files.get(file.path);
		if (content === undefined) throw new Error(`Missing source file: ${file.path}`);
		files.delete(file.path);
		files.set(newPath, content);
		file.path = newPath;
	});
	const app = {
		vault: {
			getMarkdownFiles: () => [...files.keys()].map((path) => new TFile(path)),
			getAbstractFileByPath: (path: string) => {
				if (files.has(path)) return new TFile(path);
				if (folders.has(path)) return new TFolder(path);
				return null;
			},
			create: async (path: string, content: string) => {
				files.set(path, content);
				return new TFile(path);
			},
			modify: async (file: TFile, content: string) => {
				files.set(file.path, content);
			},
			read: async (file: TFile) => files.get(file.path) ?? '',
			createFolder: async (path: string) => { folders.add(path); },
		},
		fileManager: { renameFile },
		metadataCache: {
			getFileCache: (file: TFile) => {
				const content = files.get(file.path);
				if (!content) return null;
				const match = /^---\n([\s\S]*?)\n---/.exec(content.replace(/\r\n/g, '\n'));
				return { frontmatter: match ? (yaml.load(match[1]) as Record<string, unknown>) : {} };
			},
		},
	};
	return { app: app as any, files, renameFile };
}

const OPTIONS = {
	basePath: 'Mappings',
	overwriteMode: 'replace' as const,
	createFolders: true,
	curiePrefix: 'xwalk',
	curieLocalPart: () => 'edge-1',
};

describe('generateFromRecipe identity reconciliation', () => {
	it('moves a crosswalk note whose rendered address changed instead of duplicating it', async () => {
		const { app, files, renameFile } = makeApp([OLD_PATH]);

		const result = await generateFromRecipe(app, parsed(), RECIPE, OPTIONS);

		expect(result.errors).toEqual([]);
		expect(result.moved).toEqual([{ curie: CURIE, from: OLD_PATH, to: NEW_PATH }]);
		expect(renameFile).toHaveBeenCalledTimes(1);
		expect(files.has(OLD_PATH)).toBe(false);
		expect(files.has(NEW_PATH)).toBe(true);
		expect(files.size).toBe(1);
	});

	it('does not move an identity under skip mode', async () => {
		const { app, files, renameFile } = makeApp([OLD_PATH]);

		const result = await generateFromRecipe(app, parsed(), RECIPE, {
			...OPTIONS,
			overwriteMode: 'skip',
		});

		expect(result.errors).toEqual([]);
		expect(result.moved).toBeUndefined();
		expect(renameFile).not.toHaveBeenCalled();
		expect(files.has(OLD_PATH)).toBe(true);
		expect(files.has(NEW_PATH)).toBe(false);
		expect(files.size).toBe(1);
	});

	it('reports ambiguous identity and does not pick a note to move', async () => {
		const otherPath = 'Mappings/duplicate/edge-1.md';
		const { app, files, renameFile } = makeApp([OLD_PATH, otherPath]);

		const result = await generateFromRecipe(app, parsed(), RECIPE, OPTIONS);

		expect(result.success).toBe(false);
		expect(result.errors).toEqual([{
			row: 0,
			message: `Ambiguous identity ${CURIE} claimed by: ${otherPath}, ${OLD_PATH}`,
		}]);
		expect(result.created).toEqual([]);
		expect(renameFile).not.toHaveBeenCalled();
		expect(files.has(OLD_PATH)).toBe(true);
		expect(files.has(otherPath)).toBe(true);
		expect(files.has(NEW_PATH)).toBe(false);
	});
});
