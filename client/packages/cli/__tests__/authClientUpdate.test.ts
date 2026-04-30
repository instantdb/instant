import { test, expect, describe, vi, beforeEach } from 'vitest';
import { Effect, Layer, Logger } from 'effect';
import { NodeContext } from '@effect/platform-node';
import { GlobalOpts } from '../src/context/globalOpts.ts';
import { CurrentApp } from '../src/context/currentApp.ts';
import { InstantHttpAuthed } from '../src/lib/http.ts';
import { BadArgsError } from '../src/errors.ts';

// Prevent src/index.ts side-effect (program.parse) from running.
vi.mock('../src/index.ts', () => ({}));

let prompts: any[] = [];
let mockPromptReturn: any = '';

vi.mock('../src/ui/lib.ts', async (importOriginal) => {
  const orig: any = await importOriginal();
  return {
    ...orig,
    renderUnwrap: (prompt: any) => {
      prompts.push(prompt);
      const value = Array.isArray(mockPromptReturn)
        ? mockPromptReturn.shift()
        : mockPromptReturn;
      return Promise.resolve(value);
    },
  };
});

let updatedClients: any[] = [];
let mockClients: any[] = [];
const providers = [
  { id: 'prov-google', provider_name: 'google' },
  { id: 'prov-github', provider_name: 'github' },
  { id: 'prov-linkedin', provider_name: 'linkedin' },
  { id: 'prov-apple', provider_name: 'apple' },
  { id: 'prov-clerk', provider_name: 'clerk' },
  { id: 'prov-firebase', provider_name: 'firebase' },
];

vi.mock('../src/lib/oauth.ts', () => ({
  getAppsAuth: () =>
    Effect.succeed({
      oauth_service_providers: providers,
      oauth_clients: mockClients,
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
      const client = id
        ? mockClients.find((entry) => entry.id === id)
        : mockClients.find((entry) => entry.client_name === name);
      if (!client) {
        return yield* BadArgsError.make({
          message: `OAuth client not found: ${id ?? name}`,
        });
      }
      return {
        client,
        auth: {
          oauth_service_providers: providers,
          oauth_clients: mockClients,
        },
      };
    }),
  updateOAuthClient: (params: any) => {
    updatedClients.push(params);
    const client = mockClients.find((c) => c.id === params.oauthClientId);
    return Effect.succeed({
      client: {
        id: params.oauthClientId,
        client_name: client?.client_name ?? 'unknown',
      },
    });
  },
}));

const { authClientUpdateCmd } = await import(
  '../src/commands/auth/client/update.ts'
);

let logs: string[] = [];

const run = (flags: Record<string, any>, { yes }: { yes: boolean }) =>
  Effect.runPromise(
    authClientUpdateCmd(flags as any).pipe(
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
  updatedClients = [];
  logs = [];
  mockPromptReturn = '';
  mockClients = [
    {
      id: 'google-shared',
      provider_id: 'prov-google',
      client_name: 'google-shared',
      meta: { appType: 'web' },
      use_shared_credentials: true,
    },
    {
      id: 'google-web',
      provider_id: 'prov-google',
      client_name: 'google-web',
      client_id: 'old-google-id',
      redirect_to: 'https://api.instantdb.com/runtime/oauth/callback',
      meta: { appType: 'web' },
      use_shared_credentials: false,
    },
    {
      id: 'google-ios',
      provider_id: 'prov-google',
      client_name: 'google-ios',
      meta: { appType: 'ios' },
    },
    {
      id: 'github',
      provider_id: 'prov-github',
      client_name: 'github',
      client_id: 'old-gh-id',
    },
    {
      id: 'linkedin',
      provider_id: 'prov-linkedin',
      client_name: 'linkedin',
      client_id: 'old-linkedin-id',
    },
    {
      id: 'apple',
      provider_id: 'prov-apple',
      client_name: 'apple',
      client_id: 'old.apple.service',
      meta: {
        teamId: 'OLDTEAM',
        keyId: 'OLDKEY',
      },
    },
    {
      id: 'clerk',
      provider_id: 'prov-clerk',
      client_name: 'clerk',
    },
    {
      id: 'firebase',
      provider_id: 'prov-firebase',
      client_name: 'firebase',
    },
  ];
});

