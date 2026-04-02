import { App, Modal, Setting, Notice } from 'obsidian';
import CrosswalkerPlugin from '../main';
import { ParsedData, CrosswalkerConfig, ColumnInfo, SavedConfig } from '../types/config';
import { parseCSVFile, analyzeColumns, shouldUseStreaming, ParseProgress } from './parsers/csv-parser';
import { findMatchingConfigs, ConfigMatch } from '../config/config-manager';
import { ConfigBrowserModal } from '../config/config-browser-modal';
import {
	generateNotes,
	buildConfigFromWizardState,
	estimateOutput,
	GenerationOptions
} from '../generation/generation-engine';

/**
 * Import Wizard Modal
 *
 * Multi-step wizard for importing structured data:
 * Step 1: Select source file
 * Step 2: Configure columns (hierarchy, frontmatter, links)
 * Step 3: Preview output
 * Step 4: Generate
 */
export class ImportWizardModal extends Modal {
	plugin: CrosswalkerPlugin;
	currentStep: number = 1;
	totalSteps: number = 4;

	// Wizard state
	sourceFile: File | null = null;
	sourceType: 'csv' | 'xlsx' | 'json' | null = null;
	selectedSheet: string | null = null;
	parsedData: ParsedData | null = null;
	columnInfos: ColumnInfo[] = [];
	config: Partial<CrosswalkerConfig> = {};

	// Column configuration state (captured from Step 2)
	columnConfigs: Map<string, { useAs: string; outputKey: string }> = new Map();

	// Output settings (captured from Step 4)
	outputPath: string = '';
	overwriteMode: 'skip' | 'replace' | 'error' = 'skip';
	frameworkId: string = '';

	// Parsing state
	isParsing: boolean = false;
	parseProgress: ParseProgress | null = null;
	parseError: string | null = null;

	// Generation state
	isGenerating: boolean = false;
	generationProgress: { current: number; total: number; message: string } | null = null;

	// Config matching state
	configMatches: ConfigMatch[] = [];
	appliedConfig: SavedConfig | null = null;
	configWarnings: string[] = [];

	constructor(app: App, plugin: CrosswalkerPlugin) {
		super(app);
		this.plugin = plugin;
		// Initialize from settings
		this.outputPath = plugin.settings.defaultOutputPath;
	}

	onOpen() {
		this.renderStep();
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
	}

	renderStep() {
		const { contentEl } = this;
		contentEl.empty();

		// Header with back button at top
		const header = contentEl.createEl('div', { cls: 'crosswalker-wizard-header' });

		// Top navigation row (back button + step indicator)
		const navRow = header.createEl('div', { cls: 'crosswalker-nav-row' });

		if (this.currentStep > 1) {
			const backBtn = navRow.createEl('button', { text: 'Back', cls: 'crosswalker-back-btn' });
			backBtn.addEventListener('click', () => {
				this.currentStep--;
				this.renderStep();
			});
		} else {
			navRow.createEl('div', { cls: 'crosswalker-back-placeholder' });
		}

		navRow.createEl('span', {
			text: `Step ${this.currentStep} of ${this.totalSteps}`,
			cls: 'crosswalker-step-indicator'
		});

		header.createEl('h2', { text: 'Import structured data' });

		// Content based on step
		const content = contentEl.createEl('div', { cls: 'crosswalker-wizard-content' });

		switch (this.currentStep) {
			case 1:
				this.renderStep1_SelectFile(content);
				break;
			case 2:
				this.renderStep2_ConfigureColumns(content);
				break;
			case 3:
				this.renderStep3_Preview(content);
				break;
			case 4:
				this.renderStep4_Generate(content);
				break;
		}

		// Footer with navigation
		this.renderFooter(contentEl);
	}

	// =========================================================================
	// Step 1: Select Source File
	// =========================================================================

