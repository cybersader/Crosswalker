---
title: "Ch 45: Organizational rollout readiness — what actually blocks real use at work"
description: "Fresh-agent research deliverable for Challenge 45. Verdict: Crosswalker supports a controlled desktop pilot now (one designated importer, one dedicated vault, pinned sources, version-qualified output folders, immutable generated notes, Skip existing, tested restore), but is NOT ready for automated or audit-defensible evidence-gap reporting. Five ranked blockers, each with repository evidence and a minimum current control: Replace-mode re-import can destroy prose in ordinary generated bodies; the shipped evidence views do not implement the machine contract (the Base checks length(evidence) == 0 but the NIST recipe emits no evidence property, and the orphan recipe queries crosswalk fields that evidence junctions do not use); Tier 2 OPFS isolation between vaults is unproven; source-content licensing differs per framework and the MIT license on the code does not cover imported prose; concurrent regeneration has no cross-client lock. Includes a five-file internal package, an official NIST pilot transform with expected counts, a corrected evidence-junction contract, a per-framework sharing matrix, required restore drills, and an explicit not-measured table naming the exact E2E spec that would settle each unknown."
tags: [research, deliverable, rollout, deployment, adoption, collaboration, evidence, readiness, licensing, ch-45]
date: 2026-08-19
sidebar:
  label: "Ch 45 · Org rollout readiness"
  order: -20260819
---

# Challenge 45: Organizational rollout readiness

## Bottom line

- **Yes, Crosswalker can be used at work now, but only as a controlled desktop pilot with one designated importer.**
- The importer uses a pinned five-file build, a new versioned output folder, `Skip existing`, a clean snapshot, and exact count/schema checks.
- Generated framework notes are importer-owned and immutable. Evidence, analysis, and reports live in separate notes.
- Collaborators do **not** need Crosswalker installed to read Markdown, follow wikilinks, or use ordinary Obsidian Bases. They need it only for imports, Crosswalker commands, the custom pivot view, Tier 2 queries, exporters, or query-view regeneration.
- **No, the current build is not ready for automated or audit-defensible evidence-gap reporting.** The shipped evidence views and public example do not implement the machine contract correctly.
- If IT prohibits unlisted plugins, the approved storage cannot hold the allowed metadata, or restricted framework rights are unresolved, the applicable branch is a stop.
- If the owner accepts manually validated evidence links and independently reconciled pilot results, useful work can begin this month.

## Severity interpretation

| Severity | Meaning in this report |
|---|---|
| `blocker-single` | Stops one person using the affected workflow usefully at work. A conditional row blocks only when its condition is true. |
| `blocker-team` | Solo operation can proceed, but the stated team-sharing branch cannot. |
| `degrades` | Real operational or integrity friction with a current procedural workaround. |
| `can-wait` | Genuine release or lifecycle work that is outside the first controlled pilot. |

## Ranked findings

### `blocker-single`

| Rank | Claim | Consequence and branch | Repository evidence | Minimum current control |
|---:|---|---|---|---|
| 1 | **Replace-mode re-import can silently destroy evidence, embeds, links, or analyst prose in ordinary generated-note bodies. It can also lose preserved frontmatter when the metadata cache has no current entry.** | If anyone writes work into generated bodies and later selects Replace, one person can lose work without a merge boundary. The quick-start promise that anything the user wrote stays put is false for ordinary bodies. | Both generation entry points merge selected frontmatter, rebuild the whole note, and call `vault.modify`; ordinary bodies are not read or merged (`src/generation/generation-engine.ts:458-500`, `1799-1832`). `readExistingFrontmatter` returns `{}` on a cache miss (`src/generation/generation-engine.ts:595-603`). Only special enrichment hubs preserve prose (`src/generation/generation-engine.ts:2046-2126`). The contradictory promise is in `docs/src/content/docs/getting-started/quick-start.mdx:71`. | **Never use Replace on annotated ordinary notes.** Use `Skip existing`; treat the generated folder as immutable; keep evidence and prose elsewhere; snapshot first. Waiting for an undefined “cache settlement” is not an acceptable safety control. |
| 2 | **The shipped evidence workflow cannot yet support trustworthy control-coverage decisions.** | If the job requires “which controls have valid evidence?” to be answered automatically and defensibly now, owner use is blocked. Manual mapping remains possible. | The shipped Base template checks `length(evidence) == 0`, but the NIST recipe emits no `evidence` property (`src/views/recipe-templates.ts`; `recipes/import/nist-800-53-flat.json`). The public GRC guide counts every backlink, including hierarchy and index links (`docs/src/content/docs/getting-started/grc-teams.mdx`). `recipes/v0-1/orphan-controls.json` expects crosswalk fields `subject_id`/`predicate_id`, while evidence junctions use `subject`/`predicate`/`object`. `src/views/query-composer.ts` is pure and has no live source resolver or renderer caller. The evidence starter recipe is not registered in `src/import/recipe-registry.ts`. | Do not use the shipped no-evidence view or backlink count for management, audit, or compliance conclusions. Use the corrected junction contract below, validate every note, and independently reconcile the pilot result. The live evidence fix must be implemented before Challenge 44 validates it. |
| 3 | **The Tier 2 sidecar's vault isolation and purge boundary are unproven.** Tier 2 is the SQLite query index; OPFS is browser-managed storage outside the vault. | Static code opens the same OPFS filename, `.crosswalker.sqlite`, without a vault-specific namespace. If multiple work vaults share the same OPFS origin, concepts or evidence metadata could leak across vaults and query results could mix. If sensitive Tier 2 use or multiple Crosswalker vaults are required, this is a stop until the isolation test passes. | `src/tier2/sidecar.ts:129-153` opens `file:.crosswalker.sqlite?vfs=opfs-sahpool`; the vault path is not incorporated. The schema stores reviewer, notes, status, paths, and evidence relationships (`src/tier2/schema.sql:91-129`). `clearSidecar` uses a best-effort `sqlite3.opfs.unlink` and silently does nothing if the function is unavailable (`src/tier2/sidecar.ts:189-205`). Existing E2E checks opening and command registration, not two-vault isolation or verified purge (`tests/e2e/sidecar-phase-1-smoke.spec.ts`, `sidecar-phase-4-integration.spec.ts`). | For the first pilot, use one dedicated Crosswalker vault and do not treat Tier 2 as a confidentiality or backup boundary. If the data classification is sensitive, disable automatic Tier 2 projection until the two-vault isolation and purge test passes. Markdown remains canonical. |

