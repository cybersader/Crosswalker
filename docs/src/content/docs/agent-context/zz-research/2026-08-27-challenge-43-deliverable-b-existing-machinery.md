---
title: "Ch 43 deliverable B: Existing migration machinery"
description: "Pre-read research deliverable B for Challenge 43. Inventories the shipped identity, re-import, ownership, hashing, evidence, crosswalk, and diff machinery; records what survives a same-CURIE re-import; and proves the remaining gaps in lineage, retained before-state, impact analysis, and migration review."
tags: [research, deliverable, version-migration, reimport, identity, provenance, lineage, ch-43, deliverable-b]
date: 2026-08-27
sidebar:
  label: "Ch 43b · Existing machinery"
  order: -20260827.4
---

# Challenge 43 pre-read: existing machinery

**Scope:** descriptive inventory of what Crosswalker already ships as of 2026-08-27. This document does not recommend a source-version migration design.

## 1. Capability table

| Capability | What it answers today | What it cannot answer | Evidence |
|---|---|---|---|
| Crosswalker note identity index | Re-import can find an existing generated note by canonical `curie` regardless of its current vault path. Only notes with `_crosswalker` provenance enter the index; duplicate CURIE claims are surfaced as collisions instead of choosing an arbitrary winner. | It does not relate an old CURIE to a new CURIE. It also depends primarily on Obsidian's metadata cache. | `src/generation/identity-index.ts:1-24,29-43,73-123` |
| Current write-target resolution | If the rendered path is absent, generation consults the global CURIE index; a matching note at another address becomes the existing write target. | There is a path-first exception: a Markdown file already at the rendered path is accepted before its CURIE is checked. A changed identifier can therefore overwrite a same-path note, while a changed identifier plus changed path normally becomes a new note and leaves the old identity orphaned. Neither case records lineage. | `src/generation/generation-engine.ts:784-824` |
| Identity-preserving move | A stable CURIE at a changed address is moved with Obsidian's rename API before merge, allowing Obsidian to update wikilinks to the canonical file. The result records `{curie, from, to}`. | This is an address move for one unchanged identity, not a predecessor/successor or split/merge operation. Skip mode does not move. | `src/generation/generation-engine.ts:2128-2145`; `src/types/config.ts:439-495` |
| Import-set ownership | An import set is the collection of generated notes carrying one minted `_crosswalker.import_set.id`. Its id is deliberately unrelated to recipe, destination, or source. Legacy unstamped notes remain outside every set. | It does not identify a publisher release semantically; there is no human source/release label. Ownership alone does not make two notes with the same concept CURIE coexist. | `src/generation/import-set.ts:1-8,57-64,111-127`; `spec/tier1.schema.json:89-105`; `docs/src/content/docs/agent-context/zz-log/2026-08-21-import-set-ownership.mdx:19-23,43-60,82-108` |
| Import-set selection and orphan boundary | One set is resolved once per run. Pre-run CURIE membership is indexed by set id. After a complete, successful, error-free run, previously owned CURIEs not produced by the run are reported as orphans. | Orphans are reported, not deleted, matched, or migrated. An incomplete or failed run cannot prove disappearance and produces no orphan inference. | `src/generation/generation-engine.ts:320-358,1897-1920,2303-2317` |
| Fixed per-set identity scheme | A set is minted as either `endpoint-v1` or `set-qualified-v1`; refresh reuses the stored scheme and rejects attempts to change it. Mixed or unsupported schemes in one set fail closed. | The scheme value is provenance, not a universal identity transformer. Current concept generation does not consult it unless a caller supplies a custom CURIE function. | `src/generation/import-set.ts:12-28,72-108,181-205`; `src/generation/generation-engine.ts:1848-1854,2027-2031` |
| `set-qualified-v1` release coexistence | For the SSSOM importer, a crosswalk assertion CURIE is exactly `sssom:cwset-<import-set-id>-<sanitized-subject>-<sanitized-object>`. The minted import-set id lets assertions with the same endpoints in different import sets coexist. `endpoint-v1` remains `sssom:cw-<sanitized-subject>-<sanitized-object>`. | The formula does not include source ontology version or `mapping_set_id`; the import-set id is the qualifier. Current use is SSSOM crosswalk assertions, not ordinary concept notes from framework releases. | `src/import/sssom-importer.ts:257-268,433-455`; `spec/tier1.schema.json:89-104`; `src/import/sssom-import-modal.ts:262-305` |
| Ordinary concept identity | Recipe generation uses a caller-supplied local-part function when present; otherwise concept identity derives from row `curie`, `id`, `subject_id`, `control_id`, `code`, or a row fallback, under the ontology-derived prefix. Reconciliation then uses the global CURIE index. | The default concept CURIE contains no import-set id or release id. Two framework releases emitting the same concept CURIE are not independently addressable concept notes merely because they belong to different sets. | `src/generation/generation-engine.ts:1900-1920,2027-2031,2643-2651` |
| `concept_cid` | SHA-256 content identifier over canonical `{curie, scope}` before rendering. It detects any change in the source-row attributes or CURIE while remaining stable across recipe-only layout/address changes. Crosswalk-edge scope includes normalized mapping provenance. | It is not a lineage id and does not say which field change is semantically a rename, split, merge, or successor relation. The current note retains only the latest CID after Replace; comparison needs an external/before snapshot. | `src/generation/hash.ts:188-245`; `src/generation/generation-engine.ts:945-966,2088-2106` |
| Recipe hash | SHA-256 hash over the effective output-affecting recipe target plus wired source-shaping declarations, including layout, `also_emit`, enrichment, auto-heading, `where`, and joins. | It does not preserve a recipe-version history. Informational source fields and currently unwired fields are excluded, so it is not a hash of the canonical recipe document byte-for-byte. | `src/generation/hash.ts:247-347`; `src/generation/generation-engine.ts:1906-1910` |
| Provenance source metadata | `_crosswalker.source_ref` can store file, URL, source CURIE, version, and source-file hash; provenance also stores producer, production time, recipe id/hash, import set, and concept CID. | Normal plugin generation currently does not pass `sourceHash`, so `_crosswalker.source_ref.source_hash` is supported but not populated on the ordinary generation paths. Replace writes fresh provenance, not a history list. | `spec/tier1.schema.json:55-110`; `src/generation/provenance.ts:24-43,48-101`; `src/generation/generation-engine.ts:954-964,2093-2104` |
| `mapping_set_id` | Identifies the publisher/logical mapping-set release containing a crosswalk assertion. SSSOM import takes it from the row or header, otherwise derives `urn:crosswalker:mapping-set:sha256:<hash-of-TSV>`, and writes it into each edge. | It is not the Crosswalker ownership `import_set.id`, does not qualify ordinary concept identities, and does not itself retain old/new concept lineage. | `spec/tier1.schema.json:202-260`; `src/import/sssom-importer.ts:157-188,207-223` |
| Tier 2 `source_hash` | Every projected concept, junction, and mapping row receives a deterministic FNV-1a hash of canonical current frontmatter with only `_crosswalker.produced_at` removed. It can detect current frontmatter drift between two independently retained row sets. | It is not a source-file hash, excludes the body, includes user frontmatter, is non-cryptographic, and is overwritten by each upsert. Tier 2 keeps no previous hash or prior row snapshot. | `src/tier2/projector.ts:414-552,696-740`; `src/tier2/schema.sql:38-122` |
| Tier 2 ontology version reconciliation | Concept provenance version is projected to one `ontologies.version` string per CURIE prefix. Conflicts keep the BINARY-lexically greatest non-empty string observed. | It does not parse semantic versions, preserve multiple release rows, model release lineage, or distinguish coexisting releases sharing a prefix. Lexical maximum is only a representative current string. | `src/tier2/schema.sql:24-33`; `src/tier2/projector.ts:556-614,650-669` |
| Generic row-set `diff()` | Pure, engine-neutral comparison of two supplied row arrays by configurable identity key. Returns added, removed, changed, optional unchanged, and per-field before/after changes. It was explicitly written for ontology-version delta queries. | It does not acquire or persist snapshots, infer semantic lineage, produce a durable migration artifact, assess impacts, record review decisions, apply changes, or retain audit history. In the current production tree its consumer is the primitive benchmark, not a migration workflow. | `src/views/diff-primitive.ts:1-24,39-83,91-145`; `src/views/benchmark-primitives.ts:26,226-233` |
| Managed frontmatter merge | Recipe-declared managed keys receive fresh values. Existing non-managed and third-party keys survive. `user_preserve` exact names or simple `*` globs remove matching keys from recipe authority. `tags` and `aliases` are unioned with existing extras. | `_crosswalker` and `curie` are always overwritten. Managed scalar/object values do not preserve user edits. A tag or alias the recipe stops emitting is intentionally retained, so the merge cannot distinguish stale recipe values from user additions. | `src/generation/frontmatter-merge.ts:34-105,108-153` |
| Managed body regions | Commit `28aef6b4` introduced versioned managed `body` regions and the shared existing-note merger. Replace regenerates the managed region while preserving every byte outside it. Balanced unknown regions remain untouched. Facet hubs preserve prose below the regenerated H1; synthetic hubs regenerate only the managed children region. | User edits inside a managed region do not survive. Corrupt/future/ambiguous markers fail closed. An unmarked legacy ordinary note is adopted only when its body matches the fresh managed render under narrow rules; otherwise the whole note remains untouched as a conflict. This is replacement, not semantic or three-way merge. | `src/generation/managed-body.ts:1-56,87-114,206-369,464-565`; `src/generation/existing-note.ts:120-203`; `src/generation/generation-engine.ts:2188-2234,2503-2531,2553-2596`; `.workspace/2026-08-27-managed-body-regions-contract.md:1-49`; commit `28aef6b4` |
| Evidence junction attachment | Junction frontmatter carries clickable `subject`/`object` wikilinks and optional stable `subject_curie`/`object_curie`. The evidence command writes both wikilinks and the control's `subject_curie`; coverage joins `junction.subject_curie = concept.curie`, never wikilink text. | The command does not write `object_curie`; evidence-document identity remains path-addressed. If a concept CURIE changes, the junction retains the old identity and is diagnosed as `subject-not-a-known-concept`; no successor retarget occurs. | `spec/tier1.schema.json:146-199`; `src/views/evidence-link.ts:16-22,81-136`; `src/tier2/evidence-coverage.ts:24-43,137-169,217-256` |
| Crosswalk endpoint attachment | Crosswalk edges identify endpoints with CURIE fields `subject_id` and `object_id`; `mapping_set_id` identifies the mapping-set release. | There are no required clickable endpoint wikilinks and no automatic retarget when an endpoint CURIE changes. Tier 2 mappings have no foreign keys to concept rows, so an old endpoint can remain stored without becoming a lineage relation. | `spec/tier1.schema.json:202-260`; `src/tier2/schema.sql:65-90` |

