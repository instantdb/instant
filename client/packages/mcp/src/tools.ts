const API_URL = process.env.INSTANT_API_URL || 'https://api.instantdb.com';

type ToolResult = {
  isError?: boolean;
  content: { type: 'text'; text: string }[];
};

function adminHeaders(appId: string, adminToken: string) {
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${adminToken}`,
    'App-Id': appId,
  };
}

export async function handleQuery(
  appId: string,
  adminToken: string,
  query: Record<string, any>,
): Promise<ToolResult> {
  try {
    const res = await fetch(`${API_URL}/admin/query`, {
      method: 'POST',
      headers: adminHeaders(appId, adminToken),
      body: JSON.stringify({ query }),
    });
    const data = await res.json();
    if (!res.ok) {
      return {
        isError: true,
        content: [
          { type: 'text', text: `Error querying app: ${JSON.stringify(data)}` },
        ],
      };
    }
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
  appId: string,
  adminToken: string,
  steps: any[][],
): Promise<ToolResult> {
  try {
    const res = await fetch(`${API_URL}/admin/transact`, {
      method: 'POST',
      headers: adminHeaders(appId, adminToken),
      body: JSON.stringify({ steps }),
    });
    const data = await res.json();
    if (!res.ok) {
      return {
        isError: true,
        content: [
          { type: 'text', text: `Error transacting: ${JSON.stringify(data)}` },
        ],
      };
    }
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
