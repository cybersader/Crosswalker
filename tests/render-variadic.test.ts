/**
 * render-variadic.test.ts — variable-depth folder expansion (2026-07-05 design §1–3).
 *
 * A fixed layout lists its folder levels ahead of time; ragged ids (ATT&CK
 * `T1055` vs `T1055.011`) carry a different number of pieces per row. A
 * `variadic` block on a folder entry explodes the rendered scalar into a
 * variable number of folder levels *after* templating.
 *
 * Pins the Ch 42 ATT&CK acceptance pair, prefix vs part segment modes,
 * drop_last, max_depth overflow (truncate + error), empty-part handling, the
 * non-folder guard, determinism, and a non-variadic regression.
 */

import { render, RenderError } from '../src/render';
import type { Recipe, RenderReport, ConceptIdentity } from '../src/render';

function freshReport(): RenderReport {
	return { notes: [] };
}

/** ATT&CK-style recipe: fixed `Techniques` root, then a variadic technique folder, then the file. */
function attackRecipe(variadic: Record<string, unknown> = {}): Recipe {
	return {
		recipe: 'attack-variadic',
		target: {
			layout: [
				{ level: 'root', mechanism: 'folder', template: 'Techniques' },
				{
					level: 'technique',
					mechanism: 'folder',
					template: '{id}',
					variadic: { delimiter: '.', ...variadic },
				},
				{ level: 'technique', mechanism: 'file', template: '{id|fs-safe}.md' },
			],
		},
	};
}

function id(value: string): ConceptIdentity {
	return { curie: `attack:${value}`, scope: { id: value } };
}

describe('variadic — ATT&CK acceptance pair (Ch 42)', () => {
	it('T1055 (top-level id) → zero parent folders, zero deviation notes', () => {
		const report = freshReport();
		const a = render(attackRecipe(), id('T1055'), report);
		expect(a.primary.path).toBe('Techniques/T1055.md');
		expect(report.notes).toHaveLength(0);
	});

	it('T1055.011 (sub-technique) → nests under the parent folder (prefix mode)', () => {
		const report = freshReport();
		const a = render(attackRecipe(), id('T1055.011'), report);
		expect(a.primary.path).toBe('Techniques/T1055/T1055.011.md');
		expect(report.notes).toHaveLength(0);
	});
});

describe('variadic — segment modes', () => {
	// Three-part id X.Y.Z with drop_last (default) leaves parts [X, Y].
	const threePart = (variadic: Record<string, unknown>): string =>
		render(attackRecipe(variadic), id('X.Y.Z')).primary.path;

	it('prefix mode builds cumulative prefixes (X/X.Y/)', () => {
		expect(threePart({ segment: 'prefix' })).toBe('Techniques/X/X.Y/X.Y.Z.md');
	});

	it('part mode builds raw pieces (X/Y/)', () => {
		expect(threePart({ segment: 'part' })).toBe('Techniques/X/Y/X.Y.Z.md');
	});

	it('defaults to prefix mode when segment is omitted', () => {
		expect(threePart({})).toBe('Techniques/X/X.Y/X.Y.Z.md');
	});
});

describe('variadic — drop_last', () => {
	it('drop_last: false keeps the leaf segment as a folder', () => {
		const a = render(attackRecipe({ drop_last: false }), id('T1055.011'));
		// parts [T1055, 011] both kept → prefix mode: T1055, T1055.011
		expect(a.primary.path).toBe('Techniques/T1055/T1055.011/T1055.011.md');
	});
});

describe('variadic — max_depth overflow', () => {
	it('truncate keeps the first max_depth segments + emits variadic-overflow-truncated', () => {
		const report = freshReport();
		// A.B.C.D.E, drop_last → [A,B,C,D] → prefix segments [A, A.B, A.B.C, A.B.C.D] (4);
		// max_depth 2 keeps [A, A.B].
		const a = render(attackRecipe({ max_depth: 2 }), id('A.B.C.D.E'), report);
		expect(a.primary.path).toBe('Techniques/A/A.B/A.B.C.D.E.md');
		expect(report.notes.map((n) => n.code)).toContain('variadic-overflow-truncated');
		const note = report.notes.find((n) => n.code === 'variadic-overflow-truncated');
		expect(note?.level).toBe('technique');
	});

	it('on_overflow: error throws RenderError past max_depth', () => {
		expect(() => render(attackRecipe({ max_depth: 2, on_overflow: 'error' }), id('A.B.C.D.E'))).toThrow(
			RenderError,
		);
	});

	it('does not truncate when the segment count is within max_depth', () => {
		const report = freshReport();
		render(attackRecipe({ max_depth: 6 }), id('T1055.011'), report);
		expect(report.notes.map((n) => n.code)).not.toContain('variadic-overflow-truncated');
	});
});

describe('variadic — empty-part handling', () => {
	it('A..B drops the empty piece with a folder-level-skipped note', () => {
		const report = freshReport();
		// "A..B".split(".") = [A, "", B] → empty dropped (1 note) → [A, B] →
		// drop_last → [A] → prefix → [A].
		const a = render(attackRecipe(), id('A..B'), report);
		expect(a.primary.path).toBe('Techniques/A/A..B.md');
		const codes = report.notes.map((n) => n.code);
		expect(codes).toContain('folder-level-skipped');
		const skip = report.notes.find((n) => n.code === 'folder-level-skipped');
		expect(skip?.level).toBe('technique');
	});
});

describe('variadic — determinism', () => {
	it('two identical calls produce deep-equal Addresses', () => {
		const a = render(attackRecipe(), id('T1055.011'));
		const b = render(attackRecipe(), id('T1055.011'));
		expect(a).toEqual(b);
		expect(JSON.stringify(a)).toBe(JSON.stringify(b));
	});
});

describe('variadic — guard', () => {
	it('throws RenderError when variadic appears on a non-folder mechanism', () => {
		const recipe: Recipe = {
			recipe: 'variadic-on-file',
			target: {
				layout: [
					{
						level: 'technique',
						mechanism: 'file',
						template: '{id}.md',
						variadic: { delimiter: '.' },
					},
				],
			},
		};
		expect(() => render(recipe, id('T1055.011'))).toThrow(RenderError);
		expect(() => render(recipe, id('T1055.011'))).toThrow(/variadic/);
	});
});

describe('variadic — regression: non-variadic recipe unchanged', () => {
	// The exact recipe (a) all-folders shape from render.test.ts — must render
	// byte-identically with the variadic code path present.
	const recipe: Recipe = {
		recipe: 'nist-80053r5-allfolders',
		source: { ontology: 'nist-800-53-r5', levels: ['catalog', 'family', 'control'] },
		target: {
			layout: [
				{ level: 'catalog', mechanism: 'folder', template: 'Frameworks/{catalog.name}' },
				{ level: 'family', mechanism: 'folder', template: '{family.id}' },
				{ level: 'control', mechanism: 'file', template: '{control.id}.md' },
			],
		},
	};
	const identity: ConceptIdentity = {
		curie: 'nist:AC-2',
		scope: {
			catalog: { name: 'NIST 800-53 r5' },
			family: { id: 'AC', title: 'Access Control' },
			control: { id: 'AC-2', title: 'Account Management' },
		},
	};

	it('renders the fixed-depth path exactly as before', () => {
		const report = freshReport();
		const a = render(recipe, identity, report);
		expect(a.primary.path).toBe('Frameworks/NIST 800-53 r5/AC/AC-2.md');
		expect(a.wikilinkTarget).toBe('Frameworks/NIST 800-53 r5/AC/AC-2');
		expect(report.notes).toHaveLength(0);
	});
});
