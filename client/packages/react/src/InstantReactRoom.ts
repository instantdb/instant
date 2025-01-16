import {
  // types
  type PresenceOpts,
  type PresenceResponse,
  type RoomSchemaShape,
  InstantCoreDatabase,
  InstantSchemaDef,
} from "@instantdb/core";

import {
  KeyboardEvent,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

import { useTimeout } from "./useTimeout";

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

function useTopicEffect<
  RoomSchema extends RoomSchemaShape,
  RoomType extends keyof RoomSchema,
  TopicType extends keyof RoomSchema[RoomType]["topics"],
>(
  room: InstantReactRoom<any, RoomSchema, RoomType>,
  topic: TopicType,
  onEvent: (
    event: RoomSchema[RoomType]["topics"][TopicType],
    peer: RoomSchema[RoomType]["presence"],
  ) => any,
): void {
  useEffect(() => {
    const unsub = room._core._reactor.subscribeTopic(
      room.id,
      topic,
      (event, peer) => {
        onEvent(event, peer);
      },
    );

    return unsub;
  }, [room.id, topic]);
}

function usePublishTopic<
  RoomSchema extends RoomSchemaShape,
  RoomType extends keyof RoomSchema,
  TopicType extends keyof RoomSchema[RoomType]["topics"],
>(
  room: InstantReactRoom<any, RoomSchema, RoomType>,
  topic: TopicType,
): (data: RoomSchema[RoomType]["topics"][TopicType]) => void {
  useEffect(() => room._core._reactor.joinRoom(room.id), [room.id]);

  const publishTopic = useCallback(
    (data) => {
      room._core._reactor.publishTopic({
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

function usePresence<
  RoomSchema extends RoomSchemaShape,
  RoomType extends keyof RoomSchema,
  Keys extends keyof RoomSchema[RoomType]["presence"],
>(
  room: InstantReactRoom<any, RoomSchema, RoomType>,
  opts: PresenceOpts<RoomSchema[RoomType]["presence"], Keys> = {},
): PresenceHandle<RoomSchema[RoomType]["presence"], Keys> {
  const [state, setState] = useState<
    PresenceResponse<RoomSchema[RoomType]["presence"], Keys>
  >(() => {
    return (
      room._core._reactor.getPresence(room.type, room.id, opts) ?? {
        peers: {},
        isLoading: true,
      }
    );
  });

  useEffect(() => {
    const unsub = room._core._reactor.subscribePresence(
      room.type,
      room.id,
      opts,
      (data) => {
        setState(data);
      },
    );

    return unsub;
  }, [room.id, opts.user, opts.peers?.join(), opts.keys?.join()]);

  return {
    ...state,
    publishPresence: (data) => {
      room._core._reactor.publishPresence(room.type, room.id, data);
    },
  };
}

function useSyncPresence<
  RoomSchema extends RoomSchemaShape,
  RoomType extends keyof RoomSchema,
>(
  room: InstantReactRoom<any, RoomSchema, RoomType>,
  data: Partial<RoomSchema[RoomType]["presence"]>,
  deps?: any[],
): void {
  useEffect(() => room._core._reactor.joinRoom(room.id), [room.id]);
  useEffect(() => {
    return room._core._reactor.publishPresence(room.type, room.id, data);
  }, [room.type, room.id, deps ?? JSON.stringify(data)]);
}

// -----------------
// Typing Indicator

function useTypingIndicator<
  RoomSchema extends RoomSchemaShape,
  RoomType extends keyof RoomSchema,
>(
  room: InstantReactRoom<any, RoomSchema, RoomType>,
  inputName: string,
  opts: TypingIndicatorOpts = {},
): TypingIndicatorHandle<RoomSchema[RoomType]["presence"]> {
  const timeout = useTimeout();

  const onservedPresence = rooms.usePresence(room, {
    keys: [inputName],
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
  }, [opts?.writeOnly, onservedPresence]);

  const setActive = (isActive: boolean) => {
    room._core._reactor.publishPresence(room.type, room.id, {
      [inputName]: isActive,
    } as unknown as Partial<RoomSchema[RoomType]>);

    if (!isActive) return;

    if (opts?.timeout === null || opts?.timeout === 0) return;

    timeout.set(opts?.timeout ?? defaultActivityStopTimeout, () => {
      room._core._reactor.publishPresence(room.type, room.id, {
        [inputName]: null,
      } as Partial<RoomSchema[RoomType]>);
    });
  };

  return {
    active,
    setActive: (a: boolean) => {
      setActive(a);
    },
    inputProps: {
      onKeyDown: (e: KeyboardEvent) => {
        const isEnter = opts?.stopOnEnter && e.key === "Enter";
        const isActive = !isEnter;

        setActive(isActive);
      },
      onBlur: () => {
        setActive(false);
      },
    },
  };
}

// --------------
// Hooks

const rooms = {
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
  _core: InstantCoreDatabase<Schema>;
  type: RoomType;
  id: string;

  constructor(_core: InstantCoreDatabase<Schema>, type: RoomType, id: string) {
    this._core = _core;
    this.type = type;
    this.id = id;
  }

  /**
   * Listen for broadcasted events given a room and topic.
   *
   * @see https://instantdb.com/docs/presence-and-topics
   * @example
   *  function App({ roomId }) {
   *    db.room(roomType, roomId).useTopicEffect("chat", (message, peer) => {
   *      console.log("New message", message, 'from', peer.name);
   *    });
   *
   *    // ...
   *  }
   */
  useTopicEffect = <TopicType extends keyof RoomSchema[RoomType]["topics"]>(
    topic: TopicType,
    onEvent: (
      event: RoomSchema[RoomType]["topics"][TopicType],
      peer: RoomSchema[RoomType]["presence"],
    ) => any,
  ): void => {
    rooms.useTopicEffect(this, topic, onEvent);
  };

  /**
   * Broadcast an event to a room.
   *
   * @see https://instantdb.com/docs/presence-and-topics
   * @example
   * function App({ roomId }) {
   *   const publishTopic = db.room(roomType, roomId).usePublishTopic("clicks");
   *
   *   return (
   *     <button onClick={() => publishTopic({ ts: Date.now() })}>Click me</button>
   *   );
   * }
   *
   */
  usePublishTopic = <Topic extends keyof RoomSchema[RoomType]["topics"]>(
    topic: Topic,
  ): ((data: RoomSchema[RoomType]["topics"][Topic]) => void) => {
    return rooms.usePublishTopic(this, topic);
  };

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
  usePresence = <Keys extends keyof RoomSchema[RoomType]["presence"]>(
    opts: PresenceOpts<RoomSchema[RoomType]["presence"], Keys> = {},
  ): PresenceHandle<RoomSchema[RoomType]["presence"], Keys> => {
    return rooms.usePresence(this, opts);
  };

  /**
   * Publishes presence data to a room
   *
   * @see https://instantdb.com/docs/presence-and-topics
   * @example
   *  function App({ roomId }) {
   *    db.room(roomType, roomId).useSyncPresence({ name, avatar, color });
   *
   *    // ...
   *  }
   */
  useSyncPresence = (
    data: Partial<RoomSchema[RoomType]["presence"]>,
    deps?: any[],
  ): void => {
    return rooms.useSyncPresence(this, data, deps);
  };

  /**
   * Manage typing indicator state
   *
   * @see https://instantdb.com/docs/presence-and-topics
   * @example
   *  function App({ roomId }) {
   *    const {
   *      active,
   *      setActive,
   *      inputProps,
   *    } = db.room(roomType, roomId).useTypingIndicator("chat-input", opts);
   *
   *    return <input {...inputProps} />;
   *  }
   */
  useTypingIndicator = (
    inputName: string,
    opts: TypingIndicatorOpts = {},
  ): TypingIndicatorHandle<RoomSchema[RoomType]["presence"]> => {
    return rooms.useTypingIndicator(this, inputName, opts);
  };
}
