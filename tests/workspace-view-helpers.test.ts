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
						{ path: 'Ontologies/NIST-mini/GV.md', name: 'GV.md' },
						{
							path: 'Ontologies/NIST-mini/GV.OC',
							name: 'GV.OC',
							children: [{ path: 'Ontologies/NIST-mini/GV.OC/GV.OC-01.md', name: 'GV.OC-01.md' }],
						},
					],
				},
				{ path: 'Ontologies/loose-note.md', name: 'loose-note.md' },
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
				{ path: 'Ontologies/ZFramework', name: 'ZFramework', children: [{ path: 'x', name: 'x.md' }] },
				{ path: 'Ontologies/AFramework', name: 'AFramework', children: [{ path: 'y', name: 'y.md' }] },
			],
		};

		expect(deriveInstalledOntologies(root).map((s) => s.name)).toEqual(['AFramework', 'ZFramework']);
	});
});
