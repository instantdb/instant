import {
  HttpClient,
  HttpClientRequest,
  HttpClientResponse,
} from '@effect/platform';
import { NodeContext } from '@effect/platform-node';
import { Effect, Layer, Logger } from 'effect';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { defaultMagicCodeEmailConfig } from '@instantdb/platform';
import { CurrentApp } from '../src/context/currentApp.ts';
import { ProjectInfo } from '../src/context/projectInfo.ts';
import { InstantHttpAuthed } from '../src/lib/http.ts';

const mocks = vi.hoisted(() => ({
  readLocalEmailFile: vi.fn(),
  writeTypescript: vi.fn(),
}));

vi.mock('../src/index.ts', () => ({}));

vi.mock('../src/old.js', () => ({
  readLocalEmailFile: mocks.readLocalEmailFile,
}));

vi.mock('../src/lib/pullSchema.ts', async () => {
  const { Effect } = await import('effect');
  return {
    pullSchema: () => Effect.void,
    writeTypescript: (path: string, content: string) =>
      Effect.sync(() => mocks.writeTypescript(path, content)),
  };
});

vi.mock('../src/lib/pullPerms.ts', async () => {
  const { Effect } = await import('effect');
  return { pullPerms: Effect.void };
});

const { authEmailPushCmd } = await import('../src/commands/auth/email/push.ts');
const { authEmailPullCmd } = await import('../src/commands/auth/email/pull.ts');
const { authEmailResetCmd } = await import(
  '../src/commands/auth/email/reset.ts'
);

let logs: string[] = [];
let requests: {
  method: string;
  url: string;
  headers: Record<string, string>;
  body: unknown;
}[] = [];
let pullTemplate: unknown;

