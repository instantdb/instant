import chalk from 'chalk';
import { Effect } from 'effect';
import type {
  OptsFromCommand,
  webhooksEventsPayloadDef,
} from '../../../index.ts';
import { GlobalOpts } from '../../../context/globalOpts.ts';
import { BadArgsError } from '../../../errors.ts';
import { useWebhooksManager } from '../../../lib/webhooks.ts';
import { pickEvent, resolveWebhookId } from '../shared.ts';

export const webhooksEventsPayloadCmd = Effect.fn(
  function* (opts: OptsFromCommand<typeof webhooksEventsPayloadDef>) {
    const { yes } = yield* GlobalOpts;

    const webhookId = yield* resolveWebhookId({
      id: opts.webhookId,
      flagName: '--webhook-id',
      picker: {
        promptText: 'Select a webhook:',
        emptyMessage: 'No webhooks configured.',
      },
    });
    if (!webhookId) return;

    let isn = opts.isn;
    if (!isn) {
      if (yes) {
        return yield* BadArgsError.make({ message: 'Must specify --isn' });
      }
      const picked = yield* pickEvent({
        webhookId,
        promptText: 'Select an event:',
        emptyMessage: 'No events for this webhook.',
      });
      if (!picked) return;
      isn = picked.isn;
    }

    const payload = yield* useWebhooksManager(
      (m) => m.getPayload(webhookId, isn!),
      'Error fetching event payload',
    );
    yield* Effect.log(JSON.stringify(payload, null, 2));
  },
  Effect.catchTag('BadArgsError', (e) =>
    Effect.gen(function* () {
      yield* Effect.logError(e.message);
      yield* Effect.log(
        chalk.dim(
          'hint: run `instant-cli webhook event payload --help` for available arguments',
        ),
      );
    }),
  ),
);
