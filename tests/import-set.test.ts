import * as Obsidian from 'obsidian';
import { TFile } from 'obsidian';
import {
	CURRENT_IMPORT_SET_SCHEME,
	ImportSetProvenanceError,
	MultipleImportSetsError,
	discoverImportSets,
	mintImportSetId,
	recoverImportSetRoot,
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

/** A note whose provenance also records the destination the set was written to. */
function stampedWithDestination(id: string, destination: string, scheme = 'endpoint-v1'): string {
	return `---\n_crosswalker:\n  import_set:\n    id: ${id}\n    scheme: ${scheme}\n    destination: "${destination}"\n---\n# Generated\n`;
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
			// No note recorded a destination (these predate the stamp), so the root
			// is recovered from the paths: the deepest folder both notes sit under.
			root: 'Frameworks',
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
			root: 'Frameworks',
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
		await expect(resolveImportSet(one, 'Frameworks')).resolves.toEqual({
			id: 'iset-abc123', scheme: 'endpoint-v1', destination: 'Frameworks',
		});

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
			id: 'iset-zzzz99', scheme: 'endpoint-v1', destination: 'Frameworks',
		});
		await expect(resolveImportSet(app, 'Frameworks', 'new')).resolves.toEqual({
			id: expect.stringMatching(/^iset-[a-z0-9]{6}$/), scheme: 'endpoint-v1', destination: 'Frameworks',
		});
		await expect(resolveImportSet(app, 'Frameworks', 'new-set-qualified')).resolves.toEqual({
			id: expect.stringMatching(/^iset-[a-z0-9]{6}$/), scheme: 'set-qualified-v1', destination: 'Frameworks',
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
			root: 'Frameworks',
		}]);
		await expect(resolveImportSet(app, 'Frameworks', { id: 'iset-abc123' })).resolves.toEqual({
			id: 'iset-abc123', scheme: 'set-qualified-v1', destination: 'Frameworks',
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
			id: 'iset-abc123', scheme: 'endpoint-v1', destination: 'Frameworks',
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

// ===========================================================================
// F-1: a set's root is RECORDED going forward and RECOVERED for legacy vaults.
//
// The damage this closes: a refresh had no way to ask where its own set already
// lives. Provenance stamped {id, scheme} and no destination, so the wizard fell
// through to a derived default. For a vault that imported before the per-import
// root rule existed, the derived default names a folder the set's notes are not
// in, and writing there does not relocate the import: it forks it.
// ===========================================================================

describe('recoverImportSetRoot -- the deepest folder every note sits under', () => {
	it('compares whole path SEGMENTS, so two sibling roots with a shared name prefix never merge', () => {
		// The falsifying case for a common-string-prefix implementation, which
		// returns 'Frameworks/NIST-min' here: a folder NEITHER set lives in.
		// A refresh sent there writes a third copy of the import.
		const root = recoverImportSetRoot([
			'Frameworks/NIST-mini/AC-2.md',
			'Frameworks/NIST-minimal/AC-3.md',
		]);
		expect(root).toBe('Frameworks');
		expect(root).not.toBe('Frameworks/NIST-min');
	});

	it('does not merge sibling roots even when one name is a strict prefix of the other', () => {
		expect(recoverImportSetRoot([
			'Ontologies/NIST/AC-2.md',
			'Ontologies/NISTED/AC-3.md',
		])).toBe('Ontologies');
	});

	it('returns the deepest shared folder, not merely the first segment', () => {
		expect(recoverImportSetRoot([
			'Ontologies/attack-mini/T1078.md',
			'Ontologies/attack-mini/T1078/T1078.001.md',
			'Ontologies/attack-mini/Persistence/Persistence.md',
		])).toBe('Ontologies/attack-mini');
	});

	it('recovers a flat pre-fix import that sits directly in the shared root', () => {
		expect(recoverImportSetRoot(['Ontologies/T1078.md', 'Ontologies/T1098.md'])).toBe('Ontologies');
	});

	// Fail closed. Refusing to answer is the correct answer when the notes do not
	// agree, because every wrong answer here MOVES a user's notes.
	it.each([
		['no notes at all', []],
		['one note dragged to the vault root', ['Ontologies/T1078.md', 'stray.md']],
		['notes under two unrelated top-level folders', ['Ontologies/A.md', 'Archive/B.md']],
		['a note sitting at the vault root', ['A.md']],
	])('returns null rather than guessing: %s', (_label, paths) => {
		expect(recoverImportSetRoot(paths as string[])).toBeNull();
	});
});

describe('a discovered set knows where it lives', () => {
	it('prefers the destination its own notes recorded', async () => {
		const app = mockApp({}, {
			'Ontologies/attack-mini/T1078.md': stampedWithDestination('iset-abc123', 'Ontologies/attack-mini'),
			'Ontologies/attack-mini/Persistence/T1098.md': stampedWithDestination('iset-abc123', 'Ontologies/attack-mini'),
		});
		const [set] = await discoverImportSets(app, 'Ontologies');
		expect(set.destination).toBe('Ontologies/attack-mini');
		expect(set.root).toBe('Ontologies/attack-mini');
	});

	it('ignores a recorded destination its notes no longer corroborate (a renamed folder)', async () => {
		// Nothing reconciles the stamp when a user renames the folder in the file
		// explorer, so the stamp is a hint and the paths are the evidence. Writing
		// to a folder the set has left is how a refresh silently forks an import.
		const app = mockApp({}, {
			'Ontologies/renamed/T1078.md': stampedWithDestination('iset-abc123', 'Ontologies/attack-mini'),
			'Ontologies/renamed/T1098.md': stampedWithDestination('iset-abc123', 'Ontologies/attack-mini'),
		});
		const [set] = await discoverImportSets(app, 'Ontologies');
		expect(set.root).toBe('Ontologies/renamed');
	});

	it('falls back to the paths when members disagree about the destination (a half-migrated set)', async () => {
		const app = mockApp({}, {
			'Ontologies/T1078.md': stampedWithDestination('iset-abc123', 'Ontologies'),
			'Ontologies/T1098.md': stampedWithDestination('iset-abc123', 'Ontologies/attack-mini'),
		});
		const [set] = await discoverImportSets(app, 'Ontologies');
		expect(set.destination).toBeUndefined();
		expect(set.root).toBe('Ontologies');
	});

	it('reports a null root rather than inventing one when the set is spread across the vault', async () => {
		const app = mockApp({
			'Ontologies/T1078.md': { id: 'iset-abc123', scheme: 'endpoint-v1' },
			'Archive/T1098.md': { id: 'iset-abc123', scheme: 'endpoint-v1' },
		});
		const [set] = await discoverImportSets(app, undefined);
		expect(set.root).toBeNull();
	});

	it('records the destination it wrote to on every run, not only at mint', async () => {
		// Re-stamped each run so a set that legitimately moves records its new home
		// instead of carrying a stale one forever.
		const app = mockApp({ 'Ontologies/T1078.md': { id: 'iset-abc123', scheme: 'endpoint-v1' } });
		await expect(resolveImportSet(app, 'Ontologies/attack-mini', { id: 'iset-abc123' })).resolves.toEqual({
			id: 'iset-abc123', scheme: 'endpoint-v1', destination: 'Ontologies/attack-mini',
		});
	});

	it('records no destination for an import into the vault root, rather than an empty string', async () => {
		const app = mockApp({});
		await expect(resolveImportSet(app, '', 'new')).resolves.toEqual({
			id: expect.stringMatching(/^iset-[a-z0-9]{6}$/), scheme: 'endpoint-v1',
		});
	});
});
