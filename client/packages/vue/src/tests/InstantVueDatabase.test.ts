import { describe, it, expect, vi, beforeEach } from 'vitest';
import { effectScope, ref, nextTick } from 'vue';
import type { AuthState, ConnectionStatus } from '@instantdb/core';

import { InstantVueDatabase } from '../InstantVueDatabase.js';

function createMockCore() {
  return {
    _reactor: {
      status: 'connecting' as ConnectionStatus,
      _currentUserCached: null as AuthState | null,
      getPreviousResult: vi.fn((): Record<string, unknown> | null => null),
      getPresence: vi.fn((): Record<string, unknown> | null => null),
      subscribeTopic: vi.fn(() => vi.fn()),
      subscribePresence: vi.fn(() => vi.fn()),
      joinRoom: vi.fn(() => vi.fn()),
      publishPresence: vi.fn(),
      publishTopic: vi.fn(),
    },
    getLocalId: vi.fn((name: string) => Promise.resolve(`local-id-${name}`)),
    transact: vi.fn(() => Promise.resolve({ status: 'synced' })),
    getAuth: vi.fn(() => Promise.resolve(null)),
    queryOnce: vi.fn(() => Promise.resolve({ data: {}, pageInfo: {} })),
    subscribeQuery: vi.fn((_query: any, _cb: (result: any) => void) => {
      return () => {};
    }),
    subscribeAuth: vi.fn((_cb: (auth: any) => void) => {
      return () => {};
    }),
    subscribeConnectionStatus: vi.fn((_cb: (status: any) => void) => {
      return () => {};
    }),
  };
}

function withScope<T>(fn: () => T): { result: T; cleanup: () => void } {
  const scope = effectScope();
  const result = scope.run(fn) as T;
  return { result, cleanup: () => scope.stop() };
}

