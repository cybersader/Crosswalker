/**
 * hash.ts — canonical serialization + sha256 for provenance hashing.
 *
 * Provides the two hash-computation primitives the `_crosswalker` provenance
 * block's `concept_cid` and `recipe.hash` slots need (spec/tier1.schema.json
 * `$defs/provenance_block` + `$defs/sha256_cid`). Per the Ch 43 deliverable
 * (`.workspace/2026-07-11-challenge-43-version-migration-deliverable.md` §2 /
 * §0-B): the schema anticipated both slots but nothing computed them —
 * `provenance.ts` only passed them through. This module is what computes them.
 *
 * No new dependency. Node's `crypto` module is unavailable on mobile Obsidian
 * (Capacitor WebView has no Node runtime; esbuild's `external` list — see
 * esbuild.config.mjs — marks Node builtins external, so a `require('crypto')`
 * would survive into the bundle and fail there), and the Web Crypto
 * `subtle.digest` API is async-only, which doesn't fit render()'s pure /
 * synchronous contract. sha256 is implemented in-repo below (standard FIPS
 * 180-4 algorithm, ~90 lines, unit-tested against the official test vectors
 * in tests/generation-hash.test.ts).
 */

// ---------------------------------------------------------------------------
// Canonical serialization
// ---------------------------------------------------------------------------

/**
 * Deterministic JSON-shaped serialization: object keys are sorted
 * recursively so the same logical value always produces the same string
 * regardless of construction/insertion order. Arrays keep their order
 * (order is semantic — e.g. `target.layout` levels are ordered). Object keys
 * whose value is `undefined` are omitted (mirrors `JSON.stringify`'s own
 * behavior), so a key merely being absent vs. explicitly `undefined` hashes
 * identically. `undefined`/`NaN`/`Infinity` inside arrays serialize as `null`
 * (mirrors `JSON.stringify`'s array behavior) rather than throwing.
 */
export function canonicalStringify(value: unknown): string {
	return stringifyCanonical(value);
}

function stringifyCanonical(value: unknown): string {
	if (value === undefined || value === null) return 'null';
	const t = typeof value;
	if (t === 'string') return JSON.stringify(value);
	if (t === 'number') return Number.isFinite(value as number) ? JSON.stringify(value) : 'null';
	if (t === 'boolean') return JSON.stringify(value);
	if (Array.isArray(value)) {
		return `[${value.map((v) => stringifyCanonical(v)).join(',')}]`;
	}
	if (t === 'object') {
		const obj = value as Record<string, unknown>;
		const keys = Object.keys(obj)
			.filter((k) => obj[k] !== undefined)
			.sort();
		return `{${keys.map((k) => `${JSON.stringify(k)}:${stringifyCanonical(obj[k])}`).join(',')}}`;
	}
	// function/symbol/bigint shouldn't appear in recipe or source-row data;
	// stringify defensively rather than throw.
	return JSON.stringify(String(value));
}

// ---------------------------------------------------------------------------
// sha256 (pure JS, no dependencies)
// ---------------------------------------------------------------------------

