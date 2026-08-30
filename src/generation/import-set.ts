/**
 * import-set.ts — durable ownership for one import's vault footprint.
 *
 * An import set is the collection of notes one import owns. Its id is minted,
 * never derived from a recipe, destination, or source: all three can change on
 * a legitimate refresh. Markdown provenance is the registry; discovery prefers
 * Obsidian's metadata cache and reads cache-cold destination frontmatter directly.
 */

import { App, normalizePath, parseYaml, TFile } from 'obsidian';

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
}

/** A destination contains several ownership sets and no caller selected one. */
export class MultipleImportSetsError extends Error {
	constructor(public readonly sets: DiscoveredImportSet[]) {
		super(`Destination contains multiple import sets: ${sets.map((set) => `${set.id} (${set.noteCount} notes)`).join(', ')}. Choose one or import as a new set.`);
		this.name = 'MultipleImportSetsError';
	}
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
 * Apply the shared selection rules used by both generation entry points.
 * Explicit ids may name an empty/wiped set. A caller that knows the fixed
 * scheme can carry it with the id; otherwise the backwards-compatible
 * endpoint-v1 default applies. Existing notes always remain authoritative.
 */
export async function resolveImportSet(
	app: App,
	basePath: string,
	option?: ImportSetOption,
): Promise<ImportSetReference> {
	// Where this run writes is stamped onto every note it writes. Recorded, not
	// inferred: without it a later refresh has no way to ask where its own set
	// already lives, and has to fall back to a derived default that may point
	// somewhere else entirely. Re-stamped on every run rather than only at mint,
	// so a set that legitimately moves records its new home instead of keeping a
	// stale one.
	const destination = normalizeFolder(basePath ?? '') || undefined;
	const stamp = (reference: ImportSetReference): ImportSetReference =>
		destination ? { ...reference, destination } : reference;

	if (option === 'new') {
		return stamp({ id: mintImportSetId(collectKnownIds(app)), scheme: CURRENT_IMPORT_SET_SCHEME });
	}

	if (option === 'new-set-qualified') {
		return stamp({ id: mintImportSetId(collectKnownIds(app)), scheme: 'set-qualified-v1' });
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
			return stamp({ id: existing.id, scheme: existing.scheme });
		}
		return stamp({ id: option.id, scheme: option.scheme ?? CURRENT_IMPORT_SET_SCHEME });
	}

	const destinationSets = await discoverImportSets(app, basePath);
	if (destinationSets.length === 1) {
		return stamp({ id: destinationSets[0].id, scheme: destinationSets[0].scheme });
	}
	if (destinationSets.length > 1) throw new MultipleImportSetsError(destinationSets);

	return stamp({ id: mintImportSetId(collectKnownIds(app)), scheme: CURRENT_IMPORT_SET_SCHEME });
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
		sets.push({
			id,
			scheme,
			noteCount: paths.length,
			paths,
			root: resolveSetRoot(recorded, paths),
			recipeIds: distinctSorted(group.map((entry) => entry.recipeId)),
			ontologyPrefixes: distinctSorted(group.map((entry) => entry.ontologyPrefix)),
			...(recorded ? { destination: recorded } : {}),
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
