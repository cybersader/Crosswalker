/**
 * import-set.ts — durable ownership for one import's vault footprint.
 *
 * An import set is the collection of notes one import owns. Its id is minted,
 * never derived from a recipe, destination, or source: all three can change on
 * a legitimate refresh. Markdown provenance is the registry; discovery prefers
 * Obsidian's metadata cache and reads cache-cold destination frontmatter directly.
 */

import { App, normalizePath, parseYaml, TFile } from 'obsidian';
import { slugifyForCurie } from './curie';
import { IDENTITY_SENTINELS } from './legacy-recipe-shim';

export const IMPORT_SET_ID_PATTERN = /^iset-[a-z0-9]{6}$/;
export const IMPORT_SET_SCHEMES = ['endpoint-v1', 'set-qualified-v1'] as const;
export type ImportSetScheme = typeof IMPORT_SET_SCHEMES[number];

/** Default for callers that do not deliberately choose a scheme. Kept at
 * endpoint-v1 so every pre-existing import path preserves its identities. */
export const CURRENT_IMPORT_SET_SCHEME: ImportSetScheme = 'endpoint-v1';

export interface ImportSetReference {
	id: string;
	scheme: ImportSetScheme;
	/**
	 * The destination folder this set was last written to. Recorded rather than
	 * inferred: a refresh that cannot look up where its set already lives has to
	 * guess from a derived default, and a guess that disagrees with reality
	 * writes a second copy of the whole import beside the first. Optional because
	 * every note written before this existed has no stamp; those sets fall back
	 * to `recoverImportSetRoot`.
	 *
	 * A hint, never authority. Nothing reconciles it when a user renames the
	 * folder in the file explorer, so a reader must re-validate it against the
	 * set's actual note paths before writing anything there.
	 */
	destination?: string;
	/**
	 * AM-6. The ontology this set's curies are minted under, pinned at mint the
	 * same way `scheme` is.
	 *
	 * Failure mode prevented: a refresh recomputing the ontology from the run's
	 * own recipe and getting a different answer from the one the set's notes
	 * already carry. Every existing note then falls outside the run's identity
	 * index, so the run writes a second copy of the whole framework beside the
	 * first and reports every original as an orphan.
	 *
	 * Optional because notes written before this existed carry no pin. Such a
	 * set is pinned on its first refresh to the ontology prefix its own notes
	 * already show, because the notes are the fact.
	 */
	ontology?: string;
}

export type ImportSetOption =
	| { id: string; scheme?: ImportSetScheme }
	| 'new'
	| 'new-set-qualified';

export interface DiscoveredImportSet extends ImportSetReference {
	noteCount: number;
	paths: string[];
	/**
	 * Where this set's notes actually live: the recorded destination when it is
	 * still consistent with those notes, otherwise recovered from them, otherwise
	 * null. Null means "refuse to guess", which is the correct answer when the
	 * set's notes do not share a root.
	 */
	root: string | null;
	/**
	 * Every distinct `_crosswalker.recipe.id` stamped on this set's notes, sorted.
	 *
	 * A set legitimately holds more than one: a refresh through a renamed or
	 * re-saved recipe restamps only the notes it rewrites, and a set that was
	 * seeded by one recipe and extended by another is a real state, not a fault.
	 * Membership, therefore, not equality: a source matches a set when the set
	 * carries that recipe id anywhere, which is the question a caller is actually
	 * asking ("has this source written here before?").
	 */
	recipeIds: string[];
	/**
	 * Every distinct ontology prefix (the part of a note's `curie` before the
	 * colon) stamped on this set's notes, sorted. The second half of the same
	 * question, for a set whose recipe was renamed between imports: the ontology
	 * prefix is a pure function of the source, so it survives a recipe rename.
	 */
	ontologyPrefixes: string[];
}

interface ImportSetObservation {
	id: string;
	scheme: string | null;
	path: string;
	destination: string | null;
	recipeId: string | null;
	ontologyPrefix: string | null;
	/** The ontology pinned in this note's import_set block, if any (AM-6). */
	ontology: string | null;
}

