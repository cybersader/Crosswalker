# Core Concepts & Terminology

## Structural Concepts

### Framework
A structured hierarchy of controls, requirements, or concepts from a standards body.
- Examples: NIST 800-53, CIS Controls v8, MITRE ATT&CK
- Represented as: Folder hierarchy + markdown files

### Ontology
A formal specification of concepts and their relationships within a domain.
- Broader than "framework"—includes relationship types, not just hierarchy
- Goal: Enable ontological thinking in plaintext

### Taxonomy
A hierarchical classification system (tree structure).
- Frameworks often start as taxonomies
- Crosswalker converts taxonomies to folder structures

### Polyhierarchy
A structure where items can have multiple parents.
- Tags enable this in Obsidian (note can have many tags)
- Links enable this (note can link to many frameworks)
- Folders don't (file has one location)

### Crosswalk
A mapping showing equivalence between two frameworks.
- Example: "CIS Control 4.1 maps to NIST AC-2"
- Enables: "If you satisfy X, you partially satisfy Y"

## Link Metadata Concepts

### Edge Metadata
Data attached to relationships (edges) rather than nodes.
- Traditional links: `[[Target]]` (no metadata)
- Enhanced links: `[[Target]] {"type": "implements", "status": "complete"}`

### dotKey
Dot-notation identifier for relationship types.
- Format: `namespace.relationship`
- Example: `nist.implements`, `cis.evidence_for`
- Enables: Type-aware querying

### Inline Field (Dataview)
Dataview's syntax for embedding metadata in note body.
- Format: `key:: value`
- Extended for Crosswalker: `framework.type:: [[Target]] {json}`

## Query Concepts

### Inbound Links
Links pointing TO a note from other notes.
- Framework node receives links from evidence notes
- Query: "What links to AC-2?"

### Outbound Links
Links FROM a note to other notes.
- Evidence note links to framework nodes
- Query: "What does this policy cover?"

### Aggregation
Combining data from multiple sources into summary views.
- Example: Roll up all evidence for a control family
- Example: Count controls with/without evidence

## Compliance Concepts

### Control
A specific security requirement or safeguard.
- Has: ID, name, description, related controls
- Examples: AC-2 (Account Management), CIS 4.1 (Secure Configuration)

### Evidence
Documentation demonstrating control implementation.
- Types: Policies, screenshots, audit logs, interview notes
- Links TO controls with metadata (sufficient, reviewer, date)

### Gap
A control without sufficient evidence.
- Query: "Which controls have no evidence?"
- Query: "Which controls have evidence marked insufficient?"

### Coverage
Measure of how completely evidence addresses a control.
- Values: full, partial, none
- Metadata on the link, not the evidence note itself

## System Concepts

### Framework Detection
Automatically identifying framework folders in a vault.
- Pattern matching on folder names
- Frontmatter inspection
- Manifest files

### Link Syntax
The specific format for typed, metadata-rich links.
```
[namespace.type:: [[Target]] {"key": "value"}]
```

### Priority Structure
Rules for resolving conflicting metadata.
1. Inline + link + explicit JSON (highest)
2. Inline + link + implied boolean
3. Default values (namespace level)
4. Frontmatter
5. Folder-level inheritance (lowest)

---

## Quick Reference

| Term | One-liner |
|------|-----------|
| Framework | Structured hierarchy of requirements |
| Ontology | Concepts + their relationships |
| Crosswalk | Mapping between two frameworks |
| Edge Metadata | Data on links, not nodes |
| dotKey | `namespace.type` relationship identifier |
| Polyhierarchy | Multiple parents allowed |
| Coverage | How completely evidence satisfies a control |
| Gap | Control without sufficient evidence |
