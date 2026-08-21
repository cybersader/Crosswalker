import { applyMigrations, TIER2_SCHEMA_VERSION } from '../src/tier2/migrations';
import { projectFromTier1 } from '../src/tier2/projector';

const { DatabaseSync } = require('node:sqlite');

interface ExecOptions {
	sql: string;
	bind?: Record<string, unknown>;
	rowMode?: 'array';
	returnValue?: 'resultRows';
}
interface TestDb { exec(input: string | ExecOptions): unknown[][] | void; close(): void }

function createTestDb(): TestDb {
	const sqlite = new DatabaseSync(':memory:');
	return {
		exec(input) {
			if (typeof input === 'string') { sqlite.exec(input); return; }
			const statement = sqlite.prepare(input.sql);
			if (input.rowMode === 'array') statement.setReturnArrays(true);
			const bind = input.bind ?? {};
			if (input.returnValue === 'resultRows') return Object.keys(bind).length ? statement.all(bind) : statement.all();
			if (Object.keys(bind).length) statement.run(bind); else statement.run();
		},
		close: () => sqlite.close(),
	};
}

function rows(db: TestDb, sql: string): unknown[][] {
	return db.exec({ sql, rowMode: 'array', returnValue: 'resultRows' }) as unknown[][];
}

function mockApp(entries: Array<[string, Record<string, unknown>]>): any {
	const files = entries.map(([path]) => ({ path, stat: { mtime: 0 } }));
	const byPath = new Map(entries);
	return {
		vault: { getMarkdownFiles: () => files },
		metadataCache: { getFileCache: (file: { path: string }) => ({ frontmatter: byPath.get(file.path) }) },
	};
}

const provenance = (version?: string) => ({
	spec_version: 'https://crosswalker.dev/spec/tier1.schema.json',
	source_ref: { file: 'source.csv', ...(version ? { version } : {}) },
	produced_at: '2026-08-21T00:00:00.000Z',
});

describe('Tier 2 v3 identity and mapping-set provenance', () => {
	let db: TestDb;
	beforeEach(() => { db = createTestDb(); applyMigrations(db); });
	afterEach(() => db.close());

	it('installs the composed v3 occurrence key and identity indexes', () => {
		expect(TIER2_SCHEMA_VERSION).toBe('tier2-sqlite-v3');
		expect(rows(db, `SELECT name FROM pragma_table_info('mappings') ORDER BY cid`)).toEqual(expect.arrayContaining([
			['mapping_set_id'], ['predicate_modifier'], ['source_path'],
		]));
		expect(rows(db, `SELECT name FROM sqlite_master WHERE type='index' ORDER BY name`)).toEqual(expect.arrayContaining([
			['idx_mappings_assertion'], ['idx_junction_subject_curie'], ['idx_junction_object_curie'],
		]));
		expect(() => db.exec(`INSERT INTO mappings
			(mapping_set_id, subject_id, predicate_id, predicate_modifier, object_id, source_path, source_hash)
			VALUES ('set:a','x:A','is_equivalent_to','not','x:B','bad.md','hash')`)).toThrow();
	});

	it('projects explicit identities, preserves release occurrences, and reconciles concept versions lexically', async () => {
		const app = mockApp([
			['Concepts/A.md', { curie: 'example:A', parent: '[[Display Parent]]', _crosswalker: provenance('v10') }],
			['Concepts/B.md', { curie: 'example:B', parent: '[[Other Address]]', parent_curie: 'example:A', _crosswalker: provenance('v2') }],
			['Evidence/jn.md', { kind: 'junction-note', curie: 'cwk:jn-1', subject: '[[Concepts/A]]', subject_curie: 'example:A', predicate: 'covers', object: '[[Evidence/Policy]]', object_curie: 'org:policy', _crosswalker: provenance() }],
			['Mappings/positive.md', { kind: 'crosswalk-edge', subject_id: 'example:A', predicate_id: 'is_equivalent_to', object_id: 'other:B', mapping_set_id: ' set:release-1 ', _crosswalker: provenance() }],
			['Mappings/negative.md', { kind: 'crosswalk-edge', subject_id: 'example:A', predicate_id: 'is_equivalent_to', predicate_modifier: 'NOT', object_id: 'other:B', mapping_set_id: 'set:release-2', _crosswalker: provenance() }],
		]);
		const result = await projectFromTier1(app, db, { yieldEvery: 100 });
		expect(result.success).toBe(true);
		expect(rows(db, `SELECT curie, parent_curie FROM concepts ORDER BY curie`)).toEqual([
			['example:A', null], ['example:B', 'example:A'],
		]);
		expect(rows(db, `SELECT subject, subject_curie, object, object_curie FROM junction_notes`)).toEqual([
			['[[Concepts/A]]', 'example:A', '[[Evidence/Policy]]', 'org:policy'],
		]);
		expect(rows(db, `SELECT mapping_set_id, predicate_modifier, source_path FROM mappings ORDER BY source_path`)).toEqual([
			['set:release-2', 'NOT', 'Mappings/negative.md'],
			['set:release-1', '', 'Mappings/positive.md'],
		]);
		expect(rows(db, `SELECT id, version FROM ontologies WHERE id='example'`)).toEqual([
			['example', 'v2'],
		]);
	});

	it('prunes vanished mapping paths only during a full projection', async () => {
		const path = 'Mappings/legacy.md';
		const entry: [string, Record<string, unknown>] = [path, {
			kind: 'crosswalk-edge', subject_id: 'x:A', predicate_id: 'is_equivalent_to', object_id: 'x:B', _crosswalker: provenance(),
		}];
		await projectFromTier1(mockApp([entry]), db);
		expect(rows(db, 'SELECT source_path FROM mappings')).toEqual([[path]]);

		await projectFromTier1(mockApp([]), db, { pathFilter: () => false });
		expect(rows(db, 'SELECT source_path FROM mappings')).toEqual([[path]]);

		await projectFromTier1(mockApp([]), db, { projectionMode: 'full' });
		expect(rows(db, 'SELECT source_path FROM mappings')).toEqual([]);
	});

	it('removes a stale positive row when an explicit stored modifier becomes invalid', async () => {
		const path = 'Mappings/edge.md';
		await projectFromTier1(mockApp([[path, { kind: 'crosswalk-edge', subject_id: 'x:A', predicate_id: 'is_equivalent_to', object_id: 'x:B', _crosswalker: provenance() }]]), db);
		expect(rows(db, 'SELECT COUNT(*) FROM mappings')).toEqual([[1]]);
		const invalid = await projectFromTier1(mockApp([[path, { kind: 'crosswalk-edge', subject_id: 'x:A', predicate_id: 'is_equivalent_to', predicate_modifier: '', object_id: 'x:B', _crosswalker: provenance() }]]), db);
		expect(invalid.success).toBe(false);
		expect(invalid.errors[0].message).toContain('stored predicate_modifier');
		expect(rows(db, 'SELECT COUNT(*) FROM mappings')).toEqual([[0]]);
	});
});
