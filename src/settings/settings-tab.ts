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

		// Debug Section
		new Setting(containerEl).setName('Debug').setHeading();

		new Setting(containerEl)
			.setName('Enable debug log')
			.setDesc('Write debug logs to crosswalker-debug.log in vault root')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.enableDebugLog)
				.onChange(async (value) => {
					this.plugin.settings.enableDebugLog = value;
					this.plugin.debug.setEnabled(value);
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Verbose logging')
			.setDesc('Include extra details in debug logs')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.verboseLogging)
				.onChange(async (value) => {
					this.plugin.settings.verboseLogging = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Clear debug log')
			.setDesc('Clear the contents of the debug log file')
			.addButton(btn => btn
				.setButtonText('Clear')
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
