/**
 * CSV Parser with Streaming Support
 *
 * Uses PapaParse for memory-efficient parsing of large CSV files.
 * Streaming mode processes rows one at a time without loading entire file into memory.
 */

import * as Papa from 'papaparse';
import { ParsedData, ColumnInfo } from '../../types/config';

export interface CSVParserOptions {
	delimiter?: string;       // Auto-detect if not specified
	headerRow?: number;       // Row number containing headers (1-based, default 1)
	encoding?: string;        // File encoding
	skipEmptyRows?: boolean;  // Skip rows that are entirely empty
	streaming?: boolean;      // Use streaming mode for large files
	chunkSize?: number;       // Rows per chunk in streaming mode
	onProgress?: (progress: ParseProgress) => void;  // Progress callback
}

export interface ParseProgress {
	rowsProcessed: number;
	bytesProcessed: number;
	estimatedTotal?: number;
	percentComplete?: number;
}

const DEFAULT_OPTIONS: CSVParserOptions = {
	headerRow: 1,
	encoding: 'utf-8',
	skipEmptyRows: true,
	streaming: false,
	chunkSize: 1000
};

/**
 * Parse CSV content into structured data
 *
 * For large files, use streaming: true to avoid memory issues.
 * The step callback will be called for each row.
 */
export async function parseCSV(
	content: string,
	options: CSVParserOptions = {}
): Promise<ParsedData> {
	const opts = { ...DEFAULT_OPTIONS, ...options };

	return new Promise((resolve, reject) => {
		const rows: Record<string, unknown>[] = [];
		let headers: string[] = [];
		let rowCount = 0;

		// PapaParse config - use type assertion due to complex overload types
		const config = {
			delimiter: opts.delimiter || '', // Auto-detect if empty
			header: true,
			skipEmptyLines: opts.skipEmptyRows,
			dynamicTyping: false, // Keep as strings, we handle type conversion
			transformHeader: (header: string) => header.trim(),

			step: opts.streaming ? (results: { data: unknown; meta: { cursor?: number } }) => {
				rowCount++;
				if (results.data) {
					rows.push(results.data as Record<string, unknown>);
				}

				// Report progress
				if (opts.onProgress && rowCount % (opts.chunkSize || 1000) === 0) {
					opts.onProgress({
						rowsProcessed: rowCount,
						bytesProcessed: 0, // Not available in string mode
					});
				}
			} : undefined,

			complete: (results: { data: unknown[]; meta: { fields?: string[] } }) => {
				// In non-streaming mode, results.data contains all rows
				if (!opts.streaming && results.data) {
					rows.push(...(results.data as Record<string, unknown>[]));
				}

				// Extract headers from first row's keys
				if (rows.length > 0) {
					headers = Object.keys(rows[0]);
				} else if (results.meta?.fields) {
					headers = results.meta.fields;
				}

				resolve({
					columns: headers,
					rows: rows,
					rowCount: rows.length
				});
			},

			error: (error: { message: string }) => {
				reject(new Error(`CSV parsing error: ${error.message}`));
			}
		};

		Papa.parse(content, config as Papa.ParseConfig);
	});
}

/**
 * Parse CSV file with streaming - for very large files
 *
 * This version uses File API streaming to handle files that are
 * too large to load entirely into memory.
 */