/** Stored import-set provenance is malformed or disagrees within one set. */
export class ImportSetProvenanceError extends Error {
	constructor(message: string, public readonly paths: string[]) {
		super(message);
		this.name = 'ImportSetProvenanceError';
	}
}

/**
 * Discover import sets represented by notes below one destination folder.
 * Notes with no import_set stamp are legacy and deliberately stay outside all
 * sets. They remain valid and can never become orphans by inference.
 */
export async function discoverImportSets(app: App, basePath?: string): Promise<DiscoveredImportSet[]> {
	return buildDiscoveredSets(await collectObservations(app, basePath));
}

/**
 * Every form a placeholder identity can reach a prefix comparison in.
 *
 * The literals live at their mint site (`legacy-recipe-shim.ts`) and are
 * imported, never retyped: a second copy is a copy that drifts, and a drifted
 * copy silently re-admits the placeholder. Both the raw and the slugified form
 * are covered because an ontology reaches this test after `slugifyForCurie` -
 * that is how it is compared against stamped curies.
 */
const IDENTITY_SENTINEL_FORMS: ReadonlySet<string> = new Set([
	...IDENTITY_SENTINELS,
	...IDENTITY_SENTINELS.map((value) => slugifyForCurie(value)),
]);

/**
 * AM-24 (2026-08-31). What a decision surface says when it cannot see the vault.
 *
 * One message, so no caller invents its own wording for the same state.
 */
export const VAULT_STILL_INDEXING_MESSAGE =
	'Obsidian is still indexing your vault. Wait a moment, then run this again.';

/** Thrown by any rule that refuses to answer from a half-read vault. */
export class VaultStillIndexingError extends Error {
	constructor(message: string = VAULT_STILL_INDEXING_MESSAGE) {
		super(message);
		this.name = 'VaultStillIndexingError';
	}
}

/**
 * Markdown files Obsidian has not finished parsing yet.
 *
 * `getFileCache` returns null both for a file with no frontmatter and for one
 * the metadata cache has not reached, so this is the only way to tell "the vault
 * holds nothing" from "the vault has not been read yet". Found by screenshotting
 * the evidence window against a real vault mid-index, where it claimed an
 * imported vault had no controls.
 *
 * A host that exposes neither the file list nor the cache cannot be measured at
 * all; that answers 0 rather than blocking every caller on an unmeasurable
 * environment. Real Obsidian always exposes both.
 */
export function countUnindexedMarkdownFiles(app: App): number {
	const getMarkdownFiles = app.vault?.getMarkdownFiles?.bind(app.vault);
	const getFileCache = app.metadataCache?.getFileCache?.bind(app.metadataCache);
	if (!getMarkdownFiles || !getFileCache) return 0;
	let unindexed = 0;
	for (const file of getMarkdownFiles()) {
		if (!getFileCache(file)) unindexed += 1;
	}
	return unindexed;
}

/**
 * Wait once for Obsidian's metadata cache to drain, then RE-CHECK.
 *
 * `resolved` fires once per full pass, and the wait also resolves on its own
 * timeout, so the fact that the await returned is not evidence of anything. The
 * number returned is a fresh count, never an assumption.
 */
export async function settleVaultIndex(app: App, timeoutMs = 4000): Promise<number> {
	if (countUnindexedMarkdownFiles(app) === 0) return 0;
	const on = app.metadataCache?.on?.bind(app.metadataCache);
	const offref = app.metadataCache?.offref?.bind(app.metadataCache);
	if (on && offref) {
		await new Promise<void>((resolve) => {
			let done = false;
			const finish = () => {
				if (done) return;
				done = true;
				try { offref(ref); } catch { /* a host that cannot unsubscribe still resolves */ }
				resolve();
			};
			const ref = on('resolved', finish);
			setTimeout(finish, timeoutMs);
		});
	}
	return countUnindexedMarkdownFiles(app);
}

