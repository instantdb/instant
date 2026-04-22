import { test, expect, describe, vi, beforeEach } from 'vitest';
import { Effect, Layer, Logger } from 'effect';
import { NodeContext } from '@effect/platform-node';
import { GlobalOpts } from '../src/context/globalOpts.ts';
import { CurrentApp } from '../src/context/currentApp.ts';
import { InstantHttpAuthed } from '../src/lib/http.ts';

// -- mocks --

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
      return Promise.resolve(mockPromptReturn);
    },
  };
});

let updatedClients: any[] = [];
let mockClients: any[] = [];

vi.mock('../src/lib/oauth.ts', () => ({
  getAppsAuth: () =>
    Effect.succeed({
      oauth_service_providers: [{ id: 'prov-1', provider_name: 'google' }],
      oauth_clients: mockClients,
    }),
  updateOAuthClient: (params: any) => {
    updatedClients.push(params);
    return Effect.succeed({
      client: {
        id: params.oauthClientId,
        client_name:
          mockClients.find((c) => c.id === params.oauthClientId)?.client_name ??
          'unknown',
      },
    });
  },
}));

// Lazy import so mocks are in place
const { authClientUpdateCmd } = await import(
  '../src/commands/auth/client/update.ts'
);

// -- helpers --

let logs: string[] = [];

const run = (flags: Record<string, any>, { yes }: { yes: boolean }) =>
  Effect.runPromise(
    authClientUpdateCmd(flags as any).pipe(
      Effect.provide(
        Layer.mergeAll(
          Layer.succeed(GlobalOpts, { yes } as any),
          Layer.succeed(CurrentApp, { appId: 'app-1' } as any),
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
      id: 'c-web',
      client_name: 'google-web',
      meta: { appType: 'web' },
    },
    {
      id: 'c-dev',
      client_name: 'g-dev',
      meta: { appType: 'web', useSharedCredentials: true },
    },
    {
      id: 'c-ios',
      client_name: 'google-ios',
      meta: { appType: 'ios' },
    },
  ];
});

// ---- tests ----

describe('--yes', () => {
  test('update by --name with both fields', async () => {
    await run(
      {
        name: 'google-web',
        clientId: 'NEW-ID',
        clientSecret: 'NEW-SECRET',
      },
      { yes: true },
    );
    expect(updatedClients).toHaveLength(1);
    expect(updatedClients[0].oauthClientId).toBe('c-web');
    expect(updatedClients[0].body).toMatchObject({
      client_id: 'NEW-ID',
      client_secret: 'NEW-SECRET',
      meta: { useSharedCredentials: false },
    });
    expect(logs.join('\n')).toContain('Credentials updated for google-web');
  });

  test('update by --id with only --client-id', async () => {
    await run({ id: 'c-dev', clientId: 'NEW-ID' }, { yes: true });
    expect(updatedClients).toHaveLength(1);
    expect(updatedClients[0].oauthClientId).toBe('c-dev');
    expect(updatedClients[0].body).toMatchObject({
      client_id: 'NEW-ID',
      meta: { useSharedCredentials: false },
    });
    expect(updatedClients[0].body.client_secret).toBeUndefined();
  });

  test('--yes with no id or name → error', async () => {
    await run({ clientId: 'X', clientSecret: 'Y' }, { yes: true });
    expect(logs.join('\n')).toContain('Must specify --id or --name');
    expect(updatedClients).toHaveLength(0);
  });

  test('--yes with no fields → error', async () => {
    await run({ name: 'google-web' }, { yes: true });
    expect(logs.join('\n')).toContain(
      'Must specify at least one of --client-id or --client-secret',
    );
    expect(updatedClients).toHaveLength(0);
  });

  test('--id + --name together → error', async () => {
    await run({ id: 'c-web', name: 'google-web' }, { yes: true });
    expect(logs.join('\n')).toContain('Cannot specify both --id and --name');
    expect(updatedClients).toHaveLength(0);
  });

  test('--name pointing at unknown client → error', async () => {
    await run(
      { name: 'not-real', clientId: 'X', clientSecret: 'Y' },
      { yes: true },
    );
    expect(logs.join('\n')).toContain('OAuth client not found: not-real');
    expect(updatedClients).toHaveLength(0);
  });
});

describe('interactive', () => {
  test('no identifier → picker lists clients with (dev credentials) suffix', async () => {
    mockPromptReturn = mockClients[1]; // pick 'g-dev'
    await run(
      { clientId: 'NEW-ID', clientSecret: 'NEW-SECRET' },
      { yes: false },
    );
    expect(prompts).toHaveLength(1);
    const select = prompts[0] as any;
    expect(select.params.promptText).toBe('Select a client to update:');
    const labels = select.params.options.map((o: any) => o.label);
    // Only the shared-creds client carries the suffix.
    expect(labels.find((l: string) => l.includes('g-dev'))).toContain(
      'dev credentials',
    );
    expect(labels.find((l: string) => l.includes('google-web'))).not.toContain(
      'dev credentials',
    );
    expect(updatedClients).toHaveLength(1);
    expect(updatedClients[0].oauthClientId).toBe('c-dev');
  });

  test('--name given, fields missing → prompts for both (web client)', async () => {
    mockPromptReturn = 'something';
    await run({ name: 'google-web' }, { yes: false });
    expect(prompts).toHaveLength(2);
    expect((prompts[0] as any).props.prompt).toContain('Client ID');
    expect((prompts[1] as any).props.prompt).toContain('Client Secret');
    expect((prompts[1] as any).props.sensitive).toBe(true);
  });

  test('--name + --client-id given → does NOT prompt for secret', async () => {
    await run(
      { name: 'google-web', clientId: 'NEW-ID' },
      { yes: false },
    );
    expect(prompts).toHaveLength(0);
    expect(updatedClients[0].body.client_id).toBe('NEW-ID');
    expect(updatedClients[0].body.client_secret).toBeUndefined();
  });

  test('native client (ios) → prompts for id only, no secret', async () => {
    mockPromptReturn = 'NEW-ID';
    await run({ name: 'google-ios' }, { yes: false });
    expect(prompts).toHaveLength(1);
    expect((prompts[0] as any).props.prompt).toContain('Client ID');
    expect(updatedClients).toHaveLength(1);
    expect(updatedClients[0].oauthClientId).toBe('c-ios');
  });
});
