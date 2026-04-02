# Related Projects Ecosystem

## Core Project

### Crosswalker (Python)
- **Repo**: https://github.com/cybersader/Crosswalker
- **What it does**: Transforms tabular framework data (CSV/XLSX) into Obsidian-ready folder structures with markdown files and YAML frontmatter
- **Current state**: Working prototype, handles NIST, CIS, MITRE frameworks
- **Tech**: Python, Pandas, config-driven architecture
- **Key patterns**: `FrameworkConfig` and `LinkConfig` classes for modular framework onboarding

## Supporting Tools

### Chunky (Python)
- **Repo**: https://github.com/cybersader/chunky
- **What it does**: Memory-efficient CSV processing via streaming chunks
- **Capabilities**:
  - Pivot table generation
  - CSV joining (stream large + hold small in memory)
  - Deduplication by key columns
  - Column statistics
- **Relevance to Crosswalker**: Patterns for handling large framework datasets without memory overflow

### Jsonaut (Python)
- **Repo**: https://github.com/cybersader/jsonaut
- **What it does**: Flatten massive JSON → CSV with custom transformations
- **Key patterns**:
  - MVC architecture
  - JSON config files drive execution
  - Extensible function system
  - GUI for non-technical users
- **Relevance to Crosswalker**:
  - Config-driven pipeline pattern
  - GUI approach for accessibility
  - Large file handling strategies

## Community Context

### Awesome Obsidian & Cyber
- **Repo**: https://github.com/cybersader/awesome-obsidian-and-cyber
- **What it is**: Curated resources bridging cybersecurity + Obsidian
- **Key sections**:
  - Starter vaults (SecOps, GRC, IR templates)
  - Cyber function workflows
  - Corporate deployment patterns
- **Relevance**:
  - User discovery channel
  - Use case validation
  - Community building foundation

## How They Connect

```
┌─────────────────────────────────────────────────────────┐
│                    CROSSWALKER                          │
│         (Framework import + structure generation)       │
└─────────────────────┬───────────────────────────────────┘
                      │
        ┌─────────────┼─────────────┐
        ▼             ▼             ▼
┌───────────┐  ┌───────────┐  ┌───────────┐
│  CHUNKY   │  │  JSONAUT  │  │ AWESOME   │
│ (Large    │  │ (JSON     │  │ (Community│
│  CSV ops) │  │  flatten) │  │  context) │
└───────────┘  └───────────┘  └───────────┘
        │             │             │
        └─────────────┼─────────────┘
                      ▼
         ┌────────────────────────┐
         │   OBSIDIAN PLUGIN      │
         │   (Future: GUI layer)  │
         └────────────────────────┘
```

## Technology Stack Implications

**Current (Python-centric)**:
- Great for data processing
- Not native to Obsidian
- Requires separate execution

**Future (JavaScript/TypeScript)**:
- Native Obsidian plugin compatibility
- Can port logic from Python tools
- Live integration with vault

**Hybrid approach possible**:
- Python for heavy data processing (import)
- JS plugin for interactive features (linking, querying)

---

*The ecosystem shows a pattern: config-driven, extensible tools for data transformation. The plugin should follow similar principles.*
