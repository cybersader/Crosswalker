/**
 * enrich.ts — Pass 1.5 batch enrichment (pure logic).
 *
 * render() is per-row pure (Pass 1, hashable). Five artifacts need cross-row
 * knowledge, so they run here, AFTER every row renders, as a deterministic
 * batch-scope pass:
 *
 *   1. Index      — resolve each note's parent link → parent→children map
 *                   (keyed by CURIE, stable across relocation).
 *   2. Relocation — `parent_note: 'folder-note'`: for every concept that is a
 *                   parent of >=1 batch concept AND whose own basename-folder
 *                   already holds a child (`T1055.md` + `T1055/`), relocate
 *                   `T1055.md → T1055/T1055.md`. Symmetric flip-back: when the
 *                   CURRENT config asks for `'sibling'` (the default) but a
 *                   note is CURRENTLY folder-note-shaped (a prior import used
 *                   `'folder-note'`), it relocates back. Idempotent either way
 *                   — a note already in its desired shape is left alone.
 *                   Requires an eager (non-streamed) batch; a streamed source
 *                   keeps every parent as a sibling and records a deviation.
 *   3. Children   — a managed `children` array on each parent note (keyed by
 *                   its FINAL, post-relocation path), sorted by child curie
 *                   (fully managed; regenerated wholesale on re-import — user
 *                   extras inside the array are NOT preserved, unlike
 *                   tags/aliases which union; `user_preserve` covers separate
 *                   keys).
 *   4. Facet hubs — one synthetic note per facet VALUE (≥2 members), with a
 *                   managed `members` list, `kind: facet`, the facet tag, and an
 *                   H1 body. User prose below the H1 survives re-import.
 *   4.5 Level hubs — (2026-07-11, ICSB audit gap #1) `level_hubs: 'notes'`:
 *                   every FOLDER level in the generated structure gets an
 *                   index/MOC note, derived from the batch's own note paths
 *                   (never a filesystem scan). A folder whose basename already
 *                   matches an existing note in the batch (that note IS the
 *                   concept whose children the folder holds — sibling OR
 *                   folder-note shaped; basenames are the only identity that
 *                   matters in this basename-only-link codebase) is HOSTED:
 *                   that note gains a managed body "Contents" section listing
 *                   the folder's direct children. A folder with no such note
 *                   (a pure structural grouping folder, or the per-import
 *                   root) gets a brand-new SYNTHETIC hub note (`kind: 'hub'`)
 *                   at `<folder>/<folder>.md`. Root hub: when `rootFolder` is
 *                   given but isn't itself a tracked ancestor folder of any
 *                   note (the bare golden-vault test harness, which never
 *                   simulates a destination basePath), a fallback top-level
 *                   home note links every otherwise-parentless top-level
 *                   folder/file — in real usage (generation-engine, basePath
 *                   always set) `rootFolder` IS a tracked ancestor and is
 *                   handled by the uniform per-folder pass with no special
 *                   casing. A synthetic hub's CURIE is derived from its folder
 *                   path relative to `rootFolder` (the root's own hub takes the
 *                   reserved `hub/_root` local part), never from its full vault
 *                   path: identity must not move when an address does. The
 *                   superseded full-path form travels on `HubNote.legacyCuries`
 *                   so hubs already written under it stay reconcilable.
 *                   Deterministic, re-import safe (managed body
 *                   section is stripped-and-reappended by delimiter markers,
 *                   same discipline as facet hubs' H1 split).
 *   5. Stats      — edgeCount = parent links + children entries + member
 *                   entries + level-hub child-link entries (relocations are
 *                   not edges — they don't count).
 *
 * Links are basename-only in this codebase (`[[T1055]]`, never a full-path
 * form — `Address.wikilinkTarget`'s full-path form isn't consumed by anything
 * downstream yet, Pass-2 link minimizer territory per render()'s docstring).
 * That means relocation never needs to rewrite link TEXT anywhere — Obsidian
 * resolves `[[T1055]]` to `T1055/T1055.md` exactly as it resolved `T1055.md`,
 * as long as the basename stays unique. Relocation only ever needs to (a) move
 * the file and (b) make sure every consumer of that note's PATH (the children-
 * list write, generation-engine's re-import lookup) uses the new one.
 *
 * Determinism is a hard constraint: every derived list is sorted by curie,
 * relocations are processed in sorted-curie order, hubs are sorted by path, and
 * no wall-clock value is produced here. Same notes in → same result out,
 * regardless of input order.
 *
 * Pure module: NO Obsidian imports. The engine + golden harness apply the
 * result (move files, patch parents, write hubs) through the vault/merge path.
 */

import { replaceRegion, scanRegions, wrapRegion } from './managed-body';
import type { RecipeEnrichment } from '../render';
import type { FacetMembership } from '../import/mapping/facets';