	renderStep1_SelectFile(container: HTMLElement) {
		container.createEl('h3', { text: 'Select source file' });
		container.createEl('p', {
			text: 'Choose a file containing your structured data.',
			cls: 'setting-item-description'
		});

		// File input
		const fileInputContainer = container.createEl('div', { cls: 'crosswalker-file-input' });

		const fileInput = fileInputContainer.createEl('input', {
			type: 'file',
			attr: {
				accept: '.csv,.xlsx,.xls,.json'
			}
		});

		fileInput.addEventListener('change', async (e) => {
			const target = e.target as HTMLInputElement;
			if (target.files && target.files.length > 0) {
				this.sourceFile = target.files[0];
				this.detectFileType();
				// Reset config state when new file selected
				this.appliedConfig = null;
				this.configMatches = [];
				this.configWarnings = [];
				this.parsedData = null;
				this.renderStep(); // Re-render to show file info
			}
		});

		// Show selected file info
		if (this.sourceFile) {
			const fileInfo = container.createEl('div', { cls: 'crosswalker-file-info' });
			fileInfo.createEl('p', { text: `Selected: ${this.sourceFile.name}` });

			const fileSizeMB = (this.sourceFile.size / 1024 / 1024).toFixed(2);
			fileInfo.createEl('p', {
				text: `Type: ${this.sourceType?.toUpperCase()} | Size: ${fileSizeMB} MB`,
				cls: 'setting-item-description'
			});

			// If XLSX, show sheet selector (placeholder)
			if (this.sourceType === 'xlsx') {
				container.createEl('p', {
					text: 'Sheet selection will appear after parsing.',
					cls: 'setting-item-description'
				});
			}

			// Show streaming info for large files
			if (shouldUseStreaming(this.sourceFile)) {
				container.createEl('p', {
					text: 'Large file detected - streaming parser will be used for memory efficiency.',
					cls: 'setting-item-description'
				});
			}
		}

		// Show parsing progress
		if (this.isParsing) {
			const progressContainer = container.createEl('div', { cls: 'crosswalker-progress' });
			progressContainer.createEl('p', { text: 'Parsing file...' });
			if (this.parseProgress) {
				const percent = this.parseProgress.percentComplete ?? 0;
				progressContainer.createEl('progress', {
					attr: { value: String(percent), max: '100' }
				});
				progressContainer.createEl('p', {
					text: `${this.parseProgress.rowsProcessed.toLocaleString()} rows processed (${percent}%)`,
					cls: 'setting-item-description'
				});
			}
		}

		// Show parse error
		if (this.parseError) {
			const errorContainer = container.createEl('div', { cls: 'crosswalker-error' });
			errorContainer.createEl('p', { text: `Error: ${this.parseError}` });
		}

		// After parsing, show config suggestions (if any)
		if (this.parsedData && !this.isParsing) {
			this.renderConfigSuggestions(container);
		}
	}

	/**
	 * Render config suggestion UI after file is parsed
	 */
	renderConfigSuggestions(container: HTMLElement) {
		// Show applied config indicator if one is selected
		if (this.appliedConfig) {
			const appliedContainer = container.createEl('div', { cls: 'crosswalker-config-applied' });
			appliedContainer.createEl('p', {
				text: `📋 Using config: "${this.appliedConfig.name}"`,
				cls: 'crosswalker-applied-label'
			});

			if (this.configWarnings.length > 0) {
				for (const warning of this.configWarnings) {
					appliedContainer.createEl('p', { text: `⚠️ ${warning}`, cls: 'crosswalker-warning' });
				}
			}

			const clearBtn = appliedContainer.createEl('button', {
				text: 'Clear config',
				cls: 'mod-warning'
			});
			clearBtn.addEventListener('click', () => {
				this.appliedConfig = null;
				this.configWarnings = [];
				this.renderStep();
			});
			return;
		}

		// Check for matching configs
		if (this.configMatches.length === 0 && this.plugin.settings.enableConfigSuggestions) {
			this.findMatchingConfigsForFile();
		}

		// Show suggestion banner if we have matches
		if (this.configMatches.length > 0) {
			const bestMatch = this.configMatches[0];
			const suggestionContainer = container.createEl('div', { cls: 'crosswalker-config-suggestion' });

			const matchStrength = bestMatch.score >= 80 ? 'strong' : 'partial';
			suggestionContainer.createEl('p', {
				text: `💡 This looks like "${bestMatch.config.name}" (${bestMatch.score}% match)`,
				cls: `crosswalker-suggestion-label crosswalker-match-${matchStrength}`
			});

			// Show match details
			if (bestMatch.matchDetails.length > 0) {
				const detailsEl = suggestionContainer.createEl('p', {
					text: bestMatch.matchDetails.slice(0, 3).join(' • '),
					cls: 'setting-item-description'
				});
			}

			// Action buttons
			const btnContainer = suggestionContainer.createEl('div', { cls: 'crosswalker-suggestion-buttons' });

			const useBtn = btnContainer.createEl('button', {
				text: 'Use this config',
				cls: 'mod-cta'
			});
			useBtn.addEventListener('click', () => {
				this.applyConfig(bestMatch.config);
			});

			const browseBtn = btnContainer.createEl('button', {
				text: 'Browse configs...'
			});
			browseBtn.addEventListener('click', () => {
				this.openConfigBrowser();
			});

			const skipBtn = btnContainer.createEl('button', {
				text: 'Start fresh'
			});
			skipBtn.addEventListener('click', () => {
				this.configMatches = []; // Clear so banner doesn't show again
				this.renderStep();
			});

			// Show other matches if more than one
			if (this.configMatches.length > 1) {
				const otherMatches = suggestionContainer.createEl('details', { cls: 'crosswalker-other-matches' });
				otherMatches.createEl('summary', { text: `${this.configMatches.length - 1} other matching config(s)` });

				for (const match of this.configMatches.slice(1, 4)) {
					const matchRow = otherMatches.createEl('div', { cls: 'crosswalker-other-match-row' });
					matchRow.createEl('span', { text: `${match.config.name} (${match.score}%)` });
					const useOtherBtn = matchRow.createEl('button', { text: 'Use', cls: 'mod-small' });
					useOtherBtn.addEventListener('click', () => {
						this.applyConfig(match.config);
					});
				}
			}
		} else if (this.plugin.settings.savedConfigs.length > 0) {
			// No matches, but we have configs - offer to browse
			const noMatchContainer = container.createEl('div', { cls: 'crosswalker-config-no-match' });
			noMatchContainer.createEl('p', {
				text: 'No saved configs match this file.',
				cls: 'setting-item-description'
			});
			const browseBtn = noMatchContainer.createEl('button', { text: 'Browse saved configs' });
			browseBtn.addEventListener('click', () => {
				this.openConfigBrowser();
			});
		}
	}

