# Transformation UI Design

> Making powerful transformations accessible without complex syntax.
> Inspired by jsonaut's handling modes.

---

## Core Insight from jsonaut

jsonaut handles data shape transformations with clear modes:

| Dimension | Modes | What it does |
|-----------|-------|--------------|
| **Array handling** | stringify, horizontal, explode | How arrays become output |
| **Object handling** | recurse, stringify | How nested objects flatten |
| **Long string** | truncate, horizontal, explode | How oversized values shrink |
| **Key naming** | separator, sanitize, brackets | How keys are constructed |

**For Crosswalker**, we need similar clarity for: **Column → Frontmatter** transformation

---

## The Transformation Dimensions

### 1. Key Naming (Column → Frontmatter Key)

**How does the column name become a frontmatter key?**

| Mode | Example Input | Output Key | When to use |
|------|---------------|------------|-------------|
| **as-is** | `Control ID` | `Control ID` | Keep original |
| **lowercase** | `Control ID` | `control id` | Simple lowercase |
| **snake_case** | `Control ID` | `control_id` | Standard YAML style |
| **camelCase** | `Control ID` | `controlId` | JS-style |
| **kebab-case** | `Control ID` | `control-id` | URL-friendly |
| **custom** | `Control ID` | `ctrl_id` | User specifies |
| **nested** | `control.id` | `control:\n  id:` | Dot → YAML nesting |

**UI Approach**:
```
┌─────────────────────────────────────────────────────────┐
│ Key Naming                                              │
│                                                         │
│ Default style: [snake_case ▼]                          │
│                                                         │
│ Per-column override:                                    │
│ ┌─────────────────┬────────────────────┐               │
│ │ Column          │ Frontmatter Key    │               │
│ ├─────────────────┼────────────────────┤               │
│ │ Control ID      │ [control_id    ]   │ ← editable   │
│ │ Control Name    │ [control_name  ]   │               │
│ │ Related Items   │ [related.items ]   │ ← dot = nest │
│ └─────────────────┴────────────────────┘               │
│                                                         │
│ [Auto-generate all] [Reset to column names]            │
└─────────────────────────────────────────────────────────┘
```

---

### 2. Value Type (What type in YAML?)

**What data type should this value be in frontmatter?**

| Mode | Input | Output | When to use |
|------|-------|--------|-------------|
| **auto** | `"123"` | `123` or `"123"` | Detect type |
| **string** | `123` | `"123"` | Force string |
| **number** | `"123"` | `123` | Force number |
| **boolean** | `"yes"` | `true` | Force boolean |
| **date** | `"2024-01-15"` | `2024-01-15` | Parse date |
| **array** | `"a, b, c"` | `[a, b, c]` | Split to array |
| **tags** | `"security, auth"` | `[security, auth]` | As Obsidian tags |
| **links** | `"AC-1, AC-2"` | `["[[AC-1]]", "[[AC-2]]"]` | As WikiLinks |

**UI Approach**:
```
┌─────────────────────────────────────────────────────────┐
│ Value Types                                             │
│                                                         │
│ ┌─────────────────┬──────────┬─────────────────────┐   │
│ │ Column          │ Type     │ Options             │   │
│ ├─────────────────┼──────────┼─────────────────────┤   │
│ │ Control ID      │ [string▼]│                     │   │
│ │ Control Name    │ [string▼]│                     │   │
│ │ Priority        │ [number▼]│                     │   │
│ │ Is Required     │ [bool  ▼]│ true: "Yes,Y,1"    │   │
│ │ Related Items   │ [array ▼]│ split: ","         │   │
│ │ Tags            │ [tags  ▼]│ prefix: "#"        │   │
│ │ Crosswalks      │ [links ▼]│ target: NIST-800   │   │
│ └─────────────────┴──────────┴─────────────────────┘   │
│                                                         │
│ [Auto-detect types from sample]                         │
└─────────────────────────────────────────────────────────┘
```

---

### 3. Array Handling (When source has multiple values)

**When a cell contains multiple values, how to handle?**

| Mode | Input | Output | When to use |
|------|-------|--------|-------------|
| **as_array** | `"a, b, c"` | `[a, b, c]` | Keep as YAML array |
| **stringify** | `"a, b, c"` | `"a, b, c"` | Keep as string |
| **first** | `"a, b, c"` | `a` | Take first only |
| **last** | `"a, b, c"` | `c` | Take last only |
| **join** | `["a","b"]` | `"a; b"` | Join with delimiter |
| **explode** | `"a, b"` | (creates 2 notes) | One note per value |

