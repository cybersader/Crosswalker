---
title: "Ch 43 deliverable A: Empirical release-diff evidence"
description: "Pre-read research deliverable A for Challenge 43. Measures identifier survival, prose drift, classification movement, and lineage cardinality across ATT&CK, CIS Controls, NIST SP 800-53, and NIST CSF releases, separating ordinary content drift from structural transitions."
tags: [research, deliverable, version-migration, semantic-diff, release-evidence, lineage, ch-43, deliverable-a]
date: 2026-08-27
sidebar:
  label: "Ch 43a · Release-diff evidence"
  order: -20260827.3
---

# Challenge 43 pre-read: empirical release-diff evidence

**Purpose:** replace release-migration speculation with measured change distributions. This is evidence only, not a migration-design recommendation.

## Distribution first

### Direct or reconstructable release pairs

| Pair | Population | Identifier survival | New / old-only | Survivor prose: identical | Survivor prose: trivial drift | Survivor prose: material drift | Structural or classification moves | Split / merge in this pair |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| MITRE ATT&CK Enterprise 15.1 → 16.1, direct workbook diff | 1,584 old; 1,654 new entities | 1,584 / 1,584 old IDs (100%); 95.8% of new corpus | 70 new (4.2% of new); 0 old-only | 1,511 / 1,584 (95.4%) | 5 / 1,584 (0.3%) | 68 / 1,584 (4.3%) | 0 tactic moves; 0 parent moves; 98 / 637 surviving techniques (15.4%) changed platform and/or data-source membership | 0 observed; this release was additive for the exported entity set |
| CIS Controls 8.1 → 8.1.2, direct workbook diff | 171 rows: 18 controls + 153 safeguards | 171 / 171 (100%) | 0 / 0 | 145 / 171 (84.8%) | 15 / 171 (8.8%) | 11 / 171 (6.4%) | 4 / 171 (2.3%): 1 asset-class change, 3 security-function changes | 0 / 0 |
| CIS Controls 8.0 → 8.1, reconstructed from the official old/new columns in the 8.1 change-log workbook | 171 rows | 171 / 171 (100%) | 0 / 0 | 133 / 171 (77.8%) | 3 / 171 (1.8%) | 35 / 171 (20.5%) | 88 / 171 (51.5%) changed asset class and/or security function; 81 asset-class and 33 function changes overlap | 0 / 0 |
| NIST SP 800-53 Rev. 4 → Rev. 5, publisher comparison rather than a two-corpus diff | 1,189 Rev. 5 comparison rows | Not directly measurable from the workbook | 268 new (22.5%): 66 base controls + 202 enhancements; 90 withdrawn (7.6%) | 227 labeled `N` / unchanged (19.1%) | Not separable | 604 surviving rows with one or more change labels (50.8%); 698 / 1,189 marked more than editorial/administrative | Published labels cover title, control text, parameters, discussion, and baseline membership | See the Appendix J lineage subset below: many-to-many change is common there |

**Normalization used for prose:** exact string equality first; then a conservative trivial normalizer removes whitespace/punctuation differences (and, for ATT&CK, citation markers, Markdown destinations, and HTML tags). Any remaining token change is counted as material. “Material” here means content changed, not that an auditor would necessarily judge the operational requirement changed.

### Lineage-heavy subsets: how often one-to-one identity is insufficient

| Dataset | Measured lineage shape |
|---|---|
| CSF 1.1 withdrawals embedded in the CSF 2.0 CPRT export | 91 withdrawal records: 19 `Moved`, 72 `Incorporated into`. Parsed destinations: 54 one-to-one (59.3%), 34 one-to-many (37.4%), 3 broad prose-only destinations (3.3%). The 136 edges land on 78 destination IDs; 32 destination IDs receive multiple old IDs, so many-to-one is also common. |
| NIST Rev. 4 Appendix J → Rev. 5 mapping | 26 old privacy controls: 10 one-to-one (38.5%), 15 one-to-many (57.7%), 1 with no specific successor (3.8%). There are 54 edges to 45 unique Rev. 5 targets; 8 targets aggregate multiple old controls and 12 old controls participate in those merges. |
| ATT&CK 2020 sub-technique transition crosswalk | 266 old technique IDs: 126 remain techniques (47.4%), 114 become one sub-technique (42.9%), 8 deprecated without replacement (3.0%), 6 “one or more techniques became new technique” (2.3%), 6 “multiple techniques became new sub-technique” (2.3%), 3 merged into an existing technique (1.1%), 3 became multiple sub-techniques (1.1%). |
| Current local Enterprise ATT&CK STIX lifecycle markers | 157 revoked objects; all 157 have exactly one `revoked-by` successor in this corpus. 289 deprecated objects have no successor relation. This one-successor convention does **not** encode old-technique splits such as T1064; MITRE used a separate crosswalk for those. |