### `blocker-team`

| Rank | Claim | Consequence and branch | Repository evidence | Minimum current control |
|---:|---|---|---|---|
| 4 | **Sharing generated catalogs may violate source-content terms even though Crosswalker code is MIT-licensed.** | NIST and MITRE are the conservative first-pilot branch. CIS, CRI, SCF, ISO, SOC 2, PCI, and other restricted material cannot be pushed to colleagues or a remote until the organization confirms the exact rights for the exact fields being shared. | The repository itself marks several sources local-only and says derived-output rights remain unresolved (`docs/src/content/docs/reference/framework-corpus.mdx`). Official terms differ by source: MITRE grants commercial use with notice; CIS and CRI use CC BY-NC-ND; SCF uses CC BY-ND with separate derivative-sharing rules. Crosswalker's MIT license covers the software, not imported prose. | Use the per-framework matrix below. Start with pinned NIST and MITRE sources. Treat raw files, identifiers, titles, full text, mappings, and paraphrases as separate rights questions. Obtain written legal/procurement confirmation before team-sharing any restricted corpus. |
| 5 | **Concurrent regeneration or mandatory live multiwriter storage is unsafe.** | Team use is viable if one importer owns generated folders and colleagues edit separate Evidence/ and Reports/ notes. It is blocked if policy requires simultaneous imports, same-file editing during regeneration, or an actively shared network drive. | Generation uses only in-process Sets and folder maps; there is no cross-client lock or compare-and-swap (`src/generation/generation-engine.ts:327-405`, `1670-1745`; `src/utils/debug.ts:152-154`). Query `.base` files can be rewritten on plugin load from each client's compiled templates (`src/main.ts:901-916`; `src/views/regenerate-query-views.ts`), and query frontmatter carries no plugin/template build pin (`src/views/query-frontmatter-schema.ts`). | Install Crosswalker only on the designated importer for the minimal team deployment. Freeze edits during imports. Promote one reviewed commit or approved file batch. If collaborators require the custom pivot or Tier 2, pin the identical five-file package on every client and upgrade together. |

### `degrades`

| Rank | Claim | Consequence and branch | Repository evidence | Minimum current control |
|---:|---|---|---|---|
| 6 | **Generation is non-transactional, and the wizard can call a row-failure run successful, delete its draft, and close.** | An interrupted or partially failed import can leave an ordinary-looking subset. This becomes `blocker-single` if machine-verifiable completeness is mandatory and manual reconciliation is unacceptable. | Rows are written independently with no transaction or rollback (`src/generation/generation-engine.ts:359-533`). `generateNotes` records row errors without setting `success` false, while the wizard enters its success branch, warns transiently, deletes the draft, and closes (`src/import/import-wizard.ts:3141-3193`). Skip-based reruns can compute enrichment only from rows written in that rerun. | Import only into an empty versioned staging folder. Treat any warning as failure. Require `created + skipped + errors` to reconcile to the source plan, require `errors = 0`, then validate and promote. After interruption, discard the complete staging folder and rerun; do not repair it with Skip. |
| 7 | **The documented three-file installation is incomplete for Tier 2, and current builds do not have a reliable release identity.** | Markdown import may appear to work while SQLite startup fails. Anonymous builds that all report `0.1.0` are hard to compare or roll back. If Tier 2 is required and its two runtime files are missing, this branch becomes `blocker-single`. | The runtime reads `sqlite3.mjs` and `sqlite3.wasm` from the plugin folder (`src/tier2/sidecar.ts:72-153`), and the build produces five runtime files (`esbuild.config.mjs:54-79`). The release workflow and installation docs publish only `main.js`, `manifest.json`, and `styles.css` (`.github/workflows/release.yml:89-120`; `docs/src/content/docs/getting-started/installation.mdx`). `package.json`, `manifest.json`, and `versions.json` remain at `0.1.0`, while lifecycle logging contains another hard-coded version. | Build from a clean approved commit; package all five runtime files; generate `SHA256SUMS.txt` and a build record; test a clean install; retain the previous package for rollback. |
| 8 | **The NIST “one-click” path begins after an unshipped source-preparation step, and the bundled recipe emits only identifier and title.** | The official NIST source is OSCAL JSON. The recognized recipe expects a flat tabular shape. If the owner requires complete control prose inside each note, the current recipe is insufficient and this branch becomes `blocker-single`; otherwise an ID/title corpus is usable with the official source open separately. | `recipes/import/nist-800-53-flat.json` uses only `identifier` and `name`; it does not emit `control_text`, `discussion`, related controls, family, or body regions. The local CSV has 1,189 rows, but its conversion lineage is not encoded. The official pinned OSCAL v1.4.0 catalog contains 1,196 unique controls/enhancements and must be flattened before the bundled recipe matches. No checked-in NIST OSCAL-to-recognized-CSV command exists. | Use the pinned official source and deterministic two-column conversion below, or explicitly approve the existing local CSV as recovery material. Record both source and derived hashes. Do not advertise the resulting notes as full control-text copies. |
| 9 | **Tier 2 projection can retain phantom rows after Markdown deletion, rename, or declassification.** | Startup projection upserts current records but does not reconcile rows whose source Markdown disappeared. Queries can report controls or evidence links that no longer exist. | `src/tier2/projector.ts` uses `INSERT OR REPLACE` and clears only `closure_cache`; it does not delete absent concepts, mappings, or junctions. “Clear fast query index” is a separate command, and purge reliability is not proved. | Treat Markdown as canonical. After destructive changes, clear and reproject, then compare Tier 2 counts to Markdown counts. Do not call startup projection a complete rebuild until deletion reconciliation and purge tests exist. |
| 10 | **Evidence, reviewer metadata, links, and notes can persist in places the owner may not expect.** | Git history can retain deleted URLs, names, and notes; remote Git expands access; OPFS is outside ordinary vault backup and deletion workflows; binary evidence may be copied into sync or repository history. | Junction rows store reviewer, notes, status, paths, and relationships in SQLite (`src/tier2/schema.sql`). Git and cloud topology are external to Crosswalker. The repository has no shipped retention, redaction, or execution-record policy. | Decide data classification before packaging. Prefer external-artifact stub notes, role identifiers instead of names, no secrets, no binary evidence in Git, encrypted endpoints, and an approved history-retention/deletion procedure. |
| 11 | **Delegated regeneration is manually reproducible, not replayable.** | Ten bundled recipes work, but the product does not bind exact source bytes, recipe, destination, build, and outcome into a durable run record. | The ImportRecipe library, source/run binding, replay with drift detection, and audit trail are explicitly unshipped. `source_hash` exists in the schema and provenance helper but generation call sites do not persist it. The similarly named legacy config browser, Bases recipe loader, and active `RecipeDocument` are not a durable ImportRecipe library. | Keep one importer. Preserve the exact source and derived file, hashes, recipe ID, destination, build hash, expected/actual counts, schema result, Git commit, and restore result in a separate run note. This is manual provenance, not replay. |
| 12 | **The minimum Obsidian version is inconsistent with the custom Bases feature.** | Import can work on an older managed workstation while the custom pivot cannot. If the required analysis surface depends on the pivot and the workstation is below 1.10, this becomes `blocker-single`. | `manifest.json` declares `minAppVersion: 1.0.0`; `src/main.ts:1059-1146` states the custom Bases view requires Obsidian 1.10.0+. Installation docs do not make that prerequisite prominent. | Confirm Obsidian 1.10+ and enable the Bases core plugin. For collaborators without Crosswalker, use only native Bases views. |

