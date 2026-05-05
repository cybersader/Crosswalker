/**
 * Crosswalker Configuration Types
 *
 * Defines the schema for import configurations.
 */

// ============================================================================
// Top-Level Config
// ============================================================================

export interface ImportRecipe {
	// Metadata
	name: string;
	version: string;
	description?: string;

	// Source
	source: SourceConfig;

	// Transformations (per-column)
	transforms: Record<string, TransformRule[]>;

	// Mapping (structure)
	mapping: MappingConfig;

	// Output
	output: OutputConfig;
}

// ============================================================================
// Source Config
// ============================================================================

export interface SourceConfig {
	type: 'csv' | 'xlsx' | 'json';

	// For XLSX
	sheet?: string;
	headerRow?: number;

	// For JSON
	rootPath?: string;

	// Common
	encoding?: string;
	delimiter?: string;
}

// ============================================================================
// Transform Rules
// ============================================================================

export interface TransformRule {
	type: TransformType;
	params?: Record<string, any>;
}

export type TransformType =
	// String operations
	| 'trim'
	| 'lowercase'
	| 'uppercase'
	| 'titlecase'
	| 'replace'
	| 'regex_extract'
	| 'prefix'
	| 'suffix'
	| 'template'

	// Array operations
	| 'split'
	| 'join'
	| 'unique'
	| 'filter'
	| 'first'
	| 'last'
	| 'map'

	// Type conversions
	| 'to_number'
	| 'to_boolean'
	| 'to_date'
	| 'to_tags'
	| 'to_wikilinks'

	// Conditional
	| 'if_empty'
	| 'if_matches'
	| 'coalesce'
	| 'lookup'

	// Custom
	| 'custom';

// ============================================================================
// Mapping Config
// ============================================================================

export interface MappingConfig {
	hierarchy: HierarchyMapping[];
	frontmatter: FrontmatterMapping[];
	links: LinkMapping[];
	body: BodyMapping[];
	filename: FilenameConfig;
}

export interface HierarchyMapping {
	column: string;
	level: number;
	transform?: TransformRule[];
}

export interface FrontmatterMapping {
	column: string;
	key: string;
	format?: 'string' | 'number' | 'boolean' | 'array' | 'date';
	transform?: TransformRule[];
	nested?: string;
	omitIfEmpty?: boolean;
}

export interface LinkMapping {
	column: string;
	type: 'wikilink' | 'markdown';
	location: 'frontmatter' | 'body' | 'both';
	frontmatterKey?: string;
	bodySection?: string;
	transform?: TransformRule[];
	targetFramework?: string;
	matchPattern?: string;
}

export interface BodyMapping {
	column: string;
	heading?: string;
	format?: 'text' | 'code' | 'quote' | 'list';
	transform?: TransformRule[];
}

export interface FilenameConfig {
	template: string;
	sanitize: boolean;
	maxLength?: number;
	transform?: TransformRule[];
}

// ============================================================================
// Output Config
// ============================================================================

export interface OutputConfig {
	basePath: string;
	createFolders: boolean;
	overwrite: 'skip' | 'replace' | 'merge' | 'error';

	frontmatter: {
		style: 'flat' | 'nested';
		quoteStrings: boolean;
		arrayStyle: 'flow' | 'block';
	};
}

// ============================================================================
// Parsed Data (from source files)
// ============================================================================

/**
 * Type guard — checks if a ParsedData's rows are an eager array (the
 * wizard preview / config-matching / column-analysis path) vs an
 * AsyncIterable (the streaming-import path).
 *
 * Code that needs random access (`.slice()`, `[index]`, `.map()`,
 * `.length`) should narrow via this guard before operating on rows.
 * Streaming consumers iterate via `for await ... of` which works on
 * both forms.
 */
export function isEagerRows(
	rows: Record<string, any>[] | AsyncIterable<Record<string, any>>,
): rows is Record<string, any>[] {
	return Array.isArray(rows);
}

/**
 * ParsedData — the bundled engine's structured-row input shape.
 *
 * `rows` may be either:
 *  - An eager array (small/medium data — wizard preview, in-memory imports)
 *  - An AsyncIterable (true streaming — large files via PapaParse step callback,
 *    external pipes from ChunkyCSV/JSONaut, etc.)
 *
 * The generation engine consumes either form via `for await ... of`.
 *
 * Per the [2026-05-05 two-mode architecture decision](https://cybersader.github.io/crosswalker/agent-context/zz-log/2026-05-05-two-mode-architecture/):
 * external producers can hand a ParsedData with AsyncIterable rows directly to
 * the bundled engine via `plugin.runImportFromRecipe()`, enabling
 * streaming-by-design composition with external ETL tools.
 *
 * NOT a tier or persisted format. Implementation detail of Mode 1 (bundled
 * projector). External producers that emit Tier 1 directly (Mode 2) never
 * touch this interface.
 */
export interface ParsedData {
	columns: string[];
	rows: Record<string, any>[] | AsyncIterable<Record<string, any>>;
	sheetName?: string;
	/** Total row count if known. -1 (or undefined) if streaming and count is unknown. */
	rowCount: number;
}