/** A rendered note handed to enrichment (pre-provenance, pre-enrichment). */
export interface EnrichNote {
	/** Vault-relative path (no output-base prefix), forward slashes, ends `.md`. CURRENT/actual location. */
	path: string;
	/** Canonical concept curie. */
	curie: string;
	/** Rendered frontmatter — carries the parent link + facet tags. */
	frontmatter: Record<string, unknown>;
	/** Facet memberships (namespace + raw value) this note belongs to. */
	facets: FacetMembership[];
	/**
	 * The SIBLING path `render()` itself computed for this row THIS import —
	 * Pass 1 always computes the sibling form, never knowing about
	 * `parent_note` (design §3). Omit when it's the same as `path` (the common
	 * case: nothing relocated this note away from render()'s own output).
	 *
	 * This is what makes flip-back SAFE: a note can be folder-note-SHAPED
	 * (`X/X.md`) for two entirely different reasons — (a) that's genuinely
	 * where a PRIOR `parent_note: 'folder-note'` import relocated it, or (b)
	 * that's just what this recipe's OWN layout templates always produce for
	 * this row (e.g. a fixed top-level folder whose value happens to equal the
	 * leaf filename — real committed-golden behavior, NIST-CSF's `GV/GV.md`).
	 * Path SHAPE alone can't tell those apart; only knowing render()'s own
	 * intended path can. Flip-back only ever fires when `renderedPath` is set
	 * AND differs from `path` — i.e. there is POSITIVE evidence something
	 * other than render() put this note where it currently is.
	 */
	renderedPath?: string;
}

/** A materialized facet or level hub note (pre-provenance — the caller attaches _crosswalker). */
export interface HubNote {
	/**
	 * Facet hubs (`result.hubs`): RELATIVE to `hub_note_folder` (basePath-
	 * relative) — the caller re-prefixes with basePath. Level hubs
	 * (`result.levelHubs.notes`): a FULL path already, matching `EnrichNote.path`'s
	 * convention — the caller must NOT re-prefix. See each field's doc.
	 */
	path: string;
	curie: string;
	frontmatter: Record<string, unknown>;
	body: string;
	/**
	 * Level hubs only: the same sorted wikilink list embedded in `body`'s
	 * managed section, carried alongside so a re-import merge can rebuild the
	 * fresh section without re-parsing `body`.
	 */
	childrenLinks?: string[];
	/**
	 * The ROOT level hub only (2026-07-11): this batch's facet hub notes
	 * (`result.hubs`, already sorted by path), as a separate "Facets" sub-list
	 * under Contents — see `buildManagedChildrenSection`'s `extraGroups`.
	 * Carried alongside `body` for the same re-import-merge reason as
	 * `childrenLinks`: the merge path rebuilds the managed section from these
	 * fields directly, never by re-parsing `body`.
	 */
	facetLinks?: string[];
	/**
	 * Level hubs only: identity forms this hub was written under by an EARLIER
	 * plugin version, newest-superseded first. A hub curie used to be derived
	 * from the hub's full vault path, so moving an import's destination changed
	 * the identity of every hub in it — the note at the old address kept a curie
	 * nothing would ever claim again, and a second note was created for the
	 * "new" identity. A caller reconciles these aliases to the same note before
	 * concluding that a hub does not exist yet.
	 */
	legacyCuries?: string[];
}

/** One parent-note relocation the caller must physically apply to the vault. */
export interface Relocation {
	/** The concept's curie (stable identity across the move). */
	curie: string;
	/** Path the note currently lives at (in this batch). */
	from: string;
	/** Path it should move to. */
	to: string;
}

export interface EnrichmentResult {
	/** FINAL (post-relocation) path → sorted `children` wikilink array, to patch onto that parent note. */
	childrenByPath: Map<string, string[]>;
	/** Materialized facet hub notes (sorted by path). Empty unless facet_notes='notes'. */
	hubs: HubNote[];
	/** Materialized level (hierarchy MOC) hubs. Empty unless level_hubs='notes'. */
	levelHubs: {
		/**
		 * FINAL (post-relocation) path of a note that already exists in the batch
		 * and hosts a folder's index content → sorted `[[...]]` list of that
		 * folder's direct children, to append as a managed body section.
		 */
		hostedChildrenByPath: Map<string, string[]>;
		/**
		 * Brand-new synthetic hub notes for folders with no hosting note (sorted
		 * by path). `path` is a FULL vault-relative path already — see `HubNote`'s
		 * doc comment; callers must NOT re-prefix with basePath.
		 */
		notes: HubNote[];
	};
	/** Graph edge count: parent links + children entries + member entries + level-hub child-link entries. */
	edgeCount: number;
	/** Human-readable deviations (e.g. folder-note fallback), deterministic order. */
	deviations: string[];
	/** Parent-note relocations to apply, sorted by curie (design §3 step 2). */
	relocations: Relocation[];
}

export interface EnrichOptions {
	/** Ontology id — the curie prefix for hub notes. */
	ontology: string;
	/** The recipe's enrichment config (target.enrichment). */
	config: RecipeEnrichment;
	/**
	 * True when the source batch was streamed (AsyncIterable rows) rather than
	 * an eager array. `parent_note: 'folder-note'` needs the whole batch's
	 * shape up front (does a folder already exist for this parent?), so a
	 * streamed source keeps every parent as a sibling and records a deviation
	 * instead (design §3 step 2 v1 restriction). Default false.
	 */
	streamed?: boolean;
	/**
	 * The per-import destination folder (matches `GenerationOptions.basePath`),
	 * a FULL vault-relative path with no trailing slash ('' for the vault
	 * root). Used only by `level_hubs: 'notes'` to scope which folders are "in
	 * this import", to compute hub curies relative to it, and to name the
	 * root/home hub note. Every `EnrichNote.path`
	 * is expected to already be prefixed by this value in real usage (the
	 * generation-engine callers always supply it); omit only in contexts (like
	 * the bare golden-vault test harness) that never simulate a destination
	 * folder — level hubs still work, they just fall back to a top-level home
	 * note when `rootFolder` isn't a tracked ancestor of any note (see the
	 * module header's step 4.5 note).
	 */
	rootFolder?: string;
}

