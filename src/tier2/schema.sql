-- ================================================================
-- Crosswalker Tier 2 sidecar — sqlite-wasm projection of Tier 1
-- Schema version: tier2-sqlite-v6
--
-- Per spec/tier1.schema.json + v0.1 schema spec §7.
-- This file is the canonical DDL. migrations.ts duplicates its executable
-- SQL for bundling; tests/tier2-schema-consistency.test.ts prevents drift.
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
  version         TEXT NOT NULL DEFAULT '', -- BINARY-lexical representative of concept source versions
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
  import_set_id  TEXT,                    -- owning import set; null for legacy notes
  -- Display
  title          TEXT NOT NULL DEFAULT '',
  -- Content fingerprint an attestation can be compared against (Ch 43).
  -- NULL = the producer did not compute one, which is NOT a claim of no change.
  review_cid     TEXT,
  -- Recipe-driven sub-fingerprints explain a changed review_cid. NULL means
  -- this producer predates classification; changed legacy baselines default to
  -- wording so they can never be dismissed as housekeeping without evidence.
  review_wording_cid     TEXT,
  review_scope_cid       TEXT,
  review_housekeeping_cid TEXT,
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
  import_set_id         TEXT,
  mapping_set_id        TEXT NOT NULL DEFAULT '',
  subject_id            TEXT NOT NULL,
  predicate_id          TEXT NOT NULL,
  predicate_modifier    TEXT NOT NULL DEFAULT ''
                          CHECK (predicate_modifier IN ('', 'NOT')),
  object_id             TEXT NOT NULL,
  match_type            TEXT,
  match_confidence      REAL,
  mapping_justification TEXT,
  mapping_provider      TEXT,
  mapping_date          TEXT,
  creator_id            TEXT,
  review_status         TEXT,
  source_path           TEXT NOT NULL UNIQUE,
  source_hash           TEXT NOT NULL,
  PRIMARY KEY (
    mapping_set_id,
    subject_id,
    predicate_id,
    predicate_modifier,
    object_id,
    source_path
  )
);

CREATE INDEX IF NOT EXISTS idx_mappings_assertion
  ON mappings(mapping_set_id, subject_id, predicate_id, predicate_modifier, object_id);
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
  subject_curie   TEXT,                    -- stable subject identity
  predicate       TEXT NOT NULL,           -- open-string (NOT enum-constrained)
  object          TEXT NOT NULL,
  object_curie    TEXT,                    -- stable object identity
  coverage        TEXT,                    -- full|partial|none|n/a
  reviewer        TEXT,
  review_date     TEXT,
  status          TEXT,                    -- proposed|in_review|approved|deprecated
  confidence      REAL,                    -- 0.0-1.0
  scope           TEXT,
  expires_at      TEXT,
  notes           TEXT,
  -- Review baseline (Ch 43): the subject, and its content fingerprint, as the
  -- approver read them. Both NULL together = 'unrecorded', a named state that
  -- still counts toward coverage. Never a half-record.
  reviewed_against_curie TEXT,
  reviewed_against_cid   TEXT,
  reviewed_wording_cid   TEXT,
  reviewed_scope_cid     TEXT,
  reviewed_housekeeping_cid TEXT,
  -- Provenance
  import_set_id   TEXT,
  source_hash     TEXT NOT NULL,
  modified_at     TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_junction_subject ON junction_notes(subject);
CREATE INDEX IF NOT EXISTS idx_junction_object  ON junction_notes(object);
CREATE INDEX IF NOT EXISTS idx_junction_subject_curie ON junction_notes(subject_curie);
CREATE INDEX IF NOT EXISTS idx_junction_object_curie  ON junction_notes(object_curie);
CREATE INDEX IF NOT EXISTS idx_junction_status  ON junction_notes(status);

