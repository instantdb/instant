import { test, expect, describe, vi, beforeEach } from 'vitest';
import { Effect, Layer, Logger } from 'effect';
import { GlobalOpts } from '../src/context/globalOpts.ts';

vi.mock('../src/index.ts', () => ({}));

const state = vi.hoisted(() => ({
  manager: undefined as any,
  etypes: ['posts', 'comments', 'authors'] as string[] | null,
  promptResponses: [] as unknown[],
}));

vi.mock('../src/lib/webhooks.ts', async (importOriginal) => {
  const orig: any = await importOriginal();
  const { Effect } = await import('effect');
  return {
    ...orig,
    useWebhooksManager: (fn: any) =>
      Effect.promise(() => fn(state.manager)),
    getRemoteEtypes: Effect.sync(() => state.etypes),
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

const { parseEtypes, parseActions } = await import('../src/lib/webhooks.ts');
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

const buildManager = (
  overrides: {
    list?: any[];
    createReturns?: any;
    updateReturns?: any;
    deleteReturns?: any;
    enableReturns?: any;
    disableReturns?: any;
  } = {},
) => ({
  list: vi.fn(async () => overrides.list ?? []),
  create: vi.fn(async (p: any) =>
    overrides.createReturns ?? makeWebhook({ ...p, id: 'new-id' }),
  ),
  update: vi.fn(async (id: string, p: any) =>
    overrides.updateReturns ?? makeWebhook({ ...p, id }),
  ),
  delete: vi.fn(async (id: string) =>
    overrides.deleteReturns ?? makeWebhook({ id }),
  ),
  enable: vi.fn(async (id: string) =>
    overrides.enableReturns ?? makeWebhook({ id, status: 'active' }),
  ),
  disable: vi.fn(async (id: string, opts?: { reason?: string }) =>
    overrides.disableReturns ??
    makeWebhook({
      id,
      status: 'disabled',
      disabledReason: opts?.reason ?? null,
    }),
  ),
});

const run = (effect: any, opts: { yes: boolean }) =>
  Effect.runPromise(
    effect.pipe(
      Effect.provide(
        Layer.merge(
          Layer.succeed(GlobalOpts, { yes: opts.yes }),
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
    await run(
      webhooksDisableCmd({ id: 'wh1', reason: 'flaky' } as any),
      { yes: true },
    );
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
    await run(
      webhooksUpdateCmd({ url: 'https://x.example.com' } as any),
      { yes: true },
    );
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
    await run(
      webhooksUpdateCmd({ url: 'https://new.example.com' } as any),
      { yes: false },
    );
    expect(state.manager.update).toHaveBeenCalledWith('wh1', {
      url: 'https://new.example.com',
    });
  });
});