/** Facet hub notes are materialized only for values with at least this many members. */
export const HUB_MIN_MEMBERS = 2;

/**
 * Run the enrichment pass over a batch of rendered notes.
 * Pure + deterministic. Never mutates the input notes.
 */
export function enrich(notes: EnrichNote[], opts: EnrichOptions): EnrichmentResult {
	const config = opts.config ?? {};
	const result: EnrichmentResult = {
		childrenByPath: new Map(),
		hubs: [],
		levelHubs: { hostedChildrenByPath: new Map(), notes: [] },
		edgeCount: 0,
		deviations: [],
		relocations: [],
	};

	// --- 1. Index: basename → note, curie → note (first occurrence wins, deterministic). ---
	const byBasename = new Map<string, EnrichNote>();
	const byCurie = new Map<string, EnrichNote>();
	for (const note of notes) {
		const bn = basename(note.path);
		if (!byBasename.has(bn)) byBasename.set(bn, note);
		if (!byCurie.has(note.curie)) byCurie.set(note.curie, note);
	}

	// --- Derive parent→children from each note's parent link, keyed by the
	//     PARENT'S CURIE (stable identity — its path may still move below). ---
	const childrenByParentCurie = new Map<string, EnrichNote[]>();
	let parentLinkEdges = 0;
	for (const note of notes) {
		for (const target of parentTargets(note.frontmatter)) {
			const parent = byBasename.get(basename(target));
			if (!parent || parent === note) continue;
			parentLinkEdges++;
			let kids = childrenByParentCurie.get(parent.curie);
			if (!kids) {
				kids = [];
				childrenByParentCurie.set(parent.curie, kids);
			}
			kids.push(note);
		}
	}
	result.edgeCount += parentLinkEdges;

	// --- 2. Folder-note relocation (parent_note). Computes a curie→newPath
	//     override; children lists + downstream consumers use the FINAL path. ---
	const pathOverride = computeRelocations(notes, config, opts.streamed ?? false, result);
	const finalPath = (note: EnrichNote): string => pathOverride.get(note.curie) ?? note.path;

	// --- 3. Children lists. ---
	if (config.children_lists) {
		for (const [parentCurie, kids] of childrenByParentCurie) {
			const parent = byCurie.get(parentCurie);
			if (!parent) continue;
			const sorted = [...kids].sort((a, b) => cmp(a.curie, b.curie));
			const links = sorted.map((k) => `[[${basename(k.path)}]]`);
			result.childrenByPath.set(finalPath(parent), links);
			result.edgeCount += links.length;
		}
	}

	// --- 4. Facet hub notes. ---
	if (config.facet_notes === 'notes') {
		// Group notes by facet (namespace, value). Track raw display value + members.
		interface Group {
			namespace: string;
			value: string;
			members: EnrichNote[];
		}
		const groups = new Map<string, Group>();
		for (const note of notes) {
			for (const facet of note.facets) {
				const key = `${facet.namespace} ${facet.value}`;
				let g = groups.get(key);
				if (!g) {
					g = { namespace: facet.namespace, value: facet.value, members: [] };
					groups.set(key, g);
				}
				g.members.push(note);
			}
		}
		const folder = config.hub_note_folder ? stripSlashes(config.hub_note_folder) : '';
		for (const g of groups.values()) {
			if (g.members.length < HUB_MIN_MEMBERS) continue;
			const sorted = [...g.members].sort((a, b) => cmp(a.curie, b.curie));
			const members = sorted.map((m) => `[[${basename(m.path)}]]`);
			const hubPath = (folder ? `${folder}/` : '') + `${fsSafe(g.value)}.md`;
			const hub: HubNote = {
				path: hubPath,
				curie: `${opts.ontology}:facet/${g.namespace}/${slug(g.value)}`,
				frontmatter: {
					curie: `${opts.ontology}:facet/${g.namespace}/${slug(g.value)}`,
					kind: 'facet',
					tags: [`${g.namespace}/${tagsafe(g.value)}`],
					members,
				},
				body: `# ${g.value}\n`,
			};
			result.hubs.push(hub);
			result.edgeCount += members.length;
		}
		// Deterministic hub order.
		result.hubs.sort((a, b) => cmp(a.path, b.path));
	}

	// --- 4.5. Level hub notes (hierarchy MOCs). ---
	computeLevelHubs(notes, finalPath, byBasename, config, opts.ontology, opts.rootFolder, result);

	return result;
}

// ---------------------------------------------------------------------------
// Relocation (parent_note: sibling | folder-note)
// ---------------------------------------------------------------------------

