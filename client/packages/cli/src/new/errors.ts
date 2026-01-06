import { Schema } from 'effect';

export class BadArgsError extends Schema.TaggedError<BadArgsError>(
  'BadArgsError',
)('BadArgsError', {
  message: Schema.String,
}) {}
