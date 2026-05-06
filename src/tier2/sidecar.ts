/**
 * Tier 2 sidecar lifecycle.
 *
 * Initializes sqlite-wasm using the OPFS sahpool VFS, opens the
 * .crosswalker.sqlite file at vault root, applies schema migrations,
 * and returns a handle for the projector + query API.
 *
 * **WASM packaging** (decided 2026-05-06 after WASM-B integration
 * attempt): v0.1.5 ships **WASM-A** — plain `@sqlite.org/sqlite-wasm`
 * (no sqlite-vec). The official SQLite-team build is hardened for
 * Electron's hybrid `window`+`process` renderer environment via
 * well-established Obsidian-plugin precedent. WASM-B (sqlite-vec
 * compiled in via sqlite-vec-wasm-demo) hit 5 emscripten env-detection
 * issues in succession during integration; the demo artifact assumes
 * pure-browser semantics that Electron's renderer doesn't satisfy.
 *
 * **Vector layer (sqlite-vec) — deferred + revisit-by 2026-11-06**.
 * Tracked in Ch 24 §5 Q4 as a date-bound revisit. Most-likely
 * resolution paths: (1) `@sqlite.org/sqlite-wasm` ships sqlite-vec
 * compiled in; (2) Alex Garcia ships a production-quality
 * `sqlite-vec-wasm` separate from the demo. Either makes integration
 * ~30 min instead of multi-day. Schema reserves `concept_embeddings`
 * vec0 virtual table commented out so vec lands additively.
 *
 * Per [Ch 23 §9.5](https://cybersader.github.io/crosswalker/agent-context/zz-log/2026-05-04-bundle-engine-language-synthesis/), Web
 * Workers are unreliable for this workload — sqlite-wasm runs on the
 * main thread with cooperative yielding handled by the projector.
 */

import { App, Plugin, normalizePath } from 'obsidian';

/**
 * Handle returned from openSidecar(). Wraps the sqlite-wasm
 * connection + provides lifecycle methods.
 *
 * The `db` field is intentionally typed loosely (`any`) because
 * sqlite-wasm's TypeScript types are brittle across versions and
 * the API surface we use is small + well-known. Wrapping helpers
 * in projector.ts/queries.ts narrow the surface area.
 */
export interface SidecarHandle {
	/** Underlying sqlite-wasm OO1 DB instance. */
	db: any;
	/** Path within the vault where the .crosswalker.sqlite lives. */
	sidecarPath: string;
	/** Close the sqlite handle (commits + flushes OPFS). */
	close(): Promise<void>;
	/**
	 * Returns the SQLite library version for diagnostics.
	 * v0.1.5 ships plain sqlite-wasm; sqlite-vec is deferred — see Ch 24
	 * §5 Q4 for the date-bound revisit (2026-11-06).
	 */
	sqliteVersion(): string;
}

let cachedSqlite3: any = null;

/**
 * Initialize the sqlite-wasm runtime once per plugin lifetime.
 * Subsequent calls return the cached module.
 *
 * `@sqlite.org/sqlite-wasm` ships an Electron-compatible build (no
 * env-detection throws on hybrid `window`+`process` renderer
 * environments), so loading is straightforward: copy the .wasm to
 * the plugin folder, point locateFile at it via Obsidian's
 * getResourcePath URL.
 */
async function initSqlite3(plugin: Plugin): Promise<any> {
	if (cachedSqlite3) return cachedSqlite3;

	const pluginPath = `${plugin.app.vault.configDir}/plugins/${plugin.manifest.id}`;
	const mjsPath = `${pluginPath}/sqlite3.mjs`;
	const wasmPath = `${pluginPath}/sqlite3.wasm`;

	// Read the .wasm bytes — passed directly to sqlite3InitModule via
	// `wasmBinary` to avoid any fetch path through app:// URLs.
	const wasmBytes = await plugin.app.vault.adapter.readBinary(wasmPath);

	// Read the .mjs as text and load it via Blob URL. Obsidian's app://
	// URLs can't be dynamic-imported as ES modules, but Blob URLs can.
	// The official @sqlite.org/sqlite-wasm has no env-detection traps,
	// so this is a simple Blob URL load with no patches needed.
	const mjsText = await plugin.app.vault.adapter.read(mjsPath);
	const mjsBlob = new Blob([mjsText], { type: 'application/javascript' });
	const mjsBlobUrl = URL.createObjectURL(mjsBlob);

	let mod: any;
	try {
		mod = await import(/* @vite-ignore */ /* webpackIgnore: true */ mjsBlobUrl);
	} finally {
		URL.revokeObjectURL(mjsBlobUrl);
	}
	const sqlite3InitModule = mod.default ?? mod.sqlite3InitModule ?? mod;

	cachedSqlite3 = await sqlite3InitModule({
		// Pass the .wasm bytes directly — bypasses fetch entirely.
		wasmBinary: new Uint8Array(wasmBytes),
		locateFile: (filename: string) => {
			return plugin.app.vault.adapter.getResourcePath(`${pluginPath}/${filename}`);
		},
		print: () => {},
		printErr: (msg: string) => {
			if (msg && !msg.includes('OPFS')) console.warn('[crosswalker tier2]', msg);
		},
	});

	return cachedSqlite3;
}

