import { readFileSync } from 'node:fs';
import * as path from 'node:path';
import { TIER2_DDL_V6 } from '../src/tier2/migrations';

// Compare executable SQL rather than comments or formatting. migrations.ts
// duplicates the canonical file because the plugin bundle does not load .sql
// at runtime; this test makes that duplication fail closed when either moves.
function normalizeExecutableSql(sql: string): string {
	return sql
		.replace(/--[^\r\n]*/g, '')
		.replace(/\s+/g, ' ')
		.trim();
}

describe('Tier 2 schema authority', () => {
	it('keeps the bundled v6 DDL semantically synchronized with schema.sql', () => {
		const canonical = readFileSync(
			path.join(__dirname, '..', 'src', 'tier2', 'schema.sql'),
			'utf8',
		);
		expect(normalizeExecutableSql(TIER2_DDL_V6))
			.toBe(normalizeExecutableSql(canonical));
	});
});
