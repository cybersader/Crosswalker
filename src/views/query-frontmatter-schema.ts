/**
 * query-frontmatter-schema.ts — Phase 4.6 (schema v2)
 *
 * JSON Schema + TypeScript type for the `crosswalker_query:` frontmatter block
 * that lives on the per-query `index.md` under `_crosswalker/queries/<slug>/`.
 *
 * Phase 4.6 (Layout B+): canonical state moves from user-authored host notes
 * into per-query folders. Host notes only embed `![[<slug>/view.base]]`. The
 * picker writes `index.md` in the query folder; the regenerator reads it to
 * rebuild `view.base`. Slug is the folder name (kebab-case display alias);
 * query_id is the durable identity (used by the regenerator scanner to
 * survive renames).
 *
 * Decision chain: synthesis log `2026-05-18-query-state-location-synthesis`.
 *
 * Architectural commitment #5 (runtime-agnostic recipe schema): schema is
 * pure JSON + AJV-validated. The picker dispatches on `shape` STRING value
 * from the validated block — new shapes (e.g. `cards` in v0.2) don't need
 * picker code changes.
 *
 * Forward-compat: `schema_version` is now 2 (was 1 in Phase 4.5). The
 * regenerator + picker accept both versions for one minor version; v1 blocks
 * on host notes get auto-migrated to v2 in the query folder on next touch.
 */

import Ajv2020 from 'ajv/dist/2020';
import addFormats from 'ajv-formats';
import type { ValidateFunction } from 'ajv';

export const QUERY_FRONTMATTER_SCHEMA_VERSION = 2 as const;

/** Previous schema version (Phase 4.5). Read-only — used for backward-compat
 * scanning during the one-minor-version migration window. */
export const QUERY_FRONTMATTER_SCHEMA_VERSION_V1 = 1 as const;

/**
 * Maximum slug length. Filesystem-safe everywhere; keeps file explorer readable.
 */
export const MAX_SLUG_LENGTH = 48;

/**
 * Reserved filesystem names that we refuse to use as slugs. Append `-q` suffix
 * on hit. (Mostly Windows; harmless on POSIX.)
 */
const RESERVED_NAMES = new Set([
	'con', 'aux', 'nul', 'prn',
	'com1', 'com2', 'com3', 'com4', 'com5', 'com6', 'com7', 'com8', 'com9',
	'lpt1', 'lpt2', 'lpt3', 'lpt4', 'lpt5', 'lpt6', 'lpt7', 'lpt8', 'lpt9',
	'.', '..',
]);

/**
 * The TS interface for the `crosswalker_query:` frontmatter block on the
 * per-query `index.md` (Phase 4.6 Layout B+).
 */
export interface CrosswalkerQueryFrontmatter {
	/** Stable ID — 'q-YYYY-MM-DD-<8-hex>'. The DURABLE identity; survives slug/folder renames. */
	query_id: string;
	/** Slug — kebab-case ASCII display alias. Folder name = this. Rename-safe. */
	slug: string;
	/** Recipe ID (shipped catalog or user-authored under _crosswalker/recipes/). */
	recipe: string;
	/** View shape — STRING value, not TS enum (commitment #5). */
	shape: string;
	/** User-edited param values, keyed by param name. */
	params: Record<string, unknown>;
	/** Vault-relative path to the generated .base file. Always `<folder>/view.base`. Denormalized for explicitness. */
	view_file: string;
	/** ISO-8601 — last regeneration of the .base file. */
	generated_at: string;
	/** Forward-compat version for the block shape. v0.1.6 Phase 4.6 = 2. */
	schema_version: typeof QUERY_FRONTMATTER_SCHEMA_VERSION;
}

/**
 * JSON Schema (2020-12 dialect, AJV-compatible). Mirrors the TS interface.
 */
