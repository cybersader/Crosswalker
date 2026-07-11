/**
 * recipe-registry.ts — the recognized-source registry (spec §7m, the vetted fast path).
 *
 * A pure, unit-testable index over the BUNDLED import recipes (`recipes/import/*.json`).
 * On file selection the wizard fingerprints the parsed columns against every entry;
 * a confident match lets the wizard lead with a calm, trust-forward recognized-source
 * card ("Recognized: NIST CSF 2.0 (CPRT export) · vetted recipe · Built-in") whose
 * primary action loads the recipe straight into the review screen via `fromRecipe`
 * (the round-trip law). No match → the ordinary detection flow is unchanged.
 *
 * HOW RECIPES ARE ACCESSED AT RUNTIME
 * -----------------------------------
 * The recipes are imported as JSON modules and BUNDLED into main.js by esbuild
 * (`resolveJsonModule: true`; same mechanism `src/views/recipe-loader.ts` uses for
 * `recipes/v0-1/*.json`). The JSON files remain the single source of truth — there
 * is NO hand-maintained duplicate to keep in sync. Adding a recognized source is a
 * one-line import + one registry entry below.
 *
 * THE MATCH SIGNATURE
 * -------------------
 * A recipe references the source columns it needs directly in its templates
 * (`{element_identifier|split(.,0)}` → the `element_identifier` column). We extract
 * those `{column}` tokens (the text before the first `|`) as the entry's SIGNATURE
 * columns, and the tokens used by STRUCTURAL layout entries (folder/file/heading)
 * as its REQUIRED columns. A source that carries a recipe's required + most of its
 * signature columns almost certainly IS that export. See `matchScore`.
 *
 * Pure module: NO Obsidian imports, NO settings — the wizard composes the UI copy.
 */

import { fromRecipe, type RecipeLike } from './mapping/serialize';
import type { ImportMapping } from './mapping/types';

// Bundled import recipes — esbuild inlines these JSON modules into main.js.
import nistCsf2CprtHierarchical from '../../recipes/import/nist-csf-2-cprt-hierarchical.json';
import nistCsf2Cprt from '../../recipes/import/nist-csf-2-cprt.json';
import nistCsf2Flat from '../../recipes/import/nist-csf-2.json';
import mitreAttackTechnique from '../../recipes/import/mitre-attack-technique.json';
import cisControlsV8Controls from '../../recipes/import/cis-controls-v8-controls.json';
import cisControlsV8Flat from '../../recipes/import/cis-controls-v8.json';
import scf2026Flat from '../../recipes/import/scf-2026-flat.json';
import nist80053Flat from '../../recipes/import/nist-800-53-flat.json';
import criProfileV22 from '../../recipes/import/cri-profile-v2-2.json';

/**
 * A raw import recipe (structural subset). `fromRecipe` reads `target`; the extra
 * `recipe`/`source` fields carry the id + declared level names.
 */
interface RawRecipe {
	recipe: string;
	source?: { ontology?: string; levels?: string[] };
	target: RecipeLike['target'];
}

/** One recognized source: a bundled recipe plus its derived match signature + label. */
export interface RecipeRegistryEntry {
	/** Stable id — the recipe JSON's `recipe` field. */
	id: string;
	/** Human, GRC-first label shown on the card ("NIST CSF 2.0 (CPRT export)"). */
	label: string;
	/** One-line description of what the recipe produces. */
	description: string;
	/** Source ontology id (`nist-csf-2`, `cis-v8`, …). */
	ontology: string;
	/** Declared source level names. */
	levels: string[];
	/** Every `{column}` token the recipe references (normalized-compared at match). */
	signatureColumns: string[];
	/** Columns used by STRUCTURAL layout entries — a hard gate for a confident match. */
	requiredColumns: string[];
	/** Count of folder/heading layout entries — the recipe's nesting depth (tiebreak). */
	structuralDepth: number;
	/** The recipe itself (accepted by `fromRecipe`). */
	recipe: RecipeLike;
}

/** Result of scoring one entry against a source. */
export interface RecipeMatch {
	entry: RecipeRegistryEntry;
	/** 0–100 recipe-coverage score (see `matchScore`). */
	score: number;
}

/**
 * Confident-match threshold. A recipe references exactly the columns it needs, so
 * a source presenting its required column(s) plus >= 75% of its full signature is
 * almost certainly that export. Below this we stay quiet and run ordinary detection.
 */
export const CONFIDENT_MATCH_THRESHOLD = 75;

/** Floor for `findRecognizedRecipes` to surface a partial (non-confident) candidate. */
const CANDIDATE_FLOOR = 40;

// ============================================================================
// Signature extraction (pure)
// ============================================================================