### `can-wait`

| Rank | Claim | Why it can wait | Evidence |
|---:|---|---|---|
| 13 | GitHub releases, BRAT, community-registry listing, automatic updates, broad mobile validation, and polished self-service installation are not prerequisites for a controlled desktop owner pilot. | A named internal package and approved sideload are enough for the first pilot. These channels matter before wider colleague self-service or public release. | The plugin builds and lint previously passed; the repository currently has no release/tag; the v0.1-RC page still carries public release gates. |
| 14 | General semantic migration can wait while the pilot pins one source version and imports side-by-side. | No current release pair proves a migration failure. It becomes urgent at the first mandatory refresh that must preserve embedded annotations. | Semantic diff and migration are explicitly not shipped; `Skip existing` preserves old files, while Replace carries rank 1's loss risk. Route the design to Challenge 43. |
| 15 | A polished recipe library can wait for one-owner use. | The owner can select bundled recipes and record the run manually. It becomes more important when regeneration is delegated or frequent. | The authoritative shipped/not-shipped inventory says save/open/browse is not shipped, but ten bundled recipes are. |

## Minimum viable organizational use

### 1. Day-one go/no-go decisions, before packaging

| Decision | Proceed branch | Stop or narrow branch |
|---|---|---|
| Evidence system of record | Evidence remains in an approved external system or approved vault notes; Crosswalker stores allowed metadata and links. | If even evidence identifiers, URLs, reviewer roles, or relationship metadata cannot enter the vault, the intended evidence map cannot be built. |
| Assurance required | Exploratory pilot with independent reconciliation is acceptable. | If audit-defensible automated completeness is required now, rank 2 blocks use. |
| Plugin policy | IT approves Obsidian and one pinned unlisted plugin on the importer workstation. | If unlisted executable plugins are prohibited, owner use is `blocker-single`. Community listing does not automatically override policy. |
| Storage | Encrypted local filesystem; local-only Git or an approved private remote; tested backup. | If only an active network share or uncontrolled cloud folder is allowed, remain solo or stop. |
| Framework scope | Begin with NIST and MITRE; terms and attribution are recorded. | Restricted catalogs wait for written rights confirmation. |
| Refresh cadence | The pilot can pin a source version for 90 days and use side-by-side version folders. | Mandatory in-place refresh with annotation preservation triggers rank 1 and Challenge 43. |
| Editors | One importer; collaborators own separate Evidence/ and Reports/ folders. | Simultaneous import or generated-file editing is not supported. |
| Allowed metadata | Role IDs, approved URLs or opaque locators, classification, retention class, review dates, and non-sensitive notes are permitted. | If reviewer identity, links, or notes create a retention/confidentiality problem, reduce the fields or keep them outside Crosswalker. |
| Required output | Markdown, native Bases, CSV, and manually reconciled pilot reports are sufficient. | Custom pivot, Tier 2, or automated evidence assurance adds version, installation, isolation, and implementation gates. |

**Current Obsidian licensing conclusion:** the official license page, last updated 2025-02-20, says Obsidian is free for personal, commercial, nonprofit, educational, and government use. Commercial licenses are optional supporter licenses. The older repository claim that a paid commercial license is mandatory is obsolete. Obsidian Sync is a separate paid service, and IT approval remains a separate organization-specific question.

### 2. Minimal client deployment

| Role | Crosswalker installed? | What works |
|---|---:|---|
| Designated importer | **Yes**, exact pinned five-file package | Import/regenerate, clear/project Tier 2, exporters, query generation, custom pivot. |
| Collaborator reading and annotating separate notes | **No** | Markdown, wikilinks, search, graph, and native Obsidian Bases over ordinary properties. |
| Collaborator who must use `crosswalker-pivot`, Tier 2 APIs, exporters, or refresh generated query views | **Yes**, same package hash as importer | Those plugin-specific features; all clients must upgrade in one window. |

This importer-only pattern is safer than installing anonymous same-version builds everywhere. Generated framework folders are read-only for collaborators. `Evidence/`, `Evidence/Junctions/`, and `Reports/` are collaborator-owned.

### 3. Concrete five-file internal package

Run only from a **clean, approved commit**:

