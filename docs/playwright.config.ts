import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',

  use: {
    baseURL: process.env.TEST_URL || 'http://localhost:14325',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  webServer: process.env.TEST_URL ? undefined : {
    // Dedicated test port: the dev server owns 14321, and reuseExistingServer
    // would otherwise latch onto it and time out against dev-mode rendering.
    command: 'bun x astro preview --port 14325',
    url: 'http://localhost:14325/crosswalker/',
    reuseExistingServer: !process.env.CI,
    timeout: 120000,
  },
});
