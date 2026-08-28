/**
 * evidence-link.ts — build one evidence-link junction note.
 *
 * Pure: takes the chosen control and evidence plus the reviewer's answers, and
 * returns a path and Markdown. No vault access, so the contract below is
 * unit-testable.
 *
 * WHY THIS EXISTS AS A COMMAND
 *
 * Before this, an evidence link could only be created by bulk import or by
 * hand-writing frontmatter, and the published example had `subject` and
 * `object` inverted. Hand-authoring against a wrong example produces links that
 * look right and count for nothing. Encoding the contract in a command makes
 * the correct shape the default path rather than something a user has to know:
 *
 *   - `subject` is always the CONTROL, `object` always the EVIDENCE
 *   - `predicate` is always `has_evidence` and is never asked about
 *   - `subject_curie` is copied from the control note, so the link survives a
 *     rename of that note
 *
 * A user cannot get the direction wrong here, because the modal asks for "the
 * control" and "the evidence" rather than for a subject and an object.
 */

import { CANONICAL_EVIDENCE_PREDICATE } from '../tier2/evidence-coverage';
import { buildProvenance } from '../generation/provenance';
import type { ImportSetReference } from '../generation/import-set';
import type { ReviewGroupCids } from '../generation/hash';

/** How much of the control this evidence covers. */
export type EvidenceCoverage = 'full' | 'partial' | 'none';

/** Review state. Only `approved` links count toward coverage. */
export type EvidenceStatus = 'proposed' | 'in_review' | 'approved';

export interface EvidenceLinkInput {
	/** Vault path of the control note. */
	controlPath: string;
	/** The control's stable identifier, read from its frontmatter. */
	controlCurie: string | null;
	/**
	 * The control's review-normalized content fingerprint
	 * (`_crosswalker.review_cid`), read from its frontmatter at approval time.
	 *
	 * Null when the control carries none — a producer that did not compute one,
	 * or a hand-written control note. Null is NOT a claim that the control is
	 * unchanged; the link is written without a baseline and reported as such.
	 */
	controlReviewCid?: string | null;
	/** Optional recipe-driven explanation hashes from the control provenance. */
	controlReviewGroups?: ReviewGroupCids | null;
	/** Vault path of the evidence document. */
	evidencePath: string;
	coverage: EvidenceCoverage;
	status: EvidenceStatus;
	/** Optional free text describing what part of the control is covered. */
	scope?: string;
	reviewer?: string;
	/** ISO date (YYYY-MM-DD) recorded as the review date. */
	reviewDate?: string;
	/** Folder that holds junction notes. */
	folder: string;
	/** Optional: the vault file the evidence came from, for provenance. */
	sourceFile?: string;
	/** Optional: the import set this link belongs to, when created inside one. */
	importSet?: ImportSetReference;
	/** Plugin version stamped into provenance; defaults when a caller omits it. */
	pluginVersion?: string;
}

export interface EvidenceLinkNote {
	path: string;
	markdown: string;
}

/** Filename-safe form of a vault path's basename. */
function basename(path: string): string {
	const name = path.slice(path.lastIndexOf('/') + 1);
	return name.endsWith('.md') ? name.slice(0, -3) : name;
}

