import { test, expect, describe, vi, beforeEach } from 'vitest';
import { Effect, Layer, Logger } from 'effect';
import { GlobalOpts } from '../src/context/globalOpts.ts';

// -- mocks --

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
}));

// Lazy import so mocks are in place
const { authClientAddCmd } = await import(
  '../src/commands/auth/client/add.ts'
);

// -- helpers --

let logs: string[] = [];

const TestLoggerLive = Logger.replace(
  Logger.defaultLogger,
  Logger.make(({ message }) => {
    logs.push(String(message));
  }),
);

const run = (opts: Record<string, unknown>, yes: boolean) =>
  Effect.runPromise(
    authClientAddCmd(opts as any).pipe(
      Effect.provide(Layer.succeed(GlobalOpts, { yes })),
      Effect.provide(TestLoggerLive),
    ),
  );

beforeEach(() => {
  prompts = [];
  addedClients = [];
  logs = [];
  mockPromptReturn = '';
});

// -- flag sets --

const webFlags = {
  type: 'google',
  'app-type': 'web',
  name: 'google-web',
  'client-id': '123456.apps.googleusercontent.com',
  'client-secret': 'GOCSPX-abc123',
};

const iosFlags = {
  type: 'google',
  'app-type': 'ios',
  name: 'google-ios',
  'client-id': '123456.apps.googleusercontent.com',
};

const without = (
  flags: Record<string, string>,
  key: string,
): Record<string, unknown> => {
  const { [key]: _, ...rest } = flags;
  return rest;
};

// -- web: build-up with --yes --

describe('web: --yes errors on each missing required flag', () => {
  test('missing --type', async () => {
    await run(without(webFlags, 'type'), true);
    expect(logs.join('\n')).toContain('Missing required value for --type');
    expect(addedClients).toHaveLength(0);
  });

  test('missing --app-type', async () => {
    await run(without(webFlags, 'app-type'), true);
    expect(logs.join('\n')).toContain('Missing required value for --app-type');
    expect(addedClients).toHaveLength(0);
  });

  test('missing --name', async () => {
    await run(without(webFlags, 'name'), true);
    expect(logs.join('\n')).toContain('Missing required value for --name');
    expect(addedClients).toHaveLength(0);
  });

  test('missing --client-id', async () => {
    await run(without(webFlags, 'client-id'), true);
    expect(logs.join('\n')).toContain('Missing required value for --client-id');
    expect(addedClients).toHaveLength(0);
  });

  test('missing --client-secret', async () => {
    await run(without(webFlags, 'client-secret'), true);
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
    await run(without(webFlags, 'type'), false);
    expect((prompts[0] as any).params.promptText).toBe(
      'Select a client type:',
    );
  });

  test('missing --app-type → prompts app type selector', async () => {
    mockPromptReturn = 'web';
    await run(without(webFlags, 'app-type'), false);
    expect((prompts[0] as any).params.promptText).toBe(
      'Select a Google app type:',
    );
  });

  test('missing --name → prompts for name', async () => {
    mockPromptReturn = 'google-web';
    await run(without(webFlags, 'name'), false);
    expect((prompts[0] as any).props.prompt).toBe('Client Name:');
  });

  test('missing --client-id → prompts for client id', async () => {
    mockPromptReturn = '123456.apps.googleusercontent.com';
    await run(without(webFlags, 'client-id'), false);
    expect((prompts[0] as any).props.prompt).toBe('Client ID:');
  });

  test('missing --client-secret → prompts for client secret', async () => {
    mockPromptReturn = 'GOCSPX-abc123';
    await run(without(webFlags, 'client-secret'), false);
    expect((prompts[0] as any).props.prompt).toBe('Client Secret:');
    expect((prompts[0] as any).props.sensitive).toBe(true);
  });

  test('custom-redirect-uri → prompts when omitted', async () => {
    mockPromptReturn = '';
    await run(webFlags, false);
    expect(prompts).toHaveLength(1);
    expect((prompts[0] as any).props.placeholder).toBe(
      'https://yoursite.com/oauth/callback',
    );
  });

  test('custom-redirect-uri → skipped with --yes', async () => {
    await run(webFlags, true);
    expect(prompts).toHaveLength(0);
    expect(addedClients).toHaveLength(1);
  });
});

// -- web: success cases --

describe('web: success', () => {
  test('all required flags → creates client', async () => {
    await run(webFlags, true);
    expect(addedClients).toHaveLength(1);
    expect(addedClients[0]).toMatchObject({
      clientName: 'google-web',
      clientId: '123456.apps.googleusercontent.com',
      clientSecret: 'GOCSPX-abc123',
    });
  });

  test('with custom-redirect-uri → uses it', async () => {
    await run(
      { ...webFlags, 'custom-redirect-uri': 'https://myapp.com/cb' },
      true,
    );
    expect(addedClients[0].redirectTo).toBe('https://myapp.com/cb');
  });
});

// -- ios: forbidden flags and success --

describe('ios', () => {
  test('--client-secret → error (not supported)', async () => {
    await run({ ...iosFlags, 'client-secret': 'secret' }, true);
    expect(logs.join('\n')).toContain(
      '--client-secret is not compatible with other options',
    );
    expect(addedClients).toHaveLength(0);
  });

  test('--custom-redirect-uri → error (not supported)', async () => {
    await run(
      { ...iosFlags, 'custom-redirect-uri': 'https://example.com' },
      true,
    );
    expect(logs.join('\n')).toContain('not using web app type');
    expect(addedClients).toHaveLength(0);
  });

  test('valid flags → creates client without secret', async () => {
    await run(iosFlags, true);
    expect(addedClients).toHaveLength(1);
    expect(addedClients[0]).toMatchObject({
      clientName: 'google-ios',
      clientId: '123456.apps.googleusercontent.com',
    });
    expect(addedClients[0].clientSecret).toBeUndefined();
  });
});
