/**
 * oscal-profile-exporter.ts — v0.1.7 exporters: OSCAL Profile JSON. SKELETON
 * ONLY — see the "Scope" section below before extending this file.
 *
 * Scope (honest, not faked):
 *
 *   IMPLEMENTED: `conceptsToOscalProfileSkeleton` — a structurally-valid
 *   OSCAL Profile document shell (`metadata` + `imports`) built from the
 *   distinct ontology prefixes seen across a folder's concept notes. This is
 *   genuinely useful on its own (it's the standard "this profile imports
 *   these catalogs" preamble every real OSCAL Profile needs) and every field
 *   in it is real data pulled from the vault, not a placeholder.
 *
 *   NOT IMPLEMENTED: crosswalk-edge → OSCAL mapping. The v0.1.7 milestone
 *   page (docs/.../roadmap/milestones/v0-1-7-exporters.mdx) describes this
 *   as emitting crosswalk edges "as `mapping` entries" and cites Ch 07's
 *   evidence-link-edge-model synthesis log's claim that junction notes are
 *   "isomorphic to [the] OSCAL Control Mapping Model." That citation is
 *   accurate for the ARGUMENT (the 13-field junction-note shape maps
 *   structurally onto assessment-evidence relationships) but there is no
 *   `mapping` construct in the STABLE OSCAL 1.1.x Profile schema NIST has
 *   published — control-to-control crosswalk mapping is a separate,
 *   still-incubating OSCAL extension model, not a published JSON Schema type
 *   this exporter could validate against. Emitting JSON that LOOKS like a
 *   `mapping` array but isn't backed by a real schema would be worse than
 *   emitting nothing: it would silently fail anyone who tries to validate it
 *   against the real OSCAL Profile schema. `crosswalkEdgesToOscalMapping`
 *   below documents the gap and returns `{ implemented: false, reason }`
 *   instead of fabricating output.
 *
 * TODO mapping table (for whoever picks this up — what a real implementation needs):
 *
 *   | Tier 1 field (crosswalk-edge)     | OSCAL target (draft/incubating)        | Blocker |
 *   |------------------------------------|------------------------------------------|---------|
 *   | subject_id / object_id (CURIEs)    | resource `uuid` reference                | OSCAL mapping models reference catalog *resource UUIDs*, not local ids — needs a CURIE→UUID resolution table built from each imported catalog's own OSCAL representation, which Crosswalker doesn't have (concept notes carry CURIEs, not OSCAL UUIDs) |
 *   | predicate_id (STRM)                | mapping `rel` / relationship type        | STRM's 5-6 predicate vocabulary has no registered OSCAL `rel` value set yet; would need a local extension namespace |
 *   | mapping_justification              | `remarks`                                | straightforward — free text, no blocker |
 *   | mapping_provider / mapping_date    | `metadata.props` on the mapping resource | straightforward |
 *   | match_confidence                   | (no OSCAL equivalent)                    | would need a custom `prop` with a Crosswalker-namespaced `ns` |
 *
 *   Revisit when either (a) OSCAL publishes a stable mapping/crosswalk model,
 *   or (b) a concrete user need justifies building the CURIE→UUID resolution
 *   layer for a non-normative `props`-based approximation.
 */

import type { CrosswalkEdgeRow, ConceptRow } from './vault-reader';

function curiePrefix(curie: string): string {
	const idx = curie.indexOf(':');
	return idx === -1 ? curie : curie.slice(0, idx);
}

export interface OscalProfileExportOptions {
	title?: string;
	version?: string;
	oscalVersion?: string;
	/** Deterministic override for tests; a real run should supply a generated UUID (crypto.randomUUID() is available in Obsidian's Electron renderer). */
	uuid?: string;
	/** Deterministic override for tests; a real run defaults to `new Date().toISOString()`. */
	lastModified?: string;
}

/** Minimal shape of the OSCAL Profile document this skeleton emits. Not the full OSCAL Profile schema — only the fields this function actually populates. */
export interface OscalProfileSkeleton {
	profile: {
		uuid: string;
		metadata: {
			title: string;
			'last-modified': string;
			version: string;
			'oscal-version': string;
		};
		imports: { href: string; 'include-all': Record<string, never> }[];
		merge: { combine: { method: string } };
	};
}

export interface OscalProfileExportResult {
	json: string;
	profile: OscalProfileSkeleton;
	importedOntologies: string[];
}

/**
 * Build an OSCAL Profile document shell from a folder's concept notes: one
 * `imports` entry per distinct ontology prefix (CURIE prefix) seen. Pure —
 * no vault I/O; callers pass rows already read via vault-reader.ts.
 *
 * The `href` values are placeholders (`#<ontology-prefix>`) — Crosswalker
 * doesn't currently track each imported ontology's canonical OSCAL catalog
 * URL, so this emits a resolvable-looking but non-authoritative href. A
 * future recipe field (e.g. `source.oscalCatalogHref`) could supply the real
 * URL; until then this is honestly a placeholder, not a lie about being
 * unresolvable — it's clearly namespaced as an internal anchor.
 */
export function conceptsToOscalProfileSkeleton(
	concepts: ConceptRow[],
	options: OscalProfileExportOptions = {},
): OscalProfileExportResult {
	const ontologies = Array.from(new Set(concepts.map((c) => curiePrefix(c.curie)))).sort((a, b) =>
		a.localeCompare(b),
	);

	const profile: OscalProfileSkeleton = {
		profile: {
			uuid: options.uuid ?? 'REPLACE-WITH-GENERATED-UUID',
			metadata: {
				title: options.title ?? 'Crosswalker exported profile',
				'last-modified': options.lastModified ?? new Date().toISOString(),
				version: options.version ?? '0.1.0',
				'oscal-version': options.oscalVersion ?? '1.1.2',
			},
			imports: ontologies.map((ont) => ({ href: `#${ont}`, 'include-all': {} })),
			merge: { combine: { method: 'merge' } },
		},
	};

	return { json: JSON.stringify(profile, null, 2), profile, importedOntologies: ontologies };
}

/**
 * Crosswalk-edge → OSCAL mapping export. NOT implemented — see the module
 * doc comment's "Scope" section and TODO table. Returns a structured
 * not-implemented result instead of throwing (so a caller can surface
 * `reason` to the user directly) and instead of fabricating output that
 * would silently fail real OSCAL schema validation.
 */
export function crosswalkEdgesToOscalMapping(_edges: CrosswalkEdgeRow[]): { implemented: false; reason: string } {
	return {
		implemented: false,
		reason:
			'OSCAL crosswalk-edge mapping export is out of scope for v0.1.7: the published, stable OSCAL 1.1.x Profile ' +
			'schema has no control-to-control mapping construct. The milestone page\'s "Control Mapping Model" reference ' +
			'is Ch 07\'s structural-isomorphism argument, not a NIST-published schema type this exporter could validate ' +
			'against. See this file\'s module doc comment for the full TODO mapping table.',
	};
}
