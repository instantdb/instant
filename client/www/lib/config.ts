import { oauthCallbackURL } from '@instantdb/platform';

export const isBrowser = typeof window != 'undefined';

export const isDev = process.env.NODE_ENV === 'development';

const isStaging = process.env.NEXT_PUBLIC_STAGING === 'true';
export const isSelfHosted = process.env.NEXT_PUBLIC_SELF_HOSTED === 'true';

type DashboardConfig = {
  apiURI: string;
  websocketURI: string;
};

type RuntimeDashboardConfig = Partial<DashboardConfig>;

const selfHostedConfigError =
  'Self-hosted dashboard requires INSTANT_API_URI or INSTANT_BACKEND_URL to be a valid HTTP(S) URL.';

declare global {
  interface Window {
    __instantConfig?: RuntimeDashboardConfig;
  }
}

function websocketURIFromApiURI(apiURI: string) {
  const url = new URL(apiURI);
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('API URI must use HTTP or HTTPS.');
  }
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  url.pathname = '/runtime/session';
  url.search = '';
  url.hash = '';
  return url.toString();
}

export function configFromApiURI(apiURI: string | undefined | null) {
  if (!apiURI) {
    return null;
  }

  return {
    apiURI,
    websocketURI: websocketURIFromApiURI(apiURI),
  };
}

function getRuntimeApiURI() {
  if (isBrowser) {
    return window.__instantConfig?.apiURI;
  }

  return process.env.INSTANT_API_URI || process.env.INSTANT_BACKEND_URL;
}

export function requireSelfHostedConfig(
  apiURI: string | undefined | null,
): DashboardConfig {
  try {
    const config = configFromApiURI(apiURI);
    if (config) {
      return config;
    }
  } catch (_e) {
    // Throw the same actionable error for missing and malformed URLs.
  }
  throw new Error(selfHostedConfigError);
}

const devBackend = getLocal('devBackend');

let localPort = process.env.NEXT_PUBLIC_LOCAL_SERVER_PORT || '8888';

if (devBackend && isBrowser) {
  const portOverride = new URL(location.href).searchParams.get('port');
  if (portOverride) {
    localPort = portOverride;
  }
}

const defaultApiURI = devBackend
  ? `http://localhost:${localPort}`
  : `https://${isStaging ? 'api-staging' : 'api'}.instantdb.com`;

function getSelfHostedConfig() {
  const apiURI = getRuntimeApiURI();
  if (apiURI || isBrowser) {
    return requireSelfHostedConfig(apiURI);
  }

  // The build evaluates this module before the container has runtime config.
  // Container startup validates the URL before serving the dashboard.
  return configFromApiURI(`http://localhost:${localPort}`)!;
}

export const config =
  isSelfHosted && !devBackend
    ? getSelfHostedConfig()
    : configFromApiURI(defaultApiURI)!;

export const defaultOAuthCallbackURL = oauthCallbackURL(config.apiURI);

export const demoConfig = {
  apiURI:
    process.env.NEXT_PUBLIC_RECIPE_API_URI ?? 'https://demo.instantdb.com',
  websocketURI:
    process.env.NEXT_PUBLIC_RECIPE_WEBSOCKET_URI ??
    'wss://demo.instantdb.com/runtime/session',
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

export function getLocal<T = any>(k: string): T | null {
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

export function setLocal<T = any>(k: string, v: T) {
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