/**
 * Open (or create + initialize) the Tier 2 sidecar at .crosswalker.sqlite
 * in the vault root.
 *
 * Uses the OPFS sahpool VFS (works on Capacitor without COOP/COEP,
 * per Ch 24 §4 mobile-portable path). On desktop Electron, OPFS is
 * available via Chromium; on mobile Capacitor it's available via the
 * Capacitor WebView's OPFS implementation.
 *
 * Schema migrations are applied at open time per migrations.ts.
 */
export async function openSidecar(
	plugin: Plugin,
	app: App,
	options: { sidecarPath?: string } = {},
): Promise<SidecarHandle> {
	const sqlite3 = await initSqlite3(plugin);
	const sidecarPath = normalizePath(options.sidecarPath ?? '.crosswalker.sqlite');

	// OPFS sahpool VFS is registered by sqlite-wasm at init when available.
	// We open the database via the OPFS path. sqlite-wasm exposes the OO1
	// DB API at sqlite3.oo1.DB.
	let db: any;
	try {
		// Prefer the OPFS sahpool VFS (mobile-portable; no COOP/COEP needed).
		const installer = sqlite3.installOpfsSAHPoolVfs ?? sqlite3.installOpfsVfs;
		if (installer && typeof installer === 'function') {
			await installer({});
		}

		// Open the database. The vault path is relative to the OPFS root
		// (which sqlite-wasm sees as its filesystem). For v0.1.5 we put
		// it at the OPFS root with the sidecar name.
		db = new sqlite3.oo1.DB({
			filename: `file:${sidecarPath}?vfs=opfs-sahpool`,
			flags: 'ct',
		});
	} catch (err) {
		// Fall back to in-memory if OPFS isn't available (test environments,
		// sandbox restrictions). Data won't persist across reload but the
		// engine still works — projector reprojects from canonical Tier 1
		// per Ch 24 §2 recovery property.
		console.warn('[crosswalker tier2] OPFS unavailable; falling back to in-memory sidecar', err);
		db = new sqlite3.oo1.DB(':memory:');
	}

	// Apply schema migrations (drops + recreates if version mismatch)
	const { applyMigrations } = await import('./migrations');
	applyMigrations(db);

	const sqliteVersion = (): string => {
		try {
			const rows = db.exec({
				sql: 'SELECT sqlite_version()',
				rowMode: 'array',
				returnValue: 'resultRows',
			}) as unknown[][];
			if (rows.length === 0) return '(unknown)';
			return String(rows[0][0]);
		} catch (err) {
			return `(error: ${(err as Error).message})`;
		}
	};

	return {
		db,
		sidecarPath,
		sqliteVersion,
		async close() {
			try {
				db.close();
			} catch {
				// best-effort close; OPFS sahpool flushes on close
			}
		},
	};
}

/**
 * Convenience: delete the sidecar file from OPFS (used by the
 * `clear-sidecar` command). The next openSidecar() call will
 * recreate the file fresh and the projector will reproject from
 * canonical Tier 1.
 */
export async function clearSidecar(plugin: Plugin, sidecarPath: string = '.crosswalker.sqlite'): Promise<void> {
	const sqlite3 = await initSqlite3(plugin);
	const path = normalizePath(sidecarPath);
	// sqlite-wasm exposes an OPFS unlink; if not available, recreate-on-open
	// will overwrite anyway.
	const opfsUnlink = sqlite3?.opfs?.unlink;
	if (typeof opfsUnlink === 'function') {
		try {
			await opfsUnlink(path);
		} catch {
			// Best-effort; treat unlink-failed-because-missing as success.
		}
	}
}
