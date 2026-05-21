import { validate as isUuid } from 'uuid';
import config from '@/lib/config';
import { InstantApp } from '@/lib/types';

export const recipesAppIdStorageKey = 'recipes-appId';

export const provisionErrorMessage =
  'Oops! Something went wrong when provisioning your app ID. Please reload the page and try again!';

const defaultAppTitle = 'Instant Example App';

type EphemeralAppResult =
  | { ok: true; json: { app: InstantApp } }
  | { ok: false; json: null };

export async function provisionEphemeralApp(): Promise<EphemeralAppResult> {
  try {
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
    return r.ok ? { ok: true, json } : { ok: false, json: null };
  } catch {
    return { ok: false, json: null };
  }
}

export async function verifyEphemeralApp({
  appId,
}: {
  appId: string;
}): Promise<EphemeralAppResult> {
  if (!isUuid(appId)) {
    return { ok: false, json: null };
  }
  try {
    const r = await fetch(`${config.apiURI}/dash/apps/ephemeral/${appId}`, {
      headers: {
        'Content-Type': 'application/json',
      },
    });
    const json: { app: InstantApp } = await r.json();
    return r.ok ? { ok: true, json } : { ok: false, json: null };
  } catch {
    return { ok: false, json: null };
  }
}