/**
 * Compute the curie→newPath overrides for this batch's parent-note placement,
 * and record the corresponding `Relocation` entries + deviation notes on
 * `result`. Two directions, both idempotent and processed in sorted-curie
 * order for determinism:
 *
 *   - `parent_note: 'folder-note'` — every note with an already-colliding
 *     same-named folder (>=1 OTHER batch note's path nests under it) relocates
 *     `X.md → X/X.md`. PATH-STRUCTURAL eligibility, deliberately independent
 *     of `parent` link edges (mirrors the workbench preview's
 *     `toFolderNotePaths`, mapping/view-model.ts — the promise shown to the
 *     user in the placement chooser). A note already in that shape (a prior
 *     import already relocated it) is left alone — this is what makes
 *     re-import safe without needing a separate curie-lookup pass here: by
 *     the time this runs, the caller (generation-engine) has already resolved
 *     each row's write path to wherever the concept CURRENTLY lives (see
 *     `folderNoteCandidatePath` + generation-engine's `resolveWriteTarget`),
 *     so an already-relocated parent shows up here already folder-note-shaped.
 *
 *     Found 2026-07-11 (visual-report-and-graph.spec.ts repro): this branch
 *     used to derive its candidate set from `childrenByParentCurie` (built
 *     from `parent` wikilink edges, the same index `children_lists` uses). A
 *     packed/ragged hierarchy with no separate parent-id column — the COMMON
 *     case; ATT&CK sub-technique ids like `T1078.001` self-encode the
 *     hierarchy via the dot delimiter, no `parent_id` column needed — never
 *     produces a `parent` link, so `childrenByParentCurie` stayed empty and
 *     folder-note placement silently never fired: no error, no deviation,
 *     `T1078.md` stayed a sibling of `T1078/` even with "Folder note"
 *     explicitly selected. Switching to path-structural eligibility (which
 *     the UI preview already used) fixes it without touching
 *     `children_lists`, which legitimately stays link-based (see
 *     `recipe-registry.ts`'s note on self-referential prefix links).
 *   - otherwise (`'sibling'`, the default) — the symmetric flip-back: any note
 *     CURRENTLY folder-note-shaped (from a PRIOR import that used
 *     `'folder-note'`) relocates back to sibling form. Least-surprising per
 *     the 2026-07-05 variadic-split design §4 flip-back decision: placement
 *     always tracks the CURRENT recipe config, in either direction.
 *
 * A target path already occupied by another batch note is a collision guard,
 * not a crash: the relocation is skipped and a deviation records why.
 */
function computeRelocations(
	notes: EnrichNote[],
	config: RecipeEnrichment,
	streamed: boolean,
	result: EnrichmentResult,
): Map<string, string> {
	const pathOverride = new Map<string, string>();
	// Batch-known occupied paths — the collision guard. Updated as relocations
	// are accepted so two relocations in the same pass can't target each other.
	const occupied = new Set(notes.map((n) => n.path));

	const relocate = (curie: string, from: string, to: string, direction: 'folder-note' | 'sibling'): void => {
		if (occupied.has(to)) {
			result.deviations.push(
				`parent_note: could not relocate ${curie} to ${direction} form — ${to} is already used by another note in this batch.`,
			);
			return;
		}
		pathOverride.set(curie, to);
		occupied.delete(from);
		occupied.add(to);
		result.relocations.push({ curie, from, to });
		result.deviations.push(
			direction === 'folder-note'
				? `parent_note: relocated ${curie} to folder-note form (${from} → ${to}).`
				: `parent_note: relocated ${curie} back to sibling form (${from} → ${to}).`,
		);
	};

	if (config.parent_note === 'folder-note') {
		if (streamed) {
			result.deviations.push(
				"parent_note: folder-note requires an eager (non-streamed) source; this streamed import kept parent notes as siblings.",
			);
			return pathOverride;
		}
		// Every directory implied by any batch note's path (mirrors
		// toFolderNotePaths' `folderPaths` set exactly) — the collision test.
		const folderPaths = new Set<string>();
		for (const n of notes) {
			const parts = n.path.split('/');
			for (let i = 1; i < parts.length; i++) folderPaths.add(parts.slice(0, i).join('/'));
		}
		const sortedNotes = [...notes].sort((a, b) => cmp(a.curie, b.curie));
		for (const note of sortedNotes) {
			const shape = pathShape(note.path);
			if (shape.isFolderNoteShaped) continue; // already relocated — idempotent no-op.
			if (!folderPaths.has(shape.folderDir)) continue; // no colliding folder — stays a sibling.
			relocate(note.curie, note.path, joinMd(shape.folderDir, shape.base), 'folder-note');
		}
	} else {
		const sortedNotes = [...notes].sort((a, b) => cmp(a.curie, b.curie));
		for (const note of sortedNotes) {
			const rendered = note.renderedPath;
			// Only flip back with POSITIVE evidence: render() computed a
			// DIFFERENT (sibling) path for this row than where the note
			// currently sits, and where it sits is exactly that sibling path's
			// folder-note form. Shape alone is not enough — see the
			// `renderedPath` doc comment (the GV/GV.md false-positive this
			// guards against).
			if (rendered === undefined || rendered === note.path) continue;
			if (folderNoteCandidatePath(rendered) !== note.path) continue;
			relocate(note.curie, note.path, rendered, 'sibling');
		}
	}

	return pathOverride;
}

// ---------------------------------------------------------------------------
// Level hubs (hierarchy MOCs) — enrichment.level_hubs
// ---------------------------------------------------------------------------

/** One folder's link identity — how it's referenced when it's a CHILD of another folder. */
interface FolderIdentity {
	curie: string;
	/** Link target (basename, no `.md`) — always `basename(folder)`. */
	label: string;
	/** Set when a note already in the batch hosts this folder's content (see step 4.5). */
	hostedPath?: string;
	/** Synthetic hubs only: the address-derived curie this hub used to carry. */
	legacyCurie?: string;
}

/**
 * Compute `result.levelHubs` (and fold its edges into `result.edgeCount`) for
 * `level_hubs: 'notes'`. No-op otherwise. See the module header's step 4.5 for
 * the hosted-vs-synthetic rule and the root-hub fallback. Pure; mutates only
 * `result`.
 */
