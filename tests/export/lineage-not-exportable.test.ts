/**
 * lineage-not-exportable.test.ts — the two exporters must REFUSE release
 * lineage, not translate it (Ch 43, 2026-08-28).
 *
 * This file exists because the gap it guards is invisible to the type checker.
 * Both `STRM_TO_OLIR` and `STRM_TO_SKOS` are declared `Record<string, string>`,
 * so `map[edge.predicate_id] ?? fallback` compiles cleanly for a predicate the
 * map has never heard of. Before this change, exporting a withdrawal record
 * ("AC-2 was replaced by PT-1") produced the OLIR row `Relationship:
 * intersects with` and the SSSOM row `predicate_id: skos:relatedMatch` — an
 * auditor-facing set-theoretic claim that the old control and its replacement
 * overlap in scope, which nobody asserted and which is not what lineage means.
 *
 * A reviewer reading the diff would not have seen the gap, so the test says it
 * out loud: the fabricated strings are asserted ABSENT by name.
 */

import { crosswalkEdgesToStrmTsv } from '../../src/export/strm-tsv-exporter';
import { crosswalkEdgesToSssomTsv } from '../../src/export/sssom-exporter';
import { LINEAGE_NOT_REPRESENTABLE_REASON } from '../../src/tier2/predicate-characteristics';
import type { CrosswalkEdgeRow } from '../../src/export/vault-reader';

function edge(overrides: Partial<CrosswalkEdgeRow> = {}): CrosswalkEdgeRow {
	return {
		kind: 'crosswalk-edge',
		path: 'edges/ordinary.md',
		curie: 'xwalk:ordinary',
		subject_id: 'iso27001:A.9.2.1',
		predicate_id: 'is_equivalent_to',
		object_id: 'nist-800-53:AC-2',
		tags: [],
		frontmatter: {},
		...overrides,
	};
}

const LINEAGE = edge({
	path: 'edges/lineage.md',
	curie: 'xwalk:lineage',
	subject_id: 'nist-r4:AC-2',
	predicate_id: 'superseded_by',
	object_id: 'nist-r5:PT-1',
});

const INVERSE_LINEAGE = edge({
	path: 'edges/lineage-inverse.md',
	curie: 'xwalk:lineage-inverse',
	subject_id: 'nist-r5:PT-1',
	predicate_id: 'supersedes',
	object_id: 'nist-r4:AC-2',
});

describe('STRM/OLIR TSV export refuses release lineage', () => {
	it('excludes the lineage row, keeps the ordinary one, and counts the refusal', () => {
		const result = crosswalkEdgesToStrmTsv([edge(), LINEAGE]);

		expect(result.rowCount).toBe(1);
		expect(result.tsv).toContain('A.9.2.1');
		expect(result.tsv).not.toContain('AC-2\tnist-r5');
		expect(result.skipped).toEqual([
			{ path: 'edges/lineage.md', reason: LINEAGE_NOT_REPRESENTABLE_REASON },
		]);
	});

	it('does not emit the fabricated "intersects with" claim for a lineage row', () => {
		// The exact string the `??` fallback would have produced. Asserted by
		// name so a future reviewer sees what is being prevented.
		const result = crosswalkEdgesToStrmTsv([LINEAGE]);
		expect(result.tsv).not.toContain('intersects with');
		expect(result.rowCount).toBe(0);
	});

	it('refuses the inverse spelling too', () => {
		const result = crosswalkEdgesToStrmTsv([INVERSE_LINEAGE]);
		expect(result.rowCount).toBe(0);
		expect(result.skipped[0].reason).toBe(LINEAGE_NOT_REPRESENTABLE_REASON);
	});
});

describe('SSSOM TSV export refuses release lineage', () => {
	it('excludes the lineage row, keeps the ordinary one, and counts the refusal', () => {
		const result = crosswalkEdgesToSssomTsv([edge(), LINEAGE]);

		expect(result.rowCount).toBe(1);
		expect(result.tsv).toContain('A.9.2.1');
		expect(result.tsv).not.toContain('nist-r5:PT-1');
		expect(result.skipped).toEqual([
			{ path: 'edges/lineage.md', reason: LINEAGE_NOT_REPRESENTABLE_REASON },
		]);
	});

	it('does not label a withdrawal record skos:relatedMatch', () => {
		const result = crosswalkEdgesToSssomTsv([LINEAGE]);
		expect(result.tsv).not.toContain('skos:relatedMatch');
		expect(result.rowCount).toBe(0);
	});

	// The per-note `sssom_predicate` override is normally authoritative. It must
	// not become a way to smuggle a lineage row into a mapping-set export, since
	// that is precisely the file an auditor would trust.
	it('is not overridable by a hand-written sssom_predicate', () => {
		const result = crosswalkEdgesToSssomTsv([
			{ ...LINEAGE, frontmatter: { sssom_predicate: 'dcterms:isReplacedBy' } },
		]);
		expect(result.rowCount).toBe(0);
		expect(result.tsv).not.toContain('dcterms:isReplacedBy');
		expect(result.skipped[0].reason).toBe(LINEAGE_NOT_REPRESENTABLE_REASON);
	});

	it('refuses the inverse spelling too', () => {
		const result = crosswalkEdgesToSssomTsv([INVERSE_LINEAGE]);
		expect(result.rowCount).toBe(0);
		expect(result.skipped[0].reason).toBe(LINEAGE_NOT_REPRESENTABLE_REASON);
	});
});
