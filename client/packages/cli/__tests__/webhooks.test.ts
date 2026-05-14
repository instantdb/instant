import { test, expect, describe, vi, beforeEach } from 'vitest';
import { Effect, Layer, Logger } from 'effect';
import { GlobalOpts } from '../src/context/globalOpts.ts';
import { AuthToken } from '../src/context/authToken.ts';
import { CurrentApp } from '../src/context/currentApp.ts';

vi.mock('../src/index.ts', () => ({}));

const state = vi.hoisted(() => ({
  manager: undefined as any,
  etypes: ['posts', 'comments', 'authors'] as string[] | null,
  promptResponses: [] as unknown[],
}));

// Mock at the SDK boundary: any `new InstantPlatformApi(...)` returns a stub
// whose `.webhooks(appId).manager` is the per-test fake manager, and whose
// `getSchema` reflects state.etypes (null → reject, simulating an auth /
// network / missing-app failure that getRemoteEtypes catches).
vi.mock('@instantdb/platform', async (importOriginal) => {
  const orig: any = await importOriginal();
  return {
    ...orig,
    PlatformApi: class {
      webhooks(_appId: string) {
        return { manager: state.manager };
      }
      async getSchema(_appId: string) {
        if (state.etypes === null) {
          throw new Error('schema unavailable');
        }
        const entities = Object.fromEntries(
          state.etypes.map((name) => [name, {}]),
        );
        return { schema: { entities } };
      }
    },
  };
});

vi.mock('../src/ui/lib.ts', async (importOriginal) => {
  const orig: any = await importOriginal();
  return {
    ...orig,
    renderUnwrap: () => {
      if (state.promptResponses.length === 0) {
        return Promise.reject(new Error('No prompt response queued'));
      }
      return Promise.resolve(state.promptResponses.shift());
    },
  };
});

const { parseEtypes, parseActions, fetchRecentEvents } = await import(
  '../src/lib/webhooks.ts'
);
const { joinEtypes, joinActions } = await import(
  '../src/commands/webhooks/shared.ts'
);
const { webhooksListCmd } = await import('../src/commands/webhooks/list.ts');
const { webhooksAddCmd } = await import('../src/commands/webhooks/add.ts');
const { webhooksUpdateCmd } = await import(
  '../src/commands/webhooks/update.ts'
);
const { webhooksDeleteCmd } = await import(
  '../src/commands/webhooks/delete.ts'
);
const { webhooksEnableCmd } = await import(
  '../src/commands/webhooks/enable.ts'
);
const { webhooksDisableCmd } = await import(
  '../src/commands/webhooks/disable.ts'
);
const { webhooksEventsListCmd } = await import(
  '../src/commands/webhooks/events/list.ts'
);
const { webhooksEventsResendCmd } = await import(
  '../src/commands/webhooks/events/resend.ts'
);
const { webhooksEventsPayloadCmd } = await import(
  '../src/commands/webhooks/events/payload.ts'
);

let logs: string[] = [];

const makeWebhook = (overrides: any = {}) => ({
  id: 'wh1',
  sink: { url: 'https://example.com' },
  etypes: ['posts'],
  actions: ['create'],
  status: 'active' as const,
  disabledReason: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
});

const makeEvent = (overrides: any = {}) => ({
  isn: 'isn1',
  status: 'success' as const,
  attempts: null,
  nextAttemptAfter: null,
  createdAt: new Date('2026-05-14T10:00:00Z'),
  updatedAt: new Date('2026-05-14T10:00:01Z'),
  ...overrides,
});

const eventsPage = (
  events: any[],
  hasNextPage = false,
  endCursor: string | null = null,
) => ({
  events,
  pageInfo: {
    startCursor: events[0]?.isn ?? null,
    endCursor,
    hasNextPage,
  },
});

