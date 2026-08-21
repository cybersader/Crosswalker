import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const SCRIPT = join(__dirname, '..', 'scripts', 'check-fixtures-drift.mjs');

describe('fixture drift gate', () => {
	it('reports drift and restores the developer fixture tree without using stash', () => {
		const root = mkdtempSync(join(tmpdir(), 'crosswalker-drift-test-'));
		const fixtures = join(root, 'fixtures');
		mkdirSync(fixtures);
		writeFileSync(join(fixtures, 'kept.md'), 'original');
		const regen = join(root, 'regen.mjs');
		writeFileSync(
			regen,
			`import { writeFileSync } from 'node:fs'; writeFileSync(${JSON.stringify(join(fixtures, 'kept.md'))}, 'changed'); writeFileSync(${JSON.stringify(join(fixtures, 'new.md'))}, 'new');`,
		);

		const result = spawnSync('bun', [SCRIPT], {
			env: {
				...process.env,
				CROSSWALKER_FIXTURE_DIR: fixtures,
				CROSSWALKER_FIXTURE_COMMAND: `node ${JSON.stringify(regen)}`,
			},
			encoding: 'utf-8',
		});
		expect(result.status).toBe(1);
		expect(result.stderr).toContain('Fixture drift detected');
		expect(readFileSync(join(fixtures, 'kept.md'), 'utf-8')).toBe('original');
		expect(() => readFileSync(join(fixtures, 'new.md'))).toThrow();
		expect(readFileSync(SCRIPT, 'utf-8')).not.toContain('git stash');
		rmSync(root, { recursive: true, force: true });
	});
});
