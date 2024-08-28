export const isBrowser = typeof window != 'undefined';

export const isDev = process.env.NODE_ENV === 'development';

export const isTouchDevice =
  typeof window !== 'undefined' && 'ontouchstart' in window;

const config = {
  apiURI: process.env.NEXT_PUBLIC_API_URI,
  websocketURI: process.env.NEXT_PUBLIC_WEBSOCKET_URI
};

export default config;

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

export function getLocal(k: string) {
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

export function setLocal(k: string, v: any) {
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
