#!/usr/bin/env bun
/**
 * generate-fixtures.ts — CSV → Tier 1 markdown fixture generator
 *
 * Bootstraps test data for Crosswalker development. Reads a CSV (one row per
 * concept), emits one Markdown file per row, frontmatter conforming to the
 * Tier 1 spec (spec/tier1.schema.json). v0.1 scope: flat folder layout (no
 * mechanism: heading / tag / wikilink yet — those land when the render()
 * engine ships per Ch 22).
 *
 * Usage:
 *   bun tools/generate-fixtures.ts \
 *     --source tools/fixtures/synthetic/nist-mini.csv \
 *     --target test-vault/Frameworks/NIST-mini \
 *     --ontology nist-mini \
 *     [--clean]
 *
 * Or: bun run fixtures
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync, rmSync, readdirSync, copyFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import { render, renderTemplate, type Recipe } from '../src/render';
import { jsonToRows, parseWhere, applyWhere } from './lib/json-source';

interface Args {
	source: string;
	target: string;
	ontology: string;
	clean: boolean;
	deterministic: boolean;
	/** Column aliasing: source-column -> canonical role (id/name/title/family/parent/description). */
	map: Record<string, string>;
	/** XLSX: sheet name, or a 0-based index as a string. Default: first sheet. */
	sheet?: string;
	/** XLSX: 0-based header-row index — skips banner/preamble rows above the headers. Default 0. */
	headerRow: number;
	/** JSON: iterator path locating the row array — e.g. "$.objects[*]", "$.catalog.groups[*].controls[*]". */
	iterator?: string;
	/** JSON: row filter — comma-ANDed "<dotted.path>=<value>" / "!=" clauses, e.g. "type=attack-pattern,revoked!=true". */
	where?: string;
	/** Path to a Recipe JSON (spec/recipe.schema.json). When set, the real render() engine drives output. */
	recipe?: string;
	/** Template for the concept id (curie suffix) under --recipe, e.g. "{identifier}". Default "{id}". */
	id?: string;
	/** Dir of committed example `.base` files to copy into --target alongside the notes
	 *  (so the synthetic fixture set ships with ready-to-open reference views). */
	examples?: string;
}

/**
 * Stable timestamp for deterministic fixture generation. Used when the
 * CROSSWALKER_FIXTURES_DETERMINISTIC env flag is set OR --deterministic
 * is passed. Lets `bun run check:fixtures-drift` compare git-clean state.
 *
 * Anchored to the v0.1 design-phase conclusion (2026-05-04) — arbitrary
 * but stable. Real provenance still embeds source_hash from CSV bytes,
 * which IS dynamic + meaningful.
 */
const DETERMINISTIC_TIMESTAMP = '2026-05-04T00:00:00.000Z';

interface CsvRow {
	id: string;
	name?: string;
	title?: string;
	family?: string;
	family_name?: string;
	parent?: string;
	description?: string;
	[key: string]: string | undefined;
}

const REPO_ROOT = resolve(__dirname, '..');
const SPEC_VERSION = 'https://crosswalker.dev/spec/tier1.schema.json';
const PRODUCER = {
	kind: 'external-cli',
	name: 'tools/generate-fixtures.ts',
	version: '0.1.0',
};

function parseArgs(argv: string[]): Args {
	const envDeterministic = process.env.CROSSWALKER_FIXTURES_DETERMINISTIC === '1';
	const args: Partial<Args> = { clean: false, deterministic: envDeterministic, map: {}, headerRow: 0 };
	for (let i = 0; i < argv.length; i++) {
		const a = argv[i];
		if (a === '--source') args.source = argv[++i];
		else if (a === '--target') args.target = argv[++i];
		else if (a === '--ontology') args.ontology = argv[++i];
		else if (a === '--clean') args.clean = true;
		else if (a === '--deterministic') args.deterministic = true;
		else if (a === '--map') {
			// --map "srcCol=role,srcCol2=role2" — alias a framework's real column
			// names onto the canonical roles the generator expects.
			const spec = argv[++i] || '';
			const map: Record<string, string> = {};
			for (const pair of spec.split(',')) {
				const [src, dst] = pair.split('=').map((s) => s.trim());
				if (src && dst) map[src] = dst;
			}
			args.map = map;
		}
		else if (a === '--sheet') args.sheet = argv[++i];
		else if (a === '--header-row') args.headerRow = parseInt(argv[++i], 10) || 0;
		else if (a === '--iterator') args.iterator = argv[++i];
		else if (a === '--where') args.where = argv[++i];
		else if (a === '--recipe') args.recipe = argv[++i];
		else if (a === '--id') args.id = argv[++i];
		else if (a === '--examples') args.examples = argv[++i];
		else if (a === '--help' || a === '-h') {
			printHelp();
			process.exit(0);
		}
	}
	if (!args.source || !args.target || (!args.ontology && !args.recipe)) {
		console.error('Missing required args (need --source, --target, and --ontology or --recipe).\n');
		printHelp();
		process.exit(1);
	}
	return args as Args;
}

