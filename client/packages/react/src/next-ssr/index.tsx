import {
  InstantConfig,
  InstantSchemaDef,
  InstantUnknownSchema,
} from '@instantdb/core';

import version from '../version.ts';

import { InstantNextDatabase } from './InstantNextDatabase.tsx';

export {
  getUnverifiedUserFromInstantCookie,
  getUserFromInstantCookie,
} from './getUserFromInstantCookie.ts';

export { InstantNextDatabase } from './InstantNextDatabase.tsx';
export { InstantSuspenseProvider } from './InstantSuspenseProvider.tsx';

export { createInstantRouteHandler } from '@instantdb/core';

/**
 *
 * The first step: init your application!
 *
 * Visit https://instantdb.com/dash to get your `appId` :)
 *
 * @example
 *  import { init } from "@instantdb/react"
 *
 *  const db = init({ appId: "my-app-id" })
 *
 *  // You can also provide a schema for type safety and editor autocomplete!
 *
 *  import { init } from "@instantdb/react"
 *  import schema from ""../instant.schema.ts";
 *
 *  const db = init({ appId: "my-app-id", schema })
 *
 *  // To learn more: https://instantdb.com/docs/modeling-data
 */
export function init<
  Schema extends InstantSchemaDef<any, any, any> = InstantUnknownSchema,
  UseDates extends boolean = false,
>(
  // Allows config with missing `useDateObjects`, but keeps `UseDates`
  // as a non-nullable in the InstantConfig type.
  config: Omit<InstantConfig<Schema, UseDates>, 'useDateObjects'> & {
    useDateObjects?: UseDates;
  },
): InstantNextDatabase<Schema, UseDates> {
  return new InstantNextDatabase<Schema, UseDates>(config, {
    '@instantdb/react': version,
  });
}
