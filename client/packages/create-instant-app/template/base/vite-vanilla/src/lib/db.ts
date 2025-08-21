// Initialize the database

import { init } from "@instantdb/core";
import schema from "../instant.schema";

// ---------
export const db = init({
  appId: import.meta.env.VITE_INSTANT_APP_ID,
  schema,
  useDateObjects: true,
});
