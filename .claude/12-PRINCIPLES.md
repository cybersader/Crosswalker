# Crosswalker Design Principles

> Guiding principles that inform all decisions.

---

## 1. Plaintext First

**Everything in human-readable text formats.**

- Markdown files
- YAML frontmatter
- JSON for structured data
- No binary formats
- No proprietary encodings

**Why**: Portable, versionable, future-proof. User can read/edit without tools.

---

## 2. No Lock-In

**User owns their data completely.**

- All data in standard Obsidian formats
- Can stop using plugin anytime
- No cloud dependency
- No account required
- Export to common formats

**Why**: Trust. Users adopt tools they can leave.

---

## 3. Tool-Agnostic Outputs

**Don't depend on specific query tools.**

- Output structured frontmatter
- Works with Bases, Dataview, Datacore, or none
- Provide examples for multiple tools
- Don't require any specific plugin

**Why**: Ecosystem flexibility. Users have preferences.

---

## 4. Resilience Over Features

**Survive changes gracefully.**

- Handle framework version updates
- Preserve links when structures change
- Never lose user data
- Backup before destructive operations
- Clear error messages

**Why**: Real-world frameworks change. Links must survive.

---

## 5. User Configurable

**Flexibility over prescription.**

- Configurable link syntax
- Configurable output structure
- Sensible defaults
- Progressive disclosure (simple → advanced)
- Don't force one way

**Why**: Users have different needs, preferences, existing setups.

---

## 6. Import Is Core

**Getting data IN is the foundation.**

- Import wizard is primary interface
- Support common formats (CSV, XLSX, JSON)
- Handle messy real-world data
- Preview before committing
- Repeat imports should be easy

**Why**: Everything else depends on good import.

---

## 7. Links Carry Meaning

**Links are first-class data, not just navigation.**

- Typed relationships (implements, evidence_for, etc.)
- Metadata on edges (status, reviewer, date)
- Queryable like any other data
- Syntax is explicit and parseable

**Why**: This is the core innovation. Graph semantics on plaintext.

---

## 8. Build for the Long Term

**Architecture decisions consider 5+ years.**

- Use stable APIs
- Follow Obsidian conventions
- Avoid clever hacks
- Document decisions
- Maintain Python backup

**Why**: Users invest time in their vaults. Don't break that.

---

## 9. Performance at Scale

**Support 10,000+ notes without pain.**

- Lazy loading where possible
- Progress indicators for long operations
- Chunked processing
- Index where needed
- Test with large vaults

**Why**: Real framework vaults get big.

---

## 10. Community Orientation

**Build for adoption and contribution.**

- Open source
- Good documentation
- Framework templates shareable
- Contribution guidelines
- Responsive to feedback

**Why**: Community amplifies impact.

---

## Decision Test

When making decisions, ask:
1. Does this keep data in plaintext? (Principle 1)
2. Can user leave and keep their data? (Principle 2)
3. Does this work without other plugins? (Principle 3)
4. What happens if X changes? (Principle 4)
5. Can user configure this? (Principle 5)

---

*Last Updated: 2025-12-05*
