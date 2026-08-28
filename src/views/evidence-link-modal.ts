/**
 * evidence-link-modal.ts — the "link evidence to a control" command.
 *
 * The Obsidian half of `evidence-link.ts`. Asks for a control and an evidence
 * document by those names, never as "subject" and "object", so the direction
 * that decides whether coverage works cannot be entered backwards.
 */

import { App, Modal, Notice, Setting, TFile, normalizePath } from 'obsidian';
import { readNoteFrontmatter } from '../export/vault-reader';
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
	/**
	 * `_crosswalker.review_cid` — the control's review-normalized content
	 * fingerprint, recorded on an approved link so a later upstream edit to this
	 * control can invalidate the claim. Null when the control carries none.
	 */
	reviewCid: string | null;
}

/** Read `_crosswalker.review_cid` from a frontmatter object, or null. */
export function readReviewCid(fm: unknown): string | null {
	if (!fm || typeof fm !== 'object') return null;
	const provenance = (fm as Record<string, unknown>)._crosswalker;
	if (!provenance || typeof provenance !== 'object') return null;
	const value = (provenance as Record<string, unknown>).review_cid;
	return typeof value === 'string' && value.trim() !== '' ? value.trim() : null;
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
			reviewCid: readReviewCid(fm),
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

		// Only an approval records a baseline, so only an approval needs the
		// control's fingerprint resolved — and resolved honestly.
		let controlReviewCid = this.control.reviewCid;
		if (this.status === 'approved' && controlReviewCid === null) {
			const controlFile = this.app.vault.getAbstractFileByPath(this.control.path);
			if (controlFile instanceof TFile && !this.app.metadataCache.getFileCache(controlFile)) {
				// A null cache entry means EITHER no frontmatter OR not indexed
				// yet. Reading the second as the first would stamp "no baseline"
				// onto a control that has a perfectly good fingerprint — the
				// mistake behind three bugs in one week
				// (`project_cache_lag_is_not_absence`). Look at the file before
				// concluding anything, for this ONE control only.
				const fromDisk = await readNoteFrontmatter(this.app, controlFile);
				if (fromDisk === null) {
					new Notice('Obsidian is still reading this control. Try again in a moment.');
					return;
				}
				controlReviewCid = readReviewCid(fromDisk);
			}
			if (controlReviewCid === null) {
				new Notice(
					'This control has no content fingerprint, so Crosswalker cannot tell you later if it changes. '
					+ 'The link was still created and still counts.',
				);
			}
		}

		const note = buildEvidenceLink({
			controlPath: this.control.path,
			controlCurie: this.control.curie,
			controlReviewCid,
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
