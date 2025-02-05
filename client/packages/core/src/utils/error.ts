export function assert(condition: any, msg?: string): asserts condition {
  if (!condition) {
    throw new Error('[assertion error] ' + msg);
  }
}

export function assertUnreachable(_x: never): never {
  throw new Error('[assertion error] TS should prevent us from reaching here');
}