/** Strip characters that are illegal in a filename on any supported platform. */
function fileSafe(value: string): string {
	return value.replace(/[\\/:*?"<>|#^[\]]/g, '-').trim();
}

/**
 * Curie-safe form of a name. Stricter than `fileSafe`: the Tier 1 CURIE grammar
 * allows only `[A-Za-z0-9._\-()/]` in a local part, so spaces (common in
 * evidence document names) must collapse rather than pass through.
 */
function curieSafe(value: string): string {
	return value.replace(/[^A-Za-z0-9._\-()]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
}

/**
 * Emit a nested plain object as indented YAML lines. Deliberately minimal: the
 * provenance block is machine-built from known-safe values, so this handles
 * objects, arrays of scalars, strings, numbers and booleans, and nothing else.
 */
function yamlBlock(value: Record<string, unknown>, depth: number): string[] {
	const pad = '  '.repeat(depth);
	const out: string[] = [];
	for (const [key, v] of Object.entries(value)) {
		if (v === undefined || v === null) continue;
		if (Array.isArray(v)) {
			out.push(`${pad}${key}:`);
			for (const item of v) out.push(`${pad}  - ${yamlString(String(item))}`);
		} else if (typeof v === 'object') {
			out.push(`${pad}${key}:`);
			out.push(...yamlBlock(v as Record<string, unknown>, depth + 1));
		} else if (typeof v === 'string') {
			out.push(`${pad}${key}: ${yamlString(v)}`);
		} else {
			out.push(`${pad}${key}: ${String(v)}`);
		}
	}
	return out;
}

/** Quote a YAML scalar, escaping any embedded quotes. */
function yamlString(value: string): string {
	return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

/**
 * Deterministic path for one control/evidence pair, so linking the same pair
 * twice updates one note rather than producing a near-duplicate that would be
 * counted twice in any tally of links.
 */
export function evidenceLinkPath(folder: string, controlPath: string, evidencePath: string): string {
	const name = fileSafe(`${basename(controlPath)}--has_evidence--${basename(evidencePath)}`);
	return `${folder}/${name}.md`;
}

/**
 * Stable identity for one control/evidence pair.
 *
 * Required: projection REJECTS a junction note with no `curie`, so a link
 * without one is written to the vault, looks correct, and never reaches any
 * report. Derived from the same pair as the path so the two cannot disagree
 * about which link this is.
 */
export function evidenceLinkCurie(controlPath: string, evidencePath: string): string {
	const local = curieSafe(`${basename(controlPath)}--has_evidence--${basename(evidencePath)}`);
	return `cwk:${local}`;
}

/**
 * The `reviewed_against` block for one approval, or null when there is nothing
 * honest to record.
 *
 * ONE helper, used by every stamping path (the link modal, any future
 * approve/re-approve command, and bulk import), so no path can quietly skip it
 * and no path can invent its own rule about half-records.
 *
 * A record carrying only one of the two sub-fields is a HALF-FACT, and
 * half-facts are how "not recorded" becomes "not true": a fingerprint with no
 * curie cannot say which subject it was taken from after a rename, and a curie
 * with no fingerprint cannot be compared to anything. Both or neither.
 *
 * Absence is a named, reported state (`unrecorded`), never an assertion that
 * the subject changed and never a silent exemption from checking. See the Ch 43
 * re-attestation contract §2, and `project_cache_lag_is_not_absence` — three
 * bugs in one week from reading "not recorded" as "not true".
 */
export interface ReviewedAgainst {
	curie: string;
	review_cid: string;
	/** Optional for legacy producers; all three or none. */
	review_groups?: ReviewGroupCids;
}

export function reviewedAgainstFor(
	subjectCurie: string | null | undefined,
	subjectReviewCid: string | null | undefined,
	subjectReviewGroups?: ReviewGroupCids | null,
): ReviewedAgainst | null {
	if (!subjectCurie || !subjectReviewCid) return null;
	return {
		curie: subjectCurie,
		review_cid: subjectReviewCid,
		...(subjectReviewGroups ? { review_groups: { ...subjectReviewGroups } } : {}),
	};
}

/**
 * Build the junction note.
 *
 * `subject_curie` is omitted rather than guessed when the control note has no
 * identifier. A fabricated identifier would match nothing and be reported as an
 * unresolvable link, which is a confusing way to say "this note was never
 * imported by Crosswalker" — the honest omission produces the clearer
 * `no-subject-identity` diagnosis instead.
 */
export function buildEvidenceLink(input: EvidenceLinkInput): EvidenceLinkNote {
	const control = basename(input.controlPath);
	const evidence = basename(input.evidencePath);
	const reviewedAgainst = reviewedAgainstFor(
		input.controlCurie,
		input.controlReviewCid,
		input.controlReviewGroups,
	);

	const lines: string[] = ['---'];
	lines.push(`curie: ${evidenceLinkCurie(input.controlPath, input.evidencePath)}`);
	lines.push('kind: junction-note');
	lines.push(`title: ${yamlString(`${control} has evidence: ${evidence}`)}`);
	lines.push(`subject: ${yamlString(`[[${input.controlPath}|${control}]]`)}`);
	if (input.controlCurie) lines.push(`subject_curie: ${yamlString(input.controlCurie)}`);
	lines.push(`predicate: ${CANONICAL_EVIDENCE_PREDICATE}`);
	lines.push(`object: ${yamlString(`[[${input.evidencePath}|${evidence}]]`)}`);
	lines.push(`coverage: ${input.coverage}`);
	lines.push(`status: ${input.status}`);
	if (input.scope) lines.push(`scope: ${yamlString(input.scope)}`);
	if (input.reviewer) lines.push(`reviewer: ${yamlString(input.reviewer)}`);
	if (input.reviewDate) lines.push(`review_date: ${input.reviewDate}`);
	// The review baseline: WHAT the approver read, so a later upstream edit to
	// the control can invalidate this claim instead of silently outliving it.
	// Only an approval records one; a proposed link has not been reviewed, so
	// there is nothing to record until the approving path stamps it.
	if (input.status === 'approved' && reviewedAgainst) {
		lines.push('reviewed_against:');
		lines.push(`  curie: ${yamlString(reviewedAgainst.curie)}`);
		lines.push(`  review_cid: ${reviewedAgainst.review_cid}`);
		if (reviewedAgainst.review_groups) {
			lines.push('  review_groups:');
			lines.push(`    wording: ${reviewedAgainst.review_groups.wording}`);
			lines.push(`    scope: ${reviewedAgainst.review_groups.scope}`);
			lines.push(`    housekeeping: ${reviewedAgainst.review_groups.housekeeping}`);
		}
	}
	lines.push('tags: [evidence/junction]');

	// A junction note WITHOUT `_crosswalker` is invisible to the whole product:
	// spec/tier1.schema.json requires the block on a junction note, and
	// src/tier2/projector.ts skips any note lacking it as "not produced by
	// Crosswalker". Until 2026-08-28 this builder emitted none, so every link
	// created through the modal was silently absent from coverage reports --
	// present in the vault, counted by nothing.
	//
	// It went unnoticed because the round-trip test that was written to prove the
	// loop closes injected `fm._crosswalker` by hand before projecting, so it
	// exercised a note shape the product never produces. A test that repairs its
	// own input cannot detect a missing output.
	const provenance = buildProvenance(
		{ sourceFile: input.sourceFile, importSet: input.importSet },
		input.pluginVersion ?? '0.0.0',
	);
	lines.push('_crosswalker:');
	for (const line of yamlBlock(provenance, 1)) lines.push(line);

	lines.push('---');
	lines.push('');
	lines.push(`# ${control} has evidence: ${evidence}`);
	lines.push('');
	lines.push(`Control: [[${input.controlPath}|${control}]]`);
	lines.push(`Evidence: [[${input.evidencePath}|${evidence}]]`);
	lines.push('');

	// Tell the reader what this note will and will not do, at the moment they
	// are looking at it. Coverage rules are otherwise only discoverable in docs.
	if (input.status !== 'approved') {
		lines.push(
			`> [!warning] Not yet counted\n`
			+ `> This link is \`${input.status}\`. Only approved links count toward coverage. `
			+ `Change \`status\` to \`approved\` once it has been reviewed.`,
		);
	} else if (input.coverage === 'none') {
		lines.push(
			'> [!warning] Not counted\n'
			+ '> This link records that the evidence does NOT cover the control, so it does not count toward coverage.',
		);
	} else {
		lines.push(
			`> [!note] Counted\n`
			+ `> This link counts as \`${input.coverage}\` coverage of the control.`,
		);
	}

	// Say what this note can and cannot do about upstream change, at the moment
	// the reader is looking at it. An approved link with no baseline still
	// counts; what it cannot do is notice that the control text moved under it.
	if (input.status === 'approved' && !reviewedAgainst) {
		lines.push('');
		lines.push(
			'> [!warning] No review baseline\n'
			+ '> This control has no content fingerprint, so Crosswalker cannot tell you later if it changes. '
			+ 'This link still counts toward coverage. Re-import the control with a current version of Crosswalker, '
			+ 'then re-approve this link to record a baseline.',
		);
	}
	lines.push('');
	lines.push('## Notes');
	lines.push('');

	return {
		path: evidenceLinkPath(input.folder, input.controlPath, input.evidencePath),
		markdown: lines.join('\n'),
	};
}
