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

import { readFileSync, writeFileSync, mkdirSync, existsSync, rmSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import Papa from 'papaparse';

interface Args {
	source: string;
	target: string;
	ontology: string;
	clean: boolean;
	deterministic: boolean;
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
	const args: Partial<Args> = { clean: false, deterministic: envDeterministic };
	for (let i = 0; i < argv.length; i++) {
		const a = argv[i];
		if (a === '--source') args.source = argv[++i];
		else if (a === '--target') args.target = argv[++i];
		else if (a === '--ontology') args.ontology = argv[++i];
		else if (a === '--clean') args.clean = true;
		else if (a === '--deterministic') args.deterministic = true;
		else if (a === '--help' || a === '-h') {
			printHelp();
			process.exit(0);
		}
	}
	if (!args.source || !args.target || !args.ontology) {
		console.error('Missing required args.\n');
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
  --source <csv>      Input CSV path (relative to repo root). First row is headers.
                      Required columns: id. Optional: name, title, family, family_name,
                      parent, description.
  --target <dir>      Output directory (relative to repo root). Will be created if
                      missing.
  --ontology <slug>   Ontology identifier; becomes the CURIE prefix and
                      _crosswalker.source_ref.curie.
  --clean             Empty the target directory before generating.
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
	console.log(`  ontology: ${args.ontology}`);

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

	const rows = readCsv(sourceAbs);
	console.log(`  rows:     ${rows.length}`);

	let written = 0;
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

	console.log(`  wrote:    ${written} files`);
	console.log(`  done.`);
}

main();
