/**
 * lineage-from-csf-workbook.ts — explode the NIST CSF 2.0 reference workbook's
 * withdrawal markers into a one-row-per-successor edge list.
 *
 * WHY THIS TOOL EXISTS, AND WHY IT IS DELIBERATELY TINY.
 *
 * CSF 2.0 ships release lineage in prose, inside the concept column:
 *
 *     ID.AM-06: [Withdrawn: Incorporated into GV.RR-02, GV.SC-02]
 *
 * One source row, two successors, therefore two `superseded_by` assertions.
 * The recipe grammar renders exactly one note per source row
 * (`render(Recipe, ConceptIdentity) -> Address`, singular — architectural
 * commitment 2), so 79 withdrawal rows can never become 127 edge notes without
 * a step that multiplies rows. No layout mechanism, `source.where`,
 * `source.joins`, `variadic`, or `enrichment` multiplies rows, and none of them
 * should: fan-out is producer work by the Ch 46 ruling ("a producer
 * denormalizes into one sheet, or emits valid Tier 1 directly", contract §4.6).
 *
 * So this tool does that ONE thing, and the boundary is meant to be legible:
 *
 *   IT DOES        repeat a withdrawal row once per successor id, adding one
 *                  column (`successor_id`) and the per-edge `curie` the CURIE
 *                  minter needs to keep two edges from the same subject apart.
 *   IT DOES NOT    select rows. Every data row of the sheet is emitted —
 *                  banners, current subcategories, withdrawal markers alike.
 *                  Row selection belongs to the recipe `source.where`, and
 *                  leaving all 279 rows in the file is what proves the
 *                  predicate is doing real work rather than decorating a
 *                  pre-filtered file.
 *   IT DOES NOT    mint subject/object CURIEs, pick the predicate, or read the
 *                  publisher disposition verb. Those are template work and the
 *                  recipe does them, from the same verbatim `Subcategory`
 *                  string the workbook ships.
 *
 * It is loud: any withdrawal marker whose shape it does not recognise, and any
 * successor id that is not a CSF category or subcategory identifier, aborts the
 * run naming the row. Silently dropping a lineage assertion is the failure this
 * codebase pre-commits against.
 *
 * Input is gitignored (`Frameworks/` is local-by-default); the emitted CSV is
 * public-domain US Government content and is committed beside the recipe, the
 * same way `recipes/import/crosswalks/*.sssom.tsv` already is.
 *
 * Usage:
 *   bun tools/lineage-from-csf-workbook.ts \
 *     --source Frameworks/csf2.xlsx \
 *     --out recipes/import/crosswalks/nist-csf-2-withdrawal-lineage.csv
 */

import { writeFileSync } from 'node:fs';
import * as XLSX from 'xlsx';

/** Sheet holding the framework core. Row 1 is a banner; the header is row 2. */
const SHEET = 'CSF 2.0';
const HEADER_ROW_INDEX = 1;

/**
 * The three dispositions NIST actually writes. Closed on purpose: a fourth verb
 * in a future release must fail this tool rather than be swept into the
 * catch-all `(.+)` and imported as a mystery.
 */
const WITHDRAWAL_RE = /^\[Withdrawn:\s+(Incorporated into|Moved to|Moved into)\s+(.+)\]$/;

/** `GV.RR-02` (subcategory) or `GV.PO` (category — 4 of the 127 targets are). */
const CSF_TARGET_RE = /^[A-Z]{2}\.[A-Z]{2}(-\d{2})?$/;

interface SheetRow {
	Subcategory?: string;
	[k: string]: unknown;
}

interface OutRow {
	curie: string;
	Subcategory: string;
	successor_id: string;
}

function arg(name: string, fallback?: string): string {
	const i = process.argv.indexOf(`--${name}`);
	if (i >= 0 && process.argv[i + 1]) return process.argv[i + 1];
	if (fallback !== undefined) return fallback;
	throw new Error(`Missing required --${name}`);
}

/**
 * Slug identical to the template engine `slug` filter, so the emitted curie
 * matches the file address the recipe renders.
 */
function slug(v: string): string {
	return v
		.replace(/[^A-Za-z0-9]+/g, '-')
		.replace(/-+/g, '-')
		.replace(/^-|-$/g, '')
		.toLowerCase();
}

function csvCell(v: string): string {
	return /[",\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

function main(): void {
	const source = arg('source', 'Frameworks/csf2.xlsx');
	const out = arg('out', 'recipes/import/crosswalks/nist-csf-2-withdrawal-lineage.csv');

	const wb = XLSX.readFile(source);
	const ws = wb.Sheets[SHEET];
	if (!ws) {
		throw new Error(`Sheet "${SHEET}" not found in ${source}. Sheets: ${wb.SheetNames.join(', ')}`);
	}
	const rows = XLSX.utils.sheet_to_json<SheetRow>(ws, {
		range: HEADER_ROW_INDEX,
		raw: false,
		defval: '',
	});

	const emitted: OutRow[] = [];
	let withdrawals = 0;
	for (const [i, row] of rows.entries()) {
		const cell = String(row.Subcategory ?? '');
		const sheetRow = i + HEADER_ROW_INDEX + 2; // 1-indexed, past the header

		const colon = cell.indexOf(':');
		const rest = colon >= 0 ? cell.slice(colon + 1).trim() : '';
		if (!rest.startsWith('[Withdrawn')) {
			// Pass through untouched. No selection happens here.
			emitted.push({ curie: '', Subcategory: cell, successor_id: '' });
			continue;
		}

		withdrawals += 1;
		const subject = cell.slice(0, colon).trim();
		const m = rest.match(WITHDRAWAL_RE);
		if (!m) {
			throw new Error(
				`Row ${sheetRow}: withdrawal marker has an unrecognised shape and would lose its ` +
					`successors if imported. Expected "[Withdrawn: <Incorporated into|Moved to|Moved into> ` +
					`<ids>]"; got ${JSON.stringify(rest)}.`,
			);
		}
		const successors = m[2].split(',').map((s) => s.trim());
		for (const successor of successors) {
			if (!CSF_TARGET_RE.test(successor)) {
				throw new Error(
					`Row ${sheetRow}: successor ${JSON.stringify(successor)} in ${JSON.stringify(cell)} ` +
						`is not a CSF category or subcategory identifier.`,
				);
			}
			emitted.push({
				curie: `nist-csf-1-1-${slug(subject)}--nist-csf-2-${slug(successor)}`,
				Subcategory: cell,
				successor_id: successor,
			});
		}
	}

	const header = 'curie,Subcategory,successor_id';
	const body = emitted.map((r) => [r.curie, r.Subcategory, r.successor_id].map(csvCell).join(','));
	writeFileSync(out, `${[header, ...body].join('\n')}\n`, 'utf8');

	const edges = emitted.filter((r) => r.successor_id !== '').length;
	console.log(
		`${out}: ${emitted.length} rows (${rows.length} sheet rows, ` +
			`${withdrawals} withdrawal markers exploded into ${edges} successor references).`,
	);
}

main();
