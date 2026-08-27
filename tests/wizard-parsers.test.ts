/**
 * wizard-parsers.test.ts — the import wizard's XLSX + JSON parsers
 * (src/import/parsers/{xlsx-parser,json-parser}.ts), added 2026-06-12 to close
 * UI-parity gap #1 (the wizard stubbed both formats while the headless harness
 * could read them).
 *
 * The XLSX cases pin the same contracts the harness learned from the real
 * corpus: raw:false formatted-text fidelity (the CIS "4.10-stored-as-4.1"
 * trap), header-key normalization (\r\n in header cells), and banner-row
 * skipping via headerRow.
 */

import { TextEncoder, TextDecoder } from 'node:util';
import * as XLSX from 'xlsx';
import { parseXLSXFile, listXLSXSheets } from '../src/import/parsers/xlsx-parser';
import { parseJSONFile } from '../src/import/parsers/json-parser';

/** Build an in-memory .xlsx File from rows of cells. */
function makeXlsxFile(sheets: Record<string, unknown[][]>): File {
	const wb = XLSX.utils.book_new();
	for (const [name, rows] of Object.entries(sheets)) {
		XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), name);
	}
	const buf = XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;
	return makeFile(buf, 'test.xlsx');
}

function makeJsonFile(value: unknown): File {
	return makeFile(JSON.stringify(value), 'test.json');
}

/** jsdom's File lacks arrayBuffer()/text() in some versions — provide both. */
function makeFile(content: ArrayBuffer | string, name: string): File {
	const file = new File([content], name);
	if (typeof file.arrayBuffer !== 'function') {
		const buf = typeof content === 'string' ? new TextEncoder().encode(content).buffer : content;
		(file as any).arrayBuffer = async () => buf;
	}
	if (typeof file.text !== 'function') {
		const text = typeof content === 'string' ? content : new TextDecoder().decode(content);
		(file as any).text = async () => text;
	}
	return file;
}

describe('parseXLSXFile', () => {
	it('parses the first sheet by default with header row 0', async () => {
		const file = makeXlsxFile({
			Data: [
				['id', 'name'],
				['AC-1', 'Policy'],
				['AC-2', 'Accounts'],
			],
		});
		const result = await parseXLSXFile(file);
		expect(result.sheetName).toBe('Data');
		expect(result.columns).toEqual(['id', 'name']);
		expect(result.rowCount).toBe(2);
		expect((result.rows as Record<string, string>[])[0]).toEqual({ id: 'AC-1', name: 'Policy' });
	});

	it('selects a sheet by name and by index', async () => {
		const sheets = {
			Intro: [['banner']],
			Controls: [
				['id'],
				['X-1'],
			],
		};
		const byName = await parseXLSXFile(makeXlsxFile(sheets), { sheet: 'Controls' });
		expect(byName.sheetName).toBe('Controls');
		expect(byName.rowCount).toBe(1);
		const byIndex = await parseXLSXFile(makeXlsxFile(sheets), { sheet: 1 });
		expect(byIndex.sheetName).toBe('Controls');
	});

	it('errors with the available sheet names when the sheet is missing', async () => {
		const file = makeXlsxFile({ Only: [['a'], ['1']] });
		await expect(parseXLSXFile(file, { sheet: 'Nope' })).rejects.toThrow(/Available sheets: Only/);
	});

	it('skips banner rows via headerRow', async () => {
		const file = makeXlsxFile({
			S: [
				['Some banner title', ''],
				['', ''],
				['id', 'title'],
				['GV', 'Govern'],
			],
		});
		const result = await parseXLSXFile(file, { headerRow: 2 });
		expect(result.columns).toEqual(['id', 'title']);
		expect((result.rows as Record<string, string>[])[0]).toEqual({ id: 'GV', title: 'Govern' });
	});

	it('reads formatted text, not raw values (the CIS 4.10 trap)', async () => {
		// Cell stores the NUMBER 4.1 with a 2-decimal display format ("4.10") —
		// exactly how the real CIS workbook stores safeguard 4.10. String(4.1)
		// would collide it with safeguard 4.1; raw:false must read "4.10".
		const wb = XLSX.utils.book_new();
		const ws = XLSX.utils.aoa_to_sheet([['safeguard']]);
		ws['A2'] = { t: 'n', v: 4.1, z: '0.00' };
		ws['!ref'] = 'A1:A2';
		XLSX.utils.book_append_sheet(wb, ws, 'S');
		const buf = XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;
		const result = await parseXLSXFile(makeFile(buf, 'cis.xlsx'));
		expect((result.rows as Record<string, string>[])[0].safeguard).toBe('4.10');
	});

	it('normalizes header keys (collapses \\r\\n + extra whitespace)', async () => {
		const file = makeXlsxFile({
			S: [
				['SCF\r\nControl  Description'],
				['Mechanisms exist'],
			],
		});
		const result = await parseXLSXFile(file);
		expect(result.columns).toEqual(['SCF Control Description']);
	});

	it('listXLSXSheets returns all sheet names in order', async () => {
		const file = makeXlsxFile({ A: [['x']], B: [['y']], C: [['z']] });
		expect(await listXLSXSheets(file)).toEqual(['A', 'B', 'C']);
	});
});

