import { i, RoomSchemaShape } from "@instantdb/core";
import { InstantReact } from "./InstantReact";

export class InstantReactWeb<
  Schema extends i.InstantGraph<any, any> | {} = {},
  RoomSchema extends RoomSchemaShape = {},
> extends InstantReact<Schema, RoomSchema> {}
