# Crosswalker Transformation System

> A principled, config-driven approach to data transformation.
> Inspired by jsonaut's architecture.

---

## The Gap in Existing Tools

### What Obsidian Importer Does
- CSV → one note per row
- Basic field mapping
- No hierarchy understanding

### What JSON/CSV Importer (farling42) Does
- CSV/JSON → notes via Handlebars templates
- Custom helpers for transformations
- Path-based folder creation
- **But**: Template-driven, not config-driven; no hierarchy concept

### What Crosswalker Adds
- **Hierarchy mapping**: Columns → folder levels → nested structure
- **Crosswalk mapping**: Columns containing references → WikiLinks to other notes
- **Config-driven transformations**: JSON/YAML config, not templates
- **Preview & validate**: See structure before generating
- **Framework-aware**: Understands ontology patterns

---

## Design Philosophy (from jsonaut)

```
┌─────────────────────────────────────────────────────────────────┐
│                    SEPARATION OF CONCERNS                        │
│                                                                  │
│  ┌──────────────┐   ┌──────────────┐   ┌──────────────┐        │
│  │  FUNCTIONS   │   │   CONFIG     │   │  EXECUTION   │        │
│  │  (Logic)     │   │  (Rules)     │   │  (Runtime)   │        │
│  │              │   │              │   │              │        │
│  │  Transform   │   │  JSON/YAML   │   │  Wizard UI   │        │
│  │  functions   │   │  definitions │   │  or CLI      │        │
│  │  are         │   │  specify     │   │  runs the    │        │
│  │  reusable    │   │  what to do  │   │  pipeline    │        │
│  └──────────────┘   └──────────────┘   └──────────────┘        │
│         │                  │                  │                 │
│         └──────────────────┼──────────────────┘                 │
│                            ▼                                    │
│                   GENERATED OUTPUT                              │
│                   (Obsidian notes)                              │
└─────────────────────────────────────────────────────────────────┘
```

---

## Transformation Pipeline

```
┌─────────────────────────────────────────────────────────────────┐
│                    INPUT → OUTPUT PIPELINE                       │
│                                                                  │
│  ┌──────────┐                                                   │
│  │  Source  │  CSV, XLSX, JSON                                  │
│  │  File    │                                                   │
│  └────┬─────┘                                                   │
│       │                                                         │
│       ▼                                                         │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │ STAGE 1: PARSE                                            │  │
│  │ • Read file into rows/columns                             │  │
│  │ • Normalize column names                                  │  │
│  │ • Detect types (string, number, array, etc.)              │  │
│  └────┬─────────────────────────────────────────────────────┘  │
│       │                                                         │
│       ▼                                                         │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │ STAGE 2: TRANSFORM (per-column rules)                     │  │
│  │ • Apply column transformations                            │  │
│  │ • Clean/normalize values                                  │  │
│  │ • Split arrays, extract patterns                          │  │
│  └────┬─────────────────────────────────────────────────────┘  │
│       │                                                         │
│       ▼                                                         │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │ STAGE 3: MAP (structure rules)                            │  │
│  │ • Columns → hierarchy (folders)                           │  │
│  │ • Columns → frontmatter (properties)                      │  │
│  │ • Columns → links (crosswalks)                            │  │
│  │ • Columns → body content                                  │  │
│  └────┬─────────────────────────────────────────────────────┘  │
│       │                                                         │
│       ▼                                                         │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │ STAGE 4: GENERATE                                         │  │
│  │ • Build folder tree                                       │  │
│  │ • Create markdown files                                   │  │
│  │ • Format frontmatter                                      │  │
│  │ • Create links                                            │  │
│  └────┬─────────────────────────────────────────────────────┘  │
│       │                                                         │
│       ▼                                                         │
│  ┌──────────┐                                                   │
│  │  Output  │  Folder structure + Markdown files                │
│  │  Vault   │                                                   │
│  └──────────┘                                                   │
└─────────────────────────────────────────────────────────────────┘
```

