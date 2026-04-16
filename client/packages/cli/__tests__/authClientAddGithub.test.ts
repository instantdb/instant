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

vi.mock('../src/lib/oauth.ts', () => ({
  getAppsAuth: () =>
    Effect.succeed({
      oauth_service_providers: [{ id: 'prov-1', provider_name: 'github' }],
      oauth_clients: [],
    }),
  addOAuthProvider: () =>
    Effect.succeed({
      provider: { id: 'prov-1', provider_name: 'github' },
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
}));

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
  ['type', 'github'],
  ['name', 'github-web'],
  ['client-id', 'Iv1.abc123'],
  ['client-secret', 'ghs_abc123'],
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

// -- interactive prompts for each missing flag --

describe('interactive prompts for each missing flag', () => {
  test('missing --type → prompts type selector', async () => {
    mockPromptReturn = 'github';
    await run(without(webFlags, 'type'), { yes: false });
    expect((prompts[0] as any).params.promptText).toBe('Select a client type:');
  });

  test('missing --name → prompts for name', async () => {
    mockPromptReturn = 'github-web';
    await run(without(webFlags, 'name'), { yes: false });
    expect((prompts[0] as any).props.prompt).toBe('Client Name:');
  });

  test('missing --client-id → prompts for client id', async () => {
    mockPromptReturn = 'Iv1.abc123';
    await run(without(webFlags, 'client-id'), { yes: false });
    expect((prompts[0] as any).props.prompt).toContain('Client ID');
    expect((prompts[0] as any).props.prompt).toContain(
      'github.com/settings/developers',
    );
  });

  test('missing --client-secret → prompts for client secret', async () => {
    mockPromptReturn = 'ghs_abc123';
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

// -- success cases --

describe('success', () => {
  test('all required flags → creates client and prints callback URL', async () => {
    await run(webFlags, { yes: true });
    expect(addedClients).toHaveLength(1);
    expect(addedClients[0]).toMatchObject({
      clientName: 'github-web',
      clientId: 'Iv1.abc123',
      clientSecret: 'ghs_abc123',
      redirectTo: 'https://api.instantdb.com/runtime/oauth/callback',
      meta: { providerName: 'github' },
    });
    expect(addedClients[0].authorizationEndpoint).toBeUndefined();
    expect(addedClients[0].tokenEndpoint).toBeUndefined();
    expect(addedClients[0].discoveryEndpoint).toBeUndefined();
    const output = logs.join('\n');
    expect(output).toContain(
      'Add this callback URL in your GitHub OAuth App settings:',
    );
    expect(output).toContain(
      'https://api.instantdb.com/runtime/oauth/callback',
    );
    expect(output).toContain('GitHub OAuth client created: github-web');
    expect(output).toContain('ID: client-1');
    expect(output).toContain('GitHub Client ID: Iv1.abc123');
  });

  test('with custom-redirect-uri → uses it and prints forwarding instructions', async () => {
    await run(
      withEntry(webFlags, 'custom-redirect-uri', 'https://myapp.com/cb'),
      { yes: true },
    );
    expect(addedClients[0].redirectTo).toBe('https://myapp.com/cb');
    const output = logs.join('\n');
    expect(output).toContain(
      'Add this callback URL in your GitHub OAuth App settings:',
    );
    expect(output).toContain('https://myapp.com/cb');
    expect(output).toContain(
      'https://api.instantdb.com/runtime/oauth/callback with all query parameters',
    );
    expect(output).toContain('https://myapp.com/cb?test-redirect=true');
  });
});
