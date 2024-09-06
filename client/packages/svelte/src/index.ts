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

import { InstantSvelte } from "./InstantSvelte.svelte";
import { init, init_experimental } from "./init";
import { Cursors } from "./Cursors";

export {
  id,
  tx,
  lookup,
  init,
  init_experimental,
  Cursors,

  // internal
  InstantSvelte,

  // types
  Config,
  Query,
  QueryResponse,
  InstantObject,
  User,
  AuthState,
  i,
};