function printHelp(): void {
	console.log(`generate-fixtures.ts — CSV → Tier 1 markdown fixture generator

Usage:
  bun tools/generate-fixtures.ts --source <csv> --target <dir> --ontology <slug> [--clean]

Args:
  --source <file>     Input path (relative to repo root): .csv (first row =
                      headers), .xlsx/.xls (see --sheet/--header-row), or .json
                      (see --iterator/--where). Required column/field: id (or
                      use --map / a --recipe --id template). Optional: name,
                      title, family, family_name, parent, description.
  --target <dir>      Output directory (relative to repo root). Will be created if
                      missing.
  --ontology <slug>   Ontology identifier; becomes the CURIE prefix and
                      _crosswalker.source_ref.curie.
  --clean             Empty the target directory before generating.
  --iterator <path>   JSON: locate the row array inside a nested document —
                      dotted keys + [*] fan-out only. e.g. '$.objects[*]' (STIX),
                      '$.response.elements.elements[*]' (NIST CPRT),
                      '$.catalog.groups[*].controls[*]' (OSCAL). Omit when the
                      document IS a top-level array.
  --where <clauses>   JSON: comma-ANDed row filters, '<dotted.path>=<value>' or
                      '!='. e.g. 'type=attack-pattern,revoked!=true'. A missing
                      field never =-matches and always !=-matches.
  --deterministic     Stable produced_at timestamp (2026-05-04T00:00:00.000Z)
                      instead of Date.now(). Required for fixture-drift CI gates.
                      Equivalent to env CROSSWALKER_FIXTURES_DETERMINISTIC=1.
  -h, --help          Print this and exit.

Output:
  One <id>.md file per row, with Tier 1 frontmatter conforming to
  spec/tier1.schema.json. Flat folder layout (v0.1).`);
}

function sha256Hex(input: string | Buffer): string {
	return 'sha256-' + createHash('sha256').update(input).digest('hex');
}

function slugifyForFilesystem(s: string): string {
	return s.replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').replace(/^\.+|\.+$/g, '_');
}

function readCsv(absPath: string): CsvRow[] {
	if (!existsSync(absPath)) {
		console.error(`Source CSV not found: ${absPath}`);
		process.exit(1);
	}
	const text = readFileSync(absPath, 'utf8');
	const result = Papa.parse<CsvRow>(text, {
		header: true,
		skipEmptyLines: true,
		dynamicTyping: false,
		transform: (v) => (typeof v === 'string' ? v.trim() : v),
	});
	if (result.errors.length > 0) {
		console.error('CSV parse errors:');
		for (const e of result.errors) console.error('  ', e.message);
		process.exit(1);
	}
	return result.data;
}

/**
 * Read an XLSX/XLS workbook into rows. Selects a sheet (by name or 0-based
 * index), treats `headerRow` (0-based) as the header line — skipping any
 * banner/preamble rows above it — and coerces every cell to a trimmed string
 * so downstream logic matches the CSV path. Merged-cell forward-fill (for
 * hierarchy columns like CSF's Function/Category) is NOT applied yet — a known
 * follow-on; for now group-header rows surface as empty-id rows and are skipped.
 */
