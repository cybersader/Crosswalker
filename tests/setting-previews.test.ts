/**
 * setting-previews.test.ts — pure preview builders for the settings tab.
 *
 * Covers the live-illustrated previews rendered beside construct-referring
 * settings (spec 2026-07-05 §7l). No Obsidian dependency; see
 * src/settings/setting-previews.ts.
 */

import {
	outputPathTree,
	transformKey,
	keyNamingSample,
	arrayHandlingSample,
	emptyHandlingSample,
	frontmatterStyleSample,
	linkSyntaxSample,
	debugLogPathDisplay,
	sidecarPathDisplay,
	draftPathDisplay,
} from '../src/settings/setting-previews';

describe('outputPathTree', () => {
	it('nests each path segment as a folder, then adds a sample category + leaf note', () => {
		const tree = outputPathTree('Frameworks/NIST');
		expect(tree.map((n) => [n.depth, n.label, n.isFile])).toEqual([
			[0, 'Frameworks', false],
			[1, 'NIST', false],
			[2, 'Access Control', false],
			[3, 'AC-2 Account management.md', true],
		]);
	});

	it('trims and drops empty segments (leading/trailing/duplicate slashes)', () => {
		const tree = outputPathTree(' /Frameworks//NIST/ ');
		const folders = tree.filter((n) => !n.isFile).map((n) => n.label);
		expect(folders).toEqual(['Frameworks', 'NIST', 'Access Control']);
	});

	it('falls back to a "Vault root" label when the path is blank', () => {
		const tree = outputPathTree('');
		expect(tree[0]).toEqual({ depth: 0, label: 'Vault root', isFile: false });
	});

	it('always ends with exactly one file node', () => {
		const files = outputPathTree('A/B/C').filter((n) => n.isFile);
		expect(files).toHaveLength(1);
	});
});

describe('transformKey', () => {
	const cases: Array<[Parameters<typeof transformKey>[1], string]> = [
		['as-is', 'Control Name'],
		['lowercase', 'control name'],
		['snake_case', 'control_name'],
		['kebab-case', 'control-name'],
		['camelCase', 'controlName'],
	];
	it.each(cases)('renders "Control Name" as %s → %s', (style, expected) => {
		expect(transformKey('Control Name', style)).toBe(expected);
	});

	it('collapses runs of punctuation and whitespace into a single separator', () => {
		expect(transformKey('Foo   Bar--Baz', 'snake_case')).toBe('foo_bar_baz');
		expect(transformKey('Foo   Bar--Baz', 'kebab-case')).toBe('foo-bar-baz');
		expect(transformKey('Foo   Bar--Baz', 'camelCase')).toBe('fooBarBaz');
	});
});

describe('keyNamingSample', () => {
	it('emits a valid frontmatter block with the transformed key', () => {
		const yaml = keyNamingSample('snake_case');
		expect(yaml).toContain('control_name: Account management');
		expect(yaml.startsWith('# column')).toBe(true);
	});

	it('quotes keys that contain spaces (as-is / lowercase)', () => {
		expect(keyNamingSample('as-is')).toContain('"Control Name": Account management');
		expect(keyNamingSample('lowercase')).toContain('"control name": Account management');
	});
});

describe('arrayHandlingSample', () => {
	it('renders a YAML list for as_array', () => {
		const s = arrayHandlingSample('as_array');
		expect(s).toContain('tags:');
		expect(s).toContain('  - identity');
		expect(s).toContain('  - mfa');
	});
	it('quotes a joined string for stringify', () => {
		expect(arrayHandlingSample('stringify')).toContain('tags: "identity, access, mfa"');
	});
	it('takes the first / last value', () => {
		expect(arrayHandlingSample('first')).toContain('tags: identity');
		expect(arrayHandlingSample('last')).toContain('tags: mfa');
	});
	it('joins with a delimiter', () => {
		expect(arrayHandlingSample('join')).toContain('tags: identity; access; mfa');
	});
});

describe('emptyHandlingSample', () => {
	it('shows omission as a comment (no field emitted)', () => {
		const s = emptyHandlingSample('omit');
		expect(s).not.toMatch(/^owner:/m);
		expect(s).toContain('left out');
	});
	it('emits the field for empty_string / null / default', () => {
		expect(emptyHandlingSample('empty_string')).toContain('owner: ""');
		expect(emptyHandlingSample('null')).toContain('owner: null');
		expect(emptyHandlingSample('default')).toContain('owner: (your default value)');
	});
});

describe('frontmatterStyleSample', () => {
	it('keeps dotted keys literal when flat', () => {
		const s = frontmatterStyleSample('flat');
		expect(s).toContain('source.id: AC-2');
		expect(s).toContain('source.name: Account management');
	});
	it('nests dotted keys for dot_to_nest / group_by_prefix', () => {
		for (const style of ['dot_to_nest', 'group_by_prefix'] as const) {
			const s = frontmatterStyleSample(style);
			expect(s).toContain('source:');
			expect(s).toContain('  id: AC-2');
			expect(s).toContain('  name: Account management');
		}
	});
});

describe('linkSyntaxSample', () => {
	it('renders a bare quoted wikilink for simple', () => {
		expect(linkSyntaxSample('simple', 'crosswalker')).toContain('related: "[[AC-6]]"');
	});
	it('renders a list for standard', () => {
		const s = linkSyntaxSample('standard', 'crosswalker');
		expect(s).toContain('related:');
		expect(s).toContain('  - "[[AC-6]]"');
	});
	it('uses the namespace for full / custom', () => {
		expect(linkSyntaxSample('full', 'grc')).toContain('grc_related:');
		expect(linkSyntaxSample('custom', 'grc')).toContain('grc: "[[AC-6]]"');
	});
	it('falls back to a default namespace when blank', () => {
		expect(linkSyntaxSample('custom', '  ')).toContain('crosswalker: "[[AC-6]]"');
	});
});

describe('path-echo previews', () => {
	it('debug log path is the vault-root note name', () => {
		expect(debugLogPathDisplay()).toBe('crosswalker-debug.log');
	});
	it('sidecar path echoes the value, defaulting when blank', () => {
		expect(sidecarPathDisplay('data/x.sqlite')).toBe('data/x.sqlite');
		expect(sidecarPathDisplay('   ')).toBe('.crosswalker.sqlite');
	});
	it('draft path is the gitignored drafts folder', () => {
		expect(draftPathDisplay()).toBe('_crosswalker/drafts/');
	});
});
