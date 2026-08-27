/**
 * managed-region.ts — test-side unwrapping of the managed `body` region.
 *
 * Since 2026-08-27 every row-written body ships inside
 * `<!-- crosswalker:body:start v=1 -->` … `<!-- crosswalker:body:end -->`
 * (contract §2.1). Tests that assert on the MANAGED content unwrap it here so
 * their assertions stay exactly what they were, plus the new invariant that the
 * markers are present and well-formed.
 *
 * This is not a way to ignore the markers: `expectManagedBody` FAILS when the
 * region is missing, so a note that silently lost its boundary is a test
 * failure rather than a passing assertion on raw text.
 */

import { scanRegions, findSpan } from '../../src/generation/managed-body';

/** Strip the YAML frontmatter block, returning the raw note body. */
export function bodyOfNote(note: string): string {
	const normalized = note.replace(/\r\n/g, '\n');
	if (!normalized.startsWith('---\n')) return normalized;
	const closing = normalized.indexOf('\n---\n', 4);
	return closing < 0 ? normalized : normalized.slice(closing + 5);
}

/**
 * The content INSIDE the `body` region. Throws when the region is absent or the
 * markers do not scan, so "the wrapper vanished" can never read as a pass.
 */
export function unwrapManagedBody(body: string): string {
	const scan = scanRegions(body);
	if (!scan.ok) throw new Error(`managed body region is corrupt: ${scan.code} — ${scan.detail}`);
	const span = findSpan(scan.spans, 'body');
	if (!span) throw new Error('note has no crosswalker:body region');
	return body.slice(span.contentStart, span.contentEnd);
}

/** Frontmatter stripped, then the `body` region unwrapped. */
export function managedBodyOfNote(note: string): string {
	return unwrapManagedBody(bodyOfNote(note));
}
