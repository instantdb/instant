import { init } from '@instantdb/react/nextjs';
import schema from '@/instant.schema';

export const db = init({
  appId: process.env.NEXT_PUBLIC_INSTANT_APP_ID!,
  schema,
  firstPartyPath: '/api/instant',
});
