/**
 * detection.ts — the structure-detection engine (shape-first wizard, Step 2a).
 *
 * Pure module: NO Obsidian imports, unit-testable headlessly. Given a parsed
 * source (`ParsedData` + `ColumnInfo[]`), it decodes the *shapes frozen in the
 * source* — a packed id hierarchy, a parent column, a low-cardinality facet, a
 * distinct title column — and returns each as a `Detection` carrying its own
 * receipts (matched sample values, coverage %, depth histogram). Per the
 * 2026-07-05 shape-first-wizard spec §2 and the order-of-information decision
 * spine §4 ("detection is the trust engine"): the system never silently decides
 * structure; it *proposes with evidence*, and the wizard confirms.
 *
 * Every `Detection` carries a `proposal` payload (except `title-candidate`,
 * which is an identity hint, not a structural relation) shaped so the wizard can
 * serialize it straight into a recipe region — folder templates / a `variadic`
 * block / an `also_emit` tag — with no re-derivation. That 1:1 mapping is the
 * parity contract (spec §5).
 *
 * Determinism is a hard constraint (same input → deep-equal output): columns are
 * visited in source order, delimiters in a fixed order, and all ties break by
 * that fixed order.
 */

import type { ParsedData, ColumnInfo } from '../types/config';
import { isEagerRows } from '../types/config';
import type { VariadicConfig } from '../render/types';

// ============================================================================
// Public detection types
// ============================================================================

/**
 * Candidate delimiters for a packed id hierarchy, in the fixed evaluation order
 * that also breaks ties. Mirrors the set used by the engine's
 * `deriveIdSplitTemplates` so uniform detection tracks today's behavior exactly.
 */
export const PACKED_DELIMITERS = ['.', '-', '_', '/', ':'] as const;

/** Common list separators for multi-value cells (facet cardinality counting). */
export const LIST_DELIMITERS = [',', ';'] as const;

/**
 * How a confirmed packed-hierarchy detection re-encodes in the vault.
 *
 * `fixed-folders`  — one folder template per delimiter level, matching today's
 *   `deriveIdSplitTemplates` output; serializes to `HierarchyMapping.template`
 *   entries (fixed layout folder levels).
 * `variadic-folders` — a single `variadic` block on a folder entry; serializes
 *   to `layout_entry.variadic` (`VariadicConfig`). This is the ragged case the
 *   current 80% threshold silently flattens — the reason ATT&CK imported flat.
 */
export type LayoutProposal =
	| { mechanism: 'fixed-folders'; templates: string[] }
	| { mechanism: 'variadic-folders'; variadic: VariadicConfig };

/**
 * How a confirmed parent-column detection re-encodes.
 *
 * Interim (v0.1): a managed frontmatter wikilink from each child to its parent
 * note (`frontmatterKey` → `[[<parent>]]`, the --depad pattern). Forward-compat:
 * once the `wikilink` layout mechanism ships (v0.2), `predicate` feeds a
 * `graph_edges` entry (`{ from, via: predicate, to }`). The wizard presents
 * folders-vs-links as a genuine D3 choice; this proposal is the links option.
 */
export interface EdgeProposal {
	/** Column holding parent identifiers (values that reference the id column). */
	parentColumn: string;
	/** Column whose value set the parent identifiers point into. */
	idColumn: string;
	/** Interim serialization: managed frontmatter key holding the parent wikilink. */
	frontmatterKey: string;
	/** Forward-compat `graph_edges` predicate (SKOS broader by default). */
	predicate: string;
}

/**
 * How a confirmed facet detection re-encodes: an `also_emit.tags` template
 * (`#<facet>/<value|tagsafe>`), so every note gains one tag per cell value.
 */
export interface TagProposal {
	/** Source column the facet is drawn from. */
	column: string;
	/**
	 * Template string for `also_emit.tags`. Literal facet namespace + the cell
	 * value through the `tagsafe` filter, e.g. `tactic/{tactic|tagsafe}`.
	 */
	tagTemplate: string;
	/** True when cells hold several values (split on `,`/`;`) → several tags. */
	multiValue: boolean;
}

/**
 * A single structural finding with its receipts. The discriminant `kind` selects
 * the payload; `proposal` (where present) is directly serializable to a recipe
 * region per the parity contract (spec §5).
 */