function computeLevelHubs(
	notes: EnrichNote[],
	finalPath: (note: EnrichNote) => string,
	byBasename: Map<string, EnrichNote>,
	config: RecipeEnrichment,
	ontology: string,
	rootFolder: string | undefined,
	result: EnrichmentResult,
): void {
	if (config.level_hubs !== 'notes') return;

	const entries = notes.map((n) => ({ note: n, path: finalPath(n) }));
	if (entries.length === 0) return;

	const root = rootFolder !== undefined ? stripSlashes(rootFolder) : undefined;
	// `root` scopes folder collection ONLY when it's a genuine ancestor of at
	// least one note (the real generation-engine case: every note path is
	// already basePath-prefixed). When it isn't (the bare golden-vault test
	// harness, which never simulates a basePath and instead passes a bare
	// LABEL for the root-hub fallback below), scoping by it would exclude
	// every real folder — so scoping is a no-op and every ancestor folder is
	// collected unscoped instead; the fallback branch still fires correctly
	// off `!folders.has(root)`.
	const rootIsTrackedAncestor =
		root !== undefined && root !== '' && entries.some((e) => e.path === root || e.path.startsWith(`${root}/`));
	const inScope = (folder: string): boolean =>
		!rootIsTrackedAncestor || folder === root || folder.startsWith(`${root}/`);

	// Every ancestor folder of every note's FINAL path, scoped to the import root.
	const folders = new Set<string>();
	for (const e of entries) {
		let dir = dirOf(e.path);
		while (dir !== '' && inScope(dir)) {
			folders.add(dir);
			dir = dirOf(dir);
		}
	}
	if (folders.size === 0 && (root === undefined || root === '')) return;

	// Direct subfolders, one pass.
	const subfoldersOf = new Map<string, string[]>();
	for (const f of folders) {
		const parent = dirOf(f);
		if (folders.has(parent)) {
			const arr = subfoldersOf.get(parent);
			if (arr) arr.push(f);
			else subfoldersOf.set(parent, [f]);
		}
	}
	// Direct file children per folder — excludes (a) a folder's own hosting
	// note (basename equals the folder's own basename; see step 4.5) and (b)
	// a note that hosts a SIBLING subfolder instead (e.g. `T1078.md` living
	// directly inside a shared parent folder alongside a `T1078/` subfolder —
	// the exact production shape: a sibling-placed parent_note sitting beside
	// its own children folder). Without (b), that note would be counted BOTH
	// as a plain child file AND — via the subfolder's identity, which
	// resolves to the very same note — a second time as "the T1078 folder",
	// producing a duplicate `[[T1078]]` entry in the parent's Contents list.
	const subfolderLabelsOf = new Map<string, Set<string>>();
	for (const [parent, subs] of subfoldersOf) {
		subfolderLabelsOf.set(parent, new Set(subs.map((g) => basename(g))));
	}
	const filesOf = new Map<string, typeof entries>();
	for (const e of entries) {
		const dir = dirOf(e.path);
		if (!folders.has(dir)) continue;
		const lbl = basename(e.path);
		if (lbl === basename(dir)) continue;
		if (subfolderLabelsOf.get(dir)?.has(lbl)) continue;
		const arr = filesOf.get(dir);
		if (arr) arr.push(e);
		else filesOf.set(dir, [e]);
	}

	// A hub's curie is computed from its folder path RELATIVE to the import root,
	// never from its full vault path. Identity must not be derived from address:
	// an address is a choice the user can change (a different destination, a
	// renamed output folder), and an identity that moves with it is not an
	// identity at all — the same hub acquires a second name, the re-import cannot
	// see the note that already exists, and the vault ends up holding two files
	// claiming one thing. The root folder itself has no relative path, so it gets
	// a reserved local part rather than an empty one, which every import under the
	// same ontology prefix would otherwise share by accident.
	const relativeToRoot = (f: string): string => {
		if (!rootIsTrackedAncestor || root === undefined || root === '') return f;
		if (f === root) return '';
		return f.startsWith(`${root}/`) ? f.slice(root.length + 1) : f;
	};
	const hubCurieOf = (f: string): string => {
		const rel = relativeToRoot(f);
		return `${ontology}:hub/${rel === '' ? ROOT_HUB_LOCAL_PART : slugPath(rel)}`;
	};
	/** The address-derived form this hub was written under before the fix above. */
	const legacyHubCurieOf = (f: string): string => `${ontology}:hub/${slugPath(f)}`;

	// Pass A: every folder's link identity — hosted by an existing same-
	// basename note (wherever it currently lives), or synthetic.
	const identity = new Map<string, FolderIdentity>();
	const identityOf = (f: string): FolderIdentity => {
		const label = basename(f);
		const cached = identity.get(f);
		if (cached) return cached;
		const host = byBasename.get(label);
		const id: FolderIdentity = host
			? { curie: host.curie, label, hostedPath: finalPath(host) }
			: { curie: hubCurieOf(f), label, legacyCurie: legacyHubCurieOf(f) };
		identity.set(f, id);
		return id;
	};

	// This batch's facet hub notes (step 4 already ran; `result.hubs` is
	// populated and sorted by path), as the ROOT hub's "Facets" sub-list —
	// they materialize in the SAME Pass 1.5 run as level hubs but wouldn't
	// otherwise be visible to each other (found 2026-07-11: the root home
	// note's Contents omitted facet hubs even though both land in the same
	// folder). Root-only: an ordinary (non-root) level hub lists its own
	// folder's direct children only, same as before. Deliberately NOT added to
	// `result.edgeCount`: step 4 already counted each hub's own MEMBER edges
	// when it built `result.hubs`; this is a display grouping on the root
	// note, not a new graph relationship being introduced.
	const rootFacetLinks = result.hubs.map((h) => `[[${basename(h.path)}]]`);

	// Pass B: direct children (sorted by curie), materialize.
	const sortedFolders = [...folders].sort(cmp);
	for (const f of sortedFolders) {
		const id = identityOf(f);
		const childRefs: { curie: string; label: string }[] = [];
		for (const e of filesOf.get(f) ?? []) childRefs.push({ curie: e.note.curie, label: basename(e.path) });
		for (const g of subfoldersOf.get(f) ?? []) {
			const gid = identityOf(g);
			childRefs.push({ curie: gid.curie, label: gid.label });
		}
		childRefs.sort((a, b) => cmp(a.curie, b.curie));
		const links = childRefs.map((c) => `[[${c.label}]]`);
		result.edgeCount += links.length;
		const isRoot = rootIsTrackedAncestor && f === root;
		const facetGroup = isRoot && rootFacetLinks.length > 0 ? [{ label: 'Facets', links: rootFacetLinks }] : [];

		if (id.hostedPath) {
			// A note already hosts this folder (e.g. a concept row whose id
			// equals the root folder's own name). `hostedChildrenByPath`'s value
			// is a plain wikilink array (shared with every non-root hosted
			// folder, and asserted as such by existing tests) — extending it to
			// carry a facets group too would ripple into every hosted-folder
			// consumer for a case that's vanishingly rare in real usage (the
			// per-import basePath colliding with an actual row's id). Known,
			// deliberately out of scope here; the synthetic branch below is
			// what real generation-engine imports produce for the root.
			result.levelHubs.hostedChildrenByPath.set(id.hostedPath, links);
		} else {
			result.levelHubs.notes.push({
				path: joinMd(f, id.label),
				curie: id.curie,
				frontmatter: { curie: id.curie, kind: 'hub', children: links },
				body: `# ${id.label}\n\n${buildManagedChildrenSection('Contents', links, facetGroup)}`,
				childrenLinks: links,
				...(facetGroup.length > 0 ? { facetLinks: rootFacetLinks } : {}),
				...(id.legacyCurie && id.legacyCurie !== id.curie ? { legacyCuries: [id.legacyCurie] } : {}),
			});
		}
	}

	// Root/home hub fallback: only when `rootFolder` was given a name but isn't
	// itself a tracked ancestor folder (no note path is actually prefixed by
	// it) — the bare golden-vault harness case (module header's step 4.5 note).
	// In real usage `root` IS a tracked ancestor and was already handled above
	// by the uniform per-folder pass, so this never double-creates a root hub.
	if (root !== undefined && root !== '' && !folders.has(root)) {
		const label = basename(root);
		const childRefs: { curie: string; label: string }[] = [];
		// Top-level folders first, so their (possibly hosted) labels are known
		// before filtering top-level files — a folder's HOST note (e.g. sibling
		// `T1078.md` beside top-level `T1078/`) must be represented ONCE, via
		// the folder's own identity, not also as an unrelated top-level file.
		const topFolders = sortedFolders.filter((f) => !folders.has(dirOf(f)));
		const topFolderLabels = new Set(topFolders.map((f) => identityOf(f).label));
		for (const f of topFolders) {
			const id = identityOf(f);
			childRefs.push({ curie: id.curie, label: id.label });
		}
		for (const e of entries) {
			if (dirOf(e.path) !== '') continue;
			const lbl = basename(e.path);
			if (topFolderLabels.has(lbl)) continue; // already represented via its folder's identity above
			childRefs.push({ curie: e.note.curie, label: lbl });
		}
		if (childRefs.length > 0) {
			childRefs.sort((a, b) => cmp(a.curie, b.curie));
			const links = childRefs.map((c) => `[[${c.label}]]`);
			result.edgeCount += links.length;
			const facetGroup = rootFacetLinks.length > 0 ? [{ label: 'Facets', links: rootFacetLinks }] : [];
			const host = byBasename.get(label);
			if (host) {
				// See the matching comment in Pass B: hosted-root facets are a
				// deliberately out-of-scope rare edge case.
				result.levelHubs.hostedChildrenByPath.set(finalPath(host), links);
			} else {
				// Same rule as `hubCurieOf` above: this hub IS the import root, so its
				// relative path is empty and it takes the reserved local part. The
				// old form slugged `root` — i.e. the destination — straight into the
				// identity, which is the exact coupling being removed.
				const curie = `${ontology}:hub/${ROOT_HUB_LOCAL_PART}`;
				const legacyCurie = `${ontology}:hub/${slug(root)}`;
				result.levelHubs.notes.push({
					path: `${label}.md`,
					curie,
					frontmatter: { curie, kind: 'hub', children: links },
					body: `# ${label}\n\n${buildManagedChildrenSection('Contents', links, facetGroup)}`,
					childrenLinks: links,
					...(facetGroup.length > 0 ? { facetLinks: rootFacetLinks } : {}),
					...(legacyCurie !== curie ? { legacyCuries: [legacyCurie] } : {}),
				});
			}
		}
	}

	result.levelHubs.notes.sort((a, b) => cmp(a.path, b.path));
}

