# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Crosswalker is an Obsidian plugin for importing structured ontologies (frameworks, taxonomies, any hierarchical data) into Obsidian with folder structures, typed links, and metadata. Primary use cases include compliance frameworks (NIST, CIS, MITRE) but designed for any domain.

**GitHub**: https://github.com/cybersader/Crosswalker

## Build Commands

```bash
# Install dependencies
npm install

# Development mode (watch mode, outputs to test-vault)
npm run dev

# Production build (type-check + bundle)
npm run build

# Run linter (required for community plugin submission)
npm run lint

# Fix lint issues automatically
npm run lint:fix

# Run tests
npm test

# Run tests in watch mode
npm test:watch
```

## Testing Workflow

The build outputs directly to `test-vault/.obsidian/plugins/crosswalker/` (configured in `esbuild.config.mjs`). To test:

1. Run `npm run dev` (watch mode)
2. Open `test-vault/` in Obsidian
3. Enable the Crosswalker plugin in Settings > Community Plugins
4. Test via command palette: "Crosswalker: Import structured data"

## Architecture

```
src/
├── main.ts                    # Plugin entry point, registers commands
├── settings/
│   ├── settings-data.ts       # Settings interface + DEFAULT_SETTINGS
│   └── settings-tab.ts        # Settings UI (PluginSettingTab)
├── import/
│   ├── import-wizard.ts       # Multi-step import modal (4 steps)
│   └── parsers/
│       └── csv-parser.ts      # PapaParse-based CSV parsing with streaming
├── generation/
│   └── generation-engine.ts   # Creates folders and notes with _crosswalker metadata
├── config/
│   ├── config-manager.ts      # Save/load/match import configurations
│   └── config-browser-modal.ts # Browse/select/delete saved configs
├── types/
│   └── config.ts              # TypeScript interfaces for all config types
└── utils/
    └── debug.ts               # Debug logging to crosswalker-debug.log
```

### Key Components

**Import Wizard** (`import-wizard.ts`): 4-step modal workflow
- Step 1: Select file (CSV/XLSX/JSON)
- Step 2: Configure columns (hierarchy, frontmatter, links, body)
- Step 3: Preview output structure
- Step 4: Generate notes

**CSV Parser** (`csv-parser.ts`): Uses PapaParse with streaming for large files (>5MB). Key exports:
- `parseCSVFile(file, options)` - Parse File object
- `parseCSV(content, options)` - Parse string content
- `analyzeColumns(data)` - Detect column types
- `shouldUseStreaming(file)` - Check if streaming recommended

**Config Manager** (`config-manager.ts`): Smart config matching
- `createFingerprint()` - Generate fingerprint from parsed data
- `findMatchingConfigs()` - Score and rank saved configs
- `exportConfig()` / `importConfig()` - JSON import/export

**Settings** (`settings-data.ts`): Comprehensive settings for:
- Output paths and naming styles
- Array/empty value handling
- Link syntax presets
- Config matching thresholds
- Wizard behavior toggles
- Debug logging

### Data Flow

```
File (CSV/XLSX/JSON)
    ↓
Parser (PapaParse/xlsx)
    ↓
ParsedData { columns, rows, rowCount }
    ↓
Column Analysis (type detection, samples)
    ↓
User Configuration (wizard steps 2-3)
    ↓
CrosswalkerConfig (full import config)
    ↓
Generation Engine (creates folders + notes)
```

## Linting Requirements

Uses `eslint-plugin-obsidianmd` for community plugin submission. Key rules:

- **Sentence case**: All UI text must use sentence case (capitalize first letter only)
- **No manual HTML headings**: Use `Setting.setHeading()` not `createEl('h3')`
- **No problematic headings**: Don't include plugin name in settings headings

Use `// eslint-disable-next-line obsidianmd/ui/sentence-case` for intentional exceptions (e.g., code examples).

## Type System

Core types in `src/types/config.ts`:

- `CrosswalkerConfig` - Full import configuration
- `ParsedData` - Output from file parsers
- `ColumnInfo` - Column analysis results
- `SavedConfig` - Persisted configuration with fingerprint
- `GeneratedNote` - Output note structure

Settings types in `src/settings/settings-data.ts`:

- `CrosswalkerSettings` - Plugin settings interface
- `KeyNamingStyle`, `ArrayHandling`, `EmptyHandling`, etc.

## Current State

**Implemented (MVP Complete!)**:
- Plugin scaffold with settings
- Import wizard UI (all 4 steps fully functional)
- CSV parsing with streaming for large files
- Column type detection and analysis
- Config save/load/match/browse system
- Generation engine with `_crosswalker` metadata
- Real folder tree and sample note preview (Step 3)
- Debug logging

**TODO (Future Enhancements)**:
- XLSX parser (xlsx package installed but not integrated)
- JSON parser
- Cross-framework linking
- Config export/import for sharing
- OSCAL export

## Extended Documentation

For detailed project knowledge, architecture decisions, and roadmap, see `.claude/` folder:
- `00-INDEX.md` - Navigation and reading order
- `01-PROBLEM.md` - Core problem definition
- `10-VISION-SHORT.md` - MVP definition
- `41-QUESTIONS-RESOLVED.md` - Key decisions made

Also see `PROJECT_BRIEF.md` for full project specification.
