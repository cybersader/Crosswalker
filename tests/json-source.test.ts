/**
 * json-source.test.ts — the logical-source + iterator JSON reader
 * (tools/lib/json-source.ts) that feeds the headless fixtures harness.
 *
 * Shapes pinned here mirror the real corpus: STIX bundles ($.objects[*] +
 * type/revoked filtering), NIST CPRT exports ($.response.elements.elements[*]),
 * OSCAL catalogs ($.catalog.groups[*].controls[*] — the multi-fan case).
 */

import {
	iterateJsonPath,
	toSourceRows,
	parseWhere,
	applyWhere,
	jsonToRows,
} from '../tools/lib/json-source';

describe('iterateJsonPath', () => {
	const stixish = {
		type: 'bundle',
		objects: [
			{ type: 'attack-pattern', id: 'ap-1' },
			{ type: 'relationship', id: 'rel-1' },
		],
	};

	it('iterates a single fan-out ($.objects[*])', () => {
		expect(iterateJsonPath(stixish, '$.objects[*]')).toEqual(stixish.objects);
	});

	it('descends multiple keys before fanning ($.response.elements.elements[*] — CPRT shape)', () => {
		const cprtish = { response: { elements: { elements: [{ element_identifier: 'GV.OC-01' }] } } };
		expect(iterateJsonPath(cprtish, '$.response.elements.elements[*]')).toEqual([
			{ element_identifier: 'GV.OC-01' },
		]);
	});

	it('flattens multi-level fan-out ($.catalog.groups[*].controls[*] — OSCAL shape)', () => {
		const oscalish = {
			catalog: {
				groups: [
					{ id: 'ac', controls: [{ id: 'ac-1' }, { id: 'ac-2' }] },
					{ id: 'au', controls: [{ id: 'au-1' }] },
				],
			},
		};
		expect(iterateJsonPath(oscalish, '$.catalog.groups[*].controls[*]')).toEqual([
			{ id: 'ac-1' },
			{ id: 'ac-2' },
			{ id: 'au-1' },
		]);
	});

	it('"$" yields the root itself; "$[*]" fans a top-level array', () => {
		expect(iterateJsonPath([{ a: 1 }], '$')).toEqual([[{ a: 1 }]]);
		expect(iterateJsonPath([{ a: 1 }, { a: 2 }], '$[*]')).toEqual([{ a: 1 }, { a: 2 }]);
	});

	it('throws on a missing key, listing the keys that ARE available', () => {
		expect(() => iterateJsonPath(stixish, '$.objcts[*]')).toThrow(/not found.*Available keys: type, objects/);
	});

	it('throws on [*] applied to a non-array', () => {
		expect(() => iterateJsonPath(stixish, '$.type[*]')).toThrow(/non-array/);
	});

	it('rejects unsupported syntax (indices, filters) with a pointed error', () => {
		expect(() => iterateJsonPath(stixish, '$.objects[0]')).toThrow(/Unsupported iterator syntax/);
		expect(() => iterateJsonPath(stixish, '$.objects[?(@.type)]')).toThrow(/Unsupported iterator syntax/);
	});

	it('rejects iterators not starting with $', () => {
		expect(() => iterateJsonPath(stixish, 'objects[*]')).toThrow(/must start with "\$"/);
	});
});

describe('toSourceRows', () => {
	it('coerces top-level scalars to trimmed strings (the CSV/XLSX contract)', () => {
		const { rows } = toSourceRows([{ id: 42, name: '  padded  ', flag: false, missing: null }]);
		expect(rows[0]).toEqual({ id: '42', name: 'padded', flag: 'false', missing: '' });
	});

	it('keeps nested objects and arrays AS-IS for dotted template access', () => {
		const refs = [{ source_name: 'mitre-attack', external_id: 'T1055.011' }];
		const { rows } = toSourceRows([{ id: 'ap-1', external_references: refs }]);
		expect(rows[0].external_references).toBe(refs);
	});

	it('skips and counts non-object items (too-shallow iterator)', () => {
		const { rows, skippedNonObjects } = toSourceRows(['scalar', 7, null, { id: 'ok' }, ['arr']]);
		expect(rows).toEqual([{ id: 'ok' }]);
		expect(skippedNonObjects).toBe(4);
	});
});

describe('parseWhere / applyWhere', () => {
	const rows = [
		{ type: 'attack-pattern', revoked: 'false', meta: { tier: 'one' } },
		{ type: 'attack-pattern', revoked: 'true' },
		{ type: 'relationship' },
	];

	it('filters by equality', () => {
		expect(applyWhere(rows, parseWhere('type=attack-pattern'))).toHaveLength(2);
	});

	it('ANDs comma-separated clauses; != keeps rows where the field is absent', () => {
		const out = applyWhere(rows, parseWhere('type=attack-pattern,revoked!=true'));
		expect(out).toEqual([rows[0]]);
		// `relationship` row has no `revoked` at all — != alone keeps it:
		expect(applyWhere(rows, parseWhere('revoked!=true'))).toHaveLength(2);
	});

	it('a missing field never =-matches', () => {
		expect(applyWhere(rows, parseWhere('nonexistent=x'))).toHaveLength(0);
	});

	it('resolves dotted paths into nested values', () => {
		expect(applyWhere(rows, parseWhere('meta.tier=one'))).toEqual([rows[0]]);
	});

	it('rejects malformed clauses', () => {
		expect(() => parseWhere('no-equals-here')).toThrow(/Malformed --where/);
		expect(() => parseWhere('=value')).toThrow(/Malformed --where/);
	});
});

describe('jsonToRows (end-to-end)', () => {
	it('iterates + coerces + filters a STIX-shaped document', () => {
		const doc = JSON.stringify({
			objects: [
				{ type: 'attack-pattern', id: 'ap-1', revoked: false },
				{ type: 'attack-pattern', id: 'ap-2', revoked: true },
				{ type: 'relationship', id: 'rel-1' },
			],
		});
		const { rows, filteredOut } = jsonToRows(doc, '$.objects[*]', 'type=attack-pattern,revoked!=true');
		expect(rows).toEqual([{ type: 'attack-pattern', id: 'ap-1', revoked: 'false' }]);
		expect(filteredOut).toBe(2);
	});

	it('defaults to iterating a top-level array when no iterator is given', () => {
		const { rows } = jsonToRows('[{"id":"a"},{"id":"b"}]');
		expect(rows).toHaveLength(2);
	});

	it('throws a pointed error (with top-level keys) for an object root without an iterator', () => {
		expect(() => jsonToRows('{"response":{},"meta":{}}')).toThrow(/pass --iterator.*response, meta/s);
	});
});
