import {
  // types
  type PresenceOpts,
  type PresenceResponse,
  type RoomSchemaShape,
  InstantCoreDatabase,
  InstantSchemaDef,
} from '@instantdb/core';

import {
  KeyboardEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import { useTimeout } from './useTimeout.ts';

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
  room: InstantReactRoom<any, RoomSchema, RoomType>,
  topic: TopicType,
  onEvent: (
    event: RoomSchema[RoomType]['topics'][TopicType],
    peer: RoomSchema[RoomType]['presence'],
  ) => any,
): void {
  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;

  useEffect(() => {
    const unsub = room.core._reactor.subscribeTopic(
      room.id,
      topic,
      (event, peer) => {
        onEventRef.current(event, peer);
      },
    );

    return unsub;
  }, [room.id, topic]);
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
  room: InstantReactRoom<any, RoomSchema, RoomType>,
  topic: TopicType,
): (data: RoomSchema[RoomType]['topics'][TopicType]) => void {
  useEffect(() => room.core._reactor.joinRoom(room.id), [room.id]);

  const publishTopic = useCallback(
    (data) => {
      room.core._reactor.publishTopic({
        roomType: room.type,
        roomId: room.id,
        topic,
        data,
      });
    },
    [room.id, topic],
  );

  return publishTopic;
}

// ---------
// Presence

/**
 * Listen for peer's presence data in a room, and publish the current user's presence.
 *
 * @see https://instantdb.com/docs/presence-and-topics
 * @example
 *  function App({ roomId }) {
 *    const {
 *      peers,
 *      publishPresence
 *    } = db.room(roomType, roomId).usePresence({ keys: ["name", "avatar"] });
 *
 *    // ...
 *  }
 */
export function usePresence<
  RoomSchema extends RoomSchemaShape,
  RoomType extends keyof RoomSchema,
  Keys extends keyof RoomSchema[RoomType]['presence'],
>(
  room: InstantReactRoom<any, RoomSchema, RoomType>,
  opts: PresenceOpts<RoomSchema[RoomType]['presence'], Keys> = {},
): PresenceHandle<RoomSchema[RoomType]['presence'], Keys> {
  const [state, setState] = useState<
    PresenceResponse<RoomSchema[RoomType]['presence'], Keys>
  >(() => {
    return (
      room.core._reactor.getPresence(room.type, room.id, opts) ?? {
        peers: {},
        isLoading: true,
      }
    );
  });

  useEffect(() => {
    const unsub = room.core._reactor.subscribePresence(
      room.type,
      room.id,
      opts,
      (data) => {
        setState(data);
      },
    );

    return unsub;
  }, [room.id, opts.user, opts.peers?.join(), opts.keys?.join()]);

  const publishPresence = useCallback(
    (data) => {
      room.core._reactor.publishPresence(room.type, room.id, data);
    },
    [room.type, room.id],
  );
  const ret = useMemo(() => {
    return {
      ...state,
      publishPresence,
    };
  }, [state, publishPresence]);
  return ret;
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
  room: InstantReactRoom<any, RoomSchema, RoomType>,
  data: Partial<RoomSchema[RoomType]['presence']>,
  deps?: any[],
): void {
  useEffect(() => room.core._reactor.joinRoom(room.id, data), [room.id]);
  useEffect(() => {
    return room.core._reactor.publishPresence(room.type, room.id, data);
  }, [room.type, room.id, deps ?? JSON.stringify(data)]);
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
 *    const {
 *      active,
 *      setActive,
 *      inputProps,
 *    } = db.rooms.useTypingIndicator(room, "chat-input");
 *
 *    return <input {...inputProps} />;
 *  }
 */
export function useTypingIndicator<
  RoomSchema extends RoomSchemaShape,
  RoomType extends keyof RoomSchema,
>(
  room: InstantReactRoom<any, RoomSchema, RoomType>,
  inputName: string,
  opts: TypingIndicatorOpts = {},
): TypingIndicatorHandle<RoomSchema[RoomType]['presence']> {
  const timeout = useTimeout();

  const observedPresence = rooms.usePresence(room, {
    keys: [inputName] as (keyof RoomSchema[RoomType]['presence'])[],
  });

  const active = useMemo(() => {
    const presenceSnapshot = room._core._reactor.getPresence(
      room.type,
      room.id,
    );

    return opts?.writeOnly
      ? []
      : Object.values(presenceSnapshot?.peers ?? {}).filter(
          (p) => p[inputName] === true,
        );
  }, [opts?.writeOnly, observedPresence]);

  const setActive = useCallback(
    (isActive: boolean) => {
      room.core._reactor.publishPresence(room.type, room.id, {
        [inputName]: isActive,
      } as unknown as Partial<RoomSchema[RoomType]>);

      if (!isActive) return;

      if (opts?.timeout === null || opts?.timeout === 0) return;

      timeout.set(opts?.timeout ?? defaultActivityStopTimeout, () => {
        room.core._reactor.publishPresence(room.type, room.id, {
          [inputName]: null,
        } as Partial<RoomSchema[RoomType]>);
      });
    },
    [room.type, room.id, inputName, opts?.timeout, timeout],
  );
  const onKeyDown = useCallback(
    (e: KeyboardEvent) => {
      const isEnter = opts?.stopOnEnter && e.key === 'Enter';
      const isActive = !isEnter;

      setActive(isActive);
    },
    [opts.stopOnEnter, setActive],
  );
  const onBlur = useCallback(() => {
    setActive(false);
  }, [setActive]);

  const inputProps = useMemo(() => {
    return { onKeyDown, onBlur };
  }, [onKeyDown, onBlur]);

  return {
    active,
    setActive,
    inputProps,
  };
}

