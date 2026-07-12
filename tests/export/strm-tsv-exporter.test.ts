/**
 * strm-tsv-exporter.test.ts — v0.1.7 exporters: crosswalk-edge notes -> OLIR/STRM-shaped TSV.
 */

import { crosswalkEdgesToStrmTsv } from '../../src/export/strm-tsv-exporter';
import type { CrosswalkEdgeRow } from '../../src/export/vault-reader';

function edge(overrides: Partial<CrosswalkEdgeRow> = {}): CrosswalkEdgeRow {
	return {
		kind: 'crosswalk-edge',
		path: 'edges/a.md',
		curie: 'xwalk:a',
		subject_id: 'nist-800-53:AC-2',
		predicate_id: 'is_narrower_than',
		object_id: 'cri-profile:GV.OC-03.01',
		tags: [],
		frontmatter: {},
		...overrides,
	};
}

describe('crosswalkEdgesToStrmTsv', () => {
	it('emits the OLIR template column header exactly', () => {
		const result = crosswalkEdgesToStrmTsv([edge()]);
		const header = result.tsv.split('\n')[0];
		expect(header.split('\t')).toEqual([
			'Focal Document',
			'Focal Document Element',
			'Reference Document',
			'Reference Document Element',
			'Relationship',
			'Strength of Relationship (Optional)',
			'Rationale',
		]);
	});

	it('reverse-maps every STRM predicate to its OLIR relationship label', () => {
		const cases: [string, string][] = [
			['is_equivalent_to', 'equal'],
			['is_narrower_than', 'subset of'],
			['is_broader_than', 'superset of'],
			['intersects_with', 'intersects with'],
			['is_approximate_to', 'intersects with'], // documented lossy fallback
			['no_relationship', 'not related'],
		];
		for (const [strm, olir] of cases) {
			const result = crosswalkEdgesToStrmTsv([edge({ predicate_id: strm })]);
			const dataLine = result.tsv.split('\n')[1];
			expect(dataLine.split('\t')[4]).toBe(olir);
		}
	});

	it('splits CURIEs into Focal/Reference Document + Element via the CURIE prefix', () => {
		const result = crosswalkEdgesToStrmTsv([edge()]);
		const cols = result.tsv.split('\n')[1].split('\t');
		expect(cols[0]).toBe('nist-800-53'); // Focal Document (from subject_id prefix, no source_framework field set)
		expect(cols[1]).toBe('AC-2'); // Focal Document Element
		expect(cols[2]).toBe('cri-profile');
		expect(cols[3]).toBe('GV.OC-03.01');
	});

	it('prefers source_framework/target_framework frontmatter over the CURIE prefix when present', () => {
		const result = crosswalkEdgesToStrmTsv([
			edge({ frontmatter: { source_framework: 'nist-800-53-r5', target_framework: 'cri-v2-2' } }),
		]);
		const cols = result.tsv.split('\n')[1].split('\t');
		expect(cols[0]).toBe('nist-800-53-r5');
		expect(cols[2]).toBe('cri-v2-2');
	});

	it('converts 0-1 match_confidence to OLIR\'s 0-10 strength scale', () => {
		const result = crosswalkEdgesToStrmTsv([edge({ match_confidence: 0.8 })]);
		const cols = result.tsv.split('\n')[1].split('\t');
		expect(cols[5]).toBe('8');
	});

	it('skips rows missing subject_id/object_id', () => {
		const result = crosswalkEdgesToStrmTsv([edge({ subject_id: '' })]);
		expect(result.rowCount).toBe(0);
		expect(result.skipped).toHaveLength(1);
	});
});
