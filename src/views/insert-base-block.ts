/**
 * insert-base-block.ts — Phase 4a foundation helper.
 *
 * Cursor-aware insertion of a ` ```base ` codeblock into an Obsidian editor.
 * Pure, mocked-Editor testable. Owns the cursor-position policy so the picker
 * modal doesn't have to think about it.
 *
 * Cursor-position policy (matches Phase 4a edge-case test matrix):
 *   - Inside frontmatter (between opening + closing `---`) → insert AFTER
 *     the closing `---` line (don't break frontmatter)
 *   - Inside a code block (between opening + closing ```) → insert AFTER
 *     the closing ``` (don't nest code blocks)
 *   - Anywhere else (body text, blank line, end of file) → insert AFTER the
 *     cursor's current line
 *
 * Returns a structured result so callers can surface Notices without leaking
 * cursor-policy knowledge into the picker modal.
 */

import type { Editor } from 'obsidian';

export type InsertResult =
	| { ok: true; insertedAt: { line: number; ch: number }; reason: 'after-line' | 'after-frontmatter' | 'after-code-block' }
	| { ok: false; reason: 'no-editor' | 'unknown-error'; error?: string };

/**
 * Insert a ` ```base ` codeblock (caller provides the full text, including
 * fences) at a safe location relative to the current cursor.
 *
 * The returned `insertedAt` reflects where the FIRST line of the block now
 * lives (for follow-up cursor positioning).
 */
export function insertBaseBlock(
	editor: Editor | null | undefined,
	blockText: string,
): InsertResult {
	if (!editor) {
		return { ok: false, reason: 'no-editor' };
	}

	try {
		const cursor = editor.getCursor();
		const content = editor.getValue();
		const lines = content.split('\n');

		const target = chooseInsertionPoint(lines, cursor.line);
		const insertLine = target.line;
		const insertCh = 0;

		// Ensure block ends with newline + has a blank line BEFORE (visual
		// separation; don't collide with prior content if cursor is at end
		// of a non-empty line).
		const prevLine = lines[insertLine - 1] ?? '';
		const prefix = (insertLine === 0 || prevLine.trim() === '') ? '' : '\n';
		const suffix = blockText.endsWith('\n') ? '' : '\n';

		editor.replaceRange(
			prefix + blockText + suffix,
			{ line: insertLine, ch: insertCh },
		);

		return {
			ok: true,
			insertedAt: { line: insertLine + (prefix ? 1 : 0), ch: 0 },
			reason: target.reason,
		};
	} catch (err) {
		return {
			ok: false,
			reason: 'unknown-error',
			error: err instanceof Error ? err.message : String(err),
		};
	}
}

interface InsertionPoint {
	line: number;
	reason: 'after-line' | 'after-frontmatter' | 'after-code-block';
}

/**
 * Choose a safe line index to insert at. Pure function — no Editor side
 * effects — so the cursor-position policy is unit-testable.
 *
 * Exported for direct unit testing.
 */
export function chooseInsertionPoint(lines: string[], cursorLine: number): InsertionPoint {
	// 1. Frontmatter — only valid if it starts at line 0
	if (lines[0] === '---') {
		// Find the closing --- (search from line 1 onward)
		for (let i = 1; i < lines.length; i++) {
			if (lines[i] === '---') {
				// Cursor inside frontmatter (line 0..i inclusive)?
				if (cursorLine <= i) {
					return { line: i + 1, reason: 'after-frontmatter' };
				}
				break; // Frontmatter closed; cursor is past it — continue with code-block check
			}
		}
	}

	// 2. Code block — check whether cursor is inside ``` fences
	// Walk all fence lines; track odd/even at cursor position
	const fenceLines: number[] = [];
	for (let i = 0; i < lines.length; i++) {
		if (/^```/.test(lines[i] ?? '')) {
			fenceLines.push(i);
		}
	}
	// Walk fences in order; between fence-pair (open, close) we're inside
	for (let i = 0; i + 1 < fenceLines.length; i += 2) {
		const open = fenceLines[i];
		const close = fenceLines[i + 1];
		if (cursorLine >= open && cursorLine <= close) {
			return { line: close + 1, reason: 'after-code-block' };
		}
	}

	// 3. Default — insert after current line
	return { line: cursorLine + 1, reason: 'after-line' };
}

/**
 * Build a complete ` ```base ` codeblock with the given YAML body. Caller
 * provides the body (no fences); we add fences + trailing newline.
 *
 * Exported separately so tests can verify the block format independently of
 * insertion.
 */
export function buildBaseBlock(yamlBody: string): string {
	const trimmed = yamlBody.replace(/\n+$/, ''); // strip trailing newlines from body
	return '```base\n' + trimmed + '\n```';
}
