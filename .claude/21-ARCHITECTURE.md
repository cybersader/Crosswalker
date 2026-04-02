# Crosswalker Architecture

> Core components, data flow, and mental model.

---

## Mental Model (The Big Picture)

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           USER'S DATA                                   │
│                                                                         │
│  ┌─────────────┐     ┌─────────────┐     ┌─────────────┐              │
│  │   CSV       │     │   XLSX      │     │   JSON      │              │
│  │ Framework   │     │ Framework   │     │ Framework   │              │
│  │   Data      │     │   Data      │     │   Data      │              │
│  └──────┬──────┘     └──────┬──────┘     └──────┬──────┘              │
│         │                   │                   │                      │
│         └───────────────────┼───────────────────┘                      │
│                             ▼                                          │
│  ┌──────────────────────────────────────────────────────────────────┐ │
│  │                    CROSSWALKER PLUGIN                             │ │
│  │  ┌────────────────────────────────────────────────────────────┐  │ │
│  │  │                   1. IMPORT ENGINE                          │  │ │
│  │  │  • Parse files (CSV, XLSX, JSON)                           │  │ │
│  │  │  • Wizard UI (map columns → structure)                     │  │ │
│  │  │  • Transform data → Obsidian notes                         │  │ │
│  │  └────────────────────────────────────────────────────────────┘  │ │
│  │                             │                                     │ │
│  │                             ▼                                     │ │
│  │  ┌────────────────────────────────────────────────────────────┐  │ │
│  │  │                   2. GENERATION ENGINE                      │  │ │
│  │  │  • Create folder hierarchy                                 │  │ │
│  │  │  • Generate markdown files                                 │  │ │
│  │  │  • Build YAML frontmatter (properties)                     │  │ │
│  │  │  • Create WikiLinks (crosswalks)                           │  │ │
│  │  └────────────────────────────────────────────────────────────┘  │ │
│  │                             │                                     │ │
│  │                             ▼                                     │ │
│  │  ┌────────────────────────────────────────────────────────────┐  │ │
│  │  │               3. LINK METADATA SYSTEM (Phase 2)             │  │ │
│  │  │  • Typed link syntax (crosswalker.type:: [[Target]] {})    │  │ │
│  │  │  • Link insertion UI                                       │  │ │
│  │  │  • Syntax validation                                       │  │ │
│  │  └────────────────────────────────────────────────────────────┘  │ │
│  └──────────────────────────────────────────────────────────────────┘ │
│                             │                                          │
│                             ▼                                          │
│  ┌──────────────────────────────────────────────────────────────────┐ │
│  │                     OBSIDIAN VAULT                                │ │
│  │                                                                   │ │
│  │  Frameworks/                                                      │ │
│  │  ├── NIST-800-53/                                                │ │
│  │  │   ├── AC - Access Control/                                    │ │
│  │  │   │   ├── AC-1.md  (frontmatter + links)                     │ │
│  │  │   │   ├── AC-2.md                                            │ │
│  │  │   │   └── ...                                                │ │
│  │  │   └── AU - Audit/                                            │ │
│  │  │       └── ...                                                │ │
│  │  └── CIS-Controls-v8/                                           │ │
│  │      └── ...                                                     │ │
│  └──────────────────────────────────────────────────────────────────┘ │
│                             │                                          │
│                             ▼                                          │
│  ┌──────────────────────────────────────────────────────────────────┐ │
│  │                    QUERY TOOLS (External)                         │ │
│  │  • Obsidian Bases (recommended)                                  │ │
│  │  • Dataview (optional)                                           │ │
│  │  • Native search                                                 │ │
│  │  • Graph view                                                    │ │
│  └──────────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Core Components

### 1. Import Engine

**Purpose**: Transform external structured data into Obsidian-compatible configuration.

