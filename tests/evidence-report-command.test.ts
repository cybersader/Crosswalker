/**
 * evidence-report-command.test.ts — the seam between the pure report and the
 * vault (2026-08-21).
 *
 * Covers the behaviours that decide whether the command is usable rather than
 * merely correct: it must overwrite in place so re-running does not litter the
 * vault, it must create its folder rather than failing on a fresh install, and
 * its chooser must not show a count that disagrees with the report it opens.
 */

import { applyMigrations } from '../src/tier2/migrations';
import {
	evidenceReportPath,
	listOntologiesForReport,
	runEvidenceReportCommand,
	writeEvidenceReport,
} from '../src/views/evidence-report-command';

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

function seedOntology(db: TestDb, id: string, conceptCuries: string[]): void {
	db.exec({
		sql: `INSERT OR IGNORE INTO ontologies (id, name, base_path, recipe_id, imported_at)
		      VALUES ($id, $id, 'Frameworks', 'test', '2026-08-21')`,
		bind: { $id: id },
	});
	for (const curie of conceptCuries) {
		db.exec({
			sql: `INSERT INTO concepts (ontology_id, curie, vault_path, source_hash, title, status, imported_at, modified_at)
			      VALUES ($o, $c, $p, 'h', $c, 'active', '2026-08-21', '2026-08-21')`,
			bind: { $o: id, $c: curie, $p: `Frameworks/${id}/${curie}.md` },
		});
	}
}

/** Minimal vault: records created folders and file contents. */
function mockApp() {
	const files = new Map<string, string>();
	const folders = new Set<string>();
	const opened: string[] = [];
	return {
		files,
		folders,
		opened,
		vault: {
			getAbstractFileByPath: (path: string) => {
				if (folders.has(path)) return { path };
				// TFile detection in the code under test uses instanceof TFile,
				// which the obsidian mock maps onto this shape.
				return files.has(path) ? Object.assign(Object.create(TFileProto), { path }) : null;
			},
			createFolder: async (path: string) => { folders.add(path); },
			create: async (path: string, data: string) => { files.set(path, data); },
			modify: async (file: { path: string }, data: string) => { files.set(file.path, data); },
			// The writer now READS an existing note before replacing it (AM-17
			// sweep): a report may only overwrite a note that says it is a
			// generated report. A double with no reader would make every re-run
			// look like a stranger's note.
			read: async (file: { path: string }) => files.get(file.path) ?? '',
			cachedRead: async (file: { path: string }) => files.get(file.path) ?? '',
		},
		workspace: {
			getLeaf: () => ({ openFile: async (file: { path: string }) => { opened.push(file.path); } }),
		},
	};
}

// The obsidian test mock exports TFile; instances must satisfy `instanceof`.
const { TFile } = require('obsidian');
const TFileProto = TFile.prototype;