describe('google', () => {
  test('upgrades shared dev credentials to custom credentials', async () => {
    await run(
      {
        name: 'google-shared',
        'client-id': 'new-google-id',
        'client-secret': 'new-google-secret',
      },
      { yes: true },
    );

    expect(updatedClients).toHaveLength(1);
    expect(updatedClients[0]).toMatchObject({
      oauthClientId: 'google-shared',
      clientId: 'new-google-id',
      clientSecret: 'new-google-secret',
      redirectTo: 'https://api.instantdb.com/runtime/oauth/callback',
      useSharedCredentials: false,
    });
    expect(logs.join('\n')).toContain(
      'This client no longer uses Instant dev credentials.',
    );
  });

  test('switches custom Google web client back to dev credentials', async () => {
    await run(
      {
        name: 'google-web',
        'dev-credentials': true,
      },
      { yes: true },
    );

    expect(updatedClients).toHaveLength(1);
    expect(updatedClients[0]).toMatchObject({
      oauthClientId: 'google-web',
      clientId: null,
      clientSecret: null,
      useSharedCredentials: true,
      redirectTo: null,
    });
    const output = logs.join('\n');
    expect(output).toContain('Credentials: Instant dev credentials');
    expect(output).toContain('Ready for production? Run:');
    expect(output).toContain(
      'instant-cli auth client update --name google-web',
    );
  });

  test('rejects dev credentials with custom credential flags', async () => {
    await run(
      {
        name: 'google-web',
        'dev-credentials': true,
        'client-id': 'new-google-id',
      },
      { yes: true },
    );

    expect(logs.join('\n')).toContain(
      '--dev-credentials cannot be combined with --client-id',
    );
    expect(updatedClients).toHaveLength(0);
  });

  test('updates redirect URI only', async () => {
    await run(
      {
        name: 'google-web',
        'custom-redirect-uri': 'https://example.com/oauth/callback',
      },
      { yes: true },
    );

    expect(updatedClients).toHaveLength(1);
    expect(updatedClients[0]).toMatchObject({
      oauthClientId: 'google-web',
      redirectTo: 'https://example.com/oauth/callback',
    });
    expect(updatedClients[0].clientId).toBeUndefined();
    expect(updatedClients[0].clientSecret).toBeUndefined();
    expect(logs.join('\n')).toContain(
      'Add this redirect URI in Google Console',
    );
    expect(logs.join('\n')).toContain('Your custom redirect must forward to');
    expect(logs.join('\n')).toContain(
      'https://example.com/oauth/callback?test-redirect=true',
    );
  });

  test('interactive Google web update can select dev credentials', async () => {
    mockPromptReturn = 'dev';
    await run({ name: 'google-web' }, { yes: false });

    expect(prompts).toHaveLength(1);
    expect((prompts[0] as any).params.promptText).toBe(
      'What do you want to update?',
    );
    expect(updatedClients[0]).toMatchObject({
      oauthClientId: 'google-web',
      useSharedCredentials: true,
      redirectTo: null,
    });
  });

  test('rejects dev credentials for native Google clients', async () => {
    await run(
      {
        name: 'google-ios',
        'dev-credentials': true,
      },
      { yes: true },
    );

    expect(logs.join('\n')).toContain(
      '--dev-credentials is only supported for Google web clients',
    );
    expect(updatedClients).toHaveLength(0);
  });

  test('interactive native Google update only offers credential rotation', async () => {
    mockPromptReturn = ['custom', 'native-google-id'];

    await run({ name: 'google-ios' }, { yes: false });

    expect(prompts).toHaveLength(2);
    expect((prompts[0] as any).params.options.map((o: any) => o.value)).toEqual(
      ['custom'],
    );
    expect(updatedClients[0]).toMatchObject({
      oauthClientId: 'google-ios',
      clientId: 'native-google-id',
    });
    expect(updatedClients[0].clientSecret).toBeUndefined();
  });
});

