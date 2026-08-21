import { applyMigrations } from '../src/tier2/migrations';
import {
	closureFromConcept,
	precomputeClosureForOntologyPair,
	type ClosureEntry,
} from '../src/tier2/queries';

const { DatabaseSync } = require('node:sqlite');

interface ExecOptions {
	sql: string;
	bind?: Record<string, unknown>;
	rowMode?: 'array';
	returnValue?: 'resultRows';
}

interface TestDb {
	exec(input: string | ExecOptions): unknown[][] | void;
	close(): void;
}

function createTestDb(): TestDb {
	const sqlite = new DatabaseSync(':memory:');
	return {
		exec(input: string | ExecOptions): unknown[][] | void {
			if (typeof input === 'string') {
				sqlite.exec(input);
				return;
			}
			const statement = sqlite.prepare(input.sql);
			if (input.rowMode === 'array') statement.setReturnArrays(true);
			const bind = input.bind ?? {};
			if (input.returnValue === 'resultRows') {
				return Object.keys(bind).length > 0 ? statement.all(bind) : statement.all();
			}
			if (Object.keys(bind).length > 0) statement.run(bind);
			else statement.run();
		},
		close(): void {
			sqlite.close();
		},
	};
}

function insertMapping(
	db: TestDb,
	subject: string,
	predicate: string,
	object: string,
	suffix: string,
): void {
	db.exec({
		sql: `
			INSERT INTO mappings
				(subject_id, predicate_id, object_id, source_path, source_hash)
			VALUES ($subject, $predicate, $object, $path, $hash)
		`,
		bind: {
			$subject: subject,
			$predicate: predicate,
			$object: object,
			$path: `Mappings/edge-${suffix}.md`,
			$hash: `hash-${suffix}`,
		},
	});
}

function targets(entries: ClosureEntry[]): Array<[string, number]> {
	return entries.map((entry) => [entry.target_curie, entry.shortest_depth]);
}

function queryRows(db: TestDb, sql: string, bind: Record<string, unknown> = {}): unknown[][] {
	return db.exec({
		sql,
		bind,
		rowMode: 'array',
		returnValue: 'resultRows',
	}) as unknown[][];
}

describe('Tier 2 predicate-characteristic closure', () => {
	let db: TestDb;

	beforeEach(() => {
		db = createTestDb();
		applyMigrations(db);
	});

	afterEach(() => {
		db.close();
	});

	it('derives directional inverse chains for broader and narrower predicates', () => {
		insertMapping(db, 'example:A', 'is_broader_than', 'example:B', 'broader-1');
		insertMapping(db, 'example:B', 'is_broader_than', 'example:C', 'broader-2');

		expect(targets(closureFromConcept(db, 'example:A', 'is_broader_than', 10))).toEqual([
			['example:B', 1],
			['example:C', 2],
		]);
		expect(targets(closureFromConcept(db, 'example:C', 'is_narrower_than', 10))).toEqual([
			['example:B', 1],
			['example:A', 2],
		]);
		expect(targets(closureFromConcept(db, 'example:B', 'is_narrower_than', 10))).toEqual([
			['example:A', 1],
		]);
	});

	it('traverses equivalence symmetrically and transitively in either direction', () => {
		insertMapping(db, 'example:P', 'is_equivalent_to', 'example:Q', 'equivalent-1');
		insertMapping(db, 'example:Q', 'is_equivalent_to', 'example:R', 'equivalent-2');

		expect(targets(closureFromConcept(db, 'example:P', 'is_equivalent_to', 10))).toEqual([
			['example:Q', 1],
			['example:R', 2],
		]);
		expect(targets(closureFromConcept(db, 'example:R', 'is_equivalent_to', 10))).toEqual([
			['example:Q', 1],
			['example:P', 2],
		]);
	});

	it.each([
		['is_approximate_to', 'approximate'],
		['intersects_with', 'intersects'],
		['no_relationship', 'none'],
	] as const)('traverses %s symmetrically without chaining', (predicate, suffix) => {
		insertMapping(db, 'example:A', predicate, 'example:B', `${suffix}-1`);
		insertMapping(db, 'example:B', predicate, 'example:C', `${suffix}-2`);

		expect(targets(closureFromConcept(db, 'example:B', predicate, 10))).toEqual([
			['example:A', 1],
			['example:C', 1],
		]);
		expect(targets(closureFromConcept(db, 'example:A', predicate, 10))).toEqual([
			['example:B', 1],
		]);
	});

	it('does not switch predicates between hops in unfiltered closure', () => {
		insertMapping(db, 'example:A', 'is_broader_than', 'example:B', 'mixed-1');
		insertMapping(db, 'example:B', 'intersects_with', 'example:D', 'mixed-2');
		insertMapping(db, 'example:D', 'is_broader_than', 'example:E', 'mixed-3');
		insertMapping(db, 'example:A', 'intersects_with', 'example:X', 'mixed-4');

		expect(targets(closureFromConcept(db, 'example:A', undefined, 10))).toEqual([
			['example:B', 1],
			['example:X', 1],
		]);
	});

	it('deduplicates explicit reverse storage and terminates on cycles', () => {
		insertMapping(db, 'example:A', 'is_equivalent_to', 'example:B', 'duplicate-1');
		insertMapping(db, 'example:B', 'is_equivalent_to', 'example:A', 'duplicate-2');
		insertMapping(db, 'example:B', 'is_equivalent_to', 'example:C', 'cycle-1');
		insertMapping(db, 'example:C', 'is_equivalent_to', 'example:A', 'cycle-2');

		expect(targets(closureFromConcept(db, 'example:A', 'is_equivalent_to', 10))).toEqual([
			['example:B', 1],
			['example:C', 1],
		]);
	});

	it('rejects unknown explicit filters before reading a matching cache partition', () => {
		db.exec(`
			INSERT INTO closure_cache_state
				(subject_id, predicate_id, computed_max_depth, computed_at)
			VALUES ('example:A', 'predicate-characteristics-v1|unknown', 99, 'old')
		`);

		expect(() => closureFromConcept(db, 'example:A', 'unknown', 1)).toThrow(
			new RangeError('Unknown Crosswalker predicate: unknown'),
		);
		expect(() =>
			precomputeClosureForOntologyPair(db, 'example', 'target', 'unknown', 1),
		).toThrow(new RangeError('Unknown Crosswalker predicate: unknown'));
	});

	it('excludes unknown stored predicates from filtered and unfiltered closure', () => {
		insertMapping(db, 'example:A', 'unknown', 'example:Ignored', 'unknown');
		insertMapping(db, 'example:A', 'is_broader_than', 'example:B', 'known');

		expect(targets(closureFromConcept(db, 'example:A', undefined, 2))).toEqual([
			['example:B', 1],
		]);
		expect(targets(closureFromConcept(db, 'example:A', 'is_broader_than', 2))).toEqual([
			['example:B', 1],
		]);
	});

	it('precomputes concepts that are subjects only through a derived inverse edge', () => {
		insertMapping(db, 'source:A', 'is_broader_than', 'target:B', 'inverse-subject');

		expect(
			precomputeClosureForOntologyPair(db, 'target', 'source', 'is_narrower_than', 2),
		).toBe(1);
		expect(
			queryRows(
				db,
				`SELECT subject_id, predicate_id FROM closure_cache_state
				 WHERE subject_id = 'target:B'`,
			),
		).toEqual([['target:B', 'predicate-characteristics-v1|is_narrower_than']]);
	});
});
