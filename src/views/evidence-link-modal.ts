/**
 * evidence-link-modal.ts — the "link evidence to a control" command.
 *
 * The Obsidian half of `evidence-link.ts`. Asks for a control and an evidence
 * document by those names, never as "subject" and "object", so the direction
 * that decides whether coverage works cannot be entered backwards.
 */

import { App, Modal, Notice, Setting, TFile, normalizePath } from 'obsidian';
import { readNoteFrontmatter, readNoteFrontmatterState } from '../export/vault-reader';
import {
	buildEvidenceLink,
	evidenceLinkCurie,
	type EvidenceCoverage,
	type EvidenceStatus,
} from './evidence-link';
import { CANONICAL_EVIDENCE_PREDICATE } from '../tier2/evidence-coverage';
import { readReviewGroupCids, type ReviewGroupCids } from '../generation/hash';
// AM-17. The same door the engine passes through, not a second copy of it.
import { addressRefusal, crossSetAddressMessage } from '../generation/generation-engine';
import { buildIdentityIndex } from '../generation/identity-index';
import { countUnindexedMarkdownFiles, requireVaultIndexed } from '../generation/import-set';

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
	reviewGroups?: ReviewGroupCids | null;
}

/** Read `_crosswalker.review_cid` from a frontmatter object, or null. */
export function readReviewCid(fm: unknown): string | null {
	if (!fm || typeof fm !== 'object') return null;
	const provenance = (fm as Record<string, unknown>)._crosswalker;
	if (!provenance || typeof provenance !== 'object') return null;
	const value = (provenance as Record<string, unknown>).review_cid;
	return typeof value === 'string' && value.trim() !== '' ? value.trim() : null;
}

/** Read a complete `_crosswalker.review_groups` block, or null. */
export function readReviewGroups(fm: unknown): ReviewGroupCids | null {
	if (!fm || typeof fm !== 'object') return null;
	const provenance = (fm as Record<string, unknown>)._crosswalker;
	if (!provenance || typeof provenance !== 'object') return null;
	return readReviewGroupCids((provenance as Record<string, unknown>).review_groups);
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
			reviewGroups: readReviewGroups(fm),
		});
	}
	return out.sort((a, b) => a.path.localeCompare(b.path));
}

/**
 * Markdown files Obsidian has not finished parsing yet.
 *
 * AM-24 (2026-08-31): the implementation moved next to the rules that must not
 * run without it (`src/generation/import-set.ts`) and is re-exported here for
 * the callers that already reach for it through this module. One measurement of
 * "is the vault readable yet", not one per window.
 */
