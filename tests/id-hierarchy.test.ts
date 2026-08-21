/**
 * id-hierarchy.test.ts — deriving a folder tree by PARSING a taxonomy id, in
 * the wizard path (2026-06-13). The headline value prop: a flat id column like
 * `element_identifier` ("DE.AE-02") becomes nested folders `DE/ → DE.AE/` with
 * the full id as the leaf note — no separate hierarchy columns needed.
 */

import { TFile, TFolder } from 'obsidian';
import {
	deriveIdSplitTemplates,
	buildConfigFromWizardState,
	generateNotes,
} from '../src/generation/generation-engine';

describe('deriveIdSplitTemplates', () => {
	it('decomposes CSF subcategory ids into . then - folder levels', () => {
		expect(deriveIdSplitTemplates('element_identifier', ['DE.AE-02', 'GV.OC-01', 'PR.AA-05'])).toEqual([
			'{element_identifier|split(.,0)}',
			'{element_identifier|split(-,0)}',
		]);
	});

	it('handles a single-delimiter id (AC-2 → one folder level)', () => {
		expect(deriveIdSplitTemplates('id', ['AC-1', 'AU-2', 'CM-10'])).toEqual(['{id|split(-,0)}']);
	});

	it('handles MITRE-style dotted ids', () => {
		expect(deriveIdSplitTemplates('tech', ['T1055.011', 'T1059', 'T1003.001'])).toEqual(['{tech|split(.,0)}']);
	});

	it('returns [] when values have no consistent delimiter (plain names)', () => {
		expect(deriveIdSplitTemplates('name', ['Policy', 'Accounts', 'Flow'])).toEqual([]);
	});

	it('ignores a delimiter that appears in only a few values (80% threshold)', () => {
		// only 1 of 5 has a dot → not a structural delimiter
		expect(deriveIdSplitTemplates('id', ['AC1', 'AC2', 'AC3', 'AC4', 'A.5'])).toEqual([]);
	});
});

describe('buildConfigFromWizardState — folder-tree role', () => {
	it('emits split folder templates + uses the id as the leaf filename', () => {
		const cols = new Map<string, any>([
			['element_identifier', { useAs: 'folder-tree', outputKey: 'element_identifier', folderTemplates: ['{element_identifier|split(.,0)}', '{element_identifier|split(-,0)}'] }],
			['text', { useAs: 'body', outputKey: 'text' }],
		]);
		const config = buildConfigFromWizardState(cols, ['element_identifier', 'text']);
		expect(config.mapping?.hierarchy).toEqual([
			{ column: 'element_identifier', level: 1, template: '{element_identifier|split(.,0)}' },
			{ column: 'element_identifier', level: 2, template: '{element_identifier|split(-,0)}' },
		]);
		expect(config.mapping?.filename).toEqual({ template: '{element_identifier}', sanitize: true });
	});

	it('an explicit title column still wins for the filename', () => {
		const cols = new Map<string, any>([
			['id', { useAs: 'folder-tree', outputKey: 'id', folderTemplates: ['{id|split(-,0)}'] }],
			['name', { useAs: 'title', outputKey: 'name' }],
		]);
		const config = buildConfigFromWizardState(cols, ['id', 'name']);
		expect(config.mapping?.filename).toEqual({ template: '{name}', sanitize: true });
	});
});

describe('generateNotes — id → nested folder tree (end-to-end)', () => {
	function makeVaultApp() {
		const files = new Map<string, string>();
		const folders = new Set<string>();
		const app = {
			vault: {
				// generateNotes resolves existing notes by identity, which reads the
				// vault markdown list. This double has no pre-existing notes.
				getMarkdownFiles: () => [],
				getAbstractFileByPath: (p: string) =>
					folders.has(p) ? new TFolder(p) : files.has(p) ? new TFile(p) : null,
				create: async (p: string, c: string) => { files.set(p, c); return new TFile(p); },
				modify: async (f: any, c: string) => { files.set(f.path, c); },
				read: async (f: any) => files.get(f.path) ?? '',
				createFolder: async (p: string) => { folders.add(p); },
			},
		};
		return { app, files, folders };
	}

	it('parses element_identifier into DE/ → DE.AE/ → DE.AE-02.md', async () => {
		const rows = [
			{ element_identifier: 'DE.AE-02', text: 'Adverse events analyzed' },
			{ element_identifier: 'DE.AE-03', text: 'Information correlated' },
			{ element_identifier: 'GV.OC-01', text: 'Mission understood' },
		];
		const cols = new Map<string, any>([
			['element_identifier', {
				useAs: 'folder-tree', outputKey: 'element_identifier',
				folderTemplates: deriveIdSplitTemplates('element_identifier', rows.map((r) => r.element_identifier)),
			}],
			['text', { useAs: 'body', outputKey: 'text' }],
		]);
		const config = buildConfigFromWizardState(cols, ['element_identifier', 'text']);

		const { app, files } = makeVaultApp();
		const result = await generateNotes(app as any, { columns: ['element_identifier', 'text'], rows, rowCount: 3 } as any, config as any, { basePath: 'CSF', overwriteMode: 'skip', createFolders: true } as any);

		expect(result.errors).toEqual([]);
		expect([...files.keys()].sort()).toEqual([
			'CSF/DE/DE.AE/DE.AE-02.md',
			'CSF/DE/DE.AE/DE.AE-03.md',
			'CSF/GV/GV.OC/GV.OC-01.md',
		]);
	});
});
