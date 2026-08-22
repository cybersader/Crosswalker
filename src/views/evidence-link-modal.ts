/**
 * evidence-link-modal.ts — the "link evidence to a control" command.
 *
 * The Obsidian half of `evidence-link.ts`. Asks for a control and an evidence
 * document by those names, never as "subject" and "object", so the direction
 * that decides whether coverage works cannot be entered backwards.
 */

import { App, Modal, Notice, Setting, TFile, normalizePath } from 'obsidian';
import {
	buildEvidenceLink,
	type EvidenceCoverage,
	type EvidenceStatus,
} from './evidence-link';

/** A control note the user can link evidence to. */
export interface ControlCandidate {
	path: string;
	title: string;
	curie: string | null;
}

/**
 * Concept notes in the vault, newest-imported first by path order.
 *
 * A note qualifies when it carries a `curie` and is not itself a junction or a
 * crosswalk edge. Linking evidence to an evidence link is not meaningful, and
 * offering it invites exactly the inverted-direction mistake this command
 * exists to prevent.
 */
export function listControlCandidates(app: App): ControlCandidate[] {
	const out: ControlCandidate[] = [];
	for (const file of app.vault.getMarkdownFiles()) {
		const fm = app.metadataCache.getFileCache(file)?.frontmatter;
		if (!fm || typeof fm.curie !== 'string' || fm.curie === '') continue;
		if (fm.kind === 'junction-note' || fm.kind === 'crosswalk-edge') continue;
		out.push({
			path: file.path,
			title: typeof fm.title === 'string' && fm.title ? fm.title : file.basename,
			curie: fm.curie,
		});
	}
	return out.sort((a, b) => a.path.localeCompare(b.path));
}

/**
 * Markdown files Obsidian has not finished parsing yet.
 *
 * `getFileCache` returns null both for a file with no frontmatter and for one
 * the metadata cache has not reached. On a large vault, opening this modal
 * during startup indexing therefore yields zero candidates, which is
 * indistinguishable from "you have not imported anything" unless we look. Found
 * by screenshotting the modal against a real vault mid-index, where it claimed
 * an imported vault had no controls.
 */
export function countUnindexedMarkdownFiles(app: App): number {
	let unindexed = 0;
	for (const file of app.vault.getMarkdownFiles()) {
		if (!app.metadataCache.getFileCache(file)) unindexed += 1;
	}
	return unindexed;
}

export interface EvidenceLinkModalDeps {
	app: App;
	folder: string;
	/** Pre-selected control, when the command runs from an open control note. */
	initialControl?: ControlCandidate;
}

export class EvidenceLinkModal extends Modal {
	private controls: ControlCandidate[];
	private control: ControlCandidate | null;
	private evidencePath = '';
	private coverage: EvidenceCoverage = 'full';
	private status: EvidenceStatus = 'proposed';
	/** Renamed from `scope`: Modal already owns that property. */
	private evidenceScope = '';

	constructor(private readonly deps: EvidenceLinkModalDeps) {
		super(deps.app);
		this.controls = listControlCandidates(deps.app);
		this.control = deps.initialControl ?? null;
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.empty();

		new Setting(contentEl).setName('Link evidence to a control').setHeading();

		if (this.controls.length === 0) {
			const unindexed = countUnindexedMarkdownFiles(this.deps.app);
			contentEl.createEl('p', {
				text: unindexed > 0
					? `Obsidian is still indexing this vault (${unindexed} notes left to read). Wait for indexing to finish, then run this command again.`
					: 'No imported controls were found in this vault. Import a framework first, then link evidence to it.',
			});
			return;
		}

		contentEl.createEl('p', {
			text: 'Records that a document provides evidence for a control. The link is a note, so you can review and update it later.',
		});

		new Setting(contentEl)
			.setName('Control')
			.setDesc('The control that needs evidence.')
			.addDropdown((drop) => {
				for (const candidate of this.controls) {
					drop.addOption(candidate.path, `${candidate.title} (${candidate.curie})`);
				}
				const selected = this.control?.path ?? this.controls[0].path;
				drop.setValue(selected);
				this.control = this.controls.find((c) => c.path === selected) ?? this.controls[0];
				drop.onChange((value) => {
					this.control = this.controls.find((c) => c.path === value) ?? null;
				});
			});

		new Setting(contentEl)
			.setName('Evidence')
			.setDesc('Path to the document, screenshot note, or runbook that evidences the control.')
			.addText((text) => {
				text.setPlaceholder('Evidence/MFA policy.md');
				text.onChange((value) => { this.evidencePath = value; });
			});

		new Setting(contentEl)
			.setName('Coverage')
			.setDesc('How much of the control this evidence covers.')
			.addDropdown((drop) => {
				drop.addOption('full', 'Full');
				drop.addOption('partial', 'Partial');
				drop.addOption('none', 'None, this evidence does not cover it');
				drop.setValue(this.coverage);
				drop.onChange((value) => { this.coverage = value as EvidenceCoverage; });
			});

		new Setting(contentEl)
			.setName('Status')
			.setDesc('Only approved links count toward coverage.')
			.addDropdown((drop) => {
				drop.addOption('proposed', 'Proposed');
				drop.addOption('in_review', 'In review');
				drop.addOption('approved', 'Approved');
				drop.setValue(this.status);
				drop.onChange((value) => { this.status = value as EvidenceStatus; });
			});

		new Setting(contentEl)
			.setName('Scope')
			.setDesc('Optional. Which part of the control this covers.')
			.addText((text) => {
				text.onChange((value) => { this.evidenceScope = value; });
			});

		new Setting(contentEl).addButton((button) => {
			button
				.setButtonText('Create link')
				.setCta()
				.onClick(() => { void this.create(); });
		});
	}

	private async create(): Promise<void> {
		if (!this.control) {
			new Notice('Choose a control first.');
			return;
		}
		const evidencePath = normalizePath(this.evidencePath.trim());
		if (!evidencePath) {
			new Notice('Enter the path to the evidence document.');
			return;
		}
		// Warn but do not block: evidence may legitimately be added before the
		// document lands in the vault, and refusing would push the user back to
		// hand-writing the note, which is what this command exists to replace.
		if (!this.app.vault.getAbstractFileByPath(evidencePath)) {
			new Notice(`No note found at ${evidencePath}. Creating the link anyway.`);
		}

		const note = buildEvidenceLink({
			controlPath: this.control.path,
			controlCurie: this.control.curie,
			evidencePath,
			coverage: this.coverage,
			status: this.status,
			scope: this.evidenceScope.trim() || undefined,
			folder: this.deps.folder,
		});

		try {
			const folder = note.path.slice(0, note.path.lastIndexOf('/'));
			if (folder && !this.app.vault.getAbstractFileByPath(folder)) {
				await this.app.vault.createFolder(folder);
			}
			const existing = this.app.vault.getAbstractFileByPath(note.path);
			if (existing instanceof TFile) {
				await this.app.vault.modify(existing, note.markdown);
				new Notice('Updated the existing link for this control and evidence.');
			} else {
				await this.app.vault.create(note.path, note.markdown);
				new Notice('Evidence link created.');
			}
			const file = this.app.vault.getAbstractFileByPath(note.path);
			if (file instanceof TFile) await this.app.workspace.getLeaf(true).openFile(file);
			this.close();
		} catch (err) {
			new Notice(`Could not create the link: ${err instanceof Error ? err.message : String(err)}`);
		}
	}

	onClose(): void {
		this.contentEl.empty();
	}
}