/**
 * AM-24. Refuse to answer at all while the vault is half-read.
 *
 * Failure mode prevented: cache lag read as fact, SEVENTH appearance. Every
 * vault-wide rule here reads the metadata cache, and whole-vault discovery has
 * no raw-frontmatter fallback (deliberately, so it never becomes a whole-vault
 * content scan). A cold cache therefore shows a vault with fewer sets than it
 * has, and the qualification rule answers "nothing collides" about a vault it
 * never saw - minting an unqualified set into an occupied curie space, whereupon
 * every row is correctly refused and the user sees "0 notes created, N refused"
 * with no cause.
 *
 * The precondition lives INSIDE the rule rather than in its callers, because
 * callers forgetting it is exactly how the rule acquired three copies in the
 * first place. Both command-palette entry points can be fired during startup
 * indexing.
 */
export async function requireVaultIndexed(app: App): Promise<void> {
	if (await settleVaultIndex(app) > 0) throw new VaultStillIndexingError();
}

/**
 * AM-18 (2026-08-31). WHICH new set to mint: the ONE implementation.
 *
 * Would a new set minted for this source write curies into a space an existing
 * set already occupies? If so it is minted `set-qualified-v1`, so two releases of
 * one framework - or two crosswalks over one pair - coexist by construction
 * instead of meeting as an AM-12 collision on every row. `endpoint-v1` stays the
 * answer when nothing collides, so every pre-existing import path keeps the
 * identities it already wrote.
 *
 * Failure mode prevented: three copies of one rule, two of them wrong. Before
 * this, the wizard compared whole-vault ontology prefixes, the crosswalk modal
 * asked whether one folder was empty, and the dev fixture command asked nothing
 * at all. A folder is an ADDRESS, and this project's own rule is that an address
 * does not name an owner: move an earlier crosswalk's folder with a drag and the
 * folder-emptiness copy mints an unqualified set straight into the moved set's
 * curie space. One function, so the rule cannot disagree with itself.
 *
 * The signal is a shared REAL ontology prefix. The prefix is the whole left half
 * of every curie the source produces, and discovery carries the prefixes existing
 * sets' notes actually show, so this compares stamped fact against stamped fact.
 * A sentinel prefix is not a fact about anything (it is what a nameless classic
 * import stamps) and an unbuildable source has no prefix at all; both signal
 * nothing and degrade to the plain default.
 *
 * Deliberately compares against `ontologyPrefixes` (what the notes hold) and NOT
 * against a set's pinned `ontology`: a set already minted set-qualified carries
 * the unqualified ontology as its pin while its notes carry the qualified prefix,
 * and it is the notes that decide whether a space is taken.
 *
 * @param sets  Sets discovered over the WHOLE vault. A destination-scoped list
 *              answers a different question and must not be passed here.
 * @param ontologyPrefix  Already slugified (`slugifyForCurie`), or null when the
 *              source cannot produce one.
 */
export function newSetSchemeFrom(
	sets: readonly DiscoveredImportSet[],
	ontologyPrefix: string | null,
): 'new' | 'new-set-qualified' {
	if (ontologyPrefix === null || IDENTITY_SENTINEL_FORMS.has(ontologyPrefix)) return 'new';
	return sets.some((set) => set.ontologyPrefixes.includes(ontologyPrefix)) ? 'new-set-qualified' : 'new';
}

/**
 * AM-18. The same rule for a caller that holds no discovered-set snapshot of its
 * own: discover the WHOLE vault, then answer.
 *
 * Whole-vault deliberately. A caller that scopes discovery to its destination is
 * asking "is that folder empty", which is the address question this amendment
 * exists to delete.
 */
export async function newSetSchemeFor(
	app: App,
	ontologyPrefix: string | null,
): Promise<'new' | 'new-set-qualified'> {
	// AM-24. The precondition is the FIRST thing, not a step inside the branch
	// that happens to read the vault. A caller cannot tell which branch it hit, so
	// a function that sometimes checks and sometimes does not is a function whose
	// contract nobody can state.
	await requireVaultIndexed(app);
	if (ontologyPrefix === null || IDENTITY_SENTINEL_FORMS.has(ontologyPrefix)) return 'new';
	return newSetSchemeFrom(await discoverImportSets(app, undefined), ontologyPrefix);
}