describe('report path', () => {
	it('is stable for one ontology so re-runs replace rather than accumulate', () => {
		expect(evidenceReportPath('Reports', 'nist-800-53'))
			.toBe(evidenceReportPath('Reports', 'nist-800-53'));
	});

	it('strips characters that are illegal in a filename', () => {
		expect(evidenceReportPath('Reports', 'a/b:c')).not.toMatch(/[:*?"<>|]/);
	});
});

describe('ontology chooser', () => {
	let db: TestDb;
	beforeEach(() => { db = createTestDb(); applyMigrations(db as any); });
	afterEach(() => db.close());

	it('counts concepts actually projected, not a stored total', () => {
		// ontologies.control_count is a stored number that can drift from the
		// rows present. A chooser disagreeing with its own report erodes trust
		// in both.
		seedOntology(db, 'nist-800-53', ['nist:AC-1', 'nist:AC-2']);
		db.exec("UPDATE ontologies SET control_count = 999 WHERE id = 'nist-800-53'");
		expect(listOntologiesForReport(db)[0].conceptCount).toBe(2);
	});

	it('still lists an ontology whose concepts have not been projected yet', () => {
		// Otherwise a partially-projected vault silently offers no frameworks
		// and the user concludes the import failed.
		seedOntology(db, 'cis-v8', []);
		expect(listOntologiesForReport(db).map((o) => o.id)).toEqual(['cis-v8']);
	});

	it('lists every ontology in a stable order', () => {
		seedOntology(db, 'nist-800-53', ['nist:AC-1']);
		seedOntology(db, 'cis-v8', ['cis:1.1']);
		expect(listOntologiesForReport(db).map((o) => o.id)).toEqual(['cis-v8', 'nist-800-53']);
	});
});

describe('writing the report', () => {
	let db: TestDb;
	beforeEach(() => { db = createTestDb(); applyMigrations(db as any); });
	afterEach(() => db.close());

	function deps(app: ReturnType<typeof mockApp>) {
		return {
			app: app as any,
			openTier2: async () => ({ db }),
			reportFolder: 'Reports',
			now: () => new Date('2026-08-21T12:00:00.000Z'),
		};
	}

	it('creates the report folder when it does not exist yet', async () => {
		// A fresh vault has no Reports/. Failing here would make the command
		// look broken on first use, which is the only run that matters.
		seedOntology(db, 'nist-800-53', ['nist:AC-1']);
		const app = mockApp();
		await writeEvidenceReport(deps(app), 'nist-800-53');
		expect(app.folders.has('Reports')).toBe(true);
	});

	it('writes a report naming the uncovered control', async () => {
		seedOntology(db, 'nist-800-53', ['nist:AC-1']);
		const app = mockApp();
		const path = await writeEvidenceReport(deps(app), 'nist-800-53');
		expect(app.files.get(path)).toContain('nist:AC-1');
		expect(app.files.get(path)).toContain('Controls with no valid evidence');
	});

	it('overwrites the same note on re-run instead of creating a second one', async () => {
		seedOntology(db, 'nist-800-53', ['nist:AC-1']);
		const app = mockApp();
		await writeEvidenceReport(deps(app), 'nist-800-53');
		await writeEvidenceReport(deps(app), 'nist-800-53');
		expect(app.files.size).toBe(1);
	});

	it('refuses to replace a note it did not generate, and says what to do', async () => {
		// AM-17 sweep (2026-08-31). `reportFolder` is a user SETTING and the
		// filename is derived from an ontology id, so a note of the user's own can
		// legitimately sit at exactly this path -- and it was being replaced in
		// full, the same failure the evidence-link window carried. A report has no
		// curie, so the identity it is checked against is the marker it stamps on
		// itself.
		seedOntology(db, 'nist-800-53', ['nist:AC-1']);
		const app = mockApp();
		const path = evidenceReportPath('Reports', 'nist-800-53');
		const mine = '---\ntitle: My own coverage notes\n---\nWork in progress.\n';
		app.files.set(path, mine);

		await expect(writeEvidenceReport(deps(app), 'nist-800-53')).rejects.toThrow(/did not generate/);
		// Untouched, byte for byte.
		expect(app.files.get(path)).toBe(mine);
	});

	it('still replaces its own previous report, which is what re-running is for', async () => {
		// The control for the case above. A guard that refused everything would
		// make the command a one-shot, and the refusal test would pass for the
		// wrong reason.
		seedOntology(db, 'nist-800-53', ['nist:AC-1']);
		const app = mockApp();
		const path = await writeEvidenceReport(deps(app), 'nist-800-53');
		expect(app.files.get(path)).toContain('crosswalker_generated: true');
		await expect(writeEvidenceReport(deps(app), 'nist-800-53')).resolves.toBe(path);
		expect(app.files.size).toBe(1);
	});

	it('reports an unknown index freshness rather than implying it is current', async () => {
		// Nothing has projected in this database, so no stamp exists.
		seedOntology(db, 'nist-800-53', ['nist:AC-1']);
		const app = mockApp();
		const path = await writeEvidenceReport(deps(app), 'nist-800-53');
		expect(app.files.get(path)).toContain('freshness unknown');
	});

	it('refreshes report data before deciding whether an imported framework exists', async () => {
		const app = mockApp();
		let refreshed = false;
		await runEvidenceReportCommand({
			...deps(app),
			refreshForReport: async () => {
				refreshed = true;
				seedOntology(db, 'nist-800-53', ['nist-800-53:AC-1']);
				return { success: true, errors: [] };
			},
		});
		expect(refreshed).toBe(true);
		expect(app.files.has('Reports/Evidence coverage - nist-800-53.md')).toBe(true);
		expect(app.opened).toEqual(['Reports/Evidence coverage - nist-800-53.md']);
	});
});
