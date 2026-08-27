/**
 * managed-body.test.ts — the marker grammar, the corruption matrix, and the two
 * adoption rules.
 *
 * Acceptance cases A3, A4, B6 to B10 from the 2026-08-27 managed-body-regions
 * contract. Pure: no vault, no Obsidian.
 */

import {
	MAX_SUPPORTED_REGION_VERSION,
	REGION_FORMAT_VERSION,
	adoptLegacyBody,
	normalizeForComparison,
	replaceRegion,
	replayHubMerge,
	scanRegions,
	stripRecognisedBlocks,
	wrapManagedBody,
	wrapRegion,
	type CorruptionCode,
} from '../src/generation/managed-body';
import { mergeHubBody, buildManagedChildrenSection, mergeManagedChildrenSection } from '../src/generation/enrich';

const START = '<!-- crosswalker:body:start v=1 -->';
const END = '<!-- crosswalker:body:end -->';

/** Assert the scan refuses a body with exactly `code`. */
function expectCorrupt(body: string, code: CorruptionCode) {
	const scan = scanRegions(body);
	expect(scan.ok).toBe(false);
	if (!scan.ok) expect(scan.code).toBe(code);
}

describe('marker grammar (contract §1.2)', () => {
	it('wraps content with the version stamped on the start marker only', () => {
		expect(wrapRegion('body', '# Title\n')).toBe(`${START}\n# Title\n${END}`);
	});

	it('emits an empty region rather than nothing, so a frontmatter-only note is still adoptable', () => {
		expect(wrapRegion('body', '')).toBe(`${START}\n${END}`);
		expect(wrapManagedBody('')).toBe(`${START}\n${END}\n`);
	});

	it('leaves interior bytes alone, including trailing spaces (a Markdown hard line break)', () => {
		const content = 'line one  \nline two\n';
		expect(wrapRegion('body', content)).toContain('line one  \nline two');
	});

	it('reads a v-less marker as v=1, so the already-shipped children markers need no migration', () => {
		const body = '<!-- crosswalker:children:start -->\n## Contents\n<!-- crosswalker:children:end -->\n';
		const scan = scanRegions(body);
		expect(scan.ok).toBe(true);
		if (scan.ok) {
			expect(scan.spans).toHaveLength(1);
			expect(scan.spans[0].name).toBe('children');
			expect(scan.spans[0].version).toBe(1);
		}
	});

	it('exports the version constants the v2 story depends on', () => {
		expect(REGION_FORMAT_VERSION).toBe(1);
		expect(MAX_SUPPORTED_REGION_VERSION).toBe(1);
	});

	it('does not treat an INDENTED marker-shaped line as a marker (it cannot be a boundary)', () => {
		const body = `- quoting it:\n  ${START}\n`;
		const scan = scanRegions(body);
		expect(scan.ok).toBe(true);
		if (scan.ok) expect(scan.spans).toHaveLength(0);
	});

	it('tolerates and strips trailing whitespace on a marker line', () => {
		const scan = scanRegions(`${START}   \n# X\n${END}\t\n`);
		expect(scan.ok).toBe(true);
	});
});

// ---------------------------------------------------------------------------
// A3 — the ten corruption states. In every case the CALLER must not modify the
// file; here we pin that the scan refuses with the exact code.
// ---------------------------------------------------------------------------

