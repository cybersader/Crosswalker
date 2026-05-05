/**
 * Render types — the input and output shapes of the render() function.
 *
 * Per Ch 22 (target-structure expressivity synthesis): render() is a pure
 * function with signature `(Recipe, ConceptIdentity, sourceScope) → Address`.
 * Pass 1 is vault-independent (deterministic, hashable, replayable).
 * Pass 2 (link minimizer with VaultIndex) is deferred to v0.3.
 */

/**
 * Variables available to template interpolation. Populated by the source
 * iteration step upstream of render — typically one entry per source level
 * (`catalog`, `family`, `control`, `enhancement` for NIST 800-53 r5; or
 * `domain`, `kingdom`, …, `species` for a biology taxonomy).
 *
 * Templates reach into scope via dotted paths: `{control.id}`, `{family.title}`.
 */
export type SourceScope = Record<string, unknown>;

/**
 * Identity of a single concept being rendered.
 *
 * `curie` is the canonical concept identity (`nist:AC-2`, `iso27001:A.9.2.1`).
 * `scope` is the variables available to template interpolation.
 */
export interface ConceptIdentity {
	curie: string;
	scope: SourceScope;
}

/**
 * The Address output — what render() produces per concept.
 *
 * Per Ch 22 §3.1.
 */
export interface Address {
	/** Primary location — vault-relative path + optional heading anchor. */
	primary: {
		path: string;
		anchor?: string;
	};
	/**
	 * Exact string that goes inside `[[...]]` when a wikilink to this concept
	 * is emitted. Pass-1: full-path form (`Frameworks/NIST 800-53 r5/AC/AC-2`).
	 * Pass-2 link minimizer (v0.3) may downgrade to bare basename when unambiguous.
	 */
	wikilinkTarget: string;
	/** Tags emitted into the note's `tags` frontmatter array. */
	tags: string[];
	/** Aliases emitted into the note's `aliases` frontmatter array. */
	aliases: string[];
	/**
	 * Recipe-managed frontmatter — keys + interpolated values.
	 * User-preserve frontmatter is merged in at write time, NOT here.
	 */
	frontmatter: Record<string, unknown>;
}
