/**
 * smoke.spec.ts — Crosswalker plugin baseline E2E test
 *
 * Verifies that the harness works end-to-end: real Obsidian launches against a
 * sandbox copy of `tests/e2e/seed-vault/`, the plugin loads, and the
 * Crosswalker import command is registered.
 *
 * If this test fails, every subsequent E2E test will fail too — start here
 * when debugging the harness.
 *
 * Run: `bun run e2e`
 */

import { browser } from '@wdio/globals';
import { expect } from 'expect';
import { obsidianPage } from 'wdio-obsidian-service';
import path from 'node:path';

/** The tracked, immutable seed. wdio must run against a COPY of this, never it. */
const TRACKED_SEED_VAULT = path.resolve(__dirname, 'seed-vault');

describe('Crosswalker plugin — smoke', function () {
  it('Obsidian launches with the wdio-prepared sandbox copy of the seed vault', async () => {
    // Assert the CONTRACT, not the fixture's basename. The previous assertion
    // was `/^test-vault/`; renaming the configured vault to `tests/e2e/seed-vault`
    // broke it without anything about the harness actually regressing
    // (triage 2026-08-24, rank 3). What must hold is:
    //   1. Obsidian has the vault wdio-obsidian-service prepared open, and
    //   2. that vault is a temporary copy, not the tracked seed itself — the
    //      seed stays immutable no matter what a spec writes.
    const sandboxPath = await obsidianPage.getVaultPath();
    const info = await browser.executeObsidian(({ app }) => ({
      hasApp: !!app,
      vaultName: app.vault.getName(),
    }));

    expect(info.hasApp).toBe(true);
    expect(typeof sandboxPath).toBe('string');
    expect(sandboxPath.length).toBeGreaterThan(0);
    expect(info.vaultName).toBe(path.basename(sandboxPath));
    expect(path.resolve(sandboxPath)).not.toBe(TRACKED_SEED_VAULT);
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
