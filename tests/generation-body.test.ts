/** Focused contract tests for canonical also_emit.body generation assembly. */

import { TFile, TFolder } from 'obsidian';
import { generateFromRecipe, generateNotes } from '../src/generation/generation-engine';
import type { GenerationOptions } from '../src/generation/generation-engine';
import type { Recipe } from '../src/render';
import type { ImportRecipe, ParsedData } from '../src/types/config';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const yaml = require('js-yaml') as { load: (s: string) => unknown };

function makeApp() {
	const files = new Map<string, string>();
	const folders = new Set<string>(['']);
	const getAbstractFileByPath = (path: string) => {
		if (files.has(path)) return new TFile(path);
		if (folders.has(path)) return new TFolder(path);
		return null;
	};
	const app = {
		vault: {
			// generateNotes resolves existing notes by identity, which reads the
			// vault markdown list. This double has no pre-existing notes.
			getMarkdownFiles: () => [],
			getAbstractFileByPath,
			create: async (path: string, content: string) => {
				files.set(path, content);
				return new TFile(path);
			},
			modify: async (file: { path: string }, content: string) => files.set(file.path, content),
			read: async (file: { path: string }) => files.get(file.path) ?? '',
			createFolder: async (path: string) => folders.add(path),
		},
		metadataCache: {
			getFileCache: (file: { path: string }) => {
				const text = files.get(file.path);
				const match = text && /^---\n([\s\S]*?)\n---/.exec(text.replace(/\r\n/g, '\n'));
				return { frontmatter: match ? (yaml.load(match[1]) as Record<string, unknown>) : {} };
			},
		},
	};
	return { app: app as any, files };
}

const row = {
	id: 'AC-2',
	title: 'Account management',
	canonical: 'Canonical body text.',
	legacy: 'Legacy body text.',
	related: 'REF-1',
};

function parsed(): ParsedData {
	return { columns: Object.keys(row), rows: [{ ...row }], rowCount: 1 };
}

const config: Partial<ImportRecipe> = {
	name: 'body-contract',
	mapping: {
		hierarchy: [],
		frontmatter: [{ column: 'title', key: 'title' }],
		links: [{ column: 'related', type: 'wikilink', location: 'body', bodySection: 'Related' }],
		body: [{ column: 'legacy', heading: 'Legacy' }],
		filename: { template: '{id}.md', sanitize: true },
	},
};

const canonicalRecipe: Recipe = {
	recipe: 'body-contract',
	source: { ontology: 'body-contract', version: 'declared-1', levels: ['leaf'] },
	target: {
		layout: [{ level: 'leaf', mechanism: 'file', template: '{id}.md' }],
		also_emit: {
			frontmatter: { managed: { title: '{title}' } },
			body: [{ template: '{canonical}', position: 'section', heading: 'Canonical' }],
		},
	},
};

function options(recipeOverride: Recipe): GenerationOptions {
	return {
		basePath: 'Frameworks',
		overwriteMode: 'replace',
		createFolders: true,
		sourceFileName: 'source.csv',
		recipeOverride,
	};
}

describe('canonical body generation assembly', () => {
	it('uses rendered canonical body and suppresses only legacy MappingConfig.body', async () => {
		const { app, files } = makeApp();
		const result = await generateNotes(app, parsed(), config, options(canonicalRecipe));
		expect(result.errors).toEqual([]);
		const note = files.get('Frameworks/AC-2.md') ?? '';
		expect(note).toContain('# AC-2\n\n## Canonical\n\nCanonical body text.');
		expect(note).not.toContain('Legacy body text.');
		// Body-located links are unrelated legacy behavior and still emit.
		expect(note).toContain('## Related\n\n[[REF-1]]');
	});

	it('falls back to legacy MappingConfig.body only when canonical body is absent', async () => {
		const { app, files } = makeApp();
		const withoutCanonical: Recipe = {
			...canonicalRecipe,
			target: {
				...canonicalRecipe.target,
				also_emit: { frontmatter: canonicalRecipe.target.also_emit?.frontmatter },
			},
		};
		const result = await generateNotes(app, parsed(), config, options(withoutCanonical));
		expect(result.errors).toEqual([]);
		const note = files.get('Frameworks/AC-2.md') ?? '';
		expect(note).toContain('## Legacy\n\nLegacy body text.');
	});

	it('uses declared source.version only as fallback and prefers verified run truth', async () => {
		const fallbackVault = makeApp();
		await generateFromRecipe(fallbackVault.app, parsed(), canonicalRecipe, {
			basePath: 'Native',
			overwriteMode: 'replace',
			sourceFileName: 'source.csv',
		});
		const fallback = fallbackVault.files.get('Native/AC-2.md') ?? '';
		expect(fallback).toContain('version: declared-1');
		expect(fallback).toContain('# Account management\n\n## Canonical\n\nCanonical body text.');

		const verifiedVault = makeApp();
		await generateFromRecipe(verifiedVault.app, parsed(), canonicalRecipe, {
			basePath: 'Native',
			overwriteMode: 'replace',
			sourceFileName: 'source.csv',
			sourceVersion: 'verified-2',
		});
		const verified = verifiedVault.files.get('Native/AC-2.md') ?? '';
		expect(verified).toContain('version: verified-2');
		expect(verified).not.toContain('version: declared-1');
	});
});
