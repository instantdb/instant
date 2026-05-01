import chalk from 'chalk';
import { Effect } from 'effect';
import type { authClientListDef, OptsFromCommand } from '../../../index.ts';
import { getAppsAuth } from '../../../lib/oauth.ts';

const formatValue = (value: string | null | undefined) => value ?? 'n/a';

export const authClientListCmd = Effect.fn(function* (
  _opts: OptsFromCommand<typeof authClientListDef>,
) {
  const info = yield* getAppsAuth();
  if (_opts.json) {
    yield* Effect.log(JSON.stringify(info.oauth_clients, null, 2));
    return;
  }

  const providersById = new Map(
    (info.oauth_service_providers ?? []).map((provider) => [
      provider.id,
      provider,
    ]),
  );
  const clients = info.oauth_clients ?? [];

  if (clients.length === 0) {
    yield* Effect.log('No OAuth clients configured.');
    return;
  }

  for (const client of clients) {
    const provider = providersById.get(client.provider_id);

    yield* Effect.log(chalk.cyan(client.client_name));
    yield* Effect.log(
      `  Provider: ${provider?.provider_name ?? client.provider_id}`,
    );
    const clientAppType = client.meta?.appType;
    if (clientAppType) {
      yield* Effect.log(`  App type: ${clientAppType}`);
    }
    yield* Effect.log(
      `  Credentials: ${client.use_shared_credentials ? 'Instant dev credentials' : 'custom'}`,
    );
    yield* Effect.log(`  ID: ${client.id}`);
    yield* Effect.log(
      `  Client id: ${
        client.use_shared_credentials
          ? 'managed by Instant'
          : formatValue(client.client_id)
      }`,
    );
    yield* Effect.log(
      `  Redirect URL: ${
        client.use_shared_credentials
          ? 'localhost and Expo allowed automatically'
          : formatValue(client.redirect_to)
      }`,
    );
  }
});
