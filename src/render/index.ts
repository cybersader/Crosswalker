/**
 * render() — pure function from (Recipe, ConceptIdentity) to Address.
 *
 * Per Ch 22 (target-structure expressivity synthesis):
 *   - Pass 1: vault-independent. Deterministic. Hashable. Same input → byte-
 *     identical output every time.
 *   - Pass 2 (link minimizer with VaultIndex): deferred to v0.3.
 *
 * v0.1.2 wires three of the five mechanisms: folder, file, heading.
 * tag and wikilink (as layout mechanisms) are schema-reserved with
 * fail-fast errors.
 *
 * Cross-cutting `also_emit` (tags, aliases, managed frontmatter) IS wired —
 * those emit on every note regardless of layout mechanism choice.
 */

import type { ConceptIdentity, Address } from './types';
import { renderTemplate, RenderError } from './template';
import { applyFolder } from './mechanisms/folder';
import { applyFile } from './mechanisms/file';
import { applyHeading } from './mechanisms/heading';
import { applyTagStub } from './mechanisms/tag';
import { applyWikilinkStub } from './mechanisms/wikilink';

export type { Address, ConceptIdentity, SourceScope } from './types';
export { RenderError } from './template';
export { renderTemplate } from './template';

/**
 * The recipe shape we accept. Loose typing here matches the runtime contract
 * (recipes come from parsed YAML/JSON; AJV validates them upstream against
 * spec/recipe.schema.json). Internal modules use the same shape.
 */
export type Tier1Kind = 'concept' | 'junction-note' | 'crosswalk-edge';

export interface Recipe {
	recipe: string;
	source?: { ontology?: string; levels?: string[] };
	target: {
		layout: Array<{
			level: string;
			mechanism: string;
			template: string;
			level_depth?: number;
			kind?: Tier1Kind;
		}>;
		also_emit?: {
			tags?: string[];
			aliases?: string[];
			frontmatter?: {
				managed?: Record<string, string>;
				user_preserve?: string[];
			};
		};
		graph_edges?: Array<{ from: string; via: string; to: string }>;
		linkStyle?: 'absolute' | 'shortest';
	};
}

/**
 * Pass-1 render. Produces an Address from `(recipe, identity)` only — vault-
 * independent. Determinism is the architectural commitment that makes
 * canonical-state hashing (Ch 22 §8) work.
 *
 * Throws `RenderError` for: unknown mechanism, missing template variable,
 * malformed filter, heading without level_depth, tag/wikilink as layout level
 * (deferred to v0.2).
 */
export function render(recipe: Recipe, identity: ConceptIdentity): Address {
	const address: Address = {
		primary: { path: '' },
		wikilinkTarget: '',
		tags: [],
		aliases: [],
		frontmatter: {},
	};

	// 1. Walk layout entries in order, dispatching per mechanism
	for (const entry of recipe.target.layout) {
		switch (entry.mechanism) {
			case 'folder':
				applyFolder(address, entry as Parameters<typeof applyFolder>[1], identity.scope);
				break;
			case 'file':
				applyFile(address, entry as Parameters<typeof applyFile>[1], identity.scope);
				break;
			case 'heading':
				applyHeading(address, entry as Parameters<typeof applyHeading>[1], identity.scope);
				break;
			case 'tag':
				applyTagStub();
				break;
			case 'wikilink':
				applyWikilinkStub();
				break;
			default:
				throw new RenderError(
					`Unknown mechanism "${entry.mechanism}" at level "${entry.level}". ` +
						`Allowed: folder, file, heading, tag, wikilink (last two deferred to v0.2).`,
				);
		}
	}

	// 2. Cross-cutting also_emit
	const alsoEmit = recipe.target.also_emit;
	if (alsoEmit) {
		if (alsoEmit.tags) {
			for (const t of alsoEmit.tags) {
				address.tags.push(renderTemplate(t, identity.scope));
			}
		}
		if (alsoEmit.aliases) {
			for (const a of alsoEmit.aliases) {
				address.aliases.push(renderTemplate(a, identity.scope));
			}
		}
		if (alsoEmit.frontmatter?.managed) {
			for (const [k, t] of Object.entries(alsoEmit.frontmatter.managed)) {
				address.frontmatter[k] = renderTemplate(t, identity.scope);
			}
		}
	}

	// 3. Compute wikilinkTarget — Pass-1 absolute form (full vault path
	//    minus .md extension, plus heading anchor if present).
	//    Pass-2 link minimizer (v0.3) may downgrade to bare basename.
	if (!address.wikilinkTarget) {
		const pathSansMd = address.primary.path.replace(/\.md$/, '');
		address.wikilinkTarget = address.primary.anchor
			? `${pathSansMd}#${address.primary.anchor}`
			: pathSansMd;
	}

	// 4. Always include the concept's CURIE in frontmatter
	if (!('curie' in address.frontmatter)) {
		address.frontmatter.curie = identity.curie;
	}

	// 5. Kind dispatch — if any layout entry declares a non-concept kind, set
	//    the discriminator. Last non-default wins (recipe authors typically
	//    declare kind on the leaf entry only). The frontmatter shape produced
	//    by junction-note + crosswalk-edge layouts is fully driven by the
	//    recipe's also_emit.frontmatter.managed templates (which write
	//    subject/predicate/object for junctions, subject_id/predicate_id/
	//    object_id for crosswalks). Tier 1 schema validation enforces the
	//    kind-specific required-field set + STRM predicate enum at write time.
	let chosenKind: Tier1Kind = 'concept';
	for (const entry of recipe.target.layout) {
		if (entry.kind && entry.kind !== 'concept') {
			chosenKind = entry.kind;
		}
	}
	if (chosenKind !== 'concept') {
		address.frontmatter.kind = chosenKind;
	}

	return address;
}
