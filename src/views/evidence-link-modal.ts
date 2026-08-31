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
	legacyEvidenceLinkCurie,
	legacyEvidenceLinkPath,
	type EvidenceCoverage,
	type EvidenceStatus,
} from './evidence-link';
import { readReviewGroupCids, type ReviewGroupCids } from '../generation/hash';
// AM-17. The same door the engine passes through, not a second copy of it.
import { addressRefusal, crossSetAddressMessage } from '../generation/generation-engine';
import { buildIdentityIndex } from '../generation/identity-index';
import { countUnindexedMarkdownFiles } from '../generation/import-set';

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
		});

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
			// So: identity first, address second, create last. Exactly the engine's
			// order, and the same helpers, rather than a second copy of the answer.
			const expectedCurie = evidenceLinkCurie(this.control.curie, this.control.path, evidencePath);
			// AM-22. What links written before the identity scheme changed are stamped
			// with. Recognised so a re-link adopts and restamps the note that already
			// exists instead of doubling it.
			const legacyCurie = legacyEvidenceLinkCurie(this.control.path, evidencePath);

			// Vault-wide, because the questions are "who already holds this identity"
			// and "whose is the note at this address", and a scoped index by
			// construction cannot answer about the notes it excluded.
			const index = await buildIdentityIndex(this.app);

			// Two notes already claiming THIS link's identity is a state the window
			// must not add a third opinion to: `get()` picks the first claimant and
			// would rewrite it, arbitrarily. Named, so the user can find and remove
			// the duplicate rather than discovering it as an `Ambiguous identity`
			// error on some unrelated import weeks later.
			const ambiguous = index.collisions.find((collision) => collision.curie === expectedCurie);
			if (ambiguous) {
				new Notice(
					`Could not create the link: ${ambiguous.paths.length} notes already claim the identity ${ambiguous.curie} `
					+ `(${ambiguous.paths.join(', ')}). Delete or fix all but one of them, then try again.`,
					12000,
				);
				return;
			}
			// A contested LEGACY identity is a different matter and must not block
			// this link: the old identifier was basename-derived and therefore not
			// unique, so several notes legitimately hold it and none of them is
			// necessarily ours. The alias lookup is dropped for this run; the address
			// probes below still check each candidate's recorded pair, which is the
			// only thing that could tell them apart anyway.
			const legacyUsable = !index.collisions.some((collision) => collision.curie === legacyCurie);

			// The note that IS this link, wherever it sits. A rename moved it; the
			// identity did not move with it.
			const existing = await this.findExistingLink(
				index,
				{ expectedCurie, legacyCurie, legacyUsable, evidencePath },
				[note.path, legacyEvidenceLinkPath(this.deps.folder, this.control.path, evidencePath)],
			);

			let writtenPath: string;
			if (existing) {
				await this.app.vault.modify(existing, note.markdown);
				writtenPath = existing.path;
				new Notice(
					existing.path === note.path
						? 'Updated the existing link for this control and evidence.'
						: `Updated the existing link for this control and evidence, at ${existing.path}.`,
				);
			} else {
				// Nothing holds this identity. Now, and only now, is the address the
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
	 * AM-22/AM-23. Which note, if any, IS this link.
	 *
	 * Three lookups, in strictly decreasing strength:
	 *
	 *  1. The CURRENT identity, through the index. Injective by construction
	 *     (AM-22), so a hit is proof and needs no second opinion.
	 *  2. The LEGACY identity, through the index, PLUS a check that the note it
	 *     finds names this exact pair. The legacy curie is the basename-derived
	 *     one, and basenames are not unique: two releases of one framework share
	 *     control file names, so the old identifier can name r4's link when the
	 *     user is linking r5's. Adopting on the alias alone would restage the
	 *     original defect through its own migration path. The note's recorded
	 *     `subject_curie`/`subject` and `object` are what settle it.
	 *  3. A known former ADDRESS, whose occupant's own recorded identity then
	 *     decides. Needed because the index admits only notes carrying a
	 *     `_crosswalker` block, and the oldest links carry none. The address
	 *     proposes; the identity disposes. This is not identity-from-address.
	 *
	 * Failure mode prevented: the identity scheme change doubling every link in an
	 * existing vault - a second note per pair, double-counted by every coverage
	 * tally, with the first silently abandoned - and its opposite, adopting the
	 * WRONG pre-existing link because the old identifier was ambiguous.
	 *
	 * A note that cannot be read is neither adopted nor claimed about; it falls
	 * through to the address branch, which names that state exactly (AM-19).
	 */
	private async findExistingLink(
		index: { get(curie: string): TFile | null },
		pair: { expectedCurie: string; legacyCurie: string; legacyUsable: boolean; evidencePath: string },
		addresses: readonly string[],
	): Promise<TFile | null> {
		const current = index.get(pair.expectedCurie);
		if (current) return current;

		const legacyHolder = pair.legacyUsable ? index.get(pair.legacyCurie) : null;
		if (legacyHolder && await this.namesThisPair(legacyHolder, pair.evidencePath)) return legacyHolder;

		const seen = new Set<string>();
		for (const path of addresses) {
			if (seen.has(path)) continue;
			seen.add(path);
			const candidate = this.app.vault.getAbstractFileByPath(path);
			if (!(candidate instanceof TFile)) continue;
			const read = await readNoteFrontmatterState(this.app, candidate);
			if (read.state !== 'ok') continue;
			const curie = typeof read.frontmatter.curie === 'string' ? read.frontmatter.curie.trim() : '';
			if (curie === pair.expectedCurie) return candidate;
			if (curie === pair.legacyCurie && this.frontmatterNamesThisPair(read.frontmatter, pair.evidencePath)) {
				return candidate;
			}
		}
		return null;
	}

	/** Does this note record the control and evidence the user is linking now? */
	private async namesThisPair(file: TFile, evidencePath: string): Promise<boolean> {
		const read = await readNoteFrontmatterState(this.app, file);
		return read.state === 'ok' && this.frontmatterNamesThisPair(read.frontmatter, evidencePath);
	}

	/**
	 * The pair a junction note says it is about, read off the note.
	 *
	 * `subject_curie` is preferred because it is the control's own identity;
	 * the `subject` wikilink is the fallback for a link written when the control
	 * carried no curie, where a path was all there was to record.
	 */
	private frontmatterNamesThisPair(fm: Record<string, unknown>, evidencePath: string): boolean {
		const control = this.control;
		if (!control) return false;
		const subjectCurie = typeof fm.subject_curie === 'string' ? fm.subject_curie.trim() : '';
		const subject = typeof fm.subject === 'string' ? fm.subject : '';
		const object = typeof fm.object === 'string' ? fm.object : '';
		const subjectMatches = control.curie && subjectCurie
			? subjectCurie === control.curie
			: subject.includes(`[[${control.path}`);
		return subjectMatches && object.includes(`[[${evidencePath}`);
	}

	onClose(): void {
		this.contentEl.empty();
	}
}
