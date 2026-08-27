/**
 * managed-body.ts — the managed body region envelope.
 *
 * Ch 45 §4.2 adopted the behaviour ("Replace preserves user-authored note
 * bodies"); the 2026-08-27 contract fixes the format. This module is the whole
 * format: the marker grammar, the fence-aware scan, the corruption matrix, the
 * in-place region replace, and the two legacy-adoption rules.
 *
 * THE STAKE. Before this module, Replace rebuilt the whole note body, so an
 * implementation note or an evidence pointer someone typed into a generated
 * control note was destroyed with no warning and no undo. Every ruling here
 * resolves toward "the file is not modified" whenever the engine cannot prove
 * what it would be doing.
 *
 * PURITY. No Obsidian imports, no vault, no clock. It must not import from
 * `render/`, and `render()` must not import from it: markers are a WRITE-LAYER
 * ENVELOPE, not part of the rendered body (commitment 5 — the runtime-agnostic
 * recipe schema; the exporters stay free to decide whether a target format
 * carries markers at all).
 *
 * Marker grammar, closed for v1:
 *
 *   BEGIN ::= "<!-- crosswalker:" NAME ":start" [ SP "v=" 1*DIGIT ] SP "-->"
 *   END   ::= "<!-- crosswalker:" NAME ":end" SP "-->"
 *   NAME  ::= 1*( %x61-7A / "-" )
 *   SP    ::= exactly one U+0020
 *
 * `v=` absent means v=1, which makes the already-shipped
 * `<!-- crosswalker:children:start -->` a valid v1 marker with zero migration.
 */

/** The version this build writes. */
export const REGION_FORMAT_VERSION = 1;

/** The highest version this build can read. Above it, the note is a conflict. */
export const MAX_SUPPORTED_REGION_VERSION = 1;

/** Region names this build knows. Unknown-but-balanced names are preserved opaquely (§2.4). */
export type RegionName = 'body' | 'children';

export const KNOWN_REGION_NAMES: readonly RegionName[] = ['body', 'children'];

/**
 * Every way a note's markers can be un-understandable. Each one means exactly
 * one thing at the call site: do not modify this file.
 */
export type CorruptionCode =
	| 'unclosed-region'
	| 'orphan-end-marker'
	| 'inverted-region'
	| 'duplicate-region'
	| 'duplicate-end-marker'
	| 'interleaved-regions'
	| 'nested-region'
	| 'malformed-marker'
	| 'future-region-version';

export interface RegionSpan {
	name: string;
	version: number;
	/** Offset of the first character of the start-marker line. */
	outerStart: number;
	/** Offset just past the last character of the end-marker line (its newline excluded). */
	outerEnd: number;
	/** Offset of the first character after the start marker's newline. */
	contentStart: number;
	/** Offset of the first character of the end-marker line. */
	contentEnd: number;
	/** 0-based line index of the start marker. */
	startLine: number;
	/** 0-based line index of the end marker. */
	endLine: number;
}

export type ScanResult =
	| { ok: true; spans: RegionSpan[] }
	| { ok: false; code: CorruptionCode; detail: string; line: number };

const MARKER_PREFIX = '<!-- crosswalker:';
const BEGIN_RE = /^<!-- crosswalker:([a-z-]+):start(?: v=(\d+))? -->$/;
const END_RE = /^<!-- crosswalker:([a-z-]+):end -->$/;

// ---------------------------------------------------------------------------
// Emission
// ---------------------------------------------------------------------------

/**
 * Wrap managed content in its region markers. Returns the block WITHOUT a
 * trailing newline, so callers control the separator; `wrapManagedBody` below
 * is the body-shaped convenience.
 *
 * `content` is trimmed of trailing newlines only — its interior bytes,
 * including trailing spaces (Markdown hard line breaks), are untouched.
 * An empty region is legitimate output (`auto_heading: false` with no body
 * projections) and is always emitted: a frontmatter-only note without a
 * boundary would be unadoptable forever.
 */