### Identity versus path: current boundary

- **Identity-keyed:** global reconciliation lookup, collision detection, import-set membership/orphan comparison, Tier 2 concept key `(ontology_id, curie)`, evidence coverage attachment, and crosswalk endpoints (`src/generation/identity-index.ts:73-162`; `src/generation/generation-engine.ts:341-358,2303-2317`; `src/tier2/schema.sql:38-57`; `src/tier2/evidence-coverage.ts:137-169`; `spec/tier1.schema.json:202-260`).
- **Path/address-keyed:** rendered output location; direct desired-path fast path; actual rename operation; evidence junction filename/CURIE derivation and evidence-object wikilink (`src/generation/generation-engine.ts:784-824,2135-2144`; `src/views/evidence-link.ts:81-124`).
- **Important consequence:** same CURIE plus new path is a move. New CURIE is not a migration match. If its desired path is already occupied, the path-first fast path can replace that file's CURIE; otherwise the new CURIE is created independently and the old set-owned CURIE can be reported as an orphan (`src/generation/generation-engine.ts:784-824,2303-2317`).

## 2. Survives-a-reimport inventory

### Replace mode, same CURIE

| Existing user-authored or attached data | Survives? | Exact behavior and evidence |
|---|---:|---|
| Note identity | Yes | `curie` is the reconciliation key; the same generated note is selected even if its address changed (`src/generation/identity-index.ts:73-123`; `src/generation/generation-engine.ts:794-810`). |
| Note location chosen by the old recipe/user | Not necessarily | Current render address wins in Replace mode; the note is moved through `renameFile` and the move is reported (`src/generation/generation-engine.ts:2135-2144`). |
| Frontmatter keys outside recipe-managed authority | Yes | Existing non-managed, third-party, and hand-added keys are copied forward (`src/generation/frontmatter-merge.ts:43-56`). |
| Keys named by `user_preserve` | Yes | Exact and `*`-glob matches are removed from the managed set; existing values remain authoritative even if the fresh render emitted a value (`src/generation/frontmatter-merge.ts:58-78,108-153`). |
| User-added tags and aliases | Yes | Existing lists are unioned after recipe-emitted values (`src/generation/frontmatter-merge.ts:34-41,62-69,80-105`). |
| Recipe-managed frontmatter | No | Fresh managed values replace existing values. `_crosswalker` and `curie` are always rewritten (`src/generation/frontmatter-merge.ts:58-78`). |
| User prose outside a managed body region | Yes, byte-for-byte | Region replacement splices only the managed range and preserves all bytes outside it (`src/generation/managed-body.ts:339-369`; `src/generation/existing-note.ts:162-203`). |
| User edits inside `crosswalker:body` | No | The managed body region is replaced by the fresh rendered body (`src/generation/managed-body.ts:87-114,339-369`). |
| Unknown balanced managed-region types | Yes | The scanner recognizes their boundaries but replacement targets only the named region; other balanced regions remain in place (`src/generation/managed-body.ts:206-369`). |
| Unmarked legacy body that exactly replays as generated | Outside prose, if any | Strict adoption wraps/replaces only when the current legacy body matches the expected generated body under the recognized compatibility rules (`src/generation/managed-body.ts:464-545`; `src/generation/existing-note.ts:162-203`). |
| Unmarked legacy body with ambiguous user edits | Entire note survives untouched | Adoption fails closed; because body and frontmatter merge atomically, no frontmatter update is applied either, and a conflict is returned (`src/generation/existing-note.ts:141-203`). |
| Corrupt, duplicate, nested, interleaved, inverted, unclosed, or future-version markers | Entire note survives untouched | All marker-structure failures are conflicts and block modification (`src/generation/managed-body.ts:43-56,206-328`; `src/generation/existing-note.ts:141-203`). |
| Evidence attachment when the concept path changes | Yes | Obsidian rename updates wikilinks, while coverage independently joins by stable `subject_curie` (`src/generation/generation-engine.ts:2135-2144`; `src/tier2/evidence-coverage.ts:137-169`). |
| Crosswalk attachment when only the concept path changes | Yes | Edge endpoints are CURIEs, not paths (`spec/tier1.schema.json:202-260`). |
| Prior provenance/hash values | No historical copy in the note | Replace writes fresh `_crosswalker` provenance; it contains current recipe hash/CID/version but no list of prior values (`src/generation/frontmatter-merge.ts:72-78`; `src/generation/provenance.ts:48-101`). |
| Prior Tier 2 row/hash | No | Current rows are upserted on one identity key and current `source_hash` replaces the previous value; the schema has no history table (`src/tier2/schema.sql:24-122`; `src/tier2/projector.ts:414-552`). |

