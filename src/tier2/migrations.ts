/**
 * Tier 2 schema migrations.
 *
 * Tier 2 currently ships `tier2-sqlite-v2`. If a sidecar reports a different
 * schema_version (or no version at all), the simplest correct response
 * is to drop all tables and recreate from canonical Tier 1. The Tier 1
 * vault is the source of truth; the sidecar is a deletable projection.
 *
 * Per spec/tier1.schema.json + v0.1 schema spec §7. Per the Ch 24
 * substrate synthesis recovery property (§2): "if .crosswalker.sqlite
 * is missing, corrupted, or stale, the projector rebuilds it from
 * canonical Tier 1 on next vault load. This is what makes Tier 2
 * risk-free to bundle in v0.1."
 */

export const TIER2_SCHEMA_VERSION = 'tier2-sqlite-v2';

/**
 * The DDL for tier2-sqlite-v2. Imported as a string at build time
 * from src/tier2/schema.sql. esbuild's `text` loader handles `.sql`
 * imports as plain strings.
 *
 * In v0.1.5 we inline the DDL here as a string because esbuild's
 * default TS pipeline doesn't auto-load .sql; explicit constants
 * keep the build simple.
 */
export const TIER2_DDL_V2 = `
PRAGMA foreign_keys = ON;
PRAGMA synchronous = NORMAL;

CREATE TABLE IF NOT EXISTS schema_meta (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS ontologies (
  id              TEXT PRIMARY KEY,
  name            TEXT NOT NULL,
  version         TEXT NOT NULL DEFAULT '',
  base_path       TEXT NOT NULL,
  upstream_url    TEXT,
  recipe_id       TEXT NOT NULL,
  imported_at     TEXT NOT NULL,
  control_count   INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS concepts (
  ontology_id    TEXT NOT NULL,
  curie          TEXT NOT NULL,
  vault_path     TEXT NOT NULL UNIQUE,
  source_hash    TEXT NOT NULL,
  title          TEXT NOT NULL DEFAULT '',
  parent_curie   TEXT,
  status         TEXT NOT NULL DEFAULT 'active',
  imported_at    TEXT NOT NULL,
  modified_at    TEXT NOT NULL,
  PRIMARY KEY (ontology_id, curie),
  FOREIGN KEY (ontology_id) REFERENCES ontologies(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_concepts_curie ON concepts(curie);
CREATE INDEX IF NOT EXISTS idx_concepts_parent ON concepts(parent_curie);

CREATE TABLE IF NOT EXISTS mappings (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  subject_id      TEXT NOT NULL,
  predicate_id    TEXT NOT NULL,
  object_id       TEXT NOT NULL,
  match_type      TEXT,
  match_confidence REAL,
  mapping_justification TEXT,
  mapping_provider TEXT,
  mapping_date    TEXT,
  creator_id      TEXT,
  review_status   TEXT,
  source_path     TEXT NOT NULL UNIQUE,
  source_hash     TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_mappings_pred_subj ON mappings(predicate_id, subject_id);
CREATE INDEX IF NOT EXISTS idx_mappings_pred_obj  ON mappings(predicate_id, object_id);
CREATE INDEX IF NOT EXISTS idx_mappings_subj      ON mappings(subject_id);
CREATE INDEX IF NOT EXISTS idx_mappings_obj       ON mappings(object_id);

CREATE TABLE IF NOT EXISTS junction_notes (
  vault_path      TEXT PRIMARY KEY,
  curie           TEXT NOT NULL,
  subject         TEXT NOT NULL,
  predicate       TEXT NOT NULL,
  object          TEXT NOT NULL,
  coverage        TEXT,
  reviewer        TEXT,
  review_date     TEXT,
  status          TEXT,
  confidence      REAL,
  scope           TEXT,
  expires_at      TEXT,
  notes           TEXT,
  source_hash     TEXT NOT NULL,
  modified_at     TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_junction_subject ON junction_notes(subject);
CREATE INDEX IF NOT EXISTS idx_junction_object  ON junction_notes(object);
CREATE INDEX IF NOT EXISTS idx_junction_status  ON junction_notes(status);

CREATE VIEW IF NOT EXISTS junction_notes_with_freshness AS
SELECT
  jn.*,
  CASE
    WHEN jn.expires_at IS NULL AND jn.review_date IS NULL THEN 'not-set'
    WHEN jn.expires_at IS NOT NULL AND jn.expires_at < strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
      THEN 'expired'
    WHEN jn.review_date IS NOT NULL
         AND jn.review_date < strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-180 days')
      THEN 'stale'
    ELSE 'fresh'
  END AS freshness
FROM junction_notes jn;

CREATE TABLE IF NOT EXISTS closure_cache (
  subject_id      TEXT NOT NULL,
  predicate_id    TEXT NOT NULL,
  object_id       TEXT NOT NULL,
  shortest_depth  INTEGER NOT NULL,
  computed_at     TEXT NOT NULL,
  PRIMARY KEY (subject_id, predicate_id, object_id)
);

CREATE INDEX IF NOT EXISTS idx_closure_obj_pred ON closure_cache(object_id, predicate_id);

CREATE TABLE IF NOT EXISTS closure_cache_state (
  subject_id         TEXT NOT NULL,
  predicate_id       TEXT NOT NULL,
  computed_max_depth INTEGER NOT NULL CHECK (computed_max_depth >= 0),
  computed_at        TEXT NOT NULL,
  PRIMARY KEY (subject_id, predicate_id)
);
`.trim();

/**
 * Read the current sidecar's schema_version; null if schema_meta
 * doesn't exist (fresh DB) or no version row.
 */
export function getCurrentSchemaVersion(db: any): string | null {
	try {
		const result = db.exec({
			sql: "SELECT value FROM schema_meta WHERE key = 'schema_version' LIMIT 1",
			rowMode: 'array',
			returnValue: 'resultRows',
		}) as unknown[][];
		if (result.length === 0) return null;
		return String(result[0][0]);
	} catch {
		// schema_meta table doesn't exist
		return null;
	}
}

/**
 * Apply the migration to bring the database to TIER2_SCHEMA_VERSION.
 *
 * Migration strategy: any version mismatch (or no version) → drop all
 * tables + recreate. This is correct because Tier 2 is purely a
 * projection of canonical Tier 1; nothing is lost on rebuild beyond
 * the cached closure (which gets recomputed on demand).
 */
export function applyMigrations(db: any): void {
	const current = getCurrentSchemaVersion(db);

	if (current === TIER2_SCHEMA_VERSION) {
		// Already at target version; nothing to do
		return;
	}

	// Tier 2 is fully derived, so every non-current state is rebuilt. This
	// deliberately includes unversioned databases: CREATE TABLE IF NOT EXISTS
	// must not preserve an old cache shape and then stamp it as current.
	db.exec(`
		DROP VIEW IF EXISTS junction_notes_with_freshness;
		DROP TABLE IF EXISTS closure_cache_state;
		DROP TABLE IF EXISTS closure_cache;
		DROP TABLE IF EXISTS junction_notes;
		DROP TABLE IF EXISTS mappings;
		DROP TABLE IF EXISTS concepts;
		DROP TABLE IF EXISTS ontologies;
		DROP TABLE IF EXISTS schema_meta;
	`);

	// Apply the v2 DDL
	db.exec(TIER2_DDL_V2);

	// Stamp the version + timestamps
	db.exec({
		sql: `
			INSERT OR REPLACE INTO schema_meta(key, value) VALUES
				('schema_version', $sv),
				('projected_at', strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
		`,
		bind: { $sv: TIER2_SCHEMA_VERSION },
	});
}