/**
 * Curie local part for the import root's own hub. Reserved because the root's
 * path relative to itself is empty, and an empty local part is not a name.
 * `slug()` lowercases and strips to `[a-z0-9-]`, so no real folder can produce
 * a leading underscore and collide with this.
 */
const ROOT_HUB_LOCAL_PART = '_root';

/** Slug every segment of a folder path independently, joined the same way (a readable multi-segment curie local part). */
function slugPath(path: string): string {
	return path.split('/').map(slug).join('/');
}

/** Directory a path lives in ('' for a root-level path). */
function dirOf(path: string): string {
	const idx = path.lastIndexOf('/');
	return idx === -1 ? '' : path.slice(0, idx);
}

/** Join a directory + basename into a `.md` path ('' dir → a root-level path). */
function joinMd(dir: string, base: string): string {
	return `${dir ? `${dir}/` : ''}${base}.md`;
}

interface PathShape {
	/** True when `path` is already `.../<base>/<base>.md` (folder-note form). */
	isFolderNoteShaped: boolean;
	/** The directory that holds this note when it's a SIBLING (`dir/base.md`). */
	containerDir: string;
	/** The directory named after this note's own basename — its folder-note
	 *  home (`containerDir/base/`), and, coincidentally, where its own
	 *  variadic children (if any) already nest. */
	folderDir: string;
	base: string;
}

