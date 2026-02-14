import { init, id, tx } from "@instantdb/solidjs";
import schema from "../instant.schema";

export { id, tx };

export const db = init({
  appId: import.meta.env.VITE_INSTANT_APP_ID!,
  schema,
  useDateObjects: true,
});

export const chatRoom = db.room("chat", "lobby");