export const QUERY_FRONTMATTER_JSON_SCHEMA = {
	$id: 'https://crosswalker.dev/spec/query-frontmatter.schema.json',
	$schema: 'https://json-schema.org/draft/2020-12/schema',
	title: 'Crosswalker query frontmatter block (v2)',
	description:
		'The `crosswalker_query:` frontmatter block on the per-query index.md. Canonical source of truth for a query; view.base is generated.',
	type: 'object',
	additionalProperties: false,
	required: ['query_id', 'slug', 'recipe', 'shape', 'params', 'view_file', 'generated_at', 'schema_version'],
	properties: {
		query_id: {
			type: 'string',
			pattern: '^q-\\d{4}-\\d{2}-\\d{2}-[0-9a-f]{8}$',
			description: 'Stable ID: q-YYYY-MM-DD-<8-hex>. Durable identity.',
		},
		slug: {
			type: 'string',
			pattern: '^[a-z0-9][a-z0-9-]{0,47}$',
			description: 'Kebab-case ASCII display alias; folder name.',
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
			pattern: '^_crosswalker/queries/[a-z0-9][a-z0-9-]*/view\\.base$',
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

/**
 * Legacy Phase 4.5 schema (v1) for backward-compat reads. Picker + regenerator
 * accept v1 blocks during the migration window; one-shot migrate-query-layout
 * command converts them to v2 in the new folder layout.
 */
export const QUERY_FRONTMATTER_JSON_SCHEMA_V1 = {
	$id: 'https://crosswalker.dev/spec/query-frontmatter.schema.v1.json',
	$schema: 'https://json-schema.org/draft/2020-12/schema',
	title: 'Crosswalker query frontmatter block (v1 - Phase 4.5 legacy)',
	type: 'object',
	additionalProperties: false,
	required: ['query_id', 'recipe', 'shape', 'params', 'view_file', 'generated_at', 'schema_version'],
	properties: {
		query_id: { type: 'string', pattern: '^q-\\d{4}-\\d{2}-\\d{2}-[0-9a-f]{8}$' },
		recipe: { type: 'string', minLength: 1 },
		shape: { type: 'string', minLength: 1 },
		params: { type: 'object', additionalProperties: true },
		view_file: { type: 'string', pattern: '^_crosswalker/views/q-.+\\.base$' },
		generated_at: { type: 'string', format: 'date-time' },
		schema_version: { type: 'integer', const: QUERY_FRONTMATTER_SCHEMA_VERSION_V1 },
	},
} as const;

let ajv: Ajv2020 | null = null;
let validateFn: ValidateFunction | null = null;
let validateFnV1: ValidateFunction | null = null;

function getValidator(): ValidateFunction {
	if (!validateFn) {
		ajv = new Ajv2020({ allErrors: true, strict: false });
		addFormats(ajv);
		validateFn = ajv.compile(QUERY_FRONTMATTER_JSON_SCHEMA);
	}
	return validateFn;
}

function getValidatorV1(): ValidateFunction {
	if (!validateFnV1) {
		if (!ajv) {
			ajv = new Ajv2020({ allErrors: true, strict: false });
			addFormats(ajv);
		}
		validateFnV1 = ajv.compile(QUERY_FRONTMATTER_JSON_SCHEMA_V1);
	}
	return validateFnV1;
}

export interface ValidationResult {
	valid: boolean;
	errors: string[];
}

/**
 * Validate an unknown value against the v2 query frontmatter schema.
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
 * Validate an unknown value against the v1 (Phase 4.5 legacy) schema.
 * Used by the migration command + backward-compat reader.
 */
export function validateQueryFrontmatterV1(value: unknown): ValidationResult {
	const validate = getValidatorV1();
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

// ---------------------------------------------------------------------------
// Slug derivation (Phase 4.6 — synthesis log §4 cases 1-5 + 9)
// ---------------------------------------------------------------------------

/**
 * Derive a kebab-case ASCII slug from an arbitrary input string. Pure function.
 *
 * Rules (per synthesis log §4):
 * - Lowercase
 * - Replace non-`[a-z0-9]` with `-`
 * - Collapse runs of `-`
 * - Trim leading/trailing `-`
 * - Max 48 chars (truncate at last `-` ≤ 48 if possible, else hard truncate)
 * - Reserved Windows names (con/aux/nul/prn/com1-9/lpt1-9/./..) get `-q` suffix
 * - Empty result → fallback to `query-<id8>` (caller passes queryId)
 *
 * If `fallbackQueryId` is provided AND the derived slug is empty/invalid, the
 * function returns `query-<id8>` where `id8` is the last 8 hex chars of the queryId.
 */
export function slugify(input: string, fallbackQueryId?: string): string {
	let slug = (input || '').toLowerCase();
	// Replace non-[a-z0-9] with `-`
	slug = slug.replace(/[^a-z0-9]+/g, '-');
	// Collapse runs of `-`
	slug = slug.replace(/-+/g, '-');
	// Trim leading/trailing `-`
	slug = slug.replace(/^-+|-+$/g, '');

	// Empty result → fallback
	if (slug.length === 0) {
		if (fallbackQueryId) {
			const match = fallbackQueryId.match(/[0-9a-f]{8}$/);
			if (match) {
				return `query-${match[0]}`;
			}
		}
		return 'query';
	}

	// Truncate to max length (prefer word boundary)
	if (slug.length > MAX_SLUG_LENGTH) {
		const truncated = slug.slice(0, MAX_SLUG_LENGTH);
		const lastDash = truncated.lastIndexOf('-');
		if (lastDash > 0) {
			slug = truncated.slice(0, lastDash);
		} else {
			slug = truncated;
		}
	}

	// Reserved names → append `-q`
	if (RESERVED_NAMES.has(slug)) {
		slug = `${slug}-q`;
	}

	return slug;
}

/**
 * Append an opaque 4-hex suffix for programmatic collision resolution.
 * Used when an agent/wizard/MCP create hits an existing slug (no human in loop).
 */
export function addCollisionSuffix(slug: string, suffix?: string): string {
	const hex = suffix ?? generate4Hex();
	const maxBase = MAX_SLUG_LENGTH - 5; // 4 hex + 1 dash
	const base = slug.length > maxBase ? slug.slice(0, maxBase).replace(/-+$/, '') : slug;
	return `${base}-${hex}`;
}

function generate4Hex(): string {
	let hex = '';
	for (let i = 0; i < 2; i++) {
		hex += Math.floor(Math.random() * 256).toString(16).padStart(2, '0');
	}
	return hex;
}

// ---------------------------------------------------------------------------
// Path helpers (Phase 4.6 Layout B+)
// ---------------------------------------------------------------------------

/** Vault-relative folder for a query. `_crosswalker/queries/<slug>/` */
export function queryFolderFor(slug: string): string {
	return `_crosswalker/queries/${slug}`;
}

/** Vault-relative path to the canonical index.md. */
export function indexFileFor(slug: string): string {
	return `${queryFolderFor(slug)}/index.md`;
}

/** Vault-relative path to the generated view.base. */
export function viewFileFor(slug: string): string {
	return `${queryFolderFor(slug)}/view.base`;
}

/**
 * Legacy Phase 4.5 view-file path helper. Used by migration command + backward-
 * compat reader. Format: `_crosswalker/views/<queryId>.base`.
 */
export function legacyViewFileFor(queryId: string): string {
	return `_crosswalker/views/${queryId}.base`;
}
