import { init } from "@instantdb/admin";
import schema from "@/instant.schema";

export const adminDb = init({
  appId: process.env.INSTANT_APP_ID!,
  adminToken: process.env.INSTANT_APP_ADMIN_TOKEN!,
  schema,
});