### When the concept identifier changes

1. **Identity preservation stops at the CURIE boundary.** The global index has no old-to-new lookup (`src/generation/identity-index.ts:35-55,73-123`).
2. **Address determines the immediate write outcome:**
   - same desired path: current path-first resolution accepts that file and Replace rewrites `curie` and `_crosswalker`;
   - different desired path: a new note is written, and the old set-owned CURIE can be reported as an orphan after a complete run (`src/generation/generation-engine.ts:784-824,2303-2317`; `src/generation/frontmatter-merge.ts:72-78`).
3. **Evidence does not follow the changed identifier.** The junction keeps the old `subject_curie`; coverage excludes it as `subject-not-a-known-concept` unless an old concept row still exists (`src/tier2/evidence-coverage.ts:217-256`).
4. **Crosswalks do not follow the changed identifier.** Existing `subject_id`/`object_id` values remain the old CURIEs; no successor/predecessor relation or retargeting operation exists in the edge schema (`spec/tier1.schema.json:202-260`).

### Two-line answer

**Same CURIE:** Replace reconciles to the same Crosswalker note, moves it if necessary, preserves unmanaged/`user_preserve` frontmatter plus user tags/aliases and all prose outside managed body regions, and keeps CURIE-based evidence/crosswalk attachments valid.

