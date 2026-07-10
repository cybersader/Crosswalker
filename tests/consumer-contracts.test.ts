/**
 * consumer-contracts.test.ts — L2 of the testing doctrine (2026-07-10).
 *
 * Asserts generated note TEXT as PARSED by the consumer (a real YAML reader),
 * not the frontmatter object or the written string. This is the layer that would
 * have caught the unquoted-wikilink graph-death bug the day it landed: a value
 * meant as a link must round-trip back as a `[[...]]` STRING, never a nested
 * YAML array.
 *
 * Notes are built through the real generation-engine serializer
 * (`buildNoteContent`) so the quoting rules under test are the production ones.
 */

import { buildNoteContent } from '../src/generation/generation-engine';
import {
	parseNoteAsConsumer,
	assertLinkValue,
	extractWikilinkTargets,
} from './helpers/consumer-view';

describe('parseNoteAsConsumer', () => {
	it('splits frontmatter and body and parses YAML like the consumer', () => {
		const note = buildNoteContent({ title: 'Valid Accounts', curie: 'mitre:T1078' }, '# Valid Accounts\n');
		const { frontmatter, body } = parseNoteAsConsumer(note);
		expect(frontmatter.title).toBe('Valid Accounts');
		expect(frontmatter.curie).toBe('mitre:T1078');
		expect(body).toContain('# Valid Accounts');
	});

	it('throws on an unterminated frontmatter fence', () => {
		expect(() => parseNoteAsConsumer('---\ntitle: X\n# no close\n')).toThrow(/Unterminated/);
	});
});

describe('assertLinkValue — the historical unquoted-wikilink bug', () => {
	it('FAILS on the OLD broken (unquoted) form: [[T1078]] parses as a nested array', () => {
		// The exact byte shape the engine emitted BEFORE fix 7118faba. A YAML
		// reader parses `parent: [[T1078]]` as [["T1078"]] — an array, not a link.
		const broken = '---\nparent: [[T1078]]\n---\n# x\n';
		const { frontmatter } = parseNoteAsConsumer(broken);
		expect(Array.isArray(frontmatter.parent)).toBe(true); // proves it mangled
		expect(() => assertLinkValue(frontmatter, 'parent')).toThrow(/wikilink STRING|graph-death/);
	});

	it('PASSES on the fixed (quoted) form produced by buildNoteContent', () => {
		const note = buildNoteContent({ parent: '[[T1078]]' }, '');
		expect(note).toContain('parent: "[[T1078]]"'); // engine quotes it
		const { frontmatter } = parseNoteAsConsumer(note);
		expect(() => assertLinkValue(frontmatter, 'parent')).not.toThrow();
		expect(assertLinkValue(frontmatter, 'parent')).toBe('[[T1078]]');
	});

	it('throws when the key is absent or not a wikilink', () => {
		const { frontmatter } = parseNoteAsConsumer(buildNoteContent({ title: 'plain' }, ''));
		expect(() => assertLinkValue(frontmatter, 'parent')).toThrow(/key absent/);
		expect(() => assertLinkValue(frontmatter, 'title')).toThrow(/not a wikilink/);
	});
});

describe('frontmatter round-trips deep-equal the authoring intent', () => {
	// Representative of every value shape the engine emits: a quoted wikilink, an
	// array (tags), a nested object (provenance), and strings carrying YAML-hostile
	// characters (colon, hash, leading dash) that MUST be quoted to survive.
	const intent = {
		title: 'OS Credential Dumping',
		parent: '[[T1003]]',
		tags: ['tactic/credential-access', 'tactic/defense-evasion'],
		aliases: ['T1003', 'LSASS'],
		note_with_colon: 'ratio 3:1 applies here',
		note_with_hash: 'see #persistence for detail',
		note_with_dash: '- leading dash line',
		count: 4,
		enabled: true,
		_crosswalker: {
			spec_version: 'https://crosswalker.dev/spec/tier1.schema.json',
			produced_at: '1970-01-01T00:00:00.000Z',
			producer: { kind: 'plugin-engine', version: 'test' },
		},
	};

	it('every scalar, array, and nested-object value survives the YAML round-trip', () => {
		const note = buildNoteContent(intent, '# OS Credential Dumping\n');
		const { frontmatter } = parseNoteAsConsumer(note);
		expect(frontmatter).toEqual(intent);
	});

	it('the wikilink value survives as an indexable [[...]] string', () => {
		const note = buildNoteContent(intent, '');
		const { frontmatter } = parseNoteAsConsumer(note);
		expect(assertLinkValue(frontmatter, 'parent')).toBe('[[T1003]]');
		expect(extractWikilinkTargets(frontmatter.parent)).toEqual(['T1003']);
	});

	it('YAML-hostile strings do not silently mutate the mapping', () => {
		// If the colon string were unquoted, a YAML reader would split it into a
		// nested mapping; the deep-equal above already guards this, but assert the
		// type explicitly so a regression names the right culprit.
		const note = buildNoteContent(intent, '');
		const { frontmatter } = parseNoteAsConsumer(note);
		expect(typeof frontmatter.note_with_colon).toBe('string');
		expect(typeof frontmatter.note_with_hash).toBe('string');
		expect(typeof frontmatter.note_with_dash).toBe('string');
	});
});
