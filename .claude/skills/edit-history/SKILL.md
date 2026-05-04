---
description: Parse and analyze Obsidian edit history from .edtz files (obsidian-edit-history plugin format). Use when working with edit history, comparing versions, viewing recent edits, or analyzing what changed in a file.
user_invocable: true
---

# Edit History Skill

Parse and analyze Obsidian edit history from the [obsidian-edit-history](https://github.com/antoniotejada/obsidian-edit-history) plugin.

## Trigger Phrases

- "show edit history for..."
- "what changed in..."
- "recent edits to..."
- "file history..."
- "compare versions of..."

## What This Skill Does

Reads `.edtz` files (ZIP archives containing edit diffs) and provides:

- Summary of edits over time
- Diff comparison between versions
- Restoration of historical content
- Pattern analysis (when files are typically edited)

## Files

- `edit-history.sh` — main bash script wrapping ZIP extraction + diff parsing
- `README.md` — usage examples

## Usage

```bash
# List all edits for a file
.claude/skills/edit-history/edit-history.sh list <file.md.edtz>

# Get a summary with N most recent edits
.claude/skills/edit-history/edit-history.sh summary <file.md.edtz> 5

# Find all .edtz files in a vault
.claude/skills/edit-history/edit-history.sh find <vault-path>
```

The `.edtz` format is a ZIP archive with timestamped patches. The script unpacks them, applies diffs in sequence, and reports what changed when.
