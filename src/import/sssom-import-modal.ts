/* eslint-disable obsidianmd/ui/sentence-case --
 * UI text in this modal frequently references SSSOM (Simple Standard for
 * Sharing Ontological Mappings — proper-noun acronym, MUST stay all-caps),
 * TSV (proper-noun acronym), BioPortal/OxO/OBO Foundry/Biomappings (product
 * names with canonical casing). The sentence-case rule fires on these
 * legitimate proper nouns; rule-disable is correct here. Per CLAUDE.md
 * convention "Use eslint-disable-next-line for intentional exceptions
 * (e.g., code examples)."
 */
/**
 * sssom-import-modal.ts — Phase 2 v0.1.6 (per Ch 35)
 *
 * Modal UX for SSSOM TSV import:
 *   1. File picker (vault file or paste TSV content)
 *   2. Parse + preview (row count + detected ontology pair + warnings)
 *   3. Confirm + execute (calls importSssom)
 *   4. Progress notice during execution
 *   5. Result summary (created/skipped/errors)
 *
 * Per Ch 32 UX direction: keep this picker-style. The modal does NOT
 * surface raw schema editing — for that, users edit the .sssom.tsv file
 * directly, then re-import.
 */

import { App, Modal, Notice, Setting, TFile } from 'obsidian';
import type CrosswalkerPlugin from '../main';
import { detectOntologyPair, parseSssomTsv } from './sssom-parser';
import { importSssom, type SssomImportResult } from './sssom-importer';

/** Source for the SSSOM TSV content. */
type Source =
	| { kind: 'vault-file'; path: string }
	| { kind: 'paste'; content: string }
	| { kind: 'none' };

export class SssomImportModal extends Modal {
	private plugin: CrosswalkerPlugin;
	private source: Source = { kind: 'none' };
	private parsedTsv: string | null = null;
	private detectedSource: string | null = null;
	private detectedTarget: string | null = null;
	private rowCount: number = 0;
	private parseWarnings: string[] = [];
	private parseErrors: string[] = [];

	constructor(app: App, plugin: CrosswalkerPlugin) {
		super(app);
		this.plugin = plugin;
	}

	onOpen() {
		this.contentEl.empty();
		this.contentEl.createEl('h2', { text: 'Import SSSOM mapping file' });

		this.contentEl.createEl('p', {
			text:
				'SSSOM is the open-standard TSV format for sharing ontological mappings. ' +
				'Used by BioPortal, OxO, OBO Foundry, and Biomappings. Crosswalker imports SSSOM ' +
				'mappings as crosswalk-edge junction notes in your vault.',
		});

		// Step 1: Source selection
		new Setting(this.contentEl)
			.setName('Source TSV file')
			.setDesc('Pick a .sssom.tsv file from your vault, or paste TSV content directly.')
			.addButton((btn) =>
				btn.setButtonText('Pick from vault').onClick(() => {
					this.openFilePicker();
				}),
			)
			.addButton((btn) =>
				btn.setButtonText('Paste TSV').onClick(() => {
					this.openPasteEditor();
				}),
			);

		// Step 2: Preview area (rendered after parsing)
		this.contentEl.createDiv({ cls: 'crosswalker-sssom-preview', attr: { id: 'crosswalker-sssom-preview' } });

		// Step 3: Action buttons
		const buttonBar = this.contentEl.createDiv({ cls: 'modal-button-container' });
		new Setting(buttonBar)
			.addButton((btn) =>
				btn
					.setButtonText('Import')
					.setCta()
					.setDisabled(true)
					.onClick(async () => {
						await this.runImport();
					}),
			)
			.addButton((btn) => btn.setButtonText('Cancel').onClick(() => this.close()));
	}

	private async openFilePicker() {
		const tsvFiles = this.app.vault.getFiles().filter((f: TFile) => f.path.endsWith('.sssom.tsv') || f.path.endsWith('.tsv'));
		if (tsvFiles.length === 0) {
			new Notice('No .tsv or .sssom.tsv files found in this vault. Add one or use Paste TSV.');
			return;
		}

		const pickerModal = new Modal(this.app);
		pickerModal.contentEl.createEl('h3', { text: 'Pick SSSOM TSV file' });
		for (const f of tsvFiles) {
			new Setting(pickerModal.contentEl).setName(f.path).addButton((btn) =>
				btn.setButtonText('Select').onClick(async () => {
					const content = await this.app.vault.read(f);
					this.source = { kind: 'vault-file', path: f.path };
					this.parsedTsv = content;
					await this.refreshPreview();
					pickerModal.close();
				}),
			);
		}
		pickerModal.open();
	}

