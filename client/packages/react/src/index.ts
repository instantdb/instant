import {
  id,
  tx,
  lookup,
  i,

  // types
  type QueryResponse,
  type SchemaInstaQLQuery,
  type SchemaInstaQLResult,
  type InstantObject,
  type User,
  type AuthState,
  type Query,
  type Config,
} from "@instantdb/core";

import { InstantReact } from "./InstantReact";
import { InstantReactWeb } from "./InstantReactWeb";
import { init, init_experimental } from "./init";
import { Cursors } from "./Cursors";

export {
  id,
  tx,
  lookup,
  init,
  init_experimental,
  InstantReactWeb,
  Cursors,
  i,

  // internal
  InstantReact,

  // types
  Config,
  Query,
  QueryResponse,
  InstantObject,
  User,
  AuthState,
  SchemaInstaQLQuery,
  SchemaInstaQLResult,
};
