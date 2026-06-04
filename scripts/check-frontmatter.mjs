#!/usr/bin/env node
/**
 * Frontmatter YAML checker.
 *
 * Parses the `---`-fenced frontmatter of every .mdx under docs/ with the SAME
 * js-yaml Astro uses, catching the class of YAML errors that `check:mdx` misses
 * (@mdx-js strips frontmatter leniently; Astro's js-yaml is strict).
 *
 * The bug this exists for: an UNQUOTED description containing `: ` (colon-space)
 * — e.g. `description: ... (Excel: filter, sum)` — which js-yaml reads as a
 * nested mapping → "bad indentation of a mapping entry", breaking the build.
 * Fix: quote the value.
 *
 * Usage:  bun run check:frontmatter
 */

import { readFile, readdir } from 'node:fs/promises';
import { resolve, join, relative, extname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { existsSync } from 'node:fs';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const repoRoot = resolve(__dirname, '..');
const docsContentDir = resolve(repoRoot, 'docs/src/content/docs');

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

/** Load js-yaml from docs/node_modules (same one Astro/@astrojs/mdx uses). */
async function importYaml() {
  const candidates = [
    resolve(repoRoot, 'docs/node_modules/js-yaml/dist/js-yaml.mjs'),
    resolve(repoRoot, 'docs/node_modules/js-yaml/index.js'),
  ];
  for (const path of candidates) {
    if (existsSync(path)) return import(pathToFileURL(path).href);
  }
  try {
    return await import('js-yaml');
  } catch {
    console.error(
      `\n  ${c.red}Error:${c.reset} js-yaml not found. Run \`cd docs && bun install\` first.\n`,
    );
    process.exit(1);
  }
}

async function walk(dir, out = []) {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === '.git' || entry.name === 'dist') continue;
      await walk(full, out);
    } else if (entry.isFile() && (extname(entry.name) === '.mdx' || extname(entry.name) === '.md')) {
      out.push(full);
    }
  }
  return out;
}

async function main() {
  const yaml = await importYaml();
  const load = yaml.load ?? yaml.default?.load;
  const files = await walk(docsContentDir);

  console.log(
    `\n  ${c.bold}${c.cyan}Frontmatter check${c.reset} ${c.dim}— ${files.length} file${files.length === 1 ? '' : 's'}${c.reset}\n`,
  );

  let passed = 0;
  const errors = [];

  for (const file of files) {
    const content = await readFile(file, 'utf8');
    const m = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
    if (!m) {
      passed++;
      process.stdout.write(`${c.dim}·${c.reset}`);
      continue;
    }
    try {
      load(m[1]);
      passed++;
      process.stdout.write(`${c.green}·${c.reset}`);
    } catch (err) {
      errors.push({ file: relative(repoRoot, file), message: String(err.message).split('\n')[0] });
      process.stdout.write(`${c.red}×${c.reset}`);
    }
  }

  console.log('\n');
  if (errors.length > 0) {
    console.log(`  ${c.bold}${c.red}Errors:${c.reset}\n`);
    for (const e of errors) {
      console.log(`  ${c.red}×${c.reset} ${c.bold}${e.file}${c.reset}`);
      console.log(`      ${e.message}`);
      console.log(`      ${c.dim}tip: quote the value if it contains ": " (colon-space), e.g. description: "…"${c.reset}\n`);
    }
  }

  const failLabel = errors.length > 0 ? `   ${c.red}× ${errors.length} failed${c.reset}` : '';
  console.log(`  ${c.green}✓ ${passed} passed${c.reset}${failLabel}\n`);
  process.exit(errors.length > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error(`\n  ${c.red}Fatal:${c.reset} ${err.message}\n`);
  process.exit(1);
});