```bash
set -euo pipefail
test -z "$(git status --porcelain)" || { echo "Working tree is not clean"; exit 1; }
bun install --frozen-lockfile
bun run build

VERSION="$(node -p "require('./package.json').version")"
BUILD="$(git rev-parse --short=12 HEAD)"
PKG="../internal-releases/crosswalker-${VERSION}-${BUILD}"
mkdir -p "$PKG"
cp main.js manifest.json styles.css sqlite3.mjs sqlite3.wasm "$PKG/"
printf 'version=%s\ncommit=%s\nbuilt_at=%s\n' "$VERSION" "$BUILD" "$(date -u +%FT%TZ)" > "$PKG/BUILD.txt"
(
  cd "$PKG"
  sha256sum main.js manifest.json styles.css sqlite3.mjs sqlite3.wasm > SHA256SUMS.txt
)
```

**Clean-install acceptance:**

1. Close Obsidian.
2. In a disposable vault, create `.obsidian/plugins/crosswalker/`.
3. Copy exactly `main.js`, `manifest.json`, `styles.css`, `sqlite3.mjs`, and `sqlite3.wasm` into that folder. Keep `BUILD.txt` and `SHA256SUMS.txt` in the package archive, not as runtime requirements.
4. Open the vault, enable Crosswalker, confirm the workspace opens, and run the existing Tier 2 smoke test.
5. Record the five hashes and Obsidian version in the pilot run note.
6. Rollback drill: close Obsidian, replace all five files with the retained prior package, reopen, and verify the vault and native Bases still open.

A GitHub release that still uploads only three files is not an acceptable Tier 2 package.

### 4. Official NIST pilot source, exact transform, and expected result

Use the official NIST OSCAL catalog pinned to the `usnistgov/oscal-content` tag `v1.4.0`:

- URL: `https://raw.githubusercontent.com/usnistgov/oscal-content/v1.4.0/nist.gov/SP800-53/rev5/json/NIST_SP-800-53_rev5_catalog.json`
- Catalog metadata: NIST SP 800-53 Rev. 5.2.0, OSCAL 1.1.3
- Expected source SHA-256: `1645df6a370dcb931db2e2d5d70c2f77bc89c38499a416c23a70eb2c0e595bcc`
- Expected flattened records: **1,196 unique controls and enhancements**

The bundled recipe does not directly consume the nested OSCAL catalog. Produce a deterministic two-column CSV; those are the only columns the current NIST recipe actually uses:

```bash
curl -L \
  'https://raw.githubusercontent.com/usnistgov/oscal-content/v1.4.0/nist.gov/SP800-53/rev5/json/NIST_SP-800-53_rev5_catalog.json' \
  -o NIST_SP-800-53_rev5_catalog.json

echo '1645df6a370dcb931db2e2d5d70c2f77bc89c38499a416c23a70eb2c0e595bcc  NIST_SP-800-53_rev5_catalog.json' \
  | sha256sum -c -

python3 - <<'PY'
import csv, json, re

with open('NIST_SP-800-53_rev5_catalog.json', encoding='utf-8') as f:
    catalog = json.load(f)['catalog']

rows = []
def walk(control):
    match = re.fullmatch(r'([a-z]+)-(\d+)(?:\.(\d+))?', control['id'])
    if not match:
        raise ValueError(f"Unexpected OSCAL control id: {control['id']}")
    identifier = f"{match.group(1).upper()}-{int(match.group(2))}"
    if match.group(3):
        identifier += f"({int(match.group(3))})"
    rows.append((identifier, control.get('title', '')))
    for child in control.get('controls', []):
        walk(child)

for group in catalog.get('groups', []):
    for control in group.get('controls', []):
        walk(control)

if len(rows) != 1196 or len({row[0] for row in rows}) != 1196:
    raise SystemExit(f"Expected 1196 unique records, got {len(rows)}")

with open('NIST_SP-800-53_rev5-recognized.csv', 'w', encoding='utf-8', newline='') as f:
    writer = csv.writer(f, lineterminator='\n')
    writer.writerow(['identifier', 'name'])
    writer.writerows(rows)
PY

echo '55a65297c8076255f22b885f2043f80be46a49ce8cc99fdd8810ea9c8fba6320  NIST_SP-800-53_rev5-recognized.csv' \
  | sha256sum -c -
```

**Wizard expectation:**

| Item | Expected value |
|---|---|
| Recognized recipe | `nist-800-53-r5-flat` |
| Match score | 100 |
| Destination | A new folder such as `Frameworks/NIST 800-53 Rev 5/` |
| Overwrite mode | `Skip existing` |
| Source records | 1,196 |
| Unique rendered paths | 1,196 |
| Created | 1,196 on a clean folder |
| Skipped | 0 |
| Errors | 0 |
| Sorted identifier/filename set SHA-256 | `bba55bf6a5a3390f349237c1eabf0a851bfc7e7a9914be1ba1eded19aa36067b` |
| Note content | Identifier and title only; not full control text |

The existing local `Frameworks/NIST_SP-800-53_rev5_catalog_load.csv` is a different 1,189-row derivative with SHA-256 `1f2a1ef9ca92e8ad235ca052467e6bc15d7b96777250b7a81f4e530cad503690`. It may be used only if the owner explicitly approves that exact file as the source of record; the repository does not preserve a reproducible official-source conversion for it.

### 5. Import completeness and promotion gate

Create one run note before promotion with these required fields:

| Field | Required value for the NIST pilot |
|---|---|
| Official source URL and version | Pinned URL and Rev. 5.2.0 |
| Official source SHA-256 | `1645df6a...595bcc` |
| Derived CSV SHA-256 | `55a65297...a6320` |
| Recipe | `nist-800-53-r5-flat` |
| Build identity | Git commit plus five package hashes |
| Destination | New version-qualified folder |
| Expected source rows | 1,196 |
| Expected unique paths | 1,196 |
| Created / skipped / errors | 1,196 / 0 / 0 |
| Schema validation failures | 0 |
| Filename-set SHA-256 | `bba55bf6...6067b` |
| Reviewed sample | `AC-1`, `AC-2`, `AC-2(1)`, `AC-16(1)`, `AU-9`, `CM-7`, `IA-2(11)`, `IR-9(2)`, `PE-11(2)`, `PT-3(1)`, `SA-8(31)`, `SC-4(1)`, `SC-30`, `SI-6(1)`, `SR-12` |
| Restore result | Pass/fail and elapsed recovery time |
| Promotion commit | Approved commit ID or approved file-batch ID |

