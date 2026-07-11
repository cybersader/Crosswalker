/**
 * workspace-view-helpers.test.ts — pure logic for the Crosswalker workspace
 * view's "Installed ontologies" section (spec §7n).
 */

import { deriveInstalledOntologies, type MinimalVaultNode } from '../src/views/workspace-view-helpers';

describe('deriveInstalledOntologies', () => {
	it('returns an empty array when the output root does not exist or has no children', () => {
		expect(deriveInstalledOntologies(null)).toEqual([]);
		expect(deriveInstalledOntologies({ path: 'Ontologies', name: 'Ontologies' })).toEqual([]);
	});

	it('summarizes each top-level subfolder with a recursive markdown note count, skipping loose files', () => {
		const root: MinimalVaultNode = {
			path: 'Ontologies',
			name: 'Ontologies',
			children: [
				{
					path: 'Ontologies/NIST-mini',
					name: 'NIST-mini',
					children: [
						{ path: 'Ontologies/NIST-mini/GV.md', name: 'GV.md', producerKind: 'plugin-engine' },
						{
							path: 'Ontologies/NIST-mini/GV.OC',
							name: 'GV.OC',
							children: [
								{ path: 'Ontologies/NIST-mini/GV.OC/GV.OC-01.md', name: 'GV.OC-01.md', producerKind: 'plugin-engine' },
							],
						},
					],
				},
				{ path: 'Ontologies/loose-note.md', name: 'loose-note.md', producerKind: 'plugin-engine' },
			],
		};

		expect(deriveInstalledOntologies(root)).toEqual([
			{ name: 'NIST-mini', path: 'Ontologies/NIST-mini', noteCount: 2 },
		]);
	});

	it('sorts results alphabetically by name', () => {
		const root: MinimalVaultNode = {
			path: 'Ontologies',
			name: 'Ontologies',
			children: [
				{ path: 'Ontologies/ZFramework', name: 'ZFramework', children: [{ path: 'x', name: 'x.md', producerKind: 'plugin-engine' }] },
				{ path: 'Ontologies/AFramework', name: 'AFramework', children: [{ path: 'y', name: 'y.md', producerKind: 'plugin-engine' }] },
			],
		};

		expect(deriveInstalledOntologies(root).map((s) => s.name)).toEqual(['AFramework', 'ZFramework']);
	});

	// -- GENERATED-content filter (spec §7m "home-screen polish", 2026-07-11) --

	it('omits a folder whose notes carry no `_crosswalker` producer frontmatter at all', () => {
		const root: MinimalVaultNode = {
			path: 'Frameworks',
			name: 'Frameworks',
			children: [
				{ path: 'Frameworks/Scratch', name: 'Scratch', children: [{ path: 'Frameworks/Scratch/note.md', name: 'note.md' }] },
			],
		};
		expect(deriveInstalledOntologies(root)).toEqual([]);
	});

	it('omits a curated/fixture corpus whose notes are `_crosswalker`-tagged but produced by `external-cli`, not the plugin (e.g. NIST-mini)', () => {
		const root: MinimalVaultNode = {
			path: 'Frameworks',
			name: 'Frameworks',
			children: [
				{
					path: 'Frameworks/NIST-mini',
					name: 'NIST-mini',
					children: [{ path: 'Frameworks/NIST-mini/AC-1.md', name: 'AC-1.md', producerKind: 'external-cli' }],
				},
			],
		};
		expect(deriveInstalledOntologies(root)).toEqual([]);
	});

	it('omits underscore-prefixed folders outright, even when they contain plugin-engine notes (e.g. `_licensed`)', () => {
		const root: MinimalVaultNode = {
			path: 'Frameworks',
			name: 'Frameworks',
			children: [
				{
					path: 'Frameworks/_licensed',
					name: '_licensed',
					children: [{ path: 'Frameworks/_licensed/CIS-v8/1.1.md', name: '1.1.md', producerKind: 'plugin-engine' }],
				},
			],
		};
		expect(deriveInstalledOntologies(root)).toEqual([]);
	});

	it('includes a folder as soon as ANY note beneath it (however deep) was produced by the plugin engine', () => {
		const root: MinimalVaultNode = {
			path: 'Frameworks',
			name: 'Frameworks',
			children: [
				{
					path: 'Frameworks/MITRE ATT&CK',
					name: 'MITRE ATT&CK',
					children: [
						{ path: 'Frameworks/MITRE ATT&CK/T1055.md', name: 'T1055.md' }, // no _crosswalker — user-added
						{
							path: 'Frameworks/MITRE ATT&CK/T1055',
							name: 'T1055',
							children: [
								{ path: 'Frameworks/MITRE ATT&CK/T1055/T1055.011.md', name: 'T1055.011.md', producerKind: 'plugin-engine' },
							],
						},
					],
				},
			],
		};
		expect(deriveInstalledOntologies(root)).toEqual([
			{ name: 'MITRE ATT&CK', path: 'Frameworks/MITRE ATT&CK', noteCount: 2 },
		]);
	});
});
