import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe('Instant origins', () => {
  it('uses the configured self-hosted API and dashboard', async () => {
    vi.stubEnv('INSTANT_CLI_API_URI', 'https://api.instant.example');
    vi.stubEnv('INSTANT_CLI_DASH_URI', 'https://dash.instant.example');

    const { instantBackendOrigin, instantDashOrigin } = await import(
      './fetch.js'
    );

    expect(instantBackendOrigin).toBe('https://api.instant.example');
    expect(instantDashOrigin).toBe('https://dash.instant.example');
  });

  it('uses localhost defaults in CLI dev mode', async () => {
    vi.stubEnv('INSTANT_CLI_API_URI', '');
    vi.stubEnv('INSTANT_CLI_DASH_URI', '');
    vi.stubEnv('INSTANT_CLI_DEV', '1');

    const { instantBackendOrigin, instantDashOrigin } = await import(
      './fetch.js'
    );

    expect(instantBackendOrigin).toBe('http://localhost:8888');
    expect(instantDashOrigin).toBe('http://localhost:3000');
  });
});