describe('A3 — corruption matrix (contract §3.2)', () => {
	it('1. unclosed-region', () => {
		expectCorrupt(`${START}\n# X\n`, 'unclosed-region');
	});

	it('2. orphan-end-marker', () => {
		expectCorrupt(`# X\n${END}\n`, 'orphan-end-marker');
	});

	it('3. inverted-region', () => {
		expectCorrupt(`${END}\n# X\n${START}\n# X\n${END}\n`, 'inverted-region');
	});

	it('4. duplicate-region', () => {
		expectCorrupt(`${START}\n# X\n${END}\n${START}\n# Y\n${END}\n`, 'duplicate-region');
	});

	it('5. duplicate-end-marker', () => {
		expectCorrupt(`${START}\n# X\n${END}\n${END}\n`, 'duplicate-end-marker');
	});

	it('6. interleaved-regions', () => {
		const body = [
			START,
			'<!-- crosswalker:children:start v=1 -->',
			END,
			'<!-- crosswalker:children:end -->',
			'',
		].join('\n');
		expectCorrupt(body, 'interleaved-regions');
	});

	it('7. nested-region (properly nested, not interleaved)', () => {
		const body = [
			START,
			'<!-- crosswalker:children:start v=1 -->',
			'<!-- crosswalker:children:end -->',
			END,
			'',
		].join('\n');
		expectCorrupt(body, 'nested-region');
	});

	it('7b. nested-region — a foreign end marker inside an open region', () => {
		expectCorrupt(`${START}\n<!-- crosswalker:children:end -->\n${END}\n`, 'nested-region');
	});

	it('8. malformed-marker — a typo is corruption, never prose', () => {
		expectCorrupt('<!-- crosswalker:body:strt v=1 -->\n# X\n', 'malformed-marker');
		expectCorrupt('<!-- crosswalker:body:start v=1 extra=2 -->\n# X\n', 'malformed-marker');
		expectCorrupt('<!-- crosswalker:Body:start -->\n', 'malformed-marker');
		expectCorrupt('<!-- crosswalker:body:start  v=1 -->\n', 'malformed-marker');
		expectCorrupt('<!-- crosswalker:body:start v=0 -->\n', 'malformed-marker');
	});

	it('9. future-region-version', () => {
		expectCorrupt('<!-- crosswalker:body:start v=2 -->\n# X\n<!-- crosswalker:body:end -->\n', 'future-region-version');
	});

	it('10. the only marker of a pair is inside a code fence — reported with the fence named', () => {
		const body = ['```md', END, '```', START, '# X', ''].join('\n');
		const scan = scanRegions(body);
		expect(scan.ok).toBe(false);
		if (!scan.ok) {
			expect(scan.code).toBe('unclosed-region');
			expect(scan.detail).toContain('fenced code block');
		}
	});

	it('reserved v1 expansion syntax fails closed, which is what makes adding it later safe', () => {
		expectCorrupt('<!-- crosswalker:body:start v=1 scope=row -->\n', 'malformed-marker');
	});
});

describe('explicitly NOT corruption (contract §3.3)', () => {
	it('an empty region', () => {
		expect(scanRegions(`${START}\n${END}\n`).ok).toBe(true);
	});

	it('a balanced region with an unknown name — forward compatibility', () => {
		const scan = scanRegions('<!-- crosswalker:evidence:start v=1 -->\nnotes\n<!-- crosswalker:evidence:end -->\n');
		expect(scan.ok).toBe(true);
		if (scan.ok) expect(scan.spans[0].name).toBe('evidence');
	});

	it('a note with markers but no Crosswalker frontmatter — ownership is decided by markers alone', () => {
		expect(scanRegions(`${START}\n# X\n${END}\n`).ok).toBe(true);
	});

	it('a Waypoint block outside every region', () => {
		expect(scanRegions(`${START}\n# X\n${END}\n\n%% Waypoint %%\n`).ok).toBe(true);
	});
});

// ---------------------------------------------------------------------------
// B7 — fence awareness
// ---------------------------------------------------------------------------

describe('B7 — fence awareness', () => {
	it('a marker-shaped line inside a fenced code block is prose, not a marker', () => {
		const body = ['# Docs', '', '```markdown', START, 'example', END, '```', ''].join('\n');
		const scan = scanRegions(body);
		expect(scan.ok).toBe(true);
		if (scan.ok) expect(scan.spans).toHaveLength(0);
	});

	it('a tilde fence works too, and a longer closing fence closes a shorter opener', () => {
		const body = ['~~~', START, '~~~~', ''].join('\n');
		const scan = scanRegions(body);
		expect(scan.ok).toBe(true);
		if (scan.ok) expect(scan.spans).toHaveLength(0);
	});

	it('the fence contents survive a replace verbatim', () => {
		const fence = ['```markdown', START, 'example', END, '```'].join('\n');
		const body = `${START}\n# X\n${END}\n\n${fence}\n`;
		const scan = scanRegions(body);
		expect(scan.ok).toBe(true);
		if (!scan.ok) return;
		const out = replaceRegion(body, scan.spans, 'body', wrapRegion('body', '# Y\n'));
		expect(out).toBe(`${START}\n# Y\n${END}\n\n${fence}\n`);
	});
});

// ---------------------------------------------------------------------------
// replaceRegion — byte preservation
// ---------------------------------------------------------------------------

