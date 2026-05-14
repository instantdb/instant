import chalk from 'chalk';
import { Effect } from 'effect';
import type {
  OptsFromCommand,
  webhooksEventsResendDef,
} from '../../../index.ts';
import { GlobalOpts } from '../../../context/globalOpts.ts';
import { BadArgsError } from '../../../errors.ts';
import { useWebhooksManager } from '../../../lib/webhooks.ts';
import {
  colorStatus,
  logEventDetail,
  pickEvent,
  resolveWebhookId,
} from '../shared.ts';

export const webhooksEventsResendCmd = Effect.fn(
  function* (opts: OptsFromCommand<typeof webhooksEventsResendDef>) {
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
        promptText: 'Select an event to resend:',
        emptyMessage: 'No events for this webhook.',
      });
      if (!picked) return;
      isn = picked.isn;
    }

    const event = yield* useWebhooksManager(
      (m) => m.resendEvent(webhookId, isn!),
      'Error resending event',
    );

    yield* Effect.log(`Resent event ${chalk.cyan(event.isn)}`);
    yield* Effect.log(`Status: ${colorStatus(event.status)}`);
    for (const line of logEventDetail(event).slice(1)) {
      yield* Effect.log(line);
    }
  },
  Effect.catchTag('BadArgsError', (e) =>
    Effect.gen(function* () {
      yield* Effect.logError(e.message);
      yield* Effect.log(
        chalk.dim(
          'hint: run `instant-cli webhooks events resend --help` for available arguments',
        ),
      );
    }),
  ),
);