Zero warning notices and a file count are necessary but not sufficient. Promotion requires all of the following:

1. `errors = 0` and no collision notice.
2. Exact file count and identifier-set hash.
3. Tier 1 frontmatter validation failures equal zero.
4. The deterministic sample has correct `curie`, `title`, `control_id`, full path, and wikilink resolution.
5. A reviewed diff contains only the expected staging folder and run note.
6. Restore drill passes before evidence is attached.

### 6. Current evidence-record convention

If evidence cannot be copied into the vault, create a local **stub note**, meaning a small record that points to the approved system of record without copying the artifact:

```yaml
---
evidence_id: ev:MFA-Policy-2026
artifact_type: policy
system_of_record: approved-document-system
artifact_locator: approved-opaque-id-or-url
owner_role: identity-and-access-management
classification: internal
access_status: verified
reviewed_at: 2026-08-19T15:00:00Z
retention_class: policy-record
---
```

Rules:

- No credentials, secrets, tokens, screenshots, raw logs, or binary evidence in Git.
- Use an opaque locator instead of a URL when URLs themselves are sensitive.
- Use roles or approved IDs rather than personal names unless retention and privacy policy explicitly permit names.
- `access_status: verified` means the reviewer could open the authoritative artifact at review time.
- The stub does not make the vault the evidence system of record.

### 7. Corrected evidence-junction contract

A **junction note** is one small note that records one control-to-evidence relationship and its review metadata.

**Pilot direction:** control is `subject`; evidence is `object`.

**Pilot predicate vocabulary:** only exact `predicate: evidences` counts toward evidence coverage. The schema permits open strings such as `covers`, `attests`, or `reviews`, but the pilot excludes them from the coverage calculation.

Complete schema-valid example:

```yaml
---
curie: cwk:jn-nist-ac-2-mfa-policy-2026
kind: junction-note
subject: "[[Frameworks/NIST 800-53 Rev 5/AC-2]]"
predicate: evidences
object: "[[Evidence/2026/MFA Policy]]"
coverage: full
reviewer: GRC-reviewer-01
review_date: 2026-08-19T15:00:00Z
status: approved
confidence: 0.95
scope: production
expires_at: 2027-08-19T00:00:00Z
notes: Approved evidence link for the pilot.
tags:
  - evidence/junction
_crosswalker:
  spec_version: https://crosswalker.dev/spec/tier1.schema.json
  source_ref:
    curie: manual:evidence-link
  produced_at: 2026-08-19T15:00:00Z
  producer:
    kind: manual
    name: crosswalker-pilot
---
```

This example was validated against `spec/tier1.schema.json` through `src/validation/validator.ts` and returned `{ valid: true, errors: [] }`.

**Current validation path:** no normal evidence-link creation or validation UI is shipped. In Obsidian Developer Tools, validate the file from its bytes rather than relying on metadata-cache timing:

```javascript
const { parseYaml } = require('obsidian');
const plugin = app.plugins.plugins.crosswalker;
const file = app.vault.getAbstractFileByPath(
  'Evidence/Junctions/jn-nist-ac-2-mfa-policy-2026.md'
);
const raw = await app.vault.read(file);
const yaml = raw.match(/^---\r?\n([\s\S]*?)\r?\n---/)?.[1];
plugin.validateTier1Frontmatter(parseYaml(yaml));
```

The expected result is `{ valid: true, errors: [] }`. If there is no YAML block, the command must fail rather than silently continue.

### 8. Authoritative pilot coverage semantics

| Input condition | Counts as covered? | Result |
|---|---:|---|
| `predicate = evidences`, `status = approved`, `coverage = full`, unexpired | Yes | `covered-full` |
| Same, `coverage = partial`, with no valid full link | Partially | `covered-partial`; never collapse this to fully covered |
| `status = proposed` or `in_review` | No | Pending review |
| `status = deprecated` | No | Excluded |
| `coverage = none` | No | Uncovered |
| `coverage = n/a` | No | Report separately as applicability, not evidence coverage |
| `expires_at` missing or expired | No for automated coverage | Requires review |
| Predicate other than exact `evidences` | No | Excluded from coverage calculation |
| Duplicate subject/object links | Count one artifact | Deduplicate by subject plus object; retain the strongest valid coverage |
| Artifact inaccessible at review time | No | Do not approve; if access later fails, deprecate the junction |
| Multiple evidence artifacts | Yes | One valid full artifact is enough for `covered-full`; keep the count |

The word **covered** in management output must mean `covered-full`. Partial is a separate state.

### 9. Working coverage query and the implementation boundary

The following SQL implements the pilot semantics against Tier 2 and correctly excludes invalid predicates, pending links, expired links, and duplicate subject/object pairs:

```sql
WITH eligible AS (
  SELECT
    trim(subject, '[]') AS subject_path,
    trim(object, '[]') AS object_path,
    CASE coverage WHEN 'full' THEN 2 WHEN 'partial' THEN 1 ELSE 0 END AS strength
  FROM junction_notes
  WHERE predicate = 'evidences'
    AND status = 'approved'
    AND coverage IN ('full', 'partial')
    AND expires_at IS NOT NULL
    AND expires_at >= strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
),
dedup AS (
  SELECT subject_path, object_path, MAX(strength) AS strength
  FROM eligible
  GROUP BY subject_path, object_path
),
per_control AS (
  SELECT
    subject_path,
    COUNT(*) AS valid_evidence_count,
    MAX(strength) AS strongest
  FROM dedup
  GROUP BY subject_path
)
SELECT
  c.curie,
  c.vault_path,
  c.title,
  COALESCE(p.valid_evidence_count, 0) AS valid_evidence_count,
  CASE COALESCE(p.strongest, 0)
    WHEN 2 THEN 'covered-full'
    WHEN 1 THEN 'covered-partial'
    ELSE 'uncovered'
  END AS coverage_state
FROM concepts c
LEFT JOIN per_control p
  ON p.subject_path = substr(c.vault_path, 1, length(c.vault_path) - 3)
WHERE c.ontology_id = 'nist-800-53'
ORDER BY c.curie;
```

