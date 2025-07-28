import config from '@/lib/config';
import { jsonFetch } from '@/lib/fetch';

export async function provisionApp({
  title,
}: {
  title: string;
}): Promise<{
  app: { id: string; 'admin-token': string };
  expires_ms: number;
}> {
  return await jsonFetch(`${config.apiURI}/dash/apps/ephemeral`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      title,
    }),
  });
}