**Changed CURIE:** no lineage reconciliation occurs; path coincidence may overwrite the old note's CURIE, otherwise the new identity is created and the old identity is reported as an orphan, while evidence and crosswalk endpoints retain the old CURIE and are not retargeted.

## 3. Confirmed gaps

| Gap | Existing boundary that proves the gap |
|---|---|
| Concept lineage | Current concept properties contain `curie`, title/aliases/tags, parent identity/address, children, and provenance, but no lineage field. `concept_cid` detects content change; it does not relate identities (`spec/tier1.schema.json:114-143`; `src/generation/hash.ts:193-245`). |
| `previous_ids` | The current machine schema has no `previous_ids` property in either concept frontmatter or provenance, and current source has no consumer. The finite concept/provenance property sets are shown at `spec/tier1.schema.json:55-110,114-143`. |
| Successor/predecessor relations | Neither concept properties nor the six crosswalk predicates define `successor`, `predecessor`, `supersedes`, or `superseded_by` (`spec/tier1.schema.json:114-143,202-260`). |
| Split/merge representation and decisions | Existing identities are one CURIE per note and endpoint CURIEs per edge. `GenerationResult` has moves, orphans, warnings, and conflicts, but no one-to-many/many-to-one match or reassignment decision shape (`src/types/config.ts:439-495`; `spec/tier1.schema.json:202-260`). |
| Persisted source-release snapshots | Tier 2 has one ontology row per id and one concept row per `(ontology_id, curie)`; upserts keep current state only (`src/tier2/schema.sql:24-57`; `src/tier2/projector.ts:556-614`). |
| Migration-specific diff artifact | `diff()` returns an in-memory `DiffResult`; no current migration artifact, serializer, or storage contract wraps it. Its only production-tree caller is the benchmark (`src/views/diff-primitive.ts:75-145`; `src/views/benchmark-primitives.ts:26,226-233`). |
| Impact analysis | Evidence coverage can diagnose an endpoint that no longer resolves, but there is no pre-apply impact set spanning evidence, crosswalks, user fields, and descendant relationships (`src/tier2/evidence-coverage.ts:217-256`; `src/types/config.ts:439-495`). |
| Migration review UI | Registered import/query/evidence commands do not include a source-ontology migration review command. The existing `migrate-query-layout` command is specifically a query-storage layout migration, not framework-version migration (`src/main.ts:246-330,670-706`; `src/views/migrate-query-layout.ts:1-84`). |
| Migration apply/audit record | Generation records only current-run created/skipped/errors/moves/orphans/warnings/conflicts. No migration match decisions, reviewer choices, applied-change record, or replay reference is represented (`src/types/config.ts:439-495`). |
| Tier 2 history | The schema contains current ontologies, concepts, mappings, junctions, and derived closure/cache rows, but no snapshot, valid-time, transaction-time, lineage, or migration-event table (`src/tier2/schema.sql:24-169`). |
| Concept-release coexistence | `set-qualified-v1` is wired into SSSOM assertion CURIE generation. Default concept CURIE generation does not include the import set, and reconciliation is global by CURIE (`src/import/sssom-importer.ts:257-268,433-455`; `src/generation/generation-engine.ts:1900-1920,2027-2031,2643-2651`). |
| Source-file hash on normal imports | Provenance supports `sourceHash`, but the two generation call sites do not supply it (`src/generation/provenance.ts:24-43,88-101`; `src/generation/generation-engine.ts:954-964,2093-2104`). |
| Historical recipe/source comparison | Current provenance stores the latest CID and recipe hash, and Tier 2 stores the latest frontmatter hash. No built-in previous snapshot is retained for comparison (`src/generation/provenance.ts:48-101`; `src/tier2/schema.sql:38-122`). |
| Human release label on import sets | Import-set identity is deliberately random and semantically meaningless; current shipped limit explicitly leaves source/release labeling unresolved (`src/generation/import-set.ts:1-8,111-127`; `docs/src/content/docs/agent-context/zz-log/2026-08-21-import-set-ownership.mdx:82-108`). |

