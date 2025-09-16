import { Actor, ActorOptions, ActorRef } from './core.ts';

export interface SupervisorOptions {
  id: string;
  onChildCrash?: (childId: string, error: unknown) => void;
}

export class Supervisor {
  private readonly id: string;
  private readonly onChildCrash?: (childId: string, error: unknown) => void;
  private readonly children = new Map<string, Actor<any, any>>();

  constructor(options: SupervisorOptions) {
    this.id = options.id;
    this.onChildCrash = options.onChildCrash;
  }

  spawn<TEvent, TState>(
    name: string,
    options: Omit<ActorOptions<TEvent, TState>, 'id'>,
  ): ActorRef<TEvent> {
    const id = `${this.id}/${name}`;
    if (this.children.has(name)) {
      throw new Error(`Actor '${id}' already exists`);
    }

    const actor = new Actor<TEvent, TState>({
      ...options,
      id,
      onCrash: (error) => {
        options.onCrash?.(error);
        this.onChildCrash?.(id, error);
      },
    });

    this.children.set(name, actor);
    return actor;
  }

  get<TEvent, TState>(name: string): Actor<TEvent, TState> | undefined {
    return this.children.get(name) as Actor<TEvent, TState> | undefined;
  }

  stop(name: string): void {
    const child = this.children.get(name);
    if (!child) return;
    child.stop();
    this.children.delete(name);
  }

  stopAll(): void {
    for (const child of this.children.values()) {
      child.stop();
    }
    this.children.clear();
  }
}
