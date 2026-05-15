import { Effect } from 'effect';
import type { OptsFromCommand, webhooksEventsListDef } from '../../../index.ts';
import { fetchRecentEvents } from '../../../lib/webhooks.ts';
import { logEventDetail, resolveWebhookId } from '../shared.ts';

const EVENT_LIMIT = 100;

export const webhooksEventsListCmd = Effect.fn(function* (
  opts: OptsFromCommand<typeof webhooksEventsListDef>,
) {
  const webhookId = yield* resolveWebhookId({
    id: opts.webhookId,
    flagName: '--webhook-id',
    picker: {
      promptText: 'Select a webhook to inspect:',
      emptyMessage: 'No webhooks configured.',
    },
  });
  if (!webhookId) return;

  const events = yield* fetchRecentEvents(webhookId, EVENT_LIMIT);

  if (opts.json) {
    yield* Effect.log(JSON.stringify(events, null, 2));
    return;
  }

  if (events.length === 0) {
    yield* Effect.log('No events for this webhook.');
    return;
  }

  for (const event of events) {
    for (const line of logEventDetail(event)) {
      yield* Effect.log(line);
    }
  }
});
