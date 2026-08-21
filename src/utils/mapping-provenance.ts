import { canonicalStringify, sha256Hex } from '../generation/hash';

export function normalizeMappingSetId(value: unknown): string {
	return typeof value === 'string' ? value.trim() : '';
}

export function normalizePredicateModifierInput(value: unknown): '' | 'NOT' {
	if (value === undefined || value === null || value === '') return '';
	if (typeof value !== 'string') {
		throw new Error('predicate_modifier must be empty or exact uppercase NOT');
	}
	const normalized = value.trim();
	if (normalized === '') {
		throw new Error('predicate_modifier cannot contain only whitespace');
	}
	if (normalized !== 'NOT') {
		throw new Error('predicate_modifier must be exact uppercase NOT');
	}
	return 'NOT';
}

export function readStoredPredicateModifier(
	frontmatter: Record<string, unknown>,
): '' | 'NOT' {
	if (!Object.prototype.hasOwnProperty.call(frontmatter, 'predicate_modifier')) return '';
	if (frontmatter.predicate_modifier === 'NOT') return 'NOT';
	throw new Error('stored predicate_modifier must be absent or exact uppercase NOT');
}

export function mappingSetPathKey(mappingSetId: string): string {
	const normalized = normalizeMappingSetId(mappingSetId);
	if (!normalized) throw new Error('mapping_set_id must be non-empty before deriving a path key');
	return sha256Hex(normalized).slice(0, 12);
}

export function assertionBaseKey(input: {
	subject_id: string;
	predicate_id: string;
	predicate_modifier: '' | 'NOT';
	object_id: string;
}): string {
	return sha256Hex(canonicalStringify([
		input.subject_id,
		input.predicate_id,
		input.predicate_modifier,
		input.object_id,
	])).slice(0, 16);
}

export function mappingOccurrenceContentKey(record: Record<string, unknown>): string {
	const content: Record<string, unknown> = {};
	for (const [key, value] of Object.entries(record)) {
		if (value !== undefined) content[key] = value;
	}
	return sha256Hex(canonicalStringify(content)).slice(0, 12);
}
