import * as Obsidian from 'obsidian';
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

function mockApp(notes: Record<string, Stamp | null>, rawContents: Record<string, string> = {}) {
	const paths = Array.from(new Set([...Object.keys(notes), ...Object.keys(rawContents)]));
	const files = paths.map((path) => new TFile(path));
	const cachedRead = jest.fn(async (file: { path: string }) => rawContents[file.path] ?? '');
	return {
		vault: {
			getMarkdownFiles: () => files,
			cachedRead,
		},
		metadataCache: {
			getFileCache: (file: { path: string }) => {
				if (Object.prototype.hasOwnProperty.call(rawContents, file.path)) return undefined;
				const stamp = notes[file.path];
				if (stamp === null) return { frontmatter: { curie: 'legacy:X', _crosswalker: {} } };
				if (stamp === undefined) return undefined;
				const importSet = stamp.raw !== undefined
					? stamp.raw
					: { id: stamp.id, scheme: stamp.scheme };
				return { frontmatter: { _crosswalker: { import_set: importSet } } };
			},
		},
	} as any;
}

function rawStampedNote(id: string, scheme = 'endpoint-v1'): string {
	return `---\n_crosswalker:\n  import_set:\n    id: ${id}\n    scheme: ${scheme}\n---\n# Generated\n`;
}

