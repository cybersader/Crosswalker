# Schema Migration Strategy for Obsidian-as-Database

> **Status**: Design Discussion
> **Created**: 2025-12-08
> **Context**: Crosswalker turns Obsidian into a structured database. We need to think about how schema changes propagate.

---

## The Core Problem

When you import a framework (like NIST 800-53) into Obsidian, you're essentially creating a **database schema** expressed as:
- Folder structure (hierarchy)
- Note files (records/rows)
- Frontmatter properties (columns/fields)
- Links between notes (relationships/foreign keys)

**The question**: What happens when:
1. The framework itself updates (NIST releases Rev 6)?
2. You want to change how properties are named?
3. You want to restructure the hierarchy?
4. You want to add new fields to existing notes?

---

## How Traditional Databases Handle This

### 1. Schema Migrations (SQL)

Traditional databases use **migration files** - sequential scripts that modify the schema:

```sql
-- Migration 001: Add status column
ALTER TABLE controls ADD COLUMN status VARCHAR(50);

-- Migration 002: Rename column
ALTER TABLE controls RENAME COLUMN old_name TO new_name;
```

**Pros**:
- Version controlled
- Reversible (up/down migrations)
- Sequential and trackable

**Cons**:
- Requires central schema authority
- Downtime during migration
- Complex rollback scenarios

### 2. Document Databases (MongoDB, CouchDB)

Document DBs are "schemaless" but still need migration patterns:

```javascript
// Version field in each document
{ "_id": "AC-1", "schemaVersion": 2, ... }

// Migration on read (lazy migration)
if (doc.schemaVersion < CURRENT_VERSION) {
  doc = migrateDocument(doc);
}
```

**Pros**:
- Flexible, no downtime
- Each document self-describes its version
- Gradual migration possible

**Cons**:
- Mixed versions in database
- Migration logic in application code
- Can be slow if transformations are complex

### 3. Event Sourcing

Store all changes as events, rebuild current state:

```
Event 1: ControlCreated { id: "AC-1", name: "..." }
Event 2: ControlRenamed { id: "AC-1", newName: "..." }
Event 3: PropertyAdded { id: "AC-1", property: "status", value: "active" }
```

**Pros**:
- Full history
- Can replay to any point
- Schema is emergent

**Cons**:
- Complex to implement
- Storage overhead
- Overkill for our use case

---

## Obsidian's Unique Characteristics

Obsidian is **not** a traditional database. Key differences:

### 1. Files ARE the Database

- Each note is a record
- Frontmatter is the schema per-record
- No central schema enforcement
- Files can be edited by hand, other tools, or sync conflicts

### 2. Human-Readable First

- Users read and edit markdown directly
- Can't hide migration complexity in binary format
- Must preserve readability during/after migration

### 3. Distributed/Local-First

- No central server to coordinate migrations
- Multiple devices may have different states
- Git sync adds another layer of complexity

### 4. Links Are Content

- Wikilinks are embedded in text, not separate relation tables
- Renaming a note can break links (Obsidian has auto-update, but not always)
- Link metadata is inline, not normalized

---

## Proposed Strategy: "Versioned Imports with Diff-Based Updates"

### Core Principles

1. **Import configs carry schema version** (already implemented)
2. **Generated notes include import metadata** (source, version, timestamp)
3. **Re-imports detect existing notes and offer merge options**
4. **User controls what changes to accept**

### Implementation Layers

#### Layer 1: Import Metadata in Notes

Every generated note includes:

```yaml
---
_crosswalker:
  importId: "import_20231208_abc123"
  configId: "config_sample_nist_001"
  configVersion: 1
  sourceFile: "nist-800-53-r5.csv"
  sourceRow: 42
  importedAt: "2023-12-08T12:00:00Z"

# User-facing properties
control_id: AC-1
control_name: Account Management
---
```

This allows:
- Tracking which import created/updated a note
- Detecting if note was manually modified since import
- Re-importing with knowledge of previous state

#### Layer 2: Schema Version in Config

```typescript
interface SavedConfig {
  schemaVersion: number;  // Config structure version (already have this)
  outputSchemaVersion?: number;  // Version of generated note structure
  // ...
}
```

When `outputSchemaVersion` changes, we know generated notes will be different.

#### Layer 3: Re-Import Strategies

When user imports a framework that already exists:

**Option A: Skip Existing**
- Only create notes that don't exist
- Safe, but doesn't update anything

**Option B: Replace All**
- Delete old notes, create new ones
- Simple, but loses manual edits

**Option C: Merge with Diff** (Preferred)
- Compare old vs new
- Show user what changed
- Let user accept/reject changes per-note or per-field

