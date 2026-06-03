/**
 * crosswalk-from-olir.ts — turn a NIST-OLIR mapping workbook into Tier 1
 * crosswalk-edge notes (and, optionally, a standard SSSOM TSV).
 *
 * The headless companion to generate-fixtures.ts: that tool renders *concept*
 * notes; this one renders *crosswalk edges* — the between-ontology mappings that
 * the `crosswalkerPivot` Bases view turns into a coverage matrix.
 *
 * The whole point is reuse of the implemented constructs, not new ad-hoc logic:
 *   - the real, pure `render()` engine produces each edge's Address
 *     (`kind: 'crosswalk-edge'` is wired in v0.1.6)
 *   - `recipes/import/crosswalk-edge.json` is the (generic) Recipe it consumes
 *   - `validateTier1Frontmatter` / `validateRecipe` (the SAME AJV validator the
 *     plugin uses) gate every note + the recipe against spec/tier1.schema.json
 *
 * The principled predicate chain is OLIR → SKOS → STRM:
 *   OLIR "Relationship" (subset of / superset of / equal / intersects with)
 *     → a standard SKOS mapping predicate (skos:broadMatch / narrowMatch /
 *       exactMatch / relatedMatch) — this is what lands in the SSSOM TSV
 *     → STRM predicate_id (is_broader_than / … / intersects_with) for the note,
 *       via SKOS_TO_STRM mirrored from src/import/sssom-importer.ts.
 *
 * The OLIR layout is shared across crosswalks (NIST's official CSF→800-53, CRI's
 * CRI→800-53, and many more in the corpus all use Focal/Reference Document
 * Element columns), so one reader serves them all.
 *
 * Usage:
 *   bun tools/crosswalk-from-olir.ts \
 *     --source <olir.xlsx> --sheets <regex> \
 *     --subject-prefix nist-csf-2 --object-prefix nist-800-53 \
 *     --target test-vault/_crosswalker/mappings/nist-csf-to-800-53 \
 *     [--sssom-out recipes/import/crosswalks/<name>.sssom.tsv] \
 *     [--provider "NIST OLIR"] [--clean] [--deterministic]
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync, rmSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import * as XLSX from 'xlsx';
import { render, type Recipe } from '../src/render';
import { validateTier1Frontmatter, validateRecipe } from '../src/validation/validator';

const SPEC_VERSION = 'https://crosswalker.dev/spec/tier1.schema.json';
const DETERMINISTIC_TIMESTAMP = '2026-05-04T00:00:00.000Z';

/** Standard SKOS mapping predicate for each OLIR relationship label.
 *  Standard SKOS semantics: `A skos:broadMatch B` ⇒ B is broader than A. */
const OLIR_TO_SKOS: Record<string, string> = {
	'equal': 'skos:exactMatch',
	'subset of': 'skos:broadMatch', // focal ⊂ reference → focal has a broader match
	'superset of': 'skos:narrowMatch', // focal ⊃ reference → focal has a narrower match
	'intersects with': 'skos:relatedMatch',
};
const DEFAULT_SKOS = 'skos:relatedMatch'; // OLIR with no relationship type → related

/** Mirror of SKOS_TO_STRM in src/import/sssom-importer.ts (module-private there).
 *  Keep in sync if that map changes. Unknown → intersects_with. */
const SKOS_TO_STRM: Record<string, string> = {
	'skos:exactMatch': 'is_equivalent_to',
	'skos:closeMatch': 'is_approximate_to',
	'skos:broadMatch': 'is_broader_than',
	'skos:narrowMatch': 'is_narrower_than',
	'skos:relatedMatch': 'intersects_with',
};
const skosToStrm = (skos: string): string => SKOS_TO_STRM[skos] ?? 'intersects_with';

interface Args {
	source: string;
	sheets?: RegExp;
	subjectPrefix: string;
	objectPrefix: string;
	subjectCol: string;
	objectCol: string;
	target: string;
	sssomOut?: string;
	provider: string;
	clean: boolean;
	deterministic: boolean;
}

function parseArgs(argv: string[]): Args {
	const a: Partial<Args> = {
		subjectCol: 'Focal Document Element',
		objectCol: 'Reference Document Element',
		provider: 'OLIR crosswalk',
		clean: false,
		deterministic: process.env.CW_DETERMINISTIC === '1',
	};
	for (let i = 0; i < argv.length; i++) {
		const v = argv[i];
		if (v === '--source') a.source = argv[++i];
		else if (v === '--sheets') a.sheets = new RegExp(argv[++i]);
		else if (v === '--subject-prefix') a.subjectPrefix = argv[++i];
		else if (v === '--object-prefix') a.objectPrefix = argv[++i];
		else if (v === '--subject-col') a.subjectCol = argv[++i];
		else if (v === '--object-col') a.objectCol = argv[++i];
		else if (v === '--target') a.target = argv[++i];
		else if (v === '--sssom-out') a.sssomOut = argv[++i];
		else if (v === '--provider') a.provider = argv[++i];
		else if (v === '--clean') a.clean = true;
		else if (v === '--deterministic') a.deterministic = true;
	}
	if (!a.source || !a.target || !a.subjectPrefix || !a.objectPrefix) {
		console.error(
			'Required: --source <xlsx> --target <dir> --subject-prefix <p> --object-prefix <p>',
		);
		process.exit(1);
	}
	return a as Args;
}

