import config, { getServerConfig, isBrowser } from '@/lib/config';
import { trackingHeaders } from '../fetch';

export async function fetchTotalSessionsCount({
  next,
}: { next?: NextFetchRequestConfig } = {}) {
  const { apiURI } = isBrowser ? config : await getServerConfig();
  const res = await fetch(`${apiURI}/dash/stats/active_sessions`, {
    method: 'GET',
    headers: {
      'content-type': 'application/json',
      ...trackingHeaders,
    },
    next,
  });
  const json = await res.json();
  if (res.status !== 200) {
    throw { status: res.status, body: json };
  }
  return json;
}
