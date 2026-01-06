import { HttpClientRequest, HttpClientResponse } from '@effect/platform';
import { randomUUID } from 'crypto';
import { Context, Data, Effect, Layer, Runtime, Schema } from 'effect';
import { UI } from '../../ui/index.js';
import { handleEnv } from '../lib/handleEnv.js';
import { getBaseUrl, InstantHttpAuthed } from '../lib/http.js';
import { runUIEffect } from '../lib/ui.js';
import { AuthToken } from './authToken.js';
import { GlobalOpts } from './globalOpts.js';
import { PlatformApi } from './platformApi.js';

export type CurrentAppInfo = {
  appId: string;
  adminToken?: string;
  source: 'create' | 'import' | 'env' | 'flag' | 'ephemeral';
};

export class CurrentApp extends Context.Tag(
  'instant-cli/new/context/currentApp',
)<CurrentApp, CurrentAppInfo>() {}

function isUUID(uuid: string) {
  const uuidRegex =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return uuidRegex.test(uuid);
}

export class CurrentAppContextError extends Data.TaggedError(
  'CurrentAppContextError',
)<{
  message: string;
}> {}

export class AppNotFoundError extends Data.TaggedError('AppNotFoundError')<{
  message: string;
}> {}

export const potentialEnvs: Record<string, string> = {
  catchall: 'INSTANT_APP_ID',
  next: 'NEXT_PUBLIC_INSTANT_APP_ID',
  svelte: 'PUBLIC_INSTANT_APP_ID',
  vite: 'VITE_INSTANT_APP_ID',
  expo: 'EXPO_PUBLIC_INSTANT_APP_ID',
  nuxt: 'NUXT_PUBLIC_INSTANT_APP_ID',
};

// TODO: add instant.config.ts support
export const CurrentAppLive = (args: {
  appId?: string;
  coerce?: boolean;
  title?: string;
  applyEnv?: boolean;
}) =>
  Layer.effect(
    CurrentApp,
    Effect.gen(function* () {
      if (args.appId) {
        return {
          appId: args.appId,
          source: 'flag' as const,
        };
      }

      // Detect from ENV
      const found = Object.keys(potentialEnvs)
        .map((type) => {
          const envName = potentialEnvs[type];
          const value = process.env[envName];
          return { type, envName, value };
        })
        .find(({ value }) => !!value);

      if (found?.value && !isUUID(found.value)) {
        return yield* new CurrentAppContextError({
          message: `Invalid UUID: ${found.value}`,
        });
      } else if (found?.value) {
        return {
          appId: found?.value,
          source: 'env' as const,
        };
      }
      return yield* new AppNotFoundError({
        message: 'No app found',
      });
    }).pipe(
      // coerce into new app if app not found
      Effect.catchTag('AppNotFoundError', () =>
        Effect.gen(function* () {
          if (!args.coerce)
            return yield* new AppNotFoundError({ message: 'No app found' });

          // coerce into a new app
          const globalOpts = yield* GlobalOpts;
          if (globalOpts.yes) {
            if (!args.title) {
              return yield* new CurrentAppContextError({
                message: `Title is required when using --yes and no app is linked`,
              });
            } else {
              return yield* createApp(args.title);
            }
          }

          return yield* promptImportOrCreateApp;
        }),
      ),

      // Handle save env
      Effect.tap((app) =>
        Effect.gen(function* () {
          if (
            args.applyEnv &&
            (app.source === 'import' || app.source == 'create')
          ) {
            yield* handleEnv(app);
          }
        }),
      ),
    ),
  );

const createApp = Effect.fn(function* (title: string, orgId?: string) {
  const id = randomUUID();
  const token = randomUUID();
  const app = { id, title, admin_token: token, org_id: orgId };

  const http = yield* InstantHttpAuthed;
  yield* HttpClientRequest.post('/dash/apps').pipe(
    HttpClientRequest.bodyJson(app),
    Effect.flatMap(http.execute),
  );
  return {
    appId: id,
    source: 'create',
    adminToken: token,
  } satisfies CurrentAppInfo;
});

const promptImportOrCreateApp = Effect.gen(function* () {
  const api = yield* getSimpleApi;
  const result = yield* runUIEffect(
    new UI.AppSelector({
      allowEphemeral: true,
      allowCreate: true,
      api,
    }),
  );

  return {
    appId: result.appId,
    source: result.approach,
    adminToken: result.adminToken,
  } satisfies CurrentAppInfo;
});

const getSimpleApi = Effect.gen(function* () {
  const effectRuntime = yield* Effect.runtime<never>();

  const http = yield* InstantHttpAuthed;
  const dashData = yield* http
    .get('/dash')
    .pipe(Effect.flatMap(HttpClientResponse.schemaBodyJson(Schema.Any)));
  const platform = yield* PlatformApi;

  const baseUrl = yield* getBaseUrl;
  const { authToken } = yield* AuthToken;

  return {
    getDash: () => dashData,
    createApp: async (title, orgId) => {
      return Runtime.runPromise(
        effectRuntime,
        createApp(title, orgId).pipe(
          Effect.provideService(InstantHttpAuthed, http),
        ),
      );
    },

    createEphemeralApp: async (title) => {
      return await Runtime.runPromise(
        effectRuntime,
        Effect.gen(function* () {
          const platform = yield* PlatformApi;
          const response = yield* platform.use(
            (p) => p.createTemporaryApp({ title: title }),
            'Error creating temporary app',
          );
          return {
            appId: response.app.id,
            adminToken: response.app.adminToken,
          };
        }).pipe(Effect.provideService(PlatformApi, platform)),
      );
    },

    async getAppsForOrg(orgId) {
      const response = await fetch(baseUrl + '/dash/orgs/' + orgId, {
        headers: {
          Authorization: `Bearer ${authToken}`,
        },
      });
      const data = await response.json();
      return { apps: data.apps };
    },
  } satisfies UI.AppSelectorApi;
});
