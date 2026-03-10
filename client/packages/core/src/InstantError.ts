export class InstantError extends Error {
  hint?: unknown;
  traceId?: string;

  constructor(message: string, hint?: unknown, traceId?: string) {
    super(message);
    this.hint = hint;
    if (traceId) {
      this.traceId = traceId;
    }

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
