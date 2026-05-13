import { init } from "@instantdb/vue";
import schema from "../instant.schema";

export const db = init({
  appId: import.meta.env.VITE_INSTANT_APP_ID!,
  schema,
  useDateObjects: true,
});