The query was checked against a fixed four-control sample: one valid full link, one valid partial link, one wrong-predicate link, and one proposed link. It returned `covered-full`, `covered-partial`, `uncovered`, `uncovered`.

**Important:** this SQL is an acceptance oracle, not a shipped user workflow. The current plugin has no evidence query API or normal UI that runs it, and Tier 2 isolation/purge is unverified.

**Chosen implementation for the v0.1.6 closeout:**

1. Resolve control and junction rows from Tier 2 with the SQL semantics above.
2. Generate dedicated, disposable report rows under a plugin-owned report folder, one row/note per control, with `coverage_state`, valid evidence count, expired count, and invalid-predicate count.
3. Generate an ordinary native `.base` over those report rows.
4. Do **not** write coverage summaries into canonical control notes; keep the report projection separate and rebuildable.
5. Make the report carry build, source, query-version, and generated-at metadata.

This choice avoids pretending native Bases can perform the missing anti-join, avoids modifying imported control notes, and lets collaborators view the resulting native Base without installing Crosswalker. `src/views/query-composer.ts` can remain pure; it should not be cited as live evidence analysis until source resolution and rendering are actually wired.

Until that implementation ships and Challenge 44 passes, use the SQL only as an operator check in a dedicated non-sensitive pilot vault and independently reconcile every result.

## Honest risk statement

The three highest-consequence risks are:

1. **Integrity loss:** Replace can overwrite annotations, and partial imports can look ordinary after a transient warning.
2. **False assurance:** invalid junction notes, wrong direction, wrong predicates, generic backlinks, or broken joins can produce an embarrassing compliance answer.
3. **Confidentiality and retention:** evidence URLs, reviewer identities, notes, framework text, and relationship metadata can persist in Git history, private remotes, cloud version history, and the OPFS sidecar outside the vault's visible files.

The proposed controls reduce risk but do not create transactions, replay, semantic migration, audit-grade completeness, or a trustworthy shipped evidence-analysis workflow. A snapshot is not enough until recovery is proved. A debug log is not an audit trail. A source hash in a manual run note is not drift detection. An approved private Git remote is not automatically approved for every evidence classification.

## Vault-topology verdict

| Topology | Verdict now | Required controls |
|---|---|---|
| Encrypted local filesystem plus **local-only Git** | **Safest first pilot** when remote storage is prohibited | Full-disk encryption, approved local backup, no secrets/binaries, tested restore, one importer. Git history still retains deleted metadata until explicitly rewritten under policy. |
| Encrypted local filesystem plus **approved private remote Git** | **Recommended team branch** if classification permits | Private repository, MFA/access review, approved region/retention, protected main branch, importer-owned generated commits, no binary evidence, no secrets, deletion/history-rewrite procedure. |
| Git prohibited | **Solo pilot only** unless another approved versioned store passes recovery and conflict tests | Encrypted local vault, enterprise backup/versioning, one importer, manual promotion record. Do not improvise an unapproved remote. |
| Obsidian Sync | **Not for the first pilot; conditionally viable later** | Same build where plugin-specific features are used, no-edit maintenance window, full sync before/after import, version-history restore drill, paid Sync handled separately, data-classification approval. |
| OneDrive, SharePoint, or Dropbox | **Brittle; later trial only** | Files always local, generation freeze, one writer, approved retention, conflict test, promotion through change control. Keep binaries out of the vault. |
| Active SMB/NFS/network-share vault | **Reject for concurrent team use** | A copied local staging vault may generate outputs, but active multiwriter operation is not viable without a tested promotion process. |

**Sidecar boundary:** the SQLite database is in OPFS, not demonstrably at the visible vault root despite source comments. It is not committed by Git, may not follow vault backup, and may use the same name across vaults. Until the isolation test passes, do not open multiple sensitive Crosswalker vaults with Tier 2 enabled.

## Per-framework sharing decision matrix

This is a rollout decision aid, not legal advice. The exact downloaded version and accompanying terms control.

| Source | Raw source | IDs/titles internally | Full text internally | Share generated full text to team | Share mappings | Paraphrased output | Pilot decision |
|---|---|---|---|---|---|---|---|
| NIST CSF / SP 800-53 | Generally redistributable NIST material unless specifically marked copyrighted; preserve attribution and third-party notices | Usually acceptable | Usually acceptable for NIST-authored material | Usually acceptable inside approved storage | Check third-party mapping source terms | Usually acceptable with attribution | **Proceed**, pinned official source; legal records NIST copyright policy and exact file. |
| MITRE ATT&CK | Commercial use granted royalty-free under ATT&CK terms | Acceptable with notice | Acceptable with required notice | Acceptable with required copyright/license notice; no endorsement implication | Check any non-MITRE mapping contributor terms | Terms do not expressly settle every derivative question; retain notice | **Proceed** after adding the required MITRE notice and trademark handling. |
| CIS Controls v8/v8.1 | CC BY-NC-ND 4.0 plus CIS terms | Internal use is permitted; attribution/current-version link required | Internal use must follow terms | Organizational redistribution and commercial context require legal interpretation/approval; modified copies cannot be distributed | Derived mappings may be adaptations | Sharing paraphrases may create derivative concerns | **Do not team-share generated CIS output until legal approves the exact internal use and fields.** |
| CRI Profile v2.x | CC BY-NC-ND 4.0; download registration; commercial path via CRI programs | Internal scope is not fully specified on the FAQ | Treat as restricted | No team distribution decision without legal review of exact downloaded terms | Likely derivative/redistribution concern | No-derivatives term is material | **Defer team sharing.** Solo authorized use only after terms review. |
| Secure Controls Framework | CC BY-ND 4.0; internal adaptations may be made but not shared | Internal use permitted with attribution | Internal use subject to terms | Unmodified sharing may be allowed; derivative sharing requires a commercial path | Mappings and changed content can be derivatives | Shared paraphrases can be derivatives | **Defer generated/modified team output until legal confirms the chosen use or a commercial license exists.** |
| NIST OLIR crosswalks | NIST-hosted catalog, but individual references can involve third-party source documents | NIST-side identifiers usually acceptable | Third-party source text follows its own rights | Depends on both sides of the mapping | Contributor/source-specific rights and final/draft status must be checked | Depends on source | **Use only mappings whose source and redistribution terms are recorded.** |
| ISO, SOC 2, PCI, HITRUST, COBIT, COSO, IIA | Purchased/copyrighted | Contract-specific | Contract-specific | Contract-specific | Contract-specific | Contract-specific | **No rollout without procurement/legal confirmation.** |

