/**
 * entry-points.test.ts — pure-logic coverage for the non-command-palette
 * discovery surfaces (file-menu extension filtering, status bar ontology
 * count derivation, first-run/update notice gate).
 */

import {
	IMPORTABLE_EXTENSIONS,
	isImportableExtension,
	countTopLevelOntologyFolders,
	formatOntologyStatusLabel,
	checkFirstRun,
	type TopLevelEntry,
} from '../src/ui/entry-points';

describe('isImportableExtension', () => {
	it('accepts every extension in IMPORTABLE_EXTENSIONS', () => {
		for (const ext of IMPORTABLE_EXTENSIONS) {
			expect(isImportableExtension(ext)).toBe(true);
		}
	});

	it('is case-insensitive', () => {
		expect(isImportableExtension('CSV')).toBe(true);
		expect(isImportableExtension('Xlsx')).toBe(true);
		expect(isImportableExtension('JSON')).toBe(true);
	});

	it('rejects extensions the wizard cannot read', () => {
		expect(isImportableExtension('md')).toBe(false);
		expect(isImportableExtension('pdf')).toBe(false);
		expect(isImportableExtension('')).toBe(false);
		expect(isImportableExtension('txt')).toBe(false);
	});
});

describe('countTopLevelOntologyFolders', () => {
	it('counts only folders, ignoring files', () => {
		const entries: TopLevelEntry[] = [
			{ name: 'NIST-CSF', isFolder: true },
			{ name: 'MITRE-ATTACK', isFolder: true },
			{ name: 'readme.md', isFolder: false },
		];
		expect(countTopLevelOntologyFolders(entries)).toBe(2);
	});

	it('returns 0 for an empty list', () => {
		expect(countTopLevelOntologyFolders([])).toBe(0);
	});

	it('returns 0 when the output folder has files but no subfolders', () => {
		const entries: TopLevelEntry[] = [
			{ name: 'notes.md', isFolder: false },
			{ name: 'index.md', isFolder: false },
		];
		expect(countTopLevelOntologyFolders(entries)).toBe(0);
	});
});

describe('formatOntologyStatusLabel', () => {
	it('uses a no-ontologies message at zero', () => {
		expect(formatOntologyStatusLabel(0)).toBe('Crosswalker: no ontologies yet');
	});

	it('uses singular "ontology" at exactly one', () => {
		expect(formatOntologyStatusLabel(1)).toBe('Crosswalker: 1 ontology');
	});

	it('uses plural "ontologies" for counts above one', () => {
		expect(formatOntologyStatusLabel(2)).toBe('Crosswalker: 2 ontologies');
		expect(formatOntologyStatusLabel(15)).toBe('Crosswalker: 15 ontologies');
	});

	it('never contains an em dash', () => {
		expect(formatOntologyStatusLabel(0)).not.toContain('—');
		expect(formatOntologyStatusLabel(3)).not.toContain('—');
	});
});

describe('checkFirstRun', () => {
	it('shows on a fresh install (no recorded version)', () => {
		expect(checkFirstRun(null, '0.1.6')).toEqual({ shouldShow: true, reason: 'first-install' });
		expect(checkFirstRun(undefined, '0.1.6')).toEqual({ shouldShow: true, reason: 'first-install' });
		expect(checkFirstRun('', '0.1.6')).toEqual({ shouldShow: true, reason: 'first-install' });
	});

	it('shows once after an update (version changed)', () => {
		expect(checkFirstRun('0.1.5', '0.1.6')).toEqual({ shouldShow: true, reason: 'version-changed' });
	});

	it('does not show again for the same version', () => {
		expect(checkFirstRun('0.1.6', '0.1.6')).toEqual({ shouldShow: false, reason: 'already-seen' });
	});
});
