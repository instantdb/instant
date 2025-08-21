const dev = Boolean(process.env.INSTANT_CLI_DEV);
const instantBackendOrigin =
  process.env.INSTANT_CLI_API_URI ||
  (dev ? 'http://localhost:8888' : 'https://api.instantdb.com');

export async function fetchJson<T>({
  path,
  body,
  method = 'GET',
  authToken,
}: {
  path: string;
  body?: any;
  method?: 'POST' | 'GET';
  authToken: string;
}): Promise<T> {
  const timeoutMs = 1000 * 60 * 5; // 5 minutes

  const res = await fetch(`${instantBackendOrigin}${path}`, {
    method: method ?? 'GET',
    headers: {
      Authorization: `Bearer ${authToken}`,
      'Content-Type': 'application/json',
    },
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
