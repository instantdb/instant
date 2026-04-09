import {
  type PresenceOpts,
  type PresenceResponse,
  type RoomSchemaShape,
  InstantCoreDatabase,
  InstantSchemaDef,
} from '@instantdb/core';

// ------
// Types

export type PresenceHandle<
  PresenceShape,
  Keys extends keyof PresenceShape,
> = PresenceResponse<PresenceShape, Keys> & {
  publishPresence: (data: Partial<PresenceShape>) => void;
};

export type TypingIndicatorOpts = {
  timeout?: number | null;
  stopOnEnter?: boolean;
  // Perf opt - `active` will always be an empty array
  writeOnly?: boolean;
};

export type TypingIndicatorHandle<PresenceShape> = {
  active: PresenceShape[];
  setActive(active: boolean): void;
  inputProps: {
    onKeyDown: (e: KeyboardEvent) => void;
    onBlur: () => void;
  };
};

export const defaultActivityStopTimeout = 1_000;

// ------
// Topics

/**
 * Listen for broadcasted events given a room and topic.
 *
 * @see https://instantdb.com/docs/presence-and-topics
 * @example
 *  const room = db.room('chats', roomId);
 *  db.rooms.useTopicEffect(room, 'emoji', (message, peer) => {
 *    console.log(peer.name, 'sent', message);
 *  });
 */
export function useTopicEffect<
  RoomSchema extends RoomSchemaShape,
  RoomType extends keyof RoomSchema,
  TopicType extends keyof RoomSchema[RoomType]['topics'],
>(
  room: InstantSvelteRoom<any, RoomSchema, RoomType>,
  topic: TopicType,
  onEvent: (
    event: RoomSchema[RoomType]['topics'][TopicType],
    peer: RoomSchema[RoomType]['presence'],
  ) => any,
): void {
  $effect(() => {
    const unsub = room.core._reactor.subscribeTopic(
      room.type,
      room.id,
      topic,
      (event: any, peer: any) => {
        onEvent(event, peer);
      },
    );

    return unsub;
  });
}

/**
 * Broadcast an event to a room.
 *
 * @see https://instantdb.com/docs/presence-and-topics
 * @example
 *  const room = db.room('chat', roomId);
 *  const publishTopic = db.rooms.usePublishTopic(room, 'emoji');
 *  publishTopic({ emoji: "🔥" });
 */
export function usePublishTopic<
  RoomSchema extends RoomSchemaShape,
  RoomType extends keyof RoomSchema,
  TopicType extends keyof RoomSchema[RoomType]['topics'],
>(
  room: InstantSvelteRoom<any, RoomSchema, RoomType>,
  topic: TopicType,
): (data: RoomSchema[RoomType]['topics'][TopicType]) => void {
  $effect(() => {
    const unsub = room.core._reactor.joinRoom(room.type as string, room.id);
    return unsub;
  });

  return (data: RoomSchema[RoomType]['topics'][TopicType]) => {
    room.core._reactor.publishTopic({
      roomType: room.type,
      roomId: room.id,
      topic,
      data,
    });
  };
}

// ---------
// Presence

/**
 * Listen for peer's presence data in a room, and publish the current user's presence.
 *
 * @see https://instantdb.com/docs/presence-and-topics
 * @example
 *  const room = db.room('chat', roomId);
 *  const presence = db.rooms.usePresence(room, { keys: ["name", "avatar"] });
 *  // presence.peers, presence.isLoading, presence.publishPresence
 */
export function usePresence<
  RoomSchema extends RoomSchemaShape,
  RoomType extends keyof RoomSchema,
  Keys extends keyof RoomSchema[RoomType]['presence'],
>(
  room: InstantSvelteRoom<any, RoomSchema, RoomType>,
  opts: PresenceOpts<RoomSchema[RoomType]['presence'], Keys> = {},
): PresenceHandle<RoomSchema[RoomType]['presence'], Keys> {
  const initial = (room.core._reactor.getPresence(room.type, room.id, opts) ?? {
    peers: {},
    isLoading: true,
  }) as PresenceResponse<RoomSchema[RoomType]['presence'], Keys>;

  let result: PresenceHandle<RoomSchema[RoomType]['presence'], Keys> = $state({
    ...initial,
    publishPresence: (data: Partial<RoomSchema[RoomType]['presence']>) => {
      room.core._reactor.publishPresence(room.type, room.id, data);
    },
  });

  $effect(() => {
    const unsub = room.core._reactor.subscribePresence(
      room.type,
      room.id,
      opts,
      (data: any) => {
        result.peers = data.peers;
        result.isLoading = data.isLoading;
        if ('user' in data) {
          (result as any).user = data.user;
        }
      },
    );

    return unsub;
  });

  return result;
}

