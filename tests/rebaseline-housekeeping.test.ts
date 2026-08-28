import { TFile } from 'obsidian';
import { applyMigrations } from '../src/tier2/migrations';
import {
	resolveHousekeepingRebaselineCandidates,
	runHousekeepingRebaselineCommand,
	selectedReportPaths,
} from '../src/views/rebaseline-housekeeping';

const { DatabaseSync } = require('node:sqlite');

interface ExecOptions {
	sql: string;
	bind?: Record<string, unknown>;
	rowMode?: 'array';
	returnValue?: 'resultRows';
}

function createDb(): any {
	const sqlite = new DatabaseSync(':memory:');
	return {
		exec(input: string | ExecOptions) {
			if (typeof input === 'string') { sqlite.exec(input); return; }
			const statement = sqlite.prepare(input.sql);
			if (input.rowMode === 'array') statement.setReturnArrays(true);
			const bind = input.bind ?? {};
			if (input.returnValue === 'resultRows') {
				return Object.keys(bind).length ? statement.all(bind) : statement.all();
			}
			if (Object.keys(bind).length) statement.run(bind); else statement.run();
		},
		close: () => sqlite.close(),
	};
}

function rows(db: any, sql: string): unknown[][] {
	return db.exec({ sql, rowMode: 'array', returnValue: 'resultRows' }) as unknown[][];
}

const CURRENT = {
	reviewCid: `sha256-${'d'.repeat(64)}`,
	wording: `sha256-${'a'.repeat(64)}`,
	scope: `sha256-${'b'.repeat(64)}`,
	housekeeping: `sha256-${'c'.repeat(64)}`,
};
const OLD = {
	reviewCid: `sha256-${'e'.repeat(64)}`,
	wording: CURRENT.wording,
	scope: CURRENT.scope,
	housekeeping: `sha256-${'f'.repeat(64)}`,
};

function seed(db: any, paths = ['Evidence/one.md', 'Evidence/two.md']): void {
	db.exec(`INSERT INTO ontologies (id, name, version, base_path, recipe_id, imported_at) VALUES ('x', 'X', '1', 'Concepts', 'test', '2026-08-28T00:00:00Z')`);
	db.exec(`
		INSERT INTO concepts (
			ontology_id, curie, vault_path, source_hash, title,
			review_cid, review_wording_cid, review_scope_cid, review_housekeeping_cid,
			imported_at, modified_at
		) VALUES (
			'x', 'x:A', 'Concepts/A.md', 'source-concept', 'A',
			'${CURRENT.reviewCid}', '${CURRENT.wording}', '${CURRENT.scope}', '${CURRENT.housekeeping}',
			'2026-08-28T00:00:00Z', '2026-08-28T00:00:00Z'
		);
	`);
	for (const [index, path] of paths.entries()) {
		db.exec(`
			INSERT INTO junction_notes (
				vault_path, curie, subject, subject_curie, predicate, object,
				coverage, reviewer, review_date, status,
				reviewed_against_curie, reviewed_against_cid,
				reviewed_wording_cid, reviewed_scope_cid, reviewed_housekeeping_cid,
				source_hash, modified_at
			) VALUES (
				'${path}', 'cwk:j${index}', '[[Concepts/A]]', 'x:A', 'has_evidence', '[[Evidence/P${index}]]',
				'full', 'Reviewer ${index}', '2026-08-01T00:00:00Z', 'approved',
				'x:A', '${OLD.reviewCid}', '${OLD.wording}', '${OLD.scope}', '${OLD.housekeeping}',
				'source-${index}', '2026-08-28T00:00:00Z'
			);
		`);
	}
}

function appWithFrontmatter(db: any, paths: string[]) {
	const frontmatter = new Map<string, Record<string, any>>();
	for (const [index, path] of paths.entries()) {
		frontmatter.set(path, {
			status: 'approved',
			reviewer: `Reviewer ${index}`,
			review_date: '2026-08-01T00:00:00Z',
			coverage: 'full',
			reviewed_against: {
				curie: 'x:A',
				review_cid: OLD.reviewCid,
				review_groups: {
					wording: OLD.wording,
					scope: OLD.scope,
					housekeeping: OLD.housekeeping,
				},
			},
		});
	}
	const processFrontMatter = jest.fn(async (file: TFile, mutate: (fm: Record<string, any>) => void) => {
		// Canonical Tier 1 must be written before the derived Tier 2 row changes.
		expect(rows(db, `SELECT reviewed_against_cid FROM junction_notes WHERE vault_path='${file.path}'`))
			.toEqual([[OLD.reviewCid]]);
		mutate(frontmatter.get(file.path)!);
	});
	return {
		app: {
			vault: {
				getAbstractFileByPath: (path: string) => frontmatter.has(path) ? new TFile(path) : null,
			},
			fileManager: { processFrontMatter },
		},
		frontmatter,
		processFrontMatter,
	};
}

