import { getServerConfig } from '@/lib/config';

export type ProvisionedApp = {
  id: string;
  adminToken: string;
};

export async function createGDBApp(title: string): Promise<ProvisionedApp> {
  const token = process.env.GET_A_DB_PERSONAL_ACCESS_TOKEN;
  if (!token) {
    throw new Error('GET_A_DB_PERSONAL_ACCESS_TOKEN is not set');
  }

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
