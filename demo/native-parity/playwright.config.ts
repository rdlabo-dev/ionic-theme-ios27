import { defineConfig, devices } from '@playwright/test';
import base from '../playwright.config';

export default defineConfig({
  ...base,
  testDir: '../e2e',
  testMatch: ['**/ios26-*.spec.ts', '**/toggle.spec.ts'],
  use: { ...base.use, baseURL: 'http://localhost:4260' },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        launchOptions: process.env['PARITY_CHROMIUM_PATH'] ? { executablePath: process.env['PARITY_CHROMIUM_PATH'] } : {},
      },
    },
    {
      name: 'webkit',
      use: {
        ...devices['Desktop Safari'],
        launchOptions: process.env['PARITY_WEBKIT_PATH'] ? { executablePath: process.env['PARITY_WEBKIT_PATH'] } : {},
      },
    },
  ],
  webServer: {
    command:
      process.env['IONIC_MAJOR'] === '8'
        ? 'npm run start -- --build-target=app:build:development,ionic8 --port 4260'
        : 'npm run start -- --port 4260',
    cwd: '..',
    url: 'http://localhost:4260',
    reuseExistingServer: false,
    timeout: 120000,
  },
});
