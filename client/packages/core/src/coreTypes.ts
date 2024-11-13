import { TxChunk } from "./instatx";
import { RoomSchemaShape } from "./presence";
import type { InstantGraph, DoNotUseInstantSchema } from "./schemaTypes";

export interface IDatabase<
  Schema extends InstantGraph<any, any> | {} = {},
  RoomSchema extends RoomSchemaShape = {},
  WithCardinalityInference extends boolean = false,
> {
  tx: TxChunk<
    Schema extends InstantGraph<any, any> ? Schema : InstantGraph<any, any>
  >;

  withCardinalityInference?: WithCardinalityInference;
}

export interface IDoNotUseDatabase<
  Schema extends DoNotUseInstantSchema<any, any, any>,
> {
  tx: TxChunk<Schema>;
}