/** Extract the `{column}` tokens a template references (text before the first `|`). */
function templateColumns(template: string): string[] {
	const out: string[] = [];
	const re = /\{([^}]+)\}/g;
	let m: RegExpExecArray | null;
	while ((m = re.exec(template)) !== null) {
		const token = m[1].split('|')[0].trim();
		if (token) out.push(token);
	}
	return out;
}

/** Normalize a column name for tolerant comparison (mirrors config-manager fingerprinting). */
export function normalizeColumn(name: string): string {
	return name.toLowerCase().trim().replace(/[^a-z0-9]/g, '_');
}

/** All signature + required columns of a raw recipe. */
function deriveSignature(raw: RawRecipe): { signature: string[]; required: string[] } {
	const signature = new Set<string>();
	const required = new Set<string>();

	for (const entry of raw.target.layout ?? []) {
		const cols = templateColumns(entry.template);
		for (const c of cols) signature.add(c);
		// Structural entries (folder/file/heading) carry the identity — required.
		if (entry.mechanism === 'folder' || entry.mechanism === 'file' || entry.mechanism === 'heading') {
			for (const c of cols) required.add(c);
		}
	}

	const emit = raw.target.also_emit;
	if (emit) {
		for (const t of emit.tags ?? []) for (const c of templateColumns(t)) signature.add(c);
		for (const a of emit.aliases ?? []) for (const c of templateColumns(a)) signature.add(c);
		const managed = emit.frontmatter?.managed ?? {};
		for (const tmpl of Object.values(managed)) for (const c of templateColumns(tmpl)) signature.add(c);
		const managedLinks = emit.frontmatter?.managed_links ?? {};
		for (const spec of Object.values(managedLinks)) {
			for (const c of templateColumns(spec.template)) signature.add(c);
		}
	}

	return { signature: [...signature], required: [...required] };
}

// ============================================================================
// Registry assembly
// ============================================================================

/** Curated GRC-first labels + descriptions keyed by recipe id (falls back to id). */
const LABELS: Record<string, { label: string; description: string }> = {
	'nist-csf-2-cprt-hierarchical': {
		label: 'NIST CSF 2.0 (CPRT export, nested)',
		description: 'Functions and categories become folders; subcategories become notes.',
	},
	'nist-csf-2-cprt': {
		label: 'NIST CSF 2.0 (CPRT export)',
		description: 'Each CSF element becomes a note with its id, level, and description.',
	},
	'nist-csf-2-flat': {
		label: 'NIST CSF 2.0 (subcategories)',
		description: 'Each subcategory becomes a note.',
	},
	'mitre-attack-technique-flat': {
		label: 'MITRE ATT&CK techniques',
		description: 'Each technique becomes a note keyed by its technique id.',
	},
	'cis-controls-v8-controls': {
		label: 'CIS Controls v8 (controls)',
		description: 'Each CIS control becomes a note with its title and description.',
	},
	'cis-controls-v8-flat': {
		label: 'CIS Controls v8 (safeguards)',
		description: 'Each safeguard becomes a note with its control and implementation groups.',
	},
	'scf-2026-flat': {
		label: 'Secure Controls Framework (2026)',
		description: 'Each SCF control becomes a note with its domain and description.',
	},
	'nist-800-53-r5-flat': {
		label: 'NIST 800-53 Rev 5',
		description: 'Each control becomes a note keyed by its identifier.',
	},
	'cri-profile-v2-2-flat': {
		label: 'CRI Profile v2.2',
		description: 'Each CRI Profile statement becomes a note.',
	},
};

/** Build a registry entry from a bundled raw recipe. */
function toEntry(raw: unknown): RecipeRegistryEntry {
	const r = raw as RawRecipe;
	const { signature, required } = deriveSignature(r);
	const meta = LABELS[r.recipe] ?? { label: r.recipe, description: 'Bundled import recipe.' };
	const structuralDepth = (r.target.layout ?? []).filter(
		(e) => e.mechanism === 'folder' || e.mechanism === 'heading',
	).length;
	return {
		id: r.recipe,
		label: meta.label,
		description: meta.description,
		ontology: r.source?.ontology ?? 'unknown',
		levels: r.source?.levels ?? [],
		signatureColumns: signature,
		requiredColumns: required,
		structuralDepth,
		recipe: raw as RecipeLike,
	};
}

/**
 * The recognized-source registry. Declaration order is the tiebreak for equal
 * scores, so richer/more-specific recipes (the nested CPRT export) are listed
 * before their flatter siblings.
 */
export const RECIPE_REGISTRY: RecipeRegistryEntry[] = [
	toEntry(nistCsf2CprtHierarchical),
	toEntry(nistCsf2Cprt),
	toEntry(nistCsf2Flat),
	toEntry(mitreAttackTechnique),
	toEntry(cisControlsV8Controls),
	toEntry(cisControlsV8Flat),
	toEntry(scf2026Flat),
	toEntry(nist80053Flat),
	toEntry(criProfileV22),
];

