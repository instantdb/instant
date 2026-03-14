import { describe, it, expect, vi, beforeEach } from 'vitest';
import { tick } from 'svelte';
import type { AuthState, ConnectionStatus } from '@instantdb/core';

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
    auth: {
      sendMagicCode: vi.fn(),
      signInWithMagicCode: vi.fn(),
      signOut: vi.fn(),
    },
    storage: {
      upload: vi.fn(),
      getDownloadUrl: vi.fn(),
      delete: vi.fn(),
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

vi.mock('@instantdb/core', async () => {
  const actual = await vi.importActual('@instantdb/core');
  return {
    ...actual,
    init: vi.fn(),
    core_init: vi.fn(),
  };
});

import { InstantSvelteDatabase } from '../lib/InstantSvelteDatabase.svelte.js';

describe('InstantSvelteDatabase', () => {
  let mockCore: ReturnType<typeof createMockCore>;
  let db: InstantSvelteDatabase<any>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockCore = createMockCore();
    db = new InstantSvelteDatabase(mockCore as any);
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
      let state: any;
      const cleanup = $effect.root(() => {
        state = db.useQuery({ goals: {} } as any);
      });

      expect(state.isLoading).toBe(true);
      expect(state.data).toBeUndefined();
      expect(state.error).toBeUndefined();
      cleanup();
    });

    it('subscribes to core on mount', async () => {
      const cleanup = $effect.root(() => {
        db.useQuery({ goals: {} } as any);
      });
      await tick();

      expect(mockCore.subscribeQuery).toHaveBeenCalled();
      cleanup();
    });

    it('updates state when query result arrives', async () => {
      let queryCb: ((result: any) => void) | undefined;
      mockCore.subscribeQuery.mockImplementation((_q: any, cb: any) => {
        queryCb = cb;
        return () => {};
      });

      let state: any;
      const cleanup = $effect.root(() => {
        state = db.useQuery({ goals: {} } as any);
      });
      await tick();

      expect(queryCb).toBeDefined();
      queryCb!({
        data: { goals: [{ id: '1', title: 'Test' }] },
        pageInfo: {},
      });

      expect(state.isLoading).toBe(false);
      expect(state.data).toEqual({ goals: [{ id: '1', title: 'Test' }] });
      cleanup();
    });

    it('unsubscribes on cleanup', async () => {
      const unsub = vi.fn();
      mockCore.subscribeQuery.mockImplementation(() => unsub);

      const cleanup = $effect.root(() => {
        db.useQuery({ goals: {} } as any);
      });
      await tick();

      expect(mockCore.subscribeQuery).toHaveBeenCalled();
      cleanup();
      expect(unsub).toHaveBeenCalled();
    });

    it('handles null query', async () => {
      let state: any;
      const cleanup = $effect.root(() => {
        state = db.useQuery(null);
      });
      await tick();

      expect(state.isLoading).toBe(true);
      expect(state.data).toBeUndefined();
      expect(mockCore.subscribeQuery).not.toHaveBeenCalled();
      cleanup();
    });

    it('uses cached result when available', async () => {
      mockCore._reactor.getPreviousResult.mockReturnValue({
        data: { goals: [{ id: '1' }] },
        pageInfo: {},
      });

      let state: any;
      const cleanup = $effect.root(() => {
        state = db.useQuery({ goals: {} } as any);
      });
      await tick();

      expect(state.isLoading).toBe(false);
      expect(state.data).toEqual({ goals: [{ id: '1' }] });
      cleanup();
    });
  });

  describe('useAuth', () => {
    it('starts in loading state', () => {
      let auth: any;
      const cleanup = $effect.root(() => {
        auth = db.useAuth();
      });

      expect(auth.isLoading).toBe(true);
      expect(auth.user).toBeUndefined();
      cleanup();
    });

    it('updates when auth state changes', async () => {
      let authCb: ((auth: any) => void) | undefined;
      mockCore.subscribeAuth.mockImplementation((cb: any) => {
        authCb = cb;
        return () => {};
      });

      let auth: any;
      const cleanup = $effect.root(() => {
        auth = db.useAuth();
      });
      await tick();

      expect(authCb).toBeDefined();
      authCb!({ user: { id: 'u1', email: 'test@test.com' } });

      expect(auth.isLoading).toBe(false);
      expect(auth.user).toEqual({ id: 'u1', email: 'test@test.com' });
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
      const freshDb = new InstantSvelteDatabase(mockCore as any);

      let auth: any;
      const cleanup = $effect.root(() => {
        auth = freshDb.useAuth();
      });

      expect(auth.user).toEqual({
        id: 'cached',
        email: 'cached@test.com',
        refresh_token: '',
        isGuest: false,
      });
      cleanup();
    });

    it('handles auth error', async () => {
      let authCb: ((auth: any) => void) | undefined;
      mockCore.subscribeAuth.mockImplementation((cb: any) => {
        authCb = cb;
        return () => {};
      });

      let auth: any;
      const cleanup = $effect.root(() => {
        auth = db.useAuth();
      });
      await tick();

      authCb!({ error: { message: 'Auth failed' } });

      expect(auth.isLoading).toBe(false);
      expect(auth.error).toEqual({ message: 'Auth failed' });
      cleanup();
    });
  });

  describe('useConnectionStatus', () => {
    it('returns initial status', () => {
      let status: any;
      const cleanup = $effect.root(() => {
        status = db.useConnectionStatus();
      });

      expect(status.current).toBe('connecting');
      cleanup();
    });

    it('updates when connection status changes', async () => {
      let statusCb: ((status: any) => void) | undefined;
      mockCore.subscribeConnectionStatus.mockImplementation((cb: any) => {
        statusCb = cb;
        return () => {};
      });

      let status: any;
      const cleanup = $effect.root(() => {
        status = db.useConnectionStatus();
      });
      await tick();

      statusCb!('connected');

      expect(status.current).toBe('connected');
      cleanup();
    });
  });

  describe('useLocalId', () => {
    it('starts as null', () => {
      let localId: any;
      const cleanup = $effect.root(() => {
        localId = db.useLocalId('device');
      });

      expect(localId.current).toBeNull();
      cleanup();
    });

    it('loads the ID asynchronously', async () => {
      let localId: any;
      const cleanup = $effect.root(() => {
        localId = db.useLocalId('device');
      });
      await tick();

      await vi.waitFor(() => {
        expect(localId.current).toBe('local-id-device');
      });
      cleanup();
    });
  });

  describe('room', () => {
    it('creates a room handle', () => {
      const room = db.room('chat' as any, 'room-1');
      expect(room.type).toBe('chat');
      expect(room.id).toBe('room-1');
      expect(room.core).toBe(mockCore);
    });
  });
});