export type Detection =
	| {
			kind: 'packed-hierarchy';
			column: string;
			/** Operative delimiter (primary one, for the multi-delimiter uniform case). */
			delimiter: string;
			/** % non-empty sampled values containing the delimiter with content on both sides. */
			coverage: number;
			/** parts-count (after split+filter(Boolean)) → number of sampled values. */
			depthHistogram: Record<number, number>;
			classification: 'uniform' | 'ragged';
			/** Up to 5 matched sample values — the card's receipts. */
			sampleValues: string[];
			proposal: LayoutProposal;
	  }
	| {
			kind: 'parent-column';
			column: string;
			idColumn: string;
			/** % of the column's sampled non-empty values found in the id column's value set. */
			matchRate: number;
			sampleValues: string[];
			proposal: EdgeProposal;
	  }
	| {
			kind: 'facet-candidate';
			column: string;
			/** Distinct atomic values after splitting multi-value cells. */
			cardinality: number;
			sampleValues: string[];
			proposal: TagProposal;
	  }
	| {
			kind: 'title-candidate';
			column: string;
			/** distinct / non-empty count — closeness to 1 means "one note name per row". */
			distinctness: number;
			sampleValues: string[];
	  };

// ============================================================================
// Thresholds (spec §2 — every one is pinned by a test in detection.test.ts)
// ============================================================================

/** Max non-empty values sampled per column for packed-hierarchy analysis. */
const HIERARCHY_SAMPLE_LIMIT = 500;
/** Max values sampled per column when computing a parent match rate. */
const PARENT_SAMPLE_LIMIT = 500;
/** Delimiter coverage below this → no packed-hierarchy signal at all. */
const COVERAGE_FLOOR = 0.2;
/** Coverage at/above this (with a dominant part-count) → uniform, not ragged. */
const COVERAGE_UNIFORM = 0.8;
/** Fraction of covered rows that must share one part-count for `uniform`. */
const UNIFORM_DEPTH_AGREEMENT = 0.9;
/** Parent-column match rate at/above this → a parent-column detection. */
const PARENT_MATCH_MIN = 0.6;
/** A column counts as "id-like" (identity/reference target) at/above this distinctness. */
const ID_DISTINCTNESS_MIN = 0.9;
/** A column counts as a title candidate at/above this distinctness. */
const TITLE_DISTINCTNESS_MIN = 0.9;
/** Fraction of values that must be non-numeric for a title candidate. */
const TITLE_NONNUMERIC_MIN = 0.5;
/** Facet cardinality cap floor (spec: max(20, rows × 0.05)). */
const FACET_CARDINALITY_FLOOR = 20;
const FACET_CARDINALITY_RATIO = 0.05;
/** Number of receipt sample values surfaced per detection. */
const SAMPLE_VALUES = 5;

// ============================================================================
// Entry point
// ============================================================================

/**
 * Detect the structural shapes frozen in a parsed source.
 *
 * Operates on eager rows (the wizard's preview/sample path). Streaming sources
 * (`AsyncIterable` rows) can't be scanned synchronously, so this falls back to
 * the sample values already carried on `ColumnInfo`; detection is then
 * best-effort on that small sample. Full-fidelity detection assumes an eager
 * `ParsedData` — which is what the wizard hands over at Step 2a.
 *
 * Output order is deterministic: packed-hierarchy (column order), then
 * parent-column (child-column order, then id-column order), then facet
 * (column order), then title (column order).
 */
export function detectStructure(data: ParsedData, columns: ColumnInfo[]): Detection[] {
	const columnInfo = new Map(columns.map((c) => [c.name, c]));
	// Materialize normalized non-empty values per column once — every detector
	// reads from this map so the source is scanned a single time.
	const valuesByColumn = collectColumnValues(data, columns);

	// Distinctness per column drives id-likeness / title / facet exclusions.
	const distinctnessByColumn = new Map<string, number>();
	for (const col of data.columns) {
		const values = valuesByColumn.get(col) ?? [];
		distinctnessByColumn.set(col, values.length === 0 ? 0 : new Set(values).size / values.length);
	}

	// id-like columns: mostly-unique value sets. Used as parent-column reference
	// sets and to exclude id columns from facet/title proposals.
	const idColumns = data.columns.filter((c) => (distinctnessByColumn.get(c) ?? 0) >= ID_DISTINCTNESS_MIN);
	const idColumnSet = new Set(idColumns);

	const rowCount = countRows(data, valuesByColumn);

	// --- Pass 1: packed-hierarchy (one detection per column, at most) ---
	const packed: Detection[] = [];
	const packedColumns = new Set<string>();
	for (const col of data.columns) {
		const detection = detectPackedHierarchy(col, valuesByColumn.get(col) ?? []);
		if (detection) {
			packed.push(detection);
			packedColumns.add(col);
		}
	}

	// --- Pass 2: parent-column (child column ⊆ an id column's value set) ---
	const parents: Detection[] = [];
	const parentColumns = new Set<string>();
	for (const child of data.columns) {
		if (idColumnSet.size === 0) break;
		for (const idCol of idColumns) {
			if (child === idCol) continue;
			const detection = detectParentColumn(
				child,
				idCol,
				valuesByColumn.get(child) ?? [],
				valuesByColumn.get(idCol) ?? [],
			);
			if (detection) {
				parents.push(detection);
				parentColumns.add(child);
				// One parent target is enough — a child references a single id scheme.
				break;
			}
		}
	}

	// --- Pass 3: facet-candidate (low cardinality, not id/title/parent) ---
	const facets: Detection[] = [];
	for (const col of data.columns) {
		if (idColumnSet.has(col) || packedColumns.has(col) || parentColumns.has(col)) continue;
		const detection = detectFacet(col, valuesByColumn.get(col) ?? [], rowCount);
		if (detection) facets.push(detection);
	}

	// --- Pass 4: title-candidate (high distinctness, non-numeric, not the id) ---
	const titles: Detection[] = [];
	for (const col of data.columns) {
		if (packedColumns.has(col)) continue; // packed id columns are identity, not title
		const detection = detectTitle(col, valuesByColumn.get(col) ?? [], distinctnessByColumn.get(col) ?? 0, columnInfo.get(col));
		if (detection) titles.push(detection);
	}

	return [...packed, ...parents, ...facets, ...titles];
}

