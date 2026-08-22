import { TFile } from 'obsidian';
import {
	CURRENT_IMPORT_SET_SCHEME,
	ImportSetProvenanceError,
	MultipleImportSetsError,
	discoverImportSets,
	mintImportSetId,
	resolveImportSet,
} from '../src/generation/import-set';

interface Stamp {
	id?: string;
	scheme?: string;
	raw?: unknown;
}

function mockApp(notes: Record<string, Stamp | null>) {
	const files = Object.keys(notes).map((path) => new TFile(path));
	return {
		vault: { getMarkdownFiles: () => files },
		metadataCache: {
			getFileCache: (file: { path: string }) => {
				const stamp = notes[file.path];
				if (stamp === null) return { frontmatter: { curie: 'legacy:X', _crosswalker: {} } };
				const importSet = stamp.raw !== undefined
					? stamp.raw
					: { id: stamp.id, scheme: stamp.scheme };
				return { frontmatter: { _crosswalker: { import_set: importSet } } };
			},
		},
	} as any;
}

describe('import-set ownership discovery and selection', () => {
	it('ignores unstamped legacy notes and scopes discovery to the destination', () => {
		const app = mockApp({
			'Frameworks/legacy.md': null,
			'Frameworks/A.md': { id: 'iset-abc123', scheme: 'endpoint-v1' },
			'Frameworks/Sub/B.md': { id: 'iset-abc123', scheme: 'endpoint-v1' },
			'Other/C.md': { id: 'iset-def456', scheme: 'endpoint-v1' },
		});

		expect(discoverImportSets(app, 'Frameworks')).toEqual([{
			id: 'iset-abc123',
			scheme: CURRENT_IMPORT_SET_SCHEME,
			noteCount: 2,
			paths: ['Frameworks/A.md', 'Frameworks/Sub/B.md'],
		}]);
	});

	it('defaults to the sole destination set and rejects an ambiguous destination', () => {
		const one = mockApp({
			'Frameworks/A.md': { id: 'iset-abc123', scheme: 'endpoint-v1' },
		});
		expect(resolveImportSet(one, 'Frameworks')).toEqual({ id: 'iset-abc123', scheme: 'endpoint-v1' });

		const many = mockApp({
			'Frameworks/A.md': { id: 'iset-abc123', scheme: 'endpoint-v1' },
			'Frameworks/B.md': { id: 'iset-def456', scheme: 'endpoint-v1' },
		});
		expect(() => resolveImportSet(many, 'Frameworks')).toThrow(MultipleImportSetsError);
		try {
			resolveImportSet(many, 'Frameworks');
		} catch (error) {
			expect((error as MultipleImportSetsError).sets.map((set) => [set.id, set.noteCount])).toEqual([
				['iset-abc123', 1],
				['iset-def456', 1],
			]);
		}
	});

	it('allows explicit empty-set refresh and new-set minting', () => {
		const app = mockApp({
			'Other/A.md': { id: 'iset-abc123', scheme: 'endpoint-v1' },
		});
		expect(resolveImportSet(app, 'Frameworks', { id: 'iset-zzzz99' })).toEqual({
			id: 'iset-zzzz99', scheme: 'endpoint-v1',
		});
		expect(resolveImportSet(app, 'Frameworks', 'new')).toEqual({
			id: expect.stringMatching(/^iset-[a-z0-9]{6}$/), scheme: 'endpoint-v1',
		});
		expect(resolveImportSet(app, 'Frameworks', 'new-set-qualified')).toEqual({
			id: expect.stringMatching(/^iset-[a-z0-9]{6}$/), scheme: 'set-qualified-v1',
		});
	});

	it('reports every path when one set disagrees on scheme', () => {
		const app = mockApp({
			'Frameworks/A.md': { id: 'iset-abc123', scheme: 'endpoint-v1' },
			'Frameworks/B.md': { id: 'iset-abc123', scheme: 'set-qualified-v1' },
		});
		expect(() => discoverImportSets(app, 'Frameworks')).toThrow(ImportSetProvenanceError);
		try {
			discoverImportSets(app, 'Frameworks');
		} catch (error) {
			expect((error as ImportSetProvenanceError).paths).toEqual([
				'Frameworks/A.md',
				'Frameworks/B.md',
			]);
		}
	});

	it('accepts a set whose fixed scheme is known but is not the default', () => {
		const app = mockApp({
			'Frameworks/A.md': { id: 'iset-abc123', scheme: 'set-qualified-v1' },
			'Frameworks/B.md': { id: 'iset-abc123', scheme: 'set-qualified-v1' },
		});

		expect(discoverImportSets(app, 'Frameworks')).toEqual([{
			id: 'iset-abc123',
			scheme: 'set-qualified-v1',
			noteCount: 2,
			paths: ['Frameworks/A.md', 'Frameworks/B.md'],
		}]);
		expect(resolveImportSet(app, 'Frameworks', { id: 'iset-abc123' })).toEqual({
			id: 'iset-abc123', scheme: 'set-qualified-v1',
		});
	});

	it('refuses to change an existing set scheme during refresh', () => {
		const app = mockApp({
			'Frameworks/A.md': { id: 'iset-abc123', scheme: 'endpoint-v1' },
		});

		expect(() => resolveImportSet(app, 'Frameworks', {
			id: 'iset-abc123', scheme: 'set-qualified-v1',
		})).toThrow(/refresh cannot change/);
	});


	it('rejects a set whose single scheme is not in the closed enum', () => {
		const app = mockApp({
			'Frameworks/A.md': { id: 'iset-abc123', scheme: 'future-v1' },
		});
		expect(() => discoverImportSets(app, 'Frameworks')).toThrow(/unsupported schemes/);
	});

	it('does not let malformed provenance for an unrelated set block an explicit refresh', () => {
		const app = mockApp({
			'Frameworks/A.md': { id: 'iset-abc123', scheme: 'endpoint-v1' },
			'Other/bad.md': { raw: { id: 'not-valid', scheme: 'future-v1' } },
		});
		expect(resolveImportSet(app, 'Frameworks', { id: 'iset-abc123' })).toEqual({
			id: 'iset-abc123', scheme: 'endpoint-v1',
		});
	});

	it('uses secure random bytes and retries a colliding id', () => {
		let call = 0;
		const spy = jest.spyOn(globalThis.crypto, 'getRandomValues').mockImplementation(((array: Uint8Array) => {
			array.fill(call++);
			return array;
		}) as typeof globalThis.crypto.getRandomValues);
		try {
			expect(mintImportSetId(new Set(['iset-aaaaaa']))).toBe('iset-bbbbbb');
			expect(spy).toHaveBeenCalledTimes(2);
		} finally {
			spy.mockRestore();
		}
	});
});
