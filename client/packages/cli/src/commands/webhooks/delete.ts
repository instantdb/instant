import { Effect } from 'effect';
import type { OptsFromCommand, webhooksDeleteDef } from '../../index.ts';
import { useWebhooksManager } from '../../lib/webhooks.ts';
import { logWebhookEvent, resolveWebhookId } from './shared.ts';

export const webhooksDeleteCmd = Effect.fn(function* (
  opts: OptsFromCommand<typeof webhooksDeleteDef>,
) {
  const id = yield* resolveWebhookId({
    id: opts.id,
    picker: {
      promptText: 'Select a webhook to delete:',
      emptyMessage: 'No webhooks configured.',
    },
  });
  if (!id) return;

  const webhook = yield* useWebhooksManager(
    (m) => m.delete(id),
    'Error deleting webhook',
  );
  yield* logWebhookEvent('deleted', webhook);
});
