/**
 * sssom-importer.test.ts — Phase 2 v0.1.6 integration tests for the SSSOM importer
 *
 * Per Ch 35. Uses a mock vault (existing pattern from generation-modules.test.ts)
 * to verify that importSssom() orchestrates parser + generation correctly without
 * needing a live Obsidian harness.
 *
 * Coverage:
 *   - Real fixture import → 11 junction-edge notes created
 *   - Source/target ontology detection from header
 *   - Parse-error path (returns SssomImportResult with skipped='parse-error')
 *   - Empty file path
 *   - Synthetic recipe construction works against existing crosswalk-edge generation
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { App } from 'obsidian';

import { importSssom } from '../src/import/sssom-importer';

const FIXTURE_PATH = join(__dirname, '..', 'tools', 'fixtures', 'synthetic', 'nist-csf-to-iso27001.sssom.tsv');

/** Minimal mock vault that records writes + reads. Mirrors the pattern from generation-modules.test.ts. */
function makeMockApp(): { app: App; written: Map<string, string>; folders: Set<string> } {
	const written = new Map<string, string>();
	const folders = new Set<string>();
	const app = {
		vault: {
			adapter: {
				exists: async (p: string) => written.has(p) || folders.has(p),
				mkdir: async (p: string) => {
					folders.add(p);
				},
			},
			getAbstractFileByPath: (p: string) => {
				if (folders.has(p)) return { path: p, children: [] } as any;
				if (written.has(p)) {
					return { path: p, basename: p.split('/').pop()?.replace('.md', '') ?? p, extension: 'md' } as any;
				}
				return null;
			},
			create: async (p: string, content: string) => {
				written.set(p, content);
				return { path: p } as any;
			},
			modify: async (file: any, content: string) => {
				written.set(file.path, content);
			},
			read: async (file: any) => written.get(file.path) ?? '',
			createFolder: async (p: string) => {
				folders.add(p);
			},
		},
		fileManager: {
			processFrontMatter: async (file: any, fn: (fm: Record<string, unknown>) => void) => {
				const content = written.get(file.path) ?? '';
				const fmMatch = content.match(/^---\n([\s\S]*?)\n---/);
				const fm: Record<string, unknown> = {};
				if (fmMatch) {
					try {
						const lines = fmMatch[1].split('\n');
						for (const ln of lines) {
							const m = ln.match(/^([^:]+):\s*(.*)$/);
							if (m) fm[m[1].trim()] = m[2].trim();
						}
					} catch {
						// best-effort
					}
				}
				fn(fm);
				const fmYaml = Object.entries(fm)
					.map(([k, v]) => `${k}: ${typeof v === 'string' ? v : JSON.stringify(v)}`)
					.join('\n');
				const body = content.replace(/^---\n[\s\S]*?\n---/, '').trimStart();
				written.set(file.path, `---\n${fmYaml}\n---\n${body}`);
			},
		},
	} as unknown as App;
	return { app, written, folders };
}