export function wrapRegion(name: string, content: string, version = REGION_FORMAT_VERSION): string {
	const start = `<!-- crosswalker:${name}:start v=${version} -->`;
	const end = `<!-- crosswalker:${name}:end -->`;
	const inner = content.replace(/\n+$/, '');
	return inner === '' ? `${start}\n${end}` : `${start}\n${inner}\n${end}`;
}

/**
 * The `body` region as a note body: the wrapped block plus the trailing newline
 * every generated body carries. Strip the two marker lines from the result and
 * it is byte-identical to today's `buildDefaultBody` / `composeDocumentBody`
 * output (contract fork 7), for every case except the empty body — where today
 * emits nothing at all and the boundary is worth two invisible comment lines.
 */
export function wrapManagedBody(content: string): string {
	return `${wrapRegion('body', content)}\n`;
}

// ---------------------------------------------------------------------------
// The scan
// ---------------------------------------------------------------------------

interface LineInfo {
	/** Raw text, newline excluded. */
	text: string;
	/** Offset of the first character. */
	start: number;
	/** Offset just past the last character (newline excluded). */
	end: number;
	/** Offset of the next line's first character (== body.length at EOF). */
	next: number;
	/** True when the line sits inside a fenced code block. */
	fenced: boolean;
}

/** Split a body into lines, preserving exact offsets and marking fenced lines. */
function scanLines(body: string): LineInfo[] {
	const lines: LineInfo[] = [];
	let offset = 0;
	// Fence state: the run character and its length, or null outside a fence.
	let fence: { char: string; len: number } | null = null;
	while (offset <= body.length) {
		const nl = body.indexOf('\n', offset);
		const end = nl === -1 ? body.length : nl;
		const text = body.slice(offset, end);
		const bare = text.replace(/\r$/, '');
		const fenceMatch = /^\s{0,3}(`{3,}|~{3,})(.*)$/.exec(bare);
		let fenced = fence !== null;
		if (fence === null) {
			// An opening fence line is itself "not fenced" — but nothing on it can
			// be a marker anyway (it starts with ` or ~).
			if (fenceMatch) fence = { char: fenceMatch[1][0], len: fenceMatch[1].length };
		} else if (fenceMatch && fenceMatch[1][0] === fence.char && fenceMatch[1].length >= fence.len && fenceMatch[2].trim() === '') {
			fence = null;
			fenced = true;
		}
		lines.push({ text, start: offset, end, next: nl === -1 ? body.length : nl + 1, fenced });
		if (nl === -1) break;
		offset = nl + 1;
	}
	return lines;
}

type Token =
	| { kind: 'begin'; name: string; version: number; line: number; index: number }
	| { kind: 'end'; name: string; line: number; index: number }
	| { kind: 'malformed'; line: number; index: number; text: string };

/**
 * A marker is recognised only when it is the ENTIRE content of its line with no
 * leading whitespace; trailing whitespace (a stray space, a CR from CRLF) is
 * tolerated and stripped. An indented `<!-- crosswalker:` line is prose, not a
 * marker and not corruption — it cannot be a boundary under the grammar, and
 * quoting one inside a list must not make a note unwritable.
 */
function tokenize(lines: LineInfo[]): Token[] {
	const tokens: Token[] = [];
	for (let i = 0; i < lines.length; i += 1) {
		const line = lines[i];
		if (line.fenced) continue;
		if (!line.text.startsWith(MARKER_PREFIX)) continue;
		const bare = line.text.replace(/[ \t\r]+$/, '');
		const begin = BEGIN_RE.exec(bare);
		if (begin) {
			const version = begin[2] === undefined ? 1 : Number(begin[2]);
			if (version < 1) {
				tokens.push({ kind: 'malformed', line: i, index: tokens.length, text: line.text });
				continue;
			}
			tokens.push({ kind: 'begin', name: begin[1], version, line: i, index: tokens.length });
			continue;
		}
		const end = END_RE.exec(bare);
		if (end) {
			tokens.push({ kind: 'end', name: end[1], line: i, index: tokens.length });
			continue;
		}
		tokens.push({ kind: 'malformed', line: i, index: tokens.length, text: line.text });
	}
	return tokens;
}

