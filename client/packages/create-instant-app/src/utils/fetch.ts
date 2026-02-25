import { schemaTypescriptFileToInstantSchema } from '@instantdb/platform';
import { version } from '@instantdb/version';

const dev = Boolean(process.env.INSTANT_CLI_DEV);

export const instantDashOrigin = dev
  ? 'http://localhost:3000'
  : 'https://instantdb.com';

export const instantBackendOrigin =
  process.env.INSTANT_CLI_API_URI ||
  (dev ? 'http://localhost:8888' : 'https://api.instantdb.com');

export type ScaffoldMetadata = {
  template?: string;
  aiTool?: string;
  usedAiPrompt?: boolean;
  rules?: { code: Record<string, any> } | null;
  schema?: ReturnType<typeof schemaTypescriptFileToInstantSchema> | null;
};

export async function fetchJson<T>({
  path,
  body,
  method = 'GET',
  authToken,
  metadata,
}: {
  path: string;
  body?: any;
  method?: 'POST' | 'GET';
  authToken: string | null;
  metadata?: ScaffoldMetadata;
}): Promise<T> {
  const timeoutMs = 1000 * 60 * 5; // 5 minutes

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'X-Instant-Source': 'create-instant-app',
    'X-Instant-Version': version,
    'X-Instant-Command': 'create',
  };

  if (authToken) {
    headers['Authorization'] = `Bearer ${authToken}`;
  }

  if (metadata) {
    headers['X-Instant-Metadata'] = JSON.stringify(metadata);
  }

  const res = await fetch(`${instantBackendOrigin}${path}`, {
    method: method ?? 'GET',
    headers,
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(timeoutMs),
  });

  let data;
  try {
    data = await res.json();
  } catch {
    data = null;
  }
  if (!res.ok) {
    const message: string =
      data.message || data.hint?.errors?.[0]?.message || 'There was an error';
    throw new Error(message);
  }

  return data;
}
