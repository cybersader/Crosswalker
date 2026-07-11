/**
 * process-hygiene.ts — detect and kill ORPHANED Obsidian/chromedriver/esbuild
 * processes left behind by a previous crashed or force-killed e2e run, before
 * a new `bun run e2e` starts.
 *
 * Motivation: an orphaned esbuild build-service process caused a
 * `goroutines deadlock` flake mid-run this week, and orphaned wdio/obsidian
 * pairs have been observed to linger after an ungraceful stop.
 *
 * SHARED-TREE SAFETY (this repo can have multiple agents' e2e runs targeting
 * it concurrently): a process is only ever flagged as an orphan if its
 * recorded parent PID is no longer alive. On Linux, wdio's local-runner
 * spawns chromedriver as a normal child of the node process, and
 * chromedriver spawns Obsidian/Electron as its own child — none of this
 * chain uses `detached: true`. So a LIVE sibling run's processes always have
 * a live parent (their own wdio/node runner) and are never touched here.
 * Only truly abandoned processes — reparented to the subreaper (PID 1, or
 * WSL2's Relay/SessionLeader init components), or whose parent already
 * exited — are candidates. This is independent of `bun run build`'s
 * own watch/dev processes started by *other* agents' terminals, as long as
 * those parent shells are still alive.
 *
 * "Relay respawner" — IDENTIFIED 2026-07-11: it's WSL2 itself, not a
 * wdio/obsidian-launcher component. When a test's Obsidian instance loses its
 * real parent (chromedriver killed without a clean WebDriver "quit"), it gets
 * reparented — but NOT to PID 1. WSL2's own init tree runs two internal
 * components visible via `/proc/<pid>/status` `Name:` (not `cmdline`, which
 * just shows `/init` for both): `SessionLeader` and, one level below it,
 * `Relay(<n>)` — confirmed empirically in this session: an orphaned Obsidian
 * from a crashed run had `PPid` pointing at a process whose `cmdline` was
 * `/init` and whose `status` `Name:` was `Relay(2334)`, itself parented by
 * `SessionLeader` (also `/init`), parented by PPid 2. This is WSL2's
 * plan9/wslrelay bridge infrastructure — it's the REAL subreaper in this
 * environment, standing in for PID 1. It "resists kill" because it's core
 * WSL2 session plumbing, not a test artifact — killing it would tear down the
 * whole WSL session. The fix isn't to kill it; it's to recognize it as the
 * orphan-reparent target instead of hardcoding `ppid === 1` (see
 * `isOrphanReaperName` below).
 */

import { existsSync, readdirSync, readFileSync } from 'node:fs';

export interface OrphanProcess {
	pid: number;
	ppid: number;
	cmd: string;
}

/** Cmdline substrings that identify a process as belonging to this harness. */
const SIGNATURE_PATTERNS = [/obsidian/i, /chromedriver/i, /esbuild/i];

function readProcCmdline(pid: number): string | null {
	try {
		const raw = readFileSync(`/proc/${pid}/cmdline`, 'utf8');
		const cmd = raw.replace(/\0/g, ' ').trim();
		return cmd || null;
	} catch {
		return null;
	}
}

function readProcPpid(pid: number): number | null {
	try {
		const raw = readFileSync(`/proc/${pid}/stat`, 'utf8');
		// Format: "<pid> (<comm>) <state> <ppid> ...". comm can contain spaces/parens,
		// so parse from the LAST ')' rather than splitting naively.
		const closeParen = raw.lastIndexOf(')');
		const rest = raw.slice(closeParen + 2).trim().split(/\s+/);
		const ppid = parseInt(rest[1], 10);
		return Number.isFinite(ppid) ? ppid : null;
	} catch {
		return null;
	}
}

function pidExists(pid: number): boolean {
	return existsSync(`/proc/${pid}`);
}

/** `Name:` field from `/proc/<pid>/status` — unlike `cmdline`, this
 *  distinguishes WSL2's internal init components (`Relay(n)`,
 *  `SessionLeader`) even though their `cmdline` is identically `/init`. */
function readProcStatusName(pid: number): string | null {
	try {
		const raw = readFileSync(`/proc/${pid}/status`, 'utf8');
		const m = raw.match(/^Name:\s*(.+)$/m);
		return m ? m[1].trim() : null;
	} catch {
		return null;
	}
}

/** True if `pid` is a subreaper/init-equivalent that orphans get reparented
 *  to, rather than a normal live parent process. Covers plain Linux (PID 1)
 *  and WSL2 (its `Relay(n)` / `SessionLeader` internal init components —
 *  see module doc "Relay respawner" note). */
function isOrphanReaper(pid: number): boolean {
	if (pid === 1) return true;
	const name = readProcStatusName(pid);
	if (!name) return false;
	return /^(Relay(\(\d+\))?|SessionLeader|init)$/.test(name);
}

/**
 * Find processes matching this repo's paths that look like leftover
 * Obsidian/chromedriver/esbuild processes from a prior run, AND whose parent
 * process is no longer alive (i.e. truly orphaned — see module doc for why
 * this is safe on a tree with concurrent sibling agents).
 *
 * No-ops (returns []) on non-Linux (no /proc).
 */
export function findOrphanedTestProcesses(repoRoot: string): OrphanProcess[] {
	const out: OrphanProcess[] = [];
	let pids: string[];
	try {
		pids = readdirSync('/proc').filter((n) => /^\d+$/.test(n));
	} catch {
		return out;
	}

	for (const pidStr of pids) {
		const pid = parseInt(pidStr, 10);
		if (pid === process.pid) continue;
		const cmd = readProcCmdline(pid);
		if (!cmd) continue;
		if (!cmd.includes(repoRoot)) continue;
		if (!SIGNATURE_PATTERNS.some((re) => re.test(cmd))) continue;

		const ppid = readProcPpid(pid);
		if (ppid === null) continue;
		// Orphaned: reparented to the subreaper (PID 1 on plain Linux; WSL2's
		// Relay/SessionLeader init components here — see isOrphanReaper) OR the
		// recorded parent is itself gone (rare race, but harmless to also check).
		const orphaned = !pidExists(ppid) || isOrphanReaper(ppid);
		if (!orphaned) continue; // has a live parent — leave it alone, may be a live sibling run

		out.push({ pid, ppid, cmd });
	}
	return out;
}

/**
 * Kill orphaned test processes found by {@link findOrphanedTestProcesses}.
 * Returns the list that was (attempted to be) killed, for logging.
 */
export function killOrphanedTestProcesses(repoRoot: string): OrphanProcess[] {
	const orphans = findOrphanedTestProcesses(repoRoot);
	for (const o of orphans) {
		try {
			process.kill(o.pid, 'SIGTERM');
		} catch {
			/* already gone */
		}
	}
	return orphans;
}
