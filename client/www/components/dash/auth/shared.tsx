import { jsonFetch } from '@/lib/fetch';
import config from '@/lib/config';
import { OAuthServiceProvider, OAuthClient } from '@/lib/types';

export function findName(prefix: string, used: Set<string>): string {
  if (!used.has(prefix)) {
    return prefix;
  }
  for (let i = 2; true; i++) {
    if (!used.has(prefix + i)) {
      return prefix + i;
    }
  }
}

export function addProvider({
  token,
  appId,
  providerName,
}: {
  token: string;
  appId: string;
  providerName: string;
}): Promise<{ provider: OAuthServiceProvider }> {
  return jsonFetch(
    `${config.apiURI}/dash/apps/${appId}/oauth_service_providers`,
    {
      method: 'POST',
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ provider_name: providerName }),
    },
  );
}

export function addClient({
  token,
  appId,
  providerId,
  clientName,
  clientId,
  clientSecret,
  authorizationEndpoint,
  tokenEndpoint,
  discoveryEndpoint,
  meta,
}: {
  token: string;
  appId: string;
  providerId: string;
  clientName: string;
  clientId?: string;
  clientSecret?: string;
  authorizationEndpoint?: string;
  tokenEndpoint?: string;
  discoveryEndpoint: string;
  meta?: any;
}): Promise<{ client: OAuthClient }> {
  return jsonFetch(`${config.apiURI}/dash/apps/${appId}/oauth_clients`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      provider_id: providerId,
      client_name: clientName,
      client_id: clientId,
      client_secret: clientSecret,
      authorization_endpoint: authorizationEndpoint,
      token_endpoint: tokenEndpoint,
      discovery_endpoint: discoveryEndpoint,
      meta,
    }),
  });
}

export function deleteClient({
  token,
  appId,
  clientDatabaseId,
}: {
  token: string;
  appId: string;
  clientDatabaseId: string;
}): Promise<{ client: OAuthClient }> {
  return jsonFetch(
    `${config.apiURI}/dash/apps/${appId}/oauth_clients/${clientDatabaseId}`,
    {
      method: 'DELETE',
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({}),
    },
  );
}
