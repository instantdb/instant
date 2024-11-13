import type {
  // types
  Config,
  DoNotUseConfig,
  InstantGraph,
  DoNotUseInstantSchema,
  RoomSchemaShape,
} from "@instantdb/core";
import { InstantReactWeb } from "./InstantReactWeb";
import { DoNotUseInstantReactWeb } from "./DoNotUseInstantReactWeb";

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
  Schema extends InstantGraph<any, any, any>,
  WithCardinalityInference extends boolean = true,
>(
  config: Config & {
    schema: Schema;
    cardinalityInference?: WithCardinalityInference;
  },
) {
  return new InstantReactWeb<
    Schema,
    Schema extends InstantGraph<any, any, infer RoomSchema>
      ? RoomSchema
      : never,
    WithCardinalityInference
  >(config);
}

export function do_not_use_init_experimental<
  Schema extends DoNotUseInstantSchema<any, any, any>,
>(config: DoNotUseConfig<Schema>) {
  return new DoNotUseInstantReactWeb<Schema>(config);
}
