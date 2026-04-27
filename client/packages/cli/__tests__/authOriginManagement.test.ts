import { test, expect, describe, vi, beforeEach } from 'vitest';
import { Effect, Layer, Logger } from 'effect';
import { GlobalOpts } from '../src/context/globalOpts.ts';
import { CurrentApp } from '../src/context/currentApp.ts';
import { InstantHttpAuthed } from '../src/lib/http.ts';

// -- mocks --

// Prevent src/index.ts side-effect (program.parse) from running.
// The command files import types from index.ts, but vitest still evaluates it.
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

let origins: any[] = [];
let addedOrigins: any[] = [];
let removedOriginIds: string[] = [];

vi.mock('../src/lib/oauth.ts', async (importOriginal) => {
  const orig: any = await importOriginal();
  return {
    ...orig,
    getAppsAuth: () =>
      Effect.succeed({
        authorized_redirect_origins: origins,
        oauth_service_providers: [],
        oauth_clients: [],
      }),
    addAuthorizedOrigin: (params: any) => {
      addedOrigins.push(params);
      return Effect.succeed({
        origin: {
          id: `origin-${addedOrigins.length}`,
          service: params.service,
          params: params.params,
        },
      });
    },
    removeAuthorizedOrigin: (originId: string) => {
      removedOriginIds.push(originId);
      return Effect.succeed({
        origin: origins.find((origin) => origin.id === originId) ?? {
          id: originId,
          service: 'generic',
          params: ['example.com'],
        },
      });
    },
  };
});

// Lazy import so mocks are in place.
const { authOriginAddCmd } = await import('../src/commands/auth/origin/add.ts');
const { authOriginDeleteCmd } = await import(
  '../src/commands/auth/origin/delete.ts'
);
const { authOriginListCmd } = await import(
  '../src/commands/auth/origin/list.ts'
);

// -- helpers --

let logs: string[] = [];

type TestContext = GlobalOpts | CurrentApp | InstantHttpAuthed;

