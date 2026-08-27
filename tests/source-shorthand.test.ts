/**
 * source-shorthand.test.ts — the comma-shorthand -> `source.where` translator.
 *
 * Replaces the deleted `parseWhere` / `applyWhere` suite (2026-08-27 contract
 * §11). Two properties are load-bearing:
 *
 * 1. THE TRUTH TABLE IS UNCHANGED, so working imports keep working. The
 *    documented MITRE ATT&CK STIX filter runs over a SPARSE `revoked` field;
 *    a naive `` `revoked` != 'true' `` would return non-boolean on every record
 *    lacking it, trip G1, and break an import that works today.
 * 2. THE TRUTH TABLE IS NOW EXPLICIT, in text the UI shows, and every field
 *    reference is checked by G2 at preflight. That is what the old
 *    implementation could not do, and why it is deleted rather than deprecated.
 */

import { prepareSourceStage, shorthandToSourceExpression } from '../src/source';
import type { ParsedData } from '../src/types/config';

/** Run a translated shorthand through the real source stage. */
async function keep(spec: string, rows: Array<Record<string, unknown>>): Promise<Array<Record<string, unknown>>> {
	const where = shorthandToSourceExpression(spec);
	const columns = [...new Set(rows.flatMap((r) => Object.keys(r)))];
	const data: ParsedData = { columns, rows, rowCount: rows.length };
	const stage = await prepareSourceStage(data, { where });
	const out: Array<Record<string, unknown>> = [];
	for await (const row of stage.rows as AsyncIterable<Record<string, unknown>>) out.push(row);
	stage.finalize();
	return out;
}

const STIX = [
	{ type: 'attack-pattern', id: 'ap-1', revoked: 'false', meta: { tier: 'one' } },
	{ type: 'attack-pattern', id: 'ap-2', revoked: 'true' },
	{ type: 'relationship', id: 'rel-1' },
];

describe('shorthandToSourceExpression', () => {
	it('declares nothing for an empty spec, so a blank field takes the additive path', () => {
		expect(shorthandToSourceExpression('')).toBeUndefined();
		expect(shorthandToSourceExpression('   ')).toBeUndefined();
		expect(shorthandToSourceExpression(undefined)).toBeUndefined();
	});

	it('writes the missing-field rule into the expression instead of leaving it implicit', () => {
		expect(shorthandToSourceExpression('type=attack-pattern'))
			.toBe("($exists(`type`) and $string(`type`) = 'attack-pattern')");
		expect(shorthandToSourceExpression('revoked!=true'))
			.toBe("($not($exists(`revoked`)) or $string(`revoked`) != 'true')");
	});

	it('ANDs comma-separated clauses', () => {
		expect(shorthandToSourceExpression('a=1,b=2'))
			.toBe("($exists(`a`) and $string(`a`) = '1') and ($exists(`b`) and $string(`b`) = '2')");
	});

	it('backtick-quotes every dotted segment, so column names with spaces work', () => {
		expect(shorthandToSourceExpression('meta.tier=one'))
			.toBe("($exists(`meta`.`tier`) and $string(`meta`.`tier`) = 'one')");
		expect(shorthandToSourceExpression('CIS Safeguard=1.1')).toContain('`CIS Safeguard`');
	});

	it('escapes quotes in the literal', () => {
		expect(shorthandToSourceExpression("name=O'Brien")).toContain("'O\\'Brien'");
	});

	it('rejects malformed clauses by naming what the user typed', () => {
		expect(() => shorthandToSourceExpression('no-equals-here')).toThrow(/Malformed filter/);
		expect(() => shorthandToSourceExpression('=value')).toThrow(/Malformed filter/);
		expect(() => shorthandToSourceExpression('a..b=1')).toThrow(/empty segment/);
		expect(() => shorthandToSourceExpression('a`b=1')).toThrow(/backtick/);
	});
});

describe('translated shorthand, evaluated by the real source stage', () => {
	it('filters by equality', async () => {
		expect(await keep('type=attack-pattern', STIX)).toHaveLength(2);
	});

	it('the documented MITRE STIX filter still works over a SPARSE field', async () => {
		// `relationship` has no `revoked` key at all. A naive `!=` translation
		// would return non-boolean here and trip G1, failing a working import.
		const out = await keep('type=attack-pattern,revoked!=true', STIX);
		expect(out).toEqual([STIX[0]]);
		expect(await keep('revoked!=true', STIX)).toHaveLength(2);
	});

	it('resolves dotted paths into nested values', async () => {
		expect(await keep('meta.tier=one', STIX)).toEqual([STIX[0]]);
	});

	it('THE FIX: a filter naming a column that does not exist now FAILS LOUDLY at preflight', async () => {
		// This is the breaking behaviour change. The old silent predicate returned
		// 0 rows here and reported nothing at all.
		await expect(keep('nonexistent=x', STIX)).rejects.toThrow(/nonexistent/);
	});

	it('a correct field name compared against a literal that never occurs is caught by G3', async () => {
		await expect(keep('type=nothing-matches-this', STIX)).rejects.toThrow(/excluded every row/);
	});
});
