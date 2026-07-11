/**
 * setting-previews.ts — pure preview builders for the settings tab.
 *
 * The design intent (spec 2026-07-05 §7l): every setting that controls a
 * vault-visible construct gets a small, live preview built from the user's
 * ACTUAL current values, so settings teach by showing an Obsidian primitive
 * (a folder tree, a frontmatter block, a wikilink) rather than only telling.
 *
 * These functions are PURE — no Obsidian imports, no DOM. They return plain
 * strings and node arrays; the settings tab wires them into DOM (reusing the
 * wizard's `.crosswalker-wb-tree` / `.crosswalker-wb-mini` look). Keeping them
 * pure makes every rule unit-testable without an Obsidian runtime.
 *
 * The sample data is deliberately compliance-flavored (a control column, an
 * `AC-2` identifier) to match the plugin's launch domain, but the transforms
 * are general.
 */

import type {
	KeyNamingStyle,
	ArrayHandling,
	EmptyHandling,
	FrontmatterStyle,
	LinkSyntaxPreset,
} from './settings-data';

/** One row in a mini folder tree. `depth` drives indentation; `isFile` picks the icon. */
export interface PreviewTreeNode {
	depth: number;
	label: string;
	isFile: boolean;
}

/** Representative sample values shared across the previews (one worked example). */
const SAMPLE = {
	column: 'Control Name',
	value: 'Account management',
	id: 'AC-2',
	multi: ['identity', 'access', 'mfa'],
	relatedId: 'AC-6',
};

// ---------------------------------------------------------------------------
// Output path → mini folder tree
// ---------------------------------------------------------------------------

/**
 * Build a mini folder tree illustrating where an import lands under `path`.
 * Each path segment becomes a nested folder, then a sample category folder,
 * a sample leaf note, and the folder note that Crosswalker writes.
 */
export function outputPathTree(path: string): PreviewTreeNode[] {
	const segments = String(path || '')
		.split('/')
		.map((s) => s.trim())
		.filter((s) => s.length > 0);

	const root = segments.length > 0 ? segments : ['Vault root'];
	const nodes: PreviewTreeNode[] = root.map((label, i) => ({
		depth: i,
		label,
		isFile: false,
	}));

	const base = root.length;
	nodes.push({ depth: base, label: 'Access Control', isFile: false });
	nodes.push({ depth: base + 1, label: `${SAMPLE.id} ${SAMPLE.value}.md`, isFile: true });
	return nodes;
}

// ---------------------------------------------------------------------------
// Key naming style → sample frontmatter key
// ---------------------------------------------------------------------------

/** Transform a human column name into a frontmatter key under the given style. */
export function transformKey(name: string, style: KeyNamingStyle): string {
	const words = String(name)
		.trim()
		.split(/[^A-Za-z0-9]+/)
		.filter((w) => w.length > 0);

	switch (style) {
		case 'as-is':
			return String(name).trim();
		case 'lowercase':
			return words.join(' ').toLowerCase();
		case 'snake_case':
			return words.map((w) => w.toLowerCase()).join('_');
		case 'kebab-case':
			return words.map((w) => w.toLowerCase()).join('-');
		case 'camelCase':
			return words
				.map((w, i) =>
					i === 0
						? w.toLowerCase()
						: w.charAt(0).toUpperCase() + w.slice(1).toLowerCase(),
				)
				.join('');
		default:
			return String(name).trim();
	}
}

/** Sample frontmatter block showing the column → key transform for `style`. */
export function keyNamingSample(style: KeyNamingStyle): string {
	const key = transformKey(SAMPLE.column, style);
	return [
		`# column "${SAMPLE.column}" becomes:`,
		'---',
		`${quoteKey(key)}: ${SAMPLE.value}`,
		'---',
	].join('\n');
}

/** Wrap a key in quotes only when it contains spaces (valid YAML). */
function quoteKey(key: string): string {
	return /\s/.test(key) ? `"${key}"` : key;
}

// ---------------------------------------------------------------------------
// Array handling → sample YAML for a multi-value cell
// ---------------------------------------------------------------------------