const buildManager = (
  overrides: {
    list?: any[];
    createReturns?: any;
    updateReturns?: any;
    deleteReturns?: any;
    enableReturns?: any;
    disableReturns?: any;
    listEventsReturns?: any;
    resendReturns?: any;
    payloadReturns?: any;
  } = {},
) => ({
  list: vi.fn(async () => overrides.list ?? []),
  create: vi.fn(
    async (p: any) =>
      overrides.createReturns ?? makeWebhook({ ...p, id: 'new-id' }),
  ),
  update: vi.fn(
    async (id: string, p: any) =>
      overrides.updateReturns ?? makeWebhook({ ...p, id }),
  ),
  delete: vi.fn(
    async (id: string) => overrides.deleteReturns ?? makeWebhook({ id }),
  ),
  enable: vi.fn(
    async (id: string) =>
      overrides.enableReturns ?? makeWebhook({ id, status: 'active' }),
  ),
  disable: vi.fn(
    async (id: string, opts?: { reason?: string }) =>
      overrides.disableReturns ??
      makeWebhook({
        id,
        status: 'disabled',
        disabledReason: opts?.reason ?? null,
      }),
  ),
  listEvents: vi.fn(
    async (_webhookId: string, _opts?: { after?: string }) =>
      overrides.listEventsReturns ?? eventsPage([]),
  ),
  resendEvent: vi.fn(
    async (_webhookId: string, isn: string) =>
      overrides.resendReturns ?? makeEvent({ isn, status: 'pending' }),
  ),
  getPayload: vi.fn(
    async (_webhookId: string, _isn: string) =>
      overrides.payloadReturns ?? {
        records: [{ etype: 'posts', action: 'create' }],
      },
  ),
});

