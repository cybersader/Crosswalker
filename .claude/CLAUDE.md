# Claude Agent Instructions - Crosswalker

## Project Context

You are working on **Crosswalker** - an Obsidian plugin for importing structured ontologies (frameworks, taxonomies) and enabling typed links with metadata. While security frameworks (NIST, CIS, MITRE) are a primary use case, this is a **general ontology system** for any domain.

**GitHub Repository**: https://github.com/cybersader/Crosswalker

## `.claude/` Folder Structure

This folder contains project documentation for Claude Code agents:

```
.claude/
├── CLAUDE.md              # This file - main agent instructions (committed)
├── 00-INDEX.md            # Navigation and reading order (committed)
├── 01-PROBLEM.md          # Core problem definition (committed)
├── 02-ECOSYSTEM.md        # Related tools/ecosystem (committed)
├── ...                    # Other numbered docs (committed)
├── settings.local.json    # User-specific Claude Code settings (GITIGNORED)
```

**Commit Policy:**
- ✅ All `.md` files should be committed - they contain project knowledge
- ❌ `settings.local.json` is gitignored - contains user-specific paths/permissions
- If sharing a project, others can create their own `settings.local.json`

## Knowledge Base

**READ THE `.claude/` FOLDER** - Contains structured project knowledge:
- `00-INDEX.md` - Navigation and reading order
- `01-PROBLEM.md` - The core hierarchy vs. graph tension
- `05-EXISTING-WORK.md` - Prior research (Frameworker history)
- `41-QUESTIONS-RESOLVED.md` - Key decisions made
- `10-VISION-SHORT.md` - MVP definition
- `20-ROADMAP.md` - Development phases

Also see: `PROJECT_BRIEF.md` in parent directory.

## Key Decisions (Summary)

1. **Name**: Crosswalker (not Frameworker)
2. **Tech**: TypeScript/JS plugin primary, Python backup
3. **Query approach**: Output structured frontmatter (tool-agnostic)
4. **MVP**: Import wizard → folder structure + notes with properties + links
5. **No Dataview dependency**: Works with Bases, Dataview, or nothing
6. **User configurable**: Link syntax at multiple levels (presets to custom)
7. **Out of scope**: Custom query language, Cypher emulation, graph engine

## Your Role

As an AI agent:
1. **The Problem**: Filesystems are hierarchical; knowledge is graph-shaped. Need edge metadata on links.
2. **The Solution**: Import structured data → Obsidian notes with typed links carrying JSON metadata.
3. **The Philosophy**: Plaintext, no lock-in, tool-agnostic outputs, resilient to changes.

## Essential Documentation & Resources

### Obsidian Development Core

