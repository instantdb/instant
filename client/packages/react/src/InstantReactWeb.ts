import type { InstantGraph, RoomSchemaShape } from "@instantdb/core";
import { InstantReact } from "./InstantReact";

export class InstantReactWeb<
  Schema extends {},
  RoomSchema extends RoomSchemaShape = {},
> extends InstantReact<Schema, RoomSchema> {}
