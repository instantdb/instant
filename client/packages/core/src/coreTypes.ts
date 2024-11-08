import { TxChunk } from "./instatx";
import { RoomSchemaShape } from "./presence";
import type { InstantGraph } from "./schemaTypes";

export interface IDatabase<
  Schema extends {},
  RoomSchema extends RoomSchemaShape = {},
> {
  tx: TxChunk<InstantGraph<any, any>>;
}

// ----------------
// XXX-EXPERIMENTAL
export interface IDatabaseExperimental<
  Schema extends InstantGraph<any, any, any>,
> {
  tx: TxChunk<Schema>;
}
