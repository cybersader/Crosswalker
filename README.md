# Crosswalker

[![GitHub](https://img.shields.io/github/license/cybersader/Crosswalker)](https://github.com/cybersader/Crosswalker)

Import structured ontologies (frameworks, taxonomies, any hierarchical data) into Obsidian with hierarchical folder structures, typed links, and metadata.

**Repository**: https://github.com/cybersader/Crosswalker

## Features

- **Import structured data** from CSV, XLSX, or JSON files
- **Hierarchical folder structures** from your data columns
- **YAML frontmatter** with configurable property mapping
- **WikiLinks** for crosswalks between framework nodes
- **Typed links with metadata** (coming in Phase 2)

## Installation

### From Community Plugins (Coming Soon)

1. Open Settings → Community Plugins
2. Search for "Crosswalker"
3. Install and enable

### Manual Installation

1. Download `main.js`, `manifest.json`, and `styles.css` from the latest release
2. Create folder: `your-vault/.obsidian/plugins/crosswalker/`
3. Copy the files into that folder
4. Enable the plugin in Settings → Community Plugins

## Usage

### Basic Import

1. Run command: `Crosswalker: Import Framework`
2. Select your CSV/XLSX/JSON file
3. Map columns to:
   - **Hierarchy levels** (folders)
   - **Frontmatter properties**
   - **CrossWalk links**
4. Preview and generate

### Example

Starting with a NIST 800-53 spreadsheet:

| Control Family | Control ID | Control Name | Related Controls |
|---------------|------------|--------------|------------------|
| Access Control | AC-1 | Policy and Procedures | AC-2, AC-3 |
| Access Control | AC-2 | Account Management | AC-1, AC-3, AC-5 |

Generates:

```
Frameworks/
└── NIST-800-53/
    └── Access Control/
        ├── AC-1.md
        └── AC-2.md
```

Where `AC-1.md` contains:

```yaml
---
control_id: AC-1
control_name: Policy and Procedures
control_family: Access Control
related_controls:
  - "[[AC-2]]"
  - "[[AC-3]]"
---

## Description

...
```

## Configuration

See Settings → Crosswalker for:

- Default output path
- Key naming style (snake_case, camelCase, etc.)
- Array handling (keep as array, stringify, etc.)
- Empty value handling
- Frontmatter style (flat, nested)
- Link syntax options

## Roadmap

- [x] Phase 0: Foundation & architecture
- [ ] Phase 1: Import MVP (CSV, XLSX, JSON → notes)
- [ ] Phase 2: Link metadata system
- [ ] Phase 3: Query & aggregation views
- [ ] Phase 4: Framework templates & ecosystem

## Development

```bash
# Install dependencies
npm install

# Development mode (watch)
npm run dev

# Production build
npm run build

# Run tests
npm test
```

## Related Projects

- [Crosswalker Python Tool](https://github.com/cybersader/Crosswalker) - Python CLI for framework import
- [Awesome Obsidian & Cyber](https://github.com/cybersader/awesome-obsidian-and-cyber) - Curated resources

## License

MIT