	/**
	 * Find configs that match the current parsed data
	 */
	findMatchingConfigsForFile() {
		if (!this.parsedData || !this.sourceType) return;

		const threshold = this.plugin.settings.configMatchThreshold;
		const matches = findMatchingConfigs(
			this.parsedData,
			this.sourceType,
			this.plugin.settings.savedConfigs,
			this.sourceFile?.name
		);

		// Filter by threshold
		this.configMatches = matches.filter(m => m.score >= threshold);

		this.plugin.debug.log('Config matching results', {
			totalConfigs: this.plugin.settings.savedConfigs.length,
			threshold,
			matchCount: this.configMatches.length,
			matches: this.configMatches.map(m => ({ name: m.config.name, score: m.score }))
		});
	}

	/**
	 * Apply a saved config to pre-fill wizard settings
	 */
	applyConfig(config: SavedConfig) {
		this.appliedConfig = config;
		this.configWarnings = [];

		// Validate column matches
		if (this.parsedData && config.fingerprint.columnNames) {
			const fileColumns = new Set(this.parsedData.columns.map(c => c.toLowerCase()));
			const configColumns = config.fingerprint.columnNames;

			for (const col of configColumns) {
				if (!fileColumns.has(col.toLowerCase())) {
					this.configWarnings.push(`Config expects "${col}" column but file doesn't have it`);
				}
			}

			// Check for extra columns
			const configColumnSet = new Set(configColumns.map(c => c.toLowerCase()));
			const extraColumns = this.parsedData.columns.filter(c => !configColumnSet.has(c.toLowerCase()));
			if (extraColumns.length > 0 && extraColumns.length <= 3) {
				this.configWarnings.push(`File has extra columns: ${extraColumns.join(', ')}`);
			} else if (extraColumns.length > 3) {
				this.configWarnings.push(`File has ${extraColumns.length} extra columns not in config`);
			}
		}

		// Copy config settings to wizard state
		if (config.config) {
			this.config = { ...config.config };
		}

		// Update lastUsedAt
		config.lastUsedAt = new Date().toISOString();
		this.plugin.saveSettings();

		this.plugin.debug.log('Applied config', {
			configId: config.id,
			configName: config.name,
			warnings: this.configWarnings
		});

		new Notice(`Applied config: ${config.name}`);
		this.renderStep();
	}

	/**
	 * Open config browser in selection mode
	 */
	openConfigBrowser() {
		const modal = new ConfigBrowserModal(this.app, this.plugin, 'select', (result) => {
			if (result.action === 'select' && result.config) {
				this.applyConfig(result.config);
			}
		});
		modal.open();
	}

	detectFileType() {
		if (!this.sourceFile) return;

		const name = this.sourceFile.name.toLowerCase();
		if (name.endsWith('.csv')) {
			this.sourceType = 'csv';
		} else if (name.endsWith('.xlsx') || name.endsWith('.xls')) {
			this.sourceType = 'xlsx';
		} else if (name.endsWith('.json')) {
			this.sourceType = 'json';
		}
	}

	// =========================================================================
	// Step 2: Configure Columns
	// =========================================================================

