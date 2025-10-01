/**
 * Base class for actors in the system.
 * Actors communicate via messages and manage their own state immutably.
 */
export abstract class BaseActor<TState = any> {
  protected state: TState;
  protected name: string;
  protected _subscribers: Array<(message: any) => void> = [];

  constructor(name: string, initialState: TState) {
    this.name = name;
    this.state = initialState;
  }

  /**
   * Subscribe to messages published by this actor
   */
  subscribe(callback: (message: any) => void): () => void {
    this._subscribers.push(callback);
    return () => {
      this._subscribers = this._subscribers.filter((cb) => cb !== callback);
    };
  }

  /**
   * Publish a message to all subscribers
   */
  public publish(message: any): void {
    this._subscribers.forEach((cb) => {
      try {
        cb(message);
      } catch (e) {
        console.error(`[${this.name}] Error in subscriber:`, e);
      }
    });
  }

  /**
   * Handle an incoming message. Override in subclass.
   */
  abstract receive(message: any): void;

  /**
   * Get current state (immutable)
   */
  getState(): Readonly<TState> {
    return this.state;
  }

  /**
   * Shutdown the actor, cleanup resources
   */
  shutdown(): void {
    this._subscribers = [];
  }
}

/**
 * Message type definition
 */
export interface Message {
  type: string;
  [key: string]: any;
}

/**
 * Creates an event bus for actor communication
 */
export class EventBus {
  private _handlers: Map<string, Array<(message: Message) => void>> = new Map();

  /**
   * Subscribe to messages of a specific type
   */
  on(messageType: string, handler: (message: Message) => void): () => void {
    if (!this._handlers.has(messageType)) {
      this._handlers.set(messageType, []);
    }
    this._handlers.get(messageType)!.push(handler);

    return () => {
      const handlers = this._handlers.get(messageType);
      if (handlers) {
        this._handlers.set(
          messageType,
          handlers.filter((h) => h !== handler),
        );
      }
    };
  }

  /**
   * Publish a message to all subscribers of its type
   */
  emit(message: Message): void {
    if (!message.type) {
      console.error('Message must have a type property:', message);
      return;
    }

    const handlers = this._handlers.get(message.type);
    if (handlers) {
      handlers.forEach((handler) => {
        try {
          handler(message);
        } catch (e) {
          console.error(
            `Error handling message type ${message.type}:`,
            e,
            message,
          );
        }
      });
    }
  }

  /**
   * Clear all handlers
   */
  clear(): void {
    this._handlers.clear();
  }
}
