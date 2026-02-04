import { init } from "@instantdb/solidjs";
import schema from "../instant.schema";

const useDateObjects = true as const;
export type UsingDateObjects = typeof useDateObjects;

export const db = init({
  appId: import.meta.env.VITE_INSTANT_APP_ID!,
  schema,
  useDateObjects,
});
