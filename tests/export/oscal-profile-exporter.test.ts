/**
 * oscal-profile-exporter.test.ts — v0.1.7 exporters: OSCAL Profile SKELETON.
 *
 * Only the implemented surface is tested: the `imports` shell built from
 * concept notes' ontology prefixes. `crosswalkEdgesToOscalMapping` is
 * intentionally NOT implemented (see that file's module doc comment for the
 * scoping rationale) — this test pins that it says so honestly rather than
 * fabricating output.
 */

import { conceptsToOscalProfileSkeleton, crosswalkEdgesToOscalMapping } from '../../src/export/oscal-profile-exporter';
import type { ConceptRow, CrosswalkEdgeRow } from '../../src/export/vault-reader';

function concept(curie: string): ConceptRow {
	return { kind: 'concept', path: `${curie}.md`, curie, aliases: [], tags: [], children: [], frontmatter: {} };
}

describe('conceptsToOscalProfileSkeleton', () => {
	it('builds one `imports` entry per distinct ontology prefix, sorted', () => {
		const rows = [concept('nist:AC-2'), concept('iso27001:A.9.2.1'), concept('nist:AC-3')];
		const result = conceptsToOscalProfileSkeleton(rows, { uuid: 'fixed-uuid', lastModified: '2026-01-01T00:00:00.000Z' });
		expect(result.importedOntologies).toEqual(['iso27001', 'nist']);
		expect(result.profile.profile.imports).toEqual([
			{ href: '#iso27001', 'include-all': {} },
			{ href: '#nist', 'include-all': {} },
		]);
	});

	it('emits structurally-valid, parseable JSON with the requested metadata', () => {
		const result = conceptsToOscalProfileSkeleton([concept('nist:AC-2')], {
			title: 'Test profile',
			version: '1.2.3',
			uuid: 'fixed-uuid',
			lastModified: '2026-01-01T00:00:00.000Z',
		});
		const parsed = JSON.parse(result.json);
		expect(parsed.profile.uuid).toBe('fixed-uuid');
		expect(parsed.profile.metadata.title).toBe('Test profile');
		expect(parsed.profile.metadata.version).toBe('1.2.3');
		expect(parsed.profile.metadata['oscal-version']).toBe('1.1.2');
	});

	it('is deterministic given the same options + rows regardless of row order', () => {
		const a = concept('nist:AC-2');
		const b = concept('iso27001:A.1');
		const opts = { uuid: 'u', lastModified: 't' };
		expect(conceptsToOscalProfileSkeleton([a, b], opts).json).toBe(conceptsToOscalProfileSkeleton([b, a], opts).json);
	});
});

describe('crosswalkEdgesToOscalMapping — honest not-implemented', () => {
	it('returns implemented: false with a reason instead of fabricating mapping output', () => {
		const edges: CrosswalkEdgeRow[] = [
			{
				kind: 'crosswalk-edge',
				path: 'a.md',
				curie: 'xwalk:a',
				subject_id: 'nist:AC-2',
				predicate_id: 'is_equivalent_to',
				object_id: 'iso27001:A.9.2.1',
				tags: [],
				frontmatter: {},
			},
		];
		const result = crosswalkEdgesToOscalMapping(edges);
		expect(result.implemented).toBe(false);
		expect(result.reason).toMatch(/out of scope/i);
	});
});
