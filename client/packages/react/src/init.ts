import {
  // types
  Config,
  ConfigWithSchema,
  i,
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
 * // You can also provide a a schema for type safety and editor autocomplete!
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
  Schema = {},
  RoomSchema extends RoomSchemaShape = {},
  Config_ extends Config | ConfigWithSchema<any> = Config,
>(config: Config_) {
  return new InstantReactWeb<
    Config_ extends ConfigWithSchema<infer CS> ? CS : Schema,
    RoomSchema
  >(config);
}