```
┌─────────────────────────────────────────────────────────────────┐
│                        IMPORT ENGINE                             │
│                                                                  │
│  ┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐  │
│  │  File    │───▶│  Parser  │───▶│  Mapper  │───▶│  Config  │  │
│  │  Picker  │    │          │    │  UI      │    │  Builder │  │
│  └──────────┘    └──────────┘    └──────────┘    └──────────┘  │
│                                                                  │
│  Responsibilities:                                               │
│  • Accept file input (drag-drop, file picker)                   │
│  • Parse CSV/XLSX/JSON into rows + columns                      │
│  • Present mapping UI (columns → hierarchy, frontmatter, links) │
│  • Build ImportConfig object for Generation Engine              │
└─────────────────────────────────────────────────────────────────┘
```

**Key Interfaces**:
```typescript
interface ParsedData {
  columns: string[];
  rows: Record<string, any>[];
  sheetName?: string;  // For XLSX
}

interface ColumnMapping {
  column: string;
  target: 'hierarchy' | 'frontmatter' | 'link' | 'ignore';
  hierarchyLevel?: number;  // If hierarchy
  frontmatterKey?: string;  // If frontmatter
  linkTarget?: string;      // If link (framework name)
}

interface ImportConfig {
  sourceFile: string;
  outputPath: string;
  columnMappings: ColumnMapping[];
  fileNameColumn: string;
  dedupeColumn?: string;
}
```

---

### 2. Generation Engine

**Purpose**: Create folder structure and markdown files from ImportConfig.

```
┌─────────────────────────────────────────────────────────────────┐
│                      GENERATION ENGINE                           │
│                                                                  │
│  ┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐  │
│  │  Config  │───▶│  Folder  │───▶│  File    │───▶│  Link    │  │
│  │  Reader  │    │  Builder │    │  Writer  │    │  Injector│  │
│  └──────────┘    └──────────┘    └──────────┘    └──────────┘  │
│                                                                  │
│  Responsibilities:                                               │
│  • Read ImportConfig                                            │
│  • Create folder hierarchy from hierarchy columns               │
│  • Generate markdown with YAML frontmatter                      │
│  • Create WikiLinks for crosswalk columns                       │
│  • Handle duplicates and conflicts                              │
└─────────────────────────────────────────────────────────────────┘
```

**Key Interfaces**:
```typescript
interface GeneratedNote {
  path: string;           // Full path in vault
  fileName: string;       // Just the filename
  frontmatter: Record<string, any>;
  content: string;        // Body content
  links: WikiLink[];      // Links to other notes
}

interface WikiLink {
  target: string;         // Target note path or name
  alias?: string;         // Display text
  metadata?: Record<string, any>;  // For typed links (Phase 2)
}

interface GenerationResult {
  created: string[];      // Paths created
  skipped: string[];      // Paths skipped (duplicates)
  errors: GenerationError[];
}
```

---

### 3. Link Metadata System (Phase 2)

**Purpose**: Enable typed links with JSON metadata from evidence notes to framework nodes.

```
┌─────────────────────────────────────────────────────────────────┐
│                    LINK METADATA SYSTEM                          │
│                                                                  │
│  ┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐  │
│  │  Syntax  │───▶│  Parser  │───▶│  Link    │───▶│  Insert  │  │
│  │  Config  │    │  (Regex) │    │  Builder │    │  Modal   │  │
│  └──────────┘    └──────────┘    └──────────┘    └──────────┘  │
│                                                                  │
│  Responsibilities:                                               │
│  • Parse existing typed links in vault                          │
│  • Provide link insertion UI (search + metadata fields)         │
│  • Generate properly formatted link syntax                      │
│  • Validate link syntax                                         │
└─────────────────────────────────────────────────────────────────┘
```

**Link Syntax**:
```markdown
crosswalker.implements:: [[AC-2]] {"status": "complete", "reviewer": "Alice"}
```

---

## Data Flow

### Import Flow (MVP)

