# The Fundamental Problem

## The Hierarchy vs. Graph Tension

**Filesystems are hierarchical:**
- Each file has exactly ONE parent folder
- Path = identity (`/Frameworks/NIST/AC-2.md`)
- Single location per item
- Tree structure, not graph

**Knowledge is graph-shaped:**
- Concepts connect to MANY other concepts
- Same idea belongs in multiple contexts
- Relationships have types and metadata
- Polyhierarchy is natural

## Where Obsidian Sits

Obsidian runs on a filesystem but provides graph-like features:

| Feature | Hierarchical | Graph-like |
|---------|--------------|------------|
| Folders | Yes | - |
| WikiLinks | - | Yes (untyped edges) |
| Tags | - | Yes (multi-parent) |
| Aliases | - | Yes (multiple identities) |
| Properties | - | Yes (node metadata) |
| Backlinks | - | Yes (bidirectional) |

**The Gap**: Links are untyped. You can link `[[AC-2]]` but you can't say:
- "This IMPLEMENTS AC-2"
- "This is EVIDENCE FOR AC-2"
- "This was REVIEWED BY Alice"
- "This is SUFFICIENT for compliance"

## Why This Matters for Frameworks

Compliance frameworks are structured ontologies:
- NIST 800-53: Families → Controls → Enhancements
- CIS Controls: Controls → Safeguards → Implementation Groups
- MITRE ATT&CK: Tactics → Techniques → Sub-techniques

Organizations need to:
1. Import these structures into a knowledge base
2. Link workspace notes (evidence, policies) to framework nodes
3. Attach metadata to those relationships
4. Query: "Show all evidence for AC-2 that's marked sufficient"
5. Report: "Which controls have no evidence?"

## Current Solutions Fall Short

**Proprietary GRC tools**: Lock-in, expensive, rigid
**Spreadsheets**: Don't scale, no graph navigation
**Plain Obsidian**: Links exist but no relationship types
**Graph databases**: Overkill, separate from notes

## The Opportunity

Build a system where:
- Frameworks live as structured markdown folders
- Evidence notes link to framework nodes
- Links carry typed metadata (JSON inline)
- Dataview/custom queries aggregate relationships
- Everything stays plaintext, portable, version-controlled

---

*Key insight: We're not replacing the filesystem hierarchy—we're overlaying graph semantics on top of it using link metadata.*