## Pair 1: ATT&CK Enterprise 15.1 → 16.1

### Corpus and method

Directly diffed:

- `Frameworks/enterprise-attack-v15.1.xlsx`
- `Frameworks/enterprise-attack-v16.1.xlsx`

Entity population is the union of the exported concept sheets: techniques, tactics, software, groups, campaigns, mitigations, and data sources. Matrix cells, citations, and relationship rows are excluded from identifier-survival counts because they are not concept IDs.

| Entity type | Old | New | Survive | New | Raw-identical descriptions | Trivial | Material |
|---|---:|---:|---:|---:|---:|---:|---:|
| Techniques | 637 | 656 | 637 | 19 | 578 | 5 | 54 |
| Tactics | 14 | 14 | 14 | 0 | 13 | 0 | 1 |
| Software | 677 | 710 | 677 | 33 | 671 | 0 | 6 |
| Groups | 148 | 159 | 148 | 11 | 143 | 0 | 5 |
| Campaigns | 28 | 34 | 28 | 6 | 27 | 0 | 1 |
| Mitigations | 43 | 44 | 43 | 1 | 42 | 0 | 1 |
| Data sources | 37 | 37 | 37 | 0 | 37 | 0 | 0 |
| **Total** | **1,584** | **1,654** | **1,584** | **70** | **1,511** | **5** | **68** |

### What “changed” means in the actual data

The local data and MITRE’s machine changelog expose different but complementary layers:

- The entity workbook is completely additive for this pair: every old exported entity ID survives.
- Only 4.3% of survivors materially changed their primary description.
- Yet MITRE classifies 376 surviving Enterprise objects (23.7%) as changed: 14 major-version changes, 197 minor-version changes, and 165 patches.
- The gap is metadata and relations. Among techniques, 91 changed platform membership and 15 changed data-source membership; the union is 98 techniques. The cloud-platform refactor replaced memberships such as Azure AD / Office 365 / Google Workspace with Identity Provider / Office Suite.
- One stable-ID rename occurred: `T1001.003`, **Data Obfuscation: Protocol Impersonation** → **Data Obfuscation: Protocol or Service Impersonation**.
- No tactic or parent/sub-technique assignment changed under a stable ID.

This means a vendor’s “changed object” count is not a prose-drift count. A semantic diff must keep field-level change classes separate or the release looks much noisier than its definitions actually are.

### Material prose examples under stable IDs

| ID | Observed change |
|---|---|
| `T1496` Resource Hijacking | Large rewrite. The old description centered on cryptocurrency mining and browser-based mining; the new description generalizes resource hijacking and enumerates multiple resource-abuse forms. Token-set similarity: 0.233. |
| `T1558` Steal or Forge Kerberos Tickets | Same identifier and opening claim, but the explanation was substantially reworked and expanded around Kerberos ticket behavior. Similarity: 0.347. |
| `S0377` Ebury | Changed from a concise “SSH backdoor targeting Linux” definition to an updated OpenSSH backdoor and credential-stealer description covering Linux servers and container hosts and attributing its development/use. Similarity: 0.115. |
| `M1015` Active Directory Configuration | Replaced a one-line generic instruction with a detailed control description and concrete configuration examples. Similarity: 0.053. |

### Splits, merges, deprecation, and withdrawal

This direct pair contains no old-only Enterprise IDs and no split/merge evidence. Near-description matching therefore had no disappeared-to-new candidates to evaluate.

The official v15.1→v16.0 machine changelog agrees for Enterprise: 70 additions, 0 revocations, 0 deprecations, and 0 deletions. It does record one Mobile deprecation. The downloadable Excel entity sheets do not include `revoked` or `x_mitre_deprecated` columns, so lifecycle state is lost in that representation; the STIX bundle and machine changelog retain it.

The current local `enterprise-attack.json` provides a larger lifecycle survey:

