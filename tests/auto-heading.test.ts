/**
 * auto-heading.test.ts — `target.auto_heading` contract tests.
 *
 * Capability 3 of the 2026-08-26 template-engine contract: the recipe, not the
 * engine, owns the note's first line. Schema SchemaVer 1.8.0.
 *
 * The load-bearing property here is that the option is threaded through BOTH
 * generation paths. They have deliberately DIFFERENT emission conditionals:
 *
 *   - wizard path  (generateNotes -> composeDocumentBody): emits only when body
 *     content exists, from the leaf-filename template value
 *   - recipe path  (generateFromRecipe -> buildDefaultBody): emits ALWAYS, even
 *     with an empty body, from frontmatter.title ?? curie ?? 'Untitled'
 *
 * A previous attempt at removing a redundant heading changed a recipe and not
 * the engine, and the heading came back from the other path. Every behavioural
 * case below is therefore asserted on BOTH paths from the SAME recipe object.
 */

import { TFile, TFolder } from 'obsidian';
import {
	generateFromRecipe,
	generateNotes,
	composeDocumentBody,
	buildDefaultBody,
	resolveAutoHeadingText,
} from '../src/generation/generation-engine';
import type { GenerationOptions } from '../src/generation/generation-engine';
import { computeRecipeHash } from '../src/generation/hash';
import type { Recipe } from '../src/render';
import { validateRecipe } from '../src/validation/validator';
import { loadRecipeDocument, patchRecipeDocument } from '../src/import/recipe-document';
import type { CrosswalkerImportRecipe } from '../src/types/generated/recipe';
import type { ImportRecipe, ParsedData } from '../src/types/config';
import { managedBodyOfNote } from './helpers/managed-region';

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

const row = { id: 'AC-2', name: 'Account management', prose: 'Manages accounts.' };

function parsed(): ParsedData {
	return { columns: Object.keys(row), rows: [{ ...row }], rowCount: 1 };
}

/** Workbench config for the wizard path: the leaf filename drives the H1. */
const wizardConfig: Partial<ImportRecipe> = {
	name: 'auto-heading',
	mapping: {
		hierarchy: [],
		frontmatter: [],
		links: [],
		body: [],
		filename: { template: '{id}.md', sanitize: true },
	},
};

/** A recipe WITH body content, so the wizard path's conditional fires. */
function recipeWithBody(autoHeading?: string | false): Recipe {
	const target: Recipe['target'] = {
		layout: [{ level: 'leaf', mechanism: 'file', template: '{id}.md' }],
		also_emit: {
			frontmatter: { managed: { title: '{name}' } },
			body: [{ template: '{prose}', position: 'append', format: 'text' }],
		},
	};
	if (autoHeading !== undefined) target.auto_heading = autoHeading;
	return { recipe: 'auto-heading', source: { ontology: 'auto-heading', levels: ['leaf'] }, target };
}

/** The same recipe with NO body — proves the two paths' conditionals differ. */
function recipeWithoutBody(autoHeading?: string | false): Recipe {
	const target: Recipe['target'] = {
		layout: [{ level: 'leaf', mechanism: 'file', template: '{id}.md' }],
		also_emit: { frontmatter: { managed: { title: '{name}' } } },
	};
	if (autoHeading !== undefined) target.auto_heading = autoHeading;
	return { recipe: 'auto-heading', source: { ontology: 'auto-heading', levels: ['leaf'] }, target };
}

function wizardOptions(recipeOverride: Recipe): GenerationOptions {
	return {
		basePath: 'Wizard',
		overwriteMode: 'replace',
		createFolders: true,
		sourceFileName: 'source.csv',
		recipeOverride,
	};
}

/**
 * The MANAGED body content — frontmatter stripped, then the `crosswalker:body`
 * region unwrapped. `auto_heading` owns what goes INSIDE that region, so every
 * assertion below is unchanged; `managedBodyOfNote` throws when the region is
 * missing, so a lost wrapper fails rather than silently passing.
 */
function bodyOf(note: string): string {
	return note === '' ? '' : managedBodyOfNote(note);
}

