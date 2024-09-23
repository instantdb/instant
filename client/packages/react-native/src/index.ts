import "react-native-get-random-values";

import Storage from "./Storage";
import NetworkListener from "./NetworkListener";
import {
  // react
  InstantReact,

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
  type RoomSchemaShape,
  type InstantQuery,
  type InstantQueryResult,
  type InstantSchema,

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
    Schema extends InstantGraph<any, infer RoomSchema, any>
      ? RoomSchema
      : never,
    WithCardinalityInference
  >(config);
}

class InstantReactNative<
  Schema extends InstantGraph<any, any, any> | {} = {},
  RoomSchema extends RoomSchemaShape = {},
  WithCardinalityInference extends boolean = false,
> extends InstantReact<Schema, RoomSchema, WithCardinalityInference> {
  static Storage = Storage;
  static NetworkListener = NetworkListener;
}

export {
  init,
  init_experimental,
  id,
  tx,
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
};
