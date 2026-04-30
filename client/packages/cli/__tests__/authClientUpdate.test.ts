import { test, expect, describe, vi, beforeEach } from 'vitest';
import { Effect, Layer, Logger } from 'effect';
import { NodeContext } from '@effect/platform-node';
import { GlobalOpts } from '../src/context/globalOpts.ts';
import { CurrentApp } from '../src/context/currentApp.ts';
import { InstantHttpAuthed } from '../src/lib/http.ts';
import { BadArgsError } from '../src/errors.ts';

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

let updateCalls: any[] = [];
let mockClient: any;
let mockProvider: any;

vi.mock('../src/lib/oauth.ts', async (importOriginal) => {
  const orig: any = await importOriginal();
  return {
    ...orig,
    getAppsAuth: () =>
      Effect.succeed({
        oauth_service_providers: [mockProvider],
        oauth_clients: [mockClient],
      }),
    findClientByIdOrName: ({ id, name }: { id?: string; name?: string }) =>
      Effect.gen(function* () {
        if (id && name) {
          return yield* BadArgsError.make({
            message: 'Cannot specify both --id and --name',
          });
        }
        if (!id && !name) {
          return yield* BadArgsError.make({
            message: 'Must specify --id or --name',
          });
        }
        if (
          (id && id !== mockClient.id) ||
          (name && name !== mockClient.client_name)
        ) {
          return yield* BadArgsError.make({
            message: `OAuth client not found`,
          });
        }
        return {
          client: mockClient,
          auth: {
            oauth_service_providers: [mockProvider],
            oauth_clients: [mockClient],
          },
        };
      }),
    updateOAuthClient: (params: any) => {
      updateCalls.push(params);
      return Effect.succeed({
        client: { ...mockClient, ...params.body },
      });
    },
  };
});

const { authClientUpdateCmd } = await import(
  '../src/commands/auth/client/update.ts'
);

let logs: string[] = [];

