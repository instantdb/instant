import { RoomSchemaShape } from "@instantdb/core";
import { InstantReact } from "./InstantReact";

export class InstantReactWeb<
  Schema = {},
  RoomSchema extends RoomSchemaShape = {},
> extends InstantReact<Schema, RoomSchema> {}
