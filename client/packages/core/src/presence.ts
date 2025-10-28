import { pick } from './utils/pick.js';
import { areObjectsShallowEqual, areObjectKeysEqual } from './utils/object.js';

export type RoomSchemaShape = {
  [k: string]: {
    presence?: { [k: string]: any };
    topics?: {
      [k: string]: {
        [k: string]: any;
      };
    };
  };
};

export type PresenceOpts<PresenceShape, Keys extends keyof PresenceShape> = {
  user?: boolean;
  peers?: string[];
  keys?: Keys[];
  /**
   * If you haven't joined this room yet, initialPresence lets you set
   * the very first presence state for the user.
   */
  initialPresence?: Partial<PresenceShape>;

  /** @deprecated use `initialPresence` */
  initialData?: Partial<PresenceShape>;
};

type PresencePeer<PresenceShape, Keys extends keyof PresenceShape> = Pick<
  PresenceShape,
  Keys
> & {
  peerId: string;
};

export type PresenceSlice<PresenceShape, Keys extends keyof PresenceShape> = {
  user?: PresencePeer<PresenceShape, Keys>;
  peers: {
    [peerId: string]: PresencePeer<PresenceShape, Keys>;
  };
};

export type PresenceResponse<
  PresenceShape,
  Keys extends keyof PresenceShape,
> = PresenceSlice<PresenceShape, Keys> & {
  isLoading: boolean;
  error?: string;
};

export function buildPresenceSlice<
  PresenceShape,
  Keys extends keyof PresenceShape,
>(
  data: {
    user?: PresenceShape;
    peers: Record<string, PresenceShape>;
  },
  opts: PresenceOpts<PresenceShape, Keys>,
  userPeerId: string,
): PresenceSlice<PresenceShape, Keys> {
  const slice: PresenceSlice<PresenceShape, Keys> = {
    peers: {},
  };

  const includeUser = opts && 'user' in opts ? opts.user : true;

  if (includeUser) {
    const user = pick(data.user ?? {}, opts?.keys);
    slice.user = { ...user, peerId: userPeerId };
  }

  for (const id of Object.keys(data.peers ?? {})) {
    const shouldIncludeAllPeers = opts?.peers === undefined;
    const isPeerIncluded =
      Array.isArray(opts?.peers) && opts?.peers.includes(id);

    if (shouldIncludeAllPeers || isPeerIncluded) {
      const peer = pick(data.peers[id], opts?.keys);
      slice.peers[id] = { ...peer, peerId: id };
    }
  }

  return slice;
}

/**
 * Compare two presence slices
 * 0. compare isLoading and error
 * 1. shallow compare user
 * 2. compare peers keys
 * 3. shallow compare each peer
 */
export function hasPresenceResponseChanged<
  PresenceShape,
  Keys extends keyof PresenceShape,
>(
  a: PresenceResponse<PresenceShape, Keys>,
  b: PresenceResponse<PresenceShape, Keys>,
) {
  if (a.isLoading !== b.isLoading) return true;
  if (a.error !== b.error) return true;

  if (a.user || b.user) {
    if (!a.user || !b.user) return true;

    const same = areObjectsShallowEqual(a.user, b.user);

    if (!same) return true;
  }

  const sameKeys = areObjectKeysEqual(a.peers, b.peers);

  if (!sameKeys) return true;

  for (const id of Object.keys(a.peers)) {
    const same = areObjectsShallowEqual(a.peers[id], b.peers[id]);

    if (!same) return true;
  }

  return false;
}
