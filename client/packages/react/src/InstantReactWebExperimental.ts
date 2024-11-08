// XXX-EXPERIMENTAL
import type { InstantGraph, RoomSchemaShape } from "@instantdb/core";
import { InstantReactExperimental } from "./InstantReactExperimental";

export class InstantReactWebExperimental<
  Schema extends InstantGraph<any, any> | {} = {},
  RoomSchema extends RoomSchemaShape = {},
  WithCardinalityInference extends boolean = false,
> extends InstantReactExperimental<Schema, RoomSchema, WithCardinalityInference> {}
