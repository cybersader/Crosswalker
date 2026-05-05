/**
 * Generation Engine
 *
 * Creates folders and notes in the vault based on parsed data and configuration.
 *
 * Key design decisions (see https://cybersader.github.io/crosswalker/concepts/ontology-evolution/):
 * - Include `_crosswalker` metadata block in generated notes
 * - Track `importedProperties` for safe reimport
 * - Use `sourceId` as canonical identifier
 * - Default to "skip existing" behavior
 * - Store `frameworkId` for future cross-framework features
 */

import { App, TFile, TFolder, normalizePath, Notice } from 'obsidian';
import {
	ParsedData,
	ImportRecipe,
	GenerationResult,
	GenerationError,
	MappingConfig,
	HierarchyMapping,
	FrontmatterMapping,
	BodyMapping,
	LinkMapping
} from '../types/config';
import { DebugLog } from '../utils/debug';
import { render, RenderError, renderTemplate } from '../render';
import { legacyConfigToRecipe } from './legacy-recipe-shim';
import { mergeFrontmatter, computeManagedKeys } from './frontmatter-merge';
import { buildProvenance } from './provenance';

// ============================================================================
// Types
// ============================================================================

/**
 * Crosswalker metadata stored in each generated note.
 * Enables safe reimport, tracking, and future cross-framework features.
 */
export interface CrosswalkerMetadata {
	/** ID from source data - canonical identifier */
	sourceId: string;

	/** Framework identifier (from config) */
	frameworkId?: string;

	/** Framework version if specified */
	frameworkVersion?: string;

	/** Unique ID for this import operation */
	importId: string;

	/** Config ID used for this import */
	configId?: string;

	/** Schema version of this metadata structure */
	schemaVersion: number;

	/** ISO timestamp when note was created/updated */
	importedAt: string;

	/** List of property keys that were imported (vs user-added) */
	importedProperties: string[];

	/** Source file this data came from */
	sourceFile?: string;

	/** Row number in source (for debugging) */
	sourceRow?: number;
}

export interface GenerationOptions {
	/** Base path for output (e.g., "Ontologies/MyFramework") */
	basePath: string;

	/** How to handle existing files */
	overwriteMode: 'skip' | 'replace' | 'error';

	/** Whether to create folders that don't exist */
	createFolders: boolean;

	/** Framework name for _crosswalker metadata */
	frameworkId?: string;

	/** Framework version */
	frameworkVersion?: string;

	/** Config ID (if using saved config) */
	configId?: string;

	/** Source file name */
	sourceFileName?: string;

	/** Progress callback */
	onProgress?: (current: number, total: number, message: string) => void;
}

interface GeneratedNoteData {
	path: string;
	frontmatter: Record<string, any>;
	body: string;
	sourceRow: number;
}

// Current schema version for _crosswalker metadata
const CROSSWALKER_METADATA_VERSION = 1;

// ============================================================================
// Main Generation Function
// ============================================================================

/**
 * Generate notes from parsed data using the provided configuration.
 */
