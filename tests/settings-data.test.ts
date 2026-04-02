import { DEFAULT_SETTINGS, CrosswalkerSettings } from '../src/settings/settings-data';

describe('DEFAULT_SETTINGS', () => {
  it('has all required keys', () => {
    const requiredKeys: (keyof CrosswalkerSettings)[] = [
      'defaultOutputPath',
      'defaultKeyNamingStyle',
      'defaultArrayHandling',
      'defaultEmptyHandling',
      'defaultFrontmatterStyle',
      'linkSyntaxPreset',
      'customLinkNamespace',
      'enableConfigSuggestions',
      'configMatchThreshold',
      'enableDebugLog',
      'savedConfigs',
    ];

    for (const key of requiredKeys) {
      expect(DEFAULT_SETTINGS).toHaveProperty(key);
    }
  });

  it('has sensible default output path', () => {
    expect(DEFAULT_SETTINGS.defaultOutputPath).toBe('Ontologies');
  });

  it('starts with empty saved configs', () => {
    expect(DEFAULT_SETTINGS.savedConfigs).toEqual([]);
  });

  it('has debug disabled by default', () => {
    expect(DEFAULT_SETTINGS.enableDebugLog).toBe(false);
    expect(DEFAULT_SETTINGS.verboseLogging).toBe(false);
  });

  it('has config match threshold in valid range', () => {
    expect(DEFAULT_SETTINGS.configMatchThreshold).toBeGreaterThanOrEqual(0);
    expect(DEFAULT_SETTINGS.configMatchThreshold).toBeLessThanOrEqual(100);
  });

  it('has streaming threshold > 0', () => {
    expect(DEFAULT_SETTINGS.streamingThresholdMB).toBeGreaterThan(0);
  });
});
