/**
 * provenance.ts — _crosswalker provenance block writer
 *
 * Emits the `_crosswalker` frontmatter block per `spec/tier1.schema.json`
 * (#/$defs/provenance_block). Captures what produced the note, when, from
 * which source, against which recipe.
 *
 * Pure function. Same inputs (excluding `produced_at` which is always
 * `new Date().toISOString()` at call time) → same output.
 */

const SPEC_VERSION = 'https://crosswalker.dev/spec/tier1.schema.json';

export interface ProvenanceInput {
	/** Optional: the recipe id (e.g., 'nist-allfolders') */
	recipeId?: string;
	/** Optional: hash of the recipe content (sha256-... format) */
	recipeHash?: string;
	/** Optional: the source file the row came from */
	sourceFile?: string;
	/** Optional: source URL if fetched remotely */
	sourceUrl?: string;
	/** Optional: source ontology CURIE prefix (`nist:_`, `iso27001:_`) */
	sourceCurie?: string;
	/** Optional: source version string ('rev 5', '2022', 'v8.1') */
	sourceVersion?: string;
	/** Optional: hash of the source file at import time */
	sourceHash?: string;
	/** Optional: the canonical concept identity content hash */
	conceptCid?: string;
}

const PRODUCER_NAME = 'crosswalker-plugin';
const PRODUCER_KIND = 'plugin-engine';

/**
 * Build the `_crosswalker` provenance block matching `spec/tier1.schema.json`.
 *
 * Always populates: spec_version, source_ref (best effort), produced_at,
 * producer. Optionally populates: recipe (if recipeId is provided),
 * concept_cid (if conceptCid is provided).
 */
export function buildProvenance(input: ProvenanceInput, pluginVersion: string): Record<string, unknown> {
	const block: Record<string, unknown> = {
		spec_version: SPEC_VERSION,
		source_ref: buildSourceRef(input),
		produced_at: new Date().toISOString(),
		producer: {
			kind: PRODUCER_KIND,
			name: PRODUCER_NAME,
			version: pluginVersion,
		},
	};

	if (input.recipeId) {
		block.recipe = {
			id: input.recipeId,
			...(input.recipeHash ? { hash: input.recipeHash } : {}),
		};
	}

	if (input.conceptCid) {
		block.concept_cid = input.conceptCid;
	}

	return block;
}

function buildSourceRef(input: ProvenanceInput): Record<string, unknown> {
	const ref: Record<string, unknown> = {};
	if (input.sourceFile) ref.file = input.sourceFile;
	if (input.sourceUrl) ref.url = input.sourceUrl;
	if (input.sourceCurie) ref.curie = input.sourceCurie;
	if (input.sourceVersion) ref.version = input.sourceVersion;
	if (input.sourceHash) ref.source_hash = input.sourceHash;

	// Schema requires at least one of file/url/curie. If none, flag generic.
	if (Object.keys(ref).length === 0) {
		ref.curie = 'unknown:_';
	}

	return ref;
}