export async function generateNotes(
	app: App,
	parsedData: ParsedData,
	config: Partial<ImportRecipe>,
	options: GenerationOptions,
	debug?: DebugLog
): Promise<GenerationResult> {
	const startTime = Date.now();
	const result: GenerationResult = {
		success: true,
		created: [],
		skipped: [],
		errors: [],
		duration: 0
	};

	const importId = generateImportId();

	await debug?.log('Starting generation', {
		rowCount: parsedData.rowCount,
		basePath: options.basePath,
		overwriteMode: options.overwriteMode,
		configId: options.configId
	});

	try {
		// Validate configuration
		const mapping = config.mapping;
		if (!mapping) {
			throw new Error('No mapping configuration provided');
		}

		// Ensure base folder exists
		if (options.createFolders) {
			await ensureFolderExists(app, options.basePath);
		}

		// v0.1.3: translate the legacy v0.1.0 config shape into a Ch 22 Recipe
		// once before the per-row loop. The recipe is what render() consumes.
		const recipe = legacyConfigToRecipe(config as ImportRecipe);

		// Track paths emitted in THIS generation pass to detect collisions
		// (two source rows rendering to the same vault path).
		const emittedPaths = new Set<string>();

		// Process each row
		const total = parsedData.rows.length;
		for (let i = 0; i < parsedData.rows.length; i++) {
			const row = parsedData.rows[i];
			const rowNum = i + 1; // 1-indexed for user display

			try {
				// Report progress periodically
				if (options.onProgress && i % 10 === 0) {
					options.onProgress(i, total, `Processing row ${rowNum}`);
				}

				// v0.1.3: build path + base frontmatter via render(); body/link
				// content still comes from the existing column-role logic for
				// backward-compat. Engine-level body refactor is deferred to a
				// future milestone where body templates land formally.
				const noteData = buildNoteDataViaRender(
					row,
					rowNum,
					mapping,
					options,
					recipe,
					config.name ?? 'unknown',
				);

				// Skip if no valid path generated
				if (!noteData.path) {
					result.errors.push({
						row: rowNum,
						message: 'Could not generate file path - missing hierarchy or title data'
					});
					continue;
				}

				// Path collision detection — fail loud rather than silently
				// overwriting one row's output with another's.
				if (emittedPaths.has(noteData.path)) {
					result.errors.push({
						row: rowNum,
						message: `Path collision: ${noteData.path} already produced by an earlier row in this import. Two source rows resolve to the same target file. Adjust your filename template or hierarchy mappings to disambiguate.`,
					});
					continue;
				}
				emittedPaths.add(noteData.path);

				// Check if file exists
				const fullPath = normalizePath(noteData.path);
				const existingFile = app.vault.getAbstractFileByPath(fullPath);

				if (existingFile instanceof TFile) {
					if (options.overwriteMode === 'skip') {
						result.skipped.push(fullPath);
						await debug?.log('Skipped existing file', { path: fullPath });
						continue;
					} else if (options.overwriteMode === 'error') {
						result.errors.push({
							row: rowNum,
							message: `File already exists: ${fullPath}`
						});
						result.success = false;
						continue;
					}
					// 'replace' mode — merge with existing frontmatter so
					// user-edited keys (reviewer, status, etc.) survive
					// re-import. Per Ch 22 §8.4 managed/user_preserve split.
					try {
						const existingFm = await readExistingFrontmatter(app, existingFile);
						if (existingFm && Object.keys(existingFm).length > 0) {
							const managedKeys = computeManagedKeys(noteData.frontmatter, []);
							noteData.frontmatter = mergeFrontmatter(
								existingFm,
								noteData.frontmatter,
								managedKeys,
							);
						}
					} catch (mergeErr) {
						// Frontmatter parse/merge failure is non-fatal; fall
						// back to writing the new frontmatter as-is. Log so
						// the user can investigate if user-keys are lost.
						await debug?.log('Frontmatter merge failed; using new frontmatter as-is', {
							path: fullPath,
							error: mergeErr instanceof Error ? mergeErr.message : String(mergeErr),
						});
					}
				}

				// Ensure parent folder exists
				const parentPath = getParentPath(fullPath);
				if (parentPath && options.createFolders) {
					await ensureFolderExists(app, parentPath);
				}

				// Build file content
				const content = buildNoteContent(noteData.frontmatter, noteData.body);

				// Create or update file
				if (existingFile instanceof TFile) {
					await app.vault.modify(existingFile, content);
					await debug?.log('Replaced existing file', { path: fullPath });
				} else {
					await app.vault.create(fullPath, content);
					await debug?.log('Created new file', { path: fullPath });
				}

				result.created.push(fullPath);

			} catch (rowError) {
				const errorMessage = rowError instanceof Error ? rowError.message : String(rowError);
				result.errors.push({
					row: rowNum,
					message: errorMessage
				});
				await debug?.log('Row processing error', { row: rowNum, error: errorMessage });
			}
		}

		// Final progress update
		if (options.onProgress) {
			options.onProgress(total, total, 'Complete');
		}

	} catch (error) {
		const errorMessage = error instanceof Error ? error.message : String(error);
		result.success = false;
		result.errors.push({
			row: 0,
			message: `Generation failed: ${errorMessage}`
		});
		await debug?.log('Generation failed', { error: errorMessage });
	}

	result.duration = Date.now() - startTime;

	await debug?.log('Generation complete', {
		success: result.success,
		created: result.created.length,
		skipped: result.skipped.length,
		errors: result.errors.length,
		duration: result.duration
	});

	return result;
}

