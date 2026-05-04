import { Plugin } from 'obsidian';
import { CrosswalkerSettings, DEFAULT_SETTINGS } from './settings/settings-data';
import { CrosswalkerSettingTab } from './settings/settings-tab';
import { ImportWizardModal } from './import/import-wizard';
import { ConfigBrowserModal } from './config/config-browser-modal';
import { DebugLog } from './utils/debug';
import { initValidator, validateRecipe, validateTier1Frontmatter } from './validation/validator';

/**
 * Crosswalker - Import structured ontologies into Obsidian
 *
 * Core capabilities:
 * 1. Import structured data (ontologies, taxonomies, frameworks) from CSV/XLSX/JSON
 * 2. Generate hierarchical folder structures with markdown notes
 * 3. Map columns to frontmatter properties with configurable transformations
 * 4. Create WikiLinks for crosswalks between nodes
 * 5. Enable typed links with metadata (Phase 2)
 */
export default class CrosswalkerPlugin extends Plugin {
	settings: CrosswalkerSettings;
	debug: DebugLog;

	// Validator handles attached to the plugin instance so E2E tests + future
	// command implementations can call them via the plugin reference.
	// Underlying implementation is module-level singletons in validation/validator.ts.
	validateRecipe = validateRecipe;
	validateTier1Frontmatter = validateTier1Frontmatter;

	async onload() {
		await this.loadSettings();

		// Initialize debug logging
		this.debug = new DebugLog(this.app, this.settings.enableDebugLog);

		// Compile spec schemas (spec/tier1.schema.json + spec/recipe.schema.json)
		// at startup. Throws fast if schema files are malformed.
		initValidator();

		// Register the main import command
		this.addCommand({
			id: 'import-structured-data',
			name: 'Import structured data',
			callback: () => {
				new ImportWizardModal(this.app, this).open();
			}
		});

		// Register config browser command
		this.addCommand({
			id: 'browse-saved-configs',
			name: 'Browse saved configurations',
			callback: () => {
				new ConfigBrowserModal(this.app, this, 'browse').open();
			}
		});

		// Register settings tab
		this.addSettingTab(new CrosswalkerSettingTab(this.app, this));

		await this.debug.log('Crosswalker plugin loaded');
	}

	onunload() {
		this.debug?.log('Crosswalker plugin unloaded');
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}