## 4. Stale-brief corrections

### A. `previous_ids` is not shipped

> “`previous_ids?: string[]` ... **Already spec'd and shipped**” (`docs/src/content/docs/agent-context/zz-challenges/43-version-migration-semantic-diff.mdx:37`)
>
> “Is `previous_ids: string[]` (already shipped...) sufficient...” (`.../43-version-migration-semantic-diff.mdx:54`)

**Correction:** the current Tier 1 concept schema has no `previous_ids` property, and repository source has no implementation that consumes it. The concept schema's current property set ends at `children` and `_crosswalker` (`spec/tier1.schema.json:114-143`). This is the single most important stale premise because the brief treats the proposed alias field as an available migration primitive when it does not exist in the machine contract.

The caution callout also says Crosswalker's internal schema migration uses “`previous_ids` aliasing” (`.../43-version-migration-semantic-diff.mdx:17-18`). That may describe an earlier design page, but it is not current Tier 1 machine-schema behavior.

### B. “Type 2 + Type 3” is not the behavior of current Tier 2

> “Crosswalker's committed default is Type 2 + Type 3” (`.../43-version-migration-semantic-diff.mdx:33`)

**Correction:** whatever the earlier design commitment intended, the shipped Tier 2 sidecar is a current-state projection: one ontology row per id, one concept row per `(ontology_id, curie)`, and one current hash per row. It has neither historical version rows nor alias/lineage fields (`src/tier2/schema.sql:24-122`). Tier 2 ontology version reconciliation stores the BINARY-lexically greatest current version string, not slowly changing history (`src/tier2/projector.ts:556-614`).

