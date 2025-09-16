import type { InstantSchemaDef } from '../schemaTypes.ts';
import type { RoomSchemaShape } from '../presence.ts';
import type { Logger } from '../utils/log.ts';

export interface ReactorRuntimeConfig<
  Schema extends InstantSchemaDef<any, any, any> | undefined = undefined,
  RoomSchema extends RoomSchemaShape = {},
> {
  appId: string;
  apiURI?: string;
  websocketURI?: string;
  schema?: Schema;
  cardinalityInference?: boolean;
  disableValidation?: boolean;
  useDateObjects?: boolean;
  queryCacheLimit?: number;
  verbose?: boolean;
  __adminToken?: string;
  presence?: {
    autoJoin?: boolean;
  };
  roomSchema?: RoomSchema;
}

export interface PersistedValue<T> {
  value: T;
  version: number;
}

export interface PersistedObjectApi<TValue> {
  readonly key: string;
  get(): PersistedValue<TValue>;
  set(updater: (prev: TValue) => TValue): PersistedValue<TValue>;
  flush(): void;
  isLoading(): boolean;
}

export interface StorageDriver {
  open<TValue>(
    namespace: string,
    key: string,
  ): Promise<PersistedObjectApi<TValue>>;
}

export interface WebSocketMessageEvent {
  data: string;
}

export interface WebSocketCloseEvent {
  code?: number;
  reason?: string;
  wasClean?: boolean;
}

export interface WebSocketLike {
  readyState: number;
  send(data: string): void;
  close(code?: number, reason?: string): void;
  addEventListener(event: 'open', cb: () => void): void;
  addEventListener(event: 'message', cb: (ev: WebSocketMessageEvent) => void): void;
  addEventListener(event: 'close', cb: (ev: WebSocketCloseEvent) => void): void;
  addEventListener(event: 'error', cb: (ev: unknown) => void): void;
  removeEventListener(event: 'open', cb: () => void): void;
  removeEventListener(
    event: 'message',
    cb: (ev: WebSocketMessageEvent) => void,
  ): void;
  removeEventListener(
    event: 'close',
    cb: (ev: WebSocketCloseEvent) => void,
  ): void;
  removeEventListener(event: 'error', cb: (ev: unknown) => void): void;
}

export type NetworkStatus =
  | 'connecting'
  | 'opened'
  | 'authenticated'
  | 'closed'
  | 'errored';

export interface ConnectionState {
  status: NetworkStatus;
  isOnline: boolean;
  error?: { message: string } | null;
}

export interface QuerySubscriptionSnapshot {
  hash: string;
  query: unknown;
  eventId: string;
  lastAccessed: number;
  result?: unknown;
}

export interface MutationEntry {
  eventId: string;
  steps: instatxStep[];
  txId?: number;
  confirmedAt?: number;
  error?: Error;
}

export interface instatxStep {
  [key: string]: unknown;
}

export interface ReactorContext {
  config: ReactorRuntimeConfig;
  logger: Logger;
}

export interface Scheduler {
  setTimeout(handler: () => void, timeout: number): number;
  clearTimeout(timeoutId: number): void;
}
