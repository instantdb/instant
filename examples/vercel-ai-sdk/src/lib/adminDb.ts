import { init as initAdmin } from '@instantdb/admin';
import schema from '@/instant.schema';

export const adminDb = initAdmin({
  appId: process.env.NEXT_PUBLIC_INSTANT_APP_ID!,
  adminToken: process.env.INSTANT_APP_ADMIN_TOKEN!,
  schema,
});
