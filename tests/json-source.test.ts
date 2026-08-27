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

/*
 * The `parseWhere` / `applyWhere` describe block was DELETED WITH THE CODE IT
 * COVERED (2026-08-27 contract §11). Those functions were the silent row
 * predicate: a missing field never `=`-matched and always `!=`-matched, with no
 * diagnostic, so a typo'd column returned zero rows or every row.
 *
 * The block did not merely cover the defect, it PINNED it:
 * `applyWhere(rows, parseWhere('nonexistent=x'))` was asserted to return 0 rows.
 * That assertion must not be carried forward. The shorthand the wizard field
 * accepts now translates into `source.where` — see tests/source-shorthand.test.ts
 * for the translator and tests/source-where.test.ts for the three guards.
 */

describe('jsonToRows (end-to-end)', () => {
	it('iterates + coerces a STIX-shaped document (filtering is source.where now)', () => {
		const doc = JSON.stringify({
			objects: [
				{ type: 'attack-pattern', id: 'ap-1', revoked: false },
				{ type: 'attack-pattern', id: 'ap-2', revoked: true },
				{ type: 'relationship', id: 'rel-1' },
			],
		});
		const { rows } = jsonToRows(doc, '$.objects[*]');
		expect(rows).toEqual([
			{ type: 'attack-pattern', id: 'ap-1', revoked: 'false' },
			{ type: 'attack-pattern', id: 'ap-2', revoked: 'true' },
			{ type: 'relationship', id: 'rel-1' },
		]);
	});

	it('defaults to iterating a top-level array when no iterator is given', () => {
		const { rows } = jsonToRows('[{"id":"a"},{"id":"b"}]');
		expect(rows).toHaveLength(2);
	});

	it('throws a pointed error (with top-level keys) for an object root without an iterator', () => {
		expect(() => jsonToRows('{"response":{},"meta":{}}')).toThrow(/pass --iterator.*response, meta/s);
	});
});