/** True when a marker-shaped line for `name`/`kind` exists inside a code fence. */
function hiddenInFence(lines: LineInfo[], name: string, kind: 'start' | 'end'): boolean {
	const needle = `<!-- crosswalker:${name}:${kind}`;
	return lines.some((l) => l.fenced && l.text.trimStart().startsWith(needle));
}

/**
 * Scan a note body (frontmatter already stripped) for managed regions.
 *
 * Returns either the ordered spans or ONE corruption verdict. There is no
 * partial success and no repair: "take the first matching end and rebuild" was
 * rejected because for both the duplicated-marker and the moved-marker case
 * there is a plausible reading under which the guess deletes user text.
 *
 * Fence-aware: a marker-shaped line inside a fenced code block is prose. A note
 * that documents Crosswalker is rare; a boundary landing inside a code fence is
 * catastrophic, and the check is a few lines.
 */
export function scanRegions(body: string): ScanResult {
	const lines = scanLines(body);
	const tokens = tokenize(lines);

	const spans: RegionSpan[] = [];
	const seenStarts = new Set<string>();
	const seenEnds = new Set<string>();
	let open: { token: Extract<Token, { kind: 'begin' }> } | null = null;

	const fail = (code: CorruptionCode, detail: string, line: number): ScanResult => ({ ok: false, code, detail, line });

	/** Index into `tokens` of the next `end` marker named `name`, at or after `from`. */
	const nextEndIndex = (name: string, from: number): number =>
		tokens.findIndex((t, i) => i >= from && t.kind === 'end' && t.name === name);

	for (let i = 0; i < tokens.length; i += 1) {
		const token = tokens[i];

		if (token.kind === 'malformed') {
			return fail(
				'malformed-marker',
				`"${token.text.trim()}" looks like a Crosswalker region marker but does not match the marker format.`,
				token.line,
			);
		}

		if (token.kind === 'begin') {
			if (token.version > MAX_SUPPORTED_REGION_VERSION) {
				return fail(
					'future-region-version',
					`the "${token.name}" region declares v=${token.version}; this version of Crosswalker reads up to v=${MAX_SUPPORTED_REGION_VERSION}. The note was written by a newer Crosswalker.`,
					token.line,
				);
			}
			if (seenStarts.has(token.name)) {
				return fail('duplicate-region', `a second "${token.name}" region start marker.`, token.line);
			}
			if (open) {
				// Nesting is forbidden either way; the two codes separate the two
				// readings so the diagnostic names what the file actually looks like.
				const openEnd = nextEndIndex(open.token.name, i);
				const newEnd = nextEndIndex(token.name, i);
				if (openEnd !== -1 && newEnd !== -1 && openEnd < newEnd) {
					return fail(
						'interleaved-regions',
						`the "${token.name}" region starts inside "${open.token.name}" and closes after it.`,
						token.line,
					);
				}
				return fail(
					'nested-region',
					`the "${token.name}" region starts inside the "${open.token.name}" region. Regions are siblings, never nested.`,
					token.line,
				);
			}
			seenStarts.add(token.name);
			open = { token };
			continue;
		}

		// token.kind === 'end'
		if (open === null) {
			if (seenEnds.has(token.name)) {
				return fail('duplicate-end-marker', `a second "${token.name}" region end marker.`, token.line);
			}
			if (seenStarts.has(token.name)) {
				return fail('duplicate-end-marker', `an extra "${token.name}" region end marker after that region already closed.`, token.line);
			}
			if (tokens.some((t, j) => j > i && t.kind === 'begin' && t.name === token.name)) {
				return fail('inverted-region', `the "${token.name}" region end marker appears before its start marker.`, token.line);
			}
			const detail = hiddenInFence(lines, token.name, 'start')
				? `an "${token.name}" region end marker with no start marker; the start marker for "${token.name}" appears inside a fenced code block.`
				: `an "${token.name}" region end marker with no start marker.`;
			return fail('orphan-end-marker', detail, token.line);
		}
		if (open.token.name !== token.name) {
			// A foreign end marker between another region's start and end. True
			// interleaving (`A:start B:start A:end B:end`) is already caught at the
			// inner start marker, so reaching here means a stray marker inside a region.
			return fail(
				'nested-region',
				`an "${token.name}" region end marker appears inside the "${open.token.name}" region.`,
				token.line,
			);
		}
		const startLine = lines[open.token.line];
		const endLine = lines[token.line];
		spans.push({
			name: open.token.name,
			version: open.token.version,
			outerStart: startLine.start,
			outerEnd: endLine.end,
			contentStart: startLine.next,
			contentEnd: endLine.start,
			startLine: open.token.line,
			endLine: token.line,
		});
		seenEnds.add(token.name);
		open = null;
	}

	if (open) {
		const detail = hiddenInFence(lines, open.token.name, 'end')
			? `the "${open.token.name}" region is never closed; the end marker for "${open.token.name}" appears inside a fenced code block.`
			: `the "${open.token.name}" region is never closed.`;
		return fail('unclosed-region', detail, open.token.line);
	}

	return { ok: true, spans };
}

