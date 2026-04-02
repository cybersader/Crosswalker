/**
 * Configuration Manager
 *
 * Handles saving, loading, matching, and exporting import configurations.
 *
 * Design documentation: .claude/42-CONFIG-SELECTION-DESIGN.md
 */

import {
	SavedConfig,
	ConfigFingerprint,
	ParsedData,
	CrosswalkerConfig,
	SAVED_CONFIG_SCHEMA_VERSION
} from '../types/config';

// ============================================================================
// Schema Migration
// ============================================================================

/**
 * Migrate a saved config to the current schema version.
 * Call this when loading configs from storage.
 *
 * Migration strategy:
 * - Each version bump has a migration function
 * - Migrations are applied sequentially (v0 -> v1 -> v2 -> ...)
 * - Unknown future versions are left as-is (forward compatibility)
 */
export function migrateConfig(saved: SavedConfig): SavedConfig {
	const config = { ...saved };

	// v0 (no schemaVersion) -> v1: Add schemaVersion field
	if (config.schemaVersion === undefined || config.schemaVersion === null) {
		config.schemaVersion = 1;
	}

	// Future migrations go here:
	// if (config.schemaVersion === 1) {
	//   // migrate v1 -> v2
	//   config.schemaVersion = 2;
	// }

	return config;
}

/**
 * Migrate all configs in an array
 */
export function migrateConfigs(configs: SavedConfig[]): SavedConfig[] {
	return configs.map(migrateConfig);
}

// ============================================================================
// Config Creation & Storage
// ============================================================================

/**
 * Generate a unique ID for a config
 */
