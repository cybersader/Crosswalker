describe('Crosswalker Plugin', () => {
  it('should load the plugin', async () => {
    // Verify the plugin is listed in community plugins
    const plugins = await browser.executeObsidian(async (app) => {
      return Object.keys((app as any).plugins.plugins);
    });

    expect(plugins).toContain('crosswalker');
  });

  it('should register the import command', async () => {
    const commands = await browser.executeObsidian(async (app) => {
      return Object.keys((app as any).commands.commands).filter(
        (cmd: string) => cmd.startsWith('crosswalker:')
      );
    });

    expect(commands.length).toBeGreaterThan(0);
  });
});
