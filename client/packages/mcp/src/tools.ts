import { PlatformApi } from '@instantdb/platform';

const API_URL = process.env.INSTANT_API_URL || 'https://api.instantdb.com';

type ToolResult = {
  isError?: boolean;
  content: { type: 'text'; text: string }[];
};

async function adminQuery(
  apiURI: string,
  token: string,
  appId: string,
  query: Record<string, any>,
) {
  const res = await fetch(`${apiURI}/admin/query`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      'App-Id': appId,
    },
    body: JSON.stringify({ query }),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(JSON.stringify(data));
  }
  return data;
}

async function adminTransact(
  apiURI: string,
  token: string,
  appId: string,
  steps: any[][],
) {
  const res = await fetch(`${apiURI}/admin/transact`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      'App-Id': appId,
    },
    body: JSON.stringify({ steps }),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(JSON.stringify(data));
  }
  return data;
}

export async function handleQuery(
  api: PlatformApi,
  appId: string,
  query: Record<string, any>,
): Promise<ToolResult> {
  try {
    const data = await api.withRetry(adminQuery, [
      API_URL,
      api.token(),
      appId,
      query,
    ]);
    return {
      content: [{ type: 'text', text: JSON.stringify(data, null, 2) }],
    };
  } catch (e: any) {
    return {
      isError: true,
      content: [{ type: 'text', text: `Error querying app: ${e.message}` }],
    };
  }
}

export async function handleTransact(
  api: PlatformApi,
  appId: string,
  steps: any[][],
): Promise<ToolResult> {
  try {
    const data = await api.withRetry(adminTransact, [
      API_URL,
      api.token(),
      appId,
      steps,
    ]);
    return {
      content: [{ type: 'text', text: JSON.stringify(data, null, 2) }],
    };
  } catch (e: any) {
    return {
      isError: true,
      content: [{ type: 'text', text: `Error transacting: ${e.message}` }],
    };
  }
}
