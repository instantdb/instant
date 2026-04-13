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
    yield* Effect.log(`  ID: ${client.id}`);
    yield* Effect.log(`  Client id: ${formatValue(client.client_id)}`);
    yield* Effect.log(`  Redirect URL: ${formatValue(client.redirect_to)}`);
    yield* Effect.log(
      `  Discovery endpoint: ${formatValue(client.discovery_endpoint)}`,
    );
    yield* Effect.log(
      `  Authorization endpoint: ${formatValue(client.authorization_endpoint)}`,
    );
    yield* Effect.log(
      `  Token endpoint: ${formatValue(client.token_endpoint)}`,
    );
  }
});
