/**
 * golden-vault.ts — L3 golden-vault harness (testing doctrine 2026-07-10).
 *
 * `buildVaultInMemory(csvPath)` runs the full HEADLESS import pipeline over a
 * real corpus subset and returns the generated vault as a `Map<path, noteText>`
 * — the exact artifact a human/graph/YAML-parser consumes. It composes the PURE
 * modules directly (never the in-flight workbench.ts):
 *
 *   parse CSV → analyzeColumns → detectStructure → instantiate(default preset)
 *     → toRecipeRegions → render(each row) → note frontmatter assembly
 *     → buildNoteContent
 *
 * The frontmatter assembly (fold address.tags/aliases in, attach provenance,
 * body = title/curie H1) mirrors generation-engine's native recipe path
 * (generateFromRecipe steps 5/9/10) so the golden reflects what the note WRITER
 * emits — buildNoteContent, normalizeTagList, normalizeAliasList and
 * buildProvenance are imported from src (zero drift on the load-bearing bits).
 *
 * Determinism: render() is pure and byte-stable; row order is preserved; the one
 * non-deterministic field — provenance.produced_at (`new Date().toISOString()`)
 * — is normalized to a fixed sentinel HERE in the harness, never in src.
 */

import { readFileSync } from 'node:fs';
import { basename } from 'node:path';
import { parseCSV, analyzeColumns } from '../../src/import/parsers/csv-parser';
import { detectStructure } from '../../src/import/detection';
import { instantiate } from '../../src/import/mapping/instantiate';
import { BROWSABLE_FRAMEWORK } from '../../src/import/mapping/presets';
import { toRecipeRegions } from '../../src/import/mapping/serialize';
import { deriveFacetMemberships, type FacetMembership } from '../../src/import/mapping/facets';
import { render, type Recipe } from '../../src/render';
import {
	buildNoteContent,
	normalizeTagList,
	normalizeAliasList,
} from '../../src/generation/generation-engine';
import { enrich, type EnrichNote, type EnrichmentResult } from '../../src/generation/enrich';
import { buildProvenance } from '../../src/generation/provenance';

/** Fixed sentinel that replaces the wall-clock `produced_at` so goldens are stable. */
export const PRODUCED_AT_SENTINEL = '1970-01-01T00:00:00.000Z';

/** The four committed corpora under test-vault/Crosswalker Test Data/. */
export const CORPORA = [
	'mitre-attack-persistence-subset.csv',
	'cis-controls-v8-subset.csv',
	'nist-csf-2.0-govern-identify.csv',
	'sample-nist-controls.csv',
] as const;

export type CorpusFile = (typeof CORPORA)[number];

/** Absolute path to a corpus CSV in the test vault. */
export function corpusPath(file: string): string {
	return `${__dirname}/../../test-vault/Crosswalker Test Data/${file}`;
}

/** Stable corpus id (slug) used for the recipe id, curie prefix, and golden dir. */
export function corpusId(file: string): string {
	return basename(file, '.csv');
}

/** Directory (relative to repo root) holding a corpus's committed golden notes. */
export function goldenDir(file: string): string {
	return `tools/golden/${corpusId(file)}`;
}

/**
 * Build the in-memory vault for one corpus CSV. Returns Map<relativePath,
 * noteText>. Paths are the render() output (no output-base prefix) so goldens
 * stay focused on the emitted structure. Runs the full pipeline INCLUDING Pass
 * 1.5 batch enrichment, so the committed goldens capture the enriched vault.
 */
export async function buildVaultInMemory(csvPath: string): Promise<Map<string, string>> {
	return (await buildVaultDetailed(csvPath)).vault;
}

/** buildVaultInMemory + the enrichment result (edge count, hubs) for invariants. */
export interface BuiltVault {
	vault: Map<string, string>;
	enrichment: EnrichmentResult;
}

/**
 * Build one corpus vault AND return the enrichment result. Same pipeline as
 * buildVaultInMemory (which delegates here); exposed so the L3 invariants can
 * assert edge count + hub reachability without re-parsing every note.
 */
