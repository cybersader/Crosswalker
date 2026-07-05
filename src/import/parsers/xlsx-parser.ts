/**
 * xlsx-parser.ts — Excel workbook parsing for the import wizard.
 *
 * UI counterpart of the headless harness's XLSX reader (tools/generate-fixtures.ts)
 * — same contracts, one behavior:
 *   - `raw: false` formatted-text fidelity: Excel stores CIS safeguard "4.10" as
 *     the NUMBER 4.1 with display text "4.10"; String(4.1) silently collides it
 *     with safeguard 4.1. Cells read as what Excel displays.
 *   - header-key normalization: workbooks bake `\r\n` into header cells
 *     ("Secure Controls Framework (SCF)\r\nControl Description") — collapse
 *     internal whitespace + trim so columns are addressable.
 *   - `headerRow` skips banner/preamble rows above the real headers.
 */

import * as XLSX from 'xlsx';
import { ParsedData } from '../../types/config';

export interface XLSXParseOptions {
	/** Sheet to parse — name, or 0-based index. Defaults to the first sheet. */
	sheet?: string | number;
	/** 0-based row index to treat as the header row (skips banner rows above). */
	headerRow?: number;
}

/** Collapse internal whitespace + trim — the shared header-key normalization. */
const normKey = (k: string): string => k.replace(/\s+/g, ' ').trim();

async function readWorkbook(file: File): Promise<XLSX.WorkBook> {
	const buf = await file.arrayBuffer();
	return XLSX.read(buf, { type: 'array' });
}

/** List sheet names so the wizard can offer a picker before parsing. */
export async function listXLSXSheets(file: File): Promise<string[]> {
	const wb = await readWorkbook(file);
	return wb.SheetNames;
}

/**
 * Parse one sheet of an Excel workbook into ParsedData (eager rows).
 * Cells arrive as display text (strings); empty cells as ''.
 */
export async function parseXLSXFile(file: File, options: XLSXParseOptions = {}): Promise<ParsedData> {
	const wb = await readWorkbook(file);

	let sheetName: string;
	if (typeof options.sheet === 'number') {
		sheetName = wb.SheetNames[options.sheet];
		if (!sheetName) {
			throw new Error(`Sheet index ${options.sheet} out of range — workbook has ${wb.SheetNames.length} sheet(s): ${wb.SheetNames.join(', ')}`);
		}
	} else if (typeof options.sheet === 'string' && options.sheet !== '') {
		if (!wb.SheetNames.includes(options.sheet)) {
			throw new Error(`Sheet "${options.sheet}" not found. Available sheets: ${wb.SheetNames.join(', ')}`);
		}
		sheetName = options.sheet;
	} else {
		sheetName = wb.SheetNames[0];
	}
	if (!sheetName) throw new Error('Workbook contains no sheets.');

	const ws = wb.Sheets[sheetName];
	const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, {
		range: options.headerRow ?? 0,
		defval: '',
		blankrows: false,
		raw: false, // formatted text — see header comment
	});

	const rows: Record<string, string>[] = rawRows.map((r) => {
		const row: Record<string, string> = {};
		for (const [k, val] of Object.entries(r)) {
			row[normKey(k)] = val === null || val === undefined ? '' : String(val).trim();
		}
		return row;
	});

	// Column order from the first row's keys; union in any stragglers (sparse
	// sheets can omit trailing empty cells per row).
	const columns: string[] = [];
	const seen = new Set<string>();
	for (const row of rows) {
		for (const k of Object.keys(row)) {
			if (!seen.has(k)) {
				seen.add(k);
				columns.push(k);
			}
		}
	}

	return { columns, rows, rowCount: rows.length, sheetName };
}
