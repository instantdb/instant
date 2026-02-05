import { init, id, tx } from "@instantdb/solidjs";
import schema from "../instant.schema";

export { id, tx };

const useDateObjects = true as const;
export type UsingDateObjects = typeof useDateObjects;

export const db = init({
  appId: import.meta.env.VITE_INSTANT_APP_ID!,
  schema,
  useDateObjects,
});

export const chatRoom = db.room("chat", "lobby");
