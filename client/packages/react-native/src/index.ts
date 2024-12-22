import "react-native-get-random-values";

import Storage from "./Storage";
import NetworkListener from "./NetworkListener";
import version from "./version";

import {
  // react
  InstantReactAbstractDatabase,

  // types
  type BackwardsCompatibleSchema,
  type IInstantDatabase,
  type Config,
  type Query,
  type QueryResponse,
  type InstantObject,
  type AuthState,
  type User,
} from "@instantdb/react";
import {
  i,
  id,
  tx,
  lookup,
  type RoomSchemaShape,
  type InstantQuery,
  type InstantQueryResult,
  type InstantSchema,
  type InstantSchemaDatabase,
  type ConnectionStatus,

  // schema types
  type AttrsDefs,
  type CardinalityKind,
  type DataAttrDef,
  type EntitiesDef,
  type EntitiesWithLinks,
  type EntityDef,
  type InstantGraph,
  type LinkAttrDef,
  type LinkDef,
  type LinksDef,
  type ResolveAttrs,
  type ValueTypes,
  type InstantEntity,
  type ConfigWithSchema,
  type InstaQLEntity,
  type InstaQLResult,
  type InstantConfig,
  type InstantSchemaDef,
  type InstantUnknownSchema,
  type InstantRules,
  type UpdateParams,
  type LinkParams,
} from "@instantdb/core";

/**
 *
 * The first step: init your application!
 *
 * Visit https://instantdb.com/dash to get your `appId` :)
 *
 * @example
 *  import { init } from "@instantdb/react-native"
 *
 *  const db = init({ appId: "my-app-id" })
 *
 *  // You can also provide a schema for type safety and editor autocomplete!
 *
 *  import { init } from "@instantdb/react-native"
 *  import schema from ""../instant.schema.ts";
 *
 *  const db = init({ appId: "my-app-id", schema })
 *  
 *  // To learn more: https://instantdb.com/docs/modeling-data
 */
function init<
  Schema extends InstantSchemaDef<any, any, any> = InstantUnknownSchema,
>(config: InstantConfig<Schema>) {
  return new InstantReactNativeDatabase<Schema>(config, {
    "@instantdb/react-native": version,
  });
}

/**
 * @deprecated
 * `init_experimental` is deprecated. You can replace it with `init`.
 * 
 * @example
 *
 * // Before
 * import { init_experimental } from "@instantdb/react-native"
 * const db = init_experimental({  ...  });
 *
 * // After
 * import { init } from "@instantdb/react-native"
 * const db = init({ ...  });
 */
const init_experimental = init;

class InstantReactNativeDatabase<
  Schema extends InstantSchemaDef<any, any, any>,
> extends InstantReactAbstractDatabase<Schema> {
  static Storage = Storage;
  static NetworkListener = NetworkListener;
}

export {
  init,
  init_experimental,
  id,
  tx,
  lookup,
  i,

  // types
  type Config,
  type Query,
  type QueryResponse,
  type InstantObject,
  type User,
  type AuthState,
  type ConnectionStatus,
  type InstantQuery,
  type InstantQueryResult,
  type InstantSchema,
  type InstantSchemaDatabase,
  type IInstantDatabase,
  type InstantEntity,
  type RoomSchemaShape,

  // schema types
  type AttrsDefs,
  type CardinalityKind,
  type DataAttrDef,
  type EntitiesDef,
  type EntitiesWithLinks,
  type EntityDef,
  type InstantGraph,
  type LinkAttrDef,
  type LinkDef,
  type LinksDef,
  type ResolveAttrs,
  type ValueTypes,
  type InstaQLEntity,
  type InstaQLResult,
  type InstantSchemaDef,
  type InstantUnknownSchema,
  type BackwardsCompatibleSchema,
  type InstantRules,
  type UpdateParams,
  type LinkParams,
};
