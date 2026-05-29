# Framework data provenance + licensing

This folder holds framework source data for realistic Crosswalker testing toward a **Unified Risk Ontology (URO)** with **CRI Profile at the center**, crosswalked to NIST CSF / 800-53 / ISO 27001 / SOC 2 / etc.

## Folder layout

```
Frameworks/
├── public/      ← committed (public-domain frameworks + laws/regs + your own generated notes)
└── _licensed/   ← GITIGNORED (raw copyrighted vendor files — local only, never committed)
```

The `_licensed/` folder is in `.gitignore`. Drop copyrighted source files there; they stay on your machine. Crosswalker's *generated* output (your own paraphrased concept notes + crosswalk junction notes) can live in `public/` and be committed — it's your derived work, not the vendor's raw text.

## Get-these list + licensing

| Framework | URO role | Source | License | Where it goes |
|---|---|---|---|---|
| **CRI Profile** v2.x | the spine (top-of-house authority) | cyberriskinstitute.org (free, registration) | © Cyber Risk Institute; redistribution restricted | 🔴 `_licensed/` |
| **NIST CSF 2.0** | first crosswalk hop from CRI | nist.gov / CSF reference tool (JSON/Excel) | US Gov public domain | 🟢 `public/` |
| **NIST 800-53 r5** | control catalog CRI/CSF map down to | github.com/usnistgov/oscal-content (OSCAL JSON) | public domain | 🟢 `public/` |
| **NIST 800-171** | DoD/CUI control set | usnistgov/oscal-content | public domain | 🟢 `public/` |
| **ISO/IEC 27001:2022** | Annex A control alignment | iso.org (purchase ~CHF 124) | © ISO — no redistribution | 🔴 `_licensed/` |
| **SOC 2 / AICPA TSC** | audit/attestation alignment | aicpa.org | © AICPA; restricted | 🔴 `_licensed/` |
| **CIS Controls v8.1** | operational control overlay | cisecurity.org (free, registration) | CC BY-NC-SA 4.0 (non-commercial) | 🟡 `_licensed/` (subset OK) |
| **MITRE ATT&CK** | threat → control coverage | github.com/mitre-attack/attack-stix-data | free, attribution required | 🟢 `public/` (attribute) |
| **FFIEC booklets / CAT legacy** | FI examiner mapping | ffiec.gov | public domain | 🟢 `public/` |
| **Secure Controls Framework** | metaframework + STRM crosswalks | securecontrolsframework.com (free CSV/OSCAL) | CC BY-ND 4.0 (no-derivatives) | 🟡 `_licensed/` |
| **PCI DSS 4.0** | payment control set | pcisecuritystandards.org | © PCI SSC; restricted | 🔴 `_licensed/` |
| **NYDFS 500 / DORA / HIPAA / CMMC** | regulatory authorities | state / EU / gov sites | public (law/reg) | 🟢 `public/` |

**Rule of thumb:** US-government frameworks (all NIST, FFIEC, HIPAA, CMMC) + actual laws/regs (NYDFS, DORA) are public domain → commit freely. Proprietary ones (CRI, ISO, SOC 2, PCI, CIS, SCF) stay in `_licensed/`. You can still *test* with them — just don't commit the raw source text.

## Per-file record

When you add a file, log it here so the corpus is reproducible and provably copyright-clean:

| File | Framework + version | Retrieved | License | Committed? |
|---|---|---|---|---|
| _(existing fixtures live in `tools/fixtures/realistic/` — subsets, synthetic-shape-correct)_ | | | | |
| | | | | |

## Pre-commit reminder

Before committing anything under `Frameworks/`: confirm no raw copyrighted vendor text landed in `public/` or in a generated note body. Concept-note *structure* (IDs, your own paraphrase) is yours; verbatim diagnostic-statement text from CRI/ISO/SOC2/PCI is theirs — keep it in `_licensed/` only.
