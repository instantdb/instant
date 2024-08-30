import {
  id,
  tx,
  lookup,
  i,

  // types
  type QueryResponse,
  type InstantObject,
  type User,
  type AuthState,
  type Query,
  type Config,
} from "@instantdb/core";

import { InstantReact } from "./InstantReact";
import { InstantReactWeb } from "./InstantReactWeb";
import { init } from "./init";
import { Cursors } from "./Cursors";

export {
  id,
  tx,
  lookup,
  init,
  InstantReactWeb,
  Cursors,

  // internal
  InstantReact,

  // types
  Config,
  Query,
  QueryResponse,
  InstantObject,
  User,
  AuthState,
  i,
};