describe('import-set ownership discovery and selection', () => {
	it('ignores unstamped legacy notes and scopes discovery to the destination', async () => {
		const app = mockApp({
			'Frameworks/legacy.md': null,
			'Frameworks/A.md': { id: 'iset-abc123', scheme: 'endpoint-v1' },
			'Frameworks/Sub/B.md': { id: 'iset-abc123', scheme: 'endpoint-v1' },
			'Other/C.md': { id: 'iset-def456', scheme: 'endpoint-v1' },
		});

		await expect(discoverImportSets(app, 'Frameworks')).resolves.toEqual([{
			id: 'iset-abc123',
			scheme: CURRENT_IMPORT_SET_SCHEME,
			noteCount: 2,
			paths: ['Frameworks/A.md', 'Frameworks/Sub/B.md'],
		}]);
	});

	it('discovers a destination note whose metadata cache is not warm', async () => {
		const app = mockApp({}, {
			'Frameworks/A.md': rawStampedNote('iset-abc123'),
		});

		await expect(discoverImportSets(app, 'Frameworks')).resolves.toEqual([{
			id: 'iset-abc123',
			scheme: 'endpoint-v1',
			noteCount: 1,
			paths: ['Frameworks/A.md'],
		}]);
		expect(app.vault.cachedRead).toHaveBeenCalledTimes(1);
	});

	it('reuses the first import id on an immediate cache-cold re-import', async () => {
		const files: TFile[] = [];
		const contents = new Map<string, string>();
		const app = {
			vault: {
				getMarkdownFiles: () => files,
				cachedRead: jest.fn(async (file: { path: string }) => contents.get(file.path) ?? ''),
			},
			metadataCache: { getFileCache: () => undefined },
		} as any;

		const first = await resolveImportSet(app, 'Frameworks');
		files.push(new TFile('Frameworks/A.md'));
		contents.set('Frameworks/A.md', rawStampedNote(first.id, first.scheme));

		await expect(resolveImportSet(app, 'Frameworks')).resolves.toEqual(first);
	});

	it('throws a provenance error with the path for malformed cache-cold YAML', async () => {
		const app = mockApp({}, {
			'Frameworks/bad.md': '---\n_crosswalker: [\n---\n',
		});
		const parseSpy = jest.spyOn(Obsidian, 'parseYaml').mockImplementationOnce(() => {
			throw new Error('bad YAML');
		});
		try {
			await expect(discoverImportSets(app, 'Frameworks')).rejects.toMatchObject({
				name: 'ImportSetProvenanceError',
				paths: ['Frameworks/bad.md'],
				message: expect.stringContaining('Frameworks/bad.md'),
			});
		} finally {
			parseSpy.mockRestore();
		}
	});

	it('never raw-reads cache-cold files outside the destination', async () => {
		const app = mockApp({
			'Frameworks/A.md': { id: 'iset-abc123', scheme: 'endpoint-v1' },
		}, {
			'Other/cache-cold.md': rawStampedNote('iset-def456'),
		});

		await expect(discoverImportSets(app, 'Frameworks')).resolves.toHaveLength(1);
		expect(app.vault.cachedRead).not.toHaveBeenCalled();
	});

	it('defaults to the sole destination set and rejects an ambiguous destination', async () => {
		const one = mockApp({
			'Frameworks/A.md': { id: 'iset-abc123', scheme: 'endpoint-v1' },
		});
		await expect(resolveImportSet(one, 'Frameworks')).resolves.toEqual({ id: 'iset-abc123', scheme: 'endpoint-v1' });

		const many = mockApp({
			'Frameworks/A.md': { id: 'iset-abc123', scheme: 'endpoint-v1' },
			'Frameworks/B.md': { id: 'iset-def456', scheme: 'endpoint-v1' },
		});
		await expect(resolveImportSet(many, 'Frameworks')).rejects.toThrow(MultipleImportSetsError);
		try {
			await resolveImportSet(many, 'Frameworks');
		} catch (error) {
			expect((error as MultipleImportSetsError).sets.map((set) => [set.id, set.noteCount])).toEqual([
				['iset-abc123', 1],
				['iset-def456', 1],
			]);
		}
	});

	it('allows explicit empty-set refresh and new-set minting', async () => {
		const app = mockApp({
			'Other/A.md': { id: 'iset-abc123', scheme: 'endpoint-v1' },
		});
		await expect(resolveImportSet(app, 'Frameworks', { id: 'iset-zzzz99' })).resolves.toEqual({
			id: 'iset-zzzz99', scheme: 'endpoint-v1',
		});
		await expect(resolveImportSet(app, 'Frameworks', 'new')).resolves.toEqual({
			id: expect.stringMatching(/^iset-[a-z0-9]{6}$/), scheme: 'endpoint-v1',
		});
		await expect(resolveImportSet(app, 'Frameworks', 'new-set-qualified')).resolves.toEqual({
			id: expect.stringMatching(/^iset-[a-z0-9]{6}$/), scheme: 'set-qualified-v1',
		});
	});

	it('reports every path when one set disagrees on scheme', async () => {
		const app = mockApp({
			'Frameworks/A.md': { id: 'iset-abc123', scheme: 'endpoint-v1' },
			'Frameworks/B.md': { id: 'iset-abc123', scheme: 'set-qualified-v1' },
		});
		await expect(discoverImportSets(app, 'Frameworks')).rejects.toThrow(ImportSetProvenanceError);
		try {
			await discoverImportSets(app, 'Frameworks');
		} catch (error) {
			expect((error as ImportSetProvenanceError).paths).toEqual([
				'Frameworks/A.md',
				'Frameworks/B.md',
			]);
		}
	});

	it('accepts a set whose fixed scheme is known but is not the default', async () => {
		const app = mockApp({
			'Frameworks/A.md': { id: 'iset-abc123', scheme: 'set-qualified-v1' },
			'Frameworks/B.md': { id: 'iset-abc123', scheme: 'set-qualified-v1' },
		});

		await expect(discoverImportSets(app, 'Frameworks')).resolves.toEqual([{
			id: 'iset-abc123',
			scheme: 'set-qualified-v1',
			noteCount: 2,
			paths: ['Frameworks/A.md', 'Frameworks/B.md'],
		}]);
		await expect(resolveImportSet(app, 'Frameworks', { id: 'iset-abc123' })).resolves.toEqual({
			id: 'iset-abc123', scheme: 'set-qualified-v1',
		});
	});

	it('refuses to change an existing set scheme during refresh', async () => {
		const app = mockApp({
			'Frameworks/A.md': { id: 'iset-abc123', scheme: 'endpoint-v1' },
		});

		await expect(resolveImportSet(app, 'Frameworks', {
			id: 'iset-abc123', scheme: 'set-qualified-v1',
		})).rejects.toThrow(/refresh cannot change/);
	});

	it('rejects a set whose single scheme is not in the closed enum', async () => {
		const app = mockApp({
			'Frameworks/A.md': { id: 'iset-abc123', scheme: 'future-v1' },
		});
		await expect(discoverImportSets(app, 'Frameworks')).rejects.toThrow(/unsupported schemes/);
	});

	it('does not let malformed provenance for an unrelated set block an explicit refresh', async () => {
		const app = mockApp({
			'Frameworks/A.md': { id: 'iset-abc123', scheme: 'endpoint-v1' },
			'Other/bad.md': { raw: { id: 'not-valid', scheme: 'future-v1' } },
		});
		await expect(resolveImportSet(app, 'Frameworks', { id: 'iset-abc123' })).resolves.toEqual({
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