```
1. User: "Crosswalker: Import Framework"
              │
              ▼
2. File Picker Modal
   - Select CSV/XLSX/JSON
   - Select sheet (if XLSX)
              │
              ▼
3. Column Preview
   - Show columns + sample data
   - Auto-detect types (optional)
              │
              ▼
4. Mapping UI
   - Drag columns to:
     • Hierarchy levels (folders)
     • Frontmatter fields
     • Link targets (crosswalks)
     • Ignore
              │
              ▼
5. Output Configuration
   - Choose output folder
   - Set filename pattern
   - Deduplication options
              │
              ▼
6. Preview
   - Show folder tree preview
   - Show sample note preview
              │
              ▼
7. Generate
   - Create folders
   - Write files
   - Report results
              │
              ▼
8. Done
   - Summary: "Created 847 notes in Frameworks/NIST-800-53/"
```

---

## Source File Structure

```
crosswalker-obsidian-plugin/
├── .claude/                      # Knowledge base (existing)
│
├── src/
│   ├── main.ts                   # Plugin entry point
│   │
│   ├── import/                   # Import Engine
│   │   ├── parsers/
│   │   │   ├── csv-parser.ts
│   │   │   ├── xlsx-parser.ts
│   │   │   └── json-parser.ts
│   │   ├── import-wizard.ts      # Wizard modal
│   │   └── column-mapper.ts      # Mapping logic
│   │
│   ├── generation/               # Generation Engine
│   │   ├── folder-builder.ts
│   │   ├── note-generator.ts
│   │   ├── frontmatter-builder.ts
│   │   └── link-builder.ts
│   │
│   ├── linking/                  # Link Metadata (Phase 2)
│   │   ├── syntax-parser.ts
│   │   ├── link-inserter.ts
│   │   └── link-modal.ts
│   │
│   ├── settings/                 # Settings
│   │   ├── settings-tab.ts
│   │   └── settings-data.ts
│   │
│   ├── ui/                       # Shared UI components
│   │   ├── modals/
│   │   └── components/
│   │
│   └── utils/                    # Utilities
│       ├── sanitize.ts
│       ├── path-utils.ts
│       └── yaml-utils.ts
│
├── tests/
│   ├── unit/
│   │   ├── parsers.test.ts
│   │   ├── generation.test.ts
│   │   └── linking.test.ts
│   └── fixtures/                 # Test data
│       ├── sample-nist.csv
│       └── sample-cri.xlsx
│
├── manifest.json
├── package.json
├── tsconfig.json
├── esbuild.config.mjs
├── README.md
└── PROJECT_BRIEF.md
```

---

## Key Design Decisions

### Decision 1: Parser Library for XLSX

**Options**:
- **SheetJS (xlsx)**: Most popular, full-featured, ~1MB
- **ExcelJS**: Good API, streaming support, ~500KB
- **xlsx-parse-json**: Minimal, ~50KB

**Recommendation**: SheetJS - widest format support, well-documented

**Decision Needed**: Confirm SheetJS or prefer smaller alternative?

---

### Decision 2: Wizard UI Approach

**Options**:
- **Multi-step modal**: Step 1 → Step 2 → ... → Generate
- **Single-page with sections**: All config visible, scroll down
- **Side panel + preview**: Config on left, preview on right

**Recommendation**: Multi-step modal (cleaner, guided experience)

**Decision Needed**: Confirm multi-step or prefer different approach?

---

### Decision 3: Frontmatter Format

**Options**:
- **Flat**: All fields at root level
  ```yaml
  control_id: AC-2
  control_name: Account Management
  family: Access Control
  ```
- **Nested**: Group related fields
  ```yaml
  control:
    id: AC-2
    name: Account Management
  family: Access Control
  ```
- **Namespaced**: Prefix with framework
  ```yaml
  nist_control_id: AC-2
  nist_control_name: Account Management
  ```

**Recommendation**: Flat (simpler, better Bases compatibility)

**Decision Needed**: Confirm flat or prefer nested/namespaced?

