import { Effect } from 'effect';
import { pushEmail } from '../../../lib/email.ts';

type AuthEmailPushOpts = {
  file?: string;
};

export const authEmailPushCmd = Effect.fn(function* (opts: AuthEmailPushOpts) {
  yield* pushEmail(opts.file);
});