describe('replaceRegion — every byte outside the region survives', () => {
	it('preserves prose before and after, including CRLF and trailing spaces', () => {
		const body = `Intro.  \r\n\r\n${START}\n# Old\n${END}\r\n\r\nOutro.  \r\n`;
		const scan = scanRegions(body);
		expect(scan.ok).toBe(true);
		if (!scan.ok) return;
		const out = replaceRegion(body, scan.spans, 'body', wrapRegion('body', '# New\n'));
		// Bytes OUTSIDE the region are not normalised at all. Bytes INSIDE it are
		// LF by construction (contract §4.2), and the marker lines are region bytes,
		// so the end marker's stray CR goes with the rebuilt region.
		expect(out).toBe(`Intro.  \r\n\r\n${START}\n# New\n${END}\r\n\r\nOutro.  \r\n`.replace(`${END}\r\n`, `${END}\n`));
		expect(out).toContain('Intro.  \r\n');
		expect(out).toContain('Outro.  \r\n');
	});

	it('B10 — an unknown balanced region is preserved verbatim through a replace', () => {
		const evidence = '<!-- crosswalker:evidence:start v=1 -->\nSOC2 ticket 41\n<!-- crosswalker:evidence:end -->';
		const body = `${START}\n# Old\n${END}\n\n${evidence}\n`;
		const scan = scanRegions(body);
		expect(scan.ok).toBe(true);
		if (!scan.ok) return;
		const out = replaceRegion(body, scan.spans, 'body', wrapRegion('body', '# New\n'));
		expect(out).toContain(evidence);
		expect(out).toBe(`${START}\n# New\n${END}\n\n${evidence}\n`);
	});

	it('appends after the last region when the named region is absent, never reordering', () => {
		const children = '<!-- crosswalker:children:start v=1 -->\n## Contents\n<!-- crosswalker:children:end -->';
		const body = `Prose.\n\n${children}\n`;
		const scan = scanRegions(body);
		expect(scan.ok).toBe(true);
		if (!scan.ok) return;
		const out = replaceRegion(body, scan.spans, 'body', wrapRegion('body', '# X\n'));
		expect(out).toBe(`Prose.\n\n${children}\n\n${START}\n# X\n${END}\n`);
	});
});

// ---------------------------------------------------------------------------
// B6 / adoption comparison
// ---------------------------------------------------------------------------

describe('normalizeForComparison (contract §4.3)', () => {
	it('normalises newline form and leading/trailing blank-line runs', () => {
		expect(normalizeForComparison('\r\n\r\n# X\r\n\r\n')).toBe('# X');
	});

	it('does NOT strip trailing per-line whitespace — two trailing spaces are a hard line break', () => {
		expect(normalizeForComparison('a  \nb')).toBe('a  \nb');
	});
});

