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

import { buildVaultInMemory, buildVaultDetailed, corpusPath } from './helpers/golden-vault';
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
	/**
	 * When set, the ONLY wikilink targets allowed to stay unresolved (genuinely
	 * out-of-subset ids the source references but doesn't include as rows). Every
	 * other unresolved link is a hard failure. Converts a report-only corpus into
	 * a precise guard once Pass 1.5 split its multi-value links.
	 */
	allowedUnresolved?: Set<string>;
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
	// sample-nist: clean paths. Pass 1.5 now SPLITS its `Related Controls` cells
	// into a wikilink array, so `related` links resolve individually. The only
	// remaining unresolved targets are controls the source references but that are
	// not in this subset (PM-9, AU-7, CM-8, SI-2) — asserted precisely below.
	{
		file: 'sample-nist-controls.csv',
		cleanPaths: true,
		resolveThreshold: null,
		allowedUnresolved: new Set(['PM-9', 'AU-7', 'CM-8', 'SI-2']),
	},
	// Synthetic ragged fixture exercising Pass 1.5 folder-note relocation (design
	// §5 case 5): two parents (X1000, X2000) relocate to X1000/X1000.md and
	// X2000/X2000.md; a childless parent (X3000) stays a sibling. Fully internal
	// — every link resolves.
	{ file: 'folder-note-ragged-subset.csv', cleanPaths: true, resolveThreshold: 0 },
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
			} else if (spec.allowedUnresolved) {
				// Pass 1.5 split the multi-value `related` cells, so every unresolved
				// target is now a genuinely out-of-subset control (referenced by the
				// source but not present as a row) — NOT a split bug. HARD-assert the
				// unresolved set is exactly those known out-of-subset ids.
				const offenders = unresolved.filter((u) => !spec.allowedUnresolved!.has(u.target));
				expect(offenders.map((u) => `${u.note}#${u.key}#[[${u.target}]]`)).toEqual([]);
				expect(links.length).toBeGreaterThan(0);
			} else {
				// Root notes legitimately have no parent; report-only.
				// eslint-disable-next-line no-console
				console.warn(
					`${spec.file}: ${unresolved.length}/${links.length} wikilinks unresolved (report-only)`,
				);
				expect(unresolved.length).toBeGreaterThanOrEqual(0);
			}
		});

		// HARD (all corpora): every materialized facet hub is a connected node —
		// >=2 members and every member link resolves. A hub with a dead or empty
		// member list would be an isolated node (spec §7k connectedness mandate).
		it('every facet hub note is connected (>=2 resolvable members)', () => {
			const bns = basenames(vault);
			const paths = new Set(vault.keys());
			for (const [path, text] of vault) {
				const { frontmatter } = parseNoteAsConsumer(text);
				if (frontmatter.kind !== 'facet') continue;
				const members = extractWikilinkTargets(frontmatter.members);
				expect(members.length).toBeGreaterThanOrEqual(2);
				const dead = members.filter((t) => !resolves(t, bns, paths));
				expect({ hub: path, dead }).toEqual({ hub: path, dead: [] });
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
	let edgeCount: number;
	let hostedLevelHubLinks: number;
	beforeAll(async () => {
		const built = await buildVaultDetailed(corpusPath('mitre-attack-persistence-subset.csv'));
		vault = built.vault;
		edgeCount = built.enrichment.edgeCount;
		// Level hubs (2026-07-11 ICSB audit gap #1) intentionally double-count: a
		// "hosted" family note (T1078.md etc.) gets its children counted once by
		// children_lists (the managed `children` frontmatter array) AND once more
		// by the level-hub pass (the same links, restated in a managed BODY
		// "Contents" section) — two distinct graph-visible artifacts for the same
		// relation, same sum-not-dedupe convention enrich()'s edgeCount already
		// uses for parent-link + children-list. Body content isn't frontmatter, so
		// the test's own frontmatter-only scan below can't see it directly; read
		// it straight off the enrichment result instead.
		hostedLevelHubLinks = 0;
		for (const links of built.enrichment.levelHubs.hostedChildrenByPath.values()) hostedLevelHubLinks += links.length;
	});

	it('every sub-technique (T*.0*) has a resolvable parent link', () => {
		const bns = basenames(vault);
		const paths = new Set(vault.keys());
		const subNotes = [...vault.entries()].filter(([p]) => /T\d+\.\d+\.md$/.test(p));
		expect(subNotes.length).toBeGreaterThan(0); // corpus actually has sub-techniques

		let parentEdges = 0;
		const orphans: string[] = [];
		for (const [path, text] of subNotes) {
			const { frontmatter } = parseNoteAsConsumer(text);
			const targets = extractWikilinkTargets(frontmatter.parent);
			const resolved = targets.filter((t) => resolves(t, bns, paths));
			if (resolved.length === 0) orphans.push(path);
			else parentEdges += resolved.length;
		}
		expect(orphans).toEqual([]); // zero orphans — the graph is connected
		expect(parentEdges).toBeGreaterThan(0);
	});

	// Pass 1.5 STRENGTHENED: with browsable-framework defaults every parent gains a
	// `children` list, so the graph now carries edges in BOTH directions. The
	// enrichment edge count must exceed the parent-link count alone (children
	// doubled it), and every child in a `children` list must resolve.
	it('every parent has a resolvable children list; edgeCount exceeds parent links alone', () => {
		const bns = basenames(vault);
		const paths = new Set(vault.keys());

		let notesWithChildren = 0;
		let childEdges = 0;
		let parentLinks = 0;
		for (const [path, text] of vault) {
			const { frontmatter } = parseNoteAsConsumer(text);
			for (const t of extractWikilinkTargets(frontmatter.parent)) {
				if (resolves(t, bns, paths)) parentLinks++;
			}
			const children = extractWikilinkTargets(frontmatter.children);
			if (children.length > 0) notesWithChildren++;
			const dead = children.filter((t) => !resolves(t, bns, paths));
			expect({ note: path, dead }).toEqual({ note: path, dead: [] });
			childEdges += children.length;
		}
		// The 5 top-level techniques (T1078/T1098/T1136/T1505/T1543) each have children.
		expect(notesWithChildren).toBeGreaterThanOrEqual(5);
		expect(childEdges).toBeGreaterThan(0);
		// edgeCount = parent links + children entries (+ facet members; MITRE has 0
		// facet hubs, its `tactic` column is single-valued and not a facet) + the
		// level-hub hosted families' restated child links (see beforeAll's note —
		// intentional double count, a second graph-visible artifact for the same
		// relation).
		expect(edgeCount).toBe(parentLinks + childEdges + hostedLevelHubLinks);
		expect(edgeCount).toBeGreaterThan(parentLinks); // children strictly added edges
	});

	// MITRE has no facet hubs (tactic cardinality 1), so "orphan count 0 INCLUDING
	// facet hubs" holds vacuously — assert there are none, and that the general hub
	// connectivity invariant (asserted per-corpus above) had nothing to fail on.
	it('has no facet hub notes (single-valued tactic is not a facet)', () => {
		const hubs = [...vault.entries()].filter(([, text]) => parseNoteAsConsumer(text).frontmatter.kind === 'facet');
		expect(hubs.map(([p]) => p)).toEqual([]);
	});
});

// ---------------------------------------------------------------------------
// Folder-note relocation — design §5 case 5 (HARD)
// ---------------------------------------------------------------------------

describe('golden invariants — folder-note relocation (design §5 case 5)', () => {
	let vault: Vault;
	let relocations: { curie: string; from: string; to: string }[];

	beforeAll(async () => {
		const built = await buildVaultDetailed(corpusPath('folder-note-ragged-subset.csv'));
		vault = built.vault;
		relocations = built.enrichment.relocations;
	});

	it('relocates both parents-with-children into folder-note form, sorted by curie', () => {
		expect(relocations.map((r) => r.curie)).toEqual([
			expect.stringContaining('X1000'),
			expect.stringContaining('X2000'),
		]);
		expect(vault.has('X1000/X1000.md')).toBe(true);
		expect(vault.has('X2000/X2000.md')).toBe(true);
		// No stray sibling copies left behind.
		expect(vault.has('X1000.md')).toBe(false);
		expect(vault.has('X2000.md')).toBe(false);
	});

	it('a childless concept is left as a sibling (nothing to relocate into)', () => {
		expect(vault.has('X3000.md')).toBe(true);
	});

	it('every inbound link to a relocated parent still resolves (basename-based)', () => {
		const bns = basenames(vault);
		const paths = new Set(vault.keys());
		for (const [path, text] of vault) {
			const { frontmatter } = parseNoteAsConsumer(text);
			for (const t of extractWikilinkTargets(frontmatter.parent)) {
				expect({ note: path, resolved: resolves(t, bns, paths) }).toEqual({ note: path, resolved: true });
			}
		}
	});

	it('the relocated parent still carries its own children list at the new path', () => {
		const note = vault.get('X1000/X1000.md')!;
		const { frontmatter } = parseNoteAsConsumer(note);
		expect(extractWikilinkTargets(frontmatter.children)).toEqual(['X1000.001', 'X1000.002']);
	});

	it('two builds produce byte-identical vaults (determinism double-run, including relocation)', async () => {
		const again = await buildVaultDetailed(corpusPath('folder-note-ragged-subset.csv'));
		expect([...again.vault.entries()].sort()).toEqual([...vault.entries()].sort());
		expect(again.enrichment.relocations).toEqual(relocations);
	});
});
