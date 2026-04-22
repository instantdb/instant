import { Effect } from 'effect';
import chalk from 'chalk';
import boxen from 'boxen';
import type {
  authClientUpdateDef,
  OptsFromCommand,
} from '../../../index.ts';
import { BadArgsError } from '../../../errors.ts';
import { getAppsAuth, updateOAuthClient } from '../../../lib/oauth.ts';
import { GlobalOpts } from '../../../context/globalOpts.ts';
import { runUIEffect, validateRequired } from '../../../lib/ui.ts';
import { UI } from '../../../ui/index.ts';

export const authClientUpdateCmd = Effect.fn(
  function* (opts: OptsFromCommand<typeof authClientUpdateDef>) {
    if (opts.id && opts.name) {
      return yield* BadArgsError.make({
        message: 'Cannot specify both --id and --name',
      });
    }

    const { yes } = yield* GlobalOpts;
    const auth = yield* getAppsAuth();

    const client = yield* resolveClient({
      id: opts.id,
      name: opts.name,
      yes,
      clients: auth.oauth_clients ?? [],
    });

    const clientMeta = (client.meta ?? {}) as Record<string, unknown>;
    const appType =
      typeof clientMeta.appType === 'string' ? clientMeta.appType : undefined;
    // Native Google clients (ios/android/button-for-web) don't have a
    // client_secret. Everything else (web, custom providers without
    // an appType) accepts a secret.
    const supportsSecret = appType === 'web' || appType === undefined;

    const suppliedClientId =
      typeof opts.clientId === 'string' ? opts.clientId : undefined;
    const suppliedClientSecret =
      typeof opts.clientSecret === 'string'
        ? opts.clientSecret
        : undefined;

    if (yes && !suppliedClientId && !suppliedClientSecret) {
      return yield* BadArgsError.make({
        message: 'Must specify at least one of --client-id or --client-secret.',
      });
    }

    // Interactive path: when the user didn't pass either flag, prompt
    // for the fields that make sense for this client. If they passed
    // at least one explicitly, we treat the call as a targeted update
    // and don't nag for the other — supplying just a new client_secret
    // is a valid partial update.
    const promptForMissing = !yes && !suppliedClientId && !suppliedClientSecret;

    const clientId =
      suppliedClientId ??
      (promptForMissing ? yield* promptClientId() : undefined);

    const clientSecret =
      suppliedClientSecret ??
      (promptForMissing && supportsSecret
        ? yield* promptClientSecret()
        : undefined);

    const body: {
      client_id?: string;
      client_secret?: string;
      meta: { useSharedCredentials: false };
    } = {
      meta: { useSharedCredentials: false },
    };
    if (clientId) body.client_id = clientId;
    if (clientSecret) body.client_secret = clientSecret;

    const response = yield* updateOAuthClient({
      oauthClientId: client.id,
      body,
    });

    yield* Effect.log(
      boxen(
        [
          `Credentials updated for ${response.client.client_name}.`,
          '',
          'If this client was using dev credentials, it is now using',
          'the client_id / client_secret you provided.',
        ].join('\n'),
        { dimBorder: true, padding: { right: 1, left: 1 } },
      ),
    );
  },
  Effect.catchTag('BadArgsError', (e) =>
    Effect.gen(function* () {
      yield* Effect.logError(e.message);
      yield* Effect.log(
        chalk.dim(
          'hint: run `instant-cli auth client update --help` for the list of available arguments',
        ),
      );
    }),
  ),
);

// -- helpers --

const promptClientId = Effect.fn(function* () {
  return yield* runUIEffect(
    new UI.TextInput({
      prompt: 'Client ID:',
      validate: validateRequired,
      modifyOutput: UI.modifiers.piped([
        UI.modifiers.topPadding,
        UI.modifiers.dimOnComplete,
      ]),
    }),
  ).pipe(
    Effect.catchTag('UIError', (e) =>
      BadArgsError.make({ message: `UI error: ${e.message}` }),
    ),
  );
});

const promptClientSecret = Effect.fn(function* () {
  return yield* runUIEffect(
    new UI.TextInput({
      prompt: 'Client Secret:',
      validate: validateRequired,
      sensitive: true,
      modifyOutput: UI.modifiers.piped([
        UI.modifiers.topPadding,
        UI.modifiers.dimOnComplete,
      ]),
    }),
  ).pipe(
    Effect.catchTag('UIError', (e) =>
      BadArgsError.make({ message: `UI error: ${e.message}` }),
    ),
  );
});


type ClientRow = {
  id: string;
  client_name: string;
  meta?: unknown;
};

const resolveClient = Effect.fn(function* (params: {
  id: string | undefined;
  name: string | undefined;
  yes: boolean;
  clients: readonly ClientRow[];
}) {
  if (params.id) {
    const match = params.clients.find((c) => c.id === params.id);
    if (!match) {
      return yield* BadArgsError.make({
        message: `OAuth client not found: ${params.id}`,
      });
    }
    return match;
  }

  if (params.name) {
    const match = params.clients.find((c) => c.client_name === params.name);
    if (!match) {
      return yield* BadArgsError.make({
        message: `OAuth client not found: ${params.name}`,
      });
    }
    return match;
  }

  if (params.yes) {
    return yield* BadArgsError.make({
      message: 'Must specify --id or --name.',
    });
  }

  if (params.clients.length === 0) {
    return yield* BadArgsError.make({
      message: 'No OAuth clients found for this app.',
    });
  }

  return yield* runUIEffect(
    new UI.Select({
      options: params.clients.map((c) => ({
        label:
          c.client_name +
          (isSharedCred(c) ? chalk.dim('   (dev credentials)') : '') +
          chalk.dim(`   |   ${c.id}`),
        value: c,
      })),
      promptText: 'Select a client to update:',
    }),
  ).pipe(
    Effect.catchTag('UIError', (e) =>
      BadArgsError.make({ message: `UI error: ${e.message}` }),
    ),
  );
});

const isSharedCred = (c: ClientRow) =>
  Boolean(
    c.meta &&
      typeof c.meta === 'object' &&
      (c.meta as Record<string, unknown>).useSharedCredentials,
  );