## Restore drill required before promotion

| Failure | Drill | Pass condition |
|---|---|---|
| Note overwritten by Replace | In a disposable branch, add a unique body marker to one generated note, snapshot, run Replace, then restore the note from the approved backup/Git path. | Exact pre-Replace bytes return; elapsed recovery time recorded; all evidence junctions still resolve. |
| Deleted staging folder | Delete/trash the complete staged catalog, restore it from the approved snapshot or commit. | 1,196 files, identifier-set hash, and deterministic sample all match. |
| Partial import | Interrupt or inject a row failure in a disposable vault, reject the run, remove the whole staging folder, rerun from empty. | Final run has 1,196 created, 0 skipped, 0 errors, zero schema failures. No subset enrichment remains. |
| Stale/corrupt sidecar | Create known Markdown state, project, delete/rename records, clear sidecar, reproject. | Tier 2 counts and exact paths match Markdown; deleted rows are absent; no rows from another vault appear. |

Record recovery time. “A snapshot exists” is not a pass.

## First 90 days

| Time | Work | Measurable exit criteria | Dependency |
|---|---|---|---|
| Days 1-7 | Decide evidence system of record, required assurance, storage, plugin policy, framework scope, refresh cadence, editor count, allowed metadata, and required report output. Build the five-file package and run a clean install. | Written go/no-go matrix; IT approval; Obsidian 1.10+ confirmed; Bases enabled; clean package install passes; five hashes and rollback package recorded. | Owner, IT, records/privacy, legal/procurement. |
| Days 8-21 | Acquire pinned NIST OSCAL source, verify hashes, derive the recognized CSV, import to an empty versioned folder with Skip, validate, review, restore, and promote. | Source hash, derived hash, 1,196 records, 1,196 unique paths, 1,196 created, 0 skipped, 0 errors, 0 schema failures, filename-set hash match, sample pass, reviewed diff, successful restore with elapsed time. | Current shipped import path; no new product feature required. |
| Days 15-30 | Define 20-50 evidence stubs and corrected junction notes with an independently known expected answer set. | Every junction validates; every subject/object resolves; expected set includes full, partial, uncovered, wrong-predicate, proposed, expired, duplicate, and inaccessible cases; human reconciliation signed off. | Manual operator workflow; no claim of shipped automated assurance. |
| Days 31-60 | Implement the evidence coverage integration as a **v0.1.6 closeout slice**: exact vocabulary, Tier 2 query, disposable report rows, native Base, evidence-link creation UI, and corrected docs. Separately harden Replace behavior and row-failure result handling. | Automated report matches the fixed sample exactly; invalid predicates never count; partial never appears as full; expired/proposed/deprecated links do not count; UI emits a schema-valid junction; Replace test preserves or blocks unsafe body edits; row errors produce failed result and retained results. | Product engineering. Challenge 44 validates after implementation; it does not design the feature. |
| Days 31-60 | Complete a **v0.1.5 sidecar hardening follow-up** for vault-specific OPFS naming, deletion reconciliation, verified purge, and backup/confidentiality documentation. | Two vaults show zero cross-contamination; clear removes all rows; delete/rename reconciliation removes phantom rows; sidecar location and backup behavior documented. | Product engineering before sensitive Tier 2 use. |
| Days 61-90 | Run a two-user Git trial. Only importer has Crosswalker unless a plugin-specific feature is required. Test one planned upgrade window and one restore. | No generated-file churn, merge conflict, cross-vault sidecar row, coverage drift, invalid junction, or unresolved evidence link. Both users recover the prior approved state within the recorded target time. | Challenge 44 test plan plus organization-approved private remote or local-only exchange process. |
| Day 90 decision | Choose the operating level. | **Advance** only if evidence query correctness, restore, package, rights, storage, and two-user gates pass. Otherwise remain a manually reconciled knowledge-corpus pilot. | Owner decision. |

## Not measured and what would settle it

| Unknown | Why it matters | Exact settling test or evidence |
|---|---|---|
| Clean five-file install and Tier 2 startup from an internal package | Static build inspection is not a clean-install proof. | Author and run `DISPLAY=:0 bun run e2e -- --spec tests/e2e/clean-package-install.spec.ts`. The spec must install only the five runtime files into a disposable vault, enable the plugin, open the workspace, and run SQLite `SELECT 1`. |
| Full official NIST 1,196-row import | Counts and hashes were derived without writing a vault. | Author and run `DISPLAY=:0 bun run e2e -- --spec tests/e2e/full-nist-800-53-import.spec.ts` using the pinned derived CSV; assert exact created/skipped/error totals, schema validity, filename-set hash, and deterministic sample. |
| Valid evidence creation through authoritative coverage output | No normal evidence-link UI or live report path exists. | After the v0.1.6 evidence slice is implemented, run `DISPLAY=:0 bun run e2e -- --spec tests/e2e/evidence-coverage-flow.spec.ts`. Include full, partial, uncovered, wrong predicate, proposed, expired, duplicate, and inaccessible cases. |
| OPFS isolation between two vaults and reliable purge | Static code uses one non-namespaced filename; actual Electron storage partition behavior is not proved. | Author and run `DISPLAY=:0 bun run e2e -- --spec tests/e2e/sidecar-vault-isolation.spec.ts`. Open two distinct vaults, insert disjoint sentinels, prove isolation, clear one, and prove the other is unchanged. |
| Interrupted import and restore | No crash, disk-full, or forced termination was executed. | Author and run `DISPLAY=:0 bun run e2e -- --spec tests/e2e/interruption-recovery.spec.ts`. Cover quit, injected write error, collision, discard-and-rerun, and enrichment correctness. |
| Concurrent clients on the chosen storage service | Local automation cannot reproduce hosted service semantics. | Run `DISPLAY=:0 bun run e2e -- --spec tests/e2e/concurrent-import-clients.spec.ts` for local behavior, then supplement with two authenticated clients on the actual approved Git/Sync/cloud service. Compare hashes, conflicts, version history, and final bytes. |
| Restore service-level guarantees | Git, Sync, OneDrive, SharePoint, and enterprise backup differ. | Perform the four restore drills above on the selected service; record exact commands, recovered hashes, unresolved links, and elapsed recovery time. |
| Framework redistribution rights | Repository labels are provisional; rights depend on exact versions and contracts. | Not command-settleable. Legal/procurement must sign a matrix for raw source, IDs, titles, full text, mappings, paraphrases, internal sharing, contractors, and remote storage for each selected version. |
| Current community-registry/mobile readiness | Lint/manifest inspection does not prove review or mobile runtime behavior. | Defer to v0.1-RC; then run clean desktop/mobile installation tests and submit the exact package for registry review. |