/** The span for `name`, or undefined. */
export function findSpan(spans: readonly RegionSpan[], name: string): RegionSpan | undefined {
	return spans.find((s) => s.name === name);
}

// ---------------------------------------------------------------------------
// In-place replacement
// ---------------------------------------------------------------------------

/**
 * Replace one region's block in place, byte-preserving everything outside it.
 *
 * `freshRegionText` is a wrapped block WITHOUT a trailing newline (i.e.
 * `wrapRegion(...)`). Bytes outside the region are not normalised at all — not
 * line endings, not trailing whitespace, not blank-line runs. Normalising a
 * user's bytes IS a modification, and the acceptance case is byte-for-byte
 * survival.
 *
 * A region that does not yet exist is appended after the last recognised
 * region, or at end of body when there is none. Regions are never reordered:
 * reordering moves the user's prose relative to them.
 */
export function replaceRegion(
	body: string,
	spans: readonly RegionSpan[],
	name: string,
	freshRegionText: string,
): string {
	const span = findSpan(spans, name);
	if (span) {
		return body.slice(0, span.outerStart) + freshRegionText + body.slice(span.outerEnd);
	}
	if (spans.length > 0) {
		const last = spans[spans.length - 1];
		return `${body.slice(0, last.outerEnd)}\n\n${freshRegionText}${body.slice(last.outerEnd)}`;
	}
	const trimmed = body.replace(/\n+$/, '');
	if (trimmed === '') return `${freshRegionText}\n`;
	return `${trimmed}\n\n${freshRegionText}\n`;
}

// ---------------------------------------------------------------------------
// Legacy adoption
// ---------------------------------------------------------------------------

/**
 * Newline form and leading/trailing blank-line runs only.
 *
 * Trailing PER-LINE whitespace is deliberately NOT stripped: two trailing
 * spaces are a Markdown hard line break, so stripping them would let a note
 * whose content actually differs pass the equality test — and adoption rewrites
 * the file. A note differing only by a stray trailing space therefore fails to
 * adopt and is reported. That is the safe direction and it is intended.
 */
export function normalizeForComparison(s: string): string {
	return s.replace(/\r\n/g, '\n').replace(/\r/g, '\n').replace(/^\n+/, '').replace(/\n+$/, '');
}

export interface ExcludedBlock {
	kind: 'children-region' | 'waypoint';
	start: number;
	end: number;
	text: string;
}

const WAYPOINT_TRIGGER_RE = /^%%\s*Waypoint\s*%%$/i;
const WAYPOINT_BEGIN_RE = /^%%\s*Begin\s+Waypoint\s*%%$/i;
const WAYPOINT_END_RE = /^%%\s*End\s+Waypoint\s*%%$/i;

