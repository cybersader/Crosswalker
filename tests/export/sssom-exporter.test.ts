/**
 * sssom-exporter.test.ts — v0.1.7 exporters.
 *
 * The acceptance test IS the round-trip (per the milestone brief): import a
 * real crosswalk-mapping fixture, read the generated notes back via
 * vault-reader, export them to a fresh SSSOM TSV, re-import THAT into a
 * second empty mock vault, read those notes back too, and assert the two
 * edge sets are equal on every field the existing importer actually persists
 * to note frontmatter (modulo field ordering — compared as sorted tuples,
 * not raw TSV text). Fields the importer does NOT persist (match_type,
 * mapping_date) are legitimately unrecoverable and are called out in
 * sssom-exporter.ts's module doc comment rather than asserted here.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { importSssom } from '../../src/import/sssom-importer';
import { readVaultTree, type CrosswalkEdgeRow } from '../../src/export/vault-reader';
import { crosswalkEdgesToSssomTsv } from '../../src/export/sssom-exporter';
import { makeMockApp } from './helpers';

const FIXTURE_PATH = join(__dirname, '..', '..', 'tools', 'fixtures', 'realistic', 'iso27001-to-soc2.sssom.tsv');

/** Round-trip comparison key: every field the CURRENT sssom-importer synthetic
 *  recipe actually writes to note frontmatter (see sssom-exporter.ts's module
 *  doc comment for the fields it does NOT write, e.g. mapping_date/match_type). */
function comparableTuple(edge: CrosswalkEdgeRow): Record<string, unknown> {
	const fm = edge.frontmatter;
	const rawConfidence = fm.match_confidence ?? fm.sssom_confidence ?? fm.confidence;
	const confidence =
		typeof rawConfidence === 'number'
			? rawConfidence
			: typeof rawConfidence === 'string' && rawConfidence.trim() !== ''
				? Number.parseFloat(rawConfidence)
				: undefined;
	return {
		subject_id: edge.subject_id,
		sssom_predicate: fm.sssom_predicate,
		mapping_set_id: edge.mapping_set_id,
		subject_id: edge.subject_id,
		predicate_modifier: edge.predicate_modifier,
		object_id: edge.object_id,
		mapping_justification: edge.mapping_justification,
		confidence: confidence !== undefined ? Math.round(confidence * 1000) / 1000 : undefined,
		subject_label: fm.subject_label,
		object_label: fm.object_label,
		mapping_provider: edge.mapping_provider,
	};
}

function sortedTuples(edges: CrosswalkEdgeRow[]): Record<string, unknown>[] {
	return [...edges]
		.map(comparableTuple)
		.sort((a, b) => `${a.subject_id}|${a.object_id}`.localeCompare(`${b.subject_id}|${b.object_id}`));
}

describe('SSSOM export — round trip (import -> read -> export -> re-import -> read)', () => {
	it('produces an identical edge set (modulo field ordering) for the ISO 27001 -> SOC 2 fixture', async () => {
		const tsv = readFileSync(FIXTURE_PATH, 'utf-8');

		// Pass 1: import the real fixture.
		const app1 = makeMockApp();
		const result1 = await importSssom(app1.app, tsv, null, null, { runTier2Projection: false });
		expect(result1.skipped).toBeUndefined();
		expect(result1.generation?.success).toBe(true);
		expect(result1.folder).toBe('_crosswalker/mappings/iso27001-to-soc2');

		const tree1 = await readVaultTree(app1.app, result1.folder!);
		expect(tree1.skipped).toEqual([]);
		expect(tree1.crosswalkEdges).toHaveLength(10); // the fixture has 10 data rows

		// Export what was just read back.
		const exported = crosswalkEdgesToSssomTsv(tree1.crosswalkEdges);
		expect(exported.rowCount).toBe(10);
		expect(exported.skipped).toEqual([]);
		expect(exported.tsv).toContain('# subject_source: "iso27001"');
		expect(exported.tsv).toContain('# object_source: "soc2"');

		// Pass 2: re-import the EXPORTED tsv into a fresh, unrelated mock vault.
		const app2 = makeMockApp();
		const result2 = await importSssom(app2.app, exported.tsv, null, null, { runTier2Projection: false });
		expect(result2.skipped).toBeUndefined();
		expect(result2.generation?.success).toBe(true);
		// Header-derived source/target round-tripped through the header we wrote.
		expect(result2.source).toBe('iso27001');
		expect(result2.target).toBe('soc2');

		const tree2 = await readVaultTree(app2.app, result2.folder!);
		expect(tree2.skipped).toEqual([]);
		expect(tree2.crosswalkEdges).toHaveLength(10);

		// The acceptance criterion: the two edge sets are equal on every
		// field the importer persists, independent of file/row order.
		expect(sortedTuples(tree2.crosswalkEdges)).toEqual(sortedTuples(tree1.crosswalkEdges));
	});
});

