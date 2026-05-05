/**
 * wikilink mechanism (as a layout level) — DEFERRED to v0.2
 *
 * Per Ch 22 §10.8: schema-reserved at v0.1; wired in v0.2. v0.1 recipes that
 * reference `mechanism: wikilink` at a layout level fail fast with this error.
 *
 * Note: every emitted note still gets a wikilinkTarget computed by render()
 * for use by other notes that link to it — that's automatic, not a layout
 * mechanism. What's deferred is using `wikilink` as a structural layout
 * mechanism (e.g., a recipe that creates hub notes connected by `parent:` /
 * `children:` wikilink frontmatter rather than folder structure).
 *
 * Pairs with the `graph_edges` array, also schema-reserved for v0.2.
 */

import { RenderError } from '../template';

export function applyWikilinkStub(): never {
	throw new RenderError(
		`mechanism: "wikilink" as a layout level is schema-reserved for v0.2 and not implemented in v0.1.2. ` +
			`Wikilink-graph hierarchy (concepts as flat files connected by parent:/children: frontmatter) ` +
			`ships in v0.2 alongside graph_edges.`,
	);
}
