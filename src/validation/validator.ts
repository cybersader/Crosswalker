/**
 * Crosswalker validator
 *
 * Wraps AJV to validate two artifact types against the canonical spec:
 *   - Tier 1 frontmatter (concept notes, junction notes, crosswalk edges)
 *     against spec/tier1.schema.json
 *   - Import recipes against spec/recipe.schema.json
 *
 * Both schemas are loaded at module init. Schema-file malformation throws
 * (caught at AJV compile time); call-site usage failures surface as
 * `ValidationResult` with structured errors.
 *
 * Per the v0.1 architectural commitment "runtime-agnostic recipe schema"
 * (Ch 23 §4): the recipe schema is the contract; engine implementations
 * are swappable; AJV + JSONata is the v0.1 validation/expression layer.
 *
 * Loaded JSON schemas come from spec/. esbuild bundles them at build time
 * via the JSON loader; tsconfig has `resolveJsonModule: true` so the
 * imports type-check cleanly.
 */

import Ajv2020 from 'ajv/dist/2020';
import type { ErrorObject, ValidateFunction } from 'ajv';
import addFormats from 'ajv-formats';

import tier1Schema from '../../spec/tier1.schema.json';
import recipeSchema from '../../spec/recipe.schema.json';

/** Validation result returned to call sites. */
export interface ValidationResult {
	valid: boolean;
	/** Human-readable error strings; empty when `valid` is true. */
	errors: string[];
	/** Raw AJV error objects for programmatic inspection / Notice formatting. */
	rawErrors?: ErrorObject[];
}

let ajv: Ajv2020 | null = null;
let validateTier1Inner: ValidateFunction | null = null;
let validateRecipeInner: ValidateFunction | null = null;

/**
 * Initialize AJV + compile the two spec schemas. Throws if a spec file is
 * malformed (which means the project itself is broken — fail-fast at startup).
 *
 * Idempotent: safe to call multiple times.
 */
export function initValidator(): void {
	if (ajv) return;

	// Use the 2020-12 draft-aware AJV class because our spec/*.schema.json files
	// declare `$schema: "https://json-schema.org/draft/2020-12/schema"`. The default
	// `Ajv` constructor targets Draft-07 and would reject the 2020-12 metaschema.
	ajv = new Ajv2020({
		allErrors: true,
		strict: false,
		// Tier 1 is intentionally open (`additionalProperties: true`) so domain-specific
		// frontmatter beyond the canonical fields validates cleanly.
		useDefaults: false,
	});
	addFormats(ajv);

	try {
		validateTier1Inner = ajv.compile(tier1Schema);
	} catch (err) {
		throw new Error(`spec/tier1.schema.json is malformed: ${(err as Error).message}`);
	}

	try {
		validateRecipeInner = ajv.compile(recipeSchema);
	} catch (err) {
		throw new Error(`spec/recipe.schema.json is malformed: ${(err as Error).message}`);
	}
}

/**
 * Validate a Tier 1 frontmatter object (concept-note, junction-note, or
 * crosswalk-edge shape — discriminated by the schema's `oneOf`).
 *
 * Used pre-write in the generation engine to abort on invalid output
 * rather than corrupt the vault.
 */
export function validateTier1Frontmatter(fm: unknown): ValidationResult {
	if (!validateTier1Inner) initValidator();
	const valid = !!validateTier1Inner!(fm);
	return formatResult(valid, validateTier1Inner!.errors);
}

/**
 * Validate an import recipe.
 *
 * Used at recipe-load time (import wizard save, recipe browser open) to
 * reject malformed recipes early with line/column-level errors users can
 * act on.
 */
export function validateRecipe(recipe: unknown): ValidationResult {
	if (!validateRecipeInner) initValidator();
	const valid = !!validateRecipeInner!(recipe);
	return formatResult(valid, validateRecipeInner!.errors);
}

function formatResult(valid: boolean, rawErrors: ErrorObject[] | null | undefined): ValidationResult {
	if (valid) return { valid: true, errors: [] };
	const errors = (rawErrors ?? []).map(formatError);
	return { valid: false, errors, rawErrors: rawErrors ?? undefined };
}

function formatError(err: ErrorObject): string {
	const path = err.instancePath || '(root)';
	const msg = err.message ?? 'unknown error';
	const allowed = err.params && 'allowedValues' in err.params
		? ` (allowed: ${JSON.stringify((err.params as { allowedValues: unknown[] }).allowedValues)})`
		: '';
	return `${path}: ${msg}${allowed}`;
}