/** Run the WIZARD path (generateNotes) and return the note body. */
async function wizardBody(recipe: Recipe) {
	const { app, files } = makeApp();
	const result = await generateNotes(app, parsed(), wizardConfig, wizardOptions(recipe));
	return { result, body: bodyOf(files.get('Wizard/AC-2.md') ?? ''), files };
}

/** Run the RECIPE path (generateFromRecipe) and return the note body. */
async function recipePathBody(recipe: Recipe) {
	const { app, files } = makeApp();
	const result = await generateFromRecipe(app, parsed(), recipe, {
		basePath: 'Native',
		overwriteMode: 'replace',
		createFolders: true,
		sourceFileName: 'source.csv',
	});
	return { result, body: bodyOf(files.get('Native/AC-2.md') ?? ''), files };
}

// ---------------------------------------------------------------------------
// 3.1 – 3.3  Omitted: today's behaviour, byte for byte, on both paths
// ---------------------------------------------------------------------------

describe('target.auto_heading omitted — today\'s behaviour is preserved exactly', () => {
	it('3.1 wizard path with body content emits the filename-derived H1', async () => {
		const { result, body } = await wizardBody(recipeWithBody());
		expect(result.errors).toEqual([]);
		// `# AC-2`, NOT `# Account management`: the wizard H1 comes from the leaf
		// filename template, which is exactly the redundancy this capability fixes.
		expect(body.trim()).toBe('# AC-2\n\nManages accounts.');
	});

	it('3.2 wizard path with an empty body emits NO heading (the CRI 472 control)', async () => {
		const { result, body } = await wizardBody(recipeWithoutBody());
		expect(result.errors).toEqual([]);
		expect(body.trim()).toBe('');
		expect(body).not.toContain('#');
	});

	it('3.3 recipe path with an empty body still emits the unconditional H1', async () => {
		const { result, body } = await recipePathBody(recipeWithoutBody());
		expect(result.errors).toEqual([]);
		// The recipe path's title source is frontmatter.title, not the filename.
		expect(body.trim()).toBe('# Account management');
	});

	it('3.1b recipe path with body content emits title H1 then the body', async () => {
		const { result, body } = await recipePathBody(recipeWithBody());
		expect(result.errors).toEqual([]);
		expect(body.trim()).toBe('# Account management\n\nManages accounts.');
	});
});

// ---------------------------------------------------------------------------
// 3.4 – 3.5  false: suppression, on both paths
// ---------------------------------------------------------------------------

describe('target.auto_heading: false — suppression on both call sites', () => {
	it('3.4 wizard path emits body only, with no # line', async () => {
		const { result, body } = await wizardBody(recipeWithBody(false));
		expect(result.errors).toEqual([]);
		expect(body.trim()).toBe('Manages accounts.');
		expect(body).not.toContain('#');
	});

	it('3.5 recipe path with an empty body emits an empty body, not "# Untitled"', async () => {
		const { result, body } = await recipePathBody(recipeWithoutBody(false));
		expect(result.errors).toEqual([]);
		expect(body.trim()).toBe('');
		expect(body).not.toContain('#');
	});

	it('3.5b recipe path with body content emits the body alone', async () => {
		const { result, body } = await recipePathBody(recipeWithBody(false));
		expect(result.errors).toEqual([]);
		expect(body.trim()).toBe('Manages accounts.');
		expect(body).not.toContain('#');
	});
});

// ---------------------------------------------------------------------------
// 3.6 – 3.8  Template strings
// ---------------------------------------------------------------------------