describe('legacy adoption, strict mode (contract §4.3)', () => {
	const fresh = '# Account Management\n\n## Description\nManage accounts.\n';

	it('B2 — an equal legacy note adopts, gaining exactly the two marker lines', () => {
		const result = adoptLegacyBody(fresh, fresh, 'strict');
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.body).toBe(`${START}\n${fresh.replace(/\n$/, '')}\n${END}\n`);
		// Stripping the two marker lines returns the original file byte-for-byte.
		expect(result.body.split('\n').filter((l) => !l.startsWith('<!-- crosswalker:')).join('\n')).toBe(fresh);
	});

	it('A2 / legacy-body-differs — one character of difference refuses, it never partially adopts', () => {
		const result = adoptLegacyBody(`${fresh}x`, fresh, 'strict');
		expect(result.ok).toBe(false);
		if (!result.ok) expect(result.code).toBe('legacy-body-differs');
	});

	it('B6 — a lone trailing space refuses rather than adopting (pins fork 8)', () => {
		const result = adoptLegacyBody('# Account Management \n\n## Description\nManage accounts.\n', fresh, 'strict');
		expect(result.ok).toBe(false);
	});

	it('B5 — CRLF adopts after newline normalisation; the rebuilt region is LF', () => {
		const crlf = fresh.replace(/\n/g, '\r\n');
		const result = adoptLegacyBody(crlf, fresh, 'strict');
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		// The rebuilt region is LF by construction (it is generated). The file's own
		// trailing newline sits OUTSIDE the region, so it keeps its original CRLF
		// form: bytes outside a region are never normalised, not even this one.
		expect(result.body).toBe(`${START}\n${fresh.replace(/\n$/, '')}\n${END}\r\n`);
		expect(result.body.slice(0, result.body.indexOf(END))).not.toContain('\r');
	});

	/**
	 * B5, the case that actually bites. Real sources in this corpus carry embedded
	 * CRLF, and an UN-NORMALISED comparison reported prose loss on them where there
	 * was none: the note would refuse to adopt, get a `legacy-body-differs`
	 * conflict, and a user would be told their perfectly ordinary note could not be
	 * updated. The test above cannot catch that regression, because it has no bytes
	 * outside the region to compare. This one does.
	 *
	 * Three things are pinned at once: the marker tokenizer still recognises a
	 * `...-->\r` line (trailing CR is stripped), so the children block is EXCLUDED
	 * from the comparison rather than counted as user prose; the comparison
	 * normalises newlines, so the note adopts instead of falsely conflicting; and
	 * the bytes outside the region keep their original CRLF, byte for byte.
	 */
	it.each([
		['a children region', '<!-- crosswalker:children:start v=1 -->\n## Contents\n- [[AC-2.1]]\n<!-- crosswalker:children:end -->'],
		['an expanded Waypoint block', '%% Begin Waypoint %%\n- [[Some Note]]\n%% End Waypoint %%'],
	])('B5 — a CRLF legacy note with %s outside adopts, and those bytes keep their CRLF', (_label, block) => {
		const legacy = `${fresh}\n${block}\n`.replace(/\n/g, '\r\n');
		const result = adoptLegacyBody(legacy, fresh, 'strict');

		// It adopts. A refusal here is the false "prose loss" report, not safety.
		expect(result.ok).toBe(true);
		if (!result.ok) return;

		// The region is rebuilt as LF; every byte outside it survives as CRLF.
		expect(result.body).toBe(
			`${START}\n${fresh.replace(/\n$/, '')}\n${END}` + `\n\n${block}\n`.replace(/\n/g, '\r\n'),
		);
		expect(result.body.slice(result.body.indexOf(END) + END.length)).toContain('\r\n');
		// Strip the two marker lines and the newline form of the original returns.
		expect(result.body.split(/\r?\n/).filter((l) => !l.startsWith('<!-- crosswalker:body:')).join('\n'))
			.toBe(normalizeForComparison(legacy) + '\n');
	});

	it('B3 — adoption with an enrichment children block: the block ends up outside the region, unchanged', () => {
		const children = buildManagedChildrenSection('Contents', ['[[AC-2.1]]']).replace(/\n$/, '');
		const legacy = `${fresh}\n${children}\n`;
		const result = adoptLegacyBody(legacy, fresh, 'strict');
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.body).toBe(`${START}\n${fresh.replace(/\n$/, '')}\n${END}\n\n${children}\n`);
	});

	it('B4 — adoption with an EXPANDED Waypoint block: the block survives verbatim', () => {
		const waypoint = '%% Begin Waypoint %%\n- [[Some Note]]\n%% End Waypoint %%';
		const legacy = `${fresh}\n${waypoint}\n`;
		const result = adoptLegacyBody(legacy, fresh, 'strict');
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.body).toContain(waypoint);
		expect(result.body).toBe(`${START}\n${fresh.replace(/\n$/, '')}\n${END}\n\n${waypoint}\n`);
	});

	it('refuses when a recognised block appears BEFORE the note body (no positional model to rebuild from)', () => {
		const children = buildManagedChildrenSection('Contents', ['[[AC-2.1]]']).replace(/\n$/, '');
		const result = adoptLegacyBody(`${children}\n\n${fresh}`, fresh, 'strict');
		expect(result.ok).toBe(false);
		if (!result.ok) expect(result.code).toBe('legacy-body-differs');
	});

	it('refuses when prose follows the recognised block', () => {
		const children = buildManagedChildrenSection('Contents', ['[[AC-2.1]]']).replace(/\n$/, '');
		const result = adoptLegacyBody(`${fresh}\n${children}\n\nA later thought.\n`, fresh, 'strict');
		expect(result.ok).toBe(false);
	});

	it('an empty legacy body adopts into an empty region', () => {
		const result = adoptLegacyBody('', '', 'strict');
		expect(result.ok).toBe(true);
		if (result.ok) expect(result.body).toBe(`${START}\n${END}`);
	});
});

