/**
 * Vault file picker — fuzzy-search modal over importable files in the vault.
 *
 * Why this exists: Obsidian's file explorer hides non-markdown files unless
 * the user has enabled "Detect all file extensions", so a CSV sitting in the
 * vault is invisible and un-right-clickable by default (found in the owner's
 * first entry-points test). The import flow must never depend on that setting:
 * this picker lists importable vault files regardless of explorer visibility.
 */

import { App, FuzzySuggestModal, TFile } from 'obsidian';
import { isImportableExtension } from './entry-points';

export class VaultImportFilePicker extends FuzzySuggestModal<TFile> {
	private onChoose: (file: TFile) => void;

	constructor(app: App, onChoose: (file: TFile) => void) {
		super(app);
		this.onChoose = onChoose;
		// eslint-disable-next-line obsidianmd/ui/sentence-case -- CSV/XLSX/JSON are file-format acronyms
		this.setPlaceholder('Search importable files in this vault (CSV, XLSX, JSON)');
	}

	getItems(): TFile[] {
		return this.app.vault
			.getFiles()
			.filter((f) => isImportableExtension(f.extension))
			.sort((a, b) => a.path.localeCompare(b.path));
	}

	getItemText(file: TFile): string {
		return file.path;
	}

	onChooseItem(file: TFile): void {
		this.onChoose(file);
	}
}
