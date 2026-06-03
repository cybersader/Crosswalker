#!/usr/bin/env node
/**
 * zz-log sidebar-label convention checker.
 *
 * Every decision/dev log under docs/src/content/docs/agent-context/zz-log/
 * is named `YYYY-MM-DD-<slug>.mdx` and MUST carry a `sidebar.label` that
 * begins with the `MM-DD · ` date prefix drawn from its filename, e.g.
 *
 *     2026-06-02-ingestion-tooling-dev.mdx
 *     →  label: "06-02 · Ingestion tooling (dev log)"
 *
 * Why this exists: the sidebar orders entries by `sidebar.order` (a negative
 * date int) but DISPLAYS `sidebar.label`. Without the date prefix the sidebar
 * reads as an undated wall of titles — you can't tell when anything shipped.
 * Several early logs (streaming-refactor, phase-5-scope, logging-infra,
 * query-state) drifted undated; this guard stops that recurring.
 *
 * Usage:
 *   bun run check:log-labels        Check every zz-log/*.mdx
 *
 * Or via the pre-commit / CI gate alongside check:mdx + check:fixtures-drift.
 *
 * Pass: label starts with the filename's `MM-DD · `.
 * Fail: missing sidebar.label, or label without the matching date prefix.
 */

import { readFile, readdir } from 'node:fs/promises';
import { resolve, join, relative, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const repoRoot = resolve(__dirname, '..');
const zzLogDir = resolve(repoRoot, 'docs/src/content/docs/agent-context/zz-log');

const isTTY = process.stdout.isTTY;
const c = {
  reset: isTTY ? '\x1b[0m' : '',
  dim: isTTY ? '\x1b[2m' : '',
  red: isTTY ? '\x1b[31m' : '',
  green: isTTY ? '\x1b[32m' : '',
  yellow: isTTY ? '\x1b[33m' : '',
  cyan: isTTY ? '\x1b[36m' : '',
  bold: isTTY ? '\x1b[1m' : '',
};

// Filename must be date-prefixed: YYYY-MM-DD-...
const FILENAME_DATE = /^(\d{4})-(\d{2})-(\d{2})-/;

/** Pull the first `---`-fenced frontmatter block from an .mdx file. */
function extractFrontmatter(content) {
  const m = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  return m ? m[1] : null;
}

/**
 * Find the `sidebar.label` value. zz-log frontmatter nests it under
 * `sidebar:` and it's the only `label:` key in these files, so a plain
 * multiline scan is sufficient (and avoids a YAML dependency).
 */
function extractSidebarLabel(frontmatter) {
  if (!frontmatter) return null;
  const m = frontmatter.match(/^\s*label:\s*(.+?)\s*$/m);
  if (!m) return null;
  return m[1].replace(/^["']|["']$/g, '').trim();
}

async function main() {
  let files;
  try {
    // `index.mdx` is the section landing page, not a dated log entry — skip it.
    files = (await readdir(zzLogDir)).filter((f) => f.endsWith('.mdx') && f !== 'index.mdx');
  } catch (err) {
    console.error(`  ${c.red}Error reading ${zzLogDir}: ${err.message}${c.reset}`);
    process.exit(1);
  }

  console.log(
    `\n  ${c.bold}${c.cyan}zz-log label check${c.reset} ${c.dim}— ${files.length} file${files.length === 1 ? '' : 's'}${c.reset}\n`
  );

  let passed = 0;
  const errors = [];

  for (const name of files) {
    const dateMatch = name.match(FILENAME_DATE);
    if (!dateMatch) {
      errors.push({ file: name, msg: `filename is not date-prefixed (YYYY-MM-DD-…)` });
      process.stdout.write(`${c.red}×${c.reset}`);
      continue;
    }
    const [, , mm, dd] = dateMatch;
    const expectedPrefix = `${mm}-${dd} · `;

    const content = await readFile(join(zzLogDir, name), 'utf8');
    const label = extractSidebarLabel(extractFrontmatter(content));

    if (label === null) {
      errors.push({ file: name, msg: `no sidebar.label — add: label: "${expectedPrefix}<Title>"` });
      process.stdout.write(`${c.red}×${c.reset}`);
    } else if (!label.startsWith(expectedPrefix)) {
      errors.push({
        file: name,
        msg: `label "${label}" must start with "${expectedPrefix}" (date from filename)`,
      });
      process.stdout.write(`${c.red}×${c.reset}`);
    } else {
      passed++;
      process.stdout.write(`${c.green}·${c.reset}`);
    }
  }

  console.log(`\n`);

  if (errors.length > 0) {
    console.log(`  ${c.bold}${c.red}Errors:${c.reset}\n`);
    for (const e of errors) {
      console.log(`  ${c.red}×${c.reset} ${c.bold}${e.file}${c.reset}`);
      console.log(`      ${e.msg}\n`);
    }
  }

  const passLabel = `${c.green}✓ ${passed} passed${c.reset}`;
  const failLabel = errors.length > 0 ? `   ${c.red}× ${errors.length} failed${c.reset}` : '';
  console.log(`  ${passLabel}${failLabel}\n`);

  process.exit(errors.length > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error(`\n  ${c.red}Fatal:${c.reset} ${err.message}\n`);
  process.exit(1);
});
