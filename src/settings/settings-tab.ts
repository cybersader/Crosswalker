import { App, Notice, PluginSettingTab, Setting } from 'obsidian';
import { exportConfigToString, importConfig } from '../config/config-manager';
import { ConfigBrowserModal } from '../config/config-browser-modal';
import { SavedConfig } from '../types/config';
import CrosswalkerPlugin from '../main';

/**
 * Crosswalker Settings Tab
 *
 * Provides the settings UI in Obsidian preferences.
 * Note: Uses sentence case per Obsidian plugin guidelines.
 */
export class CrosswalkerSettingTab extends PluginSettingTab {
	plugin: CrosswalkerPlugin;

	constructor(app: App, plugin: CrosswalkerPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		// Output Section
		new Setting(containerEl).setName('Output').setHeading();

		new Setting(containerEl)
			.setName('Default output path')
			.setDesc('Default folder for imported data')
			.addText(text => text
				.setPlaceholder('Ontologies')
				.setValue(this.plugin.settings.defaultOutputPath)
				.onChange(async (value) => {
					this.plugin.settings.defaultOutputPath = value;
					await this.plugin.saveSettings();
				}));

		// Import Defaults Section
		new Setting(containerEl).setName('Import defaults').setHeading();

		new Setting(containerEl)
			.setName('Key naming style')
			.setDesc('How column names are converted to frontmatter keys')
			.addDropdown(dropdown => dropdown
				.addOption('as-is', 'As-is')
				.addOption('lowercase', 'Lowercase')
				.addOption('snake_case', 'Snake case')
				.addOption('camelCase', 'Camel case')
				.addOption('kebab-case', 'Kebab case')
				.setValue(this.plugin.settings.defaultKeyNamingStyle)
				.onChange(async (value: any) => {
					this.plugin.settings.defaultKeyNamingStyle = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Array handling')
			.setDesc('How to handle columns with multiple values')
			.addDropdown(dropdown => dropdown
				.addOption('as_array', 'Keep as YAML array')
				.addOption('stringify', 'Convert to string')
				.addOption('first', 'Take first value')
				.addOption('last', 'Take last value')
				.addOption('join', 'Join with delimiter')
				.setValue(this.plugin.settings.defaultArrayHandling)
				.onChange(async (value: any) => {
					this.plugin.settings.defaultArrayHandling = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Empty value handling')
			.setDesc('What to do when a cell is empty')
			.addDropdown(dropdown => dropdown
				.addOption('omit', 'Omit field entirely')
				.addOption('empty_string', 'Include as empty string')
				.addOption('null', 'Include as null')
				.addOption('default', 'Use default value')
				.setValue(this.plugin.settings.defaultEmptyHandling)
				.onChange(async (value: any) => {
					this.plugin.settings.defaultEmptyHandling = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Frontmatter style')
			.setDesc('How to structure the YAML frontmatter')
			.addDropdown(dropdown => dropdown
				.addOption('flat', 'Flat')
				.addOption('dot_to_nest', 'Dot notation creates nesting')
				.addOption('group_by_prefix', 'Group by prefix')
				.setValue(this.plugin.settings.defaultFrontmatterStyle)
				.onChange(async (value: any) => {
					this.plugin.settings.defaultFrontmatterStyle = value;
					await this.plugin.saveSettings();
				}));

		// Link Syntax Section
		new Setting(containerEl).setName('Typed links').setHeading();

		new Setting(containerEl)
			.setName('Link syntax preset')
			.setDesc('Preset for typed link syntax')
			.addDropdown(dropdown => dropdown
				.addOption('simple', 'Simple')
				.addOption('standard', 'Standard')
				.addOption('full', 'Full')
				.addOption('custom', 'Custom')
				.setValue(this.plugin.settings.linkSyntaxPreset)
				.onChange(async (value: any) => {
					this.plugin.settings.linkSyntaxPreset = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Link namespace')
			.setDesc('Namespace for typed links')
			.addText(text => text
				// eslint-disable-next-line obsidianmd/ui/sentence-case
				.setPlaceholder('crosswalker')
				.setValue(this.plugin.settings.customLinkNamespace)
				.onChange(async (value) => {
					this.plugin.settings.customLinkNamespace = value;
					await this.plugin.saveSettings();
				}));

		// Config Suggestions Section
		new Setting(containerEl).setName('Smart suggestions').setHeading();

		new Setting(containerEl)
			.setName('Enable config suggestions')
			.setDesc('Suggest saved configurations when columns match')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.enableConfigSuggestions)
				.onChange(async (value) => {
					this.plugin.settings.enableConfigSuggestions = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Match threshold')
			.setDesc('Minimum match score (0-100) to suggest a config')
			.addSlider(slider => slider
				.setLimits(0, 100, 5)
				.setValue(this.plugin.settings.configMatchThreshold)
				.setDynamicTooltip()
				.onChange(async (value) => {
					this.plugin.settings.configMatchThreshold = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Enable pattern detection')
			.setDesc('Analyze data patterns (like control identifiers) for smarter matching')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.enablePatternDetection)
				.onChange(async (value) => {
					this.plugin.settings.enablePatternDetection = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Prompt to save config')
			.setDesc('Ask to save configuration after successful import')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.promptToSaveConfig)
				.onChange(async (value) => {
					this.plugin.settings.promptToSaveConfig = value;
					await this.plugin.saveSettings();
				}));

		// Wizard Behavior Section
		new Setting(containerEl).setName('Wizard behavior').setHeading();

		new Setting(containerEl)
			.setName('Show column statistics')
			.setDesc('Display unique value counts and detected types')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.showColumnStatistics)
				.onChange(async (value) => {
					this.plugin.settings.showColumnStatistics = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Show sample values')
			.setDesc('Display sample data in column configuration')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.showSampleValues)
				.onChange(async (value) => {
					this.plugin.settings.showSampleValues = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Sample value count')
			.setDesc('Number of sample values to show per column')
			.addSlider(slider => slider
				.setLimits(1, 10, 1)
				.setValue(this.plugin.settings.sampleValueCount)
				.setDynamicTooltip()
				.onChange(async (value) => {
					this.plugin.settings.sampleValueCount = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Confirm before generate')
			.setDesc('Show confirmation dialog before creating files')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.confirmBeforeGenerate)
				.onChange(async (value) => {
					this.plugin.settings.confirmBeforeGenerate = value;
					await this.plugin.saveSettings();
				}));

		// Advanced Section
		new Setting(containerEl).setName('Advanced').setHeading();

		new Setting(containerEl)
			.setName('Enable custom transforms')
			.setDesc('Allow custom JavaScript transform functions')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.enableCustomTransforms)
				.onChange(async (value) => {
					this.plugin.settings.enableCustomTransforms = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Streaming threshold')
			.setDesc('File size in megabytes to trigger streaming parser (for large files)')
			.addSlider(slider => slider
				.setLimits(1, 50, 1)
				.setValue(this.plugin.settings.streamingThresholdMB)
				.setDynamicTooltip()
				.onChange(async (value) => {
					this.plugin.settings.streamingThresholdMB = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Max preview rows')
			.setDesc('Limit rows shown in preview (for performance)')
			.addSlider(slider => slider
				.setLimits(10, 500, 10)
				.setValue(this.plugin.settings.maxRowsForPreview)
				.setDynamicTooltip()
				.onChange(async (value) => {
					this.plugin.settings.maxRowsForPreview = value;
					await this.plugin.saveSettings();
				}));

		// Tier 2 sidecar (v0.1.5)
		new Setting(containerEl).setName('Tier 2 sidecar').setHeading();

		new Setting(containerEl)
			.setName('Enable Tier 2 projection on vault load')
			.setDesc('Auto-project canonical Tier 1 frontmatter into the .crosswalker.sqlite sidecar when the vault opens. Disable if you query Tier 1 directly via Bases and don\'t need fast SQL queries.')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.enableTier2Projection)
				.onChange(async (value) => {
					this.plugin.settings.enableTier2Projection = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Sidecar file path')
			.setDesc('Vault-relative path for the SQLite sidecar. Default: .crosswalker.sqlite at vault root. The file is deletable — the projector rebuilds it from canonical Tier 1 on next vault load.')
			.addText(text => text
				.setPlaceholder('.crosswalker.sqlite')
				.setValue(this.plugin.settings.tier2SidecarPath)
				.onChange(async (value) => {
					this.plugin.settings.tier2SidecarPath = value || '.crosswalker.sqlite';
					await this.plugin.saveSettings();
				}));

		// Recipe schema (advanced — most users won't touch this)
		new Setting(containerEl).setName('Recipe schema').setHeading();

		new Setting(containerEl)
			.setName('Recipe query block schema style')
			// eslint-disable-next-line obsidianmd/ui/sentence-case -- contains JSON Schema technical terms (oneOf, const, if/then/else) that must keep their canonical casing
			.setDesc('Advanced: how the recipe query-block schema discriminates between view shapes (pivot, table, list, hierarchy, timeline). Both styles validate identically; they differ only in IDE autocomplete + error-message phrasing. Most users should leave this on Style A (the default).')
			.addDropdown(dropdown => dropdown
				// eslint-disable-next-line obsidianmd/ui/sentence-case -- letter identifiers (A, B) are proper-noun-equivalent; canonical casing preserved
				.addOption('A', 'Style A (default)')
				// eslint-disable-next-line obsidianmd/ui/sentence-case -- letter identifiers (A, B) are proper-noun-equivalent; canonical casing preserved
				.addOption('B', 'Style B (advanced)')
				.setValue(this.plugin.settings.recipeSchemaStyle)
				.onChange(async (value) => {
					this.plugin.settings.recipeSchemaStyle = value as 'A' | 'B';
					await this.plugin.saveSettings();
				}));

		// Debug Section (Phase 3.5 — wide-event NDJSON logger)
		new Setting(containerEl).setName('Debug').setHeading();

		new Setting(containerEl)
			.setName('Enable debug log')
			.setDesc('Write NDJSON events to crosswalker-debug.log in vault root. Each line is one structured event (timestamp, level, category, op, msg, trace_id, ...freeform context). Read via: cat crosswalker-debug.log | jq')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.enableDebugLog)
				.onChange(async (value) => {
					this.plugin.settings.enableDebugLog = value;
					this.plugin.debug.setEnabled(value);
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Verbose logging')
			.setDesc('Emit trace-level events (in addition to error/warn/info). Adds significant volume; useful when diagnosing a specific issue, otherwise leave off.')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.verboseLogging)
				.onChange(async (value) => {
					this.plugin.settings.verboseLogging = value;
					this.plugin.debug.setVerbose(value);
					await this.plugin.saveSettings();
				}));

		// Category filters — suppress events from specific subsystems
		new Setting(containerEl)
			.setName('Category filters')
			.setDesc('Suppress debug events from specific subsystems. Default: all categories emit. Toggle off any category you want to silence.')
			.setHeading();

		const KNOWN_CATEGORIES: { name: string; desc: string }[] = [
			{ name: 'wizard', desc: 'Import wizard state transitions' },
			{ name: 'csv-parser', desc: 'CSV/TSV parsing + streaming' },
			{ name: 'generation', desc: 'Note generation pipeline' },
			{ name: 'sssom-import', desc: 'SSSOM TSV import' },
			{ name: 'tier2', desc: 'Tier 2 sqlite sidecar lifecycle + queries' },
			{ name: 'config', desc: 'Saved config save/load/match' },
			{ name: 'view', desc: 'Bases view rendering' },
			{ name: 'lifecycle', desc: 'Plugin load/unload' },
			{ name: 'legacy', desc: 'Pre-3.5 call sites (will disappear after Phase 3.5c migration)' },
		];

		for (const cat of KNOWN_CATEGORIES) {
			new Setting(containerEl)
				.setName(`Category: ${cat.name}`)
				.setDesc(cat.desc)
				.addToggle(toggle => toggle
					.setValue(this.plugin.settings.debugLogCategoryFilters[cat.name] !== false)
					.onChange(async (value) => {
						// We store opt-OUT (false = suppressed). Omit the key when re-enabled
						// to keep settings sparse.
						if (value) {
							delete this.plugin.settings.debugLogCategoryFilters[cat.name];
						} else {
							this.plugin.settings.debugLogCategoryFilters[cat.name] = false;
						}
						this.plugin.debug.setCategoryFilters(this.plugin.settings.debugLogCategoryFilters);
						await this.plugin.saveSettings();
					}));
		}

		new Setting(containerEl)
			.setName('Log file actions')
			.setDesc('Open, export, or clear the debug log. These are also available as command-palette commands.')
			.addButton(btn => btn
				.setButtonText('Open')
				.onClick(async () => {
					(this.plugin.app as unknown as { commands: { executeCommandById: (id: string) => void } }).commands.executeCommandById('crosswalker:open-debug-log');
				}))
			.addButton(btn => btn
				.setButtonText('Export to clipboard')
				.onClick(async () => {
					(this.plugin.app as unknown as { commands: { executeCommandById: (id: string) => void } }).commands.executeCommandById('crosswalker:export-debug-log');
				}))
			.addButton(btn => btn
				.setButtonText('Clear')
				.setWarning()
				.onClick(async () => {
					await this.plugin.debug.clear();
				}));

		// Saved Configs Section
		new Setting(containerEl).setName('Saved configurations').setHeading();

		const configCount = this.plugin.settings.savedConfigs.length;

		new Setting(containerEl)
			.setName('Manage configurations')
			.setDesc(configCount === 0
				? 'No saved configurations yet'
				: `${configCount} saved configuration${configCount === 1 ? '' : 's'}`)
			.addButton(btn => btn
				.setButtonText('Open browser')
				.setCta()
				.onClick(() => {
					new ConfigBrowserModal(this.app, this.plugin, 'browse').open();
				}))
			.addButton(btn => btn
				.setButtonText('Import')
				.onClick(() => {
					this.importConfigFromFile();
				}));

		// Quick list preview (just names, for reference)
		if (configCount > 0) {
			const listContainer = containerEl.createEl('div', { cls: 'crosswalker-config-quick-list' });
			listContainer.createEl('p', {
				text: 'Saved configs: ' + this.plugin.settings.savedConfigs.map(c => c.name).join(', '),
				cls: 'setting-item-description'
			});
		}
	}

	/**
	 * Export a config to a downloadable JSON file
	 */
	private exportConfigToFile(config: SavedConfig): void {
		const jsonStr = exportConfigToString(config);
		const blob = new Blob([jsonStr], { type: 'application/json' });
		const url = URL.createObjectURL(blob);

		const a = document.createElement('a');
		a.href = url;
		a.download = `crosswalker-config-${config.name.toLowerCase().replace(/\s+/g, '-')}.json`;
		a.click();

		URL.revokeObjectURL(url);
	}

	/**
	 * Import a config from a JSON file
	 */
	private importConfigFromFile(): void {
		const input = document.createElement('input');
		input.type = 'file';
		input.accept = '.json';

		input.onchange = async (e) => {
			const file = (e.target as HTMLInputElement).files?.[0];
			if (!file) return;

			try {
				const text = await file.text();
				const json = JSON.parse(text);
				const imported = importConfig(json);

				if (imported) {
					this.plugin.settings.savedConfigs.push(imported);
					await this.plugin.saveSettings();
					this.display();
					new Notice(`Imported configuration: ${imported.name}`);
				} else {
					new Notice('Invalid configuration file');
				}
			} catch {
				new Notice('Failed to import configuration');
			}
		};

		input.click();
	}
}