**UI Approach**:
```
┌─────────────────────────────────────────────────────────┐
│ Multi-Value Handling                                    │
│                                                         │
│ When a column contains multiple values (detected by     │
│ delimiter), how should they appear in frontmatter?      │
│                                                         │
│ Default: [Keep as array ▼]                             │
│ Delimiter: [, ▼] (comma, semicolon, pipe, newline)     │
│                                                         │
│ Per-column:                                             │
│ ┌─────────────────┬─────────────┬──────────────────┐   │
│ │ Column          │ Multi-value │ Preview          │   │
│ ├─────────────────┼─────────────┼──────────────────┤   │
│ │ Related Items   │ [array    ▼]│ [AC-1, AC-2]    │   │
│ │ Tags            │ [array    ▼]│ [sec, auth]     │   │
│ │ Notes           │ [stringify▼]│ "note1; note2"  │   │
│ └─────────────────┴─────────────┴──────────────────┘   │
└─────────────────────────────────────────────────────────┘
```

---

### 4. Nesting Strategy (Flat vs. Structured YAML)

**How deeply nested should the frontmatter be?**

| Mode | Description | Example |
|------|-------------|---------|
| **flat** | All keys at root level | `control_id: AC-2` |
| **dot_to_nest** | Dots in key → nesting | `control.id` → `control:\n  id:` |
| **group_by_prefix** | Group by prefix | `nist_*` → `nist:\n  *:` |
| **explicit** | User defines structure | Manual nesting rules |

**UI Approach**:
```
┌─────────────────────────────────────────────────────────┐
│ Frontmatter Structure                                   │
│                                                         │
│ Output style: [Flat ▼]                                 │
│                                                         │
│ ○ Flat - all keys at root                              │
│   control_id: AC-2                                      │
│   control_name: Account Management                      │
│                                                         │
│ ○ Dot notation creates nesting                         │
│   control:                                              │
│     id: AC-2                                            │
│     name: Account Management                            │
│                                                         │
│ ○ Group by prefix                                      │
│   Prefix: [control_ ▼] becomes:                        │
│   control:                                              │
│     id: AC-2                                            │
│     name: Account Management                            │
│                                                         │
│ ○ Custom structure (advanced)                          │
│   [Define groupings...]                                 │
└─────────────────────────────────────────────────────────┘
```

---

### 5. Empty/Missing Value Handling

**What to do when a cell is empty?**

| Mode | Input | Output | When to use |
|------|-------|--------|-------------|
| **omit** | `""` | (key not present) | Skip empty fields |
| **empty_string** | `""` | `key: ""` | Keep as empty string |
| **null** | `""` | `key: null` | Explicit null |
| **default** | `""` | `key: "N/A"` | Use default value |

**UI Approach**:
```
┌─────────────────────────────────────────────────────────┐
│ Empty Value Handling                                    │
│                                                         │
│ When a cell is empty:                                   │
│ ○ Omit the field entirely (recommended)                │
│ ○ Include as empty string                              │
│ ○ Include as null                                      │
│ ○ Use default value: [________]                        │
│                                                         │
│ Per-column defaults:                                    │
│ ┌─────────────────┬─────────────────────────────────┐  │
│ │ Column          │ If empty, use                   │  │
│ ├─────────────────┼─────────────────────────────────┤  │
│ │ Priority        │ [1]                             │  │
│ │ Status          │ [draft]                         │  │
│ │ Reviewer        │ [unassigned]                    │  │
│ └─────────────────┴─────────────────────────────────┘  │
└─────────────────────────────────────────────────────────┘
```

---

## Complete UI Flow

### Step: Column Configuration

After file selection, user sees ALL columns with smart defaults:

```
┌─────────────────────────────────────────────────────────────────────────┐
│ Configure Columns                                            Step 2 of 4│
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│ Source: NIST-800-53.xlsx / Sheet: Controls / 847 rows                  │
│                                                                         │
│ ┌─────────────────────────────────────────────────────────────────────┐│
│ │ Column            │ Use As        │ Output Key      │ Type   │ More ││
│ ├───────────────────┼───────────────┼─────────────────┼────────┼──────┤│
│ │ Control Family    │ [Hierarchy ▼] │ level 1         │        │  ⚙️  ││
│ │ Control ID        │ [Hierarchy ▼] │ level 2         │        │  ⚙️  ││
│ │ Control Name      │ [Frontmatter▼]│ [control_name ] │ string │  ⚙️  ││
│ │ Control Text      │ [Body       ▼]│ ## Description  │ text   │  ⚙️  ││
│ │ Discussion        │ [Body       ▼]│ ## Discussion   │ text   │  ⚙️  ││
│ │ Related Controls  │ [Links      ▼]│ [related      ] │ links  │  ⚙️  ││
│ │ Assessment Proc   │ [Frontmatter▼]│ [assessment   ] │ string │  ⚙️  ││
│ │ Priority          │ [Ignore     ▼]│                 │        │  ⚙️  ││
│ └───────────────────┴───────────────┴─────────────────┴────────┴──────┘│
│                                                                         │
│ ⚙️ = Click for advanced options (transforms, defaults, etc.)           │
│                                                                         │
│ Presets: [Auto-detect] [NIST 800-53] [CIS Controls] [Custom...]        │
│                                                                         │
│                                      [← Back]  [Preview →]  [Generate] │
└─────────────────────────────────────────────────────────────────────────┘
```