const run = (
  cmd: Effect.Effect<void, any, TestContext>,
  { yes }: { yes: boolean },
) =>
  Effect.runPromise(
    cmd.pipe(
      Effect.provide(
        Layer.mergeAll(
          Layer.succeed(GlobalOpts, { yes }),
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

const add = (flags: Map<string, string>, opts = { yes: true }) =>
  run(authOriginAddCmd(Object.fromEntries(flags) as any), opts);

const list = (flags: Map<string, any>, opts = { yes: true }) =>
  run(authOriginListCmd(Object.fromEntries(flags) as any), opts);

const remove = (flags: Map<string, string>, opts = { yes: true }) =>
  run(authOriginDeleteCmd(Object.fromEntries(flags) as any), opts);

const without = (flags: Map<string, string>, key: string) => {
  const copy = new Map(flags);
  copy.delete(key);
  return copy;
};

beforeEach(() => {
  prompts = [];
  origins = [];
  addedOrigins = [];
  removedOriginIds = [];
  logs = [];
  mockPromptReturn = '';
});

// -- flag sets --

const websiteFlags = new Map([
  ['type', 'website'],
  ['url', 'https://example.com/login'],
]);

const vercelFlags = new Map([
  ['type', 'vercel'],
  ['project', 'instant-preview'],
]);

const netlifyFlags = new Map([
  ['type', 'netlify'],
  ['site', 'instant-netlify'],
]);

const customSchemeFlags = new Map([
  ['type', 'custom-scheme'],
  ['scheme', 'instant://'],
]);

// -- add: build-up with --yes --

describe('add: --yes errors on missing required flags', () => {
  test('missing --type', async () => {
    await add(without(websiteFlags, 'type'), { yes: true });
    expect(logs.join('\n')).toContain('Missing required value for --type');
    expect(addedOrigins).toHaveLength(0);
  });

  test('website missing --url', async () => {
    await add(without(websiteFlags, 'url'), { yes: true });
    expect(logs.join('\n')).toContain('Missing required value for --url');
    expect(addedOrigins).toHaveLength(0);
  });

  test('vercel missing --project', async () => {
    await add(without(vercelFlags, 'project'), { yes: true });
    expect(logs.join('\n')).toContain('Missing required value for --project');
    expect(addedOrigins).toHaveLength(0);
  });

  test('netlify missing --site', async () => {
    await add(without(netlifyFlags, 'site'), { yes: true });
    expect(logs.join('\n')).toContain('Missing required value for --site');
    expect(addedOrigins).toHaveLength(0);
  });

  test('custom scheme missing --scheme', async () => {
    await add(without(customSchemeFlags, 'scheme'), { yes: true });
    expect(logs.join('\n')).toContain('Missing required value for --scheme');
    expect(addedOrigins).toHaveLength(0);
  });
});

// -- add: interactive prompts --

describe('add: interactive prompts for missing flags', () => {
  test('missing --type -> prompts type selector', async () => {
    mockPromptReturn = 'website';
    await add(without(websiteFlags, 'type'), { yes: false });
    expect((prompts[0] as any).params.promptText).toBe(
      'Select an origin type:',
    );
  });

  test('website missing --url -> prompts for URL', async () => {
    mockPromptReturn = 'example.com';
    await add(without(websiteFlags, 'url'), { yes: false });
    expect((prompts[0] as any).props.prompt).toBe('Website URL:');
  });

  test('delete missing --id -> prompts origin selector', async () => {
    origins = [{ id: 'origin-1', service: 'generic', params: ['example.com'] }];
    mockPromptReturn = origins[0];
    await remove(new Map(), { yes: false });
    expect((prompts[0] as any).params.promptText).toBe(
      'Select an origin to delete:',
    );
    expect(removedOriginIds).toEqual(['origin-1']);
  });
});

// -- add: success --

describe('add: success', () => {
  test('website origin -> creates generic origin with host only', async () => {
    await add(websiteFlags, { yes: true });
    expect(addedOrigins).toEqual([
      { service: 'generic', params: ['example.com'] },
    ]);
    const output = logs.join('\n');
    expect(output).toContain('Origin added: example.com');
    expect(output).toContain('Type: Website');
    expect(output).toContain('ID: origin-1');
  });

  test('website origin without protocol -> accepts domain', async () => {
    await add(
      new Map([
        ['type', 'website'],
        ['url', 'example.org'],
      ]),
      { yes: true },
    );
    expect(addedOrigins).toEqual([
      { service: 'generic', params: ['example.org'] },
    ]);
  });

  test('vercel origin -> creates vercel origin params', async () => {
    await add(vercelFlags, { yes: true });
    expect(addedOrigins).toEqual([
      { service: 'vercel', params: ['vercel.app', 'instant-preview'] },
    ]);
    expect(logs.join('\n')).toContain('Origin added: instant-preview');
  });

  test('netlify origin -> creates netlify origin params', async () => {
    await add(netlifyFlags, { yes: true });
    expect(addedOrigins).toEqual([
      { service: 'netlify', params: ['instant-netlify'] },
    ]);
  });

  test('custom scheme origin -> creates custom scheme origin params', async () => {
    await add(customSchemeFlags, { yes: true });
    expect(addedOrigins).toEqual([
      { service: 'custom-scheme', params: ['instant'] },
    ]);
    expect(logs.join('\n')).toContain('Origin added: instant://');
  });
});

// -- list and delete --

describe('list', () => {
  test('prints configured origins', async () => {
    origins = [
      { id: 'origin-1', service: 'generic', params: ['example.com'] },
      { id: 'origin-2', service: 'vercel', params: ['vercel.app', 'preview'] },
    ];
    await list(new Map(), { yes: true });
    const output = logs.join('\n');
    expect(output).toContain('example.com');
    expect(output).toContain('Type: Website');
    expect(output).toContain('ID: origin-1');
    expect(output).toContain('preview');
    expect(output).toContain('Type: Vercel project');
  });

  test('--json prints raw origins', async () => {
    origins = [{ id: 'origin-1', service: 'generic', params: ['example.com'] }];
    await list(new Map([['json', true]]), { yes: true });
    expect(JSON.parse(logs.join('\n'))).toEqual(origins);
  });
});

describe('delete', () => {
  test('--id removes origin', async () => {
    origins = [{ id: 'origin-1', service: 'generic', params: ['example.com'] }];
    await remove(new Map([['id', 'origin-1']]), { yes: true });
    expect(removedOriginIds).toEqual(['origin-1']);
    expect(logs.join('\n')).toContain('Origin deleted!');
  });

  test('missing --id with --yes errors', async () => {
    origins = [{ id: 'origin-1', service: 'generic', params: ['example.com'] }];
    await expect(remove(new Map(), { yes: true })).rejects.toThrow(
      'Must specify --id',
    );
    expect(removedOriginIds).toHaveLength(0);
  });

  test('no origins exits without deleting', async () => {
    await remove(new Map(), { yes: false });
    expect(logs.join('\n')).toContain(
      'No authorized redirect origins configured.',
    );
    expect(prompts).toHaveLength(0);
    expect(removedOriginIds).toHaveLength(0);
  });
});