describe('target.auto_heading: template string', () => {
	it('3.6 renders the same heading on BOTH paths from one recipe', async () => {
		const recipe = recipeWithBody('{name}');
		const wizard = await wizardBody(recipe);
		const native = await recipePathBody(recipe);
		expect(wizard.result.errors).toEqual([]);
		expect(native.result.errors).toEqual([]);
		// Without threading, the wizard path would still say `# AC-2` here — this
		// assertion is the both-call-sites proof.
		expect(wizard.body.trim().startsWith('# Account management\n\n')).toBe(true);
		expect(native.body.trim().startsWith('# Account management\n\n')).toBe(true);
		expect(wizard.body.trim()).toBe(native.body.trim());
	});

	it('3.6b the full filter grammar is available in the heading template', async () => {
		const { result, body } = await recipePathBody(recipeWithBody('{name|upper}'));
		expect(result.errors).toEqual([]);
		expect(body.trim().startsWith('# ACCOUNT MANAGEMENT')).toBe(true);
	});

	it('3.7 a template that renders empty emits no heading and never a bare "# "', async () => {
		const wizard = await wizardBody(recipeWithBody('{absent|optional}'));
		const native = await recipePathBody(recipeWithBody('{absent|optional}'));
		expect(wizard.result.errors).toEqual([]);
		expect(native.result.errors).toEqual([]);
		expect(wizard.body.trim()).toBe('Manages accounts.');
		expect(native.body.trim()).toBe('Manages accounts.');
		expect(wizard.body).not.toContain('# ');
		expect(native.body).not.toContain('# ');
	});

	it('3.7b an empty-rendering template on the recipe path with an empty body emits nothing', async () => {
		const { result, body } = await recipePathBody(recipeWithoutBody('{absent|optional}'));
		expect(result.errors).toEqual([]);
		expect(body.trim()).toBe('');
	});

	it('3.8 a missing variable without |optional is a per-row error, and the run continues', async () => {
		const native = await recipePathBody(recipeWithBody('{nope}'));
		expect(native.result.errors.length).toBe(1);
		expect(native.result.errors[0].message).toContain('auto_heading');
		expect(native.files.get('Native/AC-2.md')).toBeUndefined();

		// The wizard path surfaces the same failure through its own row-error
		// channel rather than aborting the import.
		const wizard = await wizardBody(recipeWithBody('{nope}'));
		expect(wizard.result.errors.length).toBe(1);
		expect(wizard.result.errors[0].message).toContain('auto_heading');
	});
});

// ---------------------------------------------------------------------------
// The two low-level helpers, directly
// ---------------------------------------------------------------------------

describe('resolveAutoHeadingText', () => {
	const scope = { name: 'Account management' };

	it('returns the fallback when the key is absent', () => {
		expect(resolveAutoHeadingText({ target: {} }, scope, 'AC-2')).toBe('AC-2');
	});

	it('returns null when the key is false', () => {
		expect(resolveAutoHeadingText({ target: { auto_heading: false } }, scope, 'AC-2')).toBeNull();
	});

	it('renders and trims a template string', () => {
		expect(resolveAutoHeadingText({ target: { auto_heading: '  {name}  ' } }, scope, 'AC-2'))
			.toBe('Account management');
	});

	it('is deterministic', () => {
		const a = resolveAutoHeadingText({ target: { auto_heading: '{name}' } }, scope, 'x');
		const b = resolveAutoHeadingText({ target: { auto_heading: '{name}' } }, scope, 'x');
		expect(a).toBe(b);
	});
});

describe('composeDocumentBody accepts a null heading', () => {
	it('returns the body unchanged when the heading is null', () => {
		expect(composeDocumentBody(null, 'body only')).toBe('body only');
	});

	it('still prepends a non-null heading', () => {
		expect(composeDocumentBody('T', 'b')).toBe('# T\n\nb');
	});
});

describe('buildDefaultBody', () => {
	const address = { body: [] as never[] };

	it('3.3 absent key keeps the unconditional emission, even for an empty title', () => {
		// `title: ''` is not reachable through render() (it omits empty managed
		// keys), but pinning it proves the absent branch is untouched rather than
		// re-routed through the new empty-suppression path.
		expect(buildDefaultBody({ title: '' }, address, { target: {} }, {}))
			.toBe('# \n');
		expect(buildDefaultBody({ curie: 'x:1' }, address, { target: {} }, {}))
			.toBe('# x:1\n');
		expect(buildDefaultBody({}, address, { target: {} }, {}))
			.toBe('# Untitled\n');
	});

	it('emits managed body alone when suppressed', () => {
		const withBody = { body: [{ position: 'append' as const, content: 'text' }] };
		expect(buildDefaultBody({ title: 'T' }, withBody, { target: { auto_heading: false } }, {}))
			.toBe('text\n');
		expect(buildDefaultBody({ title: 'T' }, address, { target: { auto_heading: false } }, {}))
			.toBe('');
	});
});

