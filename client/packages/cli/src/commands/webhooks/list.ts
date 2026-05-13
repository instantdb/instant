import chalk from 'chalk';
import { Effect } from 'effect';
import type { WebhookInfo } from '@instantdb/platform';
import type { OptsFromCommand, webhooksListDef } from '../../index.ts';
import { useWebhooksManager } from '../../lib/webhooks.ts';

export const renderWebhook = (webhook: WebhookInfo) =>
  Effect.gen(function* () {
    yield* Effect.log(chalk.cyan(webhook.sink.url));
    yield* Effect.log(`  ID: ${webhook.id}`);
    yield* Effect.log(`  Etypes: ${webhook.etypes.join(', ')}`);
    yield* Effect.log(`  Actions: ${webhook.actions.join(', ')}`);
    yield* Effect.log(`  Status: ${webhook.status}`);
    if (webhook.disabledReason) {
      yield* Effect.log(`  Disabled reason: ${webhook.disabledReason}`);
    }
  });

export const webhooksListCmd = Effect.fn(function* (
  opts: OptsFromCommand<typeof webhooksListDef>,
) {
  const webhooks = yield* useWebhooksManager(
    (m) => m.list(),
    'Error listing webhooks',
  );

  if (opts.json) {
    yield* Effect.log(JSON.stringify(webhooks, null, 2));
    return;
  }

  if (webhooks.length === 0) {
    yield* Effect.log('No webhooks configured.');
    return;
  }

  for (const webhook of webhooks) {
    yield* renderWebhook(webhook);
  }
});
