# Short-Term Vision (3-6 Months)

> What success looks like in the near term.

---

## The Goal

A working **Crosswalker Obsidian plugin** that can:
1. Import structured data (CSV/XLSX/JSON) into Obsidian as a hierarchy of folders + notes
2. Generate proper **frontmatter/properties** from source columns
3. Create **links between framework nodes** (crosswalks)
4. Output data in a format that feeds into Bases, Dataview, or any query tool

---

## MVP Definition

**Minimum Viable Product**: Framework Import with Properties + Links

### Must Have (MVP)
- [ ] Step-by-step import wizard
  - Select source file (CSV, XLSX, JSON)
  - Map columns to hierarchy levels (folders)
  - Map columns to frontmatter fields
  - Map columns to crosswalk links
  - Preview before generation
- [ ] Generate folder structure from hierarchy columns
- [ ] Generate markdown notes with:
  - YAML frontmatter (properties)
  - Links to other framework nodes (crosswalks)
- [ ] Handle at least one framework end-to-end (CRI or NIST 800-53)

### Nice to Have (Post-MVP)
- [ ] Smart column detection (auto-suggest mappings)
- [ ] Multiple frameworks in single session
- [ ] Config file import/export
- [ ] Link insertion command (add typed links from any note)

---

## User Story

> As a GRC professional, I want to import my compliance framework spreadsheet into Obsidian so that I can link my evidence notes to specific controls and query compliance status.

**Flow**:
1. Open Obsidian, run "Crosswalker: Import Framework"
2. Select `NIST-800-53-controls.xlsx`
3. Wizard shows columns, I map:
   - `Control Family` → folder level 1
   - `Control ID` → folder level 2 / filename
   - `Control Name`, `Description` → frontmatter
   - `Related Controls` → links to other notes
4. Preview shows folder structure + sample note
5. Click "Generate" → 1000+ notes created
6. Browse to `Frameworks/NIST-800-53/AC/AC-2.md`
7. See properties, see links to related controls
8. Use Obsidian Bases to query all controls

---

## Technical Milestones

### Milestone 1: Plugin Scaffold
- [ ] Initialize Obsidian plugin project (TypeScript)
- [ ] Basic settings tab
- [ ] Command registration
- [ ] File picker modal

### Milestone 2: File Parsing
- [ ] CSV parser (handle various delimiters)
- [ ] XLSX parser (handle multiple sheets)
- [ ] JSON parser (handle nested structures)
- [ ] Column detection and preview

### Milestone 3: Mapping UI
- [ ] Column → hierarchy level mapping
- [ ] Column → frontmatter field mapping
- [ ] Column → link target mapping
- [ ] Preview panel showing resulting structure

### Milestone 4: Generation Engine
- [ ] Folder creation logic
- [ ] Markdown file generation
- [ ] YAML frontmatter formatting
- [ ] Link generation (WikiLinks or MD links)
- [ ] Deduplication handling

### Milestone 5: Polish & Ship
- [ ] Error handling and validation
- [ ] Progress indication for large imports
- [ ] Documentation
- [ ] Publish to community plugins

---

## Success Criteria

- [ ] Can import CRI Profile spreadsheet → ~500 notes with proper structure
- [ ] Can import NIST 800-53 → ~1000 notes with crosswalk links
- [ ] Notes queryable via Obsidian Bases
- [ ] Generation completes in <30 seconds for 1000 notes
- [ ] Zero data loss (all columns preserved somewhere)

---

## What's NOT in Short-Term Scope

- Custom query language / Cypher emulation
- Graph visualization enhancements
- Bi-directional sync with source files
- Collaborative features
- Report generation

---

*Last Updated: 2025-12-05*
