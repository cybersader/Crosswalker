/**
 * heading mechanism — intra-file Markdown heading anchor
 *
 * Per Ch 22 §1.2: when several levels of hierarchy live inside one file as
 * nested headings (`## Family`, `### Control`, `#### Enhancement`).
 *
 * Anchor format follows Obsidian's heading-anchor wikilink shape:
 *   [[Note#Heading]]      (single level)
 *   [[Note#H1#H2]]         (heading-range form, multi-level)
 *
 * The `level_depth` field on the LayoutEntry indicates the heading level
 * (`#` count) to render in the body — `level_depth: 2` → `## ...`.
 * The renderer stores anchor text (without `#` prefix) in address.primary.anchor;
 * the body emitter (downstream) prefixes with the right number of `#`.
 */

import type { Address, SourceScope, RenderReport } from '../types';
import { renderTemplate, RenderError } from '../template';

interface HeadingLayoutEntry {
	level: string;
	mechanism: 'heading';
	template: string;
	level_depth?: number;
}

export function applyHeading(
	address: Address,
	entry: HeadingLayoutEntry,
	scope: SourceScope,
	report?: RenderReport,
): void {
	if (entry.level_depth === undefined || entry.level_depth < 1 || entry.level_depth > 6) {
		throw new RenderError(
			`heading mechanism for level "${entry.level}" requires level_depth in 1..6; got ${entry.level_depth}.`,
		);
	}

	const headingText = renderTemplate(entry.template, scope, report);
	if (!headingText) {
		throw new RenderError(
			`heading mechanism produced empty heading for level "${entry.level}". Template: "${entry.template}".`,
		);
	}

	// Append to existing anchor with `#` separator (Obsidian's heading-range form)
	address.primary.anchor = address.primary.anchor
		? `${address.primary.anchor}#${headingText}`
		: headingText;
}
