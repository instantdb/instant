// Presence Utility Types
// ---------------------

import type { Expand } from './queryTypes.ts';
import type { EntityDef, ResolveEntityAttrs, RoomsDef } from './schemaTypes.ts';

type ExtractPresenceAttrs<PresenceEntity> =
  PresenceEntity extends EntityDef<any, any, any>
    ? ResolveEntityAttrs<PresenceEntity>
    : never;

export type PresencePeer<
  Schema extends { rooms: RoomsDef },
  RoomType extends Extract<keyof Schema['rooms'], string>,
> = Expand<
  ExtractPresenceAttrs<Schema['rooms'][RoomType]['presence']> & {
    peerId: string;
  }
>;
