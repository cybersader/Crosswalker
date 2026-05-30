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

> Download links below are landing/download pages, not necessarily deep file links (those rot). Verify availability + version + registration/purchase terms at download time — sites change.

| Framework | URO role | Download | Format | License | Where it goes |
|---|---|---|---|---|---|
| **CRI Profile** v2.x | the spine (top-of-house authority) | [cyberriskinstitute.org/the-profile](https://cyberriskinstitute.org/the-profile/) (free, registration) | Excel | © Cyber Risk Institute; redistribution restricted | 🔴 `_licensed/` |
| **NIST CSF 2.0** | first crosswalk hop from CRI | [CPRT CSF 2.0](https://csrc.nist.gov/projects/cprt/catalog#/cprt/framework/version/CSF_2_0_0/home) · [nist.gov/cyberframework](https://www.nist.gov/cyberframework) | JSON / Excel | US Gov public domain | 🟢 `public/` |
| **NIST 800-53 r5** | control catalog CRI/CSF map down to | [usnistgov/oscal-content → SP800-53/rev5](https://github.com/usnistgov/oscal-content/tree/main/nist.gov/SP800-53/rev5) · [CPRT](https://csrc.nist.gov/projects/cprt/catalog#/cprt/framework/version/SP_800_53_5_1_1/home) | OSCAL JSON / Excel | public domain | 🟢 `public/` |
| **NIST 800-171 r3** | DoD/CUI control set | [usnistgov/oscal-content → SP800-171](https://github.com/usnistgov/oscal-content/tree/main/nist.gov/SP800-171) · [CPRT](https://csrc.nist.gov/projects/cprt) | OSCAL JSON / Excel | public domain | 🟢 `public/` |
| **ISO/IEC 27001:2022** | Annex A control alignment | [iso.org/standard/27001](https://www.iso.org/standard/27001) (purchase ~CHF 124) | PDF | © ISO — no redistribution | 🔴 `_licensed/` |
| **SOC 2 / AICPA TSC** | audit/attestation alignment | [AICPA Trust Services Criteria (2017, rev. 2022)](https://www.aicpa-cima.com/resources/download/2017-trust-services-criteria-with-revised-points-of-focus-2022) | PDF | © AICPA; restricted | 🔴 `_licensed/` |
| **CIS Controls v8.1** | operational control overlay | [cisecurity.org/controls/v8-1](https://www.cisecurity.org/controls/v8-1) (free, registration) · [CIS WorkBench](https://workbench.cisecurity.org/) (Excel/JSON exports) | Excel / JSON | CC BY-NC-SA 4.0 (non-commercial) | 🟡 `_licensed/` (subset OK) |
| **MITRE ATT&CK** | threat → control coverage | [mitre-attack/attack-stix-data](https://github.com/mitre-attack/attack-stix-data) · [attack.mitre.org](https://attack.mitre.org/) | STIX 2.1 JSON | free, attribution required | 🟢 `public/` (attribute) |
| **FFIEC booklets / CAT legacy** | FI examiner mapping | [ithandbook.ffiec.gov](https://ithandbook.ffiec.gov/) · [ffiec.gov](https://www.ffiec.gov/) | PDF / HTML | public domain | 🟢 `public/` |
| **Secure Controls Framework** | metaframework + STRM crosswalks | [SCF download](https://securecontrolsframework.com/scf-download/) · [STRM mapping](https://securecontrolsframework.com/set-theory-relationship-mapping-strm/) | Excel / CSV / OSCAL | CC BY-ND 4.0 (no-derivatives) | 🟡 `_licensed/` |
| **PCI DSS 4.0** | payment control set | [PCI SSC Document Library](https://www.pcisecuritystandards.org/document_library/) (agreement) | PDF | © PCI SSC; restricted | 🔴 `_licensed/` |
| **NYDFS 500** | NY cyber regulation | [dfs.ny.gov cybersecurity](https://www.dfs.ny.gov/industry_guidance/cybersecurity) | HTML / PDF | public (law) | 🟢 `public/` |
| **DORA** (EU 2022/2554) | EU operational-resilience reg | [EUR-Lex 2022/2554](https://eur-lex.europa.eu/eli/reg/2022/2554/oj) | HTML / PDF | public (law) | 🟢 `public/` |
| **HIPAA Security Rule** | health-sector control set | [hhs.gov HIPAA Security](https://www.hhs.gov/hipaa/for-professionals/security/index.html) | HTML / PDF | public domain | 🟢 `public/` |
| **CMMC** | DoD assessment model | [dodcio.defense.gov/CMMC](https://dodcio.defense.gov/CMMC/) | PDF | public domain | 🟢 `public/` |
| **NIST OSCAL catalogs** (interchange) | machine-readable catalogs | [usnistgov/oscal-content](https://github.com/usnistgov/oscal-content) | OSCAL JSON/XML/YAML | public domain | 🟢 `public/` |

**Rule of thumb:** US-government frameworks (all NIST, FFIEC, HIPAA, CMMC) + actual laws/regs (NYDFS, DORA) are public domain → commit freely. Proprietary ones (CRI, ISO, SOC 2, PCI, CIS, SCF) stay in `_licensed/`. You can still *test* with them — just don't commit the raw source text.

## Per-file record

When you add a file, log it here so the corpus is reproducible and provably copyright-clean:

| File | Framework + version | Retrieved | License | Committed? |
|---|---|---|---|---|
| _(existing fixtures live in `tools/fixtures/realistic/` — subsets, synthetic-shape-correct)_ | | | | |
| | | | | |

## Pre-commit reminder

Before committing anything under `Frameworks/`: confirm no raw copyrighted vendor text landed in `public/` or in a generated note body. Concept-note *structure* (IDs, your own paraphrase) is yours; verbatim diagnostic-statement text from CRI/ISO/SOC2/PCI is theirs — keep it in `_licensed/` only.
