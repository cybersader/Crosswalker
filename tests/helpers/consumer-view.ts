/**
 * consumer-view.ts — L2 consumer-contract helpers (testing doctrine 2026-07-10).
 *
 * The doctrine's root-cause finding: every green suite asserted the frontmatter
 * *object* and the written *string*, but nothing parsed the output back the way
 * the CONSUMER does — a real YAML parser, then Obsidian's link indexer. The
 * unquoted-wikilink bug (`parent: [[T1078]]` parses as a nested array, so
 * Obsidian indexes NO link and the graph goes dead) shipped straight through.
 *
 * These helpers give the consumer a voice: parse a generated note exactly as a
 * YAML reader would, and assert that a value MEANT as a wikilink survives the
 * round-trip as a STRING of the form `[[...]]` (not an array, not undefined).
 *
 * js-yaml resolution: `require('js-yaml')` — it is already present in
 * node_modules as an ESLint dependency and resolves cleanly from tests (verified
 * 2026-07-10). No vendoring needed.
 */

// eslint-disable-next-line @typescript-eslint/no-var-requires
const yaml = require('js-yaml') as { load: (s: string) => unknown };

/** A note as its consumer sees it: parsed frontmatter + the remaining body. */
export interface ConsumerNote {
	frontmatter: Record<string, unknown>;
	body: string;
}

/**
 * Parse a generated note the way a YAML-reading consumer (Obsidian's metadata
 * cache) does: split the leading `---` fenced block, run it through a real YAML
 * parser, and hand back the body verbatim.
 *
 * Throws if the YAML block is malformed — which is exactly the signal L2 wants:
 * a note whose frontmatter a consumer cannot parse is a broken note.
 */
export function parseNoteAsConsumer(noteText: string): ConsumerNote {
	const normalized = noteText.replace(/\r\n/g, '\n');
	if (!normalized.startsWith('---\n')) {
		// No frontmatter fence at all — the whole text is body.
		return { frontmatter: {}, body: normalized };
	}
	const end = normalized.indexOf('\n---', 3);
	if (end === -1) {
		throw new Error('Unterminated YAML frontmatter block (no closing `---`).');
	}
	const yamlText = normalized.slice(4, end + 1);
	// Body starts after the closing fence line.
	const afterFence = normalized.indexOf('\n', end + 1);
	const body = afterFence === -1 ? '' : normalized.slice(afterFence + 1);

	const parsed = yaml.load(yamlText);
	if (parsed !== null && parsed !== undefined && typeof parsed !== 'object') {
		throw new Error(`Frontmatter did not parse as a mapping (got ${typeof parsed}).`);
	}
	return { frontmatter: (parsed as Record<string, unknown>) ?? {}, body };
}

/** Matches a bare Obsidian wikilink value: `[[Target]]` / `[[Target|alias]]` etc. */
const WIKILINK_RE = /^\[\[.*\]\]$/;

/**
 * Assert that `fm[key]`, as PARSED by a YAML consumer, is a plain string of the
 * form `[[...]]`. This is the exact assertion the historical unquoted-wikilink
 * bug fails: an unquoted `parent: [[T1078]]` parses as a nested YAML array
 * (`[["T1078"]]`), so `typeof value` is `object`, not `string`, and this throws.
 *
 * Returns the validated link string so callers can chain further checks.
 */
export function assertLinkValue(fm: Record<string, unknown>, key: string): string {
	const value = fm[key];
	if (typeof value !== 'string') {
		throw new Error(
			`Expected frontmatter "${key}" to parse back as a wikilink STRING, ` +
				`but a YAML consumer read it as ${describe(value)}. ` +
				`This is the unquoted-wikilink graph-death bug: quote the value as "[[...]]".`,
		);
	}
	if (!WIKILINK_RE.test(value)) {
		throw new Error(
			`Frontmatter "${key}" is a string but not a wikilink: ${JSON.stringify(value)} ` +
				`(expected /^\\[\\[.*\\]\\]$/).`,
		);
	}
	return value;
}

/** Human-readable type description for error messages. */
function describe(value: unknown): string {
	if (value === undefined) return 'undefined (key absent)';
	if (value === null) return 'null';
	if (Array.isArray(value)) return `an array (${JSON.stringify(value)})`;
	return `${typeof value} (${JSON.stringify(value)})`;
}

/**
 * Extract every wikilink target referenced by a value (string or array of
 * strings), stripped of `[[ ]]`, alias (`|`), and heading (`#`) suffixes. Used
 * by both the L2 contracts and the L3 link-resolution invariant.
 */
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