---

### Decision 4: Link Format for Crosswalks

**Options**:
- **WikiLink in frontmatter array**:
  ```yaml
  related_controls:
    - "[[AC-1]]"
    - "[[AC-3]]"
  ```
- **WikiLink in body section**:
  ```markdown
  ## Related Controls
  - [[AC-1]]
  - [[AC-3]]
  ```
- **Both**: Frontmatter for querying, body for reading

**Recommendation**: WikiLink in frontmatter (queryable by Bases)

**Decision Needed**: Confirm frontmatter, body, or both?

---

### Decision 5: Filename Generation

**Options**:
- **ID only**: `AC-2.md`
- **ID + Name**: `AC-2 - Account Management.md`
- **Hierarchy in name**: `AC - Access Control - AC-2.md`
- **User configurable**: Let user choose pattern

**Recommendation**: User configurable with sensible default (ID + Name)

**Decision Needed**: Confirm configurable or prefer fixed pattern?

---

## Dependencies

### Required
- `obsidian` - Obsidian API types
- `xlsx` (SheetJS) - XLSX parsing

### Development
- `typescript`
- `esbuild`
- `@types/node`

### Optional (Phase 2+)
- None identified yet

---

## Testing Strategy

### Unit Tests (Automated)
- CSV parsing
- XLSX parsing
- JSON parsing
- Frontmatter generation
- Path sanitization
- Link syntax parsing

### Integration Tests (Mocked Obsidian API)
- Folder creation
- File writing
- Duplicate handling

### Manual Tests (User)
- Wizard UI flow
- Modal interactions
- Preview rendering
- Large file handling (1000+ rows)

---

## Configuration System Architecture

The plugin uses a **multi-tier configuration system** that will expand over time:

### Current: Import Configs (`SavedConfig`)

```
savedConfigs: SavedConfig[]
├── fingerprint (for matching)
│   ├── columnNames
│   ├── samplePatterns
│   └── sourceType
└── config (applied on use)
    ├── mapping (hierarchy, frontmatter, links, body)
    ├── output (basePath, overwrite behavior)
    └── transforms (future)
```

### Future Config Types (Phase 2+)

```
CrosswalkerSettings
├── savedConfigs: SavedConfig[]          // Import configs (current)
├── linkSyntaxConfigs: LinkSyntaxConfig[] // Typed link presets
│   ├── namespace
│   ├── relationshipTypes
│   └── metadataSchema
├── queryConfigs: QueryConfig[]          // Saved queries/views (Phase 3)
│   ├── name
│   ├── type (gap-analysis, coverage, etc.)
│   └── parameters
├── exportConfigs: ExportConfig[]        // Report templates (Phase 3)
│   ├── format (PDF, CSV, etc.)
│   └── template
└── frameworkTemplates: FrameworkTemplate[] // Pre-built configs (Phase 4)
    ├── name (NIST 800-53, CIS v8, etc.)
    ├── importConfig
    └── linkSyntaxConfig
```

### Config Browser Evolution

The `ConfigBrowserModal` is designed to be **generic**. Future versions will:
1. Accept a `configType` parameter to filter/display different config types
2. Show configs relevant to the current context (e.g., link syntax configs in link insertion flow)
3. Support config "packages" that bundle related configs together

### Design Principle: User-Morphable

Every configurable aspect should:
1. Have sensible defaults
2. Be saveable/reusable
3. Be exportable/shareable
4. Support community templates

---

## Performance Considerations

### Large Imports
- **Chunked processing**: Don't block UI for 10,000 rows
- **Progress indicator**: Show "Processing row 500/10000..."
- **Memory management**: Stream large files, don't load all at once

### Vault Scanning (Phase 2)
- **Lazy indexing**: Don't scan on startup
- **Cache framework structure**: Remember folder locations
- **Incremental updates**: Only re-scan changed files

---

*Last Updated: 2025-12-05*
