-- ================================================================
-- Crosswalker Tier 2 sidecar — sqlite-wasm projection of Tier 1
-- Schema version: tier2-sqlite-v2
--
-- Per spec/tier1.schema.json + v0.1 schema spec §7.
-- This file is the canonical DDL; the migrations module (migrations.ts)
-- reads it at sidecar-open time.
-- ================================================================

PRAGMA foreign_keys = ON;
PRAGMA synchronous = NORMAL;

-- ----------------------------------------------------------------
-- Schema-version + provenance metadata
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS schema_meta (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- ----------------------------------------------------------------
-- Ontologies — one row per ImportRecipe the vault knows about
-- ----------------------------------------------------------------
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

-- ----------------------------------------------------------------
-- Concepts — one row per Tier 1 concept-note (kind=concept default)
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS concepts (
  -- Composite key: ontology + curie local part (cross-ontology unique)
  ontology_id    TEXT NOT NULL,
  curie          TEXT NOT NULL,           -- 'nist:AC-2'
  -- Provenance
  vault_path     TEXT NOT NULL UNIQUE,    -- 'Frameworks/NIST 800-53 r5/AC/AC-2.md'
  source_hash    TEXT NOT NULL,           -- sha256 of canonical frontmatter
  -- Display
  title          TEXT NOT NULL DEFAULT '',
  -- Hierarchy
  parent_curie   TEXT,                    -- single-parent CURIE for tree
  -- Lifecycle
  status         TEXT NOT NULL DEFAULT 'active',
  -- Timestamps
  imported_at    TEXT NOT NULL,
  modified_at    TEXT NOT NULL,
  PRIMARY KEY (ontology_id, curie),
  FOREIGN KEY (ontology_id) REFERENCES ontologies(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_concepts_curie ON concepts(curie);
CREATE INDEX IF NOT EXISTS idx_concepts_parent ON concepts(parent_curie);

-- ----------------------------------------------------------------
-- Mappings — one row per crosswalk-edge note (STRM predicate triple)
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS mappings (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  -- The triple (CURIEs from spec/tier1.schema.json $defs/curie)
  subject_id      TEXT NOT NULL,
  predicate_id    TEXT NOT NULL,           -- STRM enum (validated upstream)
  object_id       TEXT NOT NULL,
  -- SSSOM envelope
  match_type      TEXT,
  match_confidence REAL,
  mapping_justification TEXT,
  mapping_provider TEXT,
  mapping_date    TEXT,
  creator_id      TEXT,
  review_status   TEXT,
  -- Provenance
  source_path     TEXT NOT NULL UNIQUE,    -- the .md file that produced this row
  source_hash     TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_mappings_pred_subj ON mappings(predicate_id, subject_id);
CREATE INDEX IF NOT EXISTS idx_mappings_pred_obj  ON mappings(predicate_id, object_id);
CREATE INDEX IF NOT EXISTS idx_mappings_subj      ON mappings(subject_id);
CREATE INDEX IF NOT EXISTS idx_mappings_obj       ON mappings(object_id);

-- ----------------------------------------------------------------
-- Junction notes — one row per evidence-link note (kind=junction-note)
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS junction_notes (
  vault_path      TEXT PRIMARY KEY,
  curie           TEXT NOT NULL,           -- 'cwk:jn-...'
  subject         TEXT NOT NULL,           -- wikilink target string
  predicate       TEXT NOT NULL,           -- open-string (NOT enum-constrained)
  object          TEXT NOT NULL,
  coverage        TEXT,                    -- full|partial|none|n/a
  reviewer        TEXT,
  review_date     TEXT,
  status          TEXT,                    -- proposed|in_review|approved|deprecated
  confidence      REAL,                    -- 0.0-1.0
  scope           TEXT,
  expires_at      TEXT,
  notes           TEXT,
  -- Provenance
  source_hash     TEXT NOT NULL,
  modified_at     TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_junction_subject ON junction_notes(subject);
CREATE INDEX IF NOT EXISTS idx_junction_object  ON junction_notes(object);
CREATE INDEX IF NOT EXISTS idx_junction_status  ON junction_notes(status);

-- ----------------------------------------------------------------
-- Junction notes with computed freshness (view)
-- ----------------------------------------------------------------
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

-- ----------------------------------------------------------------
-- Closure cache — populated lazily on first transitive query (Ch 18 §2.5)
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS closure_cache (
  subject_id      TEXT NOT NULL,
  predicate_id    TEXT NOT NULL,
  object_id       TEXT NOT NULL,
  shortest_depth  INTEGER NOT NULL,
  computed_at     TEXT NOT NULL,
  PRIMARY KEY (subject_id, predicate_id, object_id)
);

CREATE INDEX IF NOT EXISTS idx_closure_obj_pred ON closure_cache(object_id, predicate_id);

-- A row proves the corresponding cache partition was fully computed through
-- computed_max_depth. Row count alone cannot represent a valid empty closure.
CREATE TABLE IF NOT EXISTS closure_cache_state (
  subject_id         TEXT NOT NULL,
  predicate_id       TEXT NOT NULL,
  computed_max_depth INTEGER NOT NULL CHECK (computed_max_depth >= 0),
  computed_at        TEXT NOT NULL,
  PRIMARY KEY (subject_id, predicate_id)
);

-- ----------------------------------------------------------------
-- Vector embeddings (sqlite-vec, deferred until vector-feature lands)
-- ----------------------------------------------------------------
-- v0.1.5 ships sqlite-vec via sqlite-vec-wasm-demo (substrate present)
-- but does NOT yet activate vector tables. The DDL below is reserved;
-- enabled by a future milestone when the vector-search feature ships.
--
-- CREATE VIRTUAL TABLE IF NOT EXISTS concept_embeddings
--   USING vec0(embedding FLOAT[384]);
