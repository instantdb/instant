import { Effect } from 'effect';
import type { OptsFromCommand, webhooksDisableDef } from '../../index.ts';
import { useWebhooksManager } from '../../lib/webhooks.ts';
import { logWebhookEvent, resolveWebhookId } from './shared.ts';

export const webhooksDisableCmd = Effect.fn(function* (
  opts: OptsFromCommand<typeof webhooksDisableDef>,
) {
  const id = yield* resolveWebhookId({
    id: opts.id,
    picker: {
      promptText: 'Select a webhook to disable:',
      emptyMessage: 'No active webhooks.',
      filter: (w) => w.status === 'active',
    },
  });
  if (!id) return;

  const webhook = yield* useWebhooksManager(
    (m) =>
      m.disable(id, opts.reason ? { reason: opts.reason } : undefined),
    'Error disabling webhook',
  );
  yield* logWebhookEvent('disabled', webhook);
});
