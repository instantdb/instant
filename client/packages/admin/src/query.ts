import {
  InstantAPIError,
  type Query,
  type QueryResponse,
} from '@instantdb/core';

export interface QueryConfig {
  appId: string;
  adminToken: string;
  apiURI: string;
}

export async function query<Q extends Query>(
  config: QueryConfig,
  query: Q
): Promise<QueryResponse<Q>> {
  const response = await fetch(`${config.apiURI}/admin/query`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${config.adminToken}`,
      'Instant-App-Id': config.appId,
    },
    body: JSON.stringify({ query }),
  });

  if (!response.ok) {
    throw new InstantAPIError(response);
  }

  return response.json();
}