describe('importSssom — happy path with real fixture', () => {
	it('imports 11 junction-edge notes from the NIST CSF → ISO 27001 fixture', async () => {
		const tsv = readFileSync(FIXTURE_PATH, 'utf-8');
		const { app, written } = makeMockApp();

		const result = await importSssom(app, tsv, null, null, {
			runTier2Projection: false,
			overwriteMode: 'replace',
		});

		expect(result.skipped).toBeUndefined();
		expect(result.parse.errors).toEqual([]);
		expect(result.parse.rows.length).toBe(11);
		expect(result.source).toBe('csf');
		expect(result.target).toBe('iso27001');
		expect(result.folder).toBe('_crosswalker/mappings/csf-to-iso27001');
		expect(result.generation?.success).toBe(true);
		expect(result.generation?.created.length).toBe(11);

		// Verify files were written under the expected folder
		const writtenPaths = Array.from(written.keys());
		const inFolder = writtenPaths.filter((p) => p.startsWith('_crosswalker/mappings/csf-to-iso27001/'));
		expect(inFolder.length).toBe(11);

		// One file should mention the first row's subject + object (slug-cased)
		const firstFile = writtenPaths.find((p) => p.toLowerCase().includes('gv-oc-01'));
		expect(firstFile).toBeDefined();
		const content = written.get(firstFile!) ?? '';
		// YAML emitter quotes values containing colons — accept either form.
		expect(content).toMatch(/subject_id: ["']?csf:GV\.OC-01["']?/);
		expect(content).toMatch(/object_id: ["']?iso27001:A\.5\.1["']?/);
		// SKOS predicate normalized to STRM `is_approximate_to` (skos:closeMatch → close);
		// original SSSOM predicate preserved as `sssom_predicate`.
		expect(content).toContain('predicate_id: is_approximate_to');
		expect(content).toMatch(/sssom_predicate: ["']?skos:closeMatch["']?/);
	});
});

describe('importSssom — SKOS→STRM direction convention', () => {
	// Pins the direction semantics (fixed 2026-06-12 — the original map inverted SKOS).
	// Per the SKOS spec, `A skos:broadMatch B` states B is the BROADER concept (A ⊂ B),
	// so the STRM edge must read `A is_narrower_than B`. If this test fails, someone
	// re-inverted the map — see SKOS_TO_STRM in src/import/sssom-importer.ts AND its
	// mirror in tools/crosswalk-from-olir.ts (keep both in sync).
	it('broadMatch → is_narrower_than, narrowMatch → is_broader_than', async () => {
		// NOTE: the synthetic recipe requires subject_label/object_label/
		// mapping_justification/confidence — rows missing any of them fail render().
		const tsv = `subject_id\tsubject_label\tpredicate_id\tobject_id\tobject_label\tmapping_justification\tconfidence
nist:AC-1\tPolicy\tskos:broadMatch\tiso:A.1\tGovernance\tsemapv:ManualMappingCuration\t0.9
nist:AC-2\tAccounts\tskos:narrowMatch\tiso:A.2\tIdentity\tsemapv:ManualMappingCuration\t0.9`;
		const { app, written } = makeMockApp();
		const result = await importSssom(app, tsv, null, null, { runTier2Projection: false });
		expect(result.generation?.created.length).toBe(2);

		const contents = Array.from(written.values());
		const broad = contents.find((c) => c.includes('skos:broadMatch'));
		const narrow = contents.find((c) => c.includes('skos:narrowMatch'));
		expect(broad).toContain('predicate_id: is_narrower_than');
		expect(narrow).toContain('predicate_id: is_broader_than');
	});
});

describe('importSssom — error paths', () => {
	it('returns parse-error skip when TSV is missing required column', async () => {
		const { app } = makeMockApp();
		const result = await importSssom(app, 'subject_id\tobject_id\nfoo:1\tbar:1', null, null, {
			runTier2Projection: false,
		});
		expect(result.skipped).toBe('parse-error');
		expect(result.parse.errors[0]).toMatch(/predicate_id/);
		expect(result.generation).toBeNull();
	});

	it('returns no-rows skip when TSV is data-empty', async () => {
		const { app } = makeMockApp();
		const result = await importSssom(app, 'subject_id\tpredicate_id\tobject_id\n', null, null, {
			runTier2Projection: false,
		});
		expect(result.skipped).toBe('no-rows');
		expect(result.generation).toBeNull();
	});

	it('returns parse-error when ontology pair cannot be detected', async () => {
		// Rows have CURIEs without a prefix (no colon)
		const { app } = makeMockApp();
		const result = await importSssom(
			app,
			'subject_id\tpredicate_id\tobject_id\nfoo\tbar\tbaz',
			null,
			null,
			{ runTier2Projection: false },
		);
		expect(result.skipped).toBe('parse-error');
		expect(result.parse.errors.some((e) => /ontology pair/i.test(e))).toBe(true);
	});
});

describe('importSssom — option overrides', () => {
	it('respects sourceOntology + targetOntology overrides', async () => {
		const tsv = `subject_id\tpredicate_id\tobject_id
nist:AC-1\tskos:closeMatch\tiso:A.1`;
		const { app } = makeMockApp();
		const result = await importSssom(app, tsv, null, null, {
			runTier2Projection: false,
			sourceOntology: 'custom-nist',
			targetOntology: 'custom-iso',
		});
		expect(result.source).toBe('custom-nist');
		expect(result.target).toBe('custom-iso');
		expect(result.folder).toBe('_crosswalker/mappings/custom-nist-to-custom-iso');
	});

	it('respects custom outputFolder', async () => {
		const tsv = `subject_id\tpredicate_id\tobject_id
nist:AC-1\tskos:closeMatch\tiso:A.1`;
		const { app } = makeMockApp();
		const result = await importSssom(app, tsv, null, null, {
			runTier2Projection: false,
			outputFolder: 'custom/folder/path',
		});
		expect(result.folder).toBe('custom/folder/path');
	});
});
