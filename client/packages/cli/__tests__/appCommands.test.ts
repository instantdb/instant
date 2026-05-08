import {
  HttpClient,
  HttpClientRequest,
  HttpClientResponse,
} from '@effect/platform';
import { describe, expect, test, vi, beforeEach, afterEach } from 'vitest';
import { Effect, Layer, Logger } from 'effect';
import { GlobalOpts } from '../src/context/globalOpts.ts';
import { CurrentApp } from '../src/context/currentApp.ts';
import type { CurrentAppInfo } from '../src/context/currentApp.ts';
import { InstantHttp, InstantHttpAuthed } from '../src/lib/http.ts';

vi.mock('../src/index.ts', () => ({}));

let prompts: any[] = [];
let mockPromptReturn: any;

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

const { appListCommand } = await import('../src/commands/app/list.ts');
const { appDeleteCommand } = await import('../src/commands/app/delete.ts');
const { infoCommand } = await import('../src/commands/info.ts');

const apps = [
  { id: 'app-1', title: 'Alpha', user_app_role: 'owner' },
  { id: 'app-2', title: 'Beta', user_app_role: 'admin' },
  { id: 'app-3', title: 'Gamma', user_app_role: 'collaborator' },
];

let logs: string[] = [];
let requests: {
  method: string;
  url: string;
  headers: Record<string, string>;
}[] = [];
let dashApps = apps;
let appInfo = { id: 'app-1', title: 'Alpha' };

const makeHttp = (): any =>
  HttpClient.make((request, url) => {
    const path = url.pathname;
    requests.push({
      method: request.method,
      url: path,
      headers: request.headers,
    });

    const body =
      path === '/dash'
        ? { apps: dashApps }
        : path === '/dash/me'
          ? {
              user: {
                email: 'test@example.com',
                id: 'user-1',
                created_at: '2026-01-01T00:00:00Z',
              },
            }
          : path === '/dash/apps/app-1'
            ? { app: appInfo }
            : {};

    return Effect.succeed(
      HttpClientResponse.fromWeb(
        request,
        new Response(JSON.stringify(body), {
          headers: { 'content-type': 'application/json' },
        }),
      ),
    );
  }).pipe(HttpClient.mapRequest(HttpClientRequest.prependUrl('http://test')));

const loggerLayer = Logger.replace(
  Logger.defaultLogger,
  Logger.make(({ message }) => {
    logs.push(String(message));
  }),
);

const baseLayer = (opts: { yes?: boolean; currentApp?: CurrentAppInfo }) =>
  Layer.mergeAll(
    Layer.succeed(GlobalOpts, { yes: opts.yes ?? true }),
    Layer.succeed(InstantHttpAuthed, makeHttp()),
    Layer.succeed(InstantHttp, makeHttp()),
    loggerLayer,
    opts.currentApp ? Layer.succeed(CurrentApp, opts.currentApp) : Layer.empty,
  );

const run = (effect: Effect.Effect<any, any, any>, layer = baseLayer({})) =>
  Effect.runPromise(effect.pipe(Effect.provide(layer as any)) as any);

const runFail = <A, E, R>(
  effect: Effect.Effect<A, E, R>,
  layer = baseLayer({}),
) =>
  Effect.runPromise(
    effect.pipe(Effect.flip, Effect.provide(layer as any)) as any,
  );

beforeEach(() => {
  logs = [];
  prompts = [];
  requests = [];
  dashApps = apps;
  appInfo = { id: 'app-1', title: 'Alpha' };
  mockPromptReturn = undefined;
  delete process.env.INSTANT_APP_ID;
});

afterEach(() => {
  delete process.env.INSTANT_APP_ID;
});

describe('app list', () => {
  test('prints app titles and ids', async () => {
    await run(appListCommand({}));

    const output = logs.join('\n');
    expect(output).toContain('Alpha');
    expect(output).toContain('app-1');
    expect(output).toContain('Beta');
    expect(output).toContain('app-2');
  });

  test('--json prints raw apps', async () => {
    await run(appListCommand({ json: true }));

    expect(JSON.parse(logs.join('\n'))).toEqual([
      { id: 'app-1', title: 'Alpha' },
      { id: 'app-2', title: 'Beta' },
      { id: 'app-3', title: 'Gamma' },
    ]);
  });

  test('prints empty state', async () => {
    dashApps = [];

    await run(appListCommand({}));

    expect(logs).toEqual(['No apps found.']);
  });
});

describe('app delete', () => {
  test('deletes app specified by --app when --yes is set', async () => {
    await run(appDeleteCommand({ app: 'app-2' } as any));

    expect(requests).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ method: 'GET', url: '/dash' }),
        expect.objectContaining({ method: 'DELETE', url: '/dash/apps/app-2' }),
      ]),
    );
    expect(logs.join('\n')).toContain('Deleted app "Beta" (app-2).');
  });

  test('defaults to INSTANT_APP_ID when --app is omitted', async () => {
    process.env.INSTANT_APP_ID = 'app-1';

    await run(appDeleteCommand({} as any));

    expect(requests).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ method: 'DELETE', url: '/dash/apps/app-1' }),
      ]),
    );
  });

  test('prompts for app and confirmation interactively', async () => {
    mockPromptReturn = apps[0];
    await run(appDeleteCommand({} as any), baseLayer({ yes: false }));

    expect(prompts[0].render('idle')).toContain('Select an app to delete:');
    expect(prompts[1].render('idle')).toContain('Delete app "Alpha" (app-1)?');
    expect(requests).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ method: 'DELETE', url: '/dash/apps/app-1' }),
      ]),
    );
  });

  test('rejects --yes without a target app', async () => {
    const err = await runFail(appDeleteCommand({} as any));

    expect((err as any).message).toBe('Must specify --app when using --yes');
    expect(requests.some((request) => request.method === 'DELETE')).toBe(false);
  });

  test('does not delete collaborator apps', async () => {
    const err = await runFail(appDeleteCommand({ app: 'app-3' } as any));

    expect((err as any).message).toContain(
      'App not found on your account, or you do not have permission to delete it: app-3',
    );
    expect(requests.some((request) => request.method === 'DELETE')).toBe(false);
  });
});

describe('info', () => {
  test('prints current app when available', async () => {
    await run(
      infoCommand(),
      baseLayer({
        currentApp: {
          appId: 'app-1',
          adminToken: 'admin-token',
          source: 'env',
        },
      }),
    );

    expect(logs.join('\n')).toContain('App: Alpha (app-1)');
    expect(requests).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ method: 'GET', url: '/dash/apps/app-1' }),
      ]),
    );
  });
});