-- ----------------------------------------------------------------
-- Junction notes with computed freshness (view)
--
-- TWO independent columns, because they answer two different questions.
-- `freshness` asks "is this still good"; `subject_baseline` asks "can we even
-- tell". A link with no recorded baseline is 'unrecorded' and STILL COUNTS --
-- an unmeasured fact is never reported as a negative one.
--
-- Branch order is load-bearing twice over:
--   1. 'not-set' sits BELOW 'subject-changed'. It fires only when expires_at
--      and review_date are both NULL, which makes the two branches above it
--      false by construction, so moving it down changes nothing for existing
--      data. Leaving it first would short-circuit content invalidation for
--      every link with no review dates -- most links in most vaults.
--   2. 'expired' beats 'subject-changed'. Both point at the same action, and
--      the one carrying a dated policy deadline the org owns is the more
--      actionable of the two. No fact is lost: subject_baseline is computed
--      independently and still reads 'changed'.
--
-- LEFT JOIN, never inner: an attestation whose subject is not in the index must
-- still appear here, or it vanishes from the coverage query AND from the
-- exclusion diagnostics at the same time -- the shape of the withdrawn-Base bug.
-- COALESCE(reviewed_against_curie, subject_curie) compares against the subject
-- AS REVIEWED, so re-pointing a link without re-approving stays detectable.
--
-- The join resolves to ONE concept row by rowid rather than matching on curie
-- directly. concepts is keyed (ontology_id, curie), so two ontologies sharing a
-- CURIE would otherwise fan this view out and DOUBLE-COUNT the junction in
-- every coverage tally built on it. Ordering by ontology_id makes the pick
-- deterministic; idx_concepts_curie covers the lookup.
-- ----------------------------------------------------------------
CREATE VIEW IF NOT EXISTS junction_notes_with_freshness AS
SELECT
  jn.*,
  CASE
    WHEN jn.expires_at IS NOT NULL
         AND jn.expires_at < strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
      THEN 'expired'
    WHEN jn.review_date IS NOT NULL
         AND jn.review_date < strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-180 days')
      THEN 'stale'
    WHEN jn.reviewed_against_cid IS NOT NULL
         AND c.review_cid IS NOT NULL
         AND c.review_cid <> jn.reviewed_against_cid
      THEN 'subject-changed'
    WHEN jn.expires_at IS NULL AND jn.review_date IS NULL
      THEN 'not-set'
    ELSE 'fresh'
  END AS freshness,
  CASE
    WHEN jn.reviewed_against_cid IS NULL         THEN 'unrecorded'
    WHEN c.curie IS NULL                         THEN 'subject-absent'
    WHEN c.review_cid IS NULL                    THEN 'subject-unhashed'
    WHEN c.review_cid <> jn.reviewed_against_cid THEN 'changed'
    ELSE 'match'
  END AS subject_baseline,
  CASE
    WHEN jn.reviewed_against_cid IS NULL
         OR c.review_cid IS NULL
         OR c.review_cid = jn.reviewed_against_cid
      THEN NULL
    -- A changed legacy baseline has no defensible per-group comparison. Classify
    -- it conservatively as wording so it cannot enter the housekeeping-dismiss
    -- path. New baselines always carry all six comparable group hashes.
    WHEN jn.reviewed_wording_cid IS NULL
         OR jn.reviewed_scope_cid IS NULL
         OR jn.reviewed_housekeeping_cid IS NULL
         OR c.review_wording_cid IS NULL
         OR c.review_scope_cid IS NULL
         OR c.review_housekeeping_cid IS NULL
      THEN 'wording'
    WHEN c.review_wording_cid <> jn.reviewed_wording_cid
      THEN 'wording'
    WHEN c.review_scope_cid <> jn.reviewed_scope_cid
      THEN 'scope'
    ELSE 'housekeeping'
  END AS change_kind
FROM junction_notes jn
LEFT JOIN concepts c
  ON c.rowid = (
    SELECT c2.rowid FROM concepts c2
    WHERE c2.curie = COALESCE(jn.reviewed_against_curie, jn.subject_curie)
    ORDER BY c2.ontology_id
    LIMIT 1
  );

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