// ============================================================================
// Note Building (v0.1.3 — render() + legacy column-role logic)
// ============================================================================

/**
 * Read existing frontmatter for a file via Obsidian's metadata cache.
 * Returns an empty object if the file has no frontmatter or the cache hasn't
 * indexed it yet. Errors during retrieval surface as exceptions.
 */
async function readExistingFrontmatter(app: App, file: TFile): Promise<Record<string, unknown>> {
	const cache = app.metadataCache.getFileCache(file);
	const fm = cache?.frontmatter;
	if (!fm || typeof fm !== 'object') return {};

	// Strip Obsidian's internal `position` key from the result. The metadata
	// cache attaches it to track where in the file the frontmatter lives;
	// it's not part of the user-visible YAML.
	const result: Record<string, unknown> = {};
	for (const [k, v] of Object.entries(fm)) {
		if (k !== 'position') result[k] = v;
	}
	return result;
}

/**
 * Build note data from a single row using render() for path + base
 * frontmatter, then layering link + body content from the legacy column-role
 * logic.
 *
 * v0.1.3: this is the new code path that uses spec-driven Recipe + Address.
 * The body/link content building still uses the v0.1.0 buildNoteData internals
 * because body templates haven't migrated to spec yet (deferred to a later
 * milestone where body becomes a recipe-defined `also_emit.body` or similar).
 */
function buildNoteDataViaRender(
	row: Record<string, any>,
	rowNum: number,
	mapping: MappingConfig,
	options: GenerationOptions,
	recipe: ReturnType<typeof legacyConfigToRecipe>,
	ontologyId: string,
): { path: string; frontmatter: Record<string, any>; body: string; sourceRow: number } {
	// 1. Build a CURIE for this row. Strategy: ontology + filename stem.
	//    The filename is whatever the recipe's leaf file template resolves to.
	const filenameStem = deriveFilenameStem(row, mapping, rowNum);
	const curie = `${slugifyForCurie(ontologyId)}:${filenameStem}`;

	// 2. render() expects a SourceScope object — the row IS the scope (column
	//    names map to template variables).
	let address;
	try {
		address = render(recipe, { curie, scope: row as Record<string, unknown> });
	} catch (err) {
		if (err instanceof RenderError) {
			throw new Error(`render() failed for row ${rowNum}: ${err.message}`);
		}
		throw err;
	}

	// 3. Combine basePath with the recipe-relative path render() produced.
	const fullPath = options.basePath
		? normalizePath(`${options.basePath}/${address.primary.path}`)
		: normalizePath(address.primary.path);

	// 4. Frontmatter starts from render's output (curie + managed keys).
	const frontmatter: Record<string, any> = { ...address.frontmatter };

	// 5. Layer in link content + body content from the legacy column-role
	//    logic. We delegate to buildNoteData but only use its frontmatter
	//    additions (links → frontmatter location) and body string.
	const legacy = buildNoteData(row, rowNum, mapping, options, '', []);
	for (const [k, v] of Object.entries(legacy.frontmatter)) {
		// Skip _crosswalker — we'll write a fresh provenance block below.
		// Skip keys already set by render's also_emit (managed wins).
		if (k === '_crosswalker') continue;
		if (!(k in frontmatter)) frontmatter[k] = v;
	}

	// 6. Always write a fresh _crosswalker provenance block per
	//    spec/tier1.schema.json. Captures the source ref + producer +
	//    recipe-id at this generation time.
	frontmatter._crosswalker = buildProvenance(
		{
			sourceFile: options.sourceFileName,
			sourceVersion: options.frameworkVersion,
			recipeId: options.configId ?? recipe.recipe,
		},
		PLUGIN_VERSION,
	);

	return {
		path: fullPath,
		frontmatter,
		body: legacy.body,
		sourceRow: rowNum,
	};
}

/**
 * Pulled from buildNoteData's filename logic — returns the stem (no .md) for
 * use in CURIE generation.
 */