	private openPasteEditor() {
		const pasteModal = new Modal(this.app);
		pasteModal.contentEl.createEl('h3', { text: 'Paste SSSOM TSV content' });
		const textarea = pasteModal.contentEl.createEl('textarea', {
			attr: { rows: '20', cols: '80', placeholder: 'subject_id\\tpredicate_id\\tobject_id\\n...' },
		});
		new Setting(pasteModal.contentEl).addButton((btn) =>
			btn
				.setButtonText('Use this TSV')
				.setCta()
				.onClick(async () => {
					this.source = { kind: 'paste', content: textarea.value };
					this.parsedTsv = textarea.value;
					await this.refreshPreview();
					pasteModal.close();
				}),
		);
		pasteModal.open();
	}

	private async refreshPreview() {
		const previewEl = this.contentEl.querySelector('#crosswalker-sssom-preview') as HTMLElement | null;
		if (!previewEl || !this.parsedTsv) return;

		previewEl.empty();
		const result = parseSssomTsv(this.parsedTsv);
		this.parseWarnings = result.warnings;
		this.parseErrors = result.errors;
		this.rowCount = result.rows.length;

		const pair = detectOntologyPair(result);
		this.detectedSource = pair?.source ?? null;
		this.detectedTarget = pair?.target ?? null;

		if (result.errors.length > 0) {
			previewEl.createEl('p', { text: 'Parse errors:', cls: 'mod-warning' });
			const ul = previewEl.createEl('ul');
			for (const err of result.errors) ul.createEl('li', { text: err });
			this.setImportButtonEnabled(false);
			return;
		}

		previewEl.createEl('h3', { text: 'Preview' });
		const list = previewEl.createEl('dl');
		this.dlEntry(list, 'Mapping rows', String(this.rowCount));
		if (this.detectedSource && this.detectedTarget) {
			this.dlEntry(list, 'Source ontology', this.detectedSource);
			this.dlEntry(list, 'Target ontology', this.detectedTarget);
			this.dlEntry(list, 'Output folder', `_crosswalker/mappings/${this.detectedSource}-to-${this.detectedTarget}/`);
		} else {
			this.dlEntry(list, 'Ontology pair', '(could not detect — add subject_source/object_source to header)');
		}
		if (typeof result.header.mapping_set_id === 'string') {
			this.dlEntry(list, 'Mapping set id', result.header.mapping_set_id);
		}
		if (typeof result.header.mapping_provider === 'string') {
			this.dlEntry(list, 'Mapping provider', result.header.mapping_provider);
		}

		if (result.warnings.length > 0) {
			previewEl.createEl('h4', { text: `${result.warnings.length} warning(s)` });
			const ul = previewEl.createEl('ul');
			for (const w of result.warnings.slice(0, 10)) ul.createEl('li', { text: w });
			if (result.warnings.length > 10) {
				previewEl.createEl('p', { text: `(+ ${result.warnings.length - 10} more — see debug log)` });
			}
		}

		this.setImportButtonEnabled(this.rowCount > 0 && this.detectedSource !== null && this.detectedTarget !== null);
	}

	private setImportButtonEnabled(enabled: boolean) {
		const btn = this.contentEl.querySelector('button.mod-cta') as HTMLButtonElement | null;
		if (btn) btn.disabled = !enabled;
	}

	private dlEntry(parent: HTMLElement, label: string, value: string) {
		parent.createEl('dt', { text: label });
		parent.createEl('dd', { text: value });
	}

	private async runImport() {
		if (!this.parsedTsv) {
			new Notice('No TSV content to import.');
			return;
		}

		const progressNotice = new Notice('SSSOM import: starting…', 0);
		try {
			const result: SssomImportResult = await importSssom(
				this.app,
				this.parsedTsv,
				this.plugin.runProjection,
				this.plugin.precomputeClosure,
				{
					onProgress: (current, total, msg) => {
						progressNotice.setMessage(`SSSOM import: ${msg} (${current}/${total})`);
					},
				},
				this.plugin.debug,
			);

			progressNotice.hide();

			if (result.skipped === 'parse-error') {
				new Notice(`SSSOM import aborted: ${result.parse.errors.join('; ')}`);
				return;
			}
			if (result.skipped === 'no-rows') {
				new Notice('SSSOM file had no valid mapping rows.');
				return;
			}

			const gen = result.generation;
			if (!gen?.success) {
				new Notice(`SSSOM import failed: ${gen?.errors.join('; ') ?? 'unknown error'}`);
				return;
			}

			new Notice(
				`SSSOM import: ${gen.created.length} junction notes created in ${result.folder}` +
					(gen.errors.length > 0 ? ` (with ${gen.errors.length} warning(s))` : ''),
				8000,
			);
			this.close();
		} catch (err) {
			progressNotice.hide();
			const msg = err instanceof Error ? err.message : String(err);
			new Notice(`SSSOM import error: ${msg}`);
			this.plugin.debug?.error('sssom-import', 'unhandled-error', 'SSSOM import: unhandled error', { error: msg });
		}
	}
}
