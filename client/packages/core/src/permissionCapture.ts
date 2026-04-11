import id from './utils/id';
import type { Query } from './queryTypes';
import type { AuthState } from './clientTypes';
import type { InstantRules } from './schemaTypes';

export interface PermissionFailure {
  id: string;
  timestamp: number;
  query: Query;
  rules: InstantRules;
  authState: AuthState | null;
  errorMessage: string;
  errorCode?: string;
}

const MAX_CAPTURED_FAILURES = 100;

let capturedFailures: PermissionFailure[] = [];

export function capturePermissionFailure(
  query: Query,
  rules: InstantRules,
  authState: AuthState | null,
  error: { message: string; code?: string }
): void {
  const failure: PermissionFailure = {
    id: id(),
    timestamp: Date.now(),
    query,
    rules,
    authState,
    errorMessage: error.message,
    errorCode: error.code,
  };

  capturedFailures.push(failure);

  if (capturedFailures.length > MAX_CAPTURED_FAILURES) {
    capturedFailures.shift();
  }
}

export function getCapturedPermissionFailures(): PermissionFailure[] {
  return [...capturedFailures];
}

export function clearCapturedPermissionFailures(): void {
  capturedFailures = [];
}
