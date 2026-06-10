import { Effect } from 'effect';
import type { authEmailVerifyDef, OptsFromCommand } from '../../../index.ts';
import { getVerification, submitVerification } from '../../../lib/email.ts';

export const verifyCmd = Effect.fn(function* (
  code: string,
  _opts: OptsFromCommand<typeof authEmailVerifyDef>,
) {
  yield* submitVerification(code);

  // get verification status
  const verificationInfo = yield* getVerification;

  if (
    verificationInfo.instant['verified?'] &&
    verificationInfo.verification?.Confirmed
  ) {
    yield* Effect.log('Verification successful for both Postmark and Instant!');
  }
});
