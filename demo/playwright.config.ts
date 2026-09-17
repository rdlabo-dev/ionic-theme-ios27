import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright configuration for screenshot testing
 * See https://playwright.dev/docs/test-configuration
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  workers: process.env['CI'] ? 4 : undefined,
  forbidOnly: !!process.env['CI'],
  retries: process.env['CI'] ? 2 : 0,
  reporter: 'html',
  use: {
    baseURL: 'http://localhost:4200',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  snapshotPathTemplate: '{testDir}/{testFileDir}/{testFileName}-snapshots/{arg}{ext}',
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        // Explicitly enable headless mode for better performance in CI
        headless: true,
      },
    },
  ],
  webServer: {
    command: process.env['IONIC_MAJOR'] === '8' ? 'npm run start -- --configuration=ionic8-e2e' : 'npm run start -- --configuration=e2e',
    url: 'http://localhost:4200',
    reuseExistingServer: !process.env['CI'] && process.env['IONIC_MAJOR'] === undefined,
    timeout: 120000,
  },
});