export interface ColumnInfo {
	name: string;
	sampleValues: any[];
	detectedType: 'string' | 'number' | 'boolean' | 'array' | 'mixed';
	hasEmptyValues: boolean;
	uniqueCount: number;
}

// ============================================================================
// Saved Configuration (for persistence & sharing)
// ============================================================================

/**
 * Current schema version for SavedConfig.
 * Increment this when making breaking changes to the schema.
 * See https://cybersader.github.io/crosswalker/agent-context/config-schema-design/ for migration strategy.
 */
export const SAVED_CONFIG_SCHEMA_VERSION = 1;

/**
 * A saved import configuration that can be reused across imports.
 *
 * Design principle: Configs are SUGGESTIONS, not mandates.
 * They pre-fill the wizard but users can always modify.
 *
 * See https://cybersader.github.io/crosswalker/agent-context/config-schema-design/ for full design documentation.
 */
export interface SavedConfig {
	/**
	 * Schema version for future migrations.
	 * When loading old configs, check this and run migrations if needed.
	 */
	schemaVersion: number;

	// ---- Metadata ----

	/** Unique identifier (generated, not user-editable) */
	id: string;

	/** User-friendly display name */
	name: string;

	/** Optional description explaining what this config is for */
	description?: string;

	/** ISO timestamp when config was created */
	createdAt: string;

	/** ISO timestamp when config was last modified */
	updatedAt: string;

	/** ISO timestamp when config was last used (for recency ranking) */
	lastUsedAt?: string;

	// ---- Fingerprint (for auto-matching) ----

	/**
	 * Fingerprint data used to automatically suggest this config
	 * when a user loads a file with similar characteristics.
	 */
	fingerprint: ConfigFingerprint;

	// ---- The Actual Configuration ----

	/**
	 * Partial ImportRecipe - merged with defaults when applied.
	 * Being Partial allows configs to only specify what they care about.
	 */
	config: Partial<ImportRecipe>;
}

/**
 * Fingerprint data for smart config matching.
 *
 * When a user loads a file, we create a fingerprint from the parsed data
 * and compare it against saved config fingerprints to suggest matches.
 *
 * Match scoring (see config-schema-design KB page):
 * - Exact column name match: 40%
 * - Normalized column match: 15%
 * - Column count similarity: 10%
 * - Source type match: 5%
 * - Data pattern match: 15%
 * - Filename pattern match: 10%
 * - Recency bonus: 5%
 */
export interface ConfigFingerprint {
	// ---- Column Matching ----

	/** Original column names exactly as they appear in the source file */
	columnNames: string[];

	/**
	 * Normalized column names for fuzzy matching.
	 * Lowercase, trimmed, special chars replaced with underscores.
	 * e.g., "Control ID" -> "control_id"
	 */
	columnNamesNormalized: string[];

	/** Number of columns (for quick filtering) */
	columnCount: number;

	// ---- Data Pattern Hints ----

	/**
	 * Patterns detected in sample data, used for smarter matching.
	 * e.g., detecting "AC-1", "AC-2" pattern suggests NIST control IDs.
	 */
	samplePatterns?: {
		/** Column where pattern was detected */
		column: string;
		/** Regex pattern (as string) */
		pattern: string;
		/** Example values that matched the pattern */
		examples: string[];
	}[];

	// ---- Source File Hints ----

	/** Type of source file this config was created from */
	sourceType?: 'csv' | 'xlsx' | 'json';

	/**
	 * Glob-like pattern for filename matching.
	 * e.g., "*nist*800-53*" matches "NIST_800-53_rev5.csv"
	 */
	fileNamePattern?: string;

	// ---- Future Extensions (documented but not implemented) ----
	// columnAliases?: Record<string, string[]>;  // {"Control ID": ["ctrl_id", "id"]}
}

/**
 * Result of applying a saved config to parsed data.
 * Used to show warnings/info to the user about what matched and what didn't.
 */
export interface ConfigApplicationResult {
	/** Whether the config was successfully applied */
	applied: boolean;

	/** The config that was applied */
	config: SavedConfig;

	/** Columns that matched between config and file */
	matchedColumns: string[];

	/** Columns the config expected but file doesn't have */
	missingColumns: string[];

	/** Columns in file that config doesn't mention (will default to Skip) */
	extraColumns: string[];

	/** Columns that matched via fuzzy matching (user should confirm) */
	fuzzyMatches: {
		configColumn: string;
		fileColumn: string;
		similarity: number;
	}[];

	/** Warning messages to display to user */
	warnings: string[];
}

// ============================================================================
// Generation Result
// ============================================================================

export interface GeneratedNote {
	path: string;
	fileName: string;
	frontmatter: Record<string, any>;
	content: string;
	links: WikiLink[];
}

export interface WikiLink {
	target: string;
	alias?: string;
	metadata?: Record<string, any>;
}

export interface GenerationResult {
	success: boolean;
	created: string[];
	skipped: string[];
	errors: GenerationError[];
	duration: number;
}

export interface GenerationError {
	row: number;
	column?: string;
	message: string;
}