- 157 `revoked: true` objects, all with one `revoked-by` relationship to a replacement.
- 289 `x_mitre_deprecated: true` objects, with no successor relationship by definition.
- `T1086` PowerShell is explicitly revoked by `T1059.001` PowerShell.
- Split lineage is not reliably represented by `revoked-by`. In the separate 2020 crosswalk, deprecated `T1064` Scripting maps to four successors: `T1059.004`, `.005`, `.006`, and `.007`.

**Detection confidence:** high for explicit STIX/crosswalk relations; no automatic lexical split inference was needed or justified for this pair.

## Pair 2: CIS Controls 8.1 → 8.1.2

### Corpus and method

Directly diffed:

- `Frameworks/_licensed/CIS_Controls_Version_8.1_6_24_2024.xlsx`
- `Frameworks/CIS_Controls_Version_8.1.2___March_2025.xlsx`

The direct pair contains the same 18 control IDs and 153 safeguard IDs. All titles and parent-control assignments survive.

### Text drift

- 145 descriptions are byte-identical.
- 15 differ only after punctuation/whitespace-sensitive comparison and collapse under normalization.
- 11 materially differ.

Representative material changes:

| ID | Old → new shape |
|---|---|
| `3.2` | Removes “annually” from “Inventory sensitive data annually, at a minimum,” while retaining annual review language. |
| `11.1` | Adds that the documented data-recovery process includes detailed backup procedures. |
| `12.6` | Recasts a single “secure network management and communication protocols” statement into distinct management-protocol and communication-protocol expectations. |
| `17.5` | Adds relevant third parties to incident-response role assignment. |

### Structural/classification moves

Four stable safeguard IDs changed classification:

- `8.4`: asset class Data → Network.
- `16.3`: security function Protect → Detect.
- `16.11`: Identify → Protect.
- `16.13`: Govern → Detect.

There are no additions, withdrawals, renames, splits, or merges in the direct 8.1→8.1.2 pair.

## Embedded pair: CIS Controls 8.0 → 8.1

The official 8.1 change-log workbook contains side-by-side current and prior values, so it supports a reconstructable field diff even though the standalone v8 workbook is not local.

Measured from its old/new columns:

- All 171 IDs survive; no additions or withdrawals are represented.
- 35 descriptions materially change (20.5%).
- 81 asset-class assignments change and 33 security-function assignments change; 88 safeguards/controls change at least one of those classifications (51.5%).
- The vendor dedicates separate sheets to 38 description rows, 33 security-function rows, 81 asset-class rows, and 65 glossary rows. The 38 description-sheet rows include the header; the reconstructed data comparison yields 35 material, 3 trivial changes.

The dominant change is therefore not identity churn but reclassification. Stable identifiers conceal a large amount of downstream grouping/query movement.

## NIST SP 800-53 Rev. 4 → Rev. 5: bounded published-data measurement

No Rev. 4 control catalog is present locally. I downloaded and measured NIST’s official supplemental comparison workbook instead. It is a per-control/per-enhancement analysis authored by MITRE for ODNI and published by NIST; it is not a two-body prose corpus.

### What the publisher considers worth recording

Across 1,189 rows, the workbook publishes these overlapping field-level labels:

| Change label | Rows |
|---|---:|
| Changes discussion | 330 |
| Changes control text | 316 |
| Unchanged (`N`) | 227 |
| New control enhancement | 202 |
| Changes title | 155 |
| Adds parameter | 132 |
| Adds to Privacy Control Baseline | 96 |
| Adds discussion | 92 |
| Withdrawn | 90 |
| Changes parameter | 70 |
| New base control | 66 |
| Adds control text | 42 |
| Removes parameter | 21 |
| Removes control text | 1 |

It also publishes a separate “more than editorial or administrative change?” judgment: 698 yes, 491 no. That impact distinction is a first-class vendor artifact, not something inferable from identifier survival alone.

### Explicit successor and split/merge evidence

The comparison workbook uses prose such as:

- `AC-2(10)` → “Incorporated into AC-2k” (the workbook appears to contain a likely typo or shorthand here).
- `AT-3(4)` → “Moved to AT-2(4).”
- `AU-8(1)` → “Moved to SC-45(1).”
- New controls also say what they incorporate, e.g. `CM-14` incorporates withdrawn `CM-5(3)`.

