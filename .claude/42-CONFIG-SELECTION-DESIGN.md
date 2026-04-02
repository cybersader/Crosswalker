# Config Selection Design

> Design decisions for how saved configurations integrate with the import wizard.

**Created**: 2024-12-07
**Status**: In Progress
**Related**: `21-ARCHITECTURE.md`, `41-QUESTIONS-RESOLVED.md`

---

## Problem Statement

Users import similar data repeatedly (e.g., monthly NIST control updates, quarterly CIS benchmark exports). They shouldn't have to re-configure column mappings every time.

**Goals:**
1. Save import configurations for reuse
2. Auto-suggest matching configs when user loads a file
3. Allow manual config selection
4. Let users modify suggested configs (not locked in)
5. Support config sharing between users/teams

---

## Design Principle: Configs are Suggestions, Not Mandates

A saved config should **pre-fill** the wizard, not **lock** it. Users can always:
- Modify any pre-filled value
- Ignore suggestions entirely
- Use a config even if it doesn't perfectly match

This prevents lock-in and supports evolving data formats.

---

## User Flow

```
┌─────────────────────────────────────────────────────────────────────┐
│ STEP 1: Select File                                                  │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  [Select file...]  sample-nist-controls.csv                         │
│                                                                      │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │ 💡 This looks like "NIST 800-53 Sample Format" (92% match)  │    │
│  │                                                              │    │
│  │ [Use this config]  [Browse configs...]  [Start fresh]       │    │
│  └─────────────────────────────────────────────────────────────┘    │
│                                                                      │
│  Parsed: 12 rows, 5 columns                                         │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
                              │
          ┌───────────────────┼───────────────────┐
          ▼                   ▼                   ▼
   [Use this config]    [Browse configs]    [Start fresh]
          │                   │                   │
          │                   ▼                   │
          │         ConfigBrowserModal            │
          │         (mode: 'select')              │
          │                   │                   │
          ▼                   ▼                   ▼
┌─────────────────────────────────────────────────────────────────────┐
│ STEP 2: Configure Columns                                            │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  [Config applied: "NIST 800-53 Sample Format"]  [Clear config]      │
│                                                                      │
│  Column          │ Detected │ Use as      │ Output key              │
│  ─────────────────────────────────────────────────────────────────  │
│  Control Family  │ string   │ [Hierarchy▼]│ [control_family]        │
│  Control ID      │ string   │ [Hierarchy▼]│ [control_id]            │
│  Control Name    │ string   │ [Frontmatt▼]│ [control_name]          │
│  Description     │ string   │ [Body     ▼]│ [description]           │
│  Related Controls│ array    │ [Link     ▼]│ [related_controls]      │
│                                                                      │
│  ⚠️ Config expected "Assessment" column but file doesn't have it    │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Config Matching Logic

### Match Score Components

| Component | Weight | Description |
|-----------|--------|-------------|
| Exact column name match | 40% | Column names match exactly |
| Normalized column match | 15% | Match after lowercasing, removing special chars |
| Column count similarity | 10% | Same number of columns |
| Source type match | 5% | Same file type (CSV, XLSX, JSON) |
| Data pattern match | 15% | Sample data matches expected patterns |
| Filename pattern match | 10% | Filename matches saved pattern |
| Recency bonus | 5% | Recently used configs rank higher |

### Match Thresholds

- **>= 80%**: Strong match - show prominent suggestion
- **50-79%**: Partial match - show in suggestions list
- **< 50%**: Weak match - don't suggest automatically

User can configure `configMatchThreshold` in settings (default: 50).

---

## Handling Mismatches

### Scenario 1: Config has column that file doesn't

**Behavior**: Warning, not error
```
⚠️ Config expected "Assessment" column but file doesn't have it.
   Mappings for this column will be skipped.
```

User can either:
- Ignore (that mapping just won't apply)
- Map a different column to serve that purpose
- Edit the config

### Scenario 2: File has column that config doesn't mention

**Behavior**: Default to "Skip"
```
Column "Notes" not in config - defaulting to Skip.
```

User can manually assign it in Step 2.

### Scenario 3: Column name is similar but not exact

**Behavior**: Fuzzy match with confirmation
```
Config expects "Control ID" - matched to "control_id" in your file.
   [Accept] [Choose different column]
```

---

## Data Structures

### SavedConfig (updated)

```typescript
export interface SavedConfig {
  // Schema version for future migrations
  schemaVersion: number;  // Currently: 1

  // Metadata
  id: string;
  name: string;
  description?: string;
  createdAt: string;
  updatedAt: string;
  lastUsedAt?: string;

  // Fingerprint (for matching)
  fingerprint: ConfigFingerprint;

  // The actual config (partial - merged with defaults)
  config: Partial<CrosswalkerConfig>;
}
```

### ConfigFingerprint (updated)

```typescript
export interface ConfigFingerprint {
  // Column matching
  columnNames: string[];           // Exact names
  columnNamesNormalized: string[]; // For fuzzy matching
  columnCount: number;