function readXlsx(absPath: string, sheet: string | undefined, headerRow: number): CsvRow[] {
	if (!existsSync(absPath)) {
		console.error(`Source workbook not found: ${absPath}`);
		process.exit(1);
	}
	const wb = XLSX.readFile(absPath);
	let sheetName = wb.SheetNames[0];
	if (sheet !== undefined && sheet !== '') {
		const asIndex = Number(sheet);
		sheetName = Number.isInteger(asIndex) && String(asIndex) === sheet.trim()
			? wb.SheetNames[asIndex]
			: sheet;
	}
	const ws = wb.Sheets[sheetName];
	if (!ws) {
		console.error(`Sheet "${sheet}" not found. Available: ${wb.SheetNames.join(', ')}`);
		process.exit(1);
	}
	const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, {
		range: headerRow, // start at this row; treat it as the header
		defval: '',
		blankrows: false,
		// Formatted text, not raw values: CIS stores safeguard "4.10" as the
		// NUMBER 4.1 with display text "4.10" — String(4.1) would silently
		// collide it with safeguard 4.1 (one overwrites the other). raw:false
		// reads every cell as what Excel displays, which is the contract the
		// string-coercion below promises anyway.
		raw: false,
	});
	return raw.map((r) => {
		const row: CsvRow = {} as CsvRow;
		for (const [k, v] of Object.entries(r)) {
			// Normalize header KEYS: collapse internal whitespace (incl. the embedded
			// \r\n that NIST/CRI workbooks bake into header cells — e.g. "Focal
			// Document\r\nElement", "Profile\r\nId") and trim, so recipes can reference
			// clean single-space names ("Profile Id", "Focal Document Element").
			const key = k.replace(/\s+/g, ' ').trim();
			row[key] = v === null || v === undefined ? '' : String(v).trim();
		}
		return row;
	});
}

/**
 * Read a nested JSON source via the logical-source + iterator path
 * (tools/lib/json-source.ts). `--iterator` locates the row array
 * ($.objects[*] for STIX, $.response.elements.elements[*] for CPRT,
 * $.catalog.groups[*].controls[*] for OSCAL); `--where` filters rows
 * (type=attack-pattern,revoked!=true). Top-level scalars are coerced to
 * trimmed strings (same contract as CSV/XLSX); nested objects/arrays
 * survive so recipe templates can use dotted paths
 * ({external_references.0.external_id}).
 */
function readJson(absPath: string, iterator: string | undefined, where: string | undefined): CsvRow[] {
	if (!existsSync(absPath)) {
		console.error(`Source JSON not found: ${absPath}`);
		process.exit(1);
	}
	const text = readFileSync(absPath, 'utf8');
	let result;
	try {
		result = jsonToRows(text, iterator, where);
	} catch (e) {
		console.error(`JSON source error: ${(e as Error).message}`);
		process.exit(1);
	}
	if (result.skippedNonObjects > 0) {
		console.warn(`  skipped:  ${result.skippedNonObjects} non-object item(s) yielded by the iterator`);
	}
	if (result.filteredOut > 0) {
		console.log(`  filtered: ${result.filteredOut} row(s) excluded by --where "${where}"`);
	}
	// Top-level scalars are strings (coerced above); nested values intentionally
	// remain objects/arrays for dotted template access — CsvRow's index signature
	// is looser at runtime than its declared type for those keys.
	return result.rows as unknown as CsvRow[];
}

/** Dispatch on file extension: .xlsx/.xls -> workbook reader, .json -> iterator reader, else CSV. */
function readSource(absPath: string, args: Args): CsvRow[] {
	const lower = absPath.toLowerCase();
	if (lower.endsWith('.xlsx') || lower.endsWith('.xls')) {
		return applyWhereToRows(readXlsx(absPath, args.sheet, args.headerRow), args.where);
	}
	if (lower.endsWith('.json')) {
		// readJson applies --where itself (inside jsonToRows, pre-coercion).
		return readJson(absPath, args.iterator, args.where);
	}
	return applyWhereToRows(readCsv(absPath), args.where);
}

/** `--where` is format-agnostic row filtering — apply it to flat-table readers
 *  (CSV/XLSX) too, e.g. selecting CIS control-level rows ('CIS Safeguard=' →
 *  rows where the safeguard cell is empty). The JSON path filters pre-coercion
 *  inside jsonToRows; here rows are already flat string maps. */
function applyWhereToRows(rows: CsvRow[], where: string | undefined): CsvRow[] {
	if (!where) return rows;
	const kept = applyWhere(rows, parseWhere(where)) as CsvRow[];
	if (kept.length !== rows.length) {
		console.log(`  filtered: ${rows.length - kept.length} row(s) excluded by --where "${where}"`);
	}
	return kept;
}

