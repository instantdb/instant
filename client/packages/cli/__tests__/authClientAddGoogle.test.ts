import { test, expect, describe, vi, beforeEach } from 'vitest';
import { Effect, Layer, Logger } from 'effect';
import { NodeContext } from '@effect/platform-node';
import { GlobalOpts } from '../src/context/globalOpts.ts';
import { CurrentApp } from '../src/context/currentApp.ts';
import { InstantHttpAuthed } from '../src/lib/http.ts';

// -- mocks --

// Prevent src/index.ts side-effect (program.parse) from running.
// add.ts has `import type` from index.ts, but vitest still evaluates it.
vi.mock('../src/index.ts', () => ({}));

let prompts: any[] = [];
let mockPromptReturn: any = '';

vi.mock('../src/ui/lib.ts', async (importOriginal) => {
  const orig: any = await importOriginal();
  return {
    ...orig,
    renderUnwrap: (prompt: any) => {
      prompts.push(prompt);
      return Promise.resolve(mockPromptReturn);
    },
  };
});

let addedClients: any[] = [];

vi.mock('../src/lib/oauth.ts', async () => {
  const { makeOAuthMock } = await import('./oauthMock.ts');
  return makeOAuthMock({
    getAppsAuth: () =>
      Effect.succeed({
        oauth_service_providers: [{ id: 'prov-1', provider_name: 'google' }],
        oauth_clients: [],
      }),
    addOAuthProvider: () =>
      Effect.succeed({
        provider: { id: 'prov-1', provider_name: 'google' },
      }),
    addOAuthClient: (params: any) => {
      addedClients.push(params);
      return Effect.succeed({
        client: {
          id: 'client-1',
          client_name: params.clientName,
          client_id: params.clientId,
        },
      });
    },
  });
});

// Lazy import so mocks are in place
const { authClientAddCmd } = await import('../src/commands/auth/client/add.ts');

// -- helpers --

let logs: string[] = [];

