/**
 * sssom-parser.test.ts — Phase 2 v0.1.6 unit tests for the SSSOM TSV parser
 *
 * Per Ch 35 SSSOM TSV import. Tests cover:
 *   - Valid SSSOM file with header + data rows
 *   - Missing required column → fails
 *   - Empty file → fails
 *   - Confidence column type-coercion to number
 *   - curie_map nested header parsing
 *   - Ontology pair detection from header + from CURIE prefixes
 *   - Optional columns preserved verbatim
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
	parseSssomTsv,
	detectOntologyPair,
	curiePrefix,
} from '../src/import/sssom-parser';

const FIXTURE_PATH = join(__dirname, '..', 'tools', 'fixtures', 'synthetic', 'nist-csf-to-iso27001.sssom.tsv');

describe('parseSssomTsv — happy path on real fixture', () => {
	const content = readFileSync(FIXTURE_PATH, 'utf-8');
	const result = parseSssomTsv(content);

	it('parses without errors', () => {
		expect(result.errors).toEqual([]);
	});

	it('parses 11 mapping rows', () => {
		expect(result.rows.length).toBe(11);
	});

	it('parses required SSSOM cols on first row', () => {
		const row = result.rows[0];
		expect(row.subject_id).toBe('csf:GV.OC-01');
		expect(row.predicate_id).toBe('skos:closeMatch');
		expect(row.object_id).toBe('iso27001:A.5.1');
	});

	it('coerces confidence to number', () => {
		const row = result.rows[0];
		expect(typeof row.confidence).toBe('number');
		expect(row.confidence).toBeCloseTo(0.85);
	});

	it('preserves optional cols (subject_label, mapping_justification, mapping_provider)', () => {
		const row = result.rows[0];
		expect(row.subject_label).toBe('Organizational Context — strategy and mission');
		expect(row.mapping_justification).toBe('semapv:ManualMappingCuration');
		expect(row.mapping_provider).toBe('Crosswalker test fixture');
	});

	it('parses curie_map nested header', () => {
		const map = result.header.curie_map as Record<string, string>;
		expect(map).toBeDefined();
		expect(map.csf).toBe('https://csrc.nist.gov/projects/cybersecurity-framework/csf/');
		expect(map.iso27001).toBe('https://www.iso.org/standard/27001/');
		expect(map.skos).toBe('http://www.w3.org/2004/02/skos/core#');
	});

	it('parses top-level header fields', () => {
		expect(result.header.mapping_set_id).toBe('https://crosswalker.dev/fixtures/nist-csf-to-iso27001');
		expect(result.header.subject_source).toBe('csf');
		expect(result.header.object_source).toBe('iso27001');
		expect(result.header.license).toBe('https://creativecommons.org/publicdomain/zero/1.0/');
	});
});

describe('parseSssomTsv — error cases', () => {
	it('returns error for empty content', () => {
		const result = parseSssomTsv('');
		expect(result.errors.length).toBeGreaterThan(0);
		expect(result.errors[0]).toMatch(/empty/i);
	});

	it('returns error when required column is missing', () => {
		// Missing predicate_id
		const tsv = `subject_id\tobject_id\nfoo:1\tbar:1`;
		const result = parseSssomTsv(tsv);
		expect(result.errors.length).toBeGreaterThan(0);
		expect(result.errors[0]).toMatch(/predicate_id/);
	});

	it('skips rows missing required fields with a warning', () => {
		const tsv = `subject_id\tpredicate_id\tobject_id
csf:A	skos:closeMatch	iso:1
	skos:closeMatch	iso:2
csf:B	skos:closeMatch	`;
		const result = parseSssomTsv(tsv);
		expect(result.errors).toEqual([]);
		expect(result.rows.length).toBe(1);
		expect(result.rows[0].subject_id).toBe('csf:A');
		expect(result.warnings.length).toBeGreaterThanOrEqual(2);
	});

	it('warns on non-numeric confidence', () => {
		const tsv = `subject_id\tpredicate_id\tobject_id\tconfidence
csf:A	skos:closeMatch	iso:1	high`;
		const result = parseSssomTsv(tsv);
		expect(result.errors).toEqual([]);
		expect(result.rows.length).toBe(1);
		expect(result.rows[0].confidence).toBeUndefined();
		expect(result.warnings.some((w) => /not a number/i.test(w))).toBe(true);
	});
});

describe('detectOntologyPair', () => {
	it('uses header subject_source/object_source when present', () => {
		const result = parseSssomTsv(`# subject_source: "csf"
# object_source: "iso27001"
subject_id	predicate_id	object_id
csf:A	skos:closeMatch	iso27001:1`);
		expect(detectOntologyPair(result)).toEqual({ source: 'csf', target: 'iso27001' });
	});

	it('falls back to CURIE prefix detection from first row', () => {
		const result = parseSssomTsv(`subject_id	predicate_id	object_id
nist:AC-1	skos:closeMatch	iso:A.5.16`);
		expect(detectOntologyPair(result)).toEqual({ source: 'nist', target: 'iso' });
	});

	it('returns null when no rows + no header source/target', () => {
		const result = parseSssomTsv(`subject_id\tpredicate_id\tobject_id`);
		expect(detectOntologyPair(result)).toBeNull();
	});
});

describe('curiePrefix', () => {
	it.each([
		['csf:GV.OC-01', 'csf'],
		['iso27001:A.5.1', 'iso27001'],
		['skos:closeMatch', 'skos'],
		['no-colon', null],
		[':leading-colon', null],
	])('curiePrefix(%s) → %s', (input, expected) => {
		expect(curiePrefix(input)).toBe(expected);
	});
});