// ============================================================================
// Packed-hierarchy detection
// ============================================================================

/**
 * Per-delimiter measurements over a column's sampled values.
 */
interface DelimiterStats {
	delimiter: string;
	/** % of values with the delimiter present and content on both sides. */
	coverage: number;
	/** parts-count → count, over ALL sampled values (uncovered rows contribute their 1 part). */
	histogram: Record<number, number>;
	/** Among covered rows only, the fraction sharing the most common part-count. */
	modeFraction: number;
	classification: 'uniform' | 'ragged' | 'none';
}

/**
 * Classify a column's id structure and, when present, return the packed-hierarchy
 * detection with a directly-serializable layout proposal.
 *
 * Uniform (a clean, same-depth delimiter across ≥80% of rows) reuses the exact
 * `deriveIdSplitTemplates` semantics — mirrored here as `deriveFixedSplitTemplates`
 * to keep this module Obsidian-free; a parity test pins the two outputs equal.
 * Ragged (the 20–79% coverage case, or ≥80% coverage with mixed depths) proposes
 * a `variadic` block instead of silently flattening.
 */
function detectPackedHierarchy(column: string, allValues: string[]): Detection | null {
	const sample = allValues.slice(0, HIERARCHY_SAMPLE_LIMIT);
	if (sample.length === 0) return null;

	const stats = PACKED_DELIMITERS.map((d) => analyzeDelimiter(sample, d));
	const uniform = stats.filter((s) => s.classification === 'uniform');

	if (uniform.length >= 1) {
		// Fixed levels — delegate to the mirrored engine semantics so multi-delimiter
		// ordering (CSF `.` then `-`) matches today's recipe exactly.
		const templates = deriveFixedSplitTemplates(column, sample);
		const fixed = templates.length > 0 ? templates : uniform.map((u) => `{${column}|split(${u.delimiter},0)}`);
		// Primary delimiter = the first fixed level's delimiter (first by rep position).
		const primaryDelim = parseSplitDelimiter(fixed[0]) ?? uniform[0].delimiter;
		const primaryStats = stats.find((s) => s.delimiter === primaryDelim) ?? uniform[0];
		return {
			kind: 'packed-hierarchy',
			column,
			delimiter: primaryDelim,
			coverage: round(primaryStats.coverage),
			depthHistogram: primaryStats.histogram,
			classification: 'uniform',
			sampleValues: sample.slice(0, SAMPLE_VALUES),
			proposal: { mechanism: 'fixed-folders', templates: fixed },
		};
	}

	// No uniform delimiter — take the strongest ragged signal, if any.
	const ragged = stats.filter((s) => s.classification === 'ragged');
	if (ragged.length === 0) return null;
	// Highest coverage wins; PACKED_DELIMITERS order breaks ties (stable sort input).
	const best = ragged.reduce((a, b) => (b.coverage > a.coverage ? b : a));
	const variadic: VariadicConfig = { delimiter: best.delimiter, segment: 'prefix', drop_last: true };
	return {
		kind: 'packed-hierarchy',
		column,
		delimiter: best.delimiter,
		coverage: round(best.coverage),
		depthHistogram: best.histogram,
		classification: 'ragged',
		sampleValues: sample.slice(0, SAMPLE_VALUES),
		proposal: { mechanism: 'variadic-folders', variadic },
	};
}