describe('InstantVueDatabase', () => {
  let mockCore: ReturnType<typeof createMockCore>;
  let db: InstantVueDatabase<any>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockCore = createMockCore();
    db = new InstantVueDatabase(mockCore as any);
  });

  describe('non-reactive methods', () => {
    it('transact delegates to core', async () => {
      const chunks = [{ type: 'update', entity: 'goals' }];
      await db.transact(chunks as any);
      expect(mockCore.transact).toHaveBeenCalledWith(chunks);
    });

    it('getAuth delegates to core', async () => {
      await db.getAuth();
      expect(mockCore.getAuth).toHaveBeenCalled();
    });

    it('queryOnce delegates to core', async () => {
      const query = { goals: {} };
      await db.queryOnce(query as any);
      expect(mockCore.queryOnce).toHaveBeenCalledWith(query, undefined);
    });

    it('getLocalId delegates to core', async () => {
      const result = await db.getLocalId('device');
      expect(result).toBe('local-id-device');
    });
  });

  describe('useQuery', () => {
    it('starts in loading state', () => {
      const { result, cleanup } = withScope(() =>
        db.useQuery({ goals: {} } as any),
      );

      expect(result.isLoading.value).toBe(true);
      expect(result.data.value).toBeUndefined();
      expect(result.error.value).toBeUndefined();
      cleanup();
    });

    it('subscribes to core when mounted', async () => {
      const { cleanup } = withScope(() => db.useQuery({ goals: {} } as any));
      await nextTick();

      expect(mockCore.subscribeQuery).toHaveBeenCalled();
      cleanup();
    });

    it('updates state when query result arrives', async () => {
      let queryCb: ((result: any) => void) | undefined;
      mockCore.subscribeQuery.mockImplementation((_q: any, cb: any) => {
        queryCb = cb;
        return () => {};
      });

      const { result, cleanup } = withScope(() =>
        db.useQuery({ goals: {} } as any),
      );
      await nextTick();

      expect(queryCb).toBeDefined();
      queryCb!({
        data: { goals: [{ id: '1', title: 'Test' }] },
        pageInfo: {},
      });

      expect(result.isLoading.value).toBe(false);
      expect(result.data.value).toEqual({
        goals: [{ id: '1', title: 'Test' }],
      });
      cleanup();
    });

    it('unsubscribes when scope is stopped', async () => {
      const unsub = vi.fn();
      mockCore.subscribeQuery.mockImplementation(() => unsub);

      const { cleanup } = withScope(() => db.useQuery({ goals: {} } as any));
      await nextTick();

      expect(mockCore.subscribeQuery).toHaveBeenCalled();
      cleanup();
      expect(unsub).toHaveBeenCalled();
    });

    it('handles null query', async () => {
      const { result, cleanup } = withScope(() => db.useQuery(null));
      await nextTick();

      expect(result.isLoading.value).toBe(true);
      expect(result.data.value).toBeUndefined();
      expect(mockCore.subscribeQuery).not.toHaveBeenCalled();
      cleanup();
    });

    it('accepts a function that returns a query', async () => {
      const { cleanup } = withScope(() =>
        db.useQuery(() => ({ goals: {} }) as any),
      );
      await nextTick();

      expect(mockCore.subscribeQuery).toHaveBeenCalled();
      cleanup();
    });

    it('accepts a ref containing a query', async () => {
      const queryRef = ref<any>({ goals: {} });
      const { cleanup } = withScope(() => db.useQuery(queryRef));
      await nextTick();

      expect(mockCore.subscribeQuery).toHaveBeenCalled();
      cleanup();
    });

    it('skips subscription when getter returns null', async () => {
      const { result, cleanup } = withScope(() => db.useQuery(() => null));
      await nextTick();

      expect(result.isLoading.value).toBe(true);
      expect(result.data.value).toBeUndefined();
      expect(mockCore.subscribeQuery).not.toHaveBeenCalled();
      cleanup();
    });

    it('re-subscribes when reactive query changes', async () => {
      const unsub = vi.fn();
      mockCore.subscribeQuery.mockImplementation(() => unsub);

      const queryFilter = ref<string | null>(null);

      const { cleanup } = withScope(() =>
        db.useQuery(() =>
          queryFilter.value
            ? ({
                goals: { $: { where: { status: queryFilter.value } } },
              } as any)
            : null,
        ),
      );
      await nextTick();

      expect(mockCore.subscribeQuery).not.toHaveBeenCalled();

      queryFilter.value = 'active';
      await nextTick();
      expect(mockCore.subscribeQuery).toHaveBeenCalledTimes(1);

      queryFilter.value = 'done';
      await nextTick();

      expect(unsub).toHaveBeenCalled();
      expect(mockCore.subscribeQuery).toHaveBeenCalledTimes(2);
      cleanup();
    });

    it('uses cached result when available', async () => {
      mockCore._reactor.getPreviousResult.mockReturnValue({
        data: { goals: [{ id: '1' }] },
        pageInfo: {},
      });

      const { result, cleanup } = withScope(() =>
        db.useQuery({ goals: {} } as any),
      );
      await nextTick();

      expect(result.isLoading.value).toBe(false);
      expect(result.data.value).toEqual({ goals: [{ id: '1' }] });
      cleanup();
    });
  });

  describe('useAuth', () => {
    it('starts in loading state', () => {
      const { result, cleanup } = withScope(() => db.useAuth());

      expect(result.isLoading.value).toBe(true);
      expect(result.user.value).toBeUndefined();
      cleanup();
    });

    it('updates when auth state changes', async () => {
      let authCb: ((auth: any) => void) | undefined;
      mockCore.subscribeAuth.mockImplementation((cb: any) => {
        authCb = cb;
        return () => {};
      });

      const { result, cleanup } = withScope(() => db.useAuth());

      expect(authCb).toBeDefined();
      authCb!({ user: { id: 'u1', email: 'test@test.com' } });

      expect(result.isLoading.value).toBe(false);
      expect(result.user.value).toEqual({ id: 'u1', email: 'test@test.com' });
      cleanup();
    });

    it('uses cached auth state', () => {
      mockCore._reactor._currentUserCached = {
        isLoading: false,
        user: {
          id: 'cached',
          email: 'cached@test.com',
          refresh_token: '',
          isGuest: false,
        },
        error: undefined,
      };
      const freshDb = new InstantVueDatabase(mockCore as any);

      const { result, cleanup } = withScope(() => freshDb.useAuth());

      expect(result.isLoading.value).toBe(false);
      expect(result.user.value).toEqual({
        id: 'cached',
        email: 'cached@test.com',
        refresh_token: '',
        isGuest: false,
      });
      cleanup();
    });

    it('handles auth error', () => {
      let authCb: ((auth: any) => void) | undefined;
      mockCore.subscribeAuth.mockImplementation((cb: any) => {
        authCb = cb;
        return () => {};
      });

      const { result, cleanup } = withScope(() => db.useAuth());
      authCb!({ error: { message: 'Auth failed' } });

      expect(result.isLoading.value).toBe(false);
      expect(result.error.value).toEqual({ message: 'Auth failed' });
      cleanup();
    });

    it('unsubscribes when scope is stopped', () => {
      const unsub = vi.fn();
      mockCore.subscribeAuth.mockImplementation(() => unsub);

      const { cleanup } = withScope(() => db.useAuth());
      cleanup();
      expect(unsub).toHaveBeenCalled();
    });
  });

  describe('useUser', () => {
    it('throws when accessed and user is not signed in', () => {
      const { result, cleanup } = withScope(() => db.useUser());
      expect(() => result.value).toThrow();
      cleanup();
    });

    it('returns the user once signed in', () => {
      let authCb: ((auth: any) => void) | undefined;
      mockCore.subscribeAuth.mockImplementation((cb: any) => {
        authCb = cb;
        return () => {};
      });

      const { result, cleanup } = withScope(() => db.useUser());
      authCb!({
        user: { id: 'u1', email: 'a@b.com', refresh_token: '', isGuest: false },
      });

      expect(result.value).toEqual({
        id: 'u1',
        email: 'a@b.com',
        refresh_token: '',
        isGuest: false,
      });
      cleanup();
    });
  });

  describe('useConnectionStatus', () => {
    it('returns initial status', () => {
      const { result, cleanup } = withScope(() => db.useConnectionStatus());
      expect(result.value).toBe('connecting');
      cleanup();
    });

    it('updates when connection status changes', () => {
      let statusCb: ((status: any) => void) | undefined;
      mockCore.subscribeConnectionStatus.mockImplementation((cb: any) => {
        statusCb = cb;
        return () => {};
      });

      const { result, cleanup } = withScope(() => db.useConnectionStatus());
      statusCb!('connected');
      expect(result.value).toBe('connected');
      cleanup();
    });
  });

  describe('useLocalId', () => {
    it('starts as null', () => {
      const { result, cleanup } = withScope(() => db.useLocalId('device'));
      expect(result.value).toBeNull();
      cleanup();
    });

    it('loads the ID asynchronously', async () => {
      const { result, cleanup } = withScope(() => db.useLocalId('device'));

      await vi.waitFor(() => {
        expect(result.value).toBe('local-id-device');
      });
      cleanup();
    });

    it('reloads when name ref changes', async () => {
      const name = ref('device');
      const { result, cleanup } = withScope(() => db.useLocalId(name));

      await vi.waitFor(() => {
        expect(result.value).toBe('local-id-device');
      });

      name.value = 'session';
      await vi.waitFor(() => {
        expect(result.value).toBe('local-id-session');
      });
      cleanup();
    });
  });

  describe('room', () => {
    it('creates a room handle', () => {
      const room = db.room('chat' as any, 'room-1');
      expect((room.type as any).value).toBe('chat');
      expect((room.id as any).value).toBe('room-1');
      expect(room.core).toBe(mockCore);
    });

    it('defaults type and id when omitted', () => {
      const room = db.room();
      expect((room.type as any).value).toBe('_defaultRoomType');
      expect((room.id as any).value).toBe('_defaultRoomId');
    });
  });

  describe('rooms.usePresence', () => {
    it('subscribes to presence on mount and unsubscribes on scope stop', () => {
      const unsub = vi.fn();
      mockCore._reactor.subscribePresence.mockImplementation(() => unsub);

      const room = db.room('chat' as any, 'r1');
      const { cleanup } = withScope(() => db.rooms.usePresence(room));
      expect(mockCore._reactor.subscribePresence).toHaveBeenCalled();
      cleanup();
      expect(unsub).toHaveBeenCalled();
    });

    it('publishPresence delegates to core reactor', () => {
      const room = db.room('chat' as any, 'r1');
      const { result, cleanup } = withScope(() => db.rooms.usePresence(room));
      result.publishPresence({ name: 'Alice' } as any);
      expect(mockCore._reactor.publishPresence).toHaveBeenCalledWith(
        'chat',
        'r1',
        { name: 'Alice' },
      );
      cleanup();
    });
  });

  describe('rooms.useTopicEffect', () => {
    it('subscribes to a topic and unsubscribes on scope stop', () => {
      const unsub = vi.fn();
      mockCore._reactor.subscribeTopic.mockImplementation(() => unsub);

      const room = db.room('chat' as any, 'r1');
      const onEvent = vi.fn();
      const { cleanup } = withScope(() =>
        (db.rooms.useTopicEffect as any)(room, 'emoji', onEvent),
      );
      expect(mockCore._reactor.subscribeTopic).toHaveBeenCalled();
      cleanup();
      expect(unsub).toHaveBeenCalled();
    });
  });

  describe('rooms.usePublishTopic', () => {
    it('joins room and returns a publish function', () => {
      const room = db.room('chat' as any, 'r1');
      const { result, cleanup } = withScope(() =>
        (db.rooms.usePublishTopic as any)(room, 'emoji'),
      );
      expect(mockCore._reactor.joinRoom).toHaveBeenCalledWith('chat', 'r1');
      (result as any)({ value: 'fire' });
      expect(mockCore._reactor.publishTopic).toHaveBeenCalledWith({
        roomType: 'chat',
        roomId: 'r1',
        topic: 'emoji',
        data: { value: 'fire' },
      });
      cleanup();
    });
  });

  describe('rooms.useTypingIndicator', () => {
    // Vue's v-bind spread hyphenates `on<UpperCase>` keys via Vue's
    // `parseName` (which calls `hyphenate`, not `toLowerCase`). So
    // `onKeyDown` would map to a non-existent `key-down` event listener.
    // Lowercasing the key (`onKeydown`) avoids the hyphenation entirely.
    it('inputProps uses lowercase listener keys (Vue v-bind requirement)', () => {
      const room = db.room('chat' as any, 'r1');
      const { result, cleanup } = withScope(() =>
        (db.rooms.useTypingIndicator as any)(room, 'chat-input'),
      );
      expect(typeof result.inputProps.onKeydown).toBe('function');
      expect(typeof result.inputProps.onBlur).toBe('function');
      expect((result.inputProps as any).onKeyDown).toBeUndefined();
      cleanup();
    });
  });
});
