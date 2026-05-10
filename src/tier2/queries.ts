/**
 * Tier 2 query API — typed SQL helpers for the v0.1.6 Bases query layer
 * + v0.1.7 exporters to consume.
 *
 * Per the [system architecture page Layer 4](https://cybersader.github.io/crosswalker/concepts/system-architecture/#layer-4--query-t1--t2--user):
 * Tier 2 is for queries that need joins, multi-ontology aggregation, or
 * transitive closure. Flat per-frontmatter-field queries route through
 * Bases over Tier 1 directly (no plugin needed).
 *
 * Three core helpers in v0.1.5 Phase 3:
 *   - getConceptsByOntology(db, ontologyId)
 *   - crosswalkBetween(db, subjectOntology, objectOntology, predicateId?)
 *   - closureFromConcept(db, startCurie, predicateId?, maxDepth?)
 *
 * Closure-cache materialization (Ch 18 §2.5): the first call to
 * closureFromConcept that finds the cache empty for a given query
 * computes the recursive CTE, populates the cache, and returns. Subsequent
 * calls hit the cache. Invalidation happens in the projector after any
 * mappings change.
 */

/**
 * A concept-note row (subset of Tier 2 `concepts` table).
 */
export interface ConceptRow {
	ontology_id: string;
	curie: string;
	vault_path: string;
	title: string;
	parent_curie: string | null;
	status: string;
	imported_at: string;
	modified_at: string;
}

/**
 * A crosswalk-edge row (subset of Tier 2 `mappings` table).
 */
export interface MappingRow {
	subject_id: string;
	predicate_id: string;
	object_id: string;
	match_type: string | null;
	match_confidence: number | null;
	mapping_justification: string | null;
	mapping_provider: string | null;
	source_path: string;
}

/**
 * A closure entry — a concept reachable from a starting concept via N
 * crosswalk hops. `depth` is the shortest path length (1 = direct edge).
 *
 * Semantic interpretation of the closure_cache schema columns
 * (subject_id, predicate_id, object_id):
 *   - subject_id = the START of the chain (the starting concept the
 *                  closure was queried from)
 *   - object_id  = the REACHABLE TARGET (a concept reachable from start)
 *   - predicate_id = the predicate-filter applied (or '*' if no filter)
 *   - shortest_depth = number of edges in the shortest chain start → target
 */
export interface ClosureEntry {
	/** Starting CURIE (constant across rows produced by one query). */
	start_curie: string;
	/** Predicate filter applied (or '*' for no filter). */
	predicate_filter: string;
	/** A concept reachable from start_curie. */
	target_curie: string;
	/** Number of edges in the shortest path start → target. */
	shortest_depth: number;
}

// ============================================================================
// 1. List concepts in an ontology
// ============================================================================

/**
 * All concepts in the given ontology. Returns rows ordered by curie.
 *
 * Use case: "show me all NIST 800-53 controls" — flat list. For the Bases
 * query layer (v0.1.6), this is the SQL fallback when Bases over Tier 1
 * frontmatter isn't sufficient.
 */
export function getConceptsByOntology(db: any, ontologyId: string): ConceptRow[] {
	const rows = db.exec({
		sql: `
			SELECT ontology_id, curie, vault_path, title, parent_curie, status, imported_at, modified_at
			FROM concepts
			WHERE ontology_id = $ontology_id
			ORDER BY curie
		`,
		bind: { $ontology_id: ontologyId },
		rowMode: 'array',
		returnValue: 'resultRows',
	}) as unknown[][];

	return rows.map((r) => ({
		ontology_id: String(r[0]),
		curie: String(r[1]),
		vault_path: String(r[2]),
		title: String(r[3]),
		parent_curie: r[4] === null || r[4] === undefined ? null : String(r[4]),
		status: String(r[5]),
		imported_at: String(r[6]),
		modified_at: String(r[7]),
	}));
}

// ============================================================================
// 2. Crosswalks between two ontologies (direct edges only)
// ============================================================================

/**
 * Direct crosswalk edges between two ontologies, optionally filtered by
 * STRM predicate. Does NOT compute transitive closure — for chains, use
 * closureFromConcept.
 *
 * Use case: "show me all CSF→800-53 mappings labeled is_equivalent_to."
 *
 * Subject prefix matches the ontology id (the part before ':' in the
 * subject_id CURIE). Same for object.
 */
