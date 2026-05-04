/**
 * validation.spec.ts — E2E test for v0.1.1 milestone (validation foundation)
 *
 * Verifies the AJV validator wired into the plugin works end-to-end:
 * the validator initializes at plugin load (no schema-malformation errors),
 * and the exposed handles on the plugin instance correctly classify valid /
 * invalid frontmatter and recipes.
 *
 * Per milestone v0.1.1 success criteria.
 *
 * Run: `bun run e2e`
 */

import { browser } from '@wdio/globals';
import { expect } from 'expect';

describe('Crosswalker plugin — validation foundation (v0.1.1)', function () {
  it('validator handles are exposed on the plugin instance', async () => {
    const info = await browser.executeObsidian(({ app }) => {
      // @ts-expect-error — plugins.plugins is internal API
      const plugin = app.plugins.plugins['crosswalker'];
      return {
        hasValidateRecipe: typeof plugin?.validateRecipe === 'function',
        hasValidateTier1: typeof plugin?.validateTier1Frontmatter === 'function',
      };
    });

    expect(info.hasValidateRecipe).toBe(true);
    expect(info.hasValidateTier1).toBe(true);
  });

  it('validateTier1Frontmatter accepts valid concept-note frontmatter', async () => {
    const result = await browser.executeObsidian(({ app }) => {
      // @ts-expect-error — internal API
      const plugin = app.plugins.plugins['crosswalker'];
      return plugin.validateTier1Frontmatter({
        curie: 'nist:AC-2',
        title: 'Account Management',
        _crosswalker: {
          spec_version: 'https://crosswalker.dev/spec/tier1.schema.json',
          source_ref: { file: 'NIST_800-53.csv' },
          produced_at: '2026-05-04T18:42:00Z',
        },
      });
    });

    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it('validateTier1Frontmatter rejects frontmatter missing required curie', async () => {
    const result = await browser.executeObsidian(({ app }) => {
      // @ts-expect-error — internal API
      const plugin = app.plugins.plugins['crosswalker'];
      return plugin.validateTier1Frontmatter({
        title: 'Missing Curie',
        _crosswalker: {
          spec_version: 'https://crosswalker.dev/spec/tier1.schema.json',
          source_ref: { file: 'test.csv' },
          produced_at: '2026-05-04T18:42:00Z',
        },
      });
    });

    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it('validateRecipe accepts a worked NIST all-folders example', async () => {
    const result = await browser.executeObsidian(({ app }) => {
      // @ts-expect-error — internal API
      const plugin = app.plugins.plugins['crosswalker'];
      return plugin.validateRecipe({
        recipe: 'nist-80053r5-allfolders',
        source: {
          ontology: 'nist-800-53-r5',
          levels: ['catalog', 'family', 'control'],
        },
        target: {
          layout: [
            { level: 'catalog', mechanism: 'folder', template: 'Frameworks/{catalog.name}' },
            { level: 'family', mechanism: 'folder', template: '{family.id}' },
            { level: 'control', mechanism: 'file', template: '{control.id}.md' },
          ],
        },
      });
    });

    expect(result.valid).toBe(true);
  });

  it('validateRecipe rejects unknown mechanism enum value', async () => {
    const result = await browser.executeObsidian(({ app }) => {
      // @ts-expect-error — internal API
      const plugin = app.plugins.plugins['crosswalker'];
      return plugin.validateRecipe({
        recipe: 'broken',
        source: { ontology: 'nist-800-53-r5', levels: ['x'] },
        target: {
          layout: [{ level: 'x', mechanism: 'banana', template: '{x}' }],
        },
      });
    });

    expect(result.valid).toBe(false);
    const combined = result.errors.join(' ');
    expect(combined.toLowerCase()).toMatch(/enum|allowed/);
  });
});
