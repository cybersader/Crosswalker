# Realistic test fixtures

Synthetic-but-structurally-correct CSV fixtures modeled on real compliance frameworks. Used by `tests/e2e/realistic-frameworks.spec.ts` to exercise real-world data patterns the synthetic mini fixtures don't cover:

- **Volume** (20-30 rows per fixture vs 3-5 in synthetic mini)
- **Hierarchy** — parent/child relationships preserved via `parent` column
- **Special characters in CURIEs** — parens (NIST 800-53 enhancements: AC-2(1)), dotted IDs (ISO: A.5.1.1; MITRE: T1078.001)
- **Real CSV quirks** — embedded commas (RFC-4180 quoted), long titles, multi-clause descriptions
- **UTF-8 handling** — em-dashes, smart quotes (ISO 27001)
- **Multi-framework vault state** — combined imports + crosswalk queries

**Important**: these fixtures are NOT authoritative copies of the real frameworks. They are structurally-correct synthetic data for testing. The actual framework catalogs are governed by their respective standards bodies (NIST, ISO, MITRE, FFIEC, CIS, etc.). Do NOT use these fixtures for compliance work.

## Files

### Framework input fixtures (one ontology per file)

| File | Models | Rows | Special characteristics |
|---|---|---|---|
| `nist-800-53-ac-family.csv` | NIST SP 800-53 Rev 5 Access Control family | ~22 | Parens in IDs (AC-2(1)); hierarchy; long titles; real-shaped descriptions |
| `nist-csf-2.0-govern-identify.csv` | NIST CSF 2.0 GOVERN + IDENTIFY functions | ~25 | Dotted IDs (GV.OC-01); 3-level hierarchy (Function → Category → Subcategory); category-level entries |
| `iso27001-2022-subset.csv` | ISO/IEC 27001:2022 Annex A subset | ~15 | Dotted IDs (A.5.1); em-dashes in titles; UTF-8 |
| `mitre-attack-persistence-subset.csv` | MITRE ATT&CK Enterprise — Persistence tactic | ~20 | Dotted technique IDs (T1078.001); sub-technique hierarchy |
| `cis-controls-v8-subset.csv` (Phase 4a, 2026-05-15) | CIS Controls v8 (Basic safeguards) | ~12 | Numeric-dotted IDs (CIS-1.1); 2-level hierarchy (Control → Safeguard) |
| `soc2-trust-services-subset.csv` (Phase 4a, 2026-05-15) | SOC 2 Trust Services Criteria (Common + Availability) | ~10 | Mixed-prefix IDs (CC1.1 / A1.1); category groupings; COSO-aligned principle naming |

### Cross-framework crosswalk fixtures

| File | Maps | Mappings | Format | Special characteristics |
|---|---|---|---|---|
| `csf-to-800-53-crosswalk.csv` | NIST CSF 2.0 → NIST SP 800-53 r5 (OLIR) | ~30 | CSV | Real-shaped STRM predicates; SSSOM-shaped envelope columns; same-family crosswalk |
| `nist-csf-to-mitre-attack.sssom.tsv` (Phase 4a, 2026-05-15) | NIST CSF 2.0 → MITRE ATT&CK Enterprise | ~12 | SSSOM TSV | Cross-domain (defensive controls → offensive techniques); modeled on MITRE Mappings Explorer structure |
| `iso27001-to-soc2.sssom.tsv` (Phase 4a, 2026-05-15) | ISO 27001:2022 Annex A → SOC 2 TSC | ~10 | SSSOM TSV | Mixed match types (exact / close / broad); aggregates public ISO ↔ SOC 2 crosswalks structurally |

### Lifecycle coverage matrix (which fixture exercises which pipeline stage)

| Stage | Fixtures used |
|---|---|
| **Input** — CSV → Tier 1 markdown | All 6 framework CSVs above |
| **Crosswalk import** — SSSOM TSV → junction notes | All 3 crosswalk files above (`csf-to-800-53` + the 2 new TSVs) |
| **Tier 2 projection** — markdown → sqlite cache | Exercised end-to-end by any imported fixture |
| **Query layer** — Bases + crosswalkerPivot | The 6 reference recipes in `recipes/v0-1/` reference these ontology IDs |
| **Cross-domain demo** — Crosswalker's distinguishing capability | `nist-csf-to-mitre-attack.sssom.tsv` — the most compelling test of what Crosswalker can do that other compliance tools can't (defensive-to-offensive crosswalk across domains) |

## Used by

- `tests/e2e/realistic-frameworks.spec.ts` — milestone-level integration test exercising the full pipeline (import → projection → query → closure) across all framework fixtures

## Maintenance

When the source frameworks update:
- These fixtures don't need to update unless the structural patterns change
- Add new patterns (e.g., a new framework with a different ID shape) by adding a new fixture + extending the test spec
- DO NOT make these fixtures authoritative — for that, use the (forthcoming) marketplace bundle pattern with proper provenance
