import { onScopeDispose, getCurrentScope } from 'vue';

/**
 * Run `fn` when the current effect scope is disposed. Returns true if a scope
 * was active (and the callback was registered), false otherwise. Lets hooks
 * work both inside component setup and inside a manual `effectScope()` without
 * blowing up when called outside any scope.
 */
export function tryOnScopeDispose(fn: () => void): boolean {
  if (getCurrentScope()) {
    onScopeDispose(fn);
    return true;
  }
  return false;
}
