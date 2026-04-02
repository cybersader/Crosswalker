# Schema Migration - Simplified Mental Model

> **Status**: Planning
> **Created**: 2025-12-08
> **Purpose**: Answer "how do we handle updates?" in plain terms

---

## The Real Question

You asked the right question: **"Who's responsible for maintaining this?"**

Let me break down the actual scenarios and who does what.

---

## What Actually Changes (And Who Changes It)

### Scenario 1: Framework Publisher Updates the Framework

**Example**: NIST releases SP 800-53 Revision 6

**What happens**:
1. NIST publishes new spreadsheet/PDF
2. **Someone** creates a new Crosswalker import config for it
3. User imports the new version to a **new folder** (e.g., `NIST-800-53-r6/`)
4. Old version stays intact
5. User manually decides what to migrate

**Who's responsible**:
- **Framework publisher** (NIST): Releases new data
- **Config creator** (community or you): Creates import config for new format
- **User**: Decides when/how to adopt new version

**Key insight**: We treat major framework versions as **separate imports**, not updates to existing data.

### Scenario 2: You Want to Change Your Own Schema

**Example**: You imported NIST but want to rename `control_id` to `controlId`

**What happens**:
1. You edit your import config
2. You either:
   - A) Delete old notes, re-import (loses manual additions)
   - B) Run a "property rename" tool (future feature)
   - C) Live with mixed naming (use Dataview to normalize in queries)

**Who's responsible**:
- **You**: It's your vault, your choice

### Scenario 3: You've Added Custom Data to Imported Notes

**Example**: You imported NIST, then added `our_implementation_status` to each control

**What happens if you re-import**:
- Skip existing: Your custom data is safe (but you don't get updates)
- Replace: Your custom data is **LOST**
- Merge (future): You see diff, choose what to keep

**Who's responsible**:
- **You**: You're the one who added custom data

**Key insight**: Custom columns you add are **your schema extension**. The import config doesn't know about them.

---

## How Real Tools Handle This

### CISO Assistant Approach

From my research on [CISO Assistant](https://github.com/intuitem/ciso-assistant-community):

1. **Frameworks are YAML files** maintained by the project/community
2. **Each version is a separate library** (ISO 27001:2013 vs ISO 27001:2022)
3. **Mappings between frameworks** use [NIST OLIR](https://csrc.nist.gov/projects/olir) standard
4. **Users don't edit framework libraries** - they reference them
5. **User's work is separate** from framework definitions

**Translation to Crosswalker**:
- Import configs = Framework libraries
- Generated notes = Reference to framework + user's work
- We should probably keep user additions **separate** from imported data

### OSCAL Approach

From [NIST OSCAL](https://pages.nist.gov/OSCAL/):

1. **Semantic versioning**: MAJOR.MINOR.PATCH
2. **Breaking changes** = new MAJOR version (old content still valid until explicitly migrated)
3. **Schema is machine-readable** (XML/JSON/YAML schemas)
4. **Layers separate concerns**: Catalog (controls) → Profile (selection) → Implementation (your work)

**Translation to Crosswalker**:
- We could adopt semantic versioning for import configs
- Breaking change = new config, not in-place update
- **Separation of layers** is the key insight here

---

## The Layered Model (Stolen from OSCAL)

Here's a cleaner mental model:

```
┌─────────────────────────────────────────────────────────────┐
│  Layer 3: YOUR WORK                                         │
│  - Evidence notes linking to controls                       │
│  - Custom properties you added to controls                  │
│  - Your assessments, statuses, notes                        │
│  YOU own this. Crosswalker doesn't touch it.                │
├─────────────────────────────────────────────────────────────┤
│  Layer 2: IMPORT MAPPING (Config)                           │
│  - How columns map to properties                            │
│  - Folder structure rules                                   │
│  - Link generation rules                                    │
│  CONFIG CREATOR owns this. Can be shared.                   │
├─────────────────────────────────────────────────────────────┤
│  Layer 1: SOURCE DATA (CSV/XLSX)                            │
│  - The raw framework data                                   │
│  - Control IDs, names, descriptions                         │
│  FRAMEWORK PUBLISHER owns this. We just read it.            │
└─────────────────────────────────────────────────────────────┘
```

**Key principle**: Each layer can change independently:
- NIST updates Layer 1? Create new Layer 2 config, reimport to new folder
- You want different mapping? Edit Layer 2, reimport
- You added custom work? That's Layer 3, preserved separately

---

## What This Means for Crosswalker

### Canonical ID

Every imported note gets a **canonical ID** that ties it back to source:

```yaml
_crosswalker:
  sourceId: "AC-1"           # ID from source data (their key)
  sourceFile: "nist-800-53-r5.csv"
  sourceRow: 42              # For debugging
  configId: "config_nist_001"
  importedAt: "2024-12-08"
```

**Why `sourceId` matters**: If you reimport, we match by `sourceId`, not filename.

### Reimport Strategy (MVP)

For now, keep it simple:

1. **Default**: Skip existing notes (safe)
2. **Option**: Import to new folder (version side-by-side)
3. **Future**: Diff/merge UI

### Your Custom Data

Two approaches:

**Option A: Inline (Current Plan)**
- Add custom properties directly to imported notes
- Risk: Lost on "replace" reimport
- Benefit: All data in one place

**Option B: Separate Notes (OSCAL-style)**
- Imported controls are "read-only" templates
- Your work goes in separate "implementation" notes that link to controls
- Risk: More notes, more complexity
- Benefit: Clean separation, safe reimport

**Recommendation for MVP**: Start with Option A (inline), document the risk, add Option B later if users need it.

---

## Who Maintains What

| Component | Who Creates | Who Maintains | How Often Changes |
|-----------|-------------|---------------|-------------------|
| Source data (CSV) | Framework publisher (NIST, CIS) | Them | Yearly-ish |
| Import config | Community/you | Config creator | When format changes |
| Generated notes | Crosswalker | Auto-generated | On reimport |
| Custom properties | You | You | As needed |
| Links to controls | You | You | As needed |

**Bottom line**: You're only responsible for your custom work (Layer 3). Framework updates are handled by importing new versions, not migrating in place.

---

## Practical Implications for Generation Engine

When we build the Generation Engine:

1. **Always include `_crosswalker` metadata** in generated notes
2. **Use `sourceId`** as the canonical identifier (not filename)
3. **Default to "skip existing"** to protect user work
4. **Support "import to new folder"** for version management
5. **Document clearly**: "If you add custom properties, they survive skip but not replace"

---

## Open Questions (Resolved)

| Question | Answer |
|----------|--------|
| Who maintains configs? | Whoever creates them (you, community, us) |
| What if framework updates? | Import new version to new folder |
| What about custom columns? | Your responsibility; use skip or separate notes |
| Is there a standard schema language? | Yes (OSCAL), but overkill for MVP. We can adopt later. |
| How do links work across versions? | Links are by note path; if path changes, links break. Obsidian rename helps. |

---

## Sources

- [CISO Assistant GitHub](https://github.com/intuitem/ciso-assistant-community) - Framework library approach
- [NIST OSCAL](https://pages.nist.gov/OSCAL/) - Layered model, semantic versioning
- [NIST OLIR](https://csrc.nist.gov/projects/olir/informative-reference-catalog) - Standard for framework mappings
- [OSCAL Versioning](https://github.com/usnistgov/OSCAL/blob/main/versioning-and-branching.md) - How they handle breaking changes

---

*Updated: 2025-12-08*
