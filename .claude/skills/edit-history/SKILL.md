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
1. Summary of recent edits with timestamps
2. Comparison between versions
3. Reconstruction of file state at any point in time
4. Change statistics (chars added/deleted)

## Prerequisites

- The `obsidian-edit-history` plugin must be installed in the vault
- Target file must have a corresponding `.edtz` file

## Quick Usage

```bash
# List all edits for a file
./edit-history.sh list my-note.md.edtz

# Get summary with last 5 edits
./edit-history.sh summary my-note.md.edtz 5

# Find all history files in a vault
./edit-history.sh find ./my-vault
```

## Usage Examples

### Show Recent Edits

```
User: "Show edit history for my-note.md"

Agent action:
1. Look for my-note.md.edtz in the same folder
2. Run: ./edit-history.sh summary my-note.md.edtz
3. Format output for user
```

### Compare Versions

```
User: "What changed in config.md since yesterday?"

Agent action:
1. Parse config.md.edtz
2. Find entries from yesterday and now
3. Compute diff and summarize changes
```

### Find All History Files

```
User: "What files have edit history in this vault?"

Agent action:
1. Run: ./edit-history.sh find ./vault-path
2. List all files with edit counts
```

## Technical Details

### .edtz File Format

```
my-note.md.edtz (ZIP archive)
├── lq5abc$    <- Full snapshot (has $ suffix)
├── lq5def     <- Diff patch (no $ suffix)
├── lq5ghi     <- Diff patch
└── lq5jkl$    <- Full snapshot
```

**Filename encoding:** Base-36 Unix epoch in seconds
- `lq5abc` → `parseInt('lq5abc', 36)` → epoch → Date

**Content:**
- Files ending in `$` contain full text
- Files without `$` contain diff-match-patch patches

### Script Commands

| Command | Description |
|---------|-------------|
| `list <file.edtz>` | List all edits with timestamps |
| `summary <file.edtz> [n]` | Show summary + last n edits (default 10) |
| `extract <file.edtz> <name>` | Extract specific entry content |
| `find <directory>` | Find all .edtz files recursively |

## Example Output

```markdown
# Edit History Summary: main.ts

- **Total edits:** 47
- **Snapshots:** 5
- **Diffs:** 42
- **First edit:** 2026-01-15 09:30:00
- **Last edit:** 2026-01-31 14:22:00

## Recent 5 Edits

| Timestamp | Type | Size |
|-----------|------|------|
| 2026-01-31 14:22:00 | diff | 234 bytes |
| 2026-01-31 12:15:00 | diff | 1,203 bytes |
| 2026-01-31 10:00:00 | snapshot | 15,432 bytes |
| 2026-01-30 16:45:00 | diff | 89 bytes |
| 2026-01-30 14:30:00 | diff | 567 bytes |
```

## Limitations

- Cannot parse if obsidian-edit-history plugin isn't installed
- Large history files may be slow to parse
- Corrupted diffs may fail to apply
- Not all edits captured (plugin has min interval setting)

## Related

- Plugin: https://github.com/antoniotejada/obsidian-edit-history
- Full parser template: `plugin_development/obsidian-plugin-dev-harness/06-Templates/edit-history-parser.ts.md`
- Research notes: `plugin_development/obsidian-plugin-dev-harness/07-Research/Edit-History-Integration.md`
