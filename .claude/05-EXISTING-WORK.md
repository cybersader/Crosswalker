# Existing Work & Prior Research

> Consolidation of all prior thinking, code, and documentation on this project.
> Frameworker = Crosswalker (same project, naming evolved)

---

## Naming History

- **Obsidian Frameworker** - original name, focuses on "frameworks"
- **Crosswalker** - current name, emphasizes cross-framework mapping
- Same project, same vision

---

## Core Problem Statement (From Your Notes)

> "I essentially want to store data about a relationship between two files and there's no advanced link syntax."

Traditional markdown links only store destination. Need: **metadata on edges**.

---

## The Three Approaches Considered

### 1. Intermediate Edge Metadata Files
- Create hidden folders (`.edges_framework_here`)
- Store connection metadata in separate files
- Hash-mapped linkage between notes
- **Pro**: Works with plain markdown (GFM compatible)
- **Con**: Two-hop queries, complex indexing

### 2. Structured Data in Link Syntax
- Develop custom syntax for JSON in links
- **Con**: No existing parser, would need custom rendering

### 3. Dataview Inline Tag Workaround ✅ CHOSEN
- Use dot notation with inline tags
- Append JSON after the link
- Regex parsing extracts structure
- **Pro**: Works with existing Dataview, queryable
- **Con**: Dataview dependency (now moving away from)

---

## The Chosen Syntax

### Basic Pattern
```
framework_here.relationship_type:: [[Target]] {"key": "value"}
```

### Examples
```markdown
# 1) Default for JSON-based links (sets default reviewer for all links)
framework_here.reviewer:: "Person_1"

# 2) Boolean flag (implicit true)
framework_here.applies_to:: [[ID 12]]

# 3) Full JSON metadata
framework_here.applies_to:: [[ID 13]] {"sufficient": true, "control": true}

# 4) Markdown link style
framework_here.applies_to:: [ID 12](ID%2012.md) {"sufficient": true}
```

### Wrapping Styles (for hiding in preview)
- No wrapping: `framework_here.applies_to:: [[ID 12]]`
- Square brackets: `[framework_here.applies_to:: [[ID 12]]]`
- Parentheses: `(framework_here.applies_to:: [[ID 12]])`

---

## Priority Structure (Metadata Resolution)

When same relationship defined multiple places:

1. **Inline tag + link + explicit JSON** (highest)
2. **Inline tag + link + implied boolean**
3. **Inline tag (child dotKey) + link + JSON**
4. **Inline tag (parent dotKey) + link + JSON**
5. **Inline tag without link + value** (defaults)
6. **YAML frontmatter**
7. **Folder-level / inherited metadata** (lowest)

---

## The Regex Parser

```regex
^(?:\[|\()?(?<dotKey>framework_here(?:\.\w+)*)::\s*(?:\[\[(?<wikilink>[^|\]]+)\]\]|\[(?<mdText>[^\]]+?)\]\((?<mdLink>[^)]+?)\)|(?<plainLink>[^"\[\]\(\)\s{}]+))?\s*(?:(?<json>\{[^}]*\})|"(?<quotedValue>[^"]+)")?(?=\]|\)|$)
```

**Captured groups**:
- `dotKey`: The relationship type (e.g., `framework_here.applies_to`)
- `wikilink`: WikiLink target
- `mdText` + `mdLink`: Markdown link parts
- `plainLink`: Plain text value
- `json`: JSON object
- `quotedValue`: Quoted string

---

## Levels of Querying

### 1. Leaf-Level
- Query at specific framework node
- "What links TO this control?"
- Display inbound edges with metadata

### 2. Folder-Level (Higher)
- Aggregate all links for a folder/subtree
- Roll up evidence across a control family
- Summarize compliance status

### 3. Global
- Vault-wide search for framework references
- Gap analysis across entire framework
- Cross-framework coverage

---

## Python Tool Structure

From `framework_to_obsidian.py`:

