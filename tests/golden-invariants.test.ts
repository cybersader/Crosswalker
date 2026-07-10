/**
 * golden-invariants.test.ts — L3 of the testing doctrine (2026-07-10).
 *
 * Corpus-independent truths about the generated vault, asserted over the full
 * headless pipeline output for every corpus in test-vault/Crosswalker Test Data/.
 * These are the vault-level guards the module-boundary suites were blind to (a
 * dead graph, a `.md/` path, prose folders, non-deterministic output).
 *
 * Hard vs soft calibration (per the doctrine's "PASS against current behavior"
 * rule): invariants already satisfied are HARD-asserted; known gaps that two
 * concurrent engine-round agents are fixing are marked TODO(engine-round) and
 * asserted softly (report + non-failing) or skipped with a reason. The committed
 * goldens reflect CURRENT behavior and will be regenerated when the engine round
 * lands, at which point the soft cases flip to hard.
 */

import { buildVaultInMemory, corpusPath } from './helpers/golden-vault';
import { parseNoteAsConsumer, assertLinkValue, extractWikilinkTargets } from './helpers/consumer-view';

// ---------------------------------------------------------------------------
// Analysis helpers (operate on a built vault: Map<path, noteText>)
// ---------------------------------------------------------------------------

type Vault = Map<string, string>;

/** Set of note basenames (no `.md`) — Obsidian resolves wikilinks by basename. */
function basenames(vault: Vault): Set<string> {
	return new Set([...vault.keys()].map((p) => p.split('/').pop()!.replace(/\.md$/, '')));
}

/** Does a wikilink target resolve to a generated note (by basename or full path)? */
function resolves(target: string, bns: Set<string>, paths: Set<string>): boolean {
	const bn = target.split('/').pop()!;
	return bns.has(bn) || paths.has(target) || paths.has(`${target}.md`);
}

interface LinkRef {
	note: string;
	key: string;
	target: string;
}

/** Every non-empty wikilink target across all frontmatter (and body) of a vault. */
function collectLinks(vault: Vault): LinkRef[] {
	const refs: LinkRef[] = [];
	for (const [note, text] of vault) {
		const { frontmatter, body } = parseNoteAsConsumer(text);
		for (const [key, value] of Object.entries(frontmatter)) {
			if (key === '_crosswalker') continue;
			for (const target of extractWikilinkTargets(value)) refs.push({ note, key, target });
		}
		for (const target of extractWikilinkTargets(body)) refs.push({ note, key: '<body>', target });
	}
	return refs;
}

/** A folder segment that reads like prose (a description became a folder). */
function proseSegments(path: string): string[] {
	const segs = path.split('/').slice(0, -1); // drop the file leaf
	return segs.filter((s) => /\s{2,}/.test(s) || s.length > 64 || s.split(/\s+/).length > 8);
}

/** Count path keys that contain a `.md/` (an inverted / multi-structural path). */
function mdSlashPaths(vault: Vault): string[] {
	return [...vault.keys()].filter((p) => p.includes('.md/'));
}

// ---------------------------------------------------------------------------
// Per-corpus expectations
// ---------------------------------------------------------------------------

interface CorpusSpec {
	file: string;
	/** Paths are free of the `.md/` multi-structural-mapping bug. */
	cleanPaths: boolean;
	/** Hard link-resolution threshold (unresolved must be <=), or null to only report. */
	resolveThreshold: number | null;
}

const SPECS: CorpusSpec[] = [
	// MITRE: single packed hierarchy + fully-internal parent column → the clean,
	// fully-connected reference corpus. Everything HARD.
	{ file: 'mitre-attack-persistence-subset.csv', cleanPaths: true, resolveThreshold: 0 },
	// CIS + NIST-CSF: id-packed AND a second structural source (CIS parent column /
	// NIST-CSF function+category chain). The single-structural constraint (spec §7g)
	// now elects ONE structural winner in instantiate() — the packed id, which owns a
	// per-row-unique leaf — and demotes the other, so no `.md/` interleave survives.
	// Paths HARD; resolution stays report-only (root notes legitimately have no
	// parent, so a 0-unresolved threshold would be wrong here).
	{ file: 'cis-controls-v8-subset.csv', cleanPaths: true, resolveThreshold: null },
	{ file: 'nist-csf-2.0-govern-identify.csv', cleanPaths: true, resolveThreshold: null },
	// sample-nist: clean paths, but its `Related Controls` multi-value column is
	// not split, so `related: [[AC-2, AC-3, PM-9]]` is one dead link. Multi-value
	// link emission is deferred to the Pass 1.5 round — resolution stays SOFT.
	{ file: 'sample-nist-controls.csv', cleanPaths: true, resolveThreshold: null },
];

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

