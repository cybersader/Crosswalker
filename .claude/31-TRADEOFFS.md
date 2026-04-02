# Tradeoffs & Scope Decisions

> Explicit decisions about what we ARE and ARE NOT building.
> Captures the reasoning so future-us understands why.

---

## OUT OF SCOPE: Custom Query Language / Cypher Emulation

**Decision**: We will NOT build a custom graph query language.

**What this means**:
- No Cypher-like DSL (`MATCH (n)-[r]->(m)`)
- No custom query syntax beyond what Obsidian/plugins provide
- Rely on existing tools: Obsidian Bases, Datacore (optional), native search

**Why**:
- "Planet-sized can of worms" - scope explosion risk
- Building a query engine is a separate, massive project
- Others have tried (see Related Work below) with mixed results
- Focus on DATA STRUCTURE, not query syntax
- Let the ecosystem handle querying

**What we DO instead**:
- Design data model that IS graph-queryable (Cypher-compatible structure)
- Export-friendly: if someone wants Neo4j, the data works
- Integrate with Obsidian Bases for tabular views
- Provide example queries for tools that exist (Dataview, Datacore)
- Maybe: simple filter UI, but not a query language

**Related Work to study**:
- **Breadcrumbs plugin** - attempted hierarchical/graph relationships in Obsidian
- Others who've tried typed links / relationship semantics
- Worth understanding what they built and where they hit walls

**Date**: 2025-12-05

---

## OUT OF SCOPE: Rebuilding Graph Engine

**Decision**: We are NOT building a graph database engine inside Obsidian.

**Why**:
- Obsidian already has a graph (links, backlinks)
- We're adding METADATA to edges, not replacing the graph
- Engine-level work is deep infrastructure, not our layer
- Our layer: data conventions, import tools, UI for linking

**Our layer**:
```
┌─────────────────────────────────────────┐
│ UI: Import wizard, link insertion modal │  ← We build this
├─────────────────────────────────────────┤
│ Data: Link syntax, metadata conventions │  ← We define this
├─────────────────────────────────────────┤
│ Query: Obsidian Bases, Datacore, etc.   │  ← We integrate, not build
├─────────────────────────────────────────┤
│ Graph: Obsidian's native link graph     │  ← We leverage this
├─────────────────────────────────────────┤
│ Storage: Markdown files, YAML, JSON     │  ← We output to this
└─────────────────────────────────────────┘
```

**Date**: 2025-12-05

---

## WISH LIST (Acknowledged but deferred)

Things we'd love but won't build in foreseeable future:

| Wish | Why Deferred | Alternative |
|------|--------------|-------------|
| Cypher queries | Scope explosion | Use existing query tools |
| Custom graph visualization | Complex, others do it | Native Obsidian graph + filters |
| Real-time collaboration | Infrastructure heavy | Git-based workflows |
| Full OSCAL export | Niche, complex spec | JSON export, manual conversion |

---

## IN SCOPE (Positive definition)

What we ARE building:

1. **Import engine**: Transform tabular/structured data → Obsidian notes
2. **Link metadata syntax**: Conventions for typed, metadata-rich links
3. **UI for linking**: Modal/command to insert framework links easily
4. **Integration points**: Work with Obsidian Bases, export to common formats
5. **Resilience patterns**: Handle framework updates without breaking links

---

*Last Updated: 2025-12-05*
