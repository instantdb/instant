import { TxChunk } from "./instatx";
import { RoomSchemaShape } from "./presence";
import type { IContainEntitiesAndLinks, InstantSchemaDef } from "./schemaTypes";

export interface IDatabase<
  Schema extends IContainEntitiesAndLinks<any, any> | {} = {},
  _RoomSchema extends RoomSchemaShape = {},
  WithCardinalityInference extends boolean = false,
> {
  tx: TxChunk<
    Schema extends IContainEntitiesAndLinks<any, any>
      ? Schema
      : InstantSchemaDef<any, any, any>
  >;

  withCardinalityInference?: WithCardinalityInference;
}

export interface IInstantDatabase<
  Schema extends InstantSchemaDef<any, any, any>,
> {
  tx: TxChunk<Schema>;
}
