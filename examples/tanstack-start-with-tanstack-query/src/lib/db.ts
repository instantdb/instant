import { init } from "@instantdb/react";
import schema from "../instant.schema";

const appId = import.meta.env.VITE_INSTANT_APP_ID;
if (!appId) {
  throw new Error("VITE_INSTANT_APP_ID environment variable is required");
}

export const db = init({
  appId,
  schema,
  useDateObjects: true,
  firstPartyPath: "/api/instant",
});