/** Classify a path as sibling- or folder-note-shaped, and derive both candidate directories. */
function pathShape(path: string): PathShape {
	const base = basename(path);
	const dir = dirOf(path);
	const dirBase = dir === '' ? '' : (dir.includes('/') ? dir.slice(dir.lastIndexOf('/') + 1) : dir);
	if (dir !== '' && dirBase === base) {
		// Folder-note shaped: .../<base>/<base>.md — one level up is the sibling home.
		return { isFolderNoteShaped: true, containerDir: dirOf(dir), folderDir: dir, base };
	}
	return { isFolderNoteShaped: false, containerDir: dir, folderDir: dir ? `${dir}/${base}` : base, base };
}

/**
 * The folder-note candidate path for a SIBLING-shaped path (`dir/base.md` →
 * `dir/base/base.md`). Exported so generation-engine's re-import lookup can
 * check whether a concept already lives there (curie-verified) before writing
 * a fresh sibling — the risky seam design §4 calls out. `render()` always
 * computes the sibling form (Pass 1 knows nothing about parent_note), so the
 * input here is always sibling-shaped in practice; an already folder-note-
 * shaped input is returned unchanged (defensive, not expected).
 */
export function folderNoteCandidatePath(siblingPath: string): string {
	const shape = pathShape(siblingPath);
	if (shape.isFolderNoteShaped) return siblingPath;
	return joinMd(shape.folderDir, shape.base);
}

// ---------------------------------------------------------------------------
// Helpers (pure)
// ---------------------------------------------------------------------------

/** The wikilink targets of a note's `parent` frontmatter value (empty `[[]]` → none). */
function parentTargets(frontmatter: Record<string, unknown>): string[] {
	return extractWikilinkTargets(frontmatter.parent);
}

/** Extract every `[[target]]` inner target from a string or array value. */
export function extractWikilinkTargets(value: unknown): string[] {
	const out: string[] = [];
	const scan = (v: unknown): void => {
		if (typeof v === 'string') {
			const re = /\[\[([^\]]+)\]\]/g;
			let m: RegExpExecArray | null;
			while ((m = re.exec(v)) !== null) {
				const inner = m[1].split('|')[0].split('#')[0].trim();
				if (inner) out.push(inner);
			}
		} else if (Array.isArray(v)) {
			for (const item of v) scan(item);
		}
	};
	scan(value);
	return out;
}

/** Last path segment without the `.md` extension. */
function basename(path: string): string {
	return path.split('/').pop()!.replace(/\.md$/i, '');
}

/** Stable string compare (deterministic across locales). */
function cmp(a: string, b: string): number {
	return a < b ? -1 : a > b ? 1 : 0;
}

/** Trim leading/trailing slashes off a folder path. */
function stripSlashes(p: string): string {
	return p.replace(/^\/+|\/+$/g, '');
}

/** Slug a value for a curie local part (lowercase, non-alnum → `-`). */
function slug(value: string): string {
	return value
		.trim()
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '');
}

/** Tagsafe a value (mirrors the render template `tagsafe` filter). */
function tagsafe(value: string): string {
	return value
		.replace(/[^A-Za-z0-9_-]+/g, '-')
		.replace(/-+/g, '-')
		.replace(/^-|-$/g, '')
		.toLowerCase();
}