	renderStep2_ConfigureColumns(container: HTMLElement) {
		container.createEl('h3', { text: 'Configure columns' });

		if (!this.parsedData) {
			container.createEl('p', { text: 'No data parsed. Please go back and select a file.' });
			return;
		}

		// Show applied config indicator
		if (this.appliedConfig) {
			const configIndicator = container.createEl('div', { cls: 'crosswalker-step2-config-indicator' });
			configIndicator.createEl('span', {
				text: `📋 Pre-filled from: "${this.appliedConfig.name}"`,
				cls: 'crosswalker-config-badge'
			});
			const clearBtn = configIndicator.createEl('button', { text: 'Clear', cls: 'mod-small' });
			clearBtn.addEventListener('click', () => {
				this.appliedConfig = null;
				this.config = {};
				this.configWarnings = [];
				this.renderStep();
			});
		}

		container.createEl('p', {
			text: `Found ${this.parsedData.columns.length} columns and ${this.parsedData.rowCount.toLocaleString()} rows.`,
			cls: 'setting-item-description'
		});

		// Build column mapping lookup from applied config
		const configMapping = this.buildColumnMappingLookup();

		// Column configuration table
		const tableContainer = container.createEl('div', { cls: 'crosswalker-table-container' });
		const table = tableContainer.createEl('table', { cls: 'crosswalker-column-table' });
		const thead = table.createEl('thead');
		const headerRow = thead.createEl('tr');
		headerRow.createEl('th', { text: 'Column' });
		headerRow.createEl('th', { text: 'Detected type' });
		headerRow.createEl('th', { text: 'Sample values' });
		headerRow.createEl('th', { text: 'Use as' });
		headerRow.createEl('th', { text: 'Output key' });

		const tbody = table.createEl('tbody');

		// Render each column
		for (const colInfo of this.columnInfos) {
			const row = tbody.createEl('tr');
			const colMapping = configMapping.get(colInfo.name.toLowerCase());

			// Initialize column config if not set
			if (!this.columnConfigs.has(colInfo.name)) {
				this.columnConfigs.set(colInfo.name, {
					useAs: colMapping?.useAs || 'frontmatter',
					outputKey: colMapping?.outputKey || this.normalizeKey(colInfo.name)
				});
			}
			const currentConfig = this.columnConfigs.get(colInfo.name)!;

			// Add visual indicator if this column is from config
			if (colMapping) {
				row.addClass('crosswalker-row-from-config');
			}

			// Column name
			const nameCell = row.createEl('td', { cls: 'crosswalker-col-name' });
			nameCell.createEl('span', { text: colInfo.name });
			if (colMapping) {
				nameCell.createEl('span', { text: ' ⚙️', cls: 'crosswalker-config-icon', attr: { title: 'Pre-filled from config' } });
			}

			// Detected type
			const typeCell = row.createEl('td');
			const typeIcon = this.getTypeIcon(colInfo.detectedType);
			typeCell.createEl('span', { text: `${typeIcon} ${colInfo.detectedType}` });
			if (colInfo.hasEmptyValues) {
				typeCell.createEl('span', { text: ' (has blanks)', cls: 'crosswalker-warning' });
			}

			// Sample values (first 3)
			const sampleCell = row.createEl('td', { cls: 'crosswalker-samples' });
			const samples = colInfo.sampleValues.slice(0, 3);
			sampleCell.createEl('span', {
				text: samples.map(s => this.truncate(String(s), 20)).join(', '),
				cls: 'setting-item-description'
			});

			// Use as dropdown - pre-fill from config or existing state
			const useAsCell = row.createEl('td');
			const useAsSelect = useAsCell.createEl('select', { cls: 'dropdown' });
			useAsSelect.createEl('option', { text: 'Frontmatter', attr: { value: 'frontmatter' } });
			useAsSelect.createEl('option', { text: 'Hierarchy level', attr: { value: 'hierarchy' } });
			useAsSelect.createEl('option', { text: 'Note title', attr: { value: 'title' } });
			useAsSelect.createEl('option', { text: 'Crosswalk link', attr: { value: 'link' } });
			useAsSelect.createEl('option', { text: 'Body content', attr: { value: 'body' } });
			useAsSelect.createEl('option', { text: 'Skip', attr: { value: 'skip' } });

			// Set value from stored state
			useAsSelect.value = currentConfig.useAs;

			// Update state on change
			useAsSelect.addEventListener('change', () => {
				currentConfig.useAs = useAsSelect.value;
				this.columnConfigs.set(colInfo.name, currentConfig);
			});

			// Output key (editable) - pre-fill from config or existing state
			const keyCell = row.createEl('td');
			const keyInput = keyCell.createEl('input', {
				type: 'text',
				value: currentConfig.outputKey,
				cls: 'crosswalker-key-input'
			});
			// eslint-disable-next-line obsidianmd/ui/sentence-case
			keyInput.placeholder = 'output_key';

			// Update state on change
			keyInput.addEventListener('input', () => {
				currentConfig.outputKey = keyInput.value;
				this.columnConfigs.set(colInfo.name, currentConfig);
			});
		}

		// Unique values summary
		container.createEl('h4', { text: 'Column statistics' });
		const statsContainer = container.createEl('div', { cls: 'crosswalker-stats' });

		for (const colInfo of this.columnInfos.slice(0, 5)) { // Show first 5
			statsContainer.createEl('p', {
				text: `${colInfo.name}: ${colInfo.uniqueCount.toLocaleString()} unique values`,
				cls: 'setting-item-description'
			});
		}
		if (this.columnInfos.length > 5) {
			statsContainer.createEl('p', {
				text: `... and ${this.columnInfos.length - 5} more columns`,
				cls: 'setting-item-description'
			});
		}
	}