const makeHttp = (): any =>
  HttpClient.make((request, url) => {
    requests.push({
      method: request.method,
      url: url.pathname,
      headers: request.headers,
      body: parseRequestBody((request as any).body),
    });

    const body =
      request.method === 'GET' &&
      url.pathname === '/dash/apps/test-app/email_templates'
        ? { template: pullTemplate }
        : { id: 'template-1' };

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

const testLayer = Layer.mergeAll(
  Layer.succeed(CurrentApp, { appId: 'test-app', source: 'env' as const }),
  Layer.succeed(InstantHttpAuthed, makeHttp()),
  Layer.succeed(ProjectInfo, {
    pkgDir: '/project',
    projectType: 'node' as const,
    instantModuleName: '@instantdb/core',
  }),
  loggerLayer,
  NodeContext.layer,
);

const run = (effect: Effect.Effect<any, any, any>) =>
  Effect.runPromise(effect.pipe(Effect.provide(testLayer as any)) as any);

beforeEach(() => {
  logs = [];
  requests = [];
  pullTemplate = undefined;
  mocks.readLocalEmailFile.mockReset();
  mocks.writeTypescript.mockReset();
});

describe('auth email push', () => {
  test('reads the selected email file and pushes its fields', async () => {
    mocks.readLocalEmailFile.mockResolvedValue({
      path: 'custom.email.ts',
      email: {
        authEmail: {
          subject: 'Your code',
          from: 'Instant',
          fromAddress: 'login@example.com',
          body: '<p>Hello {{code}}</p>',
        },
      },
    });

    await run(authEmailPushCmd({ file: 'custom.email.ts' }));

    expect(mocks.readLocalEmailFile).toHaveBeenCalledWith('custom.email.ts');
    expect(requests).toEqual([
      expect.objectContaining({
        method: 'POST',
        url: '/dash/apps/test-app/email_templates',
        body: {
          'email-type': 'magic-code',
          subject: 'Your code',
          body: '<p>Hello {{code}}</p>',
          'sender-email': 'login@example.com',
          'sender-name': 'Instant',
        },
      }),
    ]);

    const output = logs.join('\n');
    expect(output).toContain('Email template saved!');
    expect(output).toContain('Pushed fields:');
    expect(output).toContain('Subject: Your code');
    expect(output).toContain('Sender email: login@example.com');
  });
});

describe('auth email pull', () => {
  test('writes pulled email settings to the selected file', async () => {
    mocks.readLocalEmailFile.mockResolvedValue(undefined);
    pullTemplate = {
      id: 'template-1',
      app_id: 'test-app',
      email_type: 'magic-code',
      subject: 'Welcome',
      name: 'Instant',
      email: null,
      postmark_id: null,
      body: '<p>Hello</p>\n<p>Your code is {{code}}</p>',
    };

    await run(authEmailPullCmd({ file: 'custom.email.ts' }));

    expect(mocks.readLocalEmailFile).toHaveBeenCalledWith('custom.email.ts');
    expect(requests).toEqual([
      expect.objectContaining({
        method: 'GET',
        url: '/dash/apps/test-app/email_templates',
      }),
    ]);
    expect(mocks.writeTypescript).toHaveBeenCalledTimes(1);

    const [path, content] = mocks.writeTypescript.mock.calls[0];
    expect(path).toBe('/project/custom.email.ts');
    expect(content).toContain('subject: "Welcome"');
    expect(content).toContain('from: "Instant"');
    expect(content).toContain('fromAddress: undefined');
    expect(content).toContain(
      'body: `<p>Hello</p>\n<p>Your code is {{code}}</p>`',
    );
    expect(logs.join('\n')).toContain(
      'Wrote email template to custom.email.ts',
    );
  });

  test('writes default email settings when no remote template exists', async () => {
    mocks.readLocalEmailFile.mockResolvedValue(undefined);
    pullTemplate = null;

    await run(authEmailPullCmd({ file: 'custom.email.ts' }));

    expect(mocks.writeTypescript).toHaveBeenCalledTimes(1);

    const [path, content] = mocks.writeTypescript.mock.calls[0];
    expect(path).toBe('/project/custom.email.ts');
    expect(content).toContain(
      `subject: ${JSON.stringify(defaultMagicCodeEmailConfig.authEmail.subject)}`,
    );
    expect(content).toContain('from: ""');
    expect(content).toContain('fromAddress: undefined');
    expect(content).toContain('{code}');
    expect(content).toContain('{app_title}');
    expect(logs.join('\n')).toContain(
      'No custom email template configured. Writing defaults.',
    );
  });
});

describe('auth email reset', () => {
  test('deletes the configured remote template', async () => {
    pullTemplate = {
      id: 'template-1',
      app_id: 'test-app',
      email_type: 'magic-code',
      subject: 'Welcome',
      name: 'Instant',
      email: null,
      postmark_id: null,
      body: '<p>Hello</p>',
    };

    await run(authEmailResetCmd());

    expect(requests).toEqual([
      expect.objectContaining({
        method: 'GET',
        url: '/dash/apps/test-app/email_templates',
      }),
      expect.objectContaining({
        method: 'DELETE',
        url: '/dash/apps/test-app/email_templates/template-1',
      }),
    ]);
    expect(logs.join('\n')).toContain('Email template reset.');
  });

  test('skips reset when no remote template exists', async () => {
    pullTemplate = null;

    await run(authEmailResetCmd());

    expect(requests).toEqual([
      expect.objectContaining({
        method: 'GET',
        url: '/dash/apps/test-app/email_templates',
      }),
    ]);
    expect(logs.join('\n')).toContain(
      'No email template configured. Nothing to reset.',
    );
  });
});

const parseRequestBody = (body: any) => {
  if (!body || body._tag === 'Empty') return undefined;

  const value = body.json ?? body.body ?? body.value ?? body.content ?? body;

  const text =
    value instanceof Uint8Array
      ? new TextDecoder().decode(value)
      : typeof value === 'string'
        ? value
        : undefined;

  if (!text) {
    return value && typeof value === 'object' && !('_tag' in value)
      ? value
      : undefined;
  }

  return JSON.parse(text);
};
