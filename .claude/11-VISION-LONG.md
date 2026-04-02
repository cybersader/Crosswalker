# Long-Term Vision (1-2+ Years)

> The aspirational end state. What this becomes if everything goes well.

---

## The Big Picture

**Crosswalker** becomes the standard way to represent structured ontologies in Obsidian—not just security frameworks, but any hierarchical/graph knowledge structure.

### Core Value Proposition
> "Bring any structured knowledge system into Obsidian, link it to your work, query it any way you want—all in portable plaintext."

---

## Full Feature Set (Eventually)

### 1. Universal Import Engine
- [ ] Import from: CSV, XLSX, JSON, YAML, XML, OSCAL, RDF
- [ ] Smart structure detection (auto-detect hierarchy patterns)
- [ ] Preset templates for common frameworks (NIST, CIS, MITRE, ISO, etc.)
- [ ] Config file system (JSON/YAML) for repeatable imports
- [ ] Import from URLs (fetch framework data directly)
- [ ] Incremental updates (diff new version against existing)

### 2. Link Metadata System
- [ ] Typed links with JSON metadata
- [ ] User-configurable syntax (presets to custom regex)
- [ ] Link insertion modal (search framework → insert typed link)
- [ ] Autocomplete for framework nodes
- [ ] Autocomplete for relationship types
- [ ] Validation of link syntax

### 3. Query & Aggregation Layer
- [ ] Structured frontmatter output (feeds any query tool)
- [ ] Built-in views for common queries:
  - Evidence coverage by control
  - Gap analysis (controls without evidence)
  - Crosswalk visualization
- [ ] Export to: CSV, JSON, OSCAL, PDF reports
- [ ] Integration with Obsidian Bases (native)
- [ ] Example queries for Dataview, Datacore

### 4. Framework Management
- [ ] Framework versioning (NIST-800-53-r5 vs r6)
- [ ] Update mechanism (import new version, migrate links)
- [ ] Deprecation handling (mark outdated controls)
- [ ] Multi-framework support (multiple frameworks in same vault)
- [ ] Framework crosswalk visualization

### 5. Resilience & Future-Proofing
- [ ] Framework structure change detection
- [ ] Link migration tools
- [ ] Backup before destructive operations
- [ ] Undo/rollback capability
- [ ] Plain text throughout (no lock-in)

---

## Ecosystem Position

```
┌─────────────────────────────────────────────────────────────┐
│                      USER'S VAULT                           │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────┐ │
│  │ Evidence Notes  │  │ Policy Docs     │  │ Meeting Notes│ │
│  │ (unstructured)  │  │ (unstructured)  │  │ (unstructured│ │
│  └────────┬────────┘  └────────┬────────┘  └──────┬──────┘ │
│           │                    │                   │        │
│           └────────────────────┼───────────────────┘        │
│                                │                            │
│                    TYPED LINKS WITH METADATA                │
│                    (crosswalker.implements:: [[AC-2]])     │
│                                │                            │
│                                ▼                            │
│  ┌──────────────────────────────────────────────────────┐  │
│  │              FRAMEWORK STRUCTURES                     │  │
│  │  ┌────────────┐ ┌────────────┐ ┌────────────┐       │  │
│  │  │ NIST 800-53│ │ CIS v8     │ │ MITRE ATT&CK│       │  │
│  │  │ (imported) │ │ (imported) │ │ (imported)  │       │  │
│  │  └────────────┘ └────────────┘ └────────────┘       │  │
│  │         ↑              ↑              ↑              │  │
│  │         └──────────────┼──────────────┘              │  │
│  │                   CROSSWALKS                         │  │
│  └──────────────────────────────────────────────────────┘  │
│                                │                            │
│                                ▼                            │
│  ┌──────────────────────────────────────────────────────┐  │
│  │              QUERY & VISUALIZATION                    │  │
│  │  • Obsidian Bases (native)                           │  │
│  │  • Dataview (optional)                               │  │
│  │  • Graph View (native)                               │  │
│  │  • Export (CSV, JSON, OSCAL, PDF)                    │  │
│  └──────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

---

## Use Cases Beyond Security

While security frameworks are the starting point, the system enables:

| Domain | Example Ontologies |
|--------|-------------------|
| **Security/GRC** | NIST, CIS, MITRE, ISO 27001, SOC 2 |
| **Legal/Compliance** | GDPR, HIPAA, PCI-DSS |
| **Academic** | Citation networks, research taxonomies |
| **Business** | OKR frameworks, process taxonomies |
| **Technical** | API specifications, architecture standards |
| **Personal** | Custom knowledge taxonomies, PKM systems |

---

## Principles That Persist

1. **Plaintext First**: Everything in markdown, YAML, JSON. No binary formats.
2. **No Lock-In**: User can leave anytime, data is portable
3. **Tool Agnostic Outputs**: Feed any query tool, not dependent on one
4. **Resilient**: Handle changes gracefully, don't break on updates
5. **User Configurable**: Flexibility over prescription

---

## What Success Looks Like

### Adoption Metrics
- 1,000+ plugin installations
- Active community (Discord/forum)
- Community-contributed framework templates
- Used by 10+ organizations

### Quality Metrics
- Zero data loss incidents
- Query performance <1s for 5000 notes
- 95%+ user satisfaction

### Ecosystem Metrics
- Integration with other popular plugins
- Recognition in Obsidian community
- Contributions from other developers

---

## The Dream

> Someone downloads Obsidian, installs Crosswalker, imports their framework in 5 minutes, and immediately starts linking their work to structured knowledge. A month later, they run a compliance report directly from their vault. All in plaintext. All portable. All theirs.

---

*Last Updated: 2025-12-05*
