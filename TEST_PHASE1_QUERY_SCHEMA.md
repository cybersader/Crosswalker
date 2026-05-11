# Phase 1 manual test guide — Recipe `query:` block schema

**What shipped**: Phase 1 of v0.1.6 (per [v0.1.6 implementation plan](.claude/plans/make-a-new-log-abstract-shore.md)). Adds the additive `query:` block schema to `spec/recipe.schema.json` per Ch 31, in two interchangeable discriminator styles (A: `oneOf`+`const`, B: `if`/`then`/`else`) selectable via plugin settings. Ships 5 reference recipes (one per v0.1 view shape) and 23 unit tests.

**What's NOT in Phase 1** (deferred to Phase 2+): SSSOM TSV import, materialized closure tables, the `crosswalkerPivot` Bases view, recipe-picker UX, materialization command. Phase 1 is the foundation everything else needs.

---

## Pre-flight — reload after every rebuild

The test-vault ships with the [Hot Reload](https://github.com/pjeby/hot-reload) community plugin installed and Crosswalker registered for auto-reload (`.hotreload` marker file in the plugin directory). When the dev workflow rebuilds `main.js`, Hot Reload will pick it up automatically — no manual reload needed.

If Hot Reload isn't running (you disabled it, fresh vault, etc.), you MUST manually reload after every rebuild:

- Settings → Community plugins → toggle Crosswalker **off**, then **on**, OR
- Ctrl+R inside the dev console (Ctrl+Shift+I → Console → Ctrl+R)

Without a reload, Obsidian keeps the OLD plugin code in memory regardless of what's on disk. Bugs that have been fixed will still appear to be present.

---

## Pre-flight checks (automated)

These should all be green before manual testing:

- [x] `bun run test` → 139/139 tests pass (added 23 new in `tests/recipe-query-block.test.ts`)
- [x] `bun run build` → TypeScript clean; esbuild bundle succeeds
- [x] `bun run codegen` → regenerates `src/types/generated/recipe.ts` from updated schema
- [x] Schema parses as valid JSON (verified)
- [ ] **Lint**: 7 pre-existing failures on `main` (not introduced by Phase 1; fix in separate commit). Phase 1's new code lints clean.

---

## Manual test scenarios

### Scenario 1: Existing recipes still work (backward-compatibility)

The whole point of "additive bump" is that recipes WITHOUT `query:` continue to validate.

**Steps:**
1. Open Obsidian with the test vault loaded
2. Settings → Community plugins → Crosswalker → make sure the plugin is loaded (no errors in dev console)
3. Run command `Crosswalker: Import structured data` (existing v0.1.5 command; no changes in Phase 1)
4. Step 1 of the wizard: pick a sample CSV (`Crosswalker Test Data/nist-800-53-sample.csv` or similar)
5. The wizard auto-detects the column shape and may auto-apply a matching **saved config** ("NIST 800-53 Sample Format" or similar). This is the [smart config matching](https://github.com/cybersader/Crosswalker) feature; expected behavior, not a bug. The wizard shows which config was applied at the top of Step 2.
6. (Optional) override column roles in Step 2 if you want to manually validate the wizard form
7. Click through Steps 3 (preview) and 4 (generate)
8. Verify wizard advances normally; no validation errors

**Expected:**
- Notice at the end says `✅ Created N notes` where N matches the CSV row count
- Notes appear in your test-vault under `Frameworks/NIST-800-53/` (or wherever the saved config's output path points)
- No "row processing error" entries in `crosswalker-debug.log`

**If you see "0 notes generated":**
1. Confirm you reloaded the plugin after the most recent build (Hot Reload should auto-do this; if you suspect it didn't, toggle the plugin off + on)
2. Open `crosswalker-debug.log` at vault root and grep for `level":"error"` (now NDJSON per Phase 3.5a): `cat crosswalker-debug.log | jq 'select(.level=="error")'` from a shell, or just search for the word `error` in Obsidian if you don't have jq
3. The most common error is a filename template referencing a missing column. If you see `"resolved to undefined/null in template"`, file a bug — the wizard should never emit a template that can't resolve

The `query:` block change is invisible to existing recipes — both old saved configs and the import flow should behave exactly as in v0.1.5.

### Scenario 2: Settings toggle for schema style

**Steps:**
1. Settings → Community plugins → Crosswalker → click the gear icon
2. Scroll down to find a new "Recipe schema" section heading
3. Verify a "Recipe query block schema style" dropdown with options:
   - `Style A (default)` — selected by default
   - `Style B (advanced)`
4. Switch to Style B and back; verify the dropdown persists (close + reopen settings)

**Expected**: dropdown saves the active style; `data.json` should contain `"recipeSchemaStyle": "A"` or `"B"`.

### Scenario 3: Reference recipes validate (both styles)

The 5 new reference recipes live in `recipes/v0-1/`. They're not yet wired into the import wizard (that's Phase 4 — recipe picker UX). For Phase 1, validate them via dev console.

**Steps:**
1. Open Obsidian dev console (Ctrl+Shift+I, or Cmd+Opt+I on Mac)
2. Run:
   ```js
   const recipe = JSON.parse(await app.vault.adapter.read('recipes/v0-1/coverage-matrix.json'))
   const result = await app.plugins.plugins.crosswalker.validateRecipe(recipe)
   console.log(result)
   ```
3. Verify `result.valid === true` and `result.errors.length === 0`
4. Repeat for all 5 reference recipes (`coverage-matrix.json`, `crosswalk-density.json`, `orphan-controls.json`, `hierarchy-view.json`, `list-view.json`)
5. Toggle settings to Style B, repeat step 2-4, verify all 5 still validate

**Expected**: all 10 validations pass (5 recipes × 2 styles).

### Scenario 4: Schema rejects malformed `query:` blocks

**Steps in dev console:**
```js
// Pivot missing required cell
const bad1 = {
  recipe: 'test',
  source: { ontology: 'a', levels: ['c'] },
  target: { layout: [{ level: 'c', mechanism: 'file', template: '{c.id}.md' }] },
  query: {
    shape: 'pivot',
    primitives: { rows: { of: 'a', by: 'x' }, cols: { of: 'b', by: 'y' } }  // no cell!
  }
}
const r1 = app.plugins.plugins.crosswalker.validateRecipe(bad1)
console.log(r1.valid, r1.errors)
// expect: false, errors mentioning required cell

// Unknown shape
const bad2 = {
  recipe: 'test',
  source: { ontology: 'a', levels: ['c'] },
  target: { layout: [{ level: 'c', mechanism: 'file', template: '{c.id}.md' }] },
  query: { shape: 'sankey', primitives: {} }  // sankey not in enum
}
const r2 = app.plugins.plugins.crosswalker.validateRecipe(bad2)
console.log(r2.valid, r2.errors)
// expect: false, errors mentioning enum/allowedValues
```

**Expected**: both `r1` and `r2` are `valid: false` with descriptive error messages.

### Scenario 5: `bun run codegen` regenerates types correctly

**Steps (terminal):**
```bash
cd /path/to/crosswalker-obsidian-plugin
bun run codegen
git diff src/types/generated/recipe.ts | head -30
```

**Expected**: clean regeneration (no diff if already up-to-date); generated types include `QueryBlock`, `ShapeDispatchA`, `PivotPrimitives`, `TablePrimitives`, etc.

---

## Edge cases worth checking

- [ ] Recipe with `query:` AND `target.layout` both present → both should validate independently (the recipe imports data + declares its canonical query)
- [ ] Recipe with `$schema` and `$comment` at top level (these are now allowed) → validates
- [ ] Recipe with random extra top-level key (e.g., `notes: "..."`) → fails (additionalProperties: false stays enforced for non-meta keys)
- [ ] `recipe.query.params` with `confidence_threshold: { type: 'number', default: 0.7 }` → validates
- [ ] `recipe.query.primitives.agg[].op: 'x_custom_op'` → validates (custom op extension via x_-prefix)

---

## Things that should explicitly NOT work yet (deferred to Phase 2+)

- ❌ The `crosswalker-pivot` Bases view doesn't exist yet (Phase 3)
- ❌ The recipe-picker modal command palette entry doesn't exist (Phase 4)
- ❌ SSSOM TSV import doesn't exist (Phase 2)
- ❌ Materialized closure tables aren't built (Phase 2)
- ❌ The opt-in materialization command doesn't exist (Phase 5)

If you try to use any of these via dev console, expect "function not defined" or "command not registered" errors. **That's the expected state at end of Phase 1.**

---

## Sign-off checklist

After running the scenarios above, please confirm:

- [ ] **Settings UI** shows the new "Recipe schema" section with the working dropdown
- [ ] **Existing import flow** still works (Scenario 1) — no regression in v0.1.5 behavior
- [ ] **Reference recipes** validate cleanly under both Style A and Style B (Scenario 3)
- [ ] **Schema enforcement** rejects malformed `query:` blocks (Scenario 4)
- [ ] **Type generation** is up-to-date after `bun run codegen` (Scenario 5)
- [ ] No regressions in dev console errors during normal plugin operation

If all green: ready to start Phase 2 (SSSOM TSV import + materialized closure tables).

If any red: file specific feedback so Phase 1 can be patched before Phase 2 starts.

---

## Files changed in Phase 1

| Change | Path |
|---|---|
| EDITED | `spec/recipe.schema.json` (additive `query:` block; SchemaVer 1.1.0; 31 new `$defs`) |
| EDITED | `src/validation/validator.ts` (compile both schema styles; pass style param to `validateRecipe`) |
| EDITED | `src/main.ts` (wrap `validateRecipe` to inject active style from settings) |
| EDITED | `src/settings/settings-data.ts` (added `recipeSchemaStyle: 'A' \| 'B'` field) |
| EDITED | `src/settings/settings-tab.ts` (toggle UI under "Recipe schema" section) |
| REGENERATED | `src/types/generated/recipe.ts` (auto from `bun run codegen`) |
| CREATED | `recipes/v0-1/coverage-matrix.json` (pivot shape — launch-market Coverage Matrix) |
| CREATED | `recipes/v0-1/crosswalk-density.json` (table shape) |
| CREATED | `recipes/v0-1/orphan-controls.json` (list shape; demonstrates anti-join) |
| CREATED | `recipes/v0-1/hierarchy-view.json` (hierarchy shape; renderer deferred v0.1.7-v0.1.8) |
| CREATED | `recipes/v0-1/list-view.json` (list shape; minimal example) |
| CREATED | `recipes/v0-1/README.md` (recipe inventory + authoring conventions) |
| CREATED | `tests/recipe-query-block.test.ts` (23 unit tests) |
| CREATED | `TEST_PHASE1_QUERY_SCHEMA.md` (this file) |
