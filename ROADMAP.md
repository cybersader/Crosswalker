# Crosswalker Roadmap

Crosswalker is a meta-system for ontology lifecycle management. Architecture decisions come first, features are built on that foundation. Full docs roadmap with linked rationale: https://cybersader.github.io/crosswalker/reference/roadmap/

## Done (0.1.0 MVP)

- [x] Import wizard (CSV parsing, column config, preview, generation)
- [x] Config save/load/match system with fingerprinting
- [x] Generation engine with `_crosswalker` metadata
- [x] Documentation site (70+ pages)
- [x] Unit tests + CI/CD

## Foundation — "Get the architecture right"

- [ ] EvolutionPattern taxonomy — classify how ontologies evolve (standalone spec)
- [ ] FrameworkConfig v2 schema — evolution metadata, config-as-code format
- [ ] _crosswalker metadata v2 — version tracking, migration history
- [ ] Migration strategy matrix — evolution pattern → SCD type → handling
- [ ] CLI architecture — core library extractable from Obsidian API layer
- [ ] PII scanning in CI/CD

## Formats — "Import anything, transform it properly"

- [ ] Complete import wizard UI (redesigned around v2 schema)
- [ ] XLSX parser + JSON/JSONL parser
- [ ] Transform system (20+ types)
- [ ] E2E test suite (built from spec)

## Crosswalks — "Link frameworks to each other and to evidence"

- [ ] Cross-framework linking engine
- [ ] Link insertion commands with search modal
- [ ] Batch re-import with version awareness
- [ ] CLI implementation (headless operations)

## Evolution — "The meta-system"

- [ ] Progressive classification UX (community → wizard → auto-detect)
- [ ] Evolution profile registry
- [ ] Migration strategy engine
- [ ] Stale crosswalk detection

## Community — "Share and scale"

- [ ] Community config registry
- [ ] OSCAL export
- [ ] Compliance dashboards
- [ ] Community plugin submission
- [ ] Spec publication (EvolutionPattern taxonomy as standalone standard)
