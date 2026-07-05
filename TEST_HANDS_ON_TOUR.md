# Hands-on tour — test every surface (2026-06-12 state)

The master checklist for a full manual pass over the plugin + corpus. Each
section is independent; do them in order for the full story, or Ctrl+F the
surface you care about. Automated coverage is noted per section so you know
what's already machine-verified (576 unit tests + 11 visual/E2E specs) vs
what only your hands can judge.

> **Older per-feature guides** (deeper steps for one surface):
> `TEST_CROSSWALK_PIVOT.md` (corpus regen + pivot), `TEST_PHASE_4_5.md` (query
> notes), `TEST_PHASE1_QUERY_SCHEMA.md`, `TEST_PHASE2_SSSOM_IMPORT.md`,
> `TEST_PHASE3_PIVOT_VIEW.md`.

## 0. Setup

- [ ] **Lazy path (double-click, no terminal):** `dev.bat` at the repo root starts the watch build via WSL; `serve.bat` opens the full interactive menu via Windows bun. Both **self-heal** the WSL↔Windows `node_modules` mismatch (the orchestrator detects the wrong-platform esbuild/rollup binary and reinstalls) — so the first launch after switching sides pauses ~30–60s for a reinstall, then runs. That ping-pong is inherent to sharing the repo across both OSes
- [ ] Terminal equivalent: `bun run build` (or `bun run dev` for watch) — outputs to `test-vault/.obsidian/plugins/crosswalker/`
- [ ] Open `test-vault/` in Obsidian; enable **Crosswalker** + the **Bases** core plugin
- [ ] First open after corpus regen: wait for the "Indexing vault..." toast to finish (~10k notes) — pivots render "No data" pre-index
- [ ] Regenerate the local licensed corpus: run every block in `TEST_CROSSWALK_PIVOT.md` § 1 + § 5 (concepts, hierarchy back-fills, OLIR edges, SCF melt). Expect: **~7.4k concept notes + ~7.9k edge notes**, all gitignored
- [ ] **Reset between test runs** — after doing ad-hoc imports, clear them for a clean slate: **in Obsidian** run the command **"Crosswalker: Reset imported notes (dev)"** (groups generated notes by folder, protects the corpus, per-folder + delete-all buttons), or **outside Obsidian** double-click `reset.bat` (preview then keypress-to-delete) / run `bun run reset` (dry-run) / `bun run reset -- --yes` (delete). It removes only Crosswalker-generated notes **outside** the protected corpus — `Frameworks/_licensed/`, `Frameworks/NIST-mini/`, `_crosswalker/`, `GRC analysis/`, and `PROVENANCE.md` are never touched. Hand-written notes are never touched

## 1. Import wizard — CSV (the guided happy path)

*Automated: unit tests + streaming + full-loop E2E. Manual value: does it feel
magical? Reload the plugin first (toggle off/on) to pick up the 2026-06-12 UX.*

- [ ] Command palette → **Crosswalker: Import structured data**
- [ ] Pick `tools/fixtures/synthetic/nist-mini.csv`. **All file paths in this guide are repo-relative, not vault-relative** — the wizard opens your OS file dialog, so browse up out of `test-vault/` into the repo folder; Obsidian's sidebar will never show `tools/` or `Frameworks/`
- [ ] **Step 2 arrives pre-configured (smart defaults)** — you should see ✨ badges: `name` → **Note title**, `family` → **Hierarchy level**, `description` → **Body content**; everything else stays frontmatter. You configure *nothing* for the happy path — just review
- [ ] The intro line answers the standard questions up front: all columns imported as frontmatter by default, nothing dropped unless Skip
- [ ] The **"In the vault" column** live-previews each role (`📁 AC/`, `📄 Policy and Procedures.md`, `key: value`, `[[link]]`) — change a dropdown and watch the preview update in place
- [ ] **Filter box** narrows by name/key/sample; on wide sources (>25 cols) the all-default tail collapses behind "Show all columns" with special-role columns pinned on top — the SCF workbook (369 columns) shows the full effect
- [ ] **Step 3 is now a visual preview**: stat cards (📄 notes · 📁 folders · 🔗 links), a real folder tree built from your data (📁 AC/ → 📄 sample notes), and a mock note card (filename + properties block + body snippet). "Raw markdown" sits collapsed underneath
- [ ] Step 4 generate → notes land at the output path, nested under family folders; re-run with overwrite mode `skip` and confirm nothing clobbers
- [ ] **Config sharing (already built, easy to miss):** the saved-config JSON includes ALL column mappings — config browser → per-config **Export** + top-level **Import**. That JSON is the shareable unit for "here's how to import this framework's spreadsheet"
- [ ] **Suggestions yield correctly**: apply a saved config → ✨ suggestions are replaced by the config's ⚙️ mappings (config always wins)

