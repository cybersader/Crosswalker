/**
 * golden-drift.test.ts — L3 golden-snapshot drift gate (testing doctrine).
 *
 * Rebuilds each corpus vault in memory and diffs it against the committed
 * goldens under tools/golden/<corpus>/. Any divergence fails with a readable
 * per-file summary. Same regime as `check:fixtures-drift`: an intentional change
 * is fine — regenerate and review the diff.
 */

import { buildVaultInMemory, corpusPath, CORPORA } from './helpers/golden-vault';
import { readGoldenVault, goldenDirAbs } from '../tools/golden/regen';

/** First line index where two multi-line strings differ (or -1 if equal). */
function firstDiffLine(a: string, b: string): number {
	const la = a.split('\n');
	const lb = b.split('\n');
	const n = Math.max(la.length, lb.length);
	for (let i = 0; i < n; i++) {
		if (la[i] !== lb[i]) return i;
	}
	return -1;
}

/** Build a human-readable diff report between the rebuilt vault and the golden. */
function diffReport(built: Map<string, string>, golden: Map<string, string>): string[] {
	const problems: string[] = [];
	const builtKeys = new Set(built.keys());
	const goldenKeys = new Set(golden.keys());

	for (const k of [...goldenKeys].sort()) {
		if (!builtKeys.has(k)) problems.push(`  MISSING (in golden, not rebuilt): ${k}`);
	}
	for (const k of [...builtKeys].sort()) {
		if (!goldenKeys.has(k)) problems.push(`  EXTRA (rebuilt, not in golden): ${k}`);
	}
	for (const k of [...builtKeys].sort()) {
		if (!goldenKeys.has(k)) continue;
		const b = built.get(k)!;
		const g = golden.get(k)!;
		if (b !== g) {
			const line = firstDiffLine(g, b);
			problems.push(
				`  CHANGED: ${k} (first differs at line ${line + 1})\n` +
					`      golden:  ${JSON.stringify(g.split('\n')[line] ?? '<eof>')}\n` +
					`      rebuilt: ${JSON.stringify(b.split('\n')[line] ?? '<eof>')}`,
			);
		}
	}
	return problems;
}

describe('golden vault drift', () => {
	for (const file of CORPORA) {
		it(`${file} matches its committed golden`, async () => {
			const built = await buildVaultInMemory(corpusPath(file));
			const golden = readGoldenVault(goldenDirAbs(file));

			expect(golden.size).toBeGreaterThan(0); // golden exists — run golden:regen if this fails

			const problems = diffReport(built, golden);
			if (problems.length > 0) {
				const header =
					`Golden drift for ${file} (${problems.length} file(s) differ).\n` +
					`Intentional change? Run \`bun run golden:regen\` and review the diff.\n`;
				throw new Error(header + problems.join('\n'));
			}
		});
	}
});
