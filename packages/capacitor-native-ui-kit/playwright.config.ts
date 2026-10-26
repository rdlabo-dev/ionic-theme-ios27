import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests',
  workers: 2,
  reporter: 'line',
  use: { headless: true },
  projects: [{ name: 'chromium', use: { browserName: 'chromium' } }],
});