/** Collapse internal whitespace + trim — mirrors the header-key normalization in
 *  generate-fixtures.ts (NIST/CRI workbooks bake \r\n into header cells). */
const normKey = (k: string) => k.replace(/\s+/g, ' ').trim();

interface OlirRow {
	[key: string]: string;
}

/** Read every matching sheet of an OLIR workbook into normalized-key rows. */
function readOlir(absPath: string, sheets: RegExp | undefined): OlirRow[] {
	if (!existsSync(absPath)) {
		console.error(`Source workbook not found: ${absPath}`);
		process.exit(1);
	}
	const wb = XLSX.readFile(absPath);
	const names = wb.SheetNames.filter((s) => (sheets ? sheets.test(s) : true));
	const out: OlirRow[] = [];
	for (const sn of names) {
		const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets[sn], {
			defval: '',
			blankrows: false,
		});
		for (const r of raw) {
			const row: OlirRow = {};
			for (const [k, val] of Object.entries(r)) {
				row[normKey(k)] = val === null || val === undefined ? '' : String(val).trim();
			}
			out.push(row);
		}
	}
	return out;
}

const slug = (s: string) =>
	s
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '');

interface SssomRow {
	subject_id: string;
	predicate_id: string; // SKOS (standard SSSOM)
	object_id: string;
	mapping_justification: string;
	confidence?: number;
}

/** Map one OLIR row to an SSSOM row. Returns null for rows missing either end. */
function olirToSssom(row: OlirRow, a: Args): SssomRow | null {
	const focal = (row[a.subjectCol] ?? '').trim();
	const reference = (row[a.objectCol] ?? '').trim();
	if (!focal || !reference) return null;

	const rel = (row['Relationship'] ?? '').trim().toLowerCase();
	const skos = OLIR_TO_SKOS[rel] ?? DEFAULT_SKOS;

	const strengthRaw = (row['Strength of Relationship (Optional)'] ?? row['Strength of Relationship'] ?? '')
		.toString()
		.trim();
	let confidence: number | undefined;
	if (strengthRaw !== '') {
		const n = Number(strengthRaw);
		// OLIR strength is a 0–10 integer; normalize to a 0–1 confidence.
		if (!Number.isNaN(n)) confidence = Math.max(0, Math.min(1, n / 10));
	}

	return {
		subject_id: `${a.subjectPrefix}:${focal}`,
		predicate_id: skos,
		object_id: `${a.objectPrefix}:${reference}`,
		mapping_justification: 'semapv:ManualMappingCuration',
		confidence,
	};
}

function frontmatterToYaml(fm: Record<string, unknown>): string {
	const lines: string[] = ['---'];
	for (const [k, v] of Object.entries(fm)) {
		if (v === undefined) continue;
		if (v && typeof v === 'object' && !Array.isArray(v)) {
			lines.push(`${k}:`);
			for (const [k2, v2] of Object.entries(v as Record<string, unknown>)) {
				if (v2 && typeof v2 === 'object') {
					lines.push(`  ${k2}:`);
					for (const [k3, v3] of Object.entries(v2 as Record<string, unknown>)) {
						lines.push(`    ${k3}: ${yamlScalar(v3)}`);
					}
				} else {
					lines.push(`  ${k2}: ${yamlScalar(v2)}`);
				}
			}
		} else if (Array.isArray(v)) {
			lines.push(`${k}: [${v.map((x) => yamlScalar(x)).join(', ')}]`);
		} else {
			lines.push(`${k}: ${yamlScalar(v)}`);
		}
	}
	lines.push('---', '');
	return lines.join('\n');
}

/** Numbers emit unquoted (so Obsidian/Bases reads them as numbers); strings get
 *  quoted when they contain YAML-significant characters. */
