export type OAuthScope =
  | 'apps-read'
  | 'apps-write'
  | 'data-read'
  | 'data-write'
  | 'storage-read'
  | 'storage-write';

export class InstantOAuthError extends Error {
  error: string;
  errorDescription: string | null | undefined;

  constructor(config: {
    message: string;
    error: string;
    errorDescription?: string | null | undefined;
  }) {
    super(config.message);

    const actualProto = new.target.prototype;
    if (Object.setPrototypeOf) {
      Object.setPrototypeOf(this, actualProto);
    }

    // Maintain proper stack trace for where our error was thrown
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, InstantOAuthError);
    }

    this.name = 'InstantOAuthError';
    this.error = config.error;
    this.errorDescription = config.errorDescription;
  }

  get [Symbol.toStringTag]() {
    return 'InstantAPIError';
  }
}
