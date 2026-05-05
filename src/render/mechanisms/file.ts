/**
 * file mechanism — leaf-bearing markdown file
 *
 * Per Ch 22: the leaf-bearing primitive. Sets the concept's primary file.
 * Template should produce a `.md`-suffixed path (or we add the suffix).
 */

import type { Address, SourceScope } from '../types';
import { renderTemplate, RenderError } from '../template';

interface FileLayoutEntry {
	level: string;
	mechanism: 'file';
	template: string;
}

export function applyFile(address: Address, entry: FileLayoutEntry, scope: SourceScope): void {
	let segment = renderTemplate(entry.template, scope);
	if (!segment) {
		throw new RenderError(
			`file mechanism produced empty path for level "${entry.level}". Template: "${entry.template}".`,
		);
	}

	// Ensure .md suffix
	if (!segment.endsWith('.md')) {
		segment = `${segment}.md`;
	}

	address.primary.path = address.primary.path
		? `${address.primary.path}/${segment}`
		: segment;
}