```
1. Imports & Global Setup
2. Helper Functions
   - print_df_info() - debug
   - match_value() - flexible matching (exact/array/regex)
   - build_full_path_components() - path splitting
   - sanitize_column_name()
   - hierarchical_ffill() - grouped forward-fill
3. Core Engine Stubs
   - Taxonomy builder
   - Linker
4. Main Orchestration
   - Load each framework from Excel/CSV
   - Clean & transform
   - Merge crosswalk sheets
   - Deduplicate
5. Taxonomy Generation Loop
6. Linking Loop
7. Summary/Logging
```

### Key Data Structures

**FrameworkConfig**:
- `name`: Framework identifier
- `dataframe`: The core data
- `hierarchy_columns`: Columns defining folder structure
- `frontmatter_fields`: What goes in YAML
- `tag_fields`: What becomes tags
- Path-naming lambdas

**LinkConfig**:
- `source_framework` / `target_framework`
- `match_column`: Column to match on
- `match_mode`: exact / array-contains / regex
- `injection_point`: at_source / at_target / both

---

## Frameworks Currently Handled

1. **CRI (Cyber Risk Institute) Profile v2.0**
   - Structure + Diagnostic Tags + Mappings
   - Custom tag aggregation (`#cri/tag_name`)

2. **NIST 800-53 Rev. 5**
   - Controls + Assessment Procedures
   - Regex normalization for merge keys

3. **MITRE ATT&CK**
   - Techniques from enterprise-attack

4. **MITRE ENGAGE**
   - Goals → Approaches → Activities
   - Multi-level hierarchy merging

5. **MITRE D3FEND**
   - Hierarchical forward-fill for technique levels

6. **NIST CSF v2.0**
   - Core structure

7. **CIS Controls v8**
   - Controls + Safeguards

---

## Key Insights from Research

### What Existing Plugins CAN'T Do

> "The issue with the below plugins is that none of them can actually give the ability to attach data to relationships/edges/links between files"

Evaluated and found lacking:
- **Breadcrumbs V4**: No structured data on edges, only key:value per edge
- **Juggl**: Visualization only, no edge metadata
- **Excalibrain**: Same limitation
- **Graph Link Types**: Only turns inline tags into edges
- **Semantic Canvas**: Display only
- **Supercharged Links**: CSS styling, not data

### What We're Building That's New
- **Edge metadata**: Structured JSON attached to links
- **Typed relationships**: `applies_to`, `implements`, `evidence_for`
- **Priority resolution**: When metadata conflicts
- **Aggregation**: Roll up edges at folder level

---

## Forum Research Links

From your notes, key discussions:
- https://forum.obsidian.md/t/add-support-for-link-types/6994 (extensive thread on typed links)
- https://forum.obsidian.md/t/graph-link-types/74710
- https://forum.obsidian.md/t/graph-query-language-api/1542

---

## Key Design Decisions Already Made

1. ✅ Use inline Dataview syntax (dot notation + JSON)
2. ✅ Framework as folder hierarchy
3. ✅ Config-driven Python for import
4. ✅ Priority structure for metadata resolution
5. ✅ Support both WikiLinks and Markdown links
6. ❌ NOT implementing framework-as-tags (too complex for search)

---

## Open Questions from Prior Work

From your notes:
- "How to keep links future-proofed if framework changes?"
- "Tables to edit links in bulk from queried place?"
- "Scalability problems with inline parsing"
- "Enable schemas like OSCAL out-of-the-box?"

---

## Source Files (Local)

Main documentation:
- `cyberbase/📁 01 - Projects/Obsidian Frameworker/Obsidian Frameworker.md`
- `cyberbase/📁 01 - Projects/Obsidian Frameworker/About Frameworker/About Frameworker.md`
- `cyberbase/📁 01 - Projects/Obsidian Frameworker/Framework Crosswalker - TLDR/`
- `cyberbase/📁 01 - Projects/Obsidian Frameworker/Framework Crosswalker - GPT Intro/`

Diagrams:
- `frameworker_diagram.svg`
- `frameworker_linking.svg`

Example vault:
- `cybersader-vault-starters/starters/obsidian-advanced-linking-vault-template/`

---

*Last Updated: 2025-12-05*