### Advanced Options Modal (⚙️ click)

```
┌─────────────────────────────────────────────────────────────────────────┐
│ Advanced Options: Control Name                                      [X] │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│ Sample values from data:                                                │
│ • "Account Management"                                                  │
│ • "Access Enforcement"                                                  │
│ • "Information Flow Enforcement"                                        │
│                                                                         │
│ ─────────────────────────────────────────────────────────────────────── │
│                                                                         │
│ OUTPUT KEY                                                              │
│ Key name: [control_name        ]                                        │
│ □ Use dot notation for nesting (e.g., control.name)                    │
│                                                                         │
│ VALUE TYPE                                                              │
│ Type: [String ▼]                                                       │
│                                                                         │
│ TRANSFORMS (applied in order)                                           │
│ ┌─────────────────────────────────────────────────────────────────────┐│
│ │ 1. [Trim whitespace     ▼] [×]                                      ││
│ │ 2. [                    ▼] [×]                                      ││
│ │ [+ Add transform]                                                    ││
│ └─────────────────────────────────────────────────────────────────────┘│
│                                                                         │
│ EMPTY VALUES                                                            │
│ If empty: [Omit field ▼]                                               │
│ Default value: [________________]                                       │
│                                                                         │
│ PREVIEW                                                                 │
│ ┌─────────────────────────────────────────────────────────────────────┐│
│ │ control_name: "Account Management"                                   ││
│ └─────────────────────────────────────────────────────────────────────┘│
│                                                                         │
│                                              [Cancel]  [Apply]          │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Transform Library (Dropdown Options)

When user clicks "[+ Add transform]", they see categorized options:

```
┌─────────────────────────────────────────┐
│ Text                                    │
│   Trim whitespace                       │
│   Lowercase                             │
│   Uppercase                             │
│   Title Case                            │
│   Replace text...                       │
│   Extract with regex...                 │
│   Prefix with...                        │
│   Suffix with...                        │
├─────────────────────────────────────────┤
│ Arrays                                  │
│   Split by delimiter...                 │
│   Join with delimiter...                │
│   Take first value                      │
│   Take last value                       │
│   Remove duplicates                     │
│   Filter matching...                    │
├─────────────────────────────────────────┤
│ Format                                  │
│   Format as tags (#prefix)              │
│   Format as WikiLinks                   │
│   Format as date...                     │
│   Format as number                      │
├─────────────────────────────────────────┤
│ Conditional                             │
│   If empty, use default...              │
│   If matches pattern, then...           │
│   Map values (lookup table)...          │
└─────────────────────────────────────────┘
```

---

## Presets: Smart Defaults

For common frameworks, provide presets that configure everything:

```typescript
const NIST_800_53_PRESET: Partial<CrosswalkerConfig> = {
  mapping: {
    hierarchy: [
      { column: "Control Family", level: 1 },
      { column: "Control Identifier", level: 2 }
    ],
    frontmatter: [
      { column: "Control Identifier", key: "control_id" },
      { column: "Control Name", key: "control_name" },
      { column: "Related Controls", key: "related_controls", format: "array" }
    ],
    links: [
      { column: "Related Controls", type: "wikilink", location: "frontmatter" }
    ],
    body: [
      { column: "Control Text", heading: "## Control Text" },
      { column: "Discussion", heading: "## Discussion" }
    ],
    filename: { template: "${Control Identifier}" }
  },
  transforms: {
    "Control Identifier": [{ type: "trim" }, { type: "uppercase" }],
    "Related Controls": [{ type: "split", params: { delimiter: "," } }]
  }
};
```

User clicks "NIST 800-53" preset → all fields pre-configured → they can still customize.

---

## Key UI Principles

1. **Show, don't tell**: Live preview of transformations
2. **Smart defaults**: Auto-detect types, suggest mappings
3. **Progressive disclosure**: Simple view first, ⚙️ for advanced
4. **Presets for common cases**: One click for NIST, CIS, etc.
5. **Everything overridable**: Defaults are starting points, not constraints
6. **Visual feedback**: See output change as you configure

---

## Config Export

After configuring, user can export for reuse:

```
[Export Config] → saves as crosswalker-nist-800-53.json

Next time:
[Import Config] → loads all settings → [Generate]
```

---

*Last Updated: 2025-12-05*
