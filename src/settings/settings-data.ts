/**
 * Crosswalker Settings Data
 *
 * Defines the structure of plugin settings and defaults.
 */

import { SavedConfig } from '../types/config';

export interface CrosswalkerSettings {
	// ==========================================================================
	// General / Output
	// ==========================================================================
	defaultOutputPath: string;

	// ==========================================================================
	// Import Defaults
	// ==========================================================================
	defaultKeyNamingStyle: KeyNamingStyle;
	defaultArrayHandling: ArrayHandling;
	defaultEmptyHandling: EmptyHandling;
	defaultFrontmatterStyle: FrontmatterStyle;

	// ==========================================================================
	// Link Syntax
	// ==========================================================================
	linkSyntaxPreset: LinkSyntaxPreset;
	customLinkNamespace: string;

	// ==========================================================================
	// Config Matching & Suggestions
	// ==========================================================================
	enableConfigSuggestions: boolean;           // Show "Use saved config?" prompts
	configMatchThreshold: number;               // Minimum score (0-100) to suggest a config
	enablePatternDetection: boolean;            // Detect data patterns for smarter matching
	promptToSaveConfig: boolean;                // Ask to save config after successful import
	autoApplyExactMatch: boolean;               // Auto-apply config if 100% column match

	// ==========================================================================
	// Wizard Behavior
	// ==========================================================================
	showColumnStatistics: boolean;              // Show unique counts, types in Step 2
	showSampleValues: boolean;                  // Show sample data in column config
	sampleValueCount: number;                   // How many samples to show (1-10)
	confirmBeforeGenerate: boolean;             // Show confirmation before creating files
	showProgressNotices: boolean;               // Show parsing/generation progress

	// ==========================================================================
	// Advanced
	// ==========================================================================
	enableCustomTransforms: boolean;
	customTransformsPath: string;
	maxRowsForPreview: number;                  // Limit rows in preview (performance)
	streamingThresholdMB: number;               // File size to trigger streaming parser

	// ==========================================================================
	// Debug
	// ==========================================================================
	enableDebugLog: boolean;
	verboseLogging: boolean;                    // Extra detailed logs

	// ==========================================================================
	// Saved Configurations
	// ==========================================================================
	savedConfigs: SavedConfig[];
}

export type KeyNamingStyle = 'as-is' | 'lowercase' | 'snake_case' | 'camelCase' | 'kebab-case';
export type ArrayHandling = 'as_array' | 'stringify' | 'first' | 'last' | 'join';
export type EmptyHandling = 'omit' | 'empty_string' | 'null' | 'default';
export type FrontmatterStyle = 'flat' | 'dot_to_nest' | 'group_by_prefix';
export type LinkSyntaxPreset = 'simple' | 'standard' | 'full' | 'custom';

export const DEFAULT_SETTINGS: CrosswalkerSettings = {
	// General / Output
	defaultOutputPath: 'Ontologies',

	// Import defaults
	defaultKeyNamingStyle: 'snake_case',
	defaultArrayHandling: 'as_array',
	defaultEmptyHandling: 'omit',
	defaultFrontmatterStyle: 'flat',

	// Link syntax
	linkSyntaxPreset: 'standard',
	customLinkNamespace: 'crosswalker',

	// Config Matching & Suggestions
	enableConfigSuggestions: true,
	configMatchThreshold: 50,          // Suggest configs scoring 50+
	enablePatternDetection: true,
	promptToSaveConfig: true,
	autoApplyExactMatch: false,        // Don't auto-apply, let user confirm

	// Wizard Behavior
	showColumnStatistics: true,
	showSampleValues: true,
	sampleValueCount: 3,
	confirmBeforeGenerate: true,
	showProgressNotices: true,

	// Advanced
	enableCustomTransforms: false,
	customTransformsPath: '',
	maxRowsForPreview: 100,
	streamingThresholdMB: 5,           // Use streaming for files > 5MB

	// Debug
	enableDebugLog: false,
	verboseLogging: false,

	// Saved configs
	savedConfigs: []
};
