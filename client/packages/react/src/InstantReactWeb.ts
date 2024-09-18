import type { InstantGraph, RoomSchemaShape } from "@instantdb/core";
import { InstantReact } from "./InstantReact";

export class InstantReactWeb<
  Schema extends InstantGraph<any, any> | {} = {},
  RoomSchema extends RoomSchemaShape = {},
  WithCardinalityInference extends boolean = false,
> extends InstantReact<Schema, RoomSchema, WithCardinalityInference> {}
