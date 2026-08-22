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

/** How much of the control this evidence covers. */
export type EvidenceCoverage = 'full' | 'partial' | 'none';

/** Review state. Only `approved` links count toward coverage. */
export type EvidenceStatus = 'proposed' | 'in_review' | 'approved';

export interface EvidenceLinkInput {
	/** Vault path of the control note. */
	controlPath: string;
	/** The control's stable identifier, read from its frontmatter. */
	controlCurie: string | null;
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
	lines.push('tags: [evidence/junction]');
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
	lines.push('');
	lines.push('## Notes');
	lines.push('');

	return {
		path: evidenceLinkPath(input.folder, input.controlPath, input.evidencePath),
		markdown: lines.join('\n'),
	};
}
