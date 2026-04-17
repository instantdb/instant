import { test, expect, describe, vi, beforeEach } from 'vitest';
import { Effect, Layer, Logger } from 'effect';
import { FileSystem } from '@effect/platform';
import { SystemError } from '@effect/platform/Error';
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
      oauth_service_providers: [{ id: 'prov-1', provider_name: 'apple' }],
      oauth_clients: [],
    }),
  addOAuthProvider: () =>
    Effect.succeed({
      provider: { id: 'prov-1', provider_name: 'apple' },
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

// In-memory filesystem for the private-key file. Keys are paths, values are
// file contents. Requested paths that aren't present throw SystemError, which
// the Apple handler maps to BadArgsError.
let mockFiles: Record<string, string> = {};

const MockFileSystemLayer = FileSystem.layerNoop({
  readFileString: (path: string) =>
    path in mockFiles
      ? Effect.succeed(mockFiles[path])
      : Effect.fail(
          new SystemError({
            reason: 'NotFound',
            module: 'FileSystem',
            method: 'readFileString',
            pathOrDescriptor: path,
            description: `no such file or directory, open '${path}'`,
          }),
        ),
});

const run = (flags: Map<string, string>, { yes }: { yes: boolean }) =>
  Effect.runPromise(
    authClientAddCmd(Object.fromEntries(flags) as any).pipe(
      Effect.provide(
        Layer.mergeAll(
          Layer.succeed(GlobalOpts, { yes }),
          Layer.succeed(CurrentApp, { appId: 'test-app', source: 'env' }),
          Layer.succeed(InstantHttpAuthed, {} as any),
          // Mocked FileSystem so readPrivateKeyFile reads from `mockFiles`.
          MockFileSystemLayer,
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

const PEM_CONTENTS =
  '-----BEGIN PRIVATE KEY-----\nabc\n-----END PRIVATE KEY-----\n';
const PEM_PATH = '/tmp/AuthKey_ABC123.p8';

beforeEach(() => {
  prompts = [];
  addedClients = [];
  logs = [];
  mockPromptReturn = '';
  mockFiles = { [PEM_PATH]: PEM_CONTENTS };
});

// -- flag sets --

const nativeFlags = new Map([
  ['type', 'apple'],
  ['name', 'apple-native'],
  ['services-id', 'com.example.app'],
]);

const webFlags = new Map([
  ['type', 'apple'],
  ['name', 'apple-web'],
  ['services-id', 'com.example.web'],
  ['team-id', 'ABCD1234'],
  ['key-id', 'XYZ789'],
  ['private-key-file', PEM_PATH],
]);

// -- native-only (no web flow): build-up with --yes --

describe('native: --yes errors on each missing required flag', () => {
  test('missing --type', async () => {
    await run(without(nativeFlags, 'type'), { yes: true });
    expect(logs.join('\n')).toContain('Missing required value for --type');
    expect(addedClients).toHaveLength(0);
  });

  test('missing --name', async () => {
    await run(without(nativeFlags, 'name'), { yes: true });
    expect(logs.join('\n')).toContain('Missing required value for --name');
    expect(addedClients).toHaveLength(0);
  });

  test('missing --services-id', async () => {
    await run(without(nativeFlags, 'services-id'), { yes: true });
    expect(logs.join('\n')).toContain(
      'Missing required value for --services-id',
    );
    expect(addedClients).toHaveLength(0);
  });
});

// -- native-only: interactive prompts --

describe('native: interactive prompts for each missing flag', () => {
  test('missing --type → prompts type selector', async () => {
    mockPromptReturn = 'apple';
    await run(without(nativeFlags, 'type'), { yes: false });
    expect((prompts[0] as any).params.promptText).toBe('Select a client type:');
  });

  test('missing --name → prompts for name', async () => {
    mockPromptReturn = 'apple-native';
    await run(without(nativeFlags, 'name'), { yes: false });
    expect((prompts[0] as any).props.prompt).toBe('Client Name:');
  });

  test('missing --services-id → prompts for Services ID', async () => {
    mockPromptReturn = 'com.example.app';
    await run(without(nativeFlags, 'services-id'), { yes: false });
    expect((prompts[0] as any).props.prompt).toContain('Services ID');
  });

  test('no web-flow flags → prompts to configure web flow', async () => {
    // mockPromptReturn = '' → confirmation treats as false (defaultValue)
    await run(nativeFlags, { yes: false });
    const confirm = prompts.find((p) =>
      String(p?.props?.promptText ?? '').includes(
        'Configure web redirect flow?',
      ),
    );
    expect(confirm).toBeDefined();
    // With default = false, no additional web-flow prompts should appear
    expect(addedClients).toHaveLength(1);
    expect(addedClients[0].clientSecret).toBeUndefined();
  });

  test('configure-web confirm → does not prompt with --yes', async () => {
    await run(nativeFlags, { yes: true });
    const confirm = prompts.find((p) =>
      String(p?.props?.promptText ?? '').includes(
        'Configure web redirect flow?',
      ),
    );
    expect(confirm).toBeUndefined();
    expect(addedClients).toHaveLength(1);
  });
});

// -- native-only: success --

describe('native: success', () => {
  test('all required flags → creates client without secret or redirect', async () => {
    await run(nativeFlags, { yes: true });
    expect(addedClients).toHaveLength(1);
    expect(addedClients[0]).toMatchObject({
      clientName: 'apple-native',
      clientId: 'com.example.app',
    });
    const output = logs.join('\n');
    expect(output).toContain('Apple OAuth client created: apple-native');
    expect(output).toContain('ID: client-1');
    expect(output).toContain('Services ID: com.example.app');
  });
});

// -- web flow: build-up with --yes --

describe('web: --yes errors on each missing required flag', () => {
  test('missing --team-id', async () => {
    await run(without(webFlags, 'team-id'), { yes: true });
    expect(logs.join('\n')).toContain('Missing required value for --team-id');
    expect(addedClients).toHaveLength(0);
  });

  test('missing --key-id', async () => {
    await run(without(webFlags, 'key-id'), { yes: true });
    expect(logs.join('\n')).toContain('Missing required value for --key-id');
    expect(addedClients).toHaveLength(0);
  });

  test('missing --private-key-file', async () => {
    await run(without(webFlags, 'private-key-file'), { yes: true });
    expect(logs.join('\n')).toContain(
      'Missing required value for --private-key-file',
    );
    expect(addedClients).toHaveLength(0);
  });
});

// -- web: interactive prompts --

describe('web: interactive prompts for each missing flag', () => {
  test('missing --team-id → prompts for Team ID', async () => {
    mockPromptReturn = 'ABCD1234';
    await run(without(webFlags, 'team-id'), { yes: false });
    const p = prompts.find((p: any) =>
      String(p?.props?.prompt ?? '').includes('Team ID'),
    );
    expect(p).toBeDefined();
  });

  test('missing --key-id → prompts for Key ID', async () => {
    mockPromptReturn = 'XYZ789';
    await run(without(webFlags, 'key-id'), { yes: false });
    const p = prompts.find((p: any) =>
      String(p?.props?.prompt ?? '').includes('Key ID'),
    );
    expect(p).toBeDefined();
  });

  test('missing --private-key-file → prompts for path', async () => {
    mockPromptReturn = PEM_PATH;
    await run(without(webFlags, 'private-key-file'), { yes: false });
    const p = prompts.find((p: any) =>
      String(p?.props?.prompt ?? '').includes('Path to .p8 private key file'),
    );
    expect(p).toBeDefined();
  });

  test('custom-redirect-uri → prompts when omitted', async () => {
    mockPromptReturn = '';
    await run(webFlags, { yes: false });
    const p = prompts.find(
      (p: any) =>
        p?.props?.placeholder === 'https://yoursite.com/oauth/callback',
    );
    expect(p).toBeDefined();
  });

  test('custom-redirect-uri → skipped with --yes', async () => {
    await run(webFlags, { yes: true });
    expect(prompts).toHaveLength(0);
    expect(addedClients).toHaveLength(1);
  });
});

// -- web: success --

describe('web: success', () => {
  test('all required flags → creates client and prints redirect URL', async () => {
    await run(webFlags, { yes: true });
    expect(addedClients).toHaveLength(1);
    expect(addedClients[0]).toMatchObject({
      clientName: 'apple-web',
      clientId: 'com.example.web',
      clientSecret: PEM_CONTENTS.trim(),
      redirectTo: 'https://api.instantdb.com/runtime/oauth/callback',
      meta: { teamId: 'ABCD1234', keyId: 'XYZ789' },
    });
    const output = logs.join('\n');
    expect(output).toContain('Apple OAuth client created: apple-web');
    expect(output).toContain('Services ID: com.example.web');
    expect(output).toContain('Team ID: ABCD1234');
    expect(output).toContain('Key ID: XYZ789');
    expect(output).toContain(
      'Add this return URL under your Services ID on developer.apple.com:',
    );
    expect(output).toContain(
      'https://api.instantdb.com/runtime/oauth/callback',
    );
    expect(output).not.toContain('Native-only flow configured.');
  });

  test('with custom-redirect-uri → uses it and prints forwarding instructions', async () => {
    await run(
      withEntry(webFlags, 'custom-redirect-uri', 'https://myapp.com/cb'),
      { yes: true },
    );
    expect(addedClients[0].redirectTo).toBe('https://myapp.com/cb');
    const output = logs.join('\n');
    expect(output).toContain('https://myapp.com/cb');
    expect(output).toContain(
      'https://api.instantdb.com/runtime/oauth/callback with all query parameters',
    );
  });
});

// -- private key file: error paths --

describe('private key file errors', () => {
  test('file does not exist → BadArgsError', async () => {
    mockFiles = {}; // remove the PEM
    await run(webFlags, { yes: true });
    expect(logs.join('\n')).toContain(
      `Could not read private key file at ${PEM_PATH}`,
    );
    expect(addedClients).toHaveLength(0);
  });

  test('file is empty → BadArgsError', async () => {
    mockFiles = { [PEM_PATH]: '   \n  ' };
    await run(webFlags, { yes: true });
    expect(logs.join('\n')).toContain(
      `Private key file at ${PEM_PATH} is empty.`,
    );
    expect(addedClients).toHaveLength(0);
  });
});

// -- native-only: stray web-only flag rejection --

describe('native: web-only flags rejected when web flow not configured', () => {
  test('--custom-redirect-uri without web flow → error', async () => {
    await run(
      withEntry(nativeFlags, 'custom-redirect-uri', 'https://example.com'),
      { yes: true },
    );
    expect(logs.join('\n')).toContain(
      '--custom-redirect-uri requires configuring the web redirect flow',
    );
    expect(addedClients).toHaveLength(0);
  });
});
