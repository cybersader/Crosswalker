# Crosswalker Development Roadmap

> Phased plan from here to full vision.

---

## Overview

```
PHASE 0          PHASE 1           PHASE 2           PHASE 3           PHASE 4
Foundation  →    Import MVP   →    Link Metadata →   Query/Views  →    Ecosystem
(Weeks 1-2)      (Weeks 3-8)       (Weeks 9-14)      (Weeks 15-20)     (Ongoing)
```

---

## Phase 0: Foundation (Current → Week 2)

**Goal**: Set up everything needed to start building.

### Tasks
- [x] Consolidate existing research and documentation
- [x] Define scope and MVP
- [x] Create knowledge base structure
- [ ] Initialize Obsidian plugin project
- [ ] Set up TypeScript build pipeline
- [ ] Create basic plugin scaffold (main.ts, manifest.json)
- [ ] Set up development environment (hot reload)
- [ ] Create test vault with sample frameworks

### Deliverables
- Plugin project skeleton
- Development environment working
- Test vault ready

---

## Phase 1: Import MVP (Weeks 3-8)

**Goal**: Import a framework from CSV/XLSX → Obsidian folder structure with properties and links.

### Milestone 1.1: File Parsing (Week 3-4)
- [ ] Implement CSV parser
- [ ] Implement XLSX parser (using SheetJS or similar)
- [ ] Handle multiple sheets
- [ ] Column detection and type inference
- [ ] Preview raw data in modal

### Milestone 1.2: Mapping UI (Week 5-6)
- [x] Design wizard flow (step 1 → step N)
- [x] Step: Select source file
- [ ] Step: Select sheet (if XLSX)
- [ ] Step: Map columns to hierarchy (drag-drop or select)
- [ ] Step: Map columns to frontmatter fields
- [ ] Step: Map columns to link targets (crosswalks)
- [ ] Step: Configure output location
- [ ] Preview panel (folder tree + sample note)

### Milestone 1.2b: Import Configuration System
- [ ] **Save Configuration**: After successful import, prompt "Save this configuration?"
- [ ] **Smart Column Matching**: When loading a new file, detect if columns match a saved config
  - Fuzzy match on column names (case-insensitive, ignore whitespace, synonyms)
  - Suggest matching configs: "This looks like NIST 800-53 format. Use saved config?"
  - **Advanced Fuzzy Matching** (Phase 4 enhancement):
    - Match by column name similarity (Levenshtein distance, soundex)
    - Match by sample data patterns (e.g., "AC-1", "AC-2" → looks like control IDs)
    - Match by column count + order similarity
    - Match by data type distribution (50% numbers, 30% strings, etc.)
    - Confidence score: "85% match to 'NIST 800-53' config"
    - Learn from user corrections (if user picks different config, remember)
- [ ] **Configuration Storage**: Save configs to plugin settings with:
  - Name (user-provided or auto-generated from filename pattern)
  - Description
  - Column mappings (hierarchy, frontmatter, links)
  - Output path template
  - Created/modified timestamps
- [ ] **Configuration Selector**: Modal to browse/select saved configs
  - List view with name, description, last used
  - Preview of column mappings
  - Edit/Delete options
- [ ] **Import/Export Configs**:
  - Export config as JSON file (shareable)
  - Import config from JSON file
  - Enable community sharing of framework configs

### Milestone 1.3: Generation Engine (Week 7-8)
- [ ] Folder creation logic
- [ ] Filename sanitization
- [ ] Markdown file generation
- [ ] YAML frontmatter formatting
- [ ] WikiLink generation for crosswalks
- [ ] Handle duplicates (merge or error)
- [ ] Progress indicator
- [ ] Error reporting

### Success Criteria
- [ ] Import CRI Profile → ~500 notes
- [ ] Import NIST 800-53 → ~1000 notes
- [ ] Properties visible in Obsidian
- [ ] Links work (clickable, show in graph)

---

## Phase 2: Link Metadata (Weeks 9-14)

**Goal**: Enable typed links with metadata from evidence notes TO framework nodes.

### Milestone 2.1: Link Syntax Engine (Week 9-10)
- [ ] Define default syntax: `crosswalker.type:: [[Target]] {json}`
- [ ] Implement regex parser (port from Python research)
- [ ] Handle variations (WikiLink, MD link, wrappers)
- [ ] Syntax validation

