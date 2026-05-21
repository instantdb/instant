import config from '@/lib/config';
import { InstantApp } from '@/lib/types';

export const recipesAppIdStorageKey = 'recipes-appId';

export const provisionErrorMessage =
  'Oops! Something went wrong when provisioning your app ID. Please reload the page and try again!';

const defaultAppTitle = 'Instant Example App';

export async function provisionEphemeralApp() {
  const r = await fetch(`${config.apiURI}/dash/apps/ephemeral`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      title: defaultAppTitle,
    }),
  });

  const json: { app: InstantApp } = await r.json();

  return {
    ok: r.ok,
    json,
  };
}

export async function verifyEphemeralApp({ appId }: { appId: string }) {
  const r = await fetch(`${config.apiURI}/dash/apps/ephemeral/${appId}`, {
    headers: {
      'Content-Type': 'application/json',
    },
  });

  const json: { app: InstantApp } = await r.json();

  return {
    ok: r.ok,
    json,
  };
}