**Official Documentation:**
- [Obsidian Plugin API Reference](https://docs.obsidian.md/Reference/TypeScript+API/Plugin) - Main plugin class
- [Vault API](https://docs.obsidian.md/Reference/TypeScript+API/Vault) - File operations
- [MetadataCache API](https://docs.obsidian.md/Reference/TypeScript+API/MetadataCache) - Read frontmatter and metadata
- [Editor API](https://docs.obsidian.md/Reference/TypeScript+API/Editor) - Text manipulation
- [App API](https://docs.obsidian.md/Reference/TypeScript+API/App) - Global app object
- [PluginSettingTab](https://docs.obsidian.md/Reference/TypeScript+API/PluginSettingTab) - Settings UI

**Plugin Development:**
- [Sample Plugin Template](https://github.com/obsidianmd/obsidian-sample-plugin) - Official starter template
- [Plugin Developer Docs](https://docs.obsidian.md/Plugins/Getting+started/Build+a+plugin) - Step-by-step guide
- [Plugin Submission Guidelines](https://docs.obsidian.md/Plugins/Releasing/Submit+your+plugin) - For publishing
- [Hot Reload Plugin](https://github.com/pjeby/hot-reload) - Development helper

**TypeScript & Build Tools:**
- [TypeScript Handbook](https://www.typescriptlang.org/docs/handbook/intro.html) - Language reference
- [esbuild Documentation](https://esbuild.github.io/) - Build tool (used by Obsidian plugins)
- [tsconfig.json Reference](https://www.typescriptlang.org/tsconfig) - Compiler configuration

### Dataview Plugin Integration

**Core Documentation:**
- [Dataview Official Docs](https://blacksmithgu.github.io/obsidian-dataview/) - Main documentation
- [DataviewJS Reference](https://blacksmithgu.github.io/obsidian-dataview/api/intro/) - JavaScript API
- [Inline Fields](https://blacksmithgu.github.io/obsidian-dataview/annotation/add-metadata/) - key:: value syntax
- [Query Language](https://blacksmithgu.github.io/obsidian-dataview/queries/structure/) - DQL syntax
- [Functions Reference](https://blacksmithgu.github.io/obsidian-dataview/reference/functions/) - Available functions

**DataviewJS Examples:**
- [Dataview Snippets Hub](https://github.com/s-blu/obsidian_dataview_example_vault) - Community examples
- [Advanced DataviewJS Patterns](https://forum.obsidian.md/t/dataviewjs-snippet-showcase/13673) - Forum thread

### Framework & Compliance Resources

**NIST Resources:**
- [NIST SP 800-53 Rev. 5](https://csrc.nist.gov/publications/detail/sp/800-53/rev-5/final) - Security controls catalog
- [NIST Cybersecurity Framework](https://www.nist.gov/cyberframework) - CSF official site
- [NIST CSF 2.0](https://nvlpubs.nist.gov/nistpubs/CSWP/NIST.CSWP.29.pdf) - Latest version PDF
- [OSCAL](https://pages.nist.gov/OSCAL/) - Open Security Controls Assessment Language

**MITRE Resources:**
- [MITRE ATT&CK](https://attack.mitre.org/) - Adversary tactics and techniques
- [ATT&CK Navigator](https://mitre-attack.github.io/attack-navigator/) - Visualization tool
- [MITRE D3FEND](https://d3fend.mitre.org/) - Defensive countermeasures
- [MITRE ENGAGE](https://engage.mitre.org/) - Cyber denial and deception
- [ATT&CK Data Model](https://attack.mitre.org/docs/ATTACK_Design_and_Philosophy_March_2020.pdf) - Architecture PDF

**CIS Controls:**
- [CIS Controls v8](https://www.cisecurity.org/controls/v8) - Official site
- [CIS Controls Navigator](https://www.cisecurity.org/controls/cis-controls-navigator) - Interactive tool
- [Implementation Groups](https://www.cisecurity.org/controls/implementation-groups) - IG1, IG2, IG3

**Other Frameworks:**
- [CRI Profile](https://cyberriskinstitute.org/the-profile/) - Financial sector cybersecurity
- [ISO 27001](https://www.iso.org/isoiec-27001-information-security.html) - Information security standard
- [COBIT 2019](https://www.isaca.org/resources/cobit) - IT governance framework
- [FFIEC CAT](https://www.ffiec.gov/cyberassessmenttool.htm) - Financial institution assessment

### Python & Data Processing

**Python Ecosystem:**
- [Pandas Documentation](https://pandas.pydata.org/docs/) - Data manipulation library
- [Pandas User Guide](https://pandas.pydata.org/docs/user_guide/index.html) - Comprehensive guide
- [PyYAML Documentation](https://pyyaml.org/wiki/PyYAMLDocumentation) - YAML processing
- [pathlib Documentation](https://docs.python.org/3/library/pathlib.html) - Path handling
- [Type Hints (PEP 484)](https://peps.python.org/pep-0484/) - Python typing

**Data Validation & Processing:**
- [Pydantic](https://docs.pydantic.dev/) - Data validation using Python types
- [Cerberus](https://docs.python-cerberus.org/) - Lightweight validation
- [openpyxl Documentation](https://openpyxl.readthedocs.io/) - Excel file handling

**Packaging & Distribution:**
- [Python Packaging Guide](https://packaging.python.org/) - Official guide
- [setuptools Documentation](https://setuptools.pypa.io/) - Build system
- [PyPI Publishing Guide](https://packaging.python.org/en/latest/tutorials/packaging-projects/) - How to publish

### Regex & Pattern Matching

**Learning & Testing:**
- [Regex101](https://regex101.com/) - Interactive regex tester (use Python flavor)
- [RegExr](https://regexr.com/) - Alternative regex tool
- [Regex Tutorial](https://www.regular-expressions.info/tutorial.html) - Comprehensive guide
- [Python re Module](https://docs.python.org/3/library/re.html) - Python regex documentation

**Common Patterns:**
- Control IDs: `^[A-Z]{2}-\d+(?:\(\d+\))?$` (e.g., AC-2, AC-2(1))
- Framework paths: `^Frameworks/[^/]+/.*\.md$`
- WikiLinks: `\[\[([^\]]+)\]\]`
- Inline metadata: `(\w+(?:\.\w+)*)::\s*(.+)`

### GRC & Compliance Domain Knowledge

**Understanding Compliance:**
- [NIST RMF Overview](https://csrc.nist.gov/projects/risk-management/about-rmf) - Risk Management Framework
- [Compliance as Code](https://www.oreilly.com/library/view/compliance-as-code/9781492073956/) - O'Reilly book
- [GRC Fundamentals](https://www.oceg.org/grc-fundamentals/) - OCEG resources

**Security Control Mapping:**
- [NIST Cybersecurity Framework Mappings](https://www.nist.gov/cyberframework/online-learning/components-framework) - How frameworks relate
- [Framework Crosswalks](https://csrc.nist.gov/projects/olir) - NIST OLIR project
- [Control Mapping Resources](https://www.auditboard.com/blog/security-control-framework-mapping/) - Industry guide

### Claude Code + MCP Integration

**Model Context Protocol (MCP):**
- [MCP Specification](https://spec.modelcontextprotocol.io/) - Protocol definition
- [MCP Server Registry](https://github.com/modelcontextprotocol/servers) - Available servers
- [Building MCP Servers](https://modelcontextprotocol.io/docs/build/servers) - Development guide
- [MCP Python SDK](https://github.com/modelcontextprotocol/python-sdk) - For custom servers

**Claude Code Workflow:**
- [Claude Code Documentation](https://claude.ai/code) - Official docs
- [CLAUDE.md Best Practices](https://docs.anthropic.com/claude/docs/claude-code-best-practices) - Context management
- [Prompt Engineering Guide](https://docs.anthropic.com/claude/docs/prompt-engineering) - Effective prompting
- [XML Prompting Patterns](https://docs.anthropic.com/claude/docs/use-xml-tags) - Structured prompts

**Integration Patterns:**
- Use `.claudeignore` to exclude generated framework folders from context
- Reference `PROJECT_BRIEF.md` for architectural decisions
- Use `/clear` frequently during development to manage context
- Store framework import configs in version control
- Use subagents for parallel framework processing

### Related Obsidian Plugins

**Similar/Complementary Plugins:**
- [Dataview](https://github.com/blacksmithgu/obsidian-dataview) - Query engine (dependency)
- [QuickAdd](https://github.com/chhoumann/quickadd) - Macros and templates
- [Templater](https://github.com/SilentVoid13/Templater) - Advanced templates
- [Folder Notes](https://github.com/LostPaul/obsidian-folder-notes) - Treat folders as notes
- [Metadata Menu](https://github.com/mdelobelle/metadatamenu) - Metadata management
- [Supercharged Links](https://github.com/mdelobelle/obsidian-supercharged-links) - Link styling

**Inspiration & Patterns:**
- [Tasks Plugin](https://github.com/obsidian-tasks-group/obsidian-tasks) - Complex query system
- [Database Folder](https://github.com/RafaelGB/obsidian-db-folder) - Database-like views
- [Projects Plugin](https://github.com/marcusolsson/obsidian-projects) - Project management

### Community & Support

**Forums & Discussion:**
- [Obsidian Forum](https://forum.obsidian.md/) - Official community
- [Obsidian Discord](https://discord.gg/obsidianmd) - Real-time chat
- [r/ObsidianMD](https://www.reddit.com/r/ObsidianMD/) - Reddit community
- [Plugin Developer Channel](https://discord.com/channels/686053708261228577/840286264964022302) - Discord #plugin-dev

**Learning Resources:**
- [Obsidian Hub](https://publish.obsidian.md/hub/) - Community knowledge base
- [Plugin Development Series](https://marcus.se.net/obsidian-plugin-docs/) - Tutorial series
- [Obsidian October](https://obsidian.md/blog/obsidian-october-2023/) - Community challenges

**GitHub Resources:**
- [Awesome Obsidian](https://github.com/kmaasrud/awesome-obsidian) - Curated list
- [Obsidian API FAQ](https://github.com/obsidianmd/obsidian-api/discussions) - Common questions
- [Plugin Stats](https://obsidian-plugin-stats.vercel.app/) - Download metrics

## Key Principles

### Design Principles

1. **Plain Text First**: Everything in markdown, YAML, and JSON
2. **Framework Agnostic**: Easy to add new frameworks
3. **Metadata Rich**: Links carry structured data about relationships
4. **Query Powered**: Use DataviewJS for aggregations
5. **Future Proof**: No lock-in, works with standard Obsidian
6. **User-Morphable**: Let users shape the plugin to their workflow

### User Configurability Philosophy

**Core belief**: Users know their workflows better than we do. The plugin should be a flexible tool, not a rigid system.

**Implementation guidelines**:

1. **Expose settings generously** - If a behavior could reasonably vary by user preference, make it a setting
2. **Smart defaults, full control** - Provide sensible defaults but let power users override everything
3. **Progressive disclosure** - Basic settings visible, advanced settings available but not overwhelming
4. **No hardcoded magic** - Thresholds, patterns, formats should be configurable where practical
5. **Remember user choices** - Save configs, learn from corrections, reduce repetitive decisions

**Specific areas for configurability**:
- Import behavior (column mapping, transforms, output paths)
- Matching sensitivity (fuzzy match thresholds, pattern detection)
- UI preferences (wizard steps, confirmation prompts)
- Output formatting (frontmatter style, link syntax, naming conventions)
- Debug/logging verbosity

**When adding new features, ask**:
- "Would different users want this to behave differently?"
- "Can we make this a setting without overwhelming the UI?"
- "What's the sensible default if the user never touches settings?"

### Code Quality Standards

For **Python Tool**:
- Clean, readable Python 3.8+
- Type hints where helpful
- Pandas for data processing
- Config-driven (minimal hardcoding)
- Comprehensive docstrings

For **Obsidian Plugin** (if developing):
- TypeScript with strict types
- Obsidian API best practices
- Async operations for vault scanning
- Settings persistence
- Error handling

## Current Project State

### What Exists (Obsidian Plugin)

The Crosswalker Obsidian plugin now has:
- ✅ Plugin scaffold with TypeScript/esbuild build system
- ✅ Settings tab with comprehensive options (output path, key naming, array handling, etc.)
- ✅ Import wizard modal with multi-step workflow
- ✅ CSV parsing with PapaParse (streaming support for large files)
- ✅ Column type detection and analysis
- ✅ Debug logging system with toggle in settings
- ✅ ESLint setup with obsidian-plugin rules
- ✅ Embedded test vault for development

### What Exists (Python)

The Crosswalker Python tool already:
- ✅ Imports frameworks from CSV/XLSX
- ✅ Generates folder hierarchies
- ✅ Creates markdown with YAML frontmatter
- ✅ Supports major frameworks (NIST, CIS, MITRE, etc.)
- ✅ Handles framework crosswalks

### What's Next

1. **XLSX Parser**: Implement Excel file parsing (xlsx package is installed)
2. **JSON Parser**: Implement JSON file parsing
3. **Generation Engine**: Create folders and notes from parsed data
4. **Preview System**: Generate real preview from parsed file
5. **Link Generation**: Output crosswalk links in notes

## Development Priorities

### Phase 1: Python Tool Enhancement (Current)

**Focus Areas**:
1. Add comprehensive README with architecture diagrams
2. Create example vault demonstrating workflows
3. Add DataviewJS query templates to framework pages
4. Document link metadata syntax thoroughly
5. Package for PyPI distribution

**DO NOT**:
- Rewrite core import logic (it works)
- Change data structure without migration path
- Add features that belong in plugin

### Phase 2: Obsidian Plugin MVP (Next)

**Focus Areas**:
1. Framework detection (scan vault for frameworks)
2. "Insert Framework Link" command with modal
3. Autocomplete for `framework_here.*` keys
4. Basic syntax validation

**DO NOT**:
- Build full GRC workflow yet
- Create custom graph view
- Implement reporting

### Phase 3: Advanced Features (Future)

- Framework browser sidebar
- Query builder UI
- Report generator
- Framework update/sync

## Link Metadata Syntax

### Core Concept

```markdown
framework_here.applies_to:: [[Control ID]] {"sufficient": true, "reviewer": "Alice"}
```

**Components**:
- `framework_here`: Namespace (replace with actual framework name)
- `.applies_to`: Relationship type (dot notation)
- `::` : Dataview inline field separator
- `[[Control ID]]`: WikiLink to framework node
- `{"sufficient": true, ...}`: JSON metadata

### Valid Syntax Variations

```markdown
# Default value (applies to all links from this note)
framework_here.reviewer:: "Bob"

# Boolean flag (implicit true)
framework_here.applies_to:: [[AC-2]]

# With JSON metadata
framework_here.applies_to:: [[AC-2]] {"sufficient": true, "reviewer": "Alice"}

# Markdown link style
framework_here.applies_to:: [AC-2](path/to/AC-2.md) {"status": "complete"}

# With wrapping (for hiding in preview)
[framework_here.applies_to:: [[AC-2]]]
(framework_here.applies_to:: [[AC-2]] {"sufficient": true})
```

### Metadata Priority (Highest to Lowest)

1. Inline tag + link + explicit value/JSON
2. Inline tag + link + implied boolean
3. Inline tag (child/leaf) + link + JSON
4. Inline tag (parent/root) + link + JSON
5. Inline tag without link + value
6. YAML frontmatter
7. Folder-level defaults

## Framework Import Workflow

### Python Tool Process

1. **Load Data**: Read framework spreadsheet (CSV/XLSX)
2. **Normalize**: Clean strings, standardize columns
3. **Transform**: Apply framework-specific transformations
4. **Deduplicate**: Ensure unique IDs
5. **Generate**: Create folder structure + markdown files
6. **Link**: Add framework crosswalk links

### Key Files

```python
# Configuration
FrameworkConfig:
  - name: str
  - dataframe: pd.DataFrame
  - hierarchy_columns: List[str]
  - id_column: str
  - frontmatter_fields: Dict
  - tag_fields: List[str]

LinkConfig:
  - source_framework: str
  - target_framework: str
  - match_column: str
  - match_type: 'exact' | 'contains' | 'regex'
  - injection_point: 'source' | 'target' | 'both'
```

### Framework-Specific Notes

**CRI Profile**:
- Hierarchical: Function → Category → Subcategory → Diagnostic Statement
- Has tags (subject areas like #access_management)
- Maps to NIST CSF, FFIEC, CISA CPG, etc.

**NIST 800-53**:
- Families: AC, AU, CA, etc.
- Controls: AC-1, AC-2, etc.
- Enhancements: AC-2(1), AC-2(2), etc.
- Separate assessment procedures sheet

**MITRE ATT&CK**:
- Tactics (columns) × Techniques (rows)
- Sub-techniques as children
- Relationships: Technique → Mitigation, Software → Technique

## DataviewJS Query Patterns

### Pattern 1: Inbound Links to Framework Node

```javascript
// At a framework control page (e.g., AC-2.md)
const currentFile = dv.current().file.path;
const links = dv.pages()
  .file.inlinks
  .where(l => l.path === currentFile);

// Parse inline metadata to build relationship objects
// Display as table: Source | Reviewer | Status | Sufficient
```

### Pattern 2: Framework Folder Aggregation

```javascript
// At a framework category folder note
const folderPath = "Frameworks/NIST-800-53/Access Control";
const controls = dv.pages(`"${folderPath}"`);

// For each control, aggregate inbound evidence links
// Display compliance coverage dashboard
```

### Pattern 3: Evidence Gap Analysis

```javascript
// Find controls with no evidence
const allControls = dv.pages('"Frameworks/NIST-800-53"');
const withEvidence = /* controls with inbound framework_here links */;
const gaps = allControls - withEvidence;

dv.table(["Control", "Name"], gaps.map(c => [c.id, c.name]));
```

## Common Tasks

### Task 1: Add New Framework

1. Obtain official framework data (CSV/XLSX)
2. Create `FrameworkConfig` in Python script
3. Define hierarchy columns
4. Map to frontmatter fields
5. Run import: `python frameworks_to_obsidian.py`
6. Add DataviewJS templates to generated pages
7. Test with sample evidence notes

### Task 2: Create Evidence Link

Manual (current):
```markdown
framework_here.implements:: [[AC-2]] {"coverage": "full", "reviewer": "Alice"}
```

With Plugin (future):
1. Command: "Insert Framework Link"
2. Search modal: "AC-2"
3. Form fields: coverage, reviewer, etc.
4. Insert formatted syntax at cursor

### Task 3: Generate Compliance Report

Current approach:
1. Create report template note
2. Add DataviewJS queries for each section
3. Export to PDF via Obsidian's export

Future plugin:
- "Generate Report" command
- Select framework + date range
- Output formatted PDF/HTML

## File Structure

### Recommended Vault Structure

```
vault/
├── Frameworks/                    # Framework hierarchies
│   ├── NIST-SP-800-53-r5/
│   │   ├── Access Control (AC)/
│   │   │   ├── AC-1.md
│   │   │   └── AC-2.md
│   │   └── ...
│   ├── CIS-Controls-v8/
│   └── MITRE-ATT&CK/
├── Evidence/                      # Evidence collection
│   ├── Policies/
│   ├── Audit-Reports/
│   └── Technical-Docs/
├── Templates/                     # Note templates
│   ├── Framework-Control.md      # Template for controls
│   └── Evidence-Note.md          # Template for evidence
└── Reports/                       # Generated reports
    └── Compliance-Dashboard.md
```

### Framework Page Template

```markdown
---
framework: NIST-SP-800-53-r5
family: AC
control_id: AC-2
control_name: Account Management
---

# AC-2: Account Management

## Control Text
[imported from framework data]

## Discussion
[imported from framework data]

## Related Controls
[imported from framework data]

## Evidence & Implementation

```dataviewjs
// Query for all evidence linking to this control
const page = dv.current();
const links = dv.pages()
  .where(p => /* has framework_here.* link to this page */)

dv.table(
  ["Source", "Type", "Reviewer", "Status"],
  links.map(l => [l.file.link, l.type, l.reviewer, l.status])
);
```

## Gap Analysis

```dataviewjs
// Check if sufficient evidence exists
const evidence = /* count evidence */;
if (evidence === 0) {
  dv.paragraph("⚠️ No evidence mapped to this control");
}
```
```

## Testing Requirements

### Python Tool Tests

1. **Import Tests**:
   - All supported frameworks import without errors
   - Hierarchies are correct
   - Crosswalks preserved

2. **Data Integrity**:
   - No duplicate IDs
   - All required fields present
   - Valid YAML frontmatter

3. **Customization**:
   - User can configure folder names
   - User can add custom frontmatter fields
   - Regex normalizations work correctly

### Plugin Tests (When Implemented)

1. **Framework Detection**:
   - Correctly identifies framework folders
   - Parses framework hierarchy
   - Handles missing/malformed data

2. **Link Insertion**:
   - Autocomplete works
   - Metadata form validated
   - Correct syntax generated

3. **Syntax Validation**:
   - Identifies invalid syntax
   - Suggests corrections
   - Doesn't break on edge cases

## When You Get Stuck

### For Framework Data Questions

- Check: `PROJECT_BRIEF.md` section "Supported Frameworks Detail"
- Reference: Official framework documentation sites
- Review: Example spreadsheets in `/Frameworks/` directory

### For DataviewJS Questions

- Docs: https://blacksmithgu.github.io/obsidian-dataview/
- Examples: Search Obsidian forum for "dataviewjs inlinks"
- Test: Use Dataview playground in test vault

### For Obsidian Plugin Questions

- API Docs: https://docs.obsidian.md/
- Sample Plugin: https://github.com/obsidianmd/obsidian-sample-plugin
- Community: https://forum.obsidian.md/

### For Python/Pandas Questions

- Pandas Docs: https://pandas.pydata.org/docs/
- Regex: https://regex101.com/
- YAML: https://yaml.org/

## Common Pitfalls

### DON'T

1. ❌ Modify framework source files (they're generated)
2. ❌ Hardcode framework names (use config)
3. ❌ Break existing links during updates
4. ❌ Use complex queries without optimization
5. ❌ Store secrets in vault (reviewer names ok, passwords no)

### DO

1. ✅ Version framework imports (folder per version)
2. ✅ Validate all inputs (spreadsheet columns, etc.)
3. ✅ Log operations for debugging
4. ✅ Provide migration paths for schema changes
5. ✅ Keep queries performant (<1s for 1000 notes)

## Current Phase Checklist

### Phase 1 (Python Enhancement)

- [ ] Comprehensive README with architecture diagrams
- [ ] Example vault with all frameworks
- [ ] DataviewJS templates for each framework type
- [ ] Link syntax documentation with examples
- [ ] CLI documentation (--help, etc.)
- [ ] PyPI packaging
- [ ] Video tutorial (framework import)
- [ ] Video tutorial (evidence linking)

### Phase 2 (Plugin MVP)

- [ ] Plugin scaffold setup
- [ ] Framework folder detection
- [ ] "Insert Framework Link" command
- [ ] Search modal for framework nodes
- [ ] Metadata input form
- [ ] Syntax generation
- [ ] Autocomplete for dotKeys
- [ ] Settings page (framework paths)

### NOT Current Phase

- [ ] Graph view enhancements
- [ ] Report generation
- [ ] OSCAL export
- [ ] Two-way sync with external tools
- [ ] Collaboration features

## Questions to Ask User

When uncertain:

1. **Framework Scope**: "Should we support this new framework: [name]?"
2. **Metadata Schema**: "What metadata fields are required for evidence links?"
3. **Query Performance**: "Is a 2-second query acceptable for 5000 notes?"
4. **Versioning**: "How to handle framework updates without breaking links?"
5. **Export Format**: "What format for compliance reports (PDF, HTML, OSCAL)?"

## Success Metrics

Before marking complete:

- [ ] All supported frameworks import cleanly
- [ ] Example vault demonstrates key workflows
- [ ] DataviewJS queries work and are performant
- [ ] Documentation is comprehensive and clear
- [ ] Users can replicate example workflows
- [ ] No data loss scenarios
- [ ] Code is clean and maintainable

## Remember

- This is a complex project - start with Phase 1
- The Python tool is the foundation - make it solid
- Plugin is nice-to-have, not essential for MVP
- Focus on real user workflows (compliance teams)
- Plain text and simplicity are core values

---

**Last Updated**: 2025-12-06
**For**: Crosswalker Obsidian Plugin Development
**Agent Role**: Implementation & Documentation Assistant
**Current Focus**: Phase 2 - Obsidian Plugin MVP (Import Wizard)
