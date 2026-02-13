import {
  type PresenceOpts,
  type PresenceResponse,
  type RoomSchemaShape,
  InstantCoreDatabase,
  InstantSchemaDef,
} from '@instantdb/core';

import { createSignal, createEffect, onCleanup, createMemo } from 'solid-js';
import type { Accessor } from 'solid-js';

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
  active: Accessor<PresenceShape[]>;
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
 *  function App({ roomId }) {
 *    const room = db.room('chats', roomId);
 *    db.rooms.useTopicEffect(room, 'emoji', (message, peer) => {
 *      console.log(peer.name, 'sent', message);
 *    });
 *    // ...
 *  }
 */
export function useTopicEffect<
  RoomSchema extends RoomSchemaShape,
  RoomType extends keyof RoomSchema,
  TopicType extends keyof RoomSchema[RoomType]['topics'],
>(
  room: InstantSolidRoom<any, RoomSchema, RoomType>,
  topic: TopicType,
  onEvent: (
    event: RoomSchema[RoomType]['topics'][TopicType],
    peer: RoomSchema[RoomType]['presence'],
  ) => any,
): void {
  createEffect(() => {
    const unsub = room.core._reactor.subscribeTopic(
      room.type,
      room.id,
      topic,
      (event: any, peer: any) => {
        onEvent(event, peer);
      },
    );

    onCleanup(unsub);
  });
}

/**
 * Broadcast an event to a room.
 *
 * @see https://instantdb.com/docs/presence-and-topics
 * @example
 * function App({ roomId }) {
 *   const room = db.room('chat', roomId);
 *   const publishTopic = db.rooms.usePublishTopic(room, "emoji");
 *
 *   return (
 *     <button onClick={() => publishTopic({ emoji: "🔥" })}>Send emoji</button>
 *   );
 * }
 *
 */
export function usePublishTopic<
  RoomSchema extends RoomSchemaShape,
  RoomType extends keyof RoomSchema,
  TopicType extends keyof RoomSchema[RoomType]['topics'],
>(
  room: InstantSolidRoom<any, RoomSchema, RoomType>,
  topic: TopicType,
): (data: RoomSchema[RoomType]['topics'][TopicType]) => void {
  createEffect(() => {
    const unsub = room.core._reactor.joinRoom(room.type as string, room.id);
    onCleanup(unsub);
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
 *  function App({ roomId }) {
 *    const presence = db.rooms.usePresence(room, { keys: ["name", "avatar"] });
 *    // presence().peers, presence().isLoading, presence().publishPresence
 *  }
 */
export function usePresence<
  RoomSchema extends RoomSchemaShape,
  RoomType extends keyof RoomSchema,
  Keys extends keyof RoomSchema[RoomType]['presence'],
>(
  room: InstantSolidRoom<any, RoomSchema, RoomType>,
  opts: PresenceOpts<RoomSchema[RoomType]['presence'], Keys> = {},
): Accessor<PresenceHandle<RoomSchema[RoomType]['presence'], Keys>> {
  const [state, setState] = createSignal<
    PresenceResponse<RoomSchema[RoomType]['presence'], Keys>
  >(
    (room.core._reactor.getPresence(room.type, room.id, opts) ?? {
      peers: {},
      isLoading: true,
    }) as PresenceResponse<RoomSchema[RoomType]['presence'], Keys>,
  );

  createEffect(() => {
    const unsub = room.core._reactor.subscribePresence(
      room.type,
      room.id,
      opts,
      (data: any) => {
        setState(data);
      },
    );

    onCleanup(unsub);
  });

  const publishPresence = (data: Partial<RoomSchema[RoomType]['presence']>) => {
    room.core._reactor.publishPresence(room.type, room.id, data);
  };

  return createMemo(() => ({
    ...state(),
    publishPresence,
  }));
}

/**
 * Publishes presence data to a room
 *
 * @see https://instantdb.com/docs/presence-and-topics
 * @example
 *  function App({ roomId, nickname }) {
 *    const room = db.room('chat', roomId);
 *    db.rooms.useSyncPresence(room, { nickname });
 *  }
 */
export function useSyncPresence<
  RoomSchema extends RoomSchemaShape,
  RoomType extends keyof RoomSchema,
>(
  room: InstantSolidRoom<any, RoomSchema, RoomType>,
  data: Partial<RoomSchema[RoomType]['presence']>,
  deps?: any[],
): void {
  createEffect(() => {
    const unsub = room.core._reactor.joinRoom(
      room.type as string,
      room.id,
      data,
    );
    onCleanup(unsub);
  });

  createEffect(() => {
    // Track deps if provided, otherwise track serialized data
    if (deps) {
      deps.forEach((d) => (typeof d === 'function' ? d() : d));
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
 *  function App({ roomId }) {
 *    const room = db.room('chat', roomId);
 *    const typing = db.rooms.useTypingIndicator(room, "chat-input");
 *    // typing.active(), typing.setActive(bool), typing.inputProps
 *  }
 */
export function useTypingIndicator<
  RoomSchema extends RoomSchemaShape,
  RoomType extends keyof RoomSchema,
>(
  room: InstantSolidRoom<any, RoomSchema, RoomType>,
  inputName: string,
  opts: TypingIndicatorOpts = {},
): TypingIndicatorHandle<RoomSchema[RoomType]['presence']> {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;

  onCleanup(() => {
    if (!timeoutId) return;
    clearTimeout(timeoutId);
    timeoutId = null;
  });

  const presence = rooms.usePresence(room, {
    keys: [inputName] as (keyof RoomSchema[RoomType]['presence'])[],
  });

  const active = createMemo(() => {
    if (opts?.writeOnly) return [];
    // Access presence to track it
    presence();
    const presenceSnapshot = room.core._reactor.getPresence(room.type, room.id);
    return Object.values(presenceSnapshot?.peers ?? {}).filter(
      (p: any) => p[inputName] === true,
    );
  });

  const setActive = (isActive: boolean) => {
    room.core._reactor.publishPresence(room.type, room.id, {
      [inputName]: isActive,
    } as unknown as Partial<RoomSchema[RoomType]['presence']>);

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

  const onKeyDown = (e: KeyboardEvent) => {
    const isEnter = opts?.stopOnEnter && e.key === 'Enter';
    const isActive = !isEnter;
    setActive(isActive);
  };

  const onBlur = () => {
    setActive(false);
  };

  return {
    active,
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

export class InstantSolidRoom<
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