function yamlScalar(v: unknown): string {
	if (typeof v === 'number' || typeof v === 'boolean') return String(v);
	const s = String(v ?? '');
	if (s === '' || /[:#"'\[\]{}|>&*!?,@`]/.test(s) || /^\s|\s$/.test(s)) {
		return JSON.stringify(s);
	}
	return s;
}

function writeSssomTsv(rows: SssomRow[], a: Args, outPath: string): void {
	const date = a.deterministic ? '2026-05-04' : new Date().toISOString().slice(0, 10);
	const header = [
		'# curie_map:',
		`#   ${a.subjectPrefix}: "https://crosswalker.dev/ontology/${a.subjectPrefix}/"`,
		`#   ${a.objectPrefix}: "https://crosswalker.dev/ontology/${a.objectPrefix}/"`,
		'#   skos: "http://www.w3.org/2004/02/skos/core#"',
		'#   semapv: "https://w3id.org/semapv/vocab/"',
		`# mapping_set_id: "https://crosswalker.dev/crosswalks/${a.subjectPrefix}-to-${a.objectPrefix}"`,
		`# subject_source: "${a.subjectPrefix}"`,
		`# object_source: "${a.objectPrefix}"`,
		`# mapping_provider: "${a.provider}"`,
		`# mapping_date: "${date}"`,
	];
	const cols = ['subject_id', 'predicate_id', 'object_id', 'mapping_justification', 'confidence'];
	const body = rows.map((r) =>
		[r.subject_id, r.predicate_id, r.object_id, r.mapping_justification, r.confidence ?? '']
			.join('\t'),
	);
	mkdirSync(resolve(outPath, '..'), { recursive: true });
	writeFileSync(outPath, [...header, cols.join('\t'), ...body].join('\n') + '\n');
}

function main(): void {
	const a = parseArgs(process.argv.slice(2));

	// Load + AJV-validate the generic crosswalk-edge recipe (same validator the plugin uses).
	const recipePath = resolve(import.meta.dir, '../recipes/import/crosswalk-edge.json');
	const recipe = JSON.parse(readFileSync(recipePath, 'utf8')) as Recipe;
	const recipeCheck = validateRecipe(recipe);
	if (!recipeCheck.valid) {
		console.error('crosswalk-edge.json failed recipe-schema validation:', recipeCheck.errors);
		process.exit(1);
	}

	const olirRows = readOlir(resolve(a.source), a.sheets);
	const sourceHash = 'sha256-' + createHash('sha256').update(readFileSync(resolve(a.source))).digest('hex');

	if (a.clean && existsSync(a.target)) rmSync(a.target, { recursive: true, force: true });
	mkdirSync(a.target, { recursive: true });

	const sssomRows: SssomRow[] = [];
	const seen = new Set<string>();
	let wrote = 0;
	let skipped = 0;
	let invalid = 0;

	for (const row of olirRows) {
		const sssom = olirToSssom(row, a);
		if (!sssom) {
			skipped++;
			continue;
		}
		const dedupeKey = `${sssom.subject_id}|${sssom.object_id}`;
		if (seen.has(dedupeKey)) continue;
		seen.add(dedupeKey);
		sssomRows.push(sssom);

		// Build the render scope: SKOS in the TSV, STRM in the note.
		const scope: Record<string, unknown> = {
			subject_id: sssom.subject_id,
			object_id: sssom.object_id,
			strm_predicate: skosToStrm(sssom.predicate_id),
			sssom_predicate: sssom.predicate_id,
			mapping_justification: sssom.mapping_justification,
			mapping_provider: a.provider,
			match_confidence: sssom.confidence ?? '',
		};
		const curie = `xwalk:${slug(sssom.subject_id)}--${slug(sssom.object_id)}`;
		const address = render(recipe, { curie, scope });

		// Assemble the note frontmatter; drop empty optional fields; coerce number.
		const fm: Record<string, unknown> = { ...address.frontmatter };
		for (const k of Object.keys(fm)) {
			if (fm[k] === '') delete fm[k];
		}
		if (sssom.confidence !== undefined) fm.match_confidence = sssom.confidence;
		fm._crosswalker = {
			spec_version: SPEC_VERSION,
			source_ref: {
				file: a.source.split('/').pop(),
				curie: `${a.subjectPrefix}:_`,
				source_hash: sourceHash,
			},
			produced_at: a.deterministic ? DETERMINISTIC_TIMESTAMP : new Date().toISOString(),
			recipe: { id: recipe.recipe },
		};

		// Validate against the Tier 1 schema (the implemented validator) before writing.
		const check = validateTier1Frontmatter(fm);
		if (!check.valid) {
			invalid++;
			if (invalid <= 3) console.error(`  invalid edge ${curie}:`, JSON.stringify(check.errors?.slice(0, 2)));
			continue;
		}

		const body = `\`${sssom.subject_id}\` ${scope.strm_predicate} \`${sssom.object_id}\`\n`;
		const fileName = `cw-${slug(sssom.subject_id)}--${slug(sssom.object_id)}.md`;
		writeFileSync(resolve(a.target, fileName), frontmatterToYaml(fm) + body);
		wrote++;
	}

	if (a.sssomOut) writeSssomTsv(sssomRows, a, resolve(a.sssomOut));

	console.log(`  source:   ${a.source.split('/').pop()}`);
	console.log(`  edges:    ${a.subjectPrefix} → ${a.objectPrefix}`);
	console.log(`  read:     ${olirRows.length} OLIR rows`);
	console.log(`  skipped:  ${skipped} (missing focal/reference)`);
	if (invalid) console.log(`  invalid:  ${invalid} (failed Tier 1 schema — NOT written)`);
	console.log(`  wrote:    ${wrote} crosswalk-edge notes → ${a.target}`);
	if (a.sssomOut) console.log(`  sssom:    ${sssomRows.length} rows → ${a.sssomOut}`);
	console.log('  done.');
}

main();
