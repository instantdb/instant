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