/**
 * Resolve the import set one generation run writes under. Shared by both
 * generation entry points.
 *
 * AM-9. Exactly two behaviours, and no third:
 *   - an explicit `{id, scheme}` refreshes THAT set (existing notes stay
 *     authoritative for its scheme and pinned ontology; an explicit id may name
 *     an empty or wiped set, and a caller that knows the fixed scheme may carry
 *     it, otherwise the backwards-compatible endpoint-v1 default applies)
 *   - anything else, `undefined` included, MINTS A NEW SET
 *
 * There is deliberately no "look at the destination and adopt what is there"
 * path. See the note above the mint below for why.
 */
export async function resolveImportSet(
	app: App,
	basePath: string,
	option?: ImportSetOption,
	/**
	 * AM-6. The ontology this run WOULD use if the set had never been imported
	 * before. A proposal only: an existing set's pin always wins, because a
	 * refresh that changes the ontology changes every curie it writes and
	 * therefore stops recognising the notes it owns.
	 */
	proposedOntology?: string,
): Promise<ImportSetReference> {
	// Where this run writes is stamped onto every note it writes. Recorded, not
	// inferred: without it a later refresh has no way to ask where its own set
	// already lives, and has to fall back to a derived default that may point
	// somewhere else entirely. Re-stamped on every run rather than only at mint,
	// so a set that legitimately moves records its new home instead of keeping a
	// stale one.
	const destination = normalizeFolder(basePath ?? '') || undefined;
	const proposed = proposedOntology?.trim() || undefined;
	const stamp = (reference: ImportSetReference, ontology?: string): ImportSetReference => ({
		...reference,
		...(destination ? { destination } : {}),
		...(ontology ? { ontology } : {}),
	});

	if (option === 'new') {
		return stamp({ id: mintImportSetId(collectKnownIds(app)), scheme: CURRENT_IMPORT_SET_SCHEME }, proposed);
	}

	if (option === 'new-set-qualified') {
		return stamp({ id: mintImportSetId(collectKnownIds(app)), scheme: 'set-qualified-v1' }, proposed);
	}

	if (option && typeof option === 'object') {
		assertImportSetId(option.id);
		if (option.scheme !== undefined) assertImportSetScheme(option.scheme);
		const observations = await collectObservations(app, undefined, option.id);
		const existing = buildDiscoveredSets(observations)[0];
		if (existing) {
			if (option.scheme !== undefined && option.scheme !== existing.scheme) {
				throw new ImportSetProvenanceError(
					`Import set ${option.id} is fixed to ${existing.scheme}; refresh cannot change it to ${option.scheme}.`,
					existing.paths,
				);
			}
			return stamp({ id: existing.id, scheme: existing.scheme }, pinnedOntologyOf(existing, proposed));
		}
		return stamp({ id: option.id, scheme: option.scheme ?? CURRENT_IMPORT_SET_SCHEME }, proposed);
	}

	// AM-9. THE ENGINE HAS NO OPINION ABOUT WHAT IS IN THE FOLDER.
	//
	// A destination-discovery branch used to sit here: look at the folder, and if
	// exactly one set already lives there, refresh it. That was the original guess,
	// and every preselect deleted from the wizard and the crosswalk modal above it
	// was a copy of this one. It is deleted rather than narrowed.
	//
	// Failure mode prevented: writing one framework into another framework's set
	// with nobody having chosen it. A folder is an address, and an address does not
	// name an owner. Two frameworks legitimately share a legacy flat root; a
	// deterministic mapping folder holds crosswalks from two different providers; a
	// user drags a folder somewhere new. In each case the engine, asked to write
	// somewhere, would silently take over the notes it found and report the rows it
	// no longer produced as orphans, by which time the originals are overwritten.
	// The cost of the opposite mistake is a duplicate folder the user can see and
	// delete, so the default here is always the harmless one.
	//
	// Ownership is decided by the caller, on screen, by a click. The engine
	// executes that decision: an explicit {id, scheme} refreshes that set, and
	// anything else - undefined included - mints a new one.
	return stamp({ id: mintImportSetId(collectKnownIds(app)), scheme: CURRENT_IMPORT_SET_SCHEME }, proposed);
}

