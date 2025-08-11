import { InstantError } from '../InstantError.ts';

type InstantIssueBody =
  | { type: 'param-missing'; message: string; hint: { in: string[] } }
  | { type: 'param-malformed'; message: string; hint: { in: string[] } }
  | {
      type: 'record-not-found';
      message: string;
      hint: { 'record-type': string };
    }
  | {
      type: 'record-not-unique';
      message: string;
      hint: { 'record-type': string };
    }
  | {
      type: 'validation-failed';
      message: string;
      hint: { 'data-type': string; errors: any[] };
    }
  | {
      type: 'record-expired';
      message: string;
      hint: { 'record-type': string };
    }
  | {
      type: 'record-foreign-key-invalid';
      message: string;
      hint: { table?: string; condition?: string; constraint?: string };
    }
  | {
      type: 'record-check-violation';
      message: string;
      hint: { table?: string; condition?: string; constraint?: string };
    }
  | {
      type: 'permission-denied';
      message: string;
      hint: { input: any; expected: string };
    }
  | {
      type: 'permission-evaluation-failed';
      message: string;
      hint: {
        rule: [string, string];
        error?: { type: string; message: string; hint: any };
      };
    }
  | {
      type: 'sql-raise';
      message: string;
      hint: { table?: string; condition?: string; constraint?: string };
    }
  | {
      type: 'sql-exception';
      message: string;
      hint: { table?: string; condition?: string; constraint?: string };
    }
  | {
      type: 'rate-limited';
      message: string;
    }
  | {
      type: 'session-missing';
      message: string;
      hint: { 'sess-id': string };
    }
  | {
      type: 'socket-missing';
      message: string;
      hint: { 'sess-id': string; 'exception-message'?: string };
    }
  | { type: undefined; [k: string]: any }
  | undefined;
// Note that InstantIssueBody is not exported and is only necessary for making InstantAPIError
// below to have all the members and typecheck as InstantIssue
export type InstantIssue = {
  body: InstantIssueBody;
  status: number;
};

export class InstantAPIError extends InstantError {
  body: InstantIssueBody;
  status: number;

  constructor(error: InstantIssue) {
    // Create a descriptive message based on the error
    const message = error.body?.message || `API Error (${error.status})`;
    super(message, (error.body as any).hint);

    const actualProto = new.target.prototype;
    if (Object.setPrototypeOf) {
      Object.setPrototypeOf(this, actualProto);
    }

    // Maintain proper stack trace for where our error was thrown
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, InstantAPIError);
    }

    this.name = 'InstantAPIError';
    this.status = error.status;
    this.body = error.body;
  }

  get [Symbol.toStringTag]() {
    return 'InstantAPIError';
  }
}

export async function jsonFetch(
  input: RequestInfo,
  init: RequestInit | undefined,
): Promise<any> {
  const res = await fetch(input, init);
  const json = await res.json();
  return res.status === 200
    ? Promise.resolve(json)
    : Promise.reject(new InstantAPIError({ status: res.status, body: json }));
}