describe('crosswalkEdgesToSssomTsv — unit behavior', () => {
	const baseEdge = (overrides: Partial<CrosswalkEdgeRow> = {}): CrosswalkEdgeRow => ({
		kind: 'crosswalk-edge',
		path: 'edges/a.md',
		curie: 'xwalk:a',
		subject_id: 'nist:AC-2',
		predicate_id: 'is_narrower_than',
		object_id: 'iso27001:A.9.2.1',
		tags: [],
		frontmatter: {},
		...overrides,
	});

	it('prefers the note\'s sssom_predicate field over the reverse-STRM fallback', () => {
		const edge = baseEdge({ frontmatter: { sssom_predicate: 'skos:broadMatch' } });
		const result = crosswalkEdgesToSssomTsv([edge]);
		expect(result.tsv).toContain('skos:broadMatch');
		expect(result.tsv).not.toContain('skos:relatedMatch');
	});

	it('falls back to the reverse-STRM map when sssom_predicate is absent', () => {
		// is_narrower_than has no sssom_predicate on the note -> reverse map -> skos:broadMatch
		const edge = baseEdge({ frontmatter: {} });
		const result = crosswalkEdgesToSssomTsv([edge]);
		expect(result.tsv).toContain('skos:broadMatch');
	});

	it('resolves confidence from match_confidence first, then sssom_confidence (string), then confidence', () => {
		const withMatchConfidence = crosswalkEdgesToSssomTsv([baseEdge({ match_confidence: 0.42, frontmatter: { sssom_confidence: '0.9' } })]);
		expect(withMatchConfidence.tsv).toContain('0.42');

		const withSssomConfidenceString = crosswalkEdgesToSssomTsv([baseEdge({ frontmatter: { sssom_confidence: '0.77' } })]);
		expect(withSssomConfidenceString.tsv).toContain('0.77');

		const withNeither = crosswalkEdgesToSssomTsv([baseEdge({ frontmatter: {} })]);
		// no numeric confidence anywhere -> the confidence column is empty for that row
		const dataLine = withNeither.tsv.split('\n').find((l) => l.startsWith('nist:AC-2'));
		expect(dataLine?.split('\t')[5]).toBe('');
	});

	it('skips rows missing subject_id/object_id and reports them in `skipped`', () => {
		const result = crosswalkEdgesToSssomTsv([baseEdge({ subject_id: '' })]);
		expect(result.rowCount).toBe(0);
		expect(result.skipped).toEqual([{ path: 'edges/a.md', reason: 'missing subject_id/object_id' }]);
	});

	it('emits predicate_modifier immediately after object_id and normalizes mapping-set IDs', () => {
		const positive = baseEdge({ path: 'a.md', mapping_set_id: ' Set-A ' });
		const negated = baseEdge({ path: 'b.md', subject_id: 'nist:AC-3', predicate_modifier: 'NOT', mapping_set_id: 'Set-A' });
		const result = crosswalkEdgesToSssomTsv([positive, negated]);
		const lines = result.tsv.trimEnd().split('\n');
		const header = lines.find((line) => line.startsWith('subject_id'))!;
		expect(header.split('\t').slice(0, 4)).toEqual(['subject_id', 'predicate_id', 'object_id', 'predicate_modifier']);
		const data = lines.filter((line) => line.startsWith('nist:'));
		expect(data[0].split('\t')[3]).toBe('');
		expect(data[1].split('\t')[3]).toBe('NOT');
		expect(result.tsv).toContain('# mapping_set_id: "Set-A"');
	});

	it('promotes the MODE of mapping_provider/mapping_set_id across rows into the header', () => {
		const edges = [
			baseEdge({ path: 'a.md', mapping_provider: 'NIST OLIR', frontmatter: { mapping_set_id: 'set-1' } }),
			baseEdge({ path: 'b.md', subject_id: 'nist:AC-3', mapping_provider: 'NIST OLIR', frontmatter: { mapping_set_id: 'set-1' } }),
			baseEdge({ path: 'c.md', subject_id: 'nist:AC-4', mapping_provider: 'Someone Else', frontmatter: { mapping_set_id: 'set-2' } }),
		];
		const result = crosswalkEdgesToSssomTsv(edges);
		expect(result.tsv).toContain('# mapping_provider: "NIST OLIR"');
		expect(result.tsv).toContain('# mapping_set_id: "set-1"');
	});

	it('is deterministic regardless of input row order', () => {
		const a = baseEdge({ path: 'z.md', subject_id: 'nist:AC-9' });
		const b = baseEdge({ path: 'a.md', subject_id: 'nist:AC-1' });
		const forward = crosswalkEdgesToSssomTsv([a, b]);
		const backward = crosswalkEdgesToSssomTsv([b, a]);
		expect(forward.tsv).toBe(backward.tsv);
	});
});