The separate Appendix J mapping is a stronger cardinality test. Its own introduction says very few old privacy controls transferred in their entirety and that elements were usually distributed among multiple Rev. 5 controls.

Measured result:

- 26 old privacy controls produce 54 lineage edges to 45 unique Rev. 5 controls.
- 15 / 26 old controls split across multiple destinations.
- 8 destination controls merge material from multiple old controls.
- `IP-2` Individual Access maps to five destinations: `AC-1`, `AC-3(14)`, `PM-20`, `PT-5`, `PT-6`.
- `PT-3` receives material from three old controls: `AP-2`, `UL-1`, `UL-2`.
- `AR-7` has no specific destination; the workbook says only that discretionary enhancements relate to automation.

**Detection confidence:** high for the published mapping edges; medium for interpreting “incorporated” as full semantic inheritance because NIST explicitly cautions that mappings are not necessarily equivalence.

## CSF 1.1 → 2.0: successor-marker measurement without a full pair

A full CSF 1.1 export is not local, so identifier survival and prose drift cannot be computed honestly. CSF 2.0 itself retains unusually rich old-version lineage in both local representations:

- `Frameworks/csf2.xlsx` contains 91 human-readable cells such as `ID.AM-06: [Withdrawn: Incorporated into GV.RR-02, GV.SC-02]`.
- The CPRT JSON snapshots contain 91 separate `element_type: "withdraw_reason"` records. The two dated local snapshots are byte-identical, so they are not a release pair.

The marker graph is highly non-one-to-one:

- 19 `Moved` records.
- 72 `Incorporated into` records.
- 34 old IDs point to 2–5 successor IDs.
- 32 successor IDs receive material from multiple old IDs.
- Three broad markers say only “other Categories and Functions” or “other Protect Categories,” so even the official machine-readable export sometimes declines to name a specific successor.

Examples:

- `ID.AM-06` → `GV.RR-02`, `GV.SC-02`.
- `ID.SC-01` → five successors: `GV.RM-05`, `GV.SC-01`, `GV.SC-06`, `GV.SC-09`, `GV.SC-10`.
- `ID.IM-03` receives material from seven withdrawn IDs.

**Reliability:** the CPRT element type is structurally reliable; the successor list inside `text` remains parseable prose rather than typed edges. The Excel bracket form is human-friendly but requires text parsing.

## Vendor-publication survey: the change shapes practitioners are given

| Publisher artifact | Change shapes explicitly published | Empirical implication |
|---|---|---|
| MITRE ATT&CK release notes + machine changelog | New; major, minor, other version changes; patches; revocations; deprecations; deletions; per-field detailed diffs; changed detections/mitigations | ATT&CK distinguishes immaterial patches from versioned content changes and distinguishes replacement (`revoked`) from retirement without replacement (`deprecated`). A “changed object” may have no prose drift. |
| MITRE ATT&CK transition crosswalks | Remains; became sub-technique; deprecated; merge into existing; several old → one new; one old → several new | Split/merge is rare in an ordinary release but prominent enough during model restructures to require a dedicated artifact. |
| NIST SP 800-53 comparison workbook | New/withdrawn; title, control-text, parameter, discussion, and baseline changes; per-row significance judgment; incorporated/moved-to prose | NIST publishes both semantic field changes and an impact judgment. Stable IDs are not an adequate proxy for implementation/test impact. |
| NIST Appendix J mapping | Explicit one-to-many and many-to-one source/target control mapping | In a catalog integration, many-to-many lineage is the normal case, not an edge anomaly. |
| NIST CSF 2.0 Reference Tool / CPRT export | Withdrawn markers with `Moved` or `Incorporated into` successor prose, including multi-target lists | Old IDs can be deliberately retained as tombstone/lineage records in the new release. |
| CIS Controls 8.1 change log | Old/new description, asset class, and security function; dedicated glossary and methodology sheets | CIS treats reclassification and vocabulary change as release-level migration concerns even when every identifier survives. |

## Findings most likely to change an architect’s judgment

