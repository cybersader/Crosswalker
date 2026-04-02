import type { Options } from '@wdio/types';
import path from 'path';

export const config: Options.Testrunner = {
  specs: ['./test/e2e/**/*.spec.ts'],
  maxInstances: 1,

  capabilities: [{
    browserName: 'obsidian',
    'wdio:obsidianOptions': {
      vault: path.resolve('./test-vault'),
      plugins: ['.'],
    },
  }],

  services: ['obsidian'],
  reporters: ['obsidian'],
  framework: 'mocha',

  mochaOpts: {
    ui: 'bdd',
    timeout: 60000,
  },

  onPrepare: async function () {
    const { execSync } = await import('child_process');
    console.log('Building plugin...');
    execSync('bun run build', { stdio: 'inherit' });
  },

  afterTest: async function (_test: any, _context: any, { error }: any) {
    if (error) {
      await browser.saveScreenshot(`./test-results/screenshot-${Date.now()}.png`);
    }
  },
};