describe('housekeeping re-baselining', () => {
	it('extracts only selected report-row links and deduplicates them', () => {
		expect(selectedReportPaths([
			'| Link | Subject baseline | Change kind | Primary exclusion |',
			'| [[Evidence/one.md]] | `changed` | `housekeeping` | `subject-changed` |',
			'| [[Evidence/two.md|Alias]] | `changed` | `housekeeping` | `expired` |',
			'| [[Evidence/one.md]] | `changed` | `housekeeping` | `subject-changed` |',
		].join('\n'))).toEqual(['Evidence/one.md', 'Evidence/two.md']);
	});

	it('clears exactly the selected housekeeping row without changing attestation facts', async () => {
		const db = createDb();
		applyMigrations(db);
		const paths = ['Evidence/one.md', 'Evidence/two.md'];
		seed(db, paths);
		const { app, frontmatter, processFrontMatter } = appWithFrontmatter(db, paths);
		const before = JSON.parse(JSON.stringify(frontmatter.get(paths[0])!)) as Record<string, any>;
		const confirm = jest.fn(async () => true);

		const changed = await runHousekeepingRebaselineCommand({
			app: app as any,
			openTier2: async () => ({ db }),
			selection: '| [[Evidence/one.md]] | `changed` | `housekeeping` | `subject-changed` |',
			confirm,
		});

		expect(changed).toBe(1);
		expect(confirm).toHaveBeenCalledWith(1);
		expect(processFrontMatter).toHaveBeenCalledTimes(1);
		const after = frontmatter.get(paths[0])!;
		expect({
			status: after.status,
			reviewer: after.reviewer,
			review_date: after.review_date,
			coverage: after.coverage,
		}).toEqual({
			status: before.status,
			reviewer: before.reviewer,
			review_date: before.review_date,
			coverage: before.coverage,
		});
		expect(after.reviewed_against).toEqual({
			curie: 'x:A',
			review_cid: CURRENT.reviewCid,
			review_groups: {
				wording: CURRENT.wording,
				scope: CURRENT.scope,
				housekeeping: CURRENT.housekeeping,
			},
		});
		expect(frontmatter.get(paths[1])!.reviewed_against.review_cid).toBe(OLD.reviewCid);
		expect(rows(db, `
			SELECT vault_path, status, reviewer, review_date, subject_baseline, change_kind
			FROM junction_notes_with_freshness ORDER BY vault_path
		`)).toEqual([
			['Evidence/one.md', 'approved', 'Reviewer 0', '2026-08-01T00:00:00Z', 'match', null],
			['Evidence/two.md', 'approved', 'Reviewer 1', '2026-08-01T00:00:00Z', 'changed', 'housekeeping'],
		]);
		db.close();
	});

	it('resolves the whole selected batch before the first vault write', async () => {
		const db = createDb();
		applyMigrations(db);
		seed(db);
		// Only the first selected file exists in the vault. The second must be
		// discovered before processFrontMatter touches the first.
		const { app, processFrontMatter } = appWithFrontmatter(db, ['Evidence/one.md']);
		const changed = await runHousekeepingRebaselineCommand({
			app: app as any,
			openTier2: async () => ({ db }),
			selection: [
				'| [[Evidence/one.md]] | `changed` | `housekeeping` | `subject-changed` |',
				'| [[Evidence/two.md]] | `changed` | `housekeeping` | `subject-changed` |',
			].join('\n'),
			confirm: async () => true,
		});
		expect(changed).toBe(0);
		expect(processFrontMatter).not.toHaveBeenCalled();
		expect(rows(db, `SELECT COUNT(*) FROM junction_notes_with_freshness WHERE subject_baseline='changed'`))
			.toEqual([[2]]);
		db.close();
	});

	it('cancellation performs no Tier 1 or Tier 2 write', async () => {
		const db = createDb();
		applyMigrations(db);
		seed(db, ['Evidence/one.md']);
		const { app, processFrontMatter } = appWithFrontmatter(db, ['Evidence/one.md']);
		const changed = await runHousekeepingRebaselineCommand({
			app: app as any,
			openTier2: async () => ({ db }),
			selection: '[[Evidence/one.md]]',
			confirm: async () => false,
		});
		expect(changed).toBe(0);
		expect(processFrontMatter).not.toHaveBeenCalled();
		expect(rows(db, `SELECT subject_baseline, change_kind FROM junction_notes_with_freshness`))
			.toEqual([['changed', 'housekeeping']]);
		db.close();
	});

	it('rejects wording rows and incomplete current fingerprints before any write', () => {
		const db = createDb();
		applyMigrations(db);
		seed(db, ['Evidence/one.md']);
		db.exec(`UPDATE junction_notes SET reviewed_wording_cid='sha256-old-wording'`);
		expect(() => resolveHousekeepingRebaselineCandidates(db, ['Evidence/one.md']))
			.toThrow('not a housekeeping-only changed link');
		db.close();

		const incompleteDb = {
			exec: () => [[
				'Evidence/one.md', 'approved', 'changed', 'housekeeping',
				'x:A', CURRENT.reviewCid, CURRENT.wording, null, CURRENT.housekeeping,
			]],
		};
		expect(() => resolveHousekeepingRebaselineCandidates(incompleteDb, ['Evidence/one.md']))
			.toThrow('has no complete current fingerprint set');
	});

	// Regression, 2026-08-28. The command used to resolve candidates, open a
	// confirmation dialog, and then write through the SAME handle it opened
	// before the dialog. A dialog is user time and unbounded, so a reset of the
	// query index during it closed that database and deleted its file. Waiting
	// for the dialog is not an option -- that hangs the reset -- so the handle
	// must not be carried across the decision at all.
	it('does not carry the database handle across the confirmation dialog', async () => {
		const before = createDb();
		applyMigrations(before);
		const paths = ['Evidence/one.md'];
		seed(before, paths);

		// What a reset leaves behind: the old database is gone and the next
		// open hands back a fresh one.
		const after = createDb();
		applyMigrations(after);
		seed(after, paths);

		// The app helper asserts Tier 1 lands before Tier 2, and it must make
		// that check against the database the write actually goes to.
		const { app } = appWithFrontmatter(after, paths);

		let opens = 0;
		const openTier2 = async () => {
			opens += 1;
			return { db: opens === 1 ? before : after };
		};
		const confirm = jest.fn(async () => {
			before.close(); // the reset happens while the dialog is up
			return true;
		});

		const changed = await runHousekeepingRebaselineCommand({
			app: app as any,
			openTier2,
			selection: '| [[Evidence/one.md]] | `changed` | `housekeeping` | `subject-changed` |',
			confirm,
		});

		expect(opens).toBe(2);
		expect(changed).toBe(1);
		// The write landed on the live database, not the closed one.
		expect(rows(after, `SELECT reviewed_against_cid FROM junction_notes WHERE vault_path='Evidence/one.md'`))
			.toEqual([[CURRENT.reviewCid]]);
		after.close();
	});

	// The notes are canonical and the index is derived, so "the index update
	// failed" and "your re-baseline failed" are different facts. Reporting the
	// second when only the first happened invites someone to re-run an audit
	// action that already took effect.
	it('reports a recorded baseline when only the derived index update fails', async () => {
		const db = createDb();
		applyMigrations(db);
		const paths = ['Evidence/one.md'];
		seed(db, paths);
		const { app, frontmatter, processFrontMatter } = appWithFrontmatter(db, paths);

		// Fail every write to the index, leaving the note edits intact.
		const live = {
			exec: (input: any) => {
				const sql = typeof input === 'string' ? input : input.sql;
				if (/SAVEPOINT|UPDATE junction_notes/i.test(sql)) throw new Error('database is closed');
				return db.exec(input);
			},
		};
		let opens = 0;
		const openTier2 = async () => {
			opens += 1;
			return { db: opens === 1 ? db : live };
		};

		const changed = await runHousekeepingRebaselineCommand({
			app: app as any,
			openTier2,
			selection: '| [[Evidence/one.md]] | `changed` | `housekeeping` | `subject-changed` |',
			confirm: async () => true,
		});

		// Counted as done, because in the canonical record it is done.
		expect(changed).toBe(1);
		expect(processFrontMatter).toHaveBeenCalledTimes(1);
		expect(frontmatter.get('Evidence/one.md')!.reviewed_against.review_cid).toBe(CURRENT.reviewCid);
		db.close();
	});
});