// ============================================================================
// Matching (pure, deterministic)
// ============================================================================

/**
 * Score how well a source matches one recipe, 0–100.
 *
 * Base = fraction of the recipe's SIGNATURE columns present in the source (the
 * recipe references exactly what it consumes, so this reads as "how much of what
 * this recipe needs does the source supply"). A recipe whose REQUIRED (structural)
 * columns are missing can never be confident — its score is capped at
 * `CANDIDATE_FLOOR - 1` so it never crosses the confident threshold, however many
 * incidental columns happen to overlap.
 *
 * Deterministic: depends only on the two column sets, never on row order. The
 * optional `sampleRows` argument is accepted for future value-pattern refinement
 * (e.g. verifying a nested recipe's id column actually carries its delimiter); the
 * v0.1 score is column-shape only.
 */
export function matchScore(
	entry: RecipeRegistryEntry,
	columns: string[],
	_sampleRows?: Record<string, unknown>[],
): number {
	if (entry.signatureColumns.length === 0) return 0;
	const have = new Set(columns.map(normalizeColumn));

	const matched = entry.signatureColumns.filter((c) => have.has(normalizeColumn(c))).length;
	const base = Math.round((matched / entry.signatureColumns.length) * 100);

	const requiredPresent = entry.requiredColumns.every((c) => have.has(normalizeColumn(c)));
	if (!requiredPresent) return Math.min(base, CANDIDATE_FLOOR - 1);

	return base;
}

/**
 * Score every registry entry against the source and return the candidates at or
 * above `CANDIDATE_FLOOR`, best first. Ties break by richer vault structure
 * (more folder/heading depth — a nested recipe beats its flat sibling), then more
 * signature columns (more specific), then registry declaration order. All
 * deterministic.
 */
export function findRecognizedRecipes(
	columns: string[],
	sampleRows?: Record<string, unknown>[],
): RecipeMatch[] {
	const scored: (RecipeMatch & { order: number })[] = RECIPE_REGISTRY.map((entry, order) => ({
		entry,
		score: matchScore(entry, columns, sampleRows),
		order,
	}));
	return scored
		.filter((m) => m.score >= CANDIDATE_FLOOR)
		.sort((a, b) => {
			if (b.score !== a.score) return b.score - a.score;
			if (b.entry.structuralDepth !== a.entry.structuralDepth) {
				return b.entry.structuralDepth - a.entry.structuralDepth;
			}
			if (b.entry.signatureColumns.length !== a.entry.signatureColumns.length) {
				return b.entry.signatureColumns.length - a.entry.signatureColumns.length;
			}
			return a.order - b.order;
		})
		.map(({ entry, score }) => ({ entry, score }));
}

/** The single confident recognized recipe for a source, or null if none crosses the threshold. */
export function bestRecognizedRecipe(
	columns: string[],
	sampleRows?: Record<string, unknown>[],
): RecipeMatch | null {
	const best = findRecognizedRecipes(columns, sampleRows)[0];
	return best && best.score >= CONFIDENT_MATCH_THRESHOLD ? best : null;
}

// ============================================================================
// Recipe → mapping + shape summary (for the card)
// ============================================================================

/** Reconstruct the workbench mapping for a recognized recipe (round-trip law). */
export function recipeMapping(entry: RecipeRegistryEntry): ImportMapping {
	return fromRecipe(entry.recipe);
}

/**
 * A short, plain-language list of the vault shapes the recipe produces
 * ("folders", "properties", "tags", …) for the card's what-you-get line.
 * Deterministic order: folders, headings, tags, links, properties.
 */
export function summarizeRecipeShapes(entry: RecipeRegistryEntry): string[] {
	const shapes: string[] = [];
	const target = (entry.recipe as unknown as RawRecipe).target;
	const layout = target.layout ?? [];
	if (layout.some((e) => e.mechanism === 'folder')) shapes.push('folders');
	if (layout.some((e) => e.mechanism === 'heading')) shapes.push('headings');

	const emit = target.also_emit;
	if (emit) {
		if ((emit.tags ?? []).length > 0) shapes.push('tags');
		const managed = emit.frontmatter?.managed ?? {};
		const managedLinks = emit.frontmatter?.managed_links ?? {};
		const hasLink = Object.values(managed).some((t) => t.includes('[[')) || Object.keys(managedLinks).length > 0;
		if (hasLink) shapes.push('links');
		const hasProperty = Object.values(managed).some((t) => !t.includes('[['));
		if (hasProperty) shapes.push('properties');
	}
	return shapes;
}
