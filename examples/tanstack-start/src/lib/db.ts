import { init } from "@instantdb/react";
import schema from "../instant.schema";

if (!import.meta.env.VITE_INSTANT_APP_ID) {
  throw new Error("VITE_INSTANT_APP_ID is not defined");
}

export const db = init({
  appId: import.meta.env.VITE_INSTANT_APP_ID!,
  schema,
  useDateObjects: true,
  firstPartyPath: "/api/instant",
});
