import "react-native-get-random-values";

import Storage from "./Storage";
import NetworkListener from "./NetworkListener";
import version from "./version";

import {
  // react
  InstantReact,
  InstantReactExperimental,

  // types
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
  type InstantEntityExperimental,
  type InstaQLQueryResultExperimental,
  type ConfigExperimental,
  InstantSchemaV2,
} from "@instantdb/core";

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
function init<Schema extends {} = {}, RoomSchema extends RoomSchemaShape = {}>(
  config: Config,
) {
  return new InstantReactNative<Schema, RoomSchema>(config);
}

function init_experimental<
  Schema extends InstantGraph<any, any, any>,
  WithCardinalityInference extends boolean = true,
>(
  config: Config & {
    schema: Schema;
    cardinalityInference?: WithCardinalityInference;
  },
) {
  return new InstantReactNative<
    Schema,
    Schema extends InstantGraph<any, any, infer RoomSchema>
      ? RoomSchema
      : never,
    WithCardinalityInference
  >(config);
}

function init_experimental_v2<Schema extends InstantSchemaV2<any, any, any>>(
  config: ConfigExperimental<Schema>,
) {
  return new InstantReactNativeExperimental<Schema>(config);
}

class InstantReactNative<
  Schema extends InstantGraph<any, any, any> | {} = {},
  RoomSchema extends RoomSchemaShape = {},
  WithCardinalityInference extends boolean = false,
> extends InstantReact<Schema, RoomSchema, WithCardinalityInference> {
  static Storage = Storage;
  static NetworkListener = NetworkListener;

  constructor(config: Config | ConfigWithSchema<any>) {
    super(config, { "@instantdb/react-native": version });
  }
}

class InstantReactNativeExperimental<
  Schema extends InstantSchemaV2<any, any, any>,
> extends InstantReactExperimental<Schema> {
  static Storage = Storage;
  static NetworkListener = NetworkListener;
}

export {
  init,
  init_experimental,
  init_experimental_v2,
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
  type InstantReactNative,
  type InstantQuery,
  type InstantQueryResult,
  type InstantSchema,
  type InstantSchemaDatabase,
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
  type InstantEntityExperimental,
  type InstaQLQueryResultExperimental,
};
