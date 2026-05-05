/**
 * tag mechanism (as a layout level) — DEFERRED to v0.2
 *
 * Per Ch 22 §10.8: schema-reserved at v0.1; wired in v0.2. v0.1 recipes that
 * reference `mechanism: tag` at a layout level fail fast with this error.
 *
 * Note: cross-cutting `also_emit.tags` IS wired in v0.1 — that's a different
 * code path that emits tags into frontmatter regardless of the layout mechanism.
 * What's deferred here is using `tag` as a structural layout mechanism (e.g.,
 * a recipe that says "level=family becomes a nested tag, not a folder").
 */

import { RenderError } from '../template';

export function applyTagStub(): never {
	throw new RenderError(
		`mechanism: "tag" as a layout level is schema-reserved for v0.2 and not implemented in v0.1.2. ` +
			`If you want tags emitted on every note, use \`recipe.target.also_emit.tags\` instead — ` +
			`that's wired today. Tag-as-layout-mechanism (replacing folder/heading at a level) ships in v0.2.`,
	);
}