describe('parseJSONFile', () => {
	it('parses a root-array document with no iterator', async () => {
		const file = makeJsonFile([
			{ id: 'T1', name: 'One' },
			{ id: 'T2', name: 'Two' },
		]);
		const result = await parseJSONFile(file);
		expect(result.rowCount).toBe(2);
		expect(result.columns).toEqual(['id', 'name']);
	});

	it('applies an iterator and does NOT filter (row filtering is source.where now)', async () => {
		const file = makeJsonFile({
			objects: [
				{ type: 'attack-pattern', id: 'T1', revoked: false },
				{ type: 'attack-pattern', id: 'T2', revoked: true },
				{ type: 'relationship', id: 'R1' },
			],
		});
		const result = await parseJSONFile(file, { iterator: '$.objects[*]' });
		// The parser no longer carries a row predicate at all. The wizard field's
		// comma shorthand now translates into `source.where` and runs at generation
		// under G1/G2/G3 (2026-08-27 contract §11); the same filter is asserted
		// end-to-end in tests/source-shorthand.test.ts.
		expect(result.rowCount).toBe(3);
		expect((result.rows as Record<string, unknown>[])[0].id).toBe('T1');
	});

	it('errors listing available keys when the iterator path is wrong', async () => {
		const file = makeJsonFile({ response: { elements: [] } });
		await expect(parseJSONFile(file, { iterator: '$.objects[*]' })).rejects.toThrow(/response/);
	});

	it('unions sparse columns across rows in first-appearance order', async () => {
		const file = makeJsonFile([
			{ a: 1 },
			{ a: 2, b: 3 },
			{ c: 4 },
		]);
		const result = await parseJSONFile(file);
		expect(result.columns).toEqual(['a', 'b', 'c']);
	});
});

describe('suggestIterators', () => {
	const { suggestIterators } = require('../src/import/parsers/json-parser');

	it('detects a root-array document', () => {
		const st = suggestIterators(JSON.stringify([{ a: 1 }, { a: 2 }]));
		expect(st.rootIsArray).toBe(true);
		expect(st.rootCount).toBe(2);
		expect(st.candidates[0].iterator).toBe('');
	});

	it('finds nested record arrays with counts and keys (STIX shape)', () => {
		const st = suggestIterators(JSON.stringify({ objects: [{ type: 'x', name: 'n' }, { type: 'y' }] }));
		expect(st.rootIsArray).toBe(false);
		expect(st.candidates[0]).toMatchObject({ iterator: '$.objects[*]', count: 2, name: 'objects' });
		expect(st.candidates[0].sampleKeys).toContain('type');
	});

	it('captures a concrete example record (populated fields only)', () => {
		const st = suggestIterators(JSON.stringify({ items: [{ id: 'GV.OC-01', title: '', kind: 'subcategory' }] }));
		const sample = st.candidates[0].sample;
		// the empty `title` is skipped; id + kind are shown with their values
		expect(sample).toEqual([
			{ key: 'id', value: 'GV.OC-01' },
			{ key: 'kind', value: 'subcategory' },
		]);
	});

	it('ranks primary-record lists above edge/relationship lists (CPRT shape)', () => {
		// `relationships` is LARGER but reads like edges; `elements` (the concepts)
		// should be the default pick.
		const st = suggestIterators(JSON.stringify({
			response: { elements: {
				elements: Array.from({ length: 3 }, (_, i) => ({ element_identifier: `e${i}`, title: 't' })),
				relationships: Array.from({ length: 9 }, (_, i) => ({ rel: i })),
			} },
		}));
		expect(st.candidates[0].name).toBe('elements');
		expect(st.candidates[0].looksLikeEdges).toBe(false);
		const rel = st.candidates.find((c: any) => c.name === 'relationships');
		expect(rel.looksLikeEdges).toBe(true);
	});

	it('reports the true field count even when sampleKeys is capped at 6', () => {
		const wide: Record<string, number> = {};
		for (let i = 0; i < 10; i++) wide[`f${i}`] = i;
		const st = suggestIterators(JSON.stringify({ items: [wide] }));
		expect(st.candidates[0].sampleKeys.length).toBe(6);
		expect(st.candidates[0].fieldCount).toBe(10);
	});

	it('finds deep candidates (CPRT shape) and multi-fan (OSCAL shape)', () => {
		const cprt = suggestIterators(JSON.stringify({ response: { elements: { elements: [{ id: 1 }] } } }));
		expect(cprt.candidates.some((c: any) => c.iterator === '$.response.elements.elements[*]')).toBe(true);
		const oscal = suggestIterators(JSON.stringify({ catalog: { groups: [{ controls: [{ id: 'ac-1' }] }] } }));
		expect(oscal.candidates.some((c: any) => c.iterator === '$.catalog.groups[*].controls[*]')).toBe(true);
	});

	it('reports parse errors instead of throwing', () => {
		expect(suggestIterators('{not json').parseError).toBeTruthy();
	});
});
