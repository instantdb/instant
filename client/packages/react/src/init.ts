import {
  // types
  Config,
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
  return new InstantReactWeb<Schema, RoomSchema, false>(config);
}

export function init_experimental<
  Schema extends i.InstantGraph<any, any, any>,
  WithCardinalityInference extends boolean = true,
>(
  config: Config & {
    schema: Schema;
    cardinalityInference?: WithCardinalityInference;
  },
) {
  return new InstantReactWeb<
    Schema,
    Schema extends i.InstantGraph<any, infer RoomSchema, any>
      ? RoomSchema
      : never,
    WithCardinalityInference
  >(config);
}
