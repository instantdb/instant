import { init } from "@instantdb/react";
import schema from "../instant.schema";

const appId = import.meta.env.VITE_INSTANT_APP_ID;

export const db = init({
  appId,
  schema,
  useDateObjects: true,
  firstPartyPath: "/api/instant",
});
