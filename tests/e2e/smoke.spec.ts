/**
 * smoke.spec.ts — Crosswalker plugin baseline E2E test
 *
 * Verifies that the harness works end-to-end: real Obsidian launches, plugin
 * loads in the test-vault, and the Crosswalker import command is registered.
 *
 * If this test fails, every subsequent E2E test will fail too — start here
 * when debugging the harness.
 *
 * Run: `bun run e2e`
 */

import { browser } from '@wdio/globals';
import { expect } from 'expect';

describe('Crosswalker plugin — smoke', function () {
  it('Obsidian launches with test-vault loaded', async () => {
    const info = await browser.executeObsidian(({ app }) => ({
      hasApp: !!app,
      vaultName: app.vault.getName(),
    }));

    expect(info.hasApp).toBe(true);
    // wdio-obsidian-service sandboxes the vault by copying to a randomized
    // sibling directory (`test-vault-XXXXXX`) so tests don't pollute the
    // canonical fixture. Match by prefix.
    expect(info.vaultName).toMatch(/^test-vault/);
  });

  it('Crosswalker plugin is loaded', async () => {
    const info = await browser.executeObsidian(({ app }) => {
      // @ts-expect-error — `plugins.plugins` is internal API; documented in obsidian-typings
      const plugin = app.plugins.plugins['crosswalker'];
      return {
        loaded: !!plugin,
        manifestId: plugin?.manifest?.id,
        manifestName: plugin?.manifest?.name,
      };
    });

    expect(info.loaded).toBe(true);
    expect(info.manifestId).toBe('crosswalker');
    expect(info.manifestName).toBe('Crosswalker');
  });

  it('Crosswalker import command is registered', async () => {
    const info = await browser.executeObsidian(({ app }) => {
      // @ts-expect-error — `commands.findCommand` is internal API
      const cmd = app.commands.findCommand('crosswalker:import-structured-data');
      return {
        found: !!cmd,
        name: cmd?.name,
      };
    });

    expect(info.found).toBe(true);
    expect(info.name).toMatch(/import structured data/i);
  });

  it('Crosswalker browse-saved-configs command is registered', async () => {
    const info = await browser.executeObsidian(({ app }) => {
      // @ts-expect-error — internal API
      const cmd = app.commands.findCommand('crosswalker:browse-saved-configs');
      return { found: !!cmd };
    });

    expect(info.found).toBe(true);
  });
});
