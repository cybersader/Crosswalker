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
import { countUnindexedMarkdownFiles } from '../generation/import-set';
// AM-39. The same merge machinery a re-import uses, not a second copy of it.
import { readExistingNote, ExistingNoteReadError, type ExistingNote, splitNoteText } from '../generation/existing-note';
import { scanRegions, findSpan, replaceRegion, wrapRegion } from '../generation/managed-body';

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

const EVIDENCE_COVERAGES = ['full', 'partial', 'none'] as const;
const EVIDENCE_STATUSES = ['proposed', 'in_review', 'approved'] as const;

/** A frontmatter value that is one of a closed set of strings, or null. */
function readEnum<T extends string>(value: unknown, allowed: readonly string[]): T | null {
	return typeof value === 'string' && allowed.includes(value) ? (value as T) : null;
}

/** `[[Path|Label]]` -> `Path`, or null when the value is not a wikilink. */
function wikilinkTarget(value: unknown): string | null {
	if (typeof value !== 'string') return null;
	const match = /\[\[([^\]|#^]+)/.exec(value);
	return match ? match[1].trim() : null;
}

/**
 * AM-39. The frontmatter keys THIS WINDOW writes, and therefore owns.
 *
 * Everything else a junction note carries belongs to whoever put it there: the
 * reviewer's `reviewer`, `review_date`, `confidence`, `expires_at` and `notes`,
 * a recipe's extra columns, another plugin's keys. The window has no control for
 * any of them and no opinion about them, so an update carries them across
 * untouched rather than dropping them because it did not happen to re-emit them.
 * `tags` is deliberately NOT here: a user's hand-added tag survives, matching the
 * list-union rule `mergeFrontmatter` applies on re-import.
 */
const WINDOW_MANAGED_KEYS: ReadonlySet<string> = new Set([
	'curie', 'kind', 'title', 'subject', 'subject_curie', 'predicate', 'object',
	'coverage', 'status', 'scope', 'reviewed_against', '_crosswalker',
]);

/** One top-level frontmatter key and the raw lines that belong to it. */
interface FrontmatterBlock { key: string; lines: string[] }

/**
 * Split a properties block into its top-level keys, keeping every line as it is
 * written.
 *
 * Deliberately textual. A user's key is carried across an update by copying its
 * BYTES, so a quoted string keeps its quotes, a date keeps its shape, a comment
 * keeps its place, and a value this product does not understand is not
 * re-serialised into something it would rather have. A key's block runs until
 * the next line that starts a top-level key; indented lines and block-sequence
 * dashes belong to the key above them.
 */
function frontmatterBlocks(text: string): FrontmatterBlock[] {
	const out: FrontmatterBlock[] = [];
	let current: FrontmatterBlock | null = null;
	for (const line of text.split('\n')) {
		const startsTopLevel = line !== ''
			&& !/^[\s-]/.test(line)
			&& !line.trimStart().startsWith('#')
			&& line.includes(':');
		if (startsTopLevel) {
			current = { key: line.slice(0, line.indexOf(':')).trim().replace(/^["']|["']$/g, ''), lines: [line] };
			out.push(current);
		} else if (current) {
			current.lines.push(line);
		} else {
			// Anything before the first key (a leading comment, a blank line) is
			// nobody's value and is kept under a key no writer can own.
			current = { key: '', lines: [line] };
			out.push(current);
		}
	}
	return out;
}

/**
 * The merged properties block: this window's keys as it just wrote them, plus
 * every key the note already carried that the window does not own, verbatim.
 */
function mergeFrontmatterText(freshText: string, existingText: string, managed: ReadonlySet<string>): string {
	const carried = frontmatterBlocks(existingText).filter((block) => !managed.has(block.key));
	const carriedKeys = new Set(carried.map((block) => block.key));
	const out: string[] = [];
	for (const block of frontmatterBlocks(freshText)) {
		// The note's own value wins for a key the window does not own, so a second
		// click never re-asserts a default over a person's answer.
		if (carriedKeys.has(block.key)) continue;
		out.push(...block.lines);
	}
	for (const block of carried) out.push(...block.lines);
	return out.join('\n');
}

/**
 * AM-39. What an existing evidence link becomes when this window updates it.
 *
 * The frontmatter merges (managed keys only). The body is the note's, not the
 * window's, unless the window can show that it owns it: a managed `body` region
 * is rebuilt inside its markers with everything around it untouched, and a body
 * byte-identical to what the window itself last wrote for this note is
 * refreshed. Anything else is a person's writing and is left exactly as it is,
 * even at the cost of a stale sentence in it. Losing a paragraph someone wrote
 * is not recoverable; a stale sentence is.
 */
function mergeIntoExistingLink(
	current: ExistingNote,
	freshMarkdown: string,
	previousBody: string | null,
): { ok: true; markdown: string } | { ok: false; detail: string } {
	const scan = scanRegions(current.body);
	if (!scan.ok) return { ok: false, detail: scan.detail };
	const fresh = splitNoteText(freshMarkdown);
	let body: string;
	if (findSpan(scan.spans, 'body')) {
		body = replaceRegion(current.body, scan.spans, 'body', wrapRegion('body', fresh.body));
	} else if (previousBody !== null && current.body === previousBody) {
		body = fresh.body;
	} else {
		body = current.body;
	}
	const frontmatter = mergeFrontmatterText(fresh.frontmatterText, current.frontmatterText, WINDOW_MANAGED_KEYS);
	return {
		ok: true,
		markdown: body.trim() ? `---\n${frontmatter}\n---\n\n${body}` : `---\n${frontmatter}\n---\n`,
	};
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
	/**
	 * AM-39. Which of the three review fields the person actually set in this
	 * window. A field they never touched must not overwrite what the existing
	 * link already records: pressing "Create link" a second time on an approved,
	 * partially-scoped link used to silently reset it to the form's defaults
	 * (proposed, full, no scope), because the window rebuilt the note from its own
	 * controls and had never read the note's. An untouched control is a question
	 * nobody answered, not an answer of "default".
	 */
	private touched: { coverage: boolean; status: boolean; scope: boolean } = {
		coverage: false, status: false, scope: false,
	};

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
				drop.onChange((value) => { this.coverage = value as EvidenceCoverage; this.touched.coverage = true; });
			});

		new Setting(contentEl)
			.setName('Status')
			.setDesc('Only approved links count toward coverage.')
			.addDropdown((drop) => {
				drop.addOption('proposed', 'Proposed');
				drop.addOption('in_review', 'In review');
				drop.addOption('approved', 'Approved');
				drop.setValue(this.status);
				drop.onChange((value) => { this.status = value as EvidenceStatus; this.touched.status = true; });
			});

		new Setting(contentEl)
			.setName('Scope')
			.setDesc('Optional. Which part of the control this covers.')
			.addText((text) => {
				text.onChange((value) => { this.evidenceScope = value; this.touched.scope = true; });
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
			// AM-40 (2026-09-01). There used to be a `requireVaultIndexed` gate here,
			// and it is deliberately gone. Both readers below already raw-read any
			// file the metadata cache missed - `junctionsNamingThisPair` through
			// `readNoteFrontmatterState`, `buildIdentityIndex` through its own disk
			// fallback - so the gate refused what the code beneath it could already
			// see, while genuinely blocking the ordinary case it was aimed at:
			// Obsidian still indexing at startup, where nothing is wrong and the
			// user is simply told to come back later. A fail-closed precondition
			// belongs where the read is BLIND, not where it can see. (It stays in
			// `newSetSchemeFor`, whose whole-vault discovery is cache-only by design.)
			//
			// Vault-wide, because the questions are "who already holds this identity"
			// and "whose is the note at this address", and a scoped index by
			// construction cannot answer about the notes it excluded.
			const index = await buildIdentityIndex(this.app);

			// The note that IS this link, wherever it sits. A rename moved it; the
			// pair it records did not move with it.
			//
			// AM-35: a note whose properties could not be read stops this outright.
			// The one note nothing could be read off may be the junction being looked
			// for, and treating it as "not this pair" is how a duplicate gets minted.
			const scan = await this.junctionsNamingThisPair(evidencePath);
			if (!scan.ok) {
				new Notice(
					`Could not create the link: the properties of ${scan.unreadablePath} could not be read, so Crosswalker `
					+ 'cannot tell whether it is already the link for this control and this evidence. '
					+ 'Fix that note\'s properties, then try again.',
					12000,
				);
				return;
			}
			const named = scan.junctions;
			if (named.length > 1) {
				new Notice(
					`Could not create the link: ${named.length} notes already record this control and this evidence `
					+ `(${named.map((entry) => entry.file.path).join(', ')}). Delete or fix all but one of them, then try again.`,
					12000,
				);
				return;
			}
			const existing = named[0] ?? null;

			// AM-39. The note this window is about to change, read ONCE and read
			// fail-closed, through the same reader generation uses. Everything below
			// that needs to know what the link already says asks this, so the window
			// cannot form two opinions about the note it is updating.
			let current: ExistingNote | null = null;
			if (existing) {
				try {
					current = await readExistingNote(this.app, existing.file);
				} catch (readErr) {
					const detail = readErr instanceof ExistingNoteReadError ? readErr.detail : String(readErr);
					new Notice(
						`Could not update the link: ${existing.file.path} could not be read (${detail}). `
						+ 'Fix that note, then try again.',
						12000,
					);
					return;
				}
			}

			// AM-39. The three review controls prefill from the note. A control the
			// person did not answer keeps what the link already records; only a
			// control they actually set overwrites it. Without this, a second click
			// on an approved link silently reset it to the form's defaults and told
			// the user it had been "updated".
			const recordedFm = current?.frontmatter ?? {};
			const coverage = this.answered('coverage')
				? this.coverage
				: (readEnum<EvidenceCoverage>(recordedFm.coverage, EVIDENCE_COVERAGES) ?? this.coverage);
			const status = this.answered('status')
				? this.status
				: (readEnum<EvidenceStatus>(recordedFm.status, EVIDENCE_STATUSES) ?? this.status);
			const scope = this.answered('scope')
				? this.evidenceScope.trim()
				: (typeof recordedFm.scope === 'string' ? recordedFm.scope : this.evidenceScope.trim());

			// Only an approval records a baseline, so only an approval needs the
			// control's fingerprint resolved — and resolved honestly.
			let controlReviewCid = this.control.reviewCid;
			let controlReviewGroups = this.control.reviewGroups ?? null;
			if (status === 'approved' && controlReviewCid === null) {
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
			// on it - rather than met weeks later on an unrelated import.
			//
			// AM-36 (2026-09-01). THE PAIR WINS: this check applies to a MINT only.
			// When the pair scan named exactly one junction, that note IS this link,
			// positively identified by a fact it records; updating it under the
			// identity it already carries adds no claimant, so a pre-existing contest
			// over that identity is neither caused nor worsened here. And a contest
			// over a LEGACY identifier is expected rather than exceptional - the
			// pre-AM-22 basename form was never unique, so two releases of one
			// framework share it by construction.
			//
			// Failure mode prevented: refusing a reviewer's link over an ambiguity
			// they did not create, and instructing them to delete a perfectly
			// legitimate link belonging to the other release. A mint is the real
			// error case: that identity is being introduced now, and introducing it
			// onto an existing claim is a collision this window would itself create.
			//
			// DEFERRED, 2026-09-01 (adversarial CONFIRMED 6), and left here in the
			// open rather than silently: AM-36's text scopes the refusal by the
			// identity's ERA ("the current injective identity only") while this
			// scopes it by whether one is being INTRODUCED. They differ in exactly
			// one case - updating a note whose recorded curie is already the current
			// mint form while a second note also claims it. The era reading would be
			// `if (!recorded || curieIsCurrentForm(curie))`. It is not made here
			// because a declaration pins the shipped reading with both arguments
			// written out (`tests/evidence-window-unreadable-and-pair.test.ts`, "the
			// contested identifier is the CURRENT scheme"), and because the update
			// restamps nothing and adds no claimant, so the contest is exactly as bad
			// after as before. The ruling is the architect's; the site is this line.
			if (!recorded) {
				const claimants = index.collisions.find((collision) => collision.curie === curie)?.paths
					?? (index.get(curie) ? [index.get(curie)!.path] : []);
				const contested = claimants.filter((path) => path !== existing?.file.path);
				if (contested.length > 0) {
					new Notice(
						`Could not create the link: ${contested.length} note${contested.length === 1 ? ' already claims' : 's already claim'} the `
						+ `identity ${curie} (${contested.join(', ')}). `
						+ `Delete or fix ${contested.length === 1 ? 'it' : 'all but one of them'}, then try again.`,
						12000,
					);
					return;
				}
			}

			const note = buildEvidenceLink({
				controlPath: this.control.path,
				controlCurie: this.control.curie,
				controlReviewCid,
				controlReviewGroups,
				evidencePath,
				coverage,
				status,
				scope: scope || undefined,
				folder: this.deps.folder,
				curie,
			});

			let writtenPath: string;
			if (existing) {
				// `current` is set for every `existing` above, or the window already
				// returned. Stated as a refusal rather than an assertion so a future
				// edit that separates them cannot fall through to the create branch and
				// write a second note for a pair that already has one.
				if (!current) {
					new Notice(`Could not update the link at ${existing.file.path}: it could not be read.`, 12000);
					return;
				}
				// Updated WHERE IT SITS, under the identity it already carries. Its
				// address is not corrected to the one a mint would choose today: the
				// note is the record, and moving it would only re-couple the identity
				// to a path again.
				//
				// AM-39. MERGED, not replaced. This was `vault.modify(file,
				// note.markdown)`: the whole note overwritten by a rebuild from three
				// form controls. `reviewer`, `review_date`, `confidence`, `expires_at`
				// and `notes` are exactly the keys the bulk recipe declares
				// `user_preserve` "so the review workflow is not clobbered on
				// re-import" - the re-import honoured it and this window silently
				// deleted them, an approval and its date and its expiry, while
				// reporting that the link had been "updated". A window that can
				// destroy an attestation is not a lighter-weight door than an import;
				// it is the same door with no lock.
				const merged = mergeIntoExistingLink(current, note.markdown, this.previousRenderBody(current, evidencePath));
				if (!merged.ok) {
					new Notice(
						`Could not update the link at ${existing.file.path}: ${merged.detail} `
						+ 'Fix that note, then try again.',
						12000,
					);
					return;
				}
				await this.app.vault.modify(existing.file, merged.markdown);
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
	 * AM-39. Did the person actually answer this control?
	 *
	 * A touch is the direct evidence. A value that differs from the form's own
	 * default is accepted as an answer too, because the command's entry points set
	 * these fields directly and a value nobody could have arrived at by leaving
	 * the form alone is an answer however it got there. The one case neither can
	 * see is choosing the value the default already showed, which is
	 * indistinguishable from not choosing: the note's own value is kept, so
	 * nothing is overwritten by a click that changed nothing.
	 */
	private answered(field: 'coverage' | 'status' | 'scope'): boolean {
		if (this.touched[field]) return true;
		if (field === 'coverage') return this.coverage !== 'full';
		if (field === 'status') return this.status !== 'proposed';
		return this.evidenceScope.trim() !== '';
	}

	/**
	 * AM-39. The body this window would have written for the link AS THE NOTE NOW
	 * RECORDS IT, or null when the note does not record enough to say.
	 *
	 * This is how the window recognises its own unedited output without keeping a
	 * marker in it: rebuild from the note's recorded facts and compare. Equal
	 * means nobody has touched the text since it was generated, so refreshing it
	 * loses nothing. Different means somebody wrote something, and the window is
	 * not the author of that.
	 *
	 * Built from what the NOTE says (its recorded subject, object, coverage,
	 * status, scope, curie and baseline), never from the form's current values -
	 * comparing against the new values would only ever tell us whether the user
	 * changed anything.
	 */
	private previousRenderBody(current: ExistingNote, fallbackEvidencePath: string): string | null {
		const control = this.control;
		if (!control) return null;
		const fm = current.frontmatter;
		const coverage = readEnum<EvidenceCoverage>(fm.coverage, EVIDENCE_COVERAGES);
		const status = readEnum<EvidenceStatus>(fm.status, EVIDENCE_STATUSES);
		const curie = typeof fm.curie === 'string' && fm.curie.trim() !== '' ? fm.curie.trim() : null;
		if (!coverage || !status || !curie) return null;
		const against = fm.reviewed_against && typeof fm.reviewed_against === 'object' && !Array.isArray(fm.reviewed_against)
			? fm.reviewed_against as Record<string, unknown>
			: null;
		const built = buildEvidenceLink({
			controlPath: wikilinkTarget(fm.subject) ?? control.path,
			controlCurie: typeof fm.subject_curie === 'string' ? fm.subject_curie : null,
			controlReviewCid: against && typeof against.review_cid === 'string' ? against.review_cid : null,
			controlReviewGroups: against ? readReviewGroupCids(against.review_groups) : null,
			evidencePath: wikilinkTarget(fm.object) ?? fallbackEvidencePath,
			coverage,
			status,
			scope: typeof fm.scope === 'string' && fm.scope !== '' ? fm.scope : undefined,
			folder: this.deps.folder,
			curie,
		});
		return splitNoteText(built.markdown).body;
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
	 * AM-35 (2026-09-01). A note that cannot be READ stops the scan instead of
	 * dropping out of it. `NoteFrontmatterRead` is a tri-state built for exactly
	 * this: `none` is a FACT (this file has no properties, so it is not a
	 * junction), while `unreadable` is the ABSENCE of a fact - the bytes would not
	 * read, or the properties block will not parse, so nothing at all is known,
	 * including whether it is the very junction being looked for.
	 *
	 * Failure mode prevented: a junction whose YAML a hand edit damaged silently
	 * leaving the answer, the window concluding that nothing records this pair,
	 * and a SECOND junction being minted for a pair that already has one - the
	 * exact outcome this whole lookup exists to prevent, produced by the rule it
	 * cites. Everything else in this window fails closed; this line used to fail
	 * open into a mint. Absence is never read as fact (eighth appearance).
	 *
	 * SCOPE, stated rather than discovered (adversarial SUSPECTED 8): the refusal
	 * covers the whole vault, because the question does. A file's kind cannot be
	 * known without reading it, so a note anywhere whose properties will not parse
	 * blocks every evidence link until it is fixed. That is AM-35's frozen answer
	 * and the copy names the file and the action; whether the product should
	 * eventually offer a narrower escape (skip this note, and say which links may
	 * therefore be duplicated) is a UX decision left to the architect.
	 */
	private async junctionsNamingThisPair(
		evidencePath: string,
	): Promise<
		| { ok: true; junctions: { file: TFile; curie: string | null }[] }
		| { ok: false; unreadablePath: string }
	> {
		const control = this.control;
		if (!control) return { ok: true, junctions: [] };
		const out: { file: TFile; curie: string | null }[] = [];
		for (const file of this.app.vault.getMarkdownFiles()) {
			let fm = this.app.metadataCache.getFileCache(file)?.frontmatter as Record<string, unknown> | undefined;
			if (!fm) {
				// Belt and braces behind `requireVaultIndexed`: a file the cache has
				// not reached is read rather than assumed empty. Absence of a cache
				// entry has never meant absence of properties.
				const read = await readNoteFrontmatterState(this.app, file);
				// AM-35. `none` keeps scanning - a file with no properties is not a
				// junction, and that is a fact. `unreadable` refuses: the one note that
				// cannot be read may be the one that answers.
				if (read.state === 'unreadable') return { ok: false, unreadablePath: file.path };
				if (read.state !== 'ok') continue;
				fm = read.frontmatter;
			}
			if (fm.kind !== 'junction-note') continue;
			if (!this.frontmatterNamesThisPair(fm, evidencePath)) continue;
			const curie = typeof fm.curie === 'string' && fm.curie.trim() !== '' ? fm.curie.trim() : null;
			out.push({ file, curie });
		}
		return { ok: true, junctions: out };
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
	 *
	 * KNOWN AND DEFERRED, 2026-09-01 (adversarial SUSPECTED 9): the object side is
	 * always matched by resolving a wikilink, because an evidence document is a
	 * user's own file and has no identity to match on, and `linkNames` ends at
	 * basename resolution. Two documents (or two framework releases) sharing a
	 * basename can therefore steer a hand-written or bulk-imported junction to the
	 * wrong single match. Not closed here for two reasons: nothing this builder
	 * writes is reachable that way (it records full paths), and AM-39 removed the
	 * damage - an update now merges managed keys and leaves the body and the
	 * reviewer's own fields alone, so a wrong match no longer destroys an
	 * attestation. Closing it properly means an identity for evidence documents,
	 * which is a design question, not a line edit.
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
