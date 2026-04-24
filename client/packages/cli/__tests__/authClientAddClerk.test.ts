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

let addedProviders: any[] = [];
let mockHasExistingProvider = true;

vi.mock('../src/lib/oauth.ts', async () => {
  const { makeOAuthMock } = await import('./oauthMock.ts');
  return makeOAuthMock({
    getAppsAuth: () =>
      Effect.succeed({
        oauth_service_providers: mockHasExistingProvider
          ? [{ id: 'prov-1', provider_name: 'clerk' }]
          : [],
        oauth_clients: [],
      }),
    addOAuthProvider: (params: any) => {
      addedProviders.push(params);
      return Effect.succeed({
        provider: { id: 'prov-new', provider_name: 'clerk' },
      });
    },
    addOAuthClient: (params: any) => {
      addedClients.push(params);
      return Effect.succeed({
        client: {
          id: 'client-1',
          client_name: params.clientName,
          client_id: params.clientId,
          discovery_endpoint: params.discoveryEndpoint,
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
  addedProviders = [];
  logs = [];
  mockPromptReturn = '';
  mockHasExistingProvider = true;
});

// -- flag sets --

const webFlags = new Map([
  ['type', 'clerk'],
  ['name', 'clerk-web'],
  [
    'publishable-key',
    'pk_test_Z3VpZGluZy1wZWdhc3VzLTkzLmNsZXJrLmFjY291bnRzLmRldiQ',
  ],
]);

// -- --yes: build-up errors on each missing required flag --

describe('--yes errors on each missing required flag', () => {
  test('missing --type', async () => {
    await run(without(webFlags, 'type'), { yes: true });
    expect(logs.join('\n')).toContain('Missing required value for --type');
    expect(addedClients).toHaveLength(0);
  });

  test('missing --name', async () => {
    await run(without(webFlags, 'name'), { yes: true });
    expect(logs.join('\n')).toContain('Missing required value for --name');
    expect(addedClients).toHaveLength(0);
  });

  test('missing --publishable-key', async () => {
    await run(without(webFlags, 'publishable-key'), { yes: true });
    expect(logs.join('\n')).toContain(
      'Missing required value for --publishable-key',
    );
    expect(addedClients).toHaveLength(0);
  });
});

// -- interactive prompts for each missing flag --

describe('interactive prompts for each missing flag', () => {
  test('missing --type → prompts type selector', async () => {
    mockPromptReturn = 'clerk';
    await run(without(webFlags, 'type'), { yes: false });
    expect((prompts[0] as any).params.promptText).toBe('Select a client type:');
  });

  test('missing --name → prompts for name', async () => {
    mockPromptReturn = 'clerk-web';
    await run(without(webFlags, 'name'), { yes: false });
    expect((prompts[0] as any).props.prompt).toBe('Client Name:');
  });

  test('missing --publishable-key → prompts for publishable key', async () => {
    mockPromptReturn =
      'pk_test_Z3VpZGluZy1wZWdhc3VzLTkzLmNsZXJrLmFjY291bnRzLmRldiQ';
    await run(without(webFlags, 'publishable-key'), { yes: false });
    expect((prompts[0] as any).props.prompt).toMatch(
      /^Clerk publishable key.*https:\/\/dashboard\.clerk\.com/,
    );
  });
});

// -- provider creation --

describe('provider creation', () => {
  test('creates provider when none exists', async () => {
    mockHasExistingProvider = false;
    await run(webFlags, { yes: true });
    expect(addedProviders).toHaveLength(1);
    expect(addedProviders[0]).toMatchObject({ providerName: 'clerk' });
    expect(addedClients).toHaveLength(1);
    expect(addedClients[0].providerId).toBe('prov-new');
  });

  test('reuses existing provider', async () => {
    mockHasExistingProvider = true;
    await run(webFlags, { yes: true });
    expect(addedProviders).toHaveLength(0);
    expect(addedClients).toHaveLength(1);
    expect(addedClients[0].providerId).toBe('prov-1');
  });
});

// -- success cases --

describe('success', () => {
  test('all required flags → creates client with correct discovery endpoint', async () => {
    await run(webFlags, { yes: true });
    expect(addedClients).toHaveLength(1);
    expect(addedClients[0]).toMatchObject({
      clientName: 'clerk-web',
      discoveryEndpoint:
        'https://guiding-pegasus-93.clerk.accounts.dev/.well-known/openid-configuration',
      meta: {
        clerkPublishableKey:
          'pk_test_Z3VpZGluZy1wZWdhc3VzLTkzLmNsZXJrLmFjY291bnRzLmRldiQ',
      },
    });
    const output = logs.join('\n');
    expect(output).toContain('Clerk OAuth client created: clerk-web');
    expect(output).toContain('ID: client-1');
    expect(output).toContain(
      'Clerk Domain: https://guiding-pegasus-93.clerk.accounts.dev',
    );
  });

  test('logs session token claim instructions', async () => {
    await run(webFlags, { yes: true });
    const output = logs.join('\n');
    expect(output).toContain('Navigate to your Clerk dashboard');
    expect(output).toContain('Sessions page');
    expect(output).toContain('Customize session token');
    expect(output).toContain('"email": "{{user.primary_email_address}}"');
    expect(output).toContain('"email_verified": "{{user.email_verified}}"');
  });
});
