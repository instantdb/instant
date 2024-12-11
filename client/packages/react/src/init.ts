import type {
  // types
  Config,
  InstantConfig,
  InstantGraph,
  InstantSchemaDef,
  RoomSchemaShape,
  InstantUnknownSchema,
} from "@instantdb/core";
import { InstantReactWeb } from "./InstantReactWeb";
import InstantReactWebDatabase from "./InstantReactWebDatabase";

/**
 *
 * The first step: init your application!
 *
 * Visit https://instantdb.com/dash to get your `appId` :)
 *
 * @example
 *  const db = init({ appId: "my-app-id" })
 *
 * // You can also provide a schema for type safety and editor autocomplete!
 *
 *  type Schema = {
 *    goals: {
 *      title: string
 *    }
 *  }
 *
 *  const db = init<Schema>({ appId: "my-app-id" })
 *
 */
export function init<
  Schema extends {} = {},
  RoomSchema extends RoomSchemaShape = {},
>(config: Config) {
  return new InstantReactWeb<Schema, RoomSchema>(config);
}

export function init_experimental<
  Schema extends InstantSchemaDef<any, any, any> = InstantUnknownSchema,
>(config: InstantConfig<Schema>) {
  return new InstantReactWebDatabase<Schema>(config);
}