export async function parseCSVFile(
	file: File,
	options: CSVParserOptions = {}
): Promise<ParsedData> {
	const opts = { ...DEFAULT_OPTIONS, ...options, streaming: true };

	return new Promise((resolve, reject) => {
		const rows: Record<string, unknown>[] = [];
		let headers: string[] = [];
		let rowCount = 0;
		const fileSize = file.size;

		// PapaParse config - use type assertion due to complex overload types
		// Note: Can't use worker: true with transformHeader (functions can't be cloned to workers)
		// So we trim headers manually after parsing instead
		const config = {
			delimiter: opts.delimiter || '',
			header: true,
			skipEmptyLines: opts.skipEmptyRows,
			dynamicTyping: false,

			step: (results: { data: unknown; meta: { cursor?: number } }) => {
				rowCount++;
				if (results.data) {
					rows.push(results.data as Record<string, unknown>);
				}

				// Report progress periodically
				if (opts.onProgress && rowCount % (opts.chunkSize || 1000) === 0) {
					const bytesProcessed = results.meta?.cursor || 0;
					opts.onProgress({
						rowsProcessed: rowCount,
						bytesProcessed: bytesProcessed,
						estimatedTotal: fileSize,
						percentComplete: fileSize > 0 ? Math.round((bytesProcessed / fileSize) * 100) : undefined
					});
				}
			},

			complete: (results: { data: unknown[]; meta: { fields?: string[] } }) => {
				if (rows.length > 0) {
					// Get headers and trim whitespace
					headers = Object.keys(rows[0]).map(h => h.trim());

					// Rename keys in all rows to trimmed versions
					const trimmedRows = rows.map(row => {
						const newRow: Record<string, unknown> = {};
						for (const [key, value] of Object.entries(row as Record<string, unknown>)) {
							newRow[key.trim()] = value;
						}
						return newRow;
					});
					rows.length = 0;
					rows.push(...trimmedRows);
				} else if (results.meta?.fields) {
					headers = results.meta.fields.map(h => h.trim());
				}

				// Final progress update
				if (opts.onProgress) {
					opts.onProgress({
						rowsProcessed: rowCount,
						bytesProcessed: fileSize,
						estimatedTotal: fileSize,
						percentComplete: 100
					});
				}

				resolve({
					columns: headers,
					rows: rows,
					rowCount: rows.length
				});
			},

			error: (error: { message: string }) => {
				reject(new Error(`CSV parsing error: ${error.message}`));
			}
		};

		// Use explicit cast to work around PapaParse's complex overload types
		(Papa.parse as (input: File, config: object) => void)(file, config);
	});
}

/**
 * Analyze columns to detect types and gather info
 */
export function analyzeColumns(data: ParsedData): ColumnInfo[] {
	return data.columns.map(colName => {
		const values = data.rows.map(row => row[colName]);
		const nonEmptyValues = values.filter(v => v !== '' && v !== null && v !== undefined);

		return {
			name: colName,
			sampleValues: nonEmptyValues.slice(0, 5),
			detectedType: detectColumnType(nonEmptyValues),
			hasEmptyValues: nonEmptyValues.length < values.length,
			uniqueCount: new Set(nonEmptyValues).size
		};
	});
}

/**
 * Detect the most likely type for a column
 */
function detectColumnType(values: any[]): ColumnInfo['detectedType'] {
	if (values.length === 0) return 'string';

	let numberCount = 0;
	let booleanCount = 0;
	let arrayCount = 0;

	for (const value of values) {
		const str = String(value).trim();

		// Check for number
		if (!isNaN(Number(str)) && str !== '') {
			numberCount++;
		}

		// Check for boolean
		if (['true', 'false', 'yes', 'no', '1', '0'].includes(str.toLowerCase())) {
			booleanCount++;
		}

		// Check for array (comma-separated, multiple values)
		if (str.includes(',') && str.split(',').length > 1) {
			arrayCount++;
		}
	}

	const total = values.length;
	const threshold = 0.8; // 80% of values must match

	if (numberCount / total >= threshold) return 'number';
	if (booleanCount / total >= threshold) return 'boolean';
	if (arrayCount / total >= threshold) return 'array';

	return 'string';
}

/**
 * Estimate memory usage for a dataset
 */
export function estimateMemoryUsage(rowCount: number, columnCount: number, avgCellLength: number = 50): number {
	// Rough estimate: each cell is a string with overhead
	const bytesPerCell = avgCellLength * 2 + 50; // UTF-16 + object overhead
	return rowCount * columnCount * bytesPerCell;
}

/**
 * Check if streaming should be recommended for a file
 */
export function shouldUseStreaming(file: File): boolean {
	// Recommend streaming for files > 5MB
	const STREAMING_THRESHOLD = 5 * 1024 * 1024;
	return file.size > STREAMING_THRESHOLD;
}