// prettier-ignore
const K = new Uint32Array([
	0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
	0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
	0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
	0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
	0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
	0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
	0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
	0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

const H_INIT = new Uint32Array([
	0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
	0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
]);

function rightRotate(x: number, n: number): number {
	return ((x >>> n) | (x << (32 - n))) >>> 0;
}

/**
 * Manual UTF-8 encoder — avoids depending on a global `TextEncoder`. Present
 * in every runtime this plugin actually ships to (Electron desktop, mobile
 * Capacitor WebView) but NOT reliably present in every test environment
 * (jsdom, depending on version), and a hash function that only works in some
 * test environments is worse than a dozen extra lines here.
 */
function utf8Encode(str: string): Uint8Array {
	const bytes: number[] = [];
	for (let i = 0; i < str.length; i++) {
		const codePoint = str.codePointAt(i) as number;
		if (codePoint > 0xffff) i++; // consumed a surrogate pair
		if (codePoint < 0x80) {
			bytes.push(codePoint);
		} else if (codePoint < 0x800) {
			bytes.push(0xc0 | (codePoint >> 6), 0x80 | (codePoint & 0x3f));
		} else if (codePoint < 0x10000) {
			bytes.push(0xe0 | (codePoint >> 12), 0x80 | ((codePoint >> 6) & 0x3f), 0x80 | (codePoint & 0x3f));
		} else {
			bytes.push(
				0xf0 | (codePoint >> 18),
				0x80 | ((codePoint >> 12) & 0x3f),
				0x80 | ((codePoint >> 6) & 0x3f),
				0x80 | (codePoint & 0x3f),
			);
		}
	}
	return new Uint8Array(bytes);
}

/**
 * sha256 over the UTF-8 bytes of `input`. Returns lowercase 64-char hex.
 * Pure, synchronous, deterministic. Standard FIPS 180-4 SHA-256.
 */
export function sha256Hex(input: string): string {
	const msg = utf8Encode(input);
	const bitLen = msg.length * 8;

	// Padding: 0x80 byte, then zeros, then the 64-bit big-endian bit length,
	// bringing the total length to a multiple of 64 bytes.
	const withMarker = msg.length + 1;
	const totalLen = ((withMarker + 8 + 63) & ~63) >>> 0;
	const buf = new Uint8Array(totalLen);
	buf.set(msg, 0);
	buf[msg.length] = 0x80;
	const view = new DataView(buf.buffer);
	// bitLen fits safely in a JS number (< 2^53) for any input this plugin
	// will ever hash (recipe/row-scale data, not multi-petabyte streams).
	const hi = Math.floor(bitLen / 0x100000000);
	const lo = bitLen >>> 0;
	view.setUint32(totalLen - 8, hi, false);
	view.setUint32(totalLen - 4, lo, false);

	let [h0, h1, h2, h3, h4, h5, h6, h7] = H_INIT;

	const w = new Uint32Array(64);
	for (let chunkStart = 0; chunkStart < totalLen; chunkStart += 64) {
		for (let i = 0; i < 16; i++) {
			w[i] = view.getUint32(chunkStart + i * 4, false);
		}
		for (let i = 16; i < 64; i++) {
			const s0 = rightRotate(w[i - 15], 7) ^ rightRotate(w[i - 15], 18) ^ (w[i - 15] >>> 3);
			const s1 = rightRotate(w[i - 2], 17) ^ rightRotate(w[i - 2], 19) ^ (w[i - 2] >>> 10);
			w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0;
		}

		let a = h0, b = h1, c = h2, d = h3, e = h4, f = h5, g = h6, h = h7;

		for (let i = 0; i < 64; i++) {
			const S1 = rightRotate(e, 6) ^ rightRotate(e, 11) ^ rightRotate(e, 25);
			const ch = (e & f) ^ (~e & g);
			const temp1 = (h + S1 + ch + K[i] + w[i]) >>> 0;
			const S0 = rightRotate(a, 2) ^ rightRotate(a, 13) ^ rightRotate(a, 22);
			const maj = (a & b) ^ (a & c) ^ (b & c);
			const temp2 = (S0 + maj) >>> 0;

			h = g;
			g = f;
			f = e;
			e = (d + temp1) >>> 0;
			d = c;
			c = b;
			b = a;
			a = (temp1 + temp2) >>> 0;
		}

		h0 = (h0 + a) >>> 0;
		h1 = (h1 + b) >>> 0;
		h2 = (h2 + c) >>> 0;
		h3 = (h3 + d) >>> 0;
		h4 = (h4 + e) >>> 0;
		h5 = (h5 + f) >>> 0;
		h6 = (h6 + g) >>> 0;
		h7 = (h7 + h) >>> 0;
	}

	return [h0, h1, h2, h3, h4, h5, h6, h7].map((x) => x.toString(16).padStart(8, '0')).join('');
}

// ---------------------------------------------------------------------------
// Provenance hash helpers
// ---------------------------------------------------------------------------

/** Wraps a hex digest in the `sha256-{hex}` format spec/tier1.schema.json's `sha256_cid` $def requires. */
export function toSha256Cid(hex: string): string {
	return `sha256-${hex}`;
}

/**
 * Identity of a single concept for `concept_cid` hashing purposes.
 *
 * `curie` + `scope` are exactly the two inputs `render()` itself receives
 * (`ConceptIdentity` in src/render/types.ts) — i.e. this is the PRE-render
 * concept identity, captured before any recipe/template touches it.
 */
export interface ConceptIdentityRecord {
	curie: string;
	/** The source row's own column values, unmodified by any recipe/template. */
	scope: Record<string, unknown>;
}

/**
 * Compute `_crosswalker.concept_cid`.
 *
 * LOAD-BEARING FIELD-SET DEFINITION — this is what "the same concept" means
 * across re-imports, recipe edits, and vault reorganizations for the future
 * v0.2 semantic-diff loop (Ch 43 deliverable §2's two-axes table). Per
 * spec/tier1.schema.json's `sha256_cid` $def description, the cid must be
 * "stable across vault layouts because the recipe's render() output is NOT
 * included" — so this hashes ONLY `{ curie, scope }`, i.e. the row's own
 * identity and attribute values as they existed BEFORE render() ran. It
 * never touches `Address` (render()'s output: path, wikilinkTarget, tags,
 * aliases, frontmatter) — path/folder placement is exactly what must be
 * excluded for the cid to stay stable when only placement changes.
 *
 * Consequence (intentional, matches the schema's own `concept_cid` property
 * description "Same across recipes that produce different vault layouts
 * from identical source data"): two different recipes rendering the same
 * source row to two different vault layouts produce the SAME concept_cid.
 * Only a change to the row's own curie or attribute values changes it.
 */
/**
 * Select the source attributes that participate in a note identity.
 *
 * Crosswalk-edge identity includes the normalized mapping provenance fields
 * used by its assertion identity. Concept and junction identities retain the
 * exact source row they used before P3; an importer must not widen their hash
 * scope merely because it added render-only defaults.
 */
export function identityScopeForNoteKind(
	kind: unknown,
	sourceScope: Record<string, unknown>,
	normalizedRenderScope: Record<string, unknown>,
): Record<string, unknown> {
	return kind === 'crosswalk-edge' ? normalizedRenderScope : sourceScope;
}

export function computeConceptCid(record: ConceptIdentityRecord): string {
	const canonical = canonicalStringify({ curie: record.curie, scope: record.scope });
	return toSha256Cid(sha256Hex(canonical));
}

// ---------------------------------------------------------------------------
// Review normalization + `review_cid` (Ch 43 re-attestation, 2026-08-28)
// ---------------------------------------------------------------------------

/**
 * Fold the COSMETIC shape of one string value, leaving every word intact.
 *
 * This is the whole content-drift feature in one function: it decides which
 * upstream edits are worth a human re-review and which are typography churn.
 * It is deliberately a SECOND, tolerant hash rather than a change to
 * `computeConceptCid` (Ch 43 contract §3.1, fork F1) — `concept_cid` is an
 * IDENTITY hash whose published contract is byte-exactness across layouts
 * (spec/tier1.schema.json `sha256_cid`), and it is the load-bearing input to
 * the two-axes drift analysis. Redefining it would make every note in every
 * existing vault emit a changed value on its next re-import for no gain — the
 * identical hazard `recipeHashCanonicalInput` already refuses below.
 *
 * The fourteen steps run in EXACTLY this order and are pure string operations
 * over a fixed regex subset: no locale, no Unicode tables beyond NFC, no
 * library. That is the reproducibility bar — an external Python or Go producer
 * implements these fourteen steps and gets the same digest.
 *
 * Deliberately NOT done (contract §3.3):
 *   - ASCII punctuation is never DELETED, only folded in shape. Over-
 *     normalizing hides a material change and produces a green report over an
 *     invalidated claim. Under-normalizing costs one false flag and a five-
 *     second human re-review. Bias to under-normalize.
 *   - No case folding. A capitalization change in a control title can be a real
 *     edit, and `toLowerCase` is locale-sensitive (Turkish dotless i), which
 *     breaks the reimplement-and-agree requirement above.
 *   - No stemming, stop-word removal, or semantic similarity. Materiality is a
 *     human call and this rule must not pretend otherwise.
 */
export function normalizeReviewString(value: string): string {
	// 1. Unicode normalization — composed form, so a precomposed and a
	//    decomposed accent are the same content.
	let s = value.normalize('NFC');
	// 2. Citation markers: ATT&CK descriptions carry "(Citation: Author 2024)"
	//    inline, and reference churn is a pure-typography class there.
	s = s.replace(/\(Citation:[^)]*\)/g, '');
	// 3. Numeric footnote markers.
	s = s.replace(/\[\d+\]/g, '');
	// 4. Markdown link destinations: keep the text a reviewer read, drop the URL.
	//    Repeated until stable (bounded at 4) so a nested link collapses fully.
	for (let pass = 0; pass < 4; pass++) {
		const next = s.replace(/\[([^\][]*)\]\((?:[^()\s]*)(?:\s+"[^"]*")?\)/g, '$1');
		if (next === s) break;
		s = next;
	}
	// 5. Markdown autolinks.
	s = s.replace(/<https?:\/\/[^>\s]*>/g, '');
	// 6. HTML tags — the tag, never the text between tags.
	s = s.replace(/<\/?[A-Za-z][^>]*>/g, '');
	// 7. Quote folding: curly single/double quotes and the acute accent.
	s = s.replace(/[\u2018\u2019\u201A\u201B\u00B4]/g, "'");
	s = s.replace(/[\u201C\u201D\u201E\u201F]/g, '"');
	// 8. Dash folding: hyphen/figure/en/em/horizontal-bar/minus.
	s = s.replace(/[\u2010\u2011\u2012\u2013\u2014\u2015\u2212]/g, '-');
	// 9. Ellipsis folding.
	s = s.replace(/\u2026/g, '...');
	// 10. Zero-width and soft-hyphen removal.
	s = s.replace(/[\u200B\u200C\u200D\uFEFF\u00AD]/g, '');
	// 11. Space folding — every Unicode space becomes an ASCII space.
	s = s.replace(/[\u00A0\u2000-\u200A\u202F\u205F\u3000]/g, ' ');
	// 12. Line-ending folding.
	s = s.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
	// 13. Whitespace collapse — LAST, so markup removed above cannot leave a
	//     doubled space behind and change the digest for nothing.
	s = s.replace(/\s+/g, ' ');
	// 14. Trim.
	return s.trim();
}

/**
 * Apply `normalizeReviewString` to every string leaf of a value, recursively.
 *
 * OBJECT KEYS ARE NEVER NORMALIZED. A renamed column changes what the row
 * asserts and what templates address; that is a real change, not typography.
 * Non-string leaves (number, boolean, null) pass through untouched.
 *
 * A value that normalizes to the empty string KEEPS ITS KEY with value `""`.
 * `canonicalStringify` drops only `undefined`-valued keys, so emptying a column
 * stays detectable as a change while removing it stays detectable as a
 * different change.
 */
export function normalizeForReview(value: unknown): unknown {
	if (typeof value === 'string') return normalizeReviewString(value);
	if (Array.isArray(value)) return value.map((v) => normalizeForReview(v));
	if (value !== null && typeof value === 'object') {
		const out: Record<string, unknown> = {};
		for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
			out[k] = normalizeForReview(v);
		}
		return out;
	}
	return value;
}

/**
 * The exact string hashed into `review_cid`. Exported for tests so a failure
 * names the step that diverged rather than only a digest mismatch — the same
 * discipline `recipeHashCanonicalInput` established.
 */
export function reviewCidCanonicalInput(record: ConceptIdentityRecord): string {
	return canonicalStringify({
		curie: record.curie,
		scope: normalizeForReview(record.scope),
	});
}

/**
 * Compute `_crosswalker.review_cid` — the fingerprint an attestation records at
 * approval time and is later compared against.
 *
 * Same input record as `computeConceptCid` (the RAW pre-render source row), so
 * the two hashes describe the same content and differ only in tolerance. The
 * `curie` is inside the hash on purpose: the concept identity a reviewer read
 * is part of what they read, so a CURIE change is a content change.
 *
 * SCOPE IS THE WHOLE ROW (contract fork F4), not a description column. Which
 * fields a reviewer read is not knowable and is recipe-dependent; guessing it
 * silently exempts material changes. The named extension point is an optional
 * recipe-declared `review_scope` field list, additive, later.
 */
export function computeReviewCid(record: ConceptIdentityRecord): string {
	return toSha256Cid(sha256Hex(reviewCidCanonicalInput(record)));
}

/**
 * The recipe fields hashed into `_crosswalker.recipe.hash` — the "effective
 * recipe target": everything in `Recipe.target` that currently affects
 * render() output.
 */
export interface EffectiveRecipeTarget {
	layout: unknown;
	also_emit?: unknown;
	enrichment?: unknown;
	auto_heading?: unknown;
}

/**
 * The `recipe.source` fields hashed into `_crosswalker.recipe.hash` — the
 * source-shaping declarations (Ch 46 source contract §8).
 *
 * `recipe.source` as a whole is still excluded as informational; only the
 * declarations that change WHICH NOTES EXIST enter the hash. `ontology`,
 * `version` and `levels` stay out: renaming an ontology does not change what
 * the recipe produces.
 *
 * `joins` enters for the same reason: it changes what a row IS, and therefore
 * what the notes assert. `canonicalStringify` drops undefined-valued keys, so a
 * recipe declaring neither hashes byte-identically to its pre-1.9.0 self.
 */
export interface EffectiveRecipeSource {
	where?: unknown;
	joins?: unknown;
}

/**
 * Compute `_crosswalker.recipe.hash`.
 *
 * LOAD-BEARING FIELD-SET DEFINITION — this is what "the same recipe" means
 * for distinguishing recipe-drift from source-drift (Ch 43 deliverable §2's
 * two-axes table: unchanged concept_cid + changed recipe.hash = pure recipe
 * change, no semantic-diff risk; changed concept_cid + unchanged recipe.hash
 * = pure source-version change). Hashes exactly three fields of
 * `recipe.target`:
 *
 *   - `layout`     — folder/file/heading mechanisms + templates (what
 *                    produces the Address path)
 *   - `also_emit`  — tags/aliases/managed frontmatter/managed_links plus
 *                    canonical body declarations (what produces Address
 *                    metadata and rendered body regions)
 *   - `enrichment` — Pass 1.5 children-lists/facet-hubs/level-hubs config
 *                    (post-render batch shape)
 *   - `auto_heading` — the recipe's control over the note's automatic H1
 *                    (schema SchemaVer 1.8.0). It materially changes emitted
 *                    body text, so it belongs here.
 *
 * ...plus the source-shaping declarations of `recipe.source` (SchemaVer
 * 1.9.0, Ch 46 source contract §8):
 *
 *   - `source.where` — the row predicate. It changes WHICH NOTES EXIST, which
 *                    is exactly what this hash is supposed to track.
 *   - `source.joins` — keyed lookup enrichment. It changes what a row IS, so
 *                    a note's content and its concept_cid depend on it.
 *
 * Deliberately EXCLUDED:
 *   - `recipe.recipe` (the id/name) and the rest of `recipe.source`
 *     (`ontology`, `version`, `levels`) — informational, renaming a recipe or
 *     its ontology without touching what it produces doesn't change the hash.
 *   - `graph_edges` and `linkStyle` — both schema-reserved and unwired in
 *     v0.1 (render() never reads them; see src/render/index.ts's Recipe
 *     type comments). Add them here the moment either starts affecting
 *     render() output, so recipe.hash keeps meaning "hashes what actually
 *     gets produced."
 *   - Anything session-specific — a Recipe object has no wall-clock or
 *     run-specific fields to begin with.
 */
export function computeRecipeHash(target: EffectiveRecipeTarget, source?: EffectiveRecipeSource): string {
	return toSha256Cid(sha256Hex(recipeHashCanonicalInput(target, source)));
}

/**
 * The canonical string `computeRecipeHash` digests. Exported so the
 * byte-identical guarantee can be asserted on the STRING, not just on the
 * digest (acceptance case A2) — a test that only compares digests cannot tell
 * you why they diverged. The field set lives here, once.
 */
export function recipeHashCanonicalInput(target: EffectiveRecipeTarget, source?: EffectiveRecipeSource): string {
	return canonicalStringify({
		layout: target.layout,
		also_emit: target.also_emit ?? null,
		enrichment: target.enrichment ?? null,
		// Deliberately NOT `?? null` (unlike the two above). canonicalStringify
		// drops undefined-valued keys, so a recipe WITHOUT auto_heading hashes
		// byte-identically to its pre-1.8.0 self. Coercing absent to null would
		// inject "auto_heading":null into every canonical string, change every
		// already-written _crosswalker.recipe.hash, and make every existing
		// generated note look recipe-drifted on its next re-import.
		auto_heading: target.auto_heading,
		// Same rule, same reason (Ch 46 source contract §8). Source shaping
		// changes WHICH NOTES EXIST, so it must enter the hash — but a recipe
		// that declares none must hash byte-identically to its pre-1.9.0 self,
		// down to the canonical string. NEVER `?? null` here.
		// tests/source-hash-stability.test.ts pins all 13 shipped recipes.
		source_where: source?.where,
		source_joins: source?.joins,
	});
}
