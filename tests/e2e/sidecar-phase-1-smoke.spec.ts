/**
 * sidecar-phase-1-smoke.spec.ts — Phase 1 substrate-scaffolding smoke test
 *
 * Verifies that v0.1.5 Phase 1 substrate is wired correctly (WASM-A path):
 *   1. sqlite3.wasm artifact is present in plugin folder
 *   2. plugin.openTier2() succeeds without throwing
 *   3. sqlite-wasm DB is operational (SELECT 1 returns 1)
 *   4. sqlite_version() returns a real version string (smoke check that
 *      the runtime is fully initialized — sqlite-vec deferred per Ch 24
 *      §5 Q4, revisit by 2026-11-06)
 *   5. Schema migrations applied (schema_meta reaches the CURRENT authoritative
 *      version, `TIER2_SCHEMA_VERSION` from src/tier2/migrations.ts)
 *   6. clear-tier-2-sidecar command exists and registers
 *
 * NOT a milestone gate (that's the bigger sidecar.spec.ts in Phase 5).
 * This is a Phase-1-specific smoke test to confirm the substrate stands up.
 */

import { browser } from '@wdio/globals';
import { expect } from 'expect';
// Compare against the exported constant, never a hard-coded literal. The old
// `tier2-sqlite-v2` expectation survived two schema migrations and reported
// test rot as a substrate failure (triage 2026-08-24 §4 B2). migrations.ts has
// no imports of its own, so pulling it in Node-side costs nothing.
import { TIER2_SCHEMA_VERSION } from '../../src/tier2/migrations';

describe('Crosswalker plugin — v0.1.5 Phase 1 substrate scaffolding (smoke)', function () {
	this.timeout(120000);

	it('sqlite3.wasm artifact is present in plugin folder', async () => {
		const found = await browser.executeObsidian(async ({ app }) => {
			// @ts-expect-error - internal plugin lookup
			const plugin = app.plugins.plugins['crosswalker'];
			const pluginPath = `${app.vault.configDir}/plugins/${plugin.manifest.id}`;
			const wasmExists = await app.vault.adapter.exists(`${pluginPath}/sqlite3.wasm`);
			return { wasmExists };
		});
		expect(found.wasmExists).toBe(true);
	});

	it('plugin.openTier2() opens the sidecar without throwing', async () => {
		const result = await browser.executeObsidian(async ({ app }) => {
			// @ts-expect-error - internal plugin lookup
			const plugin = app.plugins.plugins['crosswalker'];
			if (typeof plugin.openTier2 !== 'function') {
				return { ok: false, error: 'plugin.openTier2 not exposed' };
			}
			try {
				const handle = await plugin.openTier2();
				return {
					ok: true,
					hasDb: !!handle.db,
					sidecarPath: handle.sidecarPath,
					sqliteVersion: handle.sqliteVersion(),
				};
			} catch (err: any) {
				return { ok: false, error: err?.message ?? String(err) };
			}
		});

		if (!result.ok) console.log('openTier2 result:', JSON.stringify(result));
		expect(result.ok).toBe(true);
		expect(result.hasDb).toBe(true);
		expect(typeof result.sidecarPath).toBe('string');
		expect(typeof result.sqliteVersion).toBe('string');
		// SQLite returns a version like '3.53.0' or similar
		expect(result.sqliteVersion.length).toBeGreaterThan(0);
		expect(result.sqliteVersion.startsWith('(error')).toBe(false);
	});

	it('sqlite-wasm DB is operational — SELECT 1 returns 1', async () => {
		const value = await browser.executeObsidian(async ({ app }) => {
			// @ts-expect-error - internal plugin lookup
			const plugin = app.plugins.plugins['crosswalker'];
			const handle = await plugin.openTier2();
			const rows = handle.db.exec({
				sql: 'SELECT 1 AS v',
				rowMode: 'array',
				returnValue: 'resultRows',
			}) as unknown[][];
			return rows[0]?.[0] ?? null;
		});

		// sqlite-wasm returns 1 as either number or BigInt depending on flags
		expect(Number(value)).toBe(1);
	});

	it('schema migrations applied — schema_meta reports the current authoritative version', async () => {
		const version = await browser.executeObsidian(async ({ app }) => {
			// @ts-expect-error - internal plugin lookup
			const plugin = app.plugins.plugins['crosswalker'];
			const handle = await plugin.openTier2();
			const rows = handle.db.exec({
				sql: "SELECT value FROM schema_meta WHERE key = 'schema_version' LIMIT 1",
				rowMode: 'array',
				returnValue: 'resultRows',
			}) as unknown[][];
			return rows[0]?.[0] ?? null;
		});

		// The assertion is "migration reaches the current version", not "v2 forever".
		expect(version).toBe(TIER2_SCHEMA_VERSION);
	});

	it('all expected tables exist after migration', async () => {
		const tables = await browser.executeObsidian(async ({ app }) => {
			// @ts-expect-error - internal plugin lookup
			const plugin = app.plugins.plugins['crosswalker'];
			const handle = await plugin.openTier2();
			const rows = handle.db.exec({
				sql: "SELECT name FROM sqlite_master WHERE type IN ('table','view') ORDER BY name",
				rowMode: 'array',
				returnValue: 'resultRows',
			}) as unknown[][];
			return rows.map((r) => String(r[0]));
		});

		const expectedTables = [
			'closure_cache',
			'closure_cache_state',
			'concepts',
			'junction_notes',
			'junction_notes_with_freshness',
			'mappings',
			'ontologies',
			'schema_meta',
		];
		for (const t of expectedTables) {
			if (!tables.includes(t)) console.log('Missing table:', t, 'in', JSON.stringify(tables));
			expect(tables).toContain(t);
		}
	});

	it('clear-tier-2-sidecar command is registered', async () => {
		const found = await browser.executeObsidian(async ({ app }) => {
			// @ts-expect-error - private API
			const cmd = app.commands.commands['crosswalker:clear-tier-2-sidecar'];
			return !!cmd;
		});
		expect(found).toBe(true);
	});
});
