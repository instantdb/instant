import { playwright } from '@vitest/browser-playwright';
import { defineConfig } from 'vitest/config';

const devSlot = Number(process.env.DEV_SLOT ?? 0);
const localPort = process.env.CI ? 0 : 8888 + devSlot * 1000;

export default defineConfig({
  test: {
    projects: [
      {
        extends: true,
        define: {
          __DEV_LOCAL_PORT__: localPort,
        },
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
