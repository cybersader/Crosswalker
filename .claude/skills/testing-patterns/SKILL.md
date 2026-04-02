---
name: testing-patterns
description: Use when writing tests, analyzing test results, or improving test coverage. Provides conventions for workflow testing, comment syntax, and improvement patterns.
---

# Testing Patterns

Domain expertise for testing AI agent workflows. Use this when writing tests, analyzing results, or planning test improvements.

---

## Quick Reference

| Concept | Pattern |
|---------|---------|
| Test categories | Adoption, Modularity, Portability, Intuitiveness, Docs, Deterministic |
| Comment syntax | `%%PASS%%`, `%%FAIL%%`, `%%NOTE%%`, `%%TODO%%`, `%%QUESTION%%` |
| Results format | `RESULTS.md` with category tables |
| Improvement loop | Test → Comment → Report → Improve → Repeat |

---

## Test Category Framework

### Category A: Adoption Tests
**Core question:** Can someone new get productive quickly?

Good adoption tests measure:
- Time to first useful interaction
- Clarity of entry points (README, Quick Start)
- Error recovery when setup goes wrong
- Minimal viable setup path

### Category B: Modularity Tests
**Core question:** Can you use pieces independently?

Good modularity tests validate:
- Single skill works without scaffold
- Single agent works without other agents
- No hidden dependencies between components
- Partial installation is viable

### Category C: Portability Tests
**Core question:** Does it work across tools and projects?

Good portability tests verify:
- Same skill works in Claude Code AND OpenCode
- Drop into existing project without conflicts
- Global vs local priority works correctly
- No tool-specific assumptions baked in

### Category D: Intuitiveness Tests
**Core question:** Do things work as expected?

Good intuitiveness tests check:
- Natural language triggers right behavior
- Users can discover what's available
- Same input produces consistent output
- No surprising side effects

### Category E: Documentation Tests
**Core question:** Are docs accurate and helpful?

Good documentation tests verify:
- Links work and point to real content
- Examples actually execute
- No stale or outdated information
- Cross-references are valid

### Category F: Deterministic Checks
**Core question:** Can we validate programmatically?

Good deterministic tests are:
- Scriptable (bash/grep/find)
- Repeatable (same result every time)
- Fast (run on every change)
- Clear (pass/fail, no ambiguity)

---

## Test Structure Template

Every test should have:

```markdown
### [ID]: [Test Name]

**Goal:** [One sentence - what success looks like]

**Setup:**
1. [Prerequisite step]
2. [Prerequisite step]

**Steps:**
1. [Action to take]
2. [Action to take]
3. [Action to take]

**Pass Criteria:**
- [ ] [Checkable criterion]
- [ ] [Checkable criterion]
- [ ] [Checkable criterion]

**Results:**
| Tool | Pass? | Notes |
|------|-------|-------|
| Claude Code | | |
| OpenCode | | |

**Comments:** %%Add observations here%%
```

---

## Comment Syntax

Use Obsidian-compatible comments for inline test feedback:

| Comment | When to Use | Example |
|---------|-------------|---------|
| `%%PASS: message%%` | Test passed as expected | `%%PASS: Skill loaded on first try%%` |
| `%%FAIL: message%%` | Test failed | `%%FAIL: Agent didn't trigger, manual invoke needed%%` |
| `%%NOTE: message%%` | Interesting observation | `%%NOTE: OpenCode behaves differently here%%` |
| `%%TODO: message%%` | Action needed | `%%TODO: Add edge case for empty input%%` |
| `%%QUESTION: message%%` | Needs clarification | `%%QUESTION: Is this expected behavior?%%` |

**Collecting comments:**
```bash
grep -r "%%" test-workspace/ --include="*.md"
```

**Comment best practices:**
- Be specific - include what you expected vs what happened
- Include context - tool, scenario, input
- One observation per comment
- Keep comments near the relevant test section

---

## RESULTS.md Format

Track results in a structured table by category:

```markdown
## Category A: Adoption

| ID | Test | Claude Code | OpenCode | Last Run |
|----|------|-------------|----------|----------|
| A01 | Fresh Start | PASS | PASS | 2025-12-24 |
| A02 | Minimal Setup | PASS | FAIL | 2025-12-24 |

### A02 Notes
- OpenCode: [specific issue observed]
- Action: [what needs to change]
```

**Status values:**
- `PASS` - All criteria met
- `FAIL` - One or more criteria failed
- `PARTIAL` - Some criteria met, some unclear
- `SKIP` - Not applicable or blocked
- `TODO` - Not yet tested

---

## Improvement Loop

```
1. Run tests
   └── Add %%comments%% as you go

2. Generate report
   └── Run /test-report to aggregate findings

3. Analyze patterns
   └── What's failing? What's unclear?

4. Prioritize fixes
   └── Critical failures > Edge cases > Polish

5. Implement changes
   └── Fix the actual issue, not just the symptom

6. Re-run affected tests
   └── Verify the fix works

7. Repeat
   └── Until all priority tests pass
```

---

## Writing Good Pass Criteria

**Bad criteria (vague):**
- [ ] It works
- [ ] The skill loads
- [ ] User can do the thing

**Good criteria (specific, checkable):**
- [ ] Skill permission prompt appears within 3 seconds
- [ ] Skill content visible in response (quote specific text)
- [ ] No error messages in output
- [ ] Total time < 5 minutes (timed)

**Criteria guidelines:**
1. **Observable** - Can be seen or measured
2. **Binary** - Pass or fail, no "mostly works"
3. **Independent** - Each criterion stands alone
4. **Specific** - Exact values, not ranges

---

## Common Testing Anti-Patterns

### Testing What You Built, Not What Users Need
**Problem:** Tests verify internal mechanics, not user value
**Fix:** Start with user goal, work backward to what to test

### Assuming Success
**Problem:** Only testing happy path
**Fix:** Include error cases, edge cases, recovery scenarios

### Vague Criteria
**Problem:** "It should work" is not testable
**Fix:** Specify exact expected behavior

### Testing in Isolation Only
**Problem:** Components work alone but fail together
**Fix:** Include integration tests across components

### Not Recording Findings
**Problem:** Run tests, forget results
**Fix:** Always update RESULTS.md and add %%comments%%

---

## Deterministic Check Patterns

### File Structure Validation
```bash
# Skills in correct format
find .claude/skills -name "SKILL.md" -type f | wc -l

# No loose skill files
find .claude/skills -maxdepth 1 -name "*.md" -type f
```

### YAML Field Validation
```bash
# Check for required fields in agent
grep -l "^name:" .claude/agents/**/*.md
grep -l "^description:" .claude/agents/**/*.md
grep -l "^tools:" .claude/agents/**/*.md
```

### Link Validation
```bash
# Find all wikilinks
grep -oh '\[\[[^]]*\]\]' *.md | sort | uniq

# Check if targets exist (manual or scripted)
```

### Naming Consistency
```bash
# Directory name should match YAML name field
for dir in .claude/skills/*/; do
  name=$(basename "$dir")
  grep "^name: $name" "$dir/SKILL.md" || echo "Mismatch: $dir"
done
```

---

## Related

- `TESTING.md` - Active test scenarios
- `RESULTS.md` - Test result tracking
- `/validate` command - Run deterministic checks
- `/test` command - Interactive test runner
- `/test-report` command - Aggregate findings
- `test-improver` agent - Proactive improvement suggestions
