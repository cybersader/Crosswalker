/**
 * folder mechanism — append a directory segment to address.primary.path
 *
 * Per Ch 22 §1.1: native filesystem path nesting; mono-hierarchical;
 * not polyhierarchical. Right when each concept has exactly one canonical home.
 */

import type { Address, SourceScope, RenderReport } from '../types';
import { renderTemplate } from '../template';

interface FolderLayoutEntry {
	level: string;
	mechanism: 'folder';
	template: string;
}

export function applyFolder(
	address: Address,
	entry: FolderLayoutEntry,
	scope: SourceScope,
	report?: RenderReport,
): void {
	const segment = renderTemplate(entry.template, scope, report);
	if (!segment) {
		report?.notes.push({
			code: 'folder-level-skipped',
			level: entry.level,
			template: entry.template,
			detail: `Level "${entry.level}" rendered empty for this row — the folder level was skipped, so the note lands one level up from its siblings.`,
		});
		return;
	}

	address.primary.path = address.primary.path
		? `${address.primary.path}/${segment}`
		: segment;
}