/**
 * Split a body into the part the adoption test compares and the recognised
 * third-party / other-region blocks it must ignore.
 *
 * A whole-body comparison would make adoption never fire for any vault that
 * used enrichment, because those bodies are `<fresh body>\n\n<children block>`
 * — the feature would ship dead. The exclusion list is CLOSED for v1; nothing
 * else may be stripped:
 *
 *   1. a well-formed `crosswalker:children` region (any recognised version)
 *   2. a Waypoint trigger or expanded block
 *
 * Returns `null` when the body's markers are corrupt (the caller conflicts).
 */
export function stripRecognisedBlocks(body: string): { remainder: string; excluded: ExcludedBlock[] } | null {
	const scan = scanRegions(body);
	if (!scan.ok) return null;
	const lines = scanLines(body);
	const excluded: ExcludedBlock[] = [];

	for (const span of scan.spans) {
		if (span.name !== 'children') continue;
		excluded.push({ kind: 'children-region', start: span.outerStart, end: span.outerEnd, text: body.slice(span.outerStart, span.outerEnd) });
	}

	for (let i = 0; i < lines.length; i += 1) {
		const line = lines[i];
		if (line.fenced) continue;
		if (excluded.some((b) => line.start >= b.start && line.start < b.end)) continue;
		const bare = line.text.replace(/[ \t\r]+$/, '');
		if (WAYPOINT_TRIGGER_RE.test(bare)) {
			excluded.push({ kind: 'waypoint', start: line.start, end: line.end, text: line.text });
			continue;
		}
		if (WAYPOINT_BEGIN_RE.test(bare)) {
			let close = -1;
			for (let j = i + 1; j < lines.length; j += 1) {
				if (!lines[j].fenced && WAYPOINT_END_RE.test(lines[j].text.replace(/[ \t\r]+$/, ''))) {
					close = j;
					break;
				}
			}
			// An unterminated Begin marker is Waypoint's business, not ours: leave it
			// as ordinary prose so the comparison sees it and refuses to adopt.
			if (close === -1) continue;
			excluded.push({ kind: 'waypoint', start: line.start, end: lines[close].end, text: body.slice(line.start, lines[close].end) });
			i = close;
		}
	}

	excluded.sort((a, b) => a.start - b.start);
	let remainder = '';
	let cursor = 0;
	for (const block of excluded) {
		remainder += body.slice(cursor, block.start);
		cursor = block.end;
	}
	remainder += body.slice(cursor);
	return { remainder, excluded };
}

export type AdoptResult =
	| { ok: true; body: string }
	| { ok: false; code: 'legacy-body-differs'; detail: string };

/**
 * Adopt an unmarked legacy note: write the markers into a file this run did not
 * write. The one place that happens, and conservative on purpose.
 *
 * The general principle, stated once: **adoption requires exact equality where
 * the legacy behaviour was lossy, and replays where the legacy behaviour was
 * already lossless.**
 *
 *   `strict`     — ordinary notes. Today's Replace rebuilt the whole body, so
 *                  nothing was safe; adoption fires only when the body-minus-
 *                  recognised-blocks equals the fresh managed body, and the
 *                  result is the original file plus exactly the two marker
 *                  lines. Otherwise: conflict, file untouched.
 *   `replay-hub` — facet hubs. `mergeHubBody` is ALREADY non-destructive, so an
 *                  equality rule would regress a working path and stop hubs
 *                  updating. Adoption replays that merger once and wraps the
 *                  part it regenerated. Never conflicts.
 */
