/**
 * identity-index.test.ts — the reconciliation primitive (Sprint R1, 2026-08-21).
 *
 * Pins the properties the "re-import is identity reconciliation" decision rests on:
 * a note is found by its curie wherever it sits, user notes are structurally
 * unreachable, ambiguous identity is reported rather than silently resolved, and a
 * changed address produces a MOVE rather than a duplicate.
 */

import { TFile } from 'obsidian';
import { buildIdentityIndex, reconcile } from '../src/generation/identity-index';

interface MockNote {
	curie?: string;
	generated?: boolean;
	recipeId?: string;
	importSetId?: string;
}

function mockApp(files: Record<string, MockNote>) {
	const tfiles = Object.keys(files).map((p) => {
		const f = new TFile(p);
		f.path = p;
		return f;
	});
	return {
		vault: { getMarkdownFiles: () => tfiles },
		metadataCache: {
			getFileCache: (f: { path: string }) => {
				const note = files[f.path];
				const frontmatter: Record<string, unknown> = {};
				if (note.curie) frontmatter.curie = note.curie;
				if (note.generated !== false) {
					frontmatter._crosswalker = {
						...(note.recipeId ? { recipe: { id: note.recipeId } } : {}),
						...(note.importSetId ? { import_set: { id: note.importSetId, scheme: 'endpoint-v1' } } : {}),
					};
				}
				return { frontmatter };
			},
		},
	} as any;
}

describe('buildIdentityIndex', () => {
	it('finds a generated note by curie regardless of where it sits', () => {
		const app = mockApp({ 'Wherever/Deep/AC-2.md': { curie: 'nist:AC-2' } });
		const index = buildIdentityIndex(app);
		expect(index.get('nist:AC-2')?.path).toBe('Wherever/Deep/AC-2.md');
		expect(index.size).toBe(1);
	});

	it('ignores notes a user wrote by hand, so reconciliation cannot reach them', () => {
		const app = mockApp({
			'My notes/Thoughts.md': { curie: 'nist:AC-2', generated: false },
			'Frameworks/AC-2.md': { curie: 'nist:AC-2' },
		});
		const index = buildIdentityIndex(app);
		// The hand-written note claims the same curie but carries no provenance,
		// so it is invisible here and is neither moved nor counted as a collision.
		expect(index.get('nist:AC-2')?.path).toBe('Frameworks/AC-2.md');
		expect(index.collisions).toEqual([]);
	});

	it('skips generated notes that carry no curie', () => {
		const app = mockApp({ 'Frameworks/Hub.md': {} });
		expect(buildIdentityIndex(app).size).toBe(0);
	});

	it('reports an ambiguous curie instead of silently choosing', () => {
		const app = mockApp({
			'A/AC-2.md': { curie: 'nist:AC-2' },
			'B/AC-2.md': { curie: 'nist:AC-2' },
		});
		const index = buildIdentityIndex(app);
		expect(index.collisions).toEqual([{ curie: 'nist:AC-2', paths: ['A/AC-2.md', 'B/AC-2.md'] }]);
	});

	it('scopes ownership to one import set while retaining recipe filtering for compatibility', () => {
		const app = mockApp({
			'Frameworks/AC-2.md': { curie: 'nist:AC-2', recipeId: 'nist-flat', importSetId: 'iset-abc123' },
			'Other/X-1.md': { curie: 'other:X-1', recipeId: 'other-recipe', importSetId: 'iset-def456' },
		});
		expect(buildIdentityIndex(app, { importSetId: 'iset-abc123' }).curies()).toEqual(['nist:AC-2']);
		expect(buildIdentityIndex(app, { recipeId: 'nist-flat' }).curies()).toEqual(['nist:AC-2']);
	});

	it('import-set ownership takes precedence over the deprecated recipe filter', () => {
		const app = mockApp({
			'Frameworks/stamped.md': { curie: 'nist:STAMPED', recipeId: 'new-recipe', importSetId: 'iset-abc123' },
			'Frameworks/legacy.md': { curie: 'nist:LEGACY', recipeId: 'old-recipe' },
		});
		const index = buildIdentityIndex(app, { importSetId: 'iset-abc123', recipeId: 'old-recipe' });
		expect(index.curies()).toEqual(['nist:STAMPED']);
	});
});

describe('reconcile', () => {
	const app = mockApp({ 'Old/Layout/AC-2.md': { curie: 'nist:AC-2' } });
	const index = buildIdentityIndex(app);

	it('creates when the vault has never seen this identity', () => {
		expect(reconcile(index, 'nist:NEW-1', 'New/NEW-1.md').action).toBe('create');
	});

	it('merges in place when the note is already at the desired address', () => {
		expect(reconcile(index, 'nist:AC-2', 'Old/Layout/AC-2.md').action).toBe('merge-in-place');
	});

	it('MOVES rather than duplicating when the desired address changed', () => {
		const r = reconcile(index, 'nist:AC-2', 'New/Layout/AC-2.md');
		expect(r.action).toBe('move-then-merge');
		expect(r.existingFile?.path).toBe('Old/Layout/AC-2.md');
		expect(r.writePath).toBe('New/Layout/AC-2.md');
	});

	it('leaves a note alone at an address Crosswalker itself chose', () => {
		// Enrichment relocates concepts to a folder-note shape on purpose. Moving
		// such a note back would fight the pass that deliberately put it there.
		const r = reconcile(index, 'nist:AC-2', 'New/AC-2.md', (current) => current === 'Old/Layout/AC-2.md');
		expect(r.action).toBe('keep-in-place');
		expect(r.writePath).toBe('Old/Layout/AC-2.md');
	});
});
