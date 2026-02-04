import { init } from "@instantdb/admin";
import schema from "../instant.schema";

const appId = process.env.VITE_INSTANT_APP_ID;
const adminToken = process.env.INSTANT_APP_ADMIN_TOKEN;

if (!appId) {
  throw new Error("VITE_INSTANT_APP_ID environment variable is required");
}
if (!adminToken) {
  throw new Error("INSTANT_APP_ADMIN_TOKEN environment variable is required");
}

export const adminDb = init({
  appId,
  adminToken,
  schema,
  useDateObjects: true,
});
