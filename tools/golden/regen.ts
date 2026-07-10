/**
 * tools/golden/regen.ts — golden-vault read/write + regeneration (testing
 * doctrine L3, 2026-07-10).
 *
 * The committed goldens under tools/golden/<corpus>/ are the reviewed snapshot
 * of the headless import pipeline over each corpus subset. The drift test
 * (tests/golden-drift.test.ts) rebuilds each vault in memory and diffs it
 * against these files; a mismatch is a review gate, exactly like fixture drift.
 *
 * INVOCATION — run via `bun run golden:regen`, NOT `bun tools/golden/regen.ts`.
 * The harness transitively imports generation-engine (for buildNoteContent),
 * which imports `obsidian`. The npm `obsidian` package ships types only (empty
 * `main`), so a bare bun run cannot resolve it. `golden:regen` therefore routes
 * through jest (which maps `obsidian` → tests/__mocks__ via moduleNameMapper),
 * driving `writeAllGoldens()` from tests/golden-regen.test.ts under
 * CW_GOLDEN_REGEN=1. This module holds the pure fs logic those routes share.
 */

import {
	mkdirSync,
	writeFileSync,
	rmSync,
	readdirSync,
	readFileSync,
	existsSync,
} from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';
import {
	buildVaultInMemory,
	corpusPath,
	goldenDir,
	corpusId,
	CORPORA,
	type CorpusFile,
} from '../../tests/helpers/golden-vault';

/** Repo root (this file lives at <root>/tools/golden/). */
const REPO_ROOT = join(__dirname, '..', '..');

/** Absolute path to a corpus's committed golden directory. */
export function goldenDirAbs(file: string): string {
	return join(REPO_ROOT, goldenDir(file));
}

/** Write one in-memory vault to disk as real .md files under `dir` (cleaned first). */
export function writeGoldenVault(dir: string, vault: Map<string, string>): void {
	rmSync(dir, { recursive: true, force: true });
	mkdirSync(dir, { recursive: true });
	// Sorted for deterministic write order (dir creation is order-independent).
	for (const path of [...vault.keys()].sort()) {
		const full = join(dir, path);
		mkdirSync(dirname(full), { recursive: true });
		writeFileSync(full, vault.get(path)!);
	}
}

/** Read a committed golden directory back into a Map<relativePath, noteText>. */
export function readGoldenVault(dir: string): Map<string, string> {
	const out = new Map<string, string>();
	if (!existsSync(dir)) return out;
	const walk = (current: string): void => {
		for (const entry of readdirSync(current, { withFileTypes: true })) {
			const full = join(current, entry.name);
			if (entry.isDirectory()) {
				walk(full);
			} else if (entry.isFile()) {
				// Key on the vault-relative path, using forward slashes to match the
				// harness's path shape on every OS.
				const rel = relative(dir, full).split(sep).join('/');
				out.set(rel, readFileSync(full, 'utf8'));
			}
		}
	};
	walk(dir);
	return out;
}

/** Regenerate every corpus's committed golden. Returns a per-corpus summary. */
export async function writeAllGoldens(): Promise<{ corpus: string; notes: number }[]> {
	const summary: { corpus: string; notes: number }[] = [];
	for (const file of CORPORA) {
		const vault = await buildVaultInMemory(corpusPath(file));
		writeGoldenVault(goldenDirAbs(file), vault);
		summary.push({ corpus: corpusId(file), notes: vault.size });
	}
	return summary;
}

export { CORPORA, corpusPath, buildVaultInMemory, corpusId, goldenDir };
export type { CorpusFile };
