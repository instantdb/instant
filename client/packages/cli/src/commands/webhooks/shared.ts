import boxen from 'boxen';
import chalk from 'chalk';
import { Effect } from 'effect';
import type { WebhookInfo } from '@instantdb/platform';
import { GlobalOpts } from '../../context/globalOpts.ts';
import { BadArgsError } from '../../errors.ts';
import { runUIEffect } from '../../lib/ui.ts';
import { useWebhooksManager } from '../../lib/webhooks.ts';
import { UI } from '../../ui/index.ts';

type PickerParams = {
  promptText: string;
  emptyMessage: string;
  filter?: (w: WebhookInfo) => boolean;
};

const truncate = (s: string, max: number) =>
  s.length > max ? s.slice(0, Math.max(1, max - 1)) + '…' : s;

const renderWebhookLabel = (w: WebhookInfo) => {
  const meta = `etypes: ${w.etypes.join(', ')} · actions: ${w.actions.join(', ')} · status: ${w.status}`;
  const width = process.stdout.columns ?? 80;
  const metaBudget = Math.max(20, width - 4);
  return `${w.sink.url} ${chalk.dim(`(${w.id})`)}\n  ${chalk.dim(truncate(meta, metaBudget))}`;
};

const pickWebhook = (params: PickerParams) =>
  Effect.gen(function* () {
    const all = yield* useWebhooksManager(
      (m) => m.list(),
      'Error listing webhooks',
    );
    const webhooks = params.filter ? all.filter(params.filter) : all;
    if (webhooks.length === 0) {
      yield* Effect.log(params.emptyMessage);
      return undefined;
    }
    return yield* runUIEffect(
      new UI.Select<WebhookInfo>({
        options: webhooks.map((w) => ({
          label: renderWebhookLabel(w),
          value: w,
        })),
        promptText: params.promptText,
      }),
    );
  });

export const resolveWebhookId = (params: {
  id: string | undefined;
  picker: PickerParams;
}) =>
  Effect.gen(function* () {
    if (params.id) return params.id;
    const { yes } = yield* GlobalOpts;
    if (yes) {
      return yield* BadArgsError.make({ message: 'Must specify --id' });
    }
    const picked = yield* pickWebhook(params.picker);
    return picked?.id;
  });

export const logWebhookEvent = (action: string, webhook: WebhookInfo) => {
  const lines = [
    `Webhook ${action}: ${webhook.sink.url}`,
    `ID: ${webhook.id}`,
    `Etypes: ${webhook.etypes.join(', ')}`,
    `Actions: ${webhook.actions.join(', ')}`,
    `Status: ${webhook.status}`,
  ];
  if (webhook.disabledReason) {
    lines.push(`Disabled reason: ${webhook.disabledReason}`);
  }
  return Effect.log(
    '\n' +
      boxen(lines.join('\n'), {
        dimBorder: true,
        padding: { right: 1, left: 1 },
      }),
  );
};

export const resolveWebhook = (params: {
  id: string | undefined;
  picker: PickerParams;
}) =>
  Effect.gen(function* () {
    if (params.id) {
      const all = yield* useWebhooksManager(
        (m) => m.list(),
        'Error listing webhooks',
      );
      const found = all.find((w) => w.id === params.id);
      if (!found) {
        return yield* BadArgsError.make({
          message: `No webhook found with id ${params.id}`,
        });
      }
      return found;
    }
    const { yes } = yield* GlobalOpts;
    if (yes) {
      return yield* BadArgsError.make({ message: 'Must specify --id' });
    }
    return yield* pickWebhook(params.picker);
  });
