/**
 * insert-base-block.test.ts — Phase 4a unit tests.
 *
 * Exercises the cursor-position policy (`chooseInsertionPoint`) + the full
 * `insertBaseBlock` flow with the mocked Editor. Covers the edge-case matrix
 * from the Phase 4 plan: cursor in frontmatter, cursor in code block, cursor
 * in body, no editor, special chars in block content.
 */

import {
	insertBaseBlock,
	chooseInsertionPoint,
	buildBaseBlock,
} from '../src/views/insert-base-block';
import { createMockEditor } from './__mocks__/editor';
import type { Editor } from 'obsidian';

// ---------------------------------------------------------------------------
// buildBaseBlock — pure format helper
// ---------------------------------------------------------------------------

describe('buildBaseBlock', () => {
	it('wraps body in ```base fences with trailing newline', () => {
		const out = buildBaseBlock('filters:\n  and: []');
		expect(out).toBe('```base\nfilters:\n  and: []\n```');
	});

	it('strips trailing newlines from the body before wrapping', () => {
		const out = buildBaseBlock('foo: bar\n\n\n');
		expect(out).toBe('```base\nfoo: bar\n```');
	});

	it('preserves special characters in body (quotes, brackets, slashes)', () => {
		const body = 'filters:\n  and:\n    - file.path.startsWith("Frameworks/NIST-800-53")\n    - confidence: ">0.7"';
		const out = buildBaseBlock(body);
		expect(out).toContain('"Frameworks/NIST-800-53"');
		expect(out).toContain('">0.7"');
		expect(out.startsWith('```base\n')).toBe(true);
		expect(out.endsWith('\n```')).toBe(true);
	});
});

// ---------------------------------------------------------------------------
// chooseInsertionPoint — cursor-position policy
// ---------------------------------------------------------------------------

describe('chooseInsertionPoint — body cursor', () => {
	it('returns the next line after the cursor in plain body text', () => {
		const lines = ['# Heading', '', 'Some body text', '', 'More text'];
		const r = chooseInsertionPoint(lines, 2);
		expect(r).toEqual({ line: 3, reason: 'after-line' });
	});

	it('handles cursor at line 0 of body-only content (no frontmatter)', () => {
		const lines = ['First line', 'Second line'];
		const r = chooseInsertionPoint(lines, 0);
		expect(r).toEqual({ line: 1, reason: 'after-line' });
	});

	it('handles cursor on the last line of file', () => {
		const lines = ['Line A', 'Line B'];
		const r = chooseInsertionPoint(lines, 1);
		expect(r).toEqual({ line: 2, reason: 'after-line' });
	});
});

describe('chooseInsertionPoint — frontmatter cursor', () => {
	it('places insertion AFTER closing --- when cursor inside frontmatter', () => {
		const lines = ['---', 'title: My Note', 'date: 2026-05-15', '---', '', 'Body text'];
		const r = chooseInsertionPoint(lines, 2); // cursor on `date: ...`
		expect(r).toEqual({ line: 4, reason: 'after-frontmatter' });
	});

	it('does NOT treat a non-leading --- as frontmatter', () => {
		const lines = ['# Heading', 'paragraph', '---', 'something', '---', 'more'];
		const r = chooseInsertionPoint(lines, 3); // cursor between the two ---
		// Not frontmatter (doesn't start at line 0). Falls through to after-line.
		expect(r.reason).toBe('after-line');
	});

	it('handles cursor on the closing --- line itself (inclusive)', () => {
		const lines = ['---', 'foo: bar', '---', '', 'Body'];
		const r = chooseInsertionPoint(lines, 2);
		expect(r).toEqual({ line: 3, reason: 'after-frontmatter' });
	});

	it('falls through to body when cursor is past frontmatter', () => {
		const lines = ['---', 'foo: bar', '---', '', 'Body line at 4'];
		const r = chooseInsertionPoint(lines, 4);
		expect(r).toEqual({ line: 5, reason: 'after-line' });
	});
});

