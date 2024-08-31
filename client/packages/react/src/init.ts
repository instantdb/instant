import {
  // types
  Config,
  RoomSchemaShape,
} from "@instantdb/core";
import { InstantReactWeb } from "./InstantReactWeb";

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
export function init<Schema = {}, RoomSchema extends RoomSchemaShape = {}>(
  config: Config,
) {
  return new InstantReactWeb<Schema, RoomSchema>(config);
}
