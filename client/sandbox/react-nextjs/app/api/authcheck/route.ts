import { init } from '@instantdb/admin';
import schema from '../../play/ssr/instant.schema';

export const appId = process.env.NEXT_PUBLIC_INSTANT_APP_ID;

if (!appId) {
  console.warn('warning: NEXT_PUBLIC_INSTANT_APP_ID is not set');
}

export const db = init({
  appId: appId!,
  apiURI: 'http://localhost:8888',
  schema,
  useDateObjects: true,
});

export const GET = async (req: Request) => {
  return new Response(JSON.stringify(await db.auth.getUserFromRequest(req)));
};