/**
 * Measure one delimiter over a sample. "Covered" means the delimiter appears
 * with content on both sides (index in `(0, len-1)`), matching the engine's
 * qualifying test. Part-count is `split(d).filter(Boolean).length` — empty
 * pieces (e.g. `A..B`) don't inflate depth, consistent with render's folder
 * mechanism which drops empty segments.
 */
function analyzeDelimiter(values: string[], delimiter: string): DelimiterStats {
	let covered = 0;
	const histogram: Record<number, number> = {};
	const coveredParts: Record<number, number> = {};
	for (const v of values) {
		const i = v.indexOf(delimiter);
		const isCovered = i > 0 && i < v.length - 1;
		if (isCovered) covered++;
		const parts = v.split(delimiter).filter(Boolean).length;
		histogram[parts] = (histogram[parts] ?? 0) + 1;
		if (isCovered) coveredParts[parts] = (coveredParts[parts] ?? 0) + 1;
	}
	const coverage = values.length === 0 ? 0 : covered / values.length;
	let modeFraction = 0;
	if (covered > 0) {
		const max = Math.max(...Object.values(coveredParts));
		modeFraction = max / covered;
	}
	let classification: DelimiterStats['classification'];
	if (coverage < COVERAGE_FLOOR) {
		classification = 'none';
	} else if (coverage >= COVERAGE_UNIFORM && modeFraction >= UNIFORM_DEPTH_AGREEMENT) {
		classification = 'uniform';
	} else {
		classification = 'ragged';
	}
	return { delimiter, coverage, histogram, modeFraction, classification };
}

/**
 * Mirror of `deriveIdSplitTemplates` (generation-engine.ts) — kept as a private
 * copy so this module stays free of the Obsidian-importing engine. The two are
 * pinned equal by parity assertions in tests/detection.test.ts (the CSF/SCF/AC
 * fixtures assert this output deep-equals `deriveIdSplitTemplates(...)`). Do NOT
 * edit one without the other; the test will catch drift.
 */
function deriveFixedSplitTemplates(column: string, values: string[]): string[] {
	const samples = values.map((v) => String(v ?? '').trim()).filter(Boolean).slice(0, 200);
	if (samples.length === 0) return [];

	const threshold = Math.max(1, Math.floor(samples.length * 0.8));
	const qualifying = (PACKED_DELIMITERS as readonly string[]).filter((d) => {
		let hits = 0;
		for (const s of samples) {
			const i = s.indexOf(d);
			if (i > 0 && i < s.length - 1) hits++;
		}
		return hits >= threshold;
	});
	if (qualifying.length === 0) return [];

	const rep = samples.reduce((a, b) => (b.length > a.length ? b : a), samples[0]);
	const ordered = qualifying
		.map((d) => ({ d, pos: rep.indexOf(d) }))
		.filter((x) => x.pos >= 0)
		.sort((a, b) => a.pos - b.pos)
		.map((x) => x.d);

	return ordered.map((d) => `{${column}|split(${d},0)}`);
}

/** Pull the delimiter `X` out of a `{col|split(X,0)}` template, or null. */
function parseSplitDelimiter(template: string): string | null {
	const m = /\|split\((.),0\)\}$/.exec(template);
	return m ? m[1] : null;
}

// ============================================================================
// Parent-column detection
// ============================================================================

/**
 * A parent column holds other rows' ids (SKOS broader). Match rate = the fraction
 * of the child's sampled non-empty values found in the id column's full value
 * set. The id column must be mostly-unique (checked by the caller) so the set is
 * a genuine identity space, not a low-cardinality attribute.
 */
function detectParentColumn(
	childColumn: string,
	idColumn: string,
	childValues: string[],
	idValues: string[],
): Detection | null {
	if (childValues.length === 0 || idValues.length === 0) return null;
	const idSet = new Set(idValues);
	const sample = childValues.slice(0, PARENT_SAMPLE_LIMIT);
	let hits = 0;
	for (const v of sample) if (idSet.has(v)) hits++;
	const matchRate = hits / sample.length;
	if (matchRate < PARENT_MATCH_MIN) return null;
	return {
		kind: 'parent-column',
		column: childColumn,
		idColumn,
		matchRate: round(matchRate),
		sampleValues: sample.slice(0, SAMPLE_VALUES),
		proposal: {
			parentColumn: childColumn,
			idColumn,
			frontmatterKey: 'parent',
			predicate: 'skos:broader',
		},
	};
}

// ============================================================================
// Facet-candidate detection
// ============================================================================

