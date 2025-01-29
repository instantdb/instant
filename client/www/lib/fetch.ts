export async function jsonFetch(
  input: RequestInfo,
  init: RequestInit | undefined,
): Promise<any> {
  const res = await fetch(input, init);
  const json = await res.json();
  return res.status === 200
    ? Promise.resolve(json)
    : Promise.reject({ status: res.status, body: json });
}

export async function jsonMutate<T>(
  input: RequestInfo,
  {
    token,
    body,
    method,
  }: { token: string; body?: any; method?: 'POST' | 'DELETE' },
): Promise<T> {
  return jsonFetch(input, {
    method: method ?? 'POST',
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
}