## Open owner-context assumptions and branch changes

| Unknown assumption | If yes | If no |
|---|---|---|
| Evidence is stored as separate notes/stubs plus junctions | Current pilot can preserve it procedurally. | If evidence or analyst prose lives in generated control bodies, rank 1 blocks any Replace-based refresh. |
| Manual reconciliation is acceptable for 20-50 controls | A useful evidence pilot exists now. | If automated audit-defensible coverage is required, rank 2 blocks use until the v0.1.6 evidence slice and Challenge 44 pass. |
| One importer is acceptable | Team can consume plain Markdown and native Bases without installing Crosswalker. | If every user must import, refresh, or use custom/Tier 2 features, identical package pinning and upgrade windows are mandatory. |
| Local-only Git is allowed | Safest branch for sensitive metadata with no remote. | Choose an approved private remote or a tested non-Git backup; do not improvise. |
| Private remote Git is approved for the data classification | Recommended team promotion workflow. | Keep Git local-only; remote collaboration waits. |
| Git is prohibited entirely | Solo local pilot may still proceed with approved backup/versioning. | Use reviewed commits and branches. |
| IT approves one unlisted plugin | Internal package is friction, not a product blocker. | Owner use is `blocker-single`. |
| Obsidian 1.10+ is approved | Bases/custom pivot prerequisites are available. | Native import may work, but required Bases analysis can be blocked. |
| NIST/MITRE are sufficient for the first 90 days | Rights risk is manageable. | Restricted frameworks add a `blocker-team` legal/procurement gate. |
| Evidence URLs and reviewer roles may be stored | Stub-note workflow is workable. | Use opaque locators/reduced fields; if no relationship metadata is permitted, Crosswalker cannot provide the intended map. |
| One dedicated Crosswalker vault is sufficient | Tier 2 can remain isolated operationally while the test is pending. | Multiple sensitive vaults require OPFS isolation proof before Tier 2 use. |
| Framework can remain pinned for 90 days | Semantic migration can wait. | Mandatory refresh with preserved embedded work invokes Challenge 43 and may be `blocker-single`. |
| Full normative control text is not required inside notes | The current NIST ID/title recipe is useful. | A body-emitting vetted recipe and full-source proof are required before the pilot meets the job need. |

## Routed elsewhere

| Destination | Work routed there |
|---|---|
| **v0.1.6 closeout: evidence-assurance integration** | Evidence-link creation UI; corrected schema example; exact `evidences` vocabulary; live Tier 2 query; disposable coverage report rows; native Base; invalid/partial/expired behavior; public docs correction. This implementation must exist before Challenge 44 validation. |
| **v0.1.5 sidecar hardening follow-up** | Vault-specific OPFS namespace; verified purge; deletion/rename reconciliation; backup/location documentation; confidentiality test. |
| **Challenge 43** | Safe in-place refresh; generated-note semantic migration; stable identity versus file-address links; side-by-side framework evidence migration; source/run replay and drift diagnosis; old-version-to-new-version policy. |
| **Challenge 44** | Validate a specified implementation: clean package, full catalog, evidence flow, anti-join/report correctness, crash/interruption, restore, OPFS isolation, purge, two-client behavior, mixed-build behavior, and supported Obsidian/mobile matrix. Challenge 44 should not be asked to invent the missing evidence join path. |
| **v0.1.7 portability completion** | Durable ImportRecipe library; exact source-byte and recipe binding; source selectors; replay proofs; full-source fidelity; import/export recovery material. |
| **v0.1.8 audit trail** | Durable execution record, expected-versus-written summary, retained failures/results, actor/build/source identity, audit events, retention and redaction policy. |
| **v0.1-RC bundle and ship** | Version synchronization; five-file release artifact; clean install/rollback docs; GitHub release; BRAT decision; community submission; truthful mobile and Tier 2 packaging claims. |
| **Future, not a current pilot blocker** | Cross-client import locks, transactional generation, exact per-run undo, public self-service administration, and broad organization-wide rollout automation. |

## External sources

- [Obsidian license](https://obsidian.md/license)
- [Official NIST SP 800-53 Rev. 5 publication and OSCAL links](https://csrc.nist.gov/pubs/sp/800/53/r5/upd1/final)
- [NIST copyright policy](https://www.nist.gov/oism/copyrights)
- [Official NIST OSCAL content repository](https://github.com/usnistgov/oscal-content/tree/v1.4.0/nist.gov/SP800-53/rev5/json)
- [MITRE ATT&CK terms of use](https://attack.mitre.org/resources/legal-and-branding/terms-of-use/)
- [CIS Controls v8 terms of use](https://cas8.docs.cisecurity.org/en/latest/source/terms-of-use/)
- [CRI Profile FAQ and license statement](https://cyberriskinstitute.org/the-profile/profile-faq/)
- [Secure Controls Framework terms and conditions](https://securecontrolsframework.com/terms-and-conditions)
- [NIST OLIR program](https://csrc.nist.gov/projects/olir)