### C. Source-hash comparison is only partially wired

> “stale-crosswalk detection via source-hash comparison” (`.../43-version-migration-semantic-diff.mdx:35`)

**Correction:** Tier 1 provenance defines a source-file `source_hash`, but ordinary plugin generation does not populate it (`src/generation/provenance.ts:24-43,88-101`; `src/generation/generation-engine.ts:954-964,2093-2104`). Tier 2's field with the same name is instead an FNV-1a hash of current frontmatter, excludes body content, and overwrites its prior value (`src/tier2/projector.ts:696-740`; `src/tier2/schema.sql:38-122`). There is no shipped stale-crosswalk detector comparing retained release hashes.

### D. The source-versus-recipe hash axes now exist, but not the comparison history

> “Does `render()`'s determinism/Pass-1 hashability give this apart for free ... or does the system need an explicit signal?” (`.../43-version-migration-semantic-diff.mdx:53`)

**Correction:** current generation now writes two explicit signals: `concept_cid = sha256({curie, source-row scope})` and `recipe.hash = sha256(effective output-affecting recipe fields)` (`src/generation/hash.ts:188-245,247-347`; `src/generation/generation-engine.ts:945-966,1906-1910`). They can distinguish the axes when a caller retains before and after values. Crosswalker itself does not retain the prior provenance/Tier 2 row, and normal generation lacks the source-file hash, so the historical comparison is not “free.”

### E. Stable-identity moves and user-body preservation have shipped since the brief

> “does a ‘moved concept drag its evidence links along’ default make sense” (`.../43-version-migration-semantic-diff.mdx:54`)

**Correction:** for an unchanged CURIE whose vault address changes, this is now shipped behavior: generation finds the note by CURIE, renames it through Obsidian, and evidence coverage remains attached by `subject_curie` (`src/generation/generation-engine.ts:794-810,2135-2144`; `src/tier2/evidence-coverage.ts:137-169`). It does not cover a CURIE rename, split, or merge.

The brief's preservation discussion also predates commit `28aef6b4`: Replace now preserves prose outside versioned managed body regions and fails closed on ambiguous legacy/corrupt bodies, in addition to the earlier managed/`user_preserve` frontmatter merge (`src/generation/managed-body.ts:1-56,339-369,464-565`; `src/generation/existing-note.ts:141-203`; `src/generation/frontmatter-merge.ts:43-78`).

### F. Release isolation now exists for crosswalk assertions, not concepts

The brief discusses old-version-to-new-version mappings as potential SSSOM mapping sets (`.../43-version-migration-semantic-diff.mdx:43,55,58`). Since it was written, Crosswalker shipped import-set ownership and `set-qualified-v1`. The correction is narrow: this currently isolates SSSOM crosswalk assertion identities as `cwset-<import-set-id>-<subject>-<object>`; it does not version-qualify ordinary concept CURIEs (`src/import/sssom-importer.ts:257-268,433-455`; `src/generation/generation-engine.ts:2027-2031,2643-2651`).

## Bottom line for the architect session

Crosswalker already has strong current-state primitives: CURIE reconciliation and moves, durable ownership sets and orphan reporting, separately hashable source-row/recipe axes, explicit mapping-set identity, a generic row-set diff, managed/user-preserved frontmatter, managed body regions, and CURIE-based evidence/crosswalk attachment.

The missing layer is historical and relational: no retained release snapshots, concept lineage, predecessor/successor or split/merge semantics, migration change-set artifact, impact/review/apply workflow, migration UI, or Tier 2 history. `set-qualified-v1` solves coexistence for SSSOM assertion notes only; it does not solve coexistence for same-CURIE concept notes from multiple framework releases.

---

**Method:** repository source, docs, and git history only. No build, test, lint, or E2E commands were run.