export { countUnindexedMarkdownFiles };

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
		let controlReviewGroups = this.control.reviewGroups ?? null;
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
				controlReviewGroups = readReviewGroups(fromDisk);
			}
			if (controlReviewCid === null) {
				new Notice(
					'This control has no content fingerprint, so Crosswalker cannot tell you later if it changes. '
					+ 'The link was still created and still counts.',
				);
			}
		}

		try {
			// AM-17 (2026-08-31). THE DOOR. The write used to be `vault.modify` on
			// whatever `getAbstractFileByPath` found: `resolveWriteTarget`'s pre-AM-14
			// body verbatim, on a window instead of the engine. The junction folder is
			// a user SETTING, so pointing it at a folder that already holds notes, or
			// having any note whose basename matched the junction shape, meant a
			// person's note was replaced in full while the notice said the link had
			// been "updated".
			//
			// AM-23 (2026-08-31). And the lookup comes BEFORE THE CREATE, not only
			// before the update. The old order asked the address first, so renaming or
			// dragging a junction note in Obsidian - a thing Obsidian invites - left
			// nothing at the address and the next link for that pair created a SECOND
			// note holding the same curie. Two notes with one identity is a permanent
			// `Ambiguous identity` collision that fails every later import in the
			// vault, and a link double-counted by every coverage tally.
			//
			// AM-30 (2026-08-31). And the question is asked of the NOTES, not of a
			// recomputed key. The lookup used to be the curie this window would mint
			// today, and that curie is a function of the evidence file's vault path:
			// move the evidence document, re-link the same real pair, and the "same"
			// identity came out different, so nothing found the junction that plainly
			// existed and a SECOND one was written for the pair - double-counted by
			// every coverage tally. A path may seed a mint; it may never be needed
			// again after it.
			//
			// So: which note names this pair, wherever it sits and whatever era it was
			// written in; then the address; then, and only then, a mint.
			//
			// The whole-vault read below is only meaningful against a vault Obsidian
			// has finished reading. A half-read vault answers "no junction names this
			// pair" about junctions it never saw, which is exactly how a duplicate
			// gets written (`project_cache_lag_is_not_absence`).
			await requireVaultIndexed(this.app);

			// Vault-wide, because the questions are "who already holds this identity"
			// and "whose is the note at this address", and a scoped index by
			// construction cannot answer about the notes it excluded.
			const index = await buildIdentityIndex(this.app);

			// The note that IS this link, wherever it sits. A rename moved it; the
			// pair it records did not move with it.
			const named = await this.junctionsNamingThisPair(evidencePath);
			if (named.length > 1) {
				new Notice(
					`Could not create the link: ${named.length} notes already record this control and this evidence `
					+ `(${named.map((entry) => entry.file.path).join(', ')}). Delete or fix all but one of them, then try again.`,
					12000,
				);
				return;
			}
			const existing = named[0] ?? null;

			// The identity: the one the existing note already carries, READ OFF IT, or
			// a fresh mint when nothing records this pair yet. A recorded curie is
			// never recomputed - that recomputation IS the defect above. A junction
			// that records the pair but carries no curie at all is given one now, so
			// projection can finally see it.
			const recorded = existing?.curie ?? null;
			const curie = recorded ?? evidenceLinkCurie(this.control.curie, this.control.path, evidencePath);

			// Nobody but this link may hold this link's identity. Two notes with one
			// curie is a permanent `Ambiguous identity` collision that fails every
			// later import in the vault, so it is named here - where the user can act
			// on it - rather than met weeks later on an unrelated import. Covers both
			// a mint landing on an occupied identity and an existing junction whose
			// identity some other note has also taken.
			const claimants = index.collisions.find((collision) => collision.curie === curie)?.paths
				?? (index.get(curie) ? [index.get(curie)!.path] : []);
			const contested = claimants.filter((path) => path !== existing?.file.path);
			if (contested.length > 0) {
				new Notice(
					`Could not create the link: ${contested.length} note${contested.length === 1 ? '' : 's'} already claim the `
					+ `identity ${curie} (${contested.join(', ')}). `
					+ `Delete or fix ${contested.length === 1 ? 'it' : 'all but one of them'}, then try again.`,
					12000,
				);
				return;
			}

			const note = buildEvidenceLink({
				controlPath: this.control.path,
				controlCurie: this.control.curie,
				controlReviewCid,
				controlReviewGroups,
				evidencePath,
				coverage: this.coverage,
				status: this.status,
				scope: this.evidenceScope.trim() || undefined,
				folder: this.deps.folder,
				curie,
			});

			let writtenPath: string;
			if (existing) {
				// Updated WHERE IT SITS, under the identity it already carries. Its
				// address is not corrected to the one a mint would choose today: the
				// note is the record, and moving it would only re-couple the identity
				// to a path again.
				await this.app.vault.modify(existing.file, note.markdown);
				writtenPath = existing.file.path;
				new Notice(
					existing.file.path === note.path
						? 'Updated the existing link for this control and evidence.'
						: `Updated the existing link for this control and evidence, at ${existing.file.path}.`,
				);
			} else {
				// Nothing records this pair. Now, and only now, is the address the
				// question: whatever sits there is not this link, so it is refused by
				// name rather than overwritten.
				const occupant = this.app.vault.getAbstractFileByPath(note.path);
				if (occupant instanceof TFile) {
					const refusal = addressRefusal(index, occupant.path, null);
					new Notice(
						refusal
							? `Could not create the link. ${crossSetAddressMessage(refusal)}`
							: `Could not create the link: a different note already sits at ${occupant.path}. `
								+ 'Move or rename that note, or change the evidence link folder in settings.',
						12000,
					);
					return;
				}
				const folder = note.path.slice(0, note.path.lastIndexOf('/'));
				if (folder && !this.app.vault.getAbstractFileByPath(folder)) {
					await this.app.vault.createFolder(folder);
				}
				await this.app.vault.create(note.path, note.markdown);
				writtenPath = note.path;
				new Notice('Evidence link created.');
			}
			const file = this.app.vault.getAbstractFileByPath(writtenPath);
			if (file instanceof TFile) await this.app.workspace.getLeaf(true).openFile(file);
			this.close();
		} catch (err) {
			new Notice(`Could not create the link: ${err instanceof Error ? err.message : String(err)}`);
		}
	}

	/**
	 * AM-30 (2026-08-31). Which notes, if any, RECORD this control and this
	 * evidence — the one lookup, for every era of link this product has written.
	 *
	 * The lookup used to be a chain of identifiers: the curie this window would
	 * mint today, then the pre-AM-22 basename form, then two known addresses. Every
	 * one of those is a value RECOMPUTED from the current inputs, and two of the
	 * inputs are vault paths, so moving either file changed the answer and the
	 * junction that plainly existed was found by nothing. A path may seed a mint;
	 * it may never be needed again after it.
	 *
	 * So the question is put to the notes: a junction note SAYS which subject and
	 * which object it is about, and that statement is a recorded fact that survives
	 * every rename. Both halves are matched by identity where an identity exists:
	 * the control by its `subject_curie`, the evidence (a user's own document,
	 * which has no curie) by resolving the recorded wikilink the way Obsidian does,
	 * so a moved file still resolves to the same note.
	 *
	 * It reads every era for free: the filter is `kind: junction-note`, which every
	 * version of `buildEvidenceLink` has written, including the oldest links that
	 * carry no `_crosswalker` block at all and are therefore invisible to the
	 * identity index.
	 *
	 * Failure mode prevented: a second junction note for a pair that already has
	 * one - double-counted by every coverage tally, with the first silently
	 * abandoned - and its opposite, adopting the WRONG pre-existing link because
	 * the identifier that found it was not unique.
	 *
	 * A note that cannot be read is neither adopted nor claimed about (AM-19): it
	 * is left out of the answer, and if it sits at the address the create branch
	 * wants, that branch names its state exactly.
	 */
	private async junctionsNamingThisPair(
		evidencePath: string,
	): Promise<{ file: TFile; curie: string | null }[]> {
		const control = this.control;
		if (!control) return [];
		const out: { file: TFile; curie: string | null }[] = [];
		for (const file of this.app.vault.getMarkdownFiles()) {
			let fm = this.app.metadataCache.getFileCache(file)?.frontmatter as Record<string, unknown> | undefined;
			if (!fm) {
				// Belt and braces behind `requireVaultIndexed`: a file the cache has
				// not reached is read rather than assumed empty. Absence of a cache
				// entry has never meant absence of properties.
				const read = await readNoteFrontmatterState(this.app, file);
				if (read.state !== 'ok') continue;
				fm = read.frontmatter;
			}
			if (fm.kind !== 'junction-note') continue;
			if (!this.frontmatterNamesThisPair(fm, evidencePath)) continue;
			const curie = typeof fm.curie === 'string' && fm.curie.trim() !== '' ? fm.curie.trim() : null;
			out.push({ file, curie });
		}
		return out;
	}

	/**
	 * The pair a junction note says it is about, read off the note.
	 *
	 * `subject_curie` is preferred because it is the control's own identity;
	 * the `subject` wikilink is the fallback for a link written when the control
	 * carried no curie, where a path was all there was to record.
	 *
	 * The predicate is checked because this window writes exactly one, and
	 * updating a note that asserts some other relationship would silently rewrite
	 * what it asserts. A note that states no predicate at all predates the field
	 * and can only be one of ours.
	 */
	private frontmatterNamesThisPair(fm: Record<string, unknown>, evidencePath: string): boolean {
		const control = this.control;
		if (!control) return false;
		const predicate = typeof fm.predicate === 'string' ? fm.predicate.trim() : '';
		if (predicate !== '' && predicate !== CANONICAL_EVIDENCE_PREDICATE) return false;
		const subjectCurie = typeof fm.subject_curie === 'string' ? fm.subject_curie.trim() : '';
		const subject = typeof fm.subject === 'string' ? fm.subject : '';
		const object = typeof fm.object === 'string' ? fm.object : '';
		const subjectMatches = control.curie && subjectCurie
			? subjectCurie === control.curie
			: this.linkNames(subject, control.path);
		return subjectMatches && this.linkNames(object, evidencePath);
	}

	/**
	 * Does this recorded wikilink name the note now at `targetPath`?
	 *
	 * Exact text first (Obsidian rewrites links on rename, so a moved file is
	 * usually already recorded at its new path), then Obsidian's own link
	 * resolution, which follows a move even when the link text was not rewritten.
	 * Resolution is what makes this survive the case AM-30 exists for; the exact
	 * comparison is what makes it work on hosts that expose no resolver.
	 */
	private linkNames(value: string, targetPath: string): boolean {
		const match = /\[\[([^\]|#^]+)/.exec(value);
		if (!match) return false;
		const linkPath = match[1].trim();
		if (linkPath === targetPath || `${linkPath}.md` === targetPath) return true;
		const resolve = this.app.metadataCache.getFirstLinkpathDest?.bind(this.app.metadataCache);
		const dest = resolve ? resolve(linkPath, '') : null;
		return dest !== null && dest !== undefined && dest.path === targetPath;
	}

	onClose(): void {
		this.contentEl.empty();
	}
}