/**
 * Publishes presence data to a room
 *
 * @see https://instantdb.com/docs/presence-and-topics
 * @example
 *  const room = db.room('chat', roomId);
 *  db.rooms.useSyncPresence(room, { nickname });
 */
export function useSyncPresence<
  RoomSchema extends RoomSchemaShape,
  RoomType extends keyof RoomSchema,
>(
  room: InstantSvelteRoom<any, RoomSchema, RoomType>,
  data: Partial<RoomSchema[RoomType]['presence']>,
  deps?: any[],
): void {
  $effect(() => {
    const unsub = room.core._reactor.joinRoom(
      room.type as string,
      room.id,
      data,
    );
    return unsub;
  });

  $effect(() => {
    if (deps) {
      // Track deps by reading them
      deps.forEach((d) => {
        if (typeof d === 'function') d();
      });
    } else {
      JSON.stringify(data);
    }
    room.core._reactor.publishPresence(room.type, room.id, data);
  });
}

// -----------------
// Typing Indicator

/**
 * Manage typing indicator state
 *
 * @see https://instantdb.com/docs/presence-and-topics
 * @example
 *  const room = db.room('chat', roomId);
 *  const typing = db.rooms.useTypingIndicator(room, 'chat-input');
 *  // typing.active, typing.setActive(bool), typing.inputProps
 */
export function useTypingIndicator<
  RoomSchema extends RoomSchemaShape,
  RoomType extends keyof RoomSchema,
>(
  room: InstantSvelteRoom<any, RoomSchema, RoomType>,
  inputName: string,
  opts: TypingIndicatorOpts = {},
): TypingIndicatorHandle<RoomSchema[RoomType]['presence']> {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;

  const presence = rooms.usePresence(room, {
    keys: [inputName] as (keyof RoomSchema[RoomType]['presence'])[],
  });

  let _active: RoomSchema[RoomType]['presence'][] = $state([]);

  $effect(() => {
    if (opts?.writeOnly) {
      _active = [];
      return;
    }
    // Read presence to track it
    const _peers = presence.peers;
    const presenceSnapshot = room.core._reactor.getPresence(room.type, room.id);
    _active = Object.values(presenceSnapshot?.peers ?? {}).filter(
      (p: any) => p[inputName] === true,
    );
  });

  const setActive = (isActive: boolean) => {
    room.core._reactor.publishPresence(room.type, room.id, {
      [inputName]: isActive ? true : null,
    } as Partial<RoomSchema[RoomType]['presence']>);

    if (timeoutId) {
      clearTimeout(timeoutId);
      timeoutId = null;
    }

    if (!isActive) return;

    if (opts?.timeout === null || opts?.timeout === 0) return;

    timeoutId = setTimeout(() => {
      room.core._reactor.publishPresence(room.type, room.id, {
        [inputName]: null,
      } as Partial<RoomSchema[RoomType]['presence']>);
    }, opts?.timeout ?? defaultActivityStopTimeout);
  };

  $effect(() => {
    return () => {
      if (timeoutId) {
        clearTimeout(timeoutId);
        timeoutId = null;
      }
      setActive(false);
    };
  });

  const onKeyDown = (e: KeyboardEvent) => {
    const isEnter = opts?.stopOnEnter && e.key === 'Enter';
    const isActive = !isEnter;
    setActive(isActive);
  };

  const onBlur = () => {
    setActive(false);
  };

  return {
    get active() {
      return _active;
    },
    setActive,
    inputProps: { onKeyDown, onBlur },
  };
}

// --------------
// Hooks namespace

export const rooms = {
  useTopicEffect,
  usePublishTopic,
  usePresence,
  useSyncPresence,
  useTypingIndicator,
};

// ------------
// Class

export class InstantSvelteRoom<
  Schema extends InstantSchemaDef<any, any, any>,
  RoomSchema extends RoomSchemaShape,
  RoomType extends keyof RoomSchema,
> {
  core: InstantCoreDatabase<Schema, boolean>;
  type: RoomType;
  id: string;

  constructor(
    core: InstantCoreDatabase<Schema, boolean>,
    type: RoomType,
    id: string,
  ) {
    this.core = core;
    this.type = type;
    this.id = id;
  }
}
