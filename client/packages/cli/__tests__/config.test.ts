import { Effect } from 'effect';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  readInstantConfigFile: vi.fn(),
}));

vi.mock('../src/util/instantConfig.ts', () => ({
  readInstantConfigFile: mocks.readInstantConfigFile,
}));

import { getDashUrl } from '../src/lib/config.ts';

beforeEach(() => {
  vi.stubEnv('INSTANT_CLI_API_URI', undefined);
  vi.stubEnv('INSTANT_CLI_DASH_URI', undefined);
  vi.stubEnv('INSTANT_CLI_DEV', undefined);
  mocks.readInstantConfigFile.mockResolvedValue({});
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe('dashboard URL configuration', () => {
  it('reads dashURI from instant.config.ts', async () => {
    mocks.readInstantConfigFile.mockResolvedValue({
      dashURI: 'https://dash.instant.example',
    });

    await expect(Effect.runPromise(getDashUrl)).resolves.toBe(
      'https://dash.instant.example',
    );
  });

  it('prefers INSTANT_CLI_DASH_URI over instant.config.ts', async () => {
    vi.stubEnv('INSTANT_CLI_DASH_URI', 'https://dash.env.example');
    mocks.readInstantConfigFile.mockResolvedValue({
      dashURI: 'https://dash.config.example',
    });

    await expect(Effect.runPromise(getDashUrl)).resolves.toBe(
      'https://dash.env.example',
    );
  });
});