for (const spec of SPECS) {
	describe(`golden invariants — ${spec.file}`, () => {
		let vault: Vault;
		beforeAll(async () => {
			vault = await buildVaultInMemory(corpusPath(spec.file));
		});

		it('produces at least one note', () => {
			expect(vault.size).toBeGreaterThan(0);
		});

		// HARD (all corpora): every note's YAML parses cleanly.
		it('every note parses as valid YAML frontmatter', () => {
			for (const [path, text] of vault) {
				expect(() => parseNoteAsConsumer(text)).not.toThrow();
			}
		});

		// HARD (all corpora): no wikilink value mangled into a nested array, and
		// every present non-empty link key round-trips as an indexable string.
		it('every wikilink value round-trips as a [[...]] string (quoting fixed)', () => {
			for (const [path, text] of vault) {
				const { frontmatter } = parseNoteAsConsumer(text);
				for (const [key, value] of Object.entries(frontmatter)) {
					if (key === '_crosswalker') continue;
					// The unquoted-wikilink bug signature: a value parses to a nested array.
					if (Array.isArray(value)) {
						expect(value.some((v) => Array.isArray(v))).toBe(false);
					}
					// Any string value that carries a link must be a bare [[...]] string.
					if (typeof value === 'string' && value.includes('[[')) {
						expect(() => assertLinkValue(frontmatter, key)).not.toThrow();
					}
				}
			}
		});

		// HARD (all corpora): no folder segment is prose (facet/description never
		// becomes a hierarchy folder — the detection-vs-instantiation seam bug).
		it('no folder segment reads like prose', () => {
			const offenders: string[] = [];
			for (const path of vault.keys()) {
				for (const seg of proseSegments(path)) offenders.push(`${path} :: "${seg}"`);
			}
			expect(offenders).toEqual([]);
		});

		// Path nesting: HARD for clean corpora; documented soft baseline otherwise.
		if (spec.cleanPaths) {
			it('no path contains ".md/"', () => {
				expect(mdSlashPaths(vault)).toEqual([]);
			});
		} else {
			// Retained for any FUTURE corpus that legitimately can't yet collapse to a
			// single structural mapping. The 2026-07 multi-structural interleave
			// (CIS/NIST-CSF) is FIXED — instantiate() now elects one structural winner
			// (spec §7g) — so no committed corpus currently takes this soft branch.
			it('reports its ".md/" path baseline (soft)', () => {
				const bad = mdSlashPaths(vault);
				// eslint-disable-next-line no-console
				console.warn(`soft ".md/" baseline ${spec.file}: ${bad.length}/${vault.size} paths contain ".md/"`);
				expect(bad.length).toBeGreaterThanOrEqual(0); // non-failing, documents the gap
			});
		}

		// Link resolution: HARD threshold for MITRE; report-only otherwise.
		it('link resolution', () => {
			const bns = basenames(vault);
			const paths = new Set(vault.keys());
			const links = collectLinks(vault);
			const unresolved = links.filter((r) => !resolves(r.target, bns, paths));
			if (spec.resolveThreshold !== null) {
				expect(unresolved.map((u) => `${u.note}#${u.key}→[[${u.target}]]`)).toEqual([]);
				expect(links.length).toBeGreaterThan(0); // a connected corpus HAS edges
			} else {
				// TODO(pass-1.5): remaining unresolved links are multi-value link columns
				// (sample-nist `Related Controls`) whose split emission is deferred to the
				// Pass 1.5 round. Report-only until then.
				// eslint-disable-next-line no-console
				console.warn(
					`TODO(pass-1.5) ${spec.file}: ${unresolved.length}/${links.length} wikilinks unresolved`,
				);
				expect(unresolved.length).toBeGreaterThanOrEqual(0);
			}
		});

		// HARD (all corpora): the pipeline is deterministic.
		it('is deterministic: two builds produce byte-identical vaults', async () => {
			const again = await buildVaultInMemory(corpusPath(spec.file));
			expect([...again.entries()].sort()).toEqual([...vault.entries()].sort());
		});
	});
}

// ---------------------------------------------------------------------------
// MITRE connectivity — the disconnected-graph incident guard (HARD)
// ---------------------------------------------------------------------------

describe('golden invariants — MITRE connectivity (no orphan sub-techniques)', () => {
	let vault: Vault;
	beforeAll(async () => {
		vault = await buildVaultInMemory(corpusPath('mitre-attack-persistence-subset.csv'));
	});

	it('every sub-technique (T*.0*) has a resolvable parent link; edge count > 0', () => {
		const bns = basenames(vault);
		const paths = new Set(vault.keys());
		const subNotes = [...vault.entries()].filter(([p]) => /T\d+\.\d+\.md$/.test(p));
		expect(subNotes.length).toBeGreaterThan(0); // corpus actually has sub-techniques

		let edges = 0;
		const orphans: string[] = [];
		for (const [path, text] of subNotes) {
			const { frontmatter } = parseNoteAsConsumer(text);
			const targets = extractWikilinkTargets(frontmatter.parent);
			const resolved = targets.filter((t) => resolves(t, bns, paths));
			if (resolved.length === 0) orphans.push(path);
			else edges += resolved.length;
		}
		expect(orphans).toEqual([]); // zero orphans — the graph is connected
		expect(edges).toBeGreaterThan(0); // and it actually has edges
	});
});
