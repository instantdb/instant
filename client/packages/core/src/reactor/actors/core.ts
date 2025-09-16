export type ActorMessage<TEvent> = {
  event: TEvent;
  resolve?: (value: unknown) => void;
  reject?: (reason?: unknown) => void;
};

export interface ActorRef<TEvent> {
  id: string;
  send(event: TEvent): void;
  ask<TResult = void>(event: TEvent): Promise<TResult>;
  stop(): void;
  isStopped(): boolean;
}

export interface ActorContext<TEvent> {
  readonly self: ActorRef<TEvent>;
  reply<TResult>(value: TResult): void;
  throw(error: unknown): never;
}

export type ActorReducer<TEvent, TState> = (
  state: TState,
  event: TEvent,
  ctx: ActorContext<TEvent>,
) => TState | Promise<TState>;

export class ActorStoppedError extends Error {
  constructor(public readonly actorId: string) {
    super(`Actor \'${actorId}\' is stopped`);
  }
}

export type ActorSubscriber<TState> = (state: TState) => void;

export interface ActorOptions<TEvent, TState> {
  id: string;
  initialState: TState;
  reducer: ActorReducer<TEvent, TState>;
  onCrash?: (error: unknown) => void;
  onStateChange?: (state: TState) => void;
}

export class Actor<TEvent, TState> implements ActorRef<TEvent> {
  private state: TState;
  private readonly reducer: ActorReducer<TEvent, TState>;
  private readonly inbox: ActorMessage<TEvent>[] = [];
  private processing = false;
  private stopped = false;
  private crashHandler?: (error: unknown) => void;
  private stateListener?: (state: TState) => void;
  private readonly subscribers = new Set<ActorSubscriber<TState>>();

  constructor(options: ActorOptions<TEvent, TState>) {
    this.id = options.id;
    this.state = options.initialState;
    this.reducer = options.reducer;
    this.crashHandler = options.onCrash;
    this.stateListener = options.onStateChange;
  }

  readonly id: string;

  send(event: TEvent): void {
    if (this.stopped) throw new ActorStoppedError(this.id);
    this.inbox.push({ event });
    this.process();
  }

  ask<TResult = void>(event: TEvent): Promise<TResult> {
    if (this.stopped) throw new ActorStoppedError(this.id);
    return new Promise<TResult>((resolve, reject) => {
      this.inbox.push({ event, resolve: resolve as (value: unknown) => void, reject });
      this.process();
    });
  }

  stop(): void {
    if (this.stopped) return;
    this.stopped = true;
    this.inbox.length = 0;
  }

  isStopped(): boolean {
    return this.stopped;
  }

  get snapshot(): TState {
    return this.state;
  }

  subscribe(callback: ActorSubscriber<TState>): () => void {
    this.subscribers.add(callback);
    callback(this.state);
    return () => {
      this.subscribers.delete(callback);
    };
  }

  private notify(): void {
    this.stateListener?.(this.state);
    for (const subscriber of this.subscribers) {
      subscriber(this.state);
    }
  }

  private async process(): Promise<void> {
    if (this.processing || this.stopped) return;
    this.processing = true;

    while (this.inbox.length && !this.stopped) {
      const envelope = this.inbox.shift();
      if (!envelope) continue;

      const ctx: ActorContext<TEvent> = {
        self: this,
        reply: (value) => {
          envelope.resolve?.(value);
          envelope.resolve = undefined;
          envelope.reject = undefined;
        },
        throw: (error: unknown): never => {
          envelope.reject?.(error);
          envelope.resolve = undefined;
          envelope.reject = undefined;
          throw error;
        },
      };

      try {
        const next = await this.reducer(this.state, envelope.event, ctx);
        const prev = this.state;
        this.state = next;
        if (!Object.is(prev, next)) {
          this.notify();
        }
        if (envelope.resolve) {
          envelope.resolve(undefined);
        }
      } catch (error) {
        envelope.reject?.(error);
        this.crashHandler?.(error);
      }
    }

    this.processing = false;
  }
}
