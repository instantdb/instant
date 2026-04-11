import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  timeout: 30_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  retries: 0,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:3456',
    trace: 'on-first-retry',
    ...(process.env.CHROME_PATH
      ? { launchOptions: { executablePath: process.env.CHROME_PATH } }
      : {}),
  },
  webServer: {
    command: 'npx vite --port 3456',
    port: 3456,
    reuseExistingServer: true,
    timeout: 30_000,
  },
});