describe('stripRecognisedBlocks — the CLOSED v1 exclusion list', () => {
	it('excludes a children region and a Waypoint trigger, and nothing else', () => {
		const children = buildManagedChildrenSection('Contents', ['[[A]]']).replace(/\n$/, '');
		const body = `# X\n\n${children}\n\n%% Waypoint %%\n\n> a user callout\n`;
		const split = stripRecognisedBlocks(body);
		expect(split).not.toBeNull();
		expect(split!.excluded.map((b) => b.kind)).toEqual(['children-region', 'waypoint']);
		expect(split!.remainder).toContain('> a user callout');
		expect(split!.remainder).not.toContain('## Contents');
	});

	it('does not strip an unterminated Begin Waypoint block (that is Waypoint\'s business, not ours)', () => {
		const split = stripRecognisedBlocks('# X\n\n%% Begin Waypoint %%\n- [[A]]\n');
		expect(split!.excluded).toHaveLength(0);
	});

	it('returns null on corrupt markers so the caller conflicts rather than guessing', () => {
		expect(stripRecognisedBlocks(`${START}\n# X\n`)).toBeNull();
	});
});

// ---------------------------------------------------------------------------
// C5 groundwork — adopt-by-replay
// ---------------------------------------------------------------------------

describe('adopt-by-replay for facet hubs (contract §4.4)', () => {
	const freshHub = '# Persistence\n';

	it('replayHubMerge is byte-identical to enrich.mergeHubBody, so the preserved set is provably unchanged', () => {
		const cases = [
			'# Persistence\n\nMy notes about this tactic.\n\n- a bullet\n',
			'Just prose, no heading.\n',
			'',
			'# Old title\r\n\r\nWindows prose.\r\n',
		];
		for (const existing of cases) {
			expect(replayHubMerge(existing, freshHub)).toBe(mergeHubBody(existing, freshHub));
		}
	});

	it('never conflicts, and wraps only the part mergeHubBody regenerated', () => {
		const existing = '# Persistence\n\nMy notes about this tactic.\n';
		const result = adoptLegacyBody(existing, freshHub, 'replay-hub');
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.body).toBe('<!-- crosswalker:body:start v=1 -->\n# Persistence\n<!-- crosswalker:body:end -->\n\nMy notes about this tactic.\n');
		// Same bytes as today's merger plus exactly the two marker lines.
		expect(result.body.split('\n').filter((l) => !l.startsWith('<!-- crosswalker:')).join('\n'))
			.toBe(mergeHubBody(existing, freshHub));
	});

	it('a hub with no H1 keeps the whole existing body outside the region', () => {
		const result = adoptLegacyBody('Just my prose.\n', freshHub, 'replay-hub');
		expect(result.ok).toBe(true);
		if (result.ok) expect(result.body).toContain('Just my prose.');
	});
});

// ---------------------------------------------------------------------------
// The children region, still merged in place and now byte-preserving
// ---------------------------------------------------------------------------

describe('children region merge stays byte-preserving now that user prose can sit beside it', () => {
	it('rebuilds only the delimited block; CRLF and trailing spaces outside it survive', () => {
		const before = buildManagedChildrenSection('Contents', ['[[A]]']).replace(/\n$/, '');
		const body = `${START}\n# X\n${END}\r\n\r\nUser prose.  \r\n\r\n${before}\r\n\r\nTail.\r\n`;
		const fresh = buildManagedChildrenSection('Contents', ['[[A]]', '[[B]]']);
		const out = mergeManagedChildrenSection(body, fresh);
		expect(out).toContain('User prose.  \r\n');
		expect(out).toContain('Tail.\r\n');
		expect(out).toContain('- [[B]]');
		expect(out.match(/crosswalker:children:start/g)).toHaveLength(1);
		// The `body` region is untouched.
		expect(out).toContain(`${START}\n# X\n${END}`);
	});

	it('emits the version stamp from now on, while still reading the v-less form', () => {
		expect(buildManagedChildrenSection('Contents', ['[[A]]'])).toContain('<!-- crosswalker:children:start v=1 -->');
		const legacy = '# X\n\n<!-- crosswalker:children:start -->\n## Contents\n- [[A]]\n<!-- crosswalker:children:end -->\n';
		const out = mergeManagedChildrenSection(legacy, buildManagedChildrenSection('Contents', ['[[A]]', '[[B]]']));
		expect(out).toContain('- [[B]]');
		expect(out.match(/crosswalker:children:start/g)).toHaveLength(1);
	});
});
