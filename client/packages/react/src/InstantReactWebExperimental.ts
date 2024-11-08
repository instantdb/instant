import type { InstantGraph, RoomSchemaShape } from "@instantdb/core";
import { InstantReactExperimental } from "./InstantReactExperimental";

export class InstantReactWebExperimental<
  Schema extends InstantGraph<any, any>
> extends InstantReactExperimental<Schema> {}
