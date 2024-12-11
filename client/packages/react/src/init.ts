import type {
  InstantConfig,
  InstantSchemaDef,
  InstantUnknownSchema,
} from "@instantdb/core";

import InstantReactWebDatabase from "./InstantReactWebDatabase";
import version from "./version";

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
 *  // TODO-now
 *  const db = init<Schema>({ appId: "my-app-id" })
 */
export function init<
  Schema extends InstantSchemaDef<any, any, any> = InstantUnknownSchema,
>(config: InstantConfig<Schema>) {
  return new InstantReactWebDatabase<Schema>(config, {
    "@instantdb/react": version,
  });
}

/**
 * @deprecated
 * // TODO-now
 */
export const init_experimental = init;