1. **Stable-ID survival is high, but it is not the same as “unchanged.”** ATT&CK preserved 100% of old exported IDs while 23.7% of survivors were vendor-classified as changed and 15.4% of techniques moved across platform/data-source classifications. CIS 8.0→8.1 preserved all IDs while 51.5% changed classification.
2. **Split/merge frequency is release-shape dependent, not globally rare.** It is zero in the ordinary ATT&CK 15.1→16.1 and CIS point-release pairs, but 57.7% of NIST Appendix J controls split across multiple Rev. 5 targets, and CSF’s embedded withdrawal graph has 34 one-to-many old IDs plus 32 many-to-one destinations.
3. **Publisher lifecycle semantics are richer than a boolean deprecated flag.** ATT&CK distinguishes revoked-with-successor from deprecated-without-successor; CSF distinguishes moved from incorporated and sometimes names several successors; NIST additionally publishes whether a change affects implementation/testing.
4. **The same identifier can carry a genuinely new definition.** Material prose drift affects 4.3% of ATT&CK survivors and 6.4% of CIS 8.1→8.1.2 survivors; examples include complete rewrites under `M1015` and `S0377`.
5. **Export format can erase migration evidence.** ATT&CK Excel lacks revoked/deprecated fields present in STIX; CSF Excel encodes successor data in bracketed prose while CPRT gives it a distinct record type but still leaves destinations in text.

## What I could not measure and why

- **CSF 1.1 → 2.0 full survival and prose drift:** no local CSF 1.1 corpus. CSF 2.0’s 91 embedded withdrawal records allow lineage measurement but not a complete two-release diff.
- **SP 800-53 Rev. 4 → Rev. 5 exact/trivial/material prose distribution:** no local Rev. 4 catalog. The official comparison workbook summarizes field changes and significance but does not provide both full prose bodies side by side.
- **CIS Controls v7 → v8:** no local v7/v8 pair. The available direct pair is 8.1→8.1.2; the 8.1 change log embeds enough old values to reconstruct 8.0→8.1 only.
- **Automatic split/merge recall:** the directly diffable pairs have no disappeared IDs, so lexical candidate detection had nothing to test. Split/merge counts therefore come from explicit publisher mappings, not inferred similarity.
- **Operational impact of “material” prose drift:** the normalization detects content change, not legal/control significance. NIST’s explicit Y/N impact field shows why a separate significance judgment exists.
- **CIS licensing scope:** aggregate measurements are reported, but the older 8.1 workbook resides under `_licensed`; no large verbatim excerpts from it are reproduced here.

## Sources

### Local corpora

- `Frameworks/enterprise-attack-v15.1.xlsx`
- `Frameworks/enterprise-attack-v16.1.xlsx`
- `Frameworks/enterprise-attack.json`
- `Frameworks/csf2.xlsx`
- `Frameworks/cprt_CSF_2_0_0_05-31-2026.json`
- `Frameworks/cprt_CSF_2_0_0_06-01-2026.json`
- `Frameworks/_licensed/CIS_Controls_Version_8.1_6_24_2024.xlsx`
- `Frameworks/CIS_Controls_Version_8.1.2___March_2025.xlsx`
- `Frameworks/CIS_Controls_Version_8.1.2_Change_Log___March_2025.xlsx`
- `Frameworks/sp800-53r5-control-catalog.xlsx`

### Publisher sources

- MITRE ATT&CK, [October 2024 / v16 updates](https://attack.mitre.org/resources/updates/updates-october-2024/)
- MITRE ATT&CK, [v15.1→v16.0 machine changelog](https://attack.mitre.org/docs/changelogs/v15.1-v16.0/changelog.json)
- MITRE ATT&CK, [sub-technique transition crosswalk](https://attack.mitre.org/docs/subtechniques/subtechniques-crosswalk.json)
- MITRE, [ATT&CK STIX usage: revoked and deprecated objects](https://github.com/mitre-attack/attack-stix-data/blob/master/USAGE.md)
- NIST, [SP 800-53 Rev. 5 publication and supplemental material](https://csrc.nist.gov/pubs/sp/800/53/r5/upd1/final)
- NIST, [Rev. 4→Rev. 5 comparison workbook](https://csrc.nist.gov/files/pubs/sp/800/53/r5/upd1/final/docs/sp800-53r4-to-r5-comparison-workbook.xlsx)
- NIST, [Rev. 4 Appendix J→Rev. 5 mapping](https://csrc.nist.gov/files/pubs/sp/800/53/r5/upd1/final/docs/sp800-53r4-appj-to-r5-comparison.xlsx)
- CIS, [CIS Controls v8.1 change-log landing page](https://www.cisecurity.org/insights/white-papers/cis-critical-security-controls-v8-1-change-log)
