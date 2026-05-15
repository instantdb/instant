import chalk from 'chalk';
import { Effect } from 'effect';
import type {
  UpdateWebhookParams,
  WebhookAction,
  WebhookInfo,
} from '@instantdb/platform';
import type { OptsFromCommand, webhooksUpdateDef } from '../../index.ts';
import { GlobalOpts } from '../../context/globalOpts.ts';
import { BadArgsError } from '../../errors.ts';
import { runUIEffect } from '../../lib/ui.ts';
import {
  getRemoteNamespaces,
  parseActions,
  parseNamespaces,
  useWebhooksManager,
  WEBHOOK_ACTIONS,
} from '../../lib/webhooks.ts';
import { UI } from '../../ui/index.ts';
import {
  joinActions,
  joinNamespaces,
  logWebhookEvent,
  resolveWebhook,
  resolveWebhookId,
  validateWebhookUrl,
} from './shared.ts';

type MenuChoice = 'url' | 'namespaces' | 'actions' | 'save' | 'cancel';

const buildUpdateWebhookParams = Effect.fn(function* (
  url: string | undefined,
  namespaces: string[] | undefined,
  actions: WebhookAction[] | undefined,
) {
  const params: UpdateWebhookParams<any> = {};
  if (url) {
    const trimmed = url.trim();
    const err = validateWebhookUrl(trimmed);
    if (err) return yield* BadArgsError.make({ message: err });
    params.url = trimmed;
  }
  if (namespaces) params.namespaces = namespaces;
  if (actions) params.actions = actions;
  return params;
});

const sortedEq = (a: readonly string[], b: readonly string[]) => {
  if (a.length !== b.length) return false;
  const aa = [...a].sort();
  const bb = [...b].sort();
  return aa.every((v, i) => v === bb[i]);
};

const fmtScalar = (current: string, pending: string | undefined) =>
  pending !== undefined && pending !== current
    ? `${chalk.green(pending)} ${chalk.dim(`(was ${current})`)}`
    : chalk.dim(current);

const fmtList = (
  current: readonly string[],
  pending: readonly string[] | undefined,
  join: (xs: readonly string[]) => string = (xs) => xs.join(', '),
) =>
  pending !== undefined && !sortedEq(current, pending)
    ? `${chalk.green(join(pending))} ${chalk.dim(`(was ${join(current)})`)}`
    : chalk.dim(join(current));

