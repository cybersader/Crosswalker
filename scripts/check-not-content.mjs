#!/usr/bin/env node
/**
 * "not-content" guard — cures the recurring "leftmost card looks different" bug.
 *
 * Starlight's prose CSS adds a top margin to every non-first child inside
 * `.sl-markdown-content` (`:not(:first-child)`). In a custom HTML flex/grid
 * illustration that offsets the 2nd+ cards, so the FIRST card sits higher than
 * the rest — the bug that "keeps coming back like a disease." The fix is to wrap
 * the custom HTML in `class="not-content"` (Starlight's escape hatch).
 *
 * This flags any docs `.mdx` that uses a custom inline `display:flex` / `grid`
 * layout but never uses `not-content` — the uncured pattern. (A file that has at
 * least one `not-content` is assumed cured; nested flex inside it is fine.)
 *
 * Usage:  bun run check:not-content
 */

import { readFile, readdir } from 'node:fs/promises';
import { resolve, join, relative, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const repoRoot = resolve(__dirname, '..');
const docsContentDir = resolve(repoRoot, 'docs/src/content/docs');

const isTTY = process.stdout.isTTY;
const c = {
  reset: isTTY ? '\x1b[0m' : '',
  dim: isTTY ? '\x1b[2m' : '',
  red: isTTY ? '\x1b[31m' : '',
  green: isTTY ? '\x1b[32m' : '',
  cyan: isTTY ? '\x1b[36m' : '',
  bold: isTTY ? '\x1b[1m' : '',
};

// The bug pattern: an INLINE-style <div> flex/grid layout (a card row). NOT
// matched: CSS in <style> blocks, object styles on SVGs, or fenced code examples
// (those don't produce the "leftmost card offset" issue / are stripped below).
const LAYOUT = /<div[^>]*\sstyle="[^"]*display:\s*(flex|grid)/;
const CURE = /not-content/; // class="not-content" anywhere in the file
/** Drop fenced + inline code so `<div style="display:flex">` shown as an EXAMPLE
 *  in a code block isn't mistaken for a real layout. */
const stripCode = (s) => s.replace(/```[\s\S]*?```/g, '').replace(/`[^`]*`/g, '');

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
      if (['node_modules', '.git', 'dist'].includes(entry.name)) continue;
      await walk(full, out);
    } else if (entry.isFile() && (extname(entry.name) === '.mdx' || extname(entry.name) === '.md')) {
      out.push(full);
    }
  }
  return out;
}

async function main() {
  const files = await walk(docsContentDir);
  console.log(`\n  ${c.bold}${c.cyan}not-content guard${c.reset} ${c.dim}— ${files.length} files${c.reset}\n`);

  let passed = 0;
  const errors = [];

  for (const file of files) {
    const content = await readFile(file, 'utf8');
    if (LAYOUT.test(stripCode(content)) && !CURE.test(content)) {
      errors.push(relative(repoRoot, file));
      process.stdout.write(`${c.red}×${c.reset}`);
    } else {
      passed++;
      process.stdout.write(`${c.green}·${c.reset}`);
    }
  }

  console.log('\n');
  if (errors.length > 0) {
    console.log(`  ${c.bold}${c.red}Custom flex/grid layout without a "not-content" wrapper:${c.reset}\n`);
    for (const f of errors) {
      console.log(`  ${c.red}×${c.reset} ${c.bold}${f}${c.reset}`);
      console.log(`      ${c.dim}wrap the illustration's outer <div> in class="not-content"${c.reset}\n`);
    }
  }

  const failLabel = errors.length > 0 ? `   ${c.red}× ${errors.length} uncured${c.reset}` : '';
  console.log(`  ${c.green}✓ ${passed} ok${c.reset}${failLabel}\n`);
  process.exit(errors.length > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error(`\n  ${c.red}Fatal:${c.reset} ${err.message}\n`);
  process.exit(1);
});
