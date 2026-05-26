import { Effect } from 'effect';
import { sendSenderVerification } from '../../../lib/email.ts';

export const resendEmailCmd = Effect.gen(function* () {
  yield* sendSenderVerification;

  yield* Effect.log('Verification email re-sent!');
});