**Option D: Side-by-Side Versions**
- Import to new folder (e.g., `NIST-800-53-r6/`)
- Keep old version intact
- User manually migrates links/notes

#### Layer 4: Property Rename Migrations

If user wants to rename a property across all notes:

```typescript
interface PropertyMigration {
  type: 'rename';
  from: 'control_id';
  to: 'controlId';
  scope: 'folder' | 'tag' | 'all';
  scopeValue?: string;  // e.g., "Frameworks/NIST-800-53"
}
```

This could be a separate tool/command: "Migrate properties..."

---

## Comparison with Our Current Approach

### What We Have

| Aspect | Current State | Gap |
|--------|---------------|-----|
| Config versioning | `schemaVersion: 1` in SavedConfig | Need `outputSchemaVersion` too |
| Import metadata | None in generated notes | Need `_crosswalker` block |
| Re-import handling | Not implemented yet | Need merge strategy |
| Property migration | Not implemented | Future feature |
| Link migration | Not implemented | Obsidian handles some |

### What We Need Before Generation Engine

**Minimum for MVP**:
1. Add `_crosswalker` metadata to generated notes
2. Implement "Skip existing" as default behavior
3. Document that manual edits may be lost on re-import

**For v1.1**:
1. Detect existing notes before import
2. Show diff preview
3. Offer merge options

**For v2.0**:
1. Property migration tool
2. Bulk rename with link update
3. Framework version upgrade wizard

---

## Questions to Resolve

### 1. Should `_crosswalker` be visible or hidden?

**Options**:
- A) Visible in frontmatter (transparent, but clutters)
- B) Hidden in separate file (clean notes, but extra complexity)
- C) User setting (let them choose)

**Recommendation**: A with user option to hide via CSS

### 2. What's the "primary key" for a note?

When re-importing, how do we match old notes to new data?

**Options**:
- A) File path (but paths can change)
- B) Control ID field (but field name varies)
- C) Combination of hierarchy + filename
- D) Store canonical ID in `_crosswalker`

**Recommendation**: D - store source row identifier in metadata

### 3. How granular should merge be?

**Options**:
- A) All-or-nothing per note
- B) Per-section (frontmatter, body)
- C) Per-property in frontmatter
- D) Line-by-line diff

**Recommendation**: B for MVP, C for v1.1

### 4. What about links?

If a control ID changes (e.g., "AC-2" becomes "AC-02"):
- Old links `[[AC-2]]` break
- Need to update links across vault
- Obsidian's rename handles this IF the file is renamed
- But if file content changes, links in other notes don't auto-update

**Recommendation**:
- Warn user about breaking changes
- Offer "update links" as separate step
- Document limitations

---

## Analogy: Git for Data

Think of it like this:

| Git Concept | Crosswalker Equivalent |
|-------------|------------------------|
| Repository | Obsidian vault |
| Commit | Import operation |
| Branch | Framework version folder |
| Merge | Re-import with merge strategy |
| Conflict | Manual edit vs import change |
| Diff | Preview before import |

We're not building a full VCS, but the mental model helps.

---

## Action Items

### Immediate (Before Generation Engine)

- [ ] Add `_crosswalker` metadata interface to types
- [ ] Include import metadata in generated notes
- [ ] Default to "skip existing" behavior
- [ ] Add setting for metadata visibility

### Short-term (v1.1)

- [ ] Detect existing framework imports
- [ ] Show diff/preview before re-import
- [ ] Implement basic merge options

### Long-term (v2.0)

- [ ] Property migration tool
- [ ] Framework version upgrade wizard
- [ ] Bulk link updater

---

## References

- [Prisma Migrations](https://www.prisma.io/docs/concepts/components/prisma-migrate) - Good schema migration model
- [MongoDB Schema Versioning](https://www.mongodb.com/blog/post/building-with-patterns-the-schema-versioning-pattern)
- [Event Sourcing Pattern](https://martinfowler.com/eaaDev/EventSourcing.html)
- [Obsidian Properties](https://help.obsidian.md/Editing+and+formatting/Properties) - Native property handling

---

## Decision Log

| Date | Decision | Rationale |
|------|----------|-----------|
| 2025-12-08 | Use `_crosswalker` frontmatter block | Keeps metadata with note, transparent, survives moves |
| 2025-12-08 | Default to "skip existing" for MVP | Safe, non-destructive, can enhance later |
| 2025-12-08 | Store source row ID as canonical key | Enables reliable matching on re-import |

---

*This document should be updated as we implement and learn more.*
