export const isBrowser = typeof window != 'undefined';

export const isDev = process.env.NODE_ENV === 'development';

const isStaging = process.env.NEXT_PUBLIC_STAGING === 'true';

const devBackend = getLocal('devBackend');

let localPort = process.env.NEXT_PUBLIC_LOCAL_SERVER_PORT || '8888';

if (devBackend && isBrowser) {
  const portOverride = new URL(location.href).searchParams.get('port');
  if (portOverride) {
    localPort = portOverride;
  }
}

const config = {
  apiURI: devBackend
    ? `http://localhost:${localPort}`
    : `https://${isStaging ? 'api-staging' : 'api'}.instantdb.com`,
  websocketURI: devBackend
    ? `ws://localhost:${localPort}/runtime/session`
    : `wss://${isStaging ? 'api-staging' : 'api'}.instantdb.com/runtime/session`,
};

// In dev mode, sync the devBackend flag to a cookie so server components
// can resolve the same apiURI as the client.
if (isDev && isBrowser) {
  if (devBackend) {
    document.cookie = `devBackend=${localPort}; path=/`;
  } else {
    document.cookie = `devBackend=; path=/; max-age=0`;
  }
}

/**
 * Returns the config for use in server components. In dev mode, reads the
 * devBackend cookie so it resolves the same apiURI as the client.
 */
export async function getServerConfig() {
  if (isDev && !isBrowser) {
    const { cookies } = await import('next/headers');
    const cookieStore = await cookies();
    const devBackendCookie = cookieStore.get('devBackend')?.value;
    if (devBackendCookie) {
      const port = devBackendCookie;
      return {
        apiURI: `http://localhost:${port}`,
        websocketURI: `ws://localhost:${port}/runtime/session`,
      };
    }
  }
  return config;
}

export default config;

export const isTouchDevice =
  typeof window !== 'undefined' && 'ontouchstart' in window;

const stripeDevKey =
  'pk_test_51P4n0uL5BwOwpxgUk2SqZanKmGf4o8rrxT9Bde4tyHJjGk72L4X2kyiGOX76Jw5KuUFHNgdLPnBwuGgE66SZCMVg00Ib3f21V9';
const stripeProdKey =
  'pk_live_51P4n0uL5BwOwpxgUYEr1bcbyjPC1p5bvIM8VZ88D5XnDqY1xxz8PMSjJIpgJfe1jj7oXWYgeaR3M4DbHS4ePyuwO00KCShqO67';
export const stripeKey = isDev ? stripeDevKey : stripeProdKey;

const stripeDevCustomerPortalURI =
  'https://billing.stripe.com/p/login/test_aEU7sH5G25hi7LicMM';
const stripeProdCustomerPortalURI =
  'https://billing.stripe.com/p/login/14k14e3ST6yT1aM6oo';
export const stripeCustomerPortalURI = isDev
  ? stripeDevCustomerPortalURI
  : stripeProdCustomerPortalURI;

type LocalKeysWithTypes = {
  __instant__authTokens: { name: string; token: string; prod: boolean }[];
  devBackend: boolean;
};

export function getLocal<Key extends string>(
  k: Key,
):
  | (Key extends keyof LocalKeysWithTypes ? LocalKeysWithTypes[Key] : any)
  | null {
  if (!isBrowser) {
    return null;
  }

  try {
    const raw = localStorage.getItem(k);

    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    return null;
  }
}

export function setLocal<K extends string>(
  k: K,
  v: K extends keyof LocalKeysWithTypes ? LocalKeysWithTypes[K] : any,
) {
  if (!isBrowser) {
    return;
  }

  try {
    localStorage.setItem(k, JSON.stringify(v));
  } catch (e) {
    return;
  }
}

export const localStorageFlagPrefix = `__instant__flag__`;

export const cliOauthParamName = '_cli_oauth_ticket';

export const instantRepo = 'instantdb/instant';

export const discordInviteUrl = 'https://discord.com/invite/VU53p7uQcE';

export const discordOAuthAppsFeedbackInviteUrl =
  'https://discord.gg/GrvbPTBDEX';

export const bugsAndQuestionsInviteUrl = 'https://discord.gg/unA5vyV6mP';

export function areTeamsFree() {
  const now = new Date();
  return now.getFullYear() <= 2026 && now.getMonth() < 2;
}
