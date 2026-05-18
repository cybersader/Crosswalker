/**
 * slug-derivation.test.ts — Phase 4.6 unit tests for the pure slugify() function.
 * Covers synthesis log §4 cases 1-5 + 9.
 */

import {
	slugify,
	addCollisionSuffix,
	queryFolderFor,
	indexFileFor,
	viewFileFor,
	MAX_SLUG_LENGTH,
} from '../src/views/query-frontmatter-schema';

describe('slugify — basic kebab-case derivation', () => {
	it('lowercases input', () => {
		expect(slugify('Coverage Matrix')).toBe('coverage-matrix');
	});

	it('replaces special characters with dashes', () => {
		expect(slugify('CSF × 800-53 Coverage')).toBe('csf-800-53-coverage');
	});

	it('collapses runs of dashes', () => {
		expect(slugify('foo --- bar')).toBe('foo-bar');
	});

	it('trims leading/trailing dashes', () => {
		expect(slugify('--foo-bar--')).toBe('foo-bar');
	});

	it('handles all-special-chars (case 2: empty result fallback)', () => {
		expect(slugify('@@@!!!')).toBe('query');
	});

	it('uses fallback queryId when input is empty', () => {
		expect(slugify('', 'q-2026-05-18-a1b2c3d4')).toBe('query-a1b2c3d4');
	});

	it('uses fallback queryId when input slugs to empty', () => {
		expect(slugify('!@#$%', 'q-2026-05-18-deadbeef')).toBe('query-deadbeef');
	});
});

describe('slugify — length limits (case 4)', () => {
	it('truncates over-length input at word boundary', () => {
		const input = 'this is a very long recipe name that exceeds the 48 char limit for sure';
		const result = slugify(input);
		expect(result.length).toBeLessThanOrEqual(MAX_SLUG_LENGTH);
		expect(result).not.toMatch(/-$/); // no trailing dash from truncation
	});

	it('hard-truncates when no dash boundary exists', () => {
		const input = 'a'.repeat(60);
		const result = slugify(input);
		expect(result.length).toBe(MAX_SLUG_LENGTH);
	});

	it('keeps short inputs unchanged', () => {
		expect(slugify('csf-coverage')).toBe('csf-coverage');
	});
});

describe('slugify — reserved names (case 3)', () => {
	it('appends -q to Windows-reserved names', () => {
		expect(slugify('con')).toBe('con-q');
		expect(slugify('NUL')).toBe('nul-q');
		expect(slugify('COM1')).toBe('com1-q');
		expect(slugify('lpt9')).toBe('lpt9-q');
	});

	it('appends -q to . and ..', () => {
		// "." and ".." get normalized; the period becomes a dash, then trimmed.
		// Both end up empty → query fallback (not reserved at that stage).
		expect(slugify('.')).toBe('query');
		expect(slugify('..')).toBe('query');
	});

	it('does NOT append to non-reserved names', () => {
		expect(slugify('confidence')).toBe('confidence');
		expect(slugify('control')).toBe('control');
	});
});

describe('slugify — leading digits + case insensitivity (cases 5, 9)', () => {
	it('allows leading digits', () => {
		expect(slugify('1-coverage')).toBe('1-coverage');
		expect(slugify('800-53')).toBe('800-53');
	});

	it('always lowercases (case 9: case-insensitivity for collision)', () => {
		expect(slugify('Coverage')).toBe('coverage');
		expect(slugify('COVERAGE')).toBe('coverage');
		expect(slugify('CoVeRaGe')).toBe('coverage');
	});
});

describe('addCollisionSuffix — programmatic collision resolution (case 7)', () => {
	it('appends a -<4hex> suffix', () => {
		const result = addCollisionSuffix('coverage', 'a1b2');
		expect(result).toBe('coverage-a1b2');
	});

	it('generates random 4-hex when not provided', () => {
		const result = addCollisionSuffix('coverage');
		expect(result).toMatch(/^coverage-[0-9a-f]{4}$/);
	});

	it('truncates base to fit when slug is near max length', () => {
		const longSlug = 'a'.repeat(MAX_SLUG_LENGTH);
		const result = addCollisionSuffix(longSlug, 'a1b2');
		expect(result.length).toBeLessThanOrEqual(MAX_SLUG_LENGTH);
		expect(result.endsWith('-a1b2')).toBe(true);
	});
});

describe('Path helpers — queryFolderFor / indexFileFor / viewFileFor', () => {
	it('produces canonical folder path', () => {
		expect(queryFolderFor('csf-coverage')).toBe('_crosswalker/queries/csf-coverage');
	});

	it('produces canonical index.md path', () => {
		expect(indexFileFor('csf-coverage')).toBe('_crosswalker/queries/csf-coverage/index.md');
	});

	it('produces canonical view.base path', () => {
		expect(viewFileFor('csf-coverage')).toBe('_crosswalker/queries/csf-coverage/view.base');
	});
});