/**
 * AM-6. The ontology a refresh must mint curies under.
 *
 * Order: the stamped pin, else the one ontology prefix the set's own notes
 * already agree on (a legacy set predates the pin, and its notes are the fact),
 * else this run's proposal.
 *
 * Several disagreeing prefixes pin nothing. There is no single fact to recover
 * there, and inventing one would be the guess this whole design removes; the
 * behaviour in that case stays exactly what it was before AM-6.
 */
function pinnedOntologyOf(set: DiscoveredImportSet, proposed?: string): string | undefined {
	if (set.ontology) return set.ontology;
	if (set.ontologyPrefixes.length === 1) return set.ontologyPrefixes[0];
	return proposed;
}

/** Mint a meaningless crypto-random id, retrying if a vault already uses it. */
export function mintImportSetId(existingIds: ReadonlySet<string> = new Set()): string {
	const cryptoApi = globalThis.crypto;
	if (!cryptoApi?.getRandomValues) {
		throw new Error('Secure random generation is unavailable; cannot mint an import set id.');
	}

	const alphabet = 'abcdefghijklmnopqrstuvwxyz0123456789';
	for (let attempt = 0; attempt < 100; attempt++) {
		const bytes = new Uint8Array(6);
		cryptoApi.getRandomValues(bytes);
		let suffix = '';
		for (const byte of bytes) suffix += alphabet[byte % alphabet.length];
		const id = `iset-${suffix}`;
		if (!existingIds.has(id)) return id;
	}
	throw new Error('Could not mint a unique import set id after 100 attempts.');
}

async function collectObservations(app: App, basePath?: string, onlyId?: string): Promise<ImportSetObservation[]> {
	const observations: ImportSetObservation[] = [];
	for (const file of app.vault.getMarkdownFiles()) {
		if (!isWithinDestination(file.path, basePath)) continue;
		let fm = app.metadataCache.getFileCache(file)?.frontmatter;
		if ((!fm || typeof fm !== 'object') && basePath !== undefined) {
			// Cache lag is not evidence that a destination has no owned notes. Read only
			// cache-cold files inside the destination so mint-vs-reuse stays correct
			// without turning discovery into a whole-vault raw-content scan.
			fm = await readRawFrontmatter(app, file);
		}
		if (!fm || typeof fm !== 'object' || Array.isArray(fm)) continue;
		const provenance = (fm as Record<string, unknown>)._crosswalker;
		if (!provenance || typeof provenance !== 'object') continue;
		const raw = (provenance as Record<string, unknown>).import_set;
		if (raw === undefined) continue;
		if (!raw || typeof raw !== 'object') {
			throw new ImportSetProvenanceError(`Invalid _crosswalker.import_set at ${file.path}: expected an object.`, [file.path]);
		}

		const id = readString((raw as Record<string, unknown>).id);
		// Explicit refresh validates only the named set. Corrupt provenance for an
		// unrelated set elsewhere in the vault cannot block this import.
		if (onlyId !== undefined && id !== onlyId) continue;
		const scheme = readString((raw as Record<string, unknown>).scheme);
		if (!id || !IMPORT_SET_ID_PATTERN.test(id)) {
			throw new ImportSetProvenanceError(`Invalid import set id at ${file.path}: expected iset- followed by 6 lowercase letters or digits.`, [file.path]);
		}
		const destination = readString((raw as Record<string, unknown>).destination);
		const ontology = readString((raw as Record<string, unknown>).ontology);
		// Two stamped facts about WHAT produced this note, kept beside the ownership
		// id so a caller can ask "has this source written here before?" without
		// re-deriving anything from the note's address. Both are optional: a note
		// written by a producer that stamps neither simply contributes nothing.
		const recipeBlock = (provenance as Record<string, unknown>).recipe;
		const recipeId = recipeBlock && typeof recipeBlock === 'object'
			? readString((recipeBlock as Record<string, unknown>).id)
			: null;
		observations.push({
			id,
			scheme,
			path: file.path,
			destination,
			recipeId,
			ontologyPrefix: curiePrefix(readString((fm as Record<string, unknown>).curie)),
			ontology,
		});
	}
	return observations;
}