### Milestone 2.2: Link Insertion UI (Week 11-12)
- [ ] "Insert Framework Link" command
- [ ] Search modal for framework nodes
- [ ] Fuzzy search across imported frameworks
- [ ] Relationship type selector
- [ ] Optional metadata fields
- [ ] Insert formatted syntax at cursor

### Milestone 2.3: Configuration (Week 13-14)
- [ ] Settings tab for link syntax preferences
- [ ] Preset selection (Simple, Standard, Full)
- [ ] Per-vault configuration
- [ ] Per-framework configuration (optional)
- [ ] Custom namespace support

### Success Criteria
- [ ] User can insert `crosswalker.implements:: [[AC-2]] {"status": "complete"}`
- [ ] Links parse correctly
- [ ] Autocomplete works for framework nodes
- [ ] Configuration persists

---

## Phase 3: Query & Aggregation (Weeks 15-20)

**Goal**: View aggregated links at framework nodes, enable reporting workflows.

### Milestone 3.1: Frontmatter Aggregation (Week 15-16)
- [ ] Scan vault for typed links
- [ ] Aggregate by target framework node
- [ ] Generate/update frontmatter on framework notes
- [ ] Fields: `inbound_links_count`, `evidence_coverage`, etc.

### Milestone 3.2: Built-in Views (Week 17-18)
- [ ] "Framework Overview" view (sidebar or modal)
- [ ] Show hierarchy with evidence counts
- [ ] Highlight gaps (no evidence)
- [ ] Click to navigate

### Milestone 3.3: Export & Integration (Week 19-20)
- [ ] Export framework + evidence to CSV
- [ ] Export to JSON
- [ ] Example Obsidian Bases views
- [ ] Example Dataview queries
- [ ] Documentation for custom queries

### Success Criteria
- [ ] Framework node shows "5 evidence notes link here"
- [ ] Gap analysis: "23 controls have no evidence"
- [ ] Export produces usable reports
- [ ] Obsidian Bases can display framework data

---

## Phase 4: Ecosystem (Ongoing)

**Goal**: Polish, expand, build community.

### Continuous Tasks
- [ ] Bug fixes and stability
- [ ] Performance optimization
- [ ] Community feedback integration
- [ ] Documentation improvements

### Framework Templates
- [ ] NIST 800-53 template (built-in)
- [ ] CIS Controls v8 template
- [ ] MITRE ATT&CK template
- [ ] CRI Profile template
- [ ] NIST CSF v2 template
- [ ] Community-contributed templates

### Advanced Features (Future)
- [ ] Framework update/migration tool
- [ ] Bi-directional sync with source files
- [ ] OSCAL import/export
- [ ] Multiple framework management UI
- [ ] Collaboration features

### Community
- [ ] Publish to Obsidian community plugins
- [ ] Create Discord/forum presence
- [ ] Write blog posts / tutorials
- [ ] Video walkthroughs

---

## Parallel Tracks

Some work can happen in parallel:

| Track | Focus |
|-------|-------|
| **Core** | Plugin architecture, import engine |
| **UI** | Wizard flow, modals, settings |
| **Data** | Parsers, generators, validation |
| **Docs** | User guide, API docs, examples |
| **Test** | Test vault, edge cases, regression |

---

## Risk Mitigation

| Risk | Mitigation |
|------|------------|
| Obsidian API changes | Follow plugin guidelines, test on beta |
| Large file performance | Chunked processing, progress indicators |
| Complex XLSX structures | Start with simple cases, expand |
| User config complexity | Good defaults, progressive disclosure |
| Scope creep | Stick to MVP, defer nice-to-haves |

---

## Dependencies

### External
- SheetJS (or similar) for XLSX parsing
- Obsidian API (native)

### Internal
- Python tool as reference (logic patterns)
- Existing test frameworks (CRI, NIST, etc.)

---

## Decision Points

At end of each phase, evaluate:
1. Is it working? Ship or fix?
2. What did we learn? Update roadmap?
3. What's the highest-value next step?
4. Any scope changes needed?

---

*Last Updated: 2025-12-05*
