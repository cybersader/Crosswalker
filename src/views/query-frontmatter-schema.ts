/**
 * query-frontmatter-schema.ts — Phase 4.5
 *
 * JSON Schema + TypeScript type for the `crosswalker:` frontmatter block
 * that lives on user notes. This block is the **canonical source of truth**
 * for a query: the picker writes it, the regenerator reads it to rebuild
 * the `.base` file, and Bases itself can query it as Obsidian metadata.
 *
 * Architectural commitment #5 (runtime-agnostic recipe schema): schema is
 * pure JSON + AJV-validated. The picker dispatches on `shape` STRING value
 * from the validated block — new shapes (e.g. `cards` in v0.2) don't need
 * picker code changes.
 *
 * Forward-compat: `schema_version` lets us migrate the block shape later
 * without breaking notes that have the older form. Phase 4.5 ships v1.
 */

import Ajv2020 from 'ajv/dist/2020';
import addFormats from 'ajv-formats';
import type { ValidateFunction } from 'ajv';

export const QUERY_FRONTMATTER_SCHEMA_VERSION = 1 as const;

/**
 * The TS interface for the `crosswalker:` frontmatter block on user notes.
 * Mirrors the JSON Schema below; the schema is the load-bearing contract.
 */
export interface CrosswalkerQueryFrontmatter {
	/** Stable ID — 'q-YYYY-MM-DD-<8-hex>'. Survives note renames. */
	query_id: string;
	/** Recipe ID (shipped catalog or user-authored under _crosswalker/recipes/). */
	recipe: string;
	/** View shape — STRING value, not TS enum (commitment #5). */
	shape: string;
	/** User-edited param values, keyed by param name. */
	params: Record<string, unknown>;
	/** Vault-relative path to the generated .base file (back-pointer). */
	view_file: string;
	/** ISO-8601 — last regeneration of the .base file. */
	generated_at: string;
	/** Forward-compat version for the block shape. v0.1.6 = 1. */
	schema_version: typeof QUERY_FRONTMATTER_SCHEMA_VERSION;
}

/**
 * JSON Schema (2020-12 dialect, AJV-compatible). Mirrors the TS interface.
 */
export const QUERY_FRONTMATTER_JSON_SCHEMA = {
	$id: 'https://crosswalker.dev/spec/query-frontmatter.schema.json',
	$schema: 'https://json-schema.org/draft/2020-12/schema',
	title: 'Crosswalker query frontmatter block',
	description:
		'The `crosswalker:` frontmatter block on a user note. Canonical source of truth for a query; the .base file at `view_file` is a generated artifact.',
	type: 'object',
	additionalProperties: false,
	required: ['query_id', 'recipe', 'shape', 'params', 'view_file', 'generated_at', 'schema_version'],
	properties: {
		query_id: {
			type: 'string',
			pattern: '^q-\\d{4}-\\d{2}-\\d{2}-[0-9a-f]{8}$',
			description: 'Stable ID: q-YYYY-MM-DD-<8-hex>. Survives note renames.',
		},
		recipe: {
			type: 'string',
			minLength: 1,
		},
		shape: {
			type: 'string',
			minLength: 1,
			description:
				'View shape (pivot / table / list / hierarchy / cards / ...). Open-ended STRING — new shapes don\'t need a schema change.',
		},
		params: {
			type: 'object',
			additionalProperties: true,
		},
		view_file: {
			type: 'string',
			pattern: '^_crosswalker/views/q-.+\\.base$',
		},
		generated_at: {
			type: 'string',
			format: 'date-time',
		},
		schema_version: {
			type: 'integer',
			const: QUERY_FRONTMATTER_SCHEMA_VERSION,
		},
	},
} as const;

let ajv: Ajv2020 | null = null;
let validateFn: ValidateFunction | null = null;

function getValidator(): ValidateFunction {
	if (!validateFn) {
		// Lazy init — AJV2020 for draft 2020-12 schema dialect support
		// (matches the convention used in src/validation/validator.ts).
		ajv = new Ajv2020({ allErrors: true, strict: false });
		addFormats(ajv);
		validateFn = ajv.compile(QUERY_FRONTMATTER_JSON_SCHEMA);
	}
	return validateFn;
}

export interface ValidationResult {
	valid: boolean;
	errors: string[];
}

/**
 * Validate an unknown value against the query frontmatter schema. Returns
 * a structured result so callers can surface specific errors to the user
 * (e.g. "your query block is malformed — starting fresh").
 */
export function validateQueryFrontmatter(value: unknown): ValidationResult {
	const validate = getValidator();
	const ok = validate(value);
	if (ok) {
		return { valid: true, errors: [] };
	}
	const errors = (validate.errors ?? []).map((e) => {
		const path = e.instancePath || '(root)';
		return `${path}: ${e.message ?? 'invalid'}`;
	});
	return { valid: false, errors };
}

/**
 * Generate a fresh query_id. Format: q-YYYY-MM-DD-<8-hex>.
 * Stable across edits — the picker preserves this when re-running on an
 * existing note.
 */
export function newQueryId(now: Date = new Date()): string {
	const yyyy = now.getUTCFullYear();
	const mm = String(now.getUTCMonth() + 1).padStart(2, '0');
	const dd = String(now.getUTCDate()).padStart(2, '0');
	let hex = '';
	for (let i = 0; i < 4; i++) {
		hex += Math.floor(Math.random() * 256).toString(16).padStart(2, '0');
	}
	return `q-${yyyy}-${mm}-${dd}-${hex}`;
}

/**
 * Derive the canonical `view_file` path for a given query_id.
 */
export function viewFileFor(queryId: string): string {
	return `_crosswalker/views/${queryId}.base`;
}
