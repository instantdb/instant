import boxen from 'boxen';
import chalk from 'chalk';
import { Effect } from 'effect';
import type {
  WebhookAction,
  WebhookEventInfo,
  WebhookEventStatus,
  WebhookInfo,
} from '@instantdb/platform';
import { GlobalOpts } from '../../context/globalOpts.ts';
import { BadArgsError } from '../../errors.ts';
import { runUIEffect } from '../../lib/ui.ts';
import {
  buildWebhooksManager,
  fetchRecentEvents,
  useWebhooksManager,
  WEBHOOK_ACTIONS,
} from '../../lib/webhooks.ts';
import { UI } from '../../ui/index.ts';

type PickerParams = {
  promptText: string;
  emptyMessage: string;
  filter?: (w: WebhookInfo) => boolean;
};

export const joinEtypes = (etypes: readonly string[]) =>
  [...etypes].sort().join(', ');

export const joinActions = (actions: readonly string[]) =>
  [...actions]
    .sort(
      (a, b) =>
        WEBHOOK_ACTIONS.indexOf(a as WebhookAction) -
        WEBHOOK_ACTIONS.indexOf(b as WebhookAction),
    )
    .join(', ');

const renderWebhookLabel = (w: WebhookInfo) =>
  [
    `${w.sink.url} ${chalk.dim(`(${w.id})`)}`,
    chalk.dim(`  status: ${w.status}`),
    chalk.dim(`  actions: ${joinActions(w.actions)}`),
    chalk.dim(`  etypes: ${joinEtypes(w.etypes)}`),
  ].join('\n');

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
    `Status: ${webhook.status}`,
    `Actions: ${joinActions(webhook.actions)}`,
    `Etypes: ${joinEtypes(webhook.etypes)}`,
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

export const colorStatus = (status: WebhookEventStatus): string => {
  switch (status) {
    case 'success':
      return chalk.green(status);
    case 'failed':
      return chalk.red(status);
    case 'error':
      return chalk.yellow(status);
    case 'processing':
      return chalk.cyan(status);
    case 'pending':
      return chalk.dim(status);
  }
};

const lastAttemptSummary = (event: WebhookEventInfo): string => {
  if (!event.attempts || event.attempts.length === 0) return 'no attempts';
  const last = event.attempts[event.attempts.length - 1]!;
  const code =
    last.statusCode != null
      ? String(last.statusCode)
      : (last.errorType ?? 'error');
  const dur = last.durationMs != null ? `, ${last.durationMs}ms` : '';
  return `${code}${dur}`;
};

export const renderEventLabel = (e: WebhookEventInfo): string => {
  const attempts = e.attempts?.length ?? 0;
  const attemptsPart =
    attempts === 0 ? '—' : `${attempts} attempt${attempts === 1 ? '' : 's'}`;
  return `${e.isn}  ${colorStatus(e.status)}  ${chalk.dim(`${attemptsPart} · last: ${lastAttemptSummary(e)}`)}`;
};

const fmtTime = (d: Date | null) =>
  d ? d.toISOString().replace('T', ' ').replace(/\..*$/, '') : 'n/a';

export const logEventDetail = (e: WebhookEventInfo): string[] => {
  const lines = [
    `${chalk.cyan(e.isn)}`,
    `  Status: ${colorStatus(e.status)}`,
    `  Created: ${fmtTime(e.createdAt)}`,
    `  Updated: ${fmtTime(e.updatedAt)}`,
    `  Attempts: ${e.attempts?.length ?? 0}${
      e.attempts && e.attempts.length > 0
        ? ` (last: ${lastAttemptSummary(e)})`
        : ''
    }`,
  ];
  if (e.nextAttemptAfter) {
    lines.push(`  Next attempt: ${fmtTime(e.nextAttemptAfter)}`);
  }
  return lines;
};

const formatExpandedEvent = (e: WebhookEventInfo): string => {
  const lines: string[] = [];
  lines.push(chalk.dim(`    Created:      ${fmtTime(e.createdAt)}`));
  lines.push(chalk.dim(`    Updated:      ${fmtTime(e.updatedAt)}`));
  if (e.nextAttemptAfter) {
    lines.push(chalk.dim(`    Next attempt: ${fmtTime(e.nextAttemptAfter)}`));
  }
  if (e.attempts && e.attempts.length > 0) {
    lines.push(chalk.dim(`    Attempts:`));
    e.attempts.forEach((a, i) => {
      const code =
        a.statusCode != null ? String(a.statusCode) : (a.errorType ?? 'error');
      const dur = a.durationMs != null ? `${a.durationMs}ms` : '—';
      const ok = a.success === true;
      const codeColored = ok
        ? chalk.green(code)
        : a.success === false
          ? chalk.red(code)
          : chalk.yellow(code);
      lines.push(
        chalk.dim(`      ${i + 1}. ${fmtTime(a.attemptAt)} → `) +
          codeColored +
          chalk.dim(` (${dur})`),
      );
      if (a.errorMessage) {
        lines.push(chalk.dim(`         ${a.errorMessage}`));
      }
      if (a.responseText) {
        const trimmed = a.responseText.replace(/\s+/g, ' ').trim();
        const max = Math.max(20, (process.stdout.columns ?? 80) - 13);
        const body =
          trimmed.length > max ? trimmed.slice(0, max - 1) + '…' : trimmed;
        lines.push(chalk.dim(`         body: ${body}`));
      }
    });
  } else {
    lines.push(chalk.dim(`    Attempts:     none yet`));
  }
  return lines.join('\n');
};

export const pickEvent = (params: {
  webhookId: string;
  limit?: number;
  promptText: string;
  emptyMessage: string;
}) =>
  Effect.gen(function* () {
    const events = yield* fetchRecentEvents(
      params.webhookId,
      params.limit ?? 25,
    );
    if (events.length === 0) {
      yield* Effect.log(params.emptyMessage);
      return undefined;
    }
    const manager = yield* buildWebhooksManager;
    return yield* runUIEffect(
      new UI.Select<WebhookEventInfo>({
        options: events.map((e) => ({
          label: renderEventLabel(e),
          expandableLabel: async () => {
            const base = formatExpandedEvent(e);
            try {
              const payload = await manager.getPayload(params.webhookId, e.isn);
              const json = JSON.stringify(payload, null, 2);
              const indented = json
                .split('\n')
                .map((l) => '    ' + l)
                .join('\n');
              return `${base}\n${chalk.dim('    Payload:')}\n${chalk.dim(indented)}`;
            } catch (err: any) {
              return `${base}\n${chalk.red(`    Payload error: ${err?.message ?? err}`)}`;
            }
          },
          value: e,
        })),
        promptText: params.promptText,
      }),
    );
  });

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