## 2. Import wizard — XLSX (NEW 2026-06-12)

*Automated: `visual-wizard-formats.spec.ts` drives parse AND full generation.
Manual value: sheet picker UX, real corpus files.*

- [ ] Wizard → select `Frameworks/CIS_Controls_Version_8.1.2___March_2025.xlsx`
- [ ] **Sheet dropdown appears** listing all 5 sheets → pick `Controls v8.1.2`
- [ ] Leave header row at `0` → Next
- [ ] Step 2: expect **171 rows**, columns `CIS Control / CIS Safeguard / Asset Class / Security Function / Title / Description / IG1 / IG2 / IG3`
- [ ] Smart defaults here: `Title` → Note title ✨, `Security Function` → Hierarchy ✨ (5 unique values), `Description` → Body ✨
- [ ] **The 4.10 check** (the trap this build cures): step 2 sample values for `CIS Safeguard` must show `4.10` as text — never `4.1` twice
- [ ] Try a workbook with banner rows (`Frameworks/csf2.xlsx`, sheet `CSF 2.0`, header row `1`) — columns resolve only when header row is right
- [ ] Wrong sheet name path: can't happen (dropdown), but header row `5` on csf2 should produce junk columns — confirm the failure is visible, not silent

## 3. Import wizard — JSON (NEW 2026-06-12)

*Automated: parse + full generation E2E. Manual value: iterator ergonomics,
error quality.*

- [ ] Wizard → select `Frameworks/cprt_CSF_2_0_0_06-01-2026.json`
- [ ] **Iterator path** input appears → enter `$.response.elements.elements[*]`
- [ ] **Row filter** → `element_type=subcategory` → Next
- [ ] Step 2: expect **185 rows** (and the parse toast reports how many were filtered out)
- [ ] Smart defaults here (2026-06-13): `element_identifier` → **Folder tree (from id) ✨** — NOT flat. The wizard detects the `.`/`-` delimiters and the "In the vault" preview shows `📁 DE/DE.AE/DE.AE-02.md`; `text` → Body ✨. Generate → notes nest by function/category automatically (the §3.5 showcase, now point-and-click)
- [ ] To see it flat instead, change that column's role from "Folder tree (from id)" to "Note title" 
- [ ] **JSON record picker (UX iteration 2):** instead of typing `$.…` paths, Step 1 shows "Where are your records?" with the nested lists as **selectable cards** — radio dot, bold list name + path breadcrumb, a purple record-count badge, and field-name chips. The primary-record list is pre-selected even when a relationship/mapping list is larger (CPRT: `elements` selected, not the bigger `relationships`). Path syntax is under "Advanced." Root-array files show one "this whole file is your list" card
- [ ] **If it looks like an unstyled wall of text:** the CSS didn't deploy — reload the plugin; if still plain, the watch predates the styles.css-copy fix, so re-run `dev.bat`/`serve.bat` (or `cp styles.css test-vault/.obsidian/plugins/crosswalker/`)
- [ ] **Loud failures:** a generation that creates 0 notes (or has row errors) now raises a warning notice with the first cause — never a silent zero
- [ ] **Error-quality check**: re-select the file, enter iterator `$.objects[*]` → the error must **list the keys that DO exist** (`response`, …), not just "not found"
- [ ] Empty iterator on a root-array file: make a tiny `[{"a":1}]` .json and confirm it parses with no iterator
- [ ] Big-file feel: `Frameworks/enterprise-attack.json` (~25k objects) with `$.objects[*]` + `type=attack-pattern,revoked!=true,x_mitre_deprecated!=true` → 697 rows; note the parse time feels acceptable

