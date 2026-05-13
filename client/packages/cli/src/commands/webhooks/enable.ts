import { Effect } from 'effect';
import type { OptsFromCommand, webhooksEnableDef } from '../../index.ts';
import { useWebhooksManager } from '../../lib/webhooks.ts';
import { logWebhookEvent, resolveWebhookId } from './shared.ts';

export const webhooksEnableCmd = Effect.fn(function* (
  opts: OptsFromCommand<typeof webhooksEnableDef>,
) {
  const id = yield* resolveWebhookId({
    id: opts.id,
    picker: {
      promptText: 'Select a webhook to enable:',
      emptyMessage: 'No disabled webhooks.',
      filter: (w) => w.status === 'disabled',
    },
  });
  if (!id) return;

  const webhook = yield* useWebhooksManager(
    (m) => m.enable(id),
    'Error enabling webhook',
  );
  yield* logWebhookEvent('enabled', webhook);
});