function deriveFilenameStem(
	row: Record<string, any>,
	mapping: MappingConfig,
	rowNum: number,
): string {
	let filename = '';
	if (mapping.filename?.template) {
		// Use the new render template engine ({var|filter} syntax). Legacy
		// configs that used `{{var}}` mustache-style won't interpolate via
		// renderTemplate — they get caught by the empty-result fallback
		// below and resolved to row-N.
		try {
			filename = renderTemplate(mapping.filename.template, row as Record<string, unknown>);
		} catch {
			// Template variable missing — fall through to first-frontmatter fallback
			filename = '';
		}
	}
	if (!filename && mapping.frontmatter && mapping.frontmatter.length > 0) {
		const firstValue = row[mapping.frontmatter[0].column];
		if (firstValue) filename = String(firstValue);
	}

	if (!filename) {
		filename = `row-${rowNum}`;
	}

	// Strip .md if the template included it; CURIE local part doesn't want it
	if (filename.endsWith('.md')) {
		filename = filename.slice(0, -3);
	}
	return sanitizeFileName(filename);
}

/**
 * Slugify a string for use as a CURIE prefix (must match the schema's
 * `^[a-z][a-z0-9_-]*` pattern from spec/tier1.schema.json $defs/curie).
 */
function slugifyForCurie(input: string): string {
	const lower = String(input).toLowerCase();
	const cleaned = lower.replace(/[^a-z0-9_-]+/g, '-').replace(/^-|-$/g, '');
	// Ensure first char is a letter (schema requires)
	return /^[a-z]/.test(cleaned) ? cleaned : `cw-${cleaned}`;
}

// Plugin version constant — populated from manifest.json. esbuild bundles
// the import via the JSON loader.
import manifest from '../../manifest.json';
const PLUGIN_VERSION = manifest.version;

/**
 * Build note data from a single row (v0.1.0 column-role logic; preserved
 * for body/link content. v0.1.3 routes path + base frontmatter through
 * render() instead — see buildNoteDataViaRender above).
 */
function buildNoteData(
	row: Record<string, any>,
	rowNum: number,
	mapping: MappingConfig,
	options: GenerationOptions,
	importId: string,
	allColumns: string[]
): GeneratedNoteData {
	const frontmatter: Record<string, any> = {};
	const importedProperties: string[] = [];
	let bodyParts: string[] = [];
	let path = options.basePath;

	// 1. Process hierarchy columns (build folder path)
	const hierarchyValues: string[] = [];
	if (mapping.hierarchy && mapping.hierarchy.length > 0) {
		// Sort by level to ensure proper order
		const sortedHierarchy = [...mapping.hierarchy].sort((a, b) => a.level - b.level);

		for (const h of sortedHierarchy) {
			const value = row[h.column];
			if (value !== undefined && value !== null && value !== '') {
				const sanitized = sanitizePathSegment(String(value));
				if (sanitized) {
					hierarchyValues.push(sanitized);
				}
			}
		}
	}

	// 2. Determine filename from filename config or first non-hierarchy column with data
	let filename = '';
	if (mapping.filename?.template) {
		filename = resolveTemplate(mapping.filename.template, row);
	} else {
		// Fall back: use first frontmatter column value as filename
		if (mapping.frontmatter && mapping.frontmatter.length > 0) {
			const firstValue = row[mapping.frontmatter[0].column];
			if (firstValue) {
				filename = String(firstValue);
			}
		}
	}

	if (!filename) {
		// Last resort: use row number
		filename = `row-${rowNum}`;
	}

	// Sanitize filename
	filename = sanitizeFileName(filename);
	if (mapping.filename?.maxLength) {
		filename = filename.substring(0, mapping.filename.maxLength);
	}

	// Build full path
	if (hierarchyValues.length > 0) {
		path = normalizePath(`${path}/${hierarchyValues.join('/')}/${filename}.md`);
	} else {
		path = normalizePath(`${path}/${filename}.md`);
	}

	// 3. Process frontmatter columns
	if (mapping.frontmatter) {
		for (const fm of mapping.frontmatter) {
			const value = row[fm.column];

			// Handle empty values
			if (value === undefined || value === null || value === '') {
				if (!fm.omitIfEmpty) {
					frontmatter[fm.key] = formatValue(value, fm.format);
				}
			} else {
				frontmatter[fm.key] = formatValue(value, fm.format);
			}

			importedProperties.push(fm.key);
		}
	}

	// 4. Process link columns
	if (mapping.links) {
		for (const link of mapping.links) {
			const value = row[link.column];
			if (value !== undefined && value !== null && value !== '') {
				const linkValue = formatAsLink(value, link);

				if (link.location === 'frontmatter' || link.location === 'both') {
					const key = link.frontmatterKey || link.column;
					frontmatter[key] = linkValue;
					importedProperties.push(key);
				}

				if (link.location === 'body' || link.location === 'both') {
					const section = link.bodySection || 'Related';
					bodyParts.push(`## ${section}\n\n${linkValue}\n`);
				}
			}
		}
	}

	// 5. Process body columns
	if (mapping.body) {
		for (const body of mapping.body) {
			const value = row[body.column];
			if (value !== undefined && value !== null && value !== '') {
				const formatted = formatBodyContent(value, body);
				if (body.heading) {
					bodyParts.push(`## ${body.heading}\n\n${formatted}\n`);
				} else {
					bodyParts.push(`${formatted}\n`);
				}
			}
		}
	}

	// 6. Add _crosswalker metadata
	const crosswalkerMetadata: CrosswalkerMetadata = {
		sourceId: determineSourceId(row, mapping, rowNum),
		frameworkId: options.frameworkId,
		frameworkVersion: options.frameworkVersion,
		importId: importId,
		configId: options.configId,
		schemaVersion: CROSSWALKER_METADATA_VERSION,
		importedAt: new Date().toISOString(),
		importedProperties: importedProperties,
		sourceFile: options.sourceFileName,
		sourceRow: rowNum
	};

	// Remove undefined values from crosswalker metadata
	const cleanedMetadata = Object.fromEntries(
		Object.entries(crosswalkerMetadata).filter(([_, v]) => v !== undefined)
	);

	frontmatter['_crosswalker'] = cleanedMetadata;

	return {
		path,
		frontmatter,
		body: bodyParts.join('\n'),
		sourceRow: rowNum
	};
}