export function generateConfigId(): string {
	return `config_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Create a fingerprint from parsed data for future matching
 */
export function createFingerprint(
	parsedData: ParsedData,
	sourceType: 'csv' | 'xlsx' | 'json',
	fileName?: string
): ConfigFingerprint {
	const columnNames = parsedData.columns;
	const columnNamesNormalized = columnNames.map(c =>
		c.toLowerCase().trim().replace(/[^a-z0-9]/g, '_')
	);

	// Detect patterns in sample data
	const samplePatterns = detectDataPatterns(parsedData);

	// Create filename pattern (for future matching)
	let fileNamePattern: string | undefined;
	if (fileName) {
		// Extract meaningful parts: "NIST_800-53_rev5.csv" → "nist*800-53*"
		fileNamePattern = fileName
			.toLowerCase()
			.replace(/\.[^.]+$/, '')  // Remove extension
			.replace(/[_\-\s]+/g, '*')  // Replace separators with wildcards
			.replace(/\d+/g, '*');      // Replace numbers with wildcards
	}

	return {
		columnNames,
		columnNamesNormalized,
		columnCount: columnNames.length,
		samplePatterns,
		sourceType,
		fileNamePattern
	};
}

/**
 * Detect patterns in sample data (for smart matching)
 */
function detectDataPatterns(parsedData: ParsedData): ConfigFingerprint['samplePatterns'] {
	const patterns: ConfigFingerprint['samplePatterns'] = [];

	// Common patterns to detect
	const patternTests = [
		{ name: 'control_id', pattern: /^[A-Z]{2,3}-\d+(\(\d+\))?$/i, desc: 'Control IDs (AC-1, AC-2(1))' },
		{ name: 'cis_control', pattern: /^\d+(\.\d+)+$/, desc: 'CIS-style IDs (1.1, 1.1.1)' },
		{ name: 'uuid', pattern: /^[0-9a-f]{8}-[0-9a-f]{4}-/i, desc: 'UUIDs' },
		{ name: 'url', pattern: /^https?:\/\//i, desc: 'URLs' },
		{ name: 'comma_list', pattern: /^[^,]+,[^,]+/, desc: 'Comma-separated values' },
	];

	for (const column of parsedData.columns) {
		// Get sample values for this column
		const samples = parsedData.rows
			.slice(0, 20)
			.map(row => String(row[column] ?? ''))
			.filter(v => v.length > 0);

		if (samples.length === 0) continue;

		// Test each pattern
		for (const test of patternTests) {
			const matches = samples.filter(s => test.pattern.test(s));
			if (matches.length >= samples.length * 0.7) { // 70% match threshold
				patterns.push({
					column,
					pattern: test.pattern.source,
					examples: matches.slice(0, 3)
				});
				break; // One pattern per column
			}
		}
	}

	return patterns.length > 0 ? patterns : undefined;
}

/**
 * Create a SavedConfig from current wizard state
 */
export function createSavedConfig(
	name: string,
	description: string,
	parsedData: ParsedData,
	config: Partial<CrosswalkerConfig>,
	sourceType: 'csv' | 'xlsx' | 'json',
	fileName?: string
): SavedConfig {
	const now = new Date().toISOString();

	return {
		schemaVersion: SAVED_CONFIG_SCHEMA_VERSION,
		id: generateConfigId(),
		name,
		description: description || undefined,
		createdAt: now,
		updatedAt: now,
		fingerprint: createFingerprint(parsedData, sourceType, fileName),
		config
	};
}

// ============================================================================
// Config Matching
// ============================================================================

export interface ConfigMatch {
	config: SavedConfig;
	score: number;           // 0-100
	matchDetails: string[];  // Human-readable match reasons
}

/**
 * Find configs that match the current parsed data
 * Returns matches sorted by score (best first)
 */
export function findMatchingConfigs(
	parsedData: ParsedData,
	sourceType: 'csv' | 'xlsx' | 'json',
	savedConfigs: SavedConfig[],
	fileName?: string
): ConfigMatch[] {
	const currentFingerprint = createFingerprint(parsedData, sourceType, fileName);
	const matches: ConfigMatch[] = [];

	for (const saved of savedConfigs) {
		const match = scoreConfigMatch(currentFingerprint, saved.fingerprint, saved);
		if (match.score > 30) { // Minimum threshold
			matches.push({
				config: saved,
				...match
			});
		}
	}

	// Sort by score descending
	matches.sort((a, b) => b.score - a.score);

	return matches;
}

/**
 * Score how well a saved config matches current data
 */
function scoreConfigMatch(
	current: ConfigFingerprint,
	saved: ConfigFingerprint,
	config: SavedConfig
): { score: number; matchDetails: string[] } {
	let score = 0;
	const details: string[] = [];

	// 1. Exact column name match (high value)
	const exactMatches = current.columnNames.filter(c =>
		saved.columnNames.includes(c)
	).length;
	const exactMatchPercent = exactMatches / Math.max(current.columnCount, saved.columnCount);
	if (exactMatchPercent > 0.8) {
		score += 40;
		details.push(`${Math.round(exactMatchPercent * 100)}% exact column match`);
	} else if (exactMatchPercent > 0.5) {
		score += 25;
		details.push(`${Math.round(exactMatchPercent * 100)}% column match`);
	}

	// 2. Normalized column name match (fuzzy)
	const normalizedMatches = current.columnNamesNormalized.filter(c =>
		saved.columnNamesNormalized.includes(c)
	).length;
	const normalizedMatchPercent = normalizedMatches / Math.max(current.columnCount, saved.columnCount);
	if (normalizedMatchPercent > exactMatchPercent) {
		score += 15;
		details.push(`${Math.round(normalizedMatchPercent * 100)}% fuzzy column match`);
	}

	// 3. Column count similarity
	const countDiff = Math.abs(current.columnCount - saved.columnCount);
	if (countDiff === 0) {
		score += 10;
		details.push('Same column count');
	} else if (countDiff <= 2) {
		score += 5;
	}

	// 4. Source type match
	if (current.sourceType === saved.sourceType) {
		score += 5;
		details.push(`Same file type (${current.sourceType})`);
	}

	// 5. Pattern matching (if available)
	if (current.samplePatterns && saved.samplePatterns) {
		const patternMatches = current.samplePatterns.filter(cp =>
			saved.samplePatterns!.some(sp =>
				sp.column === cp.column || sp.pattern === cp.pattern
			)
		).length;
		if (patternMatches > 0) {
			score += 15;
			details.push(`${patternMatches} data pattern(s) match`);
		}
	}

	// 6. Filename pattern match
	if (current.fileNamePattern && saved.fileNamePattern) {
		// Simple glob-like match
		const currentParts = current.fileNamePattern.split('*').filter(Boolean);
		const savedParts = saved.fileNamePattern.split('*').filter(Boolean);
		const partMatches = currentParts.filter(p => savedParts.includes(p)).length;
		if (partMatches > 0) {
			score += 10;
			details.push('Filename pattern similar');
		}
	}

	// 7. Recently used bonus (prefer recent)
	if (config.lastUsedAt) {
		const daysSinceUse = (Date.now() - new Date(config.lastUsedAt).getTime()) / (1000 * 60 * 60 * 24);
		if (daysSinceUse < 7) {
			score += 5;
			details.push('Recently used');
		}
	}

	return { score: Math.min(score, 100), matchDetails: details };
}

// ============================================================================
// Import/Export
// ============================================================================

/**
 * Export a config to a shareable JSON object
 */
export function exportConfig(config: SavedConfig): object {
	return {
		crosswalker_config_version: '1.0',
		exported_at: new Date().toISOString(),
		config: {
			name: config.name,
			description: config.description,
			fingerprint: config.fingerprint,
			config: config.config
		}
	};
}

/**
 * Import a config from JSON, generating new ID and timestamps.
 * Imported configs are migrated to the current schema version.
 */
export function importConfig(json: object): SavedConfig | null {
	try {
		const data = json as any;
		if (!data.crosswalker_config_version || !data.config) {
			return null;
		}

		const now = new Date().toISOString();
		const imported: SavedConfig = {
			schemaVersion: SAVED_CONFIG_SCHEMA_VERSION,
			id: generateConfigId(),
			name: data.config.name || 'Imported config',
			description: data.config.description,
			createdAt: now,
			updatedAt: now,
			fingerprint: data.config.fingerprint || {
				columnNames: [],
				columnNamesNormalized: [],
				columnCount: 0
			},
			config: data.config.config || {}
		};

		// Run through migration to ensure all fields are present
		return migrateConfig(imported);
	} catch {
		return null;
	}
}

/**
 * Export config to downloadable JSON string
 */
export function exportConfigToString(config: SavedConfig): string {
	return JSON.stringify(exportConfig(config), null, 2);
}
