import { getServerConfig } from '@/lib/config';

export type ProvisionedApp = {
  id: string;
  adminToken: string;
};

export async function createApp(
  token: string,
  title: string,
): Promise<ProvisionedApp> {
  const { apiURI } = await getServerConfig();
  const res = await fetch(`${apiURI}/dash/apps/get_a_db`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ title }),
  });
  if (!res.ok) {
    throw new Error(
      `Failed to create get-a-db app: ${res.status} ${await res.text()}`,
    );
  }
  const body = (await res.json()) as {
    app: { id: string; 'admin-token': string };
  };
  return { id: body.app.id, adminToken: body.app['admin-token'] };
}