/**
 * Determine the source ID for a row (canonical identifier)
 */
function determineSourceId(row: Record<string, any>, mapping: MappingConfig, rowNum: number): string {
	// Look for common ID column names
	const idColumnCandidates = [
		'id', 'ID', 'Id',
		'control_id', 'Control ID', 'ControlID',
		'identifier', 'Identifier',
		'code', 'Code',
		'key', 'Key'
	];

	// Check frontmatter mappings for an ID field
	if (mapping.frontmatter) {
		for (const fm of mapping.frontmatter) {
			if (idColumnCandidates.some(c => fm.column.toLowerCase() === c.toLowerCase())) {
				const value = row[fm.column];
				if (value) return String(value);
			}
			// Also check output key
			if (idColumnCandidates.some(c => fm.key.toLowerCase() === c.toLowerCase())) {
				const value = row[fm.column];
				if (value) return String(value);
			}
		}
	}

	// Check raw row data
	for (const candidate of idColumnCandidates) {
		if (row[candidate]) {
			return String(row[candidate]);
		}
	}

	// Fall back to row number
	return `row-${rowNum}`;
}

// ============================================================================
// Formatting Helpers
// ============================================================================

/**
 * Format a value for frontmatter based on format type
 */
function formatValue(value: any, format?: string): any {
	if (value === undefined || value === null) {
		return '';
	}

	switch (format) {
		case 'number':
			const num = Number(value);
			return isNaN(num) ? value : num;

		case 'boolean':
			if (typeof value === 'boolean') return value;
			const lower = String(value).toLowerCase();
			return lower === 'true' || lower === 'yes' || lower === '1';

		case 'array':
			if (Array.isArray(value)) return value;
			// Try to split by common delimiters
			if (typeof value === 'string') {
				if (value.includes(',')) return value.split(',').map(s => s.trim());
				if (value.includes(';')) return value.split(';').map(s => s.trim());
				if (value.includes('\n')) return value.split('\n').map(s => s.trim());
			}
			return [value];

		case 'date':
			// Return as-is for now, could parse/validate
			return String(value);

		default:
			return String(value);
	}
}

/**
 * Format a value as a link
 */
function formatAsLink(value: any, config: LinkMapping): string | string[] {
	const values = Array.isArray(value) ? value : [value];

	const links = values.map(v => {
		const linkText = String(v).trim();
		if (!linkText) return '';

		if (config.type === 'wikilink') {
			return `[[${linkText}]]`;
		} else {
			// Markdown link - would need path resolution
			return `[${linkText}](${linkText})`;
		}
	}).filter(l => l !== '');

	return links.length === 1 ? links[0] : links;
}

