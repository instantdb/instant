import chalk from 'chalk';
import { Effect } from 'effect';
import type { WebhookAction } from '@instantdb/platform';
import type { OptsFromCommand, webhooksAddDef } from '../../index.ts';
import { Args } from '../../lib/args.ts';
import { runUIEffect } from '../../lib/ui.ts';
import { clearPromptTrail, UI } from '../../ui/index.ts';
import {
  getRemoteEtypes,
  parseActions,
  parseEtypes,
  useWebhooksManager,
  WEBHOOK_ACTIONS,
} from '../../lib/webhooks.ts';
import { BadArgsError } from '../../errors.ts';
import { GlobalOpts } from '../../context/globalOpts.ts';
import { logWebhookEvent, validateWebhookUrl } from './shared.ts';

export const webhooksAddCmd = Effect.fn(
  function* (opts: OptsFromCommand<typeof webhooksAddDef>) {
    const { yes } = yield* GlobalOpts;

    const url = yield* Args.text(opts, 'url').pipe(
      Args.prompt({
        prompt: 'Webhook URL:',
        placeholder: 'https://...',
        validate: validateWebhookUrl,
        modifyOutput: UI.modifiers.piped([
          UI.modifiers.topPadding,
          UI.modifiers.dimOnComplete,
        ]),
      }),
      Args.validate(validateWebhookUrl),
      Args.required(),
    );

    let etypes = yield* parseEtypes(opts.etypes);
    if (!etypes) {
      if (yes) {
        return yield* BadArgsError.make({
          message: 'Missing required value for --etypes (comma-separated list)',
        });
      }
      const available = yield* getRemoteEtypes;
      if (available && available.length > 0) {
        etypes = yield* runUIEffect(
          new UI.MultiSelect<string>({
            options: available.map((name) => ({ value: name, label: name })),
            promptText: 'Entity types to listen to:',
            minSelected: 1,
            modifyOutput: UI.modifiers.dimOnComplete,
          }),
        );
      } else {
        const raw = yield* runUIEffect(
          new UI.TextInput({
            prompt: 'Entity types (comma-separated):',
            placeholder: 'posts,comments',
            modifyOutput: UI.modifiers.piped([
              UI.modifiers.topPadding,
              UI.modifiers.dimOnComplete,
            ]),
          }),
        );
        etypes = yield* parseEtypes(raw);
        if (!etypes) {
          return yield* BadArgsError.make({
            message: '--etypes must include at least one entity type',
          });
        }
      }
    }

    let actions = yield* parseActions(opts.actions);
    if (!actions) {
      if (yes) {
        return yield* BadArgsError.make({
          message:
            'Missing required value for --actions (comma-separated list of create,update,delete)',
        });
      }
      actions = yield* runUIEffect(
        new UI.MultiSelect<WebhookAction>({
          options: WEBHOOK_ACTIONS.map((a) => ({ value: a, label: a })),
          promptText: 'Actions to trigger on:',
          minSelected: 1,
          modifyOutput: UI.modifiers.dimOnComplete,
        }),
      );
    }

    const webhook = yield* useWebhooksManager(
      (m) => m.create({ url, etypes, actions }),
      'Error creating webhook',
    );

    yield* Effect.sync(clearPromptTrail);
    yield* logWebhookEvent('added', webhook);
  },
  Effect.catchTag('BadArgsError', (e) =>
    Effect.gen(function* () {
      yield* Effect.logError(e.message);
      yield* Effect.log(
        chalk.dim(
          'hint: run `instant-cli webhooks add --help` for available arguments',
        ),
      );
    }),
  ),
);
