/**
 * crosswalk-shared.ts — helpers shared by the headless crosswalk extractors
 * (`tools/crosswalk-from-olir.ts`, `tools/crosswalk-from-melt.ts`).
 *
 * Everything here is pure + Obsidian-free. Extracted 2026-06-12 when the SCF
 * mapping-column melt became the second consumer of the edge-emission path.
 */

import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { normalizeMappingSetId } from '../../src/utils/mapping-provenance';

export const SPEC_VERSION = 'https://crosswalker.dev/spec/tier1.schema.json';
export const DETERMINISTIC_TIMESTAMP = '2026-05-04T00:00:00.000Z';

/** Mirror of SKOS_TO_STRM in src/import/sssom-importer.ts (module-private there).
 *  Keep in sync if that map changes. Unknown → intersects_with.
 *  Direction (fixed 2026-06-12): `A skos:broadMatch B` ⇒ B is broader ⇒ A ⊂ B
 *  ⇒ `A is_narrower_than B`. Contract page:
 *  docs/src/content/docs/agent-context/zz-log/2026-06-12-skos-strm-direction-convention.mdx */
export const SKOS_TO_STRM: Record<string, string> = {
	'skos:exactMatch': 'is_equivalent_to',
	'skos:closeMatch': 'is_approximate_to',
	'skos:broadMatch': 'is_narrower_than',
	'skos:narrowMatch': 'is_broader_than',
	'skos:relatedMatch': 'intersects_with',
};
export const skosToStrm = (skos: string): string => SKOS_TO_STRM[skos] ?? 'intersects_with';

export const slug = (s: string): string =>
	s
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '');

/** Local part of a CURIE (drop the `prefix:`). */
export const localOf = (curie: string): string => curie.split(':').slice(1).join(':') || curie;

/** Roll-up group key for an id: its leading letters — the CSF function (GV.OC-01
 *  → GV) or the 800-53 family (AC-2 → AC). Enables family×function coverage views. */
export const groupOf = (curie: string): string => {
	const local = localOf(curie);
	return local.match(/^[A-Za-z]+/)?.[0] ?? local;
};

/** Strip leading zeros from each numeric segment: AC-01 → AC-1, IR-04(02) → IR-4(2),
 *  AC-010 → AC-10 (only zeros that PREFIX a longer run are stripped). */
export const depadId = (id: string): string => id.replace(/(^|[^0-9])0+([0-9])/g, '$1$2');

/** Folder-qualified wikilink to a concept note, displayed as the bare local id. */
export const noteLink = (folder: string, local: string): string => `[[${folder}/${local}|${local}]]`;

export interface SssomRow {
	subject_id: string;
	predicate_id: string; // SKOS (standard SSSOM)
	object_id: string;
	predicate_modifier?: 'NOT';
	mapping_justification: string;
	confidence?: number;
}

/** Numbers emit unquoted (so Obsidian/Bases reads them as numbers); strings get
 *  quoted when they contain YAML-significant characters. */
export function yamlScalar(v: unknown): string {
	if (typeof v === 'number' || typeof v === 'boolean') return String(v);
	const s = String(v ?? '');
	if (s === '' || /[:#"'\[\]{}|>&*!?,@`]/.test(s) || /^\s|\s$/.test(s)) {
		return JSON.stringify(s);
	}
	return s;
}

export function frontmatterToYaml(fm: Record<string, unknown>): string {
	const lines: string[] = ['---'];
	for (const [k, v] of Object.entries(fm)) {
		if (v === undefined) continue;
		if (v && typeof v === 'object' && !Array.isArray(v)) {
			lines.push(`${k}:`);
			for (const [k2, v2] of Object.entries(v as Record<string, unknown>)) {
				if (v2 && typeof v2 === 'object') {
					lines.push(`  ${k2}:`);
					for (const [k3, v3] of Object.entries(v2 as Record<string, unknown>)) {
						lines.push(`    ${k3}: ${yamlScalar(v3)}`);
					}
				} else {
					lines.push(`  ${k2}: ${yamlScalar(v2)}`);
				}
			}
		} else if (Array.isArray(v)) {
			lines.push(`${k}: [${v.map((x) => yamlScalar(x)).join(', ')}]`);
		} else {
			lines.push(`${k}: ${yamlScalar(v)}`);
		}
	}
	lines.push('---', '');
	return lines.join('\n');
}

export interface SssomTsvMeta {
	subjectPrefix: string;
	objectPrefix: string;
	provider: string;
	deterministic: boolean;
	mappingSetId: string;
}

export function writeSssomTsv(rows: SssomRow[], meta: SssomTsvMeta, outPath: string): void {
	const date = meta.deterministic ? '2026-05-04' : new Date().toISOString().slice(0, 10);
	const mappingSetId = normalizeMappingSetId(meta.mappingSetId);
	if (!mappingSetId) throw new Error('SSSOM mappingSetId must be non-empty');
	const header = [
		'# curie_map:',
		`#   ${meta.subjectPrefix}: "https://crosswalker.dev/ontology/${meta.subjectPrefix}/"`,
		`#   ${meta.objectPrefix}: "https://crosswalker.dev/ontology/${meta.objectPrefix}/"`,
		'#   skos: "http://www.w3.org/2004/02/skos/core#"',
		'#   semapv: "https://w3id.org/semapv/vocab/"',
		`# mapping_set_id: "${mappingSetId}"`,
		`# subject_source: "${meta.subjectPrefix}"`,
		`# object_source: "${meta.objectPrefix}"`,
		`# mapping_provider: "${meta.provider}"`,
		`# mapping_date: "${date}"`,
	];
	const cols = ['subject_id', 'predicate_id', 'object_id', 'predicate_modifier', 'mapping_justification', 'confidence'];
	const body = rows.map((r) =>
		[r.subject_id, r.predicate_id, r.object_id, r.predicate_modifier ?? '', r.mapping_justification, r.confidence ?? '']
			.join('\t'),
	);
	mkdirSync(resolve(outPath, '..'), { recursive: true });
	writeFileSync(outPath, [...header, cols.join('\t'), ...body].join('\n') + '\n');
}