/**
 * Format body content
 */
function formatBodyContent(value: any, config: BodyMapping): string {
	const text = String(value);

	switch (config.format) {
		case 'code':
			return '```\n' + text + '\n```';
		case 'quote':
			return text.split('\n').map(line => '> ' + line).join('\n');
		case 'list':
			return text.split('\n').map(line => '- ' + line.trim()).join('\n');
		default:
			return text;
	}
}

/**
 * Resolve a template string with row values
 */
function resolveTemplate(template: string, row: Record<string, any>): string {
	return template.replace(/\{\{([^}]+)\}\}/g, (match, key) => {
		const trimmedKey = key.trim();
		const value = row[trimmedKey];
		return value !== undefined && value !== null ? String(value) : '';
	});
}

// ============================================================================
// File System Helpers
// ============================================================================

/**
 * Build the note content from frontmatter and body
 */
function buildNoteContent(frontmatter: Record<string, any>, body: string): string {
	const yamlLines = ['---'];

	for (const [key, value] of Object.entries(frontmatter)) {
		yamlLines.push(formatYamlLine(key, value, 0));
	}

	yamlLines.push('---');

	if (body.trim()) {
		return yamlLines.join('\n') + '\n\n' + body;
	} else {
		return yamlLines.join('\n') + '\n';
	}
}

/**
 * Format a single YAML line (handles nested objects and arrays)
 */
function formatYamlLine(key: string, value: any, indent: number): string {
	const prefix = '  '.repeat(indent);

	if (value === null || value === undefined) {
		return `${prefix}${key}:`;
	}

	if (typeof value === 'object' && !Array.isArray(value)) {
		const lines = [`${prefix}${key}:`];
		for (const [k, v] of Object.entries(value)) {
			lines.push(formatYamlLine(k, v, indent + 1));
		}
		return lines.join('\n');
	}

	if (Array.isArray(value)) {
		if (value.length === 0) {
			return `${prefix}${key}: []`;
		}
		const lines = [`${prefix}${key}:`];
		for (const item of value) {
			if (typeof item === 'object') {
				lines.push(`${prefix}  -`);
				for (const [k, v] of Object.entries(item)) {
					lines.push(formatYamlLine(k, v, indent + 2));
				}
			} else {
				lines.push(`${prefix}  - ${formatYamlValue(item)}`);
			}
		}
		return lines.join('\n');
	}

	return `${prefix}${key}: ${formatYamlValue(value)}`;
}

/**
 * Format a YAML value (quote strings if needed)
 */
function formatYamlValue(value: any): string {
	if (typeof value === 'string') {
		// Quote if contains special characters or looks like a number/boolean
		if (
			value.includes(':') ||
			value.includes('#') ||
			value.includes('"') ||
			value.includes("'") ||
			value.includes('\n') ||
			value.match(/^[0-9]/) ||
			['true', 'false', 'yes', 'no', 'null'].includes(value.toLowerCase())
		) {
			// Use double quotes and escape internal quotes
			return `"${value.replace(/"/g, '\\"')}"`;
		}
		return value;
	}

	if (typeof value === 'boolean') {
		return value ? 'true' : 'false';
	}

	if (typeof value === 'number') {
		return String(value);
	}

	return String(value);
}

/**
 * Ensure a folder exists, creating it if necessary
 */
async function ensureFolderExists(app: App, path: string): Promise<void> {
	const normalizedPath = normalizePath(path);
	const existing = app.vault.getAbstractFileByPath(normalizedPath);

	if (existing instanceof TFolder) {
		return; // Already exists
	}

	if (existing instanceof TFile) {
		throw new Error(`Cannot create folder "${path}" - a file exists at that path`);
	}

	// Create folder (Obsidian API creates parent folders automatically)
	await app.vault.createFolder(normalizedPath);
}

/**
 * Get parent path from a file path
 */
function getParentPath(filePath: string): string | null {
	const lastSlash = filePath.lastIndexOf('/');
	if (lastSlash === -1) return null;
	return filePath.substring(0, lastSlash);
}

/**
 * Sanitize a string for use as a path segment (folder name)
 */
