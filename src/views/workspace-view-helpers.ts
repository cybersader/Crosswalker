/**
 * workspace-view-helpers.ts — pure logic for the Crosswalker workspace view
 * (spec `.workspace/2026-07-05-shape-first-wizard-spec.md` §7n).
 *
 * Kept Obsidian-free so it's unit-testable without mocking the plugin API.
 * `MinimalVaultNode` structurally matches Obsidian's `TAbstractFile` /
 * `TFolder` shapes (path, name, optional children), so callers can pass
 * real vault objects directly or a thin recursive adapter — see
 * `workspace-view.ts` for the adapter that bridges `TAbstractFile`.
 */

import { RECIPE_REGISTRY } from '../import/recipe-registry';

export interface MinimalVaultNode {
	path: string;
	name: string;
	/** Present (possibly empty) for folders; absent for files. */
	children?: MinimalVaultNode[];
	/**
	 * For files only: the note's `_crosswalker.producer.kind` frontmatter value
	 * (spec/tier1.schema.json `$defs/provenance_block`), when present. Undefined
	 * for a file with no `_crosswalker` block at all, or for folders. The
	 * adapter in `workspace-view.ts` populates this from the real metadata
	 * cache; this module stays pure and never reads frontmatter itself.
	 */
	producerKind?: string;
}

export interface InstalledOntologySummary {
	name: string;
	path: string;
	noteCount: number;
}

/** The producer kind that marks a note as end-user, plugin-generated output
 *  (as opposed to `external-cli` fixture/test-corpus generation — spec §7m,
 *  "home-screen polish", 2026-07-11: the installed list must show what the
 *  USER imported through Crosswalker, not synthetic or curated test data). */
const PLUGIN_PRODUCER_KIND = 'plugin-engine';

/**
 * Derive the list of "installed ontologies" from the default output folder:
 * one summary per top-level subfolder, with a recursive count of markdown
 * notes underneath it. A folder only counts as an installed ontology when it
 * actually contains GENERATED content — at least one note whose
 * `_crosswalker.producer.kind` is `plugin-engine` (real plugin output, not a
 * curated/fixture corpus like `NIST-mini` or a licensed test corpus, which
 * carry `_crosswalker` too but with `producer.kind: 'external-cli'`).
 * Folders whose name starts with `_` (the vault's internal/hidden convention,
 * e.g. `_licensed`) are skipped outright, before even checking their content.
 * Loose files directly under the output root are ignored (not an ontology).
 * Returns an empty array if the output root doesn't exist yet or has no
 * qualifying subfolders.
 */
export function deriveInstalledOntologies(
	outputRoot: MinimalVaultNode | null | undefined,
): InstalledOntologySummary[] {
	if (!outputRoot || !outputRoot.children) return [];

	const summaries: InstalledOntologySummary[] = [];
	for (const child of outputRoot.children) {
		if (!child.children) continue; // skip loose files, only folders count as ontologies
		if (child.name.startsWith('_')) continue; // internal/hidden convention (e.g. `_licensed`)
		if (!hasGeneratedNote(child)) continue; // curated/fixture corpora and hand-authored folders
		summaries.push({
			name: child.name,
			path: child.path,
			noteCount: countMarkdownNotes(child),
		});
	}
	return summaries.sort((a, b) => a.name.localeCompare(b.name));
}

function countMarkdownNotes(node: MinimalVaultNode): number {
	let count = 0;
	for (const child of node.children ?? []) {
		if (child.children) {
			count += countMarkdownNotes(child);
		} else if (child.name.toLowerCase().endsWith('.md')) {
			count += 1;
		}
	}
	return count;
}

/** True when this folder (recursively) contains at least one note actually
 *  produced by the plugin engine — the "GENERATED content" gate. */
function hasGeneratedNote(node: MinimalVaultNode): boolean {
	for (const child of node.children ?? []) {
		if (child.children) {
			if (hasGeneratedNote(child)) return true;
		} else if (child.producerKind === PLUGIN_PRODUCER_KIND) {
			return true;
		}
	}
	return false;
}

/** A recipe recognized as a likely match for an already-installed ontology folder. */
export interface OntologyRecipeMatch {
	id: string;
	label: string;
}

const NORMALIZE = (s: string): string => s.toLowerCase().replace(/[^a-z0-9]/g, '');

/**
 * Best-effort match from an installed ontology's folder name back to a bundled
 * recipe (spec §7n item 3 — "Import again"). There is no persisted link between
 * a generated folder and the recipe that produced it, so this is a heuristic:
 * normalize both the folder name and each registry entry's `ontology` id
 * *and* its display `label` (strip case/punctuation) and look for a substring
 * match either direction ("NIST-CSF-2.0" folder ⊇ "nistcsf2" ontology id).
 * The label is checked too because some ontology ids don't spell out the same
 * letters a folder name would ("mitre-attack" vs. the literal acronym
 * "ATT&CK" a user's folder is named after — the label "MITRE ATT&CK
 * techniques" carries the acronym verbatim, the id doesn't). Only the text
 * before any parenthetical is used from the label, so descriptive suffixes
 * ("(CPRT export, nested)") don't have to appear in the folder name too.
 * Ties break toward the longest (most specific) matched candidate. Returns
 * null when nothing is recognizable — the caller simply omits the "Import
 * again" affordance.
 *
 * Pure and unit-testable: pass `registry` to test against a fixture instead of
 * the full bundled `RECIPE_REGISTRY`.
 */
export function findRecipeForOntologyName(
	folderName: string,
	registry: { id: string; label: string; ontology: string }[] = RECIPE_REGISTRY,
): OntologyRecipeMatch | null {
	const target = NORMALIZE(folderName);
	if (!target) return null;

	let best: (OntologyRecipeMatch & { specificity: number }) | null = null;
	for (const entry of registry) {
		const labelCore = entry.label.split('(')[0];
		const candidates = [NORMALIZE(entry.ontology), NORMALIZE(labelCore)];
		for (const candidate of candidates) {
			if (!candidate) continue;
			if (target.includes(candidate) || candidate.includes(target)) {
				if (!best || candidate.length > best.specificity) {
					best = { id: entry.id, label: entry.label, specificity: candidate.length };
				}
			}
		}
	}
	return best ? { id: best.id, label: best.label } : null;
}