/** Filesystem-safe a value for a hub note filename (mirrors the `fs-safe` filter). */
function fsSafe(value: string): string {
	return value
		.replace(/[<>:"/\\|?* -]/g, '_')
		.replace(/[\s.]+$/g, '')
		.trim();
}

// ---------------------------------------------------------------------------
// Hub-note body merge (re-import safety)
// ---------------------------------------------------------------------------

/**
 * Merge a freshly-regenerated hub note body with an existing one, preserving the
 * user's prose. A hub note body is a managed H1 line (`# Persistence`) followed
 * by any user prose. On re-import we regenerate the H1 (in case the value name
 * changed) but keep everything the user wrote below it.
 *
 * `existingBody` is the body of the note already in the vault (frontmatter
 * stripped); `freshBody` is the newly-built managed body (H1 + trailing newline).
 * Returns the body to write. Deterministic + idempotent.
 */
export function mergeHubBody(existingBody: string, freshBody: string): string {
	const normalized = existingBody.replace(/\r\n/g, '\n');
	// Find the first H1 line; everything after it is user prose.
	const lines = normalized.split('\n');
	const h1Index = lines.findIndex((l) => /^#\s+/.test(l));
	if (h1Index === -1) {
		// No managed H1 in the existing body — treat all of it as user prose and
		// append below the fresh H1.
		const prose = normalized.replace(/^\n+/, '');
		return prose ? `${freshBody.replace(/\n+$/, '')}\n\n${prose}` : freshBody;
	}
	const userProse = lines.slice(h1Index + 1).join('\n').replace(/^\n+/, '').replace(/\n+$/, '');
	const freshH1 = freshBody.replace(/\n+$/, '');
	return userProse ? `${freshH1}\n\n${userProse}\n` : `${freshH1}\n`;
}

// ---------------------------------------------------------------------------
// Level-hub managed body sections + the Waypoint marker (re-import safety)
// ---------------------------------------------------------------------------

/**
 * The `children` region: Pass 1.5's half of the managed-body contract
 * (src/generation/managed-body.ts). Different writer, different time, different
 * inputs from the `body` region — Pass 1.5 runs after the whole stream and has
 * no row scope, so it cannot re-render `body`; the row write does not yet know
 * the children, so it cannot render `children`. One region would force one of
 * them to reconstruct the other by parsing it back out, which is exactly the
 * guess the design removes.
 *
 * These markers shipped in v0.1.6 WITHOUT a version stamp. `v=` absent means
 * v=1 under the closed grammar, so every already-generated note in every real
 * vault is a valid v1 region with zero migration; emission adds `v=1` from now
 * on.
 */

/**
 * Build a level hub's managed "Contents" section: a heading + a bullet list of
 * `[[...]]` wikilinks, wrapped in HTML-comment markers (invisible in reading
 * view) so `mergeManagedChildrenSection` can find-and-replace exactly this
 * block on re-import without disturbing anything else in the note.
 *
 * `extraGroups` (2026-07-11, the root-hub facets fix): additional labeled
 * sub-lists appended after the main `links` list, INSIDE the same managed
 * block — one bold label line + its own bullet list per group. Currently used
 * for the ROOT hub only, to list this batch's facet hub notes (materialized
 * in the same Pass 1.5 run, step 4, before level hubs — step 4.5 — so they'd
 * otherwise never appear in the root's own Contents even though both land in
 * the same folder). A group with zero links is omitted entirely (no empty
 * "Facets:" label with nothing under it).
 */
export function buildManagedChildrenSection(
	heading: string,
	links: string[],
	extraGroups: { label: string; links: string[] }[] = [],
): string {
	const list = links.length > 0 ? links.map((l) => `- ${l}`).join('\n') : '*(nothing yet)*';
	let inner = `## ${heading}\n${list}\n`;
	for (const g of extraGroups) {
		if (g.links.length === 0) continue;
		inner += `\n**${g.label}:**\n${g.links.map((l) => `- ${l}`).join('\n')}\n`;
	}
	return `${wrapRegion('children', inner)}\n`;
}

/**
 * Merge a freshly-built managed children section into an existing body,
 * replacing ONLY the delimited block (identity by markers, not by heading
 * text — a user renaming "## Contents" doesn't break the next merge). Any
 * text outside the markers — including a user's own H1/title, prose before or
 * after the block, or (when Waypoint has expanded it) a `%% Begin Waypoint %%`
 * block — survives untouched. No existing block → the section is appended
 * after whatever's already there (first-import shape: `# Title\n\n<section>`
 * still applies via the caller; this function only handles the block itself).
 */
export function mergeManagedChildrenSection(existingBody: string, freshSection: string): string {
	const block = freshSection.replace(/\n+$/, '');
	const scan = scanRegions(existingBody);
	if (scan.ok && scan.spans.length > 0) {
		// Byte-preserving: everything outside the region keeps its exact bytes —
		// line endings, trailing whitespace, blank-line runs. Since 2026-08-27 this
		// function also runs over bodies that carry a `body` region and the user's
		// own prose, so normalising here would silently rewrite a user's file.
		return replaceRegion(existingBody, scan.spans, 'children', block);
	}
	// No regions at all (an unmarked legacy hub), or markers this build cannot
	// read. Append rather than guess. Leading blank lines carry no meaning here
	// (the blank-line separator `buildNoteContent` puts between the closing `---`
	// and the body), so a merge never drifts the leading whitespace across
	// successive re-imports.
	const normalized = existingBody.replace(/\r\n/g, '\n').replace(/^\n+/, '');
	const trimmed = normalized.replace(/\n+$/, '');
	return trimmed ? `${trimmed}\n\n${freshSection}` : freshSection;
}

/**
 * Append the `%% Waypoint %%` trigger comment to a hub/folder-note body when
 * it isn't already present — idempotent across re-imports, and safe once the
 * Waypoint plugin has itself expanded the trigger into a `%% Begin Waypoint %%
 * … %% End Waypoint %%` block (that expanded form also matches, so it is never
 * stripped or duplicated). Additive and opt-in (2026-07-11 ICSB audit §4
 * verdict): Crosswalker's own managed children section stays the primary,
 * always-on connectivity mechanism; this only lets Waypoint additionally track
 * notes a user later adds to the folder by hand.
 */
export function ensureWaypointMarker(body: string): string {
	if (/%%\s*(Begin\s+)?Waypoint\s*%%/i.test(body)) return body;
	const trimmed = body.replace(/\n+$/, '');
	return `${trimmed}\n\n%% Waypoint %%\n`;
}