export function crosswalkBetween(
	db: any,
	subjectOntology: string,
	objectOntology: string,
	predicateId?: string,
): MappingRow[] {
	// SQLite has no native CURIE-prefix function; use LIKE with the
	// 'prefix:' pattern. Indexed via idx_mappings_subj / idx_mappings_obj.
	const subjectLike = `${subjectOntology}:%`;
	const objectLike = `${objectOntology}:%`;

	const sql = predicateId
		? `
			SELECT subject_id, predicate_id, object_id, match_type, match_confidence,
			       mapping_justification, mapping_provider, source_path
			FROM mappings
			WHERE subject_id LIKE $subj
			  AND object_id LIKE $obj
			  AND predicate_id = $pred
			ORDER BY subject_id, object_id
		`
		: `
			SELECT subject_id, predicate_id, object_id, match_type, match_confidence,
			       mapping_justification, mapping_provider, source_path
			FROM mappings
			WHERE subject_id LIKE $subj
			  AND object_id LIKE $obj
			ORDER BY subject_id, object_id
		`;

	const bind: Record<string, unknown> = { $subj: subjectLike, $obj: objectLike };
	if (predicateId) bind.$pred = predicateId;

	const rows = db.exec({
		sql,
		bind,
		rowMode: 'array',
		returnValue: 'resultRows',
	}) as unknown[][];

	return rows.map((r) => ({
		subject_id: String(r[0]),
		predicate_id: String(r[1]),
		object_id: String(r[2]),
		match_type: r[3] === null || r[3] === undefined ? null : String(r[3]),
		match_confidence:
			r[4] === null || r[4] === undefined || r[4] === '' ? null : Number(r[4]),
		mapping_justification: r[5] === null || r[5] === undefined ? null : String(r[5]),
		mapping_provider: r[6] === null || r[6] === undefined ? null : String(r[6]),
		source_path: String(r[7]),
	}));
}

// ============================================================================
// 3. Transitive closure from a concept (recursive CTE + lazy cache)
// ============================================================================

/**
 * All concepts reachable from `startCurie` via a chain of crosswalk
 * edges, optionally filtered by predicate. Computed via recursive CTE.
 *
 * Use case: "all NIST controls that NIST CSF Identify maps to via any
 * chain of crosswalks" — the canonical Tier 2 query that's awkward over
 * raw Markdown frontmatter.
 *
 * **Lazy closure-cache behavior (Ch 18 §2.5):**
 *
 * 1. First call for a given (start, predicate, maxDepth) tuple: check
 *    `closure_cache` for matching rows. If empty (or missing for this
 *    starting CURIE), compute the recursive CTE, INSERT OR REPLACE
 *    results into `closure_cache`, return them.
 * 2. Subsequent calls: read from `closure_cache` directly.
 *
 * **Cache invalidation**: the projector (`src/tier2/projector.ts`)
 * deletes from `closure_cache` after any mappings rows change. So a
 * fresh projection invalidates all cached closures globally — simple
 * and correct (mtime-based per-row invalidation is a future
 * optimization).
 *
 * @param db sqlite-wasm OO1 DB handle
 * @param startCurie e.g. 'nist-csf:Identify' — the starting concept
 * @param predicateId e.g. 'is_equivalent_to' — optional STRM predicate filter
 * @param maxDepth max chain length (default 10; prevents runaway recursion)
 */
export function closureFromConcept(
	db: any,
	startCurie: string,
	predicateId?: string,
	maxDepth: number = 10,
): ClosureEntry[] {
	const predicateFilter = predicateId ?? '*';

	// Step 1: cache check. Cache hit = at least one row exists in
	// closure_cache for (subject_id=startCurie, predicate_id=predicateFilter).
	// The projector clears closure_cache after any mappings change, so
	// any rows present here are valid for the current Tier 2 state.
	const cached = readCache(db, startCurie, predicateFilter);
	if (cached.length > 0) {
		return cached.filter((c) => c.shortest_depth <= maxDepth);
	}

	// Step 2: compute recursive CTE.
	// Each row in the CTE encodes (start, target, depth) where start is
	// the original startCurie (constant across all rows of one query).
	// Cycle detection via delimited `path` string + `instr` membership check.
	const baseSql = predicateId
		? `
			WITH RECURSIVE
			  closure(start_curie, target, depth, path) AS (
			    SELECT
			      $start,
			      m.object_id,
			      1 AS depth,
			      '|' || $start || '|' || m.object_id || '|' AS path
			    FROM mappings m
			    WHERE m.subject_id = $start AND m.predicate_id = $pred

			    UNION ALL

			    SELECT
			      c.start_curie,
			      m.object_id,
			      c.depth + 1,
			      c.path || m.object_id || '|'
			    FROM mappings m
			    JOIN closure c ON m.subject_id = c.target
			    WHERE c.depth < $max
			      AND m.predicate_id = $pred
			      AND instr(c.path, '|' || m.object_id || '|') = 0
			  )
			SELECT start_curie, target, MIN(depth) AS shortest_depth
			FROM closure
			GROUP BY start_curie, target
			ORDER BY shortest_depth, target
		`
		: `
			WITH RECURSIVE
			  closure(start_curie, target, depth, path) AS (
			    SELECT
			      $start,
			      m.object_id,
			      1 AS depth,
			      '|' || $start || '|' || m.object_id || '|' AS path
			    FROM mappings m
			    WHERE m.subject_id = $start

			    UNION ALL

			    SELECT
			      c.start_curie,
			      m.object_id,
			      c.depth + 1,
			      c.path || m.object_id || '|'
			    FROM mappings m
			    JOIN closure c ON m.subject_id = c.target
			    WHERE c.depth < $max
			      AND instr(c.path, '|' || m.object_id || '|') = 0
			  )
			SELECT start_curie, target, MIN(depth) AS shortest_depth
			FROM closure
			GROUP BY start_curie, target
			ORDER BY shortest_depth, target
		`;

	const bind: Record<string, unknown> = { $start: startCurie, $max: maxDepth };
	if (predicateId) bind.$pred = predicateId;

	const rows = db.exec({
		sql: baseSql,
		bind,
		rowMode: 'array',
		returnValue: 'resultRows',
	}) as unknown[][];

	const entries: ClosureEntry[] = rows.map((r) => ({
		start_curie: String(r[0]),
		predicate_filter: predicateFilter,
		target_curie: String(r[1]),
		shortest_depth: Number(r[2]),
	}));

	// Step 3: populate the cache. Schema columns (subject_id, predicate_id,
	// object_id) carry semantic meaning (start, predicate-filter, target)
	// per the ClosureEntry interface comment.
	const computedAt = new Date().toISOString();
	for (const entry of entries) {
		db.exec({
			sql: `
				INSERT OR REPLACE INTO closure_cache
					(subject_id, predicate_id, object_id, shortest_depth, computed_at)
				VALUES ($subj, $pred, $obj, $depth, $at)
			`,
			bind: {
				$subj: entry.start_curie,
				$pred: entry.predicate_filter,
				$obj: entry.target_curie,
				$depth: entry.shortest_depth,
				$at: computedAt,
			},
		});
	}

	return entries;
}