function buildFrontmatter(
	row: CsvRow,
	ontology: string,
	sourceRef: { file: string; sourceHash: string },
	deterministic: boolean,
): Record<string, unknown> {
	const id = row.id?.trim();
	if (!id) {
		throw new Error(`Row is missing 'id' field: ${JSON.stringify(row)}`);
	}
	const curie = `${ontology}:${id}`;
	const title = row.title || row.name || id;

	const fm: Record<string, unknown> = {
		curie,
		title,
	};

	// Optional aliases
	const aliases: string[] = [];
	if (row.name && row.name !== title) aliases.push(row.name);
	if (id !== title) aliases.push(id);
	if (aliases.length > 0) fm.aliases = aliases;

	// Optional tags — derived from family if present
	if (row.family) {
		fm.tags = [`framework/${ontology}/${row.family.toLowerCase().replace(/[^a-z0-9_-]/g, '-')}`];
	}

	// Domain-specific fields preserved (control_id, family, etc.)
	if (row.family) fm.family = row.family;
	if (row.family_name) fm.family_name = row.family_name;
	if (id) fm.control_id = id; // domain-specific; recipe-managed in real usage

	// Hierarchy: parent wikilink if specified
	if (row.parent) fm.parent = `[[${row.parent}]]`;

	// Provenance
	fm._crosswalker = {
		spec_version: SPEC_VERSION,
		source_ref: {
			file: sourceRef.file,
			curie: `${ontology}:_`,
			source_hash: sourceRef.sourceHash,
		},
		produced_at: deterministic ? DETERMINISTIC_TIMESTAMP : new Date().toISOString(),
		producer: PRODUCER,
		recipe: {
			id: `${ontology}-fixture-flat`,
			hash: '(synthetic — no real recipe)',
		},
	};

	return fm;
}

function frontmatterToYaml(fm: Record<string, unknown>): string {
	// Minimal YAML emitter — no external dep; sufficient for primitive types,
	// arrays of strings, and one level of nested object (the _crosswalker block).
	const lines: string[] = ['---'];
	for (const [key, value] of Object.entries(fm)) {
		if (value === undefined || value === null) continue;
		emitYamlEntry(lines, key, value, 0);
	}
	lines.push('---', '');
	return lines.join('\n');
}

function emitYamlEntry(lines: string[], key: string, value: unknown, indent: number): void {
	const pad = '  '.repeat(indent);
	if (Array.isArray(value)) {
		if (value.length === 0) {
			lines.push(`${pad}${key}: []`);
			return;
		}
		lines.push(`${pad}${key}:`);
		for (const item of value) {
			lines.push(`${pad}  - ${yamlScalar(item)}`);
		}
	} else if (typeof value === 'object' && value !== null) {
		lines.push(`${pad}${key}:`);
		for (const [k, v] of Object.entries(value)) {
			if (v === undefined || v === null) continue;
			emitYamlEntry(lines, k, v, indent + 1);
		}
	} else {
		lines.push(`${pad}${key}: ${yamlScalar(value)}`);
	}
}

