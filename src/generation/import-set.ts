/**
 * import-set.ts — durable ownership for one import's vault footprint.
 *
 * An import set is the collection of notes one import owns. Its id is minted,
 * never derived from a recipe, destination, or source: all three can change on
 * a legitimate refresh. Markdown provenance is the registry; discovery reads
 * Obsidian's metadata cache and never creates a parallel registry file.
 */

import { App, normalizePath } from 'obsidian';

export const IMPORT_SET_ID_PATTERN = /^iset-[a-z0-9]{6}$/;
export const IMPORT_SET_SCHEMES = ['endpoint-v1', 'set-qualified-v1'] as const;
export type ImportSetScheme = typeof IMPORT_SET_SCHEMES[number];

/** Default for callers that do not deliberately choose a scheme. Kept at
 * endpoint-v1 so every pre-existing import path preserves its identities. */
export const CURRENT_IMPORT_SET_SCHEME: ImportSetScheme = 'endpoint-v1';

export interface ImportSetReference {
	id: string;
	scheme: ImportSetScheme;
}

export type ImportSetOption =
	| { id: string; scheme?: ImportSetScheme }
	| 'new'
	| 'new-set-qualified';

export interface DiscoveredImportSet extends ImportSetReference {
	noteCount: number;
	paths: string[];
}

interface ImportSetObservation {
	id: string;
	scheme: string | null;
	path: string;
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
export function discoverImportSets(app: App, basePath?: string): DiscoveredImportSet[] {
	return buildDiscoveredSets(collectObservations(app, basePath));
}

/**
 * Apply the shared selection rules used by both generation entry points.
 * Explicit ids may name an empty/wiped set. A caller that knows the fixed
 * scheme can carry it with the id; otherwise the backwards-compatible
 * endpoint-v1 default applies. Existing notes always remain authoritative.
 */
export function resolveImportSet(
	app: App,
	basePath: string,
	option?: ImportSetOption,
): ImportSetReference {
	if (option === 'new') {
		return { id: mintImportSetId(collectKnownIds(app)), scheme: CURRENT_IMPORT_SET_SCHEME };
	}

	if (option === 'new-set-qualified') {
		return { id: mintImportSetId(collectKnownIds(app)), scheme: 'set-qualified-v1' };
	}

	if (option && typeof option === 'object') {
		assertImportSetId(option.id);
		if (option.scheme !== undefined) assertImportSetScheme(option.scheme);
		const observations = collectObservations(app, undefined, option.id);
		const existing = buildDiscoveredSets(observations)[0];
		if (existing) {
			if (option.scheme !== undefined && option.scheme !== existing.scheme) {
				throw new ImportSetProvenanceError(
					`Import set ${option.id} is fixed to ${existing.scheme}; refresh cannot change it to ${option.scheme}.`,
					existing.paths,
				);
			}
			return { id: existing.id, scheme: existing.scheme };
		}
		return { id: option.id, scheme: option.scheme ?? CURRENT_IMPORT_SET_SCHEME };
	}

	const destinationSets = discoverImportSets(app, basePath);
	if (destinationSets.length === 1) {
		return { id: destinationSets[0].id, scheme: destinationSets[0].scheme };
	}
	if (destinationSets.length > 1) throw new MultipleImportSetsError(destinationSets);

	return { id: mintImportSetId(collectKnownIds(app)), scheme: CURRENT_IMPORT_SET_SCHEME };
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

function collectObservations(app: App, basePath?: string, onlyId?: string): ImportSetObservation[] {
	const observations: ImportSetObservation[] = [];
	for (const file of app.vault.getMarkdownFiles()) {
		if (!isWithinDestination(file.path, basePath)) continue;
		const fm = app.metadataCache.getFileCache(file)?.frontmatter;
		if (!fm || typeof fm !== 'object') continue;
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
		observations.push({ id, scheme, path: file.path });
	}
	return observations;
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
		sets.push({ id, scheme, noteCount: paths.length, paths });
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