export function adoptLegacyBody(
	existingBody: string,
	freshManagedBody: string,
	mode: 'strict' | 'replay-hub',
): AdoptResult {
	if (mode === 'replay-hub') {
		const merged = replayHubMerge(existingBody, freshManagedBody);
		const freshTrimmed = freshManagedBody.replace(/\n+$/, '');
		const rest = merged.startsWith(freshTrimmed) ? merged.slice(freshTrimmed.length) : '';
		return { ok: true, body: wrapRegion('body', freshManagedBody) + rest };
	}

	const split = stripRecognisedBlocks(existingBody);
	if (!split) {
		// Unreachable in practice: the caller scans first and conflicts on corruption.
		return { ok: false, code: 'legacy-body-differs', detail: 'the note\'s region markers could not be read.' };
	}
	const { excluded } = split;

	const cut = excluded.length > 0 ? excluded[0].start : existingBody.length;
	const head = existingBody.slice(0, cut);
	const tail = existingBody.slice(cut);

	// Adoption is refused when a recognised block appears BEFORE the compared
	// content, or when compared content appears after one. Both would need a
	// positional model to reconstruct; refusing keeps reconstruction to
	// "wrap the head, keep the tail verbatim".
	if (excluded.length > 0) {
		if (normalizeForComparison(head) === '') {
			return {
				ok: false,
				code: 'legacy-body-differs',
				detail: 'a managed or third-party block appears before the note\'s own body content, so Crosswalker cannot tell where the managed body begins.',
			};
		}
		let cursor = cut;
		let between = '';
		for (const block of excluded) {
			between += existingBody.slice(cursor, block.start);
			cursor = block.end;
		}
		between += existingBody.slice(cursor);
		if (normalizeForComparison(between) !== '') {
			return {
				ok: false,
				code: 'legacy-body-differs',
				detail: 'the note has content after its managed children or Waypoint block, so Crosswalker cannot tell which part it owns.',
			};
		}
	}

	if (normalizeForComparison(head) !== normalizeForComparison(freshManagedBody)) {
		return {
			ok: false,
			code: 'legacy-body-differs',
			detail: 'the note body differs from what this import would generate, so Crosswalker cannot tell which parts are yours.',
		};
	}

	const trailing = /(?:\r?\n)*$/.exec(head)?.[0] ?? '';
	const wrapped = wrapRegion('body', freshManagedBody);
	if (tail === '') return { ok: true, body: trailing === '' ? wrapped : wrapped + trailing };
	return { ok: true, body: wrapped + (trailing === '' ? '\n' : trailing) + tail };
}

/**
 * `mergeHubBody`'s exact semantics, replicated here so `adoptLegacyBody` stays
 * pure and free of an `enrich.ts` import cycle. A hub body is a managed H1 line
 * followed by any user prose; the H1 regenerates, everything below it survives.
 * Kept byte-identical to `enrich.mergeHubBody` — `tests/managed-body.test.ts`
 * asserts the two agree, so a divergence fails the suite rather than silently
 * changing what hubs preserve.
 */
export function replayHubMerge(existingBody: string, freshBody: string): string {
	const normalized = existingBody.replace(/\r\n/g, '\n');
	const lines = normalized.split('\n');
	const h1Index = lines.findIndex((l) => /^#\s+/.test(l));
	if (h1Index === -1) {
		const prose = normalized.replace(/^\n+/, '');
		return prose ? `${freshBody.replace(/\n+$/, '')}\n\n${prose}` : freshBody;
	}
	const userProse = lines.slice(h1Index + 1).join('\n').replace(/^\n+/, '').replace(/\n+$/, '');
	const freshH1 = freshBody.replace(/\n+$/, '');
	return userProse ? `${freshH1}\n\n${userProse}\n` : `${freshH1}\n`;
}

/**
 * Plain-language reason for a conflict, for the wizard results screen and the
 * run summary. A conflict that is only in a log is a silent failure wearing a
 * different hat. No em dashes (UI-copy rule).
 */
export function describeConflict(code: string, detail: string): string {
	switch (code) {
		case 'legacy-body-differs':
			return `This note was not written with Crosswalker's body markers, and its body is not what this import would generate. ${detail}`;
		case 'future-region-version':
			return 'This note was written by a newer version of Crosswalker. Update the plugin to re-import it.';
		case 'frontmatter-unreadable':
			return `Crosswalker could not read this note's properties. ${detail}`;
		case 'frontmatter-merge-failed':
			return `Crosswalker could not merge this note's properties without risking the ones you edited. ${detail}`;
		default:
			return `Crosswalker could not read this note's body markers. ${detail}`;
	}
}
