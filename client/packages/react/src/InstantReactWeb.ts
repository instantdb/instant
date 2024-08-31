import { i, RoomSchemaShape } from "@instantdb/core";
import { InstantReact } from "./InstantReact";

export class InstantReactWeb<
  Schema extends i.InstantGraph<any, any> | {} = {},
  RoomSchema extends RoomSchemaShape = {},
  WithCardinalityInference extends boolean = false,
> extends InstantReact<Schema, RoomSchema, WithCardinalityInference> {}
