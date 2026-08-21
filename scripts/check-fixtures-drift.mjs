#!/usr/bin/env bun
/**
 * Verify that checked-in fixtures match a deterministic regeneration without
 * manipulating repository state or losing a developer's uncommitted fixture work.
 */

import { execSync } from 'node:child_process';
import { cpSync, existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join, relative, resolve } from 'node:path';

const FIXTURE_DIR = process.env.CROSSWALKER_FIXTURE_DIR ?? 'test-vault/Frameworks/NIST-mini';
const REGEN_COMMAND = process.env.CROSSWALKER_FIXTURE_COMMAND ?? 'bun run fixtures';
const VERBOSE = process.argv.includes('--verbose');

function snapshotTree(root) {
	const snapshot = new Map();
	if (!existsSync(root)) return snapshot;
	const walk = (dir) => {
		for (const entry of readdirSync(dir, { withFileTypes: true })) {
			const path = join(dir, entry.name);
			if (entry.isDirectory()) walk(path);
			else if (entry.isFile()) snapshot.set(relative(root, path), readFileSync(path));
		}
	};
	walk(root);
	return snapshot;
}

function changedPaths(before, after) {
	const paths = new Set([...before.keys(), ...after.keys()]);
	return [...paths].filter((path) => {
		const left = before.get(path);
		const right = after.get(path);
		return !left || !right || !left.equals(right);
	}).sort();
}

function run() {
	const fixturePath = resolve(FIXTURE_DIR);
	const backupRoot = mkdtempSync(join(tmpdir(), 'crosswalker-fixtures-'));
	const backupPath = join(backupRoot, basename(fixturePath));
	console.log(`Checking fixture drift in ${FIXTURE_DIR}...`);

	if (existsSync(fixturePath)) cpSync(fixturePath, backupPath, { recursive: true, force: true });
	const before = snapshotTree(backupPath);
	let drift = [];
	let regenError = null;

	try {
		console.log(`  Running ${REGEN_COMMAND}...`);
		execSync(REGEN_COMMAND, { encoding: 'utf-8', stdio: VERBOSE ? 'inherit' : 'pipe' });
		drift = changedPaths(before, snapshotTree(fixturePath));
	} catch (error) {
		regenError = error;
	} finally {
		rmSync(fixturePath, { recursive: true, force: true });
		if (existsSync(backupPath)) cpSync(backupPath, fixturePath, { recursive: true, force: true });
		rmSync(backupRoot, { recursive: true, force: true });
	}

	if (regenError) {
		console.error(`Fixture regeneration failed: ${regenError.message}`);
		process.exit(2);
	}
	if (drift.length > 0) {
		console.error('Fixture drift detected. Run bun run fixtures and commit the result.');
		console.error(`Changed paths (${drift.length}):`);
		for (const path of drift.slice(0, 50)) console.error(`  ${path}`);
		process.exit(1);
	}
	console.log('  No drift. Fixtures match canonical regeneration.');
}

run();