---

## Configuration Schema

### Top-Level Config

```typescript
interface CrosswalkerConfig {
  // Metadata
  name: string;                    // Config name (e.g., "NIST 800-53 Import")
  version: string;                 // Config version

  // Source
  source: SourceConfig;

  // Transformations (per-column)
  transforms: Record<string, TransformRule[]>;

  // Mapping (structure)
  mapping: MappingConfig;

  // Output
  output: OutputConfig;
}
```

### Source Config

```typescript
interface SourceConfig {
  type: 'csv' | 'xlsx' | 'json';

  // For XLSX
  sheet?: string;                  // Sheet name or index
  headerRow?: number;              // Row containing headers (default: 1)

  // For JSON
  rootPath?: string;               // JSONPath to array (e.g., "data.controls")

  // Common
  encoding?: string;               // File encoding (default: utf-8)
  delimiter?: string;              // CSV delimiter (default: auto-detect)
}
```

### Transform Rules

```typescript
interface TransformRule {
  type: TransformType;
  params?: Record<string, any>;
}

type TransformType =
  // String operations
  | 'trim'                         // Remove whitespace
  | 'lowercase'                    // Convert to lowercase
  | 'uppercase'                    // Convert to uppercase
  | 'replace'                      // Replace pattern: {pattern, replacement}
  | 'regex_extract'                // Extract with regex: {pattern, group}
  | 'prefix'                       // Add prefix: {value}
  | 'suffix'                       // Add suffix: {value}
  | 'template'                     // String template: {template} with ${column} refs

  // Array operations
  | 'split'                        // Split to array: {delimiter}
  | 'join'                         // Join array: {delimiter}
  | 'unique'                       // Remove duplicates
  | 'filter'                       // Filter array: {pattern}

  // Type conversions
  | 'to_number'                    // Parse as number
  | 'to_boolean'                   // Parse as boolean
  | 'to_date'                      // Parse as date: {format}
  | 'to_tags'                      // Format as Obsidian tags: {prefix}

  // Conditional
  | 'if_empty'                     // Default value: {value}
  | 'if_matches'                   // Conditional: {pattern, then, else}

  // Custom
  | 'custom';                      // User-defined function: {function}
```

### Mapping Config

```typescript
interface MappingConfig {
  // Hierarchy (folders)
  hierarchy: HierarchyMapping[];

  // Frontmatter (properties)
  frontmatter: FrontmatterMapping[];

  // Links (crosswalks)
  links: LinkMapping[];

  // Body content
  body: BodyMapping[];

  // Filename
  filename: FilenameConfig;
}

interface HierarchyMapping {
  column: string;                  // Source column
  level: number;                   // Folder depth (1 = top level)
  transform?: TransformRule[];     // Optional per-mapping transforms
}

interface FrontmatterMapping {
  column: string;                  // Source column
  key: string;                     // Frontmatter key
  format?: 'string' | 'number' | 'boolean' | 'array' | 'date';
  transform?: TransformRule[];

  // Advanced
  nested?: string;                 // Dot notation for nesting: "control.id"
  omitIfEmpty?: boolean;           // Don't include if value is empty
}

interface LinkMapping {
  column: string;                  // Column containing link targets
  type: 'wikilink' | 'markdown';   // Link format
  location: 'frontmatter' | 'body' | 'both';
  frontmatterKey?: string;         // Key if in frontmatter
  bodySection?: string;            // Heading if in body
  transform?: TransformRule[];

  // For crosswalks
  targetFramework?: string;        // Name of target framework
  matchPattern?: string;           // Regex to extract target ID
}

interface BodyMapping {
  column: string;                  // Source column
  heading?: string;                // Put under this heading (e.g., "## Description")
  format?: 'text' | 'code' | 'quote' | 'list';
  transform?: TransformRule[];
}

interface FilenameConfig {
  template: string;                // Template: "${control_id} - ${control_name}"
  sanitize: boolean;               // Remove invalid characters
  maxLength?: number;              // Truncate if too long
  transform?: TransformRule[];
}
```

