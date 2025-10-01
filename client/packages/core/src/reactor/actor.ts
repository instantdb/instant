export type ActorEffect = () => void | Promise<void>;

export type ActorReducerResult<State> =
  | State
  | {
      state: State;
      effects?: ActorEffect[];
    };

export type ActorReducer<State, Message> = (
  state: State,
  message: Message,
) => ActorReducerResult<State> | Promise<ActorReducerResult<State>>;

export interface Actor<State, Message> {
  dispatch(message: Message): Promise<void>;
  getState(): State;
  subscribe(listener: (state: State) => void): () => void;
  stop(): void;
}

interface CreateActorOptions<State, Message> {
  initialState: State;
  reducer: ActorReducer<State, Message>;
}

const normalizeResult = <State>(
  current: State,
  next: ActorReducerResult<State>,
): { state: State; effects: ActorEffect[] } => {
  if (typeof next === 'object' && next !== null && 'state' in next) {
    return { state: next.state, effects: next.effects ?? [] };
  }
  return { state: next as State, effects: [] };
};

export function createActor<State, Message>(
  options: CreateActorOptions<State, Message>,
): Actor<State, Message> {
  let state = options.initialState;
  let queue: Promise<void> = Promise.resolve();
  let stopped = false;
  const listeners = new Set<(state: State) => void>();

  const notify = () => {
    listeners.forEach((listener) => listener(state));
  };

  const dispatch = async (message: Message): Promise<void> => {
    if (stopped) {
      return Promise.resolve();
    }

    const run = async () => {
      const result = await options.reducer(state, message);
      const { state: nextState, effects } = normalizeResult(state, result);
      const changed = nextState !== state;
      state = nextState;
      if (changed) {
        notify();
      }
      for (const effect of effects) {
        await effect();
      }
    };

    const task = queue.then(run);
    queue = task.catch(() => {});

    return task;
  };

  return {
    dispatch,
    getState: () => state,
    subscribe(listener: (state: State) => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    stop() {
      stopped = true;
      listeners.clear();
    },
  };
}
