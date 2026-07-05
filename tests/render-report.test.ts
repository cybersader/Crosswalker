/**
 * render-report.test.ts — the per-row deviation report (v0.1.6).
 *
 * One visible rule: every row imports; every deviation is recorded. These pin
 * the three previously-silent failure modes:
 *   1. folder level renders empty → level skipped, note recorded (was: silent)
 *   2. split() finds no delimiter → whole value (index 0) or empty (index ≥1),
 *      note recorded (was: silent garbage nesting, e.g. "AC-2/AC/AC-2.md")
 *   3. regex() matches nothing → empty piece, note recorded (was: silent)
 *
 * And the determinism invariant: the report is purely observational — render()
 * output is byte-identical with and without it (Ch 22 Pass-1 hashability).
 */

import { render, renderTemplate, RenderError } from '../src/render';
import type { Recipe, RenderReport } from '../src/render';

function freshReport(): RenderReport {
	return { notes: [] };
}

/** CSF-style recipe: function folder / category folder / leaf file. */
const csfStyleRecipe: Recipe = {
	recipe: 'test-csf-style',
	target: {
		layout: [
			{ level: 'function', mechanism: 'folder', template: '{id|split(.,0)}' },
			{ level: 'category', mechanism: 'folder', template: '{id|split(-,0)}' },
			{ level: 'subcategory', mechanism: 'file', template: '{id|fs-safe}.md' },
		],
	},
};

describe('render report — happy path', () => {
	it('records zero notes when every row fits the pattern', () => {
		const report = freshReport();
		const address = render(csfStyleRecipe, { curie: 'csf:GV.OC-01', scope: { id: 'GV.OC-01' } }, report);
		expect(report.notes).toHaveLength(0);
		expect(address.primary.path).toBe('GV/GV.OC/GV.OC-01.md');
	});

	it('is purely observational — output byte-identical with and without a report', () => {
		const withReport = render(
			csfStyleRecipe,
			{ curie: 'csf:AC-2', scope: { id: 'AC-2' } },
			freshReport(),
		);
		const withoutReport = render(csfStyleRecipe, { curie: 'csf:AC-2', scope: { id: 'AC-2' } });
		expect(withReport).toEqual(withoutReport);
	});
});

describe('render report — split() deviations', () => {
	it('records split-no-delimiter when the value has no delimiter (index 0 → whole value)', () => {
		const report = freshReport();
		// "AC-2" has no "." — split(.,0) falls back to the whole value as the
		// function folder. That is the silent-garbage-nesting case: the row
		// still imports, but now the deviation is visible.
		const address = render(csfStyleRecipe, { curie: 'csf:AC-2', scope: { id: 'AC-2' } }, report);
		expect(address.primary.path).toBe('AC-2/AC/AC-2.md');
		const codes = report.notes.map((n) => n.code);
		expect(codes).toContain('split-no-delimiter');
		const note = report.notes.find((n) => n.code === 'split-no-delimiter');
		expect(note?.detail).toContain('AC-2');
		expect(note?.detail).toContain('whole value');
	});

	it('records split-no-delimiter AND folder-level-skipped when index ≥1 comes back empty', () => {
		const recipe: Recipe = {
			recipe: 'test-deep-piece',
			target: {
				layout: [
					{ level: 'parent', mechanism: 'folder', template: '{id|split(.,1)}' },
					{ level: 'leaf', mechanism: 'file', template: '{id|fs-safe}.md' },
				],
			},
		};
		const report = freshReport();
		// "T1055" has no "." — piece 1 is empty, so the folder level is skipped
		// and the note lands one level up. Both facts are recorded.
		const address = render(recipe, { curie: 'attack:T1055', scope: { id: 'T1055' } }, report);
		expect(address.primary.path).toBe('T1055.md');
		const codes = report.notes.map((n) => n.code);
		expect(codes).toContain('split-no-delimiter');
		expect(codes).toContain('folder-level-skipped');
		const skip = report.notes.find((n) => n.code === 'folder-level-skipped');
		expect(skip?.level).toBe('parent');
	});

	it('records split-index-missing when the index is past the available pieces', () => {
		const report = freshReport();
		const out = renderTemplate('{id|split(.,5)}', { id: 'A.B' }, report);
		expect(out).toBe('');
		expect(report.notes.map((n) => n.code)).toContain('split-index-missing');
	});
});

describe('render report — regex() deviations', () => {
	it('records regex-no-match when the pattern matches nothing', () => {
		const report = freshReport();
		const out = renderTemplate('{id|regex(\\d+)}', { id: 'ABC' }, report);
		expect(out).toBe('');
		expect(report.notes.map((n) => n.code)).toContain('regex-no-match');
	});
});

describe('render report — folder-level-skipped', () => {
	it('records the level id and stays out of the path', () => {
		const recipe: Recipe = {
			recipe: 'test-empty-level',
			target: {
				layout: [
					{ level: 'group', mechanism: 'folder', template: '{group|trim}' },
					{ level: 'leaf', mechanism: 'file', template: '{id|fs-safe}.md' },
				],
			},
		};
		const report = freshReport();
		const address = render(recipe, { curie: 'x:1', scope: { group: '   ', id: 'X-1' } }, report);
		expect(address.primary.path).toBe('X-1.md');
		expect(report.notes).toHaveLength(1);
		expect(report.notes[0].code).toBe('folder-level-skipped');
		expect(report.notes[0].level).toBe('group');
		expect(report.notes[0].detail).toContain('group');
	});
});

describe('render report — unchanged fail-fast behavior', () => {
	it('file mechanism still throws on empty (report does not swallow errors)', () => {
		const recipe: Recipe = {
			recipe: 'test-empty-file',
			target: {
				layout: [{ level: 'leaf', mechanism: 'file', template: '{id|trim}' }],
			},
		};
		expect(() => render(recipe, { curie: 'x:1', scope: { id: '  ' } }, freshReport())).toThrow(
			RenderError,
		);
	});

	it('renderTemplate without a report arg keeps working (backward compat)', () => {
		expect(renderTemplate('{id|split(.,0)}', { id: 'AC-2' })).toBe('AC-2');
	});
});