### Output Config

```typescript
interface OutputConfig {
  basePath: string;                // Output folder in vault
  createFolders: boolean;          // Create hierarchy folders
  overwrite: 'skip' | 'replace' | 'merge' | 'error';

  // Frontmatter formatting
  frontmatter: {
    style: 'flat' | 'nested';      // How to format YAML
    quoteStrings: boolean;         // Always quote string values
    arrayStyle: 'flow' | 'block';  // [a, b] vs - a\n- b
  };
}
```

---

## Example Config: NIST 800-53

```json
{
  "name": "NIST 800-53 Rev 5 Import",
  "version": "1.0",

  "source": {
    "type": "xlsx",
    "sheet": "Controls",
    "headerRow": 1
  },

  "transforms": {
    "Control Identifier": [
      {"type": "trim"},
      {"type": "uppercase"}
    ],
    "Related Controls": [
      {"type": "split", "params": {"delimiter": ","}}
    ]
  },

  "mapping": {
    "hierarchy": [
      {"column": "Control Family", "level": 1},
      {"column": "Control Identifier", "level": 2}
    ],

    "frontmatter": [
      {"column": "Control Identifier", "key": "control_id"},
      {"column": "Control Name", "key": "control_name"},
      {"column": "Control Text", "key": "description"},
      {"column": "Discussion", "key": "discussion", "omitIfEmpty": true}
    ],

    "links": [
      {
        "column": "Related Controls",
        "type": "wikilink",
        "location": "frontmatter",
        "frontmatterKey": "related_controls"
      }
    ],

    "body": [
      {"column": "Control Text", "heading": "## Control Text", "format": "text"},
      {"column": "Discussion", "heading": "## Discussion", "format": "text"}
    ],

    "filename": {
      "template": "${Control Identifier}",
      "sanitize": true
    }
  },

  "output": {
    "basePath": "Frameworks/NIST-800-53",
    "createFolders": true,
    "overwrite": "skip",
    "frontmatter": {
      "style": "flat",
      "quoteStrings": false,
      "arrayStyle": "flow"
    }
  }
}
```

---

## Wizard ↔ Config Relationship

The wizard is a **visual config builder**:

```
┌─────────────────────────────────────────────────────────────────┐
│                       WIZARD UI                                  │
│                                                                  │
│  Step 1: Source                                                  │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │ [Select File]  sample.xlsx                               │    │
│  │ Sheet: [Controls ▼]                                      │    │
│  └─────────────────────────────────────────────────────────┘    │
│                            │                                     │
│                            ▼ Generates:                          │
│                     source: { type: "xlsx", sheet: "Controls" }  │
│                                                                  │
│  Step 2: Transform & Map                                         │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │ Column: Control Identifier                               │    │
│  │ Type: [Hierarchy ▼]  Level: [1 ▼]                       │    │
│  │ Transforms: [+ Add]                                      │    │
│  │   [trim] [uppercase]                                     │    │
│  └─────────────────────────────────────────────────────────┘    │
│                            │                                     │
│                            ▼ Generates:                          │
│                     hierarchy: [{ column: "Control Identifier",  │
│                                   level: 1 }],                   │
│                     transforms: { "Control Identifier":          │
│                                   [{type: "trim"}, ...] }        │
│                                                                  │
│  Step 3: Preview                                                 │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │ Frameworks/NIST-800-53/                                  │    │
│  │ ├── AC - Access Control/                                 │    │
│  │ │   ├── AC-1.md                                         │    │
│  │ │   └── AC-2.md                                         │    │
│  │ └── AU - Audit/                                          │    │
│  │     └── ...                                              │    │
│  └─────────────────────────────────────────────────────────┘    │
│                                                                  │
│  [Export Config]  [Import Config]  [Generate]                    │
└─────────────────────────────────────────────────────────────────┘
```