  // Data patterns (optional, for smarter matching)
  samplePatterns?: {
    column: string;
    pattern: string;      // Regex
    examples: string[];
  }[];

  // Source hints
  sourceType?: 'csv' | 'xlsx' | 'json';
  fileNamePattern?: string;

  // Future: Column aliases for flexible matching
  // columnAliases?: Record<string, string[]>;
}
```

### ConfigApplicationResult

```typescript
interface ConfigApplicationResult {
  applied: boolean;
  config: SavedConfig;

  // What matched
  matchedColumns: string[];

  // What didn't match
  missingColumns: string[];      // Config expected, file doesn't have
  extraColumns: string[];        // File has, config doesn't mention
  fuzzyMatches: {                // Close but not exact
    configColumn: string;
    fileColumn: string;
    similarity: number;
  }[];

  // Warnings to show user
  warnings: string[];
}
```

---

## Schema Versioning Strategy

### Why Version?

Config schema will evolve. Old configs should still work.

### Migration Approach

```typescript
function migrateConfig(saved: SavedConfig): SavedConfig {
  let config = { ...saved };

  // v0 -> v1: Add schemaVersion field
  if (!config.schemaVersion) {
    config.schemaVersion = 1;
  }

  // v1 -> v2: (future example)
  // if (config.schemaVersion === 1) {
  //   config.config.output.frontmatter = config.config.output.frontmatter || {};
  //   config.schemaVersion = 2;
  // }

  return config;
}
```

### Current Schema Version: 1

Fields in v1:
- `schemaVersion`: number
- `id`: string
- `name`: string
- `description?`: string
- `createdAt`: string (ISO)
- `updatedAt`: string (ISO)
- `lastUsedAt?`: string (ISO)
- `fingerprint`: ConfigFingerprint
- `config`: Partial<CrosswalkerConfig>

---

## UI Components

### 1. Config Suggestion Banner (Step 1)

Shown after file is parsed, if matching config found.

```typescript
interface ConfigSuggestionProps {
  config: SavedConfig;
  matchScore: number;
  matchDetails: string[];
  onUse: () => void;
  onBrowse: () => void;
  onSkip: () => void;
}
```

### 2. Config Applied Indicator (Step 2)

Shows which config is applied, allows clearing.

```typescript
interface ConfigAppliedProps {
  config: SavedConfig | null;
  warnings: string[];
  onClear: () => void;
  onViewDetails: () => void;
}
```

### 3. Config Browser Modal (existing)

Already built. Has `mode: 'select'` for choosing a config.

---

## Implementation Plan

### Phase 1: Foundation (Complete ✅)
- [x] Add `schemaVersion` to types
- [x] Update sample configs with schemaVersion
- [x] Document design decisions (this file)
- [x] Add migration functions (`migrateConfig`, `migrateConfigs`)
- [x] Export `SAVED_CONFIG_SCHEMA_VERSION` constant

### Phase 2: Config Suggestion (Complete ✅)
- [x] Add matching logic to import wizard
- [x] Show suggestion banner after parse
- [x] Wire "Use this config" button
- [x] Show match score and details
- [x] Support multiple match suggestions
- [x] "Browse configs..." button opens ConfigBrowserModal
- [x] "Start fresh" option to dismiss suggestions

### Phase 3: Config Application (Complete ✅)
- [x] Apply config to wizard state
- [x] Show warnings for mismatches
- [x] Clear config button to reset
- [x] Update `lastUsedAt` when config is used

### Phase 4: Config Saving (Pending)
- [ ] Prompt to save after successful import
- [ ] Pre-fill fingerprint from parsed data
- [ ] Allow editing before save

### Phase 5: Step 2 Integration (Complete ✅)
- [x] Pre-fill column dropdown selections from config
- [x] Pre-fill output key inputs from config
- [x] Show which columns are config-driven vs manual (⚙️ icon + row highlight)
- [x] Config indicator banner with "Clear" button
- [x] `buildColumnMappingLookup()` function to extract mappings from config

---

## Open Questions

### Resolved

1. **Should configs be strict or flexible?**
   → Flexible. Configs pre-fill, users can edit.

2. **What if columns don't match exactly?**
   → Fuzzy match with warning. User confirms.

3. **Should we version configs?**
   → Yes. `schemaVersion: 1` starting now.

### Still Open

1. **Should configs support inheritance/layering?**
   → Defer. Current design is single config application.

2. **Should we support config "fragments" (just hierarchy, just frontmatter)?**
   → Defer. Full configs for now, can add later.

3. **How to handle config conflicts in team sharing?**
   → Defer. Export/import is simple merge for now.

---

## Future Considerations

### Config Packages
Bundle related configs (import + link syntax + queries) for a framework.

### Community Configs
Repository of pre-built configs for common frameworks (NIST, CIS, MITRE).

### Config Sync
Sync configs across devices/vaults (via plugin settings sync).

### Config Inheritance
Base config + overrides pattern for variations.

---

*Last Updated: 2024-12-07*