describe('provider credential updates', () => {
  test('updates GitHub client secret without requiring a new client ID', async () => {
    await run(
      {
        name: 'github',
        'client-secret': 'new-gh-secret',
      },
      { yes: true },
    );

    expect(updatedClients).toHaveLength(1);
    expect(updatedClients[0]).toMatchObject({
      oauthClientId: 'github',
      clientSecret: 'new-gh-secret',
    });
    expect(updatedClients[0].clientId).toBeUndefined();
  });

  test('interactive GitHub update can select redirect URI', async () => {
    mockPromptReturn = ['redirect', 'https://example.com/oauth/callback'];

    await run({ name: 'github' }, { yes: false });

    expect(prompts).toHaveLength(2);
    expect((prompts[0] as any).params.promptText).toBe(
      'What do you want to update?',
    );
    expect(updatedClients).toHaveLength(1);
    expect(updatedClients[0]).toMatchObject({
      oauthClientId: 'github',
      redirectTo: 'https://example.com/oauth/callback',
    });
    expect(logs.join('\n')).toContain(
      'Add this callback URL in your GitHub OAuth App settings',
    );
    expect(logs.join('\n')).toContain(
      'https://example.com/oauth/callback?test-redirect=true',
    );
  });

  test('LinkedIn redirect update prints app settings guidance', async () => {
    await run(
      {
        name: 'linkedin',
        'custom-redirect-uri': 'https://example.com/linkedin/callback',
      },
      { yes: true },
    );

    expect(updatedClients).toHaveLength(1);
    expect(updatedClients[0]).toMatchObject({
      oauthClientId: 'linkedin',
      redirectTo: 'https://example.com/linkedin/callback',
    });
    expect(logs.join('\n')).toContain(
      'Add this redirect URI in your LinkedIn app settings',
    );
    expect(logs.join('\n')).toContain(
      'https://example.com/linkedin/callback?test-redirect=true',
    );
  });

  test('updates Apple Services ID only', async () => {
    await run(
      {
        name: 'apple',
        'services-id': 'new.apple.service',
      },
      { yes: true },
    );

    expect(updatedClients).toHaveLength(1);
    expect(updatedClients[0]).toMatchObject({
      oauthClientId: 'apple',
      clientId: 'new.apple.service',
    });
    expect(updatedClients[0].meta).toBeUndefined();
  });

  test('updates Apple team and key metadata', async () => {
    await run(
      {
        name: 'apple',
        'team-id': 'TEAM123',
        'key-id': 'KEY456',
      },
      { yes: true },
    );

    expect(updatedClients).toHaveLength(1);
    expect(updatedClients[0]).toMatchObject({
      oauthClientId: 'apple',
      meta: {
        teamId: 'TEAM123',
        keyId: 'KEY456',
      },
    });
    expect(updatedClients[0].clientId).toBeUndefined();
  });

  test('Apple redirect update prints Services ID return URL guidance', async () => {
    await run(
      {
        name: 'apple',
        'custom-redirect-uri': 'https://example.com/apple/callback',
      },
      { yes: true },
    );

    expect(updatedClients).toHaveLength(1);
    expect(updatedClients[0]).toMatchObject({
      oauthClientId: 'apple',
      redirectTo: 'https://example.com/apple/callback',
    });
    expect(logs.join('\n')).toContain(
      'Add this return URL under your Services ID on',
    );
    expect(logs.join('\n')).toContain(
      'https://example.com/apple/callback?test-redirect=true',
    );
  });

  test('updates Clerk publishable key and discovery endpoint', async () => {
    await run(
      {
        name: 'clerk',
        'publishable-key':
          'pk_test_Z3VpZGluZy1wZWdhc3VzLTkzLmNsZXJrLmFjY291bnRzLmRldiQ',
      },
      { yes: true },
    );

    expect(updatedClients).toHaveLength(1);
    expect(updatedClients[0]).toMatchObject({
      oauthClientId: 'clerk',
      discoveryEndpoint:
        'https://guiding-pegasus-93.clerk.accounts.dev/.well-known/openid-configuration',
      meta: {
        clerkPublishableKey:
          'pk_test_Z3VpZGluZy1wZWdhc3VzLTkzLmNsZXJrLmFjY291bnRzLmRldiQ',
      },
    });
  });

  test('updates Firebase project ID and discovery endpoint', async () => {
    await run(
      {
        name: 'firebase',
        'project-id': 'my-app-123',
      },
      { yes: true },
    );

    expect(updatedClients).toHaveLength(1);
    expect(updatedClients[0]).toMatchObject({
      oauthClientId: 'firebase',
      discoveryEndpoint:
        'https://securetoken.google.com/my-app-123/.well-known/openid-configuration',
    });
  });

  test('rejects invalid Firebase project ID', async () => {
    await run(
      {
        name: 'firebase',
        'project-id': 'BAD',
      },
      { yes: true },
    );

    expect(logs.join('\n')).toContain('Invalid Firebase project ID');
    expect(updatedClients).toHaveLength(0);
  });
});

describe('--yes validation', () => {
  test('requires an identifier', async () => {
    await run({ 'client-id': 'new-id' }, { yes: true });
    expect(logs.join('\n')).toContain('Must specify --id or --name');
    expect(updatedClients).toHaveLength(0);
  });

  test('requires at least one update field', async () => {
    await run({ name: 'github' }, { yes: true });
    expect(logs.join('\n')).toContain(
      'Must specify at least one of --client-id, --client-secret, or --custom-redirect-uri.',
    );
    expect(updatedClients).toHaveLength(0);
  });

  test('rejects both id and name', async () => {
    await run(
      {
        id: 'github',
        name: 'github',
        'client-secret': 'new-gh-secret',
      },
      { yes: true },
    );

    expect(logs.join('\n')).toContain('Cannot specify both --id and --name');
    expect(updatedClients).toHaveLength(0);
  });

  test('rejects unknown client name', async () => {
    await run(
      {
        name: 'unknown',
        'client-secret': 'new-gh-secret',
      },
      { yes: true },
    );

    expect(logs.join('\n')).toContain('OAuth client not found');
    expect(updatedClients).toHaveLength(0);
  });
});