async function readRawFrontmatter(app: App, file: TFile): Promise<Record<string, unknown> | undefined> {
	const content = await app.vault.cachedRead(file);
	const match = /^---\r?\n([\s\S]*?)\r?\n---/.exec(content);
	if (!match) return undefined;

	try {
		const parsed = parseYaml(match[1]);
		if (parsed === null || parsed === undefined) return undefined;
		if (typeof parsed !== 'object' || Array.isArray(parsed)) {
			throw new Error('frontmatter root must be a mapping');
		}
		return parsed as Record<string, unknown>;
	} catch (error) {
		const detail = error instanceof Error ? error.message : String(error);
		throw new ImportSetProvenanceError(`Invalid frontmatter YAML at ${file.path}: ${detail}.`, [file.path]);
	}
}

function buildDiscoveredSets(observations: ImportSetObservation[]): DiscoveredImportSet[] {
	const byId = new Map<string, ImportSetObservation[]>();
	for (const observation of observations) {
		const group = byId.get(observation.id);
		if (group) group.push(observation);
		else byId.set(observation.id, [observation]);
	}

	const sets: DiscoveredImportSet[] = [];
	for (const [id, group] of byId) {
		const schemes = new Set(group.map((entry) => entry.scheme));
		const scheme = schemes.size === 1 ? group[0].scheme : null;
		if (schemes.size !== 1 || !isImportSetScheme(scheme)) {
			const paths = group.map((entry) => entry.path).sort();
			const details = group
				.map((entry) => `${entry.path} (${entry.scheme ?? 'missing scheme'})`)
				.sort()
				.join(', ');
			throw new ImportSetProvenanceError(`Import set ${id} has inconsistent or unsupported schemes: ${details}.`, paths);
		}
		const paths = group.map((entry) => entry.path).sort();
		const recorded = recordedDestination(group);
		const pinnedOntology = agreedOntology(group);
		sets.push({
			id,
			scheme,
			noteCount: paths.length,
			paths,
			root: resolveSetRoot(recorded, paths),
			recipeIds: distinctSorted(group.map((entry) => entry.recipeId)),
			ontologyPrefixes: distinctSorted(group.map((entry) => entry.ontologyPrefix)),
			...(recorded ? { destination: recorded } : {}),
			...(pinnedOntology ? { ontology: pinnedOntology } : {}),
		});
	}
	sets.sort((a, b) => a.id.localeCompare(b.id));
	return sets;
}

function isImportSetScheme(value: unknown): value is ImportSetScheme {
	return typeof value === 'string' && (IMPORT_SET_SCHEMES as readonly string[]).includes(value);
}

function assertImportSetScheme(value: unknown): asserts value is ImportSetScheme {
	if (!isImportSetScheme(value)) {
		throw new Error(`Unsupported import set scheme: ${String(value)}.`);
	}
}

function collectKnownIds(app: App): Set<string> {
	// Collision avoidance may stay cache-only: a cold-cache miss creates only a
	// negligibly unlikely random-id collision risk and cannot change set selection.
	const ids = new Set<string>();
	for (const file of app.vault.getMarkdownFiles()) {
		const fm = app.metadataCache.getFileCache(file)?.frontmatter;
		const provenance = fm && typeof fm === 'object'
			? (fm as Record<string, unknown>)._crosswalker
			: undefined;
		const raw = provenance && typeof provenance === 'object'
			? (provenance as Record<string, unknown>).import_set
			: undefined;
		const id = raw && typeof raw === 'object'
			? readString((raw as Record<string, unknown>).id)
			: null;
		if (id && IMPORT_SET_ID_PATTERN.test(id)) ids.add(id);
	}
	return ids;
}

