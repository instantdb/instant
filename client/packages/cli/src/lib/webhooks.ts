import { Effect } from 'effect';
import {
  PlatformApi as InstantPlatformApi,
  type WebhookAction,
  type WebhooksManager,
} from '@instantdb/platform';
import { AuthToken } from '../context/authToken.ts';
import { CurrentApp } from '../context/currentApp.ts';
import { PlatformApiError } from '../context/platformApi.ts';
import { BadArgsError } from '../errors.ts';
import { getBaseUrl } from './http.ts';

const getAuthedPlatformApi = Effect.gen(function* () {
  const apiURI = yield* getBaseUrl;
  const authToken = yield* AuthToken;
  const token = yield* authToken.getAuthToken;
  return new InstantPlatformApi({ apiURI, auth: { token } });
});

export const WEBHOOK_ACTIONS: readonly WebhookAction[] = [
  'create',
  'update',
  'delete',
] as const;

export const useWebhooksManager = <R>(
  fun: (manager: WebhooksManager<any>) => Promise<R>,
  errorMessage?: string,
) =>
  Effect.gen(function* () {
    const api = yield* getAuthedPlatformApi;
    const { appId } = yield* CurrentApp;
    return yield* Effect.tryPromise({
      try: () => fun(api.webhooks(appId).manager),
      catch: (e) =>
        new PlatformApiError({
          message: errorMessage ?? 'Error using webhooks api',
          cause: e,
        }),
    });
  });

/**
 * Fetches the app's schema and returns the sorted list of etype names. Returns
 * `null` if the schema can't be fetched (network, auth, missing app, etc.) so
 * callers can fall back to a plain text prompt.
 */
export const getRemoteEtypes = Effect.gen(function* () {
  const api = yield* getAuthedPlatformApi;
  const { appId } = yield* CurrentApp;
  const result = yield* Effect.tryPromise(() => api.getSchema(appId)).pipe(
    Effect.orElseSucceed(() => null),
  );
  if (!result) return null;
  const entities = result.schema?.entities ?? {};
  return Object.keys(entities).sort();
});

const splitCsv = (s: string) =>
  s
    .split(',')
    .map((t) => t.trim())
    .filter((t) => t.length > 0);

export const parseEtypes = (raw: string | undefined) =>
  Effect.gen(function* () {
    if (raw === undefined) return undefined;
    const etypes = splitCsv(raw);
    if (etypes.length === 0) {
      return yield* BadArgsError.make({
        message: '--etypes must include at least one entity type',
      });
    }
    return etypes;
  });

export const parseActions = (raw: string | undefined) =>
  Effect.gen(function* () {
    if (raw === undefined) return undefined;
    const tokens = splitCsv(raw);
    if (tokens.length === 0) {
      return yield* BadArgsError.make({
        message: '--actions must include at least one action',
      });
    }
    const invalid = tokens.filter(
      (t): t is string => !WEBHOOK_ACTIONS.includes(t as WebhookAction),
    );
    if (invalid.length > 0) {
      return yield* BadArgsError.make({
        message: `Invalid action${invalid.length === 1 ? '' : 's'}: ${invalid.join(', ')}. Must be one of: ${WEBHOOK_ACTIONS.join(', ')}`,
      });
    }
    return tokens as WebhookAction[];
  });
