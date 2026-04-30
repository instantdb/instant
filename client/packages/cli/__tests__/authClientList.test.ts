import { test, expect, describe, vi, beforeEach } from 'vitest';
import { Effect, Layer, Logger } from 'effect';
import { CurrentApp } from '../src/context/currentApp.ts';
import { InstantHttpAuthed } from '../src/lib/http.ts';

vi.mock('../src/index.ts', () => ({}));

const authResponse = {
  oauth_service_providers: [
    { id: 'prov-google', provider_name: 'google' },
    { id: 'prov-github', provider_name: 'github' },
  ],
  oauth_clients: [
    {
      id: 'google-shared',
      provider_id: 'prov-google',
      client_name: 'google-shared',
      client_id: null,
      redirect_to: null,
      meta: { appType: 'web' },
      use_shared_credentials: true,
    },
    {
      id: 'github',
      provider_id: 'prov-github',
      client_name: 'github',
      client_id: 'gh-id',
      redirect_to: 'https://api.instantdb.com/runtime/oauth/callback',
      meta: {},
      use_shared_credentials: false,
    },
  ],
};

vi.mock('../src/lib/oauth.ts', () => ({
  getAppsAuth: () => Effect.succeed(authResponse),
}));

const { authClientListCmd } = await import(
  '../src/commands/auth/client/list.ts'
);

let logs: string[] = [];

const run = (opts: { json?: boolean }) =>
  Effect.runPromise(
    authClientListCmd(opts as any).pipe(
      Effect.provide(
        Layer.mergeAll(
          Layer.succeed(CurrentApp, { appId: 'test-app', source: 'env' }),
          Layer.succeed(InstantHttpAuthed, {} as any),
          Logger.replace(
            Logger.defaultLogger,
            Logger.make(({ message }) => {
              logs.push(String(message));
            }),
          ),
        ),
      ),
    ),
  );

beforeEach(() => {
  logs = [];
});

describe('auth client list', () => {
  test('shows shared dev credentials clearly', async () => {
    await run({});
    const output = logs.join('\n');
    expect(output).toContain('google-shared');
    expect(output).toContain('App type: web');
    expect(output).toContain('Credentials: Instant dev credentials');
    expect(output).toContain('Client id: managed by Instant');
    expect(output).toContain(
      'Redirect URL: localhost and Expo allowed automatically',
    );
    expect(output).toContain('Credentials: custom');
    expect(output).toContain('Client id: gh-id');
  });

  test('--json prints raw clients', async () => {
    await run({ json: true });
    const parsed = JSON.parse(logs.join('\n'));
    expect(parsed[0]).toMatchObject({
      client_name: 'google-shared',
      use_shared_credentials: true,
    });
  });
});