function isWithinDestination(path: string, basePath?: string): boolean {
	if (basePath === undefined) return true;
	const destination = normalizePath(basePath).replace(/\/+$/, '');
	if (!destination) return true;
	return path.startsWith(`${destination}/`);
}

function assertImportSetId(id: string): void {
	if (!IMPORT_SET_ID_PATTERN.test(id)) {
		throw new Error(`Invalid import set id "${id}": expected iset- followed by 6 lowercase letters or digits.`);
	}
}

function readString(value: unknown): string | null {
	if (typeof value !== 'string') return null;
	const trimmed = value.trim();
	return trimmed.length > 0 ? trimmed : null;
}

/** The ontology half of a curie (`nist-mini:AC-1` -> `nist-mini`), or null. */
function curiePrefix(curie: string | null): string | null {
	if (!curie) return null;
	const colon = curie.indexOf(':');
	if (colon <= 0) return null;
	return curie.slice(0, colon);
}

/** Distinct non-null values in a stable order, so two runs compare equal. */
function distinctSorted(values: readonly (string | null)[]): string[] {
	return [...new Set(values.filter((value): value is string => value !== null))].sort();
}

/**
 * The destination every member of a set agrees on, or null when they disagree
 * or none recorded one. Disagreement is not an error: a half-migrated set is a
 * real state, and the answer there is to fall back to what the paths show.
 */
function recordedDestination(group: readonly ImportSetObservation[]): string | null {
	const stamped = new Set(group.map((entry) => entry.destination).filter((d): d is string => d !== null));
	if (stamped.size !== 1) return null;
	return normalizeFolder([...stamped][0]);
}

/**
 * The ontology every member of a set agrees on, or null when they disagree or
 * none recorded one (AM-6). Disagreement reads as no pin at all: a set holding
 * two answers has no single fact to carry forward, and picking one would be a
 * guess about which half of the set is authoritative.
 */
function agreedOntology(group: readonly ImportSetObservation[]): string | null {
	const stamped = new Set(group.map((entry) => entry.ontology).filter((value): value is string => value !== null));
	return stamped.size === 1 ? [...stamped][0] : null;
}

/**
 * Where a set actually lives. Prefers the recorded destination, but only while
 * the set's own notes still corroborate it: a recorded folder goes stale the
 * moment a user renames it in the file explorer, and writing to a folder that no
 * longer exists is how a refresh silently forks an import.
 */
function resolveSetRoot(recorded: string | null, paths: readonly string[]): string | null {
	if (recorded && paths.every((path) => path.startsWith(`${recorded}/`))) return recorded;
	return recoverImportSetRoot(paths);
}

/**
 * Recover a set's root from the notes it owns: the deepest folder every one of
 * them sits under.
 *
 * Compared SEGMENT-WISE on purpose. A common string prefix would happily merge
 * `Frameworks/NIST-mini` with `Frameworks/NIST-minimal` into
 * `Frameworks/NIST-min`, a folder neither set lives in.
 *
 * Fails closed: an empty result or the vault root returns null rather than a
 * destination. One note dragged out of the import root collapses the prefix, and
 * refusing to answer is right there. Callers should say WHICH note broke the
 * prefix rather than silently reverting to a derived default.
 */
export function recoverImportSetRoot(paths: readonly string[]): string | null {
	if (paths.length === 0) return null;
	let common: string[] | null = null;
	for (const path of paths) {
		const segments = path.split('/').slice(0, -1).filter(Boolean);
		if (common === null) {
			common = segments;
			continue;
		}
		let i = 0;
		while (i < common.length && i < segments.length && common[i] === segments[i]) i++;
		common = common.slice(0, i);
		if (common.length === 0) return null;
	}
	if (!common || common.length === 0) return null;
	return common.join('/');
}

/** Trim slashes so a recorded destination compares equal to a vault path prefix. */
function normalizeFolder(value: string): string {
	return value.trim().replace(/^\/+|\/+$/g, '');
}
