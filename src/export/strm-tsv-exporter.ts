/**
 * strm-tsv-exporter.ts — v0.1.7 exporters: crosswalk-edge notes → STRM-shaped
 * TSV (the NIST IR 8278A r1 OLIR template's column shape).
 *
 * The reverse direction of tools/crosswalk-from-olir.ts, which reads an OLIR
 * workbook's `Focal Document Element` / `Reference Document Element` /
 * `Relationship` / `Strength of Relationship (Optional)` columns and produces
 * crosswalk-edge notes (via the OLIR → SKOS → STRM predicate chain documented
 * there). This exporter runs that chain in reverse: STRM predicate_id on the
 * note → OLIR "Relationship" label in the TSV, so a vault populated by
 * crosswalk-from-olir.ts (or by SSSOM import, which also normalizes to STRM)
 * can be handed back to someone who only speaks the OLIR/STRM TSV format —
 * Excel-friendly, no SSSOM/SKOS vocabulary in the output.
 *
 * Column set precedent: tools/crosswalk-from-olir.ts's `readOlir()` (the
 * ONLY existing STRM/OLIR-shaped I/O in this codebase) reads `Focal Document
 * Element`, `Reference Document Element`, `Relationship`, and `Strength of
 * Relationship (Optional)` as configurable column names defaulting to those
 * exact NIST IR 8278A r1 template labels. This exporter emits the same
 * labels (plus `Focal Document` / `Reference Document` / `Rationale`, also
 * standard OLIR template columns) so a round-trip through
 * `crosswalk-from-olir.ts --source <this-output>` is at least column-name
 * compatible (full byte-identical round-trip isn't claimed — OLIR
 * `Strength of Relationship` is a 0-10 integer scale and `match_confidence`
 * is 0-1, so the conversion is a lossy `Math.round(confidence * 10)`, same
 * as the forward direction's `n / 10` normalization).
 *
 * Known lossy field: `is_approximate_to` (STRM) has no OLIR relationship
 * equivalent — OLIR's five types are Subset / Superset / Equal / Intersects /
 * Not Related (see docs/.../reference/registry/olir.mdx), with no "close but
 * not equal" concept. Falls back to "intersects with", documented below.
 */

import Papa from 'papaparse';
import type { App } from 'obsidian';
import { readVaultTree, type CrosswalkEdgeRow, type SkippedNote } from './vault-reader';

/**
 * STRM predicate_id → OLIR "Relationship" label. Reverse of the OLIR_TO_SKOS
 * ∘ SKOS_TO_STRM composition in tools/crosswalk-from-olir.ts:
 *   equal → is_equivalent_to        (reverse: is_equivalent_to → equal)
 *   subset of → is_narrower_than    (reverse: is_narrower_than → subset of)
 *   superset of → is_broader_than   (reverse: is_broader_than → superset of)
 *   intersects with → intersects_with (reverse: intersects_with → intersects with)
 * `is_approximate_to` and `no_relationship` have no forward-direction OLIR
 * source in that tool (they only arise from SSSOM's closeMatch and STRM's
 * own explicit "no_relationship", respectively) — both fall back per OLIR's
 * closest available type, documented lossy.
 */
const STRM_TO_OLIR: Record<string, string> = {
	is_equivalent_to: 'equal',
	is_narrower_than: 'subset of',
	is_broader_than: 'superset of',
	intersects_with: 'intersects with',
	is_approximate_to: 'intersects with', // lossy: OLIR has no "close match" relationship type
	no_relationship: 'not related',
};

const STRM_COLUMNS = [
	'Focal Document',
	'Focal Document Element',
	'Reference Document',
	'Reference Document Element',
	'Relationship',
	'Strength of Relationship (Optional)',
	'Rationale',
] as const;

export interface StrmExportOptions {
	/** Override the `Focal Document` column (default: per-row `source_framework` frontmatter, else the subject CURIE prefix). */
	focalDocument?: string;
	/** Override the `Reference Document` column (default: per-row `target_framework` frontmatter, else the object CURIE prefix). */
	referenceDocument?: string;
}

export interface StrmExportResult {
	tsv: string;
	rowCount: number;
	skipped: SkippedNote[];
}

function localOf(curie: string): string {
	const idx = curie.indexOf(':');
	return idx === -1 ? curie : curie.slice(idx + 1);
}

function curiePrefix(curie: string): string {
	const idx = curie.indexOf(':');
	return idx === -1 ? curie : curie.slice(0, idx);
}

function asString(v: unknown): string | undefined {
	return typeof v === 'string' && v.length > 0 ? v : undefined;
}

/**
 * Serialize a set of crosswalk-edge rows into an OLIR/STRM-shaped TSV.
 * Pure — no vault I/O. Rows re-sorted by path first for determinism.
 */
export function crosswalkEdgesToStrmTsv(edges: CrosswalkEdgeRow[], options: StrmExportOptions = {}): StrmExportResult {
	const skipped: SkippedNote[] = [];
	const rows: Record<string, string>[] = [];

	const sorted = [...edges].sort((a, b) => a.path.localeCompare(b.path));
	for (const edge of sorted) {
		if (!edge.subject_id || !edge.object_id) {
			skipped.push({ path: edge.path, reason: 'missing subject_id/object_id' });
			continue;
		}
		const relationship = STRM_TO_OLIR[edge.predicate_id] ?? 'intersects with';
		const strength =
			edge.match_confidence !== undefined ? String(Math.round(edge.match_confidence * 10)) : '';

		rows.push({
			'Focal Document': options.focalDocument ?? asString(edge.frontmatter.source_framework) ?? curiePrefix(edge.subject_id),
			'Focal Document Element': localOf(edge.subject_id),
			'Reference Document': options.referenceDocument ?? asString(edge.frontmatter.target_framework) ?? curiePrefix(edge.object_id),
			'Reference Document Element': localOf(edge.object_id),
			Relationship: relationship,
			'Strength of Relationship (Optional)': strength,
			Rationale: edge.mapping_justification ?? '',
		});
	}

	const body = Papa.unparse(rows, { columns: [...STRM_COLUMNS], delimiter: '\t', newline: '\n' });
	return { tsv: `${body}\n`, rowCount: rows.length, skipped };
}

/** Walk `rootPath` and export every crosswalk-edge note found under it as an OLIR/STRM-shaped TSV. */
export async function exportFolderAsStrmTsv(
	app: App,
	rootPath: string,
	options: StrmExportOptions = {},
): Promise<StrmExportResult> {
	const tree = await readVaultTree(app, rootPath);
	const result = crosswalkEdgesToStrmTsv(tree.crosswalkEdges, options);
	result.skipped.push(...tree.skipped);
	return result;
}
