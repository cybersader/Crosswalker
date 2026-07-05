/**
 * reset-imports.test.ts — the in-Obsidian "Reset imported notes (dev)" command's
 * scan/grouping logic (2026-06-13). Pins that it finds only Crosswalker-generated
 * notes, groups them by output folder, and flags the curated corpus as protected
 * (not one-click-deletable) — the same protected list the CLI `bun run reset` uses.
 */

import { TFile } from 'obsidian';
import { scanGeneratedImports, isProtectedPath, deleteImportedNotes } from '../src/views/reset-imports';

function mockApp(files: Record<string, { generated: boolean }>) {
	const tfiles = Object.keys(files).map((p) => {
		const f = new TFile(p);
		f.path = p;
		return f;
	});
	const trashed: string[] = [];
	const app: any = {
		vault: {
			getMarkdownFiles: () => tfiles,
			cachedRead: async (f: any) => (files[f.path].generated ? '_crosswalker:\n  spec_version: x' : '# plain note'),
			getAbstractFileByPath: (p: string) => tfiles.find((f) => f.path === p) ?? null,
		},
		metadataCache: {
			getFileCache: (f: any) => ({ frontmatter: files[f.path].generated ? { _crosswalker: {} } : {} }),
		},
		fileManager: {
			trashFile: async (f: any) => { trashed.push(f.path); },
		},
	};
	return { app, trashed };
}

describe('isProtectedPath', () => {
	it('protects the curated corpus / fixtures / views', () => {
		expect(isProtectedPath('Frameworks/_licensed/SCF/GOV-01.md')).toBe(true);
		expect(isProtectedPath('Frameworks/NIST-mini/AC-1.md')).toBe(true);
		expect(isProtectedPath('_crosswalker/mappings/x/cw-a--b.md')).toBe(true);
		expect(isProtectedPath('GRC analysis/Control lens/Control lens.md')).toBe(true);
	});
	it('does not protect ad-hoc import folders', () => {
		expect(isProtectedPath('Frameworks/DE.AE-02.md')).toBe(false);
		expect(isProtectedPath('Ontologies/T1055.md')).toBe(false);
		expect(isProtectedPath('Frameworks/_demo/X.md')).toBe(false);
	});
});

describe('scanGeneratedImports', () => {
	it('finds only generated notes, groups by folder, flags corpus as protected', async () => {
		const { app } = mockApp({
			'Frameworks/DE.AE-02.md': { generated: true },
			'Frameworks/DE.AE-03.md': { generated: true },
			'Frameworks/hand-written.md': { generated: false },       // not generated → ignored
			'Frameworks/_licensed/SCF/GOV-01.md': { generated: true }, // corpus → protected
			'_crosswalker/mappings/m/cw-a--b.md': { generated: true }, // corpus → protected
			'README.md': { generated: false },
		});
		const groups = await scanGeneratedImports(app);

		const byFolder = Object.fromEntries(groups.map((g) => [g.folder, g]));
		// Deletable test import in Frameworks/ root
		expect(byFolder['Frameworks'].count).toBe(2);
		expect(byFolder['Frameworks'].protected).toBe(false);
		// Corpus groups flagged protected
		expect(byFolder['Frameworks/_licensed'].protected).toBe(true);
		expect(byFolder['_crosswalker/mappings'].protected).toBe(true);
		// Hand-written + non-md never appear
		expect(groups.flatMap((g) => g.paths)).not.toContain('Frameworks/hand-written.md');
		// Protected groups sort last
		expect(groups[0].protected).toBe(false);
	});
});

describe('deleteImportedNotes', () => {
	it('trashes exactly the given paths', async () => {
		const { app, trashed } = mockApp({
			'Frameworks/A.md': { generated: true },
			'Frameworks/B.md': { generated: true },
		});
		const n = await deleteImportedNotes(app, ['Frameworks/A.md', 'Frameworks/B.md']);
		expect(n).toBe(2);
		expect(trashed.sort()).toEqual(['Frameworks/A.md', 'Frameworks/B.md']);
	});
});