/**
 * A facet is a low-cardinality attribute — few distinct values across many rows —
 * that belongs in `also_emit.tags` (post-coordinated classification). Multi-value
 * cells (`a, b`) are split on list delimiters before counting, so a "Tactics"
 * column reads as its handful of tactics, not as hundreds of distinct cell
 * strings.
 */
function detectFacet(column: string, values: string[], rowCount: number): Detection | null {
	if (values.length === 0) return null;
	const atoms = new Set<string>();
	let multiValue = false;
	for (const v of values) {
		const pieces = splitMultiValue(v);
		if (pieces.length > 1) multiValue = true;
		for (const p of pieces) if (p) atoms.add(p);
	}
	const cardinality = atoms.size;
	const cap = Math.max(FACET_CARDINALITY_FLOOR, Math.floor(rowCount * FACET_CARDINALITY_RATIO));
	// Need at least two distinct values (a single-value column isn't a useful
	// facet) and cardinality within the cap.
	if (cardinality < 2 || cardinality > cap) return null;
	return {
		kind: 'facet-candidate',
		column,
		cardinality,
		sampleValues: values.slice(0, SAMPLE_VALUES),
		proposal: {
			column,
			tagTemplate: `${tagRoot(column)}/{${column}|tagsafe}`,
			multiValue,
		},
	};
}

/** Split a cell on common list delimiters (`,` `;`), trimming pieces. */
function splitMultiValue(value: string): string[] {
	let pieces = [value];
	for (const d of LIST_DELIMITERS) {
		pieces = pieces.flatMap((p) => p.split(d));
	}
	return pieces.map((p) => p.trim()).filter((p) => p !== '');
}

/** Deterministic tag-namespace slug for a column name (literal segment root). */
function tagRoot(column: string): string {
	return column
		.trim()
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '');
}

// ============================================================================
// Title-candidate detection
// ============================================================================

/**
 * A title candidate is a near-unique, mostly-non-numeric column — one distinct
 * human-readable name per row — that could name notes. Packed id columns are
 * excluded by the caller (they're identity, not title).
 */
function detectTitle(
	column: string,
	values: string[],
	distinctness: number,
	info: ColumnInfo | undefined,
): Detection | null {
	if (values.length === 0) return null;
	if (distinctness < TITLE_DISTINCTNESS_MIN) return null;
	// A numeric column (or one the parser already typed numeric) is an id/measure,
	// not a title.
	if (info?.detectedType === 'number') return null;
	const numericCount = values.reduce((n, v) => (isNumeric(v) ? n + 1 : n), 0);
	const nonNumericFraction = 1 - numericCount / values.length;
	if (nonNumericFraction < TITLE_NONNUMERIC_MIN) return null;
	return {
		kind: 'title-candidate',
		column,
		distinctness: round(distinctness),
		sampleValues: values.slice(0, SAMPLE_VALUES),
	};
}

// ============================================================================
// Shared helpers
// ============================================================================

/**
 * Normalized, non-empty values per column. Eager rows are scanned directly;
 * streaming rows fall back to the (small) sample already on `ColumnInfo`.
 */
function collectColumnValues(data: ParsedData, columns: ColumnInfo[]): Map<string, string[]> {
	const out = new Map<string, string[]>();
	for (const col of data.columns) out.set(col, []);

	if (isEagerRows(data.rows)) {
		for (const row of data.rows) {
			for (const col of data.columns) {
				const s = normalize(row[col]);
				if (s !== '') out.get(col)!.push(s);
			}
		}
	} else {
		// Streaming source — no synchronous scan possible. Use the pre-computed
		// samples; detection is best-effort on that limited sample.
		for (const info of columns) {
			const list = out.get(info.name);
			if (!list) continue;
			for (const v of info.sampleValues) {
				const s = normalize(v);
				if (s !== '') list.push(s);
			}
		}
	}
	return out;
}

/** Best available row count for the facet cardinality cap. */
function countRows(data: ParsedData, valuesByColumn: Map<string, string[]>): number {
	if (data.rowCount && data.rowCount > 0) return data.rowCount;
	// Streaming/unknown — approximate from the longest materialized column.
	let max = 0;
	for (const list of valuesByColumn.values()) if (list.length > max) max = list.length;
	return max;
}

function normalize(value: unknown): string {
	return String(value ?? '').trim();
}

function isNumeric(value: string): boolean {
	return value !== '' && !Number.isNaN(Number(value));
}

/** Round a fraction to 4 decimals so detection output is stable and readable. */
function round(n: number): number {
	return Math.round(n * 10000) / 10000;
}
