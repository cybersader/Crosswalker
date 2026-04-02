# Prior Art & Related Plugins

> Plugins and projects that overlap with or inform Crosswalker.
> Understanding what exists helps us avoid reinventing and find integration points.

---

## Breadcrumbs

**Repo**: https://github.com/SkepticMystic/breadcrumbs
**Stats**: https://www.obsidianstats.com/plugins/breadcrumbs

### What It Does
- Adds **typed links** to Obsidian's graph
- Define hierarchical relationships (parent/child/sibling)
- Custom relationship types ("supports", "refutes", "leads to")
- Frontmatter-based edge definition: `up: [[Parent]]`
- Multiple views: Trail, Matrix, Grid, Juggl integration

### How It Works
- Builds its own graph representation on top of Obsidian
- Parses frontmatter for relationship declarations
- Renders breadcrumb trails at top of notes
- Matrix view shows hierarchy overview

### Current State (as of 2025)
- Last release: v3.6.11 (~2 years ago)
- V4 was in development: https://github.com/SkepticMystic/breadcrumbs/blob/master/V4.md
- Appears stalled/maintenance-mode
- Still functional but not actively developed

### Lessons for Crosswalker
| What They Did | Our Approach |
|---------------|--------------|
| Built custom graph engine | Use Obsidian's native graph, add metadata |
| Frontmatter for relationships | Inline syntax + frontmatter (flexible) |
| Custom views (Trail, Matrix) | Integrate with Obsidian Bases instead |
| Typed links | Yes, but simpler implementation |
| Hierarchy-focused | Ontology-focused (more general) |

### Key Insight
Breadcrumbs proves typed links work in Obsidian. But they built a lot of infrastructure. We can achieve similar outcomes with lighter-weight conventions that leverage newer tools (Obsidian Bases, Properties).

---

## Juggl

**Site**: https://juggl.io/
**Stats**: https://www.obsidianstats.com/plugins/juggl

### What It Does
- Advanced graph visualization for Obsidian
- Supports styled links from Breadcrumbs
- Custom graph layouts and filtering
- Code block embeds for local graphs

### Relevance
- Potential visualization layer for typed links
- Already integrates with Breadcrumbs patterns
- Could display Crosswalker relationships

---

## Dataview

**Repo**: https://github.com/blacksmithgu/obsidian-dataview
**Docs**: https://blacksmithgu.github.io/obsidian-dataview/

### What It Does
- Query language for Obsidian notes
- SQL-like syntax for frontmatter/inline fields
- DataviewJS for complex queries
- Tables, lists, task views

### Our Relationship
- **NOT a dependency** (per user decision)
- Can provide example queries for users who have it
- Patterns inform our inline field syntax

---

## Datacore

**Status**: Newer, active development
**Relationship to Dataview**: Spiritual successor, different architecture

### Relevance
- Could be integration point for complex queries
- Not priority, but architecture should be compatible

---

## Obsidian Bases (Core Plugin)

**Type**: First-party Obsidian plugin
**Status**: New (2024-2025)

### What It Does
- Database-like views of notes
- Table interface with filtering/sorting
- Based on note properties
- CSV import being requested by community

### Our Relationship
- **PRIMARY integration target**
- Import workflow should output Bases-compatible data
- Properties/frontmatter alignment critical
- Long-term Obsidian support expected

### Community Requests (relevant)
- CSV/JSON import into Bases: https://forum.obsidian.md/t/bases-bulk-import-notes-from-external-files-using-the-most-used-data-formats-json-csv-xml/104834
- Data source from CSV/JSON: https://forum.obsidian.md/t/bases-data-source-from-csv-or-json-instead-of-note-properties/103622

---

## Obsidian Importer

**Type**: First-party Obsidian plugin

### What It Does
- Import from various sources (Notion, Evernote, etc.)
- CSV import capability
- Creates notes from external data

### Relevance
- Could be foundation for framework import
- Understand their patterns for data → notes

---

## CISO Assistant

**Repo**: https://github.com/intuitem/ciso-assistant-community
**Type**: Full GRC platform (not Obsidian)

### What It Does
- Open source GRC tool
- Multiple framework support (NIST, ISO, etc.)
- Framework versioning and crosswalks
- Compliance tracking

### Lessons for Framework Versioning
From their approach:
- **Simultaneous versions**: Support old + new (e.g., ISO 27001:2013 AND 2022)
- **Library-based**: Frameworks as YAML files, modular
- **Mapping tools**: `prepare_mapping_v2.py` creates crosswalk Excel files
- **Decoupling**: Separate control implementation from compliance tracking

### Key Pattern
> "Control implementation from compliance tracking" separation allows reusing assessments across framework versions.

This informs how we should structure framework data for resilience.

---

## Other Relevant Plugins

| Plugin | Relevance |
|--------|-----------|
| Metadata Menu | Property/frontmatter management |
| Supercharged Links | Link styling based on metadata |
| Folder Notes | Folders as notes (taxonomy pattern) |
| QuickAdd | Macros for note creation |
| Templater | Template-driven note generation |

---

## Synthesis: What We Learn

1. **Typed links are possible** (Breadcrumbs proved it)
2. **Building graph engines is heavy** (avoid if possible)
3. **Frontmatter is standard** for metadata
4. **Obsidian Bases is the future** for tabular views
5. **Framework versioning needs explicit strategy** (CISO Assistant pattern)
6. **Community wants CSV/JSON import** into Bases

---

*Last Updated: 2025-12-05*
