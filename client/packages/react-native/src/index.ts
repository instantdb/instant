import "react-native-get-random-values";

import Storage from "./Storage";
import NetworkListener from "./NetworkListener";
import {
  // react
  InstantReact,

  // types
  Config,
  Query,
  QueryResponse,
  InstantObject,
  AuthState,
  User,
} from "@instantdb/react";
import { ConfigWithSchema, RoomSchemaShape, id, tx } from "@instantdb/core";

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
function init<
  Schema = {},
  RoomSchema extends RoomSchemaShape = {},
  Config_ extends Config | ConfigWithSchema<any> = Config,
>(config: Config_) {
  return new InstantReactNative<
    Config_ extends ConfigWithSchema<infer CS> ? CS : Schema,
    RoomSchema
  >(config);
}

class InstantReactNative<
  Schema = {},
  RoomSchema extends RoomSchemaShape = {},
> extends InstantReact<Schema, RoomSchema> {
  static Storage = Storage;
  static NetworkListener = NetworkListener;
}

export {
  init,
  id,
  tx,

  // types
  Config,
  Query,
  QueryResponse,
  InstantObject,
  User,
  AuthState,
  InstantReactNative,
};