// ---------------------------------------------------------------------------
// 3.9 – 3.10  The recipe hash
// ---------------------------------------------------------------------------

describe('computeRecipeHash and auto_heading', () => {
	const base = {
		layout: [{ level: 'leaf', mechanism: 'file', template: '{id}.md' }],
		also_emit: { tags: ['t'] },
	};

	it('3.9 a recipe WITHOUT the key hashes byte-identically to an explicit undefined', () => {
		// The `?? null` idiom used for also_emit/enrichment would have injected
		// "auto_heading":null into every canonical string and invalidated every
		// _crosswalker.recipe.hash already written into every generated vault.
		expect(computeRecipeHash(base)).toBe(computeRecipeHash({ ...base, auto_heading: undefined }));
	});

	it('3.9b the absent-key hash is the documented pre-1.8.0 value', () => {
		// Literal vector: if this changes, every already-generated note reads as
		// recipe-drifted on its next re-import.
		expect(computeRecipeHash(base)).toBe(
			'sha256-' + require('crypto').createHash('sha256').update(
				JSON.stringify({
					also_emit: { tags: ['t'] },
					enrichment: null,
					layout: [{ level: 'leaf', mechanism: 'file', template: '{id}.md' }],
				}),
			).digest('hex'),
		);
	});

	it('3.10 two recipes differing only in auto_heading hash differently', () => {
		const a = computeRecipeHash({ ...base, auto_heading: '{name}' });
		const b = computeRecipeHash({ ...base, auto_heading: '{title}' });
		const off = computeRecipeHash({ ...base, auto_heading: false });
		expect(a).not.toBe(b);
		expect(a).not.toBe(computeRecipeHash(base));
		expect(off).not.toBe(computeRecipeHash(base));
		expect(off).not.toBe(a);
	});
});

// ---------------------------------------------------------------------------
// 3.11 – 3.12  Round trip and schema
// ---------------------------------------------------------------------------

const canonical: CrosswalkerImportRecipe = {
	$schema: 'https://crosswalker.dev/spec/recipe.schema.json',
	recipe: 'auto-heading-canonical',
	source: { ontology: 'auto-heading', levels: ['leaf'] },
	target: {
		layout: [{ level: 'leaf', mechanism: 'file', template: '{id}.md' }],
		also_emit: { frontmatter: { managed: { title: '{name}' } } },
		auto_heading: '{name}',
	},
} as unknown as CrosswalkerImportRecipe;

describe('auto_heading survives the workbench round trip and the schema', () => {
	it('3.11 patchRecipeDocument preserves target.auto_heading', () => {
		const loaded = loadRecipeDocument(canonical, { origin: 'bundled' });
		expect(loaded.ok).toBe(true);
		if (!loaded.ok) throw new Error(loaded.diagnostics.map((d) => d.message).join('; '));
		const patched = patchRecipeDocument(loaded.document);
		expect(patched.ok).toBe(true);
		if (!patched.ok) return;
		// patchOwnedRegions replaces only layout/also_emit/enrichment, so a field
		// on `target` is preserved for free. This is why it is NOT in also_emit.
		expect(patched.recipe.target.auto_heading).toBe('{name}');
	});

	it('3.12 AJV accepts a template and false, and rejects true', () => {
		expect(validateRecipe(canonical).valid).toBe(true);
		const off = JSON.parse(JSON.stringify(canonical));
		off.target.auto_heading = false;
		expect(validateRecipe(off).valid).toBe(true);
		const bad = JSON.parse(JSON.stringify(canonical));
		bad.target.auto_heading = true;
		expect(validateRecipe(bad).valid).toBe(false);
		const alsoBad = JSON.parse(JSON.stringify(canonical));
		alsoBad.target.auto_heading = 7;
		expect(validateRecipe(alsoBad).valid).toBe(false);
	});

	it('3.12b a recipe without the key still validates', () => {
		const without = JSON.parse(JSON.stringify(canonical));
		delete without.target.auto_heading;
		expect(validateRecipe(without).valid).toBe(true);
	});
});
