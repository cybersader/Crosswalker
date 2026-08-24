import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const seedDir = path.join(scriptDir, 'seed-vault');

async function walk(dir) {
  const files = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...await walk(full));
    else if (entry.isFile() && entry.name.endsWith('.md')) files.push(full);
  }
  return files;
}

function frontmatterOf(content) {
  if (!content.startsWith('---\n')) return null;
  const end = content.indexOf('\n---', 4);
  return end === -1 ? null : content.slice(4, end);
}

function scalarValue(raw) {
  const value = raw.trim();
  if (value.startsWith('"') && value.endsWith('"')) return JSON.parse(value);
  if (value.startsWith("'") && value.endsWith("'")) {
    return value.slice(1, -1).replaceAll("''", "'");
  }
  return value;
}

const markdownFiles = await walk(seedDir);
const claims = new Map();

for (const file of markdownFiles) {
  const frontmatter = frontmatterOf(await readFile(file, 'utf8'));
  if (frontmatter === null) continue;
  const match = frontmatter.match(/^curie:\s*(.+?)\s*$/m);
  if (!match) continue;
  const curie = scalarValue(match[1]);
  if (!curie) throw new Error(`Empty top-level curie in ${path.relative(seedDir, file)}`);
  const paths = claims.get(curie) ?? [];
  paths.push(path.relative(seedDir, file));
  claims.set(curie, paths);
}

const duplicates = [...claims.entries()].filter(([, files]) => files.length > 1);
if (duplicates.length > 0) {
  console.error(`Duplicate CURIE claims found in ${seedDir}:`);
  for (const [curie, files] of duplicates) {
    console.error(`  ${curie}: ${files.join(', ')}`);
  }
  process.exitCode = 1;
} else {
  console.log(`Seed CURIE scan: ${claims.size} claims across ${markdownFiles.length} Markdown files; 0 duplicates.`);
}
