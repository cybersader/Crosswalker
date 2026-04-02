# Resolved Questions

> Answered questions with context captured.

---

## Naming Decision
**Answer**: **Crosswalker** (definitive)
- Emphasizes cross-framework mapping
- Frameworker was earlier name, now deprecated

**Date**: 2025-12-05

---

## Q1: Primary Interface
**Answer**: TypeScript/JavaScript plugin as PRIMARY, Python as BACKUP
- Plugin ships JS/TS only
- Python tool stays in repo but not in plugin distribution
- Both approaches maintained for resilience

**Date**: 2025-12-05

---

## Q2: Dataview Dependency
**Answer**: NO Dataview dependency - OUTPUT STRUCTURED FRONTMATTER
- Move away from Dataview as requirement
- **Output structured frontmatter** that feeds into ANY tool (Dataview, Bases, Datacore, etc.)
- Decoupled architecture: Crosswalker outputs data, user picks query tool
- Prefer **Obsidian Bases** for first-party support
- Can provide example queries for various tools

**Date**: 2025-12-05

---

## Import Wizard UX
**Answer**: Step-by-step wizard FIRST, all options eventually
- Start with step-by-step wizard (select file → map columns → preview → generate)
- Eventually support: config file approach, smart defaults + override
- User should be able to pick their preferred approach
- Existing Obsidian Importer does part of this but NOT the structured mapping piece
- Existing Python code has the logic, needs transformation to plugin

**Date**: 2025-12-05

---

## Link Syntax Configurability
**Answer**: User chooses the LEVEL of configuration
- Presets (Simple, Standard, Full)
- Per-vault configuration
- Per-framework configuration
- Fully custom
- User decides which level they want to define at
- Maximum flexibility, sensible defaults

**Date**: 2025-12-05

---

## MVP Definition
**Answer**: IMPORT is first priority
- Get framework import working first
- With **properties** (frontmatter) properly set
- With **links to other pages** working (crosswalks)
- This enables everything else downstream

**Date**: 2025-12-05

---

## Q4: Primary User Persona
**Answer**: GENERAL - not just security
- Anyone who wants to represent information accurately, flexibly, powerfully
- Helps with graph-type linking that "hasn't been up to snuff" in Obsidian
- Security frameworks are a USE CASE, not the only scope

**Date**: 2025-12-05

---

## Transformation System Design
**Answer**: Config-driven, principled approach (inspired by jsonaut)
- **Separation of concerns**: Functions (logic) / Config (rules) / Execution (runtime)
- **Pipeline stages**: Parse → Transform → Map → Generate
- **Config-driven**: JSON/YAML configs define transformations, not templates
- **Wizard is a config builder**: Visual UI builds config, config can be exported/imported
- **Extensible**: Built-in transforms + custom function support (opt-in)

**Key difference from existing importers**:
- Existing tools: Template-driven, flat output, no hierarchy concept
- Crosswalker: Config-driven, hierarchical output, crosswalk-aware

**Date**: 2025-12-05

---

## Frontmatter Flexibility
**Answer**: User-configurable with multiple options
- Flat, nested, or namespaced - user chooses
- Dot notation for nesting: `{"key": "control.id"}` → `control:\n  id: value`
- Advanced transforms can append, prefix, custom format
- Config-driven, not template-driven

**Date**: 2025-12-05

---

## Link Location Flexibility
**Answer**: User-configurable per-link
- Frontmatter (as array of WikiLinks)
- Body (under heading)
- Both
- User specifies in config

**Date**: 2025-12-05

---

## Filename Pattern
**Answer**: Template-based, configurable
- Template syntax: `${column_name}`
- Built-in sanitization
- User defines in config

**Date**: 2025-12-05

---

## XLSX Parser
**Answer**: SheetJS
- Wide format support
- Well-documented
- Acceptable size (~1MB)

**Date**: 2025-12-05

---

## Q6: Beyond Security Frameworks
**Answer**: YES - General ontology system
- Security frameworks are an application, not the limit
- Should work for any structured ontology

**Date**: 2025-12-05

---

## Q7: Link Syntax Complexity
**Answer**: USER-CONFIGURABLE
- Let user decide how link syntax works
- Experimental checkboxes or configuration options
- Flexibility over prescription

**Date**: 2025-12-05

---

## Q11: Immediate Pain Point
**Answer**: Framework import workflow/engine
- Hardest part: guiding user to bring framework into Obsidian
- Challenge: How to transform input → node pages without lots of nuance
- Need abstraction/convention layer to simplify this
- UX problem as much as technical problem

**Date**: 2025-12-05

---

## Q13: Ideal End State
**Answer**: Tool that works really well + LONG-TERM RESILIENCE
- Must handle framework structure changes gracefully
- Crosswalk links must survive framework updates
- Durability over features

**Date**: 2025-12-05

---

## NEW: Obsidian Bases Integration
**Decision**: Integrate with Obsidian Bases (new core plugin)
- Handles CSV/JSON imports
- First-party, will have ongoing support
- Key integration point for import workflow

**Date**: 2025-12-05

---

## Q8: Framework Version Updates
**Answer**: NEEDS RESEARCH
- Look at CISO Assistant (GitHub) for patterns
- Must handle structure changes without breaking crosswalks

**Date**: 2025-12-05
**Status**: Needs research

---

*Last Updated: 2025-12-05*