// --------------
// Hooks

export const rooms = {
  useTopicEffect,
  usePublishTopic,
  usePresence,
  useSyncPresence,
  useTypingIndicator,
};

// ------------
// Class

export class InstantReactRoom<
  Schema extends InstantSchemaDef<any, any, any>,
  RoomSchema extends RoomSchemaShape,
  RoomType extends keyof RoomSchema,
> {
  core: InstantCoreDatabase<Schema, boolean>;
  /** @deprecated use `core` instead */
  _core: InstantCoreDatabase<Schema, boolean>;
  type: RoomType;
  id: string;

  constructor(
    core: InstantCoreDatabase<Schema, boolean>,
    type: RoomType,
    id: string,
  ) {
    this.core = core;
    this._core = this.core;
    this.type = type;
    this.id = id;
  }

  /**
   * @deprecated
   * `db.room(...).useTopicEffect` is deprecated. You can replace it with `db.rooms.useTopicEffect`.
   *
   * @example
   *
   * // Before
   * const room = db.room('chat', 'room-id');
   * room.useTopicEffect('emoji', (message, peer) => {  });
   *
   * // After
   * const room = db.room('chat', 'room-id');
   * db.rooms.useTopicEffect(room, 'emoji', (message, peer) => {  });
   */
  useTopicEffect = <TopicType extends keyof RoomSchema[RoomType]['topics']>(
    topic: TopicType,
    onEvent: (
      event: RoomSchema[RoomType]['topics'][TopicType],
      peer: RoomSchema[RoomType]['presence'],
    ) => any,
  ): void => {
    rooms.useTopicEffect(this, topic, onEvent);
  };

  /**
   * @deprecated
   * `db.room(...).usePublishTopic` is deprecated. You can replace it with `db.rooms.usePublishTopic`.
   *
   * @example
   *
   * // Before
   * const room = db.room('chat', 'room-id');
   * const publish = room.usePublishTopic('emoji');
   *
   * // After
   * const room = db.room('chat', 'room-id');
   * const publish = db.rooms.usePublishTopic(room, 'emoji');
   */
  usePublishTopic = <Topic extends keyof RoomSchema[RoomType]['topics']>(
    topic: Topic,
  ): ((data: RoomSchema[RoomType]['topics'][Topic]) => void) => {
    return rooms.usePublishTopic(this, topic);
  };

  /**
   * @deprecated
   * `db.room(...).usePresence` is deprecated. You can replace it with `db.rooms.usePresence`.
   *
   * @example
   *
   * // Before
   * const room = db.room('chat', 'room-id');
   * const { peers } = room.usePresence({ keys: ["name", "avatar"] });
   *
   * // After
   * const room = db.room('chat', 'room-id');
   * const { peers } = db.rooms.usePresence(room, { keys: ["name", "avatar"] });
   */
  usePresence = <Keys extends keyof RoomSchema[RoomType]['presence']>(
    opts: PresenceOpts<RoomSchema[RoomType]['presence'], Keys> = {},
  ): PresenceHandle<RoomSchema[RoomType]['presence'], Keys> => {
    return rooms.usePresence(this, opts);
  };

  /**
   * @deprecated
   * `db.room(...).useSyncPresence` is deprecated. You can replace it with `db.rooms.useSyncPresence`.
   *
   * @example
   *
   * // Before
   * const room = db.room('chat', 'room-id');
   * room.useSyncPresence(room, { nickname });
   *
   * // After
   * const room = db.room('chat', 'room-id');
   * db.rooms.useSyncPresence(room, { nickname });
   */
  useSyncPresence = (
    data: Partial<RoomSchema[RoomType]['presence']>,
    deps?: any[],
  ): void => {
    return rooms.useSyncPresence(this, data, deps);
  };

  /**
   * @deprecated
   * `db.room(...).useTypingIndicator` is deprecated. You can replace it with `db.rooms.useTypingIndicator`.
   *
   * @example
   *
   * // Before
   * const room = db.room('chat', 'room-id');
   * const typing = room.useTypingIndiactor(room, 'chat-input');
   *
   * // After
   * const room = db.room('chat', 'room-id');
   * const typing = db.rooms.useTypingIndiactor(room, 'chat-input');
   */
  useTypingIndicator = (
    inputName: string,
    opts: TypingIndicatorOpts = {},
  ): TypingIndicatorHandle<RoomSchema[RoomType]['presence']> => {
    return rooms.useTypingIndicator(this, inputName, opts);
  };
}
