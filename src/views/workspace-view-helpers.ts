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

export interface MinimalVaultNode {
	path: string;
	name: string;
	/** Present (possibly empty) for folders; absent for files. */
	children?: MinimalVaultNode[];
}

export interface InstalledOntologySummary {
	name: string;
	path: string;
	noteCount: number;
}

/**
 * Derive the list of "installed ontologies" from the default output
 * folder: one summary per top-level subfolder, with a recursive count of
 * markdown notes underneath it. Loose files directly under the output
 * root are ignored (not an ontology). Returns an empty array if the
 * output root doesn't exist yet or has no subfolders.
 */
export function deriveInstalledOntologies(
	outputRoot: MinimalVaultNode | null | undefined,
): InstalledOntologySummary[] {
	if (!outputRoot || !outputRoot.children) return [];

	const summaries: InstalledOntologySummary[] = [];
	for (const child of outputRoot.children) {
		if (!child.children) continue; // skip loose files, only folders count as ontologies
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