export const webhooksUpdateCmd = Effect.fn(
  function* (opts: OptsFromCommand<typeof webhooksUpdateDef>) {
    const { yes } = yield* GlobalOpts;
    const optsNamespaces = yield* parseNamespaces(opts.namespaces);
    const optsActions = yield* parseActions(opts.actions);
    const hasAnyFieldFlag = !!opts.url || !!optsNamespaces || !!optsActions;

    if (yes) {
      if (!opts.id) {
        return yield* BadArgsError.make({ message: 'Must specify --id' });
      }
      if (!hasAnyFieldFlag) {
        return yield* BadArgsError.make({
          message:
            'Must specify at least one of --url, --namespaces, or --actions',
        });
      }
      const params = yield* buildUpdateWebhookParams(
        opts.url,
        optsNamespaces,
        optsActions,
      );
      const webhook = yield* useWebhooksManager(
        (m) => m.update(opts.id!, params),
        'Error updating webhook',
      );
      yield* logUpdated(webhook);
      return;
    }

    if (hasAnyFieldFlag) {
      const id = yield* resolveWebhookId({
        id: opts.id,
        picker: {
          promptText: 'Select a webhook to update:',
          emptyMessage: 'No webhooks configured.',
        },
      });
      if (!id) return;
      const params = yield* buildUpdateWebhookParams(
        opts.url,
        optsNamespaces,
        optsActions,
      );
      const webhook = yield* useWebhooksManager(
        (m) => m.update(id, params),
        'Error updating webhook',
      );
      yield* logUpdated(webhook);
      return;
    }

    const current = yield* resolveWebhook({
      id: opts.id,
      picker: {
        promptText: 'Select a webhook to update:',
        emptyMessage: 'No webhooks configured.',
      },
    });
    if (!current) return;

    const pending: UpdateWebhookParams<any> = {};
    let cursor: MenuChoice = 'url';

    while (true) {
      const choice: MenuChoice = yield* runUIEffect(
        new UI.Select<MenuChoice>({
          promptText: `Editing webhook ${chalk.cyan(current.sink.url)} ${chalk.dim(`(${current.id})`)}`,
          defaultValue: cursor,
          modifyOutput: UI.modifiers.vanishOnComplete,
          options: [
            {
              value: 'url',
              label: `URL: ${fmtScalar(current.sink.url, pending.url)}`,
            },
            {
              value: 'actions',
              label: `Actions: ${fmtList(current.actions, pending.actions, joinActions)}`,
            },
            {
              value: 'namespaces',
              label: `Namespaces: ${fmtList(current.namespaces, pending.namespaces, joinNamespaces)}`,
            },
            { value: 'save', label: 'Save changes', secondary: true },
            { value: 'cancel', label: 'Cancel', secondary: true },
          ],
        }),
      );

      if (choice === 'cancel') {
        yield* Effect.log('Cancelled.');
        return;
      }
      if (choice === 'save') {
        if (!hasPending(pending, current)) {
          yield* Effect.log('No changes to save.');
          return;
        }
        break;
      }

      cursor = choice;

      if (choice === 'url') {
        const seed = pending.url ?? current.sink.url;
        const rawUrl = yield* runUIEffect(
          new UI.TextInput({
            prompt: 'Webhook URL:',
            defaultValue: seed,
            placeholder: seed,
            validate: (v) => validateWebhookUrl(v.trim()),
            modifyOutput: UI.modifiers.piped([
              UI.modifiers.topPadding,
              UI.modifiers.vanishOnComplete,
            ]),
          }),
        );
        pending.url = rawUrl.trim();
      } else if (choice === 'namespaces') {
        pending.namespaces = yield* promptNamespaces(
          pending.namespaces ?? current.namespaces,
        );
      } else if (choice === 'actions') {
        pending.actions = yield* runUIEffect(
          new UI.MultiSelect<WebhookAction>({
            options: WEBHOOK_ACTIONS.map((a) => ({ value: a, label: a })),
            promptText: 'Actions to trigger on:',
            initialSelected: pending.actions ?? current.actions,
            minSelected: 1,
            modifyOutput: UI.modifiers.vanishOnComplete,
          }),
        );
      }
    }

    const webhook = yield* useWebhooksManager(
      (m) => m.update(current.id, pending),
      'Error updating webhook',
    );
    yield* logUpdated(webhook);
  },
  Effect.catchTag('BadArgsError', (e) =>
    Effect.gen(function* () {
      yield* Effect.logError(e.message);
      yield* Effect.log(
        chalk.dim(
          'hint: run `instant-cli webhook update --help` for available arguments',
        ),
      );
    }),
  ),
);

const promptNamespaces = Effect.fn(function* (initial: readonly string[]) {
  const available = yield* getRemoteNamespaces;
  if (available && available.length > 0) {
    return yield* runUIEffect(
      new UI.MultiSelect<string>({
        options: available.map((name) => ({ value: name, label: name })),
        promptText: 'Namespaces to listen to:',
        initialSelected: [...initial],
        minSelected: 1,
        modifyOutput: UI.modifiers.vanishOnComplete,
      }),
    );
  }
  const raw = yield* runUIEffect(
    new UI.TextInput({
      prompt: 'Namespaces (comma-separated):',
      defaultValue: initial.join(','),
      placeholder: initial.join(','),
      modifyOutput: UI.modifiers.piped([
        UI.modifiers.topPadding,
        UI.modifiers.vanishOnComplete,
      ]),
    }),
  );
  const parsed = yield* parseNamespaces(raw);
  if (!parsed) {
    return yield* BadArgsError.make({
      message: '--namespaces must include at least one namespace',
    });
  }
  return parsed;
});

const hasPending = (
  pending: UpdateWebhookParams<any>,
  current: WebhookInfo,
) => {
  if (pending.url !== undefined && pending.url !== current.sink.url)
    return true;
  if (
    pending.namespaces !== undefined &&
    !sortedEq(pending.namespaces, current.namespaces)
  )
    return true;
  if (
    pending.actions !== undefined &&
    !sortedEq(pending.actions, current.actions)
  )
    return true;
  return false;
};

const logUpdated = (webhook: WebhookInfo) =>
  logWebhookEvent('updated', webhook);
