# Open Questions

> Questions needing answers to guide development.
> Move to `41-QUESTIONS-RESOLVED.md` when answered.

---

## Architecture Questions

### Q1: Primary Interface
**Question**: Should the primary user interface be:
- (A) Python CLI tool (current Crosswalker)
- (B) Obsidian plugin (new development)
- (C) Hybrid: Python for import, plugin for interaction
- (D) Web-based tool that outputs to vault

**Why it matters**: Determines tech stack focus, development effort, user workflow.

**Status**: OPEN

---

### Q2: Dataview Dependency
**Question**: Should we:
- (A) Require Dataview plugin (use DataviewJS for queries)
- (B) Build custom query engine (no dependencies)
- (C) Support both (graceful degradation)

**Why it matters**: Dataview is powerful but adds dependency. Custom engine = more work but self-contained.

**Status**: OPEN

---

### Q3: JavaScript Port
**Question**: Should we port Python logic to JavaScript?
- (A) Yes, full rewrite for native Obsidian
- (B) No, keep Python for data processing
- (C) Partial port (core logic in JS, heavy processing in Python)

**Why it matters**: Affects maintainability, deployment, user experience.

**Status**: OPEN

---

## User & Scope Questions

### Q4: Primary User Persona
**Question**: Who is the primary user?
- (A) GRC professional (compliance focus)
- (B) Security researcher (threat intel, ATT&CK mapping)
- (C) Knowledge worker (general ontology use beyond security)
- (D) Enterprise team (collaboration features)

**Why it matters**: Shapes feature priorities, UI design, terminology.

**Status**: OPEN

---

### Q5: Solo vs. Team
**Question**: Is this primarily for:
- (A) Individual use (personal vault)
- (B) Team collaboration (shared vault)
- (C) Both equally

**Why it matters**: Affects features like assignments, reviews, conflict resolution.

**Status**: OPEN

---

### Q6: Beyond Security Frameworks
**Question**: Should this support non-security ontologies?
- (A) Security frameworks only (NIST, CIS, MITRE)
- (B) Any structured ontology (OWL, SKOS, custom)
- (C) Start security-focused, extensible architecture

**Why it matters**: Scope of the project, naming, marketing.

**Status**: OPEN

---

## Technical Questions

### Q7: Link Syntax Complexity
**Question**: How complex should link metadata syntax be?
- (A) Simple: Just relationship type + boolean
- (B) Medium: Type + JSON object
- (C) Full: Priority hierarchy, inheritance, defaults

**Why it matters**: User learning curve vs. power/flexibility.

**Status**: OPEN

---

### Q8: Framework Updates
**Question**: How to handle framework version updates?
- (A) Versioned folders (NIST-800-53-r5/, NIST-800-53-r6/)
- (B) In-place update with migration scripts
- (C) Manual user responsibility

**Why it matters**: Real-world frameworks evolve; breaking links is painful.

**Status**: OPEN

---

### Q9: Query Output
**Question**: What query outputs matter most?
- (A) Tables (Dataview-style)
- (B) Reports (PDF/HTML export)
- (C) Dashboards (live views)
- (D) API/export (OSCAL, JSON)

**Why it matters**: Determines output rendering investment.

**Status**: OPEN

---

## Priority Questions

### Q10: MVP Definition
**Question**: What's the minimum viable product?
- (A) Just import: Python tool that creates folders + files
- (B) Import + linking: Plugin to insert typed links
- (C) Import + linking + queries: Full loop
- (D) Something else?

**Why it matters**: Defines first release scope.

**Status**: OPEN

---

### Q11: Immediate Pain Point
**Question**: What's the #1 pain you want solved first?
- (A) Getting frameworks into Obsidian
- (B) Linking evidence to frameworks with metadata
- (C) Querying/reporting on compliance status
- (D) Mapping between frameworks (crosswalks)

**Why it matters**: Guides Phase 1 focus.

**Status**: OPEN

---

### Q12: Timeline Pressure
**Question**: Is there external pressure (audit, client, deadline)?
- (A) Yes, need something working by [date]
- (B) No, building for long-term use
- (C) Building in public, iterating with community

**Why it matters**: Affects MVP scope, polish level.

**Status**: OPEN

---

## Vision Questions

### Q13: Ideal End State
**Question**: In 2 years, what does success look like?
- (A) Popular Obsidian plugin in community catalog
- (B) Enterprise GRC platform built on Obsidian
- (C) Open standard for framework-as-notes
- (D) Personal tool that just works for your needs

**Why it matters**: Guides architecture, documentation, community investment.

**Status**: OPEN

---

### Q14: Differentiator
**Question**: What makes this better than alternatives?
- (A) Plaintext/portable (vs. proprietary GRC tools)
- (B) Graph-thinking (vs. spreadsheets)
- (C) Obsidian integration (vs. separate tools)
- (D) Open source / free
- (E) Something else?

**Why it matters**: Marketing, feature prioritization.

**Status**: OPEN

---

### Q15: Adjacent Use Cases
**Question**: Beyond compliance mapping, what else should this enable?
- Threat modeling?
- Knowledge graphs for any domain?
- Research organization?
- Project management ontologies?

**Status**: OPEN

---

*Last Updated: 2025-12-05*
