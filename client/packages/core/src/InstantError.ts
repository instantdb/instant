export class InstantError extends Error {
  hint?: unknown;

  constructor(message: string, hint?: unknown) {
    super(message);
    this.hint = hint;

    const actualProto = new.target.prototype;
    if (Object.setPrototypeOf) {
      Object.setPrototypeOf(this, actualProto);
    }

    // Maintain proper stack trace for where our error was thrown
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, InstantError);
    }

    this.name = 'InstantError';
  }

  get [Symbol.toStringTag]() {
    return 'InstantError';
  }
}