	/**
	 * Build a lookup map from column name -> { useAs, outputKey } from applied config
	 */
	buildColumnMappingLookup(): Map<string, { useAs: string; outputKey: string }> {
		const lookup = new Map<string, { useAs: string; outputKey: string }>();

		if (!this.appliedConfig?.config?.mapping) {
			return lookup;
		}

		const mapping = this.appliedConfig.config.mapping;

		// Process hierarchy mappings
		if (mapping.hierarchy) {
			for (const h of mapping.hierarchy) {
				lookup.set(h.column.toLowerCase(), {
					useAs: 'hierarchy',
					outputKey: h.column.toLowerCase().replace(/[^a-z0-9]+/g, '_')
				});
			}
		}

		// Process frontmatter mappings
		if (mapping.frontmatter) {
			for (const f of mapping.frontmatter) {
				lookup.set(f.column.toLowerCase(), {
					useAs: 'frontmatter',
					outputKey: f.key
				});
			}
		}

		// Process link mappings
		if (mapping.links) {
			for (const l of mapping.links) {
				lookup.set(l.column.toLowerCase(), {
					useAs: 'link',
					outputKey: l.frontmatterKey || l.column.toLowerCase().replace(/[^a-z0-9]+/g, '_')
				});
			}
		}

		// Process body mappings
		if (mapping.body) {
			for (const b of mapping.body) {
				lookup.set(b.column.toLowerCase(), {
					useAs: 'body',
					outputKey: b.heading || b.column
				});
			}
		}

		// Process filename template to detect title column
		if (mapping.filename?.template) {
			// Extract column names from template like "{{Control ID}}"
			const matches = mapping.filename.template.matchAll(/\{\{([^}]+)\}\}/g);
			for (const match of matches) {
				const colName = match[1].toLowerCase();
				// Only set as title if not already mapped to something else
				if (!lookup.has(colName)) {
					lookup.set(colName, {
						useAs: 'title',
						outputKey: colName.replace(/[^a-z0-9]+/g, '_')
					});
				}
			}
		}

