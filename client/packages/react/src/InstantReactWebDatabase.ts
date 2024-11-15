import type { InstantSchemaDef } from "@instantdb/core";
import InstantReactAbstractDatabase from "./InstantReactAbstractDatabase";

export default class InstantReactWebDatabase<
  Schema extends InstantSchemaDef<any, any, any>,
> extends InstantReactAbstractDatabase<Schema> {}