**Key Features**:
1. **Wizard builds config visually**
2. **Config can be exported** (JSON/YAML) for reuse
3. **Config can be imported** (skip wizard)
4. **Advanced users can edit config directly**

---

## Built-in Transform Functions

### String Operations
| Function | Description | Params |
|----------|-------------|--------|
| `trim` | Remove whitespace | - |
| `lowercase` | Convert to lowercase | - |
| `uppercase` | Convert to uppercase | - |
| `replace` | Replace pattern | `{pattern, replacement, regex?: bool}` |
| `regex_extract` | Extract with regex | `{pattern, group?: number}` |
| `prefix` | Add prefix | `{value}` |
| `suffix` | Add suffix | `{value}` |
| `template` | String template | `{template}` with `${column}` refs |

### Array Operations
| Function | Description | Params |
|----------|-------------|--------|
| `split` | Split string to array | `{delimiter}` |
| `join` | Join array to string | `{delimiter}` |
| `unique` | Remove duplicates | - |
| `filter` | Keep matching items | `{pattern}` |
| `map` | Transform each item | `{transform: TransformRule}` |

### Type Conversions
| Function | Description | Params |
|----------|-------------|--------|
| `to_number` | Parse as number | - |
| `to_boolean` | Parse as boolean | `{truthy?: string[]}` |
| `to_date` | Parse date | `{format}` |
| `to_tags` | Format as #tags | `{prefix?, lowercase?: bool}` |
| `to_wikilinks` | Format as [[links]] | `{prefix?}` |

### Conditional
| Function | Description | Params |
|----------|-------------|--------|
| `if_empty` | Default if empty | `{value}` |
| `if_matches` | Conditional value | `{pattern, then, else}` |
| `coalesce` | First non-empty | `{columns: string[]}` |

---

## Extensibility: Custom Functions

For advanced users, allow custom JavaScript transforms:

```typescript
interface CustomTransform {
  type: 'custom';
  params: {
    // Inline function (simple cases)
    expression?: string;  // "value.split('-')[0]"

    // Or reference to user function file
    file?: string;        // "custom-transforms.js"
    function?: string;    // "extractControlFamily"
  };
}
```

**Example custom transform file** (`custom-transforms.js`):
```javascript
// User creates this file in their vault
module.exports = {
  extractControlFamily: (value, row, context) => {
    // Custom logic
    const match = value.match(/^([A-Z]+)-/);
    return match ? match[1] : value;
  },

  formatCRITags: (value, row, context) => {
    // CRI-specific tag formatting
    return value.split(' ')
      .filter(t => t.startsWith('#'))
      .map(t => `#cri/${t.slice(1)}`)
      .join(' ');
  }
};
```

---

## Decision Points

### D1: Config Format
- **JSON**: Familiar, easy to parse, no comments
- **YAML**: Human-readable, comments allowed
- **Both**: Support both, auto-detect

**Recommendation**: Support both, default to JSON in export

### D2: Where to Store Configs
- **In plugin settings**: Hidden, managed by plugin
- **In vault as files**: Visible, version-controllable, shareable
- **Both**: Settings for personal, files for sharing

**Recommendation**: Both - quick configs in settings, shareable configs as files

### D3: Custom Function Security
- **Sandboxed**: Limited API, no file access
- **Full access**: Trust user code
- **Opt-in**: Disabled by default, user enables

**Recommendation**: Opt-in with warning

---

## Implementation Priority

### Phase 1 (MVP)
- [ ] Basic transforms (trim, split, replace)
- [ ] Hierarchy mapping
- [ ] Frontmatter mapping
- [ ] Simple link mapping
- [ ] Wizard UI

### Phase 2
- [ ] All built-in transforms
- [ ] Config export/import
- [ ] Advanced link mapping
- [ ] Body content mapping

### Phase 3
- [ ] Custom functions
- [ ] Config presets for common frameworks
- [ ] Validation and error messages

---

*Last Updated: 2025-12-05*