		return lookup;
	}

	getTypeIcon(type: string): string {
		switch (type) {
			case 'number': return '🔢';
			case 'boolean': return '✓';
			case 'array': return '📋';
			default: return '📝';
		}
	}

	truncate(str: string, maxLen: number): string {
		if (str.length <= maxLen) return str;
		return str.substring(0, maxLen - 1) + '…';
	}

	normalizeKey(name: string): string {
		// Convert to snake_case by default
		return name
			.toLowerCase()
			.replace(/[^a-z0-9]+/g, '_')
			.replace(/^_+|_+$/g, '');
	}

	// =========================================================================
	// Step 3: Preview
	// =========================================================================

	renderStep3_Preview(container: HTMLElement) {
		container.createEl('h3', { text: 'Preview output' });

		container.createEl('p', {
			text: 'Review the folder structure and sample notes before generating.',
			cls: 'setting-item-description'
		});

		if (!this.parsedData) {
			container.createEl('p', { text: 'No data to preview.' });
			return;
		}

		// Build config from current wizard state
		const config = buildConfigFromWizardState(
			this.columnConfigs,
			this.parsedData.columns
		);

		// Estimate output
		const estimate = estimateOutput(this.parsedData, config);

		// Summary stats
		const summaryContainer = container.createEl('div', { cls: 'crosswalker-preview-summary' });
		summaryContainer.createEl('p', {
			text: `Will create approximately: ${estimate.noteCount} notes, ${estimate.folderCount} folders, ${estimate.linkCount} links`,
			cls: 'setting-item-description'
		});

		// Build folder tree preview from actual data
		const treeContainer = container.createEl('div', { cls: 'crosswalker-tree-preview' });
		const treePreview = this.buildFolderTreePreview(config);
		treeContainer.createEl('pre', { text: treePreview });

		// Sample note preview from first row
		container.createEl('h4', { text: 'Sample note' });
		const notePreview = container.createEl('div', { cls: 'crosswalker-note-preview' });
		const sampleNote = this.buildSampleNotePreview(config);
		notePreview.createEl('pre', { text: sampleNote });
	}

	/**
	 * Build a folder tree preview string from configuration
	 */
	buildFolderTreePreview(config: Partial<CrosswalkerConfig>): string {
		if (!this.parsedData || !config.mapping) {
			return `${this.outputPath}/\n└── (No hierarchy configured)`;
		}

		const hierarchyColumns = config.mapping.hierarchy || [];
		if (hierarchyColumns.length === 0) {
			return `${this.outputPath}/\n└── (Flat structure - all notes in root folder)`;
		}

		// Collect unique paths from data (limit to first 50 rows for performance)
		const paths = new Map<string, Set<string>>();
		const sampleRows = this.parsedData.rows.slice(0, 50);

		for (const row of sampleRows) {
			let currentPath = '';
			for (const h of hierarchyColumns.sort((a, b) => a.level - b.level)) {
				const value = row[h.column];
				if (value) {
					const segment = String(value).trim();
					if (!paths.has(currentPath)) {
						paths.set(currentPath, new Set());
					}
					paths.get(currentPath)!.add(segment);
					currentPath = currentPath ? `${currentPath}/${segment}` : segment;
				}
			}
		}

		// Build tree string
		const lines: string[] = [`${this.outputPath}/`];

		// Get root level items
		const rootItems = paths.get('') || new Set();
		const rootArray = Array.from(rootItems).slice(0, 5);

		rootArray.forEach((item, i) => {
			const isLast = i === rootArray.length - 1;
			const prefix = isLast ? '└── ' : '├── ';
			lines.push(`${prefix}${item}/`);

			// Get children of this item
			const children = paths.get(item) || new Set();
			const childArray = Array.from(children).slice(0, 3);

			childArray.forEach((child, j) => {
				const childIsLast = j === childArray.length - 1;
				const childPrefix = isLast ? '    ' : '│   ';
				const connector = childIsLast ? '└── ' : '├── ';
				lines.push(`${childPrefix}${connector}${child}/`);
			});

			if (children.size > 3) {
				const childPrefix = isLast ? '    ' : '│   ';
				lines.push(`${childPrefix}    ... and ${children.size - 3} more`);
			}
		});

		if (rootItems.size > 5) {
			lines.push(`... and ${rootItems.size - 5} more folders`);
		}

		return lines.join('\n');
	}

	/**
	 * Build a sample note preview from the first row
	 */
	buildSampleNotePreview(config: Partial<CrosswalkerConfig>): string {
		if (!this.parsedData || this.parsedData.rows.length === 0) {
			return '(No data to preview)';
		}

		const row = this.parsedData.rows[0];
		const lines: string[] = ['---'];

		// Add frontmatter properties
		if (config.mapping?.frontmatter) {
			for (const fm of config.mapping.frontmatter) {
				const value = row[fm.column];
				if (value !== undefined && value !== null && value !== '') {
					if (typeof value === 'string' && (value.includes(':') || value.includes('"'))) {
						lines.push(`${fm.key}: "${value.replace(/"/g, '\\"')}"`);
					} else {
						lines.push(`${fm.key}: ${value}`);
					}
				}
			}
		}

		// Add link properties
		if (config.mapping?.links) {
			for (const link of config.mapping.links) {
				const value = row[link.column];
				if (value && (link.location === 'frontmatter' || link.location === 'both')) {
					const key = link.frontmatterKey || link.column;
					lines.push(`${key}: "[[${value}]]"`);
				}
			}
		}

		// Add _crosswalker metadata preview
		lines.push('_crosswalker:');
		lines.push('  sourceId: "example-id"');
		lines.push('  schemaVersion: 1');
		lines.push(`  importedAt: "${new Date().toISOString().split('T')[0]}..."`);
		lines.push('  importedProperties:');
		const propCount = (config.mapping?.frontmatter?.length || 0) + (config.mapping?.links?.length || 0);
		lines.push(`    - ... (${propCount} properties)`);

		lines.push('---');
		lines.push('');

		// Add body content
		if (config.mapping?.body) {
			for (const body of config.mapping.body) {
				const value = row[body.column];
				if (value) {
					if (body.heading) {
						lines.push(`## ${body.heading}`);
						lines.push('');
					}
					const preview = String(value).length > 100
						? String(value).substring(0, 100) + '...'
						: String(value);
					lines.push(preview);
					lines.push('');
				}
			}
		}

		// Add link sections in body
		if (config.mapping?.links) {
			for (const link of config.mapping.links) {
				const value = row[link.column];
				if (value && (link.location === 'body' || link.location === 'both')) {
					const section = link.bodySection || 'Related';
					lines.push(`## ${section}`);
					lines.push('');
					lines.push(`- [[${value}]]`);
					lines.push('');
				}
			}
		}

		return lines.join('\n');
	}

	// =========================================================================
	// Step 4: Generate
	// =========================================================================

	renderStep4_Generate(container: HTMLElement) {
		container.createEl('h3', { text: 'Generate notes' });

		// Show generation progress if generating
		if (this.isGenerating) {
			const progressContainer = container.createEl('div', { cls: 'crosswalker-generation-progress' });
			progressContainer.createEl('p', { text: 'Generating notes...' });
			if (this.generationProgress) {
				const percent = Math.round((this.generationProgress.current / this.generationProgress.total) * 100);
				progressContainer.createEl('progress', {
					attr: { value: String(percent), max: '100' }
				});
				progressContainer.createEl('p', {
					text: `${this.generationProgress.message} (${percent}%)`,
					cls: 'setting-item-description'
				});
			}
			return;
		}

		container.createEl('p', {
			text: 'Ready to generate notes. This will create folders and files in your vault.',
			cls: 'setting-item-description'
		});

		// Output path setting
		new Setting(container)
			.setName('Output path')
			.setDesc('Folder where notes will be created')
			.addText(text => text
				.setPlaceholder('Ontologies')
				.setValue(this.outputPath)
				.onChange(value => {
					this.outputPath = value;
				}));

		// Framework ID setting (for _crosswalker metadata)
		new Setting(container)
			.setName('Framework identifier')
			.setDesc('Optional ID for this framework (used in metadata for cross-framework features)')
			.addText(text => text
				// eslint-disable-next-line obsidianmd/ui/sentence-case
				.setPlaceholder('e.g., nist-csf-2.0')
				.setValue(this.frameworkId)
				.onChange(value => {
					this.frameworkId = value;
				}));

		// Overwrite behavior
		new Setting(container)
			.setName('If files exist')
			.addDropdown(dropdown => dropdown
				.addOption('skip', 'Skip existing (safe)')
				.addOption('replace', 'Replace existing')
				.addOption('error', 'Stop on conflict')
				.setValue(this.overwriteMode)
				.onChange(value => {
					this.overwriteMode = value as 'skip' | 'replace' | 'error';
				}));

		// Summary with actual estimates
		if (this.parsedData) {
			const config = buildConfigFromWizardState(this.columnConfigs, this.parsedData.columns);
			const estimate = estimateOutput(this.parsedData, config);

			container.createEl('div', { cls: 'crosswalker-generate-summary' }, (div) => {
				div.createEl('p', { text: 'Will create:' });
				div.createEl('ul', {}, (ul) => {
					ul.createEl('li', { text: `~${estimate.folderCount} folders` });
					ul.createEl('li', { text: `~${estimate.noteCount} notes` });
					ul.createEl('li', { text: `~${estimate.linkCount} crosswalk links` });
				});
			});

			// Warning for large imports
			if (estimate.noteCount > 500) {
				container.createEl('p', {
					text: `⚠️ Large import detected (${estimate.noteCount} notes). This may take a minute or two.`,
					cls: 'crosswalker-warning'
				});
			}
		}
	}

	// =========================================================================
	// Footer Navigation
	// =========================================================================

	renderFooter(container: HTMLElement) {
		const footer = container.createEl('div', { cls: 'crosswalker-wizard-footer' });

		// Spacer (back button is now in header)
		footer.createEl('div', { cls: 'crosswalker-footer-spacer' });

		// Next/Generate button
		if (this.currentStep < this.totalSteps) {
			const nextBtn = footer.createEl('button', {
				text: this.isParsing ? 'Parsing...' : 'Next →',
				cls: 'mod-cta'
			});
			nextBtn.disabled = this.isParsing;
			nextBtn.addEventListener('click', async () => {
				if (await this.validateCurrentStep()) {
					this.currentStep++;
					this.renderStep();
				}
			});
		} else {
			const generateBtn = footer.createEl('button', {
				text: 'Generate',
				cls: 'mod-cta'
			});
			generateBtn.addEventListener('click', () => {
				this.generate();
			});
		}
	}

	async validateCurrentStep(): Promise<boolean> {
		switch (this.currentStep) {
			case 1:
				if (!this.sourceFile) {
					new Notice('Please select a file first.');
					return false;
				}
				// Parse file before moving to step 2
				if (!this.parsedData) {
					const parseSuccess = await this.parseSourceFile();
					if (parseSuccess) {
						// After successful parse, check for matching configs
						// If we have matches and suggestions are enabled, stay on Step 1 to show them
						if (this.plugin.settings.enableConfigSuggestions && !this.appliedConfig) {
							this.findMatchingConfigsForFile();
							if (this.configMatches.length > 0) {
								// Re-render to show config suggestions, don't advance yet
								this.renderStep();
								return false;
							}
						}
					}
					return parseSuccess;
				}
				return true;
			default:
				return true;
		}
	}

	async parseSourceFile(): Promise<boolean> {
		if (!this.sourceFile) return false;

		this.isParsing = true;
		this.parseError = null;
		this.renderStep(); // Show loading state

		await this.plugin.debug.log('Starting file parse', {
			fileName: this.sourceFile.name,
			fileSize: this.sourceFile.size,
			fileType: this.sourceType
		});

		try {
			if (this.sourceType === 'csv') {
				const useStreaming = shouldUseStreaming(this.sourceFile);
				await this.plugin.debug.log('CSV parsing config', { useStreaming });

				if (useStreaming) {
					new Notice(`Large file detected (${(this.sourceFile.size / 1024 / 1024).toFixed(1)}MB). Using streaming parser...`);
				}

				this.parsedData = await parseCSVFile(this.sourceFile, {
					streaming: useStreaming,
					onProgress: (progress) => {
						this.parseProgress = progress;
						// Update progress display periodically
						if (progress.percentComplete !== undefined && progress.percentComplete % 10 === 0) {
							this.renderStep();
						}
					}
				});

				// Analyze columns for type detection
				this.columnInfos = analyzeColumns(this.parsedData);

				await this.plugin.debug.log('CSV parsing complete', {
					rowCount: this.parsedData.rowCount,
					columnCount: this.parsedData.columns.length,
					columns: this.parsedData.columns
				});

				new Notice(`Parsed ${this.parsedData.rowCount} rows with ${this.parsedData.columns.length} columns.`);
			} else if (this.sourceType === 'xlsx') {
				// TODO: Implement XLSX parsing
				new Notice('Excel file parsing not yet implemented.');
				this.isParsing = false;
				this.parseError = 'Excel (.xlsx) parsing is not yet implemented. Please use a CSV file for now.';
				this.renderStep();
				return false;
			} else if (this.sourceType === 'json') {
				// TODO: Implement JSON parsing
				new Notice('JSON parsing not yet implemented.');
				this.isParsing = false;
				this.parseError = 'JSON parsing is not yet implemented. Please use a CSV file for now.';
				this.renderStep();
				return false;
			}

			this.isParsing = false;
			return true;
		} catch (error) {
			this.parseError = error instanceof Error ? error.message : String(error);
			this.isParsing = false;

			await this.plugin.debug.log('Parse error', {
				error: this.parseError,
				stack: error instanceof Error ? error.stack : undefined
			});

			new Notice(`Parse error: ${this.parseError}`);
			this.renderStep();
			return false;
		}
	}

	async generate() {
		if (!this.parsedData) {
			new Notice('No data to generate. Please go back and select a file.');
			return;
		}

		// Build config from wizard state
		const config = buildConfigFromWizardState(
			this.columnConfigs,
			this.parsedData.columns
		);

		// Prepare generation options
		const options: GenerationOptions = {
			basePath: this.outputPath || this.plugin.settings.defaultOutputPath,
			overwriteMode: this.overwriteMode,
			createFolders: true,
			frameworkId: this.frameworkId || undefined,
			configId: this.appliedConfig?.id,
			sourceFileName: this.sourceFile?.name,
			onProgress: (current, total, message) => {
				this.generationProgress = { current, total, message };
				// Update UI periodically
				if (current % 20 === 0 || current === total) {
					this.renderStep();
				}
			}
		};

		await this.plugin.debug.log('Starting generation', {
			basePath: options.basePath,
			overwriteMode: options.overwriteMode,
			frameworkId: options.frameworkId,
			rowCount: this.parsedData.rowCount
		});

		// Set generating state and show progress UI
		this.isGenerating = true;
		this.generationProgress = { current: 0, total: this.parsedData.rowCount, message: 'Starting...' };
		this.renderStep();

		try {
			// Run generation
			const result = await generateNotes(
				this.app,
				this.parsedData,
				config,
				options,
				this.plugin.debug
			);

			this.isGenerating = false;

			await this.plugin.debug.log('Generation complete', {
				success: result.success,
				created: result.created.length,
				skipped: result.skipped.length,
				errors: result.errors.length,
				duration: result.duration
			});

			// Show results
			if (result.success) {
				const message = `✅ Created ${result.created.length} notes` +
					(result.skipped.length > 0 ? `, skipped ${result.skipped.length} existing` : '') +
					` in ${(result.duration / 1000).toFixed(1)}s`;
				new Notice(message, 5000);

				// Ask to save config if enabled and not using existing config
				if (this.plugin.settings.promptToSaveConfig && !this.appliedConfig) {
					// Could prompt to save config here - for now just log
					await this.plugin.debug.log('Consider saving config for future use');
				}

				// Close modal on success
				this.close();
			} else {
				// Show error summary
				const errorSummary = result.errors.slice(0, 3)
					.map(e => `Row ${e.row}: ${e.message}`)
					.join('\n');
				new Notice(`⚠️ Generation completed with errors:\n${errorSummary}`, 10000);

				// Render results in modal
				this.renderGenerationResults(result);
			}

		} catch (error) {
			this.isGenerating = false;
			const errorMessage = error instanceof Error ? error.message : String(error);

			await this.plugin.debug.log('Generation error', { error: errorMessage });
			new Notice(`❌ Generation failed: ${errorMessage}`, 10000);

			this.renderStep();
		}
	}

	/**
	 * Render generation results (errors/warnings) in the modal
	 */
	renderGenerationResults(result: { success: boolean; created: string[]; skipped: string[]; errors: { row: number; message: string }[] }) {
		const { contentEl } = this;
		contentEl.empty();

		contentEl.createEl('h2', { text: 'Generation results' });

		// Summary
		const summary = contentEl.createEl('div', { cls: 'crosswalker-results-summary' });
		summary.createEl('p', { text: `✅ Created: ${result.created.length} notes` });
		if (result.skipped.length > 0) {
			summary.createEl('p', { text: `⏭️ Skipped: ${result.skipped.length} existing notes` });
		}
		if (result.errors.length > 0) {
			summary.createEl('p', { text: `❌ Errors: ${result.errors.length}` });
		}

		// Error details
		if (result.errors.length > 0) {
			contentEl.createEl('h4', { text: 'Errors' });
			const errorList = contentEl.createEl('div', { cls: 'crosswalker-error-list' });

			for (const error of result.errors.slice(0, 20)) {
				errorList.createEl('p', {
					text: `Row ${error.row}: ${error.message}`,
					cls: 'crosswalker-error-item'
				});
			}

			if (result.errors.length > 20) {
				errorList.createEl('p', {
					text: `... and ${result.errors.length - 20} more errors`,
					cls: 'setting-item-description'
				});
			}
		}

		// Close button
		const footer = contentEl.createEl('div', { cls: 'crosswalker-wizard-footer' });
		const closeBtn = footer.createEl('button', { text: 'Close' });
		closeBtn.addEventListener('click', () => this.close());
	}
}
