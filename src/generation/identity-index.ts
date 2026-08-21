/**
 * identity-index.ts — resolve a Crosswalker note by WHAT IT IS, not where it sits.
 *
 * Every generated note carries `curie` in its frontmatter. Until now, generation
 * found existing notes by PATH (`getAbstractFileByPath`), with one hard-coded
 * alternative shape consulted when enrichment is on. That works right up until an
 * address changes for any reason the path rule does not anticipate — a renamed
 * output folder, a user-chosen destination, a changed layout — at which point the
 * re-import cannot see the existing note and writes a second one beside it.
 *
 * Path patterns are guesses about a note; the curie is a fact about it. This index
 * makes identity the join key, so a re-import becomes a reconciliation between the
 * identities a source produces and the identities a vault already holds.
 *
 * Decision: re-import is identity reconciliation, not path migration (2026-08-21).
 *
 * SCOPE GUARD — the index only ever admits notes carrying a `_crosswalker`
 * provenance block. A note a user wrote by hand is structurally unreachable from
 * here, so reconciliation can never move, rewrite, or orphan it.
 *
 * COST — one pass over the vault's markdown list per generation run, reading
 * frontmatter from Obsidian's own metadata cache. Nothing is read from disk and no
 * second index of the vault is built; this reuses the index Obsidian already
 * maintains for every plugin.
 */

import { App, TFile } from 'obsidian';

/** A curie claimed by more than one note. Ambiguous: identity must be unique. */
export interface IdentityCollision {
	curie: string;
	paths: string[];
}

export interface IdentityIndex {
	/** The note currently holding this curie, or null if the vault has none. */
	get(curie: string): TFile | null;
	/** Every curie the index holds — the vault side of a reconciliation. */
	curies(): string[];
	/** Curies held by more than one note. Non-empty means the vault is ambiguous. */
	collisions: IdentityCollision[];
	/** Count of distinct curies indexed. */
	size: number;
}

export interface BuildIdentityIndexOptions {
	/** Restrict to notes owned by one durable import set. */
	importSetId?: string;
	/**
	 * @deprecated Recipe ids name reusable instructions, not ownership. Retained
	 * for one release of compatibility. When importSetId is present it takes
	 * precedence, so unstamped legacy notes remain outside every ownership set.
	 */
	recipeId?: string;
}

/** Read a plain string frontmatter value, or null when absent/blank/non-string. */
function readString(value: unknown): string | null {
	if (typeof value !== 'string') return null;
	const trimmed = value.trim();
	return trimmed.length > 0 ? trimmed : null;
}

/**
 * Build a curie -> file index over the Crosswalker-generated notes in the vault.
 *
 * Deterministic on collision: the first file encountered wins `get()`, and every
 * claimant is recorded in `collisions` so a caller can refuse to proceed rather
 * than silently pick one. Callers SHOULD treat a non-empty `collisions` as an
 * error — writing through an ambiguous identity is how duplicates become
 * permanent.
 */
export function buildIdentityIndex(app: App, options: BuildIdentityIndexOptions = {}): IdentityIndex {
	const byCurie = new Map<string, TFile>();
	const claims = new Map<string, string[]>();

	for (const file of app.vault.getMarkdownFiles()) {
		const fm = app.metadataCache.getFileCache(file)?.frontmatter;
		if (!fm || typeof fm !== 'object') continue;

		// Scope guard: no provenance block means the note is not ours to reconcile.
		const provenance = (fm as Record<string, unknown>)._crosswalker;
		if (!provenance || typeof provenance !== 'object') continue;

		if (options.importSetId !== undefined) {
			const importSet = (provenance as Record<string, unknown>).import_set;
			const id = importSet && typeof importSet === 'object'
				? readString((importSet as Record<string, unknown>).id)
				: null;
			if (id !== options.importSetId) continue;
		} else if (options.recipeId !== undefined) {
			const recipe = (provenance as Record<string, unknown>).recipe;
			const id = recipe && typeof recipe === 'object'
				? readString((recipe as Record<string, unknown>).id)
				: null;
			if (id !== options.recipeId) continue;
		}

		const curie = readString((fm as Record<string, unknown>).curie);
		if (!curie) continue;

		const existing = claims.get(curie);
		if (existing) {
			existing.push(file.path);
		} else {
			claims.set(curie, [file.path]);
			byCurie.set(curie, file);
		}
	}

	const collisions: IdentityCollision[] = [];
	for (const [curie, paths] of claims) {
		if (paths.length > 1) collisions.push({ curie, paths: [...paths].sort() });
	}
	collisions.sort((a, b) => a.curie.localeCompare(b.curie));

	return {
		get: (curie: string) => byCurie.get(curie) ?? null,
		curies: () => [...byCurie.keys()],
		collisions,
		size: byCurie.size,
	};
}

/**
 * Classify one source-produced identity against the vault, given its desired
 * address. This is the whole reconciliation vocabulary in one place.
 *
 * `keep-in-place` exists for a real case rather than as a hedge: enrichment
 * deliberately relocates a concept to its folder-note shape, so a note sitting at
 * a Crosswalker-chosen alternative address is where it is SUPPOSED to be. Moving
 * it back would fight the pass that put it there.
 */
export type ReconcileAction = 'create' | 'merge-in-place' | 'move-then-merge' | 'keep-in-place';

export interface Reconciliation {
	action: ReconcileAction;
	/** The note holding this identity today, when one exists. */
	existingFile: TFile | null;
	/** Where the note should end up. Equals the current path unless moving. */
	writePath: string;
}

export function reconcile(
	index: IdentityIndex,
	curie: string,
	desiredPath: string,
	isAcceptableAlternatePath?: (currentPath: string, desiredPath: string) => boolean,
): Reconciliation {
	const existingFile = index.get(curie);
	if (!existingFile) return { action: 'create', existingFile: null, writePath: desiredPath };

	if (existingFile.path === desiredPath) {
		return { action: 'merge-in-place', existingFile, writePath: desiredPath };
	}

	if (isAcceptableAlternatePath?.(existingFile.path, desiredPath)) {
		return { action: 'keep-in-place', existingFile, writePath: existingFile.path };
	}

	return { action: 'move-then-merge', existingFile, writePath: desiredPath };
}