## 3.5 ⭐ The showcase — taxonomy id → vault structure (id-driven hierarchy)

*This is the "magic": the structure is **parsed out of the id itself**, not from
separate columns. A CSF subcategory id like `DE.AE-02` decomposes into
`DE` (function) → `DE.AE` (category) → `DE.AE-02` (subcategory), and the recipe
turns that into a folder tree.*

The recipe `recipes/import/nist-csf-2-cprt-hierarchical.json` uses the engine's
template filters on the **single id field**:

```
function folder = {element_identifier|split(.,0)}   → DE
category folder = {element_identifier|split(-,0)}   → DE.AE
subcategory file = {element_identifier}.md          → DE.AE-02.md
```

Regenerate + open it:

```bash
bun tools/generate-fixtures.ts   --source "Frameworks/cprt_CSF_2_0_0_06-01-2026.json"   --iterator '$.response.elements.elements[*]' --where 'element_type=subcategory'   --recipe recipes/import/nist-csf-2-cprt-hierarchical.json --id '{element_identifier}'   --target "test-vault/Frameworks/_demo/NIST-CSF-2-tree" --clean
```

- [ ] Open `Frameworks/_demo/NIST-CSF-2-tree/` in Obsidian → **6 function folders → 34 category folders → 185 subcategory notes**, e.g. `DE/DE.AE/DE.AE-02.md`
- [ ] Open a leaf note → frontmatter carries `function: DE`, `category: DE.AE`, `level: subcategory`, and a proper `curie: "nist-csf-2:DE.AE-02"` (the recipe sets the ontology prefix — no more `unknown:`)
- [ ] Contrast with the flat wizard run (§3): same 185 concepts, but here the **id parsing builds the tree**. This is what [hierarchy primitives](https://cybersader.github.io/crosswalker/concepts/hierarchy-primitives/) + the [5-mechanism recipe grammar](https://cybersader.github.io/crosswalker/concepts/etl-and-import/) deliver

> **Update 2026-06-13 — now in the wizard too:** the **"Folder tree (from id)"** column role does exactly this id-parsing point-and-click (smart-defaults auto-pick it for structured ids), so §3's wizard run nests by default. This recipe remains the headless/automation equivalent.

## 4. SSSOM import modal

*Automated: unit + e2e specs. Manual value: the one-click fixture path.*

- [ ] Command palette → **Crosswalker: Import SSSOM crosswalk**
- [ ] Import the bundled fixture → 11 junction notes under `_crosswalker/mappings/csf-to-iso27001/`
- [ ] Spot-check one note: `predicate_id` direction sane (broadMatch → `is_narrower_than` — the 2026-06-12 direction fix)

## 5. Query commands (v0.1.6 Phases 4.5–4.7 — manual smokes still pending)

*These have pending "⏸ manual smoke" notes on the milestone page — your pass
closes them. Deep steps: `TEST_PHASE_4_5.md`.*

- [ ] **Crosswalker: Insert query into note** → picker → Configure → Apply → `_crosswalker/queries/SLUG/` folder created with `index.md` + `view.base`, `![[SLUG/view.base]]` embedded at cursor
- [ ] **Crosswalker: Embed existing query into note** → lightweight picker, embeds without re-creating
- [ ] **Crosswalker: Browse my queries** → list with Open / Embed here / Delete per row
- [ ] **Crosswalker: Refresh query views** → regenerates `.base` files from frontmatter
- [ ] **Crosswalker: Materialize this query (snapshot)** → writes `SLUG/materialized/result.json`
- [ ] **Crosswalker: Migrate queries to folder layout** → no-op message when nothing to migrate (one-shot 4.6 migration)
- [ ] Slug collision: create the same query twice → refuse-and-prompt behavior

## 6. GRC analysis suite (the output layer)

*Automated: `visual-grc-analysis.spec.ts` (7 screenshots). Manual value:
interactivity the screenshots can't show.*

Open each, in `GRC analysis/`:

- [ ] `Crosswalk Coverage/1` — CSF×800-53 heatmap: shading visible, not a flat grid
- [ ] `Crosswalk Coverage/4` — CSF×CRI triangle heatmap (7×7, GV×GV darkest at 44)
- [ ] `Crosswalk Coverage/5` — **AC-2 concept 360**: every row's From/To cells are **clickable internal links** (not dead `nist-800-53:AC-2↗` external arrows) → click through to the control note and back
- [ ] `Framework adoption/1` — CIS IG views: IG1=56, IG2-additions=74, IG3-only=23 (check the view tab counts)
- [ ] `Framework adoption/2` — SCF domain browser: AI & Autonomous Technologies is the biggest group (156)
- [ ] `Framework adoption/3` — **SCF hub matrix**: rows=SCF families, cols=7 frameworks, ~5.6k entries; click a hot cell (GOV×iso-27001=125) and confirm the underlying edge notes open
- [ ] Both index notes (`Control lens.md`, `Framework adoption.md`) render embedded views inline in reading mode
- [ ] **Pivot interactivity**: in any heatmap, switch the view dropdown to the table view and back; resize the pane; close/reopen the tab — no errors, state survives

## 7. Edge notes + graph

- [ ] Open any note in `_crosswalker/mappings/nist-csf-to-800-53/` — frontmatter has `subject_note`/`object_note` as live wikilinks AND the body line is linked
- [ ] Click `object_note` → lands on the 800-53 control; its **backlinks pane** shows the edge notes pointing at it
- [ ] Local graph on a control note: edges visible as connections
- [ ] Known-dangling links (deliberate, not bugs): `IA-13` (r5.1.1, newer than our source), `PT`/`CP`/`IR` family-level, CRI-extension ids (`EX`, `GV.AU-*`) — these render as unresolved (creates-on-click) by design

## 8. Settings tour

- [ ] Settings → Crosswalker: walk every section; confirm sentence-case headings, no plugin name in headings
- [ ] Toggle debug logging → `crosswalker-debug.log` appears in vault root; events carry `trace_id` (generate something to see a trace)
- [ ] Change default output path → wizard step 4 default follows it

## 9. Known caveats (don't file these as bugs)

| Caveat | Why |
|---|---|
| Bases grouped tables can't collapse groups | native Bases 1.12.7 limitation; our pivot is the additive answer |
| Bases can't rank groups by aggregate count | precompute or external chart; documented in Control lens findings |
| Pivot shows "No data" right after vault open | indexing race; wait for the toast, then re-open the view |
| SCF→ISO/SOC2/PCI edges have no object wikilinks | by design — STRM proxy carries ids only, we hold no notes for those frameworks |
| All SCF melt edges are `intersects_with` | flat mapping columns carry no relationship type (SCF's STRM detail = 185 PDFs, below the input floor) |
| CRI is financial-sector scoped | never treat CRI-derived views as general-purpose |
| Wizard JSON/XLSX state isn't draft-persisted | iterator/sheet choices reset if you close mid-flow (draft persists CSV-era fields only) — known small gap |

## 10. Report back

- Screenshot + `crosswalker-debug.log` lines (filter `jq 'select(.trace_id == "<id>")'`) for anything that errors
- The UI-parity audit (`zz-log/2026-06-12-ui-parity-audit`) lists the *known* missing UI surfaces (crosswalk-extraction UI, recipe editor, diff UI, share buttons) — gaps beyond that list are findings
