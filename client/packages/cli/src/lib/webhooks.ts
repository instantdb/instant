import { Effect } from 'effect';
import {
  PlatformApi as InstantPlatformApi,
  type WebhookAction,
  type WebhookEventInfo,
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
 * Yields a `WebhooksManager` instance scoped to the current app. Use when you
 * need to hold on to the manager outside an Effect (e.g. to call from inside
 * an async UI callback).
 */
export const buildWebhooksManager = Effect.gen(function* () {
  const api = yield* getAuthedPlatformApi;
  const { appId } = yield* CurrentApp;
  return api.webhooks(appId).manager;
});

/**
 * Fetches the app's schema and returns the sorted list of namespace names. Returns
 * `null` if the schema can't be fetched (network, auth, missing app, etc.) so
 * callers can fall back to a plain text prompt.
 */
export const getRemoteNamespaces = Effect.gen(function* () {
  const api = yield* getAuthedPlatformApi;
  const { appId } = yield* CurrentApp;
  const result = yield* Effect.tryPromise(() => api.getSchema(appId)).pipe(
    Effect.orElseSucceed(() => null),
  );
  if (!result) return null;
  const entities = result.schema?.entities ?? {};
  return Object.keys(entities).sort();
});

/**
 * Pages through `manager.listEvents` until we have `limit` events or the server
 * runs out. Returns the events in their natural (newest-first) order.
 */
export const fetchRecentEvents = (webhookId: string, limit: number) =>
  Effect.gen(function* () {
    const collected: WebhookEventInfo[] = [];
    let after: string | undefined;
    while (collected.length < limit) {
      const page = yield* useWebhooksManager(
        (m) => m.listEvents(webhookId, after ? { after } : undefined),
        'Error listing webhook events',
      );
      collected.push(...page.events);
      if (!page.pageInfo.hasNextPage || !page.pageInfo.endCursor) break;
      after = page.pageInfo.endCursor;
    }
    return collected.slice(0, limit);
  });

const splitCsv = (s: string) =>
  s
    .split(',')
    .map((t) => t.trim())
    .filter((t) => t.length > 0);

export const parseNamespaces = (raw: string | undefined) =>
  Effect.gen(function* () {
    if (raw === undefined) return undefined;
    const namespaces = splitCsv(raw);
    if (namespaces.length === 0) {
      return yield* BadArgsError.make({
        message: '--namespaces must include at least one namespace',
      });
    }
    return namespaces;
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