/** Sample YAML for a multi-value cell (`identity, access, mfa`) under `mode`. */
export function arrayHandlingSample(mode: ArrayHandling): string {
	const vals = SAMPLE.multi;
	const header = `# cell "${vals.join(', ')}" becomes:`;
	switch (mode) {
		case 'as_array':
			return [header, 'tags:', ...vals.map((v) => `  - ${v}`)].join('\n');
		case 'stringify':
			return [header, `tags: "${vals.join(', ')}"`].join('\n');
		case 'first':
			return [header, `tags: ${vals[0]}`].join('\n');
		case 'last':
			return [header, `tags: ${vals[vals.length - 1]}`].join('\n');
		case 'join':
			return [header, `tags: ${vals.join('; ')}`].join('\n');
		default:
			return [header, `tags: ${vals.join(', ')}`].join('\n');
	}
}

// ---------------------------------------------------------------------------
// Empty value handling → sample YAML for an empty cell
// ---------------------------------------------------------------------------

/** Sample YAML for an empty cell under `mode`. */
export function emptyHandlingSample(mode: EmptyHandling): string {
	const header = '# when the "owner" cell is empty:';
	switch (mode) {
		case 'omit':
			return [header, '# (the owner field is left out entirely)'].join('\n');
		case 'empty_string':
			return [header, 'owner: ""'].join('\n');
		case 'null':
			return [header, 'owner: null'].join('\n');
		case 'default':
			return [header, 'owner: (your default value)'].join('\n');
		default:
			return [header, 'owner: ""'].join('\n');
	}
}

// ---------------------------------------------------------------------------
// Frontmatter style → sample nesting for dotted keys
// ---------------------------------------------------------------------------

/** Sample frontmatter for dotted source keys under `style`. */
export function frontmatterStyleSample(style: FrontmatterStyle): string {
	const header = '# columns "source.id" and "source.name" become:';
	switch (style) {
		case 'flat':
			return [header, `source.id: ${SAMPLE.id}`, `source.name: ${SAMPLE.value}`].join('\n');
		case 'dot_to_nest':
			return [header, 'source:', `  id: ${SAMPLE.id}`, `  name: ${SAMPLE.value}`].join('\n');
		case 'group_by_prefix':
			return [header, 'source:', `  id: ${SAMPLE.id}`, `  name: ${SAMPLE.value}`].join('\n');
		default:
			return [header, `source.id: ${SAMPLE.id}`].join('\n');
	}
}

// ---------------------------------------------------------------------------
// Link syntax preset → sample rendered wikilink
// ---------------------------------------------------------------------------

/** Sample frontmatter link line for `preset` with the given `namespace`. */
export function linkSyntaxSample(preset: LinkSyntaxPreset, namespace: string): string {
	const ns = String(namespace || '').trim() || 'crosswalker';
	const header = '# a crosswalk to another concept becomes:';
	switch (preset) {
		case 'simple':
			return [header, `related: "[[${SAMPLE.relatedId}]]"`].join('\n');
		case 'standard':
			return [header, 'related:', `  - "[[${SAMPLE.relatedId}]]"`].join('\n');
		case 'full':
			return [
				header,
				`${ns}_related:`,
				`  - link: "[[${SAMPLE.relatedId}]]"`,
				'    predicate: related_to',
			].join('\n');
		case 'custom':
			return [header, `${ns}: "[[${SAMPLE.relatedId}]]"`].join('\n');
		default:
			return [header, `related: "[[${SAMPLE.relatedId}]]"`].join('\n');
	}
}

// ---------------------------------------------------------------------------
// Path-echo previews (debug log, sidecar, drafts)
// ---------------------------------------------------------------------------

/** The debug log note is always written at vault root. */
export function debugLogPathDisplay(): string {
	return 'crosswalker-debug.log';
}

/** Echo the sidecar path, filling the default when blank. */
export function sidecarPathDisplay(path: string): string {
	return String(path || '').trim() || '.crosswalker.sqlite';
}

/** Drafts always live under this gitignored folder. */
export function draftPathDisplay(): string {
	return '_crosswalker/drafts/';
}