const run = (effect: any, opts: { yes: boolean }) =>
  Effect.runPromise(
    effect.pipe(
      Effect.provide(
        Layer.mergeAll(
          Layer.succeed(GlobalOpts, { yes: opts.yes }),
          Layer.succeed(AuthToken, {
            getAuthToken: Effect.succeed('test-token'),
            getSource: Effect.succeed('env' as const),
            setAuthToken: () => Effect.succeed(undefined),
          }),
          Layer.succeed(CurrentApp, {
            appId: 'test-app',
            source: 'env' as const,
          }),
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
  logs = [];
  state.manager = buildManager();
  state.etypes = ['posts', 'comments', 'authors'];
  state.promptResponses = [];
});

describe('parseEtypes', () => {
  test('undefined input returns undefined', async () => {
    expect(await Effect.runPromise(parseEtypes(undefined))).toBeUndefined();
  });
  test('parses CSV', async () => {
    expect(await Effect.runPromise(parseEtypes('posts,comments'))).toEqual([
      'posts',
      'comments',
    ]);
  });
  test('trims whitespace and drops empties', async () => {
    expect(
      await Effect.runPromise(parseEtypes(' posts , , comments ')),
    ).toEqual(['posts', 'comments']);
  });
  test('empty string errors', async () => {
    const err: any = await Effect.runPromise(Effect.flip(parseEtypes('')));
    expect(err.message).toMatch(/at least one entity type/);
  });
});

describe('parseActions', () => {
  test('undefined returns undefined', async () => {
    expect(await Effect.runPromise(parseActions(undefined))).toBeUndefined();
  });
  test('parses valid actions', async () => {
    expect(await Effect.runPromise(parseActions('create,update'))).toEqual([
      'create',
      'update',
    ]);
  });
  test('rejects invalid action', async () => {
    const err: any = await Effect.runPromise(
      Effect.flip(parseActions('create,nuke')),
    );
    expect(err.message).toMatch(/Invalid action: nuke/);
  });
  test('rejects multiple invalid actions', async () => {
    const err: any = await Effect.runPromise(
      Effect.flip(parseActions('foo,bar')),
    );
    expect(err.message).toMatch(/Invalid actions: foo, bar/);
  });
  test('rejects empty', async () => {
    const err: any = await Effect.runPromise(Effect.flip(parseActions('')));
    expect(err.message).toMatch(/at least one action/);
  });
});

describe('webhooks list', () => {
  test('lists webhooks in human format', async () => {
    state.manager = buildManager({ list: [makeWebhook()] });
    await run(webhooksListCmd({} as any), { yes: false });
    const out = logs.join('\n');
    expect(out).toContain('https://example.com');
    expect(out).toContain('ID: wh1');
    expect(out).toContain('Etypes: posts');
    expect(out).toContain('Actions: create');
    expect(out).toContain('Status: active');
  });
  test('shows empty message', async () => {
    await run(webhooksListCmd({} as any), { yes: false });
    expect(logs.join('\n')).toContain('No webhooks configured');
  });
  test('--json prints raw array', async () => {
    state.manager = buildManager({ list: [makeWebhook()] });
    await run(webhooksListCmd({ json: true } as any), { yes: false });
    const parsed = JSON.parse(logs.join('\n'));
    expect(parsed[0]).toMatchObject({ id: 'wh1' });
  });
});

describe('webhooks add --yes', () => {
  test('happy path calls create with parsed flags', async () => {
    await run(
      webhooksAddCmd({
        url: 'https://hook.example.com',
        etypes: 'posts,comments',
        actions: 'create,update',
      } as any),
      { yes: true },
    );
    expect(state.manager.create).toHaveBeenCalledWith({
      url: 'https://hook.example.com',
      etypes: ['posts', 'comments'],
      actions: ['create', 'update'],
    });
    expect(logs.join('\n')).toContain('Webhook added');
  });
  test('missing --etypes errors and does not call create', async () => {
    await run(
      webhooksAddCmd({
        url: 'https://hook.example.com',
        actions: 'create',
      } as any),
      { yes: true },
    );
    expect(state.manager.create).not.toHaveBeenCalled();
    expect(logs.join('\n')).toMatch(/--etypes/);
  });
  test('missing --actions errors and does not call create', async () => {
    await run(
      webhooksAddCmd({
        url: 'https://hook.example.com',
        etypes: 'posts',
      } as any),
      { yes: true },
    );
    expect(state.manager.create).not.toHaveBeenCalled();
    expect(logs.join('\n')).toMatch(/--actions/);
  });
});

describe('webhooks delete', () => {
  test('deletes when --id provided', async () => {
    await run(webhooksDeleteCmd({ id: 'wh1' } as any), { yes: true });
    expect(state.manager.delete).toHaveBeenCalledWith('wh1');
    expect(logs.join('\n')).toContain('Webhook deleted');
  });
});

describe('webhooks enable', () => {
  test('enables when --id provided', async () => {
    await run(webhooksEnableCmd({ id: 'wh1' } as any), { yes: true });
    expect(state.manager.enable).toHaveBeenCalledWith('wh1');
    expect(logs.join('\n')).toContain('Webhook enabled');
  });
});

describe('webhooks disable', () => {
  test('without reason', async () => {
    await run(webhooksDisableCmd({ id: 'wh1' } as any), { yes: true });
    expect(state.manager.disable).toHaveBeenCalledWith('wh1', undefined);
    expect(logs.join('\n')).toContain('Webhook disabled');
  });
  test('with reason', async () => {
    await run(webhooksDisableCmd({ id: 'wh1', reason: 'flaky' } as any), {
      yes: true,
    });
    expect(state.manager.disable).toHaveBeenCalledWith('wh1', {
      reason: 'flaky',
    });
    expect(logs.join('\n')).toContain('Disabled reason: flaky');
  });
});

describe('webhooks update --yes', () => {
  test('partial url-only update', async () => {
    await run(
      webhooksUpdateCmd({
        id: 'wh1',
        url: 'https://new.example.com',
      } as any),
      { yes: true },
    );
    expect(state.manager.update).toHaveBeenCalledWith('wh1', {
      url: 'https://new.example.com',
    });
  });
  test('all fields update', async () => {
    await run(
      webhooksUpdateCmd({
        id: 'wh1',
        url: 'https://new.example.com',
        etypes: 'foo',
        actions: 'create,delete',
      } as any),
      { yes: true },
    );
    expect(state.manager.update).toHaveBeenCalledWith('wh1', {
      url: 'https://new.example.com',
      etypes: ['foo'],
      actions: ['create', 'delete'],
    });
  });
  test('no fields errors and does not call update', async () => {
    await run(webhooksUpdateCmd({ id: 'wh1' } as any), { yes: true });
    expect(state.manager.update).not.toHaveBeenCalled();
    expect(logs.join('\n')).toMatch(/at least one of/);
  });
  test('no --id errors and does not call update', async () => {
    await run(webhooksUpdateCmd({ url: 'https://x.example.com' } as any), {
      yes: true,
    });
    expect(state.manager.update).not.toHaveBeenCalled();
    expect(logs.join('\n')).toMatch(/--id/);
  });
});

describe('interactive flows', () => {
  test('webhooks add prompts for missing url/etypes/actions', async () => {
    state.promptResponses = [
      'https://my-hook.example.com', // URL TextInput
      ['posts', 'authors'], // etypes MultiSelect
      ['create', 'update'], // actions MultiSelect
    ];
    await run(webhooksAddCmd({} as any), { yes: false });
    expect(state.manager.create).toHaveBeenCalledWith({
      url: 'https://my-hook.example.com',
      etypes: ['posts', 'authors'],
      actions: ['create', 'update'],
    });
  });

  test('webhooks add falls back to text-input for etypes when schema unavailable', async () => {
    state.etypes = null;
    state.promptResponses = [
      'https://x.example.com',
      'foo,bar', // etypes TextInput
      ['create'], // actions MultiSelect
    ];
    await run(webhooksAddCmd({} as any), { yes: false });
    expect(state.manager.create).toHaveBeenCalledWith({
      url: 'https://x.example.com',
      etypes: ['foo', 'bar'],
      actions: ['create'],
    });
  });

  test('webhooks delete picker selects a webhook and deletes it', async () => {
    const wh = makeWebhook({ id: 'pick-me' });
    state.manager = buildManager({ list: [wh] });
    state.promptResponses = [wh];
    await run(webhooksDeleteCmd({} as any), { yes: false });
    expect(state.manager.delete).toHaveBeenCalledWith('pick-me');
  });

  test('webhooks update menu edits URL then saves', async () => {
    const initial = makeWebhook({
      id: 'wh1',
      sink: { url: 'https://old.example.com' },
    });
    state.manager = buildManager({ list: [initial] });
    state.promptResponses = [
      initial, // picker selection
      'url', // menu pick
      'https://new.example.com', // URL TextInput
      'save', // menu pick
    ];
    await run(webhooksUpdateCmd({} as any), { yes: false });
    expect(state.manager.update).toHaveBeenCalledWith('wh1', {
      url: 'https://new.example.com',
    });
  });

  test('webhooks update menu cancel does not call update', async () => {
    const initial = makeWebhook({ id: 'wh1' });
    state.manager = buildManager({ list: [initial] });
    state.promptResponses = [initial, 'cancel'];
    await run(webhooksUpdateCmd({} as any), { yes: false });
    expect(state.manager.update).not.toHaveBeenCalled();
    expect(logs.join('\n')).toContain('Cancelled');
  });

  test('webhooks update menu save with no changes does not call update', async () => {
    const initial = makeWebhook({ id: 'wh1' });
    state.manager = buildManager({ list: [initial] });
    state.promptResponses = [initial, 'save'];
    await run(webhooksUpdateCmd({} as any), { yes: false });
    expect(state.manager.update).not.toHaveBeenCalled();
    expect(logs.join('\n')).toContain('No changes to save');
  });

  test('webhooks update with field flags skips the menu', async () => {
    const initial = makeWebhook({ id: 'wh1' });
    state.manager = buildManager({ list: [initial] });
    state.promptResponses = [initial]; // only the picker
    await run(webhooksUpdateCmd({ url: 'https://new.example.com' } as any), {
      yes: false,
    });
    expect(state.manager.update).toHaveBeenCalledWith('wh1', {
      url: 'https://new.example.com',
    });
  });
});

describe('joinEtypes', () => {
  test('sorts alphabetically', () => {
    expect(joinEtypes(['posts', 'authors', 'comments'])).toBe(
      'authors, comments, posts',
    );
  });
  test('handles single etype', () => {
    expect(joinEtypes(['posts'])).toBe('posts');
  });
  test('handles empty list', () => {
    expect(joinEtypes([])).toBe('');
  });
});

describe('joinActions', () => {
  test('returns canonical order regardless of input order', () => {
    expect(joinActions(['delete', 'create'])).toBe('create, delete');
    expect(joinActions(['update', 'delete', 'create'])).toBe(
      'create, update, delete',
    );
  });
  test('handles single action', () => {
    expect(joinActions(['update'])).toBe('update');
  });
});

describe('fetchRecentEvents', () => {
  const runWithLayer = (effect: any) =>
    Effect.runPromise(
      effect.pipe(
        Effect.provide(
          Layer.mergeAll(
            Layer.succeed(GlobalOpts, { yes: true }),
            Layer.succeed(AuthToken, {
              getAuthToken: Effect.succeed('test-token'),
              getSource: Effect.succeed('env' as const),
              setAuthToken: () => Effect.succeed(undefined),
            }),
            Layer.succeed(CurrentApp, {
              appId: 'test-app',
              source: 'env' as const,
            }),
            Logger.replace(
              Logger.defaultLogger,
              Logger.make(({ message }) => logs.push(String(message))),
            ),
          ),
        ),
      ),
    );

  test('paginates until limit is satisfied', async () => {
    const events1 = Array.from({ length: 50 }, (_, i) =>
      makeEvent({ isn: `e${i}` }),
    );
    const events2 = Array.from({ length: 50 }, (_, i) =>
      makeEvent({ isn: `e${50 + i}` }),
    );
    state.manager.listEvents = vi
      .fn()
      .mockResolvedValueOnce(eventsPage(events1, true, 'cursor-1'))
      .mockResolvedValueOnce(eventsPage(events2, true, 'cursor-2'));
    const result = (await runWithLayer(fetchRecentEvents('wh1', 100))) as any[];
    expect(result).toHaveLength(100);
    expect(state.manager.listEvents).toHaveBeenCalledTimes(2);
    expect(state.manager.listEvents).toHaveBeenNthCalledWith(
      1,
      'wh1',
      undefined,
    );
    expect(state.manager.listEvents).toHaveBeenNthCalledWith(2, 'wh1', {
      after: 'cursor-1',
    });
  });

  test('stops when hasNextPage is false', async () => {
    const events = [makeEvent({ isn: 'a' }), makeEvent({ isn: 'b' })];
    state.manager.listEvents = vi
      .fn()
      .mockResolvedValueOnce(eventsPage(events, false, null));
    const result = (await runWithLayer(fetchRecentEvents('wh1', 100))) as any[];
    expect(result).toHaveLength(2);
    expect(state.manager.listEvents).toHaveBeenCalledTimes(1);
  });

  test('caps oversized pages at limit', async () => {
    const events = Array.from({ length: 150 }, (_, i) =>
      makeEvent({ isn: `e${i}` }),
    );
    state.manager.listEvents = vi
      .fn()
      .mockResolvedValueOnce(eventsPage(events, true, 'cursor'));
    const result = (await runWithLayer(fetchRecentEvents('wh1', 100))) as any[];
    expect(result).toHaveLength(100);
    expect(state.manager.listEvents).toHaveBeenCalledTimes(1);
  });
});

describe('webhooks events list', () => {
  test('--yes prints each event with status, attempts, timestamps', async () => {
    state.manager.listEvents = vi.fn().mockResolvedValueOnce(
      eventsPage(
        [
          makeEvent({
            isn: 'evt-1',
            status: 'failed',
            attempts: [
              {
                attemptAt: new Date('2026-05-14T10:00:00Z'),
                durationMs: 1234,
                success: false,
                statusCode: 503,
                responseText: null,
                errorType: null,
                errorMessage: null,
              },
            ],
          }),
        ],
        false,
        null,
      ),
    );
    await run(webhooksEventsListCmd({ webhookId: 'wh1' } as any), {
      yes: true,
    });
    const out = logs.join('\n');
    expect(out).toContain('evt-1');
    expect(out).toContain('failed');
    expect(out).toContain('Attempts: 1');
    expect(out).toContain('503');
  });

  test('--json prints the raw events array', async () => {
    state.manager.listEvents = vi
      .fn()
      .mockResolvedValueOnce(
        eventsPage([makeEvent({ isn: 'a' })], false, null),
      );
    await run(webhooksEventsListCmd({ webhookId: 'wh1', json: true } as any), {
      yes: true,
    });
    const parsed = JSON.parse(logs.join('\n'));
    expect(parsed[0]).toMatchObject({ isn: 'a' });
  });

  test('empty list shows friendly message', async () => {
    state.manager.listEvents = vi
      .fn()
      .mockResolvedValueOnce(eventsPage([], false, null));
    await run(webhooksEventsListCmd({ webhookId: 'wh1' } as any), {
      yes: true,
    });
    expect(logs.join('\n')).toContain('No events for this webhook');
  });
});

describe('webhooks events resend', () => {
  test('--yes with --webhook-id and --isn calls resendEvent', async () => {
    await run(
      webhooksEventsResendCmd({ webhookId: 'wh1', isn: 'evt-1' } as any),
      { yes: true },
    );
    expect(state.manager.resendEvent).toHaveBeenCalledWith('wh1', 'evt-1');
    expect(logs.join('\n')).toContain('Resent event');
  });

  test('--yes without --isn errors via catchTag', async () => {
    await run(webhooksEventsResendCmd({ webhookId: 'wh1' } as any), {
      yes: true,
    });
    expect(state.manager.resendEvent).not.toHaveBeenCalled();
    expect(logs.join('\n')).toMatch(/--isn/);
  });

  test('interactive: pickers for webhook and event', async () => {
    const wh = makeWebhook({ id: 'pick-wh' });
    const evt = makeEvent({ isn: 'pick-evt' });
    state.manager = buildManager({
      list: [wh],
      listEventsReturns: eventsPage([evt], false, null),
    });
    state.promptResponses = [wh, evt];
    await run(webhooksEventsResendCmd({} as any), { yes: false });
    expect(state.manager.resendEvent).toHaveBeenCalledWith(
      'pick-wh',
      'pick-evt',
    );
  });
});

describe('webhooks events payload', () => {
  test('--yes prints prettified JSON', async () => {
    state.manager.getPayload = vi.fn().mockResolvedValueOnce({
      records: [{ etype: 'posts', action: 'create' }],
    });
    await run(
      webhooksEventsPayloadCmd({ webhookId: 'wh1', isn: 'evt-1' } as any),
      { yes: true },
    );
    expect(state.manager.getPayload).toHaveBeenCalledWith('wh1', 'evt-1');
    const parsed = JSON.parse(logs.join('\n'));
    expect(parsed).toMatchObject({
      records: [{ etype: 'posts', action: 'create' }],
    });
  });

  test('--yes without --isn errors', async () => {
    await run(webhooksEventsPayloadCmd({ webhookId: 'wh1' } as any), {
      yes: true,
    });
    expect(state.manager.getPayload).not.toHaveBeenCalled();
    expect(logs.join('\n')).toMatch(/--isn/);
  });

  test('interactive: picker for event then prints payload', async () => {
    const wh = makeWebhook({ id: 'wh1' });
    const evt = makeEvent({ isn: 'evt-1' });
    state.manager = buildManager({
      list: [wh],
      listEventsReturns: eventsPage([evt], false, null),
      payloadReturns: { records: [] },
    });
    state.promptResponses = [wh, evt];
    await run(webhooksEventsPayloadCmd({} as any), { yes: false });
    expect(state.manager.getPayload).toHaveBeenCalledWith('wh1', 'evt-1');
  });
});