function sanitizePathSegment(name: string): string {
	return name
		.replace(/[\\/:*?"<>|]/g, '-') // Replace illegal characters
		.replace(/\s+/g, ' ')          // Normalize whitespace
		.replace(/^\.+|\.+$/g, '')     // Remove leading/trailing dots
		.trim()
		.substring(0, 100);            // Limit length
}

/**
 * Sanitize a string for use as a filename
 */
function sanitizeFileName(name: string): string {
	return name
		.replace(/[\\/:*?"<>|]/g, '-') // Replace illegal characters
		.replace(/\s+/g, ' ')          // Normalize whitespace
		.replace(/^\.+/g, '')          // Remove leading dots
		.replace(/\.md$/i, '')         // Remove existing .md extension
		.trim();
}

/**
 * Generate a unique import ID
 */
function generateImportId(): string {
	const timestamp = Date.now().toString(36);
	const random = Math.random().toString(36).substring(2, 8);
	return `import_${timestamp}_${random}`;
}

// ============================================================================
// Export Helpers for Wizard
// ============================================================================

/**
 * Build a full config from wizard state for generation
 */
export function buildConfigFromWizardState(
	columnConfigs: Map<string, { useAs: string; outputKey: string }>,
	parsedColumns: string[]
): Partial<ImportRecipe> {
	const hierarchy: HierarchyMapping[] = [];
	const frontmatter: FrontmatterMapping[] = [];
	const links: LinkMapping[] = [];
	const body: BodyMapping[] = [];

	let hierarchyLevel = 1;

	for (const col of parsedColumns) {
		const config = columnConfigs.get(col);
		if (!config) continue;

		switch (config.useAs) {
			case 'hierarchy':
				hierarchy.push({
					column: col,
					level: hierarchyLevel++
				});
				break;

			case 'frontmatter':
				frontmatter.push({
					column: col,
					key: config.outputKey
				});
				break;

			case 'link':
				links.push({
					column: col,
					type: 'wikilink',
					location: 'frontmatter',
					frontmatterKey: config.outputKey
				});
				break;

			case 'body':
				body.push({
					column: col,
					heading: config.outputKey
				});
				break;

			case 'title':
				// Title column used in filename template
				break;

			case 'skip':
			default:
				// Skip this column
				break;
		}
	}

	// Find title column for filename
	const titleCol = parsedColumns.find(col => columnConfigs.get(col)?.useAs === 'title');
	const filenameTemplate = titleCol ? `{{${titleCol}}}` : undefined;

	return {
		mapping: {
			hierarchy,
			frontmatter,
			links,
			body,
			filename: filenameTemplate ? {
				template: filenameTemplate,
				sanitize: true
			} : {
				template: '{{row}}',
				sanitize: true
			}
		}
	};
}

/**
 * Estimate the number of notes and folders that will be created
 */
export function estimateOutput(
	parsedData: ParsedData,
	config: Partial<ImportRecipe>
): { noteCount: number; folderCount: number; linkCount: number } {
	// Note count = row count (one note per row)
	const noteCount = parsedData.rowCount;

	// Estimate folder count based on hierarchy
	let folderCount = 1; // At least the base folder
	if (config.mapping?.hierarchy && config.mapping.hierarchy.length > 0) {
		// Count unique combinations at each level
		const uniqueHierarchies = new Set<string>();
		for (const row of parsedData.rows) {
			let path = '';
			for (const h of config.mapping.hierarchy.sort((a, b) => a.level - b.level)) {
				const value = row[h.column];
				if (value) {
					path += '/' + String(value);
					uniqueHierarchies.add(path);
				}
			}
		}
		folderCount = uniqueHierarchies.size + 1;
	}

	// Estimate link count
	let linkCount = 0;
	if (config.mapping?.links && config.mapping.links.length > 0) {
		for (const row of parsedData.rows) {
			for (const link of config.mapping.links) {
				const value = row[link.column];
				if (value) {
					// Count array items or single value
					if (Array.isArray(value)) {
						linkCount += value.length;
					} else if (typeof value === 'string' && (value.includes(',') || value.includes(';'))) {
						linkCount += value.split(/[,;]/).length;
					} else {
						linkCount += 1;
					}
				}
			}
		}
	}

	return { noteCount, folderCount, linkCount };
}
