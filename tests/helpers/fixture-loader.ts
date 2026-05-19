/**
 * fixture-loader.ts — Phase 6.1 test helper
 *
 * Loads realistic CSV/TSV fixtures from tools/fixtures/realistic/ as row
 * arrays for integration testing. No Obsidian deps. Uses PapaParse for
 * robust CSV parsing (handles quoted fields with embedded commas, etc.).
 *
 * Two surface shapes:
 *   - loadConceptFixture(name) → concept rows (id, title, family/clause/etc, parent, description)
 *   - loadCrosswalkFixture(name) → mapping rows (subject_id, predicate_id, object_id, ...)
 *
 * Auto-detects SSSOM TSV (lines starting with `#` are stripped before parsing)
 * vs plain CSV via filename suffix.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import Papa from 'papaparse';

const FIXTURE_DIR = join(__dirname, '..', '..', 'tools', 'fixtures', 'realistic');

export interface ConceptRow {
	id: string;
	title: string;
	parent?: string;
	description?: string;
	[key: string]: unknown;
}

export interface CrosswalkRow {
	subject_id: string;
	predicate_id: string;
	object_id: string;
	match_type?: string;
	confidence?: number;
	mapping_justification?: string;
	mapping_provider?: string;
	subject_label?: string;
	object_label?: string;
	[key: string]: unknown;
}

/**
 * Load a realistic concept-shaped fixture. Returns typed row array.
 */
export function loadConceptFixture(filename: string): ConceptRow[] {
	const content = readFileSync(join(FIXTURE_DIR, filename), 'utf-8');
	const rows = parseFixture(content, filename);
	return rows as ConceptRow[];
}

/**
 * Load a realistic crosswalk-shaped fixture (CSV or SSSOM TSV).
 * Coerces `confidence` field to number when present.
 */
export function loadCrosswalkFixture(filename: string): CrosswalkRow[] {
	const content = readFileSync(join(FIXTURE_DIR, filename), 'utf-8');
	const rows = parseFixture(content, filename) as CrosswalkRow[];
	// Coerce confidence to number where present
	for (const r of rows) {
		if (r.confidence != null && typeof r.confidence === 'string') {
			r.confidence = parseFloat(r.confidence);
		}
	}
	return rows;
}

/**
 * Parse a CSV or SSSOM TSV fixture into row objects. Strips `#`-prefixed
 * SSSOM curie-map header lines before parsing the tabular data.
 */
function parseFixture(content: string, filename: string): Record<string, unknown>[] {
	const isSssomTsv = filename.endsWith('.sssom.tsv');
	const isTsv = filename.endsWith('.tsv');
	const delimiter = isTsv ? '\t' : ',';

	let dataContent = content;
	if (isSssomTsv) {
		// Strip SSSOM header lines (start with `#`)
		dataContent = content
			.split('\n')
			.filter((line) => !line.startsWith('#'))
			.join('\n');
	}

	const result = Papa.parse(dataContent, {
		header: true,
		delimiter,
		skipEmptyLines: true,
		dynamicTyping: false, // keep everything as strings; coerce per-fixture if needed
	});

	if (result.errors.length > 0) {
		throw new Error(`Fixture parse error in ${filename}: ${result.errors.map((e) => e.message).join('; ')}`);
	}

	return result.data as Record<string, unknown>[];
}

/**
 * Convenience: list of all realistic fixtures we know about.
 * Useful for parameterized "every fixture parses" sanity tests.
 */
export const REALISTIC_FIXTURES = {
	concepts: {
		cis: 'cis-controls-v8-subset.csv',
		iso27001: 'iso27001-2022-subset.csv',
		mitreAttack: 'mitre-attack-persistence-subset.csv',
		nist80053: 'nist-800-53-ac-family.csv',
		nistCsf: 'nist-csf-2.0-govern-identify.csv',
		soc2: 'soc2-trust-services-subset.csv',
	},
	crosswalks: {
		csfTo80053: 'csf-to-800-53-crosswalk.csv',
		iso27001ToSoc2: 'iso27001-to-soc2.sssom.tsv',
		nistCsfToMitreAttack: 'nist-csf-to-mitre-attack.sssom.tsv',
	},
} as const;
