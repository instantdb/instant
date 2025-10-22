import schema from "@/instant.schema";
import { init } from "@instantdb/admin";

export const adminDb = init({
  appId: process.env.NEXT_PUBLIC_INSTANT_APP_ID!,
  apiURI: "http://localhost:8888",
  schema,
  useDateObjects: true,
});