const run = (flags: Map<string, string>, { yes }: { yes: boolean }) =>
  Effect.runPromise(
    authClientAddCmd(Object.fromEntries(flags) as any).pipe(
      Effect.provide(
        Layer.mergeAll(
          Layer.succeed(GlobalOpts, { yes }),
          Layer.succeed(CurrentApp, { appId: 'test-app', source: 'env' }),
          Layer.succeed(InstantHttpAuthed, {} as any),
          // Provides FileSystem (required by the Apple handler).
          NodeContext.layer,
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

const without = (flags: Map<string, string>, key: string) => {
  const copy = new Map(flags);
  copy.delete(key);
  return copy;
};

const withEntry = (flags: Map<string, string>, key: string, value: string) =>
  new Map([...flags, [key, value]]);

beforeEach(() => {
  prompts = [];
  addedClients = [];
  logs = [];
  mockPromptReturn = '';
});

// -- flag sets --

const webFlags = new Map([
  ['type', 'google'],
  ['app-type', 'web'],
  ['name', 'google-web'],
  ['client-id', '123456.apps.googleusercontent.com'],
  ['client-secret', 'GOCSPX-abc123'],
]);

const iosFlags = new Map([
  ['type', 'google'],
  ['app-type', 'ios'],
  ['name', 'google-ios'],
  ['client-id', '123456.apps.googleusercontent.com'],
]);

// -- web: build-up with --yes --

describe('web: --yes errors on each missing required flag', () => {
  test('missing --type', async () => {
    await run(without(webFlags, 'type'), { yes: true });
    expect(logs.join('\n')).toContain('Missing required value for --type');
    expect(addedClients).toHaveLength(0);
  });

  test('missing --app-type', async () => {
    await run(without(webFlags, 'app-type'), { yes: true });
    expect(logs.join('\n')).toContain('Missing required value for --app-type');
    expect(addedClients).toHaveLength(0);
  });

  test('missing --name', async () => {
    await run(without(webFlags, 'name'), { yes: true });
    expect(logs.join('\n')).toContain('Missing required value for --name');
    expect(addedClients).toHaveLength(0);
  });

  test('missing --client-id', async () => {
    await run(without(webFlags, 'client-id'), { yes: true });
    expect(logs.join('\n')).toContain('Missing required value for --client-id');
    expect(addedClients).toHaveLength(0);
  });

  test('missing --client-secret', async () => {
    await run(without(webFlags, 'client-secret'), { yes: true });
    expect(logs.join('\n')).toContain(
      'Missing required value for --client-secret',
    );
    expect(addedClients).toHaveLength(0);
  });
});

// -- web: interactive prompts for each missing flag --

describe('web: interactive prompts for each missing flag', () => {
  test('missing --type → prompts type selector', async () => {
    mockPromptReturn = 'google';
    await run(without(webFlags, 'type'), { yes: false });
    expect((prompts[0] as any).params.promptText).toBe('Select a client type:');
  });

  test('missing --app-type → prompts app type selector', async () => {
    mockPromptReturn = 'web';
    await run(without(webFlags, 'app-type'), { yes: false });
    expect((prompts[0] as any).params.promptText).toBe(
      'Select a Google app type:',
    );
  });

  test('missing --name → prompts for name', async () => {
    mockPromptReturn = 'google-web';
    await run(without(webFlags, 'name'), { yes: false });
    expect((prompts[0] as any).props.prompt).toBe('Client Name:');
  });

  test('missing --client-id → prompts for client id', async () => {
    mockPromptReturn = '123456.apps.googleusercontent.com';
    await run(without(webFlags, 'client-id'), { yes: false });
    expect((prompts[0] as any).props.prompt).toContain('Client ID');
  });

  test('missing --client-secret → prompts for client secret', async () => {
    mockPromptReturn = 'GOCSPX-abc123';
    await run(without(webFlags, 'client-secret'), { yes: false });
    expect((prompts[0] as any).props.prompt).toContain('Client Secret:');
    expect((prompts[0] as any).props.sensitive).toBe(true);
  });

  test('custom-redirect-uri → prompts when omitted', async () => {
    mockPromptReturn = '';
    await run(webFlags, { yes: false });
    expect(prompts).toHaveLength(1);
    expect((prompts[0] as any).props.placeholder).toBe(
      'https://yoursite.com/oauth/callback',
    );
  });

  test('custom-redirect-uri → skipped with --yes', async () => {
    await run(webFlags, { yes: true });
    expect(prompts).toHaveLength(0);
    expect(addedClients).toHaveLength(1);
  });
});

// -- web: success cases --

describe('web: success', () => {
  test('all required flags → creates client and prints redirect URI', async () => {
    await run(webFlags, { yes: true });
    expect(addedClients).toHaveLength(1);
    expect(addedClients[0]).toMatchObject({
      clientName: 'google-web',
      clientId: '123456.apps.googleusercontent.com',
      clientSecret: 'GOCSPX-abc123',
    });
    const output = logs.join('\n');
    expect(output).toContain('Add this redirect URI in Google Console:');
    expect(output).toContain(
      'https://api.instantdb.com/runtime/oauth/callback',
    );
    expect(output).toContain('Google OAuth client created: google-web');
    expect(output).toContain('App type: web');
    expect(output).toContain('ID: client-1');
    expect(output).toContain(
      'Google Client ID: 123456.apps.googleusercontent.com',
    );
  });

  test('with custom-redirect-uri → uses it and prints forwarding instructions', async () => {
    await run(
      withEntry(webFlags, 'custom-redirect-uri', 'https://myapp.com/cb'),
      { yes: true },
    );
    expect(addedClients[0].redirectTo).toBe('https://myapp.com/cb');
    const output = logs.join('\n');
    expect(output).toContain('Add this redirect URI in Google Console:');
    expect(output).toContain('https://myapp.com/cb');
    expect(output).toContain(
      'https://api.instantdb.com/runtime/oauth/callback with all query parameters',
    );
  });
});

// -- web: dev credentials --

const webDevFlags = new Map([
  ['type', 'google'],
  ['app-type', 'web'],
  ['name', 'google-web'],
]);

describe('web: dev credentials', () => {
  test('--dev-credentials → creates dev credentials client', async () => {
    await run(withEntry(webDevFlags, 'dev-credentials', 'true'), { yes: true });
    expect(addedClients).toHaveLength(1);
    expect(addedClients[0]).toMatchObject({
      clientName: 'google-web',
      useSharedCredentials: true,
      discoveryEndpoint:
        'https://accounts.google.com/.well-known/openid-configuration',
    });
    expect(addedClients[0].clientId).toBeUndefined();
    expect(addedClients[0].clientSecret).toBeUndefined();
    expect(addedClients[0].redirectTo).toBeUndefined();
    const output = logs.join('\n');
    expect(output).toContain('Credentials: Instant dev credentials');
    expect(output).toContain('No Google Console setup required');
    expect(output).toContain(
      'For production, use your own Google OAuth credentials.',
    );
    expect(output).not.toContain('instant-cli auth client update');
    expect(output).not.toContain('Add this redirect URI in Google Console');
  });

  test('--yes with no Google credentials → creates dev credentials client', async () => {
    await run(webDevFlags, { yes: true });
    expect(addedClients).toHaveLength(1);
    expect(addedClients[0]).toMatchObject({
      clientName: 'google-web',
      useSharedCredentials: true,
      discoveryEndpoint:
        'https://accounts.google.com/.well-known/openid-configuration',
    });
    expect(addedClients[0].clientId).toBeUndefined();
    expect(addedClients[0].clientSecret).toBeUndefined();
    expect(addedClients[0].redirectTo).toBeUndefined();
    const output = logs.join('\n');
    expect(output).toContain('Credentials: Instant dev credentials');
    expect(output).toContain('No Google Console setup required');
    expect(output).toContain(
      'For production, use your own Google OAuth credentials.',
    );
    expect(output).not.toContain('instant-cli auth client update');
    expect(output).not.toContain('Add this redirect URI in Google Console');
  });

  test('--dev-credentials with custom credential flags → error', async () => {
    await run(
      new Map([...webDevFlags, ['dev-credentials', 'true'], ['client-id', '']]),
      { yes: true },
    );
    expect(logs.join('\n')).toContain(
      '--dev-credentials cannot be combined with --client-id',
    );
    expect(addedClients).toHaveLength(0);
  });

  test('--dev-credentials with native app type → error', async () => {
    await run(
      new Map([
        ['type', 'google'],
        ['app-type', 'ios'],
        ['name', 'google-ios'],
        ['dev-credentials', 'true'],
      ]),
      { yes: true },
    );
    expect(logs.join('\n')).toContain(
      '--dev-credentials is only supported for --app-type web',
    );
    expect(addedClients).toHaveLength(0);
  });

  test('interactive with no Google credentials → prompts for credential mode', async () => {
    mockPromptReturn = 'dev';
    await run(webDevFlags, { yes: false });
    expect(prompts).toHaveLength(1);
    expect((prompts[0] as any).params.promptText).toBe(
      'Select Google credential mode:',
    );
    expect(addedClients).toHaveLength(1);
    expect(addedClients[0].useSharedCredentials).toBe(true);
  });
});

// -- ios: forbidden flags and success --

describe('ios', () => {
  test('--client-secret → error (not supported)', async () => {
    await run(withEntry(iosFlags, 'client-secret', 'secret'), { yes: true });
    expect(logs.join('\n')).toContain(
      '--client-secret is not compatible with other options',
    );
    expect(addedClients).toHaveLength(0);
  });

  test('--custom-redirect-uri → error (not supported)', async () => {
    await run(
      withEntry(iosFlags, 'custom-redirect-uri', 'https://example.com'),
      { yes: true },
    );
    expect(logs.join('\n')).toContain('not using web app type');
    expect(addedClients).toHaveLength(0);
  });

  test('valid flags → creates client without secret or redirect instructions', async () => {
    await run(iosFlags, { yes: true });
    expect(addedClients).toHaveLength(1);
    expect(addedClients[0]).toMatchObject({
      clientName: 'google-ios',
      clientId: '123456.apps.googleusercontent.com',
    });
    expect(addedClients[0].clientSecret).toBeUndefined();
    const output = logs.join('\n');
    expect(output).not.toContain('Add this redirect URI');
    expect(output).toContain('Google OAuth client created: google-ios');
    expect(output).toContain('App type: ios');
    expect(output).toContain('ID: client-1');
    expect(output).toContain(
      'Google Client ID: 123456.apps.googleusercontent.com',
    );
  });
});