const run = (flags: Map<string, string>, { yes }: { yes: boolean }) =>
  Effect.runPromise(
    authClientUpdateCmd(Object.fromEntries(flags) as any).pipe(
      Effect.provide(
        Layer.mergeAll(
          Layer.succeed(GlobalOpts, { yes }),
          Layer.succeed(CurrentApp, { appId: 'test-app', source: 'env' }),
          Layer.succeed(InstantHttpAuthed, {} as any),
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

beforeEach(() => {
  prompts = [];
  updateCalls = [];
  logs = [];
  mockPromptReturn = '';
});

// ---------- Google ----------

describe('google update', () => {
  beforeEach(() => {
    mockProvider = { id: 'prov-1', provider_name: 'google' };
    mockClient = {
      id: 'client-1',
      client_name: 'google-web',
      provider_id: 'prov-1',
      use_shared_credentials: true,
    };
  });

  test('--yes with no flags → errors', async () => {
    await run(new Map([['name', 'google-web']]), { yes: true });
    expect(logs.join('\n')).toContain('Nothing to update');
    expect(updateCalls).toHaveLength(0);
  });

  test('upgrade shared → custom (--client-id + --client-secret)', async () => {
    await run(
      new Map([
        ['name', 'google-web'],
        ['client-id', 'new-id'],
        ['client-secret', 'new-secret'],
      ]),
      { yes: true },
    );
    expect(updateCalls).toHaveLength(1);
    expect(updateCalls[0].body).toMatchObject({
      client_id: 'new-id',
      client_secret: 'new-secret',
      use_shared_credentials: false,
    });
    const out = logs.join('\n');
    expect(out).toContain('Mode: custom credentials');
    expect(out).toContain('Add this redirect URI in Google Console');
  });

  test('rotate custom credentials', async () => {
    mockClient.use_shared_credentials = false;
    mockClient.client_id = 'old-id';
    await run(
      new Map([
        ['name', 'google-web'],
        ['client-id', 'rotated-id'],
        ['client-secret', 'rotated-secret'],
      ]),
      { yes: true },
    );
    expect(updateCalls).toHaveLength(1);
    expect(updateCalls[0].body).toMatchObject({
      client_id: 'rotated-id',
      client_secret: 'rotated-secret',
    });
    expect(updateCalls[0].body.use_shared_credentials).toBeUndefined();
  });

  test('downgrade custom → shared (--use-shared-credentials)', async () => {
    mockClient.use_shared_credentials = false;
    mockClient.client_id = 'old-id';
    await run(
      new Map([
        ['name', 'google-web'],
        ['use-shared-credentials', 'true'],
      ]),
      { yes: true },
    );
    expect(updateCalls).toHaveLength(1);
    expect(updateCalls[0].body).toMatchObject({
      use_shared_credentials: true,
    });
    expect(logs.join('\n')).toContain('shared dev credentials');
  });

  test('--use-shared-credentials + --client-id → mutually-exclusive error', async () => {
    await run(
      new Map([
        ['name', 'google-web'],
        ['use-shared-credentials', 'true'],
        ['client-id', 'foo'],
      ]),
      { yes: true },
    );
    expect(logs.join('\n')).toContain('mutually exclusive');
    expect(updateCalls).toHaveLength(0);
  });

  test('update redirect only', async () => {
    mockClient.use_shared_credentials = false;
    await run(
      new Map([
        ['name', 'google-web'],
        ['custom-redirect-uri', 'https://myapp.com/cb'],
      ]),
      { yes: true },
    );
    expect(updateCalls).toHaveLength(1);
    expect(updateCalls[0].body).toMatchObject({
      redirect_to: 'https://myapp.com/cb',
    });
  });
});

// ---------- GitHub ----------

describe('github update', () => {
  beforeEach(() => {
    mockProvider = { id: 'prov-2', provider_name: 'github' };
    mockClient = {
      id: 'gh-client',
      client_name: 'github',
      provider_id: 'prov-2',
    };
  });

  test('rotate credentials', async () => {
    await run(
      new Map([
        ['name', 'github'],
        ['client-id', 'gh-id'],
        ['client-secret', 'gh-secret'],
      ]),
      { yes: true },
    );
    expect(updateCalls).toHaveLength(1);
    expect(updateCalls[0].body).toMatchObject({
      client_id: 'gh-id',
      client_secret: 'gh-secret',
    });
  });

  test('--yes with no flags → errors', async () => {
    await run(new Map([['name', 'github']]), { yes: true });
    expect(logs.join('\n')).toContain('Nothing to update');
    expect(updateCalls).toHaveLength(0);
  });
});

// ---------- Apple ----------

describe('apple update', () => {
  beforeEach(() => {
    mockProvider = { id: 'prov-3', provider_name: 'apple' };
    mockClient = {
      id: 'apple-client',
      client_name: 'apple',
      provider_id: 'prov-3',
    };
  });

  test('rotate services-id only', async () => {
    await run(
      new Map([
        ['name', 'apple'],
        ['services-id', 'new.services.id'],
      ]),
      { yes: true },
    );
    expect(updateCalls).toHaveLength(1);
    expect(updateCalls[0].body).toMatchObject({
      client_id: 'new.services.id',
    });
  });

  test('update team-id and key-id (meta)', async () => {
    await run(
      new Map([
        ['name', 'apple'],
        ['team-id', 'TEAM123'],
        ['key-id', 'KEY456'],
      ]),
      { yes: true },
    );
    expect(updateCalls).toHaveLength(1);
    expect(updateCalls[0].body.meta).toMatchObject({
      teamId: 'TEAM123',
      keyId: 'KEY456',
    });
  });
});

// ---------- Clerk ----------

describe('clerk update', () => {
  beforeEach(() => {
    mockProvider = { id: 'prov-4', provider_name: 'clerk' };
    mockClient = {
      id: 'clerk-client',
      client_name: 'clerk',
      provider_id: 'prov-4',
    };
  });

  test('rotate publishable key derives discovery endpoint', async () => {
    // pk_live_<base64-encoded "clerk.example.com$">
    const domain = 'clerk.example.com';
    const encoded = Buffer.from(domain + '$').toString('base64');
    const key = `pk_live_${encoded}`;
    await run(
      new Map([
        ['name', 'clerk'],
        ['publishable-key', key],
      ]),
      { yes: true },
    );
    expect(updateCalls).toHaveLength(1);
    expect(updateCalls[0].body).toMatchObject({
      meta: { clerkPublishableKey: key },
      discovery_endpoint: `https://${domain}/.well-known/openid-configuration`,
    });
  });
});

// ---------- Firebase ----------

describe('firebase update', () => {
  beforeEach(() => {
    mockProvider = { id: 'prov-5', provider_name: 'firebase' };
    mockClient = {
      id: 'fb-client',
      client_name: 'firebase',
      provider_id: 'prov-5',
    };
  });

  test('rotate project-id derives discovery endpoint', async () => {
    await run(
      new Map([
        ['name', 'firebase'],
        ['project-id', 'my-new-project-123'],
      ]),
      { yes: true },
    );
    expect(updateCalls).toHaveLength(1);
    expect(updateCalls[0].body.discovery_endpoint).toBe(
      'https://securetoken.google.com/my-new-project-123/.well-known/openid-configuration',
    );
  });

  test('rotate project-id with invalid id → error', async () => {
    await run(
      new Map([
        ['name', 'firebase'],
        ['project-id', 'BAD'],
      ]),
      { yes: true },
    );
    expect(logs.join('\n')).toContain('Invalid Firebase project ID');
    expect(updateCalls).toHaveLength(0);
  });
});

// ---------- Identification ----------

describe('client identification', () => {
  beforeEach(() => {
    mockProvider = { id: 'prov-1', provider_name: 'google' };
    mockClient = {
      id: 'client-1',
      client_name: 'google-web',
      provider_id: 'prov-1',
      use_shared_credentials: false,
    };
  });

  test('both --id and --name → error', async () => {
    await run(
      new Map([
        ['id', 'client-1'],
        ['name', 'google-web'],
      ]),
      { yes: true },
    );
    expect(logs.join('\n')).toContain('Cannot specify both --id and --name');
    expect(updateCalls).toHaveLength(0);
  });

  test('--yes without --id or --name → error', async () => {
    await run(new Map(), { yes: true });
    expect(logs.join('\n')).toContain('Must specify --id or --name');
    expect(updateCalls).toHaveLength(0);
  });

  test('unknown name → error', async () => {
    await run(
      new Map([
        ['name', 'unknown'],
        ['client-id', 'x'],
        ['client-secret', 'y'],
      ]),
      { yes: true },
    );
    expect(logs.join('\n')).toContain('not found');
    expect(updateCalls).toHaveLength(0);
  });
});