/**
 * Read closure-cache rows for a starting CURIE. Returns empty array if
 * no rows match — caller treats that as "cache miss" and recomputes.
 *
 * Cache row semantics (per the ClosureEntry comment): subject_id holds
 * the START of the chain (constant for all rows of one closure query);
 * object_id holds the REACHABLE target. So `WHERE subject_id = $start`
 * returns the full closure for that starting CURIE.
 */
function readCache(db: any, startCurie: string, predicateFilter: string): ClosureEntry[] {
	const rows = db.exec({
		sql: `
			SELECT subject_id, predicate_id, object_id, shortest_depth
			FROM closure_cache
			WHERE subject_id = $start AND predicate_id = $pred
			ORDER BY shortest_depth, object_id
		`,
		bind: { $start: startCurie, $pred: predicateFilter },
		rowMode: 'array',
		returnValue: 'resultRows',
	}) as unknown[][];

	return rows.map((r) => ({
		start_curie: String(r[0]),
		predicate_filter: String(r[1]),
		target_curie: String(r[2]),
		shortest_depth: Number(r[3]),
	}));
}

/**
 * Eagerly precompute closure for every subject in a (sourceOntology, targetOntology)
 * pair (per Ch 35 — "every production ontology-web system materializes precomputed
 * pairwise crosswalks"). Called by the SSSOM importer after junction-edge files land
 * + projection runs.
 *
 * Strategy:
 *   1. Find all distinct subject_ids in `mappings` whose subject CURIE prefix matches
 *      sourceOntology.
 *   2. For each subject, call closureFromConcept (which lazy-builds + caches) so
 *      future queries hit the cache without re-running the recursive CTE.
 *   3. Return the count of (subject_id, target_id) cache rows now populated.
 *
 * Idempotent: re-running on already-cached subjects is cheap (closureFromConcept
 * checks cache before recomputing).
 *
 * @returns Total cached (subject, target) pairs after the precompute.
 */
export function precomputeClosureForOntologyPair(
	db: any,
	sourceOntology: string,
	targetOntology: string,
	predicateId?: string,
	maxDepth = 10,
): number {
	const sourcePrefix = `${sourceOntology}:`;
	const subjects = db.exec({
		sql: `
			SELECT DISTINCT subject_id FROM mappings
			WHERE subject_id LIKE $prefix || '%'
			${predicateId ? 'AND predicate_id = $pred' : ''}
		`,
		bind: predicateId
			? { $prefix: sourcePrefix, $pred: predicateId }
			: { $prefix: sourcePrefix },
		rowMode: 'array',
		returnValue: 'resultRows',
	}) as unknown[][];

	for (const row of subjects) {
		const subjectId = String(row[0]);
		// closureFromConcept lazy-builds + caches; discard the rows, we want the
		// side-effect of populating closure_cache.
		closureFromConcept(db, subjectId, predicateId, maxDepth);
	}

	const count = db.exec({
		sql: `
			SELECT COUNT(*) FROM closure_cache cc
			WHERE cc.subject_id LIKE $sourcePrefix || '%'
			  AND cc.object_id LIKE $targetPrefix || '%'
		`,
		bind: { $sourcePrefix: sourcePrefix, $targetPrefix: `${targetOntology}:` },
		rowMode: 'array',
		returnValue: 'resultRows',
	}) as unknown[][];

	return Number(count[0]?.[0] ?? 0);
}
