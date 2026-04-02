# Changelog

All notable changes to Crosswalker will be documented in this file.

## [0.1.0] - 2026-04-02

### Added
- Import wizard with 4-step workflow (file select, column config, preview, generate)
- CSV parsing with PapaParse streaming for large files (>5MB)
- Column type detection and analysis (hierarchy, ID, text, numeric, date, tags, URL)
- Config save/load/match/browse system with fingerprint-based matching
- Generation engine creating folders and notes with `_crosswalker` metadata
- Real folder tree and sample note preview in Step 3
- Comprehensive settings tab (output path, key naming, array handling, link syntax)
- Debug logging system (toggle in settings, outputs to crosswalker-debug.log)
- ESLint setup with obsidian-plugin community rules
- Embedded test vault for development
