/**
 * folder mechanism — append a directory segment to address.primary.path
 *
 * Per Ch 22 §1.1: native filesystem path nesting; mono-hierarchical;
 * not polyhierarchical. Right when each concept has exactly one canonical home.
 */

import type { Address, SourceScope } from '../types';
import { renderTemplate } from '../template';

interface FolderLayoutEntry {
	level: string;
	mechanism: 'folder';
	template: string;
}

export function applyFolder(address: Address, entry: FolderLayoutEntry, scope: SourceScope): void {
	const segment = renderTemplate(entry.template, scope);
	if (!segment) return;

	address.primary.path = address.primary.path
		? `${address.primary.path}/${segment}`
		: segment;
}