function yamlScalar(v: unknown): string {
	if (typeof v === 'string') {
		// Quote if contains special chars or starts with ambiguous markers
		if (/[:#\[\]{},&*!?|>'"%@`]|^\s|\s$|^[-?]\s/.test(v) || v === '') {
			return JSON.stringify(v);
		}
		return v;
	}
	return String(v);
}

function buildBody(row: CsvRow, frontmatter: Record<string, unknown>): string {
	const title = String(frontmatter.title ?? row.id);
	const lines: string[] = [`# ${title}`, ''];
	if (row.description) {
		lines.push('## Description', '', row.description, '');
	}
	if (row.family || row.family_name) {
		lines.push('## Context', '', `- Family: ${row.family ?? '(none)'}${row.family_name ? ` — ${row.family_name}` : ''}`, '');
	}
	return lines.join('\n');
}

function main(): void {
	const args = parseArgs(process.argv.slice(2));

	const sourceAbs = resolve(REPO_ROOT, args.source);
	const targetAbs = resolve(REPO_ROOT, args.target);

	console.log(`Crosswalker fixture generator`);
	console.log(`  source:   ${relative(REPO_ROOT, sourceAbs)}`);
	console.log(`  target:   ${relative(REPO_ROOT, targetAbs)}`);
	console.log(`  ontology: ${args.ontology ?? '(from recipe)'}`);

	const sourceBytes = readFileSync(sourceAbs);
	const sourceHash = sha256Hex(sourceBytes);
	const sourceRef = {
		file: relative(REPO_ROOT, sourceAbs).replace(/\\/g, '/'),
		sourceHash,
	};

	if (args.clean && existsSync(targetAbs)) {
		console.log(`  cleaning: ${relative(REPO_ROOT, targetAbs)}/`);
		rmSync(targetAbs, { recursive: true, force: true });
	}

	mkdirSync(targetAbs, { recursive: true });

	const rows = readSource(sourceAbs, args);
	// Column mapping (config-driven ingestion hook): alias a real framework's
	// columns onto the canonical roles the generator expects, without hard-coding.
	// e.g. 800-53's `identifier`/`control_text` -> `id`/`description`. This map is
	// the seed of a per-framework ingestion config (the shareable "as-code" unit).
	if (args.map && Object.keys(args.map).length > 0) {
		for (const row of rows) {
			for (const [src, dst] of Object.entries(args.map)) {
				if (row[src] !== undefined) row[dst] = row[src];
			}
		}
	}
	console.log(`  rows:     ${rows.length}`);

	let written = 0;
	if (args.recipe) {
		// Recipe-driven path: use the REAL render() engine (src/render) — the same
		// pure function the plugin uses — instead of the harness's own frontmatter
		// builder. The per-framework recipe (a spec/recipe.schema.json document)
		// drives layout + frontmatter; the harness only derives identity (curie)
		// and writes via fs (render() is vault-independent / pure).
		const recipeAbs = resolve(REPO_ROOT, args.recipe);
		const recipe = JSON.parse(readFileSync(recipeAbs, 'utf8')) as Recipe;
		const recipeHash = sha256Hex(readFileSync(recipeAbs));
		const ontology = recipe.source?.ontology ?? args.ontology ?? 'unknown';
		const idTemplate = args.id ?? '{id}';
		console.log(`  recipe:   ${relative(REPO_ROOT, recipeAbs)} (via real render())`);
		let skipped = 0;
		for (const row of rows) {
			let idVal = '';
			try {
				idVal = renderTemplate(idTemplate, row as Record<string, unknown>).trim();
			} catch {
				skipped++; // id template can't resolve (e.g. group-header rows)
				continue;
			}
			if (!idVal) { skipped++; continue; }
			const curie = `${ontology}:${idVal}`;
			let address;
			try {
				address = render(recipe, { curie, scope: row as Record<string, unknown> });
			} catch (e) {
				console.warn(`  skipped ${curie}: ${(e as Error).message}`);
				skipped++;
				continue;
			}
			const fm: Record<string, unknown> = { ...address.frontmatter };
			if (address.tags.length > 0) fm.tags = address.tags;
			if (address.aliases.length > 0) fm.aliases = address.aliases;
			fm._crosswalker = {
				spec_version: SPEC_VERSION,
				source_ref: { file: sourceRef.file, curie: `${ontology}:_`, source_hash: sourceRef.sourceHash },
				produced_at: args.deterministic ? DETERMINISTIC_TIMESTAMP : new Date().toISOString(),
				producer: PRODUCER,
				recipe: { id: recipe.recipe, hash: recipeHash },
			};
			const outPath = join(targetAbs, address.primary.path);
			mkdirSync(dirname(outPath), { recursive: true });
			const title = String(fm.title ?? curie);
			writeFileSync(outPath, frontmatterToYaml(fm) + `# ${title}\n`);
			written++;
		}
		if (skipped > 0) console.log(`  skipped:  ${skipped} rows (no id / unrenderable)`);
	} else {
		for (const row of rows) {
			const id = row.id?.trim();
			if (!id) {
				console.warn(`  skipped row with empty id: ${JSON.stringify(row)}`);
				continue;
			}
			const fm = buildFrontmatter(row, args.ontology, sourceRef, args.deterministic);
			const body = buildBody(row, fm);
			const filename = `${slugifyForFilesystem(id)}.md`;
			const outPath = join(targetAbs, filename);
			mkdirSync(dirname(outPath), { recursive: true });
			writeFileSync(outPath, frontmatterToYaml(fm) + body);
			written++;
		}
	}

	console.log(`  wrote:    ${written} files`);

	// Copy committed example `.base` files into the target so the synthetic set
	// ships with ready-to-open reference views (regenerated on every --clean run,
	// keeping the fixture vault self-cleaning + iterable). Source of truth is the
	// committed examples dir; the copies under test-vault are gitignored artifacts.
	if (args.examples) {
		const examplesAbs = resolve(REPO_ROOT, args.examples);
		if (existsSync(examplesAbs)) {
			let copied = 0;
			for (const f of readdirSync(examplesAbs)) {
				if (!f.endsWith('.base')) continue;
				copyFileSync(join(examplesAbs, f), join(targetAbs, f));
				copied++;
			}
			console.log(`  examples: ${copied} .base file(s) from ${relative(REPO_ROOT, examplesAbs)}/`);
		} else {
			console.warn(`  examples dir not found: ${relative(REPO_ROOT, examplesAbs)}`);
		}
	}

	console.log(`  done.`);
}

main();
