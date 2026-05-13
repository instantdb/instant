import {
  type PresenceOpts,
  type PresenceResponse,
  type RoomSchemaShape,
  InstantCoreDatabase,
  InstantSchemaDef,
} from '@instantdb/core';

import { shallowRef, watchEffect, toValue } from 'vue';
import type { Ref, ShallowRef, MaybeRefOrGetter, ComputedRef } from 'vue';

import { tryOnScopeDispose } from './utils.js';

// ------
// Types

export type PresenceHandle<PresenceShape, Keys extends keyof PresenceShape> = {
  [K in keyof PresenceResponse<PresenceShape, Keys>]: ShallowRef<
    PresenceResponse<PresenceShape, Keys>[K]
  >;
} & {
  publishPresence: (data: Partial<PresenceShape>) => void;
};

export type TypingIndicatorOpts = {
  timeout?: number | null;
  stopOnEnter?: boolean;
  // Perf opt - `active` will always be an empty array
  writeOnly?: boolean;
};

export type TypingIndicatorHandle<PresenceShape> = {
  active: Ref<PresenceShape[]>;
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
  room: InstantVueRoom<any, RoomSchema, RoomType>,
  topic: TopicType,
  onEvent: (
    event: RoomSchema[RoomType]['topics'][TopicType],
    peer: RoomSchema[RoomType]['presence'],
  ) => any,
): void {
  watchEffect((onCleanup) => {
    const type = toValue(room.type);
    const id = toValue(room.id);
    const unsub = room.core._reactor.subscribeTopic(
      type,
      id,
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
 *  const room = db.room('chat', roomId);
 *  const publishTopic = db.rooms.usePublishTopic(room, 'emoji');
 *  publishTopic({ emoji: "🔥" });
 */
export function usePublishTopic<
  RoomSchema extends RoomSchemaShape,
  RoomType extends keyof RoomSchema,
  TopicType extends keyof RoomSchema[RoomType]['topics'],
>(
  room: InstantVueRoom<any, RoomSchema, RoomType>,
  topic: TopicType,
): (data: RoomSchema[RoomType]['topics'][TopicType]) => void {
  watchEffect((onCleanup) => {
    const type = toValue(room.type) as string;
    const id = toValue(room.id);
    const unsub = room.core._reactor.joinRoom(type, id);
    onCleanup(unsub);
  });

  return (data: RoomSchema[RoomType]['topics'][TopicType]) => {
    room.core._reactor.publishTopic({
      roomType: toValue(room.type),
      roomId: toValue(room.id),
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
 *  const { peers, isLoading, publishPresence } = db.rooms.usePresence(room, { keys: ["name", "avatar"] });
 */
export function usePresence<
  RoomSchema extends RoomSchemaShape,
  RoomType extends keyof RoomSchema,
  Keys extends keyof RoomSchema[RoomType]['presence'],
>(
  room: InstantVueRoom<any, RoomSchema, RoomType>,
  opts: PresenceOpts<RoomSchema[RoomType]['presence'], Keys> = {},
): PresenceHandle<RoomSchema[RoomType]['presence'], Keys> {
  const initial = (room.core._reactor.getPresence(
    toValue(room.type),
    toValue(room.id),
    opts,
  ) ?? {
    peers: {},
    isLoading: true,
  }) as PresenceResponse<RoomSchema[RoomType]['presence'], Keys>;

  const peers = shallowRef(initial.peers);
  const isLoading = shallowRef(initial.isLoading);
  const user = shallowRef<any>((initial as any).user);
  const error = shallowRef<any>((initial as any).error);

  watchEffect((onCleanup) => {
    const type = toValue(room.type);
    const id = toValue(room.id);
    const unsub = room.core._reactor.subscribePresence(
      type,
      id,
      opts,
      (data: any) => {
        peers.value = data.peers;
        isLoading.value = data.isLoading;
        if ('user' in data) user.value = data.user;
        if ('error' in data) error.value = data.error;
      },
    );
    onCleanup(unsub);
  });

  return {
    peers,
    isLoading,
    user,
    error,
    publishPresence: (data: Partial<RoomSchema[RoomType]['presence']>) => {
      room.core._reactor.publishPresence(
        toValue(room.type),
        toValue(room.id),
        data,
      );
    },
  } as PresenceHandle<RoomSchema[RoomType]['presence'], Keys>;
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
  room: InstantVueRoom<any, RoomSchema, RoomType>,
  data: MaybeRefOrGetter<Partial<RoomSchema[RoomType]['presence']>>,
): void {
  watchEffect((onCleanup) => {
    const type = toValue(room.type) as string;
    const id = toValue(room.id);
    const unsub = room.core._reactor.joinRoom(type, id, toValue(data));
    onCleanup(unsub);
  });

  watchEffect(() => {
    room.core._reactor.publishPresence(
      toValue(room.type),
      toValue(room.id),
      toValue(data),
    );
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
 *  // typing.active.value, typing.setActive(bool), typing.inputProps
 */
export function useTypingIndicator<
  RoomSchema extends RoomSchemaShape,
  RoomType extends keyof RoomSchema,
>(
  room: InstantVueRoom<any, RoomSchema, RoomType>,
  inputName: string,
  opts: TypingIndicatorOpts = {},
): TypingIndicatorHandle<RoomSchema[RoomType]['presence']> {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;

  const presence = usePresence(room, {
    keys: [inputName] as (keyof RoomSchema[RoomType]['presence'])[],
  });

  const active = shallowRef<RoomSchema[RoomType]['presence'][]>([]);

  watchEffect(() => {
    if (opts?.writeOnly) {
      active.value = [];
      return;
    }
    // Track peers so we re-run when presence updates
    presence.peers.value;
    const snapshot = room.core._reactor.getPresence(
      toValue(room.type),
      toValue(room.id),
    );
    active.value = Object.values(snapshot?.peers ?? {}).filter(
      (p: any) => p[inputName] === true,
    );
  });

  const setActive = (isActive: boolean) => {
    room.core._reactor.publishPresence(toValue(room.type), toValue(room.id), {
      [inputName]: isActive ? true : null,
    } as Partial<RoomSchema[RoomType]['presence']>);

    if (timeoutId) {
      clearTimeout(timeoutId);
      timeoutId = null;
    }

    if (!isActive) return;
    if (opts?.timeout === null || opts?.timeout === 0) return;

    timeoutId = setTimeout(() => {
      room.core._reactor.publishPresence(toValue(room.type), toValue(room.id), {
        [inputName]: null,
      } as Partial<RoomSchema[RoomType]['presence']>);
    }, opts?.timeout ?? defaultActivityStopTimeout);
  };

  tryOnScopeDispose(() => {
    if (timeoutId) {
      clearTimeout(timeoutId);
      timeoutId = null;
    }
    // Clear sticky typing state on unmount, even when timeout is disabled.
    setActive(false);
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

export class InstantVueRoom<
  Schema extends InstantSchemaDef<any, any, any>,
  RoomSchema extends RoomSchemaShape,
  RoomType extends keyof RoomSchema,
> {
  core: InstantCoreDatabase<Schema, boolean>;
  type: ComputedRef<RoomType> | RoomType;
  id: ComputedRef<string> | string;

  constructor(
    core: InstantCoreDatabase<Schema, boolean>,
    type: ComputedRef<RoomType> | RoomType,
    id: ComputedRef<string> | string,
  ) {
    this.core = core;
    this.type = type;
    this.id = id;
  }
}
