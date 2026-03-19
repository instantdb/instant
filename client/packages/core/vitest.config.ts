import { playwright } from '@vitest/browser-playwright';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: 'e2e',
          include: ['**/**.e2e.test.ts'],
          expect: {
            poll: {
              timeout: 10_000,
            },
          },
          browser: {
            enabled: true,
            provider: playwright(),
            screenshotFailures: false,
            headless: true,
            instances: [{ browser: 'chromium' }],
          },
        },
      },
      {
        test: {
          name: 'node',
          include: ['**/**.test.ts'],
          exclude: ['**/**.e2e.test.{ts,js}'],
        },
      },
    ],
  },
});