export async function buildVaultDetailed(csvPath: string): Promise<BuiltVault> {
	const id = corpusId(csvPath);
	const content = readFileSync(csvPath, 'utf8');
	const parsed = await parseCSV(content);
	if (!Array.isArray(parsed.rows)) {
		throw new Error(`Corpus ${id} parsed as a stream; golden corpora must be eager.`);
	}

	const columns = analyzeColumns(parsed);
	const detections = detectStructure(parsed, columns);
	const mapping = instantiate(BROWSABLE_FRAMEWORK, detections);
	const regions = toRecipeRegions(mapping);
	const recipe: Recipe = {
		recipe: id,
		source: { ontology: id },
		target: regions as Recipe['target'],
	};

	const prefix = slugForCurie(id);

	// Pass 1 — render each row into a note record (frontmatter minus provenance).
	interface Record0 {
		path: string;
		curie: string;
		frontmatter: Record<string, unknown>;
		facets: FacetMembership[];
	}
	const records: Record0[] = [];
	parsed.rows.forEach((row, i) => {
		const rowNum = i + 1;
		const curie = `${prefix}:${curieLocalPart(row, rowNum)}`;
		const address = render(recipe, { curie, scope: row as Record<string, unknown> });

		const path = normalizeVaultPath(address.primary.path);
		if (!path || path === '.md') return; // an unrenderable row surfaces elsewhere; skip in the vault

		// Frontmatter assembly (mirrors generateFromRecipe steps 5/9/10), minus the
		// provenance block — that is attached last, AFTER enrichment, so a `children`
		// list sorts before `_crosswalker` in the emitted YAML.
		const frontmatter: Record<string, unknown> = { ...address.frontmatter };
		if (address.tags.length > 0) {
			const tags = normalizeTagList(address.tags);
			if (tags.length > 0) frontmatter.tags = tags;
		}
		if (address.aliases.length > 0) {
			const aliases = normalizeAliasList(address.aliases);
			if (aliases.length > 0) frontmatter.aliases = aliases;
		}
		records.push({ path, curie, frontmatter, facets: deriveFacetMemberships(mapping, row) });
	});

	// Pass 1.5 — batch enrichment (children lists + facet hubs + edge count).
	const enrichNotes: EnrichNote[] = records.map((r) => ({
		path: r.path,
		curie: r.curie,
		frontmatter: r.frontmatter,
		facets: r.facets,
	}));
	const enrichment = enrich(enrichNotes, {
		ontology: prefix,
		config: recipe.target.enrichment ?? {},
	});

	const vault = new Map<string, string>();
	const attachProvenance = (fm: Record<string, unknown>): void => {
		const prov = buildProvenance(
			{ sourceFile: basename(csvPath), recipeId: recipe.recipe },
			'golden',
		) as Record<string, unknown>;
		prov.produced_at = PRODUCED_AT_SENTINEL; // normalize the one wall-clock field
		fm._crosswalker = prov;
	};

	// Concept notes — patch in children, then attach provenance + serialize.
	for (const r of records) {
		const children = enrichment.childrenByPath.get(r.path);
		if (children) r.frontmatter.children = children;
		attachProvenance(r.frontmatter);
		vault.set(r.path, buildNoteContent(r.frontmatter, defaultBody(r.frontmatter)));
	}

	// Facet hub notes.
	for (const hub of enrichment.hubs) {
		attachProvenance(hub.frontmatter);
		vault.set(hub.path, buildNoteContent(hub.frontmatter, hub.body));
	}

	return { vault, enrichment };
}

// ---------------------------------------------------------------------------
// Small helpers mirroring generation-engine internals (not exported by src, so
// replicated minimally; kept faithful to the current committed behavior).
// ---------------------------------------------------------------------------

/** Minimal path normalize (mirrors obsidian.normalizePath for the shapes we emit). */
function normalizeVaultPath(path: string): string {
	return path.replace(/\\/g, '/').replace(/\/{2,}/g, '/').replace(/^\/+|\/+$/g, '');
}

/** Default note body: H1 title (title ?? curie). Mirrors buildDefaultBody. */
function defaultBody(frontmatter: Record<string, unknown>): string {
	const title = frontmatter.title ?? frontmatter.curie ?? 'Untitled';
	return `# ${String(title)}\n`;
}

/** Per-row CURIE local part (mirrors defaultCurieLocalPart's candidate chain). */
function curieLocalPart(row: Record<string, unknown>, rowNum: number): string {
	const candidate = row.curie ?? row.id ?? row.subject_id ?? row.control_id ?? row.code;
	if (typeof candidate === 'string' && candidate.length > 0) {
		const colonIdx = candidate.indexOf(':');
		const local = colonIdx > 0 ? candidate.slice(colonIdx + 1) : candidate;
		return sanitize(local);
	}
	return `row-${rowNum}`;
}

/** Slug an ontology id into a CURIE-prefix-safe token. */
function slugForCurie(input: string): string {
	return (
		input
			.trim()
			.toLowerCase()
			.replace(/[^a-z0-9]+/g, '-')
			.replace(/^-+|-+$/g, '') || 'source'
	);
}

/** Conservative filename sanitize for the curie local part. */
function sanitize(value: string): string {
	return value.replace(/[\\/:*?"<>|]/g, '-').trim();
}