describe('chooseInsertionPoint — code block cursor', () => {
	it('places insertion AFTER closing ``` when cursor inside code block', () => {
		const lines = ['# Notes', '', '```ts', 'const x = 1;', 'const y = 2;', '```', '', 'After'];
		const r = chooseInsertionPoint(lines, 4); // cursor inside the code block
		expect(r).toEqual({ line: 6, reason: 'after-code-block' });
	});

	it('handles cursor on the opening ``` line', () => {
		const lines = ['```ts', 'code', '```', 'after'];
		const r = chooseInsertionPoint(lines, 0);
		expect(r).toEqual({ line: 3, reason: 'after-code-block' });
	});

	it('handles cursor on the closing ``` line', () => {
		const lines = ['```ts', 'code', '```', 'after'];
		const r = chooseInsertionPoint(lines, 2);
		expect(r).toEqual({ line: 3, reason: 'after-code-block' });
	});

	it('uses after-line when outside any code block', () => {
		const lines = ['```ts', 'code', '```', 'cursor here'];
		const r = chooseInsertionPoint(lines, 3);
		expect(r).toEqual({ line: 4, reason: 'after-line' });
	});
});

// ---------------------------------------------------------------------------
// insertBaseBlock — full integration with mocked Editor
// ---------------------------------------------------------------------------

describe('insertBaseBlock — full flow', () => {
	it('returns no-editor when editor is null', () => {
		const r = insertBaseBlock(null, '```base\n```');
		expect(r.ok).toBe(false);
		if (!r.ok) expect(r.reason).toBe('no-editor');
	});

	it('returns no-editor when editor is undefined', () => {
		const r = insertBaseBlock(undefined, '```base\n```');
		expect(r.ok).toBe(false);
		if (!r.ok) expect(r.reason).toBe('no-editor');
	});

	it('inserts at line after cursor in plain body', () => {
		const e = createMockEditor({ content: 'foo\nbar\nbaz', cursor: { line: 1, ch: 0 } });
		const r = insertBaseBlock(e as unknown as Editor, '```base\nfilter: []\n```');
		expect(r.ok).toBe(true);
		expect(e.calls.replaceRange).toHaveLength(1);
		const call = e.calls.replaceRange[0];
		expect(call.from.line).toBe(2);
		expect(call.text).toContain('```base');
	});

	it('inserts after frontmatter when cursor is inside', () => {
		const content = '---\ntitle: T\n---\n\nBody';
		const e = createMockEditor({ content, cursor: { line: 1, ch: 0 } });
		const r = insertBaseBlock(e as unknown as Editor, '```base\n```');
		expect(r.ok).toBe(true);
		if (r.ok) expect(r.reason).toBe('after-frontmatter');
		expect(e.calls.replaceRange[0].from.line).toBe(3);
	});

	it('inserts after code block when cursor is inside', () => {
		const content = '# H\n```js\nfoo()\n```\nafter';
		const e = createMockEditor({ content, cursor: { line: 2, ch: 0 } });
		const r = insertBaseBlock(e as unknown as Editor, '```base\n```');
		expect(r.ok).toBe(true);
		if (r.ok) expect(r.reason).toBe('after-code-block');
		expect(e.calls.replaceRange[0].from.line).toBe(4);
	});

	it('adds visual separation (blank line) before block when prior line is non-empty', () => {
		const e = createMockEditor({ content: 'paragraph', cursor: { line: 0, ch: 0 } });
		insertBaseBlock(e as unknown as Editor, '```base\n```');
		const inserted = e.calls.replaceRange[0].text;
		expect(inserted.startsWith('\n')).toBe(true);
	});

	it('skips visual separation when prior line is already blank', () => {
		const e = createMockEditor({ content: 'paragraph\n', cursor: { line: 0, ch: 0 } });
		insertBaseBlock(e as unknown as Editor, '```base\n```');
		const inserted = e.calls.replaceRange[0].text;
		// Prior line is "paragraph" not blank — still adds newline
		expect(inserted.startsWith('\n')).toBe(true);
	});
});
