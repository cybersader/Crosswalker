/**
 * source-order.ts — position-within-parent ordinal stamping.
 *
 * Implements decision P1 (ratified 2026-07-27, see the primitives
 * reconciliation register): concept notes carry an optional `source_order`
 * frontmatter key recording the order the SOURCE published its items in,
 * because identifier-lexical sorting destroys canonical sequence (NIST CSF
 * 2.0's canonical function order is GV, ID, PR, DE, RS, RC — alphabetical
 * renders DETECT first).
 *
 * Shape: a zero-padded, dot-delimited position-within-parent path, e.g.
 * `00001.00001.00003`. This is the convention the corpus itself converged on
 * three times independently (NIST CPRT `sort` elements, SP 800-53A `sort-as`,
 * CRI Profile `Outline Id`) and it sorts correctly as a PLAIN STRING, which is
 * exactly what Bases/enrichment consumers need. Recipes that map an explicit
 * source ordinal column (e.g. CPRT `sort`) win: the engine only stamps when
 * the rendered frontmatter has no `source_order` yet.
 *
 * Identity: `source_order` is deliberately EXCLUDED from `concept_cid`
 * (P1 option (a)) — order is presentation, not identity. A publisher
 * renumbering its table does not change what a control is. Nothing here
 * touches src/generation/hash.ts.
 *
 * Determinism: ordinals are assigned by FIRST APPEARANCE in source-row order.
 * The engine's row dispatcher (`forEachConcurrent`) pulls rows strictly in
 * index order and each worker's synchronous prefix runs at dispatch time, so
 * stamping in that prefix is row-ordered even under concurrency. The
 * monotonic-row guard below turns any future violation of that assumption
 * (e.g. an `await` inserted upstream of the stamp) into a loud error instead
 * of a silently reordered vault.
 */

const PAD = 5;

/** Join a parent's dotted ordinal path with a child segment. */
function joinOrd(prefix: string, segment: string): string {
	return prefix ? `${prefix}.${segment}` : segment;
}

export class SourceOrderStamper {
	/** directory path (slash-joined, recipe-relative) → its dotted ordinal path */
	private dirOrdinal = new Map<string, string>();
	/** parent directory path → next sibling ordinal (files and subfolders share one sequence) */
	private nextChild = new Map<string, number>();
	/** last row number stamped — guards the row-order determinism assumption */
	private lastRow = 0;

	/**
	 * Assign the dotted ordinal path for the note at `recipePath` (the
	 * recipe-relative rendered path, NOT prefixed with the destination
	 * basePath — ordinals must be independent of where the import lands).
	 *
	 * Directories are assigned an ordinal the first time anything appears
	 * inside them; files take the next sibling ordinal under their directory.
	 * Files and subfolders interleave in one first-appearance sequence, which
	 * mirrors how the sources themselves publish (a category row followed by
	 * its subcategories).
	 */
	stamp(recipePath: string, rowNum: number): string {
		if (rowNum <= this.lastRow) {
			throw new Error(
				`SourceOrderStamper: rows stamped out of order (row ${rowNum} after row ${this.lastRow}). ` +
					'Stamping must happen in the synchronous dispatch prefix of the row worker; ' +
					'an upstream await has likely broken row-order determinism.',
			);
		}
		this.lastRow = rowNum;

		const parts = recipePath.replace(/^\/+/, '').split('/');
		parts.pop(); // the file segment — its ordinal is taken below
		let dirKey = '';
		let dirPath = '';
		for (const seg of parts) {
			const childKey = dirKey ? `${dirKey}/${seg}` : seg;
			let ord = this.dirOrdinal.get(childKey);
			if (ord === undefined) {
				ord = joinOrd(dirPath, this.take(dirKey));
				this.dirOrdinal.set(childKey, ord);
			}
			dirKey = childKey;
			dirPath = ord;
		}
		return joinOrd(dirPath, this.take(dirKey));
	}

	private take(parentKey: string): string {
		const n = (this.nextChild.get(parentKey) ?? 0) + 1;
		this.nextChild.set(parentKey, n);
		return String(n).padStart(PAD, '0');
	}
}

/**
 * Strip the destination base path off a full vault path, yielding the
 * recipe-relative path `stamp()` expects. Returns the input unchanged when it
 * does not start with the base (defensive: never throw during generation).
 */
export function stripBasePath(fullPath: string, basePath: string | undefined): string {
	if (!basePath) return fullPath;
	const base = basePath.replace(/^\/+|\/+$/g, '');
	if (base && fullPath.startsWith(`${base}/`)) return fullPath.slice(base.length + 1);
	return fullPath;
}

/**
 * Whether this frontmatter is a concept note eligible for stamping: the
 * `source_order` field lives on the Tier 1 CONCEPT branch only, and an
 * explicitly recipe-mapped value always wins over the engine's counter.
 */
export function shouldStampSourceOrder(frontmatter: Record<string, unknown>): boolean {
	const kind = frontmatter.kind;
	if (kind !== undefined && kind !== 'concept') return false;
	return frontmatter.source_order === undefined;
}
